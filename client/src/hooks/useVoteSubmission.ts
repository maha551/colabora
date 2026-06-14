import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '../lib/logger';

interface UseVoteSubmissionOptions {
  /** Callback executed on successful vote submission */
  onSuccess?: () => void;
  /** Custom success message (default: 'Vote recorded') */
  successMessage?: string;
  /** Custom error message (default: 'Failed to cast vote') */
  errorMessage?: string;
  /** Whether to throw errors after handling them (for parent error handling) */
  throwOnError?: boolean;
  /** Callback executed immediately when vote is submitted (before API call) for optimistic UI updates */
  optimisticUpdate?: () => void;
  /** Callback executed if vote submission fails (to rollback optimistic update) */
  onError?: (error: Error) => void;
}

interface UseVoteSubmissionReturn {
  /** Whether a vote submission is currently in progress */
  isSubmitting: boolean;
  /** Submit a vote with automatic loading state and error handling */
  submitVote: <T>(voteFn: () => Promise<T>) => Promise<T | undefined>;
}

/**
 * Hook for handling vote submission with consistent loading states,
 * error handling, and toast notifications.
 * 
 * @example
 * const { isSubmitting, submitVote } = useVoteSubmission({
 *   onSuccess: () => {
 *     loadVotes();
 *     onUpdate();
 *   },
 *   successMessage: 'Your vote has been cast successfully'
 * });
 * 
 * const handleVote = async () => {
 *   await submitVote(async () => {
 *     await governanceApi.castElectionVote(orgId, electionId, voteData);
 *   });
 * };
 */
export function useVoteSubmission(options: UseVoteSubmissionOptions = {}): UseVoteSubmissionReturn {
  const {
    onSuccess,
    successMessage = 'Vote recorded',
    errorMessage = 'Failed to cast vote',
    throwOnError = false,
    optimisticUpdate,
    onError,
  } = options;

  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitVote = useCallback(
    async <T,>(voteFn: () => Promise<T>): Promise<T | undefined> => {
      if (isSubmitting) {
        return undefined;
      }

      setIsSubmitting(true);
      
      // Execute optimistic update immediately (before API call)
      if (optimisticUpdate) {
        try {
          optimisticUpdate();
        } catch (optError) {
          logger.warn('Error in optimistic update callback', optError);
          // Continue with vote submission even if optimistic update fails
        }
      }
      
      try {
        const result = await voteFn();
        toast.success(successMessage);
        onSuccess?.();
        return result;
      } catch (error) {
        logger.error('Failed to cast vote:', error);
        toast.error(errorMessage);
        
        // Call error callback to allow rollback of optimistic update
        if (onError && error instanceof Error) {
          try {
            onError(error);
          } catch (rollbackError) {
            logger.warn('Error in error callback (rollback)', rollbackError);
          }
        }
        
        if (throwOnError) {
          throw error;
        }
        return undefined;
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, successMessage, errorMessage, onSuccess, throwOnError, optimisticUpdate, onError]
  );

  return {
    isSubmitting,
    submitVote,
  };
}


