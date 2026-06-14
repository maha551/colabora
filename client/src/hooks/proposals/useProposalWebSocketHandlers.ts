import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { BaseProposal } from '../../components/shared/proposalTypes';
import { logger } from '../../lib/logger';
import type { OrganizationUpdate } from '../useOrganizationWebSocket';
import type { DocumentUpdate } from '../useWebSocket';
import { shouldRefreshPendingOnOrgUpdate } from '../../lib/proposals/organizationPendingRefreshEvents';

const voteCountsFromVotes = (allVotes: Array<{ vote: 'PRO' | 'NEUTRAL' | 'CONTRA' }> | undefined) => ({
  pro: allVotes?.filter((v) => v.vote === 'PRO').length || 0,
  contra: allVotes?.filter((v) => v.vote === 'CONTRA').length || 0,
  neutral: allVotes?.filter((v) => v.vote === 'NEUTRAL').length || 0,
  total: allVotes?.length || 0,
});

export function useProposalWebSocketHandlers(
  fetchProposals: () => Promise<void>,
  setProposals: Dispatch<SetStateAction<BaseProposal[]>>
) {
  const handleOrganizationUpdate = useCallback((update: OrganizationUpdate) => {
    logger.log('Received organization update for proposals', update);
    if (shouldRefreshPendingOnOrgUpdate(update.eventType)) {
      fetchProposals();
    }
  }, [fetchProposals]);

  const handleDocumentUpdate = useCallback((update: DocumentUpdate) => {
    logger.log('Received document update for proposals', update);
    if (!update.data || typeof update.data !== 'object') {
      logger.warn('Invalid update data received', { update });
      return;
    }

    if (update.eventType === 'structure-proposal-vote' && 'type' in update.data && update.data.type === 'structure-proposal-vote') {
      const data = update.data as { proposalId: string; allVotes?: Array<{ vote: 'PRO' | 'NEUTRAL' | 'CONTRA' }> };
      const { proposalId, allVotes } = data;
      if (!proposalId) {
        logger.warn('Missing proposalId in structure-proposal-vote update', { update });
        return;
      }
      const counts = voteCountsFromVotes(allVotes);
      setProposals((prev) =>
        prev.map((p) =>
          p.id === proposalId && p.type === 'structure' ? { ...p, votes: counts } : p
        )
      );
      return;
    }

    if (update.eventType === 'tree-proposal-vote' && 'type' in update.data && update.data.type === 'tree-proposal-vote') {
      const data = update.data as { proposalId: string; allVotes?: Array<{ vote: 'PRO' | 'NEUTRAL' | 'CONTRA' }> };
      const { proposalId, allVotes } = data;
      if (!proposalId) {
        logger.warn('Missing proposalId in tree-proposal-vote update', { update });
        return;
      }
      const counts = voteCountsFromVotes(allVotes);
      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId && p.type === 'tree' ? { ...p, votes: counts } : p))
      );
      return;
    }

    if (update.eventType === 'deletion-vote' && 'type' in update.data && update.data.type === 'deletion-vote') {
      const data = update.data as { documentId: string; allVotes?: Array<{ vote: 'PRO' | 'NEUTRAL' | 'CONTRA' }> };
      const { documentId, allVotes } = data;
      if (!documentId) {
        logger.warn('Missing documentId in deletion-vote update', { update });
        return;
      }
      const proposalId = `deletion-${documentId}`;
      const counts = voteCountsFromVotes(allVotes);
      setProposals((prev) =>
        prev.map((p) =>
          p.id === proposalId && p.type === 'deletion' ? { ...p, votes: counts } : p
        )
      );
    }
  }, []);

  return { handleOrganizationUpdate, handleDocumentUpdate };
}
