import { organizationSwitcherIndentPx } from '../../client/src/components/shared/OrganizationSwitcher';

describe('organizationSwitcherIndentPx', () => {
  it('returns zero for flat orgs', () => {
    expect(organizationSwitcherIndentPx(0)).toBe(0);
    expect(organizationSwitcherIndentPx()).toBe(0);
  });

  it('scales indent by tree depth', () => {
    expect(organizationSwitcherIndentPx(1)).toBe(12);
    expect(organizationSwitcherIndentPx(2)).toBe(24);
    expect(organizationSwitcherIndentPx(3)).toBe(36);
  });

  it('never returns negative indent', () => {
    expect(organizationSwitcherIndentPx(-1)).toBe(0);
  });
});
