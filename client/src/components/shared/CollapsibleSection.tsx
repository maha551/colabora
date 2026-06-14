import React from 'react';
import { Badge } from '../ui/badge';
import { Icon } from '../ui/Icon';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { cn } from '../ui/utils';

export interface CollapsibleSectionProps {
  title: string;
  iconName?: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Collapsible subsection with consistent header: icon, title, count badge, expand/collapse chevron.
 * Used to group subsections in Representative Actions.
 */
export function CollapsibleSection({
  title,
  iconName,
  count,
  defaultOpen = true,
  children,
  className,
}: CollapsibleSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn('space-y-2', className)}>
      <CollapsibleTrigger className="group flex items-center gap-2 w-full text-left font-semibold hover:opacity-80 transition-opacity">
        {iconName && <Icon name={iconName} className="h-4 w-4" />}
        <span>{title}</span>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="ml-2">
            {count}
          </Badge>
        )}
        <Icon name="ChevronDown" className="h-4 w-4 ml-auto group-data-[state=open]:hidden" />
        <Icon name="ChevronUp" className="h-4 w-4 ml-auto hidden group-data-[state=open]:block" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
