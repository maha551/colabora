# Fly.io PostgreSQL Commands Reference

## Important: Use `fly pg` Commands for PostgreSQL Apps

For PostgreSQL database apps on Fly.io, always use `fly pg` commands instead of generic `fly apps` commands.

## Database App Commands

### Restart Database

**For Managed PostgreSQL (fly mpg):**
```bash
# If using managed PostgreSQL
fly mpg restart --app colabora-app-db
```

**For Unmanaged PostgreSQL App:**
```bash
# If it's a regular app running PostgreSQL (unmanaged)
fly apps restart colabora-app-db

# Or if the app name is different, check with:
fly status --app colabora-app-db
```

**To determine which type you have:**
```bash
# Check if it's a managed PostgreSQL
fly postgres list

# Check app status
fly status --app colabora-app-db

# If you see "Unmanaged Fly Postgres" message, use:
fly apps restart colabora-app-db
```

### Check Database Status
```bash
# Check PostgreSQL-specific status
fly pg status --app colabora-app-db

# Or general app status
fly status --app colabora-app-db
```

### List PostgreSQL Databases
```bash
fly postgres list
```

### Attach Database to App
```bash
fly postgres attach --app colabora-app colabora-app-db
```

### Create PostgreSQL Database
```bash
fly postgres create --name colabora-app-db --region fra --vm-size shared-cpu-1x --volume-size 10
```

### Scale Database
```bash
fly pg scale --app colabora-app-db --count 1
```

## Application App Commands

For your main application (not the database), use regular `fly apps` commands:

```bash
# Restart application
fly apps restart colabora-app

# Check application status
fly status --app colabora-app

# View application logs
fly logs --app colabora-app
```

## Quick Reference

| Action | Database App | Application App |
|--------|-------------|-----------------|
| Restart | `fly pg restart <db-name>` | `fly apps restart <app-name>` |
| Status | `fly pg status --app <db-name>` | `fly status --app <app-name>` |
| Logs | `fly logs --app <db-name>` | `fly logs --app <app-name>` |
| Scale | `fly pg scale --app <db-name>` | `fly scale --app <app-name>` |

## Common Workflow

### Restart Database to Fix Connection Issues

```bash
# 1. Restart the database
fly pg restart colabora-app-db

# 2. Wait for it to come back up (30-60 seconds)
fly pg status --app colabora-app-db

# 3. Test connection
npm run diagnose:db

# 4. If app still can't connect, restart the app
fly apps restart colabora-app
```

### Check Database Health

```bash
# Check database status
fly pg status --app colabora-app-db

# Check database logs
fly logs --app colabora-app-db

# Run health diagnostic
npm run diagnose:db-server
```

## Connection pool exhausted ("total: 1", "free: 0")

If logs show **"Connection pool exhausted - no free connections available"** with `"total": 1`, the app is using only one database connection. One slow or stuck request then blocks everything and you may also see **"Connection ended unexpectedly"**.

**Fix: allow more connections per app instance**

1. **Set pool size secrets** (recommended: at least 2 connections so one request doesn’t block others):
   ```bash
   fly secrets set PG_POOL_MIN=2 PG_POOL_MAX=10 --app colabora-app
   fly apps restart colabora-app
   ```

2. **Ensure the database allows enough connections.**  
   If using Fly Postgres (unmanaged), typical limits are roughly:
   - shared-cpu-1x: ~5 connections  
   - shared-cpu-2x: ~10  
   - shared-cpu-4x: ~25  

   With `min_machines_running = 2`, two app instances each using up to `PG_POOL_MAX` connections, so keep `PG_POOL_MAX` at or below half of the DB’s limit (e.g. 5–10 for shared-cpu-1x).

3. **Check pool after restart:**  
   Look in app logs for `PostgreSQL connection pool configuration` and confirm `parsedMin` / `parsedMax` match what you set. If the pool still shows only 1 connection, the database is likely limiting you; upgrade the DB VM or plan (see `scripts/check-max-connections.ps1` and `scripts/increase-pool-size.ps1`).

---

## Managed Postgres (MPG): "list users" / connection pool timeout

If `fly mpg attach` or other MPG commands fail with **500** and a message like *"connection not available and request was dropped from queue after 4000ms"*, the cluster’s internal pool is overloaded or stuck.

**1. Attach without listing (use cluster ID so the CLI doesn’t call “list users”):**
```bash
# Use your cluster ID from the error (e.g. w76geopyyk5oplk4)
fly mpg attach w76geopyyk5oplk4 --app colabora-app
```

**2. Ease load on the cluster from your app (set on colabora-app):**
```bash
# Fewer connections per app instance so the cluster pool isn’t exhausted
fly secrets set PG_POOL_MIN=2 PG_POOL_MAX=10 --app colabora-app
fly apps restart colabora-app
```

**3. Check cluster status (use cluster ID):**
```bash
fly mpg status w76geopyyk5oplk4
```

**4. Restart the MPG cluster** (if still stuck): use the [Fly dashboard](https://fly.io/dashboard) → your org → **Data** → select cluster **colabora-app-db** → restart or scale if available. There is no `fly mpg restart` CLI; use the dashboard.

After the cluster is healthy again, run the attach command from step 1.

---

## Why the Difference?

Fly.io PostgreSQL apps are managed differently than regular apps:
- They use `fly pg` commands for database-specific operations
- They have special handling for replication, backups, and scaling
- They require different restart procedures to maintain data integrity

Always use `fly pg` commands for PostgreSQL database apps to ensure proper handling.
