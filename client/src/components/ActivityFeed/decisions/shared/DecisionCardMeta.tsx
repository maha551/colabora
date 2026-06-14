import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../../../ui/avatar';
import { Icon } from '../../../ui/Icon';
import { StatusBadge } from '../../../shared/StatusBadge';
import { DECISION_CARD } from '../../../../lib/designSystem';
import { cn } from '../../../ui/utils';

interface DecisionCardMetaProps {
  children: React.ReactNode;
  className?: string;
}

function DecisionCardMetaRoot({ children, className }: DecisionCardMetaProps) {
  return <div className={cn(DECISION_CARD.meta, className)}>{children}</div>;
}

interface ActorProps {
  name: string;
  avatar?: string;
}

function Actor({ name, avatar }: ActorProps) {
  if (avatar) {
    return (
      <span className="inline-flex items-center gap-2">
        <Avatar className="h-4 w-4 shrink-0">
          <AvatarImage src={avatar} />
          <AvatarFallback className="text-xs bg-primary/10 text-foreground">
            {name.split(' ').map((n) => n[0]).join('') || 'U'}
          </AvatarFallback>
        </Avatar>
        {name}
      </span>
    );
  }
  return <span>{name}</span>;
}

interface DateProps {
  formatted: string;
}

function DateMeta({ formatted }: DateProps) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon name="Calendar" className="h-3 w-3" />
      {formatted}
    </span>
  );
}

interface StatusProps {
  status: string;
  label?: string;
  icon?: React.ReactNode;
}

function Status({ status, label, icon }: StatusProps) {
  return <StatusBadge status={status} label={label} icon={icon} />;
}

interface ChipProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
}

function Chip({ children, icon }: ChipProps) {
  return (
    <span className="inline-flex items-center gap-1 capitalize">
      {icon}
      {children}
    </span>
  );
}

export const DecisionCardMeta = Object.assign(DecisionCardMetaRoot, {
  Actor,
  Date: DateMeta,
  Status,
  Chip,
});
