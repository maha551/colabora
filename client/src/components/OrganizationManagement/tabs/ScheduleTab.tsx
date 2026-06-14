import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isBefore } from 'date-fns';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { Icon } from '../../ui/Icon';
import { cn } from '../../ui/utils';
import { SPACING, COLORS, NAVIGATION, TOUCH_TARGETS } from '../../../lib/designSystem';
import { TabPanelHeader } from '../../layout/TabPanelHeader';
import { TabPanelBody } from '../../layout/TabPanelBody';
import { CalendarTab } from './CalendarTab';
import { EmptyState } from '../../ui/EmptyState';
import { LoadingState } from '../../ui/LoadingState';
import { ErrorState } from '../../shared/ErrorState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { CalendarSubscribeDialog } from '../CalendarSubscribeDialog';
import { CalendarExportMenu } from '../CalendarExportMenu';
import { schedulingApi, meetingsApi } from '../../../lib/api';
import type { SchedulingPoll } from '../../../lib/api/types/scheduling';
import type { Meeting } from '../../../lib/api/types/meetings';
import type { Organization, User } from '../../../types';
import type { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { useTimezone } from '../../../hooks/useTimezone';
import { toast } from 'sonner';
import { OverviewPinButton } from '../OverviewPinButton';

export type ScheduleSection = 'calendar' | 'scheduling' | 'meetings';

interface ScheduleTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  isActive: boolean;
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToRepresentatives?: () => void;
  /** Navigate by pushing hash (for history alignment). */
  onNavigateToHash?: (hash: string) => void;
  pinnedEventId?: string | null;
  onPinEvent?: (eventId: string) => Promise<void>;
  onUnpinEvent?: () => Promise<void>;
}

export function ScheduleTab({
  organization,
  currentUser,
  permissions,
  isActive,
  onNavigateToDocument,
  onNavigateToRepresentatives,
  onNavigateToHash,
  pinnedEventId,
  onPinEvent,
  onUnpinEvent,
}: ScheduleTabProps) {
  const { t } = useTranslation('organization');
  const { formatDateTime, getMonthRange, fromDateInputValue } = useTimezone();
  const [month, setMonth] = useState<Date>(() => new Date());

  const [polls, setPolls] = useState<SchedulingPoll[]>([]);
  const [pollsLoading, setPollsLoading] = useState(false);
  const [pollsError, setPollsError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingsError, setMeetingsError] = useState<string | null>(null);

  const [createPollOpen, setCreatePollOpen] = useState(false);
  const [createPollTitle, setCreatePollTitle] = useState('');
  const [createPollDescription, setCreatePollDescription] = useState('');
  const [createPollSubmitting, setCreatePollSubmitting] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const fetchPolls = useCallback(async () => {
    if (!organization.id) return;
    setPollsLoading(true);
    setPollsError(null);
    try {
      const res = await schedulingApi.listSchedulingPolls(organization.id);
      setPolls(res.polls);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('schedulingError');
      setPollsError(msg);
    } finally {
      setPollsLoading(false);
    }
  }, [organization.id, t]);

  const fetchMeetings = useCallback(async () => {
    if (!organization.id) return;
    setMeetingsLoading(true);
    setMeetingsError(null);
    try {
      const { from: monthFrom, to: monthTo } = getMonthRange(month);
      const monthStart = fromDateInputValue(monthFrom);
      const monthEnd = fromDateInputValue(monthTo, true);
      const now = new Date();
      // Align with calendar month: from now when viewing current month, else full month
      const fromDate = monthStart && isBefore(now, monthStart) ? monthStart : now;
      const res = await meetingsApi.listMeetings(organization.id, {
        from: fromDate.toISOString(),
        to: monthEnd ? monthEnd.toISOString() : monthTo,
      });
      setMeetings(res.meetings);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('meetingError');
      setMeetingsError(msg);
    } finally {
      setMeetingsLoading(false);
    }
  }, [organization.id, month, t, getMonthRange, fromDateInputValue]);

  useEffect(() => {
    if (isActive && organization.id) {
      fetchPolls();
      fetchMeetings();
    }
  }, [isActive, organization.id, fetchPolls, fetchMeetings]);

  // Meeting and poll URLs open dedicated pages in OrganizationManagement (hash routes)

  const handleSubscribe = () => {
    setSubscribeOpen(true);
  };

  const handleNavigateToMeeting = (meetingId: string, preferEmbed = false) => {
    if (preferEmbed) {
      try {
        localStorage.setItem('meeting.video.preference', 'embed');
      } catch {
        /* ignore */
      }
    }
    const hash = `#/organization/${organization.id}/meetings/${meetingId}`;
    if (onNavigateToHash) onNavigateToHash(hash);
    else if (typeof window !== 'undefined') window.location.hash = hash;
  };

  const handleNavigateToPoll = (pollId: string) => {
    const hash = `#/organization/${organization.id}/schedule/polls/${pollId}`;
    if (onNavigateToHash) onNavigateToHash(hash);
    else if (typeof window !== 'undefined') window.location.hash = hash;
  };

  const handleCreatePoll = async () => {
    const title = createPollTitle.trim();
    if (!title) {
      toast.error(t('schedulingTitleRequired'));
      return;
    }
    setCreatePollSubmitting(true);
    try {
      const { poll } = await schedulingApi.createSchedulingPoll(organization.id, {
        title,
        description: createPollDescription.trim() || null,
      });
      toast.success(t('schedulingPollCreated'));
      setCreatePollOpen(false);
      setCreatePollTitle('');
      setCreatePollDescription('');
      fetchPolls();
      const hash = `#/organization/${organization.id}/schedule/polls/${poll.id}`;
      if (onNavigateToHash) onNavigateToHash(hash);
      else if (typeof window !== 'undefined') window.location.hash = hash;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    } finally {
      setCreatePollSubmitting(false);
    }
  };

  const openPolls = polls.filter((p) => p.status === 'open' || p.status === 'closed');
  const upcomingMeetings = meetings;

  return (
    <TabPanelBody>
        <TabPanelHeader
          title={t('schedule')}
          actions={
            <div className={cn(SPACING.toolbar.gap, 'flex items-center flex-wrap')}>
            <Button variant="outline" size="sm" onClick={handleSubscribe}>
              <Icon name="Copy" className="h-4 w-4 mr-2" />
              {t('calendarSubscribe')}
            </Button>
            <CalendarExportMenu organizationId={organization.id} month={month} />
            {permissions.isRepresentative && (
              <Button size="sm" onClick={() => setCreatePollOpen(true)}>
                <Icon name="Plus" className="h-4 w-4 mr-2" />
                {t('schedulingCreatePoll')}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                const hash = `#/organization/${organization.id}/meetings/new`;
                if (onNavigateToHash) {
                  onNavigateToHash(hash);
                  if (typeof window !== 'undefined' && window.location.hash !== hash) {
                    window.location.hash = hash;
                  }
                } else if (typeof window !== 'undefined') {
                  window.location.hash = hash;
                }
              }}
            >
              <Icon name="Plus" className="h-4 w-4 mr-2" />
              {t('newMeeting')}
            </Button>
            </div>
          }
        />

        <div className={cn('grid grid-cols-1 lg:grid-cols-2 gap-6', SPACING.section.gap)}>
          <div className={cn(SPACING.section.gap)}>
            <CalendarTab
              organization={organization}
              currentUser={currentUser}
              permissions={permissions}
              isActive={isActive}
              hideToolbar
              month={month}
              onMonthChange={setMonth}
              onNavigateToDocument={onNavigateToDocument}
              onNavigateToRepresentatives={onNavigateToRepresentatives}
              onNavigateToMeeting={handleNavigateToMeeting}
              onNavigateToPoll={handleNavigateToPoll}
              pinnedEventId={pinnedEventId}
              onPinEvent={onPinEvent}
              onUnpinEvent={onUnpinEvent}
            />
          </div>

          <div className={cn(SPACING.section.gap)}>
            <section>
              <h3 className={cn(NAVIGATION.typography.navItem, 'text-foreground', SPACING.tight.gap, 'mb-2')}>
                {t('schedulingPolls')}
              </h3>
              <LoadingState isLoading={pollsLoading} mode="skeleton" skeletonVariant="card" skeletonCount={2}>
                {pollsError && (
                  <ErrorState message={pollsError} onRetry={fetchPolls} variant="inline" />
                )}
                {!pollsError && openPolls.length === 0 && !pollsLoading && (
                  <EmptyState
                    icon={<Icon name="Clock" className="h-10 w-10" />}
                    title={t('noSchedulingPolls')}
                    description={t('schedulingNoPollsDescription')}
                    action={
                      permissions.isRepresentative ? (
                        <Button size="sm" onClick={() => setCreatePollOpen(true)}>
                          {t('schedulingCreatePoll')}
                        </Button>
                      ) : undefined
                    }
                  />
                )}
                {!pollsError && openPolls.length > 0 && (
                  <ul className={cn(SPACING.content.gap)}>
                    {openPolls.map((poll) => (
                      <li key={poll.id}>
                        <Card
                          className={cn(
                            SPACING.card.base,
                            SPACING.card.padding,
                            SPACING.card.hover,
                            TOUCH_TARGETS.minHeight,
                            'cursor-pointer'
                          )}
                          onClick={() => handleNavigateToPoll(poll.id)}
                        >
                          <div className="flex justify-between items-start">
                            <div className={cn(SPACING.tight.gap)}>
                              <h4 className={cn(NAVIGATION.typography.navItem, 'text-foreground')}>{poll.title}</h4>
                              <p className={cn(COLORS.text.secondary, 'text-xs')}>
                                {t('schedulingStatus')}: {t(`schedulingStatus_${poll.status}`)}
                              </p>
                            </div>
                            <Icon name="ChevronRight" className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </LoadingState>
            </section>

            <section>
              <h3 className={cn(NAVIGATION.typography.navItem, 'text-foreground', SPACING.tight.gap, 'mb-2')}>
                {t('upcomingMeetings')}
              </h3>
              <LoadingState isLoading={meetingsLoading} mode="skeleton" skeletonVariant="card" skeletonCount={2}>
                {meetingsError && (
                  <ErrorState message={meetingsError} onRetry={fetchMeetings} variant="inline" />
                )}
                {!meetingsError && upcomingMeetings.length === 0 && !meetingsLoading && (
                  <EmptyState
                    icon={<Icon name="Video" className="h-10 w-10" />}
                    title={t('noUpcomingMeetings')}
                    description={t('meetingsEmptyDescription')}
                    action={
                      <Button
                        size="sm"
                        onClick={() => {
                          const hash = `#/organization/${organization.id}/meetings/new`;
                          if (onNavigateToHash) {
                            onNavigateToHash(hash);
                            if (typeof window !== 'undefined' && window.location.hash !== hash) {
                              window.location.hash = hash;
                            }
                          } else if (typeof window !== 'undefined') {
                            window.location.hash = hash;
                          }
                        }}
                      >
                        {t('newMeeting')}
                      </Button>
                    }
                  />
                )}
                {!meetingsError && upcomingMeetings.length > 0 && (
                  <ul className={cn(SPACING.content.gap)}>
                    {upcomingMeetings.map((m) => (
                      <li key={m.id}>
                        <Card
                          className={cn(
                            SPACING.card.base,
                            SPACING.card.padding,
                            SPACING.card.hover,
                            TOUCH_TARGETS.minHeight,
                            'cursor-pointer'
                          )}
                          onClick={() => handleNavigateToMeeting(m.id)}
                        >
                          <div className={cn(SPACING.tight.inline, 'flex flex-wrap items-center justify-between')}>
                            <div className={cn(SPACING.tight.gap, 'min-w-0 flex-1')}>
                              <h4 className={cn(NAVIGATION.typography.navItem, 'text-foreground')}>{m.title}</h4>
                              <p className={cn(COLORS.text.secondary, 'text-sm')}>
                                {formatDateTime(m.scheduledAt)}
                                {m.location && ` · ${m.location}`}
                              </p>
                            </div>
                            {onPinEvent && onUnpinEvent && (
                              <OverviewPinButton
                                eventId={`meeting-${m.id}`}
                                pinnedEventId={pinnedEventId}
                                canPin
                                onPin={onPinEvent}
                                onUnpin={onUnpinEvent}
                                size="icon"
                              />
                            )}
                            {m.meetingLink && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNavigateToMeeting(m.id, true);
                                }}
                              >
                                <Icon name="Video" className="h-4 w-4 mr-2" />
                                {t('joinMeeting')}
                              </Button>
                            )}
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </LoadingState>
            </section>
          </div>
        </div>

      <Dialog open={createPollOpen} onOpenChange={setCreatePollOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('schedulingCreatePoll')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t('schedulingTitle')}</Label>
              <Input
                value={createPollTitle}
                onChange={(e) => setCreatePollTitle(e.target.value)}
                placeholder={t('schedulingTitlePlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('schedulingDescription')} ({t('optional')})</Label>
              <Input
                value={createPollDescription}
                onChange={(e) => setCreatePollDescription(e.target.value)}
                placeholder={t('schedulingDescriptionPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePollOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleCreatePoll} disabled={createPollSubmitting || !createPollTitle.trim()}>
              {createPollSubmitting ? t('saving') : t('schedulingCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CalendarSubscribeDialog
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
        organizationId={organization.id}
        organizationName={organization.name}
      />
    </TabPanelBody>
  );
}
