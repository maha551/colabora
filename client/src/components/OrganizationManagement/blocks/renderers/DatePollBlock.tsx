import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../ui/badge';
import { cn } from '../../../ui/utils';
import { useTimezone } from '../../../../hooks/useTimezone';
import type { DatePollProtocolBlock } from '../protocolBlocks.types';
import { trackProtocolCanvasAnalytics } from '../protocolCanvasAnalytics';
import { protocolUi } from '../protocolUi';

export interface DatePollBlockProps {
  block: DatePollProtocolBlock;
  className?: string;
  viewPollSlot?: React.ReactNode;
  createMeetingSlot?: React.ReactNode;
}

function getPollTitle(block: DatePollProtocolBlock, t: (k: string, o?: { defaultValue?: string }) => string): string {
  const payload = block.event.payload;
  if (!payload || typeof payload !== 'object' || !('title' in payload)) {
    return t('protocolCanvas.datePollDefaultTitle', { defaultValue: 'Date poll' });
  }

  const title = payload.title;
  return typeof title === 'string' && title.trim() ? title.trim() : t('protocolCanvas.datePollDefaultTitle', { defaultValue: 'Date poll' });
}

export function DatePollBlock({ block, className, viewPollSlot, createMeetingSlot }: DatePollBlockProps) {
  const { t } = useTranslation('organization');
  const { formatDate, formatTime, getDateKey } = useTimezone();

  const formatSlotRange = (slot: NonNullable<DatePollProtocolBlock['chosenSlot']>): string => {
    const { startAt, endAt } = slot;
    const startKey = getDateKey(startAt);
    const endKey = getDateKey(endAt);
    if (!startKey || !endKey) {
      return `${startAt} - ${endAt}`;
    }

    if (startKey === endKey) {
      return `${formatDate(startAt)}, ${formatTime(startAt)} – ${formatTime(endAt)}`;
    }

    return `${formatDate(startAt)} ${formatTime(startAt)} – ${formatDate(endAt)} ${formatTime(endAt)}`;
  };
  const title = getPollTitle(block, t);
  const hasChosenSlot = Boolean(block.chosenSlot);
  const statusLabel = hasChosenSlot
    ? t('schedulingStatus_finalized', { defaultValue: 'Finalized' })
    : t('protocolCanvas.pendingFinalSlot', { defaultValue: 'Pending final slot' });

  React.useEffect(() => {
    trackProtocolCanvasAnalytics({ action: 'date_poll_view', blockType: 'date_poll', blockId: block.id });
  }, [block.id]);

  return (
    <section className={cn('space-y-3', className)} aria-label={t('protocolCanvas.datePollSectionLabel', { defaultValue: 'Date poll' })}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className={cn(protocolUi.bodyTitle, 'min-w-[12ch] flex-1')}>{title}</p>
        <Badge
          variant={hasChosenSlot ? 'default' : 'secondary'}
          className={cn('shrink-0', !hasChosenSlot && 'font-normal')}
          aria-label={`${t('protocolCanvas.datePollStatusPrefix', { defaultValue: 'Date poll status' })}: ${statusLabel}`}
        >
          {statusLabel}
        </Badge>
      </div>

      {block.chosenSlot ? (
        <p
          className={cn(protocolUi.bodySubtitle, 'font-semibold text-foreground')}
          aria-label={t('protocolCanvas.chosenSlotLabel', { defaultValue: 'Chosen time slot' })}
        >
          {formatSlotRange(block.chosenSlot)}
        </p>
      ) : (
        <p className={protocolUi.bodySubtitle}>{t('protocolCanvas.noFinalSlot', { defaultValue: 'No final slot selected yet.' })}</p>
      )}

      {viewPollSlot || createMeetingSlot ? (
        <div className={protocolUi.blockActionsRow} aria-label={t('protocolCanvas.datePollActionsLabel', { defaultValue: 'Scheduling actions' })}>
          {viewPollSlot ? <div className="shrink-0">{viewPollSlot}</div> : null}
          {createMeetingSlot ? <div className="shrink-0">{createMeetingSlot}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
