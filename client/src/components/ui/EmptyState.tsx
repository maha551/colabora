import { ReactNode } from 'react';
import { Card } from './card';
import { SPACING, COLORS, RADIUS } from '../../lib/designSystem';
import { cn } from './utils';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Shared empty state for "no data" and "no results" screens.
 * Use consistent icon size (e.g. h-16 w-16), padding (py-16), and text hierarchy.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn(SPACING.card.padding, 'text-center py-16 border border-border', RADIUS.panel, className)}>
      <div className={cn(COLORS.text.secondary, SPACING.content.gap)}>
        <div className="h-16 w-16 flex items-center justify-center mx-auto text-muted-foreground/70">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm max-w-md mx-auto">{description}</p>}
        {action && <div className={cn(SPACING.section.top, 'flex justify-center')}>{action}</div>}
      </div>
    </Card>
  );
}
