import { useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import type { DocumentUpdate } from '../useWebSocket';
import type { WebSocketUpdatesContext, ProcessUpdateHandler } from './types';

export function useProposalUpdates(ctx: WebSocketUpdatesContext): ProcessUpdateHandler {
  const { updateDocument, reloadDocument, t, pendingOperationsRef } = ctx;

  return useCallback(
    (update: DocumentUpdate) => {
      if (update.eventType !== 'proposal' || !update.data?.proposal) return;
      const { paragraphId, proposal } = update.data as {
        paragraphId: string;
        proposal: {
          id: string;
          deleted?: boolean;
          votes?: unknown;
          comments?: unknown;
          partialVoteCounts?: unknown;
          approved?: boolean;
          approvalPercentage?: number;
          user?: unknown;
        };
      };

      if (proposal.deleted === true) {
        const proposalId = proposal.id;
        logger.log('🗑️ Processing proposal deletion update:', { proposalId, paragraphId });
        updateDocument((prevDoc) => {
          if (!prevDoc) return prevDoc;
          const newParagraphs = prevDoc.paragraphs.map((para) => {
            if (para.id !== paragraphId) return para;
            const filteredProposals = (para.proposals || []).filter((p) => p.id !== proposalId);
            const filteredSuggestions = (para.suggestions || []).filter((s) => s.id !== proposalId);
            return { ...para, proposals: filteredProposals, suggestions: filteredSuggestions };
          });
          return { ...prevDoc, paragraphs: newParagraphs };
        });
        toast.success(t('toasts.proposalDeleted'), { duration: 2000 });
        return;
      }

      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        const paragraphExists = prevDoc.paragraphs.some((p) => p.id === paragraphId);
        if (!paragraphExists) {
          logger.warn('⚠️ Proposal received for non-existent paragraph, reloading document', {
            paragraphId,
            proposalId: proposal.id,
          });
          reloadDocument(true).catch((err) => {
            logger.error('Failed to reload after proposal for non-existent paragraph:', err);
          });
          return prevDoc;
        }

        const newParagraphs = prevDoc.paragraphs.map((para) => {
          if (para.id !== paragraphId) return para;
          const existingProposals = para.proposals || [];
          const proposalIndex = existingProposals.findIndex((p) => p.id === proposal.id);
          if (proposalIndex >= 0) {
            logger.log('📝 Updating existing proposal:', {
              proposalId: proposal.id,
              paragraphId,
              hasApproved: 'approved' in proposal,
              hasVotes: 'votes' in proposal,
              hasComments: 'comments' in proposal,
            });
            const updatedProposals = [...existingProposals];
            const existing = existingProposals[proposalIndex];
            updatedProposals[proposalIndex] = {
              ...existing,
              ...proposal,
              votes: proposal.votes ?? existing.votes,
              comments: proposal.comments ?? existing.comments,
              partialVoteCounts: proposal.partialVoteCounts ?? existing.partialVoteCounts,
              approved: proposal.approved ?? existing.approved,
              approvalPercentage: proposal.approvalPercentage ?? existing.approvalPercentage,
              user: proposal.user ?? existing.user,
            };
            return { ...para, proposals: updatedProposals, suggestions: updatedProposals };
          }
          return {
            ...para,
            proposals: [...existingProposals, proposal as (typeof para.proposals)[number]],
            suggestions: [...existingProposals, proposal as (typeof para.proposals)[number]],
          };
        });

        return { ...prevDoc, paragraphs: newParagraphs };
      });

      if (proposal?.id) {
        const proposalTimeoutKey = `proposal-${proposal.id}`;
        const proposalTimeout = pendingOperationsRef.current.get(proposalTimeoutKey);
        if (proposalTimeout) {
          clearTimeout(proposalTimeout);
          pendingOperationsRef.current.delete(proposalTimeoutKey);
        }
      }
    },
    [updateDocument, reloadDocument, t, pendingOperationsRef]
  );
}
