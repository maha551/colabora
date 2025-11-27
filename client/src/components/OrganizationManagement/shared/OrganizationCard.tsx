import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Avatar, AvatarFallback } from '../../ui/avatar';
import { OrganizationStatusBadge, VotingStatusBadge, RepresentativeBadge } from './StatusBadges';
import { Organization, User } from '../../../types';
import { ArrowRight, Settings } from 'lucide-react';

interface OrganizationCardProps {
  organization: Organization;
  currentUser: User;
  onSelectOrganization: (organization: Organization) => void;
  mode?: 'list' | 'grid' | 'compact';
  className?: string;
}

export function OrganizationCard({ 
  organization, 
  currentUser, 
  onSelectOrganization,
  mode = 'grid',
  className 
}: OrganizationCardProps) {
  const isRepresentative = organization.representatives?.includes(currentUser.id) || false;
  const membershipStatus = organization.membershipStatus || 'Member';

  if (mode === 'compact') {
    return (
      <Card className={`hover:shadow-md transition-shadow ${className || ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{organization.name}</CardTitle>
            <div className="flex gap-1">
              {isRepresentative && <RepresentativeBadge />}
              <OrganizationStatusBadge isActive={organization.isActive} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => onSelectOrganization(organization)}
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Manage
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`hover:shadow-md transition-shadow ${className || ''}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{organization.name}</CardTitle>
            {organization.description && (
              <CardDescription className="mt-1">{organization.description}</CardDescription>
            )}
          </div>
          <div className="flex gap-1 ml-2">
            {isRepresentative && <RepresentativeBadge />}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Status: {membershipStatus}</span>
            <div className="flex gap-1">
              <OrganizationStatusBadge isActive={organization.isActive} />
              <VotingStatusBadge votingEnabled={organization.votingEnabled} />
            </div>
          </div>

          {/* Current Representatives */}
          <div>
            <div className="text-sm font-medium mb-2">Current Representatives</div>
            <div className="flex -space-x-2">
              {organization.representatives?.slice(0, 3).map((repId, index) => (
                <Avatar key={repId} className="h-8 w-8 border-2 border-white">
                  <AvatarFallback className="text-xs">
                    R{index + 1}
                  </AvatarFallback>
                </Avatar>
              ))}
              {(organization.representatives?.length || 0) > 3 && (
                <Avatar className="h-8 w-8 border-2 border-white">
                  <AvatarFallback className="text-xs bg-gray-100">
                    +{(organization.representatives?.length || 0) - 3}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            <div className="text-xs text-gray-600 mt-2">
              {organization.representatives?.length || 0} representative{(organization.representatives?.length || 0) !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={() => onSelectOrganization(organization)}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Manage
            </Button>
            {isRepresentative && (
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

