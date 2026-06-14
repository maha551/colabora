// Governance API Response Types
import type { 
  OrganizationGovernanceRules,
  RepresentativeElection,
  VotingAnalytics
} from "../../../types";

export interface GovernanceRulesResponse {
  governanceRules: OrganizationGovernanceRules;
}

export interface ElectionsResponse {
  elections: RepresentativeElection[];
}

export interface VotingAnalyticsResponse {
  analytics: VotingAnalytics;
}

export interface ElectionResultsResponse {
  election: RepresentativeElection;
  results: Array<{
    candidateId: string;
    votesReceived: number;
    elected: boolean;
    electedPosition?: number;
  }>;
}

// Rule Proposals Response Type
// Note: RuleProposalsResponse is also defined in types/index.ts
// Keeping this for backward compatibility but importing from types is preferred
export interface RuleProposalsResponse {
  ruleProposals: Array<{
    id: string;
    organizationId: string;
    title: string;
    description?: string;
    ruleField: string;
    proposedValue: unknown;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface AuditLogsResponse {
  logs: Array<{
    id: string;
    organizationId: string;
    actionType: string;
    performedByUserId: string;
    affectedUserId?: string;
    details: string;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
  }>;
  total: number;
}

export interface AuditStatsResponse {
  stats: {
    totalActions: number;
    actionsByType: Record<string, number>;
    actionsByUser: Record<string, number>;
    [key: string]: unknown;
  };
}

