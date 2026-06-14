import { useTranslation } from 'react-i18next';
import type { User, Organization } from '../../types';
import type { PendingInvitationItem } from '../../hooks/usePendingInvitations';
import type { BrandingStyles } from '../../hooks/useBrandingStyles';
import { UserMenu } from '../UserMenu';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { NAVIGATION, RADIUS, TOUCH_TARGETS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export interface HeaderChromeUserMenuProps {
  currentUser: User;
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
  activeOrganization: Organization | null | undefined;
  isSingleOrg: boolean;
  onSelectOrganization?: (organization: Organization) => void;
  brandingStyles: BrandingStyles;
  pendingInvitations: PendingInvitationItem[];
  onAcceptInvitationById?: (invitationId: string) => void | Promise<void>;
  onDeclineInvitationById?: (invitationId: string) => void | Promise<void>;
  onRefreshPendingInvitations?: () => void | Promise<void>;
}

export function HeaderBackButton({
  onBack,
  brandingStyles,
  className,
}: {
  onBack: () => void;
  brandingStyles: BrandingStyles;
  className?: string;
}) {
  const { t: tCommon } = useTranslation('common');

  return (
    <button
      type="button"
      onClick={onBack}
      className={cn(
        NAVIGATION.button.sm,
        TOUCH_TARGETS.minHeight,
        TOUCH_TARGETS.minWidth,
        RADIUS.control,
        'font-semibold transition-colors',
        className
      )}
      style={{ color: brandingStyles.textColor }}
      onMouseEnter={(e) => {
        if (!brandingStyles.useBranding) {
          e.currentTarget.style.backgroundColor = 'var(--muted)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
      aria-label={tCommon('aria.goBack')}
    >
      ←
    </button>
  );
}

export function HeaderChromeUserMenu({
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
  organizations,
  activeOrganization,
  isSingleOrg,
  onSelectOrganization,
  brandingStyles,
  pendingInvitations,
  onAcceptInvitationById,
  onDeclineInvitationById,
  onRefreshPendingInvitations,
}: HeaderChromeUserMenuProps) {
  return (
    <UserMenu
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
      textColor={brandingStyles.textColor}
      textShadow={brandingStyles.textShadow}
      pendingInvitations={pendingInvitations}
      onAcceptInvitationById={onAcceptInvitationById}
      onDeclineInvitationById={onDeclineInvitationById}
      onRefreshPendingInvitations={onRefreshPendingInvitations}
    />
  );
}

export function HeaderCreateButton({
  onCreateDocument,
  compact = false,
}: {
  onCreateDocument: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation('nav');

  return (
    <Button
      onClick={onCreateDocument}
      variant="default"
      size={compact ? 'sm' : 'default'}
      className={cn(compact && TOUCH_TARGETS.minHeight)}
      aria-label={t('newDocument')}
    >
      <Icon name="Plus" className={NAVIGATION.icon.sm} />
      {!compact && t('newDocument')}
    </Button>
  );
}
