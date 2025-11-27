# Implementation Plan - Updated with Clarifications

**Date:** 2025-01-27  
**Status:** Ready to Start Implementation

---

## ✅ Clarifications Received

### 1. **Email Notifications**
- **Decision:** Low priority, don't implement yet
- **Action:** Remove TODOs from codebase
- **Files:** `server/modules/scheduler.js`, `server/modules/document-status.js`

### 2. **JWT Security**
- **Decision:** Security not critical in development, but fix for consistency
- **Action:** Standardize JWT verification across all middleware
- **Note:** Can make breaking changes (demo data/users)

### 3. **Deployment**
- **Decision:** Remove AWS references, use Fly.io only
- **Action:** 
  - Remove AWS/ECR steps from GitHub Actions workflows
  - Update to EU region (changed `fly.toml` from `iad` to `fra`)
  - Manual/CLI deployment via `fly deploy`

### 4. **Breaking Changes**
- **Decision:** Allowed - demo data/users, no migration concerns
- **Action:** Can create new data, make schema changes freely
- **Note:** Focus on finishing features instead of deleting

### 5. **Environment Variables**
- **Decision:** Current secrets may be broken, create new ones
- **Action:** Generate new `SESSION_SECRET` and `JWT_SECRET` for Fly.io
- **Script:** Create `scripts/setup-fly-secrets.js`

### 6. **TODOs**
- **Decision:** Delete TODOs and clean up codebase
- **Action:** 
  - Remove email notification TODOs
  - Complete incomplete features (admin checks, decision time, API endpoints)
  - Clean up codebase

### 7. **Database**
- **Decision:** Can create new data, no migration needed
- **Action:** Delete test database files, clean up repository

### 8. **Organizational Document Workflow** ⚠️ **MAJOR FIX NEEDED**
- **Current State:** Doesn't work in practice
- **Required Workflow:**
  1. Document creation in organization → vote deadline triggered → document created and can be changed
  2. Inside document, people vote on paragraphs (proposals) - normal proposal/voting system
  3. **Some time before deadline**, paragraph suggestions switch off, people vote on whole document
  4. After deadline, if enough votes, document is adopted by organization

**This is a significant workflow change that needs to be implemented in Phase 2.**

---

## 🎯 Updated Implementation Plan

### **Phase 1: Critical Security & Stability (Week 1)**

#### 1.1 Fix JWT Security Configuration
- Standardize JWT verification (not critical in dev, but good practice)
- Re-enable issuer/audience checking consistently

#### 1.2 Improve Database Error Handling
- Implement proper graceful degradation
- Add database health checks

#### 1.3 Environment Variable Validation & Fly.io Secrets Setup
- **Create new Fly.io secrets** (current ones may be broken)
- Update `fly.toml` to EU region (`fra` instead of `iad`)
- Add validation script

#### 1.4 Replace Console Logging with Structured Logging
- Replace all console.log with Winston logger
- Configure for dev/prod

#### 1.5 Clean Up Untracked Files & Remove AWS References
- Delete test/debug files
- Remove test database files
- **Remove AWS/ECR references from GitHub Actions workflows**

---

### **Phase 2: High Priority Fixes (Week 2)**

#### 2.1 Clean Up TODOs and Complete Features
- Remove email notification TODOs
- Complete admin role checks
- Complete average decision time calculation
- Complete missing API endpoints (policy votes, election creation)

#### 2.2 Consolidate Database Files
- Delete test database files
- Update `.gitignore`
- No migration needed (can create new data)

#### 2.3 Standardize Error Handling
- Create error handling middleware
- Standardize error response format

#### 2.4 Enhance Input Validation
- Add validation to all endpoints
- Create reusable validation schemas

#### 2.5 Refactor Activity Feed Code Duplication
- Refactor to use shared components

#### 2.6 **Fix Organizational Document Voting Workflow** ⚠️ **MAJOR TASK**
**This is the biggest change needed:**

**Required Implementation:**
1. **Document Creation:** Set deadline on creation, allow editing
2. **Paragraph Voting Phase:** Normal proposal/voting works
3. **Paragraph Cutoff:** Disable new proposals X days before deadline
4. **Document Voting Phase:** Add whole-document voting interface
5. **Adoption Logic:** After deadline, check votes and adopt if threshold met

**Database Changes:**
- Add `paragraph_proposals_cutoff_date` to documents table
- Add `document_voting_started_at` to documents table
- Add `adopted_at` to documents table
- Update status enum: `editing`, `voting`, `adopted`, `rejected`

**Files to Modify:**
- `server/routes/documents.js` - Document creation with deadline
- `server/modules/scheduler.js` - Handle paragraph cutoff and document voting
- `server/modules/document-status.js` - New status transitions
- `server/routes/votes.js` - Add whole-document voting
- `server/routes/organizations.js` - Document adoption logic
- `client/src/components/OrganizationalDocumentVoting.jsx` - Whole document voting UI
- `client/src/components/DocumentEditor.tsx` - Disable proposals when in document voting phase

**Estimated Effort:** 12-16 hours

---

## 📋 Quick Reference Checklist

### Before Starting Phase 1:
- [x] Clarifications received
- [x] Strategy document updated
- [x] `fly.toml` updated to EU region
- [ ] Review implementation plan

### Phase 1 Tasks:
- [ ] Fix JWT security configuration
- [ ] Improve database error handling
- [ ] Create new Fly.io secrets
- [ ] Replace console logging
- [ ] Clean up files and remove AWS references

### Phase 2 Tasks:
- [ ] Clean up TODOs
- [ ] Consolidate database files
- [ ] Standardize error handling
- [ ] Enhance input validation
- [ ] Refactor activity feed
- [ ] **Fix organizational document workflow** (MAJOR)

---

## 🚀 Next Steps

1. **Start Phase 1** - Begin with critical fixes
2. **Test after each task** - Ensure nothing breaks
3. **Deploy to Fly.io** - Test in production after Phase 1
4. **Begin Phase 2** - Focus on organizational workflow fix

---

## 📝 Notes

- All data is demo - can make breaking changes freely
- Focus on finishing features, not deleting them
- EU region preferred for Fly.io deployment
- Manual/CLI deployment via `fly deploy`
- No migration concerns - can create new data

---

**Ready to begin implementation!** 🎉

