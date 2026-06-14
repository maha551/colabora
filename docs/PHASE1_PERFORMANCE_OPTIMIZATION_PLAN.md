# Phase 1 Performance Optimization - Implementation Plan

**Date:** 2026-01-18  
**Status:** In Progress  
**Goal:** Implement critical performance optimizations for 300 concurrent users

---

## Current Deployment Status

### Fly.io Configuration
- **App Name:** colabora-app
- **Region:** fra (Frankfurt)
- **Machines Running:** 2 (already scaled! ✅)
- **Memory per Machine:** 2GB
- **CPU:** 1 shared CPU per machine
- **Min Machines Running:** 2 (configured in fly.toml ✅)

### Current Secrets/Environment Variables
- ✅ `PG_POOL_MIN` - Set (value unknown, need to verify)
- ✅ `PG_POOL_MAX` - Set (value unknown, need to verify)
- ✅ `PG_POOL_ACQUIRE_TIMEOUT` - Set
- ✅ `REDIS_URL` - Set (for multi-instance support)
- ✅ `RATE_LIMIT_MAX_REQUESTS` - Set

---

## Phase 1 Tasks - Implementation Status

### ✅ Task 1: Horizontal Scaling
**Status:** ✅ COMPLETE
- **Current:** 2 machines running
- **Configuration:** `min_machines_running = 2` in fly.toml
- **Action Required:** None - already configured

### ⚠️ Task 2: Database Connection Pool Optimization
**Status:** ⚠️ NEEDS VERIFICATION & UPDATE
- **Current:** Secrets are set but values unknown
- **Default Values (if not set):**
  - `PG_POOL_MIN=5` (from knexConnection.js line 124)
  - `PG_POOL_MAX=20` (from knexConnection.js line 125)
- **Recommended for 300 users:**
  - `PG_POOL_MIN=10` (warm up pool faster)
  - `PG_POOL_MAX=100` (or 80% of database max_connections)
  - `PG_POOL_ACQUIRE_TIMEOUT=30000` (already set ✅)
- **Action Required:** 
  1. Update secrets to recommended values
  2. Verify database server max_connections limit (should be ≥ 125 for PG_POOL_MAX=100)
  3. Monitor pool usage after deployment

### ⚠️ Task 3: Response Compression
**Status:** ⚠️ DEFERRED (User Concern: Risk Assessment)
- **Current:** No compression middleware found
- **Package:** `compression` not in dependencies
- **Risk Assessment:**
  - **Low Risk:** Standard Express middleware, widely used
  - **Potential Concerns:** CPU overhead, compatibility issues (rare)
  - **Recommendation:** Defer to Phase 2, focus on safer optimizations first
- **Action Required:** 
  - **Option A:** Skip for now, focus on connection pool + indexes
  - **Option B:** Make it optional/configurable (safer approach)
  - **Option C:** Test in staging first before production

### ✅ Task 4: Database Indexes
**Status:** ✅ IMPLEMENTED (migration exists; verify after deploy)

The Phase 1 index migration is **server/migrations/add-phase1-performance-indexes.js**. It runs automatically as part of database initialization (MigrationRunner). It adds these 6 indexes:

| Index name | Table | Columns |
|------------|--------|---------|
| `idx_documents_organization_id` | documents | (organization_id) |
| `idx_document_collaborators_document_user` | document_collaborators | (document_id, user_id) |
| `idx_documents_status_organization` | documents | (status, organization_id) |
| `idx_documents_parent_sort_order` | documents | (parent_id, sort_order) |
| `idx_organization_members_org_user_status` | organization_members | (organization_id, user_id, status) |
| `idx_organization_representatives_org_user_status` | organization_representatives | (organization_id, user_id, status) |

#### Verify indexes after deploy

**Option A – Script (recommended):**
```bash
node scripts/verify-phase1-indexes.js
# Or on Fly: fly ssh console --app colabora-app -C "node scripts/verify-phase1-indexes.js"
```
Exit code 0 = all present; 1 = some missing or DB error.

**Option B – Manual queries**

PostgreSQL:
```sql
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_documents_%' OR indexname LIKE 'idx_document_collaborators_%' OR indexname LIKE 'idx_organization_%';
```

SQLite:
```sql
SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%';
```

#### Other existing indexes (from DatabaseManager / migrations)
- `idx_document_collaborators_user`, `idx_documents_owner`, `idx_documents_org_ownership`, `idx_paragraphs_document_id`, `idx_proposals_paragraph_created`, `idx_votes_proposal_vote`, `idx_comments_commentable`, plus others created in `ensurePerformanceIndexes()` and `ensureOrganizationIndexes()` at startup.

---

## Implementation Steps

### Step 1: Verify Current Connection Pool Settings

```bash
# Check current pool settings (need to query database or check logs)
# Or update directly if we know they're too low
fly secrets set PG_POOL_MIN=10 PG_POOL_MAX=100 --app colabora-app
```

### Step 2: Add Response Compression

**File:** `package.json`
- Add `"compression": "^1.7.4"` to dependencies

**File:** `server/modules/server.js`
- Add compression middleware after CORS setup
- Configure compression options

### Step 3: Phase 1 Index Migration (done)

**File:** `server/migrations/add-phase1-performance-indexes.js` – already exists and runs as part of init. No new migration needed.

### Step 4: Run after deploy

1. Migrations run automatically on app startup (part of database initialization).
2. Optionally verify indexes: `node scripts/verify-phase1-indexes.js` (or via Fly SSH as above).

### Step 5: Deploy Changes

1. Update secrets (if needed)
2. Deploy code changes (migrations run on startup)
3. Run `node scripts/verify-phase1-indexes.js` or Fly equivalent to confirm indexes
4. Monitor performance

---

## Expected Performance Improvements

| Optimization | Expected Impact | Priority |
|-------------|----------------|----------|
| Connection Pool Increase | 50-70% reduction in connection wait times | 🔴 HIGH |
| Response Compression | 40-60% smaller payloads, faster transfers | 🟡 MEDIUM |
| Missing Indexes | 30-50% faster queries on affected routes | 🔴 HIGH |
| Horizontal Scaling | Already done ✅ | - |

---

## Verification Checklist

- [ ] Verify current `PG_POOL_MAX` value
- [ ] Update connection pool settings if needed
- [ ] Install compression package (optional; deferred)
- [ ] Add compression middleware (optional; deferred)
- [ ] Phase 1 indexes: migration runs on init; run `node scripts/verify-phase1-indexes.js` after deploy
- [ ] Deploy to Fly.io
- [ ] Monitor performance metrics
- [ ] Verify improvements in production

---

## Next Steps After Phase 1

1. **Phase 2:** Redis response caching — implemented for org list and governance rules (see [docs/CACHING.md](CACHING.md)).
2. **Phase 2:** N+1 optimizations — implemented (GovernanceService bootstrap, document-collaborator-sync, SchedulingService).
3. **Phase 2:** Enable code splitting
4. **Phase 3:** Add performance monitoring
5. **Phase 3:** Additional query result caching as needed

---

## Notes

- Current deployment has 2 machines running (good for horizontal scaling)
- Redis is configured (good for multi-instance support)
- Some indexes exist but critical ones are missing
- Compression is completely missing
- Connection pool settings need verification
