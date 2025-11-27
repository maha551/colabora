# Discussion View Revision Plan

## Overview
Redesign the "Discussed" tab in Activity Feed to be more compact, list-like, and scannable while maintaining clarity and functionality.

---

## Current State Analysis

### Current Structure (Debated Proposals Card)
1. **Header Section** (Large, ~80px height)
   - Ranking badge (#1)
   - Icon
   - Title: "Most Debated Proposal"
   - Metadata: "Score: X • Y comments • Controversial"
   - Badges on right side

2. **User & Document Info** (~60px)
   - Avatar (large)
   - User name
   - Document badge
   - Paragraph title
   - Timestamp

3. **Proposed Change Section** (~150-200px)
   - Always visible diff viewer
   - Expandable to full view
   - Shows full text comparison

4. **Comments Section** (~200-300px)
   - "Discussion (N)" header
   - Shows up to 10 comments
   - Each comment: avatar + name + timestamp + text
   - Scrollable area (max-h-64)

5. **Action Button** (~40px)
   - "Join Discussion" button

**Total Height:** ~530-680px per card

---

## Goals

1. **Reduce vertical space by 40-50%** (target: ~300-400px per card)
2. **Make it more list-like** - easier to scan multiple proposals
3. **Improve visual hierarchy** - clearer distinction between sections
4. **Enhance interactivity** - better expand/collapse states
5. **Maintain readability** - don't sacrifice clarity for compactness

---

## Phase 1: Header Consolidation

### Current Issues
- Header takes too much vertical space
- Multiple lines of information
- Badges consume horizontal space

### Proposed Changes

**Option A: Single-Line Header**
```
[#1] Most Debated Proposal • Score: 5.28 • 💬 2 comments [Controversial Badge]
```

**Option B: Two-Line Compact Header**
```
[#1] Most Debated Proposal
Score: 5.28 • 💬 2 comments • ⚖️ Controversial
```

**Implementation:**
- Reduce padding from `p-3.5` to `p-2.5`
- Combine metadata into single line with separators (•)
- Make badges smaller and inline
- Remove large icon circles, use smaller inline icons
- Reduce font sizes: title `text-base` (from `text-lg`), metadata `text-xs`

**Expected Savings:** ~30-40px

---

## Phase 2: User & Document Info Compact Layout

### Current Issues
- Large avatar (h-9 w-9)
- Multiple lines of metadata
- Takes significant vertical space

### Proposed Changes

**Single-Line Layout:**
```
[Avatar h-6 w-6] Charlie Brown in Sample Document • Paragraph 1 • 15h ago [Body Badge]
```

**Implementation:**
- Reduce avatar size: `h-6 w-6` (from `h-9 w-9`)
- Single horizontal line with all metadata
- Use smaller separators (•)
- Inline badge placement
- Reduce padding: `py-1.5` (from `py-2`)

**Expected Savings:** ~25-30px

---

## Phase 3: Proposed Change Section - Collapsible by Default

### Current Issues
- Diff viewer always visible (takes ~150-200px)
- Users may not need to see full diff immediately
- Expand/collapse state not clear

### Proposed Changes

**Default State (Collapsed):**
```
┌─────────────────────────────────────────┐
│ Proposed Change by Charlie Brown [▼]    │
│ Preview: "Changed 'old text' to 'new...'│
└─────────────────────────────────────────┘
```

**Expanded State:**
```
┌─────────────────────────────────────────┐
│ Proposed Change by Charlie Brown [▲]    │
│ [Full Diff Viewer]                      │
└─────────────────────────────────────────┘
```

**Implementation:**
- **Collapsed by default** - show summary/preview
- Summary shows: author name + brief text preview (first 50 chars)
- Clear expand/collapse indicator (chevron)
- Smooth transition animation
- When expanded, show full diff viewer
- Add "Show less" option when expanded

**Expected Savings:** ~100-150px (when collapsed)

---

## Phase 4: Comments Section - Compact List Format

### Current Issues
- Comments take significant space
- Each comment has large padding
- No clear visual hierarchy
- Shows all comments (up to 10) by default

### Proposed Changes

**Option A: Collapsible Comments**
```
┌─────────────────────────────────────────┐
│ 💬 Discussion (2) [▼]                   │
│ [Collapsed - click to expand]           │
└─────────────────────────────────────────┘
```

**Option B: Compact List (Always Visible)**
```
┌─────────────────────────────────────────┐
│ 💬 Discussion (2)                        │
│ ─────────────────────────────────────── │
│ [A] Alice • 15h ago                      │
│ This is a great suggestion...           │
│ ─────────────────────────────────────── │
│ [B] Bob • 12h ago                        │
│ I agree with Alice's point...            │
└─────────────────────────────────────────┘
```

**Recommended: Hybrid Approach**
- Show first 2-3 comments by default (compact format)
- "Show X more comments" link to expand
- When expanded, show all comments

**Comment Format:**
- Smaller avatars: `h-6 w-6` (from `h-8 w-8`)
- Single-line header: `[Avatar] Name • Time`
- Reduced padding: `p-2` (from `p-3`)
- Tighter spacing: `space-y-2` (from `space-y-3`)
- Smaller font: `text-xs` for metadata, `text-sm` for comment text

**Expected Savings:** ~100-150px (when showing 2-3 comments)

---

## Phase 5: Overall Card Structure

### Proposed Layout

```
┌─────────────────────────────────────────────────────┐
│ [#1] Most Debated • Score: 5.28 • 💬 2 [Controversial]│  ← Compact header (1 line)
├─────────────────────────────────────────────────────┤
│ [A] Charlie in Doc • Para • 15h [Body]              │  ← User info (1 line)
├─────────────────────────────────────────────────────┤
│ Proposed Change by Charlie [▼]                      │  ← Collapsed by default
│ Preview: "Changed text from X to Y..."              │
├─────────────────────────────────────────────────────┤
│ 💬 Discussion (2)                                    │  ← Comments header
│ [A] Alice • 15h: Great suggestion...                │  ← First 2-3 comments
│ [B] Bob • 12h: I agree...                           │
│ [Show 0 more comments]                              │  ← Expand link
├─────────────────────────────────────────────────────┤
│ [Join Discussion]                                   │  ← Action button
└─────────────────────────────────────────────────────┘
```

**Total Height:** ~250-300px (from ~530-680px)

---

## Phase 6: Visual Polish

### Spacing & Padding
- Card padding: `p-3` (from `p-3.5`)
- Section spacing: `space-y-2` (from `space-y-3`)
- Border radius: `rounded-lg` (consistent)
- Shadows: `shadow-sm` (subtle)

### Typography
- Card title: `text-base font-semibold` (from `text-lg`)
- Metadata: `text-xs text-gray-600`
- Comment text: `text-sm`
- Comment metadata: `text-xs`

### Colors & Borders
- Subtle borders between sections: `border-t border-gray-100`
- Hover states: `hover:bg-gray-50` on interactive elements
- Active/expanded states: subtle background color change

### Icons
- Smaller icons: `h-3 w-3` or `h-4 w-4`
- Consistent icon sizes throughout
- Clear expand/collapse indicators

---

## Phase 7: Interaction Improvements

### Expand/Collapse States
1. **Proposed Change**
   - Clear chevron indicator (right when collapsed, down when expanded)
   - Smooth transition animation
   - Preview text in collapsed state

2. **Comments**
   - Show 2-3 comments by default
   - "Show X more comments" link
   - Smooth expansion animation
   - Remember expanded state per proposal (optional)

### Hover States
- Card hover: subtle shadow increase
- Interactive elements: background color change
- Buttons: clear hover feedback

### Click Targets
- Ensure all interactive elements have adequate touch targets (min 44x44px)
- Clear visual feedback on click

---

## Implementation Priority

### High Priority (Core Functionality)
1. ✅ Header consolidation (Phase 1)
2. ✅ User info compact layout (Phase 2)
3. ✅ Proposed Change collapsible (Phase 3)
4. ✅ Comments compact format (Phase 4)

### Medium Priority (Polish)
5. ✅ Overall spacing adjustments (Phase 5)
6. ✅ Visual polish (Phase 6)

### Low Priority (Enhancements)
7. ✅ Interaction improvements (Phase 7)
8. ✅ Remember expanded states
9. ✅ Keyboard navigation

---

## Success Metrics

1. **Vertical Space Reduction:** Achieve 40-50% reduction in card height
2. **Scannability:** Users can see 2-3 proposals without scrolling
3. **Readability:** All text remains readable at smaller sizes
4. **Usability:** All functionality remains accessible
5. **Visual Consistency:** Matches overall app design language

---

## Technical Considerations

### Components to Modify
- `ActivityFeedView.tsx` - Main component
- `DiffViewer.tsx` - May need preview mode
- Comment rendering - Extract to reusable component

### State Management
- Track expanded/collapsed state per proposal
- Use `expandedItems` Set (already exists)
- Add state for comments expansion

### Performance
- Lazy load full diff when expanded
- Virtualize long comment lists if needed
- Optimize re-renders with React.memo

---

## Next Steps

1. Review and approve plan
2. Implement Phase 1-4 (High Priority)
3. Test with real data
4. Iterate based on feedback
5. Implement Phase 5-7 (Polish)
6. Final review and deployment

