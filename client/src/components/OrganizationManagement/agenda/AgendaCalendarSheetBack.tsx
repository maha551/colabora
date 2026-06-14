import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Icon } from '../../ui/Icon';
import { cn } from '../../ui/utils';
import { COLORS } from '../../../lib/designSystem';
import {
  getCalendarEventIcon,
  navigateCalendarEvent,
  isCalendarEventClickable,
  type CalendarEventHandlers,
} from '../../../lib/calendar/eventPresentation';
import type { CalendarEvent } from '../../../lib/api/calendar';
import { OverviewPinButton } from '../OverviewPinButton';
import { getSheetVariantClasses, getEventTypeAccent, type SheetVariant } from './agendaSheetUtils';
import './agenda-sheet.css';

interface AgendaCalendarSheetBackProps {
  ev: CalendarEvent;
  variant: SheetVariant;
  showJoin?: boolean;
  formatDateTime: (
    date: Date | string | undefined | null,
    options?: Intl.DateTimeFormatOptions
  ) => string;
  handlers: CalendarEventHandlers;
  pinnedEventId?: string | null;
  canPin: boolean;
  onPin?: (eventId: string) => Promise<void>;
  onUnpin?: () => Promise<void>;
  onNavigateToSchedule?: () => void;
}

export const AgendaCalendarSheetBack = memo(function AgendaCalendarSheetBack({
  ev,
  variant,
  showJoin,
  formatDateTime,
  handlers,
  pinnedEventId,
  canPin,
  onPin,
  onUnpin,
  onNavigateToSchedule,
}: AgendaCalendarSheetBackProps) {
  const { t } = useTranslation('organization');
  const clickable = isCalendarEventClickable(ev);

  const timeRange = `${formatDateTime(ev.start, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })} – ${formatDateTime(ev.end || ev.start, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`;

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clickable) navigateCalendarEvent(ev, handlers);
  };

  return (
    <div className={cn(getSheetVariantClasses(variant), 'agenda-sheet p-2.5 flex flex-col gap-1.5 relative')}>
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px]', getEventTypeAccent(ev))} aria-hidden />
      <div className="flex items-start gap-1.5 min-h-0">
        <Icon
          name={getCalendarEventIcon(ev)}
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5"
        />
        <h4 className="text-xs font-semibold leading-snug line-clamp-3">{ev.title}</h4>
      </div>

      <p className={cn(COLORS.text.secondary, 'text-[10px] sm:text-xs')}>{timeRange}</p>

      {ev.description && (
        <p className={cn(COLORS.text.secondary, 'text-[10px] sm:text-xs line-clamp-2')}>
          {ev.description}
        </p>
      )}

      {ev.location && (
        <p className={cn(COLORS.text.secondary, 'text-[10px] truncate flex items-center gap-1')}>
          <Icon name="MapPin" className="h-3 w-3 shrink-0" />
          {ev.location}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-1.5">
        {clickable && (
          <Button size="sm" className="h-7 min-h-[28px] w-full text-xs" onClick={handleOpen}>
            {t('view')}
            <Icon name="ArrowRight" className="h-3 w-3 ml-1" />
          </Button>
        )}
        {showJoin && ev.meetingId && handlers.onNavigateToMeeting && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 min-h-[28px] w-full text-xs"
            onClick={(e) => {
              e.stopPropagation();
              handlers.onNavigateToMeeting!(ev.meetingId!, true);
            }}
          >
            <Icon name="Video" className="h-3 w-3 mr-1" />
            {t('joinMeeting')}
          </Button>
        )}
        <div className="flex items-center justify-between gap-1">
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
          {onNavigateToSchedule && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-[10px] ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToSchedule();
              }}
            >
              {t('dashboardViewSchedule')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
