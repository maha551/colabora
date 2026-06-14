import { useEffect, useState } from 'react';
import { useAppChromeOptional } from '../contexts/AppChromeContext';
import { getOrbCollapsedClearancePx, HEADER_HEIGHT_PX } from '../lib/designSystem';

function readCssPx(varName: string): number {
  if (typeof document === 'undefined') return 0;
  const n = parseInt(document.documentElement.style.getPropertyValue(varName), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Top inset for fixed sidebars under app chrome (bar header + optional protocol panel). */
export function useChromeTopInset(): number {
  const chrome = useAppChromeOptional();
  const [inset, setInset] = useState(HEADER_HEIGHT_PX);

  useEffect(() => {
    const update = () => {
      if (!chrome) {
        setInset(HEADER_HEIGHT_PX);
        return;
      }

      if (chrome.chromeConfig.display === 'bar') {
        const headerH = readCssPx('--app-chrome-height') || HEADER_HEIGHT_PX;
        const panelH = chrome.chromeConfig.immersiveShell ? readCssPx('--app-chrome-panel-height') : 0;
        setInset(headerH + panelH);
        return;
      }

      if (chrome.orbPhase !== 'collapsed') {
        const headerH = readCssPx('--app-chrome-height') || HEADER_HEIGHT_PX;
        const panelH = readCssPx('--app-chrome-panel-height');
        setInset(headerH + panelH);
        return;
      }
      setInset(getOrbCollapsedClearancePx());
    };
    update();
    const ro =
      typeof ResizeObserver !== 'undefined' && typeof document !== 'undefined'
        ? new ResizeObserver(update)
        : null;
    if (ro && document.documentElement) {
      ro.observe(document.documentElement);
    }
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [
    chrome?.chromeConfig.display,
    chrome?.chromeConfig.immersiveShell,
    chrome?.orbPhase,
    chrome?.expanded,
  ]);

  return inset;
}
