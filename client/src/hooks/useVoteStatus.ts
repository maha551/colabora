import { useState, useEffect, useCallback } from 'react';
import { logger } from '../lib/logger';

interface VoteData {
  userId: string;
  [key: string]: unknown;
}

interface UseVoteStatusOptions {
  /** Array of votes to check against (for synchronous checking) */
  votes?: VoteData[];
  /** Current user ID */
  currentUserId?: string;
  /** Async function to check vote status (returns hasVoted and optional voteData) */
  checkVoteFn?: () => Promise<{ hasVoted: boolean; voteData?: unknown }>;
  /** Whether to automatically check vote status on mount */
  autoCheck?: boolean;
  /** Callback to pre-populate selections when user has voted */
  onVoteFound?: (voteData: unknown) => void;
}

interface UseVoteStatusReturn {
  /** Whether the user has already voted */
  hasVoted: boolean;
  /** The user's vote data if available */
  userVote: unknown;
  /** Manually check vote status */
  checkVoteStatus: () => Promise<void>;
  /** Set hasVoted state manually */
  setHasVoted: (hasVoted: boolean) => void;
}

/**
 * Hook for checking vote status and pre-populating vote selections.
 * Supports both synchronous (checking votes array) and asynchronous (API call) patterns.
 * 
 * @example
 * // Synchronous check against votes array
 * const { hasVoted, userVote } = useVoteStatus({
 *   votes: proposal.votes,
 *   currentUserId: currentUser.id
 * });
 * 
 * @example
 * // Async check via API
 * const { hasVoted, checkVoteStatus, userVote } = useVoteStatus({
 *   currentUserId: currentUser.id,
 *   checkVoteFn: async () => {
 *     const response = await governanceApi.getUserElectionVoteStatus(orgId, electionId);
 *     return { hasVoted: response.hasVoted, voteData: response.voteData };
 *   },
 *   onVoteFound: (voteData) => {
 *     // Pre-populate selections
 *     if (voteData.candidateRanking) {
 *       setSelectedCandidates(voteData.candidateRanking);
 *     }
 *   },
 *   autoCheck: true
 * });
 */
export function useVoteStatus(options: UseVoteStatusOptions = {}): UseVoteStatusReturn {
  const {
    votes,
    currentUserId,
    checkVoteFn,
    autoCheck = false,
    onVoteFound,
  } = options;

  const [hasVoted, setHasVoted] = useState(false);
  const [userVote, setUserVote] = useState<unknown>(null);

  // Synchronous check against votes array
  const checkVotesArray = useCallback(() => {
    if (!votes || !currentUserId) {
      setHasVoted(false);
      setUserVote(null);
      return;
    }

    const vote = votes.find((v) => v.userId === currentUserId);
    if (vote) {
      setHasVoted(true);
      setUserVote(vote);
      if (onVoteFound) {
        onVoteFound(vote);
      }
    } else {
      setHasVoted(false);
      setUserVote(null);
    }
  }, [votes, currentUserId, onVoteFound]);

  // Async check via API function
  const checkVoteStatus = useCallback(async () => {
    if (!checkVoteFn) {
      // Fall back to synchronous check if no async function provided
      checkVotesArray();
      return;
    }

    try {
      const response = await checkVoteFn();
      setHasVoted(response.hasVoted);
      
      if (response.hasVoted && response.voteData) {
        setUserVote(response.voteData);
        if (onVoteFound) {
          onVoteFound(response.voteData);
        }
      } else {
        setUserVote(null);
      }
    } catch (error) {
      logger.error('Failed to check vote status:', error);
      // On error, assume user hasn't voted
      setHasVoted(false);
      setUserVote(null);
    }
  }, [checkVoteFn, onVoteFound, checkVotesArray]);

  // Auto-check on mount if enabled
  useEffect(() => {
    if (autoCheck) {
      if (checkVoteFn) {
        checkVoteStatus();
      } else {
        checkVotesArray();
      }
    }
  }, [autoCheck, checkVoteFn, checkVoteStatus, checkVotesArray]);

  // Check votes array when it changes (for synchronous pattern)
  useEffect(() => {
    if (votes && !checkVoteFn) {
      checkVotesArray();
    }
  }, [votes, checkVoteFn, checkVotesArray]);

  return {
    hasVoted,
    userVote,
    checkVoteStatus,
    setHasVoted,
  };
}


