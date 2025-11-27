# 🎯 Strategy: Getting to a Functional App

**Goal:** Fix critical issues to make the app fully functional  
**Timeline:** Focused, prioritized approach  
**Email Notifications:** ❌ Skipping (as requested)

---

## 📊 Current State Assessment

### 🔑 **Role System Clarification**

**Two Distinct Roles:**

1. **Admins** (`user.role === 'admin'`):
   - System-wide administrators
   - Can **create organizations** (only admins can do this)
   - Can delete organizations
   - Can manage system settings
   - Can manage any document (system-wide)
   - Created via `npm run setup-admin`

2. **Representatives** (`organizations.representatives` JSON array):
   - Organization-specific leaders
   - Can **trigger elections** (representatives only)
   - Can **create policy votes** (representatives only)
   - Can manage governance rules
   - Can invite members
   - Can create/manage documents **in their organization**
   - Assigned per organization (not system-wide)

**Key Distinction:**
- Admins = System-wide power (create orgs)
- Representatives = Organization-specific power (elections, policy votes)

---

### ✅ **What Works (Core Features)**
- User authentication & JWT tokens
- Document creation & editing (personal/shared)
- Paragraph-level proposals & voting
- Activity feed
- User profiles
- Basic organization management
- Health checks

### ❌ **What's Broken (Blocking Functionality)**
1. **Database error handling** - App can start but fail silently
2. **Admin role checks** - Admins can't manage documents
3. **Organizational document workflow** - Major feature doesn't work
4. **Missing API endpoints** - Policy votes & elections non-functional
5. **Average decision time** - Analytics incomplete
6. **Agreed View** - Approved content not showing in document editing tab

---

## 🚀 **PHASE 1: Critical Stability (2-3 hours)**

**Goal:** Ensure app doesn't crash and handles errors gracefully

### 1.1 Fix Database Error Handling ⚠️ **CRITICAL**
**File:** `server/bootstrap.js`

**Problem:** App continues running even if database fails to initialize

**Fix:**
```javascript
// If database fails, don't register routes
if (!db) {
  logger.error('Database initialization failed - shutting down');
  process.exit(1); // Fail fast in production
}
```

**Impact:** App will fail fast instead of appearing to work but being broken

**Time:** 30 minutes

---

### 1.2 Remove Email Notification TODOs
**Files:** 
- `server/modules/scheduler.js:289, 357`
- `server/modules/document-status.js:272`

**Action:** Remove TODO comments, keep console.log for now (we'll replace with proper logging later)

**Time:** 15 minutes

---

## 🚀 **PHASE 2: Complete Missing Features (6-9 hours)**

**Goal:** Make advertised features actually work

### 2.1 Fix Admin/Representative Role Checks ⚠️ **HIGH PRIORITY**
**File:** `server/routes/documents.js:2379, 2424`

**Important Distinction:**
- **Admins** (`user.role === 'admin'`): System-wide admins who can create organizations
- **Representatives** (`organizations.representatives` array): Organization-specific leaders who can trigger elections, policy voting, and manage org documents

**Current Code:**
```javascript
if (document.owner_id !== userId) {
  // TODO: Check for admin role when user roles are implemented
  return res.status(403).json({ error: 'Only document owner can start voting' });
}
```

**Problem:**
- Doesn't check if user is admin OR representative
- For organizational documents, representatives should be able to manage them
- Admins should also be able to manage any document

**Fix:**
```javascript
// Helper function to check if user is representative (add to documents.js)
async function isRepresentative(db, userId, organizationId) {
  if (!organizationId) return false;
  return new Promise((resolve, reject) => {
    db.get('SELECT representatives FROM organizations WHERE id = ?', [organizationId], (err, row) => {
      if (err) reject(err);
      else {
        const representatives = JSON.parse(row?.representatives || '[]');
        resolve(representatives.includes(userId));
      }
    });
  });
}

// In the route handler:
const isAdmin = req.user.role === 'admin';
const isOwner = document.owner_id === userId;
const isRep = document.organization_id 
  ? await isRepresentative(db, userId, document.organization_id)
  : false;

if (!isOwner && !isAdmin && !isRep) {
  return res.status(403).json({ 
    error: 'Only document owner, organization representative, or admin can perform this action' 
  });
}
```

**Impact:** 
- Admins can manage any document
- Representatives can manage documents in their organization
- Document owners can manage their documents

**Time:** 1 hour (need to add helper function and check organization)

---

### 2.2 Implement Policy Votes API ⚠️ **HIGH PRIORITY**
**Files:**
- `client/src/hooks/useOrganizationData.ts:158`
- `server/routes/governance.js` (new endpoint)

**What's Missing:**
- Frontend expects `getPolicyVotes(organizationId)` but backend doesn't exist

**Permission Check:**
- Only **representatives** can create policy votes (see `server/routes/governance.js:186-189`)
- All members can view policy votes

**Implementation:**
1. Add endpoint: `GET /api/governance/:orgId/policy-votes`
2. Check user is member or representative (not just admin)
3. Query `policy_votes` table (exists in schema)
4. Return votes with policy details

**Time:** 1-2 hours

---

### 2.3 Verify/Fix Election Creation API ⚠️ **HIGH PRIORITY**
**Files:**
- `client/src/hooks/useOrganizationData.ts:322`
- `server/routes/governance.js:922-1007` (endpoint exists but may need fixes)

**Status:** Unknown - need to test first

**Permission Check:**
- Only **representatives** can create elections (see `server/routes/governance.js:930-933`)
- Uses `isRepresentative()` helper function

**Implementation Steps:**
1. **Test first:** Check if endpoint `POST /api/governance/:orgId/elections` works
2. **Check frontend:** Verify frontend is calling correct endpoint
3. **Fix if needed:**
   - If endpoint broken: Fix implementation
   - If frontend not connected: Connect frontend to backend
   - If validation missing: Add proper validation
4. Test that only representatives can create elections

**Time:** 1-2 hours (depending on what's broken)

---

### 2.4 Implement Average Decision Time Calculation
**File:** `server/routes/governance.js:2020`

**Current:**
```javascript
averageDecisionTimeHours: 0 // TODO: Calculate from session durations
```

**Fix:**
```javascript
// Calculate from governance_sessions table
const avgTime = await new Promise((resolve, reject) => {
  db.get(`
    SELECT AVG(
      (julianday(ended_at) - julianday(started_at)) * 24
    ) as avg_hours
    FROM governance_sessions
    WHERE organization_id = ? AND ended_at IS NOT NULL
  `, [organizationId], (err, row) => {
    if (err) reject(err);
    else resolve(row?.avg_hours || 0);
  });
});
averageDecisionTimeHours: avgTime
```

**Time:** 30 minutes

---

### 2.5 Fix Agreed View in Document Editing ⚠️ **HIGH PRIORITY**
**Files:**
- `server/routes/votes.js:599-768` - `updateAgreedViewForParagraph` function
- `server/routes/documents.js` - Ensure history is loaded with paragraphs
- `client/src/components/AgreedDocument.tsx` - Display logic

**Problem:**
- Agreed View tab shows "No Approved Content Yet" even when proposals are approved
- History entries may not be created properly when proposals are approved
- Paragraph history may not be loaded when fetching documents

**Expected Behavior (Clarified):**
- Show paragraph with **most votes above threshold**
- If multiple proposals have same vote count, show the **most recent one**
- Only show proposals that meet the acceptance threshold

**Issues to Fix:**
1. **History not created:** The function creates history entries, but they might not have the correct `acceptedAt` timestamp
2. **History not loaded:** Document API might not include paragraph history in the response
3. **Approval logic:** Ensure function selects proposal with most votes above threshold (or most recent if tied)
4. **Frontend expects `acceptedAt`:** The frontend sorts by `acceptedAt` but history entries use `created_at`

**Implementation:**
1. **Fix history creation** - Ensure `acceptedAt` field is set correctly (use `created_at` or add `accepted_at` column)
2. **Fix document API** - Ensure paragraph history is included when loading documents
3. **Fix approval detection** - Update function to:
   - Find all proposals above threshold
   - Select one with most votes
   - If tied, select most recent
4. **Test end-to-end** - Verify approved proposals appear in Agreed View

**Time:** 2-3 hours

---

## 🚀 **PHASE 3: Fix Organizational Document Workflow (8-12 hours)**

**Goal:** Make organizational documents work as designed

### 3.1 Understand Current vs. Intended Workflow

**Intended Workflow:**
1. Document created → `editing` status (people vote on paragraphs)
2. X days before deadline → paragraph proposals disabled
3. Document voting phase → people vote on whole document
4. After deadline → document `adopted`/`rejected` based on votes

**Current Implementation:**
- Documents go: `proposal` → `voting` → `agreed`
- Missing: paragraph cutoff, whole-document voting UI, proper adoption logic

---

### 3.2 Database Schema Updates
**Approach:** Recreate database (demo data, faster)

**Add columns to CREATE TABLE in `DatabaseManager.js`:**
```sql
paragraph_proposals_cutoff_date TEXT,
document_voting_started_at TEXT,
adopted_at TEXT
```

**Update status enum:** `editing`, `voting`, `adopted`, `rejected`

**Note:** Since we're recreating DB, add columns directly to CREATE TABLE statement (not ALTER TABLE)

**Time:** 30 minutes

---

### 3.3 Fix Document Creation
**File:** `server/routes/documents.js`

**Changes:**
- Set initial status to `editing` (not `proposal`)
- Set `paragraph_proposals_cutoff_date` (e.g., 3 days before deadline)
- Allow editing during editing phase

**Time:** 1 hour

---

### 3.4 Implement Paragraph Proposal Cutoff
**File:** `server/modules/scheduler.js`

**Logic:**
- Check if current date >= `paragraph_proposals_cutoff_date`
- If yes, disable new paragraph proposals
- Update document status to `voting` when cutoff reached

**Time:** 1-2 hours

---

### 3.5 Add Whole-Document Voting
**Files:**
- `server/routes/votes.js` - Add endpoint for document-level votes
- `client/src/components/OrganizationalDocumentVoting.tsx` - Create UI component

**Implementation:**
1. Add `POST /api/documents/:id/vote` endpoint (document-level, not paragraph)
2. Store votes in `document_votes` table
3. Create UI component showing document voting interface
4. Show vote counts and progress

**Time:** 3-4 hours

---

### 3.6 Implement Document Adoption Logic
**File:** `server/modules/scheduler.js`

**Logic:**
- After `voting_deadline` passes:
  - Count votes (PRO vs CONTRA)
  - Check if quorum met (`min_voters_required`)
  - Check if approval threshold met
  - Set status to `adopted` or `rejected`
  - Set `adopted_at` timestamp if adopted

**Time:** 1-2 hours

---

### 3.7 Update UI to Disable Proposals During Voting
**File:** `client/src/components/DocumentEditor.tsx`

**Logic:**
- Check document status
- If status is `voting` or past `paragraph_proposals_cutoff_date`:
  - Disable "Add Proposal" button
  - Show message: "Paragraph proposals are closed. Document is in voting phase."

**Time:** 1 hour

---

## 🚀 **PHASE 4: Quick Wins (1-2 hours)**

### 4.1 Replace Critical Console Logs
**Priority:** Only replace logs in critical paths (error handling, auth)

**Files to Update:**
- `server/bootstrap.js` - Use logger
- `server/middleware/auth.js` - Use logger
- `server/routes/documents.js` - Error logging only

**Time:** 1 hour

---

### 4.2 Fix Session Secret Duplication
**File:** `server/config.js`

**Fix:**
```javascript
// Remove duplicate, use single source
const sessionSecret = requireEnvVar('SESSION_SECRET', generateSecureSecret());
SESSION_SECRET: sessionSecret,
SESSION_CONFIG: {
  secret: sessionSecret, // Use same variable
  // ...
}
```

**Time:** 15 minutes

---

## 📋 **IMPLEMENTATION CHECKLIST**

### Phase 1: Stability (2-3 hours)
- [ ] Fix database error handling
- [ ] Remove email notification TODOs

### Phase 2: Missing Features (6-9 hours)
- [ ] Fix admin/representative role checks (distinguish admins vs reps)
- [ ] Implement policy votes API (representatives only)
- [ ] Verify/fix election creation API (representatives only)
- [ ] Calculate average decision time
- [ ] Fix Agreed View in document editing

### Phase 3: Organizational Workflow (8-12 hours)
- [ ] Add database schema columns
- [ ] Fix document creation (editing status)
- [ ] Implement paragraph proposal cutoff
- [ ] Add whole-document voting endpoint
- [ ] Create document voting UI component
- [ ] Implement adoption logic
- [ ] Update UI to disable proposals during voting

### Phase 4: Quick Wins (1-2 hours)
- [ ] Replace critical console logs
- [ ] Fix session secret duplication

---

## ⏱️ **TIME ESTIMATE**

| Phase | Tasks | Time |
|-------|-------|------|
| Phase 1 | Stability fixes | 2-3 hours |
| Phase 2 | Missing features | 6-9 hours |
| Phase 3 | Organizational workflow | 8-12 hours |
| Phase 4 | Quick wins | 1-2 hours |
| **Total** | | **17-25 hours** |

**Realistic Timeline:** 2-3 days of focused work

---

## 🎯 **PRIORITY ORDER (If Limited Time)**

### Must Do (App Won't Work Without):
1. ✅ Database error handling (30 min)
2. ✅ Admin/Representative role checks (1 hour) - **FIXED: Now properly distinguishes admins vs reps**
3. ✅ Organizational document workflow (8-12 hours) - **BIGGEST IMPACT**

### Should Do (Features Broken):
4. ✅ Agreed View fix (2-3 hours) - **HIGH PRIORITY**
5. ✅ Policy votes API (1-2 hours)
6. ✅ Election creation API (1-2 hours)
7. ✅ Average decision time (30 min)

### Nice to Have:
7. Replace console logs (1 hour)
8. Fix session secret duplication (15 min)

---

## 🚫 **SKIPPING (As Requested)**

- ❌ Email notifications (remove TODOs, keep console.log)
- ❌ Code duplication refactoring
- ❌ TypeScript type improvements
- ❌ Comprehensive error handling standardization
- ❌ Input validation enhancements (basic validation exists)

---

## 🧪 **TESTING STRATEGY**

After each phase:
1. **Manual Testing:**
   - Test admin document management
   - Test organizational document creation
   - Test policy voting (after Phase 2)
   - Test election creation (after Phase 2)
   - Test full organizational workflow (after Phase 3)

2. **Quick Smoke Tests:**
   - App starts without errors
   - Health check passes
   - Can create document
   - Can vote on proposal
   - Admin can access admin features

---

## 🚀 **DEPLOYMENT STRATEGY**

**Process:**
1. **Test locally** - Ensure everything works
2. **Push to GitHub** - Commit and push changes
3. **Deploy via CLI** - Run `fly deploy --app colabora-fresh-final`

**Deployment Schedule:**
1. **After Phase 1:** Deploy immediately (stability fix)
2. **After Phase 2:** Deploy (features now work)
3. **After Phase 3:** Deploy (major feature complete)
4. **After Phase 4:** Deploy (polish)

**Deployment Command:**
```bash
git add .
git commit -m "Phase X: Description"
git push origin main
fly deploy --app colabora-fresh-final
```

---

## 📝 **NOTES**

- **Breaking Changes Allowed:** Demo data, can recreate
- **Database Migrations:** Recreate DB (faster, demo data) - use `ALTER TABLE` with error handling for "column exists"
- **No Email Service Needed:** Skipping entirely
- **Focus on Functionality:** Code quality improvements can wait
- **Deployment:** Push to GitHub when working, then `fly deploy` via CLI
- **Production Data:** Demo data (can recreate)
- **Agreed View Logic:** Show paragraph with most votes above threshold (or most recent if tied votes)

---

## ✅ **SUCCESS CRITERIA**

App is "functional" when:
- ✅ App doesn't crash on database errors
- ✅ **Admins can create organizations** (system-wide)
- ✅ **Representatives can trigger elections and policy voting** (org-specific)
- ✅ **Admins AND Representatives can manage organizational documents**
- ✅ **Agreed View shows approved content correctly**
- ✅ Organizational documents work end-to-end:
  - Create → Edit paragraphs → Vote on paragraphs → Vote on document → Adopt/Reject
- ✅ Policy voting works (representatives can create, members can vote)
- ✅ Election creation works (representatives only)
- ✅ Analytics show real data (decision time)

---

**Ready to start? Begin with Phase 1 - it's quick and critical!**

