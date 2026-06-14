import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { Icon } from '../../../ui/Icon';
import { DECISION_CARD } from '../../../../lib/designSystem';
import { cn } from '../../../ui/utils';

interface DecisionCardShellProps {
  icon: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  organizationBorderColor?: string | null;
  voteBar?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export function DecisionCardShell({
  icon,
  title,
  meta,
  organizationBorderColor,
  voteBar,
  children,
  footer,
}: DecisionCardShellProps) {
  const cardStyle = organizationBorderColor
    ? { borderColor: organizationBorderColor, borderWidth: '2px' as const }
    : undefined;

  return (
    <Card
      className={cn(DECISION_CARD.root, !organizationBorderColor && DECISION_CARD.elevated)}
      style={cardStyle}
    >
      {voteBar && <div className={DECISION_CARD.voteBar}>{voteBar}</div>}
      <CardHeader className={DECISION_CARD.header}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Icon name={icon} className={cn(DECISION_CARD.icon, 'shrink-0 text-muted-foreground')} />
            <div className="min-w-0 flex-1">
              <CardTitle className={DECISION_CARD.title}>{title}</CardTitle>
              {meta}
            </div>
          </div>
        </div>
      </CardHeader>
      {(children || footer) && (
        <CardContent className={DECISION_CARD.content}>
          {children}
          {footer && <div className={DECISION_CARD.footer}>{footer}</div>}
        </CardContent>
      )}
    </Card>
  );
}
