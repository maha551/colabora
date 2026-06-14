/**
 * Shared types for proposal components
 * Extracted to break circular dependency between VotingCard and ProposalDetailsDialog
 */

export type ProposalType = 'rule' | 'structure' | 'tree' | 'deletion' | 'paragraph';

export interface BaseProposal {
  id: string;
  type: ProposalType;
  status: string;
  createdAt: string;
  deadline?: string;
  votes?: {
    pro: number;
    contra: number;
    neutral: number;
    total: number;
  };
  userVote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
  approvalPercentage?: number;
  quorumMet?: boolean;
  title?: string;
  description?: string;
  documentId?: string;
  organizationId?: string;
  createdBy?: {
    id: string;
    name: string;
    email?: string;
  };
}
