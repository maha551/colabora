import { useState, useCallback } from 'react';
import type { ProposalType } from '../../components/shared/proposalTypes';
import type { RuleProposal, StructureProposal, DocumentTreeProposal, Document } from '../../types';
import { documentsApi, structureProposalsApi } from '../../lib/api';
import { logger } from '../../lib/logger';
import {
  fetchRuleProposalsForOrgs,
  findTreeProposalById,
} from '../../lib/proposals/fetchProposalBatches';

export interface FullProposalData {
  rule?: RuleProposal;
  structure?: StructureProposal;
  tree?: DocumentTreeProposal;
  deletion?: Document;
}

export function useFullProposalData(organizationId: string | undefined, documentId: string | undefined) {
  const [fullProposalData, setFullProposalData] = useState<Record<string, FullProposalData>>({});

  const fetchFullProposalData = useCallback(
    async (proposalId: string, proposalType: ProposalType): Promise<FullProposalData | null> => {
      if (fullProposalData[proposalId]) return fullProposalData[proposalId];

      try {
        const data: FullProposalData = {};

        switch (proposalType) {
          case 'rule': {
            if (!organizationId) return null;
            const ruleMap = await fetchRuleProposalsForOrgs([organizationId]);
            const ruleProposal = ruleMap.get(proposalId);
            if (ruleProposal) {
              data.rule = ruleProposal;
              setFullProposalData((prev) => ({ ...prev, [proposalId]: data }));
            }
            break;
          }
          case 'structure': {
            if (!documentId) return null;
            const structureProposal = await structureProposalsApi.getStructureProposal(documentId, proposalId);
            if (structureProposal.structureProposal) {
              data.structure = structureProposal.structureProposal;
              setFullProposalData((prev) => ({ ...prev, [proposalId]: data }));
            }
            break;
          }
          case 'tree': {
            const treeProposal = await findTreeProposalById(proposalId, organizationId, documentId);
            if (treeProposal) {
              data.tree = treeProposal;
              setFullProposalData((prev) => ({ ...prev, [proposalId]: data }));
            }
            break;
          }
          case 'deletion': {
            if (!documentId) return null;
            const docResponse = await documentsApi.getDocument(documentId);
            if (docResponse.document) {
              data.deletion = docResponse.document;
              setFullProposalData((prev) => ({ ...prev, [proposalId]: data }));
            }
            break;
          }
        }

        return Object.keys(data).length > 0 ? data : null;
      } catch (err) {
        logger.error('Error fetching full proposal data', { proposalId, proposalType, error: err });
        return null;
      }
    },
    [organizationId, documentId, fullProposalData]
  );

  return { fetchFullProposalData, fullProposalData };
}
