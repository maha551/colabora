/**
 * Multi-channel notification dispatcher — iterates registered channel adapters.
 * Channels register via registry.js at module load (Agents 2, 4, 6).
 */

const { logger } = require('../../middleware/logger');
const TransactionManager = require('../../database/services/TransactionManager');
const { localeFromUserRow } = require('../../emails/i18n');
const { renderNotificationContent } = require('../../notifications/renderContent');
const { getAllChannels } = require('./registry');
const { readChannelPreferences } = require('./channelPreferences');

/**
 * @param {object} knex
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function loadUserForDelivery(knex, userId) {
  return TransactionManager.query(knex, `
    SELECT id, email, name, preferences
    FROM users
    WHERE id = ?
  `, [userId]);
}

/**
 * Dispatch an immediate notification to all eligible configured channels.
 * @param {object} knex
 * @param {string} userId
 * @param {string} eventType
 * @param {object} eventData
 * @returns {Promise<void>}
 */
async function dispatchImmediate(knex, userId, eventType, eventData) {
  const channels = getAllChannels();
  if (channels.length === 0) {
    logger.debug('No notification channels registered for immediate dispatch', { userId, eventType });
    return;
  }

  try {
    const [user, prefs] = await Promise.all([
      loadUserForDelivery(knex, userId),
      readChannelPreferences(knex, userId),
    ]);

    if (!user) {
      logger.warn('User not found for immediate dispatch', { userId, eventType });
      return;
    }

    const locale = localeFromUserRow(user);
    const content = renderNotificationContent(eventType, eventData, locale, 'plain', 'immediate');
    content.rawEventData = eventData;

    const deliveries = channels
      .filter((channel) => channel.isConfigured() && channel.canDeliver(prefs, 'immediate'))
      .map(async (channel) => {
        try {
          await channel.deliverImmediate(knex, user, content);
        } catch (error) {
          logger.error('Channel immediate delivery failed', {
            channel: channel.id,
            userId,
            eventType,
            error: error.message,
          });
        }
      });

    await Promise.allSettled(deliveries);
  } catch (error) {
    logger.error('Immediate dispatch failed', { userId, eventType, error: error.message });
  }
}

/**
 * Dispatch a digest summary to all eligible configured channels.
 * @param {object} knex
 * @param {string} userId
 * @param {object[]} events - Queued digest events
 * @param {'weekly'|'monthly'} frequency
 * @param {{ skipChannels?: string[] }} [options]
 * @returns {Promise<void>}
 */
async function dispatchDigest(knex, userId, events, frequency, options = {}) {
  const channels = getAllChannels();
  const skipChannels = new Set(options.skipChannels || []);
  if (channels.length === 0) {
    logger.debug('No notification channels registered for digest dispatch', { userId });
    return;
  }

  if (!events || events.length === 0) {
    return;
  }

  try {
    const [user, prefs] = await Promise.all([
      loadUserForDelivery(knex, userId),
      readChannelPreferences(knex, userId),
    ]);

    if (!user) {
      logger.warn('User not found for digest dispatch', { userId });
      return;
    }

    const locale = localeFromUserRow(user);
    const content = renderNotificationContent('digest_summary', { events, frequency }, locale, 'plain', 'digest');
    content.digestEvents = events;
    content.digestFrequency = frequency;

    const deliveries = channels
      .filter((channel) => !skipChannels.has(channel.id) && channel.isConfigured() && channel.canDeliver(prefs, 'digest'))
      .map(async (channel) => {
        try {
          await channel.deliverDigest(knex, user, content);
        } catch (error) {
          logger.error('Channel digest delivery failed', {
            channel: channel.id,
            userId,
            error: error.message,
          });
        }
      });

    await Promise.allSettled(deliveries);
  } catch (error) {
    logger.error('Digest dispatch failed', { userId, error: error.message });
  }
}

module.exports = {
  dispatchImmediate,
  dispatchDigest,
};
