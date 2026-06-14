import { useState, useEffect, useCallback } from 'react';
import { calendarApi, type CalendarEvent } from '../lib/api/calendar';

/**
 * Load calendar events when enabled.
 * When enabled is false, does not fetch (returns empty events, idle).
 */
export function useCalendar(
  organizationId: string,
  from: string,
  to: string,
  enabled: boolean
): {
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await calendarApi.getCalendarEvents(organizationId, from, to);
      setEvents(res.events ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load calendar';
      setError(message);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, from, to, enabled]);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    fetchEvents();
  }, [enabled, fetchEvents]);

  return { events, isLoading, error, refresh: fetchEvents };
}
