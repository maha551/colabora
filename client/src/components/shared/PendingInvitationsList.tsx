import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PendingInvitationItem } from '../../hooks/usePendingInvitations';
import { useTimezone } from '../../hooks/useTimezone';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Icon } from '../ui/Icon';
import { RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export interface PendingInvitationsListProps {
  invitations: PendingInvitationItem[];
  onAcceptInvitationById?: (invitationId: string) => void | Promise<void>;
  onDeclineInvitationById?: (invitationId: string) => void | Promise<void>;
  variant?: 'compact' | 'card';
}

export function PendingInvitationsList({
  invitations,
  onAcceptInvitationById,
  onDeclineInvitationById,
  variant = 'compact',
}: PendingInvitationsListProps) {
  const { t: tCommon } = useTranslation('common');
  const { t: tProfile } = useTranslation('profile');
  const { formatRelativeTime } = useTimezone();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  if (invitations.length === 0) return null;

  const handleAccept = async (invitationId: string, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onAcceptInvitationById || acceptingId) return;
    setAcceptingId(invitationId);
    try {
      await onAcceptInvitationById(invitationId);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDecline = async (invitationId: string, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onDeclineInvitationById || decliningId) return;
    setDecliningId(invitationId);
    try {
      await onDeclineInvitationById(invitationId);
    } finally {
      setDecliningId(null);
    }
  };

  const isCard = variant === 'card';

  return (
    <div className={cn('flex flex-col', isCard ? 'gap-3' : 'gap-2')}>
      {invitations.map((inv) => {
        const isRepresentative = inv.invitationType === 'representative';
        const expiresIn = formatRelativeTime(inv.expiresAt);

        return (
          <div
            key={inv.id}
            className={cn(
              isCard ? cn('space-y-3 border border-border bg-card p-4', RADIUS.panel) : 'space-y-2 border-b border-border px-2 py-2 last:border-b-0'
            )}
          >
            <div className={cn('flex items-start justify-between gap-2', isCard && 'gap-3')}>
              <div className="min-w-0 flex-1">
                <div
                  className={cn('truncate font-medium text-foreground', isCard ? 'text-base' : 'text-sm')}
                  title={inv.organizationName}
                >
                  {inv.organizationName}
                </div>
                <div className={cn('text-muted-foreground', isCard ? 'mt-1 text-sm' : 'text-xs')}>
                  {tProfile('invitedBy', {
                    name: inv.inviterName || tProfile('invitedByFallback', { defaultValue: 'organization' }),
                    defaultValue: `Invited by ${inv.inviterName || 'organization'}`,
                  })}
                </div>
                {isCard && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {tProfile('invitationExpires', {
                      time: expiresIn,
                      defaultValue: `Expires ${expiresIn}`,
                    })}
                  </div>
                )}
              </div>
              {isCard && (
                <Badge variant={isRepresentative ? 'purple' : 'secondary'} className="shrink-0 text-xs">
                  {isRepresentative
                    ? tProfile('representative', { defaultValue: 'Representative' })
                    : tProfile('member', { defaultValue: 'Member' })}
                </Badge>
              )}
            </div>
            <div className={cn('flex gap-2', isCard ? 'pt-1' : 'mt-1')}>
              <Button
                size="sm"
                variant="default"
                className={cn('flex-1 text-xs', isCard ? 'h-9' : 'h-7')}
                onClick={(e) => handleAccept(inv.id, e)}
                disabled={acceptingId !== null}
              >
                {acceptingId === inv.id ? (
                  <span className="animate-pulse">{tCommon('buttons.accepting', { defaultValue: 'Accepting...' })}</span>
                ) : (
                  <>
                    <Icon name="UserCheck" size="xs" className="mr-1" />
                    {tCommon('buttons.accept')}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn('flex-1 text-xs', isCard ? 'h-9' : 'h-7')}
                onClick={(e) => handleDecline(inv.id, e)}
                disabled={decliningId !== null}
              >
                {decliningId === inv.id ? (
                  <span className="animate-pulse">{tCommon('buttons.declining', { defaultValue: 'Declining...' })}</span>
                ) : (
                  <>
                    <Icon name="X" size="xs" className="mr-1" />
                    {tCommon('buttons.decline')}
                  </>
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
