# Democratic Constitution Design: Self-Configurable Organization Governance

## Vision

Transform the governance system into a fully democratic "constitution builder" where organizations can define their own rules through member voting. This creates a sandbox where organizations can experiment with different governance models.

---

## Core Principle

**"Everything is voteable, except the minimum required to vote."**

All governance rules, permissions, and processes should be configurable through democratic voting, with only minimal safeguards to prevent organizations from locking themselves out.

---

## Current State Analysis

### What's Currently Hardcoded (Cannot Be Changed)

1. **Who Can Create Rule Proposals**
   - Currently: Only representatives
   - Location: `server/routes/governance.js:591-594`

2. **Who Can Create Documents**
   - Currently: Only representatives
   - Location: `client/src/hooks/useOrganizationPermissions.ts:43`

3. **Who Can Create Elections**
   - Currently: Only representatives
   - Location: `server/routes/governance.js:1155-1158`

4. **Who Can Start Elections**
   - Currently: Only representatives
   - Location: `server/routes/governance.js:1413-1416`

5. **Who Can Invite Members**
   - Currently: Only representatives (but check `representativeCanInviteMembers` rule)
   - Location: `server/routes/organizations.js:466-469`

6. **Who Can Complete Rule Proposals**
   - Currently: Only representatives
   - Location: `server/routes/governance.js:864-867`

7. **Who Can Start Rule Proposal Voting**
   - Currently: Only representatives
   - Location: `server/routes/governance.js:725-728`

8. **System Admin Powers**
   - Currently: Hardcoded - only admins can create/delete organizations
   - This should remain (system-level, not organization-level)

### What's Already Voteable (Good!)

- Representative term length and limits
- Election voting methods
- Voting deadlines and quorums
- Document proposal periods
- Acceptance thresholds
- Anonymous voting settings
- Vote change permissions
- Representative powers (but not who has them)

---

## Proposed Democratic Constitution System

### New Governance Rules to Add

Add these new rules to `organization_governance_rules` table:

```sql
-- Who can propose rule changes
members_can_propose_rules BOOLEAN DEFAULT 0, -- If false, only representatives can propose
members_can_propose_rules_threshold REAL DEFAULT 0.5, -- Approval threshold for member proposals

-- Who can create documents
members_can_create_documents BOOLEAN DEFAULT 0, -- If false, only representatives can create
members_can_create_documents_threshold REAL DEFAULT 0.5,

-- Who can initialize elections
members_can_initialize_elections BOOLEAN DEFAULT 0, -- If false, only representatives can
members_can_initialize_elections_threshold REAL DEFAULT 0.5,

-- Who can invite members
members_can_invite_members BOOLEAN DEFAULT 0, -- If false, only representatives can
members_can_invite_members_threshold REAL DEFAULT 0.5,

-- Who can start/complete rule proposal voting
members_can_manage_rule_proposals BOOLEAN DEFAULT 0, -- If false, only representatives can start/complete
members_can_manage_rule_proposals_threshold REAL DEFAULT 0.5,

-- Minimum safeguards (cannot be changed through voting)
minimum_quorum_percentage REAL DEFAULT 0.1, -- Minimum 10% participation required (safeguard)
minimum_approval_threshold REAL DEFAULT 0.5, -- Minimum 50% approval required (safeguard)
minimum_voting_period_hours INTEGER DEFAULT 24, -- Minimum 24 hours for voting (safeguard)

-- Bootstrap mode (for new organizations)
bootstrap_mode BOOLEAN DEFAULT 1, -- Special mode with relaxed rules for initial setup
bootstrap_completed_at DATETIME, -- When bootstrap phase ends
```

### Permission System Redesign

**Current System:**
```
isRepresentative → has all powers
isActiveMember → limited powers
```

**New System:**
```
Check governance rules → determine permissions dynamically
```

**New Permission Logic:**

```javascript
// Pseudo-code for new permission system
function canCreateDocuments(user, organization, governanceRules) {
  // System admins always can
  if (user.role === 'admin') return true;
  
  // Check if members can create documents
  if (governanceRules.membersCanCreateDocuments) {
    return isActiveMember(user, organization);
  }
  
  // Otherwise, only representatives
  return isRepresentative(user, organization);
}

function canProposeRules(user, organization, governanceRules) {
  if (user.role === 'admin') return true;
  
  if (governanceRules.membersCanProposeRules) {
    return isActiveMember(user, organization);
  }
  
  return isRepresentative(user, organization);
}

function canInitializeElections(user, organization, governanceRules) {
  if (user.role === 'admin') return true;
  
  if (governanceRules.membersCanInitializeElections) {
    return isActiveMember(user, organization);
  }
  
  return isRepresentative(user, organization);
}

function canInviteMembers(user, organization, governanceRules) {
  if (user.role === 'admin') return true;
  
  // Check representativeCanInviteMembers (existing rule)
  if (!governanceRules.representativeCanInviteMembers) {
    return false; // Representatives can't invite if rule disabled
  }
  
  if (governanceRules.membersCanInviteMembers) {
    return isActiveMember(user, organization);
  }
  
  return isRepresentative(user, organization);
}

function canManageRuleProposals(user, organization, governanceRules) {
  if (user.role === 'admin') return true;
  
  if (governanceRules.membersCanManageRuleProposals) {
    return isActiveMember(user, organization);
  }
  
  return isRepresentative(user, organization);
}
```

---

## Bootstrap Process

### Problem: Chicken-and-Egg

How do you vote on rules if there are no rules about voting?

### Solution: Bootstrap Mode

**Phase 1: Bootstrap (Initial Setup)**
- Organization created by admin
- Initial representatives assigned
- Bootstrap mode enabled (`bootstrap_mode = 1`)
- During bootstrap:
  - Representatives have all powers (as current system)
  - Members can propose rules (relaxed)
  - Lower thresholds for initial rule proposals (e.g., 30% approval)
  - Representatives can approve proposals to start voting (or auto-start after 7 days)

**Phase 2: Constitution Building**
- Representatives and members create proposals for core governance rules
- Vote on:
  - Who can propose rules
  - Who can create documents
  - Who can initialize elections
  - Voting thresholds
  - Quorum requirements
  - All other governance rules

**Phase 3: Normal Operation**
- Bootstrap mode disabled (`bootstrap_mode = 0`, `bootstrap_completed_at = NOW()`)
- Organization operates under its democratically chosen rules
- All future rule changes follow the established process

**Bootstrap Completion Criteria:**
- At least 3 core rules have been voted on and approved:
  1. Who can propose rules
  2. Who can create documents
  3. Voting thresholds/quorums
- OR: Bootstrap period expires (e.g., 90 days after creation)
- OR: Representatives manually complete bootstrap

---

## Minimum Safeguards (Cannot Be Changed)

These rules prevent organizations from locking themselves out:

### 1. Minimum Quorum
- **Rule:** `minimum_quorum_percentage` (default: 0.1 = 10%)
- **Purpose:** Ensure some participation before decisions are made
- **Enforcement:** All votes must meet minimum quorum, even if governance rule says lower
- **Cannot be changed:** System enforces minimum, even if organization votes for 0%

### 2. Minimum Approval Threshold
- **Rule:** `minimum_approval_threshold` (default: 0.5 = 50%)
- **Purpose:** Prevent minority rule
- **Enforcement:** All approvals must meet minimum threshold
- **Cannot be changed:** System enforces minimum

### 3. Minimum Voting Period
- **Rule:** `minimum_voting_period_hours` (default: 24 hours)
- **Purpose:** Give members time to participate
- **Enforcement:** Voting cannot end before minimum period
- **Cannot be changed:** System enforces minimum

### 4. At Least One Active Member
- **Rule:** System-level safeguard
- **Purpose:** Prevent organization from having zero members
- **Enforcement:** Cannot remove last active member

### 5. System Admin Override
- **Rule:** System-level
- **Purpose:** Emergency recovery if organization locks itself out
- **Enforcement:** Admins can always intervene (but should be logged/audited)

---

## Edge Cases and Safeguards

### Edge Case 1: Voting to Remove All Representatives

**Scenario:** Organization votes to remove all representatives, but rules require representatives to manage things.

**Solution:**
- If `membersCanManageRuleProposals = true`, members can continue operating
- If `membersCanManageRuleProposals = false` AND no representatives exist:
  - System enters "recovery mode"
  - All active members can propose emergency rule changes
  - Lower thresholds apply (minimum safeguards only)
  - System admin can intervene if needed

### Edge Case 2: Voting for 100% Approval Threshold

**Scenario:** Organization votes to require 100% approval for all changes.

**Solution:**
- System enforces `minimum_approval_threshold` (50%)
- Organization can vote for higher (e.g., 75%, 90%)
- But cannot require 100% (would lock system)
- Maximum allowed: 95% (leaves room for dissent)

### Edge Case 3: Voting to Disable All Member Powers

**Scenario:** Organization votes to remove all member powers, leaving only representatives.

**Solution:**
- This is allowed (organization's choice)
- But: Representatives must still exist
- If no representatives exist, system enters recovery mode
- Members can always vote (that's the minimum safeguard)

### Edge Case 4: Circular Dependencies

**Scenario:** Rule A requires Rule B, but Rule B requires Rule A.

**Solution:**
- Rules are independent - no dependencies
- Each rule change is a separate vote
- Organization must vote on rules in logical order
- UI can show warnings about potential conflicts

### Edge Case 5: Bootstrap Never Completed

**Scenario:** Organization stays in bootstrap mode forever.

**Solution:**
- Auto-complete bootstrap after 90 days
- Use most permissive rules as defaults
- Log warning for admin review

---

## Implementation Plan

### Phase 1: Database Schema Changes

**File:** `database_governance_migration.sql` or new migration

```sql
-- Add new governance rule fields
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

-- Minimum safeguards (system-enforced, cannot be changed)
ALTER TABLE organization_governance_rules ADD COLUMN minimum_quorum_percentage REAL DEFAULT 0.1;
ALTER TABLE organization_governance_rules ADD COLUMN minimum_approval_threshold REAL DEFAULT 0.5;
ALTER TABLE organization_governance_rules ADD COLUMN minimum_voting_period_hours INTEGER DEFAULT 24;

-- Bootstrap mode
ALTER TABLE organization_governance_rules ADD COLUMN bootstrap_mode BOOLEAN DEFAULT 1;
ALTER TABLE organization_governance_rules ADD COLUMN bootstrap_completed_at DATETIME;
```

**Note:** SQLite doesn't support ALTER TABLE ADD COLUMN easily. May need to recreate table or use migration script.

---

### Phase 2: Backend Permission System Redesign

**File:** `server/routes/governance.js` (and other route files)

**Changes:**
1. Create new permission check functions that read from governance rules
2. Replace hardcoded `isRepresentative` checks with dynamic permission checks
3. Add bootstrap mode handling
4. Enforce minimum safeguards in all voting operations

**New Helper Functions:**

```javascript
// Check if user can propose rules
async function canProposeRules(db, userId, organizationId) {
  const isAdmin = req.user.role === 'admin';
  if (isAdmin) return true;
  
  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);
  const rules = await getGovernanceRules(db, organizationId);
  
  // Bootstrap mode: members can propose
  if (rules.bootstrapMode && isMember) return true;
  
  // Normal mode: check rule
  if (rules.membersCanProposeRules && isMember) return true;
  if (isRep) return true;
  
  return false;
}

// Similar functions for:
// - canCreateDocuments
// - canInitializeElections
// - canInviteMembers
// - canManageRuleProposals
```

---

### Phase 3: Frontend Permission System Update

**File:** `client/src/hooks/useOrganizationPermissions.ts`

**Changes:**
1. Fetch governance rules in the hook
2. Calculate permissions dynamically based on rules
3. Show/hide UI elements based on calculated permissions

**New Implementation:**

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
  
  // Dynamic permissions based on governance rules
  const canProposeRules = isAdmin || 
    (isBootstrap && isActiveMember) ||
    (governanceRules?.membersCanProposeRules && isActiveMember) ||
    isRepresentative;
  
  const canCreateDocuments = isAdmin ||
    (isBootstrap && isActiveMember) ||
    (governanceRules?.membersCanCreateDocuments && isActiveMember) ||
    isRepresentative;
  
  // ... similar for other permissions
  
  return {
    // ... return calculated permissions
  };
}
```

---

### Phase 4: Add New Rule Fields to Proposal System

**File:** `client/src/components/governance/RuleProposalDialog.tsx`

**Changes:**
1. Add new rule fields to `availableRuleFields`
2. Add labels and descriptions
3. Add validation
4. Update UI to show bootstrap mode status

**New Fields to Add:**
- `membersCanProposeRules`
- `membersCanCreateDocuments`
- `membersCanInitializeElections`
- `membersCanInviteMembers`
- `membersCanManageRuleProposals`

---

### Phase 5: Bootstrap Mode UI

**File:** New component: `client/src/components/governance/BootstrapModeBanner.tsx`

**Purpose:**
- Show banner when organization is in bootstrap mode
- Explain bootstrap process
- Show progress toward completion
- Allow representatives to complete bootstrap manually

---

### Phase 6: Update All Permission Checks

**Files to Update:**
- `server/routes/documents.js` - document creation
- `server/routes/governance.js` - rule proposals, elections
- `server/routes/organizations.js` - member invitations
- All other routes that check `isRepresentative`

**Pattern:**
```javascript
// BEFORE:
const isRep = await isRepresentative(db, userId, organizationId);
if (!isRep) {
  return res.status(403).json({ error: 'Only representatives can...' });
}

// AFTER:
const canDo = await canCreateDocuments(db, userId, organizationId); // or appropriate function
if (!canDo) {
  return res.status(403).json({ error: 'You do not have permission to...' });
}
```

---

### Phase 7: Enforce Minimum Safeguards

**File:** `server/routes/governance.js` (voting endpoints)

**Changes:**
1. Check minimum quorum before approving
2. Check minimum approval threshold
3. Enforce minimum voting period
4. Return clear error messages when safeguards prevent action

**Example:**
```javascript
// In complete endpoint:
const rules = await getGovernanceRules(db, organizationId);
const minQuorum = rules.minimumQuorumPercentage || 0.1;
const minApproval = rules.minimumApprovalThreshold || 0.5;

// Calculate actual values
const actualQuorum = totalVotes / proposal.total_voters;
const actualApproval = approvalRate / 100;

// Enforce minimums
if (actualQuorum < minQuorum) {
  return res.status(400).json({
    error: 'Minimum quorum not met',
    details: `Required: ${minQuorum * 100}%, Actual: ${actualQuorum * 100}%`,
    minimum: minQuorum * 100
  });
}

if (actualApproval < minApproval) {
  return res.status(400).json({
    error: 'Minimum approval threshold not met',
    details: `Required: ${minApproval * 100}%, Actual: ${actualApproval * 100}%`,
    minimum: minApproval * 100
  });
}
```

---

## Migration Strategy

### For Existing Organizations

1. **Set Bootstrap Mode:**
   - All existing organizations: `bootstrap_mode = 0` (already past bootstrap)
   - OR: Set to `1` and let them complete bootstrap process

2. **Set Default Rules:**
   - `members_can_propose_rules = 0` (current behavior)
   - `members_can_create_documents = 0` (current behavior)
   - All other new rules = 0 (maintain current behavior)

3. **Allow Organizations to Vote:**
   - Organizations can now vote to enable member powers
   - Process is democratic and opt-in

### For New Organizations

1. **Start in Bootstrap Mode:**
   - `bootstrap_mode = 1`
   - Representatives have all powers initially
   - Members can propose rules (relaxed thresholds)

2. **Guide Through Bootstrap:**
   - UI shows bootstrap checklist
   - Suggests voting on core rules
   - Allows completion when ready

---

## Testing Strategy

### Unit Tests
- Permission calculation functions
- Minimum safeguard enforcement
- Bootstrap mode logic

### Integration Tests
- Complete bootstrap process
- Voting on new rule types
- Permission changes after rule updates
- Edge cases (no representatives, 100% threshold, etc.)

### Manual Testing
- Create new organization → go through bootstrap
- Vote on member powers → verify permissions change
- Test edge cases
- Verify safeguards prevent lockout

---

## Benefits of This Design

1. **True Democracy:** Organizations define their own governance
2. **Flexibility:** Can experiment with different models
3. **Sandbox:** Safe space to try different approaches
4. **Evolution:** Organizations can evolve their governance over time
5. **Transparency:** All rules are explicit and voteable
6. **Safeguards:** Minimum protections prevent lockout
7. **Bootstrap:** Clear path for new organizations

---

## Potential Concerns and Responses

### Concern: "Organizations might make bad decisions"

**Response:** That's the point - organizations learn from their choices. The system provides safeguards but doesn't prevent experimentation.

### Concern: "What if they vote to remove all representatives?"

**Response:** If members have powers to manage proposals, they can continue. If not, system enters recovery mode. Admins can intervene if needed.

### Concern: "This is too complex"

**Response:** Start with bootstrap mode (simple, like current system). Organizations can gradually enable more democratic features through voting.

### Concern: "What about security?"

**Response:** Minimum safeguards prevent dangerous configurations. System admins can always intervene. Audit trail tracks all changes.

---

## Next Steps

1. **Review and Refine:** Get feedback on this design
2. **Prioritize Features:** Decide which new rules to implement first
3. **Create Detailed Implementation Plan:** Break down into specific tasks
4. **Prototype:** Build minimal version to test concept
5. **Iterate:** Refine based on testing and feedback

---

## Questions to Consider

1. Should bootstrap mode be mandatory, or can organizations skip it?
2. What's the minimum set of rules that must be voted on before bootstrap completes?
3. Should there be a "constitution template" that organizations can start from?
4. How do we handle organizations that want to revert to representative-only model?
5. Should there be a "cooling off" period after major rule changes?
6. How do we prevent rule changes from being too frequent (governance churn)?

---

This design transforms the system from a fixed hierarchy to a democratic sandbox where organizations can experiment and evolve their governance models.

