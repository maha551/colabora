import { useState, useEffect, useCallback } from 'react';
import { BaseProposal, ProposalType } from '../components/shared/proposalTypes';
import { documentsApi, governanceApi, structureProposalsApi, documentTreeProposalsApi } from '../lib/api';
import { logger } from '../lib/logger';
import { toast } from 'sonner';
import { useOrganizationWebSocket } from './useOrganizationWebSocket';
import { useWebSocket } from './useWebSocket';
import { useAuth } from './useAuth';
import { useRuleProposals } from './proposals/useRuleProposals';
import { useStructureProposals } from './proposals/useStructureProposals';
import { useTreeProposals } from './proposals/useTreeProposals';
import { useProposalWebSocketHandlers } from './proposals/useProposalWebSocketHandlers';
import { useFullProposalData, type FullProposalData } from './proposals/useFullProposalData';

export type { FullProposalData };

interface UseProposalsOptions {
  organizationId?: string;
  documentId?: string;
  currentUserId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useProposals(options: UseProposalsOptions = {}) {
  const {
    organizationId,
    documentId,
    currentUserId,
    autoRefresh = false,
    refreshInterval = 30000,
  } = options;

  const [proposals, setProposals] = useState<BaseProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { authToken } = useAuth();
  const { fetchRuleProposals } = useRuleProposals(organizationId, currentUserId);
  const { fetchStructureProposals } = useStructureProposals(documentId, currentUserId);
  const { fetchTreeAndDeletionProposals } = useTreeProposals(organizationId, documentId, currentUserId);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ruleProposals, structureProposals, treeAndDeletionProposals] = await Promise.all([
        fetchRuleProposals(),
        fetchStructureProposals(),
        fetchTreeAndDeletionProposals(),
      ]);
      setProposals([...ruleProposals, ...structureProposals, ...treeAndDeletionProposals]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch proposals';
      setError(errorMessage);
      logger.error('Error fetching proposals', err);
      toast.error('Failed to load proposals');
    } finally {
      setLoading(false);
    }
  }, [fetchRuleProposals, fetchStructureProposals, fetchTreeAndDeletionProposals]);

  const { fetchFullProposalData, fullProposalData } = useFullProposalData(organizationId, documentId);
  const { handleOrganizationUpdate, handleDocumentUpdate } = useProposalWebSocketHandlers(
    fetchProposals,
    setProposals
  );

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchProposals, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, fetchProposals]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  useOrganizationWebSocket({
    organizationId: organizationId || null,
    userId: currentUserId || null,
    authToken: authToken || null,
    onOrganizationUpdate: handleOrganizationUpdate,
  });

  useWebSocket({
    documentId: documentId || null,
    documentIds: documentId ? [documentId] : undefined,
    userId: currentUserId || null,
    authToken: authToken || null,
    onDocumentUpdate: handleDocumentUpdate,
  });

  const handleVote = useCallback(async (
    proposalId: string,
    proposalType: ProposalType,
    vote: 'PRO' | 'NEUTRAL' | 'CONTRA',
    additionalData?: { documentId?: string; paragraphId?: string }
  ) => {
    try {

      switch (proposalType) {
        case 'rule':
          if (!organizationId) throw new Error('Organization ID required for rule proposals');
          await governanceApi.ruleProposalsApi.voteOnRuleProposal(organizationId, proposalId, { vote });
          break;
        case 'structure':
          if (!documentId) throw new Error('Document ID required for structure proposals');
          await structureProposalsApi.voteOnStructureProposal(documentId, proposalId, vote);
          break;
        case 'tree':
          await documentTreeProposalsApi.voteOnProposal(proposalId, vote);
          break;
        case 'deletion': {
          if (!documentId) throw new Error('Document ID required for deletion votes');
          const docId = proposalId.startsWith('deletion-') ? proposalId.replace('deletion-', '') : documentId;
          await documentsApi.voteDeletion(docId, vote);
          break;
        }
        case 'paragraph': {
          if (!additionalData?.documentId || !additionalData?.paragraphId) {
            throw new Error('Document ID and paragraph ID required for paragraph proposals');
          }
          const { votesApi } = await import('../lib/api/votes');
          await votesApi.castVote(additionalData.documentId, additionalData.paragraphId, proposalId, vote);
          break;
        }
        default:
          throw new Error(`Unsupported proposal type: ${proposalType}`);
      }
      toast.success('Vote recorded');
    } catch (err) {
      logger.error('Error casting vote', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to cast vote';
      toast.error(errorMessage);
      throw err;
    }
  }, [organizationId, documentId]);

  return {
    proposals,
    loading,
    error,
    refresh: fetchProposals,
    vote: handleVote,
    fetchFullProposalData,
    fullProposalData,
  };
}

