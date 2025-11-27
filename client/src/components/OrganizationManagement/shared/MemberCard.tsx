import React from 'react';
import { Avatar, AvatarFallback } from '../../ui/avatar';
import { Badge } from '../../ui/badge';
import { MembershipStatusBadge, RepresentativeRoleBadge } from './StatusBadges';
import { Organization } from '../../../types';

interface Member {
  id: string;
  userId: string;
  status: 'active' | 'legacy';
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
  };
}

interface MemberCardProps {
  member: Member;
  organization: Organization;
  className?: string;
}

export function MemberCard({ member, organization, className }: MemberCardProps) {
  const isRepresentative = organization.representatives?.includes(member.userId) || false;
  const isLegacy = member.status === 'legacy';

  return (
    <div className={`flex items-center justify-between p-3 border rounded-lg ${isLegacy ? 'opacity-60' : ''} ${className || ''}`}>
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback>
            {member.user.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="font-medium">{member.user.name}</div>
          <div className="text-sm text-gray-500">
            {isLegacy 
              ? 'Legacy member'
              : `Joined ${new Date(member.joinedAt).toLocaleDateString()}`
            }
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isRepresentative && (
          <RepresentativeRoleBadge />
        )}
        <MembershipStatusBadge status={member.status} />
      </div>
    </div>
  );
}

