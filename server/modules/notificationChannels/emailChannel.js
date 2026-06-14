/**
 * Email notification channel adapter — wraps emailService.js.
 */

const config = require('../../config');
const { logger } = require('../../middleware/logger');
const { sendImmediateNotification, sendDigestEmail } = require('../emailService');
const { registerChannel } = require('./registry');

const CHANNEL_ID = 'email';

/**
 * @returns {boolean}
 */
function isConfigured() {
  return Boolean(config.RESEND_API_KEY) || config.NODE_ENV === 'development';
}

/**
 * @param {import('./types').ChannelPreferencesMap} prefs
 * @param {import('./types').NotificationKind} kind
 * @returns {boolean}
 */
function canDeliver(prefs, kind) {
  const email = prefs?.email;
  if (!email?.enabled) {
    return false;
  }
  if (kind === 'immediate') {
    return email.immediate !== false;
  }
  if (kind === 'digest') {
    return email.digestFrequency !== 'off';
  }
  return false;
}

/**
 * @param {object} knex
 * @param {object} user
 * @param {import('./types').NotificationContent} content
 */
async function deliverImmediate(knex, user, content) {
  if (!user?.email) {
    logger.warn('Skipping email immediate delivery — user has no email', { userId: user?.id });
    return;
  }

  const eventType = content.eventType;
  if (!eventType) {
    logger.warn('Skipping email immediate delivery — missing eventType', { userId: user.id });
    return;
  }

  const eventData = content.rawEventData || {};
  await sendImmediateNotification(user.email, eventType, eventData, {
    locale: content.locale || 'en',
  });
}

/**
 * @param {object} knex
 * @param {object} user
 * @param {import('./types').NotificationContent} content
 */
async function deliverDigest(knex, user, content) {
  if (!user?.email) {
    logger.warn('Skipping email digest delivery — user has no email', { userId: user?.id });
    return;
  }

  const events = content.digestEvents || [];
  const frequency = content.digestFrequency || 'monthly';
  if (events.length === 0) {
    return;
  }

  await sendDigestEmail(user.email, events, frequency, {
    locale: content.locale || 'en',
  });
}

/** @type {import('./types').ChannelAdapter} */
const emailAdapter = {
  id: CHANNEL_ID,
  isConfigured,
  canDeliver,
  deliverImmediate,
  deliverDigest,
};

registerChannel(emailAdapter);

module.exports = {
  emailAdapter,
  isConfigured,
  canDeliver,
  deliverImmediate,
  deliverDigest,
};
