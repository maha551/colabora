/**
 * Scheduling polls API client (Phase 3 frontend).
 * Backend: /api/organizations/:organizationId/scheduling-polls
 */

import { apiRequest } from './client';
import type {
  SchedulingPollsResponse,
  SchedulingPollDetailResponse,
  SlotsResponse,
  ResponsesResponse,
  FinalizeSchedulingResponse,
  SchedulingPoll,
  SchedulingResponseItem,
  ParticipationSummary,
  SuggestedSlot,
} from './types/scheduling';

const base = (organizationId: string) => `/api/organizations/${organizationId}/scheduling-polls`;

export const schedulingApi = {
  listSchedulingPolls(organizationId: string): Promise<SchedulingPollsResponse> {
    return apiRequest<SchedulingPollsResponse>(base(organizationId));
  },

  getSchedulingPoll(organizationId: string, pollId: string): Promise<SchedulingPollDetailResponse> {
    return apiRequest<SchedulingPollDetailResponse>(`${base(organizationId)}/${pollId}`);
  },

  createSchedulingPoll(
    organizationId: string,
    payload: {
      title: string;
      description?: string | null;
      sourceMeetingId?: string;
      participationDeadline?: string;
    }
  ): Promise<{ poll: SchedulingPoll }> {
    return apiRequest(`${base(organizationId)}`, {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        ...(payload.description != null && { description: payload.description }),
        ...(payload.sourceMeetingId != null && { sourceMeetingId: payload.sourceMeetingId }),
        ...(payload.participationDeadline != null && { participationDeadline: payload.participationDeadline }),
      }),
    });
  },

  updateSchedulingPoll(
    organizationId: string,
    pollId: string,
    payload: { participationDeadline: string }
  ): Promise<{ poll: SchedulingPoll; reopened: boolean }> {
    return apiRequest(`${base(organizationId)}/${pollId}`, {
      method: 'PATCH',
      body: JSON.stringify({ participationDeadline: payload.participationDeadline }),
    });
  },

  closeSchedulingPoll(
    organizationId: string,
    pollId: string
  ): Promise<{ poll: SchedulingPoll; participationSummary?: ParticipationSummary; suggestedSlot?: SuggestedSlot | null }> {
    return apiRequest(`${base(organizationId)}/${pollId}/close`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  addSchedulingPollSlots(
    organizationId: string,
    pollId: string,
    payload: { slots: Array<{ startAt: string; endAt: string; sortOrder?: number }> }
  ): Promise<SlotsResponse> {
    return apiRequest<SlotsResponse>(`${base(organizationId)}/${pollId}/slots`, {
      method: 'POST',
      body: JSON.stringify({ slots: payload.slots }),
    });
  },

  setSchedulingPollResponses(
    organizationId: string,
    pollId: string,
    payload: { responses: SchedulingResponseItem[] }
  ): Promise<ResponsesResponse> {
    return apiRequest<ResponsesResponse>(`${base(organizationId)}/${pollId}/responses`, {
      method: 'PUT',
      body: JSON.stringify({ responses: payload.responses }),
    });
  },

  finalizeSchedulingPoll(
    organizationId: string,
    pollId: string,
    payload: { chosenSlotId: string }
  ): Promise<FinalizeSchedulingResponse> {
    return apiRequest<FinalizeSchedulingResponse>(`${base(organizationId)}/${pollId}/finalize`, {
      method: 'POST',
      body: JSON.stringify({ chosenSlotId: payload.chosenSlotId }),
    });
  },

  getGuestLink(
    organizationId: string,
    pollId: string
  ): Promise<{ url: string; expiresAt: string; tokenPreview: string }> {
    return apiRequest(`${base(organizationId)}/${pollId}/guest-link`);
  },

  regenerateGuestLink(
    organizationId: string,
    pollId: string
  ): Promise<{ url: string; expiresAt: string; tokenPreview: string }> {
    return apiRequest(`${base(organizationId)}/${pollId}/guest-link/regenerate`, {
      method: 'POST',
    });
  },
};
