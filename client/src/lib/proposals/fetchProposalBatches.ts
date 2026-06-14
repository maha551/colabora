import type { RuleProposal, StructureProposal, DocumentTreeProposal } from '../../types';
import { ruleProposalsApi } from '../api/governance/rule-proposals';
import { electionsApi } from '../api/governance/elections';
import { organizationsApi } from '../api/organizations';
import { structureProposalsApi } from '../api/structure-proposals';
import { documentTreeProposalsApi } from '../api/document-tree-proposals';
import { documentsApi } from '../api/documents';
import { logger } from '../logger';

export type OrgVoteBallotChoice = 'yes' | 'no' | 'abstain';

export interface ElectionVoteStatus {
  hasVoted: boolean;
  voteData?: {
    candidateRanking?: string[];
    approvedCandidates?: string[];
    candidateId?: string;
  };
}

/** Fetch all rule proposals for each org; returns flat map by proposal id. */
export async function fetchRuleProposalsForOrgs(
  orgIds: string[]
): Promise<Map<string, RuleProposal>> {
  const map = new Map<string, RuleProposal>();
  const uniqueOrgIds = [...new Set(orgIds.filter(Boolean))];
  if (uniqueOrgIds.length === 0) return map;

  await Promise.all(
    uniqueOrgIds.map(async (orgId) => {
      try {
        const response = await ruleProposalsApi.getRuleProposals(orgId);
        for (const proposal of response.ruleProposals ?? []) {
          map.set(proposal.id, proposal as RuleProposal);
        }
      } catch (err) {
        logger.warn('Failed to fetch rule proposals for org', { orgId, err });
      }
    })
  );
  return map;
}

/** Fetch structure proposals per document; returns flat map by proposal id. */
export async function fetchStructureProposalsForDocuments(
  docIds: string[]
): Promise<Map<string, StructureProposal>> {
  const map = new Map<string, StructureProposal>();
  const uniqueDocIds = [...new Set(docIds.filter(Boolean))];
  if (uniqueDocIds.length === 0) return map;

  await Promise.all(
    uniqueDocIds.map(async (documentId) => {
      try {
        const response = await structureProposalsApi.getStructureProposals(documentId);
        for (const proposal of response.structureProposals ?? []) {
          map.set(proposal.id, proposal);
        }
      } catch (err) {
        logger.warn('Failed to fetch structure proposals for document', { documentId, err });
      }
    })
  );
  return map;
}

/** Fetch tree proposals per document; returns flat map by proposal id. */
export async function fetchTreeProposalsForDocuments(
  docIds: string[]
): Promise<Map<string, DocumentTreeProposal>> {
  const map = new Map<string, DocumentTreeProposal>();
  const uniqueDocIds = [...new Set(docIds.filter(Boolean))];
  if (uniqueDocIds.length === 0) return map;

  await Promise.all(
    uniqueDocIds.map(async (documentId) => {
      try {
        const response = await documentTreeProposalsApi.getProposals(documentId);
        for (const proposal of response.proposals ?? []) {
          map.set(proposal.id, proposal);
        }
      } catch (err) {
        logger.warn('Failed to fetch tree proposals for document', { documentId, err });
      }
    })
  );
  return map;
}

/** Fetch user vote status for elections in an org (parallel per election). */
export async function fetchElectionVoteStatuses(
  orgId: string,
  electionIds: string[]
): Promise<Map<string, ElectionVoteStatus>> {
  const map = new Map<string, ElectionVoteStatus>();
  const uniqueIds = [...new Set(electionIds.filter(Boolean))];
  if (!orgId || uniqueIds.length === 0) return map;

  await Promise.all(
    uniqueIds.map(async (electionId) => {
      try {
        const status = await electionsApi.getUserElectionVoteStatus(orgId, electionId);
        map.set(electionId, status);
      } catch (err) {
        logger.warn('Failed to fetch election vote status', { orgId, electionId, err });
        map.set(electionId, { hasVoted: false });
      }
    })
  );
  return map;
}

/** Fetch org votes with user ballot choice (one request per org). */
export async function fetchOrgVoteBallotsForOrgs(
  orgIds: string[]
): Promise<Map<string, OrgVoteBallotChoice>> {
  const map = new Map<string, OrgVoteBallotChoice>();
  const uniqueOrgIds = [...new Set(orgIds.filter(Boolean))];
  if (uniqueOrgIds.length === 0) return map;

  await Promise.all(
    uniqueOrgIds.map(async (orgId) => {
      try {
        const response = await organizationsApi.getOrganizationVotes(orgId);
        for (const vote of response.votes ?? []) {
          const choice = vote.userVoteChoice;
          if (choice === 'yes' || choice === 'no' || choice === 'abstain') {
            map.set(vote.id, choice);
          }
        }
      } catch (err) {
        logger.warn('Failed to fetch organization votes for org', { orgId, err });
      }
    })
  );
  return map;
}

/** Find a tree proposal by id across org documents (for single-ID lookup). */
export async function findTreeProposalById(
  proposalId: string,
  organizationId?: string,
  documentId?: string
): Promise<DocumentTreeProposal | undefined> {
  if (documentId) {
    const map = await fetchTreeProposalsForDocuments([documentId]);
    return map.get(proposalId);
  }
  if (!organizationId) return undefined;

  try {
    const docsResponse = await documentsApi.getDocuments();
    const orgDocIds = docsResponse.documents
      .filter((doc) => doc.organizationId === organizationId)
      .map((doc) => doc.id);
    const map = await fetchTreeProposalsForDocuments(orgDocIds);
    return map.get(proposalId);
  } catch (err) {
    logger.warn('Error finding tree proposal by id', { proposalId, organizationId, err });
    return undefined;
  }
}
