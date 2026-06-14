/**
 * API adapter functions for proposal operations
 * Handles API calls and error handling for proposals
 */
import { proposalsApi } from '../lib/api';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { ApiError, NetworkError, AuthError } from '../lib/api';

/**
 * Handles deleting a proposal
 */
export async function handleProposalDelete(
  proposalId: string,
  documentId: string,
  paragraphId: string
): Promise<void> {
  try {
    await proposalsApi.deleteProposal(documentId, paragraphId, proposalId);
    toast.success('Proposal deleted successfully');
  } catch (error) {
    logger.error('Failed to delete proposal:', error);
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
