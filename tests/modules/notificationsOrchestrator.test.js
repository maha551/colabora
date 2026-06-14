jest.mock('../../server/config', () => ({
  RESEND_API_KEY: 'test-key',
  NODE_ENV: 'test',
  WEB_PUSH_ENABLED: true,
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:admin@example.com',
  TELEGRAM_ENABLED: true,
  TELEGRAM_BOT_TOKEN: 'test-bot-token',
  TELEGRAM_BOT_USERNAME: 'ColaboraBot',
  TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
}));

jest.mock('../../server/modules/emailService', () => ({
  sendImmediateNotification: jest.fn().mockResolvedValue({ id: 'msg-1' }),
  sendDigestEmail: jest.fn().mockResolvedValue({ id: 'msg-2' }),
  formatDeadlinesApproachingDigest: jest.fn(),
  sendDeadlinesDigestEmail: jest.fn(),
}));

jest.mock('../../server/database/services/TransactionManager', () => ({
  query: jest.fn(),
  queryAll: jest.fn(),
  execute: jest.fn().mockResolvedValue({ changes: 1 }),
}));

jest.mock('../../server/modules/notificationChannels/dispatcher', () => ({
  dispatchImmediate: jest.fn().mockResolvedValue(undefined),
  dispatchDigest: jest.fn().mockResolvedValue(undefined),
}));

require('../../server/modules/notificationChannels/emailChannel');
require('../../server/modules/notificationChannels/webPushChannel');
require('../../server/modules/notificationChannels/telegramChannel');

const TransactionManager = require('../../server/database/services/TransactionManager');
const { dispatchImmediate } = require('../../server/modules/notificationChannels/dispatcher');
const {
  shouldSendImmediateNotification,
  queueForDigest,
  sendImmediateNotificationIfEnabled,
  IMMEDIATE_EVENT_TYPES,
  DIGEST_EVENT_TYPES,
} = require('../../server/modules/notifications');

function mockChannelPreferencesRow(channelPreferences) {
  return {
    email_enabled: channelPreferences.email?.enabled !== false ? 1 : 0,
    immediate_notifications_enabled: channelPreferences.email?.immediate !== false ? 1 : 0,
    digest_frequency: channelPreferences.email?.digestFrequency || 'monthly',
    channel_preferences: JSON.stringify(channelPreferences),
  };
}

describe('Notifications orchestrator', () => {
  const userId = 'user-orchestrator-1';

  beforeEach(() => {
    TransactionManager.query.mockReset();
    TransactionManager.execute.mockReset();
    TransactionManager.execute.mockResolvedValue({ changes: 1 });
    dispatchImmediate.mockClear();
  });

  describe('shouldSendImmediateNotification', () => {
    test('returns true when only push is enabled for immediate events', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: false, immediate: true, digestFrequency: 'off' },
        push: { enabled: true, immediate: true, digest: false },
        telegram: { enabled: false, immediate: true, digest: false },
      }));

      const result = await shouldSendImmediateNotification({}, userId, 'voting_started');

      expect(result).toBe(true);
    });

    test('returns false when push is enabled but immediate is off', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: false, immediate: true, digestFrequency: 'off' },
        push: { enabled: true, immediate: false, digest: false },
        telegram: { enabled: false, immediate: true, digest: false },
      }));

      const result = await shouldSendImmediateNotification({}, userId, 'voting_started');

      expect(result).toBe(false);
    });

    test('returns false for non-immediate event types', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: false, immediate: true, digestFrequency: 'off' },
        push: { enabled: true, immediate: true, digest: false },
        telegram: { enabled: false, immediate: true, digest: false },
      }));

      const result = await shouldSendImmediateNotification({}, userId, 'proposal_created');

      expect(result).toBe(false);
    });

    test('covers all immediate event types', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: false, immediate: true, digestFrequency: 'off' },
        push: { enabled: true, immediate: true, digest: false },
        telegram: { enabled: false, immediate: true, digest: false },
      }));

      for (const eventType of IMMEDIATE_EVENT_TYPES) {
        const result = await shouldSendImmediateNotification({}, userId, eventType);
        expect(result).toBe(true);
      }
    });
  });

  describe('queueForDigest', () => {
    test('queues when push digest is enabled but email digest is off', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: true, immediate: false, digestFrequency: 'off' },
        push: { enabled: true, immediate: false, digest: true },
        telegram: { enabled: false, immediate: false, digest: false },
      }));

      await queueForDigest({}, userId, 'proposal_created', { title: 'New proposal' });

      const digestInsert = TransactionManager.execute.mock.calls.find(
        ([, sql]) => typeof sql === 'string' && sql.includes('notification_digest_queue')
      );
      expect(digestInsert).toBeDefined();
      expect(digestInsert[2]).toEqual(
        expect.arrayContaining([userId, 'proposal_created', expect.any(String)])
      );
    });

    test('queues when telegram digest is enabled but email digest is off', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: false, immediate: false, digestFrequency: 'off' },
        push: { enabled: false, immediate: false, digest: false },
        telegram: { enabled: true, immediate: false, digest: true },
      }));

      await queueForDigest({}, userId, 'comment_added', { title: 'New comment' });

      const digestInsert = TransactionManager.execute.mock.calls.find(
        ([, sql]) => typeof sql === 'string' && sql.includes('notification_digest_queue')
      );
      expect(digestInsert).toBeDefined();
    });

    test('does not queue when all channels have digest disabled', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: true, immediate: true, digestFrequency: 'off' },
        push: { enabled: true, immediate: true, digest: false },
        telegram: { enabled: true, immediate: true, digest: false },
      }));

      await queueForDigest({}, userId, 'proposal_created', { title: 'New proposal' });

      const digestInsert = TransactionManager.execute.mock.calls.find(
        ([, sql]) => typeof sql === 'string' && sql.includes('notification_digest_queue')
      );
      expect(digestInsert).toBeUndefined();
    });

    test('skips non-digest event types', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: true, immediate: true, digestFrequency: 'weekly' },
        push: { enabled: true, immediate: true, digest: true },
        telegram: { enabled: true, immediate: true, digest: true },
      }));

      await queueForDigest({}, userId, 'voting_started', { title: 'Vote now' });

      const digestInsert = TransactionManager.execute.mock.calls.find(
        ([, sql]) => typeof sql === 'string' && sql.includes('notification_digest_queue')
      );
      expect(digestInsert).toBeUndefined();
    });

    test('covers all digest event types', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: false, immediate: false, digestFrequency: 'off' },
        push: { enabled: true, immediate: false, digest: true },
        telegram: { enabled: false, immediate: false, digest: false },
      }));

      for (const eventType of DIGEST_EVENT_TYPES) {
        TransactionManager.execute.mockClear();
        await queueForDigest({}, userId, eventType, { title: `Event ${eventType}` });

        const digestInsert = TransactionManager.execute.mock.calls.find(
          ([, sql]) => typeof sql === 'string' && sql.includes('notification_digest_queue')
        );
        expect(digestInsert).toBeDefined();
      }
    });
  });

  describe('sendImmediateNotificationIfEnabled', () => {
    test('dispatches when only push immediate is enabled', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: false, immediate: true, digestFrequency: 'off' },
        push: { enabled: true, immediate: true, digest: false },
        telegram: { enabled: false, immediate: true, digest: false },
      }));

      await sendImmediateNotificationIfEnabled({}, userId, 'voting_started', { title: 'Budget vote' });

      expect(dispatchImmediate).toHaveBeenCalledWith(
        {},
        userId,
        'voting_started',
        expect.objectContaining({ title: 'Budget vote' })
      );
    });

    test('skips dispatch when no channel can deliver immediately', async () => {
      TransactionManager.query.mockResolvedValue(mockChannelPreferencesRow({
        email: { enabled: false, immediate: true, digestFrequency: 'off' },
        push: { enabled: true, immediate: false, digest: false },
        telegram: { enabled: false, immediate: true, digest: false },
      }));

      await sendImmediateNotificationIfEnabled({}, userId, 'voting_started', { title: 'Budget vote' });

      expect(dispatchImmediate).not.toHaveBeenCalled();
    });
  });
});
