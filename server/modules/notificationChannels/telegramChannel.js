/**
 * Telegram notification channel adapter.
 */

const crypto = require('crypto');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const TransactionManager = require('../../database/services/TransactionManager');
const { logger } = require('../../middleware/logger');
const { registerChannel } = require('./registry');
const { readChannelPreferences, writeChannelPreferences } = require('./channelPreferences');

const CHANNEL_ID = 'telegram';
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * @returns {boolean}
 */
function isConfigured() {
  return Boolean(
    config.TELEGRAM_ENABLED
    && config.TELEGRAM_BOT_TOKEN
    && config.TELEGRAM_BOT_USERNAME
    && config.TELEGRAM_WEBHOOK_SECRET
  );
}

/**
 * @param {import('./types').ChannelPreferencesMap} prefs
 * @param {import('./types').NotificationKind} kind
 * @returns {boolean}
 */
function canDeliver(prefs, kind) {
  const telegram = prefs?.telegram;
  if (!telegram?.enabled) {
    return false;
  }
  if (kind === 'immediate') {
    return telegram.immediate !== false;
  }
  if (kind === 'digest') {
    return telegram.digest !== false;
  }
  return false;
}

/**
 * @param {unknown} value
 * @returns {import('./types').TelegramEndpointData}
 */
function parseEndpointData(value) {
  if (!value) {
    return { chatId: '' };
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return { chatId: '' };
    }
  }
  return /** @type {import('./types').TelegramEndpointData} */ (value);
}

/**
 * @param {import('./types').NotificationContent} content
 * @param {'immediate'|'digest'} kind
 * @returns {string}
 */
function buildTelegramMessage(content, kind) {
  const lines = [];
  if (content.title) {
    lines.push(content.title);
  }
  if (kind === 'immediate' && content.body && content.body !== content.title) {
    lines.push('');
    lines.push(content.body);
  } else if (kind === 'digest' && content.body) {
    lines.push(content.body);
  }
  if (content.url) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(`Open: ${content.url}`);
  }
  let text = lines.join('\n').trim();
  if (text.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
    text = `${text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 1)}…`;
  }
  return text;
}

/**
 * @param {string|number} chatId
 * @param {string} text
 * @returns {Promise<{ ok: boolean, statusCode?: number, description?: string }>}
 */
async function sendTelegramMessage(chatId, text) {
  if (!config.TELEGRAM_BOT_TOKEN) {
    return { ok: false, description: 'Telegram bot token not configured' };
  }

  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || !body?.ok) {
    return {
      ok: false,
      statusCode: response.status,
      description: body?.description || response.statusText,
    };
  }

  return { ok: true };
}

/**
 * @param {object} knex
 * @param {string} userId
 * @returns {Promise<import('./types').ChannelEndpointRow|null>}
 */
async function loadActiveTelegramEndpoint(knex, userId) {
  return TransactionManager.query(knex, `
    SELECT id, user_id, channel, endpoint_data, verified_at, revoked_at, created_at
    FROM notification_channel_endpoints
    WHERE user_id = ?
      AND channel = 'telegram'
      AND revoked_at IS NULL
  `, [userId]);
}

/**
 * @param {object} knex
 * @param {string} endpointId
 */
async function revokeEndpointById(knex, endpointId) {
  await TransactionManager.execute(knex, `
    UPDATE notification_channel_endpoints
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ? AND revoked_at IS NULL
  `, [endpointId]);
}

/**
 * @param {object} knex
 * @param {string} userId
 */
async function revokeTelegramEndpointForUser(knex, userId) {
  await TransactionManager.execute(knex, `
    UPDATE notification_channel_endpoints
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
      AND channel = 'telegram'
      AND revoked_at IS NULL
  `, [userId]);
}

/**
 * @param {object} knex
 * @param {object} user
 * @param {import('./types').NotificationContent} content
 * @param {'immediate'|'digest'} kind
 */
async function deliverToUser(knex, user, content, kind) {
  if (!isConfigured()) {
    return;
  }

  const endpointRow = await loadActiveTelegramEndpoint(knex, user.id);
  if (!endpointRow) {
    return;
  }

  const data = parseEndpointData(endpointRow.endpoint_data);
  if (data.chatId === undefined || data.chatId === null || data.chatId === '') {
    logger.warn('Skipping telegram delivery for endpoint with missing chatId', {
      endpointId: endpointRow.id,
      userId: user.id,
    });
    return;
  }

  const text = buildTelegramMessage(content, kind);
  if (!text) {
    return;
  }

  try {
    const result = await sendTelegramMessage(data.chatId, text);
    if (!result.ok) {
      const blocked = result.statusCode === 403
        || (result.description && /blocked|deactivated|not found/i.test(result.description));
      if (blocked) {
        logger.info('Revoking telegram endpoint after delivery failure', {
          endpointId: endpointRow.id,
          userId: user.id,
          description: result.description,
        });
        await revokeEndpointById(knex, endpointRow.id);
        await writeChannelPreferences(knex, user.id, { telegram: { enabled: false } });
      } else {
        throw new Error(result.description || 'Telegram send failed');
      }
    }
  } catch (error) {
    logger.error('Telegram delivery failed', {
      userId: user.id,
      endpointId: endpointRow.id,
      kind,
      error: error.message,
    });
    throw error;
  }
}

/**
 * @param {object} knex
 * @param {object} user
 * @param {import('./types').NotificationContent} content
 */
async function deliverImmediate(knex, user, content) {
  await deliverToUser(knex, user, content, 'immediate');
}

/**
 * @param {object} knex
 * @param {object} user
 * @param {import('./types').NotificationContent} content
 */
async function deliverDigest(knex, user, content) {
  await deliverToUser(knex, user, content, 'digest');
}

/**
 * @param {object} knex
 * @param {string} userId
 */
async function revokeEndpoint(knex, userId) {
  await revokeTelegramEndpointForUser(knex, userId);
}

/**
 * @param {object} knex
 * @param {string} userId
 * @returns {Promise<{ token: string, deepLink: string, expiresAt: string }>}
 */
async function createLinkToken(knex, userId) {
  const token = `link_${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);

  await TransactionManager.execute(knex, `
    DELETE FROM telegram_link_tokens
    WHERE user_id = ? OR expires_at <= CURRENT_TIMESTAMP
  `, [userId]);

  await TransactionManager.execute(knex, `
    INSERT INTO telegram_link_tokens (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `, [token, userId, expiresAt.toISOString()]);

  const deepLink = `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${token}`;
  return {
    token,
    deepLink,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * @param {object} knex
 * @param {string} userId
 * @returns {Promise<{ linked: boolean, username: string|null, enabled: boolean }>}
 */
async function getTelegramStatus(knex, userId) {
  const [endpoint, prefs] = await Promise.all([
    loadActiveTelegramEndpoint(knex, userId),
    readChannelPreferences(knex, userId),
  ]);

  if (!endpoint) {
    return {
      linked: false,
      username: null,
      enabled: false,
    };
  }

  const data = parseEndpointData(endpoint.endpoint_data);
  return {
    linked: true,
    username: data.username || null,
    enabled: prefs.telegram?.enabled === true,
  };
}

/**
 * @param {object} knex
 * @param {string} userId
 */
async function disconnectTelegram(knex, userId) {
  await revokeTelegramEndpointForUser(knex, userId);
  await writeChannelPreferences(knex, userId, { telegram: { enabled: false } });
}

/**
 * @param {object} knex
 * @param {string|number} chatId
 * @returns {Promise<import('./types').ChannelEndpointRow|null>}
 */
async function findActiveEndpointByChatId(knex, chatId) {
  return TransactionManager.query(knex, `
    SELECT id, user_id, channel, endpoint_data, verified_at, revoked_at, created_at
    FROM notification_channel_endpoints
    WHERE channel = 'telegram'
      AND revoked_at IS NULL
      AND endpoint_data->>'chatId' = ?
  `, [String(chatId)]);
}

/**
 * @param {object} knex
 * @param {string} token
 * @param {string|number} chatId
 * @param {string|null} username
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function linkTelegramFromToken(knex, token, chatId, username) {
  const tokenRow = await TransactionManager.query(knex, `
    SELECT token, user_id, expires_at
    FROM telegram_link_tokens
    WHERE token = ?
  `, [token]);

  if (!tokenRow) {
    return { ok: false, message: 'This link token is invalid or has already been used. Generate a new link in Colabora settings.' };
  }

  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    await TransactionManager.execute(knex, 'DELETE FROM telegram_link_tokens WHERE token = ?', [token]);
    return { ok: false, message: 'This link token has expired. Generate a new link in Colabora settings.' };
  }

  const existingChat = await findActiveEndpointByChatId(knex, chatId);
  if (existingChat && existingChat.user_id !== tokenRow.user_id) {
    return { ok: false, message: 'This Telegram account is already linked to another Colabora user.' };
  }

  await revokeTelegramEndpointForUser(knex, tokenRow.user_id);

  const endpointData = JSON.stringify({
    chatId: String(chatId),
    username: username || null,
  });

  const endpointId = uuidv4();
  await TransactionManager.execute(knex, `
    INSERT INTO notification_channel_endpoints (id, user_id, channel, endpoint_data, verified_at)
    VALUES (?, ?, 'telegram', ?::jsonb, CURRENT_TIMESTAMP)
  `, [endpointId, tokenRow.user_id, endpointData]);

  await TransactionManager.execute(knex, 'DELETE FROM telegram_link_tokens WHERE token = ?', [token]);

  return {
    ok: true,
    message: 'Your Telegram account is now linked to Colabora. Enable Telegram notifications in your notification settings to start receiving alerts.',
  };
}

/**
 * @param {object} knex
 * @param {string|number} chatId
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function stopTelegramForChatId(knex, chatId) {
  const endpoint = await findActiveEndpointByChatId(knex, chatId);
  if (!endpoint) {
    return { ok: true, message: 'You are not linked to Colabora. Open Colabora settings to connect Telegram.' };
  }

  await revokeEndpointById(knex, endpoint.id);
  await writeChannelPreferences(knex, endpoint.user_id, { telegram: { enabled: false } });

  return { ok: true, message: 'Telegram notifications from Colabora have been turned off. You can link again anytime from Colabora settings.' };
}

/** @type {import('./types').ChannelAdapter} */
const telegramAdapter = {
  id: CHANNEL_ID,
  isConfigured,
  canDeliver,
  deliverImmediate,
  deliverDigest,
  revokeEndpoint,
};

registerChannel(telegramAdapter);

module.exports = {
  telegramAdapter,
  isConfigured,
  canDeliver,
  buildTelegramMessage,
  sendTelegramMessage,
  deliverImmediate,
  deliverDigest,
  revokeEndpoint,
  createLinkToken,
  getTelegramStatus,
  disconnectTelegram,
  linkTelegramFromToken,
  stopTelegramForChatId,
  loadActiveTelegramEndpoint,
  findActiveEndpointByChatId,
  LINK_TOKEN_TTL_MS,
  TELEGRAM_MAX_MESSAGE_LENGTH,
};
