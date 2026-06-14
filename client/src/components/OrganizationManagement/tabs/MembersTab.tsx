import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Icon } from '../../ui/Icon';
import { Organization, User } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { MemberCard } from '../shared/MemberCard';
import { MemberLocationPanel } from '../shared/MemberLocationPanel';
import { InviteMembersDialog } from '../InviteMembersDialog';
import { TabPanelHeader } from '../../layout/TabPanelHeader';
import { TabPanelBody } from '../../layout/TabPanelBody';
import { organizationsApi, ApiError } from '../../../lib/api';
import { toast } from 'sonner';
import { logger } from '../../../lib/logger';

interface MembersTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  onUpdate: () => void;
  onLeaveSuccess?: () => void;
  onNavigateToMemberProfile?: (userId: string, organizationId?: string) => void;
}

export function MembersTab({
  organization,
  currentUser,
  permissions,
  onUpdate,
  onLeaveSuccess,
  onNavigateToMemberProfile,
}: MembersTabProps) {
  const { t } = useTranslation('organization');
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const activeMembers = organization.members?.filter(m => m.status === 'active') || [];
  const legacyMembers = organization.members?.filter(m => m.status === 'legacy') || [];

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm(t('membersTab.confirmRemove'))) return;
    try {
      await organizationsApi.removeMember(organization.id, userId);
      toast.success(t('membersTab.removed'));
      onUpdate();
    } catch (error) {
      logger.error('Failed to remove member', error);
      toast.error(t('membersTab.removeFailed'));
    }
  };

  const handleLeaveOrganization = async () => {
    const isRep = organization.representatives?.includes(currentUser.id) ?? false;
    const confirmMessage = isRep
      ? t('membersTab.confirmLeaveRep', { name: organization.name })
      : t('membersTab.confirmLeave', { name: organization.name });
    if (!window.confirm(confirmMessage)) return;

    try {
      const result = await organizationsApi.leaveOrganization(organization.id);
      if (result.electionCreated) {
        toast.success(t('membersTab.leaveSuccessWithElection'));
      } else {
        toast.success(t('membersTab.leaveSuccess'));
      }
      onLeaveSuccess?.();
    } catch (error) {
      logger.error('Failed to leave organization', error);
      if (error instanceof ApiError && error.code === 'CANNOT_LEAVE_LAST_REP') {
        toast.error(t('membersTab.cannotLeaveLastRepresentative'));
      } else {
        toast.error(t('membersTab.leaveFailed'));
      }
    }
  };

  return (
    <TabPanelBody>
      <TabPanelHeader
        title={t('members')}
        subtitle={t('membersTab.activeCount', { count: activeMembers.length })}
        actions={
          permissions.canInviteMembers ? (
            <Button onClick={() => setShowInviteDialog(true)}>
              <Icon name="UserPlus" className="h-4 w-4 mr-2" />
              {t('inviteMembersTitle')}
            </Button>
          ) : undefined
        }
      />

      <MemberLocationPanel organization={organization} currentUser={currentUser} />

      <Card>
        <CardHeader>
          <CardTitle>{t('membersTab.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {activeMembers.length > 0 || legacyMembers.length > 0 ? (
            <div className="space-y-6">
              {activeMembers.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  organization={organization}
                  currentUserId={currentUser.id}
                  canManage={permissions.canManageMembers}
                  onRemove={handleRemoveMember}
                  onLeave={handleLeaveOrganization}
                  onMemberClick={onNavigateToMemberProfile ? () => onNavigateToMemberProfile(member.userId, organization.id) : undefined}
                />
              ))}
              {legacyMembers.length > 0 && (
                <>
                  <div className="border-t my-4 pt-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('membersTab.legacySection')}</h3>
                    {legacyMembers.map((member) => (
                      <MemberCard
                        key={member.id}
                        member={member}
                        organization={organization}
                        onMemberClick={onNavigateToMemberProfile ? () => onNavigateToMemberProfile(member.userId, organization.id) : undefined}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Icon name="Users" className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-1">{t('membersTab.emptyTitle')}</p>
              <p className="text-sm">{t('membersTab.emptyDescription')}</p>
              {permissions.canInviteMembers && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowInviteDialog(true)}
                >
                  <Icon name="Mail" className="h-4 w-4 mr-2" />
                  {t('inviteMembersTitle')}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <InviteMembersDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        organization={organization}
        currentUser={currentUser}
        canInviteMembers={permissions.canInviteMembers}
        onInvitesUpdated={onUpdate}
      />
    </TabPanelBody>
  );
}
