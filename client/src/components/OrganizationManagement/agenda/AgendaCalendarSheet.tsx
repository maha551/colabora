import React, { memo, useMemo, useState } from 'react';
import type { CalendarEventHandlers } from '../../../lib/calendar/eventPresentation';
import type { CalendarEvent } from '../../../lib/api/calendar';
import { AgendaCalendarSheetFront } from './AgendaCalendarSheetFront';
import { AgendaCalendarSheetBack } from './AgendaCalendarSheetBack';
import { AgendaSheetFlip, useCoarsePointer } from './AgendaSheetFlip';
import { isEventToday, type SheetVariant } from './agendaSheetUtils';

export interface AgendaCalendarSheetProps {
  ev: CalendarEvent;
  variant?: SheetVariant;
  showJoin?: boolean;
  handlers: CalendarEventHandlers;
  pinnedEventId?: string | null;
  canPin: boolean;
  onPin?: (eventId: string) => Promise<void>;
  onUnpin?: () => Promise<void>;
  onNavigateToSchedule?: () => void;
  timezone: string;
  locale: string;
  formatRelativeTime: (date: string) => string;
  formatDateTime: (date: string, options?: Intl.DateTimeFormatOptions) => string;
}

export const AgendaCalendarSheet = memo(function AgendaCalendarSheet({
  ev,
  variant = 'default',
  showJoin,
  handlers,
  pinnedEventId,
  canPin,
  onPin,
  onUnpin,
  onNavigateToSchedule,
  timezone,
  locale,
  formatRelativeTime,
  formatDateTime,
}: AgendaCalendarSheetProps) {
  const coarsePointer = useCoarsePointer();
  const [flipped, setFlipped] = useState(false);
  const isToday = useMemo(
    () => isEventToday(ev.start, Date.now(), timezone),
    [ev.start, timezone]
  );

  const formatRelative = (date: Date | string | undefined | null) =>
    formatRelativeTime(typeof date === 'string' ? date : date?.toString() ?? '');

  const formatDateTimeWrapped = (
    date: Date | string | undefined | null,
    options?: Intl.DateTimeFormatOptions
  ) => formatDateTime(typeof date === 'string' ? date : date?.toString() ?? '', options);

  const front = (
    <AgendaCalendarSheetFront
      ev={ev}
      variant={variant}
      showJoin={showJoin}
      timezone={timezone}
      locale={locale}
      formatRelativeTime={formatRelative}
      formatDateTime={formatDateTimeWrapped}
      handlers={handlers}
      pinnedEventId={pinnedEventId}
      canPin={canPin}
      onPin={onPin}
      onUnpin={onUnpin}
      coarsePointer={coarsePointer}
      flipped={flipped}
      showFlipToggle={coarsePointer}
      onToggleFlip={() => setFlipped((f) => !f)}
    />
  );

  const back = (
    <AgendaCalendarSheetBack
      ev={ev}
      variant={variant}
      showJoin={showJoin}
      formatDateTime={formatDateTimeWrapped}
      handlers={handlers}
      pinnedEventId={pinnedEventId}
      canPin={canPin}
      onPin={onPin}
      onUnpin={onUnpin}
      onNavigateToSchedule={onNavigateToSchedule}
    />
  );

  return (
    <AgendaSheetFlip
      ariaLabel={ev.title}
      front={front}
      back={back}
      isToday={isToday}
      flipped={coarsePointer ? flipped : undefined}
      onFlippedChange={coarsePointer ? setFlipped : undefined}
      showTouchToggle={coarsePointer}
    />
  );
});
