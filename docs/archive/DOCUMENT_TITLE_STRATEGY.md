# 📋 Document Title Strategy - Analysis & Proposal

## Current State

### Document Creation
1. User provides a title (e.g., "My Document")
2. `documents.title` is set to this value
3. First paragraph (order_index = 1) is created **empty** (title = null, text = '')
4. A **TITLE proposal** is created with the user's title as a suggestion

### Document List Display
- Shows `doc.title` from `documents.title` table
- This is the **original creation title**, not the approved title

### When Title Proposal is Approved
- `updateAgreedViewForParagraph` updates the paragraph's `title` field
- **Does NOT update `documents.title`** (only updates if order_index < 0, but we use order_index = 1)
- History entry is created

### Agreed View
- Shows approved content from `paragraph.history`
- Works correctly for approved titles

---

## User Requirements

1. ✅ Document name on creation = preliminary title = first suggestion
2. ✅ Once adopted, agreed title should show in Agreed View (works)
3. ❌ Once adopted, agreed title should show in Document List (currently shows original)
4. ❌ If title changes via proposal and is adopted, document list should update

---

## Proposed Solution: **Option 1 - Update `documents.title` on Approval**

### Concept
- `documents.title` = **Current approved title** (gets updated when title proposals are approved)
- Original creation title is preserved in the first TITLE proposal
- Document list always shows the latest approved title

### Implementation

1. **Detect Title Paragraph:**
   - Check if paragraph is the first paragraph (order_index = 1) AND has heading_level = 'h1'
   - OR check if it's marked as document title (isDocumentTitle logic)

2. **When TITLE Proposal is Approved:**
   - Update `paragraphs.title` (already done)
   - **Also update `documents.title`** to match the approved title
   - This ensures document list shows the latest approved title

3. **Document List Query:**
   - Continue using `documents.title` (now it will be the approved title)

### Pros
- ✅ Simple - single source of truth for display
- ✅ Document list automatically shows latest approved title
- ✅ No schema changes needed
- ✅ Original title preserved in first proposal

### Cons
- ⚠️ Loses original creation title (but it's in the first proposal, so recoverable)
- ⚠️ Need to detect title paragraph correctly

---

## Alternative: **Option 2 - Query Approved Title for Display**

### Concept
- Keep `documents.title` as original creation title
- When displaying document list, query the approved title from the title paragraph
- Use approved title if available, fallback to `documents.title`

### Pros
- ✅ Preserves original creation title
- ✅ More flexible

### Cons
- ❌ More complex queries (need to join with paragraphs, proposals, history)
- ❌ Slower performance
- ❌ More complex code

---

## Recommendation: **Option 1**

**Why:**
- Simpler implementation
- Better performance (no complex queries)
- Document title should reflect current state, not original
- Original title is preserved in the first proposal

**Implementation Steps:**
1. Detect if paragraph is the document title paragraph (order_index = 1 AND heading_level = 'h1')
2. When TITLE proposal is approved, update `documents.title` to match
3. Document list will automatically show the latest approved title

---

## Questions to Answer

1. **Should we preserve original title somewhere?**
   - ✅ Yes - it's in the first TITLE proposal
   - Could add `original_title` field if needed (but probably not necessary)

2. **What if no title proposal is approved yet?**
   - Show `documents.title` (the preliminary title)
   - This is the current behavior, which is fine

3. **What if title proposal is rejected/removed?**
   - Keep current `documents.title` (last approved title)
   - Or revert to original? (probably keep current)

---

## Implementation Details

### Detection Logic
```javascript
// Check if paragraph is document title paragraph
const isDocumentTitleParagraph = 
  paragraph.order_index === 1 && 
  paragraph.heading_level === 'h1' &&
  paragraph.proposals.some(p => p.type === 'TITLE');
```

### Update Logic
```javascript
// When TITLE proposal is approved
if (bestProposal.type === 'TITLE' && isDocumentTitleParagraph) {
  // Update paragraph title (already done)
  // ALSO update documents.title
  await updateDocumentTitle(db, documentId, newValue);
}
```

---

**Does this approach make sense? Should we proceed with Option 1?**

