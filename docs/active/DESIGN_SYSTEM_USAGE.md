# Design System Usage Guide

This guide explains how to use the design system consistently across the application.

## Overview

The design system consists of:
- **CSS Variables** (`client/src/styles/globals.css`): Runtime values for colors, theme-aware
- **TypeScript Constants** (`client/src/lib/designSystem.ts`): Compile-time constants for spacing, type-safe
- **Component Utilities** (`client/src/lib/documentStyles.ts`): Domain-specific styling helpers

## Spacing

### Using SPACING Constants

Import and use spacing constants from `designSystem.ts`:

```typescript
import { SPACING } from '@/lib/designSystem';

// Page-level spacing
<div className={SPACING.page.all}>Content</div>

// Section spacing
<div className={SPACING.section.gap}>Sections</div>

// Content spacing
<div className={SPACING.content.inline}>Items</div>

// Card padding
<div className={SPACING.card.padding}>Card content</div>
```

### Available Spacing Constants

- `SPACING.page` - Page-level padding (x, y, all)
- `SPACING.section` - Section spacing (gap, margin, top, topWithBorder, responsive)
- `SPACING.content` - Content spacing (gap, inline, responsive)
- `SPACING.tight` - Tight spacing (gap, inline)
- `SPACING.card` - Card spacing (padding, gap, responsiveGap)
- `SPACING.container` - Container spacing (gap, vertical, responsive)
- `SPACING.indent` - Indentation patterns (reply, replyPadding)
- `SPACING.border` - Border styling patterns (top, bottom, left, opacity)

## Corner radius (shape tiers)

All radii derive from `--radius` in `client/src/styles/globals.css` (currently 6px). Use `RADIUS` from `designSystem.ts` by **surface role**, not interchangeably.

```typescript
import { RADIUS } from '@/lib/designSystem';

// App shell — cards, tabs, protocol block shells
<div className={cn(RADIUS.chrome, 'border bg-card')}>…</div>

// Workflow — activity rows, voting panels, suggestion/comment panels
<div className={cn(RADIUS.panel, 'border bg-muted/40')}>…</div>

// Controls — buttons, inputs (matches shadcn `rounded-md`)
<button className={cn(RADIUS.control, 'border px-3')}>…</button>

// Editorial — agreed document body, discussion paragraph stream
<article className={RADIUS.editorial}>…</article>

// Pills — avatars, status chips, FABs, protocol orb
<span className={cn(RADIUS.pill, 'h-2 w-2')} />
```

### Available radius tokens

| Token | Tailwind | Use for |
|-------|----------|---------|
| `RADIUS.chrome` | `rounded-xl` | App shell: `Card`, tabs, org/protocol block shells (`protocolUi.surface`) |
| `RADIUS.panel` | `rounded-lg` | Workflow UI: activity, voting, nested suggestion panels |
| `RADIUS.control` | `rounded-md` | Buttons, inputs, compact toolbars |
| `RADIUS.inline` | `rounded-sm` | Subtle highlights inside editorial content |
| `RADIUS.editorial` | `rounded-none` | Document/agreed body — paper-like |
| `RADIUS.pill` | `rounded-full` | Avatars, status dots, progress tracks, floating actions |

**Document views:** `documentStyles.ts` applies `RADIUS.editorial` to agreed and discussion paragraph shells. Collaboration UI nested inside documents uses `RADIUS.panel` / `RADIUS.control`.

**Protocol chrome:** collapsed orb uses `RADIUS.pill`; expanded header bar uses `RADIUS.editorial` (square edge-to-edge).

When touching a file, replace raw `rounded-lg` / `rounded-xl` / etc. with the matching `RADIUS.*` token. Bare Tailwind `rounded` (4px) maps to `RADIUS.inline`.

**Exceptions (keep literal classes):** directional corners (`rounded-l-md`, `rounded-b`, `rounded-tl-sm`), arbitrary variants (`[&:has([aria-selected])]:rounded-md`), and `rounded-[inherit]`.

## Colors

### Using Color Tokens

Colors use CSS variables defined in `globals.css`. Use Tailwind classes that reference these variables:

```typescript
import { COLORS } from '@/lib/designSystem';

// Text colors
<p className={COLORS.text.primary}>Primary text</p>
<p className={COLORS.text.secondary}>Secondary text</p>

// Background colors
<div className={COLORS.bg.page}>Page background</div>
<div className={COLORS.bg.surface}>Card background</div>

// Border colors
<div className={COLORS.border.standard}>Standard border</div>
```

### CSS Variables

For dynamic colors or when Tailwind classes aren't sufficient, use CSS variables directly:

```typescript
// In className
<div className="bg-[var(--status-draft-bg)] text-[var(--status-draft-text)]">

// In inline styles (when necessary)
<div style={{ backgroundColor: 'var(--vote-pro)' }}>
```

### Available Color Tokens

**Text Colors:**
- `text-foreground` - Primary text
- `text-muted-foreground` - Secondary/muted text
- `text-primary` - Primary brand color text
- `text-destructive` - Error/destructive text

**Background Colors:**
- `bg-background` - Page background
- `bg-card` - Card/surface background
- `bg-muted` - Muted background
- `bg-accent` - Accent background

**Border Colors:**
- `border-border` - Standard border
- `border-primary` - Primary border
- `border-destructive` - Destructive border

**Status Colors:**
All status colors are available as CSS variables:
- `--status-draft-bg`, `--status-draft-text`, `--status-draft-border`
- `--status-pending-*`, `--status-proposed-*`, `--status-active-*`
- `--status-approved-*`, `--status-passed-*`, `--status-rejected-*`
- And more...

**Vote Colors:**
- `--vote-pro` - Green for approve/yes
- `--vote-neutral` - Blue for neutral/abstain
- `--vote-contra` - Red for reject/no
- `--vote-not-voted` - Gray for not voted
- `--vote-background` - Progress bar background

## Status Colors

Use the `STATUS_COLORS` constant from `statusColors.ts`:

```typescript
import { STATUS_COLORS, getStatusColor } from '@/lib/statusColors';

// Direct access
<Badge className={STATUS_COLORS.draft.badge}>Draft</Badge>

// With helper function
const statusColor = getStatusColor('pending');
<Badge className={statusColor.badge}>Pending</Badge>
```

## Inline Styles

### When Inline Styles Are Acceptable

Inline styles are acceptable for:
1. **Dynamic values**: Calculated widths, heights, percentages
2. **User-specific colors**: Colors calculated per user (from `getUserColor()`)
3. **Organization-specific colors**: Colors from database (organization branding)
4. **CSS variables**: When using CSS variables in inline styles

### When to Avoid Inline Styles

Avoid inline styles for:
- Static colors (use CSS variables or Tailwind classes)
- Static spacing (use SPACING constants)
- Static dimensions (use Tailwind classes)

### Examples

```typescript
// ✅ Acceptable: Dynamic width
<div style={{ width: `${percentage}%` }}>

// ✅ Acceptable: User-specific color
<div style={{ backgroundColor: getUserColor(userId) }}>

// ✅ Acceptable: CSS variable
<div style={{ backgroundColor: 'var(--vote-pro)' }}>

// ❌ Avoid: Static color
<div style={{ backgroundColor: '#22c55e' }}>  // Use var(--vote-pro) instead

// ❌ Avoid: Static spacing
<div style={{ padding: '24px' }}>  // Use SPACING.card.padding instead
```

## TypeScript Types

Type-safe access to design tokens:

```typescript
import { getSpacing, getColor } from '@/lib/designSystem.types';

// Get spacing with type safety
const padding = getSpacing('card', 'padding');

// Get color with type safety
const textColor = getColor('text', 'primary');
```

## Adding New Design Tokens

### Adding New Colors

1. Add CSS variable to `client/src/styles/globals.css`:
   ```css
   :root {
     --new-color: oklch(0.5 0.1 250);
   }
   
   .dark {
     --new-color: oklch(0.6 0.1 250);
   }
   ```

2. Optionally add to `COLORS` in `designSystem.ts` if it's a general-purpose color

### Adding New Spacing

1. Add to `SPACING` in `client/src/lib/designSystem.ts`:
   ```typescript
   export const SPACING = {
     // ... existing
     newSection: {
       gap: 'space-y-8',
       padding: 'p-8',
     },
   };
   ```

## ESLint Rules

The ESLint configuration flags:
- Hardcoded hex colors (warns to use CSS variables)
- Encourages use of design tokens

Run validation:
```bash
npm run validate:design-system
```

## Common Patterns

### Card Component
```typescript
import { SPACING, COLORS } from '@/lib/designSystem';

<Card className={cn(SPACING.card.padding, COLORS.bg.surface)}>
  <h2 className={COLORS.text.primary}>Title</h2>
  <p className={COLORS.text.secondary}>Content</p>
</Card>
```

### Status Badge
```typescript
import { STATUS_COLORS } from '@/lib/statusColors';

<Badge className={STATUS_COLORS.approved.badge}>
  Approved
</Badge>
```

### Progress Bar
```typescript
<div style={{ 
  width: `${percentage}%`,
  backgroundColor: 'var(--vote-pro)' 
}}>
```

## Migration Guide

### Migrating Hardcoded Colors

**Before:**
```typescript
<div className="bg-gray-100 text-gray-700">
```

**After:**
```typescript
import { COLORS } from '@/lib/designSystem';
<div className={cn(COLORS.bg.muted, COLORS.text.primary)}>
```

### Migrating Hardcoded Spacing

**Before:**
```typescript
<div className="p-6 gap-4">
```

**After:**
```typescript
import { SPACING } from '@/lib/designSystem';
<div className={cn(SPACING.card.padding, SPACING.content.inline)}>
```

### Migrating Status Colors

**Before:**
```typescript
<Badge className="bg-green-100 text-green-800">
```

**After:**
```typescript
import { STATUS_COLORS } from '@/lib/statusColors';
<Badge className={STATUS_COLORS.approved.badge}>
```

## Best Practices

1. **Always import from designSystem.ts** for spacing
2. **Use CSS variables** for colors (via Tailwind classes or inline)
3. **Use STATUS_COLORS** for status badges
4. **Document exceptions** when inline styles are necessary
5. **Run validation script** before committing
6. **Follow the import pattern**: `import { SPACING, COLORS } from '@/lib/designSystem'`

## Resources

- Design System Constants: `client/src/lib/designSystem.ts`
- Design System Types: `client/src/lib/designSystem.types.ts`
- CSS Variables: `client/src/styles/globals.css`
- Status Colors: `client/src/lib/statusColors.ts`
- Document Styles: `client/src/lib/documentStyles.ts`

