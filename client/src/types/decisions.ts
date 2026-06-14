/**
 * Decision types for the unified Decisions tab
 * Aggregates paragraph changes, rule proposals, elections, org votes,
 * structure proposals, tree proposals, document status changes
 */

export type DecisionKind =
  | 'paragraph_change'
  | 'rule_proposal'
  | 'election'
  | 'organization_vote'
  | 'structure_proposal'
  | 'tree_proposal'
  | 'document_status'
  | 'meeting_decision'
  | 'document_deletion';

export type DecisionOutcome =
  | 'accepted'
  | 'rejected'
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'completed'
  | 'recorded';

export interface DecisionEntry {
  id: string;
  kind: DecisionKind;
  outcome: DecisionOutcome;
  timestamp: string;
  organizationId?: string;
  organizationName?: string;
  documentId?: string;
  documentTitle?: string;
  documentVersionId?: string;
  payload: Record<string, unknown>;
}

export interface DecisionsResponse {
  entries: DecisionEntry[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/** Kinds of open (pending) decisions for the Pending tab */
export type PendingDecisionKind =
  | 'paragraph_proposal'
  | 'election'
  | 'organization_vote'
  | 'rule_proposal'
  | 'structure_proposal'
  | 'tree_proposal'
  | 'document_voting'
  | 'document_amendments_open';

/** Single open decision entry from GET /api/pending-decisions */
export interface PendingDecisionEntry {
  id: string;
  kind: PendingDecisionKind;
  timestamp: string;
  organizationId?: string;
  organizationName?: string;
  documentId?: string;
  documentTitle?: string;
  payload: Record<string, unknown>;
}

export interface PendingDecisionsResponse {
  entries: PendingDecisionEntry[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
