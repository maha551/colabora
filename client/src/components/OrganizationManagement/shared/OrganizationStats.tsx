import React from 'react';
import { Card, CardContent } from '../../ui/card';
import { Organization } from '../../../types';

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
  const activeMembers = activeMembersCount ?? organization.members?.filter(m => m.status === 'active').length ?? 0;
  const legacyMembers = legacyMembersCount ?? organization.members?.filter(m => m.status === 'legacy').length ?? 0;
  const representativesCount = organization.representatives?.length || 0;
  const voteThreshold = Math.round((organization.votingThreshold || 0.5) * 100);

  return (
    <div className={`grid gap-4 md:grid-cols-4 ${className || ''}`}>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{activeMembers}</div>
          <div className="text-sm text-gray-600">Active Members</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{representativesCount}</div>
          <div className="text-sm text-gray-600">Representatives</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{legacyMembers}</div>
          <div className="text-sm text-gray-600">Legacy Members</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{voteThreshold}%</div>
          <div className="text-sm text-gray-600">Vote Threshold</div>
        </CardContent>
      </Card>
    </div>
  );
}

