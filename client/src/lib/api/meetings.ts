/**
 * Meetings API client (Phase 3 frontend).
 * Backend: /api/organizations/:organizationId/meetings
 */

import { apiRequest } from './client';
import type { Meeting, MeetingsListResponse } from './types/meetings';

const base = (organizationId: string) => `/api/organizations/${organizationId}/meetings`;

export interface CreateMeetingPayload {
  title: string;
  scheduled_at: string;
  end_at?: string | null;
  location?: string | null;
  createRoom?: boolean;
}

export interface CreateMeetingFromPollPayload {
  title?: string | null;
  createRoom?: boolean;
}

export interface UpdateMeetingPayload {
  title?: string;
  scheduled_at?: string;
  end_at?: string | null;
  location?: string | null;
  meeting_link?: string | null;
}

export const meetingsApi = {
  listMeetings(
    organizationId: string,
    params?: { from?: string; to?: string }
  ): Promise<MeetingsListResponse> {
    const search = new URLSearchParams();
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    const query = search.toString();
    return apiRequest<MeetingsListResponse>(
      `${base(organizationId)}${query ? `?${query}` : ''}`
    );
  },

  getMeeting(organizationId: string, meetingId: string): Promise<Meeting> {
    return apiRequest<Meeting>(`${base(organizationId)}/${meetingId}`);
  },

  createMeeting(
    organizationId: string,
    payload: CreateMeetingPayload
  ): Promise<Meeting> {
    return apiRequest<Meeting>(base(organizationId), {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        scheduled_at: payload.scheduled_at,
        ...(payload.end_at != null && { end_at: payload.end_at }),
        ...(payload.location != null && { location: payload.location }),
        ...(payload.createRoom != null && { createRoom: payload.createRoom }),
      }),
    });
  },

  createMeetingFromPoll(
    organizationId: string,
    pollId: string,
    payload: CreateMeetingFromPollPayload
  ): Promise<Meeting> {
    return apiRequest<Meeting>(
      `${base(organizationId)}/from-scheduling-poll/${pollId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...(payload.title != null && payload.title !== '' && { title: payload.title }),
          ...(payload.createRoom != null && { createRoom: payload.createRoom }),
        }),
      }
    );
  },

  updateMeeting(
    organizationId: string,
    meetingId: string,
    payload: UpdateMeetingPayload
  ): Promise<Meeting> {
    return apiRequest<Meeting>(`${base(organizationId)}/${meetingId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...(payload.title !== undefined && { title: payload.title }),
        ...(payload.scheduled_at !== undefined && { scheduled_at: payload.scheduled_at }),
        ...(payload.end_at !== undefined && { end_at: payload.end_at }),
        ...(payload.location !== undefined && { location: payload.location }),
        ...(payload.meeting_link !== undefined && { meeting_link: payload.meeting_link }),
      }),
    });
  },

  createRoom(organizationId: string, meetingId: string): Promise<Meeting> {
    return apiRequest<Meeting>(`${base(organizationId)}/${meetingId}/create-room`, {
      method: 'POST',
    });
  },

  /** List meetings that have a minutes document (for Documents tab "Meeting minutes" section). */
  listMinutesDocuments(organizationId: string): Promise<MinutesDocumentsResponse> {
    return apiRequest<MinutesDocumentsResponse>(
      `${base(organizationId)}/minutes-documents`
    );
  },
};

export interface MinutesDocumentEntry {
  meetingId: string;
  meetingTitle: string;
  documentId: string;
  minutesFinalizedAt: string | null;
}

export interface MinutesDocumentsResponse {
  minutesDocuments: MinutesDocumentEntry[];
}
