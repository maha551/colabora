import React, { useState, useMemo, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Day as DefaultDay, type DayProps } from 'react-day-picker';
import { Calendar } from '../../ui/calendar';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Icon } from '../../ui/Icon';
import { EmptyState } from '../../ui/EmptyState';
import { LoadingState } from '../../ui/LoadingState';
import { ErrorState } from '../../shared/ErrorState';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../../ui/hover-card';
import { SPACING, COLORS, NAVIGATION, RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';
import { TabPanelHeader } from '../../layout/TabPanelHeader';
import { TabPanelBody } from '../../layout/TabPanelBody';
import { useCalendar } from '../../../hooks/useCalendar';
import { useTimezone } from '../../../hooks/useTimezone';
import { type CalendarEvent } from '../../../lib/api/calendar';
import { CalendarSubscribeDialog } from '../CalendarSubscribeDialog';
import { CalendarExportMenu } from '../CalendarExportMenu';
import { TimezoneBanner } from '../../shared/TimezoneBanner';
import { getCalendarEventIcon, navigateCalendarEvent } from '../../../lib/calendar/eventPresentation';
import { OverviewPinButton } from '../OverviewPinButton';
import type { Organization, User } from '../../../types';
import type { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';

interface CalendarTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  isActive: boolean;
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToRepresentatives?: () => void;
  onNavigateToMeeting?: (meetingId: string) => void;
  onNavigateToPoll?: (pollId: string) => void;
  /** When true, do not render the toolbar (Subscribe, Export). Used when parent provides a unified toolbar. */
  hideToolbar?: boolean;
  /** Controlled month when provided (for unified toolbar export range). */
  month?: Date;
  onMonthChange?: (month: Date) => void;
  pinnedEventId?: string | null;
  onPinEvent?: (eventId: string) => Promise<void>;
  onUnpinEvent?: () => Promise<void>;
}

function groupEventsByDay(
  events: CalendarEvent[],
  getDateKey: (date: Date | string | undefined | null) => string
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const day = getDateKey(ev.start);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(ev);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.start.localeCompare(b.start));
  }
  return map;
}

type CalendarDayHoverContextValue = {
  eventsByDay: Map<string, CalendarEvent[]>;
  onSelectDate: (date: Date) => void;
  onEventClick: (ev: CalendarEvent) => void;
  getCalendarEventIcon: (ev: CalendarEvent) => string;
  getDateKey: (date: Date | string | undefined | null) => string;
  formatTime: (date: Date | string | undefined | null, options?: Intl.DateTimeFormatOptions) => string;
  formatDate: (date: Date | string | undefined | null, options?: Intl.DateTimeFormatOptions) => string;
};

const defaultCalendarDayHoverContext: CalendarDayHoverContextValue = {
  eventsByDay: new Map(),
  onSelectDate: () => {},
  onEventClick: () => {},
  getCalendarEventIcon: () => 'Calendar',
  getDateKey: () => '',
  formatTime: () => '',
  formatDate: () => '',
};

const CalendarDayHoverContext = createContext<CalendarDayHoverContextValue>(defaultCalendarDayHoverContext);

/** Wrapper that forwards ref so Radix HoverCardTrigger can attach to a real DOM node (react-day-picker Day does not forward ref). */
const DayTriggerWrapper = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { children: React.ReactNode }
>(function DayTriggerWrapper({ children, className, ...rest }, ref) {
  return (
    <span ref={ref} className={cn('inline-flex size-full', className)} {...rest}>
      {children}
    </span>
  );
});

function CalendarDayWithHover(props: DayProps) {
  const { t } = useTranslation('organization');
  const { eventsByDay, onSelectDate, onEventClick, getCalendarEventIcon, getDateKey, formatTime, formatDate } =
    useContext(CalendarDayHoverContext);
  const dayKey = getDateKey(props.date);
  const dayEvents = eventsByDay.get(dayKey) ?? [];

  if (dayEvents.length === 0) {
    return <DefaultDay {...props} />;
  }

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <DayTriggerWrapper>
          <DefaultDay {...props} />
        </DayTriggerWrapper>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        sideOffset={8}
        className={cn('w-72', SPACING.card.padding)}
      >
        <div className={cn(SPACING.content.gap)}>
          <div className={cn(COLORS.text.secondary, 'text-xs font-medium')}>
            {formatDate(props.date, { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          <ul className={cn(SPACING.tight.gap)} role="list">
            {dayEvents.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onEventClick(ev)}
                  className={cn(
                    'text-left w-full px-2 py-1.5 text-sm hover:bg-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background', RADIUS.control,
                    (ev.documentId || ev.electionId || ev.meetingId || ev.schedulingPollId) && 'cursor-pointer'
                  )}
                >
                  <span className={cn(SPACING.tight.inline, 'flex items-center gap-2')}>
                    <Icon
                      name={getCalendarEventIcon(ev)}
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                    />
                    <span className="font-medium">{ev.title}</span>
                    <span className={cn(COLORS.text.secondary, 'text-xs')}>
                      {formatTime(ev.start, { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className={cn(SPACING.border.top, 'pt-3')}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onSelectDate(props.date)}
              className="w-full"
            >
              {t('calendarViewDayInList')}
            </Button>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function CalendarTab({
  organization,
  isActive,
  onNavigateToDocument,
  onNavigateToRepresentatives,
  onNavigateToMeeting,
  onNavigateToPoll,
  hideToolbar = false,
  month: controlledMonth,
  onMonthChange: onControlledMonthChange,
  pinnedEventId,
  onPinEvent,
  onUnpinEvent,
}: CalendarTabProps) {
  const { t } = useTranslation('organization');
  const { formatDate, formatTime, getDateKey, getMonthRange } = useTimezone();
  const [internalMonth, setInternalMonth] = useState<Date>(() => new Date());
  const month = controlledMonth ?? internalMonth;
  const setMonth = onControlledMonthChange ?? setInternalMonth;
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const dayRefsMap = useRef<Map<string, HTMLLIElement | null>>(new Map());

  const { from, to } = useMemo(() => getMonthRange(month), [month, getMonthRange]);
  const { events, isLoading, error, refresh } = useCalendar(organization.id, from, to, isActive);
  const eventsByDay = useMemo(() => groupEventsByDay(events, getDateKey), [events, getDateKey]);

  const datesWithEvents = useMemo(() => new Set(eventsByDay.keys()), [eventsByDay]);
  const hasEventsMatcher = useCallback(
    (date: Date) => datesWithEvents.has(getDateKey(date)),
    [datesWithEvents, getDateKey]
  );

  const handleMonthChange = useCallback(
    (newMonth: Date) => {
      setMonth(newMonth);
      setSelectedDate(undefined);
    },
    [setMonth]
  );

  useEffect(() => {
    if (selectedDate === undefined) return;
    const dayKey = getDateKey(selectedDate);
    if (!eventsByDay.has(dayKey)) return;
    const el = dayRefsMap.current.get(dayKey);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedDate, eventsByDay, getDateKey]);

  const handleSubscribe = () => {
    setSubscribeOpen(true);
  };

  const canPin = !!onPinEvent && !!onUnpinEvent;

  const handleEventClick = (ev: CalendarEvent) => {
    navigateCalendarEvent(ev, {
      onNavigateToMeeting,
      onNavigateToPoll,
      onNavigateToDocument,
      onNavigateToRepresentatives,
    });
  };

  const loadingOrError = isLoading || error;
  const showEmpty = !loadingOrError && events.length === 0;
  const showContent = !loadingOrError && events.length > 0;

  return (
    <div className={cn(!hideToolbar && SPACING.layout.contentMax)}>
      <TabPanelBody>
        <TimezoneBanner className="mb-3" />
        {!hideToolbar && (
          <TabPanelHeader
            title={t('calendar')}
            actions={
              <div className={cn(SPACING.toolbar.gap, 'flex items-center')}>
              <Button variant="outline" size="sm" onClick={handleSubscribe}>
                <Icon name="Copy" className="h-4 w-4 mr-2" />
                {t('calendarSubscribe')}
              </Button>
              <CalendarExportMenu organizationId={organization.id} month={month} />
              </div>
            }
          />
        )}

        <LoadingState isLoading={isLoading} mode="skeleton" skeletonVariant="card" skeletonCount={2}>
          <>
            {error && (
              <ErrorState
                message={error}
                onRetry={refresh}
                variant="full-page"
              />
            )}
            {!error && showEmpty && (
              <EmptyState
                icon={<Icon name="Calendar" className="h-16 w-16" />}
                title={t('calendarNoEvents')}
                description={t('calendarNoEventsDescription')}
              />
            )}
            {!error && showContent && (
              <>
                <Card className={cn(SPACING.card.base, SPACING.card.padding)}>
                  <CalendarDayHoverContext.Provider
                    value={{
                      eventsByDay,
                      onSelectDate: setSelectedDate,
                      onEventClick: handleEventClick,
                      getCalendarEventIcon,
                      getDateKey,
                      formatTime,
                      formatDate,
                    }}
                  >
                    <Calendar
                      mode="single"
                      month={month}
                      onMonthChange={handleMonthChange}
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      modifiers={{ hasEvents: hasEventsMatcher }}
                      modifiersClassNames={{ hasEvents: 'calendar-day-has-events' }}
                      components={{ Day: CalendarDayWithHover }}
                      showOutsideDays
                    />
                  </CalendarDayHoverContext.Provider>
                </Card>
                <Card className={cn(SPACING.card.base, SPACING.card.padding)}>
                  <div className={cn(SPACING.content.gap)}>
                    <h3 className={cn(NAVIGATION.typography.navItem, 'text-foreground')}>{t('calendar')} — {formatDate(month, { month: 'long', year: 'numeric' })}</h3>
                    <ul className={cn(SPACING.content.gap)}>
                      {Array.from(eventsByDay.entries())
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([day, dayEvents]) => (
                          <li
                            key={day}
                            ref={(el) => {
                              if (el) dayRefsMap.current.set(day, el);
                              else dayRefsMap.current.delete(day);
                            }}
                          >
                            <div className={cn(SPACING.tight.gap)}>
                              <div className={cn(COLORS.text.secondary, 'text-xs font-medium')}>
                                {formatDate(`${day}T12:00:00.000Z`, { weekday: 'short', month: 'short', day: 'numeric' })}
                              </div>
                              <ul className={cn(SPACING.tight.gap)}>
                                {dayEvents.map((ev) => (
                                  <li key={ev.id}>
                                    <div className={cn('flex items-center gap-1', RADIUS.control, 'hover:bg-accent')}>
                                      <button
                                        type="button"
                                        onClick={() => handleEventClick(ev)}
                                        className={cn(
                                          'text-left flex-1 min-w-0 px-2 py-1.5 text-sm transition-colors',
                                          (ev.documentId || ev.electionId || ev.meetingId || ev.schedulingPollId) && 'cursor-pointer'
                                        )}
                                      >
                                        <span className={cn(SPACING.tight.inline, 'flex items-center gap-2')}>
                                          <Icon
                                            name={getCalendarEventIcon(ev)}
                                            className="h-4 w-4 shrink-0 text-muted-foreground"
                                          />
                                          <span className="font-medium truncate">{ev.title}</span>
                                          <span className={cn(COLORS.text.secondary, 'text-xs shrink-0')}>
                                            {formatTime(ev.start, { hour: '2-digit', minute: '2-digit', hour12: false })}
                                          </span>
                                        </span>
                                      </button>
                                      {canPin && (
                                        <OverviewPinButton
                                          eventId={ev.id}
                                          pinnedEventId={pinnedEventId}
                                          canPin={canPin}
                                          onPin={onPinEvent!}
                                          onUnpin={onUnpinEvent!}
                                          size="icon"
                                          className="mr-1"
                                        />
                                      )}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                </Card>
              </>
            )}
          </>
        </LoadingState>
      </TabPanelBody>
      <CalendarSubscribeDialog
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
        organizationId={organization.id}
        organizationName={organization.name}
      />
    </div>
  );
}
