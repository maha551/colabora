import { useMemo } from 'react';
import type { User, Organization } from '../../types';
import { useAppChrome } from '../../contexts/AppChromeContext';
import { useTerritoryContext } from '../../hooks/useTerritoryContext';
import { useBrandingStyles } from '../../hooks/useBrandingStyles';
import { useDevicePerformance } from '../../hooks/useDevicePerformance';
import { NAVIGATION, SPACING } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { HeaderFooterBackground } from '../HeaderFooterBackground';
import { HeaderBackButton, HeaderCreateButton } from './headerChromeShared';

export interface MobilePageTitleProps {
  title?: string;
  focusTitleOverride?: string | null;
  showBackButton?: boolean;
  onBack?: () => void;
  showCreateButton?: boolean;
  onCreateDocument?: () => void;
  organization?: Organization | null;
  currentUser: User | null;
}

export function MobilePageTitle({
  title,
  focusTitleOverride,
  showBackButton = false,
  onBack,
  showCreateButton = false,
  onCreateDocument,
  organization,
  currentUser,
}: MobilePageTitleProps) {
  const { focusTitle } = useAppChrome();
  const performanceTier = useDevicePerformance();
  const { inOrgTerritory, organization: contextOrganization } = useTerritoryContext();
  const activeOrganization = organization ?? contextOrganization;

  const shouldUseBranding = useMemo(() => {
    if (inOrgTerritory) return true;
    if (activeOrganization?.brandingColor && organization) return true;
    return false;
  }, [inOrgTerritory, activeOrganization, organization]);

  const brandingStyles = useBrandingStyles(activeOrganization, shouldUseBranding, {
    defaultTextColor: 'var(--foreground)',
    backdropBlur: 'blur(4px)',
    opacity: 60,
  });

  const brandingColor = shouldUseBranding ? brandingStyles.backgroundColor : undefined;

  const backButtonPosition = currentUser?.preferences?.backButtonPosition || 'left';
  const shouldReorderBack = backButtonPosition === 'right';

  const displayTitle =
    focusTitle ||
    focusTitleOverride ||
    (activeOrganization
      ? activeOrganization.brandingTitle || activeOrganization.name || title
      : title);

  if (!displayTitle && !showBackButton && !(showCreateButton && onCreateDocument)) {
    return null;
  }

  const backButton =
    showBackButton && onBack ? (
      <HeaderBackButton onBack={onBack} brandingStyles={brandingStyles} />
    ) : null;

  return (
    <div
      className={cn(
        'sticky top-0 z-10 mb-2 overflow-hidden border-b border-border/50 md:hidden',
        SPACING.page.x
      )}
      style={{
        ...brandingStyles.backgroundStyle,
        backgroundColor:
          brandingStyles.backgroundStyle.backgroundColor ||
          'color-mix(in srgb, var(--background) 60%, transparent)',
        color: brandingStyles.textColor,
        borderColor: brandingStyles.borderColor,
        paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
      }}
    >
      <HeaderFooterBackground
        variant="header"
        brandingColor={brandingColor}
        performanceTier={performanceTier}
      />
      <div className="relative z-10 flex min-h-11 min-w-0 items-center justify-between gap-3 pb-2">
        <div className={cn('flex min-w-0 flex-1 items-center', SPACING.content.inline)}>
          {!shouldReorderBack && backButton}
          {displayTitle && (
            <h1
              className={cn(NAVIGATION.typography.title, 'min-w-0 truncate font-bold')}
              style={{ color: brandingStyles.textColor }}
            >
              {displayTitle}
            </h1>
          )}
        </div>
        <div className={cn('flex shrink-0 items-center', SPACING.content.inline)}>
          {showCreateButton && onCreateDocument && (
            <HeaderCreateButton onCreateDocument={onCreateDocument} compact />
          )}
          {shouldReorderBack && backButton}
        </div>
      </div>
    </div>
  );
}
