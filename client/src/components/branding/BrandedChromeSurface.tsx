import React from 'react';
import type { Organization } from '../../types';
import { useBrandingStyles } from '../../hooks/useBrandingStyles';
import { HeaderFooterBackground } from '../HeaderFooterBackground';
import type { PerformanceTier } from '../../hooks/useDevicePerformance';
import { NAVIGATION, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export type BrandedChromeVariant = 'bar' | 'orb';

export interface BrandedChromeSurfaceProps {
  variant: BrandedChromeVariant;
  organization: Organization | null;
  inOrgTerritory: boolean;
  performanceTier: PerformanceTier;
  className?: string;
  /** Extra classes on the background wrapper */
  surfaceClassName?: string;
  /** When true, lub-dub pulse on background layer (high tier + motion only) */
  enableHeartbeat?: boolean;
  /** Pulse intensity: relaxed for bar, strong for orb */
  heartbeatPreset?: 'relaxed' | 'strong';
  /** Override default opacity (orb=100, bar=60) — use 100 for expanded opaque chrome */
  surfaceOpacity?: number;
  children?: React.ReactNode;
}

export function BrandedChromeSurface({
  variant,
  organization,
  inOrgTerritory,
  performanceTier,
  className,
  surfaceClassName,
  enableHeartbeat = true,
  heartbeatPreset = 'relaxed',
  surfaceOpacity,
  children,
}: BrandedChromeSurfaceProps) {
  const opacity = surfaceOpacity ?? (variant === 'orb' ? 100 : 60);
  const brandingStyles = useBrandingStyles(organization, inOrgTerritory, {
    defaultTextColor: 'var(--foreground)',
    backdropBlur: 'blur(4px)',
    opacity,
  });

  const brandingColor =
    inOrgTerritory && organization?.brandingColor ? organization.brandingColor : undefined;

  return (
    <div
      className={cn(
        'overflow-hidden',
        variant === 'orb' && cn(RADIUS.pill, 'relative'),
        variant === 'bar' && cn(NAVIGATION.header.minHeight, 'relative w-full'),
        className
      )}
    >
      <div className={cn('absolute inset-0', surfaceClassName)} aria-hidden>
        <HeaderFooterBackground
          variant="header"
          brandingColor={brandingColor}
          performanceTier={performanceTier}
          enableHeartbeat={enableHeartbeat}
          heartbeatPreset={heartbeatPreset}
          overlayStyle={brandingStyles.backgroundStyle}
        />
      </div>
      {children ? (
        <div
          className={cn(
            'relative z-10 min-w-0',
            variant === 'orb' && 'flex h-full w-full items-stretch'
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
