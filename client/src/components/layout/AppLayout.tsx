import React, { useCallback, useMemo } from 'react';
import { AppHeader } from './AppHeader';
import { AppFooter } from './AppFooter';
import { PrimaryNav } from './PrimaryNav';
import { MobileBottomBar } from './MobileBottomBar';
import { MobilePageTitle } from './MobilePageTitle';
import { User, Organization } from '../../types';
import { useIsMobile } from '../../contexts/ScreenSizeContext';
import { SPACING, APP_CHROME, MOBILE_CHROME } from '../../lib/designSystem';
import { PRIMARY_NAV_RAIL_INSET_CLASS } from '../../lib/navItems';
import { cn } from '../ui/utils';
import { AppChromeProvider, useAppChrome } from '../../contexts/AppChromeContext';
import type { OrbPhase } from '../../contexts/AppChromeContext';
import type { PendingInvitationItem } from '../../hooks/usePendingInvitations';
import type { AppView } from '../../types';
import type { ChromeConfig } from '../../lib/chromeMode';
import { resolveChromeConfig, shouldShowPrimaryNav } from '../../lib/chromeMode';
import { useDevicePerformance } from '../../hooks/useDevicePerformance';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { getAppChromeMotionMode } from '../../lib/appChromeMotion';
import { useTerritoryContext } from '../../hooks/useTerritoryContext';
import { useBrandingStyles } from '../../hooks/useBrandingStyles';

interface AppLayoutProps {
  children: React.ReactNode;
  currentUser: User | null;
  onLogout: () => void;
  onShowActivity: () => void;
  onShowProfile: () => void;
  onShowSettings: () => void;
  onShowDocuments: () => void;
  onShowOrganizations: () => void;
  onShowAdmin?: () => void;
  onShowSearch?: () => void;
  onShowReportIssue?: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
  title?: string;
  showCreateButton?: boolean;
  onCreateDocument?: () => void;
  organization?: Organization | null;
  organizations?: Organization[];
  isSingleOrg?: boolean;
  onSelectOrganization?: (organization: Organization) => void;
  pendingInvitations?: PendingInvitationItem[];
  onAcceptInvitationById?: (invitationId: string) => void | Promise<void>;
  onDeclineInvitationById?: (invitationId: string) => void | Promise<void>;
  onRefreshPendingInvitations?: () => void | Promise<void>;
  currentView: AppView;
  routeHash: string;
  focusTitleOverride?: string | null;
}

function useContentPaddingStyle(
  chromeConfig: ChromeConfig,
  isMobile: boolean,
  orbPhase: OrbPhase | undefined
) {
  return useMemo(() => {
    if (chromeConfig.display === 'orb') {
      const safeEdge = chromeConfig.anchor === 'bottom' ? 'bottom' : 'top';
      const footerClearance =
        chromeConfig.anchor === 'bottom' && isMobile && !chromeConfig.hideFooter
          ? ` + ${APP_CHROME.footerClearanceMobile}`
          : '';
      const collapsedInset = `calc(${APP_CHROME.orbCollapsedClearance}${footerClearance} + env(safe-area-inset-${safeEdge}, 0px))`;
      const expandedInset = `calc(max(${APP_CHROME.orbCollapsedClearance}, var(--app-chrome-height, 0px) + var(--app-chrome-panel-height, 0px)) + env(safe-area-inset-${safeEdge}, 0px))`;
      const inset = orbPhase !== 'collapsed' ? expandedInset : collapsedInset;
      if (chromeConfig.anchor === 'bottom') {
        return { paddingBottom: inset };
      }
      return { paddingTop: inset };
    }
    if (isMobile) {
      if (chromeConfig.unifiedBottomNav) {
        return {
          paddingBottom:
            'calc(var(--mobile-chrome-bottom, 0px) + env(safe-area-inset-bottom, 0px))',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        };
      }
      return {
        paddingBottom:
          'calc(var(--header-height, 3.5rem) + env(safe-area-inset-bottom, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      };
    }
    return undefined;
  }, [
    chromeConfig.display,
    chromeConfig.anchor,
    chromeConfig.hideFooter,
    chromeConfig.unifiedBottomNav,
    isMobile,
    orbPhase,
  ]);
}

function AppLayoutMain({
  children,
  chromeConfig,
  isMobile,
  contentBackgroundColor,
  useDesktopShell,
  mobilePageTitle,
  showUnifiedBottomNav,
}: {
  children: React.ReactNode;
  chromeConfig: ChromeConfig;
  isMobile: boolean;
  contentBackgroundColor: string;
  useDesktopShell: boolean;
  mobilePageTitle: React.ReactNode;
  showUnifiedBottomNav: boolean;
}) {
  const { orbPhase, expanded, closeOrb, closeOrbImmediate } = useAppChrome();
  const performanceTier = useDevicePerformance();
  const reducedMotion = usePrefersReducedMotion();
  const motionMode = getAppChromeMotionMode(performanceTier, reducedMotion);
  const contentPaddingStyle = useContentPaddingStyle(chromeConfig, isMobile, orbPhase);

  const dismissExpandedChrome = useCallback(() => {
    if (chromeConfig.display !== 'orb' || !expanded) return;
    if (motionMode === 'static') closeOrbImmediate();
    else closeOrb();
  }, [chromeConfig.display, closeOrb, closeOrbImmediate, expanded, motionMode]);

  return (
    <div
      className={cn(
        chromeConfig.immersiveShell
          ? 'relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden'
          : 'min-h-0 flex-1 overflow-y-auto',
        chromeConfig.display === 'bar' &&
          !isMobile &&
          !useDesktopShell &&
          SPACING.layout.contentTop,
        chromeConfig.display === 'bar' &&
          isMobile &&
          !showUnifiedBottomNav &&
          SPACING.layout.contentBottomMobile,
        !chromeConfig.immersiveShell && SPACING.layout.containPage,
        SPACING.layout.contentSvgColor
      )}
      style={{
        backgroundColor: contentBackgroundColor,
        ...contentPaddingStyle,
      }}
      onClick={chromeConfig.display === 'orb' && expanded ? dismissExpandedChrome : undefined}
    >
      {mobilePageTitle}
      {children}
    </div>
  );
}

export function AppLayout({
  children,
  currentUser,
  onLogout,
  onShowActivity,
  onShowProfile,
  onShowSettings,
  onShowDocuments,
  onShowOrganizations,
  onShowAdmin,
  onShowSearch,
  onShowReportIssue,
  showBackButton = false,
  onBack,
  title,
  showCreateButton = false,
  onCreateDocument,
  organization,
  organizations = [],
  isSingleOrg = false,
  onSelectOrganization,
  pendingInvitations = [],
  onAcceptInvitationById,
  onDeclineInvitationById,
  onRefreshPendingInvitations,
  currentView,
  routeHash,
  focusTitleOverride,
}: AppLayoutProps) {
  const isMobile = useIsMobile();
  const chromeConfig = useMemo(
    () => resolveChromeConfig({ currentView, hash: routeHash, isMobile }),
    [currentView, routeHash, isMobile]
  );
  const contentBackgroundColor = 'var(--background)';
  const showPrimaryNav = shouldShowPrimaryNav(chromeConfig, isMobile);
  const showUnifiedBottomNav = chromeConfig.unifiedBottomNav && showPrimaryNav;
  const useDesktopShell = showPrimaryNav && !isMobile;

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

  const headerProps = {
    currentUser,
    onLogout,
    onShowActivity,
    onShowProfile,
    onShowSettings,
    onShowDocuments,
    onShowOrganizations,
    onShowAdmin,
    onShowSearch,
    onShowReportIssue,
    showBackButton,
    onBack,
    title,
    showCreateButton,
    onCreateDocument,
    organization,
    organizations,
    isSingleOrg,
    onSelectOrganization,
    pendingInvitations,
    onAcceptInvitationById,
    onDeclineInvitationById,
    onRefreshPendingInvitations,
    chromeDisplay: chromeConfig.display,
    chromeAnchor: chromeConfig.anchor,
    containedLayout: useDesktopShell,
    primaryNavRailInset: useDesktopShell,
    suppressMobileBar: showUnifiedBottomNav,
  };

  const primaryNavProps = {
    currentView,
    onShowActivity,
    onShowDocuments,
    onShowOrganizations,
    onShowSearch,
    pendingInvitationCount: pendingInvitations.length,
  };

  const mobilePageTitle = showUnifiedBottomNav ? (
    <MobilePageTitle
      title={title}
      focusTitleOverride={focusTitleOverride}
      showBackButton={showBackButton}
      onBack={onBack}
      showCreateButton={showCreateButton}
      onCreateDocument={onCreateDocument}
      organization={organization}
      currentUser={currentUser}
    />
  ) : null;

  return (
    <AppChromeProvider chromeConfig={chromeConfig} focusTitleOverride={focusTitleOverride}>
      <div
        className={cn(
          'flex flex-col',
          chromeConfig.immersiveShell
            ? 'h-[100dvh] max-h-[100dvh] overflow-hidden'
            : 'min-h-[100dvh]',
          useDesktopShell && PRIMARY_NAV_RAIL_INSET_CLASS,
          showUnifiedBottomNav && MOBILE_CHROME.shellClass,
          SPACING.layout.containPage
        )}
      >
        {useDesktopShell && <PrimaryNav {...primaryNavProps} />}

        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col',
            chromeConfig.immersiveShell && 'min-h-0 overflow-hidden'
          )}
        >
          <AppHeader {...headerProps} />

          {showUnifiedBottomNav && (
            <MobileBottomBar
              {...primaryNavProps}
              currentUser={currentUser}
              onLogout={onLogout}
              onShowProfile={onShowProfile}
              onShowSettings={onShowSettings}
              onShowAdmin={onShowAdmin}
              onShowReportIssue={onShowReportIssue}
              showCreateButton={showCreateButton}
              onCreateDocument={onCreateDocument}
              organization={organization}
              organizations={organizations}
              isSingleOrg={isSingleOrg}
              onSelectOrganization={onSelectOrganization}
              brandingStyles={brandingStyles}
              pendingInvitations={pendingInvitations}
              onAcceptInvitationById={onAcceptInvitationById}
              onDeclineInvitationById={onDeclineInvitationById}
              onRefreshPendingInvitations={onRefreshPendingInvitations}
            />
          )}

          <AppLayoutMain
            chromeConfig={chromeConfig}
            isMobile={isMobile}
            contentBackgroundColor={contentBackgroundColor}
            useDesktopShell={useDesktopShell}
            mobilePageTitle={mobilePageTitle}
            showUnifiedBottomNav={showUnifiedBottomNav}
          >
            {children}
          </AppLayoutMain>

          {!chromeConfig.hideFooter && (
            <div
              className={cn(
                'shrink-0',
                useDesktopShell && 'border-t border-border/50',
                showUnifiedBottomNav && MOBILE_CHROME.footerSpacerClass
              )}
            >
              <AppFooter
                organization={organization}
                organizations={organizations}
                isSingleOrg={isSingleOrg}
              />
            </div>
          )}
        </div>
      </div>
    </AppChromeProvider>
  );
}
