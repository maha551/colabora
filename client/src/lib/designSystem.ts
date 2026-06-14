/**
 * Comprehensive Design System Constants
 * Based on 4px base unit (Tailwind CSS standard)
 * 
 * Industry Standards:
 * - Base unit: 4px (0.25rem)
 * - Scale: 1 (4px), 2 (8px), 3 (12px), 4 (16px), 6 (24px), 8 (32px)
 * - Section spacing: 24px (mb-6) for major sections
 * - Content spacing: 16px (space-y-4) for related items
 * - Small gaps: 12px (gap-3) for tight groupings
 * - Container spacing: 24px (gap-6 or space-y-6) between cards
 * 
 * Spacing Guidelines:
 * - Use margin (mb-*, mt-*) for separation between elements
 * - Use padding (pb-*, pt-*) for internal spacing within elements with borders
 * - Avoid redundant combinations: Don't use both mb-* and pb-* on the same element unless intentional
 * - Standard section spacing: mb-6 (24px) for major sections
 * - Standard content spacing: gap-4 (16px) for related items
 * - Border spacing: Use pb-* for padding after border, mb-* for margin before border
 *
 * Migration (replace raw Tailwind with tokens):
 * - mb-8 / mt-8 → SPACING.section.margin / SPACING.section.top (or keep mb-8 only if 32px intended)
 * - mb-6 / mt-6 → SPACING.section.margin / SPACING.section.top
 * - mb-4 / mt-4 → SPACING.content.gap or use parent space-y-4
 * - py-8 / px-4 → SPACING.page.y / SPACING.page.x
 * - gap-4 → SPACING.content.inline
 * - gap-3 → SPACING.content.responsive or SPACING.tight.inline + gap-2
 * - gap-2 → SPACING.tight.inline
 * - rounded-xl / rounded-lg / rounded-md / rounded-none / rounded-full → RADIUS.chrome / panel / control / editorial / pill
 *
 * Panel chrome (tab row → title → filters → content):
 * - Tab panel root → PANEL.body
 * - Title + actions row → PANEL.header.row / PANEL.header.title / TabPanelHeader
 * - Filter row below header → PANEL.filters.row / TabPanelFilters
 * - mt-1 below tab row → NAVIGATION.tabs.contentMargin (mt-2)
 * - text-2xl font-bold tab titles → PANEL.header.title (text-lg md:text-xl font-semibold)
 *
 * Surface hierarchy (maps to globals.css :root tokens):
 * - canvas → COLORS.bg.page / SURFACES.canvas (background)
 * - chrome → COLORS.bg.chrome / SURFACES.chrome (sidebar, nav rail)
 * - raised → COLORS.bg.surface / SURFACES.raised (card, elevated panels)
 * - inset → COLORS.bg.muted / SURFACES.inset (table headers, nested rows)
 */

/** Shadow utilities — defined before SPACING so card elevation can reference ELEVATION */
export const SHADOWS = {
  /** Small shadow - subtle elevation (4px blur) */
  sm: 'shadow-sm',
  /** Medium shadow - moderate elevation (6px blur) */
  md: 'shadow-md',
  /** Large shadow - prominent elevation (15px blur) */
  lg: 'shadow-lg',
  /** Extra large shadow - dramatic elevation (50px blur) */
  xl: 'shadow-2xl',
  /** Custom shadow for footer (top shadow) */
  footer: 'shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]',
} as const;

/** Elevation tokens — light mode relies on shadow; dark mode uses surface contrast */
export const ELEVATION = {
  /** Default resting elevation for cards on canvas */
  card: 'shadow-sm dark:shadow-none',
  /** Interactive hover step (pairs with SPACING.card.hover) */
  cardHover: 'hover:shadow-md',
  /** App chrome (header bar, sticky panels) */
  chrome: SHADOWS.sm,
} as const;

export const SPACING = {
  // Page-level spacing
  page: {
    /** Responsive horizontal padding: 16px mobile, 24px desktop */
    x: 'px-4 md:px-6',
    /** Top padding for content below header; use with page wrapper pattern so all pages have consistent header-to-content distance */
    top: 'pt-2 md:pt-3',
    /** Bottom padding for page content; top spacing is provided by page.top when using the page wrapper pattern */
    y: 'pb-4 md:pb-5',
    /** Combined page padding */
    all: 'px-4 md:px-6 pt-2 md:pt-3 pb-4 md:pb-5',
  },
  
  // Section-level spacing (major divisions)
  section: {
    /** 24px - Vertical spacing between sections */
    gap: 'space-y-6',
    /** 24px - Bottom margin for sections */
    margin: 'mb-6',
    /** 24px - Top margin for sections */
    top: 'mt-6',
    /** 48px total (24px margin + 24px padding) - For sections with top border */
    topWithBorder: 'mt-6 pt-6',
    /** Responsive: 16px mobile, 24px desktop */
    responsive: 'space-y-4 md:space-y-6',
  },
  
  // Content-level spacing (related items)
  content: {
    /** 16px - Vertical spacing between related items */
    gap: 'space-y-4',
    /** 16px - Gap between flex items */
    inline: 'gap-4',
    /** Responsive: 12px mobile, 16px desktop */
    responsive: 'gap-3 md:gap-4',
  },
  
  // Tight spacing (minimal gaps)
  tight: {
    /** 8px - Vertical spacing for tight groupings */
    gap: 'space-y-2',
    /** 8px - Gap between tightly related flex items */
    inline: 'gap-2',
  },
  
  // Card spacing and base styles
  card: {
    /** Base card styling — radius tier: RADIUS.chrome; elevation: ELEVATION.card */
    base: `rounded-xl border bg-card ${ELEVATION.card}`,
    /** Hover state for interactive cards */
    hover: `${ELEVATION.cardHover} transition-shadow`,
    /** Overflow for cards with progress bars */
    overflow: 'overflow-hidden',
    /** Responsive padding: 16px mobile, 24px desktop */
    padding: 'p-4 md:p-6',
    /** 24px - Gap between cards */
    gap: 'gap-6',
    /** Responsive gap: 16px mobile, 24px desktop */
    responsiveGap: 'gap-4 md:gap-6',
  },
  
  // Container spacing
  container: {
    /** 24px - Between cards in flex containers */
    gap: 'gap-6',
    /** 24px - Between cards in block containers */
    vertical: 'space-y-6',
    /** Responsive: 16px mobile, 24px desktop */
    responsive: 'gap-4 md:gap-6',
  },
  
  // Indentation patterns
  indent: {
    /** Responsive: 24px mobile, 112px desktop - Reply indentation */
    reply: 'ml-6 md:ml-28',
    /** 24px - Padding with indent */
    replyPadding: 'pl-6',
  },
  
  // Border styling patterns
  border: {
    /** Standard top border for main sections */
    top: 'border-t border-border/60',
    /** Standard bottom border for main sections */
    bottom: 'border-b border-border/60',
    /** Left border for nested elements (replies) */
    left: 'border-l-2 border-primary/40',
    /** Border opacity values */
    opacity: {
      /** /60 - Standard borders for main sections (document context, vote details, comments) */
      standard: '/60',
      /** /40 - Nested element borders (comment items, reply borders, vote detail boxes) */
      nested: '/40',
    },
  },
  // Layout containment (responsive overflow prevention)
  layout: {
    /** Page-level: prevent horizontal scroll; use on outer page/shell containers */
    containPage: 'w-full max-w-full overflow-x-hidden',
    /** Default content max-width (56rem / 896px). Use for profile, search, dashboards, document view, activity feed. Single source of truth so all main content matches. */
    contentMax: 'max-w-4xl mx-auto min-w-0',
    /** Narrow content max-width (42rem / 672px). Use for forms and focused flows (e.g. Report Issue, Welcome). */
    contentMaxNarrow: 'max-w-2xl mx-auto min-w-0',
    /** Scrollable content: allow horizontal scroll within container; use on tables/code blocks */
    containScroll: 'min-w-0 overflow-x-auto',
    /** Flex child that should shrink: use on content columns in flex rows */
    shrinkContent: 'min-w-0',
    /** Main content top offset (desktop fixed header) — h-14 + safe-area */
    contentTop: 'pt-[calc(3.5rem+env(safe-area-inset-top,0px))]',
    /** @deprecated Footer is in document flow; use page bottom padding on scrollable content if needed */
    contentBottom: 'pb-24',
    /** Main content bottom padding (mobile) - space above unified bottom bar */
    contentBottomMobile:
      'pb-[calc(var(--mobile-chrome-bottom,0px)+env(safe-area-inset-bottom,0px))]',
    /** Default color for descendant SVGs without a text-* class (matches DropdownMenuItem pattern; use on main content wrapper so icons are visible) */
    contentSvgColor: "[&_svg:not([class*='text-'])]:text-foreground",
  },
  // Toolbar / filter row (search + actions + counts)
  toolbar: {
    /** Single row: flex items-center justify-between gap-4 flex-wrap */
    row: 'flex items-center justify-between gap-4 flex-wrap',
    /** Internal gap for toolbar controls (e.g. between filter and dropdown) */
    gap: 'gap-3',
  },
} as const;

/**
 * Tab panel chrome — spacing and typography between tab row and main content.
 * Use with TabPanelHeader, TabPanelBody, TabPanelFilters in components/layout/.
 */
export const PANEL = {
  /** Vertical rhythm for tab panel root (space-y-6) */
  body: SPACING.section.gap,
  header: {
    /** Title + actions row */
    row: 'flex items-center justify-between flex-wrap min-w-0 gap-3',
    /** Tab panel title — below page-level titles (NAVIGATION.typography.title) */
    title: 'text-lg md:text-xl font-semibold tracking-tight text-foreground',
    /** Optional subtitle under panel title */
    subtitle: 'text-sm text-muted-foreground mt-0.5',
    /** Space below header block before filters or content */
    marginBottom: 'mb-2',
    /** Divider variant for summary chip rows (e.g. org dashboard) */
    divider: 'border-b border-border/60 pb-2 mb-2',
  },
  filters: {
    /** Filter / search toolbar row */
    row: 'flex items-center justify-between flex-wrap min-w-0 gap-3',
    /** Centered filter row (e.g. activity document filter, document collaborators) */
    rowCentered: 'flex items-center justify-center gap-2 flex-wrap',
    /** Space below filter row before main content */
    marginBottom: 'mb-3',
  },
} as const;

/**
 * Color Design Tokens
 * Use these instead of hardcoded gray-* classes for proper dark mode support.
 * Status and badge tokens use CSS variables from globals.css for theme and dark mode.
 *
 * Color Usage Guidelines:
 * - Prefer CSS variables (--color-*) over direct Tailwind colors for theme consistency
 * - Use semantic color names (primary, success, danger) over specific colors (blue-600, red-600)
 * - For status colors, use COLORS.status / COLORS.statusBg / COLORS.statusBadge (they reference --status-* and --badge-* in globals.css)
 */
export const COLORS = {
  text: {
    /** Primary text color - use for main content */
    primary: 'text-foreground',
    /** Secondary text color - use for supporting text */
    secondary: 'text-muted-foreground',
    /** Hint text color - use for helper text, placeholders */
    hint: 'text-muted-foreground/70',
    /** Disabled text color */
    disabled: 'text-muted-foreground/50',
  },
  bg: {
    /** Page background - use for main page background */
    page: 'bg-background',
    /** Surface background - use for cards, panels */
    surface: 'bg-card',
    /** App chrome - nav rail, optional header band */
    chrome: 'bg-sidebar',
    /** Muted background - use for subtle backgrounds */
    muted: 'bg-muted',
    /** Accent background - use for highlighted areas */
    accent: 'bg-accent',
  },
  border: {
    /** Standard border color */
    standard: 'border-border',
    /** Muted border color (lighter) */
    muted: 'border-border/60',
    /** Subtle border color (very light) */
    subtle: 'border-border/40',
  },
  status: {
    /** Success color - use for approved, completed, positive actions */
    success: 'text-[var(--status-approved-text)]',
    /** Error color - use for errors, rejected, destructive actions */
    error: 'text-[var(--status-rejected-text)]',
    /** Warning color - use for warnings, pending states */
    warning: 'text-[var(--status-pending-text)]',
    /** Active/Orange color - use for active states, attention-required items */
    active: 'text-[var(--status-proposed-text)]',
    /** Info color - use for informational messages, neutral states */
    info: 'text-[var(--status-active-text)]',
  },
  statusBg: {
    /** Success background - use for success badges, approved states */
    success: 'bg-[var(--status-approved-bg)]',
    /** Error background - use for error badges, rejected states */
    error: 'bg-[var(--status-rejected-bg)]',
    /** Warning background - use for warning badges, pending states */
    warning: 'bg-[var(--status-pending-bg)]',
    /** Active/Orange background - use for active states, attention-required items */
    active: 'bg-[var(--status-proposed-bg)]',
    /** Info background - use for info badges, neutral states */
    info: 'bg-[var(--status-active-bg)]',
  },
  /** Status badges - use for history cards, approved states; use CSS vars from globals.css for theme/dark mode */
  statusBadge: {
    success: 'border bg-[var(--badge-success-bg)] text-[var(--badge-success-text)] border-[var(--status-approved-border)]',
    info: 'border bg-[var(--badge-info-bg)] text-[var(--badge-info-text)] border-[var(--status-active-border)]',
    error: 'border bg-[var(--status-rejected-bg)] text-[var(--status-rejected-text)] border-[var(--status-rejected-border)]',
    warning: 'border bg-[var(--badge-warning-bg)] text-[var(--badge-warning-text)] border-[var(--status-pending-border)]',
  },
} as const;

/**
 * Surface role tokens — semantic mapping to globals.css surface ladder
 */
export const SURFACES = {
  canvas: COLORS.bg.page,
  raised: COLORS.bg.surface,
  chrome: COLORS.bg.chrome,
  inset: COLORS.bg.muted,
} as const;

/**
 * Touch Target Standards
 * Minimum 44px for mobile accessibility (WCAG 2.1 Level AAA)
 */
export const TOUCH_TARGETS = {
  /** Minimum height for interactive elements (44px) */
  minHeight: 'min-h-11',
  /** Minimum width for interactive elements (44px) */
  minWidth: 'min-w-11',
  /** Minimum padding for buttons (16px horizontal) */
  padding: 'px-4',
  /** Combined touch target with padding */
  button: 'min-h-11 px-4',
} as const;

/**
 * Responsive Patterns
 * Common responsive class combinations
 */
export const RESPONSIVE = {
  /** Responsive padding: 16px mobile, 24px desktop */
  padding: 'p-4 md:p-6',
  /** Responsive gap: 16px mobile, 24px desktop */
  gap: 'gap-4 md:gap-6',
  /** Responsive text: 14px mobile, 16px desktop */
  text: 'text-sm md:text-base',
  /** Responsive spacing: 16px mobile, 24px desktop */
  spacing: 'space-y-4 md:space-y-6',
} as const;

/**
 * Visual Hierarchy Patterns
 * Common patterns for creating visual separation
 */
export const HIERARCHY = {
  /** Major section break with border */
  majorSection: 'mt-6 pt-6 border-t border-border/60',
  /** Minor section break with border */
  minorSection: 'mt-4 pt-4 border-t border-border/40',
  /** Section divider without border (spacing only) */
  divider: 'mt-6',
} as const;

/**
 * Shadow Design Tokens
 * Consistent shadow utilities for elevation and depth
 */
/**
 * Corner radius tiers (Tailwind classes derived from `--radius` in globals.css).
 *
 * Use by surface role — not interchangeably:
 * - chrome: app shell (cards, tabs, org/protocol block shells)
 * - panel: workflow UI (activity, voting, suggestion/comment panels)
 * - control: buttons, inputs, compact toolbars (matches shadcn defaults)
 * - inline: subtle highlights inside editorial content
 * - editorial: document/agreed body — paper-like, no rounding
 * - pill: avatars, status chips, progress tracks, floating FABs
 */
export const RADIUS = {
  chrome: 'rounded-xl',
  panel: 'rounded-lg',
  control: 'rounded-md',
  inline: 'rounded-sm',
  editorial: 'rounded-none',
  pill: 'rounded-full',
} as const;

/**
 * Icon size tokens — single source of truth for icon sizing.
 * Use as the `size` prop on `<Icon>` or as Tailwind className via ICON_SIZE_CLASS.
 *
 * xs  = 12px  — inline icons, badges
 * sm  = 16px  — standard for most UI elements
 * md  = 20px  — buttons, larger UI elements
 * lg  = 24px  — headers, prominent elements
 * xl  = 32px  — feature icons, empty states
 * 2xl = 48px  — large feature displays, hero sections
 */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export const ICON_SIZE_CLASS: Record<IconSize, string> = {
  xs:    'h-3 w-3',
  sm:    'h-4 w-4',
  md:    'h-5 w-5',
  lg:    'h-6 w-6',
  xl:    'h-8 w-8',
  '2xl': 'h-12 w-12',
};

/**
 * Activity Feed decision archive cards — compact layout aligned with ParagraphChangeCard.
 * Overrides Card default gap-6; use on Decisions tab kind-specific cards.
 */
export const DECISION_CARD = {
  root: `gap-3 overflow-hidden ${COLORS.bg.surface} ${COLORS.border.standard} hover:shadow-md transition-shadow`,
  elevated: 'shadow-lg ring-1 ring-primary/10',
  voteBar: 'w-full shrink-0',
  /** 12px track — matches VoteProgressBar / archive ballot bars */
  voteBarTrack: 'flex h-3 w-full min-h-[12px] overflow-hidden border-b border-border/40',
  voteBarSection: 'border-b bg-muted/20 px-3 py-2 space-y-1.5',
  /** Full-width row; label and count overlay the fill track */
  voteBarRow: 'relative w-full',
  voteBarRowTrack: 'relative w-full min-h-5 overflow-hidden border-b border-border/40',
  voteBarRowFill:
    'pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-300 ease-out opacity-60',
  voteBarRowOverlay:
    'relative z-[1] flex min-h-5 w-full items-center justify-between gap-2 px-1.5',
  voteBarRowLabel:
    'inline-flex min-w-0 flex-1 items-center gap-1 truncate text-xs font-medium text-foreground',
  voteBarRowCount: 'shrink-0 text-xs tabular-nums text-muted-foreground',
  header: 'px-4 pb-2 pt-4 md:px-5 md:pt-5',
  content: `px-4 pb-4 pt-0 md:px-5 md:pb-5 ${SPACING.tight.gap}`,
  title: 'text-base font-semibold tracking-tight',
  meta: 'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1',
  inset: `border px-3 py-2 text-sm ${COLORS.border.muted} ${SURFACES.inset} ${RADIUS.control}`,
  footer: 'flex flex-col gap-2',
  actions: 'flex flex-wrap items-center gap-2',
  link: 'h-auto p-0 text-sm font-semibold text-foreground hover:text-primary',
  icon: ICON_SIZE_CLASS.lg,
} as const;

/**
 * Header and Footer Design Tokens
 * Specific sizing and spacing for navigation components
 */
/** Desktop header height in pixels — use for fixed positioning (e.g. document sidebar top). Must match NAVIGATION.header.height (h-14 = 56px). */
export const HEADER_HEIGHT_PX = 56;

/**
 * Mobile unified bottom bar — single chrome zone (nav + user menu).
 * Keep barHeight in sync with --mobile-chrome-bottom in globals.css.
 */
export const MOBILE_CHROME = {
  barHeight: '4rem',
  barHeightPx: 64,
  clearanceClass:
    'pb-[calc(var(--mobile-chrome-bottom,0px)+env(safe-area-inset-bottom,0px))]',
  footerSpacerClass:
    'mb-[calc(var(--mobile-chrome-bottom,0px)+env(safe-area-inset-bottom,0px))]',
  shellClass: 'mobile-unified-nav',
} as const;

/** App chrome: orb, header bar, and meeting panel limits */
export const APP_CHROME = {
  /** Collapsed orb diameter in pixels (44px touch target) */
  orbSizePx: 44,
  /** CSS length for orb (matches h-11 w-11) */
  orbSizeClass: 'h-11 w-11',
  /** Max height for meeting protocol details panel */
  detailsMaxHeight: 'min(55dvh, 400px)',
  /** @deprecated Use orbCollapsedClearance */
  orbClearance: '3rem',
  /** Collapsed orb zone: anchor gap + orb diameter + content gap */
  orbCollapsedClearance: 'calc(0.5rem + var(--app-orb-size, 2.75rem) + 0.5rem)',
  anchorTopOffset: 'max(0.5rem, env(safe-area-inset-top))',
  anchorBottomOffset: 'max(0.5rem, env(safe-area-inset-bottom))',
  /** Mobile footer height clearance when bottom orb is shown above AppFooter */
  footerClearanceMobile: '3.75rem',
} as const;

/** @deprecated Use APP_CHROME */
export const PROTOCOL_CHROME = APP_CHROME;

/** Pixel clearance for collapsed orb (0.5rem + orb + 0.5rem at 16px root). */
export function getOrbCollapsedClearancePx(): number {
  return 8 + APP_CHROME.orbSizePx + 8;
}
/** Desktop footer height in pixels — use for fixed positioning (e.g. document sidebar bottom) */
export const FOOTER_HEIGHT_PX = 80;
/** Mobile bottom nav (header) offset in pixels — use for fixed tab bar above nav; pair with env(safe-area-inset-bottom) for notched devices */
export const MOBILE_BOTTOM_NAV_OFFSET_PX = 80;

export const NAVIGATION = {
  header: {
    /** Desktop header height (56px) */
    height: 'h-14',
    /** Desktop header min-height (56px) */
    minHeight: 'min-h-14',
    /** Mobile header positioning (bottom) */
    mobilePosition: 'fixed bottom-0',
    /** Desktop header positioning (top) */
    desktopPosition: 'fixed top-0',
    /** Mobile header shadow (large, for bottom position) */
    mobileShadow: SHADOWS.lg,
    /** Desktop header shadow (small, for top position) */
    desktopShadow: SHADOWS.sm,
    /**
     * Branded header: when useBranding from useBrandingStyles is true, icon/outline
     * buttons in the header must use contrasting color. Apply inline style:
     * { color: brandingStyles.textColor, backgroundColor: 'transparent' } and
     * use brandedHeaderControlClass so the border matches (visible on light and dark brand).
     */
    brandedHeaderControlClass: 'border-[currentColor]',
  },
  rail: {
    /** Primary nav rail surface and border */
    surface: COLORS.bg.chrome,
    border: 'border-border/60',
  },
  footer: {
    /** Mobile footer height (60px) */
    mobileHeight: 'min-h-[60px]',
    /** Desktop footer height (80px) */
    desktopHeight: 'min-h-20',
    /** Responsive footer height */
    responsiveHeight: 'min-h-[60px] md:min-h-20',
    /** Footer shadow (top shadow) */
    shadow: SHADOWS.footer,
  },
  content: {
    /** Main content shadow towards footer (bottom shadow) */
    bottomShadow: SHADOWS.md,
  },
  /** Icon size Tailwind classes — references ICON_SIZE_CLASS (single source of truth) */
  icon: ICON_SIZE_CLASS,
  button: {
    /** Button size variants - use with Button component size prop */
    sizes: {
      /** Small button - for compact spaces, secondary actions */
      sm: 'sm',
      /** Default button - standard size for most actions */
      default: 'default',
      /** Large button - for primary CTAs, prominent actions */
      lg: 'lg',
    },
    /** Icon button size (36px) - square buttons with icons only */
    icon: 'h-9 w-9',
    /** Small button padding */
    sm: 'p-2',
  },
  typography: {
    /** Mobile title size */
    titleMobile: 'text-lg',
    /** Desktop title size */
    titleDesktop: 'text-2xl',
    /** Responsive title */
    title: 'text-lg md:text-2xl',
    /** Nav tab label - use for all nav items (Dashboard, Documents, etc.) for consistent appearance */
    navItem: 'text-sm font-medium',
    /** Nav tab active state */
    navItemActive: 'text-sm font-medium text-foreground',
    /** Nav tab inactive state */
    navItemInactive: 'text-sm font-medium text-muted-foreground',
  },
  /**
   * Tab bar (TabsList) layout and TabsTrigger styling.
   * Use with <Tabs>, <TabsList>, <TabsTrigger> from ui/tabs for aligned tab switches app-wide.
   */
  tabs: {
    /** Wrapper around tab row: center and constrain width. Use on div wrapping TabsList. */
    wrapper: 'flex justify-center',
    /** Inner wrapper: full width, max-w-4xl, vertical padding */
    wrapperInner: 'w-full max-w-4xl py-1',
    /** @deprecated Use wrapperInner (merged py-1) */
    wrapperInnerWithPadding: 'w-full max-w-4xl py-1',
    /** Top margin for TabsContent below the tab row */
    contentMargin: 'mt-2',
    /** Compact TabsList for dense tab rows (e.g. activity feed) */
    listCompact: 'h-7 gap-0.5 p-[2px]',
    /** Compact tab trigger — pair with listCompact */
    triggerCompact: 'gap-1 flex-1 sm:flex-none text-xs sm:text-sm px-1.5 py-0.5 min-h-0 max-md:min-h-11',
    /** Tab trigger: gap + typography + inactive state. Use for nav-style tabs (Organization, Document view). */
    trigger: 'gap-2 text-sm font-medium data-[state=inactive]:text-muted-foreground',
    /** Responsive trigger: smaller text on mobile. Use when tab row is dense (many tabs or small screens). */
    triggerResponsive: 'gap-2 text-xs md:text-sm font-medium data-[state=inactive]:text-muted-foreground',
    /** Icon size in tab trigger (mobile). Use with ICON_SIZE_CLASS or directly. */
    iconMobile: 'h-3 w-3',
    /** Icon size in tab trigger (desktop). Use with ICON_SIZE_CLASS or directly. */
    iconDesktop: 'h-4 w-4',
  },
  /**
   * Organization folder/register tab navigation (binder dividers + connected panel).
   * Pair with org-folder-nav.css and OrgFolder* components.
   */
  folderTabs: {
    /** Vertical shell: primary tabs, shelf, then connected panel (do not use tabs.wrapper here) */
    shell: 'mx-auto flex w-full max-w-4xl min-w-0 flex-col py-1',
    /** Scroll/flex row for primary section dividers */
    primaryRow:
      'flex w-full min-w-0 flex-nowrap items-end gap-1 overflow-x-auto org-folder-primary-scroll md:gap-1.5 md:overflow-visible',
    /** Base primary divider button classes */
    primaryTab:
      'org-folder-primary-tab inline-flex shrink-0 items-center justify-center gap-1.5 border px-3 py-2 text-xs font-medium whitespace-nowrap transition-[color,box-shadow,border,transform] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:min-h-11 md:flex-1 md:px-4 md:text-sm',
    primaryTabActive: 'org-folder-primary-tab--active',
    primaryTabInactive: 'org-folder-primary-tab--inactive text-muted-foreground',
    /** Binder shelf line between dividers and folder body */
    shelf: 'org-folder-shelf border-b border-[var(--org-folder-shelf)] shadow-[inset_0_-1px_0_oklch(0_0_0/0.04)] dark:shadow-[inset_0_-1px_0_oklch(1_0_0/0.04)]',
    /** Connected folder body wrapping tab content */
    panel: 'org-folder-panel rounded-b-xl border border-t-0 border-border bg-card',
    /** Inner content padding inside folder panel */
    panelContent: 'p-4 md:p-6',
    /** Inset secondary register label row */
    secondaryRow: 'flex flex-wrap items-center gap-1 border-b border-border/60 px-4 pt-3 pb-0',
    /** Secondary TabsList override — no muted pill wrapper */
    secondaryList: 'inline-flex h-auto w-auto flex-wrap gap-0 bg-transparent p-0 shadow-none',
    /** Secondary register label trigger */
    secondaryTab:
      'org-folder-secondary-tab relative inline-flex items-center gap-1.5 border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-xs font-medium text-muted-foreground shadow-none transition-[color,border-color] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm data-[state=active]:border-[var(--org-folder-accent)] data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent',
    secondaryTabActive: 'org-folder-secondary-tab--active',
  },
} as const;

/**
 * i18n translation keys for vote labels (use with useTranslation or useDesignSystemLabels).
 * Actual copy comes from common.json so labels are translatable.
 */
export const VOTE_LABEL_KEYS = {
  pro: 'common:vote.approve',
  neutral: 'common:vote.neutral',
  contra: 'common:vote.reject',
  notVoted: 'common:vote.notVoted',
} as const;

/**
 * i18n translation keys for card action labels (use with useTranslation or useDesignSystemLabels).
 */
export const CARD_ACTION_KEYS = {
  viewDetails: 'common:cardActions.viewDetails',
  open: 'common:cardActions.open',
  view: 'common:cardActions.view',
  vote: 'common:cardActions.vote',
  voteNow: 'common:cardActions.voteNow',
} as const;

/**
 * Vote Design Tokens
 * Consistent colors and labels for voting UI (PRO/NEUTRAL/CONTRA)
 * Uses CSS variables from globals.css for theme support.
 * For labels, use useDesignSystemLabels().voteLabels or t(VOTE_LABEL_KEYS.pro).
 */
export const VOTE = {
  colors: {
    pro: 'var(--vote-pro)',
    neutral: 'var(--vote-neutral)',
    contra: 'var(--vote-contra)',
    notVoted: 'var(--vote-not-voted)',
    background: 'var(--vote-background)',
  },
  /** Tailwind classes for PRO button (approve) */
  buttonPro: 'bg-[var(--vote-pro)] hover:opacity-90 text-white',
  /** Tailwind classes for NEUTRAL button */
  buttonNeutral: 'bg-muted hover:bg-muted/80',
  /** Tailwind classes for CONTRA button (reject) */
  buttonContra: 'bg-[var(--vote-contra)] hover:opacity-90 text-white',
  /** Translation keys for labels - use useDesignSystemLabels().voteLabels */
  labelKeys: VOTE_LABEL_KEYS,
} as const;

/**
 * Card Action Labels - translation keys.
 * Use useDesignSystemLabels().cardActions for translated strings.
 */
export const CARD_ACTIONS_KEYS = CARD_ACTION_KEYS;

/**
 * Z-Index Scale
 * Centralized z-index tokens so all protocol layers stack predictably.
 */
export const Z_INDEX = {
  base: 'z-0',
  sticky: 'z-10',
  dropdown: 'z-20',
  overlay: 'z-[40]',
  chrome: 'z-[60]',
  /** Menus portaled from app chrome (UserMenu, meeting panel) — above fixed header */
  chromeMenu: 'z-[65]',
  modal: 'z-[70]',
} as const;

