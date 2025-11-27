# Document Options Implementation Plan

## Overview
Add configurable options to documents to control voting behavior and collaboration settings.

## Features to Implement

### 1. **Acceptance Threshold** (One-Time Choice)
- Default: 75%
- Range: 1-100%
- **Cannot be changed after document creation** (one-time choice)
- Used to determine when proposals are automatically accepted
- No recalculation when threshold is set (historical proposals keep their approval status)

### 2. **Voting Anonymity** (Open/Closed = Public/Anonymous)
- Default: Open (Public - votes are visible)
- Can be locked at creation (one-time choice)
- **Open Voting** = Public voting (users can see who voted what)
- **Closed Voting** = Anonymous voting (users cannot see who voted what)
- If locked: Cannot change anonymity setting after creation
- If not locked: Owner can toggle between public/anonymous (but this is a one-time choice per the requirement)

### 3. **Vote Flexibility** (Flexible/Locked Votes)
- Default: Flexible (can change vote after casting)
- **Flexible Votes**: Users can change their vote after casting it
- **Locked Votes**: Users cannot change their vote after first vote
- Can be locked at creation (one-time choice)
- If locked: Cannot change vote flexibility after creation

### 4. **Collaborator Management** (Already exists, but will be part of options)
- Current: Owner can add/remove collaborators
- Collaborators can view document options (transparency)
- Only owner can change options

---

## Database Schema Changes

### Add columns to `documents` table:

```sql
ALTER TABLE documents ADD COLUMN acceptance_threshold REAL DEFAULT 75.0;
ALTER TABLE documents ADD COLUMN voting_anonymous BOOLEAN DEFAULT 0;
ALTER TABLE documents ADD COLUMN voting_anonymity_locked BOOLEAN DEFAULT 0;
ALTER TABLE documents ADD COLUMN vote_change_allowed BOOLEAN DEFAULT 1;
```

**Column Descriptions:**
- `acceptance_threshold`: Percentage (1-100) required for proposal approval (one-time, cannot change)
- `voting_anonymous`: Boolean - true = anonymous voting (closed), false = public voting (open)
- `voting_anonymity_locked`: Boolean - if true, anonymity setting cannot be changed after creation
- `vote_change_allowed`: Boolean - true = flexible votes (can change), false = locked votes (cannot change)

**Note:** All options are one-time choices set at creation, so no separate lock flags are needed for vote flexibility or threshold.

---

## Backend API Changes

### 1. Update Document Creation (`POST /api/documents`)

**Request Body:**
```json
{
  "title": "Document Title",
  "description": "Optional description",
  "options": {
    "acceptanceThreshold": 75,        // Optional, default 75 (one-time choice)
    "votingAnonymous": false,          // Optional, default false (public/open)
    "votingAnonymityLocked": false,   // Optional, default false
    "voteChangeAllowed": true         // Optional, default true (flexible)
  }
}
```

**Changes:**
- Accept `options` object in request body
- Store options in database when creating document
- Validate acceptanceThreshold (1-100)
- Set defaults if not provided
- **All options are one-time choices** - cannot be changed after creation

### 2. Update Document Retrieval (`GET /api/documents/:id`)

**Response Changes:**
- Include `options` object in document response:
```json
{
  "document": {
    "id": "...",
    "title": "...",
    "options": {
      "acceptanceThreshold": 75,
      "votingAnonymous": false,
      "votingAnonymityLocked": false,
      "voteChangeAllowed": true
    },
    ...
  }
}
```

### 3. ~~New Endpoint: Update Document Options~~ **REMOVED**

**Note:** All document options are one-time choices set at creation. They cannot be changed afterward. This ensures consistency and prevents confusion about voting rules mid-document.

### 4. Update Vote Casting (`POST /api/documents/:id/paragraphs/:paragraphId/proposals/:proposalId/vote`)

**Changes:**
- Check if vote changes are allowed (`vote_change_allowed`)
- If `vote_change_allowed = false` and user already voted, return error:
```json
{
  "error": "Votes are locked for this document. You cannot change your vote."
}
```
- If `vote_change_allowed = true`, allow vote updates (existing behavior)
- When returning vote data, check `voting_anonymous`:
  - If anonymous: Don't include user information in vote responses
  - If public: Include user information (existing behavior)

### 5. Update Approval Logic (`checkAndUpdateProposalApproval`)

**Changes:**
- Use document's `acceptance_threshold` instead of hardcoded 75%
- Query document options when checking approval
- Calculate: `approvalPercentage >= document.acceptanceThreshold`
- **No recalculation** - threshold is set at creation and never changes
- Historical proposals keep their approval status based on threshold at time of creation

---

## Frontend Changes

### 1. TypeScript Types (`client/src/types/index.ts`)

**Add DocumentOptions interface:**
```typescript
export interface DocumentOptions {
  acceptanceThreshold: number;        // 1-100 (one-time choice)
  votingAnonymous: boolean;            // true = anonymous (closed), false = public (open)
  votingAnonymityLocked: boolean;      // if true, anonymity cannot be changed
  voteChangeAllowed: boolean;          // true = flexible, false = locked
}

export interface Document {
  // ... existing fields
  options?: DocumentOptions;
}
```

### 2. Document Creation Form (`DocumentDashboard.tsx`)

**Add Options Section:**
- Acceptance Threshold slider/input (1-100%, default 75%)
  - Warning: "This cannot be changed after creation"
- Voting Anonymity:
  - Public (Open) / Anonymous (Closed) radio buttons
  - "Lock anonymity setting" checkbox
  - Help text: "Public = votes are visible, Anonymous = votes are hidden"
- Vote Flexibility:
  - Flexible / Locked radio buttons
  - "Lock vote flexibility" checkbox
  - Help text: "Flexible = can change vote, Locked = vote cannot be changed after casting"

**UI Layout:**
```
┌─────────────────────────────────────┐
│ Document Title *                     │
│ [Input field]                        │
├─────────────────────────────────────┤
│ Description (Optional)              │
│ [Textarea]                          │
├─────────────────────────────────────┤
│ Document Options                    │
│ ⚠️ These settings cannot be changed │
│    after document creation          │
│                                     │
│ Acceptance Threshold:              │
│ [Slider: 1% ──────●────── 100%] 75%│
│ ℹ️ Cannot be changed later         │
│                                     │
│ Voting Anonymity:                   │
│ ○ Public (Open)  ● Anonymous (Closed)│
│ ☑ Lock anonymity setting            │
│ ℹ️ Public = votes visible,          │
│   Anonymous = votes hidden          │
│                                     │
│ Vote Flexibility:                   │
│ ● Flexible  ○ Locked                │
│ ℹ️ Flexible = can change vote,     │
│   Locked = vote cannot be changed   │
│                                     │
├─────────────────────────────────────┤
│ Add Contributors (Optional)       │
│ [Existing contributor selection]    │
└─────────────────────────────────────┘
```

### 3. Document Settings View

**New Component: `DocumentSettings.tsx`**
- Show current document options (read-only)
- Display all settings with clear labels
- Show lock status indicators
- **No editing** - all options are one-time choices
- Help text explaining what each option means

**Access:**
- From document view: Settings button/icon
- Or from CollaboratorManagement dropdown

### 4. Document View Updates

**Show Voting Settings:**
- Badge/indicator showing:
  - "Public Voting" or "Anonymous Voting"
  - "Flexible Votes" or "Locked Votes"
- Display acceptance threshold: "Requires 75% approval" (or document's threshold)

**Vote Display Logic:**
- If `votingAnonymous = true`:
  - Don't show who voted (hide user names/avatars)
  - Show vote counts only: "3 PRO, 1 NEUTRAL, 0 CONTRA"
  - Hide voter details in expandable sections
- If `votingAnonymous = false`:
  - Show who voted (existing behavior)
  - Display user names/avatars with votes

**Vote Change Logic:**
- If `voteChangeAllowed = false`:
  - After user casts first vote, disable vote buttons for that proposal
  - Show message: "Your vote is locked. You cannot change it."
  - Show current vote clearly
- If `voteChangeAllowed = true`:
  - Allow vote changes (existing behavior)
  - Show current vote with option to change

**Show Acceptance Threshold:**
- Display threshold in proposal cards: "Requires 75% approval" (or document's threshold)

### 5. API Client Updates (`client/src/lib/api.ts`)

**Update `createDocument`:**
```typescript
async createDocument(
  title: string, 
  description?: string, 
  contributors?: string[],
  options?: DocumentOptions
) {
  return apiRequest('/api/documents', {
    method: 'POST',
    body: JSON.stringify({ 
      title, 
      description,
      options 
    }),
  })
}
```

**Note:** No `updateDocumentOptions` function needed - options are one-time choices.

---

## Implementation Steps

### Phase 1: Database & Backend Core
1. ✅ Update database schema (CREATE TABLE) with new columns
2. ✅ Reset database (delete old, create fresh)
3. ✅ Update document creation endpoint to accept options
4. ✅ Update document retrieval to include options
5. ✅ Update approval logic to use document threshold
6. ✅ Add voting status check in vote endpoint

### Phase 2: Backend Vote Logic Updates
6. ✅ Update vote casting to check `vote_change_allowed`
7. ✅ Update vote responses to hide user info when `voting_anonymous = true`
8. ✅ Ensure vote changes are blocked when `vote_change_allowed = false`

### Phase 3: Frontend Types & API
9. ✅ Add TypeScript types for options
10. ✅ Update API client functions
11. ✅ Update document creation flow

### Phase 4: Frontend UI
12. ✅ Add options to document creation form
13. ✅ Create document settings component (read-only)
14. ✅ Update document view to show voting settings
15. ✅ Implement anonymous voting display (hide user info)
16. ✅ Implement vote change restrictions (lock votes)
17. ✅ Display acceptance threshold in UI

### Phase 5: Demo Data & Tutorial
18. ✅ Create new demo document with tutorial content
19. ✅ Add tutorial sections explaining options
20. ✅ Include examples of different option combinations
21. ✅ Test tutorial document displays correctly

### Phase 6: Testing & Polish
22. ✅ Test document creation with all option combinations
23. ✅ Test anonymous voting (hide user info)
24. ✅ Test public voting (show user info)
25. ✅ Test flexible votes (can change)
26. ✅ Test locked votes (cannot change)
27. ✅ Verify options cannot be changed after creation
28. ✅ Test tutorial document
29. ✅ Update documentation

---

## Edge Cases & Considerations

### 1. **Database Reset**
- No migration needed - fresh start
- Existing database will be deleted/reset
- New schema includes all options columns
- Demo data created with new options system

### 2. **One-Time Choice Behavior**
- All options are set at creation and **cannot be changed**
- This ensures consistency throughout document lifecycle
- No recalculation needed - historical proposals keep their status
- UI should clearly indicate these are permanent choices

### 3. **Anonymous Voting (Closed)**
- When `voting_anonymous = true`:
  - Vote counts are visible (e.g., "3 PRO, 1 NEUTRAL")
  - User identities are hidden
  - Cannot see who voted what
  - Vote progress bars show percentages but not names
- When `voting_anonymous = false` (Public/Open):
  - Full transparency - see who voted what
  - User names/avatars shown with votes
  - Existing behavior maintained

### 4. **Locked Votes (Vote Change Not Allowed)**
- When `vote_change_allowed = false`:
  - User casts first vote → vote is locked
  - Cannot change vote after first vote
  - UI shows current vote clearly
  - Vote buttons disabled after first vote
  - Message: "Your vote is locked"
- When `vote_change_allowed = true` (Flexible):
  - Can change vote anytime (existing behavior)
  - Vote buttons always enabled
  - Can switch between PRO/NEUTRAL/CONTRA

### 5. **UI/UX Considerations**
- Make options visible but not overwhelming
- Use clear labels and help text
- Show prominent warning: "These settings cannot be changed after creation"
- Display current settings clearly in document view
- Use badges/indicators for voting mode (Public/Anonymous, Flexible/Locked)
- Show acceptance threshold prominently

---

## Example Usage Scenarios

### Scenario 1: Strict Approval with Anonymous Voting
```
Owner creates document with:
- Acceptance Threshold: 90%
- Voting: Anonymous (Closed)
- Vote Flexibility: Locked

Result: Requires 90% approval, votes are anonymous, votes cannot be changed
```

### Scenario 2: Public Voting with Flexible Votes
```
Owner creates document with:
- Acceptance Threshold: 75%
- Voting: Public (Open)
- Vote Flexibility: Flexible

Result: Votes are visible, users can change their votes, 75% approval needed
```

### Scenario 3: Anonymous Flexible Voting
```
Owner creates document with:
- Acceptance Threshold: 50%
- Voting: Anonymous (Closed)
- Vote Flexibility: Flexible

Result: Lower threshold, anonymous voting, but users can change votes
```

### Scenario 4: Public Locked Voting
```
Owner creates document with:
- Acceptance Threshold: 75%
- Voting: Public (Open)
- Vote Flexibility: Locked

Result: Votes are visible, but once cast cannot be changed, 75% approval needed
```

---

## Future Enhancements (Not in this implementation)

1. **Permission Levels:**
   - View-only collaborators
   - Comment-only collaborators
   - Vote-only collaborators
   - Full edit collaborators

2. **Time-Based Voting:**
   - Voting deadline
   - Auto-close voting after deadline

3. **Voting Rules:**
   - Require minimum number of votes
   - Weighted voting (owner vote counts more)
   - Quorum requirements

4. **Notification Settings:**
   - Notify when voting closes
   - Notify when threshold is reached

---

## Questions to Consider

1. **Should threshold changes trigger immediate recalculation?**
   - ❌ No - threshold is one-time choice, no recalculation needed

2. **Can collaborators see document options?**
   - ✅ Yes - transparency is good
   - Options are read-only for everyone (set at creation)

3. **How to display anonymous votes?**
   - Show vote counts: "3 PRO, 1 NEUTRAL, 0 CONTRA"
   - Hide user names/avatars
   - Show percentages in progress bars
   - Don't show "who voted" in expandable sections

4. **What happens when vote is locked?**
   - After first vote, disable vote buttons for that proposal
   - Show current vote clearly
   - Display message that vote cannot be changed

---

## Database Reset Strategy

### No Legacy Mode - Fresh Start

**Approach:** Instead of migrating existing data, we'll reset the database and create fresh demo data with the new options system.

### Database Schema Update

**Update `documents` table creation in `server/index.js`:**
```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  acceptance_threshold REAL DEFAULT 75.0 NOT NULL,
  voting_anonymous BOOLEAN DEFAULT 0 NOT NULL,
  voting_anonymity_locked BOOLEAN DEFAULT 0 NOT NULL,
  vote_change_allowed BOOLEAN DEFAULT 1 NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
)
```

**Note:** Columns are added directly to CREATE TABLE statement (not ALTER TABLE) since we're resetting.

### Reset Process

1. **Backup existing database** (optional, for safety)
   ```bash
   cp colabora.db colabora.db.backup
   # or
   cp server/colabora.db server/colabora.db.backup
   ```

2. **Delete existing database file** (`colabora.db` or `server/colabora.db`)
   - Server will automatically recreate it on next startup
   - All existing documents, proposals, votes, comments will be lost

3. **Update `server/index.js`** to include new columns in CREATE TABLE statement

4. **Restart server** - will create fresh database with new schema

5. **Create new demo document** with tutorial content (see Tutorial Document Content section)

6. **Add tutorial** to help users understand the new features

### Important Notes

⚠️ **Data Loss Warning:**
- All existing documents will be deleted
- All proposals, votes, comments will be lost
- User accounts will be recreated (demo users)
- This is a breaking change - no backward compatibility

✅ **Benefits:**
- Clean slate with new options system
- No migration complexity
- Consistent data structure
- Tutorial document helps users learn the system

### New Demo Document

Create a demo document showcasing different option combinations:

**Document: "Document Options Tutorial"**
- **Acceptance Threshold:** 75% (default)
- **Voting:** Public (Open)
- **Vote Flexibility:** Flexible
- **Purpose:** Tutorial document explaining how options work

**Content:** Include sections explaining:
- What acceptance threshold means
- Public vs Anonymous voting
- Flexible vs Locked votes
- How to create documents with custom options

---

## Testing Checklist

- [ ] Create document with custom threshold
- [ ] Create document with anonymous voting
- [ ] Create document with public voting
- [ ] Create document with locked votes
- [ ] Create document with flexible votes
- [ ] Verify options cannot be changed after creation
- [ ] Vote when votes are flexible (can change)
- [ ] Vote when votes are locked (cannot change after first vote)
- [ ] Anonymous voting hides user info
- [ ] Public voting shows user info
- [ ] Proposal approval with custom threshold
- [ ] Database reset works correctly
- [ ] New demo document created successfully
- [ ] Tutorial content displays correctly
- [ ] UI shows voting settings correctly
- [ ] UI hides user info when anonymous
- [ ] UI locks votes when vote_change_allowed = false
- [ ] Settings view shows current options (read-only)
- [ ] Options are visible to all collaborators

---

## Tutorial Document Content

### New Demo Document: "Document Options Tutorial"

**Document Options:**
- Acceptance Threshold: 75%
- Voting: Public (Open)
- Vote Flexibility: Flexible

**Content Sections:**

1. **Introduction**
   - Welcome to Colabora's new document options system
   - These settings control how voting works in your document
   - All options are set when you create a document and cannot be changed

2. **Acceptance Threshold**
   - What it means: Percentage of collaborators who must vote PRO for a proposal to be automatically accepted
   - Default: 75%
   - Range: 1-100%
   - Example: With 4 collaborators and 75% threshold, need 3 PRO votes
   - **This cannot be changed after document creation**

3. **Voting Anonymity**
   - **Public (Open) Voting:**
     - Everyone can see who voted what
     - User names and avatars shown with votes
     - Full transparency
   - **Anonymous (Closed) Voting:**
     - Votes are hidden - only counts are visible
     - Cannot see who voted what
     - Privacy-focused collaboration
   - **This cannot be changed after document creation**

4. **Vote Flexibility**
   - **Flexible Votes:**
     - You can change your vote anytime
     - Vote buttons remain active
     - Allows reconsideration
   - **Locked Votes:**
     - Once you vote, you cannot change it
     - Vote buttons disabled after first vote
     - Committed decision-making
   - **This cannot be changed after document creation**

5. **Creating Documents with Options**
   - When creating a new document, you'll see an "Options" section
   - Set your preferences before creating
   - Remember: These are permanent choices
   - Choose carefully based on your collaboration needs

6. **Example Scenarios**
   - **Strict Approval (90% threshold, anonymous, locked votes)**
   - **Collaborative Discussion (50% threshold, public, flexible votes)**
   - **Balanced Approach (75% threshold, public, flexible votes)** ← This document

7. **Viewing Document Options**
   - Click the settings icon to see document options
   - Options are visible to all collaborators
   - Options are read-only (cannot be changed)

**Demo Proposals:**

Include example proposals to demonstrate the system:

1. **Example Proposal 1: "Understanding Acceptance Threshold"**
   - Text: "This proposal demonstrates how the 75% acceptance threshold works. With 4 collaborators, we need 3 PRO votes for automatic acceptance."
   - Include votes from multiple users
   - Show vote progress bar
   - Show how threshold affects approval

2. **Example Proposal 2: "Public Voting Example"**
   - Text: "In public voting mode, you can see who voted what. Look at the votes below to see user names and avatars."
   - Include votes with user information visible
   - Demonstrate transparency

3. **Example Proposal 3: "Flexible Votes Example"**
   - Text: "With flexible votes enabled, you can change your vote. Try voting PRO, then change to NEUTRAL, then to CONTRA."
   - Instructions for users to try changing votes
   - Show that vote buttons remain active

**Note:** Since this tutorial document uses Public voting, all votes will show user information. Users can create their own documents with Anonymous voting to see the difference.

---

## Implementation Order

### Step 1: Database Schema Update
- Update `CREATE TABLE documents` in `server/index.js`
- Add all 5 new columns directly to CREATE statement
- Remove any ALTER TABLE migration code

### Step 2: Backend Implementation
- Update document creation to accept options
- Update document retrieval to return options
- Update vote logic for anonymous/flexible votes
- Update approval logic to use document threshold

### Step 3: Frontend Implementation
- Add TypeScript types
- Update API client
- Add options to document creation form
- Update document view to show/hide vote info
- Add settings view (read-only)

### Step 4: Database Reset & Demo Data
- Backup existing database (optional)
- Delete `colabora.db` file
- Restart server (creates fresh database)
- Update `insertDemoData()` function to create tutorial document
- Add tutorial content with example proposals

### Step 5: Testing
- Test all option combinations
- Test anonymous voting display
- Test vote locking
- Test tutorial document
- Verify options cannot be changed

## Next Steps

1. ✅ Review this plan
2. ✅ Confirm approach and edge case handling
3. **Backup existing database** (optional, but recommended)
4. Implement Phase 1 (Database Schema Update & Backend Core)
5. Test backend changes
6. Implement Phase 2-4 (Frontend)
7. **Reset database** and create tutorial document (Phase 5)
8. End-to-end testing
9. Documentation updates

