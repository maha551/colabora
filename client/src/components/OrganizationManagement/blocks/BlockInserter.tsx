import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Icon } from '../../ui/Icon';
import { cn } from '../../ui/utils';
import { RADIUS } from '../../../lib/designSystem';

type BlockInserterActionKey =
  | 'paragraph'
  | 'brainstorm'
  | 'vote'
  | 'decision'
  | 'date'
  | 'todo'
  | 'document';

interface BlockInserterAction {
  key: BlockInserterActionKey;
  label: string;
  iconName: string;
  onSelect: () => void;
  ariaLabel: string;
}

export interface BlockInserterProps {
  onAddParagraph: () => void;
  onStartBrainstorm: () => void;
  onStartVote: () => void;
  onRecordDecision: () => void;
  onAddDatePoll: () => void;
  onAddTodo: () => void;
  onAddDocument: () => void;
  className?: string;
  disabled?: boolean;
  defaultExpanded?: boolean;
  triggerLabel?: string;
  actionsLabel?: string;
  actionLabels?: Partial<Record<BlockInserterActionKey, string>>;
  /** Per-action disable (e.g. brainstorm submitting without blocking paragraph insert). */
  actionDisabled?: Partial<Record<BlockInserterActionKey, boolean>>;
}

export function BlockInserter({
  onAddParagraph,
  onStartBrainstorm,
  onStartVote,
  onRecordDecision,
  onAddDatePoll,
  onAddTodo,
  onAddDocument,
  className,
  disabled = false,
  defaultExpanded = false,
  triggerLabel = 'Add',
  actionsLabel = 'Insert protocol block',
  actionLabels,
  actionDisabled,
}: BlockInserterProps) {
  const { t } = useTranslation('organization');
  const [expanded, setExpanded] = useState(defaultExpanded);
  const actionGroupId = useId();

  const actions: BlockInserterAction[] = [
    {
      key: 'paragraph',
      label: actionLabels?.paragraph ?? t('protocolCanvas.blockType.paragraph', { defaultValue: 'Paragraph' }),
      iconName: 'Type',
      onSelect: onAddParagraph,
      ariaLabel: t('protocolCanvas.aria.addParagraphBlock', { defaultValue: 'Add paragraph block' }),
    },
    {
      key: 'brainstorm',
      label: actionLabels?.brainstorm ?? t('protocolCanvas.blockType.brainstorm', { defaultValue: 'Brainstorm' }),
      iconName: 'Lightbulb',
      onSelect: onStartBrainstorm,
      ariaLabel: t('protocolCanvas.aria.addBrainstormBlock', { defaultValue: 'Add brainstorm block' }),
    },
    {
      key: 'vote',
      label: actionLabels?.vote ?? t('protocolCanvas.blockType.vote', { defaultValue: 'Vote' }),
      iconName: 'Vote',
      onSelect: onStartVote,
      ariaLabel: t('protocolCanvas.aria.addVoteBlock', { defaultValue: 'Add vote block' }),
    },
    {
      key: 'decision',
      label: actionLabels?.decision ?? t('protocolCanvas.blockType.decision', { defaultValue: 'Decision' }),
      iconName: 'CheckCircle2',
      onSelect: onRecordDecision,
      ariaLabel: t('protocolCanvas.aria.addDecisionBlock', { defaultValue: 'Add decision block' }),
    },
    {
      key: 'date',
      label: actionLabels?.date ?? t('protocolCanvas.blockType.datePoll', { defaultValue: 'Date' }),
      iconName: 'Calendar',
      onSelect: onAddDatePoll,
      ariaLabel: t('protocolCanvas.aria.addDateBlock', { defaultValue: 'Add date block' }),
    },
    {
      key: 'todo',
      label: actionLabels?.todo ?? t('protocolCanvas.blockType.todo', { defaultValue: 'To-do' }),
      iconName: 'ListTodo',
      onSelect: onAddTodo,
      ariaLabel: t('protocolCanvas.aria.addTodoBlock', { defaultValue: 'Add to-do block' }),
    },
    {
      key: 'document',
      label: actionLabels?.document ?? t('protocolCanvas.blockType.document', { defaultValue: 'Document' }),
      iconName: 'FileText',
      onSelect: onAddDocument,
      ariaLabel: t('protocolCanvas.aria.addDocumentBlock', { defaultValue: 'Add document block' }),
    },
  ];

  const handleAction = (action: BlockInserterAction): void => {
    if (disabled) return;
    action.onSelect();
  };

  return (
    <section
      className={cn(
        'w-full border border-dashed border-border/70 bg-muted/20 p-3', RADIUS.chrome,
        'sm:p-3.5',
        className
      )}
      aria-label={t('protocolCanvas.aria.blockInserter', { defaultValue: 'Protocol block inserter' })}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={actionGroupId}
          aria-label={expanded
            ? t('protocolCanvas.aria.hideQuickInsert', { defaultValue: 'Hide quick insert actions' })
            : t('protocolCanvas.aria.showQuickInsert', { defaultValue: 'Show quick insert actions' })}
          className="h-8 px-3"
        >
          <Icon
            name={expanded ? 'Minus' : 'Plus'}
            className="mr-1.5 h-3.5 w-3.5"
            aria-hidden="true"
          />
          + {triggerLabel}
        </Button>
      </div>

      <div
        id={actionGroupId}
        role="group"
        aria-label={actionsLabel}
        className={cn(
          'transition-all duration-150 ease-out overflow-hidden',
          expanded ? 'mt-3 max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="flex w-full flex-wrap items-center gap-2">
          {actions.map((action) => (
            <Button
              key={action.key}
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled || Boolean(actionDisabled?.[action.key])}
              onClick={() => handleAction(action)}
              aria-label={action.ariaLabel}
              title={action.label}
              className={cn(
                'h-8 px-3 text-xs sm:text-sm', RADIUS.pill,
                'max-w-full shrink-0'
              )}
            >
              <Icon name={action.iconName} className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
