import React from 'react';
import { DECISION_CARD } from '../../../../lib/designSystem';
import { cn } from '../../../ui/utils';

interface DecisionCardActionsProps {
  children: React.ReactNode;
  className?: string;
}

export function DecisionCardActions({ children, className }: DecisionCardActionsProps) {
  return <div className={cn(DECISION_CARD.actions, className)}>{children}</div>;
}
