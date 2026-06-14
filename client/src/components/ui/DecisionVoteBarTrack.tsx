import React from 'react';
import { DECISION_CARD, VOTE } from '../../lib/designSystem';
import { cn } from './utils';

export interface VoteBarSegment {
  percent: number;
  color: string;
  title?: string;
}

interface DecisionVoteBarTrackProps {
  segments: VoteBarSegment[];
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}

/**
 * Shared 12px vote bar track for archive decision cards and VoteProgressBar.
 */
export function DecisionVoteBarTrack({
  segments,
  className,
  interactive = false,
  onClick,
  ariaLabel,
}: DecisionVoteBarTrackProps) {
  return (
    <div
      className={cn(DECISION_CARD.voteBarTrack, interactive && 'cursor-pointer', className)}
      style={{ backgroundColor: VOTE.colors.background }}
      onClick={interactive ? onClick : undefined}
      title={segments.find((s) => s.title)?.title}
      role={interactive ? 'button' : undefined}
      aria-label={ariaLabel}
    >
      {segments.map((segment, i) => {
        if (segment.percent <= 0) return null;
        return (
          <div
            key={i}
            className="transition-all duration-300"
            style={{
              width: `${segment.percent}%`,
              backgroundColor: segment.color,
              flex: `0 0 ${segment.percent}%`,
            }}
            title={segment.title}
          />
        );
      })}
    </div>
  );
}
