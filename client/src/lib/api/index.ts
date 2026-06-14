// API module index - re-exports all API modules for backward compatibility
// This allows existing imports like `import { documentsApi } from './lib/api'` to continue working

// Re-export base client utilities
export { 
  apiRequest, 
  invalidateCache,
  clearRequestCache,
  isRateLimited, 
  clearRateLimitState,
  ApiError,
  NetworkError,
  AuthError,
  RateLimitError,
  type ApiErrorResponse,
  type StructuredErrorDetails
} from './client';

// Re-export all API response types from types.ts
export * from './types';

// Re-export all API modules
export { documentsApi } from './documents';
export { documentTreeProposalsApi } from './document-tree-proposals';
export { paragraphsApi } from './paragraphs';
export { proposalsApi } from './proposals';
export { votesApi } from './votes';
export { commentsApi } from './comments';
export { structureHistoryApi } from './structure-history';
export { structureProposalsApi } from './structure-proposals';
export { organizationsApi } from './organizations';
export { governanceApi } from './governance';
export { authApi } from './auth';
export { searchApi } from './search';
export { geocodeApi } from './geocode';
export type { GeocodeResult } from './geocode';
export { exportApi } from './export';
export { activityApi } from './activity';
export { errorReportsApi } from './error-reports';
export { adminApi } from './admin';
export type * from './types/admin';
export { contactApi } from './contact';
export { verificationApi } from './verification';
export type { VerifyResult, BallotExportResponse, VoteLogEntry, VoteLogResponse, ReceiptsResponse, VerifiableContest, ContestsListResponse, UserVoteReceipt } from './verification';
export { calendarApi } from './calendar';
export type { CalendarEvent, CalendarEventsResponse, CalendarSubscribeUrlResponse } from './calendar';
export { schedulingApi } from './scheduling';
export type {
  SchedulingPoll,
  SchedulingPollSlot,
  SchedulingPollStatus,
  ResponseCount,
  ChosenSlot,
  SchedulingPollsResponse,
  SchedulingPollDetailResponse,
  SlotsResponse,
  ResponsesResponse,
  FinalizeSchedulingResponse,
  SchedulingResponseItem,
} from './types/scheduling';
export { meetingsApi } from './meetings';
export type { Meeting, MeetingsListResponse } from './types/meetings';
export type { MinutesDocumentEntry, MinutesDocumentsResponse } from './meetings';
export { meetingMinutesApi } from './meetingMinutes';
export { meetingAgendaApi } from './meetingAgenda';
export { meetingVotesApi } from './meetingVotes';
export { meetingModeratorsApi } from './meetingModerators';
export type {
  MinutesEvent,
  TimelineItem,
  MeetingVote,
  MeetingVoteOption,
  MeetingVoteResponse,
  Moderator,
  MinutesEventsResponse,
  MinutesTimelineResponse,
  ModeratorsResponse,
  CreateMinutesEventPayload,
  CreateVotePayload,
  CastVotePayload,
  AddModeratorPayload,
  AddBrainstormOptionPayload,
  MeetingTodo,
  TimelineTodoItem,
  CreateTodoPayload,
  UpdateTodoPayload,
  AssignableUser,
} from './types/meetingMinutes';
export type {
  MeetingAgendaItem,
  AgendaListResponse,
  ReorderAgendaPayload,
} from './types/meetingAgenda';

