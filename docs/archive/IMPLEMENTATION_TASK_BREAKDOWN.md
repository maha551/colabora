# Implementation Task Breakdown: Democratic Constitution System

## Overview

This document breaks down the implementation into specific, actionable tasks ordered by dependencies and priority. Each task includes acceptance criteria and estimated effort.

---

## Phase 1: Foundation & Database (Week 1)

### Task 1.1: Create Database Migration Script
**Priority:** Critical  
**Dependencies:** None  
**Estimated Time:** 4-6 hours

**Description:**
Create migration script to add all new columns and tables for democratic constitution system.

**Acceptance Criteria:**
- [ ] Migration script created at `server/migrations/democratic-constitution-migration.js`
- [ ] All new columns added to `organization_governance_rules` table
- [ ] `governance_rule_history` table created with indexes
- [ ] `snapshot_rules` and `cooldown_until` columns added to `governance_rule_proposals`
- [ ] Migration handles existing organizations (sets safe defaults)
- [ ] Migration is idempotent (can run multiple times safely)
- [ ] Migration script tested on copy of production data
- [ ] Rollback plan documented

**Files to Create/Modify:**
- `server/migrations/democratic-constitution-migration.js` (new)
- `database_governance_migration.sql` (update)

**Implementation Notes:**
- Handle SQLite's limited ALTER TABLE support
- Use application-level defaults if ALTER TABLE fails
- Set `bootstrap_mode = 0` for existing organizations
- Set all member permission flags to `0` (maintain current behavior)

---

### Task 1.2: Update TypeScript Types
**Priority:** Critical  
**Dependencies:** Task 1.1  
**Estimated Time:** 2-3 hours

**Description:**
Update TypeScript interfaces to include all new governance rule fields and related types.

**Acceptance Criteria:**
- [ ] `OrganizationGovernanceRules` interface updated with all new fields
- [ ] `BootstrapStatus` interface created
- [ ] `RecoveryStatus` interface created
- [ ] `RuleHistoryEntry` interface created
- [ ] `PermissionContext` interface created
- [ ] All types exported from `client/src/types/index.ts`
- [ ] No TypeScript errors in codebase

**Files to Modify:**
- `client/src/types/index.ts`

**New Interfaces:**
```typescript
interface OrganizationGovernanceRules {
  // ... existing fields
  membersCanProposeRules: boolean;
  membersCanProposeRulesThreshold: number;
  membersCanCreateDocuments: boolean;
  membersCanCreateDocumentsThreshold: number;
  membersCanInitializeElections: boolean;
  membersCanInitializeElectionsThreshold: number;
  membersCanInviteMembers: boolean;
  membersCanInviteMembersThreshold: number;
  membersCanManageRuleProposals: boolean;
  membersCanManageRuleProposalsThreshold: number;
  minimumQuorumPercentage: number;
  minimumApprovalThreshold: number;
  minimumVotingPeriodHours: number;
  bootstrapMode: boolean;
  bootstrapCompletedAt: string | null;
  recoveryMode: boolean;
  recoveryModeEnteredAt: string | null;
  recoveryModeReason: string | null;
  lastSuccessfulVoteAt: string | null;
  failedProposalsCount: number;
  lastFailedProposalAt: string | null;
  ruleChangesThisMonth: number;
  lastRuleChangeAt: string | null;
}

interface BootstrapStatus {
  mode: boolean;
  completedAt: string | null;
  progress: {
    completed: number;
    total: number;
    checklist: Array<{
      rule: string;
      completed: boolean;
      proposalId?: string;
    }>;
  };
  canComplete: boolean;
  daysRemaining: number | null;
}

interface RecoveryStatus {
  mode: boolean;
  enteredAt: string | null;
  reason: string | null;
  canExit: boolean;
}

interface RuleHistoryEntry {
  id: string;
  ruleField: string;
  oldValue: any;
  newValue: any;
  changedBy: {
    userId: string;
    userName: string;
    proposalId?: string;
  };
  changedAt: string;
}

interface PermissionContext {
  isRepresentative: boolean;
  isActiveMember: boolean;
  isAdmin: boolean;
  bootstrapMode: boolean;
  recoveryMode: boolean;
}
```

---

### Task 1.3: Create Permission Helper Functions
**Priority:** Critical  
**Dependencies:** Task 1.2  
**Estimated Time:** 6-8 hours

**Description:**
Create backend permission helper functions that calculate permissions dynamically based on governance rules.

**Acceptance Criteria:**
- [ ] `canProposeRules()` function implemented
- [ ] `canCreateDocuments()` function implemented
- [ ] `canInitializeElections()` function implemented
- [ ] `canInviteMembers()` function implemented
- [ ] `canManageRuleProposals()` function implemented
- [ ] All functions handle bootstrap mode
- [ ] All functions handle recovery mode
- [ ] All functions handle admin override
- [ ] Unit tests written for each function
- [ ] Edge cases tested (no reps, no members, etc.)

**Files to Create/Modify:**
- `server/routes/governance.js` (add functions)
- OR `server/modules/permissions.js` (new file, recommended)

**Function Signatures:**
```javascript
async function canProposeRules(db, userId, organizationId, rules)
async function canCreateDocuments(db, userId, organizationId, rules)
async function canInitializeElections(db, userId, organizationId, rules)
async function canInviteMembers(db, userId, organizationId, rules)
async function canManageRuleProposals(db, userId, organizationId, rules)
```

**Test Cases:**
- Admin always has permission
- Representative in bootstrap mode
- Member in bootstrap mode
- Representative in normal mode
- Member in normal mode (with/without rule enabled)
- Recovery mode scenarios
- No representatives scenario
- No members scenario

---

### Task 1.4: Create Rule Validation Functions
**Priority:** High  
**Dependencies:** Task 1.3  
**Estimated Time:** 8-10 hours

**Description:**
Create functions to validate rule values, check dependencies, detect deadlocks, and validate rule changes.

**Acceptance Criteria:**
- [ ] `validateGovernanceRuleValue()` function implemented
- [ ] `checkRuleDependencies()` function implemented
- [ ] `checkDeadlockConditions()` function implemented
- [ ] `checkDuplicateProposal()` function implemented (includes cooldown)
- [ ] All validation functions return clear error messages
- [ ] Unit tests written for each function
- [ ] Edge cases tested

**Files to Create/Modify:**
- `server/middleware/governanceValidation.js` (new)
- `server/modules/rule-validation.js` (new)

**Validation Rules:**
- Value format validation (types, ranges, enums)
- Dependency checking (rule conflicts)
- Deadlock detection (100% thresholds, etc.)
- Cooldown checking (7-day period)
- Duplicate checking (active/draft proposals)

---

### Task 1.5: Create Safety Mechanism Functions
**Priority:** High  
**Dependencies:** Task 1.4  
**Estimated Time:** 6-8 hours

**Description:**
Create functions for dynamic quorum calculation, recovery mode activation, and safety tracking.

**Acceptance Criteria:**
- [ ] `calculateMinimumQuorum()` function implemented
- [ ] `getEffectiveQuorum()` function implemented
- [ ] `checkRecoveryModeConditions()` function implemented
- [ ] `activateRecoveryMode()` function implemented
- [ ] `updateSafetyTracking()` function implemented
- [ ] Unit tests written for each function

**Files to Create/Modify:**
- `server/modules/safety-mechanisms.js` (new)

**Functions:**
```javascript
function calculateMinimumQuorum(activeMemberCount)
function getEffectiveQuorum(organizationId, governanceRules, activeMemberCount)
async function checkRecoveryModeConditions(db, organizationId)
async function activateRecoveryMode(db, organizationId, reason, details)
async function updateSafetyTracking(db, organizationId, success)
```

---

## Phase 2: Backend API Implementation (Week 2)

### Task 2.1: Implement Get Permissions Endpoint
**Priority:** Critical  
**Dependencies:** Task 1.3  
**Estimated Time:** 3-4 hours

**Description:**
Create API endpoint that returns calculated permissions for current user.

**Acceptance Criteria:**
- [ ] Endpoint: `GET /api/governance/:organizationId/permissions`
- [ ] Returns all calculated permissions
- [ ] Returns permission context (isRep, isMember, bootstrap, recovery)
- [ ] Handles errors gracefully
- [ ] Integration tests written
- [ ] Returns correct permissions for all scenarios

**Files to Modify:**
- `server/routes/governance.js`

**Test Cases:**
- Admin user
- Representative in bootstrap mode
- Member in bootstrap mode
- Representative in normal mode
- Member in normal mode (with/without rules)
- Recovery mode scenarios

---

### Task 2.2: Implement Bootstrap Status Endpoint
**Priority:** High  
**Dependencies:** Task 2.1  
**Estimated Time:** 4-5 hours

**Description:**
Create API endpoint that returns bootstrap mode status and progress.

**Acceptance Criteria:**
- [ ] Endpoint: `GET /api/governance/:organizationId/bootstrap-status`
- [ ] Returns bootstrap mode status
- [ ] Returns progress (completed/total core rules)
- [ ] Returns checklist with completion status
- [ ] Returns days remaining until auto-completion
- [ ] Returns whether user can complete bootstrap
- [ ] Integration tests written

**Files to Modify:**
- `server/routes/governance.js`

**Core Rules to Track:**
1. `membersCanProposeRules`
2. `membersCanCreateDocuments`
3. `defaultQuorumPercentage` (or voting thresholds)

---

### Task 2.3: Implement Complete Bootstrap Endpoint
**Priority:** High  
**Dependencies:** Task 2.2  
**Estimated Time:** 2-3 hours

**Description:**
Create API endpoint to manually complete bootstrap mode.

**Acceptance Criteria:**
- [ ] Endpoint: `POST /api/governance/:organizationId/bootstrap/complete`
- [ ] Requires confirmation in request body
- [ ] Only representatives/admins can complete
- [ ] Updates `bootstrap_mode = 0` and `bootstrap_completed_at`
- [ ] Logs audit event
- [ ] Returns updated bootstrap status
- [ ] Integration tests written

**Files to Modify:**
- `server/routes/governance.js`

---

### Task 2.4: Implement Validate Rule Change Endpoint
**Priority:** High  
**Dependencies:** Task 1.4  
**Estimated Time:** 4-5 hours

**Description:**
Create API endpoint to validate rule changes before creating proposals.

**Acceptance Criteria:**
- [ ] Endpoint: `POST /api/governance/:organizationId/validate-rule-change`
- [ ] Validates rule value format
- [ ] Checks for duplicates (including cooldown)
- [ ] Checks dependencies
- [ ] Checks for deadlock conditions
- [ ] Returns errors, warnings, and conflicts
- [ ] Integration tests written

**Files to Modify:**
- `server/routes/governance.js`

**Response Format:**
```typescript
{
  valid: boolean,
  errors: string[],
  warnings: string[],
  conflicts: Array<{
    type: 'dependency' | 'deadlock' | 'cooldown' | 'duplicate',
    message: string,
    details?: any
  }>
}
```

---

### Task 2.5: Implement Get Rule History Endpoint
**Priority:** Medium  
**Dependencies:** Task 1.1  
**Estimated Time:** 3-4 hours

**Description:**
Create API endpoint to retrieve history of rule changes.

**Acceptance Criteria:**
- [ ] Endpoint: `GET /api/governance/:organizationId/rule-history`
- [ ] Supports filtering by rule field
- [ ] Supports pagination (limit/offset)
- [ ] Returns rule history entries with metadata
- [ ] Integration tests written

**Files to Modify:**
- `server/routes/governance.js`

**Query Parameters:**
- `ruleField?: string`
- `limit?: number` (default 50, max 100)
- `offset?: number`

---

### Task 2.6: Update Create Rule Proposal Endpoint
**Priority:** Critical  
**Dependencies:** Task 2.4, Task 1.3  
**Estimated Time:** 4-5 hours

**Description:**
Update existing rule proposal creation endpoint to use dynamic permissions and validation.

**Acceptance Criteria:**
- [ ] Uses `canProposeRules()` instead of `isRepresentative()`
- [ ] Calls validation before creating proposal
- [ ] Checks for duplicates (including cooldown)
- [ ] Handles bootstrap mode
- [ ] Returns clear error messages
- [ ] Integration tests updated

**Files to Modify:**
- `server/routes/governance.js` (existing endpoint)

**Changes:**
- Replace permission check
- Add validation call
- Add duplicate/cooldown check
- Enhanced error responses

---

### Task 2.7: Update Start Voting Endpoint
**Priority:** Critical  
**Dependencies:** Task 2.6, Task 1.3  
**Estimated Time:** 3-4 hours

**Description:**
Update existing start voting endpoint to store rule snapshot and use dynamic permissions.

**Acceptance Criteria:**
- [ ] Uses `canManageRuleProposals()` instead of `isRepresentative()`
- [ ] Stores `snapshot_rules` when voting starts
- [ ] Enforces minimum voting period
- [ ] Integration tests updated

**Files to Modify:**
- `server/routes/governance.js` (existing endpoint)

**Changes:**
- Replace permission check
- Get current rules and store as JSON in `snapshot_rules`
- Calculate voting period (enforce minimum)
- Update proposal with snapshot

---

### Task 2.8: Update Complete Proposal Endpoint
**Priority:** Critical  
**Dependencies:** Task 2.7, Task 1.5  
**Estimated Time:** 6-8 hours

**Description:**
Update existing complete proposal endpoint to use snapshot rules, check safeguards, and log history.

**Acceptance Criteria:**
- [ ] Uses `canManageRuleProposals()` instead of `isRepresentative()`
- [ ] Uses `snapshot_rules` for approval calculation (not current rules)
- [ ] Checks minimum quorum (dynamic calculation)
- [ ] Checks minimum approval threshold
- [ ] Validates dependencies before applying
- [ ] Logs to rule history
- [ ] Updates safety tracking
- [ ] Invalidates permission cache
- [ ] Integration tests updated

**Files to Modify:**
- `server/routes/governance.js` (existing endpoint)

**Changes:**
- Replace permission check
- Load snapshot rules
- Calculate approval using snapshot
- Check minimum safeguards
- Validate dependencies
- Apply rule change
- Log to history
- Update tracking

---

### Task 2.9: Update Document Creation Endpoint
**Priority:** Critical  
**Dependencies:** Task 1.3  
**Estimated Time:** 2-3 hours

**Description:**
Update document creation endpoint to use dynamic permission check.

**Acceptance Criteria:**
- [ ] Uses `canCreateDocuments()` instead of `isRepresentative()`
- [ ] Handles bootstrap mode
- [ ] Handles recovery mode
- [ ] Integration tests updated

**Files to Modify:**
- `server/routes/documents.js`

**Changes:**
- Replace `isRepresentative()` check with `canCreateDocuments()`
- Pass governance rules to permission function

---

### Task 2.10: Update Election Creation Endpoint
**Priority:** Critical  
**Dependencies:** Task 1.3  
**Estimated Time:** 2-3 hours

**Description:**
Update election creation endpoint to use dynamic permission check.

**Acceptance Criteria:**
- [ ] Uses `canInitializeElections()` instead of `isRepresentative()`
- [ ] Handles bootstrap mode
- [ ] Handles recovery mode
- [ ] Integration tests updated

**Files to Modify:**
- `server/routes/governance.js` (election endpoints)

**Changes:**
- Replace `isRepresentative()` check with `canInitializeElections()`
- Pass governance rules to permission function

---

### Task 2.11: Update Member Invitation Endpoint
**Priority:** Critical  
**Dependencies:** Task 1.3  
**Estimated Time:** 2-3 hours

**Description:**
Update member invitation endpoint to use dynamic permission check.

**Acceptance Criteria:**
- [ ] Uses `canInviteMembers()` instead of `isRepresentative()`
- [ ] Checks `representativeCanInviteMembers` rule
- [ ] Handles bootstrap mode
- [ ] Handles recovery mode
- [ ] Integration tests updated

**Files to Modify:**
- `server/routes/organizations.js`

**Changes:**
- Replace `isRepresentative()` check with `canInviteMembers()`
- Check existing `representativeCanInviteMembers` rule
- Pass governance rules to permission function

---

### Task 2.12: Add Permission Caching
**Priority:** Medium  
**Dependencies:** Task 2.1  
**Estimated Time:** 3-4 hours

**Description:**
Implement caching for permission calculations to improve performance.

**Acceptance Criteria:**
- [ ] In-memory cache with TTL (1 minute)
- [ ] Cache key: `userId:organizationId:permissionType`
- [ ] Cache invalidation on rule changes
- [ ] Cache invalidation on bootstrap completion
- [ ] Cache invalidation on recovery mode activation
- [ ] Performance improvement measured
- [ ] Unit tests written

**Files to Create/Modify:**
- `server/modules/permissions.js` (add caching)

**Implementation:**
- Simple Map-based cache
- TTL-based expiration
- Manual invalidation function
- Call invalidation in rule update endpoints

---

## Phase 3: Frontend Components (Week 3)

### Task 3.1: Update useOrganizationPermissions Hook
**Priority:** Critical  
**Dependencies:** Task 2.1, Task 1.2  
**Estimated Time:** 4-5 hours

**Description:**
Update permission hook to calculate permissions dynamically based on governance rules.

**Acceptance Criteria:**
- [ ] Hook accepts `governanceRules` parameter
- [ ] Calculates permissions based on rules
- [ ] Handles bootstrap mode
- [ ] Handles recovery mode
- [ ] Returns all permissions
- [ ] Returns permission context
- [ ] TypeScript types correct
- [ ] Unit tests written

**Files to Modify:**
- `client/src/hooks/useOrganizationPermissions.ts`

**Changes:**
- Add `governanceRules` parameter
- Calculate permissions dynamically
- Check bootstrap/recovery modes
- Return context information

---

### Task 3.2: Create BootstrapModeBanner Component
**Priority:** High  
**Dependencies:** Task 2.2, Task 1.2  
**Estimated Time:** 4-5 hours

**Description:**
Create component to display bootstrap mode status and progress.

**Acceptance Criteria:**
- [ ] Component created at `client/src/components/governance/BootstrapModeBanner.tsx`
- [ ] Shows bootstrap mode banner when active
- [ ] Displays progress bar
- [ ] Shows checklist of core rules
- [ ] Shows days remaining until auto-completion
- [ ] Shows "Complete Bootstrap" button (if user can)
- [ ] Handles completion action
- [ ] Styled appropriately
- [ ] Responsive design
- [ ] Unit tests written

**Files to Create:**
- `client/src/components/governance/BootstrapModeBanner.tsx`

**Props:**
```typescript
interface BootstrapModeBannerProps {
  organization: Organization;
  bootstrapStatus: BootstrapStatus;
  onComplete?: () => void;
}
```

---

### Task 3.3: Create BootstrapCompletionDialog Component
**Priority:** High  
**Dependencies:** Task 2.3, Task 3.2  
**Estimated Time:** 3-4 hours

**Description:**
Create dialog for manually completing bootstrap mode.

**Acceptance Criteria:**
- [ ] Component created at `client/src/components/governance/BootstrapCompletionDialog.tsx`
- [ ] Shows confirmation dialog
- [ ] Explains what completing bootstrap means
- [ ] Requires explicit confirmation
- [ ] Calls complete bootstrap API
- [ ] Shows loading state
- [ ] Handles errors
- [ ] Refreshes data on success
- [ ] Unit tests written

**Files to Create:**
- `client/src/components/governance/BootstrapCompletionDialog.tsx`

---

### Task 3.4: Create RecoveryModeBanner Component
**Priority:** Medium  
**Dependencies:** Task 1.2  
**Estimated Time:** 3-4 hours

**Description:**
Create component to display recovery mode status and information.

**Acceptance Criteria:**
- [ ] Component created at `client/src/components/governance/RecoveryModeBanner.tsx`
- [ ] Shows recovery mode banner when active
- [ ] Displays reason for recovery mode
- [ ] Shows steps to exit recovery mode
- [ ] Styled as warning/alert
- [ ] Responsive design
- [ ] Unit tests written

**Files to Create:**
- `client/src/components/governance/RecoveryModeBanner.tsx`

---

### Task 3.5: Update RuleProposalDialog Component
**Priority:** Critical  
**Dependencies:** Task 2.4, Task 2.6, Task 1.2  
**Estimated Time:** 6-8 hours

**Description:**
Update rule proposal dialog to include new rule fields and validation.

**Acceptance Criteria:**
- [ ] New rule fields added to `availableRuleFields`
- [ ] Pre-submission validation calls API
- [ ] Shows validation warnings/conflicts
- [ ] Asks for confirmation on conflicts
- [ ] Shows bootstrap/recovery mode status
- [ ] Handles new error responses
- [ ] Updated labels and descriptions
- [ ] Unit tests updated

**Files to Modify:**
- `client/src/components/governance/RuleProposalDialog.tsx`

**New Fields:**
- `membersCanProposeRules`
- `membersCanCreateDocuments`
- `membersCanInitializeElections`
- `membersCanInviteMembers`
- `membersCanManageRuleProposals`

**Changes:**
- Add validation API call before submission
- Show warnings/conflicts to user
- Handle 409 conflicts gracefully
- Update permission check

---

### Task 3.6: Create RuleHistoryView Component
**Priority:** Medium  
**Dependencies:** Task 2.5, Task 1.2  
**Estimated Time:** 4-5 hours

**Description:**
Create component to display history of rule changes.

**Acceptance Criteria:**
- [ ] Component created at `client/src/components/governance/RuleHistoryView.tsx`
- [ ] Fetches and displays rule history
- [ ] Supports filtering by rule field
- [ ] Supports pagination
- [ ] Shows old value, new value, who changed it, when
- [ ] Links to proposals (if changed by proposal)
- [ ] Styled as timeline or table
- [ ] Unit tests written

**Files to Create:**
- `client/src/components/governance/RuleHistoryView.tsx`

---

### Task 3.7: Update GovernanceRulesVotingInterface Component
**Priority:** High  
**Dependencies:** Task 3.1, Task 3.2  
**Estimated Time:** 3-4 hours

**Description:**
Update governance rules voting interface to show bootstrap banner and use dynamic permissions.

**Acceptance Criteria:**
- [ ] Shows BootstrapModeBanner when in bootstrap
- [ ] Uses updated permission hook
- [ ] Shows/hides buttons based on permissions
- [ ] Displays permission explanations
- [ ] Unit tests updated

**Files to Modify:**
- `client/src/components/governance/GovernanceRulesVotingInterface.tsx`

---

### Task 3.8: Update OrganizationManagement Components
**Priority:** High  
**Dependencies:** Task 3.1  
**Estimated Time:** 4-5 hours

**Description:**
Update organization management components to use dynamic permissions.

**Acceptance Criteria:**
- [ ] Document creation uses dynamic permission
- [ ] Member invitation uses dynamic permission
- [ ] Election creation uses dynamic permission
- [ ] Buttons show/hide based on permissions
- [ ] Permission explanations shown when disabled
- [ ] All components updated

**Files to Modify:**
- `client/src/components/OrganizationManagement/DocumentCreationModal.tsx`
- `client/src/components/OrganizationManagement/tabs/MembersTab.tsx`
- `client/src/components/governance/ElectionCreationDialog.tsx`
- Other organization management components

---

## Phase 4: Safety Mechanisms & Scheduler (Week 4)

### Task 4.1: Implement Recovery Mode Check in Scheduler
**Priority:** High  
**Dependencies:** Task 1.5  
**Estimated Time:** 4-5 hours

**Description:**
Add recovery mode checking to scheduler to automatically activate when conditions are met.

**Acceptance Criteria:**
- [ ] Scheduler checks recovery conditions daily
- [ ] Activates recovery mode when conditions met
- [ ] Logs activation reason
- [ ] Notifies admins
- [ ] Integration tests written

**Files to Modify:**
- `server/modules/scheduler.js`

**Conditions to Check:**
- No representatives AND members can't manage
- No successful votes in 60 days
- Quorum consistently unmet (5+ failures in 30 days)

---

### Task 4.2: Implement Bootstrap Auto-Completion in Scheduler
**Priority:** Medium  
**Dependencies:** Task 2.2  
**Estimated Time:** 3-4 hours

**Description:**
Add bootstrap auto-completion to scheduler (90-day timeout).

**Acceptance Criteria:**
- [ ] Scheduler checks bootstrap timeout daily
- [ ] Auto-completes bootstrap after 90 days
- [ ] Uses current rules or safe defaults
- [ ] Logs completion
- [ ] Notifies organization
- [ ] Integration tests written

**Files to Modify:**
- `server/modules/scheduler.js`

---

### Task 4.3: Implement Rule Proposal Expiration in Scheduler
**Priority:** Medium  
**Dependencies:** Task 2.7  
**Estimated Time:** 4-5 hours

**Description:**
Add automatic expiration handling for rule proposals that pass their voting deadline.

**Acceptance Criteria:**
- [ ] Scheduler checks expired proposals daily
- [ ] Calculates final vote counts
- [ ] Marks proposals as expired
- [ ] Logs expiration
- [ ] Integration tests written

**Files to Modify:**
- `server/modules/scheduler.js`

**Status Options:**
- `expired` - voting deadline passed
- `expired_no_participation` - no votes cast

---

### Task 4.4: Implement Safety Tracking Updates
**Priority:** Medium  
**Dependencies:** Task 2.8  
**Estimated Time:** 2-3 hours

**Description:**
Update safety tracking (failed proposals, last successful vote, etc.) when proposals complete.

**Acceptance Criteria:**
- [ ] Updates `lastSuccessfulVoteAt` on approval
- [ ] Updates `failedProposalsCount` on rejection
- [ ] Updates `lastFailedProposalAt` on rejection
- [ ] Updates `ruleChangesThisMonth` on approval
- [ ] Updates `lastRuleChangeAt` on approval
- [ ] Resets counters appropriately
- [ ] Integration tests written

**Files to Modify:**
- `server/routes/governance.js` (complete endpoint)
- `server/modules/safety-mechanisms.js`

---

## Phase 5: Testing & Refinement (Week 5)

### Task 5.1: Write Unit Tests for Permission Functions
**Priority:** High  
**Dependencies:** Task 1.3  
**Estimated Time:** 6-8 hours

**Description:**
Write comprehensive unit tests for all permission helper functions.

**Acceptance Criteria:**
- [ ] Tests for `canProposeRules()` (all scenarios)
- [ ] Tests for `canCreateDocuments()` (all scenarios)
- [ ] Tests for `canInitializeElections()` (all scenarios)
- [ ] Tests for `canInviteMembers()` (all scenarios)
- [ ] Tests for `canManageRuleProposals()` (all scenarios)
- [ ] Edge cases covered
- [ ] Bootstrap mode scenarios
- [ ] Recovery mode scenarios
- [ ] 80%+ code coverage

**Files to Create:**
- `tests/unit/permissions.test.js`

---

### Task 5.2: Write Unit Tests for Validation Functions
**Priority:** High  
**Dependencies:** Task 1.4  
**Estimated Time:** 6-8 hours

**Description:**
Write comprehensive unit tests for all validation functions.

**Acceptance Criteria:**
- [ ] Tests for `validateGovernanceRuleValue()` (all rule types)
- [ ] Tests for `checkRuleDependencies()` (all dependencies)
- [ ] Tests for `checkDeadlockConditions()`
- [ ] Tests for `checkDuplicateProposal()` (including cooldown)
- [ ] Edge cases covered
- [ ] 80%+ code coverage

**Files to Create:**
- `tests/unit/rule-validation.test.js`

---

### Task 5.3: Write Integration Tests for API Endpoints
**Priority:** High  
**Dependencies:** Phase 2 tasks  
**Estimated Time:** 8-10 hours

**Description:**
Write integration tests for all new and modified API endpoints.

**Acceptance Criteria:**
- [ ] Tests for get permissions endpoint
- [ ] Tests for bootstrap status endpoint
- [ ] Tests for complete bootstrap endpoint
- [ ] Tests for validate rule change endpoint
- [ ] Tests for rule history endpoint
- [ ] Tests for updated create proposal endpoint
- [ ] Tests for updated start voting endpoint
- [ ] Tests for updated complete proposal endpoint
- [ ] All scenarios covered
- [ ] Error cases tested

**Files to Create/Modify:**
- `tests/integration/governance-democratic.test.js` (new)
- `tests/integration/governance.integration.test.js` (update)

---

### Task 5.4: Write End-to-End Tests
**Priority:** Medium  
**Dependencies:** Phase 3 tasks  
**Estimated Time:** 6-8 hours

**Description:**
Write end-to-end tests for complete user flows.

**Acceptance Criteria:**
- [ ] Test: New organization bootstrap flow
- [ ] Test: Rule proposal creation and voting
- [ ] Test: Permission changes after rule updates
- [ ] Test: Recovery mode activation and exit
- [ ] Test: Bootstrap auto-completion
- [ ] All critical flows covered

**Files to Create:**
- `tests/e2e/democratic-constitution.test.js`

---

### Task 5.5: Performance Testing
**Priority:** Medium  
**Dependencies:** Task 2.12  
**Estimated Time:** 4-5 hours

**Description:**
Test performance of permission calculations and API endpoints.

**Acceptance Criteria:**
- [ ] Permission calculation latency < 50ms
- [ ] API endpoint response time < 200ms
- [ ] Cache hit rate > 80%
- [ ] Load test with 1000+ organizations
- [ ] Performance benchmarks documented

**Files to Create:**
- `tests/performance/permissions.test.js`

---

## Phase 6: Documentation & Polish (Week 6)

### Task 6.1: Write User Documentation
**Priority:** Medium  
**Dependencies:** Phase 3 tasks  
**Estimated Time:** 6-8 hours

**Description:**
Create user-facing documentation for democratic constitution features.

**Acceptance Criteria:**
- [ ] Getting started guide
- [ ] Bootstrap mode explanation
- [ ] Rule proposal tutorial
- [ ] Permission system explanation
- [ ] Recovery mode guide
- [ ] FAQ section
- [ ] Examples and best practices

**Files to Create:**
- `docs/user/DEMOCRATIC_GOVERNANCE_GUIDE.md`
- `docs/user/BOOTSTRAP_MODE_GUIDE.md`
- `docs/user/RULE_PROPOSALS_GUIDE.md`

---

### Task 6.2: Write Admin Documentation
**Priority:** Medium  
**Dependencies:** Phase 4 tasks  
**Estimated Time:** 4-5 hours

**Description:**
Create admin-facing documentation for managing democratic constitution features.

**Acceptance Criteria:**
- [ ] Recovery mode procedures
- [ ] Bootstrap management
- [ ] Emergency interventions
- [ ] Monitoring and alerts
- [ ] Troubleshooting guide

**Files to Create:**
- `docs/admin/DEMOCRATIC_GOVERNANCE_ADMIN.md`

---

### Task 6.3: Update API Documentation
**Priority:** Medium  
**Dependencies:** Phase 2 tasks  
**Estimated Time:** 3-4 hours

**Description:**
Update API documentation with new endpoints and changes.

**Acceptance Criteria:**
- [ ] All new endpoints documented
- [ ] Request/response formats documented
- [ ] Error codes documented
- [ ] Examples provided
- [ ] Authentication requirements documented

**Files to Modify:**
- `docs/api/GOVERNANCE_API.md`

---

### Task 6.4: Code Review and Refactoring
**Priority:** Medium  
**Dependencies:** All previous tasks  
**Estimated Time:** 8-10 hours

**Description:**
Review all code, refactor as needed, ensure consistency.

**Acceptance Criteria:**
- [ ] Code reviewed by team
- [ ] Refactored for consistency
- [ ] Code comments added
- [ ] TypeScript types complete
- [ ] No linter errors
- [ ] Code style consistent

---

## Implementation Order Summary

### Week 1: Foundation
- Task 1.1: Database Migration
- Task 1.2: TypeScript Types
- Task 1.3: Permission Functions
- Task 1.4: Validation Functions
- Task 1.5: Safety Mechanisms

### Week 2: Backend API
- Task 2.1: Get Permissions Endpoint
- Task 2.2: Bootstrap Status Endpoint
- Task 2.3: Complete Bootstrap Endpoint
- Task 2.4: Validate Rule Change Endpoint
- Task 2.5: Rule History Endpoint
- Task 2.6: Update Create Proposal
- Task 2.7: Update Start Voting
- Task 2.8: Update Complete Proposal
- Task 2.9-2.11: Update Other Endpoints
- Task 2.12: Permission Caching

### Week 3: Frontend
- Task 3.1: Update Permission Hook
- Task 3.2: Bootstrap Banner
- Task 3.3: Bootstrap Dialog
- Task 3.4: Recovery Banner
- Task 3.5: Update Proposal Dialog
- Task 3.6: Rule History View
- Task 3.7: Update Voting Interface
- Task 3.8: Update Org Management

### Week 4: Safety & Scheduler
- Task 4.1: Recovery Mode Check
- Task 4.2: Bootstrap Auto-Completion
- Task 4.3: Proposal Expiration
- Task 4.4: Safety Tracking

### Week 5: Testing
- Task 5.1: Unit Tests (Permissions)
- Task 5.2: Unit Tests (Validation)
- Task 5.3: Integration Tests
- Task 5.4: E2E Tests
- Task 5.5: Performance Tests

### Week 6: Documentation
- Task 6.1: User Documentation
- Task 6.2: Admin Documentation
- Task 6.3: API Documentation
- Task 6.4: Code Review

---

## Dependencies Graph

```
Task 1.1 (Migration)
  ↓
Task 1.2 (Types)
  ↓
Task 1.3 (Permissions) → Task 2.1, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11
  ↓
Task 1.4 (Validation) → Task 2.4, 2.6
  ↓
Task 1.5 (Safety) → Task 2.8, 4.1

Task 2.1 → Task 3.1
Task 2.2 → Task 3.2, 4.2
Task 2.3 → Task 3.3
Task 2.4 → Task 3.5
Task 2.5 → Task 3.6

Task 3.1 → Task 3.7, 3.8
Task 3.2 → Task 3.7

All Tasks → Task 5.x (Testing)
All Tasks → Task 6.x (Documentation)
```

---

## Estimated Total Effort

- **Phase 1 (Foundation):** 26-35 hours
- **Phase 2 (Backend API):** 35-45 hours
- **Phase 3 (Frontend):** 31-40 hours
- **Phase 4 (Safety):** 13-17 hours
- **Phase 5 (Testing):** 30-39 hours
- **Phase 6 (Documentation):** 21-27 hours

**Total: 156-203 hours (~4-5 weeks for one developer, or 2-3 weeks for two developers)**

---

This task breakdown provides a clear roadmap for implementation with specific, actionable tasks, dependencies, and acceptance criteria.


