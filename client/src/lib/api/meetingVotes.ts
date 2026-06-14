/**
 * Meeting votes API client.
 * Backend: /api/organizations/:organizationId/meetings/:meetingId/votes
 */

import { apiRequest } from './client';
import type { MeetingVote, CreateVotePayload, CastVotePayload } from './types/meetingMinutes';

const base = (organizationId: string, meetingId: string) =>
  `/api/organizations/${organizationId}/meetings/${meetingId}`;

export const meetingVotesApi = {
  createVote(
    organizationId: string,
    meetingId: string,
    body: CreateVotePayload
  ): Promise<MeetingVote> {
    return apiRequest<MeetingVote>(`${base(organizationId, meetingId)}/votes`, {
      method: 'POST',
      body: JSON.stringify({
        title: body.title,
        options: body.options.map((o) => ({ label: o.label })),
        ...(body.anonymous != null && { anonymous: body.anonymous }),
        ...(body.sourceEventId != null && { source_event_id: body.sourceEventId }),
      }),
    });
  },

  getVote(
    organizationId: string,
    meetingId: string,
    voteId: string
  ): Promise<MeetingVote> {
    return apiRequest<MeetingVote>(
      `${base(organizationId, meetingId)}/votes/${voteId}`
    );
  },

  castVote(
    organizationId: string,
    meetingId: string,
    voteId: string,
    body: CastVotePayload
  ): Promise<void> {
    return apiRequest<void>(
      `${base(organizationId, meetingId)}/votes/${voteId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({ option_id: body.optionId }),
      }
    );
  },

  closeVote(
    organizationId: string,
    meetingId: string,
    voteId: string
  ): Promise<void> {
    return apiRequest<void>(
      `${base(organizationId, meetingId)}/votes/${voteId}/close`,
      { method: 'POST' }
    );
  },
};
