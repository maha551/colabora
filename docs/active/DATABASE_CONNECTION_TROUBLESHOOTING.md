# Database Connection Troubleshooting

## Issue: Database Connection Not Available (503 Error)

If you see "Database connection is not available" errors, the database failed to initialize during startup.

## Automatic Recovery

The application now includes a **background retry mechanism** that will automatically attempt to connect to the database every 10 seconds for up to 10 minutes after startup. If the database becomes available, the application will automatically recover.

## Check Application Logs

First, check what the actual error is:

```bash
# View recent logs
fly logs --app colabora-app

# View logs with database-related messages
fly logs --app colabora-app | grep -i database

# View last 100 lines
fly logs --app colabora-app -n 100
```

## Common Causes

### 1. Database Not Ready Yet

**PostgreSQL on Fly.io** may take a few seconds to become available after deployment.

**Solution:** Wait 30-60 seconds and try again. The background retry mechanism will automatically connect once the database is ready.

### 2. DATABASE_URL Not Set

Check if the `DATABASE_URL` secret is configured:

```bash
fly secrets list --app colabora-app
```

**Solution:** If missing, attach your PostgreSQL database:

```bash
fly postgres attach --app colabora-app <your-db-name>
```

### 3. Database Connection String Issues

Verify the connection string format:

```bash
# Check DATABASE_URL format (don't print the actual value)
fly secrets list --app colabora-app | grep DATABASE_URL
```

**PostgreSQL format should be:**
```
postgres://user:password@host:port/database
```

### 4. Network/Connection Issues

If using PostgreSQL, check if the database is accessible:

```bash
# SSH into the app
fly ssh console --app colabora-app

# Test database connection (if psql is available)
psql $DATABASE_URL -c "SELECT 1"
```

## Manual Recovery

If automatic recovery doesn't work, you can manually trigger a recovery:

### Option 1: Restart the Application

```bash
fly apps restart colabora-app
```

### Option 2: Check Database Status

```bash
# Check PostgreSQL status
fly postgres status <your-db-name>

# Check app status
fly status --app colabora-app
```

### Option 3: Verify Database is Running

```bash
# List all PostgreSQL instances
fly postgres list

# Check if database is attached to your app
fly postgres list --app colabora-app
```

## Health Check Endpoint

Check the application health status:

```bash
curl https://colabora-app.fly.dev/api/health/ready
```

This will show:
- Database connection status
- Application status
- Timestamp

## Background Retry Details

The background retry mechanism:
- **Retry Interval:** 10 seconds
- **Maximum Retries:** 60 attempts (10 minutes total)
- **Automatic Recovery:** Once connected, the app automatically updates and becomes fully functional
- **Logging:** All retry attempts are logged for debugging

## Still Having Issues?

1. **Check logs** for specific error messages
2. **Verify DATABASE_URL** is set correctly
3. **Check PostgreSQL status** if using PostgreSQL
4. **Restart the application** to trigger fresh initialization
5. **Check Fly.io status** for any service outages

## Prevention

To prevent this issue:
- Ensure PostgreSQL is attached before deployment
- Wait for database to be fully ready before deploying
- Use health checks to verify database availability
- Monitor logs during deployment
