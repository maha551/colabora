# 🧪 Comprehensive Testing Checklist

**Date:** 2025-01-27  
**Status:** Pre-Release Testing Phase

---

## ✅ **Core Functionality Tests**

### 1. **Document Creation & Basic Workflow**
- [ ] **Create Personal Document**
  - [ ] Create document with title and description
  - [ ] Verify document appears in documents list
  - [ ] Verify document has correct ownership type
  - [ ] Verify user is added as collaborator automatically

- [ ] **Create Organizational Document**
  - [ ] Create document within an organization
  - [ ] Verify document starts with `status = 'proposal'`
  - [ ] Verify all organization members are added as collaborators
  - [ ] Verify document is linked to organization
  - [ ] Verify document has correct deadlines set (proposal_deadline, paragraph_proposals_cutoff)
  - [ ] Verify document appears in organization's documents tab

- [ ] **Create Shared Document**
  - [ ] Create document with multiple contributors
  - [ ] Verify all contributors are added as collaborators
  - [ ] Verify document appears for all contributors

---

### 2. **Organizational Document Workflow**

#### **Phase 1: Proposal Period**
- [ ] **Paragraph Proposals**
  - [ ] Add paragraph proposals during proposal period
  - [ ] Vote on paragraph proposals (PRO/NEUTRAL/CONTRA)
  - [ ] Verify votes are counted correctly
  - [ ] Verify proposal cutoff date is set correctly
  - [ ] Verify paragraph proposals are disabled after cutoff date
  - [ ] Verify WebSocket updates when proposals are added/voted on

- [ ] **Proposal Cutoff**
  - [ ] Wait for or manually trigger proposal cutoff
  - [ ] Verify paragraph proposal creation is disabled after cutoff
  - [ ] Verify document status transitions to `voting`
  - [ ] Verify `voting_started_at` is set
  - [ ] Verify `min_voters_required` is calculated correctly
  - [ ] Verify WebSocket broadcast for `proposal-cutoff-reached`

#### **Phase 2: Voting Period**
- [ ] **Document-Level Voting**
  - [ ] Vote on document (PRO/NEUTRAL/CONTRA)
  - [ ] Verify votes are counted correctly
  - [ ] Verify voting status is displayed correctly
  - [ ] Verify vote counts update in real-time via WebSocket
  - [ ] Verify voting deadline is displayed
  - [ ] Verify minimum voters required is displayed

- [ ] **Voting Deadline**
  - [ ] Wait for or manually trigger voting deadline
  - [ ] Verify document status transitions to `agreed` or `rejected`
  - [ ] Verify status transition based on:
    - Quorum met (min_voters_required)
    - Approval threshold met (acceptance_threshold)
  - [ ] Verify `adopted_at` is set when document is agreed
  - [ ] Verify WebSocket broadcast for `document-status-changed`

#### **Phase 3: Final States**
- [ ] **Agreed Document**
  - [ ] Verify document status is `agreed`
  - [ ] Verify document cannot be edited (or editing is restricted)
  - [ ] Verify agreed view shows final content
  - [ ] Verify status history is recorded

- [ ] **Rejected Document**
  - [ ] Create scenario where document is rejected (quorum not met or threshold not reached)
  - [ ] Verify document status is `rejected`
  - [ ] Verify appropriate message is displayed
  - [ ] Verify status history is recorded

- [ ] **Expired Document**
  - [ ] Create scenario where document expires (no activity during proposal period)
  - [ ] Verify document status is `expired`
  - [ ] Verify appropriate message is displayed

---

### 3. **Document Deletion Workflow**

- [ ] **Propose Deletion**
  - [ ] As representative, propose document deletion
  - [ ] Verify deletion proposal is created
  - [ ] Verify `deletion_proposed_at` is set
  - [ ] Verify `deletion_vote_deadline` is set
  - [ ] Verify WebSocket broadcast for `deletion-proposed`
  - [ ] Verify deletion proposal UI is displayed

- [ ] **Vote on Deletion**
  - [ ] As organization member, vote on deletion (PRO/NEUTRAL/CONTRA)
  - [ ] Verify votes are counted correctly
  - [ ] Verify vote counts update in real-time via WebSocket
  - [ ] Verify WebSocket broadcast for `deletion-vote`

- [ ] **Deletion Deadline**
  - [ ] Wait for or manually trigger deletion deadline
  - [ ] If approved: Verify document is deleted
  - [ ] If rejected: Verify deletion proposal is cancelled
  - [ ] Verify WebSocket broadcast for `document-deleted` or `deletion-cancelled`

- [ ] **Cancel Deletion Proposal**
  - [ ] As proposer, cancel deletion proposal
  - [ ] Verify deletion proposal is removed
  - [ ] Verify WebSocket broadcast for `deletion-cancelled`

---

### 4. **Rule Proposals**

- [ ] **Create Rule Proposal**
  - [ ] As representative, create rule proposal
  - [ ] Test creating proposals for different governance rule fields:
    - [ ] `anonymousVotingEnabled`
    - [ ] `voteChangeAllowed`
    - [ ] `defaultQuorumPercentage`
    - [ ] `threshold_calculation_method`
    - [ ] `default_acceptance_threshold`
    - [ ] `proposalPeriodDays`
  - [ ] Test creating proposal with multiple options
  - [ ] Verify rule proposal is created correctly

- [ ] **Vote on Rule Proposal**
  - [ ] As organization member, vote on rule proposal
  - [ ] Verify votes are counted correctly
  - [ ] Verify vote counts update in real-time
  - [ ] Verify WebSocket broadcast for rule proposal votes

- [ ] **Complete Rule Proposal**
  - [ ] Wait for or manually trigger rule proposal completion
  - [ ] If approved: Verify governance rules are updated
  - [ ] Verify new rules apply to newly created documents
  - [ ] Verify WebSocket broadcast for `rule-proposal-approved`

---

### 5. **WebSocket Real-Time Updates**

- [ ] **Document Updates**
  - [ ] Open document in two browser windows (different users)
  - [ ] Add paragraph proposal in one window
  - [ ] Verify other window updates in real-time
  - [ ] Vote on proposal in one window
  - [ ] Verify other window updates in real-time

- [ ] **Status Changes**
  - [ ] Trigger status change (proposal → voting → agreed)
  - [ ] Verify all connected clients receive update
  - [ ] Verify UI updates correctly in all windows

- [ ] **Deletion Proposals**
  - [ ] Propose deletion in one window
  - [ ] Verify other windows show deletion proposal
  - [ ] Vote on deletion in one window
  - [ ] Verify other windows update vote counts

- [ ] **Rule Proposals**
  - [ ] Create rule proposal in one window
  - [ ] Verify other windows show rule proposal
  - [ ] Vote on rule proposal in one window
  - [ ] Verify other windows update vote counts

---

### 6. **Permission & Access Control**

- [ ] **Admin Permissions**
  - [ ] Admin can create organizations
  - [ ] Admin can view all organizations
  - [ ] Admin can manage organization members
  - [ ] Admin CANNOT create/edit documents (only manage orgs)
  - [ ] Admin CANNOT vote on documents

- [ ] **Representative Permissions**
  - [ ] Representative can create organizational documents
  - [ ] Representative can propose document deletion
  - [ ] Representative can create rule proposals
  - [ ] Representative can manage organization members
  - [ ] Representative can update governance rules

- [ ] **Member Permissions**
  - [ ] Member can view organizational documents
  - [ ] Member can add paragraph proposals
  - [ ] Member can vote on paragraph proposals
  - [ ] Member can vote on document-level votes
  - [ ] Member can vote on deletion proposals
  - [ ] Member can vote on rule proposals
  - [ ] Member CANNOT create documents (unless also representative)
  - [ ] Member CANNOT propose deletion (unless also representative)

- [ ] **Document Access**
  - [ ] User can only access documents they own or are collaborators on
  - [ ] Organization members can access all organizational documents
  - [ ] Non-members cannot access organizational documents

---

### 7. **Scheduler & Background Jobs**

- [ ] **Proposal Cutoff Monitoring**
  - [ ] Create document with proposal cutoff in the past
  - [ ] Run scheduler
  - [ ] Verify document transitions to `voting` status
  - [ ] Verify `voting_started_at` is set
  - [ ] Verify paragraph proposals are disabled

- [ ] **Voting Deadline Monitoring**
  - [ ] Create document in `voting` status with deadline in the past
  - [ ] Run scheduler
  - [ ] Verify document transitions to `agreed` or `rejected`
  - [ ] Verify status is based on quorum and threshold

- [ ] **Deletion Deadline Monitoring**
  - [ ] Create deletion proposal with deadline in the past
  - [ ] Run scheduler
  - [ ] Verify document is deleted if approved
  - [ ] Verify deletion proposal is cancelled if rejected

---

### 8. **UI/UX Tests**

- [ ] **Organizational Document Status Display**
  - [ ] Verify status is displayed correctly
  - [ ] Verify deadlines are displayed correctly
  - [ ] Verify countdown timers work (if implemented)
  - [ ] Verify status history is accessible

- [ ] **Voting Interface**
  - [ ] Verify voting buttons work correctly
  - [ ] Verify vote counts are displayed correctly
  - [ ] Verify progress bars/indicators work
  - [ ] Verify disabled states (after cutoff, after deadline)

- [ ] **Document Creation Modal**
  - [ ] Verify all fields are present
  - [ ] Verify governance rule defaults are applied
  - [ ] Verify validation works correctly
  - [ ] Verify error messages are clear

- [ ] **Deletion Proposal UI**
  - [ ] Verify deletion proposal is visible
  - [ ] Verify voting interface works
  - [ ] Verify cancel button works (for proposer)

- [ ] **Rule Proposal UI**
  - [ ] Verify rule proposal creation form
  - [ ] Verify voting interface
  - [ ] Verify rule proposal history

---

### 9. **Error Handling & Edge Cases**

- [ ] **Invalid Inputs**
  - [ ] Try to create document with empty title
  - [ ] Try to create document with title > 200 characters
  - [ ] Try to create document with invalid organization ID
  - [ ] Verify appropriate error messages

- [ ] **Concurrent Updates**
  - [ ] Multiple users vote simultaneously
  - [ ] Multiple users add proposals simultaneously
  - [ ] Verify no race conditions
  - [ ] Verify data consistency

- [ ] **Network Issues**
  - [ ] Disconnect network during vote
  - [ ] Reconnect network
  - [ ] Verify vote is saved/retried
  - [ ] Verify UI updates correctly

- [ ] **Database Edge Cases**
  - [ ] Organization with no members
  - [ ] Document with no proposals
  - [ ] Document with all votes abstained
  - [ ] Document with exactly threshold votes

---

### 10. **Performance Tests**

- [ ] **Large Documents**
  - [ ] Create document with 100+ paragraphs
  - [ ] Verify performance is acceptable
  - [ ] Verify UI remains responsive

- [ ] **Many Users**
  - [ ] Organization with 50+ members
  - [ ] All members vote simultaneously
  - [ ] Verify performance is acceptable

- [ ] **WebSocket Connections**
  - [ ] 10+ users connected to same document
  - [ ] All users perform actions simultaneously
  - [ ] Verify WebSocket performance is acceptable

---

## 🐛 **Known Issues to Verify Fixed**

- [ ] Policy votes endpoint returns 410 (deprecated) - should not break UI
- [ ] Analytics endpoint returns 500 - should handle gracefully
- [ ] Document creation validation errors - should show clear messages
- [ ] WebSocket disconnection issues - should reconnect automatically

---

## 📋 **Quick Smoke Test (5 minutes)**

1. [ ] Login as admin
2. [ ] Create organization
3. [ ] Add yourself as representative
4. [ ] Create organizational document
5. [ ] Add paragraph proposal
6. [ ] Vote on proposal
7. [ ] Verify WebSocket updates work
8. [ ] Verify document status displays correctly

---

## 🎯 **Priority Testing Order**

### **Critical (Must Test First)**
1. Document creation (personal, organizational, shared)
2. Organizational document workflow (proposal → voting → agreed)
3. Document deletion workflow
4. Permission checks (admin, representative, member)

### **Important (Test Next)**
5. Rule proposals
6. WebSocket real-time updates
7. Scheduler/background jobs
8. Error handling

### **Nice to Have (Test Last)**
9. Performance with large datasets
10. Edge cases
11. UI polish

---

## 📝 **Test Results Template**

For each test, record:
- ✅ Pass / ❌ Fail / ⚠️ Partial
- Browser/OS tested on
- Any errors or issues found
- Screenshots if applicable

---

## 🔍 **What to Look For**

### **Success Indicators:**
- ✅ No console errors
- ✅ Features work as described
- ✅ Real-time updates work correctly
- ✅ Status transitions happen automatically
- ✅ Permissions are enforced correctly
- ✅ Error messages are clear and helpful

### **Failure Indicators:**
- ❌ 500 errors in server console
- ❌ 400/403 errors when actions should succeed
- ❌ WebSocket disconnections
- ❌ Status transitions not happening
- ❌ Votes not counting correctly
- ❌ UI not updating in real-time

---

## 🚀 **After Testing**

1. Document all bugs found
2. Prioritize fixes (critical, important, nice-to-have)
3. Fix critical bugs first
4. Re-test after fixes
5. Document any remaining known issues

