process.env.NODE_ENV = 'test';

const {
  escapeIcalText,
  foldIcalLine,
  buildMeetingDescription,
  buildEventDescription,
  toIcal,
  AGENDA_MAX_ITEMS
} = require('../../server/services/CalendarService');

describe('CalendarService', () => {
  describe('escapeIcalText', () => {
    test('escapes semicolons, commas, backslashes, and newlines', () => {
      expect(escapeIcalText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    });

    test('returns empty string for null', () => {
      expect(escapeIcalText(null)).toBe('');
    });
  });

  describe('foldIcalLine', () => {
    test('returns short lines unchanged', () => {
      expect(foldIcalLine('SUMMARY:Short title')).toBe('SUMMARY:Short title');
    });

    test('folds lines longer than 75 octets', () => {
      const long = 'DESCRIPTION:' + 'x'.repeat(80);
      const folded = foldIcalLine(long);
      expect(folded).toContain('\r\n ');
      expect(folded.split('\r\n').every((line, i) => i === 0 || line.startsWith(' '))).toBe(true);
    });
  });

  describe('buildMeetingDescription', () => {
    test('includes numbered agenda when items exist', () => {
      const desc = buildMeetingDescription({
        agendaTitles: ['Welcome', 'Budget'],
        meetingLink: 'https://meet.example.com/room',
        appLink: 'https://app.example.com/meeting/1',
        organizationName: 'My Org'
      });
      expect(desc).toContain('My Org');
      expect(desc).toContain('Agenda:');
      expect(desc).toContain('1. Welcome');
      expect(desc).toContain('2. Budget');
      expect(desc).toContain('Join: https://meet.example.com/room');
      expect(desc).toContain('Open in colabora: https://app.example.com/meeting/1');
    });

    test('omits agenda section when no items', () => {
      const desc = buildMeetingDescription({
        agendaTitles: [],
        appLink: 'https://app.example.com/meeting/1'
      });
      expect(desc).not.toContain('Agenda:');
      expect(desc).toContain('Open in colabora');
    });

    test('truncates long agendas', () => {
      const titles = Array.from({ length: AGENDA_MAX_ITEMS + 5 }, (_, i) => `Item ${i + 1}`);
      const desc = buildMeetingDescription({ agendaTitles: titles });
      expect(desc).toContain('…and 5 more');
      expect(desc).toContain('1. Item 1');
      expect(desc).not.toContain(`${AGENDA_MAX_ITEMS + 1}. Item`);
    });
  });

  describe('buildEventDescription', () => {
    test('builds document voting deadline description', () => {
      const desc = buildEventDescription(
        {
          type: 'document_voting_deadline',
          documentTitle: 'Bylaws',
          link: '#/documents/doc-1'
        },
        'Cooperative A',
        'https://app.example.com'
      );
      expect(desc).toContain('Cooperative A');
      expect(desc).toContain('Voting closes for "Bylaws"');
      expect(desc).toContain('https://app.example.com/#/documents/doc-1');
    });

    test('builds election phase description', () => {
      const desc = buildEventDescription(
        {
          type: 'election_voting_start',
          electionTitle: 'Board election',
          phaseLabel: 'Voting starts',
          link: '#/organization/org-1/representatives'
        },
        'Cooperative A',
        'https://app.example.com'
      );
      expect(desc).toContain('Voting starts for "Board election"');
    });
  });

  describe('toIcal', () => {
    const baseEvent = {
      id: 'meeting-abc123',
      type: 'meeting',
      title: 'General Assembly',
      start: '2025-06-08T14:00:00.000Z',
      end: '2025-06-08T16:00:00.000Z',
      organizationId: 'org-1',
      link: '#/organization/org-1/meetings/abc123',
      location: 'Community Hall',
      meetingLink: 'https://meet.example.com/ga',
      description: 'Agenda:\n1. Welcome',
      alarms: [{ trigger: '-PT15M', description: 'Meeting starting soon' }]
    };

    test('includes DESCRIPTION, LOCATION, URL, and VALARM', () => {
      const ical = toIcal([baseEvent], {
        baseUrl: 'https://app.example.com',
        calendarName: 'colabora — Test Org'
      });
      expect(ical).toContain('BEGIN:VCALENDAR');
      expect(ical).toContain('UID:meeting-abc123@colabora');
      expect(ical).toContain('SUMMARY:General Assembly');
      expect(ical).toContain('DESCRIPTION:');
      expect(ical).toContain('LOCATION:Community Hall');
      expect(ical).toContain('URL:https://meet.example.com/ga');
      expect(ical).toContain('BEGIN:VALARM');
      expect(ical).toContain('TRIGGER:-PT15M');
      expect(ical).toContain('X-WR-CALNAME:colabora');
      expect(ical).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
      expect(ical).toContain('END:VCALENDAR');
    });

    test('uses VALUE=DATE for all-day events', () => {
      const ical = toIcal([{
        id: 'doc-1-document_voting_deadline',
        type: 'document_voting_deadline',
        title: 'Voting deadline: Bylaws',
        start: '2025-06-08T23:59:00.000Z',
        end: '2025-06-08T23:59:00.000Z',
        allDay: true,
        organizationId: 'org-1'
      }], { timezone: 'America/New_York' });
      expect(ical).toContain('DTSTART;VALUE=DATE:');
      expect(ical).toContain('DTEND;VALUE=DATE:');
    });

    test('uses TZID when timezone provided for timed events', () => {
      const ical = toIcal([baseEvent], {
        baseUrl: 'https://app.example.com',
        timezone: 'Europe/Berlin'
      });
      expect(ical).toContain('DTSTART;TZID=Europe/Berlin:');
      expect(ical).toContain('DTEND;TZID=Europe/Berlin:');
    });

    test('maintains stable UID format', () => {
      const ical = toIcal([baseEvent], { baseUrl: 'https://app.example.com' });
      expect(ical).toMatch(/UID:meeting-abc123@colabora/);
    });
  });

  describe('resolveEventById', () => {
    const TransactionManager = require('../../server/database/services/TransactionManager');
    const { resolveEventById } = require('../../server/services/CalendarService');

    beforeEach(() => {
      jest.restoreAllMocks();
    });

    test('returns null when user is not an org member', async () => {
      jest.spyOn(TransactionManager, 'query').mockResolvedValue(null);
      const result = await resolveEventById({}, {
        eventId: 'meeting-m1',
        organizationId: 'org-1',
        userId: 'user-1',
        baseUrl: 'https://app.example.com'
      });
      expect(result).toBeNull();
    });

    test('resolves a meeting event by id', async () => {
      jest.spyOn(TransactionManager, 'query')
        .mockResolvedValueOnce({ organization_id: 'org-1' })
        .mockResolvedValueOnce({
          id: 'm1',
          organization_id: 'org-1',
          title: 'General Assembly',
          scheduled_at: new Date('2026-09-01T10:00:00.000Z'),
          end_at: new Date('2026-09-01T12:00:00.000Z'),
          location: 'Hall',
          meeting_link: 'https://meet.example.com/ga'
        });
      jest.spyOn(TransactionManager, 'queryAll').mockResolvedValue([]);

      const result = await resolveEventById({}, {
        eventId: 'meeting-m1',
        organizationId: 'org-1',
        userId: 'user-1',
        baseUrl: 'https://app.example.com'
      });

      expect(result).not.toBeNull();
      expect(result.id).toBe('meeting-m1');
      expect(result.type).toBe('meeting');
      expect(result.title).toBe('General Assembly');
      expect(result.meetingLink).toBe('https://meet.example.com/ga');
    });

    test('returns null for invalid event id format', async () => {
      jest.spyOn(TransactionManager, 'query').mockResolvedValue({ organization_id: 'org-1' });
      const result = await resolveEventById({}, {
        eventId: 'not-valid',
        organizationId: 'org-1',
        userId: 'user-1'
      });
      expect(result).toBeNull();
    });
  });
});
