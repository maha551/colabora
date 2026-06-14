/**
 * Hash routing: single source of truth for in-app location.
 * All navigable places have a hash; state is derived from URL on popstate and initial load.
 */

import type { AppView } from '../types';

/** Organization tab segment in hash (must match TabsTrigger value in OrganizationManagement). */
export const ORG_TABS = [
  'dashboard',
  'governance',
  'documents',
  'minutes',
  'members',
  'transparency',
  'schedule',
  'representatives',
] as const;

export type OrgTab = (typeof ORG_TABS)[number];

export function isOrgTab(s: string): s is OrgTab {
  return ORG_TABS.includes(s as OrgTab);
}

/** Parsed result from current hash. Used to derive currentView, selectedOrganization, activeTab, etc. */
export interface ParsedHash {
  view: AppView;
  organizationId?: string;
  orgTab?: OrgTab;
  documentId?: string;
  /** Set for meeting detail; 'new' for new meeting full page. */
  meetingId?: string;
  pollId?: string;
  memberId?: string;
  /** Org context when viewing a member profile from an organization. */
  memberOrganizationId?: string;
  /** When set, activity feed filters decisions/pending to this organization. */
  activityOrganizationId?: string;
}

/** True for `#/organization/:id/meetings/:meetingId` (not `new`). Used for immersive protocol chrome / minimal app shell. */
export function isMeetingProtocolDetail(parsed: ParsedHash): boolean {
  return (
    parsed.view === 'organization' &&
    !!parsed.meetingId &&
    parsed.meetingId !== 'new'
  );
}

const DEFAULT_VIEW: AppView = 'activity';

/**
 * Parse window.location.hash into a structured ParsedHash.
 * Unknown or invalid hash falls back to activity.
 */
export function parseHash(hash: string): ParsedHash {
  const raw = (hash || '').trim();
  if (!raw) {
    return { view: DEFAULT_VIEW };
  }

  // #document/:id
  const docMatch = raw.match(/^#document\/([^/]+)\/?$/);
  if (docMatch) {
    return { view: 'document', documentId: docMatch[1]! };
  }

  // #/member-profile/:userId/:organizationId?
  const memberMatch = raw.match(/^#\/member-profile\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (memberMatch) {
    return {
      view: 'member-profile',
      memberId: memberMatch[1]!,
      memberOrganizationId: memberMatch[2] || undefined,
    };
  }

  // Top-level app views
  const topLevel: Record<string, AppView> = {
    '#/activity': 'activity',
    '#/documents': 'documents',
    '#/profile': 'profile',
    '#/settings': 'settings',
    '#/organizations': 'organizations',
    '#/admin': 'admin',
    '#/search': 'search',
    '#/report-issue': 'report-issue',
  };
  const normalized = raw.replace(/\/$/, '');
  if (normalized === '#/activity' || normalized.startsWith('#/activity?')) {
    const orgMatch = raw.match(/[?&]org=([^&]+)/);
    return {
      view: 'activity',
      activityOrganizationId: orgMatch?.[1] ? decodeURIComponent(orgMatch[1]) : undefined,
    };
  }
  if (topLevel[normalized]) {
    return { view: topLevel[normalized]! };
  }

  // #/organization/:id/...
  const orgPrefix = /^#\/organization\/([^/]+)\/?/;
  const orgMatch = raw.match(orgPrefix);
  if (orgMatch) {
    const orgId = orgMatch[1]!;
    const rest = raw.slice(orgMatch[0]!.length);

    // #/organization/:id/meetings/new
    if (rest === 'meetings/new' || rest.startsWith('meetings/new/')) {
      return { view: 'organization', organizationId: orgId, meetingId: 'new' };
    }
    // #/organization/:id/meetings/:meetingId
    const meetingMatch = rest.match(/^meetings\/([^/]+)\/?$/);
    if (meetingMatch) {
      return {
        view: 'organization',
        organizationId: orgId,
        meetingId: meetingMatch[1]!,
      };
    }
    // #/organization/:id/schedule/polls/:pollId
    const pollMatch = rest.match(/^schedule\/polls\/([^/]+)\/?$/);
    if (pollMatch) {
      return {
        view: 'organization',
        organizationId: orgId,
        orgTab: 'schedule',
        pollId: pollMatch[1]!,
      };
    }
    // #/organization/:id/:tab
    const tabSegment = rest.replace(/\/$/, '').split('/')[0];
    if (tabSegment && isOrgTab(tabSegment)) {
      return {
        view: 'organization',
        organizationId: orgId,
        orgTab: tabSegment,
      };
    }
    // #/organization/:id (no segment) -> default dashboard
    if (!rest) {
      return {
        view: 'organization',
        organizationId: orgId,
        orgTab: 'dashboard',
      };
    }
  }

  return { view: DEFAULT_VIEW };
}

/**
 * Build hash string from parsed state (for pushState/replaceState).
 * Only pass the fields that define the target location.
 */
export function buildHash(parsed: Partial<ParsedHash>): string {
  if (parsed.view === 'document' && parsed.documentId) {
    return `#document/${parsed.documentId}`;
  }
  if (parsed.view === 'member-profile' && parsed.memberId) {
    if (parsed.memberOrganizationId) {
      return `#/member-profile/${parsed.memberId}/${parsed.memberOrganizationId}`;
    }
    return `#/member-profile/${parsed.memberId}`;
  }
  if (parsed.view === 'activity') {
    if (parsed.activityOrganizationId) {
      return `#/activity?org=${encodeURIComponent(parsed.activityOrganizationId)}`;
    }
    return '#/activity';
  }
  if (parsed.view === 'documents') return '#/documents';
  if (parsed.view === 'profile') return '#/profile';
  if (parsed.view === 'settings') return '#/settings';
  if (parsed.view === 'organizations') return '#/organizations';
  if (parsed.view === 'admin') return '#/admin';
  if (parsed.view === 'search') return '#/search';
  if (parsed.view === 'report-issue') return '#/report-issue';

  if (parsed.view === 'organization' && parsed.organizationId) {
    const id = parsed.organizationId;
    if (parsed.meetingId === 'new') return `#/organization/${id}/meetings/new`;
    if (parsed.meetingId) return `#/organization/${id}/meetings/${parsed.meetingId}`;
    if (parsed.pollId) return `#/organization/${id}/schedule/polls/${parsed.pollId}`;
    const tab = parsed.orgTab || 'dashboard';
    return `#/organization/${id}/${tab}`;
  }

  return '#/activity';
}

/**
 * Get current hash from window (safe for SSR).
 */
export function getCurrentHash(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash || '';
}

/**
 * Get pathname for history API (keep auth paths correct).
 */
export function getPathname(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
}

/**
 * Push a new history entry and update the hash. Caller must then apply state from the new hash.
 */
export function pushHash(hash: string): void {
  if (typeof window === 'undefined') return;
  const pathname = getPathname();
  const url = pathname + (hash.startsWith('#') ? hash : `#${hash}`);
  window.history.pushState(null, '', url);
}

/**
 * Replace current history entry with this hash (e.g. initial load default).
 */
export function replaceHash(hash: string): void {
  if (typeof window === 'undefined') return;
  const pathname = getPathname();
  const url = pathname + (hash.startsWith('#') ? hash : `#${hash}`);
  window.history.replaceState(null, '', url);
}
