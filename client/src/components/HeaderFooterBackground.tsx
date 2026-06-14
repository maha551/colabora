import React from 'react';
import './HeaderFooterBackground.css';
import { useDevicePerformance, type PerformanceTier } from '../hooks/useDevicePerformance';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

interface HeaderFooterBackgroundProps {
  /** 'header' or 'footer' - determines which background to render */
  variant: 'header' | 'footer';
  /** Organization branding color for heartbeat layer */
  brandingColor?: string;
  /** Performance tier override. If not provided, auto-detects based on device capabilities */
  performanceTier?: PerformanceTier;
  /** When true, render lub-dub pulse on heartbeat layer (high tier + motion only) */
  enableHeartbeat?: boolean;
  /** Pulse intensity preset */
  heartbeatPreset?: 'relaxed' | 'strong';
  /** Optional overlay styles (backgroundColor, backdropFilter, backgroundImage, backgroundBlendMode) - applied only to this overlay so header background is no larger than the overlay */
  overlayStyle?: React.CSSProperties;
}

/**
 * Optimized background component that renders separate backgrounds for header and footer.
 * This approach is much more performant than a full-screen background because:
 * 1. Much smaller elements (64-80px height vs full screen)
 * 2. No background in scrollable content area = no scroll performance impact
 * 3. Can optimize each separately
 * 4. Uses absolute positioning relative to header/footer instead of fixed
 */
export function HeaderFooterBackground({
  variant,
  brandingColor,
  performanceTier: providedTier,
  enableHeartbeat = true,
  heartbeatPreset = 'relaxed',
  overlayStyle,
}: HeaderFooterBackgroundProps) {
  const detectedTier = useDevicePerformance();
  const performanceTier = providedTier || detectedTier;
  const reducedMotion = usePrefersReducedMotion();

  const performanceClass = `header-footer-bg--${performanceTier}-performance`;
  const variantClass = `header-footer-bg--${variant}`;
  const showHeartbeat =
    performanceTier === 'high' && enableHeartbeat && !reducedMotion;

  return (
    <div
      className={`header-footer-bg ${variantClass} ${performanceClass}`}
      aria-hidden="true"
      style={overlayStyle}
    >
      <div className="header-footer-bg-layer layer-1" />
      {performanceTier === 'high' && (
        <div className="header-footer-bg-layer layer-2" />
      )}
      {showHeartbeat && (
        <div
          className={`header-footer-bg-layer layer-heartbeat heartbeat--${heartbeatPreset}`}
          style={
            brandingColor
              ? {
                  background: `radial-gradient(circle at 50% 50%, ${brandingColor} 0%, transparent 70%)`,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
