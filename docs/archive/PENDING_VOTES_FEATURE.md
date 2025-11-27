# Pending Votes Feature - Quick Voting from Activity Feed

## 🎯 Overview

Added a **"Pending Your Vote"** section to the Activity Feed that aggregates all proposals across all documents that need the current user's vote. Users can review and vote directly from the activity feed with side-by-side diff view.

---

## ✨ Features Implemented

### **1. Pending Proposals Section**
- ✅ Shows at top of Activity Feed when proposals need votes
- ✅ Aggregates proposals from ALL documents user has access to
- ✅ Scrollable container (500px height) for many proposals
- ✅ Orange-themed alert design to draw attention
- ✅ Auto-refreshes every 30 seconds

### **2. Diff View Integration**
- ✅ Side-by-side comparison of current text vs proposed text
- ✅ Uses existing DiffViewer component
- ✅ Clear visual highlighting of changes
- ✅ Works for both TITLE and BODY proposals

### **3. Quick Voting**
- ✅ Three voting buttons: Approve, Neutral, Reject
- ✅ Color-coded: Green (Approve), Gray (Neutral), Red (Reject)
- ✅ Shows current vote counts before voting
- ✅ Instant removal from list after voting
- ✅ Loading state while voting
- ✅ Success/error toast notifications

### **4. Comprehensive Information**
- ✅ Shows who made the proposal (avatar + name)
- ✅ Document and section context
- ✅ Time since proposal was created
- ✅ Proposal type badge (Title vs Body)
- ✅ Current vote distribution

---

## 📁 Files Created/Modified

### **New Files**

1. **`server/routes/pending-votes.js`** (105 lines)
   - GET /api/pending-votes endpoint
   - Fetches proposals user hasn't voted on yet
   - Aggregates across all accessible documents
   - Includes current vote counts
   - Returns formatted proposal data with diff info

### **Modified Files**

2. **`client/src/components/ActivityFeedView.tsx`**
   - Added `pendingProposals` state and fetching logic
   - Added `handleVote` function for quick voting
   - Added "Pending Your Vote" UI section
   - Integrated DiffViewer component
   - Added ScrollArea for proposal list

3. **`server/index.js`**
   - Registered `/api/pending-votes` route
   - Added to route initialization

---

## 🎨 UI Design

### **Pending Your Vote Section:**
```
┌──────────────────────────────────────────────────────────┐
│ ⚠️  Pending Your Vote                             [3]     │
│ These proposals need your vote. Review quickly below.    │
├──────────────────────────────────────────────────────────┤
│ [Scrollable Container - 500px height]                    │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ 👤 Bob Smith                           [Body Change]│  │
│ │ [Sample Document] • Introduction • 2h ago          │  │
│ │                                                    │  │
│ │ ┌────────────────────────────────────────────────┐│  │
│ │ │ Old: This is the first paragraph...            ││  │
│ │ │ New: This is the initial paragraph...          ││  │
│ │ │      [highlighted differences]                  ││  │
│ │ └────────────────────────────────────────────────┘│  │
│ │                                                    │  │
│ │ Current votes: 👍 2  ➖ 1  👎 0                   │  │
│ │                                                    │  │
│ │ [Approve] [Neutral] [Reject]                      │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ [More proposals... scrollable]                           │
└──────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### **Fetching Pending Proposals:**
```
User Opens Activity Feed
    ↓
GET /api/pending-votes
    ↓
Server Queries:
  1. Get all documents user has access to
  2. Find proposals in those documents that:
     - Are not approved yet (approved = 0)
     - User hasn't voted on
  3. Join with user, paragraph, document data
  4. Include current vote counts
    ↓
Return proposals array
    ↓
Display in "Pending Your Vote" section
    ↓
Auto-refresh every 30 seconds
```

### **Voting on Proposal:**
```
User Clicks Vote Button (Approve/Neutral/Reject)
    ↓
POST /api/documents/:docId/paragraphs/:paraId/proposals/:propId/vote
    ↓
Server:
  1. Validates user has access
  2. Inserts/updates vote in database
  3. Checks if proposal reaches 75% approval
  4. Returns success
    ↓
Client:
  1. Shows success toast
  2. Removes proposal from pending list
  3. Refreshes activity feed
    ↓
User sees updated data
```

---

## 🎯 Backend API

### **GET /api/pending-votes**

**Purpose**: Fetch all proposals that need the current user's vote

**Authentication**: Required (Bearer token)

**Response**:
```json
{
  "proposals": [
    {
      "id": "proposal-123",
      "paragraphId": "para-456",
      "documentId": "doc-789",
      "documentTitle": "Sample Document",
      "paragraphTitle": "Introduction",
      "proposedText": "This is the new text...",
      "currentText": "This is the old text...",
      "type": "BODY",
      "headingLevel": null,
      "createdAt": "2025-11-05T10:30:00Z",
      "user": {
        "id": "user-123",
        "name": "Bob Smith",
        "email": "bob@example.com",
        "avatar": "https://..."
      },
      "votes": {
        "total": 3,
        "pro": 2,
        "contra": 0,
        "neutral": 1
      }
    }
  ]
}
```

**Logic**:
1. Find all documents user owns or collaborates on
2. Query proposals from those documents where:
   - `approved = 0` (not yet accepted)
   - No vote exists from current user
3. Join user, paragraph, and document data
4. Count existing votes by type
5. Order by creation date (newest first)

---

## 💡 Features Detail

### **1. Proposal Card Layout**

Each proposal card shows:
- **User Avatar**: Who made the proposal
- **User Name**: Clear attribution
- **Document Badge**: Which document it's from
- **Section**: Paragraph title (if available)
- **Timestamp**: How long ago (e.g., "2h ago")
- **Type Badge**: "Title Change" or "Body Change"
- **Diff View**: Side-by-side text comparison
- **Vote Counts**: Current voting status
- **Vote Buttons**: Approve, Neutral, Reject

### **2. Diff Viewer**

Uses the existing `DiffViewer` component:
- Highlights additions in green
- Highlights deletions in red
- Shows unchanged text in gray
- Compact display that fits in card
- Scrollable for long text

### **3. Vote Buttons**

Three distinct buttons:
```
[Approve] - Green button with thumbs up icon
[Neutral] - Gray outlined button with minus icon
[Reject]  - Red button with thumbs down icon
```

**States**:
- **Default**: Ready to click
- **Loading**: Disabled while voting
- **After Vote**: Removed from list instantly

### **4. Empty State**

When no proposals need votes:
- Section hidden completely
- User proceeds directly to activity feed
- Clean, uncluttered interface

---

## 🎨 Visual Design Elements

### **Colors:**
- **Section Background**: Orange-50 (light orange)
- **Section Border**: Orange-200
- **Alert Icon**: Orange-600
- **Card Background**: White
- **Card Border**: Orange-200
- **Approve Button**: Green-600
- **Reject Button**: Red/Destructive
- **Neutral Button**: Gray outline

### **Icons:**
- ⚠️ **AlertCircle**: Section header
- 👍 **ThumbsUp**: Approve button & pro votes
- 👎 **ThumbsDown**: Reject button & contra votes
- ➖ **Minus**: Neutral button & neutral votes

### **Spacing:**
- Section padding: 24px (p-6)
- Card padding: 16px (p-4)
- Gap between cards: 16px (space-y-4)
- Scrollable height: 500px

---

## 📊 User Experience Flow

### **Scenario 1: User Has Pending Votes**

```
1. User clicks "Activity Feed" from menu
2. Activity Feed opens
3. "Pending Your Vote" section visible at top (orange box)
4. Scrollable list of 3 proposals
5. User reviews first proposal:
   - Reads who made it (Bob Smith)
   - Sees it's from "Sample Document"
   - Sees diff showing changes
   - Sees 2 people already approved
6. User clicks "Approve"
7. Toast: "Voted pro"
8. Proposal disappears from list
9. Now shows 2 remaining proposals
10. User continues voting
```

### **Scenario 2: No Pending Votes**

```
1. User clicks "Activity Feed" from menu
2. Activity Feed opens
3. No orange "Pending Your Vote" section
4. Proceeds directly to statistics dashboard
5. Sees activity feed below
```

### **Scenario 3: Vote During Auto-Refresh**

```
1. User is viewing Activity Feed
2. 30 seconds pass
3. Auto-refresh triggers
4. New proposal appears in pending list
5. Counter updates from [2] to [3]
6. User sees new proposal at top of list
```

---

## 🚀 Benefits

### **For Users:**
1. ✅ **One-Stop Voting**: Don't need to open each document
2. ✅ **Quick Review**: Diff view shows exactly what changed
3. ✅ **Batch Processing**: Vote on multiple proposals quickly
4. ✅ **Clear Context**: Know which document and section
5. ✅ **Visibility**: Never miss a proposal needing your vote

### **For Teams:**
1. ✅ **Faster Consensus**: Proposals get voted on quickly
2. ✅ **Reduced Friction**: Less navigation required
3. ✅ **Transparency**: Vote counts visible
4. ✅ **Activity**: Encourages participation

### **For the Platform:**
1. ✅ **Engagement**: Users visit Activity Feed more
2. ✅ **Efficiency**: Reduces time to reach consensus
3. ✅ **Scalability**: Works across many documents
4. ✅ **Usability**: Professional, enterprise-ready feature

---

## 📱 Responsive Design

### **Desktop (≥1024px):**
- Full-width cards
- Side-by-side diff view
- All buttons inline
- 500px scrollable height

### **Tablet (768-1023px):**
- Slightly condensed cards
- Diff view still readable
- Buttons may wrap
- 500px scrollable height

### **Mobile (<768px):**
- Full-width cards
- Diff view stacked
- Buttons stack vertically
- 400px scrollable height (smaller)

---

## 🔒 Security & Access Control

### **Authorization:**
- User must be authenticated
- User must own or collaborate on document
- Votes are user-specific
- No voting twice on same proposal

### **Data Privacy:**
- Only shows proposals from user's documents
- Doesn't expose private documents
- Vote counts are aggregated (no individual voter names)

---

## ⚡ Performance

### **Query Optimization:**
- Single query fetches all pending proposals
- Uses database indexes on proposal_id, user_id
- Limits to unvoted proposals only
- No N+1 query problem

### **Frontend Optimization:**
- Only renders when proposals exist
- ScrollArea virtualizes if many proposals
- Vote removes item without refetching all
- Auto-refresh is throttled (30s interval)

---

## 🧪 Testing Checklist

### **Backend:**
- [x] Endpoint returns proposals user hasn't voted on
- [x] Aggregates across all documents
- [x] Includes current vote counts
- [x] Requires authentication
- [x] Returns empty array when no proposals

### **Frontend:**
- [x] Section only shows when proposals exist
- [x] Scrollable container works
- [x] Diff view displays correctly
- [x] Vote buttons work
- [x] Proposal disappears after voting
- [x] Toast notifications work
- [x] Auto-refresh works
- [x] Loading states work
- [x] Responsive on all screens

### **Integration:**
- [x] Voting updates database
- [x] Proposal removed from pending list
- [x] Activity feed updates after vote
- [x] Works across multiple documents
- [x] Handles concurrent votes

---

## 📈 Usage Statistics (Expected)

With this feature, we expect:
- **50% faster voting** - Users don't navigate between documents
- **30% more participation** - Visibility encourages voting
- **70% fewer missed votes** - Central location prevents oversight
- **2x more proposals reviewed** - Batch processing is efficient

---

## 🎉 Summary

Successfully implemented a **Pending Votes** section in the Activity Feed that:

✅ **Aggregates proposals** from all documents needing user's vote  
✅ **Shows diff view** comparing current vs proposed text  
✅ **Enables quick voting** with Approve/Neutral/Reject buttons  
✅ **Updates in real-time** with auto-refresh  
✅ **Removes voted items** instantly for clean UX  
✅ **Provides context** with document, section, and user info  
✅ **Scales efficiently** with scrollable container  

**Result**: Users can now stay on top of all proposals across all documents from a single, convenient location!

---

## 🔮 Future Enhancements

Possible improvements:
- [ ] Keyboard shortcuts (A=Approve, N=Neutral, R=Reject)
- [ ] Bulk voting (select multiple, vote all at once)
- [ ] Proposal sorting (by document, by age, by votes)
- [ ] Comment directly from pending list
- [ ] Mark as "review later"
- [ ] Email notifications for new proposals
- [ ] Mobile push notifications

---

**Created:** November 5, 2025  
**Version:** 1.0.0  
**Status:** ✅ Complete & Production Ready

