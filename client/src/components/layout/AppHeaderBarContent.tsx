import type { User, Organization } from '../../types';
import type { PendingInvitationItem } from '../../hooks/usePendingInvitations';
import type { BrandingStyles } from '../../hooks/useBrandingStyles';
import { SPACING, NAVIGATION, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import {
  HeaderBackButton,
  HeaderChromeUserMenu,
  HeaderCreateButton,
} from './headerChromeShared';
import { OrgBreadcrumb } from '../shared/OrgBreadcrumb';
import { Icon } from '../ui/Icon';

export interface AppHeaderBarContentProps {
  currentUser: User | null;
  activeOrganization: Organization | null | undefined;
  brandingStyles: BrandingStyles;
  displayTitle?: string;
  titleId?: string;
  showBackButton: boolean;
  onBack?: () => void;
  shouldReorderOnMobile: boolean;
  isMobile: boolean;
  showCreateButton: boolean;
  onCreateDocument?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
  closeAriaLabel?: string;
  contentVisible?: boolean;
  onLogout: () => void;
  onShowActivity?: () => void;
  onShowProfile?: () => void;
  onShowSettings?: () => void;
  onShowDocuments?: () => void;
  onShowOrganizations?: () => void;
  onShowAdmin?: () => void;
  onShowSearch?: () => void;
  onShowReportIssue?: () => void;
  organizations: Organization[];
  isSingleOrg: boolean;
  onSelectOrganization?: (organization: Organization) => void;
  pendingInvitations: PendingInvitationItem[];
  onAcceptInvitationById?: (invitationId: string) => void | Promise<void>;
  onDeclineInvitationById?: (invitationId: string) => void | Promise<void>;
  onRefreshPendingInvitations?: () => void | Promise<void>;
}

export function AppHeaderBarContent({
  currentUser,
  activeOrganization,
  brandingStyles,
  displayTitle,
  titleId,
  showBackButton,
  onBack,
  shouldReorderOnMobile,
  isMobile,
  showCreateButton,
  onCreateDocument,
  showCloseButton,
  onClose,
  closeAriaLabel,
  contentVisible = true,
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
}: AppHeaderBarContentProps) {
  const backButton =
    showBackButton && onBack ? (
      <HeaderBackButton onBack={onBack} brandingStyles={brandingStyles} />
    ) : null;

  return (
    <div
      className={cn(
        'flex min-h-14 min-w-0 items-center justify-between',
        !contentVisible && 'app-chrome-content-hidden'
      )}
    >
      <div className={cn('flex min-w-0 flex-1 flex-col justify-center', SPACING.content.inline)}>
        {!shouldReorderOnMobile && backButton}
        {activeOrganization && (
          <OrgBreadcrumb
            organizationId={activeOrganization.id}
            organizationName={activeOrganization.name}
            onNavigate={
              onSelectOrganization
                ? (orgId) => {
                    const target = organizations.find((o) => o.id === orgId);
                    if (target) onSelectOrganization(target);
                  }
                : undefined
            }
          />
        )}
        {displayTitle && (
          <h1
            id={titleId}
            className={cn(NAVIGATION.typography.title, 'min-w-0 truncate font-bold')}
            style={{ color: brandingStyles.textColor }}
          >
            {displayTitle}
          </h1>
        )}
      </div>
      <div className={cn('flex shrink-0 items-center', SPACING.content.inline)}>
        {showCreateButton && onCreateDocument && (
          <HeaderCreateButton
            onCreateDocument={onCreateDocument}
            compact={isMobile}
          />
        )}
        {currentUser && (
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
            activeOrganization={activeOrganization}
            isSingleOrg={isSingleOrg}
            onSelectOrganization={onSelectOrganization}
            brandingStyles={brandingStyles}
            pendingInvitations={pendingInvitations}
            onAcceptInvitationById={onAcceptInvitationById}
            onDeclineInvitationById={onDeclineInvitationById}
            onRefreshPendingInvitations={onRefreshPendingInvitations}
          />
        )}
        {showCloseButton && onClose && (
          <button
            type="button"
            className={cn(
              NAVIGATION.button.sm,
              NAVIGATION.header.brandedHeaderControlClass,
              RADIUS.control,
              'font-semibold'
            )}
            style={{ color: brandingStyles.textColor }}
            aria-label={closeAriaLabel}
            onClick={onClose}
          >
            <Icon name="X" className={NAVIGATION.icon.sm} />
          </button>
        )}
        {shouldReorderOnMobile && backButton}
      </div>
    </div>
  );
}
