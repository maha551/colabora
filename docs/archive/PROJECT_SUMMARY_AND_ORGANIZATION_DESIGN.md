# 📋 Colabora App - Project Summary & Organization Features Design

**Date:** 2025-01-27  
**Status:** Ready for Organization Features Finalization

---

## 🎯 Project Overview

**Colabora** is a full-stack collaborative document editing application that enables teams to collaboratively draft documents with a proposal/voting system. The application supports both individual and organizational document workflows with democratic governance features.

### Technology Stack
- **Backend:** Node.js/Express with SQLite database
- **Frontend:** React/TypeScript with Vite
- **Real-time:** Socket.IO (WebSocket) for real-time updates
- **UI Framework:** Radix UI components with Tailwind CSS
- **Deployment:** Fly.io (production), GitHub (source control)
- **Architecture:** Monolithic application with RESTful API

### Core Features
1. **Document Management** - Create, edit, and manage collaborative documents
2. **Proposal & Voting System** - Propose changes, vote on proposals (PRO/NEUTRAL/CONTRA)
3. **Comments** - Comment threads on proposals
4. **Activity Tracking** - Activity feed across all documents
5. **Organizational Features** - Organizations, governance rules, elections, policy voting
6. **User Management** - JWT-based authentication, user profiles, role-based access
7. **Agreed View** - View approved content based on voting thresholds

---

## 🏗️ Architecture Overview

### Directory Structure
```
Colabora_App/
├── client/              # React/TypeScript frontend
│   ├── src/
│   │   ├── components/  # React components (98 files)
│   │   ├── hooks/       # Custom React hooks (useWebSocket, useAuth, etc.)
│   │   ├── pages/       # Page components
│   │   ├── types/       # TypeScript type definitions
│   │   └── lib/         # API client and utilities
│   └── package.json
├── server/              # Node.js/Express backend
│   ├── routes/          # API route handlers (17 files)
│   ├── modules/         # Business logic modules
│   │   ├── websocket.js # WebSocket manager
│   │   ├── server.js    # Server initialization
│   │   ├── scheduler.js # Background job scheduler
│   │   └── document-status.js # Document status management
│   ├── middleware/      # Express middleware (auth, monitoring)
│   ├── database/        # Database management
│   └── bootstrap.js     # Application bootstrap
└── package.json
```

### Key Components

**Backend:**
- `server/bootstrap.js` - Application initialization, database setup, route registration
- `server/modules/server.js` - Express server setup, middleware, WebSocket initialization
- `server/modules/websocket.js` - WebSocket manager for real-time updates
- `server/routes/` - API endpoints (documents, votes, comments, proposals, organizations, governance)
- `server/routes/organizations.js` - Organization management (1406 lines)
- `server/routes/governance.js` - Governance rules, elections, analytics

**Frontend:**
- `client/src/App.tsx` - Main application component, WebSocket integration
- `client/src/hooks/useWebSocket.ts` - WebSocket connection hook
- `client/src/hooks/useOrganizationData.ts` - Organization data management
- `client/src/components/OrganizationManagement/` - Organization UI components
- `client/src/components/OrganizationDashboard.tsx` - Organization listing

---

## 🏛️ Organization Features - Current State

### ✅ **What's Implemented**

#### 1. **Organization Management**
- ✅ Create organizations (admin only)
- ✅ Get organizations for current user
- ✅ Get organization details with members
- ✅ Update organization (representatives only)
- ✅ Organization membership management
  - ✅ Add members (representatives only)
  - ✅ Remove members (status → 'legacy')
  - ✅ Auto-add members as collaborators to organizational documents
- ✅ Representative management
  - ✅ Nominate new representatives
  - ✅ Remove representatives (minimum 3 required)

#### 2. **Organization Documents**
- ✅ Create organizational documents
- ✅ Documents start with `status = 'proposal'`
- ✅ All organization members automatically added as collaborators
- ✅ Documents linked to organization via `organization_id`
- ✅ Document ownership type: `'organizational'`

#### 3. **Governance Rules**
- ✅ Get governance rules for organization
- ✅ Update governance rules (representatives only)
- ✅ Governance settings:
  - Document proposal period (days)
  - Voting threshold
  - Minimum voters required
  - Representative election settings

#### 4. **Elections**
- ✅ Get elections for organization
- ✅ Create elections (representatives only)
- ✅ Election status tracking
- ✅ Election voting system

#### 5. **Organization Voting**
- ✅ Create organization votes (representatives only)
- ✅ Approve votes (representatives only)
- ✅ Cast votes in organization votes (active members)
- ✅ Vote tracking and results

#### 6. **Rule Proposals** ✅ (Needs Finalization)
- ✅ Create rule proposals (representatives only)
- ✅ Vote on rule proposals (active members)
- ✅ Apply approved rule changes to governance rules
- ✅ Support for multiple voting options
- ⚠️ **Needs:** Better UI integration, ensure all settings covered

#### 7. **Analytics**
- ✅ Get voting analytics for organization
- ✅ Election statistics
- ✅ Vote participation metrics

#### 8. **Audit Logging**
- ✅ Organization audit trail
- ✅ Action logging (member changes, votes, etc.)

### ❌ **What's Missing or Incomplete**

#### 1. **Organizational Document Workflow - CRITICAL** ⚠️
**Status:** Partially implemented, doesn't match intended design

**Intended Workflow:**
```
1. Document created → 'proposal' status
2. Editing phase → Members vote on paragraph proposals
3. X days before deadline → Paragraph proposals disabled (cutoff)
4. Voting phase → Members vote on whole document
5. After deadline → Document adopted/rejected based on votes
```

**Current Implementation:**
- ✅ Documents created with `status = 'proposal'`
- ✅ Paragraph-level voting works
- ❌ **Missing:** Paragraph proposal cutoff before deadline
- ❌ **Missing:** Whole-document voting interface
- ❌ **Missing:** Document-level voting logic
- ❌ **Missing:** Adoption/rejection logic after deadline
- ❌ **Missing:** Status transitions (proposal → voting → agreed/rejected)

**Files Affected:**
- `server/routes/documents.js` - Document creation and status management
- `server/modules/scheduler.js` - Deadline monitoring
- `server/modules/document-status.js` - Status transitions
- `server/routes/votes.js` - Document-level voting
- `client/src/components/DocumentEditor.tsx` - UI for disabling proposals
- `client/src/components/` - Missing document voting component

#### 2. **Policy Votes - REMOVED** ❌
**Status:** Removed from plan - redundant with Rule Proposals

**Decision:** Policy votes are not needed. Rule Proposals already handle voting on organization settings and default document configurations.

**Action Required:** 
- Remove policy votes API endpoints (or mark as deprecated)
- Remove policy votes from frontend
- Clean up database tables (or mark as deprecated)

#### 3. **Document Deletion Workflow - MISSING** ⚠️
**Status:** Currently only owner can delete, no voting workflow

**Location:** `server/routes/documents.js:1902-1934`

**Current Implementation:**
- Only document owner can delete
- Immediate deletion (no voting)

**Required:** For organizational documents, deletion should follow same process as document creation:
1. Representative proposes deletion
2. Organization members vote
3. If approved, document is deleted

**Impact:** Organizational documents cannot be deleted through proper governance

#### 4. **Admin Role - Clarified** ✅
**Status:** Clarified - Admins should NOT change documents

**Decision:**
- **Admins:** Only manage organizations (create, view, manage)
- **Representatives:** Responsible for all document management inside organizations
- **No admin checks needed** for document routes - representatives handle everything

**Action Required:** Remove any admin checks from document routes

#### 5. **Email Notifications**
**Status:** Intentionally deferred (low priority)

**Location:** Multiple files with TODOs

**Decision:** Remove TODOs, don't implement yet

---

## 🔍 Issues Found

### 🔴 **Critical Issues**

1. **Organizational Document Workflow Incomplete**
   - **Severity:** Critical
   - **Impact:** Major feature doesn't work as designed
   - **Status:** Needs design and implementation

2. **Database Error Handling**
   - **Severity:** Critical
   - **Impact:** App can start but fail silently if database fails
   - **Status:** Partially fixed in bootstrap.js

### 🟡 **High Priority Issues**

3. **Document Deletion Workflow Missing**
   - Organizational documents need voting workflow for deletion
   - Currently only owner can delete immediately

4. **Rule Proposals - Needs Finalization** ⚠️
   - System exists but may need UI improvements
   - Need to ensure all document settings are covered
   - Need to verify UI integration and accessibility

5. **Agreed View Not Updating Correctly**
   - History entries may not be created properly
   - Frontend expects `acceptedAt` but backend uses `created_at`

### 🟢 **Medium Priority Issues**

6. **Excessive Console Logging**
   - 628+ instances of console.log/error/warn
   - Should use Winston logger

7. **Code Duplication**
   - Activity feed components have duplicate UI code

8. **Missing TypeScript Types**
   - Some components use `any` types
   - Missing type definitions for API responses

---

## 🎨 Organization Features - Design Recommendations

### **Phase 1: Complete Organizational Document Workflow**

#### **1.1 Status State Machine**

```
draft → proposal → voting → agreed
    ↓         ↓        ↓
   draft    expired   rejected
```

**Status Definitions:**
- **`draft`**: Initial state, document being created (not used for org docs)
- **`proposal`**: Document proposed to organization, awaiting deadline
- **`voting`**: Proposal deadline passed, active voting period
- **`agreed`**: Voting passed with required quorum and approval
- **`rejected`**: Voting failed or quorum not met
- **`expired`**: Proposal deadline passed without sufficient activity

#### **1.2 Timeline & Deadlines**

```
Document Created → Proposal Period (30 days default) → Voting Period (7 days default) → Final Status
```

**Key Dates:**
- `proposal_deadline`: When proposal period ends (editing phase)
- `paragraph_proposals_cutoff`: X days before proposal_deadline (disable new proposals)
- `voting_deadline`: When voting period ends
- `voting_started_at`: When voting period begins

**Database Schema Additions:**
```sql
ALTER TABLE documents ADD COLUMN voting_deadline DATETIME;
ALTER TABLE documents ADD COLUMN paragraph_proposals_cutoff DATETIME;
ALTER TABLE documents ADD COLUMN voting_started_at DATETIME;
ALTER TABLE documents ADD COLUMN min_voters_required INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN adopted_at DATETIME;
```

#### **1.3 Workflow States**

**State 1: Proposal Period (status = 'proposal')**
- Members can edit document
- Members can create paragraph proposals
- Members can vote on paragraph proposals
- Paragraph proposals are enabled
- Deadline: `proposal_deadline`

**State 2: Proposal Cutoff (status = 'proposal', cutoff passed)**
- Members can still view document
- **New paragraph proposals are disabled**
- Existing proposals can still be voted on
- Deadline: `proposal_deadline`

**State 3: Voting Period (status = 'voting')**
- Paragraph proposals are locked
- **Whole-document voting is enabled**
- Members vote PRO/NEUTRAL/CONTRA on entire document
- Deadline: `voting_deadline`

**State 4: Final Status (status = 'agreed' or 'rejected')**
- Document is locked
- If `agreed`: Document is adopted by organization
- If `rejected`: Document was not approved

#### **1.4 Voting Logic**

**Quorum Check:**
```javascript
const eligibleVoters = await getOrganizationMembers(organizationId);
const totalEligible = eligibleVoters.length;
const actualVotes = documentVotes.length;
const minVotersRequired = document.min_voters_required || Math.ceil(totalEligible * 0.3);

const quorumMet = actualVotes >= minVotersRequired;
```

**Approval Check:**
```javascript
const proVotes = documentVotes.filter(v => v.vote === 'PRO').length;
const approvalRate = proVotes / actualVotes;
const threshold = document.acceptance_threshold / 100;

const approved = approvalRate >= threshold;
```

**Final Decision:**
- If `quorumMet && approved` → `status = 'agreed'`
- If `quorumMet && !approved` → `status = 'rejected'`
- If `!quorumMet && deadlinePassed` → `status = 'rejected'` (insufficient participation)

### **Phase 2: Backend Implementation**

#### **2.1 Database Schema Updates**

**Migration Script:**
```sql
-- Add new columns to documents table
ALTER TABLE documents ADD COLUMN voting_deadline DATETIME;
ALTER TABLE documents ADD COLUMN paragraph_proposals_cutoff DATETIME;
ALTER TABLE documents ADD COLUMN voting_started_at DATETIME;
ALTER TABLE documents ADD COLUMN min_voters_required INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN adopted_at DATETIME;
ALTER TABLE documents ADD COLUMN deletion_proposed_at DATETIME;
ALTER TABLE documents ADD COLUMN deletion_proposed_by TEXT;
ALTER TABLE documents ADD COLUMN deletion_vote_deadline DATETIME;

-- Add document status history table
CREATE TABLE IF NOT EXISTS document_status_history (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- Add document deletion votes table
CREATE TABLE IF NOT EXISTS document_deletion_votes (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  vote TEXT CHECK(vote IN ('PRO', 'NEUTRAL', 'CONTRA')) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(document_id, user_id)
);
```

#### **2.2 Document Creation Updates**

**File:** `server/routes/documents.js`

**Changes:**
1. When creating organizational document:
   - Set `status = 'proposal'`
   - Set `proposal_deadline = now + governance_rules.document_proposal_period_days`
   - Set `paragraph_proposals_cutoff = proposal_deadline - 7 days` (configurable)
   - Set `min_voters_required` from governance rules or default (30% of members)
   - Add all organization members as collaborators

2. Add validation:
   - Ensure organization exists
   - Ensure user is organization member
   - Ensure governance rules exist

#### **2.3 Scheduler Updates**

**File:** `server/modules/scheduler.js`

**New Jobs:**
1. **Check Proposal Deadlines** (every 15 minutes)
   - Find documents where `proposal_deadline < now` and `status = 'proposal'`
   - Transition to `status = 'voting'`
   - Set `voting_started_at = now`
   - Set `voting_deadline = now + 7 days` (configurable)
   - Broadcast WebSocket update

2. **Check Voting Deadlines** (every 15 minutes)
   - Find documents where `voting_deadline < now` and `status = 'voting'`
   - Calculate final results
   - Transition to `agreed` or `rejected`
   - Broadcast WebSocket update

3. **Check Proposal Cutoff** (every 15 minutes)
   - Find documents where `paragraph_proposals_cutoff < now` and `status = 'proposal'`
   - Mark document as "proposals locked" (UI state, not DB status)
   - Broadcast WebSocket update

#### **2.4 Document-Level Voting**

**File:** `server/routes/votes.js`

**New Endpoint:**
```javascript
// POST /api/documents/:documentId/vote-document
router.post('/:documentId/vote-document', requireAuth, async (req, res) => {
  // Cast vote on entire document (not paragraph)
  // Only works when status = 'voting'
  // Only organization members can vote
  // Check quorum and approval after each vote
});
```

**Vote Storage:**
- Use existing `document_votes` table
- `paragraph_id = NULL` for document-level votes
- `proposal_id = NULL` for document-level votes

#### **2.5 Status Management**

**File:** `server/modules/document-status.js`

**New Functions:**
```javascript
async function transitionToVoting(db, documentId, userId) {
  // Set status = 'voting'
  // Set voting_started_at = now
  // Set voting_deadline = now + 7 days
  // Log status change
  // Broadcast WebSocket update
}

async function transitionToAgreed(db, documentId, userId) {
  // Set status = 'agreed'
  // Set adopted_at = now
  // Log status change
  // Broadcast WebSocket update
}

async function transitionToRejected(db, documentId, userId, reason) {
  // Set status = 'rejected'
  // Log status change with reason
  // Broadcast WebSocket update
}
```

#### **2.6 Document Deletion Workflow**

**File:** `server/routes/documents.js`

**New Endpoints:**
```javascript
// Propose document deletion (representatives only for org docs)
router.post('/:id/propose-deletion', requireAuth, async (req, res) => {
  // Check if user is representative (for org docs) or owner (for personal docs)
  // Set deletion_proposed_at = now
  // Set deletion_proposed_by = userId
  // Set deletion_vote_deadline = now + governance_rules.document_proposal_period_days
  // Create deletion vote record
  // Broadcast WebSocket update
});

// Vote on document deletion (organization members)
router.post('/:id/vote-deletion', requireAuth, async (req, res) => {
  // Check if user is organization member
  // Check if deletion is proposed and deadline not passed
  // Cast vote (PRO = delete, CONTRA = keep)
  // Check if deletion approved (same logic as document approval)
  // If approved, delete document
  // Broadcast WebSocket update
});

// Cancel deletion proposal (representative who proposed it)
router.post('/:id/cancel-deletion', requireAuth, async (req, res) => {
  // Check if user proposed the deletion
  // Clear deletion fields
  // Broadcast WebSocket update
});
```

**Deletion Logic:**
- Same voting process as document creation
- Same quorum and approval thresholds
- If approved, delete document and all related data (cascade)
- If rejected or deadline passes without approval, clear deletion proposal

### **Phase 3: Frontend Implementation**

#### **3.1 Document Status Display**

**Component:** `client/src/components/OrganizationalDocumentStatus.tsx`

**Features:**
- Show current status (proposal/voting/agreed/rejected)
- Show deadlines (proposal deadline, voting deadline)
- Show countdown timers
- Show voting progress (if in voting phase)
- Visual status indicators

#### **3.2 Document Voting Interface**

**Component:** `client/src/components/OrganizationalDocumentVoting.tsx`

**Features:**
- Display when `status = 'voting'`
- Show vote counts (PRO/NEUTRAL/CONTRA)
- Allow members to cast/change votes
- Show quorum progress
- Show approval progress
- Real-time updates via WebSocket

#### **3.3 Proposal Cutoff UI**

**File:** `client/src/components/DocumentEditor.tsx`

**Changes:**
- Disable "Add Suggestion" button when `paragraph_proposals_cutoff` passed
- Show message: "Proposal period has ended. Document is now in voting phase."
- Disable proposal creation UI elements

#### **3.4 Document List Updates**

**File:** `client/src/components/OrganizationManagement/tabs/DocumentsTab.tsx`

**Changes:**
- Show document status badges
- Show deadline information
- Filter by status
- Sort by deadline

### **Phase 4: API Endpoints**

#### **4.1 New Endpoints**

```javascript
// Document voting
POST   /api/documents/:id/vote-document
GET    /api/documents/:id/voting-status
GET    /api/documents/:id/status-history

// Document deletion (new workflow)
POST   /api/documents/:id/propose-deletion
POST   /api/documents/:id/vote-deletion
POST   /api/documents/:id/cancel-deletion
GET    /api/documents/:id/deletion-status

// Rule Proposals (already exists, needs finalization)
// GET    /api/governance/:organizationId/rule-proposals (exists)
// POST   /api/governance/:organizationId/rule-proposals (exists)
// POST   /api/governance/:organizationId/rule-proposals/:proposalId/start-voting (exists)
// POST   /api/governance/:organizationId/rule-proposals/:proposalId/vote (exists)
// POST   /api/governance/:organizationId/rule-proposals/:proposalId/complete (exists)
```

#### **4.2 Enhanced Endpoints**

```javascript
// Document details - include voting info
GET    /api/documents/:id
// Response includes:
// - status
// - proposal_deadline
// - voting_deadline
// - paragraph_proposals_cutoff
// - voting_started_at
// - document_votes (if not anonymous)
// - can_vote (boolean)
// - user_vote (if exists)
```

### **Phase 5: WebSocket Events**

#### **5.1 New Events**

```javascript
// Document status changed
{
  eventType: 'document-status-changed',
  documentId: '...',
  data: {
    oldStatus: 'proposal',
    newStatus: 'voting',
    deadline: '...',
    reason: 'proposal_deadline_passed'
  }
}

// Document vote cast
{
  eventType: 'document-vote',
  documentId: '...',
  data: {
    vote: { userId, vote: 'PRO', ... },
    allVotes: [...],
    quorumProgress: 0.5,
    approvalProgress: 0.75
  }
}

// Proposal cutoff reached
{
  eventType: 'proposal-cutoff',
  documentId: '...',
  data: {
    proposalsLocked: true,
    message: 'New proposals are now disabled'
  }
}
```

---

## 🎯 Rule Proposals Finalization Plan

### **Current State**
Rule Proposals system exists and works, but needs finalization to ensure:
1. All governance rule fields are voteable
2. UI is easily accessible and intuitive
3. All document default settings can be voted on
4. Missing settings are added if needed

### **Governance Rule Fields Available for Voting**

**Currently Voteable Fields:**
- ✅ `anonymousVotingEnabled` - Whether voting is anonymous by default
- ✅ `voteChangeAllowed` - Can members change votes after casting?
- ✅ `defaultQuorumPercentage` - Default quorum for non-election votes
- ✅ `defaultVotingDeadlineHours` - Default voting deadline
- ✅ `representativeCanCreateVotes` - Can reps create votes?
- ✅ `representativeCanInviteMembers` - Can reps invite members?
- ✅ `representativeCanManageDocuments` - Can reps manage documents?
- ✅ `representativeApprovalRequired` - Must reps approve votes?
- ✅ `electionVotingMethod` - Election voting method
- ✅ `electionQuorumPercentage` - Election quorum
- ✅ `electionNoticeDays` - Election notice period
- ✅ `representativeTermMonths` - Representative term length
- ✅ `representativeTermLimits` - Representative term limits
- ✅ `tamperProofEnabled` - Tamper proof enabled
- ✅ `auditTrailEnabled` - Audit trail enabled

### **Potential Missing Fields for Document Defaults**

**Settings You Mentioned:**
1. **Anonymous Voting** - ✅ Already exists (`anonymousVotingEnabled`)
2. **Threshold Calculation Method** - ❌ **MISSING** - Need to add:
   - `threshold_calculation_method` - Options: 'all_votes' (from all votes cast) or 'all_members' (from all organization members)
3. **Flexible Voting** - ✅ Already exists (`voteChangeAllowed`)
4. **Default Acceptance Threshold** - ❌ **MISSING** - Need to add:
   - `default_acceptance_threshold` - Default percentage for document approval (e.g., 75%)

### **Database Schema Additions Needed**

```sql
-- Add missing governance rule fields
ALTER TABLE organization_governance_rules ADD COLUMN threshold_calculation_method TEXT 
  CHECK(threshold_calculation_method IN ('all_votes', 'all_members')) DEFAULT 'all_votes';

ALTER TABLE organization_governance_rules ADD COLUMN default_acceptance_threshold REAL DEFAULT 75.0;
```

### **Rule Proposals UI Improvements Needed**

1. **Accessibility:**
   - Ensure Rule Proposals are prominently displayed in Governance tab
   - Add quick access button to create new rule proposals
   - Show active rule proposals on organization dashboard

2. **Rule Proposal Creation:**
   - Show all available rule fields in a dropdown/selector
   - Show current value vs proposed value side-by-side
   - Add descriptions for each rule field
   - Support for multiple options (already exists but needs better UI)

3. **Rule Proposal Display:**
   - Show proposal status clearly (draft, active, approved, rejected)
   - Show voting progress (votes cast vs total members)
   - Show current vs proposed value comparison
   - Show who proposed and when

4. **Rule Proposal Voting:**
   - Clear voting interface with current vs proposed values
   - Show voting deadline
   - Show vote counts (if not anonymous)
   - Show quorum progress

5. **Rule Proposal History:**
   - Show history of all rule proposals
   - Show which rules were changed and when
   - Show who proposed and who voted

### **Implementation Tasks for Rule Proposals**

**Backend:**
- [ ] Add `threshold_calculation_method` field to governance rules
- [ ] Add `default_acceptance_threshold` field to governance rules
- [ ] Update rule proposal creation to validate new fields
- [ ] Ensure rule proposal completion properly updates all fields
- [ ] Add WebSocket broadcasts for rule proposal updates

**Frontend:**
- [ ] Improve Governance tab to prominently show Rule Proposals
- [ ] Enhance rule proposal creation dialog with all fields
- [ ] Improve rule proposal voting interface
- [ ] Add rule proposal history/audit display
- [ ] Add rule proposal status indicators throughout UI
- [ ] Ensure rule proposals are accessible from organization dashboard

**Testing:**
- [ ] Test creating rule proposals for all fields
- [ ] Test voting on rule proposals
- [ ] Test rule proposal approval and implementation
- [ ] Test that new fields (threshold_calculation_method, default_acceptance_threshold) work correctly
- [ ] Test rule proposal with multiple options
- [ ] Test rule proposal rejection

---

## 📋 Implementation Checklist

### **Backend Tasks**

- [ ] Add database migration for new document fields
- [ ] Update document creation to set deadlines
- [ ] Implement scheduler jobs for deadline monitoring
- [ ] Implement status transition functions
- [ ] Add document-level voting endpoint
- [ ] Add voting status endpoint
- [ ] Add status history endpoint
- [ ] **Implement document deletion workflow** (propose, vote, execute)
- [ ] Add deletion voting endpoints
- [ ] Remove admin role checks from document routes (representatives handle everything)
- [ ] **Finalize Rule Proposals system:**
  - [ ] Add `threshold_calculation_method` field to governance rules table
  - [ ] Add `default_acceptance_threshold` field to governance rules table
  - [ ] Verify all governance rule fields are voteable via rule proposals
  - [ ] Ensure rule proposals properly update governance rules
  - [ ] Add validation for rule proposal values
  - [ ] Add WebSocket broadcasts for rule proposal updates
- [ ] **Remove/Deprecate Policy Votes:**
  - [ ] Mark policy votes endpoints as deprecated
  - [ ] Remove policy votes from frontend API calls
  - [ ] Document removal in migration notes
- [ ] Add WebSocket broadcasts for status changes
- [ ] Add WebSocket broadcasts for document votes
- [ ] Add WebSocket broadcasts for deletion proposals
- [ ] Add WebSocket broadcasts for rule proposal updates

### **Frontend Tasks**

- [ ] Create OrganizationalDocumentStatus component
- [ ] Create OrganizationalDocumentVoting component
- [ ] Update DocumentEditor to disable proposals after cutoff
- [ ] Update DocumentsTab to show status and deadlines
- [ ] Add document voting UI to document view
- [ ] **Add document deletion proposal UI** (for representatives)
- [ ] **Add document deletion voting UI** (for members)
- [ ] **Finalize Rule Proposals UI:**
  - [ ] Ensure Rule Proposals are prominently displayed in Governance tab
  - [ ] Add quick access button to create new rule proposals
  - [ ] Show active rule proposals on organization dashboard
  - [ ] Improve rule proposal creation dialog:
    - [ ] Show all available rule fields in dropdown/selector
    - [ ] Show current value vs proposed value side-by-side
    - [ ] Add descriptions for each rule field
    - [ ] Better UI for multiple options
  - [ ] Improve rule proposal display:
    - [ ] Show proposal status clearly (draft, active, approved, rejected)
    - [ ] Show voting progress (votes cast vs total members)
    - [ ] Show current vs proposed value comparison
    - [ ] Show who proposed and when
  - [ ] Improve rule proposal voting interface:
    - [ ] Clear voting interface with current vs proposed values
    - [ ] Show voting deadline
    - [ ] Show vote counts (if not anonymous)
    - [ ] Show quorum progress
  - [ ] Add rule proposal history/audit trail display
- [ ] **Remove Policy Votes from UI:**
  - [ ] Remove policy votes from DocumentsTab
  - [ ] Remove policy votes from useOrganizationData hook
  - [ ] Remove policy votes API calls
  - [ ] Clean up any policy votes components
- [ ] Update API client with new endpoints
- [ ] Add WebSocket handlers for new events
- [ ] Add status history display

### **Testing Tasks**

- [ ] Test document creation with deadlines
- [ ] Test proposal cutoff functionality
- [ ] Test status transitions
- [ ] Test document-level voting
- [ ] Test quorum and approval logic
- [ ] **Test document deletion proposal workflow**
- [ ] **Test document deletion voting**
- [ ] **Test deletion execution after approval**
- [ ] **Test Rule Proposals:**
  - [ ] Test creating rule proposals for all governance rule fields
  - [ ] Test creating rule proposals for new fields (threshold_calculation_method, default_acceptance_threshold)
  - [ ] Test voting on rule proposals
  - [ ] Test rule proposal approval and implementation
  - [ ] Test that approved rules update governance rules correctly
  - [ ] Test rule proposal with multiple options
  - [ ] Test rule proposal rejection
  - [ ] Test that new document defaults are applied when creating documents
- [ ] Test WebSocket updates
- [ ] Test that admins cannot modify documents (only manage orgs)
- [ ] Test that representatives can manage documents

---

## 🎯 Priority Recommendations

### **Must Have (Phase 1)**
1. ✅ Complete organizational document workflow
2. ✅ Document-level voting
3. ✅ Status transitions
4. ✅ Proposal cutoff
5. ✅ **Document deletion workflow** (propose → vote → execute)
6. ✅ **Finalize Rule Proposals system** (ensure all settings voteable, improve UI)

### **Should Have (Phase 2)**
7. ✅ Remove policy votes (deprecate/remove endpoints and UI)
8. ✅ Remove admin role checks from document routes
9. ✅ Add missing governance rule fields if needed

### **Nice to Have (Phase 3)**
10. Status history display
11. Enhanced analytics
12. Email notifications (deferred)

---

## 📝 Next Steps

1. **Review WebSocket Status** - See `WEBSOCKET_STATUS_AND_NEW_FEATURES.md` for current implementation and what's needed for new features
2. **Remove Policy Votes** - Deprecate/remove policy votes endpoints and UI components
3. **Finalize Rule Proposals** - Add missing fields, improve UI, ensure all settings are voteable
4. **Review this design document** - Confirm workflow matches requirements
5. **Start with Phase 1** - Implement core workflow including deletion and rule proposals finalization
6. **Add WebSocket support** - Add broadcasts for new features as we implement them
7. **Test incrementally** - Verify each piece works before moving on
8. **Deploy in stages** - Use feature flags if needed

## ✅ **Clarifications Received**

1. **Average Decision Time** - ❌ NOT needed, remove from implementation
2. **Policy Votes** - ❌ REMOVED - Redundant with Rule Proposals. Rule Proposals handle voting on organization settings and default document configurations.
3. **Admin Role** - ✅ Admins should NOT change documents, only manage organizations. Representatives handle all document management inside organizations.
4. **Document Deletion** - ✅ Should follow same process as document creation proposal (representative proposes → members vote → if approved, delete)
5. **Rule Proposals** - ✅ FINALIZE - This is the system for voting on internal agreements (anonymous voting, threshold calculation, flexible voting, etc.). Needs:
   - Add missing fields: `threshold_calculation_method` and `default_acceptance_threshold`
   - Improve UI accessibility and usability
   - Ensure all governance rule fields are voteable

---

## 🔗 Related Documentation

- `organizational-documents-design.md` - Original design document
- `CODEBASE_SUMMARY.md` - General codebase summary
- `ISSUES_FOUND.md` - Detailed issues list
- `IMPLEMENTATION_PLAN.md` - Implementation strategy

---

**Last Updated:** 2025-01-27  
**Status:** Ready for Design Review and Implementation

