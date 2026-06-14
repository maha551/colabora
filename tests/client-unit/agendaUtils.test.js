const {
  isEventLive,
  partitionAgendaEvents,
  getAgendaFetchRange,
  LIVE_MEETING_GRACE_MS,
} = require('../../client/src/lib/calendar/agendaUtils');

describe('agendaUtils', () => {
  const now = new Date('2026-06-08T12:00:00.000Z');

  test('isEventLive detects meeting in progress', () => {
    const ev = {
      id: 'meeting-1',
      type: 'meeting',
      title: 'Board',
      start: '2026-06-08T11:00:00.000Z',
      end: '2026-06-08T13:00:00.000Z',
      organizationId: 'org-1',
      meetingId: '1',
    };
    expect(isEventLive(ev, now)).toBe(true);
  });

  test('isEventLive uses grace period when meeting has no end', () => {
    const ev = {
      id: 'meeting-2',
      type: 'meeting',
      title: 'Standup',
      start: new Date(now.getTime() - LIVE_MEETING_GRACE_MS + 60000).toISOString(),
      end: new Date(now.getTime() - LIVE_MEETING_GRACE_MS + 60000).toISOString(),
      organizationId: 'org-1',
      meetingId: '2',
    };
    expect(isEventLive(ev, now)).toBe(true);
  });

  test('partitionAgendaEvents excludes pinned from upcoming and caps limit', () => {
    const events = [
      {
        id: 'meeting-a',
        type: 'meeting',
        title: 'A',
        start: '2026-06-09T10:00:00.000Z',
        end: '2026-06-09T11:00:00.000Z',
        organizationId: 'org-1',
      },
      {
        id: 'meeting-b',
        type: 'meeting',
        title: 'B',
        start: '2026-06-10T10:00:00.000Z',
        end: '2026-06-10T11:00:00.000Z',
        organizationId: 'org-1',
      },
      {
        id: 'meeting-c',
        type: 'meeting',
        title: 'C',
        start: '2026-06-11T10:00:00.000Z',
        end: '2026-06-11T11:00:00.000Z',
        organizationId: 'org-1',
      },
    ];
    const pinned = events[1];
    const result = partitionAgendaEvents(events, now, {
      pinnedEventId: 'meeting-b',
      pinnedEvent: pinned,
      upcomingLimit: 1,
    });
    expect(result.pinned?.id).toBe('meeting-b');
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0].id).toBe('meeting-a');
  });

  test('getAgendaFetchRange spans lookback and 14 days ahead', () => {
    const { from, to } = getAgendaFetchRange(now);
    const fromDate = new Date(from);
    const toDate = new Date(to);
    expect(fromDate.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(toDate.getTime()).toBeGreaterThan(now.getTime());
    const days = (toDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(13);
  });
});
