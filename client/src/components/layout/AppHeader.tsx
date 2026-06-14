import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import { User, Organization } from '../../types';
import { useIsMobile } from '../../contexts/ScreenSizeContext';
import {
  SPACING,
  NAVIGATION,
  RADIUS,
  Z_INDEX,
  HEADER_HEIGHT_PX,
  APP_CHROME,
  SHADOWS,
} from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { useTerritoryContext } from '../../hooks/useTerritoryContext';
import { useBrandingStyles } from '../../hooks/useBrandingStyles';
import { BrandedChromeSurface } from '../branding/BrandedChromeSurface';
import { useDevicePerformance } from '../../hooks/useDevicePerformance';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { APP_CHROME_MOTION, getAppChromeMotionMode } from '../../lib/appChromeMotion';
import {
  computeChromeFlipCssVars,
  getExpandedChromeRect,
  type ChromeFlipCssVars,
} from '../../lib/appChromeFlip';
import type { ChromeAnchor, ChromeDisplay } from '../../lib/chromeMode';
import type { PendingInvitationItem } from '../../hooks/usePendingInvitations';
import { PRIMARY_NAV_RAIL_WIDTH_PX } from '../../lib/navItems';
import { useAppChrome } from '../../contexts/AppChromeContext';
import type { OrbPhase } from '../../contexts/AppChromeContext';
import { Icon } from '../ui/Icon';
import { AppLogo } from '../shared/AppLogo';
import { AppHeaderBarContent } from './AppHeaderBarContent';
import './app-chrome.css';

export interface AppHeaderProps {
  currentUser: User | null;
  onLogout: () => void;
  onShowActivity?: () => void;
  onShowProfile?: () => void;
  onShowSettings?: () => void;
  onShowDocuments?: () => void;
  onShowOrganizations?: () => void;
  onShowAdmin?: () => void;
  onShowSearch?: () => void;
  onShowReportIssue?: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
  title?: string;
  onCreateDocument?: () => void;
  showCreateButton?: boolean;
  organization?: Organization | null;
  organizations?: Organization[];
  isSingleOrg?: boolean;
  onSelectOrganization?: (organization: Organization) => void;
  pendingInvitations?: PendingInvitationItem[];
  onAcceptInvitationById?: (invitationId: string) => void | Promise<void>;
  onDeclineInvitationById?: (invitationId: string) => void | Promise<void>;
  onRefreshPendingInvitations?: () => void | Promise<void>;
  chromeDisplay?: ChromeDisplay;
  chromeAnchor?: ChromeAnchor;
  /** When true (desktop + primary nav rail), header stays in the content column instead of spanning the full viewport. */
  containedLayout?: boolean;
  /** When true, fixed chrome is inset to clear the primary nav rail on the left. */
  primaryNavRailInset?: boolean;
  /** When true on mobile bar routes, header is hidden (unified bottom bar + in-content title). */
  suppressMobileBar?: boolean;
}

function resolveShellPhaseClass(orbPhase: OrbPhase): string {
  if (orbPhase === 'collapsed') {
    return 'app-chrome-shell--collapsed';
  }
  return 'app-chrome-shell--expanded-bar';
}

function getFallbackOrbRect(anchor: ChromeAnchor, orbSizePx: number): DOMRect {
  if (typeof window === 'undefined') {
    return new DOMRect(0, 0, orbSizePx, orbSizePx);
  }
  const left = (window.innerWidth - orbSizePx) / 2;
  if (anchor === 'bottom') {
    const expanded = getExpandedChromeRect('bottom');
    return new DOMRect(left, expanded.top + (expanded.height - orbSizePx) / 2, orbSizePx, orbSizePx);
  }
  const topOffset = 8;
  return new DOMRect(left, topOffset, orbSizePx, orbSizePx);
}

function resolveMotionClass(orbPhase: OrbPhase, motionMode: ReturnType<typeof getAppChromeMotionMode>): string {
  if (orbPhase === 'opening') {
    if (motionMode === 'full') return 'app-chrome-shell--opening app-chrome-motion-full';
    if (motionMode === 'fade') return 'app-chrome-shell--opening app-chrome-motion-fade';
    return '';
  }
  if (orbPhase === 'closing') {
    if (motionMode === 'full') return 'app-chrome-shell--closing app-chrome-motion-full';
    if (motionMode === 'fade') return 'app-chrome-shell--closing app-chrome-motion-fade';
    return '';
  }
  return '';
}

export function AppHeader({
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
  onCreateDocument,
  showCreateButton = false,
  organization,
  organizations = [],
  isSingleOrg = false,
  onSelectOrganization,
  pendingInvitations = [],
  onAcceptInvitationById,
  onDeclineInvitationById,
  onRefreshPendingInvitations,
  chromeDisplay = 'bar',
  chromeAnchor = 'top',
  containedLayout = false,
  primaryNavRailInset = false,
  suppressMobileBar = false,
}: AppHeaderProps) {
  const { t: tNav } = useTranslation('nav');
  const isMobile = useIsMobile();
  const performanceTier = useDevicePerformance();
  const reducedMotion = usePrefersReducedMotion();
  const motionMode = getAppChromeMotionMode(performanceTier, reducedMotion);

  const {
    orbPhase,
    expanded,
    focusTitle,
    chromeConfig,
    openOrb,
    openOrbImmediate,
    closeOrb,
    closeOrbImmediate,
    onOrbOpenAnimationEnd,
    onOrbCloseAnimationEnd,
    registerOrbTrigger,
  } = useAppChrome();

  const { inOrgTerritory, organization: contextOrganization } = useTerritoryContext();
  const activeOrganization = organization ?? contextOrganization;

  const shouldUseBranding = useMemo(() => {
    if (inOrgTerritory) return true;
    if (activeOrganization?.brandingColor && organization) return true;
    return false;
  }, [inOrgTerritory, activeOrganization, organization]);

  const barBrandingStyles = useBrandingStyles(activeOrganization, shouldUseBranding, {
    defaultTextColor: 'var(--foreground)',
    backdropBlur: 'blur(4px)',
    opacity: 60,
  });

  const orbExpandedBrandingStyles = useBrandingStyles(activeOrganization, shouldUseBranding, {
    defaultTextColor: 'var(--foreground)',
    backdropBlur: 'blur(4px)',
    opacity: 100,
  });

  const brandingStyles =
    chromeDisplay === 'orb' && expanded ? orbExpandedBrandingStyles : barBrandingStyles;

  const displayTitle =
    (chromeDisplay === 'orb' && expanded && focusTitle) ||
    (activeOrganization
      ? activeOrganization.brandingTitle || activeOrganization.name || title
      : title);

  const backButtonPosition = currentUser?.preferences?.backButtonPosition || 'left';
  const shouldReorderOnMobile = isMobile && backButtonPosition === 'right';
  const titleId = useId();

  const shellRef = useRef<HTMLDivElement>(null);
  const orbTriggerRef = useRef<HTMLButtonElement>(null);
  const collapsedOrbRectRef = useRef<DOMRect | null>(null);
  const [flipStyle, setFlipStyle] = useState<ChromeFlipCssVars | null>(null);
  const isCollapsedOrb = orbPhase === 'collapsed';
  const isFlipMorph = motionMode === 'full' && (orbPhase === 'opening' || orbPhase === 'closing');
  const isExpandedChrome = orbPhase !== 'collapsed';

  useEffect(() => {
    registerOrbTrigger(orbTriggerRef.current);
    return () => registerOrbTrigger(null);
  }, [registerOrbTrigger, orbPhase]);

  const prepareFlipStyle = useCallback(
    (from: DOMRect, to: DOMRect) => {
      setFlipStyle(computeChromeFlipCssVars(from, to));
    },
    []
  );

  const handleOpenOrb = useCallback(() => {
    if (motionMode === 'static') {
      openOrbImmediate();
      return;
    }
    if (shellRef.current) {
      collapsedOrbRectRef.current = shellRef.current.getBoundingClientRect();
    }
    openOrb();
  }, [motionMode, openOrb, openOrbImmediate]);

  const handleCloseOrb = useCallback(() => {
    if (motionMode === 'static') {
      closeOrbImmediate();
      return;
    }
    closeOrb();
  }, [closeOrb, closeOrbImmediate, motionMode]);

  useLayoutEffect(() => {
    if (motionMode !== 'full') return;

    if (orbPhase === 'opening') {
      const orb =
        collapsedOrbRectRef.current ??
        shellRef.current?.getBoundingClientRect() ??
        getFallbackOrbRect(chromeAnchor, APP_CHROME.orbSizePx);
      prepareFlipStyle(orb, getExpandedChromeRect(chromeAnchor));
      return;
    }

    if (orbPhase === 'closing') {
      const expanded =
        shellRef.current?.getBoundingClientRect() ?? getExpandedChromeRect(chromeAnchor);
      const orb =
        collapsedOrbRectRef.current ?? getFallbackOrbRect(chromeAnchor, APP_CHROME.orbSizePx);
      prepareFlipStyle(orb, expanded);
    }
  }, [chromeAnchor, motionMode, orbPhase, prepareFlipStyle]);

  const updateChromeHeight = useCallback(() => {
    if (typeof document === 'undefined') return;
    const el = shellRef.current;
    if (chromeDisplay !== 'orb' || !isExpandedChrome || !el) {
      if (chromeDisplay === 'orb' && orbPhase === 'collapsed') {
        document.documentElement.style.removeProperty('--app-chrome-height');
      }
      return;
    }
    const height = el.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--app-chrome-height', `${Math.ceil(height)}px`);
  }, [chromeDisplay, orbPhase, isExpandedChrome]);

  useEffect(() => {
    if (chromeDisplay !== 'orb' || orbPhase !== 'opening' || typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--app-chrome-height', `${HEADER_HEIGHT_PX}px`);
  }, [chromeDisplay, orbPhase]);

  useEffect(() => {
    updateChromeHeight();
    if (!isExpandedChrome || !shellRef.current) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateChromeHeight) : null;
    if (ro && shellRef.current) ro.observe(shellRef.current);
    return () => ro?.disconnect();
  }, [orbPhase, updateChromeHeight, isExpandedChrome]);

  useEffect(() => {
    if (chromeDisplay !== 'orb' || !expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (motionMode === 'static') closeOrbImmediate();
        else handleCloseOrb();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [chromeDisplay, expanded, closeOrbImmediate, handleCloseOrb, motionMode]);

  useEffect(() => {
    if (chromeDisplay !== 'orb' || orbPhase !== 'opening') return;
    const ms =
      motionMode === 'full'
        ? APP_CHROME_MOTION.openFallbackMs
        : motionMode === 'fade'
          ? APP_CHROME_MOTION.fadeOpenMs
          : 0;
    if (ms === 0) return;
    const id = window.setTimeout(onOrbOpenAnimationEnd, ms);
    return () => window.clearTimeout(id);
  }, [chromeDisplay, orbPhase, motionMode, onOrbOpenAnimationEnd]);

  useEffect(() => {
    if (chromeDisplay !== 'orb' || orbPhase !== 'closing') return;
    const ms =
      motionMode === 'full'
        ? APP_CHROME_MOTION.closeFallbackMs
        : motionMode === 'fade'
          ? APP_CHROME_MOTION.fadeCloseMs
          : 0;
    if (ms === 0) return;
    const id = window.setTimeout(onOrbCloseAnimationEnd, ms);
    return () => window.clearTimeout(id);
  }, [chromeDisplay, orbPhase, motionMode, onOrbCloseAnimationEnd]);

  const openAria = tNav('appChrome.openAria', { defaultValue: 'Open menu' });

  const barContentProps = {
    currentUser,
    activeOrganization,
    brandingStyles,
    displayTitle: displayTitle || undefined,
    titleId: chromeDisplay === 'orb' && expanded ? titleId : undefined,
    showBackButton,
    onBack,
    shouldReorderOnMobile,
    isMobile,
    showCreateButton,
    onCreateDocument,
    contentVisible: chromeDisplay === 'bar' || orbPhase === 'expanded',
    onLogout,
    onShowActivity,
    onShowProfile,
    onShowSettings,
    onShowDocuments,
    onShowOrganizations,
    onShowAdmin,
    onShowSearch,
    onShowReportIssue,
    organizations,
    isSingleOrg,
    onSelectOrganization,
    pendingInvitations,
    onAcceptInvitationById,
    onDeclineInvitationById,
    onRefreshPendingInvitations,
  };

  const showOrbHeartbeat =
    chromeDisplay === 'orb' &&
    orbPhase === 'collapsed' &&
    motionMode === 'full' &&
    performanceTier === 'high';

  const orbBottomOffset =
    chromeAnchor === 'bottom' && isMobile && !chromeConfig.hideFooter
      ? `calc(${APP_CHROME.anchorBottomOffset} + ${APP_CHROME.footerClearanceMobile})`
      : APP_CHROME.anchorBottomOffset;

  useLayoutEffect(() => {
    if (orbPhase !== 'collapsed' || !shellRef.current) return;
    collapsedOrbRectRef.current = shellRef.current.getBoundingClientRect();
  }, [orbPhase, chromeAnchor, orbBottomOffset, isMobile, chromeConfig.hideFooter]);

  const wrapperStyle = useMemo(() => {
    if (isExpandedChrome) {
      if (chromeAnchor === 'bottom') {
        return { bottom: 0, top: undefined as undefined };
      }
      return { top: 0, bottom: undefined as undefined };
    }
    if (chromeAnchor === 'bottom') {
      return { bottom: orbBottomOffset, top: undefined as undefined };
    }
    return { top: APP_CHROME.anchorTopOffset, bottom: undefined as undefined };
  }, [chromeAnchor, isExpandedChrome, orbBottomOffset]);

  const shellStyle = useMemo((): CSSProperties => {
    const base: CSSProperties = {
      ['--app-orb-size' as string]: `${APP_CHROME.orbSizePx}px`,
      ['--app-header-height' as string]: `${HEADER_HEIGHT_PX}px`,
    };
    if (isFlipMorph && flipStyle) {
      return { ...base, ...flipStyle };
    }
    return base;
  }, [flipStyle, isFlipMorph]);

  const chromeHorizontalInset =
    !isMobile && primaryNavRailInset
      ? { left: `${PRIMARY_NAV_RAIL_WIDTH_PX}px`, right: 0 }
      : undefined;

  if (chromeDisplay === 'bar') {
    if (isMobile && suppressMobileBar) {
      return null;
    }

    const headerClasses = isMobile
      ? cn(NAVIGATION.header.mobilePosition, 'left-0 right-0', Z_INDEX.chrome, NAVIGATION.header.mobileShadow)
      : containedLayout
        ? cn(
            'sticky top-0 shrink-0 pt-[env(safe-area-inset-top,0px)] min-h-[calc(3.5rem+env(safe-area-inset-top,0px))]',
            Z_INDEX.chrome,
            NAVIGATION.header.desktopShadow,
            NAVIGATION.header.height,
            'border-b border-border/50 bg-card/80 backdrop-blur-sm'
          )
        : cn(
            NAVIGATION.header.desktopPosition,
            primaryNavRailInset ? 'right-0' : 'left-0 right-0',
            Z_INDEX.chrome,
            NAVIGATION.header.desktopShadow,
            NAVIGATION.header.height,
            'border-b border-border/50 backdrop-blur-sm'
          );

    return (
      <div
        className={cn(headerClasses, 'overflow-hidden')}
        style={{
          ...barBrandingStyles.backgroundStyle,
          backgroundColor:
            barBrandingStyles.backgroundStyle.backgroundColor ||
            'color-mix(in srgb, var(--background) 60%, transparent)',
          color: barBrandingStyles.textColor,
          borderColor: barBrandingStyles.borderColor,
          paddingBottom: isMobile ? 'env(safe-area-inset-bottom)' : undefined,
          paddingTop: !isMobile && !containedLayout ? 'env(safe-area-inset-top, 0px)' : undefined,
          ...chromeHorizontalInset,
        }}
      >
        <BrandedChromeSurface
          variant="bar"
          organization={activeOrganization}
          inOrgTerritory={shouldUseBranding}
          performanceTier={performanceTier}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <div
          className={cn(
            'relative z-10 min-w-0',
            containedLayout ? cn('w-full', SPACING.page.x) : cn('mx-auto max-w-4xl', SPACING.page.x)
          )}
        >
          <AppHeaderBarContent {...barContentProps} />
        </div>
      </div>
    );
  }

  const shellPhaseClass = resolveShellPhaseClass(orbPhase);
  const motionClass = resolveMotionClass(orbPhase, motionMode);

  const handleAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const { animationName } = e;
    if (
      orbPhase === 'opening' &&
      (animationName.includes('app-chrome-flip-open') || animationName.includes('app-chrome-fade-open'))
    ) {
      setFlipStyle(null);
      onOrbOpenAnimationEnd();
    }
    if (
      orbPhase === 'closing' &&
      (animationName.includes('app-chrome-flip-close') || animationName.includes('app-chrome-fade-close'))
    ) {
      setFlipStyle(null);
      onOrbCloseAnimationEnd();
    }
  };

  const showOrbMorphLayer = isFlipMorph;
  const showBarChrome = !isCollapsedOrb;

  const renderOrbGlyph = () =>
    shouldUseBranding && activeOrganization ? (
      <AppLogo size="sm" variant="monochrome" className="pointer-events-none shrink-0" />
    ) : (
      <Icon
        name="Menu"
        className="h-5 w-5 shrink-0 pointer-events-none"
        style={{ color: barBrandingStyles.textColor }}
        aria-hidden
      />
    );

  const orbWrapperClass = cn(
    'pointer-events-none fixed',
    primaryNavRailInset && !isMobile ? 'right-0' : 'inset-x-0',
    isExpandedChrome ? '' : 'flex justify-center',
    Z_INDEX.chrome
  );

  return (
    <div className={orbWrapperClass} style={{ ...wrapperStyle, ...chromeHorizontalInset }}>
        <div
          ref={shellRef}
          className={cn(
            'app-chrome-shell flex flex-col shadow-lg',
            SHADOWS.sm,
            chromeAnchor === 'bottom' && 'app-chrome-shell--anchor-bottom',
            shellPhaseClass,
            motionClass,
            'pointer-events-auto'
          )}
          style={shellStyle}
          role={isCollapsedOrb ? undefined : 'banner'}
          aria-labelledby={isCollapsedOrb ? undefined : titleId}
          onAnimationEnd={handleAnimationEnd}
        >
          <BrandedChromeSurface
            variant={showBarChrome ? 'bar' : 'orb'}
            organization={activeOrganization}
            inOrgTerritory={shouldUseBranding}
            performanceTier={performanceTier}
            surfaceOpacity={showBarChrome ? 100 : undefined}
            enableHeartbeat={showBarChrome || showOrbHeartbeat}
            heartbeatPreset={showBarChrome ? 'relaxed' : 'strong'}
            className={cn(
              showBarChrome ? 'relative w-full' : 'h-full w-full shadow-lg ring-2 ring-background'
            )}
          >
            {isCollapsedOrb ? (
              <button
                ref={orbTriggerRef}
                type="button"
                className={cn(
                  'flex h-full w-full items-center justify-center',
                  RADIUS.pill,
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  !isMobile && 'transition-transform hover:scale-105'
                )}
                aria-expanded={false}
                aria-haspopup="dialog"
                aria-label={openAria}
                onClick={handleOpenOrb}
              >
                {renderOrbGlyph()}
              </button>
            ) : (
              <>
                {showOrbMorphLayer ? (
                  <div
                    className={cn(
                      'app-chrome-orb-layer',
                      orbPhase === 'opening' && 'app-chrome-orb-layer--opening',
                      orbPhase === 'closing' && 'app-chrome-orb-layer--closing'
                    )}
                    aria-hidden
                  >
                    {renderOrbGlyph()}
                  </div>
                ) : null}
                <div
                  className={cn(
                    'relative z-10 mx-auto min-w-0 max-w-4xl',
                    SPACING.page.x,
                    orbPhase === 'opening' &&
                      (motionMode === 'full' || motionMode === 'fade') &&
                      'app-chrome-content-visible',
                    orbPhase === 'closing' &&
                      (motionMode === 'full' || motionMode === 'fade') &&
                      'app-chrome-content-closing',
                    orbPhase === 'expanded' && 'opacity-100'
                  )}
                >
                  <AppHeaderBarContent {...barContentProps} />
                </div>
              </>
            )}
          </BrandedChromeSurface>
        </div>
    </div>
  );
}
