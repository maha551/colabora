import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../ui/badge';
import { useTimezone } from '../../../../hooks/useTimezone';
import { Button } from '../../../ui/button';
import { cn } from '../../../ui/utils';
import { toast } from 'sonner';
import type { TimelineTodoItem } from '../../../../lib/api/types/meetingMinutes';
import type { TodoProtocolBlock } from '../protocolBlocks.types';
import { trackProtocolCanvasAnalytics } from '../protocolCanvasAnalytics';
import { protocolUi } from '../protocolUi';
import { RADIUS } from '../../../../lib/designSystem';

export interface TodoBlockProps {
  block: TodoProtocolBlock;
  className?: string;
  onEditTodo?: (todo: TimelineTodoItem) => void;
  onDeleteTodo?: (todoId: string) => void;
  onStatusChange?: (todoId: string, status: string) => void;
}

function formatDueDate(
  value: string | undefined,
  t: (k: string, o?: { defaultValue?: string }) => string,
  formatDate: (date: Date | string | undefined | null) => string,
): string {
  if (!value) {
    return t('protocolCanvas.todoNoDueDate', { defaultValue: 'No due date' });
  }

  const formatted = formatDate(value, { year: 'numeric', month: 'short', day: '2-digit' });
  return formatted || value;
}

function isDueOverdue(
  dueDate: string | undefined,
  status: string | undefined,
  getDateKey: (date: Date | string | undefined | null) => string,
): boolean {
  if (!dueDate) return false;
  const normalized = status?.trim().toLowerCase() ?? '';
  if (normalized === 'done' || normalized === 'completed' || normalized === 'closed') {
    return false;
  }
  const dueKey = getDateKey(dueDate);
  const todayKey = getDateKey(new Date());
  return Boolean(dueKey && todayKey && dueKey < todayKey);
}

function getOwnerLabel(todo: TimelineTodoItem): string {
  if (todo.responsibleUserName && todo.responsibleUserName.trim()) {
    return todo.responsibleUserName.trim();
  }

  if (todo.responsibleUserId && String(todo.responsibleUserId).trim()) {
    return String(todo.responsibleUserId).trim();
  }

  return 'Unassigned';
}

function getProtocolStatusTone(status: TodoProtocolBlock['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'completed') return 'default';
  if (status === 'partial') return 'secondary';
  return 'outline';
}

export function TodoBlock({ block, className, onEditTodo, onDeleteTodo, onStatusChange }: TodoBlockProps) {
  const { t } = useTranslation(['organization', 'common']);
  const { formatDate, getDateKey } = useTimezone();
  const { todo } = block;
  const title = todo.title?.trim() || t('protocolCanvas.untitledTodo', { defaultValue: 'Untitled to-do' });
  const owner = getOwnerLabel(todo);
  const dueDisplay = formatDueDate(todo.dueDate, t, formatDate);
  const protocolStatus = block.status;
  const statusLabel = t(`protocolCanvas.status.${protocolStatus}`, {
    defaultValue:
      protocolStatus === 'completed' ? 'Completed' : protocolStatus === 'partial' ? 'Partial' : 'Open',
  });
  const overdue = isDueOverdue(todo.dueDate, block.status === 'completed' ? 'done' : todo.status, getDateKey);
  const isDone = protocolStatus === 'completed';

  const handleComplete = () => {
    onStatusChange?.(todo.id, 'completed');
    toast.success(t('protocolCanvas.todoMarkedComplete', { defaultValue: 'To-do marked complete.' }));
    trackProtocolCanvasAnalytics({ action: 'todo_complete', blockType: 'todo', blockId: block.id });
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-2">
        <p className={protocolUi.bodyTitle}>{title}</p>
        <dl className={cn('grid gap-1', protocolUi.meta, 'sm:grid-cols-2')}>
          <div className="flex flex-wrap items-center gap-1">
            <dt className="font-medium text-foreground/80">{t('todoOwner', { defaultValue: 'Owner' })}</dt>
            <dd>{owner}</dd>
          </div>
          <div className={cn('flex flex-wrap items-center gap-1', overdue && 'font-medium text-destructive')}>
            <dt className="font-medium text-foreground/80">{t('todoDueDate', { defaultValue: 'Due date' })}</dt>
            <dd>
              {dueDisplay}
              {overdue && (
                <span className={cn("ml-1.5 bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive", RADIUS.inline)}>
                  {t('protocolCanvas.overdue', { defaultValue: 'Overdue' })}
                </span>
              )}
            </dd>
          </div>
        </dl>
        <div>
          <Badge variant={getProtocolStatusTone(protocolStatus)}>{statusLabel}</Badge>
        </div>
      </div>

      {(onEditTodo || onDeleteTodo || onStatusChange) && (
        <div className={protocolUi.blockActionsRow}>
          {onStatusChange && !isDone && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={protocolUi.blockActionBtn}
              onClick={handleComplete}
            >
              {t('markComplete', { defaultValue: 'Mark complete' })}
            </Button>
          )}
          {onEditTodo && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={protocolUi.blockActionBtn}
              onClick={() => {
                trackProtocolCanvasAnalytics({ action: 'todo_edit', blockType: 'todo', blockId: block.id });
                onEditTodo(todo);
              }}
            >
              {t('buttons.edit', { ns: 'common' })}
            </Button>
          )}
          {onDeleteTodo && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(protocolUi.blockActionBtn, protocolUi.blockActionBtnDelete)}
              onClick={() => {
                trackProtocolCanvasAnalytics({ action: 'todo_delete', blockType: 'todo', blockId: block.id });
                onDeleteTodo(todo.id);
              }}
            >
              {t('buttons.delete', { ns: 'common' })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
