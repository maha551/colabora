import type { ChromeAnchor } from './chromeMode';
import { HEADER_HEIGHT_PX } from './designSystem';

export interface ChromeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ChromeFlipMetrics {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
}

export type ChromeFlipCssVars = {
  '--app-chrome-flip-x': string;
  '--app-chrome-flip-y': string;
  '--app-chrome-flip-sx': string;
  '--app-chrome-flip-sy': string;
};

export interface ChromeViewport {
  width: number;
  height: number;
}

function resolveViewport(viewport?: ChromeViewport): ChromeViewport {
  if (viewport) return viewport;
  if (typeof window !== 'undefined') {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  return { width: 0, height: 0 };
}

/** Target rect for the expanded header shell in viewport coordinates. */
export function getExpandedChromeRect(anchor: ChromeAnchor, viewport?: ChromeViewport): ChromeRect {
  const { width, height: viewportHeight } = resolveViewport(viewport);
  const height = HEADER_HEIGHT_PX;
  if (anchor === 'bottom') {
    return { left: 0, top: viewportHeight - height, width, height };
  }
  return { left: 0, top: 0, width, height };
}

/** FLIP invert: map `from` rect onto `to` layout using top-left transform origin. */
export function computeChromeFlipMetrics(from: ChromeRect, to: ChromeRect): ChromeFlipMetrics {
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  return {
    translateX: from.left - to.left,
    translateY: from.top - to.top,
    scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
    scaleY: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1,
  };
}

export function chromeFlipMetricsToCssVars(metrics: ChromeFlipMetrics): ChromeFlipCssVars {
  return {
    '--app-chrome-flip-x': `${metrics.translateX}px`,
    '--app-chrome-flip-y': `${metrics.translateY}px`,
    '--app-chrome-flip-sx': String(metrics.scaleX),
    '--app-chrome-flip-sy': String(metrics.scaleY),
  };
}

export function computeChromeFlipCssVars(from: ChromeRect, to: ChromeRect): ChromeFlipCssVars {
  return chromeFlipMetricsToCssVars(computeChromeFlipMetrics(from, to));
}
