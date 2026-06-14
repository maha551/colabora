import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Icon } from '../../ui/Icon';
import { cn } from '../../ui/utils';
import {
  getCalendarEventIcon,
  isCalendarEventClickable,
  navigateCalendarEvent,
  type CalendarEventHandlers,
} from '../../../lib/calendar/eventPresentation';
import type { CalendarEvent } from '../../../lib/api/calendar';
import { OverviewPinButton } from '../OverviewPinButton';
import {
  getSheetDateParts,
  getSheetVariantClasses,
  getEventTypeAccent,
  isEventToday,
  type SheetVariant,
} from './agendaSheetUtils';
import { AgendaSheetCountdown } from './AgendaSheetCountdown';
import './agenda-sheet.css';

interface AgendaCalendarSheetFrontProps {
  ev: CalendarEvent;
  variant: SheetVariant;
  showJoin?: boolean;
  timezone: string;
  locale: string;
  formatRelativeTime: (date: Date | string | undefined | null) => string;
  formatDateTime: (
    date: Date | string | undefined | null,
    options?: Intl.DateTimeFormatOptions
  ) => string;
  handlers: CalendarEventHandlers;
  pinnedEventId?: string | null;
  canPin: boolean;
  onPin?: (eventId: string) => Promise<void>;
  onUnpin?: () => Promise<void>;
  onToggleFlip?: () => void;
  showFlipToggle?: boolean;
}

export const AgendaCalendarSheetFront = memo(function AgendaCalendarSheetFront({
  ev,
  variant,
  showJoin,
  timezone,
  locale,
  formatRelativeTime,
  formatDateTime,
  handlers,
  pinnedEventId,
  canPin,
  onPin,
  onUnpin,
  onToggleFlip,
  showFlipToggle,
}: AgendaCalendarSheetFrontProps) {
  const { t } = useTranslation('organization');
  const clickable = isCalendarEventClickable(ev);
  const { day, month, weekday } = getSheetDateParts(ev.start, timezone, locale);
  const accentClass = getEventTypeAccent(ev);
  const isToday = isEventToday(ev.start, Date.now(), timezone);

  const handleActivate = () => {
    if (clickable) navigateCalendarEvent(ev, handlers);
  };

  return (
    <div
      className={cn(
        getSheetVariantClasses(variant),
        'agenda-sheet cursor-default select-none',
        clickable && 'cursor-pointer'
      )}
      onClick={clickable ? handleActivate : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivate();
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div
        className={cn('absolute left-0 top-0 bottom-0 w-[3px]', accentClass)}
        aria-hidden
      />

      <div className="agenda-sheet__ring-holes" aria-hidden>
        <span className="agenda-sheet__ring-hole" />
        <span className="agenda-sheet__ring-hole" />
      </div>
      <div className="agenda-sheet__tear-line" aria-hidden />

      <div className="flex flex-1 flex-col px-2.5 pb-2 pt-1 min-h-0" dir="ltr">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1 text-center">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{weekday}</div>
            <div className="text-4xl sm:text-5xl font-bold tabular-nums leading-none tracking-tight">
              {day}
            </div>
            <div className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mt-0.5">
              {month}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {isToday && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                {t('dashboardSheetToday')}
              </Badge>
            )}
            {variant === 'live' && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-5">
                {t('dashboardLiveNow')}
              </Badge>
            )}
            {variant === 'pinned' && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-0.5">
                <Icon name="Pin" className="h-2.5 w-2.5" />
                {t('dashboardPinnedEvent')}
              </Badge>
            )}
          </div>
        </div>

        <AgendaSheetCountdown
          ev={ev}
          formatRelativeTime={formatRelativeTime}
          formatDateTime={formatDateTime}
        />

        <div className="mt-auto flex flex-col gap-1.5 min-h-0">
          <div className="flex items-center gap-1 min-w-0">
            <Icon
              name={getCalendarEventIcon(ev)}
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            />
            <span className="text-xs font-medium truncate">{ev.title}</span>
          </div>

          <div className="flex items-center gap-1">
            {showJoin && ev.meetingId && handlers.onNavigateToMeeting && (
              <Button
                size="sm"
                className="h-7 min-h-[28px] flex-1 text-xs px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handlers.onNavigateToMeeting!(ev.meetingId!, true);
                }}
              >
                <Icon name="Video" className="h-3 w-3 mr-1" />
                {t('joinMeeting')}
              </Button>
            )}
            {canPin && onPin && onUnpin && (
              <OverviewPinButton
                eventId={ev.id}
                pinnedEventId={pinnedEventId}
                canPin={canPin}
                onPin={onPin}
                onUnpin={onUnpin}
                size="icon"
                className="h-7 w-7 min-h-[28px] min-w-[28px]"
              />
            )}
            {showFlipToggle && onToggleFlip && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 min-h-[28px] min-w-[28px] shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFlip();
                }}
                aria-label={t('dashboardSheetFlipHint')}
                title={t('dashboardSheetFlipHint')}
              >
                <Icon name="Info" className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
