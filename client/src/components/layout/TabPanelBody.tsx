import React from 'react';
import { PANEL } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export interface TabPanelBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function TabPanelBody({ children, className }: TabPanelBodyProps) {
  return <div className={cn(PANEL.body, className)}>{children}</div>;
}
