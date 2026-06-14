import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../ui/card';
import { Organization } from '../../../types';
import { COLORS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';

interface OrganizationStatsProps {
  organization: Organization;
  activeMembersCount?: number;
  legacyMembersCount?: number;
  className?: string;
}

export function OrganizationStats({ 
  organization, 
  activeMembersCount, 
  legacyMembersCount,
  className 
}: OrganizationStatsProps) {
  const { t } = useTranslation('organization');
  const activeMembers = activeMembersCount ?? organization.members?.filter(m => m.status === 'active').length ?? 0;
  const legacyMembers = legacyMembersCount ?? organization.members?.filter(m => m.status === 'legacy').length ?? 0;
  const representativesCount = organization.representatives?.length || 0;
  const voteThreshold = Math.round((organization.votingThreshold || 0.5) * 100);

  return (
    <div className={`grid gap-4 md:grid-cols-4 ${className || ''}`}>
      <Card>
        <CardContent className="p-4 text-center">
          <div className={cn('text-2xl font-bold', COLORS.status.info)}>{activeMembers}</div>
          <div className="text-sm text-muted-foreground">{t('stats.activeMembers')}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-center">
          <div className={cn('text-2xl font-bold', COLORS.status.info)}>{representativesCount}</div>
          <div className="text-sm text-muted-foreground">{t('stats.representatives')}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-center">
          <div className={cn('text-2xl font-bold', COLORS.status.warning)}>{legacyMembers}</div>
          <div className="text-sm text-muted-foreground">{t('stats.legacyMembers')}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-center">
          <div className={cn('text-2xl font-bold', COLORS.status.success)}>{voteThreshold}%</div>
          <div className="text-sm text-muted-foreground">{t('stats.voteThreshold')}</div>
        </CardContent>
      </Card>
    </div>
  );
}
