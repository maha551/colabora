import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../ui/Icon';
import { DECISION_CARD, VOTE } from '../../../../lib/designSystem';
import { cn } from '../../../ui/utils';

export interface MeetingVoteOptionResult {
  id: string;
  label: string;
  count: number;
}

interface MeetingVoteArchiveBarProps {
  voteTitle?: string;
  options: MeetingVoteOptionResult[];
  className?: string;
}

const SEGMENT_COLORS = [
  VOTE.colors.pro,
  VOTE.colors.contra,
  VOTE.colors.neutral,
  VOTE.colors.pro,
];

/**
 * Read-only meeting vote results — full-width bar per option with label overlaid on the track.
 */
export function MeetingVoteArchiveBar({
  voteTitle,
  options,
  className,
}: MeetingVoteArchiveBarProps) {
  const { t } = useTranslation('activity');
  const totalVotes = options.reduce((sum, o) => sum + o.count, 0);
  const maxCount = Math.max(...options.map((o) => o.count), 0);

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );

  if (options.length === 0 || totalVotes <= 0) return null;

  const hasWinner =
    options.filter((o) => o.count === maxCount).length === 1 && maxCount > 0;

  return (
    <div className={cn(DECISION_CARD.voteBarSection, className)}>
      {voteTitle && (
        <div className="text-xs font-medium text-muted-foreground">{voteTitle}</div>
      )}
      <ul className="space-y-1.5" role="list">
        {options.map((option, i) => {
          const share = totalVotes > 0 ? option.count / totalVotes : 0;
          const barWidthPercent = share * 100;
          const isWinner = hasWinner && option.count === maxCount;
          const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
          return (
            <li
              key={option.id}
              className={DECISION_CARD.voteBarRow}
              title={`${option.label}: ${option.count}`}
            >
              <div
                className={DECISION_CARD.voteBarRowTrack}
                style={{ backgroundColor: VOTE.colors.background }}
              >
                {barWidthPercent > 0 && (
                  <div
                    className={DECISION_CARD.voteBarRowFill}
                    style={{ width: `${barWidthPercent}%`, backgroundColor: color }}
                    aria-hidden
                  />
                )}
                <div className={DECISION_CARD.voteBarRowOverlay}>
                  <span className={DECISION_CARD.voteBarRowLabel}>
                    <span className="truncate">{option.label}</span>
                    {isWinner && (
                      <Icon
                        name="CheckCircle2"
                        className="h-3 w-3 shrink-0 text-[var(--status-approved-text)]"
                      />
                    )}
                  </span>
                  <span className={DECISION_CARD.voteBarRowCount}>
                    {option.count} ({percentFormatter.format(share)})
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="text-xs text-muted-foreground">
        {t('item.meetingVoteTotal', { count: totalVotes })}
      </div>
    </div>
  );
}
