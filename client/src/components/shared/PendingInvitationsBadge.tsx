import { useTranslation } from 'react-i18next';
import { cn } from '../ui/utils';

interface PendingInvitationsBadgeProps {
  count: number;
  className?: string;
}

export function PendingInvitationsBadge({ count, className }: PendingInvitationsBadgeProps) {
  const { t } = useTranslation('nav');

  if (count <= 0) return null;

  const label =
    count === 1
      ? t('pendingInvitationsBadgeOne', { defaultValue: '1 pending organization invitation' })
      : t('pendingInvitationsBadgeMany', {
          count,
          defaultValue: `${count} pending organization invitations`,
        });

  return (
    <span
      className={cn(
        'absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground ring-2 ring-background',
        count === 1 ? 'h-2.5 w-2.5' : 'min-h-[1.125rem] min-w-[1.125rem] px-1 text-[10px] font-semibold leading-none',
        className
      )}
      aria-label={label}
    >
      {count > 1 ? (count > 9 ? '9+' : count) : null}
    </span>
  );
}
