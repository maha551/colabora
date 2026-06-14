# Email API Setup Guide

This guide will help you set up the email functionality for Colabora using Resend.

## Overview

The email service uses [Resend](https://resend.com) for delivery. Templates live under `server/emails/` with shared layout, branding, i18n, and URL helpers. [`server/modules/emailService.js`](../../server/modules/emailService.js) is a thin send orchestration layer.

Supported email types:

- **Invitation emails** - Org member/representative invites (org branding applied)
- **Document invitation emails** - Collaborator invites for documents
- **Welcome emails** - After joining an organization (org branding)
- **First-user welcome** - Platform onboarding for users without an invite
- **Password reset emails** - App branding only (security)
- **Immediate notifications** - Deadline reminders and voting started
- **Activity digest** - Weekly/monthly summaries (`List-Unsubscribe` header)
- **Deadlines digest** - Weekly approaching-deadlines batch (`List-Unsubscribe` header)
- **Representative rejection** - When a representative declines a vote or rule proposal

## Quick Setup

### Step 1: Get a Resend API Key

1. **Sign up for Resend** (if you haven't already):
   - Go to [https://resend.com](https://resend.com)
   - Create a free account

2. **Create an API Key**:
   - Navigate to **API Keys** in the Resend dashboard
   - Click **Create API Key**
   - Give it a name (e.g., "Colabora Production")
   - Copy the API key (it starts with `re_`)
   - ⚠️ **Important**: Save this key immediately - you won't be able to see it again!

### Step 2: Set Up for Local Development

1. **Create a `.env` file** (if you don't have one):
   ```bash
   # Copy the example file
   cp env.example .env
   ```

2. **Add your Resend API key to `.env`**:
   ```env
   RESEND_API_KEY=re_your_actual_api_key_here
   RESEND_FROM_EMAIL=onboarding@resend.dev
   RESEND_FROM_NAME=Colabora
   ```

   **Note**: For local development, you can use `onboarding@resend.dev` as the sender email. This is Resend's default testing domain. Emails are sent as `Colabora <onboarding@resend.dev>` (or `Org Name via Colabora` for org invites).

3. **Restart your development server**:
   ```bash
   npm run dev
   ```

### Step 3: Production (Hetzner + Kamal)

After your domain is **verified in Resend** ([resend.com/domains](https://resend.com/domains)):

1. **Set secrets** in `.kamal/secrets` (and GitHub Actions secrets for CI):

   ```env
   RESEND_API_KEY=re_xxxxxxxx
   RESEND_FROM_EMAIL=noreply@local-correspondent.com
   ```

   **Important:** `RESEND_FROM_EMAIL` must use the **exact domain you verified in Resend**.
   - Verified `local-correspondent.com` → `noreply@local-correspondent.com` ✅
   - App URL `colabora.local-correspondent.com` is fine for links — the **sender** domain is separate unless you verified that subdomain in Resend.

2. **Optional display name** (in `config/deploy.pilot.yml` / `deploy.yml`):

   ```yaml
   RESEND_FROM_NAME: "Colabora"
   ```

3. **Redeploy** so the container picks up secrets:

   ```bash
   npm run deploy:hetzner:pilot
   ```

4. **Test from the running server:**

   ```bash
   npm run test:email
   kamal app exec -d pilot 'node scripts/test-email-setup.js --test-email=you@example.com'
   ```

5. **Test in the app:** invite a member to an organization — check [resend.com/emails](https://resend.com/emails) for delivery status.

#### Legacy: Fly.io

```bash
fly secrets set RESEND_API_KEY=re_... RESEND_FROM_EMAIL=noreply@yourdomain.com --app your-app-name
fly apps restart --app your-app-name
```

## Testing Mode vs Production Mode

### Resend Testing Mode

When using `onboarding@resend.dev` (Resend's default domain), you're in **testing mode**:
- ✅ You can send emails to **your own verified email address**
- ❌ You **cannot** send emails to other recipients
- This is perfect for development and testing

### Production Mode

To send emails to any recipient:
1. **Verify a domain** in the Resend dashboard:
   - Go to [resend.com/domains](https://resend.com/domains)
   - Add and verify your domain
   - Follow the DNS setup instructions

2. **Set `RESEND_FROM_EMAIL`** to use your verified domain (Kamal / `.kamal/secrets` or GitHub secrets):

   ```env
   RESEND_FROM_EMAIL=noreply@your-verified-domain.com
   ```

3. **Redeploy** (`npm run deploy:hetzner:pilot`) or restart the app on Fly.

## Verification

### Check if Email Service is Configured

1. **Check server logs** when the app starts:
   ```bash
   # For local development
   npm run dev
   # Look for: "RESEND_API_KEY not configured" (if not set) or no warning (if set)

   # For production (Hetzner)
   kamal app logs -d pilot
   # Should NOT see: "RESEND_API_KEY not configured"
   ```

2. **Test sending an invitation**:
   - Create an organization
   - Invite a member
   - Check the logs for email sending status

### Verify Email Delivery

1. **Check Resend Dashboard**:
   - Go to [resend.com/emails](https://resend.com/emails)
   - You should see sent emails with their status

2. **Check recipient inbox**:
   - Look in spam/junk folder if not in inbox
   - Verify the sender email matches your `RESEND_FROM_EMAIL`

## Troubleshooting

### Issue: "RESEND_API_KEY not configured" in logs

**Solution**: The API key is not set or not accessible.

- **Local**: Check `.env` has `RESEND_API_KEY=re_...`
- **Hetzner**: `kamal app exec -d pilot 'printenv RESEND_API_KEY RESEND_FROM_EMAIL'` (values redacted in logs — use `npm run test:email` instead)
- **Fly (legacy)**: `fly secrets list --app your-app-name`

### Issue: "only send testing emails to your own email address"

**Solution**: You're in testing mode and trying to send to an unverified email.

- **For development**: Use your own email address for testing
- **For production**: Verify a domain in Resend and set `RESEND_FROM_EMAIL` to use that domain

### Issue: Emails not arriving

1. **Check Resend dashboard**:
   - Go to [resend.com/emails](https://resend.com/emails)
   - Check if emails were sent and their status
   - Look for bounce or rejection errors

2. **Check spam folder**: Emails might be filtered

3. **Verify recipient email**: Make sure the email address is correct

4. **Check server logs**: Look for error messages in the logs

### Issue: "Resend API error" in logs

1. **Verify API key is correct**: 
   - Check that it starts with `re_`
   - Ensure there are no extra spaces or characters

2. **Check API key permissions**:
   - In Resend dashboard, verify the API key has "Send Email" permission

3. **Check rate limits**:
   - Free tier has limits (check Resend dashboard)
   - Upgrade plan if needed

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | Yes (for email) | `null` | Your Resend API key (starts with `re_`) |
| `RESEND_FROM_EMAIL` | No | `onboarding@resend.dev` | Sender email address. Use your verified domain for production. |
| `RESEND_FROM_NAME` | No | `Colabora` | Display name in the From header |
| `APP_LOGO_URL` | No | `{FRONTEND_URL}/logo-light.png` | Absolute URL for logo in email headers |
| `SUPPORT_EMAIL` | No | `null` | Optional support contact (reserved for future templates) |

## Architecture

```
server/emails/
  urls.js          # Single link builder (hash routes for SPA, pathname for auth)
  tokens.js        # Colors, typography, layout constants
  branding.js      # App + organization branding merge
  i18n.js          # Locale loading and t() helper
  layout.js        # Shared HTML/text shell with preheader
  components.js    # Buttons, callouts, digest sections
  templates/       # Per-email render functions
```

Copy for all templates is in `client/public/locales/{locale}/emails.json`. After editing `en/emails.json`, sync to other locales:

```bash
node scripts/sync-i18n-keys.js all
```

User locale is read from `users.preferences.locale` when sending to registered users. Invite emails default to English until the recipient has an account.

## Link conventions

- In-app links use hash routes: `{FRONTEND_URL}/#/organization/{id}/governance`, `{FRONTEND_URL}/#document/{id}`
- Auth links use pathname routes: `/register?token=...`, `/reset-password?token=...`
- Token URLs must not include UTM parameters

## Branding

| Email | Branding |
|-------|----------|
| Invitation, welcome | Organization logo, color, title when configured |
| Document invitation | App branding (document context in copy) |
| Password reset, first-user welcome | Colabora app branding only |
| Notifications, digests | Colabora layout; org name in body where relevant |

Organization fields: `branding_color`, `branding_logo_url`, `branding_title` from the organizations table.

## Email Templates

1. **Invitation** (`sendInvitationEmail`) - 7-day expiry, org branding
2. **Document invitation** (`sendDocumentInvitationEmail`) - 7-day expiry
3. **Welcome** (`sendWelcomeEmail`) - Post-registration, org branding
4. **First-user welcome** (`sendFirstUserWelcomeEmail`) - No org yet
5. **Password reset** (`sendPasswordResetEmail`) - 1-hour expiry, security footer
6. **Immediate notification** (`sendImmediateNotification`) - Deadlines and voting started
7. **Activity digest** (`sendDigestEmail`) - Weekly/monthly, grouped by event type
8. **Deadlines digest** (`sendDeadlinesDigestEmail`) - Weekly batch of approaching deadlines
9. **Representative rejection** (`sendRepresentativeRejectionEmail`) - Decline reason to proposer

## Development Mode Behavior

When `RESEND_API_KEY` is not configured in development:
- Email links are **logged to console** instead of being sent
- This allows you to test the flow without sending actual emails
- Look for messages like: `📧 INVITATION EMAIL (DEVELOPMENT MODE)`

## Security Best Practices

1. **Never commit API keys to version control**
   - Use `.env` for local development (already in `.gitignore`)
   - Use Fly.io secrets for production

2. **Rotate API keys periodically**
   - Create new keys in Resend dashboard
   - Update secrets
   - Delete old keys

3. **Use domain verification for production**
   - Improves email deliverability
   - Prevents spam filtering
   - More professional appearance

## Next Steps

After setting up email:

1. **Test invitation flow**: Create an organization and invite a member
2. **Test password reset**: Use the "Forgot Password" feature
3. **Monitor email delivery**: Check Resend dashboard regularly
4. **Set up domain verification**: For production use

## Additional Resources

- [Resend Documentation](https://resend.com/docs)
- [Resend API Reference](https://resend.com/docs/api-reference)
- [Resend Domain Verification](https://resend.com/docs/dashboard/domains/introduction)
