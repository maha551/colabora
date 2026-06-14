import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../ui/utils';
import { SPACING } from '../../../lib/designSystem';
import { Icon } from '../../ui/Icon';
import type { CalendarEventHandlers } from '../../../lib/calendar/eventPresentation';
import type { CalendarEvent } from '../../../lib/api/calendar';
import { AgendaCalendarSheet } from './AgendaCalendarSheet';
import { buildOrderedSheetItems } from './agendaSheetUtils';

export interface AgendaCalendarStripProps {
  live: CalendarEvent[];
  pinned: CalendarEvent | null;
  upcoming: CalendarEvent[];
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

export function AgendaCalendarStrip({
  live,
  pinned,
  upcoming,
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
}: AgendaCalendarStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setShowFade(false);
      return;
    }
    const hasOverflow = el.scrollWidth > el.clientWidth + 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setShowFade(hasOverflow && !atEnd);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateFade();

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            updateFade();
          })
        : null;

    ro?.observe(el);
    el.addEventListener('scroll', updateFade, { passive: true });
    window.addEventListener('resize', updateFade);

    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', updateFade);
      window.removeEventListener('resize', updateFade);
    };
  }, [updateFade]);

  const sheets = useMemo(
    () => buildOrderedSheetItems(live, pinned, upcoming),
    [live, pinned, upcoming]
  );

  useEffect(() => {
    updateFade();
  }, [sheets.length, updateFade]);

  const centerCards = sheets.length <= 2;

  return (
    <div className={cn('relative', SPACING.layout.containScroll)} data-testid="agenda-calendar-strip">
      <div
        ref={scrollRef}
        className={cn(
          'flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-1 px-1',
          '[scrollbar-width:thin]',
          centerCards && 'justify-center'
        )}
        role="list"
      >
        {sheets.map(({ ev, variant, showJoin, key }) => (
          <div key={key} role="listitem" className="contents">
            <AgendaCalendarSheet
              ev={ev}
              variant={variant}
              showJoin={showJoin}
              handlers={handlers}
              pinnedEventId={pinnedEventId}
              canPin={canPin}
              onPin={onPin}
              onUnpin={onUnpin}
              onNavigateToSchedule={onNavigateToSchedule}
              timezone={timezone}
              locale={locale}
              formatRelativeTime={formatRelativeTime}
              formatDateTime={formatDateTime}
            />
          </div>
        ))}
      </div>

      {showFade && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-card to-transparent pr-1"
          aria-hidden
        >
          <Icon name="ChevronRight" className="h-4 w-4 text-muted-foreground/80" />
        </div>
      )}
    </div>
  );
}
