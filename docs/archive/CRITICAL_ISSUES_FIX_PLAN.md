# Critical Issues Fix Plan

## Overview

This plan addresses the 7 critical issues identified in the governance system. Issues are ordered by dependency and impact.

---

## Issue #1: Permission Discrepancy Between Frontend and Backend

**Priority:** Highest (affects UX immediately)

**Problem:** Frontend shows proposal creation to all members, but backend only allows representatives.

**Files to Modify:**
- `client/src/hooks/useOrganizationPermissions.ts`
- `client/src/components/governance/RuleProposalDialog.tsx`
- `client/src/components/governance/GovernanceRulesVotingInterface.tsx`

### Implementation Steps

#### Step 1.1: Fix Permission Hook
**File:** `client/src/hooks/useOrganizationPermissions.ts`

**Change:**
```typescript
// BEFORE (line 54):
const canProposeRules = isRepresentative || isActiveMember || isAdmin;

// AFTER:
const canProposeRules = isRepresentative || isAdmin; // Only representatives can create proposals
```

**Rationale:** Align with backend requirement that only representatives can create proposals.

---

#### Step 1.2: Update RuleProposalDialog Access Check
**File:** `client/src/components/governance/RuleProposalDialog.tsx`

**Change:**
```typescript
// BEFORE (lines 454-459):
const isRepresentative = organization.representatives?.includes(currentUser.id);
const isActiveMember = organization.members?.some(m => m.userId === currentUser.id && m.status === 'active') || false;

if (!isRepresentative && !isActiveMember) {
  return null; // Only members can access this dialog
}

// AFTER:
const isRepresentative = organization.representatives?.includes(currentUser.id);
const isAdmin = currentUser.role === 'admin';

if (!isRepresentative && !isAdmin) {
  return null; // Only representatives and admins can access this dialog
}
```

**Rationale:** Restrict dialog access to match backend permissions.

---

#### Step 1.3: Update Dialog Description Text
**File:** `client/src/components/governance/RuleProposalDialog.tsx`

**Change:**
```typescript
// BEFORE (line 491):
Propose a change to {organization.name}'s governance rules. {isRepresentative ? 'As a representative, your proposal can be voted on directly.' : 'As a member, your proposal will need representative approval before voting begins.'} All proposals are voted on by organization members.

// AFTER:
Propose a change to {organization.name}'s governance rules. As a representative, you can create proposals that will be voted on by all active organization members.
```

**Rationale:** Remove misleading text about member proposals.

---

#### Step 1.4: Update GovernanceRulesVotingInterface
**File:** `client/src/components/governance/GovernanceRulesVotingInterface.tsx`

**Check:** Ensure "Create Proposal" button only shows for representatives.

**Change:** If button visibility uses `canProposeRules`, verify it's updated from Step 1.1.

---

### Testing
- [ ] Verify non-representative members don't see proposal creation UI
- [ ] Verify representatives can access proposal dialog
- [ ] Verify admins can access proposal dialog
- [ ] Test API rejection for non-representative members (should get 403)

---

## Issue #2: No Backend Validation of Proposed Rule Values

**Priority:** High (security/data integrity)

**Problem:** Backend applies rule values without validation, allowing invalid data.

**Files to Modify:**
- `server/routes/governance.js` (create and complete endpoints)
- `server/middleware/validation.js` (new validation function)

### Implementation Steps

#### Step 2.1: Create Validation Function
**File:** `server/middleware/validation.js` (or new file: `server/middleware/governanceValidation.js`)

**Add:**
```javascript
/**
 * Validate a governance rule value based on field name
 * @param {string} fieldName - The rule field name (camelCase)
 * @param {any} value - The proposed value
 * @returns {object} { valid: boolean, error?: string }
 */
function validateGovernanceRuleValue(fieldName, value) {
  const validations = {
    // Representative Elections
    representativeTermMonths: (v) => {
      const num = parseInt(v);
      if (isNaN(num) || num < 1 || num > 120) {
        return { valid: false, error: 'Representative term must be between 1 and 120 months' };
      }
      return { valid: true };
    },
    representativeTermLimits: (v) => {
      if (v === null || v === undefined || v === '') return { valid: true }; // NULL allowed
      const num = parseInt(v);
      if (isNaN(num) || num < 1) {
        return { valid: false, error: 'Term limits must be a positive integer or null' };
      }
      return { valid: true };
    },
    electionVotingMethod: (v) => {
      const valid = ['simple_majority', 'ranked_choice', 'approval'].includes(v);
      return valid 
        ? { valid: true }
        : { valid: false, error: 'Election voting method must be simple_majority, ranked_choice, or approval' };
    },
    electionQuorumPercentage: (v) => {
      const num = parseFloat(v);
      if (isNaN(num) || num < 0 || num > 1) {
        return { valid: false, error: 'Election quorum must be between 0 and 1' };
      }
      return { valid: true };
    },
    electionNoticeDays: (v) => {
      const num = parseInt(v);
      if (isNaN(num) || num < 1 || num > 365) {
        return { valid: false, error: 'Election notice must be between 1 and 365 days' };
      }
      return { valid: true };
    },
    
    // General Voting Rules
    defaultVotingDeadlineHours: (v) => {
      const num = parseInt(v);
      if (isNaN(num) || num < 1 || num > 720) {
        return { valid: false, error: 'Voting deadline must be between 1 and 720 hours' };
      }
      return { valid: true };
    },
    defaultQuorumPercentage: (v) => {
      const num = parseFloat(v);
      if (isNaN(num) || num < 0 || num > 1) {
        return { valid: false, error: 'Quorum percentage must be between 0 and 1' };
      }
      return { valid: true };
    },
    defaultAcceptanceThreshold: (v) => {
      const num = parseFloat(v);
      if (isNaN(num) || num < 1 || num > 100) {
        return { valid: false, error: 'Acceptance threshold must be between 1 and 100' };
      }
      return { valid: true };
    },
    documentProposalPeriodDays: (v) => {
      const num = parseInt(v);
      if (isNaN(num) || num < 1 || num > 3650) {
        return { valid: false, error: 'Document proposal period must be between 1 and 3650 days' };
      }
      return { valid: true };
    },
    thresholdCalculationMethod: (v) => {
      const valid = ['all_votes', 'all_members'].includes(v);
      return valid
        ? { valid: true }
        : { valid: false, error: 'Threshold calculation method must be all_votes or all_members' };
    },
    
    // Boolean fields
    anonymousVotingEnabled: (v) => {
      return typeof v === 'boolean' 
        ? { valid: true }
        : { valid: false, error: 'anonymousVotingEnabled must be a boolean' };
    },
    voteChangeAllowed: (v) => {
      return typeof v === 'boolean'
        ? { valid: true }
        : { valid: false, error: 'voteChangeAllowed must be a boolean' };
    },
    representativeCanCreateVotes: (v) => {
      return typeof v === 'boolean'
        ? { valid: true }
        : { valid: false, error: 'representativeCanCreateVotes must be a boolean' };
    },
    representativeCanInviteMembers: (v) => {
      return typeof v === 'boolean'
        ? { valid: true }
        : { valid: false, error: 'representativeCanInviteMembers must be a boolean' };
    },
    representativeCanManageDocuments: (v) => {
      return typeof v === 'boolean'
        ? { valid: true }
        : { valid: false, error: 'representativeCanManageDocuments must be a boolean' };
    },
    representativeApprovalRequired: (v) => {
      return typeof v === 'boolean'
        ? { valid: true }
        : { valid: false, error: 'representativeApprovalRequired must be a boolean' };
    },
    tamperProofEnabled: (v) => {
      return typeof v === 'boolean'
        ? { valid: true }
        : { valid: false, error: 'tamperProofEnabled must be a boolean' };
    },
    auditTrailEnabled: (v) => {
      return typeof v === 'boolean'
        ? { valid: true }
        : { valid: false, error: 'auditTrailEnabled must be a boolean' };
    }
  };

  const validator = validations[fieldName];
  if (!validator) {
    return { valid: false, error: `Unknown rule field: ${fieldName}` };
  }

  return validator(value);
}

module.exports = { validateGovernanceRuleValue };
```

---

#### Step 2.2: Add Validation to Create Endpoint
**File:** `server/routes/governance.js`

**Add import:**
```javascript
const { validateGovernanceRuleValue } = require('../middleware/governanceValidation');
```

**Modify create endpoint (after line 609):**
```javascript
// After transforming rules and getting currentValue, add validation:
const validation = validateGovernanceRuleValue(ruleField, proposedValue);
if (!validation.valid) {
  return res.status(400).json({ 
    error: 'Invalid rule value', 
    details: validation.error,
    field: ruleField,
    value: proposedValue
  });
}
```

**Location:** Insert after line 609, before the `db.run` INSERT statement.

---

#### Step 2.3: Add Validation to Complete Endpoint
**File:** `server/routes/governance.js`

**Modify complete endpoint (after line 915, before applying updates):**
```javascript
// After parsing proposed_rule_value, add validation:
const proposedValue = JSON.parse(proposal.proposed_rule_value);
const validation = validateGovernanceRuleValue(proposal.current_rule_field, proposedValue);
if (!validation.valid) {
  logger.error('Invalid rule value in approved proposal', {
    proposalId,
    field: proposal.current_rule_field,
    value: proposedValue,
    error: validation.error
  });
  return res.status(500).json({ 
    error: 'Proposal contains invalid rule value and cannot be applied',
    details: validation.error
  });
}
```

**Location:** Insert after line 915 (after parsing), before building `updates` object.

---

### Testing
- [ ] Test invalid values for each rule field type
- [ ] Test valid values pass validation
- [ ] Test edge cases (null for nullable fields, boundary values)
- [ ] Test validation on create endpoint
- [ ] Test validation on complete endpoint
- [ ] Verify error messages are clear

---

## Issue #3: No Quorum Requirement for Rule Proposals

**Priority:** High (democratic integrity)

**Problem:** Rule proposals only check approval percentage, not minimum participation.

**Files to Modify:**
- `server/routes/governance.js` (complete endpoint)

### Implementation Steps

#### Step 3.1: Add Quorum Check to Complete Endpoint
**File:** `server/routes/governance.js`

**Modify complete endpoint (after line 880):**
```javascript
// After calculating approvalRate, add quorum check:
const governanceRules = await getGovernanceRules(db, organizationId);
const quorumPercentage = governanceRules?.defaultQuorumPercentage || 0.5;
const minVotesRequired = Math.ceil(proposal.total_voters * quorumPercentage);
const quorumMet = totalVotes >= minVotesRequired;

if (!quorumMet) {
  // Mark as rejected due to insufficient participation
  db.run(`
    UPDATE governance_rule_proposals SET
      status = 'rejected',
      updated_at = ?
    WHERE id = ?
  `, [now.toISOString(), proposalId]);

  logAudit(db, organizationId, 'rule_proposal_rejected_quorum', userId, null, {
    proposalId,
    totalVotes,
    minVotesRequired,
    totalVoters: proposal.total_voters,
    quorumPercentage
  }, req);

  return res.json({
    success: true,
    message: 'Rule proposal rejected due to insufficient participation (quorum not met)',
    approved: false,
    quorumMet: false,
    totalVotes,
    minVotesRequired,
    totalVoters: proposal.total_voters,
    quorumPercentage: quorumPercentage * 100
  });
}

// Only proceed with approval check if quorum is met
const approved = quorumMet && approvalRate >= threshold;
```

**Location:** Replace lines 878-882 with the above logic.

---

#### Step 3.2: Update Response Messages
**File:** `server/routes/governance.js`

**Update approved response (around line 986):**
```javascript
res.json({
  success: true,
  message: 'Rule proposal approved and implemented',
  approved: true,
  approvalRate,
  quorumMet: true,
  totalVotes,
  minVotesRequired,
  threshold,
  newRuleValue
});
```

**Update rejected response (around line 1010):**
```javascript
res.json({
  success: true,
  message: 'Rule proposal rejected due to insufficient approval',
  approved: false,
  approvalRate,
  threshold,
  quorumMet: true, // Quorum was met, but approval threshold wasn't
  totalVotes
});
```

---

### Testing
- [ ] Test proposal with quorum met and approval threshold met → should approve
- [ ] Test proposal with quorum met but approval threshold not met → should reject
- [ ] Test proposal with quorum not met → should reject (even if approval % is high)
- [ ] Test edge case: 0 votes → should reject
- [ ] Test edge case: exactly quorum votes → should check approval threshold
- [ ] Verify quorum percentage from governance rules is used correctly

---

## Issue #4: No Duplicate/Conflict Prevention

**Priority:** High (prevents confusion and conflicts)

**Problem:** Multiple proposals for the same rule field can exist simultaneously.

**Files to Modify:**
- `server/routes/governance.js` (create endpoint)

### Implementation Steps

#### Step 4.1: Add Duplicate Check to Create Endpoint
**File:** `server/routes/governance.js`

**Modify create endpoint (after line 609, before INSERT):**
```javascript
// Check for existing active or draft proposals for the same rule field
db.get(`
  SELECT id, title, status, created_at
  FROM governance_rule_proposals
  WHERE organization_id = ?
    AND current_rule_field = ?
    AND status IN ('draft', 'active')
  ORDER BY created_at DESC
  LIMIT 1
`, [organizationId, ruleField], (err, existingProposal) => {
  if (err) {
    logger.error('Error checking for duplicate proposals', { error: err.message, organizationId, ruleField });
    return res.status(500).json({ error: 'Failed to check for existing proposals' });
  }

  if (existingProposal) {
    return res.status(409).json({
      error: 'A proposal for this rule field already exists',
      details: `There is already a ${existingProposal.status} proposal for ${ruleField}`,
      existingProposal: {
        id: existingProposal.id,
        title: existingProposal.title,
        status: existingProposal.status,
        createdAt: existingProposal.created_at
      },
      suggestion: 'Please complete or cancel the existing proposal before creating a new one'
    });
  }

  // Continue with proposal creation...
  // (existing INSERT code)
});
```

**Location:** Insert after validation (Step 2.2), wrap the existing INSERT logic in this callback.

---

#### Step 4.2: Update Frontend Error Handling
**File:** `client/src/components/governance/RuleProposalDialog.tsx`

**Modify error handling in `handleCreateProposal` (around line 446):**
```typescript
} catch (error: any) {
  console.error('Failed to create rule proposal:', error);
  
  if (error.status === 409) {
    // Conflict - duplicate proposal
    const errorData = error.data || {};
    toast.error(
      errorData.details || 'A proposal for this rule already exists',
      {
        description: errorData.suggestion,
        duration: 5000
      }
    );
  } else {
    toast.error(error.message || 'Failed to create rule proposal');
  }
}
```

---

### Testing
- [ ] Test creating proposal when draft exists for same field → should reject with 409
- [ ] Test creating proposal when active exists for same field → should reject with 409
- [ ] Test creating proposal when only approved/rejected exist → should allow
- [ ] Test creating proposal for different field → should allow
- [ ] Verify error message is clear and helpful

---

## Issue #5: Race Condition in Vote Completion

**Priority:** High (data integrity)

**Problem:** Multiple representatives can complete voting simultaneously.

**Files to Modify:**
- `server/routes/governance.js` (complete endpoint)

### Implementation Steps

#### Step 5.1: Add Atomic Status Update
**File:** `server/routes/governance.js`

**Modify complete endpoint (replace the status update logic):**
```javascript
// Use transaction and atomic status check
db.run('BEGIN TRANSACTION', (beginErr) => {
  if (beginErr) {
    logger.error('Error beginning transaction', { error: beginErr.message });
    return res.status(500).json({ error: 'Failed to process completion' });
  }

  // First, try to atomically update status from 'active' to 'processing'
  // This prevents double-completion
  db.run(`
    UPDATE governance_rule_proposals
    SET status = 'processing',
        updated_at = ?
    WHERE id = ?
      AND organization_id = ?
      AND status = 'active'
  `, [now.toISOString(), proposalId, organizationId], function(updateErr) {
    if (updateErr) {
      db.run('ROLLBACK', () => {});
      logger.error('Error updating proposal status', { error: updateErr.message });
      return res.status(500).json({ error: 'Failed to update proposal status' });
    }

    if (this.changes === 0) {
      // No rows updated - proposal not active or already being processed
      db.run('ROLLBACK', () => {});
      return res.status(409).json({
        error: 'Proposal is not active or is already being processed',
        details: 'Another representative may be completing this proposal, or it has already been completed'
      });
    }

    // Re-fetch proposal with latest vote counts
    db.get(`
      SELECT * FROM governance_rule_proposals
      WHERE id = ? AND organization_id = ?
    `, [proposalId, organizationId], (err, proposal) => {
      if (err || !proposal) {
        db.run('ROLLBACK', () => {});
        return res.status(500).json({ error: 'Failed to fetch proposal' });
      }

      // Calculate approval (existing logic)
      const totalVotes = proposal.votes_yes + proposal.votes_no + proposal.votes_abstain;
      const approvalRate = totalVotes > 0 ? (proposal.votes_yes / totalVotes) * 100 : 0;
      const threshold = proposal.threshold_percentage || 75.0;
      
      // Check quorum (from Issue #3)
      const governanceRules = await getGovernanceRules(db, organizationId);
      const quorumPercentage = governanceRules?.defaultQuorumPercentage || 0.5;
      const minVotesRequired = Math.ceil(proposal.total_voters * quorumPercentage);
      const quorumMet = totalVotes >= minVotesRequired;
      const approved = quorumMet && approvalRate >= threshold;

      // Apply updates (existing logic)
      if (approved) {
        // ... existing approval logic ...
      } else {
        // ... existing rejection logic ...
      }

      // Commit transaction
      db.run('COMMIT', (commitErr) => {
        if (commitErr) {
          logger.error('Error committing transaction', { error: commitErr.message });
          return res.status(500).json({ error: 'Failed to complete proposal' });
        }
        // Return success response
      });
    });
  });
});
```

**Note:** This is a simplified version. Full implementation needs to:
1. Wrap entire completion logic in transaction
2. Use atomic status update to prevent double-processing
3. Handle all error cases with rollback

---

#### Step 5.2: Add 'processing' Status to Schema
**File:** `database_governance_migration.sql` or create migration

**Add status:**
```sql
-- Update status check constraint to include 'processing'
ALTER TABLE governance_rule_proposals
  DROP CONSTRAINT IF EXISTS governance_rule_proposals_status_check;

-- Note: SQLite doesn't support ALTER TABLE for CHECK constraints easily
-- May need to recreate table or use application-level enforcement
```

**Alternative:** Use application-level status check (already in code above).

---

### Testing
- [ ] Test concurrent completion requests → only one should succeed
- [ ] Test completing already-completed proposal → should return 409
- [ ] Test transaction rollback on error → verify no partial updates
- [ ] Load test with multiple simultaneous completions

---

## Issue #6: No Conflict Detection for Concurrent Rule Changes

**Priority:** Medium-High (prevents silent overwrites)

**Problem:** Later proposals can overwrite earlier changes without warning.

**Files to Modify:**
- `server/routes/governance.js` (complete endpoint)

### Implementation Steps

#### Step 6.1: Add Current Value Check
**File:** `server/routes/governance.js`

**Modify complete endpoint (after fetching proposal, before applying updates):**
```javascript
// After parsing proposed_rule_value and validation, check if rule has changed:
const currentRules = await getGovernanceRules(db, organizationId);
const transformedRules = transformGovernanceRules(currentRules);
const actualCurrentValue = transformedRules[proposal.current_rule_field];
const proposalCurrentValue = JSON.parse(proposal.current_rule_value);

// Compare values (handle different types)
const valuesMatch = JSON.stringify(actualCurrentValue) === JSON.stringify(proposalCurrentValue);

if (!valuesMatch) {
  // Rule has changed since proposal was created
  logger.warn('Rule proposal conflict detected', {
    proposalId,
    field: proposal.current_rule_field,
    proposalValue: proposalCurrentValue,
    actualValue: actualCurrentValue
  });

  // Reject proposal with explanation
  db.run(`
    UPDATE governance_rule_proposals SET
      status = 'rejected',
      updated_at = ?
    WHERE id = ?
  `, [now.toISOString(), proposalId]);

  logAudit(db, organizationId, 'rule_proposal_rejected_conflict', userId, null, {
    proposalId,
    field: proposal.current_rule_field,
    proposalValue: proposalCurrentValue,
    actualValue: actualCurrentValue
  }, req);

  return res.status(409).json({
    success: false,
    error: 'Rule has changed since proposal was created',
    details: `The ${proposal.current_rule_field} rule was modified after this proposal was created. The proposal cannot be applied to avoid overwriting recent changes.`,
    proposalValue: proposalCurrentValue,
    actualValue: actualCurrentValue,
    suggestion: 'Please create a new proposal with the current rule value'
  });
}

// Continue with normal approval/rejection logic...
```

**Location:** Insert after validation (Step 2.3), before building `updates` object.

---

### Testing
- [ ] Test completing proposal when rule hasn't changed → should proceed normally
- [ ] Test completing proposal when rule has changed → should reject with 409
- [ ] Test with different value types (string, number, boolean, null)
- [ ] Verify error message explains the conflict clearly

---

## Issue #7: No Automatic Expiration Handling for Rule Proposals

**Priority:** Medium (cleanup/maintenance)

**Problem:** Proposals with passed deadlines remain active indefinitely.

**Files to Modify:**
- `server/modules/scheduler.js`
- `server/routes/governance.js` (new expiration endpoint or logic)

### Implementation Steps

#### Step 7.1: Add Expiration Check to Scheduler
**File:** `server/modules/scheduler.js`

**Add new method:**
```javascript
/**
 * Process expired rule proposals
 * Auto-rejects proposals where voting deadline has passed
 */
async processExpiredRuleProposals() {
  logger.debug('Processing expired rule proposals');

  try {
    const now = new Date().toISOString();

    // Find active proposals past their voting deadline
    const expiredProposals = await new Promise((resolve, reject) => {
      this.db.all(`
        SELECT id, organization_id, title, current_rule_field, voting_ends_at
        FROM governance_rule_proposals
        WHERE status = 'active'
          AND voting_ends_at IS NOT NULL
          AND voting_ends_at < ?
      `, [now], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    logger.debug('Found expired rule proposals', { count: expiredProposals.length });

    for (const proposal of expiredProposals) {
      try {
        // Calculate final vote counts
        const voteCounts = await new Promise((resolve, reject) => {
          this.db.get(`
            SELECT 
              COUNT(CASE WHEN vote_choice = 'yes' THEN 1 END) as votes_yes,
              COUNT(CASE WHEN vote_choice = 'no' THEN 1 END) as votes_no,
              COUNT(CASE WHEN vote_choice = 'abstain' THEN 1 END) as votes_abstain,
              COUNT(*) as votes_cast
            FROM governance_rule_proposal_votes
            WHERE proposal_id = ?
          `, [proposal.id], (err, row) => {
            if (err) reject(err);
            else resolve(row || { votes_yes: 0, votes_no: 0, votes_abstain: 0, votes_cast: 0 });
          });
        });

        // Update proposal with final counts and mark as expired
        await new Promise((resolve, reject) => {
          this.db.run(`
            UPDATE governance_rule_proposals SET
              status = 'expired',
              votes_yes = ?,
              votes_no = ?,
              votes_abstain = ?,
              votes_cast = ?,
              updated_at = ?
            WHERE id = ?
          `, [
            voteCounts.votes_yes,
            voteCounts.votes_no,
            voteCounts.votes_abstain,
            voteCounts.votes_cast,
            now,
            proposal.id
          ], function(err) {
            if (err) reject(err);
            else resolve();
          });
        });

        // Log audit event
        const logAudit = require('../routes/organizations').logAudit || (() => {});
        logAudit(this.db, proposal.organization_id, 'rule_proposal_expired', 'system', null, {
          proposalId: proposal.id,
          title: proposal.title,
          field: proposal.current_rule_field,
          votesYes: voteCounts.votes_yes,
          votesNo: voteCounts.votes_no,
          votesAbstain: voteCounts.votes_abstain
        }, null);

        logger.info('Marked rule proposal as expired', {
          proposalId: proposal.id,
          organizationId: proposal.organization_id,
          title: proposal.title
        });
      } catch (error) {
        logger.error('Failed to expire rule proposal', {
          error: error.message,
          proposalId: proposal.id
        });
      }
    }
  } catch (error) {
    logger.error('Error processing expired rule proposals', {
      error: error.message,
      stack: error.stack
    });
  }
}
```

---

#### Step 7.2: Add to Scheduler Run Loop
**File:** `server/modules/scheduler.js`

**Add to existing run method or create new scheduled task:**
```javascript
// In the scheduler's main run loop, add:
await this.processExpiredRuleProposals();
```

**Frequency:** Run daily or every few hours (less critical than document deadlines).

---

#### Step 7.3: Update Schema to Allow 'expired' Status
**File:** `database_governance_migration.sql` or create migration

**Note:** SQLite doesn't easily support ALTER TABLE for CHECK constraints. Options:
1. Application-level enforcement (recommended)
2. Recreate table with new constraint
3. Use application logic to validate status

**Application-level:** Ensure code only sets valid statuses, and UI handles 'expired' status.

---

#### Step 7.4: Update Frontend to Show Expired Status
**File:** `client/src/components/governance/GovernanceRulesVotingInterface.tsx`

**Add expired status handling:**
```typescript
// In proposal status display, add:
{proposal.status === 'expired' && (
  <Badge variant="secondary">Expired</Badge>
)}
```

---

### Testing
- [ ] Test proposal expiration when deadline passes
- [ ] Verify vote counts are correctly calculated on expiration
- [ ] Test multiple proposals expiring simultaneously
- [ ] Verify expired proposals can't be completed
- [ ] Test scheduler runs expiration check

---

## Implementation Order

### Phase 1: Quick Wins (Do First)
1. **Issue #1:** Permission Discrepancy (frontend-only changes)
2. **Issue #4:** Duplicate Prevention (simple check)

### Phase 2: Core Functionality
3. **Issue #2:** Backend Validation (foundation for others)
4. **Issue #3:** Quorum Requirement (democratic integrity)
5. **Issue #6:** Conflict Detection (uses validation)

### Phase 3: Data Integrity
6. **Issue #5:** Race Condition (transaction handling)
7. **Issue #7:** Expiration Handling (cleanup/maintenance)

---

## Dependencies

- **Issue #2** (Validation) should be done before **Issue #6** (Conflict Detection)
- **Issue #3** (Quorum) should be done before **Issue #5** (Race Condition) - both modify complete endpoint
- **Issue #5** (Race Condition) modifies the same endpoint as **Issue #3** - coordinate changes

---

## Testing Strategy

### Unit Tests
- Validation function for each rule field type
- Quorum calculation logic
- Conflict detection logic
- Duplicate check logic

### Integration Tests
- Complete proposal lifecycle (create → vote → complete)
- Concurrent completion attempts
- Expired proposal handling
- Permission checks

### Manual Testing
- UI permission visibility
- Error message clarity
- User experience flow

---

## Estimated Effort

- **Issue #1:** 1-2 hours (frontend changes)
- **Issue #2:** 4-6 hours (validation function + integration)
- **Issue #3:** 2-3 hours (quorum logic)
- **Issue #4:** 1-2 hours (duplicate check)
- **Issue #5:** 3-4 hours (transaction handling)
- **Issue #6:** 2-3 hours (conflict detection)
- **Issue #7:** 3-4 hours (scheduler integration)

**Total:** ~16-24 hours

---

## Rollout Plan

1. **Week 1:** Phase 1 (Issues #1, #4) - Low risk, immediate UX improvement
2. **Week 2:** Phase 2 (Issues #2, #3, #6) - Core functionality fixes
3. **Week 3:** Phase 3 (Issues #5, #7) - Data integrity and cleanup

Each phase should be:
- Tested thoroughly
- Deployed to staging
- Reviewed by team
- Deployed to production with monitoring

