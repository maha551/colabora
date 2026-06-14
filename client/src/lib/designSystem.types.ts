/**
 * TypeScript types for design system tokens
 * Provides type safety and autocomplete for design system usage
 */

import { SPACING, COLORS, RADIUS } from './designSystem';

/**
 * Spacing key types
 */
export type SpacingKey = keyof typeof SPACING;
export type SpacingSectionKey = keyof typeof SPACING.section;
export type SpacingContentKey = keyof typeof SPACING.content;
export type SpacingCardKey = keyof typeof SPACING.card;
export type SpacingContainerKey = keyof typeof SPACING.container;
export type SpacingIndentKey = keyof typeof SPACING.indent;
export type SpacingBorderKey = keyof typeof SPACING.border;

/**
 * Spacing value type
 */
export type SpacingValue = typeof SPACING[SpacingKey][string] | string;

/**
 * Color key types
 */
export type ColorTextKey = keyof typeof COLORS.text;
export type ColorBgKey = keyof typeof COLORS.bg;
export type ColorBorderKey = keyof typeof COLORS.border;
export type RadiusKey = keyof typeof RADIUS;

/**
 * Color token type - valid Tailwind color classes using design tokens
 */
export type ColorToken = 
  | 'text-foreground'
  | 'text-muted-foreground'
  | 'text-primary'
  | 'text-secondary'
  | 'text-destructive'
  | 'bg-background'
  | 'bg-card'
  | 'bg-muted'
  | 'bg-accent'
  | 'bg-primary'
  | 'bg-secondary'
  | 'bg-destructive'
  | 'border-border'
  | 'border-primary'
  | 'border-destructive';

/**
 * Helper function to get spacing value with type safety
 */
export function getSpacing(section: SpacingKey, key?: string): string {
  const sectionValue = SPACING[section];
  if (typeof sectionValue === 'string') {
    return sectionValue;
  }
  if (key && typeof sectionValue === 'object' && key in sectionValue) {
    return (sectionValue as Record<string, string>)[key];
  }
  return '';
}

/**
 * Helper function to get color class with type safety
 */
export function getColor(type: 'text' | 'bg' | 'border', key: string): string {
  const colorSection = COLORS[type];
  if (key in colorSection) {
    return (colorSection as Record<string, string>)[key];
  }
  return '';
}

