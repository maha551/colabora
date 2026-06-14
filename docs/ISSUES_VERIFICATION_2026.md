# Issues Verification - January 2026

**Date:** January 30, 2026  
**Purpose:** Verify documented problems and unfinished features

---

## Summary

Verification of issues from `CODEBASE_ISSUES_REPORT.md` (archived 2026-01-30) and codebase TODOs.

---

## ✅ Resolved Issues

### 1. Duplicate Vote Handlers in SuggestionCard
**Status:** FIXED  
**Verification:** SuggestionCard uses `useVoteButtonHandler` hook (line 34, 474). Vote buttons call `handleVoteClick('PRO')`, `handleVoteClick('NEUTRAL')`, `handleVoteClick('CONTRA')`.

### 2. Duplicate Paragraph Finding Logic
**Status:** FIXED  
**Verification:** `findProposalAndParagraph` exists in `client/src/utils/documentHelpers.ts`. useDocumentOperations imports and uses it in handleVote, handleComment, handleDeleteComment, handleEditComment, handleLoadMoreComments.

### 3. allCollaborators in DocumentViewPage
**Status:** FIXED (January 30, 2026)  
**Verification:** DocumentViewPage now computes `allCollaborators` from `document.owner` and `document.collaborators`, matching DocumentEditor pattern. Passed to StructureProposalCardWrapper.

---

## ⚠️ Issues Still Valid

### 1. Duplicate Vote State Management
**Status:** Partially addressed  
**Details:** SuggestionCard uses `useVoteButtonHandler` (local isVoting). useDocumentOperations still uses global `votingState` Set. Potential for inconsistent UI states.

### 2. Duplicate Comment Handling Logic
**Status:** Still valid  
**Details:** useDocumentOperations, ActivityFeedView, DashboardTab have different comment handling implementations.

### 3. Rule Proposal Comments
**Status:** Implemented  
**Location:** `server/routes/rule-proposal-comments.js`, `client/src/utils/ruleProposalAdapter.ts`  
**Details:** Comment create/delete API and client adapter are wired; UI surfaces use the adapter.

### 4. Organizations Route Migration
**Status:** Pending  
**Location:** `server/routes/organizations.js:155`  
**Details:** TODO - "Migrate all tests to use /api/admin/organizations and remove this route."

---

## Code TODOs (Current)

| Location | TODO | Status |
|----------|------|--------|
| DocumentViewPage.tsx | allCollaborators | ✅ Fixed |
| organizations.js | Migrate tests to /api/admin/organizations | Pending |
| ruleProposalAdapter.ts | Rule proposal comments API | ✅ Implemented |

---

## Governance rule proposals (June 2026)

Critical items previously listed in `docs/active/GOVERNANCE_ISSUES_AND_IMPROVEMENTS.md` (#1–#10) are **resolved** in code. See that document for implementation references and integration test coverage (`tests/integration/governance.integration.test.js`).

---

## Verification Tasks (from CRITICAL_ISSUES_TO_ADDRESS.md)

These remain verification tasks (not code errors):

1. **Agreed View Workflow** - End-to-end testing recommended
2. **Organizational Document Workflow** - End-to-end testing recommended  
3. **Database Error Handling** - Failure scenario testing recommended

---

**Last Updated:** June 10, 2026
