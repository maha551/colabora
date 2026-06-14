/**
 * InlineVoteButtons Component
 *
 * Standard voting UI matching the paragraph proposal card (SuggestionCard) pattern.
 * Renders VoteButtonGroup compact (thumbs icons) for consistent UX.
 */

import { cn } from '../ui/utils';
import { VoteButtonGroup } from './VoteButtonGroup';

export type InlineVoteValue = 'PRO' | 'NEUTRAL' | 'CONTRA';

interface InlineVoteButtonsProps {
  /** Current user's vote (for highlighting) */
  userVote?: InlineVoteValue | null;
  /** Callback when user votes */
  onVote: (vote: InlineVoteValue) => void | Promise<void>;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state (disables buttons during submission) */
  loading?: boolean;
  /** Which button is currently submitting */
  submittingVote?: InlineVoteValue | null;
  /** Optional className for container */
  className?: string;
}

/**
 * Standard inline voting buttons - PRO, NEUTRAL, CONTRA.
 * Uses VoteButtonGroup compact (thumbs) for consistent UX with SuggestionCard.
 */
export function InlineVoteButtons({
  userVote,
  onVote,
  disabled = false,
  loading = false,
  submittingVote = null,
  className,
}: InlineVoteButtonsProps) {
  const isVoting = loading || !!submittingVote;

  return (
    <VoteButtonGroup
      value={userVote}
      onVote={onVote}
      disabled={disabled || isVoting}
      variant="compact"
      className={cn('shrink-0', className)}
    />
  );
}
