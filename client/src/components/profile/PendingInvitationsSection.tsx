import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { PendingInvitationItem } from '../../hooks/usePendingInvitations';
import { PendingInvitationsList } from '../shared/PendingInvitationsList';
import { Icon } from '../ui/Icon';
import { RADIUS, SPACING } from '../../lib/designSystem';
import { cn } from '../ui/utils';

interface PendingInvitationsSectionProps {
  invitations: PendingInvitationItem[];
  onAcceptInvitationById?: (invitationId: string) => void | Promise<void>;
  onDeclineInvitationById?: (invitationId: string) => void | Promise<void>;
  onRefreshPendingInvitations?: () => void | Promise<void>;
}

export function PendingInvitationsSection({
  invitations,
  onAcceptInvitationById,
  onDeclineInvitationById,
  onRefreshPendingInvitations,
}: PendingInvitationsSectionProps) {
  const { t } = useTranslation('profile');

  useEffect(() => {
    void onRefreshPendingInvitations?.();
  }, [onRefreshPendingInvitations]);

  if (invitations.length === 0) return null;

  return (
    <section
      className={cn('mb-8 border border-border bg-muted/30 p-4 sm:p-6', RADIUS.panel, SPACING.tight.gap)}
      aria-label={t('pendingInvitationsSection', { defaultValue: 'Pending organization invitations' })}
    >
      <div className="mb-4 flex items-center gap-2">
        <Icon name="Mail" size="sm" className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">
          {t('pendingInvitationsTitle', { defaultValue: 'Pending invitations' })}
        </h2>
        <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
          {invitations.length}
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('pendingInvitationsDescription', {
          defaultValue: 'You have been invited to join the organizations below. Accept to become a member.',
        })}
      </p>
      <PendingInvitationsList
        invitations={invitations}
        onAcceptInvitationById={onAcceptInvitationById}
        onDeclineInvitationById={onDeclineInvitationById}
        variant="card"
      />
    </section>
  );
}
