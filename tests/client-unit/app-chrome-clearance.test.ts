import { APP_CHROME, getOrbCollapsedClearancePx } from '../../client/src/lib/designSystem';

describe('getOrbCollapsedClearancePx', () => {
  it('matches anchor gap + orb diameter + content gap', () => {
    expect(getOrbCollapsedClearancePx()).toBe(8 + APP_CHROME.orbSizePx + 8);
    expect(getOrbCollapsedClearancePx()).toBe(60);
  });
});
