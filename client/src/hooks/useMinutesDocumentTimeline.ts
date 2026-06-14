import { useCallback, useEffect, useState } from 'react';
import { meetingMinutesApi, meetingAgendaApi, meetingsApi } from '../lib/api';
import type { Meeting } from '../lib/api/types/meetings';
import type { MeetingAgendaItem } from '../lib/api/types/meetingAgenda';
import type { TimelineItem } from '../lib/api/types/meetingMinutes';

export interface UseMinutesDocumentTimelineParams {
  organizationId: string | undefined;
  meetingId: string | undefined;
}

export interface UseMinutesDocumentTimelineResult {
  timelineItems: TimelineItem[];
  agendaItems: MeetingAgendaItem[];
  meetingDetail: Pick<Meeting, 'id' | 'currentAgendaItemId' | 'minutesFinalizedAt'> | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMinutesDocumentTimeline({
  organizationId,
  meetingId,
}: UseMinutesDocumentTimelineParams): UseMinutesDocumentTimelineResult {
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [agendaItems, setAgendaItems] = useState<MeetingAgendaItem[]>([]);
  const [meetingDetail, setMeetingDetail] = useState<
    Pick<Meeting, 'id' | 'currentAgendaItemId' | 'minutesFinalizedAt'> | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!organizationId || !meetingId) {
      setTimelineItems([]);
      setAgendaItems([]);
      setMeetingDetail(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [timelineRes, agendaRes, meeting] = await Promise.all([
        meetingMinutesApi.getTimeline(organizationId, meetingId),
        meetingAgendaApi.list(organizationId, meetingId),
        meetingsApi.getMeeting(organizationId, meetingId),
      ]);
      setTimelineItems(timelineRes.items ?? []);
      setAgendaItems(agendaRes.items ?? []);
      setMeetingDetail({
        id: meeting.id,
        currentAgendaItemId: meeting.currentAgendaItemId ?? null,
        minutesFinalizedAt: meeting.minutesFinalizedAt ?? null,
      });
    } catch (e) {
      setTimelineItems([]);
      setAgendaItems([]);
      setMeetingDetail(null);
      setError(e instanceof Error ? e.message : 'Failed to load meeting minutes');
    } finally {
      setLoading(false);
    }
  }, [organizationId, meetingId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    timelineItems,
    agendaItems,
    meetingDetail,
    loading,
    error,
    refetch,
  };
}
