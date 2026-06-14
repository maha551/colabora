import { useMemo, useState, type KeyboardEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { cn } from '../../ui/utils';
import { RADIUS } from '../../../lib/designSystem';

export type SlashCommandActionKey =
  | 'paragraph'
  | 'brainstorm'
  | 'vote'
  | 'decision'
  | 'date-poll'
  | 'todo'
  | 'document';

interface SlashCommandAction {
  key: SlashCommandActionKey;
  label: string;
  description: string;
  iconName: string;
  onSelect: () => void;
}

export interface SlashCommandMenuProps {
  onAddParagraph: () => void;
  onStartBrainstorm: () => void;
  onStartVote: () => void;
  onRecordDecision: () => void;
  onAddDatePoll: () => void;
  onAddTodo: () => void;
  onAddDocument: () => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export function SlashCommandMenu({
  onAddParagraph,
  onStartBrainstorm,
  onStartVote,
  onRecordDecision,
  onAddDatePoll,
  onAddTodo,
  onAddDocument,
  className,
  disabled = false,
  ariaLabel = 'Slash command actions',
}: SlashCommandMenuProps) {
  const { t } = useTranslation('organization');
  const actions = useMemo<SlashCommandAction[]>(
    () => [
      {
        key: 'paragraph',
        label: t('protocolCanvas.blockType.paragraph', { defaultValue: 'Paragraph' }),
        description: t('protocolCanvas.slash.paragraph', { defaultValue: 'Add a standard text paragraph' }),
        iconName: 'Type',
        onSelect: onAddParagraph,
      },
      {
        key: 'brainstorm',
        label: t('protocolCanvas.blockType.brainstorm', { defaultValue: 'Brainstorm' }),
        description: t('protocolCanvas.slash.brainstorm', { defaultValue: 'Start a collaborative idea list' }),
        iconName: 'Lightbulb',
        onSelect: onStartBrainstorm,
      },
      {
        key: 'vote',
        label: t('protocolCanvas.blockType.vote', { defaultValue: 'Vote' }),
        description: t('protocolCanvas.slash.vote', { defaultValue: 'Create a structured team vote' }),
        iconName: 'Vote',
        onSelect: onStartVote,
      },
      {
        key: 'decision',
        label: t('protocolCanvas.blockType.decision', { defaultValue: 'Decision' }),
        description: t('protocolCanvas.slash.decision', { defaultValue: 'Capture an official decision' }),
        iconName: 'CheckCircle2',
        onSelect: onRecordDecision,
      },
      {
        key: 'date-poll',
        label: t('protocolCanvas.blockType.datePoll', { defaultValue: 'Date poll' }),
        description: t('protocolCanvas.slash.datePoll', { defaultValue: 'Propose candidate dates' }),
        iconName: 'Calendar',
        onSelect: onAddDatePoll,
      },
      {
        key: 'todo',
        label: t('protocolCanvas.blockType.todo', { defaultValue: 'To-do' }),
        description: t('protocolCanvas.slash.todo', { defaultValue: 'Track a follow-up action' }),
        iconName: 'ListTodo',
        onSelect: onAddTodo,
      },
      {
        key: 'document',
        label: t('protocolCanvas.blockType.document', { defaultValue: 'Document' }),
        description: t('protocolCanvas.slash.document', { defaultValue: 'Attach or reference a document' }),
        iconName: 'FileText',
        onSelect: onAddDocument,
      },
    ],
    [
      onAddDatePoll,
      onAddDocument,
      onAddParagraph,
      onAddTodo,
      onRecordDecision,
      onStartBrainstorm,
      onStartVote,
      t,
    ]
  );

  const [activeIndex, setActiveIndex] = useState(0);

  const triggerAction = (index: number): void => {
    if (disabled) return;
    const action = actions[index];
    if (!action) return;
    action.onSelect();
  };

  const onKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (!actions.length) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight': {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % actions.length);
        break;
      }
      case 'ArrowUp':
      case 'ArrowLeft': {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + actions.length) % actions.length);
        break;
      }
      case 'Home': {
        event.preventDefault();
        setActiveIndex(0);
        break;
      }
      case 'End': {
        event.preventDefault();
        setActiveIndex(actions.length - 1);
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        triggerAction(activeIndex);
        break;
      }
      default:
        break;
    }
  };

  return (
    <section
      className={cn(
        'w-full max-w-full border border-border/70 bg-background/95 p-2 shadow-sm', RADIUS.chrome,
        className
      )}
      aria-label={t('protocolCanvas.aria.slashMenu', { defaultValue: 'Protocol slash command menu' })}
    >
      <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">{t('protocolCanvas.insertBlock', { defaultValue: 'Insert block' })}</div>
      <div
        role="listbox"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-disabled={disabled}
        aria-activedescendant={disabled ? undefined : `slash-command-option-${actions[activeIndex]?.key}`}
        onKeyDown={onKeyDown}
        className={cn(
          'max-h-80 overflow-y-auto border border-border/50 bg-muted/10 p-1 outline-none', RADIUS.panel,
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
      >
        {actions.map((action, index) => {
          const isActive = !disabled && index === activeIndex;
          return (
            <button
              key={action.key}
              id={`slash-command-option-${action.key}`}
              type="button"
              role="option"
              aria-selected={isActive}
              disabled={disabled}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => triggerAction(index)}
              className={cn(
                'flex w-full max-w-full items-start gap-2 px-2 py-2 text-left', RADIUS.control,
                'transition-colors duration-100',
                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70 hover:text-accent-foreground',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              <Icon
                name={action.iconName}
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{action.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{action.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
