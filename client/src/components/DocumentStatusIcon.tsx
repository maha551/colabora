import { useTranslation } from 'react-i18next';
import { Document } from '../types';
import { cn } from './ui/utils';
import { Badge } from './ui/badge';
import { Icon } from './ui/Icon';
import { COLORS } from '../lib/designSystem';
import type { IconSize } from '../lib/designSystem';
import { getStatusPresentation } from '../lib/documentLifecycle';

interface DocumentStatusIconProps {
  document: Document;
  size?: IconSize;
  className?: string;
  variant?: 'icon' | 'badge' | 'compact';
}

export function DocumentStatusIcon({
  document,
  size = 'md',
  className = '',
  variant = 'icon',
}: DocumentStatusIconProps) {
  const { t } = useTranslation('documents');
  const statusConfig = getStatusPresentation(document, t);
  if (!statusConfig) return null;

  const status = document.status || 'draft';
  const amendState =
    status === 'agreed' && document.amendmentAdoptionVoteId
      ? 'adoption_pending'
      : status === 'agreed' && document.amendmentsOpen
        ? 'amendments_open'
        : status;

  if (variant === 'badge') {
    const badgeColors: Record<string, string> = {
      proposal: cn('border', COLORS.statusBadge.info),
      voting: cn('border', COLORS.statusBadge.success),
      agreed: cn('border', COLORS.statusBadge.success),
      amendments_open: cn('border', COLORS.statusBadge.info),
      adoption_pending: cn('border', COLORS.statusBadge.info),
      rejected: cn('border', COLORS.statusBadge.error),
      expired: 'bg-muted text-foreground border-border',
      draft: 'bg-muted text-foreground border-border',
    };
    const badgeColor = badgeColors[amendState] || badgeColors[status] || badgeColors.draft;
    const label = statusConfig.subtitle ? `${statusConfig.label} (${statusConfig.subtitle})` : statusConfig.label;

    return (
      <Badge
        variant="outline"
        className={cn('inline-flex items-center gap-1 text-xs', badgeColor, className)}
        title={label}
        aria-label={label}
      >
        <Icon name={statusConfig.iconName} size="xs" className={statusConfig.color} aria-hidden />
        <span>{statusConfig.label}</span>
      </Badge>
    );
  }

  if (variant === 'compact') {
    const badgeColors: Record<string, string> = {
      proposal: cn(COLORS.statusBg.info, COLORS.status.info),
      voting: cn(COLORS.statusBg.success, COLORS.status.success),
      agreed: cn(COLORS.statusBg.success, COLORS.status.success),
      amendments_open: cn(COLORS.statusBg.info, COLORS.status.info),
      adoption_pending: cn(COLORS.statusBg.info, COLORS.status.info),
      rejected: cn(COLORS.statusBg.error, COLORS.status.error),
      expired: 'bg-muted text-foreground',
      draft: 'bg-muted text-foreground',
    };
    const badgeColor = badgeColors[amendState] || badgeColors[status] || badgeColors.draft;
    const label = statusConfig.subtitle ? `${statusConfig.label} (${statusConfig.subtitle})` : statusConfig.label;

    return (
      <span
        className={cn('inline-flex items-center justify-center w-5 h-5 rounded text-xs', badgeColor, className)}
        title={label}
        aria-label={label}
      >
        <Icon name={statusConfig.iconName} size="xs" aria-hidden />
      </span>
    );
  }

  return (
    <Icon
      name={statusConfig.iconName}
      size={size}
      className={cn(statusConfig.color, className)}
      aria-label={statusConfig.label}
    />
  );
}
