// Scheduling poll API types (Phase 2 backend contract)

export type SchedulingPollStatus = 'open' | 'closed' | 'finalized';

export interface SchedulingPoll {
  id: string;
  organizationId: string;
  createdByUserId: string;
  title: string;
  description: string | null;
  status: SchedulingPollStatus;
  chosenSlotId: string | null;
  participationDeadline: string | null;
  participationClosedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipationSummary {
  memberCount: number;
  respondedCount: number;
  nonRespondedUserIds: string[];
  guestCount: number;
}

export interface SuggestedSlot {
  slotId: string;
  startAt: string;
  endAt: string;
  yesCount: number;
}

export interface SchedulingPollSlot {
  id: string;
  startAt: string;
  endAt: string;
  sortOrder: number;
}

export interface ResponseCount {
  slotId: string;
  yes: number;
  no: number;
  maybe: number;
}

export interface ChosenSlot {
  startAt: string;
  endAt: string;
  id?: string;
}

export interface SchedulingPollsResponse {
  polls: SchedulingPoll[];
}

export interface MyResponseItem {
  slotId: string;
  response: 'yes' | 'no' | 'maybe';
}

export interface GuestRespondentSummary {
  displayName: string;
  responses: MyResponseItem[];
}

export interface GuestLinkInfo {
  url: string;
  expiresAt: string;
}

export interface SchedulingPollDetailResponse {
  poll: SchedulingPoll;
  slots: SchedulingPollSlot[];
  responseCounts: ResponseCount[];
  chosenSlot?: ChosenSlot;
  /** Current user's responses per slot (when loading poll detail). */
  myResponses?: MyResponseItem[];
  guestLink?: GuestLinkInfo | null;
  guestRespondentSummaries?: GuestRespondentSummary[];
  participationSummary?: ParticipationSummary;
  suggestedSlot?: SuggestedSlot | null;
}

export interface SlotsResponse {
  slots: SchedulingPollSlot[];
}

export interface SchedulingResponseItem {
  slotId: string;
  response: 'yes' | 'no' | 'maybe';
}

export interface ResponsesResponse {
  responses: SchedulingResponseItem[];
}

export interface FinalizeSchedulingResponse {
  poll: SchedulingPoll;
  chosenSlot: ChosenSlot;
}
