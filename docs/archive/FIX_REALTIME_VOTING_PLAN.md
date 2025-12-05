# Fix Real-Time Voting & Rate Limiting - Implementation Plan

**Date:** 2025-01-27  
**Status:** Ready for Implementation  
**Priority:** High

---

## 🎯 Goals

1. **Fix Rate Limiting** - Reduce excessive API calls causing rate limit errors
2. **Fix Real-Time Updates** - Ensure votes and proposals appear instantly without refresh
3. **Improve User Experience** - Smooth, responsive voting experience

---

## 🔴 Problem 1: Rate Limiting

### Root Causes

1. **Multiple `loadDocuments` calls**
   - `useDocuments` hook calls `loadDocuments` on every `currentUser` or `loadDocuments` change
   - `loadDocuments` is in its own dependency array (potential infinite loop)
   - Multiple components calling `loadDocuments` simultaneously

2. **Rate Limit Too Strict**
   - 100 requests per 15 minutes = ~6.7 requests/minute
   - Multiple document loads + retries = easily exceeded

3. **No Request Deduplication**
   - Multiple components can trigger same API call simultaneously
   - No caching or request queuing

### Solutions

#### Solution 1.1: Fix `useDocuments` Hook Dependencies

**File:** `client/src/hooks/useDocuments.ts`

**Problem:**
```typescript
const loadDocuments = useCallback(async (user?: User | null) => {
  // ...
}, [currentUser]); // currentUser in deps causes re-renders

useEffect(() => {
  if (currentUser) {
    loadDocuments(currentUser); // loadDocuments in deps causes loop
  }
}, [currentUser, loadDocuments]); // ❌ Infinite loop risk
```

**Fix:**
```typescript
const loadDocuments = useCallback(async (user?: User | null) => {
  const userToUse = user || currentUser;
  // ... rest of code
}, [currentUser]); // Keep currentUser, but remove loadDocuments from useEffect deps

useEffect(() => {
  if (currentUser) {
    loadDocuments(currentUser);
  }
}, [currentUser]); // ✅ Remove loadDocuments from deps
```

#### Solution 1.2: Add Request Deduplication

**File:** `client/src/hooks/useDocuments.ts`

**Add:**
```typescript
const [isLoading, setIsLoading] = useState(false);
const loadingRef = useRef(false);

const loadDocuments = useCallback(async (user?: User | null) => {
  // Prevent duplicate simultaneous requests
  if (loadingRef.current) {
    console.log('loadDocuments already in progress, skipping...');
    return;
  }
  
  const userToUse = user || currentUser;
  if (!userToUse) {
    setLoading(false);
    return;
  }

  loadingRef.current = true;
  setLoading(true);
  // ... rest of code
  finally {
    setLoading(false);
    loadingRef.current = false;
  }
}, [currentUser]);
```

#### Solution 1.3: Increase Rate Limit for Development

**File:** `server/config.js`

**Change:**
```javascript
RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 
  (process.env.NODE_ENV === 'development' ? 1000 : 100), // Higher limit for dev
```

#### Solution 1.4: Remove Unnecessary `loadDocuments` Calls

**File:** `client/src/App.tsx`

**Find and remove:**
- Duplicate `loadDocuments()` calls in useEffect
- Calls triggered by view changes that don't need document reload

---

## 🔴 Problem 2: Real-Time Updates Not Working

### Root Causes

1. **Proposal Updates Not Triggering Re-render**
   - WebSocket receives update but React state doesn't update correctly
   - Missing proposal in paragraph proposals array
   - No optimistic updates for proposals

2. **Comment Updates May Not Be Visible**
   - Comments broadcast but might not trigger UI updates
   - Comment threads might not expand automatically
   - No optimistic updates for comments

3. **Vote Updates Working But Could Be Better**
   - Votes broadcast correctly but may have latency
   - Vote counts update but button colors might lag
   - Need optimistic updates (partially done)

4. **Paragraph Creation/Updates Not Broadcast**
   - New paragraphs created don't broadcast WebSocket updates
   - Paragraph edits don't broadcast updates
   - Only agreed view changes broadcast

5. **WebSocket Not Connected/Subscribed**
   - Connection might fail silently
   - Subscription might not happen correctly

6. **State Update Logic Issues**
   - `updateDocument` might not be creating new object references
   - React might not detect state change

### Solutions

#### Solution 2.1: Fix Proposal Update Handler

**File:** `client/src/App.tsx:handleDocumentUpdate`

**Current Code:**
```typescript
} else if (update.eventType === 'proposal' && update.data?.paragraphId) {
  const { paragraphId, proposal } = update.data;
  
  updateDocument((prevDoc) => {
    // ... adds proposal to array
  });
}
```

**Issues:**
- Might not handle case where paragraph doesn't exist
- Might not properly merge with existing proposals
- Might not trigger re-render

**Fix:**
```typescript
} else if (update.eventType === 'proposal' && update.data?.paragraphId) {
  console.log('✅ Processing proposal update:', {
    paragraphId: update.data.paragraphId,
    proposalId: update.data.proposal?.id,
    proposalText: update.data.proposal?.text?.substring(0, 50)
  });
  
  const { paragraphId, proposal } = update.data;
  
  if (!proposal || !proposal.id) {
    console.warn('❌ Invalid proposal data in WebSocket update');
    return;
  }
  
  updateDocument((prevDoc) => {
    if (!prevDoc) return prevDoc;
    
    return {
      ...prevDoc,
      paragraphs: prevDoc.paragraphs.map(para => {
        if (para.id !== paragraphId) return para;
        
        // Check if proposal already exists
        const existingProposalIndex = para.proposals.findIndex(p => p.id === proposal.id);
        
        if (existingProposalIndex >= 0) {
          // Update existing proposal
          const updatedProposals = [...para.proposals];
          updatedProposals[existingProposalIndex] = {
            ...proposal,
            votes: proposal.votes || [],
            comments: proposal.comments || []
          };
          return {
            ...para,
            proposals: updatedProposals
          };
        } else {
          // Add new proposal
          return {
            ...para,
            proposals: [
              ...para.proposals,
              {
                ...proposal,
                votes: proposal.votes || [],
                comments: proposal.comments || []
              }
            ]
          };
        }
      })
    };
  });
  
  toast.success('New suggestion added', { duration: 2000 });
  return;
}
```

#### Solution 2.2: Verify WebSocket Connection

**File:** `client/src/hooks/useWebSocket.ts`

**Add connection verification:**
```typescript
// Add connection status check
useEffect(() => {
  if (socketRef.current && isConnectedRef.current) {
    console.log('✅ WebSocket status check:', {
      connected: socketRef.current.connected,
      documentId: currentDocumentIdRef.current
    });
  }
}, [documentId]);
```

#### Solution 2.3: Add Optimistic Updates for Proposals

**File:** `client/src/App.tsx:handleAddSuggestion`

**Current:**
```typescript
await proposalsApi.createProposal(...);
await reloadDocument(); // ❌ Full reload - slow
```

**Fix:**
```typescript
// Optimistic update - add proposal immediately
const optimisticProposal = {
  id: `temp-${Date.now()}`,
  text: data.text,
  type: data.type,
  userId: currentUser.id,
  user: currentUser,
  votes: [],
  comments: [],
  createdAt: new Date().toISOString()
};

updateDocument((prevDoc) => {
  if (!prevDoc) return prevDoc;
  // ... add optimistic proposal to paragraph
});

try {
  const response = await proposalsApi.createProposal(...);
  // WebSocket will update with real proposal, or we can replace optimistic one
} catch (error) {
  // Rollback optimistic update
  reloadDocument();
  throw error;
}
```

#### Solution 2.4: Ensure Vote Updates Work

**File:** `client/src/App.tsx:handleDocumentUpdate`

**Verify vote update handler:**
- Check `voteData?.allVotes` is being received
- Verify vote counts are updating correctly
- Ensure React re-renders when votes change
- Already has optimistic updates for button color ✅

#### Solution 2.5: Add Comment Optimistic Updates

**File:** `client/src/App.tsx:handleAddComment` (or wherever comments are added)

**Current:**
```typescript
await commentsApi.addComment(...);
// Wait for WebSocket or reload
```

**Fix:**
```typescript
// Optimistic update - add comment immediately
const optimisticComment = {
  id: `temp-${Date.now()}`,
  text: commentText,
  userId: currentUser.id,
  user: currentUser,
  createdAt: new Date().toISOString(),
  parentId: parentId || null
};

updateDocument((prevDoc) => {
  // ... add optimistic comment to proposal
});

try {
  await commentsApi.addComment(...);
  // WebSocket will update with real comment
} catch (error) {
  // Rollback
  reloadDocument();
  throw error;
}
```

#### Solution 2.6: Add Paragraph Creation Broadcast

**File:** `server/routes/paragraphs.js`

**Problem:** New paragraphs don't broadcast WebSocket updates

**Fix:**
```javascript
// After paragraph creation (around line 417)
res.status(201).json({ paragraph });

// Broadcast paragraph creation
webSocketManager.broadcastDocumentUpdate(documentId, 'paragraph-created', {
  paragraphId,
  paragraph: {
    id: paragraphId,
    text: paragraphBody,
    title: paragraphTitle,
    headingLevel: paragraphHeadingLevel,
    orderIndex: orderIndex
  }
});
```

#### Solution 2.7: Add Paragraph Update Broadcast

**File:** `server/routes/paragraphs.js:550` (PUT endpoint)

**Problem:** Paragraph edits don't broadcast

**Fix:**
```javascript
// After successful paragraph update (around line 633)
res.json({ message: 'Paragraph updated successfully' });

// Broadcast paragraph update
webSocketManager.broadcastDocumentUpdate(documentId, 'paragraph-updated', {
  paragraphId,
  text: text.trim(),
  title: title?.trim() || null,
  headingLevel: headingLevel
});
```

#### Solution 2.8: Handle Paragraph Creation/Update Events in Frontend

**File:** `client/src/App.tsx:handleDocumentUpdate`

**Add handlers:**
```typescript
} else if (update.eventType === 'paragraph-created' && update.data?.paragraphId) {
  // New paragraph created - add to document
  const { paragraphId, paragraph } = update.data;
  
  updateDocument((prevDoc) => {
    if (!prevDoc) return prevDoc;
    
    return {
      ...prevDoc,
      paragraphs: [
        ...prevDoc.paragraphs,
        {
          ...paragraph,
          proposals: [],
          comments: [],
          history: []
        }
      ].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
    };
  });
  
  toast.success('New paragraph added', { duration: 2000 });
  return;
} else if (update.eventType === 'paragraph-updated' && update.data?.paragraphId) {
  // Paragraph edited - update text/title
  const { paragraphId, text, title, headingLevel } = update.data;
  
  updateDocument((prevDoc) => {
    if (!prevDoc) return prevDoc;
    
    return {
      ...prevDoc,
      paragraphs: prevDoc.paragraphs.map(para => {
        if (para.id !== paragraphId) return para;
        
        return {
          ...para,
          text: text !== undefined ? text : para.text,
          title: title !== undefined ? title : para.title,
          headingLevel: headingLevel !== undefined ? headingLevel : para.headingLevel
        };
      })
    };
  });
  
  toast.info('Paragraph updated', { duration: 2000 });
  return;
}
```

---

## 📋 Implementation Checklist

### Phase 1: Fix Rate Limiting (High Priority)

- [ ] Fix `useDocuments` hook dependencies
- [ ] Add request deduplication
- [ ] Increase rate limit for development
- [ ] Remove unnecessary `loadDocuments` calls
- [ ] Test: No rate limit errors during normal use

### Phase 2: Fix Real-Time Updates (High Priority)

**Comments:**
- [ ] Verify comment handler works correctly
- [ ] Add optimistic updates for comments
- [ ] Test: Comments appear instantly in other users' windows

**Proposals:**
- [ ] Fix proposal update handler
- [ ] Add optimistic updates for proposals
- [ ] Test: Proposals appear instantly in other users' windows

**Votes:**
- [ ] Verify vote handler works correctly (already has optimistic button color)
- [ ] Ensure vote counts update in real-time
- [ ] Test: Vote counts update instantly for all users

**Paragraphs:**
- [ ] Add WebSocket broadcast for paragraph creation
- [ ] Add WebSocket broadcast for paragraph updates
- [ ] Add frontend handlers for paragraph events
- [ ] Test: New paragraphs appear instantly in other users' windows
- [ ] Test: Paragraph edits appear instantly in other users' windows

**General:**
- [ ] Verify WebSocket connection status
- [ ] Add better error handling for WebSocket
- [ ] Add comprehensive logging for debugging

### Phase 3: Testing & Verification (High Priority)

- [ ] Test comments appear in real-time
- [ ] Test proposals appear in real-time
- [ ] Test votes update in real-time
- [ ] Test paragraph creation appears in real-time
- [ ] Test paragraph updates appear in real-time
- [ ] Test with 2+ users simultaneously
- [ ] Verify no rate limit errors
- [ ] Check browser console for errors
- [ ] Verify WebSocket connection logs

### Phase 4: Performance & Polish (Medium Priority)

- [ ] Optimize WebSocket message size
- [ ] Add connection retry logic improvements
- [ ] Add visual indicators for real-time updates
- [ ] Improve error messages for users

---

## 🧪 Testing Procedure

1. **Setup:**
   - Open 2 browser windows (or incognito + normal)
   - Login as different users
   - Open same document in both
   - Open browser console (F12) in both windows

2. **Test Comments:**
   - User A adds a comment to a proposal
   - User B should see comment appear within 1-2 seconds
   - No refresh needed
   - Comment thread should auto-expand if needed

3. **Test Proposals:**
   - User A creates a suggestion (new paragraph proposal)
   - User B should see it appear within 1-2 seconds
   - No refresh needed
   - Proposal should be visible in the proposals list

4. **Test Votes:**
   - User A votes on a proposal
   - User B should see vote count update within 1-2 seconds
   - Button colors should update instantly for User A
   - Vote counts should update for all users

5. **Test Paragraph Creation:**
   - User A creates a new paragraph
   - User B should see new paragraph appear within 1-2 seconds
   - No refresh needed

6. **Test Paragraph Updates:**
   - User A edits a paragraph
   - User B should see paragraph text update within 1-2 seconds
   - No refresh needed

7. **Test Rate Limiting:**
   - Navigate between views
   - Create/delete documents
   - Should NOT see rate limit errors

---

## 📊 Expected Results

**Before:**
- ❌ Rate limit errors after a few actions
- ❌ Proposals require refresh to appear
- ❌ Comments require refresh to appear
- ❌ Votes require refresh to see updates
- ❌ New paragraphs require refresh
- ❌ Paragraph edits require refresh
- ❌ Poor user experience

**After:**
- ✅ No rate limit errors
- ✅ **Comments** appear instantly (< 2 seconds)
- ✅ **Proposals** appear instantly (< 2 seconds)
- ✅ **Votes** update instantly (< 2 seconds)
- ✅ **New paragraphs** appear instantly (< 2 seconds)
- ✅ **Paragraph edits** appear instantly (< 2 seconds)
- ✅ Smooth, responsive, real-time collaborative experience

---

## 🔗 Related Files

**Frontend:**
- `client/src/hooks/useDocuments.ts` - Fix dependencies
- `client/src/App.tsx` - Fix all WebSocket handlers (comments, proposals, votes, paragraphs)
- `client/src/hooks/useWebSocket.ts` - Verify connection
- `client/src/components/SuggestionCard.tsx` - Already has optimistic vote updates ✅

**Backend:**
- `server/config.js` - Adjust rate limits
- `server/routes/comments.js` - Verify broadcasting ✅ (already broadcasts)
- `server/routes/proposals.js` - Verify broadcasting ✅ (already broadcasts)
- `server/routes/votes.js` - Verify broadcasting ✅ (already broadcasts)
- `server/routes/paragraphs.js` - **ADD** broadcasting for creation/updates ❌
- `server/modules/websocket.js` - WebSocket manager

---

**Last Updated:** 2025-01-27  
**Priority:** High - Blocking good user experience

