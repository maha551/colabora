/**
 * Web Push notification channel adapter.
 */

const webpush = require('web-push');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const TransactionManager = require('../../database/services/TransactionManager');
const { logger } = require('../../middleware/logger');
const { registerChannel } = require('./registry');

const CHANNEL_ID = 'push';

/**
 * @returns {boolean}
 */
function isConfigured() {
  return Boolean(
    config.WEB_PUSH_ENABLED
    && config.VAPID_PUBLIC_KEY
    && config.VAPID_PRIVATE_KEY
    && config.VAPID_SUBJECT
  );
}

/**
 * @returns {{ enabled: boolean, publicKey: string|null }}
 */
function getVapidPublicKeyStatus() {
  if (!isConfigured()) {
    return { enabled: false, publicKey: null };
  }
  return { enabled: true, publicKey: config.VAPID_PUBLIC_KEY };
}

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (!isConfigured()) {
    return false;
  }
  if (!vapidConfigured) {
    webpush.setVapidDetails(
      config.VAPID_SUBJECT,
      config.VAPID_PUBLIC_KEY,
      config.VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
  }
  return true;
}

/**
 * @param {import('./types').ChannelPreferencesMap} prefs
 * @param {import('./types').NotificationKind} kind
 * @returns {boolean}
 */
function canDeliver(prefs, kind) {
  const push = prefs?.push;
  if (!push?.enabled) {
    return false;
  }
  if (kind === 'immediate') {
    return push.immediate !== false;
  }
  if (kind === 'digest') {
    return push.digest !== false;
  }
  return false;
}

/**
 * @param {unknown} value
 * @returns {import('./types').PushEndpointData}
 */
function parseEndpointData(value) {
  if (!value) {
    return { endpoint: '', p256dh: '', auth: '' };
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return { endpoint: '', p256dh: '', auth: '' };
    }
  }
  return /** @type {import('./types').PushEndpointData} */ (value);
}

/**
 * @param {object} knex
 * @param {string} userId
 * @returns {Promise<import('./types').ChannelEndpointRow[]>}
 */
async function loadActivePushEndpoints(knex, userId) {
  return TransactionManager.queryAll(knex, `
    SELECT id, user_id, channel, endpoint_data, verified_at, revoked_at, created_at
    FROM notification_channel_endpoints
    WHERE user_id = ?
      AND channel = 'push'
      AND revoked_at IS NULL
  `, [userId]);
}

/**
 * @param {import('./types').NotificationContent} content
 * @param {'immediate'|'digest'} kind
 * @returns {{ title: string, body: string, url: string, tag: string, eventType: string }}
 */
function buildPushPayload(content, kind) {
  const eventType = content.eventType || (kind === 'digest' ? 'digest_summary' : 'notification');
  return {
    title: content.title,
    body: content.body,
    url: content.url,
    tag: eventType,
    eventType,
  };
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
 * @param {import('./types').ChannelEndpointRow} endpointRow
 * @param {object} payload
 * @param {'immediate'|'digest'} kind
 */
async function sendToEndpoint(knex, endpointRow, payload, kind) {
  const data = parseEndpointData(endpointRow.endpoint_data);
  if (!data.endpoint || !data.p256dh || !data.auth) {
    logger.warn('Skipping push endpoint with incomplete subscription data', {
      endpointId: endpointRow.id,
      userId: endpointRow.user_id,
    });
    return;
  }

  const subscription = {
    endpoint: data.endpoint,
    keys: {
      p256dh: data.p256dh,
      auth: data.auth,
    },
  };

  const ttl = kind === 'digest' ? 86400 : 3600;

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: ttl });
  } catch (error) {
    const statusCode = error?.statusCode;
    if (statusCode === 410 || statusCode === 404) {
      logger.info('Revoking expired push endpoint', {
        endpointId: endpointRow.id,
        userId: endpointRow.user_id,
        statusCode,
      });
      await revokeEndpointById(knex, endpointRow.id);
      return;
    }
    throw error;
  }
}

/**
 * @param {object} knex
 * @param {object} user
 * @param {import('./types').NotificationContent} content
 * @param {'immediate'|'digest'} kind
 */
async function deliverToUser(knex, user, content, kind) {
  if (!ensureVapidConfigured()) {
    return;
  }

  const endpoints = await loadActivePushEndpoints(knex, user.id);
  if (endpoints.length === 0) {
    return;
  }

  const payload = buildPushPayload(content, kind);
  await Promise.allSettled(
    endpoints.map(async (endpointRow) => {
      try {
        await sendToEndpoint(knex, endpointRow, payload, kind);
      } catch (error) {
        logger.error('Web push delivery failed', {
          userId: user.id,
          endpointId: endpointRow.id,
          kind,
          error: error.message,
          statusCode: error?.statusCode,
        });
      }
    })
  );
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
 * @param {string} endpoint
 */
async function revokeEndpoint(knex, userId, endpoint) {
  await TransactionManager.execute(knex, `
    UPDATE notification_channel_endpoints
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
      AND channel = 'push'
      AND endpoint_data->>'endpoint' = ?
      AND revoked_at IS NULL
  `, [userId, endpoint]);
}

/**
 * @param {object} subscription
 * @returns {boolean}
 */
function isValidSubscription(subscription) {
  return Boolean(
    subscription
    && typeof subscription.endpoint === 'string'
    && subscription.endpoint.length > 0
    && subscription.keys
    && typeof subscription.keys.p256dh === 'string'
    && subscription.keys.p256dh.length > 0
    && typeof subscription.keys.auth === 'string'
    && subscription.keys.auth.length > 0
  );
}

/**
 * @param {object} knex
 * @param {string} userId
 * @param {object} subscription
 * @param {string|null} [userAgent]
 * @returns {Promise<string>}
 */
async function savePushSubscription(knex, userId, subscription, userAgent = null) {
  const endpointData = JSON.stringify({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: userAgent || null,
  });

  const existing = await TransactionManager.query(knex, `
    SELECT id
    FROM notification_channel_endpoints
    WHERE user_id = ?
      AND channel = 'push'
      AND endpoint_data->>'endpoint' = ?
      AND revoked_at IS NULL
  `, [userId, subscription.endpoint]);

  if (existing?.id) {
    await TransactionManager.execute(knex, `
      UPDATE notification_channel_endpoints
      SET endpoint_data = ?::jsonb, verified_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [endpointData, existing.id]);
    return existing.id;
  }

  const endpointId = uuidv4();
  await TransactionManager.execute(knex, `
    INSERT INTO notification_channel_endpoints (id, user_id, channel, endpoint_data, verified_at)
    VALUES (?, ?, 'push', ?::jsonb, CURRENT_TIMESTAMP)
  `, [endpointId, userId, endpointData]);

  return endpointId;
}

/**
 * @param {object} knex
 * @param {string} userId
 * @returns {Promise<{ subscribed: boolean, endpointCount: number }>}
 */
async function getPushSubscriptionStatus(knex, userId) {
  const row = await TransactionManager.query(knex, `
    SELECT COUNT(*)::int AS count
    FROM notification_channel_endpoints
    WHERE user_id = ?
      AND channel = 'push'
      AND revoked_at IS NULL
  `, [userId]);

  const endpointCount = Number(row?.count || 0);
  return {
    subscribed: endpointCount > 0,
    endpointCount,
  };
}

/** @type {import('./types').ChannelAdapter} */
const webPushAdapter = {
  id: CHANNEL_ID,
  isConfigured,
  canDeliver,
  deliverImmediate,
  deliverDigest,
  revokeEndpoint,
};

registerChannel(webPushAdapter);

module.exports = {
  webPushAdapter,
  isConfigured,
  canDeliver,
  getVapidPublicKeyStatus,
  savePushSubscription,
  revokeEndpoint,
  getPushSubscriptionStatus,
  loadActivePushEndpoints,
  buildPushPayload,
  deliverImmediate,
  deliverDigest,
  ensureVapidConfigured,
};
