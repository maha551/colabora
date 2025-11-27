# Detailed Implementation Specifications: Democratic Constitution System

## Table of Contents

1. [Database Schema Specifications](#database-schema-specifications)
2. [API Endpoint Specifications](#api-endpoint-specifications)
3. [Permission System Specifications](#permission-system-specifications)
4. [Frontend Component Specifications](#frontend-component-specifications)
5. [Safety Mechanism Specifications](#safety-mechanism-specifications)
6. [Data Flow Specifications](#data-flow-specifications)
7. [State Management Specifications](#state-management-specifications)
8. [Error Handling Specifications](#error-handling-specifications)

---

## Database Schema Specifications

### 1.1 Organization Governance Rules Table Updates

**File:** `server/migrations/democratic-constitution-migration.js`

**SQL Changes:**
```sql
-- Add member permission flags
ALTER TABLE organization_governance_rules ADD COLUMN members_can_propose_rules BOOLEAN DEFAULT 0;
ALTER TABLE organization_governance_rules ADD COLUMN members_can_propose_rules_threshold REAL DEFAULT 0.5;
ALTER TABLE organization_governance_rules ADD COLUMN members_can_create_documents BOOLEAN DEFAULT 0;
ALTER TABLE organization_governance_rules ADD COLUMN members_can_create_documents_threshold REAL DEFAULT 0.5;
ALTER TABLE organization_governance_rules ADD COLUMN members_can_initialize_elections BOOLEAN DEFAULT 0;
ALTER TABLE organization_governance_rules ADD COLUMN members_can_initialize_elections_threshold REAL DEFAULT 0.5;
ALTER TABLE organization_governance_rules ADD COLUMN members_can_invite_members BOOLEAN DEFAULT 0;
ALTER TABLE organization_governance_rules ADD COLUMN members_can_invite_members_threshold REAL DEFAULT 0.5;
ALTER TABLE organization_governance_rules ADD COLUMN members_can_manage_rule_proposals BOOLEAN DEFAULT 0;
ALTER TABLE organization_governance_rules ADD COLUMN members_can_manage_rule_proposals_threshold REAL DEFAULT 0.5;

-- Minimum safeguards (system-enforced, cannot be changed by voting)
ALTER TABLE organization_governance_rules ADD COLUMN minimum_quorum_percentage REAL DEFAULT 0.1;
ALTER TABLE organization_governance_rules ADD COLUMN minimum_approval_threshold REAL DEFAULT 0.5;
ALTER TABLE organization_governance_rules ADD COLUMN minimum_voting_period_hours INTEGER DEFAULT 24;

-- Bootstrap mode
ALTER TABLE organization_governance_rules ADD COLUMN bootstrap_mode BOOLEAN DEFAULT 1;
ALTER TABLE organization_governance_rules ADD COLUMN bootstrap_completed_at DATETIME;

-- Recovery mode
ALTER TABLE organization_governance_rules ADD COLUMN recovery_mode BOOLEAN DEFAULT 0;
ALTER TABLE organization_governance_rules ADD COLUMN recovery_mode_entered_at DATETIME;
ALTER TABLE organization_governance_rules ADD COLUMN recovery_mode_reason TEXT;

-- Safety tracking
ALTER TABLE organization_governance_rules ADD COLUMN last_successful_vote_at DATETIME;
ALTER TABLE organization_governance_rules ADD COLUMN failed_proposals_count INTEGER DEFAULT 0;
ALTER TABLE organization_governance_rules ADD COLUMN last_failed_proposal_at DATETIME;
ALTER TABLE organization_governance_rules ADD COLUMN rule_changes_this_month INTEGER DEFAULT 0;
ALTER TABLE organization_governance_rules ADD COLUMN last_rule_change_at DATETIME;
```

**Note:** SQLite doesn't support ALTER TABLE ADD COLUMN easily. Use application-level defaults or recreate table.

**Migration Script Structure:**
```javascript
// server/migrations/democratic-constitution-migration.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = config.DATABASE_URL || path.join(__dirname, '../../colabora.db');
const db = new sqlite3.Database(dbPath);

const migrations = [
  // Check if columns exist, add if not
  // Handle existing organizations
  // Set safe defaults
];

// Implementation details...
```

### 1.2 Governance Rule Proposals Table Updates

**SQL Changes:**
```sql
-- Add rule snapshot for active votes
ALTER TABLE governance_rule_proposals ADD COLUMN snapshot_rules TEXT; -- JSON of rules when voting started

-- Add cooldown tracking
ALTER TABLE governance_rule_proposals ADD COLUMN cooldown_until DATETIME; -- When this rule can be changed again
```

### 1.3 New Table: Governance Rule History

**SQL:**
```sql
CREATE TABLE IF NOT EXISTS governance_rule_history (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  rule_field TEXT NOT NULL,
  old_value TEXT, -- JSON string
  new_value TEXT, -- JSON string
  changed_by_proposal_id TEXT,
  changed_by_user_id TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_proposal_id) REFERENCES governance_rule_proposals(id),
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_rule_history_org_field ON governance_rule_history(organization_id, rule_field, changed_at);
CREATE INDEX IF NOT EXISTS idx_rule_history_proposal ON governance_rule_history(changed_by_proposal_id);
```

### 1.4 Migration Data Updates

**For Existing Organizations:**
```javascript
// Set bootstrap_mode = 0 (already completed)
// Set all member permission flags = 0 (maintain current behavior)
// Set minimum safeguards to defaults
// Set bootstrap_completed_at = created_at (or NULL if very new)

db.run(`
  UPDATE organization_governance_rules
  SET 
    bootstrap_mode = 0,
    bootstrap_completed_at = (
      SELECT created_at FROM organizations 
      WHERE organizations.id = organization_governance_rules.organization_id
    ),
    members_can_propose_rules = 0,
    members_can_create_documents = 0,
    members_can_initialize_elections = 0,
    members_can_invite_members = 0,
    members_can_manage_rule_proposals = 0,
    minimum_quorum_percentage = 0.1,
    minimum_approval_threshold = 0.5,
    minimum_voting_period_hours = 24
  WHERE bootstrap_mode IS NULL
`);
```

---

## API Endpoint Specifications

### 2.1 Get Organization Permissions

**Endpoint:** `GET /api/governance/:organizationId/permissions`

**Authentication:** Required (`requireAuth`)

**Response:**
```typescript
{
  success: true,
  permissions: {
    canProposeRules: boolean,
    canCreateDocuments: boolean,
    canInitializeElections: boolean,
    canInviteMembers: boolean,
    canManageRuleProposals: boolean,
    canVoteInElections: boolean,
    canViewAnalytics: boolean,
    canExportData: boolean,
    canManageOrganization: boolean
  },
  context: {
    isRepresentative: boolean,
    isActiveMember: boolean,
    isAdmin: boolean,
    bootstrapMode: boolean,
    recoveryMode: boolean
  }
}
```

**Implementation:**
```javascript
// server/routes/governance.js
router.get('/:organizationId/permissions', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  try {
    const rules = await getGovernanceRules(db, organizationId);
    const isRep = await isRepresentative(db, userId, organizationId);
    const isMember = await isActiveMember(db, userId, organizationId);
    const isAdmin = req.user.role === 'admin';

    const permissions = {
      canProposeRules: await canProposeRules(db, userId, organizationId, rules),
      canCreateDocuments: await canCreateDocuments(db, userId, organizationId, rules),
      canInitializeElections: await canInitializeElections(db, userId, organizationId, rules),
      canInviteMembers: await canInviteMembers(db, userId, organizationId, rules),
      canManageRuleProposals: await canManageRuleProposals(db, userId, organizationId, rules),
      canVoteInElections: isMember || isRep || isAdmin,
      canViewAnalytics: isMember || isRep || isAdmin,
      canExportData: isRep || isAdmin,
      canManageOrganization: isRep || isAdmin
    };

    res.json({
      success: true,
      permissions,
      context: {
        isRepresentative: isRep,
        isActiveMember: isMember,
        isAdmin,
        bootstrapMode: rules?.bootstrapMode ?? false,
        recoveryMode: rules?.recoveryMode ?? false
      }
    });
  } catch (error) {
    logger.error('Error fetching permissions', { error: error.message, organizationId, userId });
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});
```

### 2.2 Get Bootstrap Status

**Endpoint:** `GET /api/governance/:organizationId/bootstrap-status`

**Response:**
```typescript
{
  success: true,
  bootstrap: {
    mode: boolean,
    completedAt: string | null,
    progress: {
      completed: number, // 0-3
      total: number, // 3
      checklist: [
        { rule: 'membersCanProposeRules', completed: boolean, proposalId?: string },
        { rule: 'membersCanCreateDocuments', completed: boolean, proposalId?: string },
        { rule: 'defaultQuorumPercentage', completed: boolean, proposalId?: string }
      ]
    },
    canComplete: boolean, // Representatives can manually complete
    daysRemaining: number | null // Days until auto-completion
  }
}
```

**Implementation:**
```javascript
router.get('/:organizationId/bootstrap-status', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;

  try {
    const rules = await getGovernanceRules(db, organizationId);
    const isBootstrap = rules?.bootstrapMode ?? true;

    // Check for core rule proposals
    const coreRules = ['membersCanProposeRules', 'membersCanCreateDocuments', 'defaultQuorumPercentage'];
    const checklist = await Promise.all(coreRules.map(async (rule) => {
      const proposal = await new Promise((resolve, reject) => {
        db.get(`
          SELECT id, status FROM governance_rule_proposals
          WHERE organization_id = ? 
            AND current_rule_field = ?
            AND status IN ('approved', 'active')
          ORDER BY created_at DESC
          LIMIT 1
        `, [organizationId, rule], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      return {
        rule,
        completed: !!proposal && proposal.status === 'approved',
        proposalId: proposal?.id
      };
    }));

    const completed = checklist.filter(c => c.completed).length;
    const isRep = await isRepresentative(db, req.user.id, organizationId);

    // Calculate days until auto-completion
    let daysRemaining = null;
    if (isBootstrap && !rules?.bootstrapCompletedAt) {
      const org = await new Promise((resolve, reject) => {
        db.get('SELECT created_at FROM organizations WHERE id = ?', [organizationId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      if (org) {
        const created = new Date(org.created_at);
        const daysSince = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
        daysRemaining = Math.max(0, 90 - daysSince);
      }
    }

    res.json({
      success: true,
      bootstrap: {
        mode: isBootstrap,
        completedAt: rules?.bootstrapCompletedAt || null,
        progress: {
          completed,
          total: 3,
          checklist
        },
        canComplete: isRep || req.user.role === 'admin',
        daysRemaining: daysRemaining ? Math.ceil(daysRemaining) : null
      }
    });
  } catch (error) {
    logger.error('Error fetching bootstrap status', { error: error.message, organizationId });
    res.status(500).json({ error: 'Failed to fetch bootstrap status' });
  }
});
```

### 2.3 Complete Bootstrap

**Endpoint:** `POST /api/governance/:organizationId/bootstrap/complete`

**Request Body:**
```typescript
{
  confirm: boolean // Must be true
}
```

**Response:**
```typescript
{
  success: true,
  message: string,
  bootstrap: {
    mode: false,
    completedAt: string
  }
}
```

**Implementation:**
```javascript
router.post('/:organizationId/bootstrap/complete', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { confirm } = req.body;

  if (!confirm) {
    return res.status(400).json({ error: 'Confirmation required' });
  }

  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only representatives can complete bootstrap' });
    }

    const rules = await getGovernanceRules(db, organizationId);
    if (!rules?.bootstrapMode) {
      return res.status(400).json({ error: 'Organization is not in bootstrap mode' });
    }

    const now = new Date().toISOString();

    db.run(`
      UPDATE organization_governance_rules
      SET 
        bootstrap_mode = 0,
        bootstrap_completed_at = ?,
        updated_at = ?
      WHERE organization_id = ?
    `, [now, now, organizationId], function(err) {
      if (err) {
        logger.error('Error completing bootstrap', { error: err.message, organizationId });
        return res.status(500).json({ error: 'Failed to complete bootstrap' });
      }

      logAudit(db, organizationId, 'bootstrap_completed', userId, null, {
        completedAt: now
      }, req);

      res.json({
        success: true,
        message: 'Bootstrap completed successfully',
        bootstrap: {
          mode: false,
          completedAt: now
        }
      });
    });
  } catch (error) {
    logger.error('Error completing bootstrap', { error: error.message, organizationId });
    res.status(500).json({ error: 'Failed to complete bootstrap' });
  }
});
```

### 2.4 Validate Rule Change

**Endpoint:** `POST /api/governance/:organizationId/validate-rule-change`

**Request Body:**
```typescript
{
  ruleField: string,
  proposedValue: any
}
```

**Response:**
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

**Implementation:**
```javascript
router.post('/:organizationId/validate-rule-change', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const { ruleField, proposedValue } = req.body;

  try {
    const errors = [];
    const warnings = [];
    const conflicts = [];

    // 1. Validate value format
    const validation = validateGovernanceRuleValue(ruleField, proposedValue);
    if (!validation.valid) {
      errors.push(validation.error);
    }

    // 2. Check for duplicates
    const existing = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, status, created_at FROM governance_rule_proposals
        WHERE organization_id = ? 
          AND current_rule_field = ?
          AND status IN ('draft', 'active')
        ORDER BY created_at DESC
        LIMIT 1
      `, [organizationId, ruleField], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existing) {
      conflicts.push({
        type: 'duplicate',
        message: `A ${existing.status} proposal for this rule already exists`,
        details: { proposalId: existing.id, status: existing.status }
      });
    }

    // 3. Check cooldown
    const recent = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, implemented_at FROM governance_rule_proposals
        WHERE organization_id = ?
          AND current_rule_field = ?
          AND status = 'approved'
          AND implemented_at IS NOT NULL
        ORDER BY implemented_at DESC
        LIMIT 1
      `, [organizationId, ruleField], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (recent) {
      const implemented = new Date(recent.implemented_at);
      const daysSince = (Date.now() - implemented.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        warnings.push(`This rule was changed ${Math.floor(daysSince)} days ago. Consider waiting for the 7-day cooldown.`);
      }
    }

    // 4. Check dependencies
    const dependencyCheck = await checkRuleDependencies(db, organizationId, ruleField, proposedValue);
    if (!dependencyCheck.valid) {
      conflicts.push({
        type: 'dependency',
        message: dependencyCheck.error,
        details: dependencyCheck.details
      });
    }

    // 5. Check for deadlock conditions
    const deadlockCheck = checkDeadlockConditions(ruleField, proposedValue);
    if (deadlockCheck.isDeadlock) {
      conflicts.push({
        type: 'deadlock',
        message: deadlockCheck.message,
        details: deadlockCheck.details
      });
    }

    res.json({
      valid: errors.length === 0 && conflicts.filter(c => c.type !== 'cooldown').length === 0,
      errors,
      warnings,
      conflicts
    });
  } catch (error) {
    logger.error('Error validating rule change', { error: error.message, organizationId });
    res.status(500).json({ error: 'Failed to validate rule change' });
  }
});
```

### 2.5 Get Rule History

**Endpoint:** `GET /api/governance/:organizationId/rule-history`

**Query Parameters:**
- `ruleField?: string` - Filter by specific rule
- `limit?: number` - Default 50, max 100
- `offset?: number` - For pagination

**Response:**
```typescript
{
  success: true,
  history: Array<{
    id: string,
    ruleField: string,
    oldValue: any,
    newValue: any,
    changedBy: {
      userId: string,
      userName: string,
      proposalId?: string
    },
    changedAt: string
  }>,
  pagination: {
    total: number,
    limit: number,
    offset: number,
    hasMore: boolean
  }
}
```

### 2.6 Modified: Create Rule Proposal

**Endpoint:** `POST /api/governance/:organizationId/rule-proposals`

**Changes:**
1. Check dynamic permission (not just `isRepresentative`)
2. Validate rule change before creating
3. Check for duplicates (including cooldown)
4. Check bootstrap mode
5. Store validation results

**Request Body:** (unchanged)
```typescript
{
  title: string,
  description?: string,
  ruleField: string,
  proposedValue: any,
  options?: Array<{
    optionTitle: string,
    optionDescription?: string,
    proposedValue: any
  }>
}
```

**Enhanced Implementation:**
```javascript
router.post('/:organizationId/rule-proposals', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { title, description, ruleField, proposedValue, options } = req.body;

  try {
    // 1. Check dynamic permission
    const rules = await getGovernanceRules(db, organizationId);
    const canPropose = await canProposeRules(db, userId, organizationId, rules);
    if (!canPropose) {
      return res.status(403).json({ 
        error: 'You do not have permission to create rule proposals',
        details: 'Check your organization\'s governance rules to see who can propose changes'
      });
    }

    // 2. Validate rule change
    const validation = await validateRuleChange(db, organizationId, ruleField, proposedValue);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid rule change',
        details: validation.errors,
        warnings: validation.warnings,
        conflicts: validation.conflicts
      });
    }

    // 3. Check for duplicates (including cooldown)
    const duplicate = await checkDuplicateProposal(db, organizationId, ruleField);
    if (duplicate.exists) {
      return res.status(409).json({
        error: duplicate.message,
        details: duplicate.details
      });
    }

    // 4. Continue with existing creation logic...
    // (rest of implementation)
  } catch (error) {
    // error handling
  }
});
```

### 2.7 Modified: Start Rule Proposal Voting

**Endpoint:** `POST /api/governance/:organizationId/rule-proposals/:proposalId/start-voting`

**Changes:**
1. Check dynamic permission (`canManageRuleProposals`)
2. Store rule snapshot when voting starts
3. Enforce minimum voting period

**Enhanced Implementation:**
```javascript
router.post('/:organizationId/rule-proposals/:proposalId/start-voting', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, proposalId } = req.params;
  const userId = req.user.id;

  try {
    // 1. Check dynamic permission
    const rules = await getGovernanceRules(db, organizationId);
    const canManage = await canManageRuleProposals(db, userId, organizationId, rules);
    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to start voting' });
    }

    // 2. Get proposal
    const proposal = await getProposal(db, proposalId, organizationId);
    if (!proposal || proposal.status !== 'draft') {
      return res.status(404).json({ error: 'Proposal not found or not in draft status' });
    }

    // 3. Get current rules and create snapshot
    const currentRules = await getGovernanceRules(db, organizationId);
    const snapshotRules = JSON.stringify(currentRules);

    // 4. Calculate voting period (enforce minimum)
    const minPeriod = rules?.minimumVotingPeriodHours || 24;
    const defaultPeriod = 14 * 24; // 14 days default
    const votingPeriodHours = Math.max(minPeriod, defaultPeriod);

    const now = new Date();
    const votingEnd = new Date(now.getTime() + votingPeriodHours * 60 * 60 * 1000);

    // 5. Update proposal with snapshot and voting period
    db.run(`
      UPDATE governance_rule_proposals SET
        status = 'active',
        voting_starts_at = ?,
        voting_ends_at = ?,
        snapshot_rules = ?,
        total_voters = ?,
        updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [
      now.toISOString(),
      votingEnd.toISOString(),
      snapshotRules,
      totalVoters,
      now.toISOString(),
      proposalId,
      organizationId
    ], function(err) {
      // handle response
    });
  } catch (error) {
    // error handling
  }
});
```

### 2.8 Modified: Complete Rule Proposal

**Endpoint:** `POST /api/governance/:organizationId/rule-proposals/:proposalId/complete`

**Changes:**
1. Use snapshot rules for approval calculation (not current rules)
2. Check minimum safeguards (quorum, approval threshold)
3. Check rule dependencies before applying
4. Log to rule history
5. Update safety tracking

**Enhanced Implementation:**
```javascript
router.post('/:organizationId/rule-proposals/:proposalId/complete', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, proposalId } = req.params;
  const userId = req.user.id;

  try {
    // 1. Check permission
    const rules = await getGovernanceRules(db, organizationId);
    const canManage = await canManageRuleProposals(db, userId, organizationId, rules);
    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to complete voting' });
    }

    // 2. Get proposal with snapshot
    const proposal = await getProposal(db, proposalId, organizationId);
    if (!proposal || proposal.status !== 'active') {
      return res.status(404).json({ error: 'Proposal not found or not active' });
    }

    // 3. Use snapshot rules for calculation (not current rules)
    const snapshotRules = proposal.snapshot_rules 
      ? JSON.parse(proposal.snapshot_rules)
      : await getGovernanceRules(db, organizationId);

    // 4. Calculate approval with snapshot rules
    const totalVotes = proposal.votes_yes + proposal.votes_no + proposal.votes_abstain;
    const approvalRate = totalVotes > 0 ? (proposal.votes_yes / totalVotes) * 100 : 0;
    const threshold = proposal.threshold_percentage || 75.0;

    // 5. Check minimum safeguards
    const minQuorum = rules?.minimumQuorumPercentage || 0.1;
    const minApproval = rules?.minimumApprovalThreshold || 0.5;
    const minVotesRequired = Math.ceil(proposal.total_voters * minQuorum);
    const quorumMet = totalVotes >= minVotesRequired;
    const approvalMet = (approvalRate / 100) >= minApproval;

    if (!quorumMet) {
      return res.status(400).json({
        error: 'Minimum quorum not met',
        details: `Required: ${minVotesRequired} votes (${minQuorum * 100}%), Actual: ${totalVotes} votes`,
        quorumMet: false,
        minVotesRequired,
        actualVotes: totalVotes
      });
    }

    if (!approvalMet) {
      return res.status(400).json({
        error: 'Minimum approval threshold not met',
        details: `Required: ${minApproval * 100}%, Actual: ${approvalRate.toFixed(1)}%`,
        approvalMet: false,
        minApproval: minApproval * 100,
        actualApproval: approvalRate
      });
    }

    // 6. Check if approved (using snapshot threshold)
    const approved = approvalRate >= threshold;

    if (approved) {
      // 7. Validate dependencies before applying
      const proposedValue = JSON.parse(proposal.proposed_rule_value);
      const dependencyCheck = await checkRuleDependencies(db, organizationId, proposal.current_rule_field, proposedValue);
      if (!dependencyCheck.valid) {
        return res.status(400).json({
          error: 'Rule change would create invalid state',
          details: dependencyCheck.error
        });
      }

      // 8. Apply rule change
      await applyRuleChange(db, organizationId, proposal.current_rule_field, proposedValue);

      // 9. Log to history
      await logRuleHistory(db, organizationId, proposal.current_rule_field, proposal.current_rule_value, proposedValue, proposalId, userId);

      // 10. Update safety tracking
      await updateSafetyTracking(db, organizationId, true);
    } else {
      await updateSafetyTracking(db, organizationId, false);
    }

    // 11. Update proposal status
    // ... (rest of implementation)
  } catch (error) {
    // error handling
  }
});
```

---

## Permission System Specifications

### 3.1 Permission Helper Functions

**File:** `server/routes/governance.js` (or new file: `server/modules/permissions.js`)

**Function: `canProposeRules`**
```javascript
async function canProposeRules(db, userId, organizationId, rules) {
  // System admins always can
  if (req.user.role === 'admin') return true;

  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);

  // Bootstrap mode: members can propose
  if (rules?.bootstrapMode && isMember) return true;

  // Recovery mode: all active members can propose
  if (rules?.recoveryMode && isMember) return true;

  // Normal mode: check rule
  if (rules?.membersCanProposeRules && isMember) return true;
  if (isRep) return true;

  return false;
}
```

**Function: `canCreateDocuments`**
```javascript
async function canCreateDocuments(db, userId, organizationId, rules) {
  if (req.user.role === 'admin') return true;

  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);

  // Bootstrap mode: members can create
  if (rules?.bootstrapMode && isMember) return true;

  // Recovery mode: all active members can create
  if (rules?.recoveryMode && isMember) return true;

  // Normal mode: check rule
  if (rules?.membersCanCreateDocuments && isMember) return true;
  if (isRep) return true;

  return false;
}
```

**Function: `canInitializeElections`**
```javascript
async function canInitializeElections(db, userId, organizationId, rules) {
  if (req.user.role === 'admin') return true;

  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);

  // Bootstrap mode: only representatives
  if (rules?.bootstrapMode) return isRep;

  // Recovery mode: all active members can initialize
  if (rules?.recoveryMode && isMember) return true;

  // Normal mode: check rule
  if (rules?.membersCanInitializeElections && isMember) return true;
  if (isRep) return true;

  return false;
}
```

**Function: `canInviteMembers`**
```javascript
async function canInviteMembers(db, userId, organizationId, rules) {
  if (req.user.role === 'admin') return true;

  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);

  // Check if representatives can invite (existing rule)
  if (!rules?.representativeCanInviteMembers) return false;

  // Bootstrap mode: only representatives
  if (rules?.bootstrapMode) return isRep;

  // Recovery mode: all active members can invite
  if (rules?.recoveryMode && isMember) return true;

  // Normal mode: check rule
  if (rules?.membersCanInviteMembers && isMember) return true;
  if (isRep) return true;

  return false;
}
```

**Function: `canManageRuleProposals`**
```javascript
async function canManageRuleProposals(db, userId, organizationId, rules) {
  if (req.user.role === 'admin') return true;

  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);

  // Bootstrap mode: only representatives
  if (rules?.bootstrapMode) return isRep;

  // Recovery mode: all active members can manage
  if (rules?.recoveryMode && isMember) return true;

  // Normal mode: check rule
  if (rules?.membersCanManageRuleProposals && isMember) return true;
  if (isRep) return true;

  return false;
}
```

### 3.2 Permission Caching

**Implementation:**
```javascript
// Simple in-memory cache with TTL
const permissionCache = new Map();

async function getCachedPermission(db, userId, organizationId, permissionType) {
  const cacheKey = `${userId}:${organizationId}:${permissionType}`;
  const cached = permissionCache.get(cacheKey);
  
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }

  const rules = await getGovernanceRules(db, organizationId);
  let value;
  
  switch (permissionType) {
    case 'proposeRules':
      value = await canProposeRules(db, userId, organizationId, rules);
      break;
    case 'createDocuments':
      value = await canCreateDocuments(db, userId, organizationId, rules);
      break;
    // ... other permissions
  }

  permissionCache.set(cacheKey, {
    value,
    expires: Date.now() + 60000 // 1 minute TTL
  });

  return value;
}

// Invalidate cache on rule changes
function invalidatePermissionCache(organizationId) {
  for (const [key, value] of permissionCache.entries()) {
    if (key.includes(`:${organizationId}:`)) {
      permissionCache.delete(key);
    }
  }
}
```

---

## Frontend Component Specifications

### 4.1 BootstrapModeBanner Component

**File:** `client/src/components/governance/BootstrapModeBanner.tsx`

**Props:**
```typescript
interface BootstrapModeBannerProps {
  organization: Organization;
  bootstrapStatus: {
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
  };
  onComplete?: () => void;
}
```

**Implementation:**
```typescript
export function BootstrapModeBanner({
  organization,
  bootstrapStatus,
  onComplete
}: BootstrapModeBannerProps) {
  if (!bootstrapStatus.mode) return null;

  const progressPercent = (bootstrapStatus.progress.completed / bootstrapStatus.progress.total) * 100;

  return (
    <Alert className="mb-4 border-blue-500 bg-blue-50">
      <AlertTriangle className="h-4 w-4 text-blue-600" />
      <AlertDescription>
        <div className="space-y-3">
          <div>
            <strong className="text-blue-900">Bootstrap Mode Active</strong>
            <p className="text-sm text-blue-700 mt-1">
              Your organization is setting up its governance constitution. 
              Vote on core rules to complete the bootstrap process.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-700">Progress</span>
              <span className="text-blue-900 font-medium">
                {bootstrapStatus.progress.completed} of {bootstrapStatus.progress.total} core rules
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <div className="font-medium text-blue-900">Core Rules Checklist:</div>
            {bootstrapStatus.progress.checklist.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                {item.completed ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-400" />
                )}
                <span className={item.completed ? 'text-green-700' : 'text-gray-600'}>
                  {getRuleLabel(item.rule)}
                </span>
              </div>
            ))}
          </div>

          {bootstrapStatus.daysRemaining !== null && (
            <div className="text-sm text-blue-600">
              Auto-completion in {bootstrapStatus.daysRemaining} days
            </div>
          )}

          {bootstrapStatus.canComplete && (
            <Button 
              onClick={onComplete}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              Complete Bootstrap Now
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

### 4.2 Updated useOrganizationPermissions Hook

**File:** `client/src/hooks/useOrganizationPermissions.ts`

**Changes:**
```typescript
export function useOrganizationPermissions(
  user: User,
  organization: Organization,
  governanceRules: OrganizationGovernanceRules | null
): OrganizationPermissions {
  const isRepresentative = organization.representatives?.includes(user.id) ?? false;
  const isActiveMember = organization.members?.some(m => m.userId === user.id && m.status === 'active') ?? false;
  const isAdmin = user.role === 'admin';

  // Bootstrap mode check
  const isBootstrap = governanceRules?.bootstrapMode ?? true;
  const isRecovery = governanceRules?.recoveryMode ?? false;

  // Dynamic permissions based on governance rules
  const canProposeRules = isAdmin ||
    (isBootstrap && isActiveMember) ||
    (isRecovery && isActiveMember) ||
    (governanceRules?.membersCanProposeRules && isActiveMember) ||
    isRepresentative;

  const canCreateDocuments = isAdmin ||
    (isBootstrap && isActiveMember) ||
    (isRecovery && isActiveMember) ||
    (governanceRules?.membersCanCreateDocuments && isActiveMember) ||
    isRepresentative;

  const canInitializeElections = isAdmin ||
    (isBootstrap && isRepresentative) ||
    (isRecovery && isActiveMember) ||
    (governanceRules?.membersCanInitializeElections && isActiveMember) ||
    isRepresentative;

  const canInviteMembers = isAdmin ||
    (isBootstrap && isRepresentative) ||
    (isRecovery && isActiveMember) ||
    (governanceRules?.membersCanInviteMembers && isActiveMember && governanceRules?.representativeCanInviteMembers) ||
    (isRepresentative && governanceRules?.representativeCanInviteMembers);

  const canManageRuleProposals = isAdmin ||
    (isBootstrap && isRepresentative) ||
    (isRecovery && isActiveMember) ||
    (governanceRules?.membersCanManageRuleProposals && isActiveMember) ||
    isRepresentative;

  // ... rest of permissions

  return {
    isRepresentative,
    isActiveMember,
    canCreateDocuments,
    canViewAllDocuments: isRepresentative || isActiveMember || isAdmin,
    canInviteMembers,
    canManageMembers: isRepresentative || isAdmin,
    canViewMemberList: isActiveMember || isRepresentative || isAdmin,
    canCreateElections: canInitializeElections,
    canManageGovernanceRules: isRepresentative || isAdmin,
    canProposeRules,
    canVoteInElections: isActiveMember || isRepresentative || isAdmin,
    canViewAnalytics: isRepresentative || isActiveMember || isAdmin,
    canExportData: isRepresentative || isAdmin,
    canManageOrganization: isRepresentative || isAdmin,
    canDeleteOrganization: isAdmin
  };
}
```

### 4.3 Updated RuleProposalDialog Component

**File:** `client/src/components/governance/RuleProposalDialog.tsx`

**Changes:**
1. Add new rule fields to `availableRuleFields`
2. Add validation before submission
3. Show warnings for conflicts
4. Display bootstrap/recovery mode status

**New Fields to Add:**
```typescript
const availableRuleFields = [
  // ... existing fields
  { value: 'membersCanProposeRules', label: 'Members Can Propose Rules' },
  { value: 'membersCanCreateDocuments', label: 'Members Can Create Documents' },
  { value: 'membersCanInitializeElections', label: 'Members Can Initialize Elections' },
  { value: 'membersCanInviteMembers', label: 'Members Can Invite Members' },
  { value: 'membersCanManageRuleProposals', label: 'Members Can Manage Rule Proposals' }
];
```

**Enhanced Validation:**
```typescript
const handleCreateProposal = async () => {
  const errors = validateProposal();
  if (errors.length > 0) {
    toast.error(errors[0]);
    return;
  }

  // Pre-submission validation
  setValidating(true);
  try {
    const validation = await governanceApi.validateRuleChange(
      organization.id,
      proposalData.ruleField,
      proposalData.proposedValue
    );

    if (!validation.valid) {
      // Show errors and warnings
      if (validation.errors.length > 0) {
        toast.error(validation.errors[0]);
        return;
      }

      // Show warnings but allow submission
      if (validation.warnings.length > 0) {
        const proceed = confirm(
          `Warning: ${validation.warnings[0]}\n\nDo you want to proceed?`
        );
        if (!proceed) return;
      }

      // Show conflicts but allow submission with confirmation
      if (validation.conflicts.length > 0) {
        const conflict = validation.conflicts[0];
        const proceed = confirm(
          `Conflict: ${conflict.message}\n\nDo you want to proceed anyway?`
        );
        if (!proceed) return;
      }
    }

    // Proceed with creation
    await governanceApi.ruleProposalsApi.createRuleProposal(organization.id, {
      title: proposalData.title.trim(),
      description: proposalData.description.trim(),
      ruleField: proposalData.ruleField,
      proposedValue: proposalData.proposedValue,
      ...(proposalData.useOptions && { options: proposalData.options })
    });

    toast.success('Rule change proposal created successfully');
    onSuccess?.();
    onOpenChange(false);
  } catch (error: any) {
    console.error('Failed to create rule proposal:', error);
    if (error.status === 409) {
      toast.error(error.data?.details || 'A proposal for this rule already exists');
    } else {
      toast.error(error.message || 'Failed to create rule proposal');
    }
  } finally {
    setValidating(false);
  }
};
```

---

## Safety Mechanism Specifications

### 5.1 Dynamic Quorum Calculation

**File:** `server/modules/safety-mechanisms.js`

**Function:**
```javascript
function calculateMinimumQuorum(activeMemberCount) {
  if (activeMemberCount <= 5) {
    return Math.max(1, Math.ceil(activeMemberCount * 0.5)); // 50% for tiny orgs
  } else if (activeMemberCount <= 20) {
    return Math.max(2, Math.ceil(activeMemberCount * 0.3)); // 30% for small orgs
  } else {
    return Math.max(5, Math.ceil(activeMemberCount * 0.1)); // 10% for larger orgs
  }
}

function getEffectiveQuorum(organizationId, governanceRules, activeMemberCount) {
  const configuredQuorum = governanceRules?.defaultQuorumPercentage || 0.5;
  const minQuorum = governanceRules?.minimumQuorumPercentage || 0.1;
  
  // Calculate minimum based on organization size
  const dynamicMin = calculateMinimumQuorum(activeMemberCount);
  const dynamicMinPercent = dynamicMin / activeMemberCount;
  
  // Use the highest of: configured, system minimum, dynamic minimum
  const effectiveQuorum = Math.max(
    configuredQuorum,
    minQuorum,
    dynamicMinPercent
  );
  
  return {
    percentage: effectiveQuorum,
    minimumVotes: Math.ceil(activeMemberCount * effectiveQuorum),
    activeMemberCount
  };
}
```

### 5.2 Rule Dependency Validation

**File:** `server/modules/rule-validation.js`

**Function:**
```javascript
const ruleDependencies = {
  membersCanCreateDocuments: {
    requires: [
      {
        condition: 'or',
        rules: [
          { field: 'membersCanCreateDocuments', value: true },
          { field: 'representativeCanManageDocuments', value: true }
        ]
      },
      {
        condition: 'and',
        rules: [
          { field: 'atLeastOneRepresentative', value: true },
          { field: 'representativeCanManageDocuments', value: true }
        ]
      }
    ],
    error: 'At least one group (members or representatives) must be able to create documents'
  },
  membersCanProposeRules: {
    requires: [
      {
        condition: 'or',
        rules: [
          { field: 'membersCanProposeRules', value: true },
          { field: 'atLeastOneRepresentative', value: true }
        ]
      }
    ],
    error: 'Either members must be able to propose rules, or at least one representative must exist'
  }
  // ... more dependencies
};

async function checkRuleDependencies(db, organizationId, ruleField, proposedValue) {
  const dependencies = ruleDependencies[ruleField];
  if (!dependencies) {
    return { valid: true };
  }

  const currentRules = await getGovernanceRules(db, organizationId);
  const representatives = await getRepresentatives(db, organizationId);
  const hasRepresentatives = representatives.length > 0;

  // Create a test rules object with proposed change
  const testRules = { ...currentRules, [ruleField]: proposedValue };
  if (!hasRepresentatives) {
    testRules.atLeastOneRepresentative = false;
  }

  // Check each requirement
  for (const requirement of dependencies.requires) {
    let requirementMet = false;

    if (requirement.condition === 'or') {
      requirementMet = requirement.rules.some(rule => {
        if (rule.field === 'atLeastOneRepresentative') {
          return hasRepresentatives === rule.value;
        }
        return testRules[rule.field] === rule.value;
      });
    } else if (requirement.condition === 'and') {
      requirementMet = requirement.rules.every(rule => {
        if (rule.field === 'atLeastOneRepresentative') {
          return hasRepresentatives === rule.value;
        }
        return testRules[rule.field] === rule.value;
      });
    }

    if (requirementMet) {
      return { valid: true };
    }
  }

  return {
    valid: false,
    error: dependencies.error,
    details: {
      ruleField,
      proposedValue,
      currentRules,
      hasRepresentatives
    }
  };
}
```

### 5.3 Recovery Mode Activation

**File:** `server/modules/safety-mechanisms.js`

**Function:**
```javascript
async function checkRecoveryModeConditions(db, organizationId) {
  const rules = await getGovernanceRules(db, organizationId);
  if (rules?.recoveryMode) {
    return { inRecovery: true, reason: rules.recoveryModeReason };
  }

  const representatives = await getRepresentatives(db, organizationId);
  const hasRepresentatives = representatives.length > 0;
  const membersCanManage = rules?.membersCanManageRuleProposals || false;

  // Condition 1: No representatives AND members can't manage
  if (!hasRepresentatives && !membersCanManage) {
    return {
      shouldActivate: true,
      reason: 'no_representatives_and_members_cannot_manage',
      details: 'Organization has no representatives and members cannot manage rule proposals'
    };
  }

  // Condition 2: No successful votes in 60 days
  const lastVote = rules?.lastSuccessfulVoteAt;
  if (lastVote) {
    const daysSince = (Date.now() - new Date(lastVote).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 60) {
      return {
        shouldActivate: true,
        reason: 'no_successful_votes_60_days',
        details: `No successful votes in ${Math.floor(daysSince)} days`
      };
    }
  }

  // Condition 3: Quorum consistently unmet
  const failedCount = rules?.failedProposalsCount || 0;
  if (failedCount >= 5) {
    const lastFailed = rules?.lastFailedProposalAt;
    if (lastFailed) {
      const daysSince = (Date.now() - new Date(lastFailed).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        return {
          shouldActivate: true,
          reason: 'quorum_consistently_unmet',
          details: `${failedCount} failed proposals in last 30 days due to quorum`
        };
      }
    }
  }

  return { shouldActivate: false };
}

async function activateRecoveryMode(db, organizationId, reason, details) {
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE organization_governance_rules SET
      recovery_mode = 1,
      recovery_mode_entered_at = ?,
      recovery_mode_reason = ?,
      updated_at = ?
    WHERE organization_id = ?
  `, [now, reason, now, organizationId], function(err) {
    if (err) {
      logger.error('Error activating recovery mode', { error: err.message, organizationId });
      return;
    }

    // Log audit event
    logAudit(db, organizationId, 'recovery_mode_activated', 'system', null, {
      reason,
      details
    }, null);

    // Notify admins
    notifyAdmins('recovery_mode_activated', {
      organizationId,
      reason,
      details
    });
  });
}
```

---

## Data Flow Specifications

### 6.1 Rule Proposal Creation Flow

```
User clicks "Create Proposal"
  ↓
Frontend: Check permissions (useOrganizationPermissions)
  ↓
Frontend: Show RuleProposalDialog
  ↓
User fills form and submits
  ↓
Frontend: Validate locally (validateProposal)
  ↓
Frontend: Call validate-rule-change API
  ↓
Backend: Check dynamic permission (canProposeRules)
  ↓
Backend: Validate rule value (validateGovernanceRuleValue)
  ↓
Backend: Check duplicates (including cooldown)
  ↓
Backend: Check dependencies (checkRuleDependencies)
  ↓
Backend: Check deadlock conditions
  ↓
Backend: Return validation result
  ↓
Frontend: Show warnings/conflicts, ask for confirmation
  ↓
Frontend: Call create-rule-proposal API
  ↓
Backend: Create proposal with status='draft'
  ↓
Backend: Return success
  ↓
Frontend: Show success, refresh proposals list
```

### 6.2 Rule Proposal Voting Flow

```
Representative clicks "Start Voting"
  ↓
Frontend: Call start-voting API
  ↓
Backend: Check permission (canManageRuleProposals)
  ↓
Backend: Get current governance rules
  ↓
Backend: Store snapshot_rules (JSON of current rules)
  ↓
Backend: Calculate voting period (enforce minimum)
  ↓
Backend: Update proposal status='active'
  ↓
Backend: Return success
  ↓
Frontend: Show voting interface
  ↓
Members vote (yes/no/abstain)
  ↓
Backend: Update vote counts
  ↓
Representative clicks "Complete Voting"
  ↓
Backend: Check permission (canManageRuleProposals)
  ↓
Backend: Load proposal with snapshot_rules
  ↓
Backend: Calculate approval using snapshot rules (not current rules)
  ↓
Backend: Check minimum safeguards (quorum, approval threshold)
  ↓
Backend: If approved: Check dependencies before applying
  ↓
Backend: If approved: Apply rule change
  ↓
Backend: Log to rule_history
  ↓
Backend: Update safety tracking
  ↓
Backend: Invalidate permission cache
  ↓
Backend: Return result
  ↓
Frontend: Show result, refresh governance rules
```

---

## State Management Specifications

### 7.1 Governance Rules State

**Location:** Context or React Query

**Structure:**
```typescript
interface GovernanceState {
  rules: OrganizationGovernanceRules | null;
  loading: boolean;
  error: string | null;
  bootstrapStatus: BootstrapStatus | null;
  recoveryStatus: RecoveryStatus | null;
  permissions: OrganizationPermissions | null;
}
```

**Actions:**
- `fetchGovernanceRules(organizationId)`
- `updateGovernanceRules(organizationId, updates)`
- `fetchBootstrapStatus(organizationId)`
- `completeBootstrap(organizationId)`
- `fetchPermissions(organizationId)`

**Cache Invalidation:**
- On rule proposal completion
- On bootstrap completion
- On recovery mode activation
- Manual refresh

### 7.2 Rule Proposals State

**Structure:**
```typescript
interface RuleProposalsState {
  proposals: RuleProposal[];
  loading: boolean;
  error: string | null;
  filters: {
    status?: 'draft' | 'active' | 'approved' | 'rejected';
    ruleField?: string;
  };
}
```

**Actions:**
- `fetchRuleProposals(organizationId, filters)`
- `createRuleProposal(organizationId, data)`
- `startVoting(organizationId, proposalId)`
- `voteOnProposal(organizationId, proposalId, vote)`
- `completeProposal(organizationId, proposalId)`

---

## Error Handling Specifications

### 8.1 Error Codes

**Permission Errors:**
- `PERMISSION_DENIED` (403) - User doesn't have permission
- `BOOTSTRAP_REQUIRED` (403) - Action requires bootstrap completion
- `RECOVERY_MODE_ACTIVE` (403) - Action restricted in recovery mode

**Validation Errors:**
- `INVALID_RULE_VALUE` (400) - Rule value doesn't meet requirements
- `RULE_DEPENDENCY_VIOLATION` (400) - Rule change would break dependencies
- `DEADLOCK_CONDITION` (400) - Rule change would create deadlock

**Conflict Errors:**
- `DUPLICATE_PROPOSAL` (409) - Proposal already exists for this rule
- `COOLDOWN_ACTIVE` (409) - Rule was recently changed (cooldown period)
- `RULE_CHANGED_DURING_VOTE` (409) - Rule changed while vote was active

**Safety Errors:**
- `MINIMUM_QUORUM_NOT_MET` (400) - Doesn't meet minimum quorum requirement
- `MINIMUM_APPROVAL_NOT_MET` (400) - Doesn't meet minimum approval threshold
- `MINIMUM_VOTING_PERIOD_NOT_MET` (400) - Voting period too short

### 8.2 Error Response Format

```typescript
{
  error: string, // Human-readable error message
  code: string, // Error code (for programmatic handling)
  details?: string, // Additional details
  suggestions?: string[], // Suggested actions to resolve
  data?: any // Additional error data
}
```

**Example:**
```json
{
  "error": "Minimum quorum not met",
  "code": "MINIMUM_QUORUM_NOT_MET",
  "details": "Required: 5 votes (10%), Actual: 2 votes",
  "suggestions": [
    "Wait for more members to vote",
    "Extend the voting period",
    "Contact members to encourage participation"
  ],
  "data": {
    "minVotesRequired": 5,
    "actualVotes": 2,
    "totalVoters": 50,
    "quorumPercentage": 0.1
  }
}
```

---

This comprehensive specification document provides all the details needed to implement the democratic constitution system. Each section includes code examples, data structures, and implementation details.

