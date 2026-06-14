import React from 'react';
import { Button } from '../../../ui/button';
import { DECISION_CARD } from '../../../../lib/designSystem';
import { cn } from '../../../ui/utils';

interface DecisionCardLinkProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

export function DecisionCardLink({ onClick, children, className }: DecisionCardLinkProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(DECISION_CARD.link, className)}
    >
      {children}
    </Button>
  );
}
