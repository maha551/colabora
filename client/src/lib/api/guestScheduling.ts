export interface GuestPollInfo {
  title: string;
  description: string | null;
  status: 'open' | 'closed' | 'finalized';
  participationDeadline?: string | null;
}

export interface GuestPollSlot {
  id: string;
  startAt: string;
  endAt: string;
}

export interface GuestResponseCount {
  slotId: string;
  yes: number;
  no: number;
  maybe: number;
}

export interface GuestChosenSlot {
  startAt: string;
  endAt: string;
}

export interface GuestMeetingPack {
  title: string;
  scheduledAt: string;
  endAt: string | null;
  location: string | null;
  meetingLink: string | null;
  minutesFinalizedAt: string | null;
}

export interface GuestSessionInfo {
  displayName: string;
  responses: Array<{ slotId: string; response: 'yes' | 'no' | 'maybe' }>;
}

export interface GuestMinutesBlock {
  type: string;
  orderIndex?: number;
  title?: string;
  text?: string;
  headingLevel?: string | null;
  eventLine?: string;
  eventType?: string;
  options?: Array<{ id: string; label: string }>;
  responseCounts?: Array<{ optionId: string; count: number }>;
  totalVotes?: number;
  todos?: Array<{ title: string; status?: string; responsibleUserName?: string | null; dueDate?: string | null }>;
}

export interface GuestPollView {
  poll: GuestPollInfo;
  slots: GuestPollSlot[];
  responseCounts: GuestResponseCount[];
  chosenSlot: GuestChosenSlot | null;
  meeting: GuestMeetingPack | null;
  minutesBlocks: GuestMinutesBlock[] | null;
  guestSession: GuestSessionInfo | null;
}

export interface GuestSaveResponsesPayload {
  displayName?: string;
  sessionToken?: string;
  responses: Array<{ slotId: string; response: 'yes' | 'no' | 'maybe' }>;
}

export interface GuestSaveResponsesResult {
  sessionToken: string;
  displayName: string;
  responses: Array<{ slotId: string; response: 'yes' | 'no' | 'maybe' }>;
}

export class GuestSchedulingError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'GuestSchedulingError';
  }
}

async function guestFetch<T>(
  path: string,
  options: RequestInit & { guestSessionToken?: string } = {}
): Promise<T> {
  const { guestSessionToken, ...init } = options;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (guestSessionToken) {
    headers['X-Guest-Session'] = guestSessionToken;
  }

  const response = await fetch(path, { ...init, headers });

  if (response.status === 429) {
    throw new GuestSchedulingError('Too many requests. Please wait a moment and try again.', 429, 'RATE_LIMITED');
  }

  let body: unknown = null;
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const errBody = body as { error?: string; message?: string; code?: string } | null;
    const message =
      errBody?.error ||
      errBody?.message ||
      (response.status === 404 ? 'This link is invalid or has expired.' : 'Something went wrong.');
    throw new GuestSchedulingError(message, response.status, errBody?.code);
  }

  return body as T;
}

export const guestSchedulingApi = {
  getPollView(token: string, guestSessionToken?: string): Promise<GuestPollView> {
    return guestFetch<GuestPollView>(`/api/public/guest/polls/${encodeURIComponent(token)}`, {
      method: 'GET',
      guestSessionToken,
    });
  },

  saveResponses(token: string, payload: GuestSaveResponsesPayload): Promise<GuestSaveResponsesResult> {
    return guestFetch<GuestSaveResponsesResult>(
      `/api/public/guest/polls/${encodeURIComponent(token)}/responses`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
        guestSessionToken: payload.sessionToken,
      }
    );
  },
};
