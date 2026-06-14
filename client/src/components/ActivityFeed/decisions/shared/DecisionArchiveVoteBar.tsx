import React from 'react';
import { VoteProgressBar } from '../../../ui/VoteProgressBar';

export type DecisionArchiveVoteVariant = 'proposal' | 'election';

export interface DecisionArchiveVoteBarProps {
  variant?: DecisionArchiveVoteVariant;
  pro?: number;
  neutral?: number;
  contra?: number;
  totalEligibleVoters?: number;
  votesCast?: number;
  totalVoters?: number;
  className?: string;
}

/**
 * Read-only vote bar for Decisions archive cards.
 * Maps normalized payload counts to VoteProgressBar (matches active VotingCard placement).
 */
export function DecisionArchiveVoteBar({
  variant = 'proposal',
  pro = 0,
  neutral = 0,
  contra = 0,
  totalEligibleVoters = 0,
  votesCast = 0,
  totalVoters = 0,
  className,
}: DecisionArchiveVoteBarProps) {
  if (variant === 'election') {
    if (totalVoters <= 0 && votesCast <= 0) return null;
    return (
      <VoteProgressBar
        variant="election"
        votesCast={votesCast}
        totalVoters={totalVoters}
        totalEligibleVoters={totalVoters}
        interactive={false}
        className={className}
      />
    );
  }

  const totalVotes = pro + neutral + contra;
  const eligible = totalEligibleVoters > 0 ? totalEligibleVoters : totalVotes;
  if (eligible <= 0 && totalVotes <= 0) return null;

  return (
    <VoteProgressBar
      variant="proposal"
      aggregatedCounts={{ pro, neutral, contra }}
      totalEligibleVoters={eligible}
      interactive={false}
      className={className}
    />
  );
}
