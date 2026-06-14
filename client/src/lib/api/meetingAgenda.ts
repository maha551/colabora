/**
 * Meeting agenda API client.
 * Backend: /api/organizations/:organizationId/meetings/:meetingId/agenda and /current-topic
 */

import { apiRequest } from './client';
import type {
  MeetingAgendaItem,
  AgendaListResponse,
  ReorderAgendaPayload,
} from './types/meetingAgenda';

const base = (organizationId: string, meetingId: string) =>
  `/api/organizations/${organizationId}/meetings/${meetingId}`;

export const meetingAgendaApi = {
  list(organizationId: string, meetingId: string): Promise<AgendaListResponse> {
    return apiRequest<AgendaListResponse>(`${base(organizationId, meetingId)}/agenda`);
  },

  create(
    organizationId: string,
    meetingId: string,
    payload: { title: string; orderIndex?: number }
  ): Promise<MeetingAgendaItem> {
    return apiRequest<MeetingAgendaItem>(`${base(organizationId, meetingId)}/agenda`, {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        ...(payload.orderIndex != null && { orderIndex: payload.orderIndex }),
      }),
    });
  },

  update(
    organizationId: string,
    meetingId: string,
    itemId: string,
    payload: { title?: string; orderIndex?: number }
  ): Promise<MeetingAgendaItem> {
    return apiRequest<MeetingAgendaItem>(
      `${base(organizationId, meetingId)}/agenda/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          ...(payload.title !== undefined && { title: payload.title }),
          ...(payload.orderIndex !== undefined && { orderIndex: payload.orderIndex }),
        }),
      }
    );
  },

  remove(organizationId: string, meetingId: string, itemId: string): Promise<void> {
    return apiRequest<void>(`${base(organizationId, meetingId)}/agenda/${itemId}`, {
      method: 'DELETE',
    });
  },

  reorder(
    organizationId: string,
    meetingId: string,
    payload: ReorderAgendaPayload
  ): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(
      `${base(organizationId, meetingId)}/agenda/order`,
      {
        method: 'PATCH',
        body: JSON.stringify({ order: payload.order }),
      }
    );
  },

  updateCurrentTopic(
    organizationId: string,
    meetingId: string,
    agendaItemId: string | null
  ): Promise<{ currentAgendaItemId: string | null }> {
    return apiRequest<{ currentAgendaItemId: string | null }>(
      `${base(organizationId, meetingId)}/current-topic`,
      {
        method: 'PATCH',
        body: JSON.stringify({ agendaItemId }),
      }
    );
  },
};
