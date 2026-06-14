import { useCallback } from 'react';
import { toast } from 'sonner';
import type { Vote } from '../../types';
import { logger } from '../../lib/logger';
import type { DocumentUpdate } from '../useWebSocket';
import type { WebSocketUpdatesContext, ProcessUpdateHandler } from './types';

export function useVoteUpdates(ctx: WebSocketUpdatesContext): ProcessUpdateHandler {
  const { updateDocument, reloadDocument, currentUser, setVotingState, t } = ctx;

  return useCallback(
    (update: DocumentUpdate) => {
      if (update.eventType !== 'vote' || !update.data?.proposalId) return;
      const { proposalId, paragraphId, vote: voteData } = update.data as {
        proposalId: string;
        paragraphId: string;
        vote: {
          allVotes?: Vote[];
          voteCounts?: { total?: number };
          action?: string;
          isAnonymous?: boolean;
          approved?: boolean;
          approvalPercentage?: number;
        };
      };

      logger.log('✅ Processing vote update:', {
        proposalId,
        paragraphId,
        hasAllVotes: !!voteData?.allVotes,
        hasVoteCounts: !!voteData?.voteCounts,
        voteCount: voteData?.allVotes?.length,
      });

      // Apply document (vote list) update first so it paints before we clear loading state.
      // Then defer clearing voting state and toasts to the next microtask so React can
      // commit the document update first — avoids a visible gap where the spinner
      // disappears but vote counts haven't updated yet (Zustand vs React state don't batch).
      const clearVotingStateAndToast = () => {
        setVotingState((prev) => {
          const next = new Set(prev);
          next.delete(proposalId);
          return next;
        });
        toast.dismiss(`vote-${proposalId}`);
        toast.success(t('toasts.voteRecorded'), { duration: 2000 });
      };

      // Apply update when we have allVotes; derive voteCounts if server did not send it
      if (voteData?.allVotes) {
        const voteCounts = voteData.voteCounts ?? { total: voteData.allVotes.length };
        const voteCount = voteData.allVotes.length;
        const totalFromCounts = voteCounts.total ?? 0;
        if (voteCount !== totalFromCounts && voteData.voteCounts) {
          logger.warn('⚠️ Vote counts mismatch in WebSocket update', {
            proposalId,
            paragraphId,
            voteCount,
            totalFromCounts,
            voteCounts: voteData.voteCounts,
          });
        }
        if (!voteData.voteCounts) {
          logger.log('📊 Vote update missing voteCounts, derived from allVotes', {
            proposalId,
            paragraphId,
            total: voteData.allVotes.length,
          });
        }

        logger.log('📊 Updating votes from WebSocket (single-phase update):', {
          proposalId,
          paragraphId,
          voteCount: voteData.allVotes.length,
          voteCounts,
          action: voteData.action,
          isAnonymous: voteData.isAnonymous,
        });

        updateDocument((prevDoc) => {
          if (!prevDoc) return prevDoc;
          const paragraphExists = prevDoc.paragraphs.some((p) => p.id === paragraphId);
          if (!paragraphExists) {
            logger.warn('⚠️ Vote update received for non-existent paragraph, reloading document', {
              paragraphId,
              proposalId,
            });
            reloadDocument(true).catch((err) => {
              logger.error('Failed to reload after vote for non-existent paragraph:', err);
            });
            return prevDoc;
          }

          const newParagraphs = prevDoc.paragraphs.map((para) => {
            if (para.id !== paragraphId) return para;
            const proposalExists = para.proposals.some((p) => p.id === proposalId);
            if (!proposalExists) {
              logger.warn('⚠️ Vote update received for non-existent proposal, reloading document', {
                paragraphId,
                proposalId,
              });
              reloadDocument(true).catch((err) => {
                logger.error('Failed to reload after vote for non-existent proposal:', err);
              });
              return para;
            }

            const newProposals = para.proposals.map((prop) => {
              if (prop.id !== proposalId) return prop;
              const isAnonymous = voteData.isAnonymous || prevDoc.options?.votingAnonymous;
              const currentUserId = currentUser?.id;
              const updatedVotes = voteData.allVotes!.map((v: Vote) => {
                const shouldShowUserInfo = !isAnonymous || v.userId === currentUserId;
                return {
                  id: v.id,
                  userId: v.userId,
                  vote: v.vote,
                  createdAt: v.createdAt,
                  user: shouldShowUserInfo ? (v.user || undefined) : undefined,
                };
              });
              return {
                ...prop,
                votes: updatedVotes,
                partialVoteCounts: voteCounts,
                approved: voteData.approved ?? prop.approved,
                approvalPercentage: voteData.approvalPercentage ?? prop.approvalPercentage,
              };
            });

            return {
              ...para,
              proposals: newProposals,
              suggestions: newProposals,
            };
          });

          return {
            ...prevDoc,
            paragraphs: newParagraphs,
          };
        });
        logger.log('✅ Vote update applied successfully from WebSocket');
        queueMicrotask(clearVotingStateAndToast);
        return;
      }

      logger.warn('⚠️ Vote update missing allVotes, falling back to document reload', {
        proposalId,
        paragraphId,
        hasVoteData: !!voteData,
      });
      clearVotingStateAndToast();
      reloadDocument(true).catch((err) => {
        logger.error('Failed to reload after WebSocket update:', err);
      });
    },
    [updateDocument, reloadDocument, currentUser?.id, setVotingState, t]
  );
}
