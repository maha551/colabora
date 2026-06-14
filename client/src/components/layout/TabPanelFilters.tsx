import React from 'react';
import { PANEL } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export interface TabPanelFiltersProps {
  children: React.ReactNode;
  /** default = toolbar row; centered = centered controls (activity filter, collaborators) */
  align?: 'default' | 'centered';
  className?: string;
  /** When false, omit bottom margin (e.g. last row before content inside same block) */
  withMarginBottom?: boolean;
}

export function TabPanelFilters({
  children,
  align = 'default',
  className,
  withMarginBottom = true,
}: TabPanelFiltersProps) {
  return (
    <div
      className={cn(
        align === 'centered' ? PANEL.filters.rowCentered : PANEL.filters.row,
        withMarginBottom && PANEL.filters.marginBottom,
        className
      )}
    >
      {children}
    </div>
  );
}
