# WebSocket Implementation Status & New Features Requirements

**Date:** 2025-01-27  
**Status:** Existing features ✅ Complete | New features ⚠️ Need Implementation

---

## ✅ **Current WebSocket Implementation - COMPLETE**

### **What's Working:**

1. **WebSocket Infrastructure** ✅
   - Server: `server/modules/websocket.js` - WebSocketManager class
   - Client: `client/src/hooks/useWebSocket.ts` - React hook
   - Connection management, authentication, reconnection all working
   - Room-based subscriptions (`document-{documentId}`)

2. **Document-Level Real-Time Updates** ✅
   - ✅ **Votes** (proposal-level) - Broadcasts instantly
   - ✅ **Comments** - Broadcasts instantly
   - ✅ **Proposals** - Broadcasts instantly
   - ✅ **Paragraph Updates** (agreed view) - Broadcasts instantly
   - ✅ **Document-Level Votes** - Broadcasts instantly

3. **Client-Side Handling** ✅
   - All event types handled in `App.tsx`
   - Instant UI updates without page reload
   - Proper state management
   - Duplicate prevention

---

## ⚠️ **Missing WebSocket Support for New Features**

### **1. Document Status Changes** ❌

**What's Missing:**
- No WebSocket broadcast when document status changes:
  - `proposal` → `voting`
  - `voting` → `agreed`
  - `voting` → `rejected`
  - `proposal` → `expired`

**Where to Add:**
- `server/modules/document-status.js` - Status transition functions
- `server/modules/scheduler.js` - Deadline monitoring jobs

**Event Type Needed:**
```javascript
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
```

**Client Handler Needed:**
- Update document status in UI
- Show status change notification
- Update deadline displays

---

### **2. Document Deletion Proposals** ❌

**What's Missing:**
- No WebSocket broadcast when:
  - Deletion is proposed
  - Deletion vote is cast
  - Deletion is approved/rejected
  - Deletion proposal is cancelled

**Where to Add:**
- `server/routes/documents.js` - New deletion endpoints

**Event Types Needed:**
```javascript
// Deletion proposed
{
  eventType: 'deletion-proposed',
  documentId: '...',
  data: {
    proposedBy: userId,
    deadline: '...',
    reason: '...'
  }
}

// Deletion vote cast
{
  eventType: 'deletion-vote',
  documentId: '...',
  data: {
    vote: { userId, vote: 'PRO' | 'CONTRA' },
    allVotes: [...],
    quorumProgress: 0.5,
    approvalProgress: 0.75
  }
}

// Deletion approved/rejected
{
  eventType: 'deletion-completed',
  documentId: '...',
  data: {
    approved: true/false,
    reason: '...'
  }
}
```

**Client Handler Needed:**
- Show deletion proposal status
- Update deletion vote counts
- Handle document removal if approved

---

### **3. Rule Proposals** ❌

**What's Missing:**
- No WebSocket broadcast for rule proposal updates
- Organization-level subscriptions not implemented

**Where to Add:**
- `server/routes/governance.js` - Rule proposal endpoints

**Event Types Needed:**
```javascript
// Rule proposal created
{
  eventType: 'rule-proposal-created',
  organizationId: '...',
  data: {
    proposalId: '...',
    ruleField: 'anonymousVotingEnabled',
    currentValue: true,
    proposedValue: false
  }
}

// Rule proposal vote cast
{
  eventType: 'rule-proposal-vote',
  organizationId: '...',
  data: {
    proposalId: '...',
    vote: { userId, vote: 'yes' | 'no' | 'abstain' },
    voteCounts: { yes: 5, no: 2, abstain: 1 }
  }
}

// Rule proposal completed
{
  eventType: 'rule-proposal-completed',
  organizationId: '...',
  data: {
    proposalId: '...',
    approved: true,
    ruleField: 'anonymousVotingEnabled',
    newValue: false
  }
}
```

**Client Handler Needed:**
- Update rule proposal lists
- Show voting progress
- Update governance rules display when approved

**New Subscription Type Needed:**
- Organization-level rooms: `organization-{organizationId}`
- Subscribe when viewing organization management page

---

### **4. Proposal Cutoff** ❌

**What's Missing:**
- No WebSocket broadcast when paragraph proposals are disabled (cutoff reached)

**Where to Add:**
- `server/modules/scheduler.js` - Proposal cutoff check job

**Event Type Needed:**
```javascript
{
  eventType: 'proposal-cutoff',
  documentId: '...',
  data: {
    proposalsLocked: true,
    message: 'New proposals are now disabled',
    cutoffDate: '...'
  }
}
```

**Client Handler Needed:**
- Disable "Add Suggestion" button
- Show cutoff message
- Update UI to indicate proposals are locked

---

## 🔧 **Implementation Requirements**

### **Backend Changes Needed:**

1. **Add Organization-Level Subscriptions**
   ```javascript
   // In websocket.js
   socket.on('subscribe-organization', (organizationId) => {
     socket.join(`organization-${organizationId}`);
   });
   
   socket.on('unsubscribe-organization', (organizationId) => {
     socket.leave(`organization-${organizationId}`);
   });
   ```

2. **Add Broadcast Methods**
   ```javascript
   // In websocket.js
   broadcastOrganizationUpdate(organizationId, eventType, data) {
     this.io.to(`organization-${organizationId}`).emit('organization-update', {
       organizationId,
       eventType,
       data,
       timestamp: new Date().toISOString()
     });
   }
   ```

3. **Add Broadcasts in Status Transitions**
   - `server/modules/document-status.js` - All transition functions
   - `server/modules/scheduler.js` - Deadline check jobs

4. **Add Broadcasts in Deletion Endpoints**
   - `server/routes/documents.js` - New deletion endpoints

5. **Add Broadcasts in Rule Proposal Endpoints**
   - `server/routes/governance.js` - Rule proposal endpoints

### **Frontend Changes Needed:**

1. **Add Organization Subscription Hook**
   ```typescript
   // New hook or extend useWebSocket
   useOrganizationWebSocket({
     organizationId,
     userId,
     authToken,
     onOrganizationUpdate
   })
   ```

2. **Add Client Handlers in App.tsx**
   - Document status change handler
   - Deletion proposal handlers
   - Rule proposal handlers
   - Proposal cutoff handler

3. **Update Organization Management Components**
   - Subscribe to organization updates
   - Handle rule proposal updates
   - Update UI in real-time

---

## 📋 **Implementation Checklist**

### **Backend:**
- [ ] Add organization-level subscription support to WebSocketManager
- [ ] Add `broadcastOrganizationUpdate()` method
- [ ] Add WebSocket broadcasts in document status transitions
- [ ] Add WebSocket broadcasts in deletion proposal endpoints
- [ ] Add WebSocket broadcasts in rule proposal endpoints
- [ ] Add WebSocket broadcast in proposal cutoff scheduler job

### **Frontend:**
- [ ] Add organization subscription to useWebSocket hook
- [ ] Add document status change handler
- [ ] Add deletion proposal handlers
- [ ] Add rule proposal handlers
- [ ] Add proposal cutoff handler
- [ ] Update OrganizationManagement components to subscribe

### **Testing:**
- [ ] Test document status change broadcasts
- [ ] Test deletion proposal broadcasts
- [ ] Test rule proposal broadcasts
- [ ] Test organization-level subscriptions
- [ ] Test proposal cutoff broadcasts
- [ ] Test with multiple users/organizations

---

## 🎯 **Priority**

### **High Priority (Must Have):**
1. Document status change broadcasts (critical for workflow)
2. Proposal cutoff broadcasts (critical for workflow)
3. Deletion proposal broadcasts (important for governance)

### **Medium Priority (Should Have):**
4. Rule proposal broadcasts (nice for real-time updates)

---

## 💡 **Considerations**

### **Performance:**
- Organization-level subscriptions = more connections per user
- Monitor connection count in production
- Consider rate limiting if needed

### **Scalability:**
- Room-based subscriptions are efficient
- Socket.IO handles scaling well
- Consider Redis adapter for multi-server deployments

### **Error Handling:**
- Graceful fallback if WebSocket unavailable
- Reconnection logic already exists
- Client should handle missing updates gracefully

---

## ✅ **Summary**

**Current Status:**
- ✅ WebSocket infrastructure is solid and working
- ✅ Document-level updates are complete
- ⚠️ New features need WebSocket support added

**Action Required:**
- Add WebSocket broadcasts for new features during implementation
- Add organization-level subscriptions
- Add client-side handlers for new event types

**Estimated Effort:**
- Backend: 2-3 hours
- Frontend: 2-3 hours
- Testing: 1-2 hours
- **Total: 5-8 hours**

---

**Recommendation:** Add WebSocket support as we implement each new feature, rather than doing it all at once. This allows incremental testing and deployment.


