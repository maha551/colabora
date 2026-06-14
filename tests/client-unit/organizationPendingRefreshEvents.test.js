const {
  shouldRefreshPendingOnOrgUpdate,
  ORGANIZATION_PENDING_REFRESH_EVENTS,
} = require('../../client/src/lib/proposals/organizationPendingRefreshEvents');

describe('organizationPendingRefreshEvents', () => {
  test('includes rule-proposal-vote-cast', () => {
    expect(ORGANIZATION_PENDING_REFRESH_EVENTS).toContain('rule-proposal-vote-cast');
  });

  test('shouldRefreshPendingOnOrgUpdate returns true for pending refresh events', () => {
    expect(shouldRefreshPendingOnOrgUpdate('rule-proposal-vote-cast')).toBe(true);
    expect(shouldRefreshPendingOnOrgUpdate('organization-vote-cast')).toBe(true);
  });

  test('shouldRefreshPendingOnOrgUpdate returns false for unrelated events', () => {
    expect(shouldRefreshPendingOnOrgUpdate('branding-updated')).toBe(false);
    expect(shouldRefreshPendingOnOrgUpdate('member-added')).toBe(false);
  });
});
