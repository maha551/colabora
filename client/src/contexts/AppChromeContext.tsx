import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ChromeConfig } from '../lib/chromeMode';
import { APP_CHROME } from '../lib/designSystem';

export type OrbPhase = 'collapsed' | 'opening' | 'expanded' | 'closing';

export interface AppChromeContextValue {
  chromeConfig: ChromeConfig;
  orbPhase: OrbPhase;
  expanded: boolean;
  focusTitle: string | null;
  setFocusTitle: (title: string | null) => void;
  openOrb: () => void;
  openOrbImmediate: () => void;
  closeOrb: () => void;
  closeOrbImmediate: () => void;
  onOrbOpenAnimationEnd: () => void;
  onOrbCloseAnimationEnd: () => void;
  registerOrbTrigger: (el: HTMLButtonElement | null) => void;
  focusOrbTrigger: () => void;
}

const AppChromeContext = createContext<AppChromeContextValue | null>(null);

export function AppChromeProvider({
  chromeConfig,
  focusTitleOverride,
  children,
}: {
  chromeConfig: ChromeConfig;
  /** Document editor title (meeting routes set focus title in MeetingsTab). */
  focusTitleOverride?: string | null;
  children: React.ReactNode;
}) {
  const [orbPhase, setOrbPhase] = useState<OrbPhase>(
    chromeConfig.display === 'orb' ? 'collapsed' : 'expanded'
  );
  const [focusTitle, setFocusTitle] = useState<string | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setOrbPhase(chromeConfig.display === 'orb' ? 'collapsed' : 'expanded');
    setFocusTitle(null);
    if (typeof document !== 'undefined') {
      document.documentElement.style.removeProperty('--app-chrome-height');
      document.documentElement.style.removeProperty('--app-chrome-panel-height');
      if (chromeConfig.display === 'orb') {
        document.documentElement.style.setProperty(
          '--app-orb-size',
          `${APP_CHROME.orbSizePx}px`
        );
      } else {
        document.documentElement.style.removeProperty('--app-orb-size');
      }
    }
  }, [chromeConfig.display, chromeConfig.orbAllowed]);

  useEffect(() => {
    if (focusTitleOverride) {
      setFocusTitle(focusTitleOverride);
    }
  }, [focusTitleOverride]);

  const expanded = orbPhase === 'expanded' || orbPhase === 'opening';

  const registerOrbTrigger = useCallback((el: HTMLButtonElement | null) => {
    triggerRef.current = el;
  }, []);

  const focusOrbTrigger = useCallback(() => {
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openOrb = useCallback(() => {
    if (chromeConfig.display !== 'orb') return;
    setOrbPhase((p) => (p === 'collapsed' ? 'opening' : p));
  }, [chromeConfig.display]);

  const openOrbImmediate = useCallback(() => {
    if (chromeConfig.display !== 'orb') return;
    setOrbPhase('expanded');
  }, [chromeConfig.display]);

  const closeOrb = useCallback(() => {
    setOrbPhase((p) => (p === 'expanded' || p === 'opening' ? 'closing' : p));
  }, []);

  const closeOrbImmediate = useCallback(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.removeProperty('--app-chrome-height');
      document.documentElement.style.removeProperty('--app-chrome-panel-height');
    }
    setOrbPhase('collapsed');
    focusOrbTrigger();
  }, [focusOrbTrigger]);

  const onOrbOpenAnimationEnd = useCallback(() => {
    setOrbPhase((p) => (p === 'opening' ? 'expanded' : p));
  }, []);

  const onOrbCloseAnimationEnd = useCallback(() => {
    setOrbPhase((p) => {
      if (p === 'closing') {
        if (typeof document !== 'undefined') {
          document.documentElement.style.removeProperty('--app-chrome-height');
          document.documentElement.style.removeProperty('--app-chrome-panel-height');
        }
        return 'collapsed';
      }
      return p;
    });
    focusOrbTrigger();
  }, [focusOrbTrigger]);

  const value = useMemo(
    () => ({
      chromeConfig,
      orbPhase,
      expanded,
      focusTitle,
      setFocusTitle,
      openOrb,
      openOrbImmediate,
      closeOrb,
      closeOrbImmediate,
      onOrbOpenAnimationEnd,
      onOrbCloseAnimationEnd,
      registerOrbTrigger,
      focusOrbTrigger,
    }),
    [
      chromeConfig,
      orbPhase,
      expanded,
      focusTitle,
      openOrb,
      openOrbImmediate,
      closeOrb,
      closeOrbImmediate,
      onOrbOpenAnimationEnd,
      onOrbCloseAnimationEnd,
      registerOrbTrigger,
      focusOrbTrigger,
    ]
  );

  return <AppChromeContext.Provider value={value}>{children}</AppChromeContext.Provider>;
}

export function useAppChrome(): AppChromeContextValue {
  const ctx = useContext(AppChromeContext);
  if (!ctx) {
    throw new Error('useAppChrome must be used within AppChromeProvider');
  }
  return ctx;
}

export function useAppChromeOptional(): AppChromeContextValue | null {
  return useContext(AppChromeContext);
}
