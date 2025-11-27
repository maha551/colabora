# 📋 Document Title Logic - Analysis

## Current State

### Document Creation Flow
1. User creates document with title: "My Document"
2. `documents.title` = "My Document" (stored in database)
3. First paragraph created:
   - `order_index = 1`
   - `heading_level = 'h1'`
   - `title = null`, `text = ''` (empty)
4. TITLE proposal created:
   - `text = "My Document"`
   - `type = 'TITLE'`
   - `heading_level = 'h1'`

### Document List Display
- Shows `documents.title` from database
- Currently shows: "My Document" (original creation title)
- **Problem:** Doesn't update when title proposal is approved

### When Title Proposal is Approved
- `updateAgreedViewForParagraph` runs
- Updates `paragraphs.title` = approved title
- **Does NOT update `documents.title`**
- History entry created

### Agreed View
- Shows approved content from `paragraph.history`
- Works correctly ✅

---

## User Requirements

1. ✅ Document name on creation = preliminary title = first suggestion
   - **Current:** Works - `documents.title` = creation title, first proposal = creation title

2. ✅ Once adopted, agreed title should show in Agreed View
   - **Current:** Works - shows from history

3. ❌ Once adopted, agreed title should show in Document List
   - **Current:** Shows original creation title, not approved title

4. ❌ If title changes via proposal and is adopted, document list should update
   - **Current:** Doesn't update `documents.title`

---

## Proposed Solution

### Option 1: Update `documents.title` When Title Proposal is Approved ✅ **RECOMMENDED**

**Concept:**
- `documents.title` = **Current approved title** (dynamic)
- Original creation title preserved in first TITLE proposal
- Document list always shows latest approved title

**Implementation:**
1. Detect if paragraph is document title paragraph:
   - `order_index = 1` AND `heading_level = 'h1'`
   - OR has TITLE proposals
2. When TITLE proposal is approved:
   - Update `paragraphs.title` ✅ (already done)
   - **Also update `documents.title`** ← ADD THIS
3. Document list automatically shows latest approved title

**Pros:**
- ✅ Simple implementation
- ✅ Single source of truth
- ✅ Good performance (no complex queries)
- ✅ Original title preserved in first proposal

**Cons:**
- ⚠️ Loses original creation title in `documents.title` (but it's in first proposal)

---

### Option 2: Query Approved Title for Display

**Concept:**
- Keep `documents.title` as original creation title
- When displaying, query approved title from paragraph
- Fallback to `documents.title` if no approved title

**Pros:**
- ✅ Preserves original title

**Cons:**
- ❌ Complex queries (join paragraphs, proposals, history)
- ❌ Slower performance
- ❌ More complex code

---

## Recommendation: **Option 1**

**Why:**
- Document title should reflect **current state**, not original
- Original title is preserved in first proposal (recoverable)
- Simpler and faster
- Matches user's mental model: "the title is what's currently approved"

---

## Implementation Plan

### Step 1: Detect Document Title Paragraph
```javascript
// In updateAgreedViewForParagraph
const paragraphInfo = await getParagraphInfo(db, paragraphId);
const isDocumentTitleParagraph = 
  paragraphInfo.order_index === 1 && 
  paragraphInfo.heading_level === 'h1';
```

### Step 2: Update documents.title When TITLE Proposal Approved
```javascript
if (bestProposal.type === 'TITLE' && isDocumentTitleParagraph) {
  // Update paragraph title (already done)
  // ALSO update documents.title
  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newValue, documentId],
      function(err) {
        if (err) {
          console.error('Error updating document title:', err);
          db.run('ROLLBACK', () => reject(err));
        } else {
          console.log(`Updated document title to: ${newValue}`);
          resolve();
        }
      }
    );
  });
}
```

### Step 3: Handle Edge Cases
- What if no title proposal approved yet? → Show `documents.title` (preliminary title) ✅
- What if title proposal rejected? → Keep current `documents.title` ✅
- What if multiple title proposals? → Use the one with most votes above threshold ✅

---

## Questions

1. **Should we preserve original title?**
   - ✅ Yes - it's in the first TITLE proposal (can be queried)
   - Could add `original_title` field if needed (probably not necessary)

2. **What if user manually edits document title?**
   - Currently there's a PUT endpoint that updates `documents.title`
   - Should this be disabled? Or should it also update the title paragraph?
   - **Recommendation:** Keep it, but it should also update/create a TITLE proposal

3. **What about the document title in the header?**
   - Currently shows `document.title` from API
   - Should show approved title from paragraph
   - **Recommendation:** Query approved title from paragraph, fallback to `documents.title`

---

## Summary

**Best Approach:** Update `documents.title` when title proposal is approved
- Simple
- Fast
- Matches user expectations
- Original title preserved in first proposal

**Next Steps:**
1. Add detection logic for document title paragraph
2. Update `documents.title` when TITLE proposal is approved
3. Test that document list shows updated title

