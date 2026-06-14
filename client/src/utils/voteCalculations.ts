// Utility functions for vote counting and approval percentage calculations
// Mirrors backend logic from server/utils/voteCounts.js and server/modules/unified-voting.js
// Ensures consistency between frontend and backend calculations

import type { Vote } from '../types';
import { logger } from '../lib/logger';

/**
 * Vote counts result
 */
export interface VoteCounts {
  pro: number;
  contra: number;
  neutral: number;
  total: number;
}

/**
 * Parameters for approval percentage calculation
 */
export interface ApprovalPercentageParams {
  proVotes: number;
  totalVotes: number;
  totalEligible: number;
  calculationMethod?: 'all_votes' | 'all_members';
}

/**
 * Calculate vote counts from an array of votes
 * Mirrors logic from server/utils/voteCounts.js
 * @param votes - Array of vote objects with 'vote' property ('PRO', 'NEUTRAL', 'CONTRA')
 * @returns Object with pro, contra, neutral, and total counts
 */
export function calculateVoteCounts(votes: Vote[] | null | undefined): VoteCounts {
  if (!Array.isArray(votes)) {
    logger.warn('calculateVoteCounts: votes is not an array', { votes });
    return { pro: 0, contra: 0, neutral: 0, total: 0 };
  }

  const counts: VoteCounts = {
    pro: 0,
    contra: 0,
    neutral: 0,
    total: 0
  };

  votes.forEach(vote => {
    const voteValue = vote?.vote;
    
    // Handle PRO/NEUTRAL/CONTRA format
    if (voteValue === 'PRO') {
      counts.pro++;
      counts.total++;
    } else if (voteValue === 'CONTRA') {
      counts.contra++;
      counts.total++;
    } else if (voteValue === 'NEUTRAL') {
      counts.neutral++;
      counts.total++;
    } else {
      // Unknown vote values are excluded from total to prevent count mismatches
      logger.warn('calculateVoteCounts: Unknown vote value excluded from count', { voteValue, voteId: vote?.id });
    }
  });

  return counts;
}

/**
 * Calculate approval percentage based on threshold calculation method
 * Mirrors logic from server/modules/unified-voting.js calculateApprovalPercentage
 * @param params - Calculation parameters
 * @returns Approval percentage (0-100)
 */
export function calculateApprovalPercentage(params: ApprovalPercentageParams): number {
  const { proVotes, totalVotes, totalEligible, calculationMethod = 'all_votes' } = params;

  if (calculationMethod === 'all_members') {
    // Calculate as percentage of all eligible members
    return totalEligible > 0 ? (proVotes / totalEligible) * 100 : 0;
  } else {
    // Calculate as percentage of actual votes cast (all_votes)
    return totalVotes > 0 ? (proVotes / totalVotes) * 100 : 0;
  }
}
