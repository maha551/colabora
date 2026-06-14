# Production Deployment Guide for Fly.io

**Date:** 2026-01-27  
**Purpose:** Best practices for deploying Colabora app on Fly.io for multiple users  
**Focus:** Avoiding connection pool exhaustion and proper production setup

---

## 🎯 Quick Summary

**For production with multiple users, you need:**
1. ✅ Database VM: `performance-1x` (100 max_connections)
2. ✅ Connection Pool: `PG_POOL_MAX=80` (80% of 100)
3. ✅ App VM: `1gb` memory minimum
4. ✅ Consistent app naming
5. ✅ Proper secrets configuration

---

## 🔍 Current Issues Identified

### 1. App Naming Mismatch ⚠️

**Problem:**
- `fly.toml` has: `app = 'colabora-50users-20260111'`
- Deployment script defaults to: `AppName = "colabora-app"`

**Impact:**
- Deployments may target wrong app
- URL configuration may be incorrect

**Solution:**
- Script now reads from `fly.toml` automatically
- Or specify app name explicitly: `.\deploy-fresh-production.ps1 -AppName "your-app-name"`

**App Renaming:**
- ✅ **App renaming is NOT an issue** - the app uses `FLY_APP_NAME` environment variable to auto-detect URLs
- When you rename an app in Fly.io, `FLY_APP_NAME` updates automatically
- `FRONTEND_URL` and `ALLOWED_ORIGINS` can be auto-detected or manually set

### 2. Connection Pool Exhaustion 🔴 CRITICAL

**Problem:**
- Current setup: `PG_POOL_MAX=20` with `shared-cpu-1x` database (~5 max_connections)
- **This is a critical mismatch!** Pool (20) > Database max_connections (5)
- Will cause immediate pool exhaustion

**Root Cause:**
- Database VM size determines `max_connections`:
  - `shared-cpu-1x`: ~5 connections ❌
  - `shared-cpu-2x`: ~10 connections ⚠️
  - `shared-cpu-4x`: ~25 connections ✅ (minimum for production)
  - `performance-1x`: ~100 connections ✅✅ (recommended for multiple users)

**Solution:**
1. Upgrade database to `performance-1x` (100 connections)
2. Set `PG_POOL_MAX=80` (80% of 100, safe margin)
3. Set `PG_POOL_MIN=10` (warm pool)

---

## 📊 Database VM Size vs Max Connections

| VM Size | RAM | Max Connections | Recommended Pool Max | Cost/Month |
|---------|-----|----------------|----------------------|------------|
| `shared-cpu-1x` | 256MB | ~5 | 4 | ~$1.94 |
| `shared-cpu-2x` | 512MB | ~10 | 8 | ~$3.88 |
| `shared-cpu-4x` | 1GB | ~25 | 20 | ~$7.76 |
| `performance-1x` | 2GB | ~100 | 80 | ~$15.52 |
| `performance-2x` | 4GB | ~200 | 160 | ~$31.04 |

**Rule of Thumb:**
- Pool max should be **< 80%** of database `max_connections`
- This leaves room for:
  - Database maintenance connections
  - Admin connections
  - Connection overhead

---

## 🚀 Recommended Production Setup

### For 50-100 Concurrent Users

```bash
# 1. Database: performance-1x (100 connections)
fly postgres create --name colabora-db \
  --region fra \
  --vm-size performance-1x \
  --volume-size 10 \
  --initial-cluster-size 1

# 2. App Configuration
# - VM: 1gb memory (already configured)
# - Pool: PG_POOL_MAX=80
# - Pool: PG_POOL_MIN=10
```

### For 100-300 Concurrent Users

```bash
# 1. Database: performance-1x or performance-2x
fly postgres create --name colabora-db \
  --region fra \
  --vm-size performance-1x \
  --volume-size 20 \
  --initial-cluster-size 1

# 2. App Configuration
# - VM: 2gb memory
# - Pool: PG_POOL_MAX=80 (or 160 for performance-2x)
# - Scale app: fly scale count 2-3
```

---

## 📝 Step-by-Step Production Deployment

### Option 1: Fresh Deployment (Recommended)

Use the optimized deployment script:

```powershell
.\deploy-fresh-production.ps1 `
  -AppName "colabora-app" `
  -DbName "colabora-db" `
  -Region "fra" `
  -VmSize "performance-1x" `
  -DbVolumeSize 10
```

**What it does:**
1. ✅ Creates/uses app with correct name
2. ✅ Creates database with `performance-1x` (100 connections)
3. ✅ Sets pool to `PG_POOL_MAX=80` (safe for 100 connections)
4. ✅ Configures all secrets properly
5. ✅ Updates `fly.toml` with correct app name
6. ✅ Deploys application

### Option 2: Upgrade Existing Deployment

If you already have a deployment:

```powershell
# 1. Upgrade database VM
fly scale vm performance-1x --app colabora-db

# 2. Update connection pool settings
fly secrets set PG_POOL_MIN=10 PG_POOL_MAX=80 --app colabora-app

# 3. Restart app to apply changes
fly apps restart colabora-app

# 4. Verify pool configuration and DB capacity
fly ssh console --app colabora-app -C "node scripts/check-max-connections.js"
# With 2 app instances, set PG_POOL_MAX so 2 × PG_POOL_MAX is below DB "Available for application" (e.g. PG_POOL_MAX=40 when DB allows 97).
# Example: fly secrets set PG_POOL_MIN=2 PG_POOL_MAX=40 --app colabora-app
```

---

## 🔧 Configuration Details

### Connection Pool Settings

**For `performance-1x` database (100 max_connections):**

```env
PG_POOL_MIN=10          # Warm pool, ready connections
PG_POOL_MAX=80          # 80% of 100, safe margin
PG_POOL_ACQUIRE_TIMEOUT=30000  # 30s timeout
# Required only if no admin exists yet:
ADMIN_BOOTSTRAP_EMAIL=owner@example.com
ADMIN_BOOTSTRAP_PASSWORD=<strong-random-password>
ADMIN_BOOTSTRAP_TOKEN=<32+char-one-time-bootstrap-token>
```

**For `shared-cpu-4x` database (25 max_connections):**

```env
PG_POOL_MIN=5           # Minimum warm pool
PG_POOL_MAX=20          # 80% of 25, safe margin
PG_POOL_ACQUIRE_TIMEOUT=30000
```

### App VM Configuration

**Current (fly.toml):**
```toml
[[vm]]
  memory = '1gb'
  cpu_kind = 'shared'
  cpus = 1
```

**For higher load (100+ users):**
```toml
[[vm]]
  memory = '2gb'
  cpu_kind = 'shared'
  cpus = 1
```

Then scale horizontally:
```bash
fly scale count 2  # 2 instances
```

---

## ✅ Verification Checklist

After deployment, verify:

1. **Database VM Size:**
   ```bash
   fly scale show --app colabora-db
   # Should show: performance-1x
   ```

2. **Database Max Connections:**
   ```bash
   fly ssh console --app colabora-app -C "node scripts/check-max-connections.js"
   # Should show: max_connections: 100
   ```

3. **Connection Pool Settings:**
   ```bash
   fly secrets list --app colabora-app | grep PG_POOL
   # Should show: PG_POOL_MAX=80, PG_POOL_MIN=10
   ```

4. **App Health:**
   ```bash
   curl -i https://your-app.fly.dev/api/health/live
   # Should return HTTP 200 while process is alive

   curl https://your-app.fly.dev/api/health/ready
   # Should return HTTP 200 only when fully ready
   # Returns HTTP 503 during startup/degraded states
   ```

5. **Pool Statistics:**
   ```bash
   fly logs --app colabora-app | grep -i "pool"
   # Should show pool configuration and stats
   ```

---

## 🐛 Troubleshooting

### Pool Exhaustion Errors

**Symptoms:**
- `timeout: ResourceRequest timed out`
- `Error acquiring connection from pool`
- Slow response times

**Diagnosis:**
```bash
# Check database max_connections
fly ssh console --app colabora-app -C "node scripts/check-max-connections.js"

# Check pool configuration
fly secrets list --app colabora-app | grep PG_POOL

# Check pool usage in logs
fly logs --app colabora-app | grep -i "pool"
```

**Fix:**
1. Upgrade database VM if `max_connections` is too low
2. Reduce `PG_POOL_MAX` to < 80% of `max_connections`
3. Restart app: `fly apps restart colabora-app`

### App Naming Issues

**Symptoms:**
- Wrong URL in CORS errors
- App not found errors

**Fix:**
1. Check `fly.toml`: `app = 'your-app-name'`
2. Check actual app name: `fly apps list`
3. Update `fly.toml` or use `-AppName` parameter
4. Redeploy: `fly deploy --app your-app-name`

### Database Connection Issues

**Symptoms:**
- `DATABASE_URL not set`
- Connection refused errors

**Fix:**
```bash
# Re-attach database
fly postgres attach --app colabora-app colabora-db

# Verify DATABASE_URL
fly secrets list --app colabora-app | grep DATABASE_URL

# Check database status
fly status --app colabora-db
```

---

## 📈 Scaling Recommendations

### Current Setup (50 users)
- Database: `performance-1x` (100 connections)
- Pool: `PG_POOL_MAX=80`
- App: 1 instance, 1gb memory
- ✅ **Sufficient**

### For 100-200 users
- Database: `performance-1x` (100 connections) - still OK
- Pool: `PG_POOL_MAX=80` - still OK
- App: 2 instances, 1gb memory each
- ✅ **Scale app horizontally**

### For 200-300 users
- Database: `performance-2x` (200 connections)
- Pool: `PG_POOL_MAX=160`
- App: 2-3 instances, 2gb memory each
- ✅ **Scale both database and app**

---

## 🎯 Best Practices

1. **Always match pool size to database capacity:**
   - Check database `max_connections` first
   - Set `PG_POOL_MAX` to 80% of that
   - Never set pool > database max_connections

2. **Start with `performance-1x` for production:**
   - `shared-cpu-1x` is too small (only 5 connections)
   - `shared-cpu-4x` is minimum (25 connections)
   - `performance-1x` is recommended (100 connections)

3. **Monitor pool usage:**
   - Check logs for pool exhaustion warnings
   - Use `check-max-connections.js` script regularly
   - Adjust pool size based on actual usage

4. **App naming:**
   - Use consistent naming across `fly.toml` and deployment scripts
   - App renaming is safe (FLY_APP_NAME auto-updates)
   - Always specify app name explicitly in scripts

5. **Data is not important:**
   - You can destroy and recreate databases
   - Fresh deployments are safe
   - Use this to test different configurations

---

## 📚 Related Documentation

- [SCALABILITY_ANALYSIS_300_USERS.md](../SCALABILITY_ANALYSIS_300_USERS.md) - Detailed scalability analysis
- [FLY_IO_FRESH_DEPLOY.md](./FLY_IO_FRESH_DEPLOY.md) - Fresh deployment steps
- [POSTGRES_OOM_FIX.md](./POSTGRES_OOM_FIX.md) - Database memory issues

---

## ✅ Summary

**For production with multiple users:**

1. ✅ Use `performance-1x` database (100 connections)
2. ✅ Set `PG_POOL_MAX=80` (80% of 100)
3. ✅ Use consistent app naming
4. ✅ Monitor pool usage
5. ✅ Scale horizontally when needed

**App renaming is NOT an issue** - Fly.io handles it automatically via `FLY_APP_NAME`.
