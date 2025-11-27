# WebSocket Real-Time Updates Implementation Plan

## 📋 Executive Summary

**Current State:**
- WebSocket infrastructure is partially implemented
- ✅ Votes route broadcasts WebSocket updates
- ✅ Some paragraph updates (agreed view) broadcast WebSocket updates
- ❌ Comments route does NOT broadcast WebSocket updates
- ❌ Proposals route does NOT broadcast WebSocket updates
- ❌ Document-level votes do NOT broadcast WebSocket updates
- ⚠️ Client-side handling exists but needs enhancement for comments/proposals

**Goal:**
Complete WebSocket implementation for real-time updates across all collaborative features:
- Votes (✅ partially done, needs verification)
- Comments (❌ missing)
- Proposals (❌ missing)
- Paragraph updates / Agreed view (✅ partially done, needs verification)
- Document-level votes (❌ missing)

---

## 🔍 Current Implementation Analysis

### ✅ What's Working

1. **WebSocket Server Infrastructure**
   - `server/modules/websocket.js` - WebSocketManager class exists
   - Server initialization in `server/modules/server.js:350-352`
   - Client hook `client/src/hooks/useWebSocket.ts` exists
   - Socket.IO installed on both server and client

2. **Votes Broadcasting**
   - `server/routes/votes.js` broadcasts vote updates via `webSocketManager.broadcastVoteUpdate()`
   - Includes all votes in broadcast for instant UI updates
   - Client handles vote updates in `App.tsx:117-152`

3. **Paragraph Updates (Agreed View)**
   - `server/routes/votes.js:861, 1156` broadcasts paragraph updates
   - Client handles paragraph updates in `App.tsx:159-208`
   - Updates paragraph text, title, headingLevel, and history

### ❌ What's Missing

1. **Comments Broadcasting**
   - `server/routes/comments.js` - NO WebSocket broadcast
   - Comments are created but not broadcast to other users
   - Client would need to reload document to see new comments

2. **Proposals Broadcasting**
   - `server/routes/proposals.js` - NO WebSocket broadcast
   - New proposals are created but not broadcast to other users
   - Client would need to reload document to see new proposals

3. **Document-Level Votes Broadcasting**
   - `server/routes/documents.js:2098-2168` - NO WebSocket broadcast
   - Document-level votes are cast but not broadcast
   - Client would need to reload to see document vote updates

4. **Client-Side Handling**
   - Client handles votes and paragraphs, but not comments/proposals
   - `App.tsx:209-214` falls back to full reload for comments/proposals
   - Should handle comments/proposals updates directly like votes

---

## 🎯 Implementation Plan

### Phase 1: Add Missing WebSocket Broadcasts (Backend)

#### 1.1 Add Comments Broadcasting
**File:** `server/routes/comments.js`

**Changes:**
- Import `webSocketManager` at top
- After successful comment creation (line 119), broadcast comment update
- Include full comment data with user info

**Implementation:**
```javascript
const webSocketManager = require('../modules/websocket');

// After line 119 (res.status(201).json({ comment: result });)
webSocketManager.broadcastCommentUpdate(documentId, proposalId, paragraphId, result);
```

**Time:** 15 minutes

---

#### 1.2 Add Proposals Broadcasting
**File:** `server/routes/proposals.js`

**Changes:**
- Import `webSocketManager` at top
- After successful proposal creation (line 108), broadcast proposal update
- Include full proposal data with user info

**Implementation:**
```javascript
const webSocketManager = require('../modules/websocket');

// After line 108 (res.status(201).json({ proposal: result });)
webSocketManager.broadcastProposalUpdate(documentId, paragraphId, result);
```

**Time:** 15 minutes

---

#### 1.3 Add Document-Level Votes Broadcasting
**File:** `server/routes/documents.js`

**Changes:**
- Import `webSocketManager` at top
- After successful vote cast/update (lines 2146, 2163), broadcast document vote update
- Fetch all document votes to include in broadcast (similar to proposal votes)

**Implementation:**
```javascript
const webSocketManager = require('../modules/websocket');

// After vote update (line 2146) and vote cast (line 2163)
// Fetch all votes and broadcast
db.all(`SELECT dv.*, u.name as user_name, u.email as user_email 
        FROM document_votes dv 
        LEFT JOIN users u ON dv.user_id = u.id 
        WHERE dv.document_id = ?`, [documentId], (err, votes) => {
  if (!err) {
    const formattedVotes = votes.map(v => ({
      id: v.id,
      userId: v.user_id,
      vote: v.vote,
      createdAt: v.created_at,
      user: { id: v.user_id, name: v.user_name, email: v.user_email }
    }));
    webSocketManager.broadcastDocumentUpdate(documentId, 'document-vote', {
      documentId,
      votes: formattedVotes,
      action: existingVote ? 'updated' : 'cast'
    });
  }
});
```

**Time:** 30 minutes

---

### Phase 2: Enhance Client-Side Handling

#### 2.1 Add Comments Handling
**File:** `client/src/App.tsx`

**Changes:**
- Add handler for `'comment'` eventType in `handleDocumentUpdate`
- Update proposal's comments array directly (no reload needed)
- Similar pattern to vote updates

**Implementation:**
```typescript
} else if (update.eventType === 'comment' && update.data?.proposalId) {
  const { proposalId, paragraphId, comment } = update.data;
  
  updateDocument((prevDoc) => {
    if (!prevDoc) return prevDoc;
    
    return {
      ...prevDoc,
      paragraphs: prevDoc.paragraphs.map(para => {
        if (para.id !== paragraphId) return para;
        
        return {
          ...para,
          proposals: para.proposals.map(prop => {
            if (prop.id !== proposalId) return prop;
            
            // Add new comment to comments array
            const existingComments = prop.comments || [];
            const commentExists = existingComments.some(c => c.id === comment.id);
            
            return {
              ...prop,
              comments: commentExists 
                ? existingComments.map(c => c.id === comment.id ? comment : c)
                : [...existingComments, comment]
            };
          })
        };
      })
    };
  });
  return; // Done! No API call needed
}
```

**Time:** 20 minutes

---

#### 2.2 Add Proposals Handling
**File:** `client/src/App.tsx`

**Changes:**
- Add handler for `'proposal'` eventType in `handleDocumentUpdate`
- Add new proposal to paragraph's proposals array directly
- Similar pattern to vote updates

**Implementation:**
```typescript
} else if (update.eventType === 'proposal' && update.data?.paragraphId) {
  const { paragraphId, proposal } = update.data;
  
  updateDocument((prevDoc) => {
    if (!prevDoc) return prevDoc;
    
    return {
      ...prevDoc,
      paragraphs: prevDoc.paragraphs.map(para => {
        if (para.id !== paragraphId) return para;
        
        // Check if proposal already exists (shouldn't, but handle gracefully)
        const existingProposals = para.proposals || [];
        const proposalExists = existingProposals.some(p => p.id === proposal.id);
        
        return {
          ...para,
          proposals: proposalExists
            ? existingProposals.map(p => p.id === proposal.id ? proposal : p)
            : [...existingProposals, proposal]
        };
      })
    };
  });
  return; // Done! No API call needed
}
```

**Time:** 20 minutes

---

#### 2.3 Add Document-Level Votes Handling
**File:** `client/src/App.tsx`

**Changes:**
- Add handler for `'document-vote'` eventType in `handleDocumentUpdate`
- Update document-level votes (if stored in document state)
- May need to check how document votes are stored/displayed

**Implementation:**
```typescript
} else if (update.eventType === 'document-vote' && update.data?.documentId) {
  const { votes, action } = update.data;
  
  // Update document-level votes if stored in document state
  // This depends on how document votes are structured in the Document type
  // May need to add a `documentVotes` field to Document type
  
  updateDocument((prevDoc) => {
    if (!prevDoc) return prevDoc;
    
    return {
      ...prevDoc,
      documentVotes: votes // Assuming this field exists or needs to be added
    };
  });
  
  // Show toast notification
  toast.success(`Document vote ${action === 'cast' ? 'cast' : 'updated'}`);
  return;
}
```

**Time:** 30 minutes (may need to check Document type structure)

---

### Phase 3: Verification & Testing

#### 3.1 Test Vote Updates
- ✅ Verify votes broadcast correctly
- ✅ Verify client updates instantly
- ✅ Test with multiple users simultaneously

#### 3.2 Test Comment Updates
- Test comment creation broadcasts
- Test client receives and displays comments instantly
- Test nested comments (replies)

#### 3.3 Test Proposal Updates
- Test proposal creation broadcasts
- Test client receives and displays proposals instantly
- Test proposals appear in correct paragraph

#### 3.4 Test Paragraph/Agreed View Updates
- Test agreed view updates when proposals are approved
- Test paragraph text/title updates broadcast
- Test history updates

#### 3.5 Test Document-Level Votes
- Test document vote broadcasts
- Test client updates document vote counts
- Test with multiple users

**Time:** 1-2 hours

---

## 📝 Implementation Checklist

### Backend (Server)
- [ ] Add `webSocketManager` import to `server/routes/comments.js`
- [ ] Broadcast comment updates after creation
- [ ] Add `webSocketManager` import to `server/routes/proposals.js`
- [ ] Broadcast proposal updates after creation
- [ ] Add `webSocketManager` import to `server/routes/documents.js`
- [ ] Broadcast document-level vote updates after cast/update
- [ ] Fetch all votes for document-level vote broadcasts

### Frontend (Client)
- [ ] Add comment event handler in `App.tsx`
- [ ] Update proposal comments array on comment updates
- [ ] Add proposal event handler in `App.tsx`
- [ ] Add new proposals to paragraph on proposal updates
- [ ] Add document-vote event handler in `App.tsx`
- [ ] Update document votes state on document-vote updates
- [ ] Remove fallback full reload for comments/proposals (use direct updates)

### Testing
- [ ] Test vote updates with multiple users
- [ ] Test comment updates with multiple users
- [ ] Test proposal updates with multiple users
- [ ] Test paragraph/agreed view updates
- [ ] Test document-level vote updates
- [ ] Test reconnection handling
- [ ] Test error handling (WebSocket failures)

---

## ⚠️ Potential Issues & Solutions

### Issue 1: WebSocket Authentication
**Current:** Client sends token in `auth` object, server checks in `authenticate` event
**Solution:** Verify authentication works correctly, add error handling

### Issue 2: Race Conditions
**Current:** Multiple users editing simultaneously
**Solution:** Document-level locking already exists in `updateAgreedViewForParagraph`

### Issue 3: Client State Synchronization
**Current:** Client updates state directly from WebSocket
**Solution:** Ensure state updates are atomic and don't conflict with API calls

### Issue 4: Reconnection Handling
**Current:** Client reconnects and re-authenticates
**Solution:** Verify reconnection works correctly, test with network interruptions

### Issue 5: Document Type Structure
**Current:** May need to add `documentVotes` field to Document type
**Solution:** Check Document type definition, add field if needed

---

## 🚀 Deployment Strategy

1. **Test Locally First**
   - Test all WebSocket updates with multiple browser tabs
   - Verify real-time updates work correctly
   - Test error scenarios (disconnect, reconnect)

2. **Deploy Incrementally**
   - Deploy backend changes first
   - Deploy frontend changes second
   - Monitor for errors

3. **Monitor in Production**
   - Check WebSocket connection logs
   - Monitor for broadcast errors
   - Check client-side error logs

---

## 📊 Success Criteria

✅ **Complete when:**
- All votes broadcast in real-time (proposal votes + document votes)
- All comments broadcast in real-time
- All proposals broadcast in real-time
- Paragraph/agreed view updates broadcast in real-time
- Client updates instantly without full page reloads
- Multiple users see updates simultaneously
- Reconnection works correctly
- No console errors in browser or server logs

---

## ⏱️ Time Estimate

| Phase | Tasks | Time |
|-------|-------|------|
| Phase 1 | Backend broadcasts (comments, proposals, document votes) | 1 hour |
| Phase 2 | Client-side handling (comments, proposals, document votes) | 1.5 hours |
| Phase 3 | Testing & verification | 1-2 hours |
| **Total** | | **3.5-4.5 hours** |

---

## 📝 Notes

- WebSocket infrastructure is already in place, just needs to be used consistently
- Client-side handling pattern already exists for votes, can be replicated
- No breaking changes - existing functionality continues to work
- Falls back to full reload if WebSocket fails (graceful degradation)

---

**Ready to implement?** This plan provides a clear, step-by-step approach to completing the WebSocket real-time updates feature.

