import type { OrganizationUpdateEventType } from '../../hooks/useOrganizationWebSocket';

/** Org WebSocket events that should refresh the activity feed pending tab. */
export const ORGANIZATION_PENDING_REFRESH_EVENTS: OrganizationUpdateEventType[] = [
  'rule-proposal-created',
  'rule-proposal-approved',
  'rule-proposal-rejected',
  'rule-proposal-declined',
  'rule-proposal-withdrawn',
  'rule-proposal-expired',
  'rule-proposal-vote-cast',
  'rule-proposal-voting-started',
  'organization-vote-cast',
  'organization-vote-created',
  'organization-vote-completed',
  'election-created',
  'election-updated',
  'election-completed',
];

export function shouldRefreshPendingOnOrgUpdate(eventType: OrganizationUpdateEventType): boolean {
  return ORGANIZATION_PENDING_REFRESH_EVENTS.includes(eventType);
}
