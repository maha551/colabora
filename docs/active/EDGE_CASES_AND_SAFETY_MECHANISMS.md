# Edge Cases and Safety Mechanisms

## Overview

This document identifies dangerous edge cases in the democratic constitution system and proposes comprehensive safety mechanisms to prevent organizations from locking themselves out or creating unrecoverable states.

---

## Critical Edge Cases

### 1. Quorum Death Spiral

**Scenario:**
- Organization has 100 members
- Minimum quorum: 10% (10 members)
- Participation drops to 5 members
- Organization can never meet quorum → **permanent deadlock**

**Current Safeguard:** Minimum 10% quorum (too high for small/declining organizations)

**Enhanced Safeguards:**

1. **Dynamic Minimum Quorum Based on Active Members**
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
   ```

2. **Quorum Reduction Over Time**
   - If quorum not met for 3 consecutive votes → automatically reduce by 5%
   - Minimum floor: 1 member (for any organization)
   - Reset after successful vote

3. **Emergency Quorum Mode**
   - If no successful votes in 30 days → enter emergency mode
   - Emergency mode: quorum = 1 member (any active member can decide)
   - Requires admin notification
   - Auto-exit after first successful vote

**Implementation:**
- Add `emergency_quorum_mode` boolean to governance rules
- Add `last_successful_vote_at` timestamp
- Scheduler checks and activates emergency mode if needed

---

### 2. Voting Deadlock (Rules That Prevent Rule Changes)

**Scenario:**
- Organization votes: "Rule changes require 100% approval"
- One member always votes no
- Organization can never change rules again → **permanent deadlock**

**Current Safeguard:** Maximum 95% approval threshold

**Enhanced Safeguards:**

1. **Core Rules Cannot Be Changed to Deadlock Values**
   - `membersCanProposeRules` cannot be set to `false` if no representatives exist
   - `defaultQuorumPercentage` cannot be set above 95%
   - `defaultApprovalThreshold` cannot be set above 95%
   - System validates before applying rule changes

2. **Deadlock Detection**
   - Track failed proposals: if 5+ proposals fail due to threshold in 30 days → deadlock warning
   - System suggests lowering threshold
   - Representatives/members can vote to enter "deadlock resolution mode"

3. **Deadlock Resolution Mode**
   - Activated by vote (lower threshold: 30% approval)
   - Allows changing thresholds/quorums with relaxed requirements
   - Auto-exit after successful rule change
   - Requires admin notification

**Implementation:**
- Add `deadlock_resolution_mode` boolean
- Add `failed_proposals_count` and `last_failed_proposal_at` tracking
- Validation function checks for deadlock conditions before applying rules

---

### 3. Representative Removal During Bootstrap

**Scenario:**
- Organization in bootstrap mode
- All representatives leave or are removed
- No one can complete bootstrap → **stuck in bootstrap forever**

**Current Safeguard:** Recovery mode (vague)

**Enhanced Safeguards:**

1. **Bootstrap Auto-Completion on Representative Loss**
   - If `representatives.length === 0` during bootstrap:
     - Auto-complete bootstrap with most permissive defaults
     - Set `membersCanProposeRules = true`
     - Set `membersCanManageRuleProposals = true`
     - Set `membersCanCreateDocuments = true`
     - Notify all members and system admin

2. **Bootstrap Minimum Representatives**
   - Cannot remove last representative during bootstrap
   - System prevents removal if `representatives.length === 1` AND `bootstrap_mode = true`
   - Error: "Cannot remove last representative during bootstrap. Complete bootstrap first or add another representative."

3. **Bootstrap Timeout with Auto-Completion**
   - If bootstrap not completed in 90 days:
     - Auto-complete with current rules (or defaults if no rules set)
     - Notify organization
     - Log for admin review

**Implementation:**
- Add check in representative removal endpoint
- Add bootstrap auto-completion function
- Scheduler checks bootstrap timeout

---

### 4. Rule Change During Active Vote

**Scenario:**
- Proposal A is voting (requires 50% approval)
- Proposal B changes approval threshold to 75%
- Proposal B is approved
- Proposal A now requires 75% but was started with 50% → **inconsistent state**

**Current Safeguard:** None

**Enhanced Safeguards:**

1. **Lock Rules During Active Votes**
   - When proposal starts voting, snapshot current rules
   - Store `snapshot_rules` JSON in proposal record
   - Use snapshot rules for approval calculation, not current rules
   - Rules can change, but active votes use their snapshot

2. **Rule Change Conflict Detection**
   - Before applying rule change, check for active proposals using that rule
   - Show warning: "X active proposals will continue using old rule value"
   - Allow override (with confirmation)
   - Log conflict for audit

3. **Proposal Rule Validation**
   - When completing proposal, validate that snapshot rules still make sense
   - If rule changed significantly, require re-confirmation
   - Example: If quorum changed from 10% to 50%, old votes might be invalid

**Implementation:**
- Add `snapshot_rules` JSON field to `governance_rule_proposals` table
- Store rules when voting starts
- Use snapshot in completion calculation

---

### 5. Cascading Rule Changes (Dependency Chains)

**Scenario:**
- Organization votes: `membersCanCreateDocuments = true`
- Then votes: `representativeCanManageDocuments = false`
- Then votes: `membersCanCreateDocuments = false`
- Now no one can create documents → **broken state**

**Current Safeguard:** None

**Enhanced Safeguards:**

1. **Rule Dependency Validation**
   - Before applying rule change, check if it creates impossible state
   - Example: Cannot set `membersCanCreateDocuments = false` if `representativeCanManageDocuments = false` AND no representatives exist
   - Reject with clear error: "This change would make it impossible to create documents. At least one group (members or representatives) must be able to create documents."

2. **Rule Conflict Matrix**
   ```javascript
   const ruleConflicts = {
     membersCanCreateDocuments: {
       requires: [
         { or: ['representativeCanManageDocuments', 'membersCanCreateDocuments'] },
         { and: ['atLeastOneRepresentative', 'representativeCanManageDocuments'] }
       ]
     },
     membersCanProposeRules: {
       requires: [
         { or: ['membersCanProposeRules', 'atLeastOneRepresentative'] }
       ]
     }
     // ... more rules
   };
   ```

3. **UI Warnings**
   - Show warnings when proposing changes that would create conflicts
   - Suggest alternative configurations
   - Require explicit confirmation for dangerous changes

**Implementation:**
- Create `validateRuleDependencies()` function
- Check before applying rule changes
- Return clear error messages

---

### 6. Zero Participation (No One Votes)

**Scenario:**
- Organization has 50 members
- Proposal created, voting starts
- No one votes for 30 days
- Proposal expires but nothing happens → **stale proposals accumulate**

**Current Safeguard:** Expiration handling (planned)

**Enhanced Safeguards:**

1. **Automatic Expiration with Notification**
   - If no votes cast after 7 days → send reminder to all members
   - If still no votes after 14 days → send urgent reminder
   - If no votes after voting deadline → auto-expire with "no participation" status
   - Log for analysis

2. **Participation Tracking**
   - Track `votes_cast` vs `total_voters` over time
   - If participation consistently < 20% → enter "low participation mode"
   - Low participation mode: longer voting periods, more reminders, lower thresholds

3. **Proposal Cancellation**
   - Creator can cancel proposal if no votes after 3 days
   - System can auto-cancel proposals with 0 votes after deadline
   - Clear status: "expired_no_participation"

**Implementation:**
- Add expiration handling to scheduler
- Add notification system for low participation
- Add auto-cancellation logic

---

### 7. Maximum Rule Change Frequency (Governance Churn)

**Scenario:**
- Organization changes rules every week
- Constant voting on governance
- No stability → **governance fatigue**

**Current Safeguard:** None

**Enhanced Safeguards:**

1. **Cooldown Period After Rule Changes**
   - After rule is changed, 7-day cooldown before same rule can be changed again
   - Prevents rapid back-and-forth changes
   - Exception: Emergency mode or deadlock resolution

2. **Rule Change Rate Limiting**
   - Maximum 3 rule changes per month (configurable)
   - After limit, require higher approval threshold (75% instead of 50%)
   - Reset counter monthly

3. **Stability Bonus**
   - If no rule changes for 90 days → "stable governance" status
   - Stable organizations get priority support, badges, etc.
   - Encourages thoughtful, infrequent changes

**Implementation:**
- Add `last_rule_change_at` and `rule_changes_this_month` tracking
- Add cooldown check in proposal creation
- Add rate limiting logic

---

### 8. Recovery Mode Triggers and Procedures

**Scenario:** Organization locks itself out through bad rule choices

**Current Safeguard:** Vague "recovery mode"

**Enhanced Safeguards:**

1. **Automatic Recovery Mode Triggers**
   - No representatives AND `membersCanManageRuleProposals = false`
   - No successful votes in 60 days
   - Quorum consistently unmet for 30 days
   - Bootstrap mode > 90 days without completion
   - System detects and enters recovery mode automatically

2. **Recovery Mode Rules**
   - All active members can propose rule changes
   - All active members can manage proposals
   - Minimum quorum: 1 member
   - Minimum approval: 30% (lowered from 50%)
   - Minimum voting period: 12 hours (reduced from 24)
   - Maximum 3 rule changes allowed in recovery mode
   - Auto-exit after first successful rule change

3. **Recovery Mode UI**
   - Clear banner: "Organization in Recovery Mode"
   - Explanation of why
   - Steps to exit recovery mode
   - Admin contact information

4. **Admin Intervention**
   - System notifies admins when recovery mode activates
   - Admins can manually exit recovery mode
   - Admins can reset rules to safe defaults
   - All admin actions logged and audited

**Implementation:**
- Add `recovery_mode` boolean to governance rules
- Add `recovery_mode_entered_at` timestamp
- Add `recovery_mode_reason` text field
- Scheduler checks and activates recovery mode
- Create recovery mode permission functions

---

### 9. Data Integrity and Corruption

**Scenario:**
- Governance rules corrupted (invalid JSON, null values, etc.)
- System cannot read rules → **broken permissions**

**Current Safeguard:** None

**Enhanced Safeguards:**

1. **Rule Validation on Read**
   - Always validate rules when reading from database
   - If invalid, fall back to safe defaults
   - Log corruption event
   - Notify admins

2. **Rule Validation on Write**
   - Validate all rule values before saving
   - Reject invalid values with clear errors
   - Use database constraints where possible

3. **Rule Backup and Restore**
   - Store rule history in `governance_rule_history` table
   - Can restore previous version if corruption detected
   - Admin can manually restore from history

4. **Default Rules Fallback**
   ```javascript
   const SAFE_DEFAULT_RULES = {
     membersCanProposeRules: false,
     membersCanCreateDocuments: false,
     membersCanInitializeElections: false,
     membersCanInviteMembers: false,
     membersCanManageRuleProposals: false,
     defaultQuorumPercentage: 0.5,
     defaultApprovalThreshold: 0.5,
     minimumQuorumPercentage: 0.1,
     minimumApprovalThreshold: 0.5,
     minimumVotingPeriodHours: 24,
     bootstrapMode: false
   };
   ```

**Implementation:**
- Add validation function for all rule reads
- Add rule history table
- Add restore functionality
- Add corruption detection and logging

---

### 10. Concurrent Rule Changes (Race Conditions)

**Scenario:**
- Two proposals change the same rule simultaneously
- Both approved → **conflicting values**

**Current Safeguard:** Duplicate prevention (one active proposal per rule)

**Enhanced Safeguards:**

1. **Stricter Duplicate Prevention**
   - Cannot create proposal for rule that has ANY proposal (draft, active, or recently completed)
   - "Recently completed" = within 7 days (cooldown period)
   - Clear error: "A proposal for this rule was recently completed. Wait 7 days or create a proposal to change a different aspect."

2. **Proposal Priority**
   - If multiple proposals exist (shouldn't happen, but safety):
     - Active proposals take priority over draft
     - Earlier proposals take priority over later
     - System warns and requires resolution

3. **Transaction Locking**
   - Use database transactions for rule updates
   - Lock row during update
   - Prevent concurrent updates

**Implementation:**
- Enhance duplicate check to include recently completed proposals
- Add transaction locking to rule update endpoint
- Add conflict resolution UI

---

### 11. Member Exclusion and Voting Rights

**Scenario:**
- Organization votes to exclude certain members from voting
- Or: Organization votes to require "premium membership" to vote
- Creates inequality → **undemocratic**

**Current Safeguard:** All active members can vote (hardcoded)

**Enhanced Safeguards:**

1. **Voting Rights Cannot Be Restricted**
   - All active members ALWAYS have voting rights
   - Cannot vote to exclude members from voting
   - System enforces: `canVote = isActiveMember` (always true)
   - This is a fundamental safeguard

2. **Proposal Creation Rights Can Be Restricted**
   - Organizations CAN vote on who can create proposals
   - But voting itself is universal
   - Clear distinction in UI

3. **Member Status Changes**
   - Cannot suspend/remove members to prevent voting
   - Last active member cannot be removed
   - Member removal requires separate process (not through rule changes)

**Implementation:**
- Enforce voting rights in all vote endpoints
- Add validation that prevents rule changes affecting voting rights
- Clear documentation of universal voting rights

---

### 12. Bootstrap Never Completed

**Scenario:**
- Organization stays in bootstrap mode indefinitely
- Representatives don't complete it
- Members don't know how → **confusion**

**Current Safeguard:** 90-day timeout

**Enhanced Safeguards:**

1. **Bootstrap Progress Tracking**
   - Track which core rules have been voted on
   - Show progress bar: "2 of 3 core rules completed"
   - Suggest next steps

2. **Bootstrap Completion Checklist**
   - UI shows checklist:
     - [ ] Vote on who can propose rules
     - [ ] Vote on who can create documents
     - [ ] Vote on voting thresholds
   - Auto-complete when all checked

3. **Bootstrap Reminders**
   - Weekly reminder if bootstrap not completed
   - Escalating urgency (friendly → urgent)
   - Admin notification after 60 days

4. **Bootstrap Auto-Completion Options**
   - Option 1: Use current rules (if any set)
   - Option 2: Use safe defaults
   - Option 3: Extend bootstrap period (requires vote)

**Implementation:**
- Add bootstrap progress tracking
- Add checklist UI component
- Add reminder system
- Enhance auto-completion logic

---

## Safety Mechanism Summary

### Automatic Safeguards (System-Enforced)

1. **Dynamic Minimum Quorum** - Adjusts based on organization size
2. **Maximum Approval Threshold** - 95% cap prevents deadlock
3. **Rule Dependency Validation** - Prevents impossible states
4. **Rule Snapshot on Vote Start** - Prevents mid-vote rule changes
5. **Cooldown Periods** - Prevents governance churn
6. **Automatic Recovery Mode** - Activates on deadlock detection
7. **Data Integrity Checks** - Validates rules on read/write
8. **Universal Voting Rights** - All active members can always vote

### Manual Safeguards (Admin-Controlled)

1. **Admin Override** - Emergency intervention capability
2. **Rule History Restore** - Can revert to previous rule versions
3. **Recovery Mode Exit** - Admins can manually exit recovery
4. **Bootstrap Completion** - Admins can force complete bootstrap

### User Safeguards (Organization-Controlled)

1. **Deadlock Resolution Mode** - Organizations can vote to enter
2. **Emergency Quorum Mode** - Activates after failed votes
3. **Proposal Cancellation** - Creators can cancel stale proposals
4. **Bootstrap Extension** - Can vote to extend bootstrap period

---

## Implementation Priority

### Phase 1: Critical Safety (Must Have)
1. Dynamic minimum quorum
2. Rule dependency validation
3. Rule snapshot on vote start
4. Recovery mode triggers
5. Data integrity checks

### Phase 2: Important Safety (Should Have)
6. Deadlock detection
7. Bootstrap auto-completion
8. Cooldown periods
9. Automatic expiration
10. Universal voting rights enforcement

### Phase 3: Nice to Have (Could Have)
11. Participation tracking
12. Governance churn prevention
13. Bootstrap progress tracking
14. Rule change rate limiting

---

## Testing Strategy

### Edge Case Tests
- [ ] Test quorum death spiral (declining participation)
- [ ] Test voting deadlock (100% threshold)
- [ ] Test representative removal during bootstrap
- [ ] Test rule change during active vote
- [ ] Test cascading rule changes
- [ ] Test zero participation
- [ ] Test concurrent rule changes
- [ ] Test data corruption recovery
- [ ] Test recovery mode activation
- [ ] Test bootstrap timeout

### Safety Mechanism Tests
- [ ] Test dynamic quorum calculation
- [ ] Test rule dependency validation
- [ ] Test rule snapshot functionality
- [ ] Test cooldown enforcement
- [ ] Test recovery mode rules
- [ ] Test data integrity validation
- [ ] Test admin override functionality

---

This comprehensive safety framework ensures organizations can experiment with governance while maintaining system stability and recoverability.

