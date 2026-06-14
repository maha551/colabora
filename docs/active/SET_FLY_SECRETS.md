# Quick Guide: Setting Fly.io Secrets

## Your App Name
Based on `fly.toml`, your app is: **colabora-app**

## Required Secret

### JWT_SECRET (Required)

This is the **only required secret** for your app to run.

**Generate a secret:**
```powershell
# Using Node.js (if you have it installed)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or using PowerShell
-join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

**Set it on Fly.io:**
```powershell
fly secrets set JWT_SECRET=<your-generated-secret> --app colabora-app
```

**Example:**
```powershell
fly secrets set JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6 --app colabora-app
```

## Optional Secrets (for Email Features)

### RESEND_API_KEY
```powershell
fly secrets set RESEND_API_KEY=re_your_api_key_here --app colabora-app
```

### RESEND_FROM_EMAIL
```powershell
fly secrets set RESEND_FROM_EMAIL=noreply@yourdomain.com --app colabora-app
```

## Verify Secrets Are Set

```powershell
fly secrets list --app colabora-app
```

## After Setting Secrets

1. **Restart your app:**
   ```powershell
   fly apps restart --app colabora-app
   ```

2. **Check logs to verify:**
   ```powershell
   fly logs --app colabora-app
   ```

## Quick One-Liner (Node.js)

If you have Node.js installed, you can generate and set the secret in one go:

```powershell
$secret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
fly secrets set JWT_SECRET=$secret --app colabora-app
```

## Troubleshooting

If the app fails to start:
1. Verify the secret is set: `fly secrets list --app colabora-app`
2. Check logs: `fly logs --app colabora-app`
3. Restart: `fly apps restart --app colabora-app`

