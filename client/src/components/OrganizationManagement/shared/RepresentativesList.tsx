import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '../../ui/avatar';
import { Icon } from '../../ui/Icon';
import { Organization, User } from '../../../types';
import { useTimezone } from '../../../hooks/useTimezone';
import { getUserColor } from '../../../lib/userColors';
import { RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';

interface RepresentativesListProps {
  organization: Organization;
  currentUser: User;
  onNavigateToMemberProfile?: (userId: string, organizationId?: string) => void;
}

export function RepresentativesList({ organization, currentUser, onNavigateToMemberProfile }: RepresentativesListProps) {
  const { t } = useTranslation('organization');
  const { formatDate } = useTimezone();
  const representatives = organization.representatives || [];
  const currentRepCount = representatives.length;

  const getRepresentativeMember = (repId: string) => {
    return organization.members?.find(m => m.userId === repId);
  };

  if (currentRepCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="Users" className="h-5 w-5 text-[var(--badge-purple-text)]" />
            {t('representativesCount', { count: currentRepCount })}
          </CardTitle>
          <CardDescription>
            {t('representativesListDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('noRepresentativesAssigned')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="Users" className="h-5 w-5 text-[var(--badge-purple-text)]" />
          {t('representativesCount', { count: currentRepCount })}
        </CardTitle>
        <CardDescription>
          {t('representativesListContactDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {representatives.map((repId) => {
            const member = getRepresentativeMember(repId);
            const user = member?.user;
            const displayName = user?.name || t('representativeFallbackName', { index: representatives.indexOf(repId) + 1 });
            const email = user?.email || '';
            const avatar = user?.avatar;
            const initials = displayName
              .split(' ')
              .map(n => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);
            const isCurrentUser = repId === currentUser.id;

            return (
              <div
                key={repId}
                className={cn(RADIUS.panel, "p-4 border bg-card hover:shadow-md transition-all duration-200 border-border", onNavigateToMemberProfile ? 'cursor-pointer' : '')}
                onClick={onNavigateToMemberProfile && user ? () => onNavigateToMemberProfile(repId, organization.id) : undefined}
              >
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-12 w-12 border-2" style={{ borderColor: getUserColor(repId) }}>
                      {avatar ? (
                        <AvatarImage src={avatar} alt={displayName} />
                      ) : null}
                      <AvatarFallback className="bg-gradient-to-br from-purple-400 to-purple-600 text-white text-sm font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {isCurrentUser && (
                      <div className="absolute -top-1 -right-1">
                        <Badge variant="default" className="text-xs px-1.5 py-0.5">
                          {t('you')}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`font-semibold text-base text-foreground truncate ${onNavigateToMemberProfile ? 'hover:text-purple-600' : ''}`}>
                        {displayName}
                      </h3>
                    </div>
                    {member?.status && (
                      <Badge
                        variant={member.status === 'active' ? 'default' : 'secondary'}
                        className="text-xs bg-purple-100 text-purple-800 mb-2"
                      >
                        {member.status === 'active' ? t('activeMember') : t('legacyMember')}
                      </Badge>
                    )}

                    {email && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Icon name="Mail" className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <a
                            href={`mailto:${email}`}
                            className="hover:text-purple-600 hover:underline truncate transition-colors"
                            title={email}
                          >
                            {email}
                          </a>
                        </div>
                        {member?.joinedAt && (
                          <div className="text-xs text-muted-foreground">
                            {t('joinedOn', {
                              date: formatDate(member.joinedAt, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              }),
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
