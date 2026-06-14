import type { PerformanceTier } from '../hooks/useDevicePerformance';

export type AppChromeMotionMode = 'full' | 'fade' | 'static';

/** Keep in sync with durations in app-chrome.css */
export const APP_CHROME_MOTION = {
  morphOpenMs: 300,
  morphCloseMs: 260,
  contentFadeDelayMs: 180,
  contentFadeMs: 150,
  panelFadeDelayMs: 80,
  panelFadeMs: 150,
  fadeOpenMs: 220,
  fadeCloseMs: 200,
  openFallbackMs: 320,
  closeFallbackMs: 280,
} as const;

export function getAppChromeMotionMode(
  performanceTier: PerformanceTier,
  reducedMotion: boolean
): AppChromeMotionMode {
  if (reducedMotion) return 'static';
  if (performanceTier === 'low') return 'static';
  return 'full';
}
