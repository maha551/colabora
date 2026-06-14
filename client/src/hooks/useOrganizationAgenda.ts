import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCalendar } from './useCalendar';
import { schedulingApi } from '../lib/api';
import type { CalendarEvent } from '../lib/api/calendar';
import {
  getAgendaFetchRange,
  partitionAgendaEvents,
  AGENDA_UPCOMING_LIMIT_DESKTOP,
  AGENDA_UPCOMING_LIMIT_MOBILE,
} from '../lib/calendar/agendaUtils';
import { useRelativeTimeTick } from './useRelativeTimeTick';

interface UseOrganizationAgendaOptions {
  organizationId: string;
  enabled: boolean;
  pinnedEventId?: string | null;
  overviewPinnedEvent?: CalendarEvent | null;
  upcomingLimit?: number;
}

export function useOrganizationAgenda({
  organizationId,
  enabled,
  pinnedEventId,
  overviewPinnedEvent,
  upcomingLimit = AGENDA_UPCOMING_LIMIT_DESKTOP,
}: UseOrganizationAgendaOptions) {
  const range = useMemo(() => getAgendaFetchRange(), [enabled]);
  const { events, isLoading: calendarLoading, error: calendarError, refresh: refreshCalendar } = useCalendar(
    organizationId,
    range.from,
    range.to,
    enabled
  );

  const [openPollCount, setOpenPollCount] = useState(0);
  const [pollsLoading, setPollsLoading] = useState(false);
  const [pollsError, setPollsError] = useState<string | null>(null);

  const fetchPolls = useCallback(async () => {
    if (!enabled || !organizationId) return;
    setPollsLoading(true);
    setPollsError(null);
    try {
      const res = await schedulingApi.listSchedulingPolls(organizationId);
      const openPolls = (res.polls ?? []).filter(
        (p) => p.status === 'open' || p.status === 'closed'
      );
      setOpenPollCount(openPolls.length);
    } catch (err) {
      setPollsError(err instanceof Error ? err.message : 'Failed to load polls');
      setOpenPollCount(0);
    } finally {
      setPollsLoading(false);
    }
  }, [enabled, organizationId]);

  useEffect(() => {
    if (!enabled) {
      setOpenPollCount(0);
      setPollsError(null);
      setPollsLoading(false);
      return;
    }
    fetchPolls();
  }, [enabled, fetchPolls]);

  const nowTick = useRelativeTimeTick();

  const partitioned = useMemo(() => {
    const now = new Date(nowTick);
    return partitionAgendaEvents(events, now, {
      pinnedEventId,
      pinnedEvent: overviewPinnedEvent,
      upcomingLimit,
    });
  }, [events, pinnedEventId, overviewPinnedEvent, upcomingLimit, nowTick]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshCalendar(), fetchPolls()]);
  }, [refreshCalendar, fetchPolls]);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [enabled, refresh]);

  const isLoading = calendarLoading || pollsLoading;
  const error = calendarError || pollsError;

  const hasContent =
    partitioned.live.length > 0 ||
    partitioned.pinned !== null ||
    partitioned.upcoming.length > 0 ||
    openPollCount > 0;

  return {
    ...partitioned,
    openPollCount,
    isLoading,
    error,
    hasContent,
    refresh,
  };
}

export { AGENDA_UPCOMING_LIMIT_DESKTOP, AGENDA_UPCOMING_LIMIT_MOBILE };
