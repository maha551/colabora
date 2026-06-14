import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { DEFAULT_ORGANIZATION_COLOR } from '../../lib/constants';
import {
  getOrganizationInitials,
  type OrganizationAvatarData,
} from '../../utils/organizationUtils';
import { shouldUseLightText } from '../../utils/colorUtils';
import { cn } from '../ui/utils';

interface OrganizationAvatarProps {
  organization: OrganizationAvatarData;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  description?: string;
}

const sizeClasses = {
  xs: 'h-4 w-4 text-[10px]',
  sm: 'h-5 w-5 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
};

export function OrganizationAvatar({
  organization,
  size = 'md',
  className,
  description,
}: OrganizationAvatarProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const initials = getOrganizationInitials(organization.name);
  const backgroundColor = organization.brandingColor || DEFAULT_ORGANIZATION_COLOR;
  const textColor = shouldUseLightText(backgroundColor) ? 'var(--color-white)' : 'var(--foreground)';
  const sizeClass = sizeClasses[size];
  const showLogo = organization.brandingLogoUrl && !logoFailed;

  const avatar = (
    <Avatar className={cn(sizeClass, className)} aria-label={organization.name}>
      {showLogo ? (
        <AvatarImage
          src={organization.brandingLogoUrl}
          alt=""
          className="object-contain"
          onError={() => setLogoFailed(true)}
        />
      ) : null}
      <AvatarFallback
        className="font-semibold border border-border/40"
        style={{ backgroundColor, color: textColor }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );

  if (!description || description.trim().length === 0) {
    return avatar;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          <p className="font-semibold">{organization.name}</p>
          <p className="text-sm text-primary-foreground/90">{description}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
