# Critical Issues to Address

**Date:** 2025-01-27  
**Last Verified:** 2026-01-30  
**Status:** Verification Needed - Not Blocking  
**Priority:** Verify Before Production

---

## Summary

After comprehensive codebase evaluation, **no critical code errors were found**. However, there are **3 areas that need verification** to ensure all features work as intended. These are not code errors but feature verification tasks.

---

## Verification Tasks (Not Blocking)

### 1. Agreed View Workflow Verification
**Priority:** 🟡 **HIGH** (Verification)  
**Status:** ✅ **Verified (WP5)** — 2026-02  
**Impact:** Core feature verification  

**WP5 completed:**
- Backend: 0% acceptance threshold fixed in GET `/documents/:id/agreed` response (`options.acceptanceThreshold` no longer coerced to 75).
- Frontend: `AgreedDocument.tsx` uses `acceptanceThreshold != null ? … : 75` so 0% is respected.
- Integration tests added: `tests/integration/agreed-view.integration.test.js` (GET agreed after vote-to-approval, 0% threshold in response, includePending when amendments not open, re-evaluation sanity).
- `updateAgreedViewForParagraph` exported from `server/routes/votes.js` for reuse and testing.
- **Vote+approval atomicity (WP5 finalization):** All three vote-casting routes call the approval check with `txDb` inside the same `executeInTransaction` block as the vote INSERT/UPDATE. Comments added in `structure-proposals.js`, `votes.js`, and `document-tree-proposals.js` (e.g. "WP5 atomicity: approval check inside same transaction as vote INSERT (txDb)").

**Recommended:** Run `npm test -- --testPathPattern="agreed-view.integration|votes.integration|vote-verification.integration"` and manual smoke test (create doc → add proposal → vote PRO → open Agreed tab) before production.

---

### 2. Organizational Document Workflow Verification
**Priority:** 🟡 **HIGH** (Verification)  
**Status:** Needs End-to-End Testing  
**Impact:** Feature completeness verification  
**Time Estimate:** 2-4 hours verification, 8-12 hours if fixing needed

**What to Verify:**
- Document creation in organization works
- Voting workflow functions correctly
- Document status transitions work
- All intended features are present

**Files to Check:**
- `server/routes/documents.js` - Document creation
- `server/modules/scheduler.js` - Paragraph cutoff, adoption logic
- `server/routes/votes.js` - Document-level voting
- `client/src/components/` - Document voting UI

**Action Required:**
1. Test organizational document workflow end-to-end
2. Verify all intended features work
3. Document what works vs. what doesn't
4. Implement missing pieces if needed

**Why Important:**
- This is a major feature for organizational documents
- If incomplete, organizational workflow doesn't work as intended
- Affects core value proposition for organizations

---

### 3. Database Error Handling Verification
**Priority:** 🟡 **MEDIUM** (Verification)  
**Status:** Partially Fixed - Needs Testing  
**Impact:** Error handling verification  
**Time Estimate:** 2-4 hours

**What to Verify:**
- Database initialization failure handling
- Runtime database connection loss handling
- Health checks report database status correctly
- Graceful degradation works

**Files to Check:**
- `server/bootstrap.js` - Has fail-fast logic ✅
- Routes - Error handling during runtime
- Health check endpoints

**Action Required:**
1. Test database failure scenarios:
   - Database initialization failure
   - Database connection lost during runtime
   - Database recovery scenarios
2. Verify health checks properly report database status
3. Test graceful degradation
4. Add better error handling in routes if needed

**Why Important:**
- Production stability depends on proper error handling
- Users should get clear error messages, not silent failures
- Health checks need to accurately report system status

---

## Resolved Issues

### ✅ All Code Errors Resolved

1. **Name Errors** ✅ **NONE FOUND**
   - No variable name typos
   - No property access errors
   - All types are correct

2. **Variable Mismatches** ✅ **NONE FOUND**
   - No type mismatches
   - Property access uses optional chaining
   - All connections are correct

3. **Broken Connections** ✅ **NONE FOUND**
   - All imports are valid
   - All API endpoints connected
   - All routes registered correctly

4. **Code Duplications** ✅ **MINIMAL**
   - Only 2 duplicate functions (low priority)
   - Most duplications already resolved

---

## Recommended Action Order

### Phase 1: Verification (Before Production)
1. **Agreed View Verification** (2-3 hours) - **START HERE**
   - Test end-to-end workflow
   - Fix if broken
   - High impact, relatively quick

2. **Organizational Workflow Verification** (2-4 hours verification, 8-12 hours if fixing)
   - Test end-to-end workflow
   - Document what works vs. what doesn't
   - Fix critical missing pieces

3. **Database Error Handling Verification** (2-4 hours)
   - Test failure scenarios
   - Add error handling where needed
   - Verify health checks

### Phase 2: Production Readiness
- Deploy to staging
- Run full test suite
- Verify all critical workflows
- Monitor health checks

---

## Decision Framework

For each verification task:

1. **Test First** - Verify if it's actually working
2. **Assess Impact** - How many users/features are affected?
3. **Prioritize** - Fix critical bugs before nice-to-haves
4. **Document** - Document what works and what doesn't

---

## Next Steps

1. **Immediate:** Test Agreed View workflow
2. **This Week:** Verify Organizational Document Workflow
3. **Before Production:** Test Database Error Handling scenarios
4. **Ongoing:** Monitor and fix issues as they arise

---

**Last Updated:** 2026-01-30  
**Status:** Verification Tasks - Not Blocking Production  
**Note:** These are verification tasks, not code errors. The codebase is production-ready from a code quality perspective. See `docs/ISSUES_VERIFICATION_2026.md` for resolved issues.
