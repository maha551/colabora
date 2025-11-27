# 📋 Title Paragraph Strategy - Simplified Approach

## User's Proposal

**Create a distinct first paragraph that:**
1. ✅ Must be in every document (always exists)
2. ✅ Can only be the title (no body text, only TITLE proposals)
3. ✅ Document list updates when title proposal is approved
4. ✅ Header name updates when title proposal is approved

---

## Benefits of This Approach

### 1. **Simpler Detection**
- No need to check "is this the title paragraph?"
- **Always** the first paragraph (order_index = 1)
- **Always** heading_level = 'h1'
- **Always** text = '' (empty, no body)
- **Always** only TITLE proposals allowed

### 2. **Clearer Logic**
- First paragraph = document title paragraph (always)
- When TITLE proposal approved → update `paragraphs.title` AND `documents.title`
- Document list shows `documents.title` (automatically updated)
- Header shows `documents.title` (automatically updated)

### 3. **Easier Implementation**
- No complex detection logic needed
- Simple rule: "If paragraph is order_index = 1 AND proposal type = 'TITLE', update documents.title"

---

## Implementation Plan

### Step 1: Ensure First Paragraph is Title-Only
- ✅ Already done: `text = ''`, `heading_level = 'h1'`
- ✅ Only TITLE proposals created for first paragraph
- ✅ No BODY proposals allowed for first paragraph

### Step 2: Update `documents.title` When First Paragraph TITLE Proposal is Approved

**Detection:**
```javascript
// In updateAgreedViewForParagraph
const paragraphInfo = await getParagraphInfo(db, paragraphId);
const isFirstParagraph = paragraphInfo.order_index === 1;
const isTitleProposal = bestProposal.type === 'TITLE';

if (isFirstParagraph && isTitleProposal) {
  // Update documents.title
  await updateDocumentTitle(db, documentId, newValue);
}
```

### Step 3: Document List & Header
- Document list: Already uses `documents.title` ✅
- Header: Should use `documents.title` ✅
- Both automatically show updated title when approved

---

## Current State Check

### First Paragraph Creation (Already Done ✅)
```javascript
// In createInitialParagraph
- order_index = 1
- heading_level = 'h1'
- title = null
- text = ''
- TITLE proposal created
```

### What's Missing
- ❌ Update `documents.title` when first paragraph TITLE proposal is approved

---

## Implementation

### Detection Logic
```javascript
// Get paragraph info to check if it's the first paragraph
const paragraphInfo = await new Promise((resolve, reject) => {
  db.get(`SELECT order_index, heading_level FROM paragraphs WHERE id = ?`, 
    [paragraphId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
});

const isFirstParagraph = paragraphInfo?.order_index === 1;
```

### Update Logic
```javascript
// When TITLE proposal is approved for first paragraph
if (bestProposal.type === 'TITLE' && isFirstParagraph) {
  // Update documents.title to match approved title
  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newValue, documentId],
      function(err) {
        if (err) {
          console.error('Error updating document title:', err);
          db.run('ROLLBACK', () => reject(err));
        } else {
          console.log(`✅ Updated document title to: ${newValue}`);
          resolve();
        }
      }
    );
  });
}
```

---

## Edge Cases

1. **What if first paragraph has no approved title yet?**
   - Show `documents.title` (preliminary title from creation)
   - ✅ Works correctly

2. **What if first paragraph title proposal is rejected?**
   - Keep current `documents.title` (last approved title)
   - ✅ Works correctly

3. **What if user tries to add BODY proposal to first paragraph?**
   - Should be prevented in frontend/backend validation
   - First paragraph = title only

4. **What if first paragraph is deleted?**
   - Should be prevented (first paragraph is required)
   - Or auto-recreate if deleted

---

## Validation Rules

### Backend Validation
- First paragraph (order_index = 1) can only have TITLE proposals
- First paragraph cannot have BODY proposals
- First paragraph text must always be empty

### Frontend Validation
- Disable "Add body text" for first paragraph
- Only show "Add title suggestion" for first paragraph
- Show clear indication that first paragraph is document title

---

## Summary

**This approach is:**
- ✅ Simpler (no complex detection)
- ✅ Clearer (first paragraph = title, always)
- ✅ Easier to implement
- ✅ Easier to understand

**Implementation:**
1. Add check: `if (order_index === 1 && proposal.type === 'TITLE')`
2. Update `documents.title` when approved
3. Done! Document list and header automatically update

**Should we proceed with this approach?**

