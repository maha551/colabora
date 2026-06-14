import React from 'react';
import { cn } from '../../ui/utils';
import { RADIUS } from '../../../lib/designSystem';
import { AGENDA_SHEET_SIZE_CLASSES } from './agendaSheetUtils';

export function AgendaSheetSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="flex gap-3 overflow-x-hidden pb-2 -mx-1 px-1"
      aria-hidden
      data-testid="agenda-sheet-skeleton"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn(
            AGENDA_SHEET_SIZE_CLASSES,
            'shrink-0 snap-start',
            RADIUS.control,
            'border border-border bg-muted/40 animate-pulse'
          )}
        />
      ))}
    </div>
  );
}
