import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { ErrorState } from '../shared/ErrorState';
import { SPACING } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { useOrganizationAgenda, AGENDA_UPCOMING_LIMIT_MOBILE } from '../../hooks/useOrganizationAgenda';
import { useTimezone } from '../../hooks/useTimezone';
import { useIsMobile } from '../../contexts/ScreenSizeContext';
import type { CalendarEventHandlers } from '../../lib/calendar/eventPresentation';
import type { Organization } from '../../types';
import type { OrganizationPermissions } from '../../hooks/useOrganizationPermissions';
import { AgendaCalendarStrip } from './agenda/AgendaCalendarStrip';
import { AgendaSheetSkeleton } from './agenda/AgendaSheetSkeleton';
import { AgendaEventTypeLegend } from './agenda/AgendaEventTypeLegend';

interface OrganizationWhatsHappeningCardProps extends CalendarEventHandlers {
  organization: Organization;
  permissions: OrganizationPermissions;
  enabled: boolean;
  onNavigateToSchedule: () => void;
  onPinEvent?: (eventId: string) => Promise<void>;
  onUnpinEvent?: () => Promise<void>;
}

export function OrganizationWhatsHappeningCard({
  organization,
  permissions,
  enabled,
  onNavigateToSchedule,
  onPinEvent,
  onUnpinEvent,
  onNavigateToMeeting,
  onNavigateToPoll,
  onNavigateToDocument,
  onNavigateToRepresentatives,
}: OrganizationWhatsHappeningCardProps) {
  const { t, i18n } = useTranslation('organization');
  const isMobile = useIsMobile();
  const { formatDateTime, formatRelativeTime, timezone } = useTimezone();

  const upcomingLimit = isMobile ? AGENDA_UPCOMING_LIMIT_MOBILE : undefined;

  const {
    live,
    pinned,
    upcoming,
    openPollCount,
    isLoading,
    error,
    hasContent,
    refresh,
  } = useOrganizationAgenda({
    organizationId: organization.id,
    enabled,
    pinnedEventId: organization.overviewPinnedEventId,
    overviewPinnedEvent: organization.overviewPinnedEvent,
    upcomingLimit,
  });

  const handlers = useMemo(
    () => ({
      onNavigateToMeeting,
      onNavigateToPoll,
      onNavigateToDocument,
      onNavigateToRepresentatives,
    }),
    [onNavigateToMeeting, onNavigateToPoll, onNavigateToDocument, onNavigateToRepresentatives]
  );

  const canPin = permissions.isRepresentative && !!onPinEvent && !!onUnpinEvent;
  const pinnedStale =
    !!organization.overviewPinnedEventId && !organization.overviewPinnedEvent && !pinned;

  const locale = i18n.language || 'en';

  return (
    <Card id="dashboard-whats-happening">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="Calendar" className="h-5 w-5" />
            {t('dashboardWhatsHappening')}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onNavigateToSchedule} className="text-xs shrink-0">
            {t('dashboardViewSchedule')}
            <Icon name="ArrowRight" className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <AgendaSheetSkeleton count={3} />}

        {!isLoading && error && (
          <ErrorState message={error} onRetry={refresh} variant="inline" />
        )}

        {!isLoading && !error && pinnedStale && (
          <div className={cn('flex items-center justify-between gap-2 text-sm text-muted-foreground mb-3', SPACING.tight.gap)}>
            <span>{t('dashboardPinnedEventUnavailable')}</span>
            {canPin && onUnpinEvent && (
              <Button variant="outline" size="sm" onClick={() => onUnpinEvent()}>
                {t('dashboardClearPin')}
              </Button>
            )}
          </div>
        )}

        {!isLoading && !error && !hasContent && !pinnedStale && (
          <div className="text-center py-6">
            <Icon name="Calendar" className="h-10 w-10 text-muted-foreground/70 mx-auto mb-3" />
            <p className="text-muted-foreground mb-1">{t('dashboardNoUpcomingEvents')}</p>
            <p className="text-sm text-muted-foreground mb-3">{t('dashboardNoUpcomingEventsDescription')}</p>
            <Button variant="outline" size="sm" onClick={onNavigateToSchedule}>
              {t('dashboardViewSchedule')}
            </Button>
          </div>
        )}

        {!isLoading && !error && (hasContent || pinned) && (
          <>
            <AgendaCalendarStrip
              live={live}
              pinned={pinned}
              upcoming={upcoming}
              handlers={handlers}
              pinnedEventId={organization.overviewPinnedEventId}
              canPin={canPin}
              onPin={onPinEvent}
              onUnpin={onUnpinEvent}
              onNavigateToSchedule={onNavigateToSchedule}
              timezone={timezone}
              locale={locale}
              formatRelativeTime={formatRelativeTime}
              formatDateTime={formatDateTime}
            />
            <AgendaEventTypeLegend />
          </>
        )}

        {!isLoading && !error && openPollCount > 0 && (
          <div className={cn(SPACING.border.top, 'mt-3 pt-3')}>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onNavigateToSchedule}>
              {t('dashboardOpenPolls', { count: openPollCount })}
              <Icon name="ArrowRight" className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
