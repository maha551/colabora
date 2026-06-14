/**
 * Calendar API client — Phase 1 Calendar Frontend
 * Backend: GET /api/calendar, GET /api/calendar/ical, GET /api/calendar/ical/subscribe-url
 */

import { apiRequest } from './client';

export interface CalendarEvent {
  id: string;
  type: string;
  title: string;
  start: string;
  end: string;
  organizationId: string;
  documentId?: string;
  electionId?: string;
  meetingId?: string;
  /** Set for events of type scheduling_poll_finalized */
  schedulingPollId?: string;
  link?: string;
  description?: string;
  location?: string;
  meetingLink?: string;
  organizationName?: string;
}

export interface CalendarEventsResponse {
  events: CalendarEvent[];
}

export interface CalendarSubscribeUrlResponse {
  url: string;
  expiresAt?: string;
}

export type CalendarExportRange = 'this_month' | 'next_3_months' | 'next_12_months';

/**
 * Fetch calendar events for a date range, optionally scoped to an organization.
 */
export async function getCalendarEvents(
  organizationId: string | undefined,
  from: string,
  to: string,
  meetingId?: string
): Promise<CalendarEventsResponse> {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (organizationId) {
    params.set('organizationId', organizationId);
  }
  if (meetingId) {
    params.set('meetingId', meetingId);
  }
  const query = params.toString();
  return apiRequest<CalendarEventsResponse>(`/api/calendar${query ? `?${query}` : ''}`);
}

/**
 * Get a subscription URL (with long-lived token) for use in calendar clients.
 */
export async function getCalendarSubscribeUrl(
  organizationId?: string
): Promise<CalendarSubscribeUrlResponse> {
  const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  return apiRequest<CalendarSubscribeUrlResponse>(`/api/calendar/ical/subscribe-url${query}`);
}

/**
 * Build same-origin URL for downloading iCal (browser sends cookies).
 */
export function getCalendarIcalDownloadUrl(
  organizationId: string | undefined,
  from: string,
  to: string,
  meetingId?: string
): string {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (organizationId) {
    params.set('organizationId', organizationId);
  }
  if (meetingId) {
    params.set('meetingId', meetingId);
  }
  return `/api/calendar/ical?${params.toString()}`;
}

/**
 * Build URL for downloading a single meeting as iCal.
 */
export function getMeetingIcalDownloadUrl(
  organizationId: string,
  meetingId: string,
  scheduledAt: string,
  endAt?: string | null
): string {
  const start = new Date(scheduledAt);
  const from = new Date(start);
  from.setDate(from.getDate() - 1);
  const end = endAt ? new Date(endAt) : new Date(start);
  const to = new Date(end);
  to.setDate(to.getDate() + 1);
  return getCalendarIcalDownloadUrl(
    organizationId,
    from.toISOString(),
    to.toISOString(),
    meetingId
  );
}

/**
 * Compute from/to ISO strings for export range presets.
 */
export function getCalendarExportRangeDates(
  range: CalendarExportRange,
  monthAnchor: Date = new Date()
): { from: string; to: string } {
  const from = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  let to: Date;

  switch (range) {
    case 'next_3_months':
      to = new Date(from.getFullYear(), from.getMonth() + 3, 0, 23, 59, 59, 999);
      break;
    case 'next_12_months': {
      const now = new Date();
      to = new Date(now);
      to.setFullYear(to.getFullYear() + 1);
      to.setHours(23, 59, 59, 999);
      if (from < now) {
        from.setTime(now.getTime());
        from.setHours(0, 0, 0, 0);
      }
      break;
    }
    case 'this_month':
    default:
      to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

export function toWebcalUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https?:/, 'webcal:');
}

export const calendarApi = {
  getCalendarEvents,
  getCalendarSubscribeUrl,
  getCalendarIcalDownloadUrl,
  getMeetingIcalDownloadUrl,
  getCalendarExportRangeDates,
  toWebcalUrl,
};
