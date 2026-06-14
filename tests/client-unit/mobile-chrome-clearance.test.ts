import { MOBILE_CHROME } from '../../client/src/lib/designSystem';

describe('MOBILE_CHROME tokens', () => {
  it('defines unified bottom bar height at 4rem / 64px', () => {
    expect(MOBILE_CHROME.barHeight).toBe('4rem');
    expect(MOBILE_CHROME.barHeightPx).toBe(64);
  });

  it('clearance classes reference CSS variable and safe-area', () => {
    expect(MOBILE_CHROME.clearanceClass).toContain('var(--mobile-chrome-bottom');
    expect(MOBILE_CHROME.clearanceClass).toContain('safe-area-inset-bottom');
    expect(MOBILE_CHROME.footerSpacerClass).toContain('var(--mobile-chrome-bottom');
    expect(MOBILE_CHROME.footerSpacerClass).toContain('safe-area-inset-bottom');
  });

  it('shell class toggles mobile chrome variables in globals.css', () => {
    expect(MOBILE_CHROME.shellClass).toBe('mobile-unified-nav');
  });
});
