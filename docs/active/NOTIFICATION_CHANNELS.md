# Notification Channels Setup Guide

This guide covers operational setup for **Web Push** and **Telegram** notification channels in Colabora. Both channels are optional and disabled by default.

For API contracts and database schema, see [NOTIFICATION_CHANNELS_API.md](./NOTIFICATION_CHANNELS_API.md).

---

## Overview

| Channel | Env flag | User opt-in | Stored credentials |
|---------|----------|-------------|-------------------|
| Web Push | `WEB_PUSH_ENABLED=true` | Browser permission + notification settings | Push subscription endpoint + encryption keys |
| Telegram | `TELEGRAM_ENABLED=true` | Connect Telegram in settings + `/start link_*` | Telegram `chatId` (+ optional username) |

Channels share the same notification content pipeline as email (immediate alerts and digests). Users control each channel independently in **Account → Notification settings**.

---

## Local development quick start

1. Copy environment template:
   ```bash
   cp env.example .env
   ```

2. Run database migration (if not already applied):
   ```bash
   npm run db:migrate
   ```

3. Enable only the channels you need (see sections below).

4. Validate configuration:
   ```bash
   npm run validate-env
   ```

5. Start the app:
   ```bash
   npm run dev
   ```

---

## Web Push setup

Web Push uses the [Web Push Protocol](https://www.w3.org/TR/push-api/) with VAPID keys. The client registers a service worker (`client/public/sw.js`), subscribes via the browser Push API, and sends the subscription to the server.

### Step 1: Generate VAPID keys

From the project root:

```bash
npx web-push generate-vapid-keys
```

Example output:

```
=======================================

Public Key:
BNcRd...

Private Key:
1AbC...

=======================================
```

Save both keys — the private key is required on the server only.

### Step 2: Configure local `.env`

```env
WEB_PUSH_ENABLED=true
VAPID_PUBLIC_KEY=BNcRd...your-public-key...
VAPID_PRIVATE_KEY=1AbC...your-private-key...
VAPID_SUBJECT=mailto:admin@yourdomain.com
```

**`VAPID_SUBJECT`** must be a `mailto:` or `https:` URI identifying your application (required by the Web Push spec). Use a monitored admin or support address.

### Step 3: Verify in the UI

1. Open Colabora in a browser that supports push (Chrome, Firefox, Edge; not Safari on iOS for web push).
2. Go to notification settings and enable push notifications.
3. Accept the browser permission prompt.
4. Confirm status shows subscribed (`GET /api/notifications/push/status`).

### Step 4: Production (Fly.io)

Set secrets (app name from `fly.toml`: `colabora-app`):

```bash
fly secrets set \
  WEB_PUSH_ENABLED=true \
  VAPID_PUBLIC_KEY="BNcRd..." \
  VAPID_PRIVATE_KEY="1AbC..." \
  VAPID_SUBJECT="mailto:admin@yourdomain.com" \
  -a colabora-app
```

Deploy so the app picks up secrets:

```bash
fly deploy -a colabora-app
```

**HTTPS required:** Browsers only allow push subscriptions on secure origins. Fly.io serves HTTPS by default.

---

## Telegram setup

Telegram delivery uses the [Bot API](https://core.telegram.org/bots/api). Users link their account via a short-lived deep link; the bot webhook completes the link when the user sends `/start link_<token>` in Telegram.

### Step 1: Create a bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot` and follow the prompts.
3. Note the **bot token** (e.g. `123456789:ABCdef...`).
4. Note the **bot username** without `@` (e.g. `ColaboraBot`).

Optional: set a description and `/setprivacy` to **Disable** if you want the bot to receive all messages in groups (not required for DM linking).

### Step 2: Generate a webhook secret

The webhook secret is sent by Telegram in the `X-Telegram-Bot-Api-Secret-Token` header and validated on every update. Use a random string (32+ characters):

```bash
openssl rand -hex 32
```

Or with Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3: Configure local `.env` (optional)

For local webhook testing you need a public HTTPS URL (e.g. [ngrok](https://ngrok.com)). For UI-only testing without webhooks, you can set secrets and skip webhook registration.

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_BOT_USERNAME=ColaboraBot
TELEGRAM_WEBHOOK_SECRET=your-random-secret-from-step-2
```

### Step 4: Production — set Fly secrets

```bash
fly secrets set \
  TELEGRAM_ENABLED=true \
  TELEGRAM_BOT_TOKEN="123456789:ABCdef..." \
  TELEGRAM_BOT_USERNAME="ColaboraBot" \
  TELEGRAM_WEBHOOK_SECRET="your-random-secret" \
  -a colabora-app
```

### Step 5: Deploy and run migrations

```bash
fly deploy -a colabora-app
```

Migration `011_notification_channels.js` creates `notification_channel_endpoints` and `telegram_link_tokens`.

### Step 6: Register webhook with Telegram

Replace `<BOT_TOKEN>`, `<APP_HOST>`, and `<WEBHOOK_SECRET>` with your values. Default Fly host: `https://colabora-app.fly.dev`.

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://colabora-app.fly.dev/api/webhooks/telegram",
    "secret_token": "<WEBHOOK_SECRET>",
    "allowed_updates": ["message"]
  }'
```

The `secret_token` must match `TELEGRAM_WEBHOOK_SECRET` exactly.

### Step 7: Verify webhook

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

Expect:

- `"url": "https://colabora-app.fly.dev/api/webhooks/telegram"`
- No persistent `"last_error_message"` after a test message

### Step 8: User linking flow

1. User opens Colabora → notification settings → **Connect Telegram**.
2. App calls `POST /api/notifications/telegram/link-token` and opens the returned `deepLink` (`https://t.me/<bot>?start=link_<token>`).
3. User taps **Start** in Telegram; the bot confirms the link.
4. User enables Telegram notifications (immediate and/or digest toggles).

**Disconnect options:**

- In Colabora: **Disconnect Telegram** in settings.
- In Telegram: send `/stop` to the bot.

### Disable Telegram later

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook"
```

Then on Fly:

```bash
fly secrets set TELEGRAM_ENABLED=false -a colabora-app
```

---

## Fly.io secrets reference

### Required for Web Push

| Secret | Example | Notes |
|--------|---------|-------|
| `WEB_PUSH_ENABLED` | `true` | Master toggle |
| `VAPID_PUBLIC_KEY` | `BNcRd...` | Exposed to clients via API |
| `VAPID_PRIVATE_KEY` | `1AbC...` | Server-only; never commit |
| `VAPID_SUBJECT` | `mailto:admin@yourdomain.com` | Contact URI for push service |

### Required for Telegram

| Secret | Example | Notes |
|--------|---------|-------|
| `TELEGRAM_ENABLED` | `true` | Master toggle |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC...` | From @BotFather |
| `TELEGRAM_BOT_USERNAME` | `ColaboraBot` | Without `@`; used in deep links |
| `TELEGRAM_WEBHOOK_SECRET` | 64-char hex | Must match `setWebhook` `secret_token` |

### Related secrets (not channel-specific)

Email notifications still use `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. See [EMAIL_SETUP_GUIDE.md](./EMAIL_SETUP_GUIDE.md).

General Fly secret workflow: [FLY_SECRETS_GUIDE.md](./FLY_SECRETS_GUIDE.md).

**Set all notification secrets in one command (example):**

```bash
fly secrets set \
  WEB_PUSH_ENABLED=true \
  VAPID_PUBLIC_KEY="..." \
  VAPID_PRIVATE_KEY="..." \
  VAPID_SUBJECT="mailto:admin@yourdomain.com" \
  TELEGRAM_ENABLED=true \
  TELEGRAM_BOT_TOKEN="..." \
  TELEGRAM_BOT_USERNAME="ColaboraBot" \
  TELEGRAM_WEBHOOK_SECRET="..." \
  -a colabora-app
```

Validate after deploy:

```bash
npm run validate-env -- --production
fly logs -a colabora-app
```

---

## Security and rate limits

### Webhook authentication

`POST /api/webhooks/telegram` has **no session auth**. Requests are rejected unless the `X-Telegram-Bot-Api-Secret-Token` header matches `TELEGRAM_WEBHOOK_SECRET`. Invalid attempts are logged and return `403 Forbidden`.

### Rate limits

| Route | Limit | Key |
|-------|-------|-----|
| `POST /api/notifications/telegram/link-token` | 5 / 15 min (prod), 20 / 15 min (dev) | Authenticated user ID |
| `POST /api/webhooks/telegram` | 300 / 15 min (prod), 600 / 15 min (dev) | Client IP |

Link-token limits reduce token farming. Webhook limits reduce volumetric abuse while allowing Telegram server bursts.

### Validation script

Run before deploy:

```bash
node scripts/validate-env.js --production
```

Warns when a channel is enabled but required secrets are missing.

---

## Privacy and data retention

Colabora stores the minimum data needed to deliver notifications per channel.

### Web Push (`notification_channel_endpoints`, `channel=push`)

| Stored field | Purpose |
|--------------|---------|
| Push service `endpoint` URL | Where to send notifications (FCM, Mozilla autopush, etc.) |
| `p256dh` / `auth` keys | Encrypt payload for this browser subscription |
| `userAgent` (optional) | Debugging subscription source |

- Multiple active push endpoints per user are allowed (e.g. desktop + phone browser).
- Revoked when the user unsubscribes or the push service returns `410 Gone`.
- Endpoint URLs can indirectly identify a browser/device; treat as personal data under GDPR.

### Telegram (`notification_channel_endpoints`, `channel=telegram`)

| Stored field | Purpose |
|--------------|---------|
| `chatId` | Telegram user/chat identifier for Bot API `sendMessage` |
| `username` (optional) | Display in settings only |

- One active Telegram link per user (partial unique index).
- Link tokens in `telegram_link_tokens` expire after **15 minutes** and are deleted after use.
- `chatId` is persistent until disconnect or `/stop`.

### General practices

- Do not log full push endpoints, VAPID private keys, bot tokens, or webhook secrets.
- On user account deletion, endpoint rows cascade-delete with the user (`ON DELETE CASCADE`).
- Users can revoke push (browser + app) and Telegram (settings or `/stop`) without deleting their account.
- Document these channels in your privacy policy if you enable them in production.

---

## Troubleshooting

### Web Push: `enabled: false` from VAPID endpoint

- Confirm `WEB_PUSH_ENABLED=true` and all three VAPID variables are set.
- Run `npm run validate-env`.
- Restart the server after changing `.env` or Fly secrets.

### Web Push: subscription fails in browser

- Site must be served over HTTPS (except `localhost`).
- Check browser notification permission is not blocked.
- Verify service worker registered (`client/public/sw.js`).

### Telegram: `503 Telegram notifications are not enabled`

- Set `TELEGRAM_ENABLED=true` and all three Telegram secrets.
- Restart app after setting Fly secrets.

### Telegram: webhook returns 403

- `TELEGRAM_WEBHOOK_SECRET` must match the `secret_token` passed to `setWebhook`.
- Re-run `setWebhook` after rotating the secret.

### Telegram: link never completes

- Link token expires in 15 minutes — generate a new one.
- User must send `/start link_<token>` (opening the deep link does this automatically).
- Check `getWebhookInfo` for delivery errors and `fly logs` for handler errors.

### Channel enabled but no notifications

- User must enable the channel in notification preferences (`channel_preferences.push.enabled` / `telegram.enabled`).
- Immediate vs digest toggles are per-channel; digest frequency follows email digest setting.
- Email may still work while push/Telegram are misconfigured — check each channel separately.

---

## Related documentation

- [NOTIFICATION_CHANNELS_API.md](./NOTIFICATION_CHANNELS_API.md) — API contracts and schema
- [EMAIL_SETUP_GUIDE.md](./EMAIL_SETUP_GUIDE.md) — Email (Resend) setup
- [FLY_SECRETS_GUIDE.md](./FLY_SECRETS_GUIDE.md) — Fly.io secrets workflow
- [REDIS_RATE_LIMITING_OPTIMIZATION.md](../REDIS_RATE_LIMITING_OPTIMIZATION.md) — Shared rate limits across instances
