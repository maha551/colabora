import type { CalendarEvent } from '../../../lib/api/calendar';
import { getCalendarEventIcon } from '../../../lib/calendar/eventPresentation';
import { RADIUS, ELEVATION } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';

export interface SheetDateParts {
  day: string;
  month: string;
  weekday: string;
}

export type SheetVariant = 'live' | 'pinned' | 'default';

export type EventTypeAccent = 'meeting' | 'poll' | 'document' | 'election' | 'default';

export const AGENDA_SHEET_SIZE_CLASSES =
  'min-w-[148px] w-[148px] h-[188px] sm:min-w-[160px] sm:w-[160px] sm:h-[200px]';

/** Alias used by flip/skeleton components (Phase 2 scaffold). */
export const SHEET_SIZE_CLASSES = AGENDA_SHEET_SIZE_CLASSES;

export interface OrderedSheetItem {
  ev: CalendarEvent;
  variant: SheetVariant;
  showJoin?: boolean;
  key: string;
}

export function getSheetDateParts(
  startIso: string,
  timezone: string,
  locale: string
): SheetDateParts {
  const date = new Date(startIso);
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: timezone }).format(date);
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: timezone })
    .format(date)
    .toUpperCase();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: timezone }).format(
    date
  );

  return { day, month, weekday };
}

export function isEventToday(startIso: string, nowMs: number, timezone: string): boolean {
  const dateKey = (instant: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(instant));

  return dateKey(startIso) === dateKey(new Date(nowMs).toISOString());
}

export function getSheetCountdown(
  ev: CalendarEvent,
  now: Date | number,
  formatRelativeTime: (date: Date | string | undefined | null) => string,
  formatDateTime: (
    date: Date | string | undefined | null,
    options?: Intl.DateTimeFormatOptions
  ) => string
): string {
  const nowDate = typeof now === 'number' ? new Date(now) : now;
  const start = new Date(ev.start);
  const diffMs = start.getTime() - nowDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffMs > 0 && diffDays <= 7) {
    return formatRelativeTime(ev.start);
  }

  return formatDateTime(ev.start, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function getSheetVariantClasses(variant: SheetVariant): string {
  return cn(
    RADIUS.control,
    ELEVATION.card,
    'bg-card border relative overflow-hidden flex flex-col h-full',
    variant === 'live' && 'agenda-sheet--live border-primary/40 bg-primary/5',
    variant === 'pinned' && 'border-dashed border-muted-foreground/30 bg-muted/30',
    variant === 'default' && 'border-border agenda-sheet--stacked'
  );
}

export function resolveEventTypeAccent(ev: CalendarEvent): EventTypeAccent {
  switch (getCalendarEventIcon(ev)) {
    case 'Video':
      return 'meeting';
    case 'Clock':
      return 'poll';
    case 'FileText':
      return 'document';
    case 'UserCheck':
      return 'election';
    default:
      return 'default';
  }
}

/** Accent bar / left-edge color class by event type. */
export function getEventTypeAccent(ev: CalendarEvent): string {
  switch (resolveEventTypeAccent(ev)) {
    case 'meeting':
      return 'bg-emerald-500';
    case 'poll':
      return 'bg-amber-500';
    case 'document':
      return 'bg-blue-500';
    case 'election':
      return 'bg-violet-500';
    default:
      return 'bg-muted-foreground/50';
  }
}

export function getEventTypeAccentClass(accent: EventTypeAccent): string {
  switch (accent) {
    case 'meeting':
      return 'bg-emerald-500';
    case 'poll':
      return 'bg-amber-500';
    case 'document':
      return 'bg-blue-500';
    case 'election':
      return 'bg-violet-500';
    default:
      return 'bg-muted-foreground/50';
  }
}

/** Left-edge border accent for Phase 1 flat sheet cards. */
export function getEventTypeAccentBorderClass(ev: CalendarEvent): string {
  switch (resolveEventTypeAccent(ev)) {
    case 'meeting':
      return 'border-l-emerald-500';
    case 'poll':
      return 'border-l-amber-500';
    case 'document':
      return 'border-l-blue-500';
    case 'election':
      return 'border-l-violet-500';
    default:
      return 'border-l-muted-foreground/50';
  }
}

export function buildOrderedSheetItems(
  live: CalendarEvent[],
  pinned: CalendarEvent | null,
  upcoming: CalendarEvent[]
): OrderedSheetItem[] {
  const liveIds = new Set(live.map((ev) => ev.id));
  const items: OrderedSheetItem[] = [];

  for (const ev of live) {
    items.push({
      ev,
      variant: 'live',
      showJoin: !!ev.meetingLink,
      key: ev.id,
    });
  }

  if (pinned && !liveIds.has(pinned.id)) {
    items.push({
      ev: pinned,
      variant: 'pinned',
      key: `pinned-${pinned.id}`,
    });
  }

  const seen = new Set(items.map((item) => item.ev.id));
  for (const ev of upcoming) {
    if (seen.has(ev.id)) continue;
    items.push({
      ev,
      variant: 'default',
      key: ev.id,
    });
    seen.add(ev.id);
  }

  return items;
}
