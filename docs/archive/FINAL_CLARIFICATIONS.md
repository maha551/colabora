# 🔍 Final Clarifications Before Implementation

**Status:** Ready to start, but a few quick clarifications would help

---

## ✅ **Already Clarified**

- ✅ Email notifications: Skipping (remove TODOs)
- ✅ Breaking changes: Allowed (demo data)
- ✅ Database migrations: Can add columns freely
- ✅ Admins vs Representatives: Properly distinguished
- ✅ Focus: Functionality over code quality

---

## ❓ **Quick Clarifications Needed**

### 1. **Database Schema Changes (Phase 3)**
**Question:** For Phase 3 organizational workflow, we need to add columns:
- `paragraph_proposals_cutoff_date`
- `document_voting_started_at` 
- `adopted_at`

**Options:**
- A) Use `ALTER TABLE` statements (safe, preserves data)
- B) Recreate database (faster, loses data - fine if demo data)

**Recommendation:** Use `ALTER TABLE` with error handling for "column already exists"

---

### 2. **Election Creation API Status**
**Question:** The endpoint `POST /api/governance/:orgId/elections` exists in code. Is it:
- A) Not working at all (needs full implementation)
- B) Working but frontend not calling it correctly
- C) Working but needs fixes/validation

**Action Needed:** Quick test to see what's actually broken

---

### 3. **Agreed View Expected Behavior**
**Question:** When should content appear in Agreed View?
- A) Only when a proposal reaches approval threshold (e.g., 75%)
- B) When proposal is approved AND applied to paragraph
- C) Show all approved proposals, not just the winning one

**Current Issue:** History entries may not have `acceptedAt` field - should we use `created_at` or add new field?

---

### 4. **Deployment Process**
**Question:** What's the exact deployment workflow?
- A) Manual: `fly deploy` after each phase
- B) Automatic: Push to GitHub → auto-deploy
- C) Staged: Test locally first, then deploy

**Current:** Strategy says deploy after each phase - is this manual or automatic?

---

### 5. **Production Data**
**Question:** Is the Fly.io production database:
- A) Demo/test data (can be reset)
- B) Real user data (must preserve)
- C) Mix (some real, some demo)

**Impact:** Affects how we handle database migrations and breaking changes

---

## 🎯 **Recommendations (If No Response)**

If you want to start immediately, I'll assume:

1. **Database:** Use `ALTER TABLE` with "column exists" error handling (safest)
2. **Election API:** Test first, then fix what's broken
3. **Agreed View:** Show content when proposal reaches threshold AND is applied
4. **Deployment:** Manual `fly deploy` after each phase
5. **Production Data:** Treat as demo data (can recreate)

---

## ✅ **Ready to Start?**

If these assumptions work, we can begin with **Phase 1** immediately:
- Database error handling (30 min)
- Remove email TODOs (15 min)

**Total Phase 1:** ~45 minutes, then we can test and move to Phase 2.

---

**Should I proceed with these assumptions, or do you want to clarify any of these first?**

