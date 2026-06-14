import {

  getSheetDateParts,

  getSheetCountdown,

  getSheetVariantClasses,

  getEventTypeAccent,

  buildOrderedSheetItems,

  isEventToday,

  resolveEventTypeAccent,

} from '../../client/src/components/OrganizationManagement/agenda/agendaSheetUtils';

import type { CalendarEvent } from '../../client/src/lib/api/calendar';



function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {

  return {

    id: 'ev-1',

    type: 'meeting',

    title: 'Team Sync',

    start: '2026-06-15T14:00:00.000Z',

    end: '2026-06-15T15:00:00.000Z',

    organizationId: 'org-1',

    ...overrides,

  };

}



describe('getSheetDateParts', () => {

  it('returns day, uppercase month, and weekday in the given timezone', () => {

    const parts = getSheetDateParts('2026-06-15T14:00:00.000Z', 'America/New_York', 'en-US');



    expect(parts.day).toBe('15');

    expect(parts.month).toBe('JUN');

    expect(parts.weekday).toMatch(/Mon/i);

  });



  it('shifts calendar day across timezone boundaries', () => {

    const parts = getSheetDateParts('2026-06-07T02:00:00.000Z', 'America/Los_Angeles', 'en-US');



    expect(parts.day).toBe('6');

    expect(parts.month).toBe('JUN');

  });

});



describe('getSheetCountdown', () => {

  const now = new Date('2026-06-13T12:00:00.000Z');

  const formatRelativeTime = jest.fn(() => 'in 2 days');

  const formatDateTime = jest.fn(() => 'Mon, Jun 20, 14:00');



  beforeEach(() => {
    formatRelativeTime.mockReset();
    formatRelativeTime.mockReturnValue('in 2 days');
    formatDateTime.mockReset();
    formatDateTime.mockReturnValue('Mon, Jun 20, 14:00');
  });



  it('uses relative time when the event starts within 7 days', () => {

    const ev = makeEvent({ start: '2026-06-15T14:00:00.000Z' });

    const result = getSheetCountdown(ev, now, formatRelativeTime, formatDateTime);



    expect(result).toBe('in 2 days');

    expect(formatRelativeTime).toHaveBeenCalledWith(ev.start);

    expect(formatDateTime).not.toHaveBeenCalled();

  });



  it('uses absolute datetime when the event is more than 7 days away', () => {

    const ev = makeEvent({ start: '2026-06-25T14:00:00.000Z' });

    const result = getSheetCountdown(ev, now, formatRelativeTime, formatDateTime);



    expect(result).toBe('Mon, Jun 20, 14:00');

    expect(formatDateTime).toHaveBeenCalled();

    expect(formatRelativeTime).not.toHaveBeenCalled();

  });



  it('uses absolute datetime for past events', () => {

    const ev = makeEvent({ start: '2026-06-10T14:00:00.000Z' });

    getSheetCountdown(ev, now, formatRelativeTime, formatDateTime);



    expect(formatDateTime).toHaveBeenCalled();

    expect(formatRelativeTime).not.toHaveBeenCalled();

  });

});



describe('getSheetVariantClasses', () => {

  it('returns distinct styling for live, pinned, and default variants', () => {

    expect(getSheetVariantClasses('live')).toContain('agenda-sheet--live');

    expect(getSheetVariantClasses('pinned')).toContain('dashed');

    expect(getSheetVariantClasses('default')).toContain('agenda-sheet--stacked');

  });

});



describe('getEventTypeAccent', () => {

  it('maps event types to accent bar classes', () => {

    expect(getEventTypeAccent(makeEvent({ type: 'meeting', meetingId: 'm1' }))).toContain('emerald');

    expect(

      getEventTypeAccent(makeEvent({ type: 'scheduling_poll_finalized', schedulingPollId: 'p1' }))

    ).toContain('amber');

    expect(

      getEventTypeAccent(makeEvent({ type: 'document_vote_open', documentId: 'd1' }))

    ).toContain('blue');

    expect(

      getEventTypeAccent(makeEvent({ type: 'election_open', electionId: 'e1' }))

    ).toContain('violet');

    expect(getEventTypeAccent(makeEvent({ type: 'other' }))).toContain('muted-foreground');

  });

});



describe('buildOrderedSheetItems', () => {

  it('orders live, pinned, upcoming and dedupes', () => {

    const live = [makeEvent({ id: 'live-1', meetingLink: 'https://x' })];

    const pinned = makeEvent({ id: 'pin-1' });

    const upcoming = [makeEvent({ id: 'up-1' }), makeEvent({ id: 'pin-1' })];



    const items = buildOrderedSheetItems(live, pinned, upcoming);

    expect(items.map((i) => i.ev.id)).toEqual(['live-1', 'pin-1', 'up-1']);

    expect(items[0].showJoin).toBe(true);

  });

});



describe('isEventToday', () => {

  it('compares date keys in timezone', () => {

    const nowMs = Date.parse('2026-06-14T08:00:00.000Z');

    expect(isEventToday('2026-06-14T23:00:00.000Z', nowMs, 'UTC')).toBe(true);

    expect(isEventToday('2026-06-15T01:00:00.000Z', nowMs, 'UTC')).toBe(false);

  });

});



describe('resolveEventTypeAccent', () => {

  it('returns semantic accent kinds', () => {

    expect(resolveEventTypeAccent(makeEvent({ meetingId: 'm1' }))).toBe('meeting');

    expect(
      resolveEventTypeAccent(
        makeEvent({ type: 'scheduling_poll_finalized', schedulingPollId: 'p1' })
      )
    ).toBe('poll');

  });

});


