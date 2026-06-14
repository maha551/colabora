# Redis & Rate Limiting Optimization for 300 Users

**Date:** 2025-01-27  
**Status:** ✅ Implemented

## Summary

Optimized the application for 300 simultaneous users by:
1. ✅ **Redis-based rate limiting** - Shared across multiple instances
2. ✅ **Redis adapter for Socket.IO** - Multi-instance WebSocket support
3. ✅ **Optimized rate limiting settings** - Increased limits and better skip logic

---

## Changes Made

### 1. Redis Dependencies Added

**File:** `package.json`
- Added `@socket.io/redis-adapter@^4.2.0` - For multi-instance WebSocket support
- Added `ioredis@^5.4.2` - Redis client for Node.js

### 2. Redis Store Utility

**File:** `server/utils/redisStore.js` (NEW)
- Custom Redis store for `express-rate-limit`
- Graceful fallback to in-memory store if Redis unavailable
- Handles connection errors gracefully
- Supports shared rate limiting across multiple server instances

### 3. Rate Limiting Optimization

**File:** `server/modules/server.js`

**Changes:**
- ✅ Integrated Redis store for shared rate limiting
- ✅ Increased API rate limit: **1000 requests per 15 minutes** (was 500)
  - Allows ~1.1 requests/second per user
  - Reasonable for active discussion with 300 users
- ✅ Enhanced skip logic:
  - Skip read-only GET requests for documents (frequently accessed, low abuse risk)
  - Skip health check endpoints
  - Already skipping: votes, document creation, paragraph creation, batch endpoints

**Benefits:**
- Rate limiting now works correctly across multiple instances
- Higher limits accommodate 300 active users
- Better user experience (fewer false rate limit hits)

### 4. Socket.IO Redis Adapter

**File:** `server/modules/websocket.js`

**Changes:**
- ✅ Added Redis adapter support for multi-instance WebSocket
- ✅ Optimized Socket.IO configuration:
  - `pingTimeout: 60000` (60 seconds)
  - `pingInterval: 25000` (25 seconds)
  - `maxHttpBufferSize: 1e6` (1MB)
- ✅ Graceful fallback if Redis unavailable (single instance mode)

**Benefits:**
- Real-time updates work across multiple server instances
- Users on different instances see each other's updates
- Enables horizontal scaling

### 5. Server Initialization Updates

**Files:** `server/modules/server.js`, `server/bootstrap.js`

**Changes:**
- ✅ Initialize Redis client on server startup
- ✅ Pass Redis client to WebSocket manager
- ✅ Make server initialization async to support Redis connection

### 6. Environment Configuration

**File:** `env.example`

**Added:**
```env
# Redis Configuration (Optional but recommended for multi-instance deployments)
REDIS_URL=redis://localhost:6379
```

**Updated:**
```env
# Rate Limiting - Optimized for 300 concurrent users
RATE_LIMIT_MAX_REQUESTS=1000  # Increased from 100
```

**File:** `fly.toml`
- Updated `RATE_LIMIT_MAX_REQUESTS = '50' (was 500)

---

## Configuration

### Required: Redis Setup

For **multi-instance deployments** (recommended for 300 users):

1. **Fly.io with Upstash Redis:**
   ```bash
   # Create Upstash Redis instance
   fly redis create
   
   # Set REDIS_URL secret
   fly secrets set REDIS_URL="redis://default:password@your-redis.upstash.io:6379"
   ```

2. **Local Development:**
   ```bash
   # Install Redis locally or use Docker
   docker run -d -p 6379:6379 redis:alpine
   
   # Set in .env
   REDIS_URL=redis://localhost:6379
   ```

3. **Without Redis (Single Instance):**
   - Application works fine without Redis
   - Rate limiting uses in-memory store (per instance)
   - WebSocket works in single instance mode
   - **Not recommended for 300 users** (won't scale horizontally)

### Rate Limiting Settings

**Current Configuration:**
- **API Rate Limit:** 1000 requests per 15 minutes per IP
- **Auth Rate Limit:** 10 requests per 15 minutes per IP (unchanged)
- **Window:** 15 minutes (900000ms)

**Calculation for 300 Users:**
- 1000 requests / 15 minutes = ~66.7 requests/minute
- 66.7 requests/minute / 300 users = ~0.22 requests/minute per user
- This is conservative and allows for bursts

**Skipped Endpoints (Not Rate Limited):**
- ✅ OPTIONS requests (CORS preflight)
- ✅ Health check endpoints
- ✅ Vote endpoints (POST)
- ✅ Document creation (POST)
- ✅ Paragraph creation (POST)
- ✅ Batch document endpoint (POST)
- ✅ Read-only GET requests for documents

---

## Performance Impact

### Before Optimization

| Metric | Value | Issue |
|--------|-------|-------|
| Rate Limit | 500/15min | Too restrictive for 300 users |
| Rate Limit Store | In-memory | Doesn't work across instances |
| WebSocket Adapter | Default | Single instance only |
| GET Requests | Rate Limited | Unnecessary for read-only operations |

### After Optimization

| Metric | Value | Benefit |
|--------|-------|---------|
| Rate Limit | 1000/15min | ✅ Accommodates 300 users |
| Rate Limit Store | Redis (shared) | ✅ Works across instances |
| WebSocket Adapter | Redis | ✅ Multi-instance support |
| GET Requests | Skipped | ✅ Better UX, fewer false hits |

---

## Testing

### Verify Redis Connection

```bash
# Check server logs for:
"Rate limiting using Redis store (shared across instances)"
"WebSocket using Redis adapter (multi-instance support enabled)"
```

### Verify Rate Limiting

1. **Single Instance (No Redis):**
   - Should see: "Rate limiting using in-memory store"
   - Rate limiting works per instance

2. **Multi-Instance (With Redis):**
   - Should see: "Rate limiting using Redis store"
   - Rate limiting shared across all instances
   - Test: Hit rate limit on instance 1, verify instance 2 also blocks

### Verify WebSocket

1. **Single Instance:**
   - Real-time updates work within instance
   - Should see: "WebSocket using default adapter"

2. **Multi-Instance:**
   - Real-time updates work across instances
   - Should see: "WebSocket using Redis adapter"
   - Test: User on instance 1 votes, user on instance 2 sees update

---

## Deployment Checklist

- [ ] Install Redis dependencies: `npm install`
- [ ] Set `REDIS_URL` environment variable (for multi-instance)
- [ ] Update `RATE_LIMIT_MAX_REQUESTS=1000` in production
- [ ] Scale to 2-3 instances: `fly scale count 3`
- [ ] Verify Redis connection in logs
- [ ] Test rate limiting across instances
- [ ] Test WebSocket updates across instances

---

## Rollback Plan

If issues occur:

1. **Remove Redis (fallback to single instance):**
   ```bash
   # Remove REDIS_URL secret
   fly secrets unset REDIS_URL
   ```

2. **Reduce rate limits:**
   ```bash
   # Set lower limit
   fly secrets set RATE_LIMIT_MAX_REQUESTS=500
   ```

3. **Scale down:**
   ```bash
   fly scale count 1
   ```

The application gracefully falls back to in-memory rate limiting and single-instance WebSocket if Redis is unavailable.

---

## Next Steps

1. ✅ **Completed:** Redis integration
2. ✅ **Completed:** Rate limiting optimization
3. ⏭️ **Next:** Load testing with 300 simulated users
4. ⏭️ **Next:** Monitor performance metrics
5. ⏭️ **Next:** Adjust limits based on real-world usage

---

## Related Documentation

- [Scalability Analysis for 300 Users](./SCALABILITY_ANALYSIS_300_USERS.md)
- [WebSocket Events Documentation](./api/WEBSOCKET_EVENTS.md)
- [Architecture Documentation](./ARCHITECTURE.md)

