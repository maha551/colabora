import type { AppView } from '../types';
import { parseHash, isMeetingProtocolDetail } from './hashRoutes';

export type ChromeDisplay = 'bar' | 'orb';
export type ChromeAnchor = 'top' | 'bottom';

export interface ChromeConfig {
  display: ChromeDisplay;
  anchor: ChromeAnchor;
  orbAllowed: boolean;
  hideFooter: boolean;
  immersiveShell: boolean;
  /** Mobile standard routes: single bottom bar (nav + user menu), title in content */
  unifiedBottomNav: boolean;
}

/** Document editor or meeting protocol detail — historically orb-eligible focus routes. */
export function isOrbAllowedRoute(currentView: AppView, hash: string): boolean {
  if (currentView === 'document') return true;
  if (currentView === 'organization') {
    return isMeetingProtocolDetail(parseHash(hash));
  }
  return false;
}

export function isMeetingProtocolRoute(currentView: AppView, hash: string): boolean {
  return currentView === 'organization' && isMeetingProtocolDetail(parseHash(hash));
}

/** Primary nav rail: always on desktop; on mobile only on standard bar routes (not immersive protocol). */
export function shouldShowPrimaryNav(config: ChromeConfig, isMobile: boolean): boolean {
  if (!isMobile) return true;
  return config.display === 'bar' && !config.immersiveShell;
}

export function resolveChromeConfig(input: {
  currentView: AppView;
  hash: string;
  isMobile: boolean;
}): ChromeConfig {
  const meetingProtocol = isMeetingProtocolRoute(input.currentView, input.hash);
  const unifiedBottomNav = input.isMobile && !meetingProtocol;
  const anchor: ChromeAnchor = unifiedBottomNav ? 'top' : input.isMobile ? 'bottom' : 'top';

  return {
    display: 'bar',
    anchor,
    orbAllowed: false,
    hideFooter: meetingProtocol,
    immersiveShell: meetingProtocol,
    unifiedBottomNav,
  };
}
