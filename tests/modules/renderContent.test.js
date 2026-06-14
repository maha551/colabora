const { renderNotificationContent, DEADLINE_EVENT_TYPE_MAP, IMMEDIATE_EVENT_TYPES } = require('../../server/notifications/renderContent');
const { escapeMarkdownV2, escapeMarkdownV2Url, markdownV2Link } = require('../../server/notifications/telegramFormat');
const urls = require('../../server/emails/urls');

describe('renderNotificationContent', () => {
  const votingStartedData = {
    title: 'Annual Budget',
    votingDeadline: '2026-06-20T18:00:00.000Z',
    link: 'http://localhost:3001/#document/doc-1',
    organizationName: 'Acme Co',
    votingType: 'document',
  };

  test('renders voting_started with email subject and short body', () => {
    const content = renderNotificationContent('voting_started', votingStartedData, 'en', 'plain', 'immediate');

    expect(content.eventType).toBe('voting_started');
    expect(content.locale).toBe('en');
    expect(content.subject).toBe('Voting has started: Annual Budget');
    expect(content.title).toBe(content.subject);
    expect(content.body).toContain('Document voting');
    expect(content.body).toContain('Annual Budget');
    expect(content.body).toContain('Acme Co');
    expect(content.body).toMatch(/Deadline:/);
    expect(content.url).toBe('http://localhost:3001/#document/doc-1');
  });

  test('renders digest summary with count, frequency, and activity link', () => {
    const events = [
      { type: 'proposal_created', title: 'Proposal A' },
      { type: 'comment_added', title: 'Comment B' },
      { type: 'document_created', title: 'Doc C' },
    ];
    const content = renderNotificationContent(
      'digest_summary',
      { events, frequency: 'weekly' },
      'en',
      'plain',
      'digest'
    );

    expect(content.eventType).toBe('digest_summary');
    expect(content.subject).toBe('3 updates — weekly digest');
    expect(content.title).toBe('3 updates — weekly digest');
    expect(content.body).toContain('3 new updates');
    expect(content.url).toBe(urls.activity('weekly_digest'));
  });

  test('renders monthly digest activity link', () => {
    const content = renderNotificationContent(
      'digest_summary',
      { events: [{ type: 'proposal_created' }], frequency: 'monthly' },
      'en',
      'plain',
      'digest'
    );

    expect(content.subject).toBe('1 updates — monthly digest');
    expect(content.url).toBe(urls.activity('monthly_digest'));
  });

  test.each([
    ['voting_deadline_approaching', 'voting'],
    ['rule_proposal_deadline_approaching', 'rule_proposal'],
    ['election_deadline_approaching', 'election_voting'],
    ['election_nomination_deadline_approaching', 'election_nomination'],
  ])('renders %s deadline reminder', (eventType, deadlineType) => {
    const content = renderNotificationContent(eventType, {
      title: 'Board Election',
      deadline: '2026-06-25T12:00:00.000Z',
      deadlineType,
      link: 'http://localhost:3001/#/organization/org-1/governance',
      organizationName: 'Acme Co',
    }, 'en', 'plain', 'immediate');

    expect(content.eventType).toBe(eventType);
    expect(content.subject).toContain('Board Election');
    expect(content.body).toContain('Board Election');
    expect(content.body).toMatch(/Due |Deadline:/);
    expect(content.url).toContain('organization/org-1/governance');
  });

  test('covers all immediate event types without throwing', () => {
    for (const eventType of IMMEDIATE_EVENT_TYPES) {
      const content = renderNotificationContent(eventType, {
        title: 'Sample',
        deadline: '2026-06-25T12:00:00.000Z',
        votingDeadline: '2026-06-25T12:00:00.000Z',
        link: 'http://localhost:3001/#document/doc-1',
        votingType: 'document',
        deadlineType: DEADLINE_EVENT_TYPE_MAP[eventType],
      }, 'en', 'plain', 'immediate');

      expect(content.subject).toBeTruthy();
      expect(content.title).toBeTruthy();
      expect(content.body).toBeTruthy();
      expect(content.url).toBeTruthy();
      expect(content.eventType).toBe(eventType);
    }
  });

  test('falls back for unknown immediate event types', () => {
    const content = renderNotificationContent('custom_event', {
      title: 'Custom Title',
      message: 'Custom message',
      link: 'http://localhost:3001/#/activity',
    }, 'en', 'plain', 'immediate');

    expect(content.title).toBe('Custom Title');
    expect(content.body).toBe('Custom message');
  });
});

describe('telegramFormat', () => {
  test('escapeMarkdownV2 escapes special characters', () => {
    expect(escapeMarkdownV2('Hello *world*!')).toBe('Hello \\*world\\*\\!');
    expect(escapeMarkdownV2('a.b(c)')).toBe('a\\.b\\(c\\)');
  });

  test('escapeMarkdownV2Url escapes closing paren and backslash', () => {
    expect(escapeMarkdownV2Url('https://example.com/path)')).toBe('https://example.com/path\\)');
  });

  test('markdownV2Link builds escaped link', () => {
    expect(markdownV2Link('View *details*', 'https://example.com/a)b'))
      .toBe('[View \\*details\\*](https://example.com/a\\)b)');
  });
});
