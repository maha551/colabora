/**
 * API adapter functions for rule proposal operations
 * Handles API calls and error handling for rule proposals
 */
import { governanceApi } from '../lib/api';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { ApiError, NetworkError, AuthError } from '../lib/api';
import type { VoteValue } from './voteAdapter';

/**
 * Handles voting on a rule proposal
 * Supports PRO/NEUTRAL/CONTRA (VoteValue), Yes/No/Abstain, and multiple choice voting.
 * API accepts both vote (PRO/NEUTRAL/CONTRA) and voteChoice (yes/no/abstain).
 */
export async function handleRuleVote(
  proposalId: string,
  organizationId: string,
  voteData: {
    selectedOptionId?: string;
    vote?: VoteValue;
    voteChoice?: 'yes' | 'no' | 'abstain';
  }
): Promise<void> {
  try {
    await governanceApi.ruleProposalsApi.voteOnRuleProposal(organizationId, proposalId, voteData);
    toast.success('Vote recorded');
  } catch (error) {
    logger.error('Failed to vote on rule proposal:', error);
    if (error instanceof AuthError) {
      toast.error('You must be logged in to vote');
    } else if (error instanceof NetworkError) {
      toast.error('Network error. Please check your connection.');
    } else if (error instanceof ApiError) {
      toast.error(error.message || 'Failed to record vote');
    } else {
      toast.error('Failed to record vote');
    }
    throw error;
  }
}

/**
 * Handles adding a comment to a rule proposal
 */
export async function handleRuleComment(
  proposalId: string,
  organizationId: string,
  text: string,
  parentId?: string
): Promise<void> {
  try {
    await governanceApi.ruleProposalsApi.addComment(organizationId, proposalId, { text, parentId });
    toast.success('Comment added');
  } catch (error) {
    logger.error('Failed to add comment to rule proposal:', error);
    if (error instanceof AuthError) {
      toast.error('You must be logged in to comment');
    } else if (error instanceof NetworkError) {
      toast.error('Network error. Please check your connection.');
    } else if (error instanceof ApiError) {
      toast.error(error.message || 'Failed to add comment');
    } else {
      toast.error('Failed to add comment');
    }
    throw error;
  }
}

/**
 * Handles deleting a comment on a rule proposal
 */
export async function handleRuleDeleteComment(
  proposalId: string,
  organizationId: string,
  commentId: string
): Promise<void> {
  try {
    await governanceApi.ruleProposalsApi.deleteComment(organizationId, proposalId, commentId);
    toast.success('Comment deleted');
  } catch (error) {
    logger.error('Failed to delete rule proposal comment:', error);
    if (error instanceof AuthError) {
      toast.error('You must be logged in to delete comments');
    } else if (error instanceof NetworkError) {
      toast.error('Network error. Please check your connection.');
    } else if (error instanceof ApiError) {
      toast.error(error.message || 'Failed to delete comment');
    } else {
      toast.error('Failed to delete comment');
    }
    throw error;
  }
}
