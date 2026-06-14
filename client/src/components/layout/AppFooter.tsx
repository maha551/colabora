import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../../contexts/ScreenSizeContext';
import { SPACING, NAVIGATION } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { AppLogo } from '../shared/AppLogo';
import { Organization } from '../../types';
import { useTerritoryContext } from '../../hooks/useTerritoryContext';
import { useBrandingStyles } from '../../hooks/useBrandingStyles';
import { HeaderFooterBackground } from '../HeaderFooterBackground';
import { useDevicePerformance } from '../../hooks/useDevicePerformance';
import { SiteFooterLinks } from '../info/SiteFooterLinks';

interface AppFooterProps {
  organization?: Organization | null;
  organizations?: Organization[];
  isSingleOrg?: boolean;
}

export function AppFooter({
  organization,
  organizations = [],
  isSingleOrg = false,
}: AppFooterProps) {
  const { t } = useTranslation('nav');
  const isMobile = useIsMobile();
  const performanceTier = useDevicePerformance();
  
  // Use centralized territory context hook
  const { inOrgTerritory, organization: contextOrganization } = useTerritoryContext();
  // Use organization from props if provided, otherwise from context
  const activeOrganization = organization ?? contextOrganization;
  
  // Get branding color for background
  const brandingColor = inOrgTerritory && activeOrganization?.brandingColor 
    ? activeOrganization.brandingColor 
    : undefined;
  
  // Use centralized branding styles hook with footer-specific options
  // Aligned with header: same blur (4px) and opacity (60%) for consistency
  const brandingStyles = useBrandingStyles(activeOrganization, inOrgTerritory, {
    defaultTextColor: 'var(--foreground)',
    backdropBlur: 'blur(4px)',
    opacity: 60, // Aligned with header for visual consistency
  });
  
  return (
    <footer
      role="contentinfo"
      className={cn(
        'w-full shrink-0 overflow-hidden',
        NAVIGATION.footer.responsiveHeight,
        NAVIGATION.footer.shadow
      )}
      style={{
        ...brandingStyles.backgroundStyle,
        backgroundColor: brandingStyles.backgroundStyle.backgroundColor 
          || 'color-mix(in srgb, var(--background) 60%, transparent)',
        color: brandingStyles.textColor,
        paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0)' : undefined,
      }}
    >
      {/* Optimized footer background - separate from full-screen background */}
      <HeaderFooterBackground 
        variant="footer"
        brandingColor={brandingColor}
        performanceTier={performanceTier}
      />
      <div className={cn('flex flex-col items-center justify-center h-full relative z-10 min-w-0', SPACING.card.padding)}>
        <AppLogo size="sm" variant="monochrome" className="mb-2" />
        <div 
          className={cn('text-xs md:text-sm font-light', SPACING.tight.gap)}
          style={{
            color: brandingStyles.useBranding ? brandingStyles.textColor : 'var(--muted-foreground)',
            letterSpacing: '0.05em',
          }}
        >
          {brandingStyles.useBranding && activeOrganization?.brandingTitle 
            ? activeOrganization.brandingTitle 
            : t('democraticIntelligence')}
        </div>
        <SiteFooterLinks
          isAuthenticated
          className="mt-2 md:mt-3"
          style={
            brandingStyles.useBranding
              ? ({ color: brandingStyles.textColor } satisfies CSSProperties)
              : undefined
          }
        />
      </div>
    </footer>
  );
}
