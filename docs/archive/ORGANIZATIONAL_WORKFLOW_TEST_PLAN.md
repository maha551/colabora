# 🧪 Organizational Document Workflow Test Plan & Fixes

**Date:** 2025-01-27  
**Status:** Testing & Fixing

---

## 📋 **Workflow Overview**

**Intended Flow:**
1. Document created → `status = 'proposal'` with `proposal_deadline` and `paragraph_proposals_cutoff`
2. Editing phase → Members vote on paragraph proposals
3. Cutoff reached → New paragraph proposals disabled (UI already handles this)
4. Proposal deadline passes → Scheduler transitions to `status = 'voting'`
5. Voting phase → Members vote on whole document via `POST /api/documents/:id/vote`
6. Voting deadline passes → Scheduler finalizes and sets `status = 'agreed'` or `'rejected'`

---

## ✅ **What's Working**

1. ✅ Database schema has all required fields:
   - `paragraph_proposals_cutoff`
   - `voting_started_at`
   - `adopted_at`
   - `min_voters_required`
   - `voting_deadline`

2. ✅ Document creation sets:
   - `paragraph_proposals_cutoff` (7 days before proposal deadline)
   - `proposal_deadline`
   - `min_voters_required` (30% of org members)

3. ✅ Scheduler checks:
   - Proposal cutoff (broadcasts WebSocket update)
   - Proposal deadlines (transitions to voting)
   - Voting deadlines (finalizes voting)

4. ✅ UI components:
   - `DocumentEditor` checks cutoff and disables proposals
   - `ParagraphWithSuggestions` checks cutoff
   - `OrganizationalDocumentVoting` component exists

5. ✅ API endpoints:
   - `POST /api/documents/:id/vote` - Document-level voting
   - `GET /api/documents/:id/voting-status` - Get voting status
   - `POST /api/documents/:id/start-voting` - Manual start (for testing)

---

## 🐛 **Issues Found**

### Issue 1: `adopted_at` Not Set
**Location:** `server/modules/document-status.js:56-84`

**Problem:**
- When document transitions to 'agreed', `adopted_at` field is not set
- The WebSocket broadcast includes `adoptedAt` but database field is not updated

**Fix:** Update `transitionToAgreed` to set `adopted_at = CURRENT_TIMESTAMP`

---

### Issue 2: Missing `min_voters_required` in Voting Deadline Check
**Location:** `server/modules/scheduler.js:143-154`

**Problem:**
- Query doesn't select `min_voters_required` but it's needed for finalization
- Comment says "Note: documents table doesn't have min_voters_required column" but it does exist

**Fix:** Add `min_voters_required` to the SELECT query

---

### Issue 3: Voting Status Check Logic
**Location:** `server/routes/documents.js:2381-2521`

**Problem:**
- `checkDocumentAgreementStatus` is called but may not be triggered at the right times
- Should be called after each vote is cast

**Status:** Actually, it's called after votes are cast (line 2250 in vote endpoint), so this is OK.

---

## 🔧 **Fixes to Apply**

1. **Fix `adopted_at` in `transitionToAgreed`**
2. **Fix `min_voters_required` query in scheduler**
3. **Verify all fields are properly returned in API responses**

---

## ✅ **Testing Checklist**

- [ ] Create organizational document
- [ ] Verify `paragraph_proposals_cutoff` is set correctly
- [ ] Verify `min_voters_required` is calculated correctly
- [ ] Test paragraph proposal cutoff (UI should disable proposals)
- [ ] Test proposal → voting transition (manual or via scheduler)
- [ ] Test document-level voting
- [ ] Test voting deadline finalization
- [ ] Verify `adopted_at` is set when document is agreed
- [ ] Verify all fields are returned in API responses

---

## 📝 **Notes**

- All existing code should remain intact
- Only add missing functionality
- Don't break existing features

