# Scalability Analysis: 300 Simultaneous Users

**Date:** 2025-01-27  
**Question:** Is the app fit for real-time discussion and voting with 300 simultaneous users?

## Executive Summary

⚠️ **Current Status: NOT READY for 300 concurrent users without modifications**

The application has a solid foundation with WebSocket support, but several critical bottlenecks need to be addressed for 300 simultaneous users.

---

## Current Architecture Assessment

### ✅ What's Working Well

1. **WebSocket Implementation**
   - Socket.IO properly configured for real-time updates
   - Room-based broadcasting (document rooms, organization rooms)
   - JWT authentication on WebSocket connections
   - Automatic reconnection with exponential backoff

2. **Database Connection Pooling**
   - PostgreSQL connection pool configured (min: 3-5, max: 25-30)
   - Connection retry logic with exponential backoff
   - Health checks and recovery mechanisms

3. **Rate Limiting**
   - Configured: 500 requests per 15 minutes in production
   - Vote endpoints excluded from rate limiting (appropriate for voting)

4. **Real-time Features**
   - Document updates broadcast instantly
   - Vote updates propagate in real-time
   - Comment updates broadcast to all viewers

### ❌ Critical Bottlenecks for 300 Users

#### 1. **Database Connection Pool Exhaustion** 🔴 CRITICAL

**Current Configuration:**
- `PG_POOL_MAX=30` (default from env.example)
- `PG_POOL_MIN=5` (default)

**Problem:**
- 300 concurrent users will easily exhaust 30 database connections
- Each HTTP request + WebSocket subscription check needs a connection
- Connection pool exhaustion will cause:
  - Slow response times
  - Failed requests
  - Poor user experience

**Impact:** 🔴 **HIGH** - Will cause failures under load

**Solution Required:**
```env
PG_POOL_MIN=10
PG_POOL_MAX=100  # Minimum for 300 users
PG_POOL_ACQUIRE_TIMEOUT=30000
```

#### 2. **Single Server Instance** 🔴 CRITICAL

**Current Configuration:**
- Single Fly.io instance (2GB RAM, 1 CPU)
- No horizontal scaling configured
- No load balancing for WebSocket connections

**Problem:**
- All 300 users connect to one server instance
- Memory pressure: ~300 WebSocket connections × ~2-5MB each = 600MB-1.5GB just for connections
- CPU bottleneck: Single CPU handling all real-time updates
- No redundancy: Single point of failure

**Impact:** 🔴 **HIGH** - Performance degradation and reliability issues

**Solution Required:**
- Scale to 2-3 instances minimum
- Implement Redis adapter for Socket.IO (for multi-instance support)
- Configure sticky sessions or Redis pub/sub

#### 3. **Socket.IO Multi-Instance Support Missing** 🟡 MEDIUM

**Current State:**
- Socket.IO configured without Redis adapter
- No cross-instance message broadcasting

**Problem:**
- If you scale to multiple instances, users on different instances won't see each other's updates
- Each instance maintains its own room state
- Real-time updates only work within the same instance

**Impact:** 🟡 **MEDIUM** - Prevents horizontal scaling

**Solution Required:**
- Install `@socket.io/redis-adapter`
- Configure Redis for Socket.IO pub/sub
- Update WebSocket initialization

#### 4. **Memory Constraints** 🟡 MEDIUM

**Current Configuration:**
- 2GB RAM per instance
- 1 CPU (shared)

**Problem:**
- 300 WebSocket connections: ~600MB-1.5GB
- Node.js runtime: ~200-300MB
- Application code: ~100-200MB
- Database connection pool: ~50-100MB
- **Total: ~1GB-2.1GB** (at capacity or over)

**Impact:** 🟡 **MEDIUM** - Risk of OOM (Out of Memory) errors

**Solution Required:**
- Increase to 4GB RAM per instance, OR
- Scale to 3 instances with 2GB each (distribute load)

#### 5. **Rate Limiting Too Restrictive** 🟢 LOW

**Current Configuration:**
- 500 requests per 15 minutes per IP
- Vote endpoints excluded (good)

**Problem:**
- 300 users × multiple requests = potential rate limit hits
- However, vote endpoints are excluded, which is correct

**Impact:** 🟢 **LOW** - May need adjustment but not critical

**Solution (if needed):**
```env
RATE_LIMIT_MAX_REQUESTS=1000  # Increase for 300 users
```

---

## Performance Estimates

### Current Capacity (Single Instance)

| Metric | Current | Required for 300 Users | Gap |
|--------|---------|------------------------|-----|
| Database Connections | 30 max | 100+ | ❌ 70+ short |
| Server Instances | 1 | 2-3 | ❌ Need 2-3x |
| RAM per Instance | 2GB | 4GB (or 2GB × 3) | ⚠️ Tight |
| WebSocket Connections | ~100-200 | 300+ | ⚠️ May work |
| Socket.IO Adapter | None | Redis | ❌ Missing |

### Expected Performance with 300 Users (Current Setup)

**Scenario: 300 users viewing same document, 50 vote simultaneously**

1. **Database Pool Exhaustion** (30 connections)
   - First 30 requests succeed
   - Remaining requests wait or timeout
   - **Result:** Slow responses, some failures

2. **Memory Pressure** (2GB RAM)
   - 300 WebSocket connections: ~900MB-1.5GB
   - Application overhead: ~500MB
   - **Result:** Risk of OOM, slow performance

3. **CPU Bottleneck** (1 CPU)
   - Broadcasting to 300 clients per update
   - Database queries for 300 users
   - **Result:** High CPU usage, latency spikes

**Estimated Response Times:**
- Normal load (10-50 users): < 500ms
- High load (300 users, current setup): 2-5 seconds (or timeouts)

---

## Required Changes for 300 Users

### Priority 1: Critical (Must Have)

#### 1. Increase Database Connection Pool
```env
# .env or Fly.io secrets
PG_POOL_MIN=10
PG_POOL_MAX=100
PG_POOL_ACQUIRE_TIMEOUT=30000
```

**File:** `env.example`, `server/database/knexConnection.js` (already supports this)

#### 2. Scale to Multiple Instances
```toml
# fly.toml
[[vm]]
  memory = '2gb'
  cpu_kind = 'shared'
  cpus = 1

# Scale to 2-3 instances
# fly scale count 3
```

**Command:**
```bash
fly scale count 3
```

#### 3. Add Redis Adapter for Socket.IO
```bash
npm install @socket.io/redis-adapter ioredis
```

**File:** `server/modules/websocket.js`
```javascript
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

// In initialize() method:
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

this.io = new Server(server, {
  // ... existing config
  adapter: createAdapter(pubClient, subClient)
});
```

**Environment:**
```env
REDIS_URL=redis://your-redis-instance:6379
```

### Priority 2: Recommended (Should Have)

#### 4. Increase Memory per Instance
```toml
# fly.toml
[[vm]]
  memory = '4gb'  # Increase from 2gb
  cpu_kind = 'shared'
  cpus = 2  # Increase from 1
```

#### 5. Optimize Socket.IO Configuration
```javascript
// server/modules/websocket.js
this.io = new Server(server, {
  cors: { /* ... */ },
  transports: ['websocket'], // Force WebSocket (more efficient than polling)
  pingTimeout: 60000,        // 60 seconds
  pingInterval: 25000,       // 25 seconds
  maxHttpBufferSize: 1e6,   // 1MB max message size
  allowEIO3: true
});
```

#### 6. Database Query Optimization
- Add indexes on frequently queried columns
- Review and optimize document access checks
- Consider caching for read-heavy operations

### Priority 3: Nice to Have

#### 7. Monitoring and Alerting
- Set up metrics for connection counts
- Monitor database pool utilization
- Alert on high memory/CPU usage

#### 8. Load Testing
- Use tools like `k6` or `artillery` to test with 300 simulated users
- Verify all changes work under load

---

## Implementation Plan

### Phase 1: Quick Wins (1-2 hours)
1. ✅ Increase `PG_POOL_MAX` to 100
2. ✅ Scale to 2-3 instances on Fly.io
3. ✅ Add Redis adapter for Socket.IO

### Phase 2: Optimization (2-4 hours)
4. ✅ Increase memory to 4GB per instance
5. ✅ Optimize Socket.IO configuration
6. ✅ Add monitoring

### Phase 3: Testing (2-4 hours)
7. ✅ Load test with 300 simulated users
8. ✅ Verify real-time updates work across instances
9. ✅ Monitor performance metrics

**Total Estimated Time:** 5-10 hours

---

## Cost Estimate (Fly.io)

### Current Setup
- 1 instance × 2GB RAM × 1 CPU = ~$15-20/month

### Recommended Setup for 300 Users
- 3 instances × 2GB RAM × 1 CPU = ~$45-60/month
- OR 2 instances × 4GB RAM × 2 CPU = ~$60-80/month
- Redis instance (optional, for Socket.IO): ~$5-10/month

**Total:** ~$50-90/month

---

## Conclusion

### Can it handle 300 users NOW?
❌ **No** - Current setup will experience:
- Database connection pool exhaustion
- Memory pressure
- Performance degradation
- Potential failures under load

### Can it handle 300 users AFTER changes?
✅ **Yes** - With the recommended changes:
- ✅ Increased connection pool (100 connections)
- ✅ Multiple instances (2-3 instances)
- ✅ Redis adapter for Socket.IO
- ✅ Increased memory (4GB per instance or 2GB × 3)

### Real-time Experience Quality

**Current (300 users):**
- ⚠️ Delayed updates (2-5 seconds)
- ⚠️ Some failed connections
- ⚠️ Inconsistent experience

**After Changes (300 users):**
- ✅ Sub-second updates (< 500ms)
- ✅ Reliable connections
- ✅ Consistent real-time experience

---

## Next Steps

1. **Immediate:** Increase database pool and scale instances
2. **Short-term:** Add Redis adapter for Socket.IO
3. **Testing:** Load test with 300 users before production
4. **Monitoring:** Set up metrics to track performance

---

## References

- [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/)
- [PostgreSQL Connection Pooling Best Practices](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [Fly.io Scaling Guide](https://fly.io/docs/app-guides/scale-count/)

