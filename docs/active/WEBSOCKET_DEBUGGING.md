# WebSocket Real-Time Updates - Debugging Guide

**Issue:** Votes from one user not appearing in real-time in another user's window

---

## ✅ Expected Behavior

When User A votes on a proposal:
- **User A's window**: Button color changes instantly (optimistic update)
- **User B's window**: Should see vote count update within 1-2 seconds via WebSocket
- **No refresh needed**: Updates should appear automatically

---

## 🔍 How to Debug

### Step 1: Check WebSocket Connection

Open browser console (F12) and look for:

**Good signs:**
```
WebSocket connected
Socket subscribed to document <documentId>
Received document update: {eventType: 'vote', ...}
```

**Bad signs:**
```
WebSocket connection error: ...
WebSocket disconnected: ...
```

### Step 2: Verify Subscription

1. Open document in two browsers (or incognito + normal)
2. In Browser 1 console, you should see: `WebSocket connected`
3. In Browser 2 console, you should see: `WebSocket connected`
4. Both should show: `Socket subscribed to document <id>`

### Step 3: Test Vote Update

1. User A votes on a proposal
2. Check Browser A console - should see: `Received document update: {eventType: 'vote'...}`
3. Check Browser B console - should see: `Received document update: {eventType: 'vote'...}`

**If Browser B doesn't see the update:**
- WebSocket not connected
- Not subscribed to document
- Server not broadcasting
- Network/firewall blocking WebSocket

---

## 🐛 Common Issues

### Issue 1: WebSocket Not Connecting

**Symptoms:**
- Console shows: `WebSocket connection error`
- No "WebSocket connected" message

**Causes:**
- Server not running
- Wrong WebSocket URL
- CORS issues
- Firewall blocking WebSocket

**Fix:**
- Check server is running on port 3000
- Verify `useWebSocket.ts` has correct URL
- Check browser console for CORS errors

### Issue 2: Not Subscribed to Document

**Symptoms:**
- WebSocket connected but no updates received
- Console doesn't show "Socket subscribed to document"

**Causes:**
- `documentId` is null/undefined
- Subscription event not firing
- Server not handling subscription

**Fix:**
- Verify `currentDocument` exists when WebSocket connects
- Check `useWebSocket` is called with valid `documentId`
- Check server logs for subscription events

### Issue 3: Updates Received But UI Not Updating

**Symptoms:**
- Console shows: `Received document update`
- But vote counts don't change in UI

**Causes:**
- `updateDocument` not working correctly
- State update not triggering re-render
- Wrong document ID in update

**Fix:**
- Check `handleDocumentUpdate` in `App.tsx`
- Verify `update.documentId === currentDocument.id`
- Check React DevTools for state updates

### Issue 4: Backend Not Broadcasting

**Symptoms:**
- Vote API call succeeds
- But no WebSocket broadcast happens

**Causes:**
- `webSocketManager.broadcastVoteUpdate` not called
- WebSocket manager not initialized
- Server error during broadcast

**Fix:**
- Check server logs for broadcast calls
- Verify `webSocketManager` is initialized
- Check for errors in `server/routes/votes.js`

---

## 🔧 Quick Fixes

### Add More Debugging

Add to `client/src/App.tsx:handleDocumentUpdate`:

```typescript
const handleDocumentUpdate = useCallback((update: any) => {
  console.log('🔔 WebSocket update received:', {
    eventType: update.eventType,
    documentId: update.documentId,
    currentDocumentId: currentDocument?.id,
    data: update.data
  });
  
  if (!currentDocument || update.documentId !== currentDocument.id) {
    console.log('❌ Update ignored - wrong document or no current document');
    return;
  }
  
  if (update.eventType === 'vote') {
    console.log('✅ Processing vote update:', update.data);
    // ... rest of code
  }
}, [currentDocument]);
```

### Verify WebSocket Connection

Add to `client/src/hooks/useWebSocket.ts`:

```typescript
socket.on('connect', () => {
  console.log('✅ WebSocket connected, socket ID:', socket.id);
  // ... rest of code
});

socket.on('document-update', (update) => {
  console.log('📨 Received document update:', {
    eventType: update.eventType,
    documentId: update.documentId,
    timestamp: update.timestamp
  });
  onDocumentUpdateRef.current(update);
});
```

---

## 🧪 Test Procedure

1. **Open two browser windows** (or incognito + normal)
2. **Login as different users** in each
3. **Open the same document** in both
4. **Check console in both** - should see WebSocket connected
5. **User A votes** - check both consoles
6. **User B should see vote count update** within 1-2 seconds

---

## 📊 Expected Console Output

**Browser A (voter):**
```
WebSocket connected
Socket subscribed to document abc123
Received document update: {eventType: 'vote', documentId: 'abc123', ...}
```

**Browser B (observer):**
```
WebSocket connected
Socket subscribed to document abc123
Received document update: {eventType: 'vote', documentId: 'abc123', ...}
```

If Browser B doesn't see the "Received document update" message, the WebSocket broadcast isn't reaching it.

---

## 🔗 Related Files

- `client/src/hooks/useWebSocket.ts` - WebSocket connection
- `client/src/App.tsx:handleDocumentUpdate` - Update handler
- `server/routes/votes.js` - Vote broadcasting
- `server/modules/websocket.js` - WebSocket manager

---

**Last Updated:** 2025-01-27

