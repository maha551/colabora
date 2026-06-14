import React from 'react';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/Icon';
import { COLORS } from '../../../lib/designSystem';

interface OrganizationStatusBadgeProps {
  isActive: boolean;
  variant?: 'default' | 'secondary';
  className?: string;
}

export function OrganizationStatusBadge({ isActive, variant, className }: OrganizationStatusBadgeProps) {
  return (
    <Badge variant={isActive ? variant || 'default' : 'secondary'} className={className}>
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
}

interface VotingStatusBadgeProps {
  votingEnabled: boolean;
  className?: string;
}

export function VotingStatusBadge({ votingEnabled, className }: VotingStatusBadgeProps) {
  if (!votingEnabled) return null;
  
  return (
    <Badge variant="outline" className={`${COLORS.status.success} border-[var(--status-approved-border)] ${className || ''}`}>
      <Icon name="Vote" className="h-3 w-3 mr-1" />
      Voting
    </Badge>
  );
}

interface MembershipStatusBadgeProps {
  status: 'active' | 'legacy';
  className?: string;
}

export function MembershipStatusBadge({ status, className }: MembershipStatusBadgeProps) {
  return (
    <Badge 
      variant={status === 'active' ? 'secondary' : 'outline'} 
      className={`text-xs ${className || ''}`}
    >
      {status === 'active' ? 'Active' : 'Legacy'}
    </Badge>
  );
}

interface RepresentativeBadgeProps {
  className?: string;
}

export function RepresentativeBadge({ className }: RepresentativeBadgeProps) {
  return (
    <Badge variant="secondary" className={`text-xs ${className || ''}`}>
      Rep
    </Badge>
  );
}

interface RepresentativeRoleBadgeProps {
  className?: string;
}

export function RepresentativeRoleBadge({ className }: RepresentativeRoleBadgeProps) {
  return (
    <Badge variant="default" className={`bg-purple-100 text-purple-800 ${className || ''}`}>
      Representative
    </Badge>
  );
}

