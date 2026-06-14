import React, { useState } from 'react';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';
import { RADIUS } from '../../lib/designSystem';

interface DocumentTreeGroupProps {
  title: string;
  count: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function DocumentTreeGroup({
  title,
  count,
  defaultExpanded = true,
  children,
  className,
}: DocumentTreeGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={cn('mb-6', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-muted rounded-t-lg border border-b-0 border-border bg-muted/40 transition-colors group"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <Icon name="ChevronDown" className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <Icon name="ChevronRight" className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
            {title}
          </h3>
        </div>
        <span className={cn("text-xs text-muted-foreground bg-muted px-2 py-0.5 flex-shrink-0 ml-2", RADIUS.pill)}>
          {count}
        </span>
      </button>
      {isExpanded && (
        <div className="mt-0 border border-t-0 border-border rounded-b-lg bg-card/50 pt-2 pb-1 px-2 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

