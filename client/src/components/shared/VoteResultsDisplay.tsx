/**
 * VoteResultsDisplay Component
 *
 * Unified display for vote counts (PRO/NEUTRAL/CONTRA).
 * Uses design system VOTE tokens for consistent styling.
 */

import { useDesignSystemLabels } from '../../hooks/useDesignSystemLabels';
import { cn } from '../ui/utils';

interface VoteResultsDisplayProps {
  pro: number;
  neutral: number;
  contra: number;
  totalEligible?: number;
  variant?: 'compact' | 'grid' | 'detailed';
  className?: string;
}

export function VoteResultsDisplay({
  pro,
  neutral,
  contra,
  totalEligible = 0,
  variant = 'grid',
  className,
}: VoteResultsDisplayProps) {
  const { voteLabels } = useDesignSystemLabels();
  const totalVotes = pro + neutral + contra;
  const notVotedCount = totalEligible > 0 ? Math.max(totalEligible - totalVotes, 0) : 0;

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <span>
          <span className="font-medium" style={{ color: 'var(--vote-pro)' }}>{voteLabels.pro}</span>: {pro}
        </span>
        <span>•</span>
        <span>
          <span className="font-medium" style={{ color: 'var(--vote-neutral)' }}>{voteLabels.neutral}</span>: {neutral}
        </span>
        <span>•</span>
        <span>
          <span className="font-medium" style={{ color: 'var(--vote-contra)' }}>{voteLabels.contra}</span>: {contra}
        </span>
      </div>
    );
  }

  if (variant === 'grid') {
    return (
      <div className={cn('grid grid-cols-3 gap-4', className)}>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--vote-pro)' }}>{pro}</div>
          <div className="text-sm text-muted-foreground">{voteLabels.pro}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--vote-neutral)' }}>{neutral}</div>
          <div className="text-sm text-muted-foreground">{voteLabels.neutral}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--vote-contra)' }}>{contra}</div>
          <div className="text-sm text-muted-foreground">{voteLabels.contra}</div>
        </div>
      </div>
    );
  }

  // detailed: 4 columns including Not Voted
  return (
    <div className={cn('p-3 bg-muted border-b text-sm', className)}>
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-lg font-bold text-muted-foreground">{notVotedCount}</div>
          <div className="text-xs text-muted-foreground">{voteLabels.notVoted}</div>
        </div>
        <div>
          <div className="text-lg font-bold" style={{ color: 'var(--vote-contra)' }}>{contra}</div>
          <div className="text-xs text-muted-foreground">{voteLabels.contra}</div>
        </div>
        <div>
          <div className="text-lg font-bold" style={{ color: 'var(--vote-neutral)' }}>{neutral}</div>
          <div className="text-xs text-muted-foreground">{voteLabels.neutral}</div>
        </div>
        <div>
          <div className="text-lg font-bold" style={{ color: 'var(--vote-pro)' }}>{pro}</div>
          <div className="text-xs text-muted-foreground">{voteLabels.pro}</div>
        </div>
      </div>
      {totalEligible > 0 && (
        <div className="mt-2 text-center text-xs text-muted-foreground">
          {totalVotes} of {totalEligible} members voted
        </div>
      )}
    </div>
  );
}
