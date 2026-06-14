/**
 * Shared optimistic vote hook.
 * Single source of truth for vote handling: optimistic update, API call, rollback,
 * votingState, toasts, and WebSocket/timeout fallback. Used by both Document view
 * and Activity Feed to avoid duplicate logic and race conditions.
 */

import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { votesApi } from '../lib/api';
import { extractVoteReceipt, persistReceipt } from '../lib/verification/voteReceipt';
import { VOTE_UPDATE_TIMEOUT } from '../lib/constants';
import { getUserFriendlyErrorMessage, getVoteErrorMessage } from '../utils/errorMessages';
import type { Vote, PartialVoteCounts, User } from '../types';

export interface VoteSnapshot {
  votes: Vote[];
  partialVoteCounts: PartialVoteCounts;
  currentUserVote?: Vote;
}

export interface UseOptimisticVoteOptions {
  votingState: Set<string>;
  setVotingState: React.Dispatch<React.SetStateAction<Set<string>>>;
  currentUser: User | null;
  getVoteContext: (proposalId: string) => { documentId: string; paragraphId: string } | null;
  getProposalSnapshot: (proposalId: string) => VoteSnapshot | null;
  applyOptimistic: (
    proposalId: string,
    documentId: string,
    paragraphId: string,
    voteType: 'PRO' | 'NEUTRAL' | 'CONTRA',
    payload: { optimisticVote: Vote; newCounts: PartialVoteCounts }
  ) => void;
  rollback: (proposalId: string, snapshot: VoteSnapshot) => void;
  reloadDocument?: () => Promise<void>;
  organizationId?: string;
}

function computeNewCountsAndVote(
  votes: Vote[],
  currentUser: User,
  voteType: 'PRO' | 'NEUTRAL' | 'CONTRA'
): { newCounts: PartialVoteCounts; optimisticVote: Vote } {
  const currentUserVote = votes.find((v) => v.userId === currentUser.id);
  const newCounts: PartialVoteCounts = {
    pro: votes.filter((v) => v.vote === 'PRO').length,
    contra: votes.filter((v) => v.vote === 'CONTRA').length,
    neutral: votes.filter((v) => v.vote === 'NEUTRAL').length,
    total: votes.length,
  };
  if (currentUserVote) {
    if (currentUserVote.vote === 'PRO') newCounts.pro--;
    if (currentUserVote.vote === 'CONTRA') newCounts.contra--;
    if (currentUserVote.vote === 'NEUTRAL') newCounts.neutral--;
    newCounts.total--;
  }
  if (voteType === 'PRO') newCounts.pro++;
  if (voteType === 'CONTRA') newCounts.contra++;
  if (voteType === 'NEUTRAL') newCounts.neutral++;
  newCounts.total++;

  const optimisticVote: Vote = {
    id: `optimistic-${Date.now()}`,
    proposalId: '',
    userId: currentUser.id,
    vote: voteType,
    createdAt: new Date().toISOString(),
    user: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email || '',
    },
  };

  return { newCounts, optimisticVote };
}

export function useOptimisticVote({
  votingState,
  setVotingState,
  currentUser,
  getVoteContext,
  getProposalSnapshot,
  applyOptimistic,
  rollback,
  reloadDocument,
  organizationId,
}: UseOptimisticVoteOptions) {
  const { t } = useTranslation('common');
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const vote = useCallback(
    async (proposalId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
      if (!currentUser) return;
      if (votingState.has(proposalId)) return;

      const context = getVoteContext(proposalId);
      if (!context) return;
      const { documentId, paragraphId } = context;

      const snapshot = getProposalSnapshot(proposalId);
      if (!snapshot) return;

      const { newCounts, optimisticVote } = computeNewCountsAndVote(
        snapshot.votes,
        currentUser,
        voteType
      );
      const voteWithProposalId: Vote = { ...optimisticVote, proposalId };

      applyOptimistic(proposalId, documentId, paragraphId, voteType, {
        optimisticVote: voteWithProposalId,
        newCounts,
      });
      setVotingState((prev) => new Set(prev).add(proposalId));

      const loadingToast = toast.loading(t('toasts.processingVote'));

      const clearVotingStateAndToast = () => {
        setVotingState((prev) => {
          const next = new Set(prev);
          next.delete(proposalId);
          return next;
        });
        toast.dismiss(`vote-${proposalId}`);
        toast.success(t('toasts.voteRecorded'), { duration: 2000 });
      };

      const timeoutId = setTimeout(() => {
        timeoutRefs.current.delete(proposalId);
        setVotingState((prev) => {
          const next = new Set(prev);
          if (next.has(proposalId)) {
            next.delete(proposalId);
            toast.dismiss(`vote-${proposalId}`);
            toast.success(t('toasts.voteRecorded'), { duration: 2000 });
            // Do not reload: keep optimistic update; WebSocket may still arrive and apply the real update
          }
          return next;
        });
      }, VOTE_UPDATE_TIMEOUT);
      timeoutRefs.current.set(proposalId, timeoutId);

      try {
        const response = await votesApi.castVote(documentId, paragraphId, proposalId, voteType);
        const payload = extractVoteReceipt(response);
        if (payload && currentUser?.id && organizationId) {
          await persistReceipt(currentUser.id, organizationId, {
            ...payload,
            organizationId,
          });
        }
        toast.dismiss(loadingToast);
        toast.loading(t('toasts.waitingForUpdate'), { id: `vote-${proposalId}` });
        // Rely on WebSocket for in-place update (no reload) so optimistic state is kept and UI doesn't refocus
      } catch (error: unknown) {
        if (timeoutRefs.current.has(proposalId)) {
          clearTimeout(timeoutRefs.current.get(proposalId)!);
          timeoutRefs.current.delete(proposalId);
        }
        rollback(proposalId, snapshot);
        setVotingState((prev) => {
          const next = new Set(prev);
          next.delete(proposalId);
          return next;
        });
        logger.error('Failed to cast vote:', error);
        const errorMessage =
          error instanceof Error && 'code' in error
            ? getVoteErrorMessage(
                (error as { code?: string }).code,
                getUserFriendlyErrorMessage(error, 'Failed to cast vote')
              )
            : getUserFriendlyErrorMessage(error, 'Failed to cast vote');
        toast.error(errorMessage);
        throw error;
      }
    },
    [
      currentUser,
      votingState,
      setVotingState,
      getVoteContext,
      getProposalSnapshot,
      applyOptimistic,
      rollback,
      reloadDocument,
      organizationId,
      t,
    ]
  );

  const isVoting = useCallback(
    (proposalId: string) => votingState.has(proposalId),
    [votingState]
  );

  return { vote, isVoting };
}
