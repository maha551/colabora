jest.mock('../../server/database/services/TransactionManager', () => ({
  query: jest.fn(),
  queryAll: jest.fn(),
  execute: jest.fn().mockResolvedValue({ changes: 1 }),
}));

const TransactionManager = require('../../server/database/services/TransactionManager');
const {
  channelPreferencesFromLegacyRow,
  legacyColumnsFromChannelPreferences,
  mergeChannelPreferences,
  writeChannelPreferences,
  readChannelPreferences,
} = require('../../server/modules/notificationChannels/channelPreferences');

describe('channelPreferences dual-sync', () => {
  beforeEach(() => {
    TransactionManager.query.mockReset();
    TransactionManager.execute.mockReset();
    TransactionManager.execute.mockResolvedValue({ changes: 1 });
  });

  test('channelPreferencesFromLegacyRow maps legacy email columns', () => {
    const prefs = channelPreferencesFromLegacyRow({
      email_enabled: 0,
      immediate_notifications_enabled: 0,
      digest_frequency: 'weekly',
    });

    expect(prefs.email).toEqual({
      enabled: false,
      immediate: false,
      digestFrequency: 'weekly',
    });
  });

  test('legacyColumnsFromChannelPreferences mirrors email channel prefs', () => {
    const legacy = legacyColumnsFromChannelPreferences({
      email: { enabled: false, immediate: false, digestFrequency: 'off' },
      push: { enabled: true, immediate: true, digest: true },
      telegram: { enabled: true, immediate: false, digest: true },
    });

    expect(legacy).toEqual({
      email_enabled: false,
      immediate_notifications_enabled: false,
      digest_frequency: 'off',
    });
  });

  test('mergeChannelPreferences deep-merges per channel', () => {
    const merged = mergeChannelPreferences(
      {
        email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
        push: { enabled: false, immediate: true, digest: true },
        telegram: { enabled: false, immediate: true, digest: true },
      },
      {
        push: { enabled: true },
        telegram: { digest: false },
      }
    );

    expect(merged.push.enabled).toBe(true);
    expect(merged.telegram.digest).toBe(false);
    expect(merged.email.digestFrequency).toBe('monthly');
  });

  test('writeChannelPreferences persists JSONB and syncs legacy columns', async () => {
    TransactionManager.query.mockResolvedValue({
      email_enabled: 1,
      immediate_notifications_enabled: 1,
      digest_frequency: 'monthly',
      channel_preferences: JSON.stringify({
        email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
        push: { enabled: false, immediate: true, digest: true },
        telegram: { enabled: false, immediate: true, digest: true },
      }),
    });

    const merged = await writeChannelPreferences({}, 'user-1', {
      email: { enabled: false, digestFrequency: 'off' },
      push: { enabled: true, immediate: false, digest: true },
    });

    expect(merged.email.enabled).toBe(false);
    expect(merged.email.digestFrequency).toBe('off');
    expect(merged.push.enabled).toBe(true);

    expect(TransactionManager.execute).toHaveBeenCalledWith(
      {},
      expect.stringContaining('channel_preferences'),
      expect.arrayContaining([
        expect.any(String),
        false,
        true,
        'off',
        'user-1',
      ])
    );
  });

  test('readChannelPreferences prefers JSONB over legacy columns', async () => {
    TransactionManager.query.mockResolvedValue({
      email_enabled: 1,
      immediate_notifications_enabled: 1,
      digest_frequency: 'monthly',
      channel_preferences: JSON.stringify({
        email: { enabled: false, immediate: false, digestFrequency: 'off' },
        push: { enabled: true, immediate: true, digest: true },
        telegram: { enabled: false, immediate: true, digest: true },
      }),
    });

    const prefs = await readChannelPreferences({}, 'user-1');

    expect(prefs.email.enabled).toBe(false);
    expect(prefs.push.enabled).toBe(true);
  });
});
