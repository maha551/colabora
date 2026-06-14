/**
 * Hook for handling vote button clicks in SuggestionCard
 * Consolidates cooldown logic and state management for vote buttons
 * 
 * Note: This hook handles button click logic only. The actual vote submission
 * is handled by the onVote prop (e.g. useOptimisticVote.vote). votingState is
 * owned and updated by the vote handler; this hook only reads it for cooldown
 * and isVoting display.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { VOTE_COOLDOWN_MS, VOTE_FALLBACK_TIMEOUT } from '../lib/constants';

interface UseVoteButtonHandlerOptions {
  /** The suggestion/proposal ID */
  suggestionId: string;
  /** Callback to execute when vote is clicked (handles actual submission) */
  onVote: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void> | void;
  /** Optional: Set of proposal IDs currently being voted on (for duplicate prevention) */
  votingState?: Set<string>;
  /** Optional: Function to update voting state */
  setVotingState?: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Cooldown period in milliseconds (default: VOTE_COOLDOWN_MS) */
  cooldownMs?: number;
  /** Whether voting is locked (e.g., deadline passed) */
  isVoteLocked?: boolean;
}

interface UseVoteButtonHandlerReturn {
  /** Handler function for vote button clicks */
  handleVoteClick: (voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
  /** Whether a vote is currently in progress */
  isVoting: boolean;
}

/**
 * Hook for handling vote button clicks with cooldown and state management
 */
export function useVoteButtonHandler({
  suggestionId,
  onVote,
  votingState,
  setVotingState,
  cooldownMs = VOTE_COOLDOWN_MS,
  isVoteLocked = false,
}: UseVoteButtonHandlerOptions): UseVoteButtonHandlerReturn {
  const [isVoting, setIsVoting] = useState(false);
  const [lastVoteTime, setLastVoteTime] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasVotingRef = useRef(false);

  // Track when we start voting
  useEffect(() => {
    if (isVoting) {
      wasVotingRef.current = true;
    }
  }, [isVoting]);

  // Clear isVoting when votingState is cleared (WebSocket update arrived)
  // This happens when useWebSocketUpdates clears votingState after receiving update
  useEffect(() => {
    if (votingState !== undefined && !votingState.has(suggestionId) && wasVotingRef.current && isVoting) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsVoting(false);
      wasVotingRef.current = false;
    }
  }, [votingState, suggestionId, isVoting]);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleVoteClick = useCallback(async (voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    // Check if voting is locked
    if (isVoteLocked) {
      return;
    }

    // Check cooldown period
    const now = Date.now();
    const timeSinceLastVote = now - lastVoteTime;
    if (timeSinceLastVote < cooldownMs) {
      const remainingSeconds = ((cooldownMs - timeSinceLastVote) / 1000).toFixed(1);
      toast.info(`Please wait ${remainingSeconds}s before voting again`, { duration: 1500 });
      return;
    }

    // Check if already voting (from votingState Set or local state)
    if (votingState?.has(suggestionId) || isVoting) {
      return;
    }

    setLastVoteTime(now);
    setIsVoting(true);

    // votingState is owned by useOptimisticVote / vote handler; do not set it here

    try {
      await onVote(suggestionId, voteType);
    } catch (error) {
      setIsVoting(false);
      // Vote handler (useOptimisticVote) clears votingState on error
      throw error;
    } finally {
      // WebSocket update will clear this immediately (via voteReceived prop)
      // Fallback timeout only if WebSocket is slow
      timeoutRef.current = setTimeout(() => {
        setIsVoting(false);
        timeoutRef.current = null;
      }, VOTE_FALLBACK_TIMEOUT);
    }
  }, [suggestionId, onVote, votingState, cooldownMs, lastVoteTime, isVoting, isVoteLocked]);

  return { handleVoteClick, isVoting };
}
