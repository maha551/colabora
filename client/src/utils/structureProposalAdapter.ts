/**
 * API adapter functions for structure proposal operations
 * Handles API calls and error handling for structure proposals
 */
import { structureProposalsApi } from '../lib/api';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { ApiError, NetworkError, AuthError } from '../lib/api';
import { getUserFriendlyErrorMessage } from './errorMessages';
import type { StructureProposalVoteResponse } from '../lib/api/types';

/**
 * Handles voting on a structure proposal
 * Returns the API response data for use as fallback if WebSocket updates are delayed
 */
export async function handleStructureVote(
  proposalId: string,
  documentId: string,
  voteType: 'PRO' | 'NEUTRAL' | 'CONTRA'
): Promise<StructureProposalVoteResponse> {
  try {
    const response = await structureProposalsApi.voteOnStructureProposal(documentId, proposalId, voteType);
    toast.success('Vote recorded');
    return response;
  } catch (error) {
    logger.error('Failed to vote on structure proposal:', error);
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
 * Handles adding a comment to a structure proposal
 */
export async function handleStructureComment(
  proposalId: string,
  documentId: string,
  text: string,
  parentId?: string
): Promise<void> {
  try {
    await structureProposalsApi.addCommentToStructureProposal(documentId, proposalId, text, parentId);
    toast.success('Comment added successfully');
  } catch (error) {
    logger.error('Failed to add comment to structure proposal:', error);
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
 * Handles completing vote on structure proposal (close voting, apply if approved)
 */
export async function handleStructureComplete(
  proposalId: string,
  documentId: string
): Promise<{ applied: boolean; outcome: string }> {
  try {
    const result = await structureProposalsApi.completeStructureProposal(documentId, proposalId);
    toast.success('Vote completed successfully');
    return result;
  } catch (error) {
    logger.error('Failed to complete structure proposal vote:', error);
    if (error instanceof AuthError) {
      toast.error('You must be logged in to complete votes');
    } else if (error instanceof NetworkError) {
      toast.error('Network error. Please check your connection.');
    } else if (error instanceof ApiError) {
      toast.error(getUserFriendlyErrorMessage(error, 'Failed to complete vote'));
    } else {
      toast.error('Failed to complete vote');
    }
    throw error;
  }
}

/**
 * Handles deleting a structure proposal
 */
export async function handleStructureDelete(
  proposalId: string,
  documentId: string
): Promise<void> {
  try {
    await structureProposalsApi.deleteStructureProposal(documentId, proposalId);
    toast.success('Structure proposal deleted successfully');
  } catch (error) {
    logger.error('Failed to delete structure proposal:', error);
    if (error instanceof AuthError) {
      toast.error('You must be logged in to delete proposals');
    } else if (error instanceof NetworkError) {
      toast.error('Network error. Please check your connection.');
    } else if (error instanceof ApiError) {
      toast.error(error.message || 'Failed to delete proposal');
    } else {
      toast.error('Failed to delete proposal');
    }
    throw error;
  }
}

