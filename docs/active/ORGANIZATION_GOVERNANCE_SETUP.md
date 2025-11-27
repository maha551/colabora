# Organization Governance Setup Guide

## Overview

This document explains how organization governance is set up, how users and representatives interact with it, and how votes and rule changes are handled.

## 1. Organization Creation & Initial Setup

### Who Can Create Organizations?

**Only system administrators** can create organizations through the Admin Dashboard.

### Initial Setup Process

When an admin creates an organization (`server/routes/admin.js:53-268`):

1. **Organization Creation**
   - Admin provides:
     - Organization name and description
     - List of initial representatives (user IDs)
     - Membership policy (`open` or `invitation`)
     - Voting threshold (default: 0.5 = 50%)
     - Optional: Custom governance rules

2. **Default Governance Rules Created**
   - A complete set of governance rules is automatically created with defaults:
     ```javascript
     {
       representativeTermMonths: 12,
       electionVotingMethod: 'simple_majority',
       electionQuorumPercentage: 0.5,
       electionNoticeDays: 14,
       defaultVotingDeadlineHours: 168, // 7 days
       defaultQuorumPercentage: 0.5,
       documentProposalPeriodDays: 365,
       anonymousVotingEnabled: true,
       voteChangeAllowed: false,
       representativeCanCreateVotes: true,
       representativeCanInviteMembers: true,
       representativeCanManageDocuments: true,
       representativeApprovalRequired: true,
       tamperProofEnabled: true,
       auditTrailEnabled: true,
       thresholdCalculationMethod: 'all_votes',
       defaultAcceptanceThreshold: 75.0
     }
     ```

3. **Representatives Added as Members**
   - All initial representatives are automatically added as active members
   - They are stored in both:
     - `organizations.representatives` (JSON array of user IDs)
     - `organization_members` table (with `status = 'active'`)

## 2. User Roles & Permissions

### Role Hierarchy

1. **System Admin** (highest level)
   - Can create/delete organizations
   - Can access all organizations
   - Bypasses most permission checks

2. **Representative** (organization level)
   - Designated by admin during org creation
   - Can be added later by existing representatives
   - Has elevated permissions within their organization

3. **Active Member** (organization level)
   - Regular organization members
   - Can vote on proposals and elections
   - Limited management permissions

### Representative Powers

Representatives have the following capabilities (`client/src/hooks/useOrganizationPermissions.ts`):

**Document Management:**
- ✅ Create organizational documents
- ✅ View all documents
- ✅ Manage documents (if `representativeCanManageDocuments` is enabled)

**Member Management:**
- ✅ Invite new members (if `representativeCanInviteMembers` is enabled)
- ✅ Manage existing members
- ✅ View member list
- ✅ Nominate new representatives

**Governance:**
- ✅ Create rule proposals
- ✅ Start voting on rule proposals
- ✅ Complete/finalize rule proposal voting
- ✅ Create elections
- ✅ Manage governance rules (directly, if allowed)
- ✅ Vote in elections

**Other:**
- ✅ View analytics
- ✅ Export data
- ✅ Manage organization settings

### Active Member Powers

Active members can:

**Document Management:**
- ✅ View all documents
- ❌ Cannot create documents (only representatives can)

**Member Management:**
- ✅ View member list
- ❌ Cannot invite or manage members

**Governance:**
- ✅ Vote on rule proposals (once voting is started)
- ✅ Vote in elections
- ✅ View governance rules
- ❌ Cannot create rule proposals (only representatives can)
- ❌ Cannot start/complete voting

**Other:**
- ✅ View analytics
- ❌ Cannot export data

### Note on Rule Proposals

The permission hook shows `canProposeRules = isRepresentative || isActiveMember`, but the backend (`server/routes/governance.js:591-594`) **only allows representatives** to create rule proposals. This is a discrepancy - the UI might show the option, but the API will reject non-representatives.

## 3. Membership Management

### How Users Become Members

**Method 1: Initial Setup**
- Representatives are automatically added as members when the organization is created

**Method 2: Invitation** (`server/routes/organizations.js:458-618`)
- Representatives can invite users to join
- Invited users are added to `organization_members` with `status = 'active'`
- Requires `representativeCanInviteMembers` governance rule to be enabled

**Method 3: Open Membership Policy**
- If `membership_policy = 'open'`, users may be able to join without invitation (implementation may vary)

### How Representatives Are Added

**Initial:**
- Set by admin during organization creation

**Later:**
- Existing representatives can nominate new representatives (`server/routes/organizations.js:320-363`)
- The new representative is added to the `organizations.representatives` JSON array
- They are also added as active members if not already a member

## 4. Governance Rule Changes

### Rule Proposal Workflow

The process for changing governance rules follows a democratic voting process:

#### Step 1: Create Proposal (Representatives Only)

**Who:** Representatives only (`server/routes/governance.js:591-594`)

**Process:**
1. Representative selects a governance rule field to change
2. System fetches current value from `organization_governance_rules`
3. Representative proposes new value (or multiple options)
4. Proposal is created with `status = 'draft'`

**Fields that can be changed:**
- Representative term length and limits
- Election voting method and quorum
- Default voting deadlines and quorum
- Document proposal periods
- Acceptance thresholds
- Voting anonymity settings
- Representative powers (can create votes, invite members, etc.)
- Audit and tamper-proof settings

#### Step 2: Start Voting (Representatives Only)

**Who:** Representatives only (`server/routes/governance.js:724-728`)

**Process:**
1. Representative reviews the draft proposal
2. Clicks "Start Voting" to activate it
3. System:
   - Sets `status = 'active'`
   - Sets `voting_starts_at` to current time
   - Sets `voting_ends_at` to 14 days later
   - Counts total active members and sets `total_voters`
   - Default threshold: 75% approval required

#### Step 3: Members Vote (All Active Members)

**Who:** All active members (`server/routes/governance.js:793-796`)

**Process:**
1. Active members see the active proposal
2. They can vote:
   - `yes` - Approve the change
   - `no` - Reject the change
   - `abstain` - No opinion
3. If proposal has multiple options, members select an option and vote yes/no
4. Votes are tracked in `governance_rule_proposal_votes` table
5. Vote counts are updated in real-time on the proposal

**Voting Rules:**
- One vote per member per proposal
- Votes can be changed if `voteChangeAllowed` is enabled (for document votes, not rule proposals)
- Voting is anonymous if `anonymous_voting` is enabled (default: true)

#### Step 4: Complete Voting (Representatives Only)

**Who:** Representatives only (`server/routes/governance.js:864-867`)

**Process:**
1. Representative reviews voting results
2. Clicks "Complete Voting" to finalize
3. System calculates:
   - Total votes cast
   - Approval percentage: `(votes_yes / total_votes) * 100`
   - Compares to threshold (default: 75%)

4. **If Approved:**
   - Updates `organization_governance_rules` with new value
   - Sets proposal `status = 'approved'`
   - Sets `implemented_at` timestamp
   - **New documents** created after this point will use the new rule
   - **Existing documents** keep their original settings

5. **If Rejected:**
   - Sets proposal `status = 'rejected'`
   - No changes to governance rules
   - Proposal remains visible for historical record

### Rule Change Impact

**Important:** Rule changes affect:
- ✅ **New documents** created after the change
- ✅ **New votes** created after the change
- ✅ **Future elections** scheduled after the change
- ❌ **Existing documents** (keep their original settings)
- ❌ **Ongoing votes** (continue with original rules)

This ensures stability - documents and votes in progress aren't disrupted by rule changes.

## 5. Voting Mechanics

### Rule Proposal Voting

**Eligibility:**
- All active members can vote
- Representatives can vote
- System admins can vote

**Voting Period:**
- Default: 14 days from when voting starts
- Set by representative when starting voting

**Approval Threshold:**
- Default: 75% of votes cast must be "yes"
- Can be customized per proposal
- Higher threshold ensures significant consensus for rule changes

**Calculation:**
```
approval_rate = (votes_yes / total_votes_cast) * 100
approved = approval_rate >= threshold_percentage
```

### Document Proposal Voting

**Eligibility:**
- All active members of the organization
- Determined at document creation time

**Threshold Calculation:**
- Uses `threshold_calculation_method` from governance rules:
  - `all_votes`: Percentage of actual votes cast
  - `all_members`: Percentage of all eligible members

**Quorum:**
- Minimum voters required: `Math.ceil(total_members * default_quorum_percentage)`
- Document must meet both quorum AND approval threshold

**Acceptance Threshold:**
- From `default_acceptance_threshold` (default: 75%)
- Can be overridden per document (but not for organizational documents)

## 6. Key Database Tables

### `organizations`
- Core organization data
- `representatives`: JSON array of user IDs who are representatives

### `organization_members`
- Tracks membership
- `status`: 'active', 'legacy', or 'suspended'
- Links users to organizations

### `organization_governance_rules`
- One row per organization
- Contains all configurable governance settings
- Updated when rule proposals are approved

### `governance_rule_proposals`
- Stores rule change proposals
- `status`: 'draft', 'active', 'approved', 'rejected', 'cancelled'
- Tracks voting results

### `governance_rule_proposal_votes`
- Individual votes on rule proposals
- Links users to proposals with their vote choice

## 7. Security & Permissions

### Permission Checks

All governance endpoints check permissions:

1. **Authentication:** `requireAuth` middleware ensures user is logged in
2. **Representative Check:** `isRepresentative()` verifies user is in `organizations.representatives` array
3. **Member Check:** `isActiveMember()` verifies user has active membership
4. **Admin Override:** System admins bypass most checks

### Audit Trail

If `audit_trail_enabled` is true:
- All governance actions are logged
- Includes who performed the action, when, and what changed
- Stored in `audit_logs` table

## 8. Summary

**Organization Setup:**
- Admins create organizations with initial representatives
- Default governance rules are automatically created
- Representatives are added as active members

**User Roles:**
- **Admins:** Full system access
- **Representatives:** Can manage org, create proposals, start/complete voting
- **Active Members:** Can vote on proposals and elections, view content

**Rule Changes:**
1. Representative creates proposal (draft)
2. Representative starts voting (14-day period)
3. All active members vote
4. Representative completes voting
5. If approved, rules are updated (affects new documents/votes only)

**Key Principle:**
Rule changes are democratic (all members vote) but managed by representatives (who create, start, and finalize proposals). This balances democratic participation with organizational efficiency.

