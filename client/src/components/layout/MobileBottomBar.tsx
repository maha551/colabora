import { useTranslation } from 'react-i18next';
import type { User, Organization } from '../../types';
import type { BrandingStyles } from '../../hooks/useBrandingStyles';
import { useDevicePerformance } from '../../hooks/useDevicePerformance';
import { useIsMobile } from '../../contexts/ScreenSizeContext';
import { MOBILE_CHROME, TOUCH_TARGETS, Z_INDEX } from '../../lib/designSystem';
import { HeaderFooterBackground } from '../HeaderFooterBackground';
import {
  PRIMARY_NAV_ITEMS,
  PRIMARY_NAV_STYLES,
  type PrimaryNavHandlerKey,
  type PrimaryNavI18nKey,
} from '../../lib/navItems';
import type { PendingInvitationItem } from '../../hooks/usePendingInvitations';
import type { AppView } from '../../types';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';
import { HeaderChromeUserMenu, HeaderCreateButton } from './headerChromeShared';

export interface MobileBottomBarProps {
  currentView: AppView;
  onShowActivity: () => void;
  onShowDocuments: () => void;
  onShowOrganizations: () => void;
  onShowSearch?: () => void;
  pendingInvitationCount?: number;
  currentUser: User | null;
  onLogout: () => void;
  onShowProfile?: () => void;
  onShowSettings?: () => void;
  onShowAdmin?: () => void;
  onShowReportIssue?: () => void;
  showCreateButton?: boolean;
  onCreateDocument?: () => void;
  organization?: Organization | null;
  organizations?: Organization[];
  isSingleOrg?: boolean;
  onSelectOrganization?: (organization: Organization) => void;
  brandingStyles: BrandingStyles;
  pendingInvitations?: PendingInvitationItem[];
  onAcceptInvitationById?: (invitationId: string) => void | Promise<void>;
  onDeclineInvitationById?: (invitationId: string) => void | Promise<void>;
  onRefreshPendingInvitations?: () => void | Promise<void>;
}

function isNavItemActive(itemView: AppView, currentView: AppView): boolean {
  if (currentView === itemView) return true;
  if (itemView === 'organizations' && currentView === 'organization') return true;
  if (itemView === 'documents' && currentView === 'document') return true;
  return false;
}

const MOBILE_NAV_LABEL_SHORT: Partial<Record<PrimaryNavI18nKey, PrimaryNavI18nKey>> = {
  activityFeed: 'activityFeedShort',
  documents: 'documentsShort',
  organizations: 'organizationsShort',
};

export function MobileBottomBar({
  currentView,
  onShowActivity,
  onShowDocuments,
  onShowOrganizations,
  onShowSearch,
  pendingInvitationCount = 0,
  currentUser,
  onLogout,
  onShowProfile,
  onShowSettings,
  onShowAdmin,
  onShowReportIssue,
  showCreateButton = false,
  onCreateDocument,
  organization,
  organizations = [],
  isSingleOrg = false,
  onSelectOrganization,
  brandingStyles,
  pendingInvitations = [],
  onAcceptInvitationById,
  onDeclineInvitationById,
  onRefreshPendingInvitations,
}: MobileBottomBarProps) {
  const { t } = useTranslation('nav');
  const performanceTier = useDevicePerformance();
  const isMobile = useIsMobile();

  const brandingColor = brandingStyles.useBranding
    ? brandingStyles.backgroundColor
    : undefined;

  const handlers: Record<PrimaryNavHandlerKey, (() => void) | undefined> = {
    onShowActivity,
    onShowDocuments,
    onShowOrganizations,
    onShowSearch,
  };

  const navLabel = t('primaryNav.aria', { defaultValue: 'Primary navigation' });

  return (
    <nav
      role="navigation"
      aria-label={navLabel}
      className={cn(
        'fixed inset-x-0 bottom-0 flex items-stretch overflow-hidden border-t touch-manipulation',
        PRIMARY_NAV_STYLES.rail.border,
        Z_INDEX.sticky
      )}
      style={{
        ...brandingStyles.backgroundStyle,
        backgroundColor:
          brandingStyles.backgroundStyle.backgroundColor ||
          'color-mix(in srgb, var(--background) 60%, transparent)',
        color: brandingStyles.textColor,
        borderColor: brandingStyles.borderColor,
        minHeight: MOBILE_CHROME.barHeight,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <HeaderFooterBackground
        variant="footer"
        brandingColor={brandingColor}
        performanceTier={performanceTier}
      />
      <div className="relative z-10 flex w-full items-stretch">
      {PRIMARY_NAV_ITEMS.map((item) => {
        const handler = handlers[item.handlerKey];
        if (!handler) return null;

        const active = isNavItemActive(item.view, currentView);
        const labelKey = (isMobile && MOBILE_NAV_LABEL_SHORT[item.i18nKey]) || item.i18nKey;
        const navItemLabel = t(labelKey);

        return (
          <button
            key={item.id}
            type="button"
            onClick={handler}
            aria-current={active ? 'page' : undefined}
            aria-label={navItemLabel}
            className={cn(
              'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              TOUCH_TARGETS.minHeight,
              PRIMARY_NAV_STYLES.item.base,
              PRIMARY_NAV_STYLES.itemRadius,
              active ? PRIMARY_NAV_STYLES.item.active : PRIMARY_NAV_STYLES.item.idle
            )}
          >
            <Icon
              name={item.icon}
              className={active ? PRIMARY_NAV_STYLES.iconActive : PRIMARY_NAV_STYLES.icon}
              aria-hidden
            />
            {item.id === 'organizations' && pendingInvitationCount > 0 && (
              <span
                className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-destructive ring-1 ring-background"
                aria-label={t('pendingInvitationsNavIndicator', {
                  count: pendingInvitationCount,
                  defaultValue: `${pendingInvitationCount} pending invitation${pendingInvitationCount === 1 ? '' : 's'}`,
                })}
              />
            )}
            <span
              className={cn(
                'max-w-full truncate text-center text-[10px] leading-tight sm:text-xs',
                'max-[359px]:sr-only',
                active ? PRIMARY_NAV_STYLES.labelActive : PRIMARY_NAV_STYLES.labelInactive
              )}
            >
              {navItemLabel}
            </span>
          </button>
        );
      })}

      {showCreateButton && onCreateDocument && (
        <div className={cn('flex shrink-0 items-center px-1', TOUCH_TARGETS.minHeight)}>
          <HeaderCreateButton onCreateDocument={onCreateDocument} compact />
        </div>
      )}

      {currentUser && (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center px-2',
            TOUCH_TARGETS.minHeight,
            TOUCH_TARGETS.minWidth
          )}
        >
          <HeaderChromeUserMenu
            currentUser={currentUser}
            onLogout={onLogout}
            onShowActivity={onShowActivity}
            onShowProfile={onShowProfile}
            onShowSettings={onShowSettings}
            onShowDocuments={onShowDocuments}
            onShowOrganizations={onShowOrganizations}
            onShowAdmin={onShowAdmin}
            onShowSearch={onShowSearch}
            onShowReportIssue={onShowReportIssue}
            organizations={organizations}
            activeOrganization={organization}
            isSingleOrg={isSingleOrg}
            onSelectOrganization={onSelectOrganization}
            brandingStyles={brandingStyles}
            pendingInvitations={pendingInvitations}
            onAcceptInvitationById={onAcceptInvitationById}
            onDeclineInvitationById={onDeclineInvitationById}
            onRefreshPendingInvitations={onRefreshPendingInvitations}
          />
        </div>
      )}
      </div>
    </nav>
  );
}
