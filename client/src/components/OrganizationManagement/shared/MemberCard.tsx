import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar';
import { MembershipStatusBadge, RepresentativeRoleBadge } from './StatusBadges';
import { Organization } from '../../../types';
import { useTimezone } from '../../../hooks/useTimezone';
import { getUserColor } from '../../../lib/userColors';
import { RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';

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
  currentUserId?: string;
  onMemberClick?: () => void;
  onRemove?: (userId: string) => void;
  onLeave?: () => void;
  canManage?: boolean;
}

export function MemberCard({ member, organization, className, currentUserId, onMemberClick, onRemove, onLeave, canManage }: MemberCardProps) {
  const { t } = useTranslation('organization');
  const { formatDate } = useTimezone();
  const isRepresentative = organization.representatives?.includes(member.userId) || false;
  const isLegacy = member.status === 'legacy';
  const isSelf = currentUserId != null && member.userId === currentUserId;

  return (
    <div 
      className={cn(RADIUS.panel, "flex items-center justify-between p-3 border", isLegacy ? 'opacity-60' : '', onMemberClick ? 'cursor-pointer hover:bg-muted transition-colors' : '', className || '')}
      onClick={onMemberClick}
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 border-2" style={{ borderColor: getUserColor(member.user.id) }}>
          <AvatarImage src={member.user.avatar || undefined} />
          <AvatarFallback>
            {member.user.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="font-medium">{member.user.name}</div>
          <div className="text-sm text-muted-foreground">
            {isLegacy 
              ? 'Legacy member'
              : `Joined ${formatDate(member.joinedAt)}`
            }
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isRepresentative && (
          <RepresentativeRoleBadge />
        )}
        <MembershipStatusBadge status={member.status} />
        {isSelf && onLeave && member.status === 'active' && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onLeave();
            }}
          >
            {t('membersTab.leaveOrganization')}
          </Button>
        )}
        {canManage && onRemove && member.status === 'active' && !isRepresentative && !isSelf && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(member.userId);
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

