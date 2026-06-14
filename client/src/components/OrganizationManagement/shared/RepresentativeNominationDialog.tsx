import React from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../ui/dialog';
import { Label } from '../../ui/label';
import { Alert, AlertDescription } from '../../ui/alert';
import { Icon } from '../../ui/Icon';
import { OrganizationMember } from '../../../types';
import { COLORS, RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';

interface RepresentativeNominationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableMembers: OrganizationMember[];
  selectedUserId: string;
  onSelectUser: (userId: string) => void;
  loading: boolean;
  onNominate: () => Promise<void>;
  formatDate: (date: string | Date, options?: Intl.DateTimeFormatOptions) => string;
}

export function RepresentativeNominationDialog({
  open,
  onOpenChange,
  availableMembers,
  selectedUserId,
  onSelectUser,
  loading,
  onNominate,
  formatDate,
}: RepresentativeNominationDialogProps) {
  const { t } = useTranslation('organization');
  const { t: tGov } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Icon name="UserPlus" className="h-4 w-4" />
          {t('nominateRepresentative')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('nominateNewRepresentative')}</DialogTitle>
          <DialogDescription>
            {t('nominateRepresentativeDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {availableMembers.length === 0 ? (
            <Alert>
              <Icon name="AlertTriangle" className="h-4 w-4" />
              <AlertDescription>
                {t('noAvailableMembersToNominate')}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label>{t('selectActiveMember')}</Label>
              <div className={cn("max-h-[300px] overflow-y-auto space-y-2 border p-2", RADIUS.control)}>
                {availableMembers.map((member) => {
                  const user = member.user;
                  const isSelected = selectedUserId === member.userId;

                  return (
                    <div
                      key={member.userId}
                      className={`p-3 border rounded cursor-pointer hover:bg-muted transition-colors ${
                        isSelected ? `${COLORS.statusBg.info} border-[var(--status-active-border)]` : ''
                      }`}
                      onClick={() => onSelectUser(member.userId)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {user?.avatar ? (
                            <AvatarImage src={user.avatar} alt={user.name} />
                          ) : null}
                          <AvatarFallback>
                            {user?.name?.charAt(0).toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="font-medium">{user?.name || tGov('tab.unknownUser')}</div>
                          <div className="text-sm text-muted-foreground">{user?.email || ''}</div>
                          {member.joinedAt && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {t('memberSince', { date: formatDate(member.joinedAt) })}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <div className={COLORS.status.info}>
                            <Icon name="Users" className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button onClick={onNominate} disabled={!selectedUserId || loading} className="flex-1">
              {loading ? t('nominating') : t('nominateRepresentative')}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('buttons.cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
