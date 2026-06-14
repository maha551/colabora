import { useTranslation } from 'react-i18next';
import type { ProfileMembership, ProfileLink, User } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Icon } from './ui/Icon';
import { getUserColor } from '../lib/userColors';
import { RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';
import { MembershipStatusBadge, RepresentativeRoleBadge } from './OrganizationManagement/shared/StatusBadges';
import { useTimezone } from '../hooks/useTimezone';

interface MemberProfileViewProps {
  user: User;
  memberships?: ProfileMembership[];
  contextOrganization?: ProfileMembership;
  isPreview?: boolean;
  onNavigateToOrganization?: (organizationId: string) => void;
}

function linkIcon(_type: ProfileLink['type']) {
  return 'Link' as const;
}

function formatLocation(location: NonNullable<ProfileMembership['location']>) {
  const parts = [location.city];
  if (location.region) parts.push(location.region);
  return parts.join(', ');
}

function formatLocalTime(timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date());
  } catch {
    return '';
  }
}

export function MemberProfileView({
  user,
  memberships = [],
  contextOrganization,
  isPreview = false,
  onNavigateToOrganization,
}: MemberProfileViewProps) {
  const { t } = useTranslation('profile');
  const { formatDate } = useTimezone();

  const initials = user.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const headline = user.profileData?.headline?.trim();
  const links = user.profileData?.links || [];
  const contact = user.profileData?.contact;
  const tags = user.profileData?.tags;
  const otherMemberships = contextOrganization
    ? memberships.filter((m) => m.organizationId !== contextOrganization.organizationId)
    : memberships;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="User" className="h-5 w-5" />
            {t('memberProfile')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <Avatar className="h-24 w-24 border-2" style={{ borderColor: getUserColor(user.id) }}>
              <AvatarImage src={user.avatar || undefined} />
              <AvatarFallback className="text-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold text-foreground">{user.name}</h2>
              {headline && (
                <p className="text-muted-foreground">{headline}</p>
              )}
            </div>
          </div>

          {user.timezone && (
            <p className="text-sm text-muted-foreground text-center">
              {t('localTime', { time: formatLocalTime(user.timezone), timezone: user.timezone })}
            </p>
          )}

          {user.bio?.trim() && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('bio')}</label>
              <div className={cn('text-foreground whitespace-pre-wrap bg-muted p-3 border border-border', RADIUS.control)}>
                {user.bio}
              </div>
            </div>
          )}

          {links.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('linksSection')}</label>
              <div className="flex flex-wrap gap-2">
                {links.map((link, index) => (
                  <a
                    key={`${link.url}-${index}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn('inline-flex items-center gap-2 px-3 py-2 text-sm border border-border hover:bg-muted', RADIUS.control)}
                  >
                    <Icon name={linkIcon(link.type)} className="h-4 w-4" />
                    {link.type === 'custom' ? link.label : link.type}
                  </a>
                ))}
              </div>
            </div>
          )}

          {contact && (contact.phone || contact.email) && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('contactSection')}</label>
              <div className="space-y-1 text-sm text-foreground">
                {contact.phone && <div>{contact.phone}</div>}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">
                    {contact.email}
                  </a>
                )}
              </div>
            </div>
          )}

          {tags && (tags.interests?.length > 0 || tags.skills?.length > 0) && (
            <div className="space-y-3">
              {tags.interests?.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t('interests')}</label>
                  <div className="flex flex-wrap gap-2">
                    {tags.interests.map((tag) => (
                      <span key={tag} className={cn('px-2 py-1 text-sm bg-muted border border-border', RADIUS.control)}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
              {tags.skills?.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t('skills')}</label>
                  <div className="flex flex-wrap gap-2">
                    {tags.skills.map((tag) => (
                      <span key={tag} className={cn('px-2 py-1 text-sm bg-muted border border-border', RADIUS.control)}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {contextOrganization && !isPreview && (
            <div className={cn('space-y-3 p-4 border border-border bg-muted/30', RADIUS.control)}>
              <h3 className="text-sm font-semibold">{t('inOrganization', { name: contextOrganization.organizationName })}</h3>
              <div className="flex flex-wrap items-center gap-2">
                {contextOrganization.isRepresentative ? (
                  <RepresentativeRoleBadge />
                ) : (
                  <span className="text-sm text-muted-foreground">{t('member')}</span>
                )}
                <MembershipStatusBadge status={contextOrganization.status === 'suspended' ? 'legacy' : contextOrganization.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('joined', { date: formatDate(contextOrganization.joinedAt) })}
              </p>
              {contextOrganization.location && (
                <p className="text-sm text-foreground">
                  {t('location')}: {formatLocation(contextOrganization.location)}
                </p>
              )}
            </div>
          )}

          {otherMemberships.length > 0 && !isPreview && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('alsoIn')}</label>
              <div className="flex flex-wrap gap-2">
                {otherMemberships.map((membership) => (
                  onNavigateToOrganization ? (
                    <button
                      key={membership.organizationId}
                      type="button"
                      onClick={() => onNavigateToOrganization(membership.organizationId)}
                      className={cn('px-3 py-1 text-sm border border-border hover:bg-muted', RADIUS.control)}
                    >
                      {membership.organizationName}
                    </button>
                  ) : (
                    <span key={membership.organizationId} className={cn('px-3 py-1 text-sm bg-muted border border-border', RADIUS.control)}>
                      {membership.organizationName}
                    </span>
                  )
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
