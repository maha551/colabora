jest.mock('node-fetch', () => jest.fn());

jest.mock('../../server/config', () => ({
  TELEGRAM_ENABLED: true,
  TELEGRAM_BOT_TOKEN: 'test-bot-token',
  TELEGRAM_BOT_USERNAME: 'ColaboraBot',
  TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
  APP_NAME: 'Colabora',
  FRONTEND_URL: 'https://app.example.com',
}));

jest.mock('../../server/database/services/TransactionManager', () => ({
  query: jest.fn(),
  queryAll: jest.fn(),
  execute: jest.fn().mockResolvedValue({ changes: 1 }),
}));

jest.mock('../../server/modules/notificationChannels/channelPreferences', () => ({
  readChannelPreferences: jest.fn().mockResolvedValue({
    email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
    push: { enabled: false, immediate: true, digest: true },
    telegram: { enabled: true, immediate: true, digest: true },
  }),
  writeChannelPreferences: jest.fn().mockResolvedValue({
    email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
    push: { enabled: false, immediate: true, digest: true },
    telegram: { enabled: false, immediate: true, digest: true },
  }),
}));

const fetch = require('node-fetch');
const TransactionManager = require('../../server/database/services/TransactionManager');
const channelPreferences = require('../../server/modules/notificationChannels/channelPreferences');
const { writeChannelPreferences } = channelPreferences;

function loadTelegramChannel() {
  const channelPath = require.resolve('../../server/modules/notificationChannels/telegramChannel');
  delete require.cache[channelPath];
  const { clearChannels, registerChannel } = require('../../server/modules/notificationChannels/registry');
  clearChannels();
  const mod = require(channelPath);
  registerChannel(mod.telegramAdapter);
  return mod;
}

describe('Telegram Channel', () => {
  let telegramChannel;
  let getChannel;

  beforeEach(() => {
    jest.clearAllMocks();
    TransactionManager.execute.mockResolvedValue({ changes: 1 });
    channelPreferences.readChannelPreferences.mockResolvedValue({
      email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
      push: { enabled: false, immediate: true, digest: true },
      telegram: { enabled: true, immediate: true, digest: true },
    });
    channelPreferences.writeChannelPreferences.mockResolvedValue({
      email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
      push: { enabled: false, immediate: true, digest: true },
      telegram: { enabled: false, immediate: true, digest: true },
    });
    telegramChannel = loadTelegramChannel();
    ({ getChannel } = require('../../server/modules/notificationChannels/registry'));
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
  });

  describe('isConfigured', () => {
    test('returns true when Telegram env vars are set', () => {
      expect(telegramChannel.isConfigured()).toBe(true);
    });

    test('returns false when TELEGRAM_ENABLED is false', () => {
      const config = require('../../server/config');
      config.TELEGRAM_ENABLED = false;
      expect(telegramChannel.isConfigured()).toBe(false);
      config.TELEGRAM_ENABLED = true;
    });
  });

  describe('canDeliver', () => {
    const basePrefs = {
      email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
      push: { enabled: false, immediate: true, digest: true },
      telegram: { enabled: true, immediate: true, digest: true },
    };

    test('allows immediate when telegram enabled and immediate on', () => {
      expect(telegramChannel.canDeliver(basePrefs, 'immediate')).toBe(true);
    });

    test('blocks immediate when telegram disabled', () => {
      expect(telegramChannel.canDeliver({ ...basePrefs, telegram: { ...basePrefs.telegram, enabled: false } }, 'immediate')).toBe(false);
    });

    test('allows digest when telegram.digest is true', () => {
      expect(telegramChannel.canDeliver(basePrefs, 'digest')).toBe(true);
    });

    test('blocks digest when telegram.digest is false', () => {
      expect(telegramChannel.canDeliver({ ...basePrefs, telegram: { ...basePrefs.telegram, digest: false } }, 'digest')).toBe(false);
    });
  });

  describe('buildTelegramMessage', () => {
    test('builds immediate message with title, body, and url', () => {
      const text = telegramChannel.buildTelegramMessage({
        title: 'Voting started',
        body: 'Budget proposal is open for voting.',
        url: 'https://app.example.com/documents/abc',
        locale: 'en',
      }, 'immediate');

      expect(text).toContain('Voting started');
      expect(text).toContain('Budget proposal is open for voting.');
      expect(text).toContain('Open: https://app.example.com/documents/abc');
    });

    test('builds digest message under max length', () => {
      const text = telegramChannel.buildTelegramMessage({
        title: '12 updates in Colabora this week.',
        body: '12 updates in Colabora this week.',
        url: 'https://app.example.com/activity',
        locale: 'en',
      }, 'digest');

      expect(text.length).toBeLessThanOrEqual(telegramChannel.TELEGRAM_MAX_MESSAGE_LENGTH);
      expect(text).toContain('Open: https://app.example.com/activity');
    });

    test('truncates overly long messages', () => {
      const text = telegramChannel.buildTelegramMessage({
        title: 'x'.repeat(5000),
        body: 'y'.repeat(5000),
        url: 'https://app.example.com/activity',
        locale: 'en',
      }, 'immediate');

      expect(text.length).toBeLessThanOrEqual(telegramChannel.TELEGRAM_MAX_MESSAGE_LENGTH);
    });
  });

  describe('sendTelegramMessage', () => {
    test('calls Telegram Bot API sendMessage', async () => {
      await telegramChannel.sendTelegramMessage('12345', 'Hello');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-bot-token/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body).toEqual({
        chat_id: '12345',
        text: 'Hello',
        disable_web_page_preview: true,
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

    test('sends telegram message to linked chat', async () => {
      TransactionManager.query.mockResolvedValue({
        id: 'ep-1',
        user_id: user.id,
        channel: 'telegram',
        endpoint_data: { chatId: '999', username: 'jane_doe' },
      });

      await telegramChannel.deliverImmediate({}, user, content);

      expect(fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.chat_id).toBe('999');
      expect(body.text).toContain('Update');
      expect(body.text).toContain('Open: https://app.example.com/activity');
    });

    test('revokes endpoint when Telegram returns 403', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ ok: false, description: 'Forbidden: bot was blocked by the user' }),
      });

      TransactionManager.query.mockResolvedValue({
        id: 'ep-blocked',
        user_id: user.id,
        channel: 'telegram',
        endpoint_data: { chatId: '888', username: 'blocked_user' },
      });

      await telegramChannel.deliverImmediate({}, user, content);

      expect(TransactionManager.execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining('SET revoked_at = CURRENT_TIMESTAMP'),
        ['ep-blocked']
      );
      expect(writeChannelPreferences).toHaveBeenCalledWith({}, user.id, { telegram: { enabled: false } });
    });

    test('skips send when no active endpoint', async () => {
      TransactionManager.query.mockResolvedValue(null);
      await telegramChannel.deliverImmediate({}, user, content);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('deliverDigest', () => {
    test('sends digest formatted message', async () => {
      const user = { id: 'user-2' };
      TransactionManager.query.mockResolvedValue({
        id: 'ep-2',
        user_id: user.id,
        channel: 'telegram',
        endpoint_data: { chatId: '777' },
      });

      await telegramChannel.deliverDigest({}, user, {
        title: '3 updates in Colabora',
        body: 'You have 3 new updates.',
        url: 'https://app.example.com/activity',
        locale: 'en',
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.text).toContain('3 updates in Colabora');
    });
  });

  describe('createLinkToken', () => {
    test('stores token and returns deep link', async () => {
      const result = await telegramChannel.createLinkToken({}, 'user-1');

      expect(result.token).toMatch(/^link_[a-f0-9]+$/);
      expect(result.deepLink).toBe(`https://t.me/ColaboraBot?start=${result.token}`);
      expect(result.expiresAt).toBeDefined();
      expect(TransactionManager.execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining('INSERT INTO telegram_link_tokens'),
        expect.arrayContaining(['user-1'])
      );
    });
  });

  describe('getTelegramStatus', () => {
    test('reports linked status with username and enabled flag', async () => {
      TransactionManager.query.mockResolvedValue({
        id: 'ep-1',
        endpoint_data: { chatId: '123', username: 'jane_doe' },
      });

      await expect(telegramChannel.getTelegramStatus({}, 'user-1')).resolves.toEqual({
        linked: true,
        username: 'jane_doe',
        enabled: true,
      });
    });

    test('reports not linked when no endpoint', async () => {
      TransactionManager.query.mockResolvedValue(null);

      await expect(telegramChannel.getTelegramStatus({}, 'user-1')).resolves.toEqual({
        linked: false,
        username: null,
        enabled: false,
      });
    });
  });

  describe('disconnectTelegram', () => {
    test('revokes endpoint and disables telegram prefs', async () => {
      await telegramChannel.disconnectTelegram({}, 'user-1');

      expect(TransactionManager.execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining('SET revoked_at = CURRENT_TIMESTAMP'),
        ['user-1']
      );
      expect(writeChannelPreferences).toHaveBeenCalledWith({}, 'user-1', { telegram: { enabled: false } });
    });
  });

  describe('linkTelegramFromToken', () => {
    test('links chat to user from valid token', async () => {
      TransactionManager.query
        .mockResolvedValueOnce({
          token: 'link_abc',
          user_id: 'user-1',
          expires_at: new Date(Date.now() + 60000).toISOString(),
        })
        .mockResolvedValueOnce(null);

      const result = await telegramChannel.linkTelegramFromToken({}, 'link_abc', '555', 'telegram_user');

      expect(result.ok).toBe(true);
      expect(TransactionManager.execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining('INSERT INTO notification_channel_endpoints'),
        expect.arrayContaining(['user-1'])
      );
    });

    test('rejects expired token', async () => {
      TransactionManager.query.mockResolvedValueOnce({
        token: 'link_expired',
        user_id: 'user-1',
        expires_at: new Date(Date.now() - 60000).toISOString(),
      });

      const result = await telegramChannel.linkTelegramFromToken({}, 'link_expired', '555', null);

      expect(result.ok).toBe(false);
      expect(result.message).toContain('expired');
    });
  });

  describe('stopTelegramForChatId', () => {
    test('revokes endpoint and disables prefs for linked chat', async () => {
      TransactionManager.query.mockResolvedValue({
        id: 'ep-stop',
        user_id: 'user-9',
        endpoint_data: { chatId: '444' },
      });

      const result = await telegramChannel.stopTelegramForChatId({}, '444');

      expect(result.ok).toBe(true);
      expect(TransactionManager.execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining('SET revoked_at = CURRENT_TIMESTAMP'),
        ['ep-stop']
      );
      expect(writeChannelPreferences).toHaveBeenCalledWith({}, 'user-9', { telegram: { enabled: false } });
    });
  });

  describe('registry', () => {
    test('registers telegram channel adapter', () => {
      const channel = getChannel('telegram');
      expect(channel).toBeDefined();
      expect(channel.id).toBe('telegram');
      expect(typeof channel.deliverImmediate).toBe('function');
    });
  });
});

