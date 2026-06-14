import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/badge';
import { Icon } from '../ui/Icon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useTimezone } from '../../hooks/useTimezone';
import { normalizeVoteStatus } from '../../lib/voting';

export type ProposalStatus = 'draft' | 'active' | 'approved' | 'rejected' | 'expired' | 'implemented';

interface ProposalStatusBadgeProps {
  status: ProposalStatus;
  votingEndsAt?: string | null;
  className?: string;
  showTooltip?: boolean;
}

type StatusKey = Exclude<ProposalStatus, never>;

function useStatusConfig() {
  const { t } = useTranslation('governance');

  const statusConfig: Record<StatusKey, {
    label: string;
    color: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: React.ReactNode;
    description: string;
    nextSteps?: string;
  }> = {
    draft: {
      label: t('proposalStatusBadge.draft.label'),
      color: 'secondary',
      icon: <Icon name="FileCheck" className="h-3 w-3" />,
      description: t('proposalStatusBadge.draft.description'),
      nextSteps: t('proposalStatusBadge.draft.nextSteps'),
    },
    active: {
      label: t('proposalStatusBadge.active.label'),
      color: 'default',
      icon: <Icon name="Clock" className="h-3 w-3" />,
      description: t('proposalStatusBadge.active.description'),
      nextSteps: t('proposalStatusBadge.active.nextSteps'),
    },
    approved: {
      label: t('proposalStatusBadge.approved.label'),
      color: 'default',
      icon: <Icon name="CheckCircle2" className="h-3 w-3" />,
      description: t('proposalStatusBadge.approved.description'),
      nextSteps: t('proposalStatusBadge.approved.nextSteps'),
    },
    rejected: {
      label: t('proposalStatusBadge.rejected.label'),
      color: 'destructive',
      icon: <Icon name="XCircle" className="h-3 w-3" />,
      description: t('proposalStatusBadge.rejected.description'),
      nextSteps: t('proposalStatusBadge.rejected.nextSteps'),
    },
    expired: {
      label: t('proposalStatusBadge.expired.label'),
      color: 'outline',
      icon: <Icon name="AlertCircle" className="h-3 w-3" />,
      description: t('proposalStatusBadge.expired.description'),
      nextSteps: t('proposalStatusBadge.expired.nextSteps'),
    },
    implemented: {
      label: t('proposalStatusBadge.implemented.label'),
      color: 'default',
      icon: <Icon name="Zap" className="h-3 w-3" />,
      description: t('proposalStatusBadge.implemented.description'),
      nextSteps: t('proposalStatusBadge.implemented.nextSteps'),
    },
  };

  return statusConfig;
}

export function ProposalStatusBadge({ 
  status, 
  votingEndsAt, 
  className = '',
  showTooltip = true 
}: ProposalStatusBadgeProps) {
  const { t } = useTranslation('governance');
  const { formatDateTime } = useTimezone();
  const statusConfig = useStatusConfig();
  const normalizedStatus = normalizeVoteStatus(status);
  const config =
    normalizedStatus === 'pending'
      ? statusConfig.draft
      : normalizedStatus === 'verified'
      ? statusConfig.active
      : normalizedStatus === 'completed'
      ? statusConfig.approved
      : normalizedStatus === 'cancelled'
      ? statusConfig.rejected
      : statusConfig[normalizedStatus as ProposalStatus] || statusConfig.draft;
  const isActive = normalizedStatus === 'active';
  
  // Calculate time remaining if voting is active
  let timeRemaining: string | null = null;
  if (isActive && votingEndsAt) {
    const now = new Date();
    const end = new Date(votingEndsAt);
    const diff = end.getTime() - now.getTime();
    
    if (diff > 0) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (days > 0) {
        timeRemaining = `${days}d ${hours}h`;
      } else if (hours > 0) {
        timeRemaining = `${hours}h ${minutes}m`;
      } else {
        timeRemaining = `${minutes}m`;
      }
    } else {
      timeRemaining = t('proposalStatusBadge.timeExpired');
    }
  }

  const badge = (
    <Badge variant={config.color} className={`flex items-center gap-1 ${className}`}>
      {config.icon}
      <span>{config.label}</span>
      {timeRemaining && (
        <span className="ml-1 text-xs opacity-75">({timeRemaining})</span>
      )}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{config.label}</p>
            <p className="text-sm">{config.description}</p>
            {config.nextSteps && (
              <p className="text-xs text-muted-foreground mt-2">
                <strong>{t('proposalStatusBadge.nextLabel')}</strong> {config.nextSteps}
              </p>
            )}
            {isActive && votingEndsAt && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('proposalStatusBadge.votingEnds', { date: formatDateTime(votingEndsAt) })}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
