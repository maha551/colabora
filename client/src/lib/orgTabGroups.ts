import type { OrgTab } from './hashRoutes';

/** Top-level organization navigation groups (UX shell; tabs remain in ORG_TABS). */
export type OrgGroup = 'overview' | 'documents' | 'community' | 'governance';

export const ORG_GROUPS: Record<OrgGroup, readonly OrgTab[]> = {
  overview: ['dashboard'],
  documents: ['documents', 'minutes'],
  community: ['members', 'schedule'],
  governance: ['governance', 'transparency', 'representatives'],
};

const TAB_TO_GROUP: Record<OrgTab, OrgGroup> = {
  dashboard: 'overview',
  documents: 'documents',
  minutes: 'documents',
  members: 'community',
  schedule: 'community',
  governance: 'governance',
  transparency: 'governance',
  representatives: 'governance',
};

/** Resolve the primary navigation group for an organization tab segment. */
export function getPrimaryGroup(tab: OrgTab): OrgGroup {
  return TAB_TO_GROUP[tab];
}

/** Tabs shown under a group; representatives is omitted unless the user is a representative. */
export function getGroupChildren(group: OrgGroup, isRepresentative: boolean): OrgTab[] {
  const children = ORG_GROUPS[group];
  if (group === 'governance' && !isRepresentative) {
    return children.filter((tab) => tab !== 'representatives');
  }
  return [...children];
}
