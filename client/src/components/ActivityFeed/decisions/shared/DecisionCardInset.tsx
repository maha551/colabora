import React from 'react';
import { DECISION_CARD } from '../../../../lib/designSystem';
import { cn } from '../../../ui/utils';

interface DecisionCardInsetProps {
  children: React.ReactNode;
  className?: string;
}

export function DecisionCardInset({ children, className }: DecisionCardInsetProps) {
  return <div className={cn(DECISION_CARD.inset, className)}>{children}</div>;
}
