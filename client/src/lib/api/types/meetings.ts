// Meetings API types (Phase 3 backend contract)

import type { Moderator } from './meetingMinutes';

export interface Meeting {
  id: string;
  organizationId: string;
  title: string;
  scheduledAt: string;
  endAt: string | null;
  location: string | null;
  meetingLink: string | null;
  meetingProvider: string | null;
  createdByUserId: string;
  createdFromSchedulingPollId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Minutes document id (set when meeting is created). */
  minutesDocumentId?: string | null;
  /** When minutes were finalized. */
  minutesFinalizedAt?: string | null;
  /** Creator + org reps + invited moderators. */
  moderators?: Moderator[];
  /** Current agenda item id (active topic in meeting). */
  currentAgendaItemId?: string | null;
}

export interface MeetingsListResponse {
  meetings: Meeting[];
}
