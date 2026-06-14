import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../ui/button';
import { Icon } from '../../../ui/Icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../ui/alert-dialog';
import { cn } from '../../../ui/utils';
import { toast } from 'sonner';
import type { VoteProtocolBlock } from '../protocolBlocks.types';
import { trackProtocolCanvasAnalytics } from '../protocolCanvasAnalytics';
import { protocolUi } from '../protocolUi';
import { RADIUS } from '../../../../lib/designSystem';

interface VoteOptionView {
  id: string;
  label: string;
  count: number;
}

export interface VoteBlockProps {
  block: VoteProtocolBlock;
  className?: string;
  organizationId?: string;
  meetingId?: string;
  onCastVote?: (voteId: string) => void;
  onCloseVote?: (voteId: string) => void;
}

function getPayloadTitle(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('title' in payload)) {
    return null;
  }

  const title = payload.title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

function getPayloadOptions(payload: unknown): { id?: string; label: string }[] {
  if (!payload || typeof payload !== 'object' || !('options' in payload)) {
    return [];
  }

  const options = payload.options;
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option) => {
      if (!option || typeof option !== 'object') {
        return null;
      }

      const label = 'label' in option ? option.label : null;
      const id = 'id' in option ? option.id : undefined;

      if (typeof label !== 'string' || !label.trim()) {
        return null;
      }

      return {
        id: typeof id === 'string' && id.trim() ? id : undefined,
        label: label.trim(),
      };
    })
    .filter((option): option is { id?: string; label: string } => option !== null);
}

function buildOptionRows(block: VoteProtocolBlock): VoteOptionView[] {
  const counts = new Map<string, number>();
  for (const entry of block.vote?.responseCounts ?? []) {
    if (!entry?.optionId) {
      continue;
    }
    counts.set(entry.optionId, entry.count ?? 0);
  }

  const voteOptions = (block.vote?.options ?? []).map((option) => ({
    id: option.id,
    label: option.label?.trim() || 'Untitled option',
    count: counts.get(option.id) ?? 0,
  }));

  if (voteOptions.length > 0) {
    return voteOptions;
  }

  const payloadOptions = getPayloadOptions(block.event.payload);
  return payloadOptions.map((option, index) => {
    const optionId = option.id ?? `payload-option-${index}`;
    return {
      id: optionId,
      label: option.label,
      count: option.id ? counts.get(option.id) ?? 0 : 0,
    };
  });
}

function VoteOptionList({
  options,
  totalVotes,
  resolvedStatus,
  canCastVote,
  castingOptionId,
  percentFormatter,
  onCastVote,
  t,
}: {
  options: VoteOptionView[];
  totalVotes: number;
  resolvedStatus: string;
  canCastVote: boolean;
  castingOptionId: string | null;
  percentFormatter: Intl.NumberFormat;
  onCastVote: (optionId: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const isClosed = resolvedStatus !== 'open';
  const maxCount = Math.max(...options.map((o) => o.count));
  const hasWinner = isClosed && totalVotes > 0 && options.filter((o) => o.count === maxCount).length < options.length;

  return (
    <ul className="space-y-2" role="list" aria-label={t('protocolCanvas.voteOptionsList', { defaultValue: 'Vote options' })}>
      {options.map((option) => {
        const shareRatio = totalVotes > 0 ? option.count / totalVotes : 0;
        const percentText = percentFormatter.format(shareRatio);
        const percentDisplay = t('protocolCanvas.voteOptionPercent', {
          percent: percentText,
          defaultValue: '{{percent}}',
        });
        const rowAriaLabel = t('protocolCanvas.voteOptionRowAria', {
          label: option.label,
          count: option.count,
          percent: percentText,
          defaultValue: '{{label}}, {{count}} votes, {{percent}}',
        });
        const barWidthPercent = shareRatio * 100;
        const isWinner = hasWinner && option.count === maxCount;
        return (
          <li
            key={option.id}
            className={cn("relative overflow-hidden border border-border/60 bg-muted/15 px-3 py-2.5", RADIUS.panel)}
            aria-label={rowAriaLabel}
          >
            <div
              className={cn(
                'pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-300 ease-out',
                isWinner ? 'bg-[var(--vote-pro,theme(colors.green.500))]/25' : isClosed ? 'bg-primary/10' : 'bg-primary/20',
              )}
              style={{ width: `${barWidthPercent}%` }}
              aria-hidden
            />
            <div className="relative z-[1] flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="min-w-0 text-sm text-foreground">{option.label}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{percentDisplay}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums text-xs font-medium text-muted-foreground">{option.count}</span>
                {isWinner && (
                  <Icon name="CheckCircle2" className="h-4 w-4 text-[var(--status-approved-text)]" />
                )}
                {canCastVote && (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className={protocolUi.blockActionBtn}
                    disabled={castingOptionId !== null}
                    onClick={() => void onCastVote(option.id)}
                  >
                    {castingOptionId === option.id ? t('saving', { defaultValue: 'Saving\u2026' }) : t('castVote', { defaultValue: 'Cast' })}
                  </Button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function VoteBlock({ block, className, organizationId, meetingId, onCastVote, onCloseVote }: VoteBlockProps) {
  const { t, i18n } = useTranslation('organization');
  const percentFormatter = React.useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }),
    [i18n.language],
  );
  const [castingOptionId, setCastingOptionId] = React.useState<string | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);
  const voteId = block.vote?.id ?? null;
  const title =
    block.vote?.title?.trim() ||
    getPayloadTitle(block.event.payload) ||
    t('protocolCanvas.untitledVote', { defaultValue: 'Untitled vote' });
  const options = buildOptionRows(block);
  const hasVotePayload = Boolean(block.vote);
  const resolvedStatus = block.vote?.status ?? (block.status === 'open' ? 'open' : 'closed');
  const totalVotes = options.reduce((sum, option) => sum + option.count, 0);
  const summary =
    resolvedStatus === 'open'
      ? t('protocolCanvas.voteSummaryOpen', {
          optionCount: options.length,
          voteCount: totalVotes,
          defaultValue: '{{optionCount}} option(s), {{voteCount}} vote(s) cast so far.',
        })
      : t('protocolCanvas.voteSummaryClosed', {
          optionCount: options.length,
          voteCount: totalVotes,
          defaultValue: '{{optionCount}} option(s), {{voteCount}} total vote(s).',
        });
  const canCastVote = Boolean(onCastVote && voteId && organizationId && meetingId && resolvedStatus === 'open');
  const canCloseVote = Boolean(onCloseVote && voteId && resolvedStatus === 'open');

  const handleCastVote = async (optionId: string) => {
    if (!voteId || !organizationId || !meetingId || !onCastVote) {
      return;
    }
    setCastingOptionId(optionId);
      try {
        const { meetingVotesApi } = await import('../../../../lib/api/meetingVotes');
        const response = await meetingVotesApi.castVote(organizationId, meetingId, voteId, { optionId });
        const { extractVoteReceipt, saveReceiptLocally } = await import('../../../../lib/verification/voteReceipt');
        const payload = extractVoteReceipt(response);
        if (payload && organizationId) {
          saveReceiptLocally('meeting-local', organizationId, {
            ...payload,
            organizationId,
            contestTitle: title,
          });
        }
        toast.success(t('voteRecorded', { defaultValue: 'Vote recorded.' }));
      trackProtocolCanvasAnalytics({
        action: 'vote_cast',
        blockType: 'vote',
        blockId: block.id,
        meetingId,
      });
      onCastVote(voteId);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('failedToVote', { defaultValue: 'Failed to cast vote.' });
      toast.error(message);
    } finally {
      setCastingOptionId(null);
    }
  };

  const confirmCloseVote = () => {
    if (!voteId || !onCloseVote) return;
    trackProtocolCanvasAnalytics({
      action: 'vote_close',
      blockType: 'vote',
      blockId: block.id,
      meetingId,
    });
    onCloseVote(voteId);
    setCloseDialogOpen(false);
    toast.success(t('protocolCanvas.voteCloseQueued', { defaultValue: 'Closing vote…' }));
  };

  return (
    <section className={cn('space-y-3', className)} aria-label="Vote block content">
      <div className="space-y-1">
        <p className={protocolUi.bodyTitle}>{title}</p>
        <p className={protocolUi.bodySubtitle}>{summary}</p>
      </div>

      {options.length > 0 ? (
        <VoteOptionList
          options={options}
          totalVotes={totalVotes}
          resolvedStatus={resolvedStatus}
          canCastVote={canCastVote}
          castingOptionId={castingOptionId}
          percentFormatter={percentFormatter}
          onCastVote={handleCastVote}
          t={t}
        />
      ) : (
        <div
          className={cn(
            protocolUi.surfaceMuted,
            'flex flex-col items-center justify-center border-dashed bg-muted/20 p-8 text-center',
            protocolUi.body,
          )}
          role="status"
        >
          <Icon name="Vote" className="mb-2 h-8 w-8 text-muted-foreground/40" />
          {t('protocolCanvas.noVoteOptions', { defaultValue: 'No vote options available yet.' })}
        </div>
      )}

      {!hasVotePayload && (
        <p className={protocolUi.meta}>
          {t('protocolCanvas.votePayloadFallback', {
            defaultValue: 'Vote details are still loading. Showing safe fallback from the timeline event.',
          })}
        </p>
      )}

      {onCloseVote && (
        <>
          <div className={protocolUi.blockActionsRow}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={protocolUi.blockActionBtn}
              disabled={!canCloseVote}
              onClick={() => setCloseDialogOpen(true)}
            >
              {t('closeVote', { defaultValue: 'Close vote' })}
            </Button>
          </div>
          <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('protocolCanvas.closeVoteTitle', { defaultValue: 'Close this vote?' })}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('protocolCanvas.closeVoteDescription', {
                    defaultValue: 'Participants will no longer be able to cast or change votes.',
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
                <AlertDialogAction onClick={confirmCloseVote}>{t('closeVote', { defaultValue: 'Close vote' })}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  );
}
