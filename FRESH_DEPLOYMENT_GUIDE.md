# Fresh Production Deployment Guide

Complete guide for deploying Colabora to Fly.io with PostgreSQL, optimized for 50 concurrent users.

## Prerequisites

1. **Fly.io CLI installed**
   ```powershell
   # Install from: https://fly.io/docs/flyctl/installing/
   # Or via winget:
   winget install --id=flyctl.flyctl
   ```

2. **Fly.io account and authentication**
   ```powershell
   fly auth login
   ```

3. **PowerShell 5.1+** (Windows 10/11)

## Quick Start

### Option 1: Automated Deployment (Recommended)

Run the automated deployment script:

```powershell
.\deploy-fresh-production.ps1
```

This script will:
- ✅ Create Fly.io app (if it doesn't exist)
- ✅ Create PostgreSQL database
- ✅ Attach database to app
- ✅ Optionally configure Redis (for multi-instance deployments)
- ✅ Generate and set all required secrets
- ✅ Configure production settings for 50 concurrent users
- ✅ Deploy the application
- ✅ Wait for app to be ready

### Option 2: Manual Step-by-Step

If you prefer manual control, follow these steps:

#### Step 1: Create Fly.io App

```powershell
fly apps create colabora-app --org personal
```

#### Step 2: Create PostgreSQL Database

```powershell
fly postgres create --name colabora-db --region fra --vm-size shared-cpu-1x --volume-size 10 --initial-cluster-size 1
```

#### Step 3: Attach Database to App

```powershell
fly postgres attach --app colabora-app colabora-db --yes
```

#### Step 3.5: Configure Redis (Optional)

Redis is **optional** for single-instance deployments but **required** for multi-instance deployments (2+ instances).

**When to use Redis:**
- ✅ You plan to scale to 2+ instances for redundancy/performance
- ✅ You need shared rate limiting across instances
- ✅ You need WebSocket updates to work across instances

**When to skip Redis:**
- ✅ Single-instance deployment (saves money)
- ✅ <50 concurrent users (single instance can handle this)
- ✅ You can add Redis later when needed

**Setup Redis:**

```powershell
# Option 1: Use Upstash Redis (recommended)
# Create at: https://upstash.com
# Then set the URL:
fly secrets set REDIS_URL="redis://default:password@host.upstash.io:6379" --app colabora-app

# Option 2: Use Fly.io Redis (if available)
fly redis create --name colabora-redis
# Then attach and set URL

# Option 3: Skip for now (can add later)
# Application works fine without Redis in single-instance mode
```

**Verify Redis is set:**

```powershell
fly secrets list --app colabora-app | Select-String REDIS_URL
```

#### Step 4: Set Secrets

```powershell
# Generate JWT_SECRET
$jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})

# Set JWT_SECRET
fly secrets set "JWT_SECRET=$jwtSecret" --app colabora-app

# Set production environment variables
fly secrets set `
  "NODE_ENV=production" `
  "PORT=3000" `
  "JWT_EXPIRES_IN=24h" `
  "LOG_LEVEL=info" `
  "RATE_LIMIT_WINDOW_MS=900000" `
  "RATE_LIMIT_MAX_REQUESTS=1000" `
  "PG_POOL_MIN=5" `
  "PG_POOL_MAX=20" `
  "PG_POOL_ACQUIRE_TIMEOUT=30000" `
  "PG_POOL_MAX_WAITING=50" `
  "PG_STATEMENT_TIMEOUT=300000" `
  "PG_IDLE_TRANSACTION_TIMEOUT=60000" `
  "PG_KEEPALIVE_ENABLED=true" `
  "PG_KEEPALIVE_INITIAL_DELAY=30000" `
  "PG_SOCKET_TIMEOUT=300000" `
  "ALLOWED_ORIGINS=https://colabora-app.fly.dev" `
  --app colabora-app
```

#### Step 5: Deploy Application

```powershell
fly deploy --app colabora-app
```

#### Step 6: Create Admin User

```powershell
# Option A: Use automated script
.\scripts\setup-admin-remote.ps1 -AppName colabora-app

# Option B: Manual SSH
fly ssh console --app colabora-app
node scripts/setup-admin.js
exit
```

Important:
- No admin is auto-created by default; this command is required.
- Change the initial admin password immediately after first login.
- Keep restore drill notes in `docs/runbooks/db-restore-drill.md`.

## Configuration for 50 Concurrent Users

The deployment is optimized for 50 concurrent users with the following settings:

### PostgreSQL Connection Pool
- **Min connections**: 5
- **Max connections**: 20
- **Max waiting**: 50
- **Acquire timeout**: 30 seconds

### Rate Limiting
- **Window**: 15 minutes (900,000 ms)
- **Max requests**: 1000 per window
- **Per user**: ~1.1 requests/second (reasonable for active discussion)

### Application Resources
- **Memory**: 2GB (recommended for 50+ users)
- **CPU**: 1 shared CPU
- **Min machines running**: 1 (always available)

### Redis Configuration
- **Status**: Optional for single-instance, required for multi-instance
- **Cost**: $0-5/month (Upstash free tier available)
- **Purpose**: Shared rate limiting and WebSocket support across instances

## Post-Deployment

### Verify Deployment

```powershell
# Check app status
fly status --app colabora-app

# View logs
fly logs --app colabora-app

# Test health endpoint
curl https://colabora-app.fly.dev/api/health/ready
```

### Access the Application

- **URL**: https://colabora-app.fly.dev
- **Admin Account**: created only after running Step 6 (`npm run setup-admin` flow)

⚠️ **IMPORTANT**: If you used `setup-admin`, rotate the initial password immediately.

### Useful Commands

```powershell
# View logs
fly logs --app colabora-app

# SSH into app
fly ssh console --app colabora-app

# Check secrets
fly secrets list --app colabora-app

# Restart app
fly apps restart --app colabora-app

# Scale database (if needed)
fly postgres scale --app colabora-db --count 1

# View database status
fly postgres status --app colabora-db
```

## Troubleshooting

### App Won't Start

1. Check logs: `fly logs --app colabora-app`
2. Verify secrets are set: `fly secrets list --app colabora-app`
3. Check DATABASE_URL is correct: `fly secrets list --app colabora-app | Select-String DATABASE_URL`

### Database Connection Issues

1. Verify database is running: `fly postgres status --app colabora-db`
2. Check DATABASE_URL secret: `fly secrets list --app colabora-app`
3. Test connection: SSH into app and run `node scripts/check-database-connectivity.js`

### Admin User Creation Fails

1. Ensure app is fully deployed and running
2. Wait a few minutes after deployment for migrations to complete
3. Check database connection: `fly ssh console --app colabora-app` then `node scripts/check-database-connectivity.js`
4. Try creating admin manually via SSH

### Performance Issues

If you experience performance issues with 50+ users:

1. **Scale database**: Consider upgrading VM size
   ```powershell
   fly postgres scale --app colabora-db --vm-size shared-cpu-2x
   ```

2. **Increase connection pool**: Adjust PG_POOL_MAX (but keep < 80% of DB max_connections)
   ```powershell
   fly secrets set "PG_POOL_MAX=30" --app colabora-app
   fly apps restart --app colabora-app
   ```

3. **Scale application**: Add more app instances
   ```powershell
   # Scale to 2 instances
   fly scale count 2 --app colabora-app
   
   # ⚠️ IMPORTANT: Redis is REQUIRED for multi-instance deployments
   # Set REDIS_URL before scaling, or WebSocket updates won't work across instances
   fly secrets set REDIS_URL="redis://..." --app colabora-app
   ```

## Security Checklist

- [x] JWT_SECRET is set and secure (64+ characters)
- [x] NODE_ENV is set to production
- [x] HTTPS is enforced (force_https = true)
- [x] Admin password changed from default
- [x] CORS is configured correctly
- [x] Rate limiting is enabled
- [x] Database is not publicly accessible (Fly.io internal network)

## Scaling Beyond 50 Users

### For 100-200 Concurrent Users

1. **Upgrade database VM** (if needed):
   ```powershell
   fly postgres scale --vm-size performance-1x --app colabora-db
   ```

2. **Increase connection pool** (adjust based on DB max_connections):
   ```powershell
   fly secrets set "PG_POOL_MAX=80" --app colabora-app
   fly apps restart --app colabora-app
   ```

3. **Scale app instances** (horizontal scaling):
   ```powershell
   # Scale to 2 instances
   fly scale count 2 --app colabora-app
   ```

4. **Configure Redis** (REQUIRED for multi-instance):
   ```powershell
   # Redis is required for 2+ instances
   # Without Redis, users on different instances won't see each other's updates
   fly secrets set REDIS_URL="redis://..." --app colabora-app
   fly apps restart --app colabora-app
   ```

### For 200-300 Concurrent Users

1. **Upgrade database VM**:
   ```powershell
   fly postgres scale --vm-size performance-2x --app colabora-db
   ```

2. **Increase connection pool**:
   ```powershell
   fly secrets set "PG_POOL_MAX=160" --app colabora-app
   fly apps restart --app colabora-app
   ```

3. **Scale app instances**:
   ```powershell
   fly scale count 3 --app colabora-app
   ```

4. **Ensure Redis is configured** (required for multi-instance)

### Cost Considerations

**Single Instance (No Redis):**
- App: ~$15-20/month (2GB RAM)
- Database: ~$15-30/month (performance-1x)
- **Total: ~$30-50/month**

**Multi-Instance (With Redis):**
- App: ~$30-60/month (2-3 instances × 2GB)
- Database: ~$15-30/month (performance-1x)
- Redis: ~$0-5/month (Upstash free tier often sufficient)
- **Total: ~$45-95/month**

**Recommendation:** Start with single instance, add Redis when you need to scale to 2+ instances.

## Support

If you encounter issues:

1. Check logs: `fly logs --app colabora-app`
2. Review this guide's troubleshooting section
3. Check Fly.io status: https://status.fly.io
4. Review application logs in the Fly.io dashboard
