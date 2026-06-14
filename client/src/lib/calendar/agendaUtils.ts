import type { CalendarEvent } from '../api/calendar';

export const LIVE_MEETING_GRACE_MS = 2 * 60 * 60 * 1000;
export const AGENDA_LOOKBACK_MS = 4 * 60 * 60 * 1000;
export const AGENDA_LOOKAHEAD_DAYS = 14;
export const AGENDA_UPCOMING_LIMIT_DESKTOP = 4;
export const AGENDA_UPCOMING_LIMIT_MOBILE = 3;

export function isEventLive(ev: CalendarEvent, now: Date): boolean {
  const start = new Date(ev.start);
  const end = new Date(ev.end || ev.start);
  if (Number.isNaN(start.getTime())) return false;

  if (ev.type === 'meeting' || ev.meetingId) {
    const effectiveEnd =
      ev.end && ev.end !== ev.start
        ? end
        : new Date(start.getTime() + LIVE_MEETING_GRACE_MS);
    return start <= now && now <= effectiveEnd;
  }

  return start <= now && now <= end;
}

export function partitionAgendaEvents(
  events: CalendarEvent[],
  now: Date,
  options: {
    pinnedEventId?: string | null;
    pinnedEvent?: CalendarEvent | null;
    upcomingLimit?: number;
  } = {}
): {
  live: CalendarEvent[];
  pinned: CalendarEvent | null;
  upcoming: CalendarEvent[];
} {
  const { pinnedEventId, pinnedEvent, upcomingLimit = AGENDA_UPCOMING_LIMIT_DESKTOP } = options;

  const byId = new Map<string, CalendarEvent>();
  for (const ev of events) {
    byId.set(ev.id, ev);
  }
  if (pinnedEvent && pinnedEventId) {
    byId.set(pinnedEvent.id, pinnedEvent);
  }

  const allEvents = Array.from(byId.values());
  const live = allEvents.filter((ev) => isEventLive(ev, now));
  const liveIds = new Set(live.map((ev) => ev.id));

  let pinned: CalendarEvent | null = null;
  if (pinnedEventId) {
    pinned = byId.get(pinnedEventId) ?? pinnedEvent ?? null;
  }

  const excludedIds = new Set(liveIds);
  if (pinned?.id) excludedIds.add(pinned.id);

  const upcoming = allEvents
    .filter((ev) => {
      if (excludedIds.has(ev.id)) return false;
      const start = new Date(ev.start);
      return !Number.isNaN(start.getTime()) && start > now;
    })
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, upcomingLimit);

  return { live, pinned, upcoming };
}

/** Fetch range for overview agenda: lookback for live meetings + 14 days ahead. */
export function getAgendaFetchRange(now: Date = new Date()): { from: string; to: string } {
  const lookback = new Date(now.getTime() - AGENDA_LOOKBACK_MS);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const from = lookback < startOfToday ? lookback : startOfToday;

  const to = new Date(now);
  to.setDate(to.getDate() + AGENDA_LOOKAHEAD_DAYS);
  to.setHours(23, 59, 59, 999);

  return { from: from.toISOString(), to: to.toISOString() };
}
