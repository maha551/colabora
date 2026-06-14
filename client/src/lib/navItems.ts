import type { AppView } from '../types';
import { NAVIGATION, SPACING, RADIUS } from './designSystem';

/** Keys of AppHeader/AppLayout navigation handler props. */
export type PrimaryNavHandlerKey =
  | 'onShowActivity'
  | 'onShowDocuments'
  | 'onShowOrganizations'
  | 'onShowSearch';

/** i18n keys in the `nav` namespace used by primary destinations. */
export type PrimaryNavI18nKey =
  | 'activityFeed'
  | 'activityFeedShort'
  | 'documents'
  | 'documentsShort'
  | 'organizations'
  | 'organizationsShort'
  | 'search';

export interface PrimaryNavItem {
  id: string;
  /** i18n key in the `nav` namespace (pass to `t(i18nKey)` with `useTranslation('nav')`). */
  i18nKey: PrimaryNavI18nKey;
  /** PascalCase icon name for `<Icon name={icon} />`. */
  icon: string;
  view: AppView;
  /** Prop name on AppLayout/AppHeader that navigates to this destination. */
  handlerKey: PrimaryNavHandlerKey;
}

/** Desktop rail width in pixels — keep in sync with PRIMARY_NAV_RAIL_WIDTH_CLASS (w-16). */
export const PRIMARY_NAV_RAIL_WIDTH_PX = 64;
/** Desktop rail width — keep in sync with AppLayout shell and PrimaryNav. */
export const PRIMARY_NAV_RAIL_WIDTH_CLASS = 'w-16' as const;
/** Content inset matching the fixed rail width. */
export const PRIMARY_NAV_RAIL_INSET_CLASS = 'md:pl-16' as const;

/** Shared styling tokens for PrimaryNav consumers (rail / bottom bar). */
export const PRIMARY_NAV_STYLES = {
  itemGap: SPACING.tight.inline,
  icon: NAVIGATION.icon.sm,
  iconActive: 'h-5 w-5',
  label: NAVIGATION.typography.navItem,
  labelActive: NAVIGATION.typography.navItemActive,
  labelInactive: NAVIGATION.typography.navItemInactive,
  itemRadius: RADIUS.control,
  rail: {
    surface: NAVIGATION.rail.surface,
    border: NAVIGATION.rail.border,
  },
  item: {
    base: 'transition-colors duration-150',
    idle: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
    active: 'bg-card text-foreground shadow-sm ring-1 ring-border/60',
    indicator:
      'before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary',
  },
} as const;

/** Primary app destinations surfaced in persistent navigation. */
export const PRIMARY_NAV_ITEMS: readonly PrimaryNavItem[] = [
  {
    id: 'activity',
    i18nKey: 'activityFeed',
    icon: 'Activity',
    view: 'activity',
    handlerKey: 'onShowActivity',
  },
  {
    id: 'documents',
    i18nKey: 'documents',
    icon: 'FolderOpen',
    view: 'documents',
    handlerKey: 'onShowDocuments',
  },
  {
    id: 'organizations',
    i18nKey: 'organizations',
    icon: 'Users',
    view: 'organizations',
    handlerKey: 'onShowOrganizations',
  },
  {
    id: 'search',
    i18nKey: 'search',
    icon: 'Search',
    view: 'search',
    handlerKey: 'onShowSearch',
  },
] as const;
