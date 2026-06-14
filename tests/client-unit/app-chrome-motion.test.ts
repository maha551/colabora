import { getAppChromeMotionMode } from '../../client/src/lib/appChromeMotion';

describe('getAppChromeMotionMode', () => {
  it('returns full for high tier with motion allowed', () => {
    expect(getAppChromeMotionMode('high', false)).toBe('full');
  });

  it('returns full for medium tier', () => {
    expect(getAppChromeMotionMode('medium', false)).toBe('full');
  });

  it('returns static for low tier', () => {
    expect(getAppChromeMotionMode('low', false)).toBe('static');
  });

  it('returns static when reduced motion is preferred', () => {
    expect(getAppChromeMotionMode('high', true)).toBe('static');
  });
});
