import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Organization } from '../types';
import type { PendingInvitationItem } from '../hooks/usePendingInvitations';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Icon } from './ui/Icon';
import { OrganizationSwitcher } from './shared/OrganizationSwitcher';
import { PendingInvitationsBadge } from './shared/PendingInvitationsBadge';
import { PendingInvitationsList } from './shared/PendingInvitationsList';
import { getUserColor } from '../lib/userColors';
import { COLORS, RADIUS, Z_INDEX } from '../lib/designSystem';
import { useIsMobile } from '../contexts/ScreenSizeContext';
import { cn } from './ui/utils';

interface UserMenuProps {
  currentUser: User;
  onLogout: () => void;
  onShowActivity?: () => void;
  onShowProfile?: () => void;
  onShowSettings?: () => void;
  onShowDocuments?: () => void;
  onShowAdmin?: () => void;
  onShowSearch?: () => void;
  onShowReportIssue?: () => void;
  onShowOrganizations?: () => void;
  organizations?: Organization[];
  activeOrganization?: Organization | null;
  /** @deprecated Kept for call-site compatibility; org UI uses organizations.length instead. */
  isSingleOrg?: boolean;
  onSelectOrganization?: (organization: Organization) => void;
  /** Text color for header contrast */
  textColor?: string;
  /** Text shadow for header contrast */
  textShadow?: string;
  pendingInvitations?: PendingInvitationItem[];
  onAcceptInvitationById?: (invitationId: string) => void | Promise<void>;
  onDeclineInvitationById?: (invitationId: string) => void | Promise<void>;
  onRefreshPendingInvitations?: () => void | Promise<void>;
}

export function UserMenu({
  currentUser,
  onLogout,
  onShowProfile,
  onShowSettings,
  onShowAdmin,
  onShowReportIssue,
  organizations = [],
  activeOrganization,
  onSelectOrganization,
  textColor,
  textShadow,
  pendingInvitations = [],
  onAcceptInvitationById,
  onDeclineInvitationById,
  onRefreshPendingInvitations,
}: UserMenuProps) {
  const { t } = useTranslation('nav');
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const invitationCount = pendingInvitations.length;
  const showOrgSwitcher = organizations.length > 1 && !!onSelectOrganization;
  const showContextSection = showOrgSwitcher || invitationCount > 0;

  const refreshInvitations = () => {
    void onRefreshPendingInvitations?.();
  };

  const handleSheetOpenChange = (open: boolean) => {
    setSheetOpen(open);
    if (open) refreshInvitations();
  };

  const handleDropdownOpenChange = (open: boolean) => {
    setDropdownOpen(open);
    if (open) refreshInvitations();
  };

  const closeMenu = () => setSheetOpen(false);

  const triggerButton = (
    <Button
      variant="ghost"
      size="sm"
      className="relative flex items-center gap-3"
      style={{
        color: textColor,
        ...(textShadow && textShadow !== 'none' ? { textShadow } : {}),
      }}
      onClick={isMobile ? () => handleSheetOpenChange(true) : undefined}
      aria-label={
        invitationCount > 0
          ? t('userMenuWithInvitations', {
              name: currentUser.name,
              count: invitationCount,
              defaultValue: `${currentUser.name}, ${invitationCount} pending invitation${invitationCount === 1 ? '' : 's'}`,
            })
          : undefined
      }
    >
      <span className="relative shrink-0">
        <Avatar className="h-8 w-8 border-2" style={{ borderColor: getUserColor(currentUser.id) }}>
          <AvatarImage src={currentUser.avatar} />
          <AvatarFallback className="bg-blue-600 text-white text-sm">
            {currentUser.name?.split(' ').map((n) => n[0]).join('') || 'U'}
          </AvatarFallback>
        </Avatar>
        <PendingInvitationsBadge count={invitationCount} />
      </span>
      <span
        className="hidden text-sm sm:inline"
        style={{
          color: textColor,
          ...(textShadow && textShadow !== 'none' ? { textShadow } : {}),
        }}
      >
        {currentUser.name}
      </span>
    </Button>
  );

  const pendingInvitationsMobile =
    invitationCount > 0 ? (
      <div className="border-t border-border px-4 py-2">
        <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
          <Icon name="Mail" size="sm" />
          {t('pendingInvitations')} ({invitationCount})
        </div>
        <PendingInvitationsList
          invitations={pendingInvitations}
          onAcceptInvitationById={onAcceptInvitationById}
          onDeclineInvitationById={onDeclineInvitationById}
          variant="compact"
        />
      </div>
    ) : null;

  const profileMenuLabel = (
    <span className="flex w-full items-center gap-2">
      <Icon name="UserCircle" size="sm" className="shrink-0" />
      <span className="flex-1">{t('profile')}</span>
      {invitationCount > 0 && (
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-destructive"
          aria-hidden
        />
      )}
    </span>
  );

  const accountItemsMobile = (
    <>
      {onShowReportIssue && (
        <button
          type="button"
          onClick={() => {
            onShowReportIssue();
            closeMenu();
          }}
          className={cn(
            'flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted',
            RADIUS.panel
          )}
        >
          <Icon name="Bug" size="sm" className="shrink-0" />
          {t('reportAnIssue')}
        </button>
      )}
      {onShowProfile && (
        <button
          type="button"
          onClick={() => {
            onShowProfile();
            closeMenu();
          }}
          className={cn(
            'flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted',
            RADIUS.panel,
            invitationCount > 0 && 'font-medium'
          )}
        >
          {profileMenuLabel}
        </button>
      )}
      {onShowSettings && (
        <button
          type="button"
          onClick={() => {
            onShowSettings();
            closeMenu();
          }}
          className={cn(
            'flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted',
            RADIUS.panel
          )}
        >
          <Icon name="Settings" size="sm" className="shrink-0" />
          {t('settings')}
        </button>
      )}
      {onShowAdmin && (
        <button
          type="button"
          onClick={() => {
            onShowAdmin();
            closeMenu();
          }}
          className={cn(
            'flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted',
            RADIUS.panel
          )}
        >
          <Icon name="Settings" size="sm" className="shrink-0" />
          {t('adminDashboard')}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          onLogout();
          closeMenu();
        }}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left text-sm',
          RADIUS.panel,
          COLORS.status.error
        )}
      >
        <Icon name="LogOut" size="sm" className="shrink-0" />
        {t('logout')}
      </button>
    </>
  );

  if (isMobile) {
    return (
      <>
        {triggerButton}
        <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
          <SheetContent
            side="left"
            className="flex w-[min(85vw,320px)] flex-col pt-6"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-0 py-2">
              <OrganizationSwitcher
                organizations={organizations}
                activeOrganization={activeOrganization}
                onSelectOrganization={onSelectOrganization}
                variant="sheet"
                onAfterSelect={closeMenu}
              />
              {pendingInvitationsMobile}
              {showContextSection && <div className="my-2 border-t border-border" />}
              {accountItemsMobile}
            </nav>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>
      <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn('w-56', Z_INDEX.chromeMenu)}>
        <OrganizationSwitcher
          organizations={organizations}
          activeOrganization={activeOrganization}
          onSelectOrganization={onSelectOrganization}
          variant="dropdown"
        />

        {invitationCount > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Icon name="Mail" size="sm" className="mr-2" />
              {t('pendingInvitations')} ({invitationCount})
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={cn('w-64', Z_INDEX.chromeMenu)}>
              <PendingInvitationsList
                invitations={pendingInvitations}
                onAcceptInvitationById={onAcceptInvitationById}
                onDeclineInvitationById={onDeclineInvitationById}
                variant="compact"
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {showContextSection && <DropdownMenuSeparator />}

        {onShowReportIssue && (
          <DropdownMenuItem onClick={onShowReportIssue}>
            <Icon name="Bug" size="sm" className="mr-2" />
            {t('reportAnIssue')}
          </DropdownMenuItem>
        )}
        {onShowProfile && (
          <DropdownMenuItem onClick={onShowProfile} className={invitationCount > 0 ? 'font-medium' : undefined}>
            {profileMenuLabel}
          </DropdownMenuItem>
        )}
        {onShowSettings && (
          <DropdownMenuItem onClick={onShowSettings}>
            <Icon name="Settings" size="sm" className="mr-2" />
            {t('settings')}
          </DropdownMenuItem>
        )}
        {onShowAdmin && (
          <DropdownMenuItem onClick={onShowAdmin}>
            <Icon name="Settings" size="sm" className="mr-2" />
            {t('adminDashboard')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onLogout} className={COLORS.status.error}>
          <Icon name="LogOut" size="sm" className="mr-2" />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
