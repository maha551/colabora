# Activity Feed Two-Column Layout Implementation

## Summary
Successfully implemented a two-column layout for the Activity Feed view with full document context and integrated discussion threads.

## Features Implemented

### 1. Two-Column Layout
- **Left Column (60%)**: Document content and diff viewer
- **Right Column (40%)**: Discussion threads and comment form
- Responsive grid layout (`grid-cols-1 lg:grid-cols-2`)
- Consistent spacing using `max-w-4xl` to match AgreedDocument view

### 2. Left Column - Document Context
#### Default View
- Shows diff comparison between accepted version and proposed change
- Uses existing `DiffViewer` component
- Highlights changes with color coding
- Handles new content (no previous version) with green highlighting

#### Full Document Toggle
- Button to "Show Full Document" / "Show Change Only"
- Fetches all document paragraphs on first click
- Displays full document in scrollable area (500px height)
- Highlights the changed paragraph with amber background
- Shows proposed text in place of current text for changed paragraph
- Cached after first load for performance

### 3. Right Column - Discussion
#### Comments Display
- Shows all comments for the specific proposal only
- Nested comment structure (top-level + replies)
- User avatars and timestamps
- "Reply" functionality for each comment
- Visual hierarchy with indentation for replies

#### Comment Form
- Textarea for new comments
- Keyboard shortcut: Cmd/Ctrl+Enter to submit
- Reply forms appear inline below parent comments
- Cancel and Send buttons for replies
- Real-time updates after posting

### 4. Voting Section
- Voting progress bar at top of each card
- Shows distribution: gray (not voted), red (reject), blue (neutral), green (approve)
- Approval percentage badge (if ≥60%)
- Three voting buttons at bottom: Approve, Neutral, Reject
- Buttons span full width below both columns

### 5. Header Section
- User avatar, name, and badge (Title/Body)
- Document title with icon
- Paragraph title (if applicable)
- Timestamp

## API Integration

### Endpoints Used
1. **GET** `/api/documents/:documentId/paragraphs`
   - Fetches all paragraphs for full document view
   - Cached in `fullDocumentParagraphsMap` state

2. **GET** `/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments`
   - Fetches comments for specific proposal
   - Called on component mount for all pending proposals
   - Refreshed after adding new comments

3. **POST** `/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments`
   - Adds new comment or reply
   - Supports `parentId` for threading

4. **POST** `/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/vote`
   - Casts vote (PRO, NEUTRAL, CONTRA)
   - Removes proposal from pending list after voting

## State Management

### Maps for Per-Proposal State
- `showFullDocumentMap`: Toggle state for full document view
- `fullDocumentParagraphsMap`: Cached paragraphs
- `loadingFullDocumentMap`: Loading states
- `commentsMap`: Comments for each proposal
- `loadingCommentsMap`: Comment loading states
- `commentTextMap`: New comment text input
- `replyingToMap`: Currently replying to which comment
- `replyTextMap`: Reply text input

## User Experience

### Visual Design
- Card-based layout with hover effects
- Color-coded voting progress bar
- Gradient header for "Pending Your Vote" section
- Consistent spacing and borders
- Scrollable areas for long content

### Interactions
- Click toggle to show/hide full document
- Scroll through full document with mouse or scrollbar
- Click "Reply" to open reply form
- Keyboard shortcuts for comment submission
- Loading states with spinners
- Toast notifications for actions

### Responsive Design
- Two columns on large screens (`lg:grid-cols-2`)
- Single column on mobile (`grid-cols-1`)
- Flexible voting button layout

## Code Quality
- No linter errors
- TypeScript type safety
- Proper error handling with try-catch
- Loading states for async operations
- Component reusability (DiffViewer, VoteProgressBar)

## Files Modified
- `client/src/components/ActivityFeedView.tsx`
  - Added two-column layout
  - Implemented full document toggle
  - Integrated comments display and form
  - Added state management for comments and document
  - Removed unused InlineExpandedView component

## Next Steps (Optional Enhancements)
1. Add pagination for long comment threads
2. Add "Edit" and "Delete" for own comments
3. Add emoji reactions to comments
4. Add comment search/filter
5. Add real-time updates via WebSocket
6. Add markdown support for comments
7. Add @mention functionality

