import React, { memo } from 'react';
import { cn } from '../../ui/utils';
import { COLORS } from '../../../lib/designSystem';
import { useRelativeTimeTick } from '../../../hooks/useRelativeTimeTick';
import type { CalendarEvent } from '../../../lib/api/calendar';
import { getSheetCountdown } from './agendaSheetUtils';

interface AgendaSheetCountdownProps {
  ev: CalendarEvent;
  formatRelativeTime: (date: Date | string | undefined | null) => string;
  formatDateTime: (
    date: Date | string | undefined | null,
    options?: Intl.DateTimeFormatOptions
  ) => string;
  className?: string;
}

/** Isolated countdown label so tick updates do not force full strip re-renders. */
export const AgendaSheetCountdown = memo(function AgendaSheetCountdown({
  ev,
  formatRelativeTime,
  formatDateTime,
  className,
}: AgendaSheetCountdownProps) {
  const nowTick = useRelativeTimeTick();
  const label = getSheetCountdown(ev, nowTick, formatRelativeTime, formatDateTime);

  return (
    <p className={cn(COLORS.text.secondary, 'text-[10px] sm:text-xs text-center mt-1 truncate', className)}>
      {label}
    </p>
  );
});
