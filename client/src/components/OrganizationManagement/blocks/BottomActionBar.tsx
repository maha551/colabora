import React from 'react';
import { Button } from '../../ui/button';
import { Icon } from '../../ui/Icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu';
import { cn } from '../../ui/utils';
import { Z_INDEX } from '../../../lib/designSystem';

export interface BottomActionBarProps {
  isEmbed: boolean;
  isModerator: boolean;
  hasMinutesDocument: boolean;
  minutesFinalized: boolean;
  startBrainstormSubmitting: boolean;
  onAddAgendaItem: () => void;
  onAddParagraph: () => void;
  onAddTodo: () => void;
  onStartVote: () => void;
  onStartBrainstorm: () => void;
  onDateDecided: () => void;
  onDocumentCreated: () => void;
  onRecordDecision: () => void;
  moderatorIsRecordingLabel: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function BottomActionBar({
  isEmbed,
  isModerator,
  hasMinutesDocument,
  minutesFinalized,
  startBrainstormSubmitting,
  onAddAgendaItem,
  onAddParagraph,
  onAddTodo,
  onStartVote,
  onStartBrainstorm,
  onDateDecided,
  onDocumentCreated,
  onRecordDecision,
  moderatorIsRecordingLabel,
  t,
}: BottomActionBarProps) {
  const disabled = minutesFinalized;

  const barPadding = `px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]`;

  return (
    <div
      className={cn(
        `sticky bottom-0 ${Z_INDEX.sticky} border-t border-border/60 bg-background/95 backdrop-blur-sm`,
        barPadding,
        isEmbed && 'flex-none',
      )}
    >
      {isModerator ? (
        <div className="flex flex-wrap items-center gap-2 pb-1">
          {/* Primary actions — always visible */}
          <Button variant="outline" size="sm" className="whitespace-nowrap" disabled={disabled} onClick={onAddAgendaItem}>
            <Icon name="Plus" className="h-4 w-4 mr-2 shrink-0" />{t('addAgendaItem')}
          </Button>
          <div className="hidden md:flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="whitespace-nowrap" disabled={disabled || !hasMinutesDocument} onClick={onAddParagraph}>
              <Icon name="Plus" className="h-4 w-4 mr-2 shrink-0" />{t('addParagraph')}
            </Button>
            <Button variant="outline" size="sm" className="whitespace-nowrap" disabled={disabled} onClick={onRecordDecision}>
              <Icon name="CheckCircle2" className="h-4 w-4 mr-2 shrink-0" />{t('recordDecision', { defaultValue: 'Record decision' })}
            </Button>
            <Button variant="outline" size="sm" className="whitespace-nowrap" disabled={disabled} onClick={onAddTodo}>
              <Icon name="ListOrdered" className="h-4 w-4 mr-2 shrink-0" />{t('addTodo', { defaultValue: 'Add to-do' })}
            </Button>
          </div>

          {/* "More" dropdown — secondary actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Icon name="MoreHorizontal" className="h-4 w-4 mr-2" />{t('actions')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="md:hidden" disabled={disabled || !hasMinutesDocument} onClick={onAddParagraph}>
                <Icon name="Plus" className="h-4 w-4 mr-2" />{t('addParagraph')}
              </DropdownMenuItem>
              <DropdownMenuItem className="md:hidden" disabled={disabled} onClick={onRecordDecision}>
                <Icon name="CheckCircle2" className="h-4 w-4 mr-2" />{t('recordDecision', { defaultValue: 'Record decision' })}
              </DropdownMenuItem>
              <DropdownMenuItem className="md:hidden" disabled={disabled} onClick={onAddTodo}>
                <Icon name="ListOrdered" className="h-4 w-4 mr-2" />{t('addTodo', { defaultValue: 'Add to-do' })}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabled} onClick={onStartVote}>
                <Icon name="Vote" className="h-4 w-4 mr-2" />{t('startVote')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabled || startBrainstormSubmitting} onClick={onStartBrainstorm}>
                <Icon name="Lightbulb" className="h-4 w-4 mr-2" />{startBrainstormSubmitting ? t('saving') : t('startBrainstorm')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabled} onClick={onDateDecided}>
                <Icon name="Calendar" className="h-4 w-4 mr-2" />{t('decideOnDate')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabled} onClick={onDocumentCreated}>
                <Icon name="FileText" className="h-4 w-4 mr-2" />{t('newDocument')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : hasMinutesDocument && !minutesFinalized ? (
        <p className="pb-1 text-xs text-muted-foreground">{moderatorIsRecordingLabel}</p>
      ) : null}
    </div>
  );
}
