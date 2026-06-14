import { EmailInviteSystem } from '../EmailInviteSystem';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Organization, User } from '../../types';
import { useTranslation } from 'react-i18next';

interface InviteMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: Organization;
  currentUser: User;
  canInviteMembers: boolean;
  onInvitesUpdated: () => void;
}

export function InviteMembersDialog({
  open,
  onOpenChange,
  organization,
  currentUser,
  canInviteMembers,
  onInvitesUpdated,
}: InviteMembersDialogProps) {
  const { t } = useTranslation('organization');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('inviteMembersTitle')}</DialogTitle>
          <DialogDescription>{t('inviteMembersDescription')}</DialogDescription>
        </DialogHeader>
        <EmailInviteSystem
          organization={organization}
          currentUser={currentUser}
          onUpdate={() => {
            onOpenChange(false);
            onInvitesUpdated();
          }}
          canInviteMembers={canInviteMembers}
        />
      </DialogContent>
    </Dialog>
  );
}
