/**
 * Read/write channel_preferences JSONB with dual-sync to legacy notification_preferences columns.
 */

const TransactionManager = require('../../database/services/TransactionManager');
const { logger } = require('../../middleware/logger');

/** @type {import('./types').ChannelPreferencesMap} */
const DEFAULT_CHANNEL_PREFERENCES = {
  email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
  push: { enabled: false, immediate: true, digest: true },
  telegram: { enabled: false, immediate: true, digest: true },
};

const VALID_DIGEST_FREQUENCIES = new Set(['weekly', 'monthly', 'off']);

/**
 * @returns {import('./types').ChannelPreferencesMap}
 */
function getDefaultChannelPreferences() {
  return JSON.parse(JSON.stringify(DEFAULT_CHANNEL_PREFERENCES));
}

/**
 * @param {unknown} value
 * @returns {import('./types').ChannelPreferencesMap}
 */
function parseChannelPreferencesJson(value) {
  if (!value) {
    return getDefaultChannelPreferences();
  }
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return getDefaultChannelPreferences();
    }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return getDefaultChannelPreferences();
  }
  return mergeChannelPreferences(getDefaultChannelPreferences(), /** @type {Partial<import('./types').ChannelPreferencesMap>} */ (parsed));
}

/**
 * Build channel_preferences from legacy columns when JSONB is absent.
 * @param {{ email_enabled?: boolean|number, immediate_notifications_enabled?: boolean|number, digest_frequency?: string }} row
 * @returns {import('./types').ChannelPreferencesMap}
 */
function channelPreferencesFromLegacyRow(row) {
  const prefs = getDefaultChannelPreferences();
  if (!row) {
    return prefs;
  }
  prefs.email.enabled = row.email_enabled === 1 || row.email_enabled === true;
  prefs.email.immediate = row.immediate_notifications_enabled === 1 || row.immediate_notifications_enabled === true;
  const freq = row.digest_frequency || 'monthly';
  prefs.email.digestFrequency = VALID_DIGEST_FREQUENCIES.has(freq) ? /** @type {import('./types').DigestFrequency} */ (freq) : 'monthly';
  return prefs;
}

/**
 * @param {import('./types').ChannelPreferencesMap} prefs
 * @returns {{ email_enabled: boolean, immediate_notifications_enabled: boolean, digest_frequency: string }}
 */
function legacyColumnsFromChannelPreferences(prefs) {
  const email = prefs.email || DEFAULT_CHANNEL_PREFERENCES.email;
  const digestFrequency = VALID_DIGEST_FREQUENCIES.has(email.digestFrequency)
    ? email.digestFrequency
    : 'monthly';
  return {
    email_enabled: email.enabled !== false,
    immediate_notifications_enabled: email.immediate !== false,
    digest_frequency: digestFrequency,
  };
}

/**
 * Deep-merge partial channel preference updates.
 * @param {import('./types').ChannelPreferencesMap} existing
 * @param {Partial<import('./types').ChannelPreferencesMap>} partial
 * @returns {import('./types').ChannelPreferencesMap}
 */
function mergeChannelPreferences(existing, partial) {
  const base = existing && Object.keys(existing).length > 0
    ? existing
    : getDefaultChannelPreferences();
  const merged = JSON.parse(JSON.stringify(base));
  for (const channelId of ['email', 'push', 'telegram']) {
    if (partial[channelId] && typeof partial[channelId] === 'object') {
      merged[channelId] = { ...merged[channelId], ...partial[channelId] };
    }
  }
  if (merged.email?.digestFrequency && !VALID_DIGEST_FREQUENCIES.has(merged.email.digestFrequency)) {
    merged.email.digestFrequency = 'monthly';
  }
  return merged;
}

/**
 * @param {object} knex
 * @param {string} userId
 * @returns {Promise<import('./types').ChannelPreferencesMap>}
 */
async function readChannelPreferences(knex, userId) {
  try {
    const row = await TransactionManager.query(knex, `
      SELECT
        email_enabled,
        immediate_notifications_enabled,
        digest_frequency,
        channel_preferences
      FROM notification_preferences
      WHERE user_id = ?
    `, [userId]);

    if (!row) {
      return getDefaultChannelPreferences();
    }

    if (row.channel_preferences != null) {
      return parseChannelPreferencesJson(row.channel_preferences);
    }

    return channelPreferencesFromLegacyRow(row);
  } catch (error) {
    if (error.message && error.message.includes('channel_preferences')) {
      const row = await TransactionManager.query(knex, `
        SELECT email_enabled, immediate_notifications_enabled, digest_frequency
        FROM notification_preferences
        WHERE user_id = ?
      `, [userId]);
      return channelPreferencesFromLegacyRow(row);
    }
    logger.error('Error reading channel preferences', { error: error.message, userId });
    throw error;
  }
}

/**
 * Persist channel_preferences and sync legacy email columns.
 * @param {object} knex
 * @param {string} userId
 * @param {Partial<import('./types').ChannelPreferencesMap>} partial
 * @returns {Promise<import('./types').ChannelPreferencesMap>}
 */
async function writeChannelPreferences(knex, userId, partial) {
  const existing = await readChannelPreferences(knex, userId);
  const merged = mergeChannelPreferences(existing, partial);
  const legacy = legacyColumnsFromChannelPreferences(merged);
  const json = JSON.stringify(merged);

  try {
    await TransactionManager.execute(knex, `
      UPDATE notification_preferences
      SET
        channel_preferences = ?::jsonb,
        email_enabled = ?,
        immediate_notifications_enabled = ?,
        digest_frequency = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [json, legacy.email_enabled, legacy.immediate_notifications_enabled, legacy.digest_frequency, userId]);
  } catch (error) {
    if (error.message && error.message.includes('channel_preferences')) {
      await TransactionManager.execute(knex, `
        UPDATE notification_preferences
        SET
          email_enabled = ?,
          immediate_notifications_enabled = ?,
          digest_frequency = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `, [legacy.email_enabled, legacy.immediate_notifications_enabled, legacy.digest_frequency, userId]);
    } else {
      throw error;
    }
  }

  return merged;
}

module.exports = {
  DEFAULT_CHANNEL_PREFERENCES,
  getDefaultChannelPreferences,
  parseChannelPreferencesJson,
  channelPreferencesFromLegacyRow,
  legacyColumnsFromChannelPreferences,
  mergeChannelPreferences,
  readChannelPreferences,
  writeChannelPreferences,
};
