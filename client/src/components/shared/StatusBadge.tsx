/**
 * StatusBadge - Unified status badge using design system STATUS_COLORS.
 * Replaces ad-hoc Badge usage across voting, election, rule, and proposal cards.
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { getStatusColor } from '../../lib/statusColors';
import { cn } from '../ui/utils';

export interface StatusBadgeProps {
  /** Status key (draft, active, approved, etc.) - maps to STATUS_COLORS */
  status: string;
  /** Optional icon to show before label */
  icon?: React.ReactNode;
  /** Override display label (default: capitalized status) */
  label?: string;
  /** Additional class names */
  className?: string;
}

/** Maps status keys to display labels */
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  proposed: 'Proposed',
  announced: 'Announced',
  nomination: 'Nomination',
  active: 'Active',
  voting: 'Voting',
  approved: 'Approved',
  passed: 'Passed',
  rejected: 'Rejected',
  failed: 'Failed',
  expired: 'Expired',
  completed: 'Completed',
  cancelled: 'Cancelled',
  recorded: 'Recorded',
  implemented: 'Implemented',
  applied: 'Applied',
};

export function StatusBadge({ status, icon, label, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const colors = getStatusColor(normalizedStatus);
  const displayLabel =
    label ?? STATUS_LABELS[normalizedStatus] ?? status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <Badge variant="secondary" className={cn('text-xs', colors.badge, className)}>
      {icon && <span className="mr-1">{icon}</span>}
      {displayLabel}
    </Badge>
  );
}
