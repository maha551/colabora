/**
 * Meeting minutes API client.
 * Backend: /api/organizations/:organizationId/meetings/:meetingId/minutes
 */

import { apiRequest } from './client';
import type {
  MinutesEvent,
  MinutesEventsResponse,
  MinutesTimelineResponse,
  CreateMinutesEventPayload,
  MeetingTodo,
  CreateTodoPayload,
  UpdateTodoPayload,
  TodosResponse,
  AssignableUsersResponse,
  CloseBrainstormAndStartVotePayload,
  CloseBrainstormAndStartVoteResponse,
  CreateDecisionPayload,
  DecisionsResponse,
  MeetingDecision,
} from './types/meetingMinutes';

const base = (organizationId: string, meetingId: string) =>
  `/api/organizations/${organizationId}/meetings/${meetingId}`;

export const meetingMinutesApi = {
  getEvents(
    organizationId: string,
    meetingId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<MinutesEventsResponse> {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    const query = search.toString();
    return apiRequest<MinutesEventsResponse>(
      `${base(organizationId, meetingId)}/minutes/events${query ? `?${query}` : ''}`
    );
  },

  createEvent(
    organizationId: string,
    meetingId: string,
    body: CreateMinutesEventPayload
  ): Promise<MinutesEvent> {
    return apiRequest<MinutesEvent>(
      `${base(organizationId, meetingId)}/minutes/events`,
      {
        method: 'POST',
        body: JSON.stringify({
          event_type: body.eventType,
          ...(body.payload != null && { payload: body.payload }),
          ...(body.orderIndex != null && { order_index: body.orderIndex }),
        }),
      }
    );
  },

  getTimeline(
    organizationId: string,
    meetingId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<MinutesTimelineResponse> {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    const query = search.toString();
    return apiRequest<MinutesTimelineResponse>(
      `${base(organizationId, meetingId)}/minutes/timeline${query ? `?${query}` : ''}`
    );
  },

  reorderTimeline(
    organizationId: string,
    meetingId: string,
    itemIds: string[]
  ): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(
      `${base(organizationId, meetingId)}/minutes/timeline/reorder`,
      {
        method: 'POST',
        body: JSON.stringify({ itemIds }),
      }
    );
  },

  finalize(organizationId: string, meetingId: string): Promise<void> {
    return apiRequest<void>(
      `${base(organizationId, meetingId)}/minutes/finalize`,
      { method: 'POST' }
    );
  },

  unfinalize(organizationId: string, meetingId: string): Promise<void> {
    return apiRequest<void>(
      `${base(organizationId, meetingId)}/minutes/unfinalize`,
      { method: 'POST' }
    );
  },

  addBrainstormOption(
    organizationId: string,
    meetingId: string,
    body: { brainstormEventId: string; label: string }
  ): Promise<{ id: string; label: string; sortOrder: number; createdAt: string }> {
    return apiRequest(
      `${base(organizationId, meetingId)}/brainstorm/options`,
      {
        method: 'POST',
        body: JSON.stringify({
          brainstorm_event_id: body.brainstormEventId,
          label: body.label,
        }),
      }
    );
  },

  closeBrainstormAndStartVote(
    organizationId: string,
    meetingId: string,
    body: CloseBrainstormAndStartVotePayload
  ): Promise<CloseBrainstormAndStartVoteResponse> {
    return apiRequest<CloseBrainstormAndStartVoteResponse>(
      `${base(organizationId, meetingId)}/brainstorm/close-and-start-vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          brainstorm_event_id: body.brainstormEventId,
          title: body.title,
          options: body.options,
          anonymous: !!body.anonymous,
        }),
      }
    );
  },

  getDecisions(
    organizationId: string,
    meetingId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<DecisionsResponse> {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    const query = search.toString();
    return apiRequest<DecisionsResponse>(`${base(organizationId, meetingId)}/decisions${query ? `?${query}` : ''}`);
  },

  createDecision(
    organizationId: string,
    meetingId: string,
    body: CreateDecisionPayload
  ): Promise<MeetingDecision> {
    return apiRequest<MeetingDecision>(
      `${base(organizationId, meetingId)}/decisions`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...(body.title != null && { title: body.title }),
          ...(body.text != null && { text: body.text }),
          ...(body.meetingVoteId != null && { meeting_vote_id: body.meetingVoteId }),
          ...(body.sourceEventId != null && { source_event_id: body.sourceEventId }),
          ...(body.agendaItemId != null && { agenda_item_id: body.agendaItemId }),
        }),
      }
    );
  },

  getAssignableUsers(organizationId: string, meetingId: string): Promise<AssignableUsersResponse> {
    return apiRequest<AssignableUsersResponse>(`${base(organizationId, meetingId)}/assignable-users`);
  },

  getTodos(organizationId: string, meetingId: string): Promise<TodosResponse> {
    return apiRequest<TodosResponse>(`${base(organizationId, meetingId)}/todos`);
  },

  createTodo(
    organizationId: string,
    meetingId: string,
    body: CreateTodoPayload
  ): Promise<MeetingTodo> {
    return apiRequest<MeetingTodo>(`${base(organizationId, meetingId)}/todos`, {
      method: 'POST',
      body: JSON.stringify({
        title: body.title,
        ...(body.description != null && { description: body.description }),
        due_date: body.dueDate,
        responsible_user_id: body.responsibleUserId,
        ...(body.agendaItemId != null && body.agendaItemId !== '' && { agenda_item_id: body.agendaItemId }),
        ...(body.orderIndex != null && { order_index: body.orderIndex }),
      }),
    });
  },

  updateTodo(
    organizationId: string,
    meetingId: string,
    todoId: string,
    body: UpdateTodoPayload
  ): Promise<MeetingTodo> {
    const payload: Record<string, unknown> = {};
    if (body.title !== undefined) payload.title = body.title;
    if (body.description !== undefined) payload.description = body.description;
    if (body.dueDate !== undefined) payload.due_date = body.dueDate;
    if (body.status !== undefined) payload.status = body.status;
    if (body.responsibleUserId !== undefined) payload.responsible_user_id = body.responsibleUserId;
    return apiRequest<MeetingTodo>(`${base(organizationId, meetingId)}/todos/${todoId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteTodo(organizationId: string, meetingId: string, todoId: string): Promise<void> {
    return apiRequest<void>(`${base(organizationId, meetingId)}/todos/${todoId}`, {
      method: 'DELETE',
    });
  },
};
