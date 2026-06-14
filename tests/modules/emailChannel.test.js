jest.mock('../../server/config', () => ({
  RESEND_API_KEY: 'test-key',
  NODE_ENV: 'test',
}));

jest.mock('../../server/modules/emailService', () => ({
  sendImmediateNotification: jest.fn().mockResolvedValue({ id: 'msg-1' }),
  sendDigestEmail: jest.fn().mockResolvedValue({ id: 'msg-2' }),
}));

const emailService = require('../../server/modules/emailService');
const { getChannel } = require('../../server/modules/notificationChannels/registry');
const {
  isConfigured,
  canDeliver,
  deliverImmediate,
  deliverDigest,
} = require('../../server/modules/notificationChannels/emailChannel');

describe('Email Channel', () => {
  beforeEach(() => {
    emailService.sendImmediateNotification.mockClear();
    emailService.sendDigestEmail.mockClear();
  });

  test('registers email adapter in registry', () => {
    expect(getChannel('email')).toBeDefined();
    expect(getChannel('email').id).toBe('email');
  });

  describe('isConfigured', () => {
    test('returns true when RESEND_API_KEY is set', () => {
      expect(isConfigured()).toBe(true);
    });
  });

  describe('canDeliver', () => {
    const basePrefs = {
      email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
      push: { enabled: false, immediate: true, digest: true },
      telegram: { enabled: false, immediate: true, digest: true },
    };

    test('allows immediate when email enabled and immediate on', () => {
      expect(canDeliver(basePrefs, 'immediate')).toBe(true);
    });

    test('blocks immediate when email disabled', () => {
      expect(canDeliver({ ...basePrefs, email: { ...basePrefs.email, enabled: false } }, 'immediate')).toBe(false);
    });

    test('allows digest when digestFrequency is not off', () => {
      expect(canDeliver(basePrefs, 'digest')).toBe(true);
    });

    test('blocks digest when digestFrequency is off', () => {
      expect(canDeliver({ ...basePrefs, email: { ...basePrefs.email, digestFrequency: 'off' } }, 'digest')).toBe(false);
    });
  });

  describe('deliverImmediate', () => {
    test('calls sendImmediateNotification with event data from content', async () => {
      const user = { id: 'user-1', email: 'user@example.com' };
      const content = {
        eventType: 'voting_started',
        locale: 'en',
        rawEventData: { title: 'Budget', votingType: 'simple' },
      };

      await deliverImmediate({}, user, content);

      expect(emailService.sendImmediateNotification).toHaveBeenCalledWith(
        'user@example.com',
        'voting_started',
        { title: 'Budget', votingType: 'simple' },
        { locale: 'en' }
      );
    });

    test('skips when user has no email', async () => {
      await deliverImmediate({}, { id: 'user-1' }, { eventType: 'voting_started' });
      expect(emailService.sendImmediateNotification).not.toHaveBeenCalled();
    });
  });

  describe('deliverDigest', () => {
    test('calls sendDigestEmail with digest events from content', async () => {
      const user = { id: 'user-1', email: 'user@example.com' };
      const events = [{ type: 'proposal_created', title: 'New proposal' }];

      await deliverDigest({}, user, {
        digestEvents: events,
        digestFrequency: 'weekly',
        locale: 'en',
      });

      expect(emailService.sendDigestEmail).toHaveBeenCalledWith(
        'user@example.com',
        events,
        'weekly',
        { locale: 'en' }
      );
    });

    test('skips when no digest events', async () => {
      await deliverDigest({}, { id: 'user-1', email: 'user@example.com' }, { digestEvents: [] });
      expect(emailService.sendDigestEmail).not.toHaveBeenCalled();
    });
  });
});
