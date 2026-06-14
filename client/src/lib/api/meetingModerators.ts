/**
 * Meeting moderators API client.
 * Backend: /api/organizations/:organizationId/meetings/:meetingId/moderators
 */

import { apiRequest } from './client';
import type { Moderator, ModeratorsResponse } from './types/meetingMinutes';

const base = (organizationId: string, meetingId: string) =>
  `/api/organizations/${organizationId}/meetings/${meetingId}`;

export const meetingModeratorsApi = {
  getModerators(
    organizationId: string,
    meetingId: string
  ): Promise<ModeratorsResponse> {
    return apiRequest<ModeratorsResponse>(
      `${base(organizationId, meetingId)}/moderators`
    );
  },

  addModerator(
    organizationId: string,
    meetingId: string,
    userId: string
  ): Promise<Moderator> {
    return apiRequest<Moderator>(
      `${base(organizationId, meetingId)}/moderators`,
      {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }
    );
  },

  removeModerator(
    organizationId: string,
    meetingId: string,
    userId: string
  ): Promise<void> {
    return apiRequest<void>(
      `${base(organizationId, meetingId)}/moderators/${userId}`,
      { method: 'DELETE' }
    );
  },
};
