// Meeting minutes, votes, and moderators API types (API contract for frontend)

export interface Moderator {
  userId: string;
  userName: string;
  source: 'creator' | 'representative' | 'invited';
}

export interface MinutesEvent {
  id: string;
  meetingId: string;
  minutesDocumentId: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  orderIndex: number;
  createdAt: string;
  createdByUserId: string | null;
}

/** Poll summary attached to date_decided timeline items when payload.schedulingPollId is set (backend-enriched). */
export interface TimelineSchedulingPollSummary {
  id: string;
  title: string;
  status: string;
  chosenSlot?: { startAt: string; endAt: string };
}

/** Event item: API returns flat eventType/payload; legacy nested event also supported. */
export type TimelineEventItem = {
  type: 'event';
  id: string;
  occurredAt: string;
  orderIndex?: number;
  entityVersion?: string | null;
  /** Flat shape from API */
  eventType?: string;
  payload?: Record<string, unknown> | null;
  /** Nested shape (legacy) */
  event?: MinutesEvent;
  /** Expanded vote data when eventType is vote_started or vote_ended */
  vote?: MeetingVote;
  /** Expanded brainstorm options when eventType is brainstorm_started or brainstorm_ended */
  options?: { id: string; label: string; sortOrder: number; createdAt: string }[];
  /** Set for date_decided events with payload.schedulingPollId when backend enriches timeline */
  schedulingPoll?: TimelineSchedulingPollSummary;
  /** Decision-arc identifier computed server-side from FK chain (brainstorm → vote → decision). */
  arcId?: string | null;
  [key: string]: unknown;
};

/** Paragraph item: API returns id; consumer may use id as paragraphId with meeting's minutesDocumentId. */
export type TimelineParagraphItem = {
  type: 'paragraph';
  id: string;
  occurredAt: string;
  orderIndex?: number;
  entityVersion?: string | null;
  paragraphId?: string;
  documentId?: string;
  title?: string;
  text?: string;
  headingLevel?: number | null;
  /** Set by API timeline merge from topic_set context (paragraphs table has no agenda column). */
  agendaItemId?: string | null;
  arcId?: string | null;
  [key: string]: unknown;
};

/** To-do item in timeline (from getTimeline). */
export type TimelineTodoItem = {
  type: 'todo';
  id: string;
  occurredAt: string;
  orderIndex?: number;
  entityVersion?: string | null;
  title: string;
  description?: string | null;
  dueDate: string;
  status: string;
  responsibleUserId: string;
  responsibleUserName?: string | null;
  agendaItemId?: string | null;
  [key: string]: unknown;
};

export interface MeetingDecision {
  id: string;
  meetingId: string;
  minutesDocumentId: string | null;
  agendaItemId: string | null;
  meetingVoteId: string | null;
  sourceEventId: string | null;
  title: string | null;
  text: string;
  status: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
}

export type TimelineDecisionItem = {
  type: 'decision';
  id: string;
  occurredAt: string;
  orderIndex?: number;
  entityVersion?: string | null;
  agendaItemId?: string | null;
  meetingVoteId?: string | null;
  sourceEventId?: string | null;
  title?: string | null;
  text?: string;
  status?: string;
  createdByUserId?: string | null;
  arcId?: string | null;
  [key: string]: unknown;
};

export type TimelineItem = TimelineEventItem | TimelineParagraphItem | TimelineTodoItem | TimelineDecisionItem;

export interface MeetingTodo {
  id: string;
  meetingId: string;
  title: string;
  description?: string | null;
  dueDate: string;
  status: string;
  responsibleUserId: string;
  responsibleUserName?: string | null;
  agendaItemId?: string | null;
  orderIndex: number;
  createdAt: string;
  createdByUserId?: string | null;
  completedAt?: string | null;
  completedByUserId?: string | null;
}

export interface MeetingVoteOption {
  id: string;
  meetingVoteId: string;
  label: string;
  sortOrder: number;
}

export interface MeetingVoteResponse {
  id: string;
  meetingVoteId: string;
  optionId: string;
  userId: string;
  createdAt: string;
}

export interface MeetingVote {
  id: string;
  meetingId: string;
  title: string;
  status: 'open' | 'closed';
  anonymous: boolean;
  createdByUserId: string;
  createdAt: string;
  closedAt: string | null;
  sourceEventId: string | null;
  options?: MeetingVoteOption[];
  responseCounts?: { optionId: string; count: number }[];
  responses?: MeetingVoteResponse[];
}

export interface MinutesEventsResponse {
  events: MinutesEvent[];
}

export interface MinutesTimelineResponse {
  items: TimelineItem[];
}

export interface ModeratorsResponse {
  moderators: Moderator[];
}

/** Payload for document_created timeline event: server creates org document and sets documentId. */
export interface DocumentCreatedEventPayload {
  documentId?: string;
  title?: string;
}

export interface CreateMinutesEventPayload {
  eventType: string;
  payload?: Record<string, unknown>;
  orderIndex?: number;
}

export interface CreateVotePayload {
  title: string;
  options: { label: string }[];
  anonymous?: boolean;
  sourceEventId?: string;
}

export interface CastVotePayload {
  optionId: string;
}

export interface AddModeratorPayload {
  userId: string;
}

export interface AddBrainstormOptionPayload {
  label: string;
  brainstormEventId: string;
}

export interface CreateTodoPayload {
  title: string;
  description?: string | null;
  dueDate: string;
  responsibleUserId: string;
  agendaItemId?: string | null;
  orderIndex?: number;
}

export interface UpdateTodoPayload {
  title?: string;
  description?: string | null;
  dueDate?: string;
  status?: string;
  responsibleUserId?: string;
}

export interface TodosResponse {
  todos: MeetingTodo[];
}

export interface AssignableUser {
  userId: string;
  userName: string | null;
}

export interface AssignableUsersResponse {
  users: AssignableUser[];
}

export interface CloseBrainstormAndStartVotePayload {
  brainstormEventId: string;
  title: string;
  options: { label: string }[];
  anonymous?: boolean;
}

export interface CloseBrainstormAndStartVoteResponse {
  endedEvent: MinutesEvent;
  vote: MeetingVote;
}

export interface CreateDecisionPayload {
  title?: string;
  text?: string;
  meetingVoteId?: string | null;
  sourceEventId?: string | null;
  agendaItemId?: string | null;
}

export interface DecisionsResponse {
  decisions: MeetingDecision[];
}

/**
 * WebSocket meeting-update payload data shapes by event type.
 * Optional fields appear when the server sends enriched payloads; clients should merge when present and refetch when missing.
 */
export interface MeetingUpdateData {
  meetingVoteId?: string;
  title?: string;
  /** Full timeline row for protocol canvas merge (vote/paragraph/event payloads). */
  item?: TimelineItem;
  event?: MinutesEvent;
  currentAgendaItemId?: string | null;
  vote?: MeetingVote;
  result?: { optionId: string; count: number }[];
  responseCounts?: { optionId: string; count: number }[];
  order?: Array<{ id: string; orderIndex: number }>;
  agendaItem?: { id: string; meetingId: string; title: string; orderIndex: number; createdAt: string; updatedAt: string; createdByUserId: string | null };
  agendaItemId?: string;
  item?: TimelineParagraphItem | TimelineTodoItem;
  paragraphId?: string;
  todo?: MeetingTodo & { occurredAt?: string; orderIndex?: number };
  todoId?: string;
  finalizedAt?: string | null;
  userId?: string;
  userName?: string | null;
  brainstormEventId?: string;
  option?: { id: string; label: string; sortOrder: number; createdAt: string };
  decision?: MeetingDecision;
}
