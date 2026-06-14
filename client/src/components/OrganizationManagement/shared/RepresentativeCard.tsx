import React from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '../../ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../ui/dialog';
import { Icon } from '../../ui/Icon';
import { OrganizationMember } from '../../../types';
import { COLORS } from '../../../lib/designSystem';
import { getUserColor } from '../../../lib/userColors';
import { PendingResignation } from '../../../hooks/useRepresentativeManagerActions';

interface RepresentativeCardProps {
  repId: string;
  displayName: string;
  email: string;
  avatar?: string;
  initials: string;
  isCurrentUser: boolean;
  member?: OrganizationMember;
  pendingResignation?: PendingResignation;
  formatDate: (date: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  onNavigateToMemberProfile?: (userId: string, organizationId?: string) => void;
  organizationId: string;
  resignDialogOpen: boolean;
  onResignDialogChange: (open: boolean) => void;
  onResign: () => Promise<void>;
  resigning: boolean;
  mistrustVoteDialogOpen: string | null;
  onMistrustVoteDialogChange: (repId: string | null) => void;
  onInitiateMistrustVote: (repId: string) => Promise<void>;
  initiatingMistrustVote: string | null;
  resignDescription: string;
}

export function RepresentativeCard({
  repId,
  displayName,
  email,
  avatar,
  initials,
  isCurrentUser,
  member,
  pendingResignation,
  formatDate,
  onNavigateToMemberProfile,
  organizationId,
  resignDialogOpen,
  onResignDialogChange,
  onResign,
  resigning,
  mistrustVoteDialogOpen,
  onMistrustVoteDialogChange,
  onInitiateMistrustVote,
  initiatingMistrustVote,
  resignDescription,
}: RepresentativeCardProps) {
  const { t } = useTranslation('organization');
  const { t: tCommon } = useTranslation('common');

  return (
    <Card className="relative overflow-hidden hover:shadow-md transition-all duration-200 border border-border bg-card">
      <CardContent className="p-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="relative">
            <Avatar className="h-28 w-28 border-4 shadow-sm" style={{ borderColor: getUserColor(repId) }}>
              {avatar ? (
                <AvatarImage src={avatar} alt={displayName} />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-purple-400 to-purple-600 text-white text-2xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            {isCurrentUser && (
              <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
                <Badge variant="default" className="text-xs px-2 py-0.5">
                  {t('you')}
                </Badge>
              </div>
            )}
            {isCurrentUser && pendingResignation && (
              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2">
                <Badge className={`${COLORS.statusBadge.warning} text-xs px-2 py-0.5`}>
                  <Icon name="Clock" className="h-3 w-3 mr-1" />
                  {t('resignationPending')}
                </Badge>
              </div>
            )}
          </div>

          <div className="space-y-2 w-full">
            <h3
              className={`font-semibold text-lg text-foreground ${onNavigateToMemberProfile ? 'cursor-pointer hover:text-purple-600 transition-colors' : ''}`}
              onClick={onNavigateToMemberProfile && member?.user ? () => onNavigateToMemberProfile(repId, organizationId) : undefined}
            >
              {displayName}
            </h3>
            {member?.status && (
              <Badge
                variant={member.status === 'active' ? 'default' : 'secondary'}
                className="text-xs bg-purple-100 text-purple-800 hover:bg-purple-200"
              >
                {member.status === 'active' ? t('activeMember') : t('legacyMember')}
              </Badge>
            )}
          </div>

          {email && (
            <div className="w-full space-y-2 pt-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                <Icon name="Mail" className="h-4 w-4 text-muted-foreground" />
                <a
                  href={`mailto:${email}`}
                  className="hover:text-purple-600 hover:underline truncate max-w-[200px] transition-colors"
                  title={email}
                >
                  {email}
                </a>
              </div>
              {member?.joinedAt && (
                <div className="text-xs text-muted-foreground text-center">
                  {t('joinedOn', {
                    date: formatDate(member.joinedAt, { year: 'numeric', month: 'short', day: 'numeric' }),
                  })}
                </div>
              )}
            </div>
          )}

          {isCurrentUser && !pendingResignation && (
            <div className="pt-2 w-full">
              <Dialog open={resignDialogOpen} onOpenChange={onResignDialogChange}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`w-full ${COLORS.status.active} hover:opacity-90 ${COLORS.statusBg.active} border-[var(--status-proposed-border)]`}
                  >
                    <Icon name="UserMinus" className="h-4 w-4 mr-2" />
                    {t('resign')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('resignAsRepresentative')}</DialogTitle>
                    <DialogDescription>
                      {resignDescription} {t('resignCannotBeUndone')}
                    </DialogDescription>
                  </DialogHeader>

                  <Alert>
                    <Icon name="AlertTriangle" className="h-4 w-4" />
                    <AlertDescription>
                      {t('resignRemainActiveAlert')}
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-2 pt-4">
                    <Button variant="destructive" onClick={onResign} disabled={resigning} className="flex-1">
                      {resigning ? t('resigning') : t('confirmResignation')}
                    </Button>
                    <Button variant="outline" onClick={() => onResignDialogChange(false)}>
                      {tCommon('buttons.cancel')}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {isCurrentUser && pendingResignation?.replacementElectionId && (
            <div className="pt-2 w-full">
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  window.location.href = `/organization/${organizationId}/governance`;
                }}
                className="w-full text-sm"
              >
                {t('viewElectionProgress')}
              </Button>
            </div>
          )}

          {!isCurrentUser && (
            <div className="pt-2 w-full">
              <Dialog
                open={mistrustVoteDialogOpen === repId}
                onOpenChange={(open) => onMistrustVoteDialogChange(open ? repId : null)}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`w-full ${COLORS.status.error} hover:opacity-90 ${COLORS.statusBg.error} border-[var(--status-rejected-border)]`}
                  >
                    <Icon name="AlertTriangle" className="h-4 w-4 mr-2" />
                    {t('initiateMistrustVote')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('initiateMistrustVote')}</DialogTitle>
                    <DialogDescription>
                      {t('initiateMistrustVoteDescription', { name: displayName })}
                    </DialogDescription>
                  </DialogHeader>

                  <Alert>
                    <Icon name="AlertTriangle" className="h-4 w-4" />
                    <AlertDescription>
                      {t('mistrustVoteAlert')}
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="destructive"
                      onClick={() => onInitiateMistrustVote(repId)}
                      disabled={initiatingMistrustVote === repId}
                      className="flex-1"
                    >
                      {initiatingMistrustVote === repId ? t('initiating') : t('initiateMistrustVote')}
                    </Button>
                    <Button variant="outline" onClick={() => onMistrustVoteDialogChange(null)}>
                      {tCommon('buttons.cancel')}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
