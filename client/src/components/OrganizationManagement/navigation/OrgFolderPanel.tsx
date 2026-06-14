import React from 'react';
import { cn } from '../../ui/utils';
import { NAVIGATION } from '../../../lib/designSystem';
import './org-folder-nav.css';

export interface OrgFolderPanelProps {
  children: React.ReactNode;
  secondaryNav?: React.ReactNode;
  className?: string;
}

export function OrgFolderPanel({ children, secondaryNav, className }: OrgFolderPanelProps) {
  return (
    <div className={cn(NAVIGATION.folderTabs.panel, className)}>
      {secondaryNav}
      <div className={NAVIGATION.folderTabs.panelContent}>{children}</div>
    </div>
  );
}
