import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/card';
import { useTimezone } from '../../hooks/useTimezone';
import { Button } from '../ui/button';
import { SPACING, COLORS, NAVIGATION, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import type { MeetingVote, MeetingVoteOption } from '../../lib/api/types/meetingMinutes';
import { meetingVotesApi } from '../../lib/api';
import { toast } from 'sonner';

interface MeetingVoteCardProps {
  vote: MeetingVote;
  organizationId: string;
  meetingId: string;
  currentUserId: string;
  onVoteCast?: () => void;
}

function getOptionLabel(options: MeetingVoteOption[] | undefined, optionId: string): string {
  const opt = options?.find((o) => o.id === optionId);
  return opt?.label ?? optionId;
}

function getCount(responseCounts: { optionId: string; count: number }[] | undefined, optionId: string): number {
  const r = responseCounts?.find((c) => c.optionId === optionId);
  return r?.count ?? 0;
}

export function MeetingVoteCard({
  vote,
  organizationId,
  meetingId,
  currentUserId,
  onVoteCast,
}: MeetingVoteCardProps) {
  const { t } = useTranslation('organization');
  const { formatDateTime } = useTimezone();
  const [casting, setCasting] = useState(false);
  const options = vote.options ?? [];
  const responseCounts = vote.responseCounts ?? [];
  const userResponse = vote.responses?.find((r) => r.userId === currentUserId);
  const isOpen = vote.status === 'open';
  const totalVotes = responseCounts.reduce((s, r) => s + r.count, 0);

  const handleCastVote = async (optionId: string) => {
    setCasting(true);
    try {
      await meetingVotesApi.castVote(organizationId, meetingId, vote.id, { optionId });
      toast.success(t('voteRecorded'));
      onVoteCast?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('failedToVote');
      toast.error(msg);
    } finally {
      setCasting(false);
    }
  };

  return (
    <Card className={cn(SPACING.card.base, SPACING.card.padding)}>
      <div className={cn(SPACING.content.gap)}>
        <div className={cn(SPACING.tight.gap)}>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={cn(NAVIGATION.typography.navItem, 'text-foreground')}>{vote.title}</h4>
            {!isOpen && totalVotes > 0 && (
              <span className={cn(COLORS.text.hint, 'text-xs')}>{t('voteCount', { count: totalVotes })}</span>
            )}
          </div>
          <p className={cn(COLORS.text.secondary, 'text-sm')}>
            {isOpen ? t('vote') : t('voteCompleted')}
          </p>
          <p className={cn(COLORS.text.hint, 'text-xs')}>
            {t('voteStartedAt', { time: formatDateTime(vote.createdAt) })}
            {vote.closedAt != null && ` · ${t('voteClosedAt', { time: formatDateTime(vote.closedAt) })}`}
          </p>
        </div>

        {isOpen ? (
          <>
            {userResponse ? (
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 text-xs font-medium', RADIUS.control,
                  'bg-primary/10 text-primary border border-primary/20'
                )}
                role="status"
              >
                {t('youVotedFor', { option: getOptionLabel(options, userResponse.optionId) })}
              </span>
            ) : (
              <div className={cn(SPACING.tight.gap)} role="group" aria-label={t('voteOptionGroupLabel', { title: vote.title })}>
                <p className={cn(COLORS.text.hint, 'text-xs')}>{t('chooseOption')}</p>
                <div className={cn(SPACING.tight.inline, 'flex flex-wrap gap-2')}>
                  {options.map((opt) => (
                    <Button
                      key={opt.id}
                      size="sm"
                      variant="outline"
                      disabled={casting}
                      onClick={() => handleCastVote(opt.id)}
                      aria-pressed={userResponse?.optionId === opt.id}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={cn(SPACING.tight.gap)}>
            {options.length === 0 ? (
              <p className={cn(COLORS.text.hint, 'text-sm')}>{t('noOptions')}</p>
            ) : (
              <>
                {/* Progress bars: one row per option */}
                <div className={cn(SPACING.tight.gap, 'w-full')} role="img" aria-label="Vote results by option">
                  {options.map((opt, idx) => {
                    const count = getCount(responseCounts, opt.id);
                    const total = responseCounts.reduce((s, r) => s + r.count, 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    const chartVar = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'][idx % 5];
                    return (
                      <div key={opt.id} className={cn(SPACING.tight.gap, 'w-full')}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(COLORS.text.secondary, 'text-sm truncate flex-1 min-w-0')}>
                            {opt.label}
                          </span>
                          <span className={cn(COLORS.text.primary, 'text-sm tabular-nums shrink-0')}>
                            {count} {total > 0 ? `(${Math.round(pct)}%)` : ''}
                          </span>
                        </div>
                        <div
                          className={cn("h-2 w-full overflow-hidden", RADIUS.inline)}
                          style={{ backgroundColor: 'var(--vote-background)' }}
                          role="presentation"
                        >
                          <div
                            className={cn("h-full transition-all duration-300", RADIUS.inline)}
                            style={{
                              width: `${pct}%`,
                              minWidth: pct > 0 ? 4 : 0,
                              backgroundColor: `var(${chartVar})`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Text list for accessibility / screen readers */}
                <ul className={cn(SPACING.tight.gap, 'sr-only')}>
                  {options.map((opt) => {
                    const count = getCount(responseCounts, opt.id);
                    const total = responseCounts.reduce((s, r) => s + r.count, 0);
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <li key={opt.id}>
                        {opt.label}: {count} {pct > 0 ? `(${pct}%)` : ''}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {userResponse && (
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 text-xs font-medium', RADIUS.control,
                  'bg-primary/10 text-primary border border-primary/20'
                )}
                role="status"
              >
                {t('youVotedFor', { option: getOptionLabel(options, userResponse.optionId) })}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
