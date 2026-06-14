# Colabora Design System & Icon Usage Guide

**Purpose:** Comprehensive documentation of the current design system, icon usage, and information needed for a visual revamp.

**Last Updated:** 2025-01-27

---

## 🎨 Current Design System Overview

### Icon Library

**Primary Icon Library:** [Lucide React](https://lucide.dev/) (`lucide-react` v0.487.0)
**Additional Libraries:** [Tabler Icons](https://tabler.io/icons) (`@tabler/icons-react`), [Heroicons](https://heroicons.com/) (`@heroicons/react`)

**How it works:** The `<Icon name="..." />` component ([client/src/components/ui/Icon.tsx](client/src/components/ui/Icon.tsx)) uses `useOrganizationDesign().effectiveIconSet`. The icon set is **Lucide for all personal views** (activity, documents, profile, organizations, admin, search, report-issue, member-profile); only in **organization territory** (organization view, or document view for an organizational document that matches the context org) does the org's chosen set (Lucide/Tabler/Heroicons) apply. The list of personal views is defined in [client/src/utils/organizationTerritory.ts](client/src/utils/organizationTerritory.ts) as `PERSONAL_VIEWS` / `isPersonalView()`; any new `AppView` value must be classified there as personal or org-related. Icon resolution is via [client/src/lib/iconLoader.ts](client/src/lib/iconLoader.ts): Lucide is resolved synchronously from the static registry ([client/src/lib/lucideIcons.ts](client/src/lib/lucideIcons.ts)); Tabler and Heroicons load asynchronously (with a brief Lucide fallback until resolved). Name mapping across sets is in [client/src/lib/iconMappings.ts](client/src/lib/iconMappings.ts).

**Organization Customization:**
- Representatives can choose icon set per organization: `lucide`, `tabler`, or `heroicons`
- Default: `lucide` (if not set)
- The chosen icon set applies only in **organization territory**; in personal views the app always uses Lucide (see `PERSONAL_VIEWS` in organizationTerritory.ts)

**Why Lucide?**
- Modern, consistent icon set
- Tree-shakeable (only imports what you use)
- TypeScript support
- Accessible by default
- Lightweight and performant

### UI Component Library

**Component System:** [Radix UI](https://www.radix-ui.com/) + Custom Components

**Radix UI Components Used:**
- Accordion, Alert Dialog, Avatar, Checkbox, Collapsible
- Context Menu, Dialog, Dropdown Menu, Hover Card
- Label, Menubar, Navigation Menu, Popover
- Progress, Radio Group, Scroll Area, Select
- Separator, Slider, Switch, Tabs, Toggle, Tooltip

**Why Radix UI?**
- Unstyled, accessible primitives
- Full control over styling
- Keyboard navigation built-in
- ARIA attributes handled automatically

### Styling System

**CSS Framework:** Tailwind CSS v4.1.3

**Design Tokens:** CSS Custom Properties (CSS Variables)
- Colors defined in `oklch` color space
- Responsive spacing system
- Dark mode support built-in
- **Status and badge colors:** Use `designSystem.COLORS` (e.g. `COLORS.status`, `COLORS.statusBg`, `COLORS.statusBadge`). These tokens reference the semantic CSS variables in `client/src/styles/globals.css` (`--status-*`, `--badge-*`), so theme customization and dark mode apply consistently. Do not use raw Tailwind color classes (e.g. `text-green-600`, `bg-red-50`) for semantic status; use the design system tokens instead.

### Design alignment

All layout and spacing should use the tokens from `client/src/lib/designSystem.ts` (and `client/src/lib/documentStyles.ts` for document views). When touching a file, replace raw Tailwind spacing utilities (`mb-*`, `mt-*`, `py-*`, `px-*`, `gap-*`, `space-y-*`) with design system tokens so that:

- **Page-level:** Use `SPACING.page.x`, `SPACING.page.y` (or `SPACING.page.all`) for main content containers. Do not use raw Tailwind (`px-4`, `md:px-6`, `py-8`, etc.) for page shells—use the design system tokens as the single source of truth.
- **Content width:** Use `SPACING.layout.contentMax` (56rem) for most pages (profile, search, dashboards, document view, activity feed). Use `SPACING.layout.contentMaxNarrow` (42rem) only for forms and focused flows (e.g. Report Issue, Welcome). Do not use ad-hoc `max-w-*` on page content wrappers.
- **Sections:** Use `SPACING.section.margin`, `SPACING.section.top`, or `SPACING.section.gap` for separation between major blocks (24px).
- **Content:** Use `SPACING.content.inline`, `SPACING.content.gap` for related items (16px).
- **Tight:** Use `SPACING.tight.inline`, `SPACING.tight.gap` for minimal gaps (8px).
- **Cards/lists:** Use `SPACING.card.padding`, `SPACING.container.vertical` (or `SPACING.container.responsive`).
- **Corner radius:** Use `RADIUS` tiers from `designSystem.ts` by surface role — `chrome` (app cards/tabs/protocol shells), `panel` (workflow/voting), `control` (buttons/inputs), `editorial` (document body, `rounded-none`), `pill` (avatars/status/FAB). See [DESIGN_SYSTEM_USAGE.md](./DESIGN_SYSTEM_USAGE.md#corner-radius-shape-tiers).

Avoid using both `mb-*` and `pb-*` on the same element unless intentional. Prefer a single source (margin or padding) for each gap.

---

## Icon registry requirement

Any icon name used with `<Icon name="..." />` must exist in [client/src/lib/lucideIcons.ts](client/src/lib/lucideIcons.ts). Add the Lucide component to the imports and to the `LUCIDE_ICONS` object (same key as the component name). The DocumentEditor and InlineParagraphForm use **Heading** and **AlignLeft** for the paragraph-type toggle; both are in the registry.

---

## `forceDefault` policy

The `forceDefault` prop on `<Icon>` forces Lucide regardless of the organization's chosen icon set. Use it **only** when:

1. **System UI that renders before any org context loads** — login screen, connection-status indicator, theme toggle.
2. **Interactive controls that must never flicker** — vote buttons rendered inside org territory where the async Tabler/Heroicons load could briefly show a blank slot (e.g. `VoteButtonGroup` compact variant).

**Do NOT use `forceDefault`** just to avoid adding an icon to the registry, or inside personal-view components (activity, profile, documents list, etc.) where `effectiveIconSet` is already always `'lucide'` — the flag is redundant there and adds noise.

---

## 📊 Complete Icon Inventory

### Most Frequently Used Icons (by category)

#### **User & People Icons**
```typescript
Users          // Multiple users, groups
User           // Single user
UserPlus       // Add user, invite
UserMinus      // Remove user
UserCheck      // User verified, accepted
UserCircle     // User profile
UserX          // User removed, rejected
Crown          // Admin, leader, representative
```

**Usage Locations:**
- `CollaboratorManagement.tsx` - User management
- `RepresentativeSelector.tsx` - Representative selection
- `UserMenu.tsx` - User profile menu
- `MembersTab.tsx` - Organization members
- `InvitationAcceptDialog.tsx` - User invitations

#### **Document & File Icons**
```typescript
FileText       // Documents, text content
Edit3          // Edit document
Plus           // Create new
PlusCircle     // Add item
Download       // Export, download
Trash2         // Delete, remove
History        // Version history, timeline
Clock          // Time, deadlines, timestamps
Calendar       // Dates, scheduling
```

**Usage Locations:**
- `DocumentDashboard.tsx` - Document management
- `DocumentEditor.tsx` - Document editing
- `DocumentViewPage.tsx` - Document viewing
- `UnifiedHistoryTimeline.tsx` - History tracking

#### **Voting & Governance Icons**
```typescript
Vote           // Voting, ballots
ThumbsUp       // Approve, PRO vote
ThumbsDown     // Reject, CONTRA vote
CheckCircle    // Approved, passed
CheckCircle2   // Verified, confirmed
XCircle        // Rejected, failed
AlertTriangle  // Warning, alert
Shield         // Security, governance rules
Settings       // Configuration, preferences
```

**Usage Locations:**
- `DashboardTab.tsx` - Organization voting (Elections & Votes section)
- `SuggestionCard.tsx` - Proposal cards
- `GovernanceTab.tsx` - Governance management
- `ElectionVotingInterface.tsx` - Elections

#### **Navigation & UI Icons**
```typescript
ChevronDown    // Expand, dropdown
ChevronUp      // Collapse, close dropdown
ChevronRight   // Next, forward
ChevronLeft    // Previous, back
ArrowRight     // Navigate, continue
ArrowLeft      // Go back
Menu           // Mobile menu, hamburger
X              // Close, cancel
Search         // Search functionality
Filter         // Filter options
```

**Usage Locations:**
- `AppHeader.tsx` - Main navigation
- `DocumentSidebar.tsx` - Sidebar navigation
- `SearchBar.tsx` - Search interface
- Various dialogs and modals

#### **Status & Feedback Icons**
```typescript
Check          // Success, completed
CheckCircle    // Verified, approved
XCircle        // Error, rejected
AlertTriangle  // Warning, caution
Clock          // Pending, in progress
Hourglass      // Waiting, processing
Loader2        // Loading spinner
RefreshCw      // Refresh, reload
```

**Usage Locations:**
- `ErrorBoundary.tsx` - Error states
- `DocumentStatusDisplay.tsx` - Status indicators
- `OrganizationalDocumentStatus.tsx` - Document states
- Loading states throughout app

#### **Communication Icons**
```typescript
MessageSquare  // Comments, messages
Mail           // Email, invitations
Send           // Send message, submit
Copy           // Copy to clipboard
ExternalLink   // External link
```

**Usage Locations:**
- `EmailInviteSystem.tsx` - Email invitations
- `SuggestionCard.tsx` - Comments
- `Comments.tsx` - Comment threads

#### **Organization & Structure Icons**
```typescript
Building2      // Organizations
Users          // Teams, groups
Eye            // View, visibility
EyeOff         // Hidden, private
Lock           // Protected, restricted
TrendingUp     // Growth, statistics
BarChart3      // Analytics, charts
Activity       // Activity feed
```

**Usage Locations:**
- `OrganizationManagement.tsx` - Organization UI
- `TransparencyTab.tsx` - Analytics
- `ActivityFeedView.tsx` - Activity tracking

#### **Action & Control Icons**
```typescript
Plus           // Add, create
Minus          // Remove, subtract
Edit           // Edit, modify
Settings       // Configure, settings
HelpCircle     // Help, information
Info           // Information
Expand         // Expand view
RotateCcw      // Undo, revert
Play           // Start, execute
```

---

## 🎨 Color System

### Current Color Palette

**Primary Colors:**
```css
--primary: #030213                    /* Dark blue-black */
--primary-foreground: white           /* White text on primary */
--secondary: oklch(.95 .0058 264.53)  /* Light gray-blue */
--secondary-foreground: #030213        /* Dark text on secondary */
```

**Semantic Colors:**
```css
--destructive: #d4183d                /* Red for delete/error */
--destructive-foreground: white
--muted: #ececf0                      /* Light gray background */
--muted-foreground: #717182           /* Gray text */
--accent: #e9ebef                     /* Accent background */
--accent-foreground: #030213
```

**Status Colors:**
```css
--color-amber-200: oklch(.924 .12 95.746)   /* Light amber */
--color-amber-500: oklch(.769 .188 70.08)   /* Amber */
--color-amber-600: oklch(.666 .179 58.318)  /* Dark amber */
--color-green-600: oklch(.627 .194 149.214) /* Green success */
--color-blue-200: oklch(.882 .059 254.128)  /* Light blue */
--color-blue-500: oklch(.623 .214 259.815)  /* Blue */
--color-blue-600: oklch(.546 .245 262.881)  /* Dark blue */
```

**Background Colors:**
```css
--background: #fff                    /* White background */
--foreground: oklch(.145 0 0)         /* Dark text */
--card: #fff                          /* Card background */
--card-foreground: oklch(.145 0 0)    /* Card text */
--input-background: #f3f3f5           /* Input background */
```

### Dark Mode Colors

```css
.dark {
  --background: oklch(.145 0 0)       /* Dark background */
  --foreground: oklch(.985 0 0)       /* Light text */
  --primary: oklch(.985 0 0)          /* Light primary */
  --primary-foreground: oklch(.205 0 0) /* Dark text on light */
  --muted: oklch(.269 0 0)            /* Dark gray */
  --muted-foreground: oklch(.708 0 0) /* Light gray text */
}
```

### Color Usage Patterns

**Voting Colors:**
- **PRO (Approve):** Green (`--color-green-600`)
- **CONTRA (Reject):** Red (`--destructive`)
- **NEUTRAL:** Amber (`--color-amber-500`)

**Status Colors:**
- **Success:** Green
- **Warning:** Amber
- **Error:** Red (`--destructive`)
- **Info:** Blue

---

## 📐 Typography System

### Font Stack

**Default Font:**
```css
--font-sans: ui-sans-serif, system-ui, sans-serif, 
             "Apple Color Emoji", "Segoe UI Emoji", 
             "Segoe UI Symbol", "Noto Color Emoji"
--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, 
            Consolas, "Liberation Mono", "Courier New", monospace
```

**Organization Custom Fonts:**
- Representatives can choose font family per organization
- Available fonts: `inter`, `work-sans`, `poppins`, `merriweather`
- Default: `inter` (if not set)
- Fonts loaded via Bunny Fonts (privacy-friendly)
- CSS variables:
  ```css
  --font-inter: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-work-sans: 'Work Sans', ui-sans-serif, system-ui, sans-serif;
  --font-poppins: 'Poppins', ui-sans-serif, system-ui, sans-serif;
  --font-merriweather: 'Merriweather', Georgia, serif;
  ```

### Font Sizes

```css
--text-xs: 0.75rem      /* 12px */
--text-sm: 0.875rem     /* 14px */
--text-base: 1rem       /* 16px */
--text-lg: 1.125rem     /* 18px */
--text-xl: 1.25rem      /* 20px */
--text-2xl: 1.5rem      /* 24px */
```

### Font Weights

```css
--font-weight-normal: 400
--font-weight-medium: 500
```

---

## 📏 Spacing System

### Content width (max-width)

Page-level content must use layout tokens for max-width so all views stay consistent:

- **Default (56rem / 896px):** `SPACING.layout.contentMax` — use for profile, search, member profile, document dashboard, organization dashboard, organization management, activity feed, and document view.
- **Narrow (42rem / 672px):** `SPACING.layout.contentMaxNarrow` — use for form-heavy or single-column flows (Report Issue, Welcome).

Page-level padding must use `SPACING.page.x` and `SPACING.page.y`; do not use raw Tailwind padding classes on the main content wrapper.

### Base Spacing Unit

```css
--spacing: 0.25rem  /* 4px base unit */
```

### Common Spacing Values

- `gap-1` = 4px
- `gap-2` = 8px
- `gap-3` = 12px
- `gap-4` = 16px
- `gap-6` = 24px

### Padding/Margin Patterns

```css
p-1, p-2, p-3, p-4, p-12    /* Padding */
px-2, px-3, px-4, px-6       /* Horizontal padding */
py-1, py-2, py-4, py-8      /* Vertical padding */
mt-0, mt-3, mt-12           /* Margin top */
mb-1, mb-4                  /* Margin bottom */
```

---

## Mobile layout

### Breakpoints

| Tier | Width | Detection |
|------|-------|-----------|
| Mobile | &lt; 640px | `useIsMobile()`, Tailwind default / `max-md:` |
| Tablet | 640–767px | `useScreenSize().isTablet`, Tailwind `sm:` |
| Desktop | ≥ 768px | `md:` and up — **unchanged by mobile work** |

Prefer **Tailwind responsive classes** (`flex-col md:flex-row`, `w-full md:w-[200px]`) for layout. Reserve `useIsMobile` for interaction mode changes (sheet vs dropdown) and shell routing.

### Mobile chrome (unified bottom bar)

Standard mobile routes use a **single fixed bottom bar** (`MobileBottomBar`): primary nav items + optional create + user menu. Page titles and back navigation live in scrollable content (`MobilePageTitle`).

| Token / variable | Purpose |
|------------------|---------|
| `MOBILE_CHROME.barHeight` | `4rem` unified bar height |
| `MOBILE_CHROME.clearanceClass` | Scroll padding above bar + safe area |
| `MOBILE_CHROME.footerSpacerClass` | Footer margin above bar |
| `MOBILE_CHROME.shellClass` | `mobile-unified-nav` on shell — sets `--mobile-chrome-bottom: 4rem` |
| `--mobile-chrome-bottom` | `0` default on mobile; `4rem` when `.mobile-unified-nav` |
| `--header-height` | `0` with unified nav; `3.5rem` on immersive / desktop |

**Immersive routes** (meeting protocol): no unified bar; bottom header chrome unchanged; use `--header-height` for clearance.

### Touch targets (mobile only)

Shared primitives use `max-md:min-h-11` (44px) without changing desktop `h-9`. Filter controls in dense mobile flows should use `min-h-11`.

### Tablet patterns

- Filters: `sm:grid sm:grid-cols-2` between stacked mobile and inline `md:` desktop rows
- Tab bars: `w-full md:w-auto`
- Document sidebar: hidden below `md` (`DocumentSidebar` returns null when `isMobile`); persistent rail at `md+`

---

## 🎭 Component Patterns

### Button Variants

**Common Button Styles:**
- Primary: Dark background (`--primary`)
- Secondary: Light background (`--secondary`)
- Destructive: Red (`--destructive`)
- Outline: Border only
- Ghost: Transparent background

### Card Components

**Card Structure:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Actions</CardFooter>
</Card>
```

### Dialog/Modal Patterns

**Common Dialog Structure:**
```tsx
<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button>Cancel</Button>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 🎯 Information Needed for Design Revamp

### 1. **Brand Identity**

**Required Information:**
- [ ] Primary brand colors (hex codes)
- [ ] Secondary brand colors
- [ ] Accent colors
- [ ] Logo file (SVG preferred)
- [ ] Brand typography preferences
- [ ] Brand personality/tone (professional, friendly, modern, etc.)

### 2. **Visual Style Preferences**

**Design Direction:**
- [ ] **Style:** Minimalist, Bold, Playful, Corporate, Modern
- [ ] **Color Scheme:** Light, Dark, High Contrast, Muted
- [ ] **Border Radius:** Sharp (0px), Rounded (4-8px), Very Rounded (12px+)
- [ ] **Shadows:** None, Subtle, Prominent
- [ ] **Spacing:** Compact, Comfortable, Generous

### 3. **Icon Style Preferences**

**Icon Options:**
- [ ] **Keep Lucide React** (current - recommended)
- [ ] **Switch to different library** (Heroicons, Feather, Material Icons, etc.)
- [ ] **Custom icon set** (SVG files)
- [ ] **Icon weight:** Outline, Filled, Two-tone
- [ ] **Icon size consistency:** Standard sizes (16px, 20px, 24px)

### 4. **Component Customization**

**What to Customize:**
- [ ] Button styles (shapes, sizes, hover effects)
- [ ] Card styles (borders, shadows, backgrounds)
- [ ] Input field styles
- [ ] Dialog/Modal styles
- [ ] Navigation styles
- [ ] Status badges/styles

### 5. **Layout Preferences**

**Layout Decisions:**
- [ ] **Header:** Fixed, Sticky, Static
- [ ] **Sidebar:** Always visible, Collapsible, Hidden
- [ ] **Content Width:** Full width, Constrained (max-width)
- [ ] **Grid System:** 12-column, 16-column, Custom
- [ ] **Responsive Breakpoints:** Mobile-first, Desktop-first

### 6. **Accessibility Requirements**

**Accessibility Standards:**
- [ ] **WCAG Level:** A, AA, AAA
- [ ] **Color Contrast:** Minimum ratios
- [ ] **Focus Indicators:** Visible, Custom style
- [ ] **Screen Reader:** ARIA labels, Announcements

### 7. **Animation & Transitions**

**Motion Preferences:**
- [ ] **Animation Style:** Subtle, Smooth, Bouncy, None
- [ ] **Transition Duration:** Fast (150ms), Medium (300ms), Slow (500ms)
- [ ] **Easing:** Ease-in-out, Ease-out, Custom
- [ ] **Reduced Motion:** Respect prefers-reduced-motion

### 8. **Dark Mode Strategy**

**Dark Mode Approach:**
- [ ] **Implementation:** System preference, Manual toggle, Both
- [ ] **Color Scheme:** True dark, Dark gray, Custom palette
- [ ] **Contrast:** High contrast, Standard, Low contrast

---

## 📋 Current Design System Files

### Key Files to Review/Modify

**Styling:**
- `client/src/index.css` - Global styles, CSS variables, Tailwind config
- `client/src/components/ui/*.tsx` - All UI component styles

**Components:**
- `client/src/components/layout/AppLayout.tsx` - Main layout structure
- `client/src/components/layout/AppHeader.tsx` - Header component
- `client/src/components/ui/button.tsx` - Button component (reference)

**Icons:**
- Use `<Icon name="..." />` from [client/src/components/ui/Icon.tsx](client/src/components/ui/Icon.tsx); it uses the organization's icon set (via [client/src/lib/iconLoader.ts](client/src/lib/iconLoader.ts) and [client/src/lib/lucideIcons.ts](client/src/lib/lucideIcons.ts)).
- Icon names are Lucide PascalCase; Tabler/Heroicons equivalents are resolved via [client/src/lib/iconMappings.ts](client/src/lib/iconMappings.ts).

---

## 🎨 Recommended Design Revamp Process

### Phase 1: Discovery
1. **Gather Requirements**
   - Brand guidelines
   - User preferences
   - Accessibility needs
   - Performance constraints

2. **Audit Current Design**
   - Document all current patterns
   - Identify inconsistencies
   - List pain points

### Phase 2: Design System Creation
1. **Color Palette**
   - Define primary/secondary colors
   - Create semantic color system
   - Test contrast ratios
   - Create dark mode palette

2. **Typography**
   - Select font families
   - Define type scale
   - Set line heights
   - Create text styles

3. **Spacing System**
   - Define base unit
   - Create spacing scale
   - Document usage patterns

4. **Component Library**
   - Design button variants
   - Design form inputs
   - Design cards/containers
   - Design navigation

### Phase 3: Implementation
1. **Update CSS Variables**
   - Modify `index.css`
   - Update color tokens
   - Update spacing tokens

2. **Update Components**
   - Modify UI components
   - Update icon usage
   - Adjust spacing/sizing

3. **Test & Refine**
   - Test across browsers
   - Test accessibility
   - Test dark mode
   - Gather feedback

---

## 🔍 Icon Usage Analysis

### Icon Categories by Frequency

**Most Used (50+ occurrences):**
- `ChevronDown`, `ChevronUp` - Navigation, expand/collapse
- `X` - Close buttons
- `Users` - User management
- `FileText` - Documents
- `Settings` - Configuration

**Moderately Used (20-50 occurrences):**
- `Vote`, `CheckCircle`, `AlertTriangle` - Voting/governance
- `Mail`, `Send` - Communication
- `Plus`, `Trash2` - Actions
- `Clock`, `Calendar` - Time/date

**Specialized (5-20 occurrences):**
- `Shield`, `Lock`, `Eye` - Security/privacy
- `TrendingUp`, `BarChart3` - Analytics
- `Crown`, `UserCheck` - Roles/permissions

### Icon Size Patterns

**Size tokens** (`IconSize` type from `designSystem.ts`, used as the `size` prop on `<Icon>`):

| Token | px  | Use case |
|-------|-----|----------|
| `xs`  | 12  | Inline icons, badges |
| `sm`  | 16  | Standard — most UI elements, menu items |
| `md`  | 20  | Buttons, form inputs |
| `lg`  | 24  | Headers, prominent elements |
| `xl`  | 32  | Feature icons, empty states |
| `2xl` | 48  | Hero sections, large feature displays |

**Implementation — always use `<Icon>` from `client/src/components/ui/Icon.tsx`:**

```tsx
import { Icon } from '@/components/ui/Icon';

// Preferred: semantic size token
<Icon name="Search"   size="sm" />   // 16px
<Icon name="Settings" size="md" />   // 20px
<Icon name="FileText" size="lg" />   // 24px

// Also valid: Tailwind className (fully backwards-compatible)
<Icon name="Search"   className="h-4 w-4" />

// With colour (use COLORS tokens, not raw Tailwind colour classes):
import { COLORS } from '@/lib/designSystem';
<Icon name="CheckCircle" size="sm" className={COLORS.status.success} />
<Icon name="XCircle"     size="sm" className={COLORS.status.error} />
<Icon name="Clock"       size="sm" className={COLORS.status.warning} />
<Icon name="AlertCircle" size="sm" className={COLORS.status.info} />
```

**Do NOT import directly from `lucide-react` in feature components.** Direct imports bypass the organization icon set customization. The only legitimate exceptions are shadcn/Radix UI primitive wrappers (`dialog.tsx`, `select.tsx`, etc.) which are intentionally independent of org theming.

---

## 💡 Design Revamp Recommendations

### Quick Wins (Low Effort, High Impact)

1. **Color Refresh**
   - Update primary color to brand color
   - Refine status colors (success/warning/error)
   - Improve contrast ratios

2. **Icon Consistency**
   - Standardize icon sizes
   - Create icon size constants
   - Document icon usage patterns

3. **Spacing Refinement**
   - Increase spacing for better readability
   - Standardize padding/margins
   - Improve visual hierarchy

### Medium Effort

4. **Component Polish**
   - Refine button styles
   - Improve card designs
   - Enhance form inputs
   - Better loading states

5. **Typography Enhancement**
   - Better font pairing
   - Improved line heights
   - Better text hierarchy

### High Effort (Full Redesign)

6. **Complete Visual Overhaul**
   - New color system
   - New component library
   - New layout structure
   - Custom illustrations/graphics

---

## 📝 Design System Checklist

### Before Starting Revamp

- [ ] Brand guidelines document
- [ ] Color palette (hex codes)
- [ ] Typography choices
- [ ] Icon library decision
- [ ] Component style guide
- [ ] Accessibility requirements
- [ ] Dark mode strategy
- [ ] Animation preferences
- [ ] Responsive breakpoints
- [ ] Browser support requirements

### During Revamp

- [ ] Update CSS variables
- [ ] Modify component styles
- [ ] Test color contrast
- [ ] Test dark mode
- [ ] Test responsive layouts
- [ ] Test accessibility
- [ ] Update documentation

### After Revamp

- [ ] Design system documentation
- [ ] Component usage guide
- [ ] Icon usage guide
- [ ] Color palette reference
- [ ] Spacing system reference
- [ ] Typography guide

---

## 🎯 Summary

**Current State:**
- ✅ Modern icon library (Lucide React)
- ✅ Accessible component system (Radix UI)
- ✅ Flexible styling (Tailwind CSS)
- ✅ Dark mode support
- ⚠️ Inconsistent spacing
- ⚠️ Basic color system
- ⚠️ No design system documentation

**For Revamp, Provide:**
1. Brand colors and identity
2. Design style preferences
3. Icon library decision
4. Component customization needs
5. Layout preferences
6. Accessibility requirements
7. Animation preferences

**Recommended Approach:**
1. Start with color system
2. Refine typography
3. Standardize spacing
4. Polish components
5. Document everything

---

**End of Document**
