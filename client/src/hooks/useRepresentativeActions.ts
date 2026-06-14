import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Document,
  RuleProposal,
  StructureProposal,
  DocumentTreeProposal,
  OrganizationVote,
  Organization,
  OrganizationGovernanceRules,
} from '../types';
import {
  governanceApi,
  organizationsApi,
  structureProposalsApi,
  documentTreeProposalsApi,
  type DeletionStatusResponse,
} from '../lib/api';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { getUserFriendlyErrorMessage } from '../utils/errorMessages';
import { useDeletionStatuses } from './useDeletionStatuses';

export interface RepresentativeActionsData {
  ruleProposals: RuleProposal[];
  organizationVotes: OrganizationVote[];
  structureProposals: StructureProposal[];
  treeProposals: DocumentTreeProposal[];
  deletionStatuses: Record<string, DeletionStatusResponse>;
  loading: {
    ruleProposals: boolean;
    organizationVotes: boolean;
    structureProposals: boolean;
    treeProposals: boolean;
    deletionStatuses: boolean;
  };
}

export interface RepresentativeActionsActions {
  refreshRuleProposals: () => Promise<void>;
  refreshOrganizationVotes: () => Promise<void>;
  refreshStructureProposals: () => Promise<void>;
  refreshTreeProposals: () => Promise<void>;
  refreshDeletionStatuses: () => Promise<void>;
  refreshAll: () => Promise<void>;
  completeOrganizationVote: (voteId: string) => Promise<void>;
}

/**
 * Hook for fetching representative-actions data shared by DashboardTab and RepresentativesTab.
 * Only loads when enabled (dashboard or representatives tab active) to avoid redundant API calls.
 */
export interface UseRepresentativeActionsOptions {
  enabled: boolean;
  organization?: Organization;
  governanceRules?: OrganizationGovernanceRules | null;
  onRefreshGovernance?: () => Promise<void>;
}

export function useRepresentativeActions(
  organizationId: string,
  documents: Document[],
  options: UseRepresentativeActionsOptions
): { data: RepresentativeActionsData; actions: RepresentativeActionsActions } {
  const { enabled, organization, governanceRules, onRefreshGovernance } = options;

  const [ruleProposals, setRuleProposals] = useState<RuleProposal[]>([]);
  const [organizationVotes, setOrganizationVotes] = useState<OrganizationVote[]>([]);
  const [structureProposals, setStructureProposals] = useState<StructureProposal[]>([]);
  const [treeProposals, setTreeProposals] = useState<DocumentTreeProposal[]>([]);

  const {
    deletionStatuses,
    loadingDeletionStatuses,
    refreshDeletionStatuses,
  } = useDeletionStatuses(documents, { enabled });

  const [loading, setLoading] = useState({
    ruleProposals: false,
    organizationVotes: false,
    structureProposals: false,
    treeProposals: false,
    deletionStatuses: false,
  });

  const orgDocuments = useMemo(
    () => documents.filter(d => d.organizationId === organizationId),
    [documents, organizationId]
  );

  const setLoadingState = useCallback((key: keyof typeof loading, value: boolean) => {
    setLoading(prev => ({ ...prev, [key]: value }));
  }, []);

  const loadRuleProposals = useCallback(async () => {
    if (!enabled) return;
    setLoadingState('ruleProposals', true);
    try {
      const response = await governanceApi.ruleProposalsApi.getRuleProposals(organizationId);
      setRuleProposals((response.ruleProposals || []) as RuleProposal[]);
    } catch (error) {
      logger.error('Failed to load rule proposals:', error);
    } finally {
      setLoadingState('ruleProposals', false);
    }
  }, [organizationId, enabled, setLoadingState]);

  const loadOrganizationVotes = useCallback(async () => {
    if (!enabled) return;
    setLoadingState('organizationVotes', true);
    try {
      const response = await organizationsApi.getOrganizationVotes(organizationId);
      setOrganizationVotes(response.votes || []);
    } catch (error) {
      logger.error('Failed to load organization votes:', error);
    } finally {
      setLoadingState('organizationVotes', false);
    }
  }, [organizationId, enabled, setLoadingState]);

  const loadStructureProposals = useCallback(async () => {
    if (!enabled) return;
    setLoadingState('structureProposals', true);
    try {
      const allStructureProposals: StructureProposal[] = [];
      await Promise.all(
        orgDocuments.map(async doc => {
          try {
            const response = await structureProposalsApi.getStructureProposals(doc.id);
            const proposals = (response.structureProposals || []) as StructureProposal[];
            const activeProposals = proposals.filter(
              p => !(p as StructureProposal & { applied?: boolean }).applied
            );
            allStructureProposals.push(...activeProposals);
          } catch (error) {
            logger.warn('Failed to load structure proposals for document', {
              documentId: doc.id,
              error,
            });
          }
        })
      );
      setStructureProposals(allStructureProposals);
    } catch (error) {
      logger.error('Failed to load structure proposals:', error);
    } finally {
      setLoadingState('structureProposals', false);
    }
  }, [organizationId, enabled, orgDocuments, setLoadingState]);

  const loadTreeProposals = useCallback(async () => {
    if (!enabled) return;
    setLoadingState('treeProposals', true);
    try {
      const allTreeProposals: DocumentTreeProposal[] = [];
      await Promise.all(
        orgDocuments.map(async doc => {
          try {
            const response = await documentTreeProposalsApi.getProposals(doc.id);
            const proposals = response.proposals || [];
            const pendingProposals = proposals.filter(p => p.status === 'pending');
            allTreeProposals.push(...pendingProposals);
          } catch (error) {
            logger.warn('Failed to load tree proposals for document', {
              documentId: doc.id,
              error,
            });
          }
        })
      );
      setTreeProposals(allTreeProposals);
    } catch (error) {
      logger.error('Failed to load tree proposals:', error);
    } finally {
      setLoadingState('treeProposals', false);
    }
  }, [organizationId, enabled, orgDocuments, setLoadingState]);

  const refreshRuleProposals = useCallback(async () => {
    await loadRuleProposals();
  }, [loadRuleProposals]);

  const refreshOrganizationVotes = useCallback(async () => {
    await loadOrganizationVotes();
  }, [loadOrganizationVotes]);

  const refreshStructureProposals = useCallback(async () => {
    await loadStructureProposals();
  }, [loadStructureProposals]);

  const refreshTreeProposals = useCallback(async () => {
    await loadTreeProposals();
  }, [loadTreeProposals]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadRuleProposals(),
      loadOrganizationVotes(),
      loadStructureProposals(),
      loadTreeProposals(),
      refreshDeletionStatuses(),
    ]);
  }, [
    loadRuleProposals,
    loadOrganizationVotes,
    loadStructureProposals,
    loadTreeProposals,
    refreshDeletionStatuses,
  ]);

  const completeOrganizationVote = useCallback(
    async (voteId: string) => {
      if (!organization) return;
      try {
        const result = await organizationsApi.completeOrganizationVote(organization.id, voteId);
        if (result.success) {
          const vote = organizationVotes.find((v) => v.id === voteId);
          const isMistrustVote = vote?.voteType === 'representative_removal';
          if (result.vote.passed) {
            toast.success(
              isMistrustVote
                ? 'Mistrust vote passed. Representative has been removed.'
                : `Vote passed with ${Math.round(result.vote.approvalRate)}% approval`
            );
          } else {
            toast.info(
              `Vote failed. Approval: ${Math.round(result.vote.approvalRate)}%, Quorum: ${result.vote.quorumMet ? 'Met' : 'Not Met'}`
            );
          }
        }
        await refreshOrganizationVotes();
        await onRefreshGovernance?.();
      } catch (error) {
        logger.error('Failed to complete vote:', error);
        toast.error(getUserFriendlyErrorMessage(error as Error, 'Failed to complete vote'));
        throw error;
      }
    },
    [organization, organizationVotes, refreshOrganizationVotes, onRefreshGovernance]
  );

  const documentIds = useMemo(() => orgDocuments.map(d => d.id).join(','), [orgDocuments]);

  useEffect(() => {
    if (!enabled) return;
    Promise.all([
      loadRuleProposals(),
      loadOrganizationVotes(),
      loadStructureProposals(),
      loadTreeProposals(),
    ]).catch(err => logger.error('Failed to load representative actions:', err));
  }, [enabled, organizationId, documentIds, loadRuleProposals, loadOrganizationVotes, loadStructureProposals, loadTreeProposals]);

  const loadingWithDeletion = useMemo(
    () => ({ ...loading, deletionStatuses: loadingDeletionStatuses }),
    [loading, loadingDeletionStatuses]
  );

  const data: RepresentativeActionsData = {
    ruleProposals,
    organizationVotes,
    structureProposals,
    treeProposals,
    deletionStatuses,
    loading: loadingWithDeletion,
  };

  const actions: RepresentativeActionsActions = {
    refreshRuleProposals,
    refreshOrganizationVotes,
    refreshStructureProposals,
    refreshTreeProposals,
    refreshDeletionStatuses,
    refreshAll,
    completeOrganizationVote,
  };

  return { data, actions };
}
