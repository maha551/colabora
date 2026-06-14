/**
 * JSDoc type contracts for the multi-channel notification system.
 * Channel adapters (email, push, telegram, future whatsapp) implement these shapes.
 */

/**
 * @typedef {'email'|'push'|'telegram'|'whatsapp'} ChannelId
 */

/**
 * @typedef {'immediate'|'digest'} NotificationKind
 */

/**
 * @typedef {'weekly'|'monthly'|'off'} DigestFrequency
 */

/**
 * @typedef {Object} EmailChannelPreferences
 * @property {boolean} enabled
 * @property {boolean} immediate
 * @property {DigestFrequency} digestFrequency
 */

/**
 * @typedef {Object} PushChannelPreferences
 * @property {boolean} enabled
 * @property {boolean} immediate
 * @property {boolean} digest
 */

/**
 * @typedef {Object} TelegramChannelPreferences
 * @property {boolean} enabled
 * @property {boolean} immediate
 * @property {boolean} digest
 */

/**
 * @typedef {Object} ChannelPreferencesMap
 * @property {EmailChannelPreferences} email
 * @property {PushChannelPreferences} push
 * @property {TelegramChannelPreferences} telegram
 */

/**
 * @typedef {Object} NotificationContent
 * @property {string} [subject] - Email subject line; optional for push/telegram
 * @property {string} title - Short headline for all channels
 * @property {string} body - Plain-text body (compact for push/telegram)
 * @property {string} url - Deep link into the app
 * @property {string} locale - BCP-47 or app locale code (e.g. "en")
 * @property {string} [eventType] - Source event type for tagging/analytics
 * @property {object} [rawEventData] - Original event payload (email immediate templates)
 * @property {object[]} [digestEvents] - Queued digest events (email digest templates)
 * @property {'weekly'|'monthly'} [digestFrequency] - Shared digest cadence
 */

/**
 * @typedef {Object} PushEndpointData
 * @property {string} endpoint
 * @property {string} p256dh
 * @property {string} auth
 * @property {string} [userAgent]
 */

/**
 * @typedef {Object} TelegramEndpointData
 * @property {string|number} chatId
 * @property {string} [username]
 */

/**
 * @typedef {Object} ChannelEndpointRow
 * @property {string} id
 * @property {string} user_id
 * @property {'push'|'telegram'} channel
 * @property {PushEndpointData|TelegramEndpointData} endpoint_data
 * @property {string|null} verified_at
 * @property {string|null} revoked_at
 * @property {string} created_at
 */

/**
 * @typedef {Object} ChannelAdapter
 * @property {ChannelId} id
 * @property {() => boolean} isConfigured
 * @property {(prefs: ChannelPreferencesMap, kind: NotificationKind) => boolean} canDeliver
 * @property {(knex: object, user: object, content: NotificationContent) => Promise<void>} deliverImmediate
 * @property {(knex: object, user: object, content: NotificationContent) => Promise<void>} deliverDigest
 * @property {(knex: object, userId: string, ...args: unknown[]) => Promise<void>} [revokeEndpoint]
 */

module.exports = {};
