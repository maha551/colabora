const mockSetVapidDetails = jest.fn();
const mockSendNotification = jest.fn().mockResolvedValue(undefined);

jest.mock('web-push', () => ({
  setVapidDetails: (...args) => mockSetVapidDetails(...args),
  sendNotification: (...args) => mockSendNotification(...args),
}));

jest.mock('../../server/config', () => ({
  WEB_PUSH_ENABLED: true,
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:admin@example.com',
}));

jest.mock('../../server/database/services/TransactionManager', () => ({
  query: jest.fn(),
  queryAll: jest.fn(),
  execute: jest.fn().mockResolvedValue({ changes: 1 }),
}));

const TransactionManager = require('../../server/database/services/TransactionManager');
const { getChannel } = require('../../server/modules/notificationChannels/registry');
const {
  isConfigured,
  canDeliver,
  getVapidPublicKeyStatus,
  buildPushPayload,
  deliverImmediate,
  deliverDigest,
  savePushSubscription,
  revokeEndpoint,
  getPushSubscriptionStatus,
} = require('../../server/modules/notificationChannels/webPushChannel');

describe('Web Push Channel', () => {
  beforeEach(() => {
    mockSetVapidDetails.mockClear();
    mockSendNotification.mockClear();
    mockSendNotification.mockResolvedValue(undefined);
    TransactionManager.query.mockReset();
    TransactionManager.queryAll.mockReset();
    TransactionManager.execute.mockReset();
    TransactionManager.execute.mockResolvedValue({ changes: 1 });
  });

  describe('isConfigured', () => {
    test('returns true when WEB_PUSH_ENABLED and VAPID keys are set', () => {
      expect(isConfigured()).toBe(true);
    });

    test('returns false when WEB_PUSH_ENABLED is false', () => {
      const config = require('../../server/config');
      config.WEB_PUSH_ENABLED = false;
      expect(isConfigured()).toBe(false);
      config.WEB_PUSH_ENABLED = true;
    });
  });

  describe('getVapidPublicKeyStatus', () => {
    test('returns enabled public key when configured', () => {
      expect(getVapidPublicKeyStatus()).toEqual({
        enabled: true,
        publicKey: 'test-public-key',
      });
    });
  });

  describe('canDeliver', () => {
    const basePrefs = {
      email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
      push: { enabled: true, immediate: true, digest: true },
      telegram: { enabled: false, immediate: true, digest: true },
    };

    test('allows immediate when push enabled and immediate on', () => {
      expect(canDeliver(basePrefs, 'immediate')).toBe(true);
    });

    test('blocks immediate when push disabled', () => {
      expect(canDeliver({ ...basePrefs, push: { ...basePrefs.push, enabled: false } }, 'immediate')).toBe(false);
    });

    test('blocks immediate when push.immediate is false', () => {
      expect(canDeliver({ ...basePrefs, push: { ...basePrefs.push, immediate: false } }, 'immediate')).toBe(false);
    });

    test('allows digest when push.digest is true', () => {
      expect(canDeliver(basePrefs, 'digest')).toBe(true);
    });

    test('blocks digest when push.digest is false', () => {
      expect(canDeliver({ ...basePrefs, push: { ...basePrefs.push, digest: false } }, 'digest')).toBe(false);
    });
  });

  describe('buildPushPayload', () => {
    test('builds payload with eventType as tag', () => {
      const payload = buildPushPayload({
        title: 'Voting started',
        body: 'Budget proposal is open.',
        url: 'https://app.example.com/documents/abc',
        locale: 'en',
        eventType: 'voting_started',
      }, 'immediate');

      expect(payload).toEqual({
        title: 'Voting started',
        body: 'Budget proposal is open.',
        url: 'https://app.example.com/documents/abc',
        tag: 'voting_started',
        eventType: 'voting_started',
      });
    });
  });

  describe('deliverImmediate', () => {
    const user = { id: 'user-1', email: 'user@example.com' };
    const content = {
      title: 'Update',
      body: 'Something happened',
      url: 'https://app.example.com/activity',
      locale: 'en',
      eventType: 'test_event',
    };

    test('sends push to all active endpoints', async () => {
      TransactionManager.queryAll.mockResolvedValue([
        {
          id: 'ep-1',
          user_id: user.id,
          channel: 'push',
          endpoint_data: {
            endpoint: 'https://push.example/1',
            p256dh: 'key1',
            auth: 'auth1',
          },
        },
      ]);

      await deliverImmediate({}, user, content);

      expect(mockSetVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@example.com',
        'test-public-key',
        'test-private-key'
      );
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      expect(mockSendNotification).toHaveBeenCalledWith(
        {
          endpoint: 'https://push.example/1',
          keys: { p256dh: 'key1', auth: 'auth1' },
        },
        JSON.stringify({
          title: 'Update',
          body: 'Something happened',
          url: 'https://app.example.com/activity',
          tag: 'test_event',
          eventType: 'test_event',
        }),
        { TTL: 3600 }
      );
    });

    test('revokes endpoint on 410 response', async () => {
      const goneError = new Error('Gone');
      goneError.statusCode = 410;
      mockSendNotification.mockRejectedValueOnce(goneError);

      TransactionManager.queryAll.mockResolvedValue([
        {
          id: 'ep-stale',
          user_id: user.id,
          channel: 'push',
          endpoint_data: {
            endpoint: 'https://push.example/stale',
            p256dh: 'key1',
            auth: 'auth1',
          },
        },
      ]);

      await deliverImmediate({}, user, content);

      expect(TransactionManager.execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining('SET revoked_at = CURRENT_TIMESTAMP'),
        ['ep-stale']
      );
    });

    test('skips send when no active endpoints', async () => {
      TransactionManager.queryAll.mockResolvedValue([]);
      await deliverImmediate({}, user, content);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });

  describe('deliverDigest', () => {
    test('uses digest TTL and default eventType', async () => {
      const user = { id: 'user-2' };
      TransactionManager.queryAll.mockResolvedValue([
        {
          id: 'ep-2',
          user_id: user.id,
          channel: 'push',
          endpoint_data: {
            endpoint: 'https://push.example/2',
            p256dh: 'key2',
            auth: 'auth2',
          },
        },
      ]);

      await deliverDigest({}, user, {
        title: '3 updates',
        body: 'Weekly digest',
        url: 'https://app.example.com/activity',
        locale: 'en',
      });

      expect(mockSendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('"eventType":"digest_summary"'),
        { TTL: 86400 }
      );
    });
  });

  describe('subscription helpers', () => {
    test('savePushSubscription inserts new endpoint', async () => {
      TransactionManager.query.mockResolvedValue(null);

      const endpointId = await savePushSubscription({}, 'user-1', {
        endpoint: 'https://push.example/new',
        keys: { p256dh: 'p256', auth: 'auth' },
      }, 'TestAgent/1.0');

      expect(endpointId).toBeDefined();
      expect(TransactionManager.execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining('INSERT INTO notification_channel_endpoints'),
        expect.arrayContaining(['user-1'])
      );
    });

    test('savePushSubscription updates existing active endpoint', async () => {
      TransactionManager.query.mockResolvedValue({ id: 'existing-id' });

      const endpointId = await savePushSubscription({}, 'user-1', {
        endpoint: 'https://push.example/existing',
        keys: { p256dh: 'p256', auth: 'auth' },
      });

      expect(endpointId).toBe('existing-id');
      expect(TransactionManager.execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining('UPDATE notification_channel_endpoints'),
        expect.arrayContaining(['existing-id'])
      );
    });

    test('revokeEndpoint soft-revokes matching endpoint', async () => {
      await revokeEndpoint({}, 'user-1', 'https://push.example/revoke');

      expect(TransactionManager.execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining('SET revoked_at = CURRENT_TIMESTAMP'),
        ['user-1', 'https://push.example/revoke']
      );
    });

    test('getPushSubscriptionStatus reports subscription count', async () => {
      TransactionManager.query.mockResolvedValue({ count: 2 });

      await expect(getPushSubscriptionStatus({}, 'user-1')).resolves.toEqual({
        subscribed: true,
        endpointCount: 2,
      });
    });
  });

  describe('registry', () => {
    test('registers push channel adapter', () => {
      const channel = getChannel('push');
      expect(channel).toBeDefined();
      expect(channel.id).toBe('push');
      expect(typeof channel.deliverImmediate).toBe('function');
    });
  });
});
