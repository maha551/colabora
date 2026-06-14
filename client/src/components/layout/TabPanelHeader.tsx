import React from 'react';
import { PANEL } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export interface TabPanelHeaderProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** divider = bottom border row (e.g. dashboard summary chips without a title) */
  variant?: 'default' | 'divider';
  className?: string;
  children?: React.ReactNode;
}

export function TabPanelHeader({
  title,
  subtitle,
  actions,
  variant = 'default',
  className,
  children,
}: TabPanelHeaderProps) {
  const hasTitleBlock = title != null || subtitle != null;

  return (
    <div
      className={cn(
        variant === 'divider' ? PANEL.header.divider : PANEL.header.marginBottom,
        className
      )}
    >
      {hasTitleBlock && (
        <div className={PANEL.header.row}>
          <div className="min-w-0">
            {title != null && (
              typeof title === 'string' ? (
                <h2 className={PANEL.header.title}>{title}</h2>
              ) : (
                <div className={PANEL.header.title}>{title}</div>
              )
            )}
            {subtitle != null && (
              typeof subtitle === 'string' ? (
                <p className={PANEL.header.subtitle}>{subtitle}</p>
              ) : (
                <div className={PANEL.header.subtitle}>{subtitle}</div>
              )
            )}
          </div>
          {actions != null && (
            <div className="shrink-0 flex items-center gap-2 flex-wrap">{actions}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
