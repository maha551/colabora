/**
 * Document View Styling Utilities
 * 
 * Centralized styling patterns for consistent document view presentation
 * across Agreed View and Discussion View components.
 */

import { HeadingLevel, Organization, Document } from '../types';
import { cn } from '../components/ui/utils';
import { SPACING, COLORS, RADIUS } from './designSystem';

/**
 * Typography scale for document content
 */
export const documentTypography = {
  // Heading sizes - consistent across views
  heading: {
    h1: 'text-2xl font-bold',
    h2: 'text-xl font-semibold',
    h3: 'text-lg font-semibold',
    title: 'text-5xl font-bold text-center', // Document title only
  },
  // Body text styles
  body: {
    default: 'leading-relaxed whitespace-pre-wrap',
    justified: 'leading-relaxed text-justify indent-8 first-line:font-medium whitespace-pre-wrap',
  },
  // Text colors using theme tokens
  color: {
    primary: 'text-foreground',
    secondary: 'text-muted-foreground',
  },
};

/**
 * Spacing scale for document views
 * Uses designSystem.ts SPACING constants where possible, with document-specific overrides
 */
export const documentSpacing = {
  // Container spacing - responsive (document-specific pattern)
  container: 'space-y-4 sm:space-y-6 md:space-y-8', // Responsive container spacing (unique to documents)
  // Content spacing - uses design system
  content: SPACING.content.gap, // 'space-y-4'
  // Card padding - responsive (document-specific patterns)
  card: {
    default: 'p-4 sm:p-6 md:p-8', // Responsive default padding (unique to documents)
    expanded: 'p-6 sm:p-8 md:p-10', // Responsive expanded padding (unique to documents)
    document: 'p-6 sm:p-8 md:p-12', // Responsive document padding (paper-like, unique)
  },
  // Section spacing - responsive (document-specific pattern)
  section: 'space-y-6 sm:space-y-8 md:space-y-10', // Responsive section spacing (unique to documents)
  // Paragraph spacing - uses design system tight spacing
  paragraph: SPACING.tight.gap, // 'space-y-2' - but documents use space-y-3, so keep unique
  // Discussion view paragraph gap - zero spacing for continuous appearance
  discussionParagraphGap: 'space-y-0', // Zero spacing between paragraphs in discussion view
  // Container padding - responsive (document-specific pattern)
  containerPadding: 'px-4 sm:px-6 md:px-8', // Responsive horizontal padding (unique to documents)
};

/**
 * Get heading class based on level
 */
export function getHeadingClass(
  level: HeadingLevel | number | string | undefined,
  isDocumentTitle = false
): string {
  if (isDocumentTitle) {
    return documentTypography.heading.title;
  }

  // Normalize heading level
  let normalizedLevel: number;
  if (typeof level === 'string' && level.startsWith('h')) {
    normalizedLevel = parseInt(level.substring(1), 10);
  } else if (typeof level === 'number') {
    normalizedLevel = level;
  } else {
    normalizedLevel = 2; // Default to h2
  }

  // Clamp to valid range
  normalizedLevel = Math.max(1, Math.min(6, normalizedLevel));

  switch (normalizedLevel) {
    case 1:
      return documentTypography.heading.h1;
    case 2:
      return documentTypography.heading.h2;
    case 3:
    default:
      return documentTypography.heading.h3;
  }
}

/**
 * Get body text class based on view type
 */
export function getBodyClass(justified = false): string {
  return justified
    ? documentTypography.body.justified
    : documentTypography.body.default;
}

/**
 * Card container styles
 */
export const cardStyles = {
  // Discussion view card — editorial tier: no outer radius (RADIUS.editorial)
  discussion: {
    base: cn(
      RADIUS.editorial,
      'relative transition-all duration-200',
      'bg-card', // Uses theme token instead of hardcoded colors
      documentSpacing.card.default
    ),
    expanded: cn(
      'shadow-lg ring-1 ring-primary/10',
      documentSpacing.card.expanded
    ),
  },
  // Agreed view card (paper-like)
  agreed: cn(
    RADIUS.editorial,
    'shadow-2xl',
    'bg-card', // Uses theme token instead of hardcoded colors
    'relative overflow-hidden',
    'border-2 border-border', // Uses theme token instead of hardcoded colors
    documentSpacing.card.document
  ),
};

/**
 * Button styles for document views
 */
export const buttonStyles = {
  // Overlay button for floating add paragraph button
  overlay: cn(
    '!h-10 !w-10 !rounded-full', // RADIUS.pill — override Button size="icon" default
    'backdrop-blur-sm',
    'bg-card/90 dark:bg-card/80', // Use design tokens with opacity
    'border border-border/50', // Subtle border using design token
    'shadow-md hover:shadow-lg',
    'transition-all duration-200',
    'touch-manipulation',
    COLORS.text.primary // Add explicit text color so icon is visible
  ),
};

/**
 * Responsive breakpoints
 * Consistent with Tailwind defaults: sm:640px, md:768px, lg:1024px
 */
export const breakpoints = {
  mobile: 640, // sm
  tablet: 768, // md
  desktop: 1024, // lg
};

/**
 * Accessibility: Focus states
 */
export const focusStyles = {
  default: 'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2',
  button: 'focus:outline-none focus:ring-2 focus:ring-primary/20',
};

/**
 * Accessibility: Color contrast helpers
 * These ensure WCAG AA compliance (4.5:1 for normal text, 3:1 for large text)
 */
export const contrastColors = {
  // High contrast text colors - using design tokens
  text: {
    high: 'text-foreground', // Uses theme token for proper dark mode support
    medium: 'text-foreground/80', // Slightly muted foreground
    low: 'text-muted-foreground', // Uses theme token for proper dark mode support
  },
  // Background colors with sufficient contrast - using design tokens
  bg: {
    light: 'bg-card', // Uses theme token
    muted: 'bg-muted', // Uses theme token
  },
};

/**
 * Responsive container utility
 * Provides consistent responsive container widths and padding across screen sizes
 */
export const responsiveContainer = "w-full max-w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-6 md:px-8";

/**
 * Get heading color style based on organization branding
 * Only applies branding color for organizational documents
 * 
 * @param organization - The organization (if any)
 * @param document - The document
 * @returns Inline style object with color property, or undefined if no branding should be applied
 */
export function getHeadingColorStyle(
  organization: Organization | null,
  document: Document | null
): React.CSSProperties | undefined {
  // Only apply branding color for organizational documents
  if (!organization || !document) return undefined;
  if (document.ownershipType !== 'organizational') return undefined;
  if (document.organizationId !== organization.id) return undefined;
  if (!organization.brandingColor) return undefined;
  
  return { color: organization.brandingColor };
}
