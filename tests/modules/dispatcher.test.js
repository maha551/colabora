jest.mock('../../server/config', () => ({
  RESEND_API_KEY: 'test-key',
  NODE_ENV: 'test',
  WEB_PUSH_ENABLED: false,
  TELEGRAM_ENABLED: false,
  APP_NAME: 'Colabora',
}));

jest.mock('../../server/modules/emailService', () => ({
  sendImmediateNotification: jest.fn().mockResolvedValue({ id: 'msg-1' }),
  sendDigestEmail: jest.fn().mockResolvedValue({ id: 'msg-2' }),
}));

jest.mock('../../server/database/services/TransactionManager', () => ({
  query: jest.fn(),
  queryAll: jest.fn(),
  execute: jest.fn().mockResolvedValue({ changes: 1 }),
}));

const TransactionManager = require('../../server/database/services/TransactionManager');
const emailService = require('../../server/modules/emailService');
require('../../server/modules/notificationChannels/emailChannel');
const { dispatchImmediate, dispatchDigest } = require('../../server/modules/notificationChannels/dispatcher');

describe('Notification Dispatcher', () => {
  beforeEach(() => {
    emailService.sendImmediateNotification.mockClear();
    emailService.sendDigestEmail.mockClear();
    TransactionManager.query.mockReset();
  });

  describe('dispatchImmediate', () => {
    test('delivers to configured email channel when preferences allow', async () => {
      TransactionManager.query
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'user@example.com',
          name: 'User',
          preferences: null,
        })
        .mockResolvedValueOnce({
          email_enabled: true,
          immediate_notifications_enabled: true,
          digest_frequency: 'monthly',
          channel_preferences: null,
        });

      await dispatchImmediate({}, 'user-1', 'voting_started', {
        title: 'Budget proposal',
        votingType: 'simple',
        link: 'https://app.example.com/documents/abc',
      });

      expect(emailService.sendImmediateNotification).toHaveBeenCalledWith(
        'user@example.com',
        'voting_started',
        expect.objectContaining({ title: 'Budget proposal' }),
        expect.objectContaining({ locale: 'en' })
      );
    });

    test('skips delivery when email immediate is disabled', async () => {
      TransactionManager.query
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'user@example.com',
          name: 'User',
          preferences: null,
        })
        .mockResolvedValueOnce({
          email_enabled: true,
          immediate_notifications_enabled: false,
          digest_frequency: 'monthly',
          channel_preferences: JSON.stringify({
            email: { enabled: true, immediate: false, digestFrequency: 'monthly' },
            push: { enabled: false, immediate: true, digest: true },
            telegram: { enabled: false, immediate: true, digest: true },
          }),
        });

      await dispatchImmediate({}, 'user-1', 'voting_started', { title: 'Budget' });

      expect(emailService.sendImmediateNotification).not.toHaveBeenCalled();
    });
  });

  describe('dispatchDigest', () => {
    test('delivers digest to email channel with event payload attached', async () => {
      const events = [{ type: 'proposal_created', title: 'New proposal' }];

      TransactionManager.query
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'user@example.com',
          name: 'User',
          preferences: null,
        })
        .mockResolvedValueOnce({
          email_enabled: true,
          immediate_notifications_enabled: true,
          digest_frequency: 'weekly',
          channel_preferences: null,
        });

      await dispatchDigest({}, 'user-1', events, 'weekly');

      expect(emailService.sendDigestEmail).toHaveBeenCalledWith(
        'user@example.com',
        events,
        'weekly',
        expect.objectContaining({ locale: 'en' })
      );
    });

    test('skipChannels excludes email from digest dispatch', async () => {
      const events = [{ type: 'proposal_created', title: 'New proposal' }];

      TransactionManager.query
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'user@example.com',
          name: 'User',
          preferences: null,
        })
        .mockResolvedValueOnce({
          email_enabled: true,
          immediate_notifications_enabled: true,
          digest_frequency: 'weekly',
          channel_preferences: null,
        });

      await dispatchDigest({}, 'user-1', events, 'weekly', { skipChannels: ['email'] });

      expect(emailService.sendDigestEmail).not.toHaveBeenCalled();
    });
  });
});
