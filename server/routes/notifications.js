/**
 * Notification Routes
 * Handles notification preferences and in-app notifications
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const notificationService = require('../modules/notifications');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId } = require('../utils/routeHelpers');
const {
  writeChannelPreferences,
  mergeChannelPreferences,
} = require('../modules/notificationChannels');
const {
  getVapidPublicKeyStatus,
  savePushSubscription,
  revokeEndpoint,
  getPushSubscriptionStatus,
} = require('../modules/notificationChannels/webPushChannel');
const {
  isConfigured: isTelegramConfigured,
  createLinkToken,
  getTelegramStatus,
  disconnectTelegram,
} = require('../modules/notificationChannels/telegramChannel');

const router = express.Router();

const telegramLinkTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.NODE_ENV === 'production' ? 5 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many Telegram link token requests. Please try again later.',
  },
  keyGenerator: (req) => {
    try {
      const userId = getUserId(req);
      if (userId) return `user:${userId}`;
    } catch {
      // fall through to IP-based key
    }
    // Use the IPv6-safe helper so IPv6 clients cannot bypass the limit.
    return ipKeyGenerator(req.ip);
  },
});

/**
 * GET /api/notifications/preferences
 * Get user's notification preferences
 */
router.get('/preferences', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);

  try {
    const preferences = await notificationService.getNotificationPreferences(db, userId);
    res.json({ preferences });
  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error fetching notification preferences', {
      error: error.message,
      userId
    });
    throw ApiError.database('Failed to fetch notification preferences', { originalError: error.message }, 'FETCH_NOTIFICATION_PREFERENCES_FAILED');
  }
}));

/**
 * PUT /api/notifications/preferences
 * Update user's notification preferences
 */
router.put('/preferences', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  // transformRequest middleware snake_cases body keys; accept both forms.
  const body = req.originalBody && Object.keys(req.originalBody).length > 0
    ? req.originalBody
    : req.body;
  const emailEnabled = body.emailEnabled ?? body.email_enabled;
  const immediateNotificationsEnabled = body.immediateNotificationsEnabled
    ?? body.immediate_notifications_enabled;
  const digestFrequency = body.digestFrequency ?? body.digest_frequency;
  const channelPreferences = body.channelPreferences ?? body.channel_preferences;

  if (digestFrequency && !['weekly', 'monthly', 'off'].includes(digestFrequency)) {
    return res.status(400).json({
      error: 'Invalid digest frequency',
      details: 'digestFrequency must be one of: weekly, monthly, off',
    });
  }

  if (channelPreferences?.email?.digestFrequency
    && !['weekly', 'monthly', 'off'].includes(channelPreferences.email.digestFrequency)) {
    return res.status(400).json({
      error: 'Invalid digest frequency',
      details: 'channelPreferences.email.digestFrequency must be one of: weekly, monthly, off',
    });
  }

  try {
    await notificationService.initializeUserPreferences(db, userId);

    let partial = {};

    if (emailEnabled !== undefined) {
      partial.email = { ...partial.email, enabled: Boolean(emailEnabled) };
    }
    if (immediateNotificationsEnabled !== undefined) {
      partial.email = { ...partial.email, immediate: Boolean(immediateNotificationsEnabled) };
    }
    if (digestFrequency !== undefined) {
      partial.email = { ...partial.email, digestFrequency };
    }

    if (channelPreferences && typeof channelPreferences === 'object') {
      partial = mergeChannelPreferences(partial, channelPreferences);
    }

    if (Object.keys(partial).length > 0) {
      await writeChannelPreferences(db, userId, partial);
    }

    const preferences = await notificationService.getNotificationPreferences(db, userId);
    res.json({
      success: true,
      preferences,
    });
  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error updating notification preferences', {
      error: error.message,
      userId
    });
    throw ApiError.database('Failed to update notification preferences', { originalError: error.message }, 'UPDATE_NOTIFICATION_PREFERENCES_FAILED');
  }
}));

/**
 * GET /api/notifications/push/vapid-public-key
 * Public VAPID key for browser push subscription
 */
router.get('/push/vapid-public-key', asyncHandler(async (_req, res) => {
  res.json(getVapidPublicKeyStatus());
}));

/**
 * POST /api/notifications/push/subscribe
 * Register a Web Push subscription endpoint for the authenticated user
 */
router.post('/push/subscribe', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const { subscription } = req.body;

  if (!subscription || typeof subscription !== 'object') {
    return res.status(400).json({
      error: 'Invalid subscription',
      details: 'Request body must include a subscription object',
    });
  }

  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({
      error: 'Invalid subscription',
      details: 'subscription must include endpoint and keys.p256dh, keys.auth',
    });
  }

  try {
    const endpointId = await savePushSubscription(
      db,
      userId,
      subscription,
      req.headers['user-agent'] || null
    );

    res.status(201).json({
      success: true,
      endpointId,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error saving push subscription', {
      error: error.message,
      userId,
    });
    throw ApiError.database('Failed to save push subscription', { originalError: error.message }, 'SAVE_PUSH_SUBSCRIPTION_FAILED');
  }
}));

/**
 * DELETE /api/notifications/push/subscribe
 * Revoke a Web Push subscription endpoint for the authenticated user
 */
router.delete('/push/subscribe', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const { endpoint } = req.body;

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({
      error: 'Invalid endpoint',
      details: 'Request body must include an endpoint string',
    });
  }

  try {
    await revokeEndpoint(db, userId, endpoint);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error revoking push subscription', {
      error: error.message,
      userId,
    });
    throw ApiError.database('Failed to revoke push subscription', { originalError: error.message }, 'REVOKE_PUSH_SUBSCRIPTION_FAILED');
  }
}));

/**
 * GET /api/notifications/push/status
 * Push subscription status for the authenticated user
 */
router.get('/push/status', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);

  try {
    const status = await getPushSubscriptionStatus(db, userId);
    res.json(status);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error fetching push status', {
      error: error.message,
      userId,
    });
    throw ApiError.database('Failed to fetch push status', { originalError: error.message }, 'FETCH_PUSH_STATUS_FAILED');
  }
}));

/**
 * POST /api/notifications/telegram/link-token
 * Create an expiring deep-link token for Telegram account linking
 */
router.post('/telegram/link-token', requireAuth, telegramLinkTokenLimiter, asyncHandler(async (req, res) => {
  if (!isTelegramConfigured()) {
    return res.status(503).json({ error: 'Telegram notifications are not enabled' });
  }

  const db = req.app.locals.db;
  const userId = getUserId(req);

  try {
    await notificationService.initializeUserPreferences(db, userId);
    const result = await createLinkToken(db, userId);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error creating Telegram link token', {
      error: error.message,
      userId,
    });
    throw ApiError.database('Failed to create Telegram link token', { originalError: error.message }, 'CREATE_TELEGRAM_LINK_TOKEN_FAILED');
  }
}));

/**
 * GET /api/notifications/telegram/status
 * Telegram link status for the authenticated user
 */
router.get('/telegram/status', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);

  try {
    const status = await getTelegramStatus(db, userId);
    res.json(status);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error fetching Telegram status', {
      error: error.message,
      userId,
    });
    throw ApiError.database('Failed to fetch Telegram status', { originalError: error.message }, 'FETCH_TELEGRAM_STATUS_FAILED');
  }
}));

/**
 * DELETE /api/notifications/telegram/disconnect
 * Revoke Telegram endpoint and disable telegram channel preferences
 */
router.delete('/telegram/disconnect', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);

  try {
    await disconnectTelegram(db, userId);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error disconnecting Telegram', {
      error: error.message,
      userId,
    });
    throw ApiError.database('Failed to disconnect Telegram', { originalError: error.message }, 'DISCONNECT_TELEGRAM_FAILED');
  }
}));

/**
 * GET /api/notifications
 * Get in-app notifications for the user (future use)
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const notifications = await TransactionManager.queryAll(
      db,
      `SELECT id, type, title, message, link, read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    res.json({ notifications });
  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error fetching notifications', {
      error: error.message,
      userId
    });
    throw ApiError.database('Failed to fetch notifications', { originalError: error.message }, 'FETCH_NOTIFICATIONS_FAILED');
  }
}));

module.exports = router;
