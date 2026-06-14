# Threaded Comments Implementation Documentation

## Overview

This document provides a comprehensive overview of how threaded comments are structured, displayed, and optimistically updated in the SuggestionCard component. The system uses a flat array structure with parent-child relationships, optimistic UI updates for instant feedback, and WebSocket synchronization to replace temporary IDs with real database IDs.

## Table of Contents

1. [Comment Thread Structure](#comment-thread-structure)
2. [UI Formatting and Layout](#ui-formatting-and-layout)
3. [Optimistic Update Flow](#optimistic-update-flow)
4. [WebSocket Synchronization](#websocket-synchronization)
5. [Thread Expansion Behavior](#thread-expansion-behavior)
6. [State Management](#state-management)
7. [Visual Hierarchy](#visual-hierarchy)
8. [Edge Cases and Error Handling](#edge-cases-and-error-handling)
9. [Key Files and Locations](#key-files-and-locations)

---

## Comment Thread Structure

### Data Model

Comments are stored in a flat array structure within each `Proposal` object. The threading relationship is established through the `parentId` field:

```typescript
interface Comment {
  id: string;
  proposalId: string;
  userId: string;
  text: string;
  parentId?: string;  // undefined for top-level, string ID for replies
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  parent?: { ... };
  replies: { ... }[];
}
```

### Thread Organization Logic

**Location:** `client/src/components/SuggestionCard.tsx:237-240`

```typescript
// Filter top-level comments (no parentId)
const topLevelComments = suggestion.comments.filter(c => !c.parentId);

// Get replies for a specific comment
const getReplies = (commentId: string) => 
  suggestion.comments.filter(c => c.parentId === commentId);
```

### Nesting Depth

- **Maximum depth:** One level (top-level comments + one level of replies)
- **Rationale:** Prevents overly complex nested structures while maintaining clear conversation threads
- **Implementation:** Replies can only be created on top-level comments, not on other replies

---

## UI Formatting and Layout

### Top-Level Comments

**Location:** `client/src/components/SuggestionCard.tsx:842-862`

**Visual Design:**
- **Avatar:** 8x8 (32px) with fallback initials
- **Background:** `bg-muted/30` (subtle muted background)
- **Padding:** `p-2.5` (10px)
- **Text:** `text-sm text-foreground` (standard foreground color)
- **Layout:** Flexbox with avatar on left, content on right

**Components:**
- User name with timestamp (e.g., "John Doe • 2h ago")
- Comment text with word wrapping
- "Reply" button (text-xs, muted foreground, hover effect)

**Code Structure:**
```tsx
<div className="flex gap-2.5 p-2.5 rounded-lg bg-muted/30">
  <Avatar className="h-8 w-8 flex-shrink-0">...</Avatar>
  <div className="flex-1 space-y-2 min-w-0">
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-foreground">{comment.user.name}</span>
      <span className="text-xs text-muted-foreground">• {timeAgo}</span>
    </div>
    <p className="text-sm text-foreground leading-relaxed break-words">{comment.text}</p>
    <button onClick={() => startReply(comment.id)}>Reply</button>
  </div>
</div>
```

### Replies

**Location:** `client/src/components/SuggestionCard.tsx:864-890`

**Visual Design:**
- **Avatar:** 6x6 (24px) - smaller than top-level
- **Background:** `bg-background` (white/default background)
- **Padding:** `p-2` (8px) - less padding than top-level
- **Text:** `text-sm text-muted-foreground` (lighter text color)
- **Indentation:** `ml-12` (48px left margin)
- **Visual Connection:** `pl-6 border-l-2 border-border/50` (left border line)

**Styling Differences from Top-Level:**
- Smaller avatar (6x6 vs 8x8)
- Lighter text color (muted-foreground vs foreground)
- White background vs muted background
- Indented with visual border line
- No "Reply" button (replies cannot be replied to)

**Code Structure:**
```tsx
<div className="ml-12 space-y-2 pl-6 border-l-2 border-border/50">
  {replies.map((reply) => (
    <div key={reply.id} className="flex gap-3 p-2 rounded bg-background">
      <Avatar className="h-6 w-6 flex-shrink-0">...</Avatar>
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{reply.user.name}</span>
          <span className="text-xs text-muted-foreground">• {replyTimeAgo}</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed break-words">{reply.text}</p>
      </div>
    </div>
  ))}
</div>
```

### Reply Form

**Location:** `client/src/components/SuggestionCard.tsx:892-933`

**Visual Design:**
- **Indentation:** Same as replies (`ml-12 pl-6 border-l-2`)
- **Background:** `bg-background` with border
- **Textarea:** Auto-focus, minimum height 60px
- **Placeholder:** "Reply to [User Name]..."

**Keyboard Shortcuts:**
- `Cmd/Ctrl + Enter`: Submit reply
- `Escape`: Cancel reply (closes form, clears text)

**Code Structure:**
```tsx
{replyingTo === comment.id && (
  <div className="ml-12 pl-6 border-l-2 border-border/50 space-y-2 animate-in slide-in-from-top-2 duration-200">
    <div className="flex gap-2 p-2.5 bg-background rounded-lg border border-border">
      <Textarea
        placeholder={`Reply to ${comment.user.name}...`}
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleReply(comment.id);
          }
          if (e.key === 'Escape') {
            setReplyingTo(null);
            setReplyText("");
          }
        }}
        className="min-h-[60px] flex-1 text-sm"
        autoFocus
      />
    </div>
    <div className="flex gap-2 justify-end">
      <button onClick={() => { setReplyingTo(null); setReplyText(""); }}>Cancel</button>
      <button onClick={() => handleReply(comment.id)} disabled={!replyText.trim()}>Send</button>
    </div>
  </div>
)}
```

### New Comment Form

**Location:** `client/src/components/SuggestionCard.tsx:940-968`

**Visual Design:**
- **Background:** `bg-muted/30` (matches top-level comment style)
- **Border:** Top border separator (`border-t`)
- **Textarea:** Same styling as reply form
- **Placeholder:** "Write a comment..."

**Keyboard Shortcuts:**
- `Cmd/Ctrl + Enter`: Submit comment

---

## Optimistic Update Flow

### Overview

Optimistic updates provide instant UI feedback by immediately displaying comments before the server confirms creation. The system uses temporary IDs (`temp-${Date.now()}`) that are later replaced with real database IDs via WebSocket updates.

### Step-by-Step Flow

#### 1. User Submits Comment

**Location:** `client/src/components/SuggestionCard.tsx:242-248` (top-level) and `250-256` (reply)

```typescript
const handleComment = () => {
  if (commentText.trim()) {
    onComment(suggestion.id, commentText);
    setCommentText("");
    setIsThreadExpanded(true); // Auto-expand after posting
  }
};

const handleReply = (parentId: string) => {
  if (replyText.trim()) {
    onComment(suggestion.id, replyText, parentId);
    setReplyText("");
    setReplyingTo(null);
  }
};
```

#### 2. Create Optimistic Comment Object

**Location:** `client/src/App.tsx:1353-1369`

```typescript
const optimisticComment = {
  id: `temp-${Date.now()}`,  // Temporary ID
  proposalId: suggestionId,
  userId: currentUser.id,
  text: text,
  parentId: parentId,  // undefined for top-level, string for replies
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  user: {
    id: currentUser.id,
    name: currentUser.name,
    email: currentUser.email
  },
  parent: parentId ? undefined : undefined,
  replies: []
};
```

**Key Characteristics:**
- **ID Format:** `temp-${Date.now()}` - unique temporary identifier
- **Complete Data:** Includes all required fields (userId, text, parentId, user object)
- **Timestamps:** Uses current time for createdAt/updatedAt
- **User Object:** Populated with current user data

#### 3. Immediate UI Update

**Location:** `client/src/App.tsx:1371-1395`

```typescript
updateDocument((prevDoc) => {
  if (!prevDoc) return prevDoc;
  
  return {
    ...prevDoc,
    paragraphs: prevDoc.paragraphs.map(para => {
      if (para.id !== paragraphId) return para;
      
      const newProposals = para.proposals.map(prop => {
        if (prop.id !== suggestionId) return prop;
        
        return {
          ...prop,
          comments: [...(prop.comments || []), optimisticComment]  // Add to array
        };
      });
      return {
        ...para,
        proposals: newProposals,
        suggestions: newProposals // Keep suggestions in sync
      };
    })
  };
});
```

**Result:** Comment appears instantly in the UI with temporary ID.

#### 4. API Call

**Location:** `client/src/App.tsx:1397-1398`

```typescript
const response = await commentsApi.addComment(
  currentDocument.id, 
  paragraphId, 
  suggestionId, 
  { text, parentId }
);
```

#### 5. Handle API Response

**Location:** `client/src/App.tsx:1400-1426`

**If API Response Includes Real Comment:**
```typescript
if (response?.comment?.id) {
  updateDocument((prevDoc) => {
    // Remove optimistic comment to prevent duplicates
    const filteredComments = prop.comments.filter(
      (c: Comment) => c.id !== optimisticComment.id
    );
    // WebSocket will add real comment
  });
}
```

**Rationale:** Prevents duplicate comments if API response arrives before WebSocket update.

**If API Fails:**
```typescript
catch (err) {
  // Rollback optimistic update
  updateDocument((prevDoc) => {
    return {
      ...prevDoc,
      paragraphs: prevDoc.paragraphs.map(para => {
        // Remove optimistic comment
        comments: prop.comments.filter(
          (c: Comment) => c.id !== optimisticComment.id
        )
      })
    };
  });
  toast.error('Failed to add comment');
}
```

---

## WebSocket Synchronization

### WebSocket Update Handler

**Location:** `client/src/App.tsx:473-551`

When a WebSocket message arrives with a new comment:

```typescript
if (update.eventType === 'comment' && update.data?.proposalId) {
  const { proposalId, paragraphId, comment } = update.data;
  
  updateDocument((prevDoc) => {
    const newParagraphs = prevDoc.paragraphs.map(para => {
      if (para.id !== paragraphId) return para;
      
      const newProposals = para.proposals.map(prop => {
        if (prop.id !== proposalId) return prop;
        
        const existingComments = prop.comments || [];
        const commentExists = existingComments.some((c: Comment) => c.id === comment.id);
        
        let newComments: Comment[];
        if (commentExists) {
          // Update existing comment
          newComments = existingComments.map((c: Comment) => 
            c.id === comment.id ? comment : c
          );
        } else {
          // Check for optimistic comment to replace
          const optimisticIndex = existingComments.findIndex((c: Comment) => 
            isOptimisticEntry(c.id) && matchesOptimisticComment(c, comment)
          );
          
          if (optimisticIndex >= 0) {
            // Replace optimistic comment with real comment
            newComments = [...existingComments];
            newComments[optimisticIndex] = comment;
          } else {
            // Add new comment (from another user)
            newComments = [...existingComments, comment];
          }
        }
        
        return {
          ...prop,
          comments: newComments
        };
      });
      
      return {
        ...para,
        proposals: newProposals,
        suggestions: newProposals
      };
    });
    
    return {
      ...prevDoc,
      paragraphs: newParagraphs
    };
  });
}
```

### Optimistic Comment Matching

**Location:** `client/src/App.tsx:31-50`

```typescript
function isOptimisticEntry(id: string): boolean {
  return id.startsWith('temp-');
}

function matchesOptimisticComment(
  optimistic: Comment,
  real: Comment,
  timeWindowMs: number = 5000
): boolean {
  const optimisticTime = new Date(
    optimistic.createdAt || optimistic.updatedAt
  ).getTime();
  const realTime = new Date(
    real.createdAt || real.updatedAt || real.created_at || real.updated_at
  ).getTime();
  const timeDiff = Math.abs(realTime - optimisticTime);
  
  return (
    optimistic.userId === real.userId &&
    optimistic.text.trim() === real.text.trim() &&
    (optimistic.parentId || null) === (real.parentId || null) &&
    timeDiff < timeWindowMs
  );
}
```

**Matching Criteria:**
1. **Same User:** `optimistic.userId === real.userId`
2. **Same Text:** Trimmed text must match exactly
3. **Same Parent:** Both have same `parentId` (or both null/undefined)
4. **Time Window:** Created within 5 seconds of each other

**Why This Works:**
- Prevents duplicate comments from race conditions
- Handles cases where API response and WebSocket arrive in different orders
- Time window accounts for network delays

---

## Thread Expansion Behavior

### Initial State

**Location:** `client/src/components/SuggestionCard.tsx:93-106`

```typescript
const [isThreadExpanded, setIsThreadExpanded] = useState(() => {
  // Auto-expand comment thread for deletion suggestions
  if (originalText && suggestion.text.trim()) {
    const originalLength = originalText.trim().length;
    const suggestionLength = suggestion.text.trim().length;
    const originalWords = originalText.trim().split(/\s+/).length;
    const suggestionWords = suggestion.text.trim().split(/\s+/).length;

    // Consider it a deletion if significantly shorter (more than 20% shorter)
    const isDeletion = suggestionLength < originalLength * 0.8 || 
                       suggestionWords < originalWords * 0.8;
    return isDeletion;
  }
  return false; // Collapsed by default
});
```

**Default Behavior:**
- **Collapsed:** Most suggestions start with thread collapsed
- **Auto-expanded:** Deletion suggestions (text significantly shorter) auto-expand
- **Rationale:** Deletion suggestions often need discussion, so comments are more important

### Auto-Expansion on New Comments

**Location:** `client/src/components/SuggestionCard.tsx:181-223`

```typescript
useEffect(() => {
  const currentCommentCount = suggestion.comments.length;
  const previousCommentCount = previousCommentCountRef.current;
  
  // Only act if comment count increased and thread is already expanded
  if (currentCommentCount > previousCommentCount && isThreadExpanded) {
    const previousComments = previousCommentsRef.current;
    const newComments = suggestion.comments.filter(
      comment => !previousComments.some(prev => prev.id === comment.id)
    );
    
    // Check if any new comment is:
    // 1. A reply to a comment the current user made
    // 2. A reply to the comment the user is currently replying to
    const shouldKeepExpanded = newComments.some(newComment => {
      if (!newComment.parentId) return true; // Top-level comment, keep expanded
      
      // Check if it's a reply to user's comment
      const parentComment = suggestion.comments.find(c => c.id === newComment.parentId);
      if (parentComment?.userId === currentUser.id) return true;
      
      // Check if it's a reply to the comment user is currently replying to
      if (replyingTo && newComment.parentId === replyingTo) return true;
      
      return false;
    });
    
    // Keep thread expanded if relevant, but don't force expand if collapsed
    if (shouldKeepExpanded) {
      setIsThreadExpanded(true);
    }
  }
  
  previousCommentCountRef.current = currentCommentCount;
  previousCommentsRef.current = [...suggestion.comments];
}, [suggestion.comments, isThreadExpanded, currentUser.id, replyingTo]);
```

**Auto-Expansion Triggers:**
1. **Thread Already Expanded:** Only auto-expands if user is already viewing comments
2. **Reply to User's Comment:** New reply to a comment the current user made
3. **Reply to Active Reply:** New reply to the comment the user is currently replying to
4. **Top-Level Comment:** Any new top-level comment (if thread is expanded)

**Rationale:** Prevents unwanted expansion when user isn't viewing comments, but keeps thread open for relevant updates.

### Manual Expansion

**Location:** `client/src/components/SuggestionCard.tsx:807-827`

Users can manually expand/collapse the thread via a button:

```tsx
<button
  onClick={() => setIsThreadExpanded(!isThreadExpanded)}
  className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-0.5"
>
  <div className="flex items-center gap-2">
    <MessageSquare className="h-4 w-4" />
    <span>
      {suggestion.comments.length === 0 
        ? "No comments yet. Be the first to share your thoughts!" 
        : `Discussion (${suggestion.comments.length})`}
    </span>
    {suggestion.comments.length > 0 && (
      <Badge variant="secondary" className="h-5 text-xs">
        {suggestion.comments.length}
      </Badge>
    )}
  </div>
  <span className="text-xs">
    {isThreadExpanded ? "▲ Hide thread" : "▼ Show thread"}
  </span>
</button>
```

---

## State Management

### Local Component State

**Location:** `client/src/components/SuggestionCard.tsx:88-109`

```typescript
const [commentText, setCommentText] = useState("");           // Top-level comment text
const [replyText, setReplyText] = useState("");               // Reply text
const [replyingTo, setReplyingTo] = useState<string | null>(null);  // Comment ID being replied to
const [isThreadExpanded, setIsThreadExpanded] = useState(() => {
  // Initial state logic (see Thread Expansion Behavior)
});
```

### Global Document State

**Location:** `client/src/App.tsx` (via `useDocumentView` hook)

Comments are stored in the document state:
```typescript
Document {
  paragraphs: [
    {
      proposals: [
        {
          comments: Comment[]  // Flat array with parentId relationships
        }
      ]
    }
  ]
}
```

### Data Flow

1. **User Input:** Local state (`commentText`, `replyText`)
2. **Submit:** `onComment` callback → `handleComment` in App.tsx
3. **Optimistic Update:** Immediate state update with temporary ID
4. **API Call:** Server creates comment, returns real ID
5. **WebSocket Broadcast:** All clients receive update
6. **WebSocket Handler:** Replaces optimistic comment or adds new comment

---

## Visual Hierarchy

### Visual Design Diagram

```
┌─────────────────────────────────────────────────────┐
│ 💬 Discussion (3)                          [▼ Show] │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ 👤 John Doe • 2h ago                        │   │
│ │ This is a top-level comment with some text. │   │
│ │ Reply                                        │   │
│ │                                              │   │
│ │ │ 👤 Jane Smith • 1h ago                    │   │
│ │ │ This is a reply to John's comment.        │   │
│ │ │                                            │   │
│ │ │ 👤 Bob Wilson • 30m ago                    │   │
│ │ │ Another reply in the same thread.          │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ 👤 Alice Brown • 5m ago                      │   │
│ │ Another top-level comment.                   │   │
│ │ Reply                                        │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ [Write a comment...]                         │   │
│ │ Tip: Press Cmd/Ctrl+Enter to post            │   │
│ │                                    [Post]     │   │
│ └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Styling Comparison

| Element | Avatar Size | Background | Text Color | Padding | Indentation |
|---------|------------|------------|------------|---------|-------------|
| Top-level | 8x8 (32px) | `bg-muted/30` | `text-foreground` | `p-2.5` | None |
| Reply | 6x6 (24px) | `bg-background` | `text-muted-foreground` | `p-2` | `ml-12 pl-6 border-l-2` |
| Reply Form | N/A | `bg-background` | `text-foreground` | `p-2.5` | `ml-12 pl-6 border-l-2` |
| New Comment Form | N/A | `bg-muted/30` | `text-foreground` | `p-2.5` | None |

### Visual Connection Line

Replies use a left border line (`border-l-2 border-border/50`) to visually connect them to their parent comment. This creates a clear visual hierarchy:

- **Top-level:** No border, full width
- **Replies:** Left border line, indented 48px + 24px padding

---

## Edge Cases and Error Handling

### 1. Duplicate Comments

**Problem:** Comment could appear twice if:
- API response arrives before WebSocket
- WebSocket update arrives before API response
- Network issues cause retries

**Solution:**
1. **API Response Handling:** Remove optimistic comment if API returns real comment
2. **WebSocket Matching:** Match and replace optimistic comments using `matchesOptimisticComment`
3. **ID Checking:** Check if comment already exists by ID before adding

**Location:** `client/src/App.tsx:500-526`

### 2. Race Conditions

**Problem:** Multiple updates could arrive in different orders.

**Solution:**
- **Time Window Matching:** 5-second window for matching optimistic to real comments
- **ID-Based Deduplication:** Always check for existing comment ID first
- **Immutable Updates:** Always create new array references to trigger React re-renders

### 3. Failed API Calls

**Problem:** Comment appears optimistically but server rejects it.

**Solution:**
- **Error Handling:** Catch API errors and rollback optimistic update
- **User Feedback:** Show error toast message
- **State Cleanup:** Remove optimistic comment from state

**Location:** `client/src/App.tsx:1428-1449`

### 4. WebSocket Delays

**Problem:** WebSocket update might be delayed or not arrive.

**Solution:**
- **API Response Fallback:** Remove optimistic comment when API responds
- **No Timeout Needed:** Unlike votes, comments don't need fallback timeout because API response is sufficient

### 5. Thread Expansion Issues

**Problem:** Thread might not expand when user expects it to.

**Solution:**
- **Manual Control:** User can always manually expand/collapse
- **Auto-Expand on Post:** Thread auto-expands after user posts a comment
- **Smart Auto-Expansion:** Only auto-expands for relevant new comments

### 6. Optimistic Comment Matching Failures

**Problem:** Optimistic comment might not match real comment (e.g., text edited, time window expired).

**Solution:**
- **Fallback Behavior:** If no match found, real comment is added as new comment
- **Result:** User might see both optimistic and real comment briefly, but optimistic will be removed by API response handler
- **Time Window:** 5-second window accounts for normal network delays

---

## Key Files and Locations

### Frontend Files

1. **`client/src/components/SuggestionCard.tsx`**
   - Lines 237-240: Thread organization logic
   - Lines 830-936: Comment rendering (top-level, replies, forms)
   - Lines 181-223: Auto-expansion logic
   - Lines 88-109: Local state management

2. **`client/src/App.tsx`**
   - Lines 31-50: Optimistic entry matching functions
   - Lines 1353-1449: Comment creation and optimistic updates
   - Lines 473-551: WebSocket comment update handler

3. **`client/src/types/index.ts`**
   - Lines 30-57: Comment type definition

### Backend Files

1. **`server/routes/comments.js`**
   - Comment creation endpoint
   - WebSocket broadcast logic

### Related Components

1. **`client/src/components/ActivityFeedView.tsx`**
   - Similar optimistic update logic for activity feed
   - Lines 61-80: Matching functions (duplicated from App.tsx)

---

## Summary

The threaded comments system provides a responsive, user-friendly commenting experience through:

1. **Flat Array Structure:** Simple parent-child relationships via `parentId`
2. **Optimistic Updates:** Instant UI feedback with temporary IDs
3. **WebSocket Synchronization:** Real-time updates across all clients
4. **Smart Matching:** Prevents duplicates through intelligent matching logic
5. **Visual Hierarchy:** Clear distinction between top-level comments and replies
6. **Auto-Expansion:** Smart expansion for relevant new comments
7. **Error Handling:** Robust handling of edge cases and failures

The system balances performance (optimistic updates), reliability (WebSocket + API fallback), and user experience (clear visual hierarchy, smart expansion) to create a seamless commenting experience.
