import type { OrgTab } from './hashRoutes';
import type { OrgGroup } from './orgTabGroups';

/** Top-level organization navigation groups shown as binder dividers. */
export const PRIMARY_GROUPS: readonly OrgGroup[] = ['overview', 'documents', 'community', 'governance'];

export const PRIMARY_GROUP_ICONS: Record<OrgGroup, string> = {
  overview: 'LayoutDashboard',
  documents: 'FileText',
  community: 'Users',
  governance: 'Vote',
};

/** i18n keys in organization namespace */
export const PRIMARY_GROUP_I18N: Record<OrgGroup, string> = {
  overview: 'overview',
  documents: 'documents',
  community: 'community',
  governance: 'governance',
};

export const ORG_TAB_ICONS: Record<OrgTab, string> = {
  dashboard: 'LayoutDashboard',
  documents: 'FileText',
  minutes: 'FileCheck',
  members: 'Users',
  schedule: 'Calendar',
  governance: 'Vote',
  transparency: 'Eye',
  representatives: 'UserCheck',
};

/** i18n keys in organization namespace */
export const ORG_TAB_I18N: Record<OrgTab, string> = {
  dashboard: 'dashboard',
  documents: 'documents',
  minutes: 'minutes',
  members: 'members',
  schedule: 'schedule',
  governance: 'governance',
  transparency: 'transparency',
  representatives: 'representatives',
};
