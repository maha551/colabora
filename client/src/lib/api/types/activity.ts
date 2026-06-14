// Activity Feed API Response Types
import type { ActivityFeedProposal } from "../../../utils/proposalAdapter";
import type { VersionHistory } from "../../../types";

export interface AgreedVersionsResponse {
  versions: Array<{
    id: string;
    documentId: string;
    paragraphId: string;
    text: string;
    acceptedAt: string;
    approvalPercentage: number;
    userId: string;
    userName?: string;
    userEmail?: string;
    proposalId?: string;  // Proposal ID from history table
  }>;
}

export interface AgreedHistoryResponse {
  entries: Array<Omit<VersionHistory, 'acceptedAt'> & {
    acceptedAt: string; // ISO string from API
    documentId: string;
    documentTitle: string;
    documentDescription?: string;
    paragraphTitle?: string;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface DebatedProposalsResponse {
  proposals: ActivityFeedProposal[];
}

export interface PendingVotesResponse {
  proposals: ActivityFeedProposal[];
}

// Decisions API (unified timeline of resolved votes)
export type { DecisionEntry, DecisionKind, DecisionOutcome, DecisionsResponse } from '../../../types/decisions';

// Pending decisions API (open votes, elections, rule/structure proposals)
export type { PendingDecisionEntry, PendingDecisionKind, PendingDecisionsResponse } from '../../../types/decisions';

