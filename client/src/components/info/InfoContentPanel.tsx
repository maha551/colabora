import type { ReactNode } from 'react';
import { ELEVATION, RADIUS, SPACING } from '../../lib/designSystem';
import { cn } from '../ui/utils';

interface InfoContentPanelProps {
  children: ReactNode;
  className?: string;
  /** Tighter padding for dense grids (hub cards live outside this). */
  compact?: boolean;
}

export function InfoContentPanel({ children, className, compact }: InfoContentPanelProps) {
  return (
    <div
      className={cn(
        'border border-border/70 bg-card/95 backdrop-blur-sm',
        RADIUS.panel,
        ELEVATION.card,
        compact ? 'p-4 md:p-5' : SPACING.card.padding,
        className
      )}
    >
      {children}
    </div>
  );
}
