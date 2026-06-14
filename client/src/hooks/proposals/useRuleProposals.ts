import { useCallback } from 'react';
import type { BaseProposal } from '../../components/shared/proposalTypes';
import { governanceApi } from '../../lib/api';
import { logger } from '../../lib/logger';
import { transformRuleProposal } from './transforms';

export function useRuleProposals(
  organizationId: string | undefined,
  currentUserId: string | undefined
): { fetchRuleProposals: () => Promise<BaseProposal[]> } {
  const fetchRuleProposals = useCallback(async (): Promise<BaseProposal[]> => {
    if (!organizationId) return [];
    try {
      const ruleProposalsResponse = await governanceApi.ruleProposalsApi.getRuleProposals(organizationId);
      const ruleProposals = ruleProposalsResponse.ruleProposals || [];
      return ruleProposals.map((rp) => transformRuleProposal(rp, currentUserId));
    } catch (err) {
      logger.warn('Failed to fetch rule proposals', err);
      return [];
    }
  }, [organizationId, currentUserId]);
  return { fetchRuleProposals };
}
