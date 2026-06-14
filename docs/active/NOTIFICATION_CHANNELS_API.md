# Notification Channels API Contract

**Status:** Foundation (Agent 1) — routes documented here are **planned**; implementation is split across Agents 2–6.

**Purpose:** Frozen contracts for Web Push, Telegram, and orchestrator agents.

---

## Channel preferences shape

Stored in `notification_preferences.channel_preferences` (JSONB). Legacy columns (`email_enabled`, `immediate_notifications_enabled`, `digest_frequency`) remain in sync on write during transition.

```json
{
  "email": {
    "enabled": true,
    "immediate": true,
    "digestFrequency": "monthly"
  },
  "push": {
    "enabled": false,
    "immediate": true,
    "digest": true
  },
  "telegram": {
    "enabled": false,
    "immediate": true,
    "digest": true
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `email.enabled` | boolean | Master email toggle (mirrors `email_enabled`) |
| `email.immediate` | boolean | Time-critical alerts (mirrors `immediate_notifications_enabled`) |
| `email.digestFrequency` | `"weekly"` \| `"monthly"` \| `"off"` | Mirrors `digest_frequency` |
| `push.enabled` | boolean | Requires active push endpoint |
| `push.immediate` | boolean | Immediate alerts via Web Push |
| `push.digest` | boolean | Compact digest summary (uses shared digest frequency) |
| `telegram.enabled` | boolean | Requires linked Telegram endpoint |
| `telegram.immediate` | boolean | Immediate alerts via Telegram DM |
| `telegram.digest` | boolean | Compact digest summary |

**Digest frequency** is shared across channels (from `email.digestFrequency`). Per-channel digest toggles only control whether that channel receives the summary.

---

## Existing preferences routes (backward compatible)

### `GET /api/notifications/preferences`

**Auth:** Required

**Response (current):**

```json
{
  "preferences": {
    "emailEnabled": true,
    "immediateNotificationsEnabled": true,
    "digestFrequency": "monthly",
    "digestLastSent": null,
    "deadlineDigestLastSent": null
  }
}
```

**Response (after Agent 6):** adds `channelPreferences` object (shape above).

### `PUT /api/notifications/preferences`

**Auth:** Required

**Body (current — still supported):**

```json
{
  "emailEnabled": true,
  "immediateNotificationsEnabled": true,
  "digestFrequency": "monthly"
}
```

**Body (after Agent 6 — partial updates):**

```json
{
  "channelPreferences": {
    "push": { "enabled": true, "immediate": true, "digest": false }
  }
}
```

Legacy body fields and `channelPreferences` may be sent together; `channelPreferences` wins for overlapping email fields. Server dual-writes legacy columns.

---

## Web Push routes (Agent 2)

### `GET /api/notifications/push/vapid-public-key`

**Auth:** Optional (public key is not secret)

**Response:**

```json
{
  "enabled": true,
  "publicKey": "BNcRd..."
}
```

When `WEB_PUSH_ENABLED=false` or keys missing: `{ "enabled": false, "publicKey": null }`.

### `POST /api/notifications/push/subscribe`

**Auth:** Required

**Body:**

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "base64url...",
      "auth": "base64url..."
    }
  }
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "endpointId": "uuid"
}
```

Stores row in `notification_channel_endpoints` (`channel=push`, `endpoint_data` JSONB, `verified_at=now()`). Multiple active push endpoints per user allowed.

### `DELETE /api/notifications/push/subscribe`

**Auth:** Required

**Body:**

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

**Response:** `200 OK` — sets `revoked_at` on matching endpoint.

### `GET /api/notifications/push/status`

**Auth:** Required

**Response:**

```json
{
  "subscribed": true,
  "endpointCount": 2
}
```

---

## Telegram routes (Agent 4)

### `POST /api/notifications/telegram/link-token`

**Auth:** Required

**Response:** `201 Created`

```json
{
  "token": "link_abc123...",
  "deepLink": "https://t.me/ColaboraBot?start=link_abc123...",
  "expiresAt": "2026-06-11T12:00:00.000Z"
}
```

Token stored in `telegram_link_tokens` (short TTL, e.g. 15 minutes).

### `GET /api/notifications/telegram/status`

**Auth:** Required

**Response:**

```json
{
  "linked": true,
  "username": "jane_doe",
  "enabled": false
}
```

`linked` = active row in `notification_channel_endpoints` where `channel=telegram` and `revoked_at IS NULL`.

### `DELETE /api/notifications/telegram/disconnect`

**Auth:** Required

**Response:** `200 OK` — revokes telegram endpoint, sets `channel_preferences.telegram.enabled=false`.

### `POST /api/webhooks/telegram`

**Auth:** None (validated via `X-Telegram-Bot-Api-Secret-Token` header vs `TELEGRAM_WEBHOOK_SECRET`)

**Body:** Telegram Bot API `Update` object.

**Handled commands:**

| Command | Action |
|---|---|
| `/start link_<token>` | Validate token, store `chatId` in `notification_channel_endpoints`, confirm in chat |
| `/stop` | Revoke endpoint, disable telegram prefs, confirm in chat |

Registered in `server/bootstrap.js` **before** auth middleware. Rate-limited (Agent 8).

---

## Server module contracts

### Channel adapter (`server/modules/notificationChannels/types.js`)

```javascript
/** @typedef {'email'|'push'|'telegram'|'whatsapp'} ChannelId */
/** @typedef {'immediate'|'digest'} NotificationKind */
/** @typedef {{ subject?: string, title: string, body: string, url: string, locale: string, eventType?: string }} NotificationContent */

/** @typedef {Object} ChannelAdapter
 *  @property {ChannelId} id
 *  @property {() => boolean} isConfigured
 *  @property {(prefs: ChannelPreferencesMap, kind: NotificationKind) => boolean} canDeliver
 *  @property {(knex, user, content: NotificationContent) => Promise<void>} deliverImmediate
 *  @property {(knex, user, content: NotificationContent) => Promise<void>} deliverDigest
 *  @property {(knex, userId, ...args) => Promise<void>} [revokeEndpoint]
 */
```

Channels register via `registry.registerChannel(adapter)` at module load.

### Dispatcher (`server/modules/notificationChannels/dispatcher.js`)

```javascript
dispatchImmediate(knex, userId, eventType, eventData)  // fail-soft, allSettled
dispatchDigest(knex, userId, events, frequency)        // fail-soft, allSettled
```

### Content renderer (`server/notifications/renderContent.js`)

```javascript
renderNotificationContent(eventType, eventData, locale, format, kind)
// → { subject, title, body, url, locale, eventType }
```

`format`: `'plain'` \| `'html'` (v1 push/telegram use `plain`). Full event coverage: Agent 7.

### Channel preferences helper (`server/modules/notificationChannels/channelPreferences.js`)

```javascript
readChannelPreferences(knex, userId)           // → ChannelPreferencesMap
writeChannelPreferences(knex, userId, partial)   // merge + dual-sync legacy columns
getDefaultChannelPreferences()
mergeChannelPreferences(existing, partial)
```

---

## Database tables (migration `011_notification_channels.js`)

### `notification_channel_endpoints`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `user_id` | text FK → users | CASCADE delete |
| `channel` | text | CHECK: `push` \| `telegram` |
| `endpoint_data` | JSONB | Push: `{endpoint,p256dh,auth,userAgent}`; Telegram: `{chatId,username}` |
| `verified_at` | timestamp | nullable |
| `revoked_at` | timestamp | nullable — soft revoke |
| `created_at` | timestamp | |

**Partial unique index:** one active telegram per user (`revoked_at IS NULL`). Multiple active push endpoints allowed.

### `telegram_link_tokens`

| Column | Type |
|---|---|
| `token` | text PK |
| `user_id` | text FK → users |
| `expires_at` | timestamp |
| `created_at` | timestamp |

### `notification_preferences.channel_preferences`

JSONB, NOT NULL, default per shape above. Backfilled from legacy columns.

---

## Environment variables

| Variable | Required when | Purpose |
|---|---|---|
| `WEB_PUSH_ENABLED` | — | `true` to enable push channel |
| `VAPID_PUBLIC_KEY` | push enabled | Client subscribe |
| `VAPID_PRIVATE_KEY` | push enabled | Server send |
| `VAPID_SUBJECT` | push enabled | `mailto:` or `https:` contact URI |
| `TELEGRAM_ENABLED` | — | `true` to enable telegram channel |
| `TELEGRAM_BOT_TOKEN` | telegram enabled | Bot API |
| `TELEGRAM_BOT_USERNAME` | telegram enabled | `t.me` deep links |
| `TELEGRAM_WEBHOOK_SECRET` | telegram enabled | Webhook header validation |

All default to disabled / null in development.

---

## Push payload (Agent 2 delivery)

Web Push notification JSON (keep under ~1 KB):

```json
{
  "title": "Voting started",
  "body": "Budget proposal is open for voting.",
  "url": "https://app.example.com/documents/abc",
  "tag": "voting_started",
  "eventType": "voting_started"
}
```

Service worker opens `url` on click.

---

## Telegram message format (Agent 4 delivery)

Plain text or MarkdownV2 with escaped special chars. Digest example:

```
12 updates in Colabora this week.
Open: https://app.example.com/activity
```

Max 4096 characters per message.
