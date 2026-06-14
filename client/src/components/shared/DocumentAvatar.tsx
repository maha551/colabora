import React from 'react';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { getDocumentInitials } from '../../utils/documentUtils';
import { cn } from '../ui/utils';

interface DocumentAvatarProps {
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
};

export function DocumentAvatar({ 
  title, 
  description, 
  size = 'md',
  className 
}: DocumentAvatarProps) {
  const initials = getDocumentInitials(title);
  const sizeClass = sizeClasses[size];
  
  const avatar = (
    <Avatar className={cn(sizeClass, className)} aria-label={title}>
      <AvatarFallback className="bg-muted text-muted-foreground font-semibold border border-border">
        {initials}
      </AvatarFallback>
    </Avatar>
  );

  // If no description, just return the avatar without tooltip
  if (!description || description.trim().length === 0) {
    return avatar;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {avatar}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-primary-foreground/90">{description}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
