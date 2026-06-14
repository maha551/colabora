// Meeting agenda API types

export interface MeetingAgendaItem {
  id: string;
  meetingId: string;
  title: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
}

export interface AgendaListResponse {
  items: MeetingAgendaItem[];
}

export interface ReorderAgendaPayload {
  order: Array<{ id: string; orderIndex: number }>;
}
