# Activity Feed Alignment Strategy

## Vision Statement

The Activity Feed should serve as an **alternative view to individual documents** that aggregates all changes from associated documents and presents them in a functionally sorted manner. It should **reuse the same components** from the document discussion view to ensure consistency and reduce code duplication.

---

## Current State Analysis

### Document Discussion View Architecture

**Component Hierarchy:**
```
DocumentEditor
  └── ParagraphWithSuggestions (per paragraph)
      └── SuggestionCard (per suggestion/proposal)
          ├── Voting Progress Bar
          ├── Vote Buttons (Approve/Neutral/Reject)
          ├── Diff Viewer
          ├── Comment Thread (with replies)
          └── New Comment Form
```

**Key Components:**
1. **`SuggestionCard`** - The core reusable component
   - Displays proposal with voting, comments, and diff
   - Handles threaded comments internally
   - Shows vote progress and distribution
   - Supports voting and commenting actions

2. **`ParagraphWithSuggestions`** - Paragraph wrapper
   - Shows paragraph content
   - Manages suggestion display
   - Handles editing and history

3. **`DocumentEditor`** - Document container
   - Renders all paragraphs
   - Manages document-level state

### Current Activity Feed Architecture

**Component Hierarchy:**
```
ActivityFeedView
  └── Tabs (Accepted / Discussed / Pending)
      └── Custom Card Components (per proposal)
          ├── Custom Header
          ├── Custom User Info
          ├── Custom Diff Display
          ├── Custom Comments (just added threading)
          └── Custom Action Buttons
```

**Issues:**
- ❌ Duplicate UI code (custom cards vs SuggestionCard)
- ❌ Inconsistent UX between document view and activity feed
- ❌ Different voting/commenting interfaces
- ❌ Maintenance burden (changes need to be made in two places)

---

## Proposed Architecture

### Core Principle: Component Reuse

**Activity Feed should use `SuggestionCard` as the primary display component**, with minimal wrapper logic to:
1. Transform API data to match SuggestionCard's expected format
2. Handle cross-document navigation
3. Provide document context (which document/paragraph)

### New Component Hierarchy

```
ActivityFeedView
  └── Tabs (Accepted / Discussed / Pending)
      └── ProposalList (wrapper)
          └── SuggestionCard (reused from document view)
              ├── Voting Progress Bar (reused)
              ├── Vote Buttons (reused)
              ├── Diff Viewer (reused)
              ├── Comment Thread (reused)
              └── New Comment Form (reused)
```

---

## Implementation Strategy

### Phase 1: Data Transformation Layer

**Goal:** Create adapters to transform Activity Feed proposal data into SuggestionCard-compatible format.

**Components Needed:**

1. **`ProposalAdapter`** - Transform proposal data
   ```typescript
   interface ProposalAdapter {
     // Transform Activity Feed proposal → SuggestionCard format
     adaptProposal(proposal: ActivityFeedProposal): SuggestionCardProposal;
     
     // Extract document context
     getDocumentContext(proposal: ActivityFeedProposal): DocumentContext;
   }
   ```

2. **Data Mapping:**
   - Map `proposal` → `suggestion` format
   - Map `proposal.votes` → `suggestion.votes`
   - Map `proposal.comments` → `suggestion.comments`
   - Ensure `parentId` is preserved for threaded comments
   - Map user data consistently

### Phase 2: Context Wrapper Component

**Goal:** Create a wrapper that provides document context around SuggestionCard.

**Component: `ActivityFeedProposalCard`**
```typescript
interface ActivityFeedProposalCardProps {
  proposal: ActivityFeedProposal;
  documentContext: {
    documentId: string;
    documentTitle: string;
    paragraphId: string;
    paragraphTitle?: string;
  };
  currentUser: User;
  totalUsers: number;
  allCollaborators: User[];
  onVote: (proposalId, voteType) => void;
  onComment: (proposalId, text, parentId?) => void;
  onNavigateToDocument: (documentId) => void;
}
```

**Features:**
- Shows document/paragraph context above SuggestionCard
- Handles navigation to full document view
- Passes all required props to SuggestionCard
- Maintains compact list-like appearance

### Phase 3: Tab-Specific Adaptations

**Goal:** Customize SuggestionCard display per tab while reusing core component.

**All three tabs will use `SuggestionCard` with tab-specific customizations:**

#### 1. **Accepted Tab** (Latest Agreed)
- **Purpose:** Show proposals that have been accepted/approved
- **Data Source:** Proposals with `approved: true` or `approvalPercentage >= 75%`
- **Display:**
  - Show SuggestionCard with green "Accepted" badge
  - Highlight approved proposals with success styling
  - Show acceptance date and approval percentage prominently
  - Show who accepted and when
  - Link to document for full context
  - Voting disabled (already accepted)
  - Comments enabled (for post-acceptance discussion)
  - **History Access:** 
    - Prominent "View History" button/icon in card header
    - History section expands below SuggestionCard showing:
      - All accepted changes for the paragraph (chronological)
      - Each entry shows: user, date, approval percentage, old text → new text
      - Diff visualization for each historical change
      - Can collapse/expand history section
    - History data comes from paragraph.history (not just the proposal)
    - Makes it easy to see evolution of the paragraph over time

#### 2. **Discussed Tab** (Most Discussed)
- **Purpose:** Show proposals with active discussion/debate
- **Data Source:** Proposals sorted by comment count + vote diversity
- **Display:**
  - Show SuggestionCard with "Hot Discussion" badge
  - Highlight controversial proposals (mixed votes, high engagement)
  - Show comment count prominently in header
  - Show vote distribution (shows why it's debated)
  - Emphasize discussion thread (auto-expand comments)
  - Voting enabled (still open for debate)
  - Comments enabled (active discussion)

#### 3. **Pending Tab** (Vote Pending)
- **Purpose:** Show proposals waiting for votes (especially user's vote)
- **Data Source:** Proposals where user hasn't voted OR proposals needing more votes
- **Display:**
  - Show SuggestionCard with "Vote Pending" badge
  - Highlight proposals needing user's vote (if applicable)
  - Show vote progress clearly (how many have voted)
  - Show "Your vote needed" indicator
  - Make voting actions prominent (call-to-action styling)
  - Comments enabled (can discuss before voting)

**Key Point:** All three tabs reuse the same `SuggestionCard` component, just with different:
- Badges and styling
- Default expanded/collapsed states
- Emphasis on different features (voting vs comments)
- Sorting and filtering logic

### Phase 4: Unified Action Handlers

**Goal:** Create handlers that work across documents.

**Handlers Needed:**

1. **Voting Handler:**
   ```typescript
   const handleVote = async (
     proposalId: string,
     documentId: string,
     paragraphId: string,
     voteType: 'PRO' | 'NEUTRAL' | 'CONTRA'
   ) => {
     // Call API with full context
     await votesApi.castVote(documentId, paragraphId, proposalId, voteType);
     // Refresh activity feed
     await refreshActivityFeed();
   };
   ```

2. **Comment Handler:**
   ```typescript
   const handleComment = async (
     proposalId: string,
     documentId: string,
     paragraphId: string,
     text: string,
     parentId?: string
   ) => {
     // Call API with full context
     await commentsApi.addComment(documentId, paragraphId, proposalId, { text, parentId });
     // Refresh activity feed
     await refreshActivityFeed();
   };
   ```

---

## Component Reuse Plan

### Direct Reuse (No Changes Needed)

✅ **`SuggestionCard`** - Use as-is
- Already handles voting, comments, diff display
- Already supports threaded comments
- Already has vote progress visualization

✅ **`DiffViewer`** - Use as-is
- Already used within SuggestionCard
- Works with any text comparison

✅ **UI Components** - Use as-is
- Button, Card, Badge, Avatar, etc.
- Already consistent across app

### Wrapper Components (New)

🆕 **`ActivityFeedProposalCard`** - New wrapper
- Provides document context header
- Wraps SuggestionCard
- Handles navigation
- Manages compact display mode
- **For Accepted tab:** Includes history display section
  - Shows paragraph version history
  - Expandable/collapsible history list
  - Reuses history display component from ParagraphWithSuggestions

🆕 **`ProposalList`** - New container
- Manages list of proposals
- Handles sorting/filtering
- Provides tab-specific styling

### Data Adapters (New)

🆕 **`proposalAdapter.ts`** - Data transformation utilities
- Transform API responses to component format
- Handle edge cases and missing data
- Normalize user/collaborator data

---

## Benefits of This Approach

### 1. **Consistency**
- ✅ Same UI/UX as document view
- ✅ Users learn once, use everywhere
- ✅ Familiar interaction patterns

### 2. **Maintainability**
- ✅ Single source of truth for suggestion display
- ✅ Bug fixes benefit both views
- ✅ Feature additions automatically available

### 3. **Code Reduction**
- ✅ Eliminate duplicate card components
- ✅ Reuse existing comment threading
- ✅ Reuse voting logic

### 4. **Feature Parity**
- ✅ Activity Feed gets all SuggestionCard features
- ✅ Threaded comments (already implemented)
- ✅ Vote progress visualization
- ✅ Diff viewing
- ✅ All future enhancements

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
1. ✅ Create `ProposalAdapter` utility
2. ✅ Create `ActivityFeedProposalCard` wrapper
3. ✅ Test data transformation with one tab

### Phase 2: Component Integration (Week 1-2)
1. ✅ Replace custom cards with SuggestionCard in "Pending" tab
2. ✅ Test voting and commenting
3. ✅ Ensure navigation works
4. ✅ Add history display component (reusable from ParagraphWithSuggestions)
5. ✅ Integrate history in ActivityFeedProposalCard for Accepted tab

### Phase 3: Full Migration (Week 2)
1. ✅ Migrate "Discussed" tab to SuggestionCard
2. ✅ Migrate "Accepted" tab to SuggestionCard
3. ✅ Remove old custom card code

### Phase 4: Polish & Optimization (Week 2-3)
1. ✅ Optimize data loading
2. ✅ Add loading states for infinite scroll
3. ✅ Improve error handling
4. ✅ Performance testing
5. ✅ Add document filter UI
6. ✅ Test filtering across all tabs

### Phase 5: Real-time Updates (Future)
1. ✅ Set up WebSocket connection
2. ✅ Subscribe to proposal updates
3. ✅ Update proposals in real-time
4. ✅ Show notification badges
5. ✅ Handle connection errors gracefully

---

## Data Flow Architecture

### Current Flow:
```
API → ActivityFeedView → Custom Cards → Custom UI
```

### Proposed Flow:
```
API → ActivityFeedView → ProposalAdapter → ActivityFeedProposalCard → SuggestionCard → Reused UI
```

### Data Transformation Example:

**API Response:**
```typescript
{
  id: "proposal-123",
  documentId: "doc-456",
  paragraphId: "para-789",
  proposedText: "New text",
  currentText: "Old text",
  user: { id: "user-1", name: "Alice" },
  votes: [{ userId: "user-1", vote: "PRO" }],
  comments: [{ id: "comment-1", text: "Great idea", parentId: null }]
}
```

**Transformed to SuggestionCard Format:**
```typescript
{
  id: "proposal-123",
  text: "New text",
  user: { id: "user-1", name: "Alice" },
  votes: [{ userId: "user-1", vote: "PRO" }],
  comments: [{ id: "comment-1", text: "Great idea", parentId: null }],
  // ... other SuggestionCard required fields
}
```

---

## Key Design Decisions

### 1. **Document Context Display**

**Option A: Header Above Card**
```
┌─────────────────────────────────┐
│ 📄 Document Name • Paragraph 1  │ ← Context header
├─────────────────────────────────┤
│ [SuggestionCard content]        │
└─────────────────────────────────┘
```

**Option B: Badge/Inline**
```
┌─────────────────────────────────┐
│ [SuggestionCard with context    │
│  badge in header]               │
└─────────────────────────────────┘
```

**Recommendation:** Option A - Clearer separation, easier to scan

### 2. **Compact vs Full Display**

**Question:** Should Activity Feed show SuggestionCard in compact mode?

**Recommendation:** 
- Use SuggestionCard's existing collapsible features
- Add optional "compact" prop if needed
- Default to showing full functionality (users can collapse)

### 3. **Navigation Behavior**

**Question:** What happens when clicking "View in Document"?

**Recommendation:**
- Navigate to document view
- Pre-select the specific proposal
- Scroll to the relevant paragraph
- Expand the discussion area

### 4. **Voting/Commenting Context**

**Question:** How to handle voting/commenting across documents?

**Recommendation:**
- Activity Feed handlers include documentId/paragraphId
- API calls use full context
- Refresh only affected proposal after action
- Show success toast with document context

---

## Migration Checklist

### Preparation
- [ ] Audit SuggestionCard interface and props
- [ ] Document all required data fields
- [ ] Identify any missing features in Activity Feed
- [ ] Create test data for all scenarios

### Implementation
- [ ] Create ProposalAdapter utility
- [ ] Create ActivityFeedProposalCard wrapper
- [ ] Update API handlers to include document context
- [ ] Migrate Pending tab first (test thoroughly)
- [ ] Migrate Discussed tab
- [ ] Migrate Accepted tab
- [ ] Remove old custom card code

### Testing
- [ ] Test voting from Activity Feed
- [ ] Test commenting from Activity Feed
- [ ] Test threaded replies
- [ ] Test navigation to documents
- [ ] Test data refresh after actions
- [ ] Test with multiple documents
- [ ] Test edge cases (no votes, no comments, etc.)

### Cleanup
- [ ] Remove unused custom card components
- [ ] Remove duplicate comment code
- [ ] Update documentation
- [ ] Code review

---

## Open Questions for Discussion

1. **Should Activity Feed proposals be editable?**
   - Currently document view allows editing proposals
   - Should Activity Feed allow this too?
   - Or redirect to document view for editing?

2. **How to handle proposals from documents user doesn't have access to?**
   - Show limited info?
   - Hide completely?
   - Show with "No access" badge?

3. **Should Activity Feed support filtering by document?**
   - Add document filter dropdown?
   - Or keep it simple (all documents)?

4. **Performance considerations:**
   - How many proposals to load at once?
   - Should we paginate or infinite scroll?
   - Cache document data for context?

5. **Real-time updates:**
   - Should Activity Feed update in real-time?
   - Or require manual refresh?
   - WebSocket integration?

---

## Success Metrics

1. **Code Reduction:** Reduce Activity Feed component code by 60-70%
2. **Consistency:** 100% UI parity between document view and activity feed
3. **Maintainability:** Single source of truth for suggestion display
4. **User Experience:** Seamless navigation between views
5. **Performance:** No degradation in load times

---

## Tab Structure Clarification

### Current Tabs (All Will Use SuggestionCard)

1. **"Accepted" Tab** (`agreed`)
   - Shows proposals that have been accepted
   - Sorted by acceptance date (newest first)
   - Uses SuggestionCard with accepted styling
   - Voting disabled, comments enabled

2. **"Discussed" Tab** (`debated`)
   - Shows proposals with active discussion
   - Sorted by engagement (comments + vote diversity)
   - Uses SuggestionCard with discussion emphasis
   - Voting enabled, comments auto-expanded

3. **"Pending" Tab** (`pending`)
   - Shows proposals waiting for votes
   - Prioritizes proposals user hasn't voted on
   - Uses SuggestionCard with voting emphasis
   - Voting enabled, prominent CTA

**All tabs will:**
- ✅ Use the same `SuggestionCard` component
- ✅ Show document context (which document/paragraph)
- ✅ Support threaded comments
- ✅ Support voting (where applicable)
- ✅ Link to full document view
- ✅ Filter by document (new feature)
- ✅ Infinite scroll loading
- ✅ Real-time updates via WebSocket (future)

**Accepted tab additionally:**
- ✅ Easy access to paragraph history
- ✅ History section shows all accepted changes chronologically
- ✅ Each history entry shows: user, date, approval %, old → new text diff
- ✅ Expandable/collapsible history view
- ✅ History button prominently displayed in card header

---

## Next Steps

1. ✅ **Review and approve this strategy** - DONE
2. ✅ **Clarify open questions** - DONE
3. **Create detailed implementation plan**
4. **Start with Phase 1 (Foundation)**
5. **Iterate based on feedback**

