import type { VotingStatusResponse, DeletionStatusResponse } from './api/types/documents';
import type { GovernanceRuleValue, RuleProposal, RuleProposalApiResponse } from '../types';

export interface DocumentVoteLike {
  userId?: string;
  vote?: string | null;
}

export interface DocumentVoteStateInput {
  votes?: DocumentVoteLike[];
}

export interface RuleProposalVoteViewModel {
  id: string;
  title: string;
  description: string;
  ruleField: string;
  proposedValue: GovernanceRuleValue;
  options?: Array<{
    id: string;
    optionTitle: string;
    optionDescription?: string;
    proposedValue: GovernanceRuleValue;
    votesReceived?: number;
  }>;
  status: RuleProposal['status'];
  createdBy: {
    id: string;
    name: string;
  };
  votingDeadline?: string;
  votes?: NonNullable<RuleProposal['votes']>;
  votesYes?: number;
  votesNo?: number;
  votesAbstain?: number;
  votesCast?: number;
  totalVoters?: number;
  createdAt: string;
}

export function mapDocumentVoteResponse(
  prev: VotingStatusResponse,
  response: DocumentVoteStateInput,
  currentUserId: string | null
): VotingStatusResponse {
  const votes = response.votes ?? [];
  const voteBreakdown = {
    PRO: votes.filter((v) => v.vote === 'PRO').length,
    NEUTRAL: votes.filter((v) => v.vote === 'NEUTRAL').length,
    CONTRA: votes.filter((v) => v.vote === 'CONTRA').length,
  };
  const totalVotes = votes.length;
  const userVote = currentUserId
    ? votes.find((v) => v.userId === currentUserId)?.vote as 'PRO' | 'NEUTRAL' | 'CONTRA' | undefined
    : prev.voting.userVote;

  return {
    ...prev,
    voting: {
      ...prev.voting,
      totalVotes,
      voteBreakdown,
      userVote,
      approvalRate: totalVotes > 0 ? (voteBreakdown.PRO / totalVotes) * 100 : 0,
    },
  };
}

export function getDeletionVoteBreakdown(status: DeletionStatusResponse) {
  return {
    pro: status.votes?.PRO ?? 0,
    neutral: status.votes?.NEUTRAL ?? 0,
    contra: status.votes?.CONTRA ?? 0,
    total:
      (status.votes?.PRO ?? 0) + (status.votes?.NEUTRAL ?? 0) + (status.votes?.CONTRA ?? 0),
  };
}

type RuleProposalApiLike = Partial<RuleProposalApiResponse> & {
  id: string;
  title?: string;
  ruleField?: string;
  status: RuleProposal['status'] | string;
  createdAt?: string;
  updatedAt?: string;
  current_rule_field?: string;
  proposed_rule_value?: GovernanceRuleValue;
};

export function normalizeRuleProposalVoteResponse(record: RuleProposalApiLike): RuleProposalVoteViewModel {
  return {
    id: record.id,
    title: record.title || '',
    description: record.description || '',
    ruleField: record.ruleField || record.current_rule_field || '',
    proposedValue: (record.proposedValue ?? record.proposed_rule_value) as GovernanceRuleValue,
    options: (record.options || []).map((option) => ({
      id: option.id,
      optionTitle: option.optionTitle,
      optionDescription: option.optionDescription,
      proposedValue: option.proposedValue,
      votesReceived: option.votesReceived,
    })),
    status: record.status,
    createdBy: record.createdBy || {
      id: record.created_by || '',
      name: record.created_by_name || 'Unknown',
    },
    votingDeadline: record.votingDeadline || record.votingEndsAt || record.voting_ends_at,
    votes: (record.votes || []).map((vote) => ({
      id: vote.id,
      userId: vote.userId,
      selectedOptionId: vote.selectedOptionId,
      voteChoice: vote.voteChoice,
      votedAt: vote.votedAt,
      user: vote.user,
    })),
    votesYes: record.votesYes ?? record.votes_yes ?? 0,
    votesNo: record.votesNo ?? record.votes_no ?? 0,
    votesAbstain: record.votesAbstain ?? record.votes_abstain ?? 0,
    votesCast: record.votesCast ?? record.votes_cast ?? 0,
    totalVoters: record.totalVoters ?? record.total_voters ?? 0,
    createdAt: record.createdAt || record.created_at || new Date().toISOString(),
  };
}

