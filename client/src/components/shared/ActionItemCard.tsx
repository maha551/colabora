import React from 'react';
import { Card } from '../ui/card';
import { cn } from '../ui/utils';
import { SPACING } from '../../lib/designSystem';

export type ActionItemCardVariant = 'urgent' | 'active' | 'neutral';

/** Variant backgrounds using design system (urgent=warning, active=active, neutral=info) */
const VARIANT_CLASSES: Record<ActionItemCardVariant, string> = {
  urgent: 'bg-yellow-50/50 dark:bg-yellow-950/20',
  active: 'bg-blue-50/50 dark:bg-blue-950/20',
  neutral: 'bg-purple-50/50 dark:bg-purple-950/20',
};

export interface ActionItemCardProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  variant?: ActionItemCardVariant;
  actions: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Shared card layout for action items (draft proposals, elections requiring action,
 * votes awaiting approval, documents open for amendments, etc.).
 * Provides consistent styling across RepresentativesTab subsections.
 */
export function ActionItemCard({
  title,
  description,
  badge,
  variant = 'neutral',
  actions,
  children,
  className,
}: ActionItemCardProps) {
  return (
    <Card
      className={cn(
        'flex items-center justify-between gap-4',
        SPACING.card.padding,
        VARIANT_CLASSES[variant],
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium">{title}</span>
          {badge}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {children}
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>
    </Card>
  );
}
