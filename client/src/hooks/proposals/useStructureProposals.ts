import { useCallback } from 'react';
import type { BaseProposal } from '../../components/shared/proposalTypes';
import { structureProposalsApi } from '../../lib/api';
import { logger } from '../../lib/logger';
import { transformStructureProposal } from './transforms';

export function useStructureProposals(
  documentId: string | undefined,
  currentUserId: string | undefined
): { fetchStructureProposals: () => Promise<BaseProposal[]> } {
  const fetchStructureProposals = useCallback(async (): Promise<BaseProposal[]> => {
    if (!documentId) return [];
    try {
      const structureProposalsResponse = await structureProposalsApi.getStructureProposals(documentId);
      const structureProposals = structureProposalsResponse.structureProposals || [];
      return structureProposals.map((sp) => transformStructureProposal(sp, currentUserId));
    } catch (err) {
      logger.warn('Failed to fetch structure proposals', err);
      return [];
    }
  }, [documentId, currentUserId]);
  return { fetchStructureProposals };
}
