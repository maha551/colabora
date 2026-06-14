import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Icon } from './ui/Icon';
import { COLORS, RADIUS } from '../lib/designSystem';
import { authApi, documentsApi } from '../lib/api';
import { toast } from 'sonner';
import { useTimezone } from '../hooks/useTimezone';
import { logger } from '../lib/logger';
import { cn } from './ui/utils';
import type { PendingInvitation } from '../hooks/useInvitationHandling';

interface InvitationAcceptDialogProps {
  invitation: PendingInvitation | null;
  invitationToken?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export function InvitationAcceptDialog({
  invitation,
  invitationToken,
  isOpen,
  onClose,
  onAccept,
}: InvitationAcceptDialogProps) {
  const { t } = useTranslation('auth');
  const { formatRelativeTime } = useTimezone();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const declineSentRef = useRef(false);
  const acceptedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      acceptedRef.current = false;
      declineSentRef.current = false;
    }
  }, [isOpen]);

  if (!invitation) return null;

  const isDocument = invitation.kind === 'document';
  const isRepresentative = !isDocument && invitation.invitationType === 'representative';

  const handleDecline = async () => {
    if (acceptedRef.current || declineSentRef.current) {
      onClose();
      return;
    }
    const token = invitationToken ?? new URLSearchParams(window.location.search).get('token');
    if (token && !isDocument) {
      declineSentRef.current = true;
      setIsDeclining(true);
      try {
        await authApi.declineInvitation(token);
        toast.success(t('invitation.invitationDeclined'));
      } catch (error) {
        logger.error('Error declining invitation:', error);
        toast.error(error instanceof Error ? error.message : t('invitation.failedToDecline'));
      } finally {
        setIsDeclining(false);
      }
    }
    onClose();
  };

  const handleAccept = async () => {
    const token = invitationToken ?? new URLSearchParams(window.location.search).get('token');
    if (!token) {
      toast.error(t('invitation.tokenNotFound'));
      return;
    }

    setIsAccepting(true);
    try {
      if (isDocument) {
        const result = await documentsApi.acceptDocumentInvitation(token);
        toast.success(result.message || `You now have access to "${result.documentTitle}".`);
      } else {
        const result = await authApi.acceptInvitation(token);
        if (!result.success) {
          toast.error(result.message || t('invitation.failedToAccept'));
          return;
        }
        if (result.alreadyMember) {
          toast.info(result.message || t('invitation.alreadyMember'));
        } else {
          toast.success(result.message || t('invitation.acceptedSuccess'));
        }
      }

      acceptedRef.current = true;
      onAccept();
      onClose();
      window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
      logger.error('Error accepting invitation:', error);
      toast.error(error instanceof Error ? error.message : t('invitation.failedToAccept'));
    } finally {
      setIsAccepting(false);
    }
  };

  const expiresIn = formatRelativeTime(invitation.expiresAt);
  const title = isDocument ? invitation.documentTitle : invitation.organizationName;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleDecline(); }}>
      <DialogContent className="sm:max-w-[500px] !top-4 sm:!top-6 !translate-y-0 left-1/2 -translate-x-1/2 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Icon name="Mail" className={`h-5 w-5 ${COLORS.status.info}`} />
            {isDocument ? 'Document Invitation' : 'Organization Invitation'}
          </DialogTitle>
          <DialogDescription className="text-base">
            {isDocument
              ? 'You have been invited to collaborate on a document'
              : 'You have been invited to join an organization'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className={cn('bg-muted p-4 border border-border', RADIUS.panel)}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-lg text-foreground mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">
                  {isDocument
                    ? 'Accept to become a collaborator on this document'
                    : isRepresentative
                      ? 'You have been invited as a representative'
                      : 'You have been invited as a member'}
                </p>
              </div>
              {!isDocument && (
                <Badge
                  variant={isRepresentative ? 'default' : 'secondary'}
                  className={isRepresentative ? 'bg-purple-100 text-purple-700 border-purple-300' : ''}
                >
                  {isRepresentative ? 'Representative' : 'Member'}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Icon name="User" className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Invited by:</span>
              <span className="font-medium text-foreground">{invitation.inviterName || 'Someone'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Icon name="Calendar" className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Expires:</span>
              <span className="font-medium text-foreground">{expiresIn}</span>
            </div>
          </div>

          <div className={cn('bg-blue-50 border border-blue-200 p-3', RADIUS.panel)}>
            <p className="text-sm text-blue-800">
              {isDocument
                ? 'You will only gain access after you accept this invitation.'
                : isRepresentative
                  ? 'As a representative, you will have additional permissions to manage the organization, invite members, and participate in governance decisions.'
                  : 'As a member, you will be able to collaborate on documents, participate in voting, and contribute to the organization.'}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleDecline}
            disabled={isAccepting || isDeclining}
          >
            <Icon name="X" className="h-4 w-4 mr-2" />
            {isDeclining ? 'Declining...' : 'Decline'}
          </Button>
          <Button
            type="button"
            onClick={handleAccept}
            disabled={isAccepting}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isAccepting ? (
              <>
                <div className={cn('animate-spin h-4 w-4 border-b-2 border-white mr-2', RADIUS.pill)} />
                Accepting...
              </>
            ) : (
              <>
                <Icon name="UserCheck" className="h-4 w-4 mr-2" />
                Accept Invitation
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
