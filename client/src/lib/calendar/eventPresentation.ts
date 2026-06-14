import type { CalendarEvent } from '../api/calendar';

export interface CalendarEventHandlers {
  onNavigateToMeeting?: (meetingId: string, preferEmbed?: boolean) => void;
  onNavigateToPoll?: (pollId: string) => void;
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToRepresentatives?: () => void;
}

/** Icon name for calendar event type (Lucide). */
export function getCalendarEventIcon(ev: CalendarEvent): string {
  if (ev.meetingId || ev.type === 'meeting') return 'Video';
  if (ev.schedulingPollId || ev.type === 'scheduling_poll_finalized') return 'Clock';
  if (ev.documentId || (ev.type && ev.type.startsWith('document_'))) return 'FileText';
  if (ev.electionId || (ev.type && ev.type.startsWith('election_'))) return 'UserCheck';
  return 'Calendar';
}

export function navigateCalendarEvent(ev: CalendarEvent, handlers: CalendarEventHandlers): void {
  if (ev.meetingId && handlers.onNavigateToMeeting) {
    handlers.onNavigateToMeeting(ev.meetingId);
    return;
  }
  if (ev.schedulingPollId && handlers.onNavigateToPoll) {
    handlers.onNavigateToPoll(ev.schedulingPollId);
    return;
  }
  if (ev.documentId && handlers.onNavigateToDocument) {
    handlers.onNavigateToDocument(ev.documentId);
  } else if (ev.electionId && handlers.onNavigateToRepresentatives) {
    handlers.onNavigateToRepresentatives();
  }
}

export function isCalendarEventClickable(ev: CalendarEvent): boolean {
  return !!(ev.documentId || ev.electionId || ev.meetingId || ev.schedulingPollId);
}
