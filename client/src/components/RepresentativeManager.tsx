import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Icon } from './ui/Icon';

import { Organization, User } from '../types';
import { RepresentativeCard } from './OrganizationManagement/shared/RepresentativeCard';
import { RepresentativeNominationDialog } from './OrganizationManagement/shared/RepresentativeNominationDialog';
import { useRepresentativeManagerActions } from '../hooks/useRepresentativeManagerActions';
import { useTimezone } from '../hooks/useTimezone';
import { useRepresentativeViewModel } from '../hooks/useRepresentativeViewModel';

interface RepresentativeManagerProps {
  organization: Organization;
  currentUser: User;
  onUpdate: () => void;
  onNavigateToMemberProfile?: (userId: string, organizationId?: string) => void;
}

export function RepresentativeManager({ organization, currentUser, onUpdate, onNavigateToMemberProfile }: RepresentativeManagerProps) {
  const { t } = useTranslation('documents');
  const { t: tOrg } = useTranslation('organization');
  const { t: tCommon } = useTranslation('common');
  const { formatDate } = useTimezone();
  const representatives = organization.representatives || [];

  const {
    nominateDialogOpen,
    setNominateDialogOpen,
    selectedUserId,
    setSelectedUserId,
    loading,
    resignDialogOpen,
    setResignDialogOpen,
    resigning,
    mistrustVoteDialogOpen,
    setMistrustVoteDialogOpen,
    initiatingMistrustVote,
    pendingResignations,
    handleNominate,
    handleInitiateMistrustVote,
    handleResign,
  } = useRepresentativeManagerActions({
    organizationId: organization.id,
    currentUserId: currentUser.id,
    isRepresentative: representatives.includes(currentUser.id),
    nominateSuccessMessage: t('representativeNominated'),
    selectUserToNominateMessage: t('selectUserToNominate'),
    resignationRequestSubmittedMessage: t('resignationRequestSubmitted'),
    onUpdate,
  });

  const {
    isRepresentative,
    currentRepCount,
    availableMembers,
    getRepresentativeMember,
    getPendingResignation,
  } = useRepresentativeViewModel({
    organization,
    currentUser,
    pendingResignations,
  });

  if (!isRepresentative) {
    return (
      <Alert>
        <Icon name="AlertTriangle" className="h-4 w-4" />
        <AlertDescription>
          {tOrg('onlyRepresentativesCanManageReps')}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Icon name="UserCheck" className="h-5 w-5 text-[var(--badge-purple-text)]" />
                {tOrg('representativesCount', { count: currentRepCount })}
              </CardTitle>
              <CardDescription>
                {tOrg('representativesManagementCardDescription')}
              </CardDescription>
            </div>

            <RepresentativeNominationDialog
              open={nominateDialogOpen}
              onOpenChange={setNominateDialogOpen}
              availableMembers={availableMembers}
              selectedUserId={selectedUserId}
              onSelectUser={setSelectedUserId}
              loading={loading}
              onNominate={handleNominate}
              formatDate={formatDate}
            />
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-6 md:gap-8 grid-cols-1 md:grid-cols-3">
            {representatives.map((repId) => {
              const member = getRepresentativeMember(repId);
              const user = member?.user;
              const displayName = user?.name || tOrg('representativeFallbackName', { index: representatives.indexOf(repId) + 1 });
              const email = user?.email || '';
              const avatar = user?.avatar;
              const initials = displayName
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              const isCurrentUser = repId === currentUser.id;

              return (
                <RepresentativeCard
                  key={repId}
                  repId={repId}
                  displayName={displayName}
                  email={email}
                  avatar={avatar}
                  initials={initials}
                  isCurrentUser={isCurrentUser}
                  member={member}
                  pendingResignation={getPendingResignation(repId)}
                  formatDate={formatDate}
                  onNavigateToMemberProfile={onNavigateToMemberProfile}
                  organizationId={organization.id}
                  resignDialogOpen={resignDialogOpen}
                  onResignDialogChange={setResignDialogOpen}
                  onResign={handleResign}
                  resigning={resigning}
                  mistrustVoteDialogOpen={mistrustVoteDialogOpen}
                  onMistrustVoteDialogChange={setMistrustVoteDialogOpen}
                  onInitiateMistrustVote={handleInitiateMistrustVote}
                  initiatingMistrustVote={initiatingMistrustVote}
                  resignDescription={tCommon('confirm.resignRepresentative')}
                />
              );
            })}
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
