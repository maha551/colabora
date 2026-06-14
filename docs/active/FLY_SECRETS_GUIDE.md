# Fly.io Secrets Setup Guide

This guide helps you set all necessary secrets for your Colabora app on Fly.io.

## Quick Start

### Option 1: Automated Setup (Windows PowerShell)

```powershell
# Check current secrets status
.\setup-fly-secrets.ps1

# Automatically set missing required secrets
.\setup-fly-secrets.ps1 -AutoSet

# Check only (don't set anything)
.\setup-fly-secrets.ps1 -CheckOnly
```

### Option 2: Manual Setup

```bash
# 1. Generate JWT_SECRET
openssl rand -hex 32

# 2. Set the secret on Fly.io
fly secrets set JWT_SECRET=<generated-secret> --app colabora-app

# 3. Verify it's set
fly secrets list --app colabora-app
```

## Required Secrets

### JWT_SECRET (Required)

**Purpose:** Used for signing and verifying JWT authentication tokens.

**Requirements:**
- Minimum 32 characters
- Cryptographically random
- Must be set before deployment

**Generate:**
```bash
# Using OpenSSL
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

**Set:**
```bash
fly secrets set JWT_SECRET=<your-generated-secret> --app colabora-app
```

## Optional Secrets

### RESEND_API_KEY (Optional)

**Purpose:** Enables email functionality (invitations, notifications).

**How to get:**
1. Sign up at [resend.com](https://resend.com)
2. Create an API key in the dashboard
3. Copy the key (starts with `re_`)

**Set:**
```bash
fly secrets set RESEND_API_KEY=re_your_api_key_here --app colabora-app
```

### RESEND_FROM_EMAIL (Optional)

**Purpose:** Custom sender email address for emails.

**Note:** If not set, Resend will use their default domain (`onboarding@resend.dev`).

**Set:**
```bash
fly secrets set RESEND_FROM_EMAIL=noreply@yourdomain.com --app colabora-app
```

## Verify Secrets

```bash
# List all secrets
fly secrets list --app colabora-app

# Check app status
fly status --app colabora-app

# View logs (to see if secrets are working)
fly logs --app colabora-app
```

## Troubleshooting

### Secret Not Working After Setting

1. **Restart the app:**
   ```bash
   fly apps restart --app colabora-app
   ```

2. **Check logs for errors:**
   ```bash
   fly logs --app colabora-app
   ```

3. **Verify secret is set:**
   ```bash
   fly secrets list --app colabora-app
   ```

### App Fails to Start

If the app fails to start with errors about missing `JWT_SECRET`:

1. Ensure `JWT_SECRET` is set:
   ```bash
   fly secrets list --app colabora-app
   ```

2. Verify it's at least 32 characters:
   ```bash
   # The secret should be visible in the list (but not the value)
   fly secrets list --app colabora-app
   ```

3. If missing, set it:
   ```bash
   fly secrets set JWT_SECRET=$(openssl rand -hex 32) --app colabora-app
   ```

4. Restart the app:
   ```bash
   fly apps restart --app colabora-app
   ```

## Security Best Practices

1. **Never commit secrets to version control**
   - Secrets should only be set via `fly secrets set`
   - Never put secrets in `fly.toml` or code files

2. **Use strong, random secrets**
   - Minimum 32 characters for `JWT_SECRET`
   - Use cryptographically secure random generators

3. **Rotate secrets periodically**
   - Rotate `JWT_SECRET` if compromised
   - Note: Rotating `JWT_SECRET` will invalidate all existing sessions

4. **Keep secrets separate**
   - Use different secrets for different environments
   - Don't reuse secrets across apps

## Current App Configuration

Based on `fly.toml`, your app name is: **colabora-app**

To use a different app name:
```powershell
.\setup-fly-secrets.ps1 -AppName your-app-name
```

## Next Steps

After setting secrets:

1. **Deploy the app:**
   ```bash
   fly deploy --app colabora-app
   ```

2. **Create admin user:**
   ```bash
   fly ssh console --app colabora-app
   npm run setup-admin
   ```

3. **Access your app:**
   ```bash
   fly status --app colabora-app
   # Visit the URL shown in the output
   ```

