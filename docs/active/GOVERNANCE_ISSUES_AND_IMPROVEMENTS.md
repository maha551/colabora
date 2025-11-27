# Organization Governance: Issues and Improvement Opportunities

## Critical Issues

### 1. **Permission Discrepancy Between Frontend and Backend**

**Location:**
- Frontend: `client/src/hooks/useOrganizationPermissions.ts:54`
- Backend: `server/routes/governance.js:591-594`

**Problem:**
- Frontend shows `canProposeRules = isRepresentative || isActiveMember` (allows members)
- Backend only allows representatives: `if (!isRep) return 403`
- **Impact:** UI shows "Create Proposal" button to members, but API rejects them
- **User Experience:** Confusing error message after filling out form

**Fix:**
- Align frontend permission check with backend: only show proposal creation to representatives
- Or: Implement member proposal workflow (members propose → representatives approve → voting starts)

---

### 2. **No Automatic Expiration Handling for Rule Proposals**

**Location:**
- `server/modules/scheduler.js` - only handles document deadlines
- `server/routes/governance.js` - no expiration logic

**Problem:**
- Rule proposals have `voting_ends_at` but no automatic expiration
- If voting deadline passes without completion, proposal stays `active` forever
- Representatives must manually complete expired proposals
- **Impact:** Stale proposals clutter the system, unclear voting status

**Fix:**
- Add expiration check to scheduler
- Auto-reject proposals where `voting_ends_at < NOW()` and `status = 'active'`
- Or: Auto-complete with current vote counts when deadline passes

---

### 3. **No Backend Validation of Proposed Rule Values**

**Location:**
- `server/routes/governance.js:857-1024` (complete endpoint)
- `server/routes/governance.js:583-715` (create endpoint)

**Problem:**
- Frontend validates values (e.g., `defaultAcceptanceThreshold` 1-100)
- Backend applies values without validation
- Malicious requests or API calls could set invalid values
- **Impact:** Could break system with invalid data (e.g., negative percentages, out-of-range values)

**Fix:**
- Add validation middleware or function
- Validate all rule values before applying:
  - Percentages: 0-1 or 0-100 (depending on field)
  - Integers: positive, within ranges
  - Enums: must be valid options
  - Booleans: must be boolean

---

### 4. **No Duplicate/Conflict Prevention**

**Location:**
- `server/routes/governance.js:583-715` (create proposal)

**Problem:**
- Representatives can create multiple proposals for the same rule field
- No check for existing `active` or `draft` proposals for the same field
- **Impact:** Confusion, conflicting proposals, unclear which one applies if both approved

**Fix:**
- Check for existing proposals with same `current_rule_field` and `status IN ('draft', 'active')`
- Reject new proposal or require cancelling existing one first
- Or: Allow multiple proposals but show warning in UI

---

### 5. **No Quorum Requirement for Rule Proposals**

**Location:**
- `server/routes/governance.js:878-882` (approval calculation)

**Problem:**
- Only checks approval percentage: `(votes_yes / total_votes) * 100 >= threshold`
- No minimum participation requirement
- 2 out of 100 members could approve a rule change (if both vote yes)
- **Impact:** Low participation can lead to unrepresentative rule changes

**Fix:**
- Add quorum check: `votes_cast >= (total_voters * quorum_percentage)`
- Use `default_quorum_percentage` from governance rules
- Reject if quorum not met, even if approval threshold is met

---

### 6. **Race Condition in Vote Completion**

**Location:**
- `server/routes/governance.js:857-1024` (complete endpoint)

**Problem:**
- Multiple representatives could call `complete` simultaneously
- No transaction or locking mechanism
- Could result in duplicate rule updates or inconsistent state
- **Impact:** Data corruption, duplicate audit logs

**Fix:**
- Use database transaction
- Add `WHERE status = 'active'` check in UPDATE to prevent double-completion
- Or: Use row-level locking or optimistic locking

---

### 7. **No Conflict Detection for Concurrent Rule Changes**

**Location:**
- `server/routes/governance.js:885-993` (rule update)

**Problem:**
- If Proposal A changes `defaultAcceptanceThreshold` to 80%
- And Proposal B (for same field) is approved later, it overwrites Proposal A
- No check if rule was changed since proposal was created
- **Impact:** Later proposals can silently overwrite earlier changes

**Fix:**
- Check `current_rule_value` matches actual current value before applying
- If mismatch, reject with message: "Rule has changed since proposal was created"
- Or: Show warning and require re-approval

---

### 8. **Inconsistent Status Values**

**Location:**
- Migration: `server/migrations/add-rule-proposal-tables.js:24` - includes `'expired'`
- Schema: `database_governance_migration.sql:354` - uses `'cancelled'` not `'expired'`
- Code: Uses `'draft', 'active', 'approved', 'rejected', 'cancelled'`

**Problem:**
- Migration file defines different statuses than actual schema
- `'expired'` status exists in migration but not used in code
- **Impact:** Confusion, potential bugs if code expects `'expired'` but schema doesn't allow it

**Fix:**
- Standardize on one set of status values
- Update migration or code to match
- Add `'expired'` status handling if needed

---

### 9. **No Validation of Rule Field Names**

**Location:**
- `server/routes/governance.js:889-913` (field name mapping)

**Problem:**
- If frontend sends invalid `ruleField`, mapping returns `fieldName` (unchanged)
- No validation that field exists in database schema
- Could cause SQL errors or silent failures
- **Impact:** Potential SQL injection or runtime errors

**Fix:**
- Validate `ruleField` against whitelist of allowed fields
- Reject proposal if field not in whitelist
- Log warning for unexpected field names

---

### 10. **Vote Count Updates Not Atomic**

**Location:**
- `server/routes/governance.js:1027-1048` (updateRuleProposalVoteCounts)

**Problem:**
- Vote counts updated separately from vote insertion
- If vote inserted but count update fails, counts are wrong
- No transaction wrapping
- **Impact:** Inaccurate vote counts, incorrect approval calculations

**Fix:**
- Wrap vote insertion and count update in transaction
- Or: Calculate counts on-the-fly from `governance_rule_proposal_votes` table
- Use `SELECT COUNT(*)` instead of maintaining separate counters

---

## Medium Priority Issues

### 11. **No Notification System for Rule Proposal Events**

**Problem:**
- Members aren't notified when:
  - New proposal created
  - Voting starts
  - Voting deadline approaching
  - Proposal approved/rejected
- **Impact:** Low participation, members miss important votes

**Fix:**
- Add email/notification system
- Notify all members when voting starts
- Send reminders before deadline
- Notify when proposal is completed

---

### 12. **No Proposal History/Versioning**

**Problem:**
- When rule is changed, old value is lost
- No history of what rules were changed when
- Can't see previous proposals for same field
- **Impact:** Difficult to audit, can't revert changes

**Fix:**
- Create `governance_rule_history` table
- Store old value, new value, proposal ID, timestamp
- Show history in UI
- Allow viewing previous proposals

---

### 13. **Hardcoded Voting Period**

**Location:**
- `server/routes/governance.js:731` - `14 * 24 * 60 * 60 * 1000` (14 days)

**Problem:**
- Voting period is hardcoded to 14 days
- Should be configurable per organization or proposal
- **Impact:** Inflexible, can't adjust for urgent vs. routine changes

**Fix:**
- Add `voting_period_days` to governance rules
- Allow override per proposal
- Use governance rule value as default

---

### 14. **No Proposal Cancellation by Creator**

**Problem:**
- Representatives can't cancel their own draft proposals
- Must wait for expiration or manual deletion
- **Impact:** Can't fix mistakes, clutter from abandoned proposals

**Fix:**
- Add `cancel` endpoint
- Allow creator to cancel `draft` proposals
- Or: Allow cancellation of `active` proposals (with notification to voters)

---

### 15. **Incomplete Error Messages**

**Location:**
- Various endpoints return generic errors

**Problem:**
- Errors like "Failed to create rule proposal" don't explain why
- No distinction between validation errors, permission errors, system errors
- **Impact:** Difficult to debug, poor user experience

**Fix:**
- Return specific error codes/messages
- Include validation details
- Log detailed errors server-side, return user-friendly messages

---

## Low Priority / Enhancement Opportunities

### 16. **No Proposal Templates**

**Problem:**
- Representatives must fill out proposal from scratch each time
- No common patterns or templates
- **Impact:** Time-consuming, inconsistent proposals

**Fix:**
- Create proposal templates for common changes
- Pre-fill common fields
- Allow saving custom templates

---

### 17. **No Proposal Discussion/Comments**

**Problem:**
- No way for members to discuss proposals before voting
- No Q&A or clarification
- **Impact:** Less informed voting, confusion about proposals

**Fix:**
- Add comments/discussion thread to proposals
- Allow members to ask questions
- Representatives can respond

---

### 18. **No Bulk Rule Changes**

**Problem:**
- Must create separate proposal for each rule field
- Can't propose multiple related changes together
- **Impact:** Slow process, many separate votes needed

**Fix:**
- Allow proposals with multiple rule changes
- Single vote on package of changes
- Or: Linked proposals that must all pass

---

### 19. **No Proposal Impact Preview**

**Problem:**
- Can't see what documents/votes would be affected by rule change
- No simulation or preview
- **Impact:** Unclear consequences, unexpected effects

**Fix:**
- Show affected documents count
- Preview how new documents would be created
- Show impact on existing votes

---

### 20. **No Representative Voting Weight**

**Problem:**
- All members vote equally
- No special weight for representatives
- **Impact:** May not reflect organizational hierarchy

**Fix:**
- Add `representative_vote_weight` to governance rules
- Representatives' votes count more
- Or: Require representative approval in addition to member approval

---

## Security Concerns

### 21. **SQL Injection Risk in Dynamic Updates**

**Location:**
- `server/routes/governance.js:925` - Dynamic SET clause construction

**Problem:**
- Field names are mapped but not sanitized
- If mapping fails, raw field name used in SQL
- **Impact:** Potential SQL injection if field name contains malicious SQL

**Fix:**
- Whitelist field names strictly
- Never use user input directly in SQL
- Validate against schema

---

### 22. **No Rate Limiting on Proposal Creation**

**Problem:**
- Representatives could spam proposals
- No limit on proposals per time period
- **Impact:** System abuse, spam, DoS

**Fix:**
- Add rate limiting: max N proposals per day/week
- Or: Require co-representative approval for multiple proposals

---

## Performance Issues

### 23. **No Indexing on Common Queries**

**Location:**
- `database_governance_migration.sql` - check indexes

**Problem:**
- May be missing indexes on:
  - `governance_rule_proposals(organization_id, status)`
  - `governance_rule_proposals(voting_ends_at)` for expiration checks
  - `governance_rule_proposal_votes(proposal_id, user_id)`

**Fix:**
- Add indexes for common query patterns
- Review query performance
- Add composite indexes where needed

---

### 24. **Vote Count Calculation**

**Problem:**
- Vote counts stored in proposal table (`votes_yes`, `votes_no`, etc.)
- Must be kept in sync with actual votes
- Could be calculated on-the-fly instead

**Fix:**
- Calculate counts from `governance_rule_proposal_votes` table
- Remove redundant count fields
- Or: Use triggers to keep counts updated

---

## Recommended Priority Order

1. **Critical (Fix Immediately):**
   - #1: Permission discrepancy
   - #3: Backend validation
   - #5: Quorum requirement
   - #6: Race condition fix

2. **High Priority (Fix Soon):**
   - #2: Expiration handling
   - #4: Duplicate prevention
   - #7: Conflict detection
   - #10: Atomic vote updates

3. **Medium Priority (Plan for Next Release):**
   - #11: Notifications
   - #12: History/versioning
   - #13: Configurable voting period
   - #15: Better error messages

4. **Low Priority (Future Enhancements):**
   - #16-20: UX improvements
   - #21-22: Security hardening
   - #23-24: Performance optimization

---

## Testing Gaps

### Missing Test Coverage

1. **Expiration scenarios** - No tests for expired proposals
2. **Concurrent voting** - No tests for race conditions
3. **Invalid values** - No tests for backend validation
4. **Duplicate proposals** - No tests for conflict prevention
5. **Quorum requirements** - No tests for quorum checks
6. **Permission edge cases** - No tests for member vs. representative differences

### Recommended Test Additions

- Integration tests for complete proposal lifecycle
- Load tests for concurrent vote completion
- Security tests for SQL injection and validation bypass
- Edge case tests (0 votes, 100% approval, etc.)

