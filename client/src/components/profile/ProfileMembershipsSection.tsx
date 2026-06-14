import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Organization } from '../../types';
import { organizationsApi, ApiError } from '../../lib/api';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { RADIUS, SPACING } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';

type UserOrganization = Organization & {
  membershipStatus?: 'active' | 'legacy' | null;
  joinedAt?: string | null;
};

interface ProfileMembershipsSectionProps {
  userId: string;
  organizations: UserOrganization[];
  onOrganizationsChanged?: () => void | Promise<void>;
}

export function ProfileMembershipsSection({
  userId,
  organizations,
  onOrganizationsChanged,
}: ProfileMembershipsSectionProps) {
  const { t } = useTranslation('profile');
  const [leavingOrgId, setLeavingOrgId] = useState<string | null>(null);
  const [confirmOrg, setConfirmOrg] = useState<UserOrganization | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeMemberships = organizations.filter(
    (org) => org.membershipStatus === 'active' || org.membershipStatus == null
  );

  if (activeMemberships.length === 0) return null;

  const handleLeave = async () => {
    if (!confirmOrg) return;
    setIsSubmitting(true);
    setLeavingOrgId(confirmOrg.id);
    try {
      const result = await organizationsApi.leaveOrganization(confirmOrg.id);
      if (result.electionCreated) {
        toast.success(t('leaveOrganizationSuccessWithElection'));
      } else {
        toast.success(t('leaveOrganizationSuccess'));
      }
      setConfirmOrg(null);
      await onOrganizationsChanged?.();
    } catch (error) {
      logger.error('Failed to leave organization', error);
      if (error instanceof ApiError && error.code === 'CANNOT_LEAVE_LAST_REP') {
        toast.error(t('cannotLeaveLastRepresentative'));
      } else {
        toast.error(t('leaveOrganizationFailed'));
      }
    } finally {
      setIsSubmitting(false);
      setLeavingOrgId(null);
    }
  };

  const isRepInOrg = (org: UserOrganization) => org.representatives?.includes(userId) ?? false;

  return (
    <>
      <section
        className={cn('mb-8 border border-border bg-muted/30 p-4 sm:p-6', RADIUS.panel, SPACING.tight.gap)}
        aria-label={t('membershipsSection')}
      >
        <div className="mb-4 flex items-center gap-2">
          <Icon name="Building2" size="sm" className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">{t('membershipsTitle')}</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{t('membershipsDescription')}</p>
        <ul className="space-y-3">
          {activeMemberships.map((org) => (
            <li
              key={org.id}
              className={cn('flex items-center justify-between gap-3 border bg-background p-3', RADIUS.panel)}
            >
              <div>
                <div className="font-medium">{org.name}</div>
                {isRepInOrg(org) && (
                  <div className="text-xs text-muted-foreground">{t('representative')}</div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={leavingOrgId === org.id || isSubmitting}
                onClick={() => setConfirmOrg(org)}
              >
                {t('leaveOrganization')}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <AlertDialog open={!!confirmOrg} onOpenChange={(open) => !open && !isSubmitting && setConfirmOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leaveOrganization')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmOrg && isRepInOrg(confirmOrg)
                ? t('leaveOrganizationConfirmRep', { name: confirmOrg.name })
                : t('leaveOrganizationConfirm', { name: confirmOrg?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleLeave();
              }}
              disabled={isSubmitting}
            >
              {t('leaveOrganization')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
