import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Icon } from '../../ui/Icon';
import { EmptyState } from '../../ui/EmptyState';
import { LoadingState } from '../../ui/LoadingState';
import { LoadingSpinner } from '../../ui/LoadingSpinner';
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
import { SPACING, COLORS, NAVIGATION, RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';
import { TabPanelHeader } from '../../layout/TabPanelHeader';
import { TabPanelBody } from '../../layout/TabPanelBody';
import { schedulingApi } from '../../../lib/api';
import { CreateMeetingDialog } from '../CreateMeetingDialog';
import { SchedulingPollGrid } from './SchedulingPollGrid';
import type {
  SchedulingPoll,
  SchedulingPollDetailResponse,
  ResponseCount,
} from '../../../lib/api/types/scheduling';
import type { Organization, User } from '../../../types';
import type { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { useTimezone } from '../../../hooks/useTimezone';
import { TimezoneBanner } from '../../shared/TimezoneBanner';
import { toast } from 'sonner';
import {
  canParticipate,
  canFinalize,
  getDefaultParticipationDeadlineDate,
  needsFinalization,
} from '../../../lib/scheduling/participation';

type ResponseChoice = 'yes' | 'no' | 'maybe';

interface SchedulingTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  isActive: boolean;
  onMeetingCreated?: (meeting: import('../../../lib/api/types/meetings').Meeting) => void;
  /** When true, only show detail for initialPollId (no list). Used when embedded in ScheduleTab. */
  detailOnlyMode?: boolean;
  initialPollId?: string | null;
  onBack?: () => void;
  /** When true (default), omit page padding — parent shell owns SPACING.page.* */
  embedded?: boolean;
  /** Increment to refetch poll detail/list (e.g. from WebSocket). */
  pollRefreshKey?: number;
}

function getResponseCountsBySlot(responseCounts: ResponseCount[]): Map<string, ResponseCount> {
  const map = new Map<string, ResponseCount>();
  for (const rc of responseCounts || []) {
    const id = rc.slotId ?? (rc as { slot_id?: string }).slot_id;
    if (id) map.set(id, rc);
  }
  return map;
}

export function SchedulingTab({
  organization,
  currentUser,
  permissions,
  isActive,
  onMeetingCreated,
  detailOnlyMode = false,
  initialPollId,
  onBack,
  embedded = true,
  pollRefreshKey = 0,
}: SchedulingTabProps) {
  const { t } = useTranslation('organization');
  const { formatDateTime, formatTime, fromDateTimeLocalValue, toDateTimeLocalValue, generateSlots } = useTimezone();
  const [polls, setPolls] = useState<SchedulingPoll[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPollId, setSelectedPollId] = useState<string | null>(initialPollId ?? null);
  const [detail, setDetail] = useState<SchedulingPollDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [addSlotsOpen, setAddSlotsOpen] = useState(false);
  const [addSlotStart, setAddSlotStart] = useState('');
  const [addSlotEnd, setAddSlotEnd] = useState('');
  const [addSlotsSubmitting, setAddSlotsSubmitting] = useState(false);
  // When2Meet-style: generate many slots from date range + time range
  const [genStartDate, setGenStartDate] = useState('');
  const [genEndDate, setGenEndDate] = useState('');
  const [genNoEarlier, setGenNoEarlier] = useState('09:00');
  const [genNoLater, setGenNoLater] = useState('17:00');
  const [genStepMinutes, setGenStepMinutes] = useState(60);
  const [myResponses, setMyResponses] = useState<Record<string, ResponseChoice>>({});
  const [responsesSubmitting, setResponsesSubmitting] = useState(false);
  const [finalizeSlotId, setFinalizeSlotId] = useState<string | null>(null);
  const [finalizeSubmitting, setFinalizeSubmitting] = useState(false);
  const [createMeetingDialogOpen, setCreateMeetingDialogOpen] = useState(false);
  const [createMeetingFromPollContext, setCreateMeetingFromPollContext] = useState<{
    pollId: string;
    chosenSlot: { startAt: string; endAt: string };
    defaultTitle: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [regenerateLinkOpen, setRegenerateLinkOpen] = useState(false);
  const [regenerateSubmitting, setRegenerateSubmitting] = useState(false);
  const [createParticipationDeadline, setCreateParticipationDeadline] = useState(() =>
    toDateTimeLocalValue(getDefaultParticipationDeadlineDate())
  );
  const [extendDeadlineOpen, setExtendDeadlineOpen] = useState(false);
  const [extendDeadlineValue, setExtendDeadlineValue] = useState('');
  const [extendSubmitting, setExtendSubmitting] = useState(false);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const fetchPolls = useCallback(async () => {
    if (!organization.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await schedulingApi.listSchedulingPolls(organization.id);
      setPolls(res.polls);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('schedulingError');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [organization.id, t]);

  const fetchDetail = useCallback(async (pollId: string, options?: { silent?: boolean }) => {
    if (!organization.id) return;
    if (!options?.silent) setDetailLoading(true);
    try {
      const res = await schedulingApi.getSchedulingPoll(organization.id, pollId);
      setDetail(res);
      // Load current user's responses from API so grid shows saved state
      if (res.myResponses && res.myResponses.length > 0) {
        const next: Record<string, ResponseChoice> = {};
        for (const r of res.myResponses) {
          next[r.slotId] = r.response;
        }
        setMyResponses(next);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    } finally {
      if (!options?.silent) setDetailLoading(false);
    }
  }, [organization.id, t]);

  /** Fetch and update only response counts (right panel). No loading state, no overwrite of myResponses or slots. */
  const refreshResponseCountsOnly = useCallback(async (pollId: string) => {
    if (!organization.id) return;
    try {
      const res = await schedulingApi.getSchedulingPoll(organization.id, pollId);
      setDetail((prev) =>
        prev && prev.poll?.id === pollId ? { ...prev, responseCounts: res.responseCounts } : prev
      );
    } catch {
      // Silent; counts will refresh on next full load
    }
  }, [organization.id]);

  useEffect(() => {
    if (detailOnlyMode && initialPollId) {
      setSelectedPollId(initialPollId);
    }
  }, [detailOnlyMode, initialPollId]);

  useEffect(() => {
    if (isActive && organization.id && !detailOnlyMode) {
      fetchPolls();
    }
  }, [isActive, organization.id, fetchPolls, detailOnlyMode]);

  useEffect(() => {
    if (selectedPollId && organization.id) {
      setMyResponses({}); // clear when switching to a different poll
      fetchDetail(selectedPollId);
    } else {
      setDetail(null);
    }
  }, [selectedPollId, organization.id, fetchDetail]);

  useEffect(() => {
    if (pollRefreshKey > 0 && organization.id) {
      if (selectedPollId) void fetchDetail(selectedPollId, { silent: true });
      if (!detailOnlyMode) void fetchPolls();
    }
  }, [pollRefreshKey, organization.id, selectedPollId, fetchDetail, fetchPolls, detailOnlyMode]);

  // Auto-save my responses when in grid view (When2Meet-style "saved automatically")
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevResponsesRef = useRef<string>('');
  useEffect(() => {
    if (!detail?.poll?.id || !organization.id || !canParticipate(detail.poll)) return;
    const key = JSON.stringify(myResponses);
    if (key === prevResponsesRef.current) return;
    prevResponsesRef.current = key;
    if (Object.keys(myResponses).length === 0) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      saveTimeoutRef.current = null;
      const responses = Object.entries(myResponses).map(([slotId, response]) => ({ slotId, response }));
      try {
        await schedulingApi.setSchedulingPollResponses(organization.id, detail.poll.id, { responses });
        await refreshResponseCountsOnly(detail.poll.id);
      } catch {
        // Silent; user can use "Save my responses" to retry
        prevResponsesRef.current = '';
        toast.error(t('schedulingError'));
      }
    }, 800);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [myResponses, detail?.poll?.id, detail?.poll?.status, organization.id, refreshResponseCountsOnly, t]);

  const handleCreatePoll = async () => {
    const title = createTitle.trim();
    if (!title) {
      toast.error(t('schedulingTitleRequired'));
      return;
    }
    const deadlineDate = fromDateTimeLocalValue(createParticipationDeadline.trim());
    if (!deadlineDate || deadlineDate <= new Date()) {
      toast.error(t('schedulingParticipationDeadlineFuture'));
      return;
    }
    setCreateSubmitting(true);
    try {
      await schedulingApi.createSchedulingPoll(organization.id, {
        title,
        description: createDescription.trim() || null,
        participationDeadline: deadlineDate.toISOString(),
      });
      toast.success(t('schedulingPollCreated'));
      setCreateOpen(false);
      setCreateTitle('');
      setCreateDescription('');
      setCreateParticipationDeadline(toDateTimeLocalValue(getDefaultParticipationDeadlineDate()));
      await fetchPolls();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleCloseParticipation = async () => {
    if (!detail?.poll?.id || !organization.id) return;
    setCloseSubmitting(true);
    try {
      await schedulingApi.closeSchedulingPoll(organization.id, detail.poll.id);
      toast.success(t('schedulingParticipationClosedSuccess'));
      setCloseConfirmOpen(false);
      await fetchDetail(detail.poll.id, { silent: true });
      await fetchPolls();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    } finally {
      setCloseSubmitting(false);
    }
  };

  const handleExtendDeadline = async () => {
    if (!detail?.poll?.id || !organization.id) return;
    const deadlineDate = fromDateTimeLocalValue(extendDeadlineValue.trim());
    if (!deadlineDate || deadlineDate <= new Date()) {
      toast.error(t('schedulingParticipationDeadlineFuture'));
      return;
    }
    setExtendSubmitting(true);
    try {
      const result = await schedulingApi.updateSchedulingPoll(organization.id, detail.poll.id, {
        participationDeadline: deadlineDate.toISOString(),
      });
      toast.success(result.reopened ? t('schedulingPollReopened') : t('schedulingDeadlineExtended'));
      setExtendDeadlineOpen(false);
      await fetchDetail(detail.poll.id, { silent: true });
      await fetchPolls();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    } finally {
      setExtendSubmitting(false);
    }
  };

  const handleAddSlots = async () => {
    if (!detail?.poll?.id || !organization.id) return;
    const startVal = addSlotStart.trim();
    const endVal = addSlotEnd.trim();
    if (!startVal || !endVal) {
      toast.error(t('schedulingSlotTimesRequired'));
      return;
    }
    const startDate = fromDateTimeLocalValue(startVal);
    const endDate = fromDateTimeLocalValue(endVal);
    if (!startDate || !endDate) {
      toast.error(t('schedulingSlotTimesRequired'));
      return;
    }
    const startAt = startDate.toISOString();
    const endAt = endDate.toISOString();
    setAddSlotsSubmitting(true);
    try {
      await schedulingApi.addSchedulingPollSlots(organization.id, detail.poll.id, {
        slots: [{ startAt, endAt }],
      });
      toast.success(t('schedulingSlotsAdded'));
      setAddSlotsOpen(false);
      setAddSlotStart('');
      setAddSlotEnd('');
      await fetchDetail(detail.poll.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    } finally {
      setAddSlotsSubmitting(false);
    }
  };

  const handleGenerateSlots = async () => {
    if (!detail?.poll?.id || !organization.id) return;
    if (!genStartDate || !genEndDate) {
      toast.error(t('schedulingSlotTimesRequired'));
      return;
    }
    const slots = generateSlots({
      startDate: genStartDate,
      endDate: genEndDate,
      startTime: genNoEarlier,
      endTime: genNoLater,
      stepMinutes: genStepMinutes,
    });
    if (slots.length === 0) {
      toast.error(t('schedulingSlotTimesRequired'));
      return;
    }
    setAddSlotsSubmitting(true);
    try {
      await schedulingApi.addSchedulingPollSlots(organization.id, detail.poll.id, { slots });
      toast.success(t('schedulingSlotsAdded'));
      setAddSlotsOpen(false);
      setGenStartDate('');
      setGenEndDate('');
      await fetchDetail(detail.poll.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    } finally {
      setAddSlotsSubmitting(false);
    }
  };

  const handleSetMyResponses = async () => {
    if (!detail?.poll?.id || !organization.id) return;
    const responses = Object.entries(myResponses).map(([slotId, response]) => ({
      slotId,
      response,
    }));
    if (responses.length === 0) {
      toast.error(t('schedulingSelectAtLeastOne'));
      return;
    }
    setResponsesSubmitting(true);
    try {
      await schedulingApi.setSchedulingPollResponses(organization.id, detail.poll.id, {
        responses,
      });
      toast.success(t('schedulingResponsesSaved'));
      await refreshResponseCountsOnly(detail.poll.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    } finally {
      setResponsesSubmitting(false);
    }
  };

  const handleFinalize = async () => {
    if (!detail?.poll?.id || !organization.id || !finalizeSlotId) return;
    setFinalizeSubmitting(true);
    try {
      await schedulingApi.finalizeSchedulingPoll(organization.id, detail.poll.id, {
        chosenSlotId: finalizeSlotId,
      });
      toast.success(t('schedulingFinalized'));
      setFinalizeSlotId(null);
      await fetchDetail(detail.poll.id, { silent: true });
      await fetchPolls();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    } finally {
      setFinalizeSubmitting(false);
    }
  };

  const handleCopyGuestLink = async () => {
    if (!detail?.poll?.id || !organization.id) return;
    try {
      let url = detail.guestLink?.url;
      if (!url) {
        const res = await schedulingApi.getGuestLink(organization.id, detail.poll.id);
        url = res.url;
      }
      await navigator.clipboard.writeText(url);
      toast.success(t('copyGuestLinkSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    }
  };

  const handleRegenerateGuestLink = async () => {
    if (!detail?.poll?.id || !organization.id) return;
    setRegenerateSubmitting(true);
    try {
      await schedulingApi.regenerateGuestLink(organization.id, detail.poll.id);
      toast.success(t('regenerateGuestLinkSuccess'));
      setRegenerateLinkOpen(false);
      await fetchDetail(detail.poll.id, { silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('schedulingError'));
    } finally {
      setRegenerateSubmitting(false);
    }
  };

  const canManagePoll = detail?.poll
    ? detail.poll.createdByUserId === currentUser.id || permissions.isRepresentative
    : false;
  const participationOpen = canParticipate(detail?.poll);
  const finalizationOpen = canFinalize(detail?.poll);

  const countsBySlot = detail ? getResponseCountsBySlot(detail.responseCounts) : new Map();

  const suggestedSlot = useMemo(() => {
    if (!detail?.slots?.length || !detail.responseCounts?.length) return null;
    let maxYes = 0;
    for (const rc of detail.responseCounts) {
      if (rc.yes > maxYes) maxYes = rc.yes;
    }
    if (maxYes === 0) return null;
    const best = detail.slots.filter((slot) => {
      const rc = detail.responseCounts.find((c) => c.slotId === slot.id);
      return rc && rc.yes === maxYes;
    });
    if (best.length === 0) return null;
    const slot = best[0];
    const rc = detail.responseCounts.find((c) => c.slotId === slot.id);
    return { slot, yesCount: rc?.yes ?? maxYes };
  }, [detail]);

  if (detailOnlyMode && !selectedPollId) return null;
  // Dedicated page: show shell immediately with loading state until poll data arrives (Back button is in parent)
  if (detailOnlyMode && selectedPollId && !detail) {
    return (
      <div className={cn(SPACING.section.gap, 'flex flex-col items-center justify-center gap-3 py-12')}>
        <LoadingSpinner size="lg" />
        <p className={cn(COLORS.text.secondary, 'text-sm')}>{t('loadingPoll')}</p>
      </div>
    );
  }

  if (selectedPollId && detail) {
    return (
      <div className={cn(!embedded && SPACING.page.x, !embedded && SPACING.page.y, !embedded && SPACING.layout.contentMax)}>
        <TabPanelBody>
          <div className={cn(SPACING.toolbar.row)}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (onBack) onBack();
                else {
                  setSelectedPollId(null);
                  setDetail(null);
                }
              }}
            >
              <Icon name="ArrowLeft" className="h-4 w-4 mr-2" />
              {t('schedulingBackToList')}
            </Button>
            {detail.slots.length > 0 && (
              <div className={cn(SPACING.toolbar.gap, 'flex items-center')}>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  {t('schedulingListView')}
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                >
                  {t('schedulingGridView')}
                </Button>
              </div>
            )}
          </div>

          <LoadingState isLoading={detailLoading} mode="skeleton" skeletonVariant="card">
            <>
              <TimezoneBanner className="mb-3" />
              <Card className={cn(SPACING.card.base, SPACING.card.padding)}>
                <div className={cn(SPACING.content.gap)}>
                  <h2 className={cn(NAVIGATION.typography.title)}>{detail.poll.title}</h2>
                  {detail.poll.description && (
                    <p className={cn(COLORS.text.secondary, 'text-sm')}>
                      {detail.poll.description}
                    </p>
                  )}
                  <div className={cn(SPACING.tight.inline, 'flex flex-wrap items-center')}>
                    <span className={cn(COLORS.text.secondary, 'text-xs')}>
                      {t('schedulingStatus')}: {t(`schedulingStatus_${detail.poll.status}`)}
                    </span>
                    {detail.poll.participationDeadline && participationOpen && (
                      <span className={cn(COLORS.text.secondary, 'text-xs')}>
                        {t('schedulingRespondBy')}: {formatDateTime(detail.poll.participationDeadline)}
                      </span>
                    )}
                    {detail.poll.participationClosedAt && !participationOpen && (
                      <span className={cn(COLORS.text.secondary, 'text-xs')}>
                        {t('schedulingParticipationClosed')}: {formatDateTime(detail.poll.participationClosedAt)}
                      </span>
                    )}
                    {needsFinalization(detail.poll) && (
                      <span className={cn('text-xs font-medium text-amber-700 dark:text-amber-400')}>
                        {t('schedulingNeedsFinalization')}
                      </span>
                    )}
                    {detail.chosenSlot && (
                      <span className={cn(COLORS.text.secondary, 'text-xs')}>
                        {t('schedulingChosenSlot')}: {formatDateTime(detail.chosenSlot.startAt)} – {formatTime(detail.chosenSlot.endAt)}
                      </span>
                    )}
                  </div>
                  {canManagePoll && detail.participationSummary && (
                    <p className={cn('text-sm', COLORS.text.secondary)}>
                      {t('schedulingResponseSummary', {
                        responded: detail.participationSummary.respondedCount,
                        total: detail.participationSummary.memberCount,
                        guests: detail.participationSummary.guestCount,
                      })}
                    </p>
                  )}
                  {canManagePoll && (
                    <div className={cn(SPACING.tight.inline, 'flex flex-wrap items-center mt-2')}>
                      {participationOpen && (
                        <Button variant="outline" size="sm" onClick={() => setCloseConfirmOpen(true)}>
                          {t('schedulingCloseParticipation')}
                        </Button>
                      )}
                      {finalizationOpen && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setExtendDeadlineValue(
                              toDateTimeLocalValue(
                                detail.poll.participationDeadline
                                  ? new Date(detail.poll.participationDeadline)
                                  : getDefaultParticipationDeadlineDate()
                              )
                            );
                            setExtendDeadlineOpen(true);
                          }}
                        >
                          {t('schedulingExtendDeadline')}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => void handleCopyGuestLink()}>
                        <Icon name="Copy" className="h-4 w-4 mr-2" />
                        {t('copyGuestLink')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setRegenerateLinkOpen(true)}>
                        <Icon name="RefreshCw" className="h-4 w-4 mr-2" />
                        {t('regenerateGuestLink')}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>

              {finalizationOpen && canManagePoll && suggestedSlot && (
                <div
                  className={cn(
                    'border border-primary/30 bg-primary/5',
                    RADIUS.panel,
                    SPACING.card.padding,
                    'flex flex-wrap items-center justify-between gap-2'
                  )}
                >
                  <p className={cn('text-sm', COLORS.text.primary)}>
                    {t('schedulingSuggestedSlot', {
                      date: formatDateTime(suggestedSlot.slot.startAt),
                      time: formatTime(suggestedSlot.slot.endAt),
                      count: suggestedSlot.yesCount,
                    })}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFinalizeSlotId(suggestedSlot.slot.id)}
                  >
                    {t('schedulingUseSuggestedSlot')}
                  </Button>
                </div>
              )}

              <Card className={cn(SPACING.card.base, SPACING.card.padding)}>
                <div className={cn(SPACING.content.gap)}>
                  <h3 className={cn(NAVIGATION.typography.navItem, 'text-foreground')}>{t('schedulingSlots')}</h3>
                {detail.slots.length === 0 ? (
                  <p className={cn('text-sm', COLORS.text.secondary)}>{t('schedulingNoSlots')}</p>
                ) : viewMode === 'grid' ? (
                  <SchedulingPollGrid
                    slots={detail.slots}
                    countsBySlot={countsBySlot}
                    myResponses={myResponses}
                    onResponseChange={(slotId, response) => {
                      if (response) setMyResponses((prev) => ({ ...prev, [slotId]: response }));
                      else setMyResponses((prev) => {
                        const next = { ...prev };
                        delete next[slotId];
                        return next;
                      });
                    }}
                    isOpen={participationOpen}
                  />
                ) : (
                  <ul className={cn(SPACING.content.gap)}>
                    {detail.slots.map((slot) => {
                      const rc = countsBySlot.get(slot.id);
                      return (
                        <li
                          key={slot.id}
                          className={cn(
                            'flex flex-wrap items-center justify-between gap-2 border p-3', RADIUS.control,
                            finalizeSlotId === slot.id && 'ring-2 ring-primary'
                          )}
                        >
                          <div className={cn(SPACING.tight.inline, 'flex flex-wrap items-center')}>
                            <span className="font-medium">
                              {formatDateTime(slot.startAt)} – {formatTime(slot.endAt)}
                            </span>
                            {rc && (
                              <span className={cn(COLORS.text.secondary, 'text-xs', SPACING.tight.inline, 'inline-flex')}>
                                ✓ {rc.yes} / ✗ {rc.no} / ? {rc.maybe}
                              </span>
                            )}
                          </div>
                          {participationOpen ? (
                            <div className="flex items-center gap-2">
                              {canManagePoll && finalizationOpen && (
                                <Button
                                  size="sm"
                                  variant={finalizeSlotId === slot.id ? 'default' : 'outline'}
                                  onClick={() => setFinalizeSlotId(slot.id)}
                                >
                                  {t('schedulingChooseSlot')}
                                </Button>
                              )}
                              <select
                                className="rounded border bg-background px-2 py-1 text-sm"
                                value={myResponses[slot.id] ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value as ResponseChoice | '';
                                  if (v) setMyResponses((prev) => ({ ...prev, [slot.id]: v }));
                                }}
                              >
                                <option value="">{t('schedulingMyResponse')}</option>
                                <option value="yes">{t('schedulingYes')}</option>
                                <option value="no">{t('schedulingNo')}</option>
                                <option value="maybe">{t('schedulingMaybe')}</option>
                              </select>
                            </div>
                          ) : finalizationOpen && canManagePoll ? (
                            <Button
                              size="sm"
                              variant={finalizeSlotId === slot.id ? 'default' : 'outline'}
                              onClick={() => setFinalizeSlotId(slot.id)}
                            >
                              {t('schedulingChooseSlot')}
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {detail.chosenSlot && (
                  <div className={cn(SPACING.section.margin)}>
                    <Button
                      size="sm"
                      onClick={() => {
                        setCreateMeetingFromPollContext({
                          pollId: detail.poll.id,
                          chosenSlot: detail.chosenSlot!,
                          defaultTitle: detail.poll.title ?? '',
                        });
                        setCreateMeetingDialogOpen(true);
                      }}
                    >
                      <Icon name="Video" className="h-4 w-4 mr-2" />
                      {t('createMeetingFromPoll')}
                    </Button>
                  </div>
                )}

                {participationOpen && canManagePoll && (
                  <div className={cn(SPACING.section.margin, SPACING.tight.inline, 'flex flex-wrap')}>
                    <Button variant="outline" size="sm" onClick={() => setAddSlotsOpen(true)}>
                      <Icon name="Plus" className="h-4 w-4 mr-2" />
                      {t('schedulingAddSlots')}
                    </Button>
                  </div>
                )}

                {participationOpen && (
                  <div className={cn(SPACING.section.margin, SPACING.tight.inline, 'flex flex-wrap items-center')}>
                    <Button
                      size="sm"
                      onClick={handleSetMyResponses}
                      disabled={responsesSubmitting || Object.keys(myResponses).length === 0}
                    >
                      {responsesSubmitting ? t('saving') : t('schedulingSetMyResponses')}
                    </Button>
                  </div>
                )}

                {finalizationOpen && canManagePoll && (
                  <div className={cn(SPACING.section.margin, SPACING.tight.inline, 'flex flex-wrap items-center')}>
                    {viewMode === 'grid' && (
                      <select
                        className="rounded border bg-background px-2 py-1 text-sm min-h-9"
                        value={finalizeSlotId ?? ''}
                        onChange={(e) => setFinalizeSlotId(e.target.value || null)}
                      >
                        <option value="">{t('schedulingChooseSlotToFinalize')}</option>
                        {detail.slots.map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {formatDateTime(slot.startAt)} – {formatTime(slot.endAt)}
                          </option>
                        ))}
                      </select>
                    )}
                    {finalizeSlotId && (
                      <Button
                        size="sm"
                        onClick={handleFinalize}
                        disabled={finalizeSubmitting}
                      >
                        {finalizeSubmitting ? t('saving') : t('schedulingFinalize')}
                      </Button>
                    )}
                  </div>
                )}
                {detail.guestRespondentSummaries && detail.guestRespondentSummaries.length > 0 && canManagePoll && (
                  <div className={cn(SPACING.section.margin)}>
                    <h4 className={cn('text-sm font-medium mb-2', COLORS.text.primary)}>
                      {t('guestRespondents')}
                    </h4>
                    <ul className={cn('text-sm space-y-1', COLORS.text.secondary)}>
                      {detail.guestRespondentSummaries.map((g, i) => (
                        <li key={`${g.displayName}-${i}`}>
                          {g.displayName}
                          {g.responses.length > 0 && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({g.responses.filter((r) => r.response === 'yes').length} {t('schedulingYes').toLowerCase()})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                </div>
              </Card>
            </>
          </LoadingState>
        </TabPanelBody>

        <Dialog open={regenerateLinkOpen} onOpenChange={setRegenerateLinkOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('regenerateGuestLink')}</DialogTitle>
            </DialogHeader>
            <p className={cn('text-sm', COLORS.text.secondary)}>{t('regenerateGuestLinkConfirm')}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRegenerateLinkOpen(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={() => void handleRegenerateGuestLink()} disabled={regenerateSubmitting}>
                {regenerateSubmitting ? t('saving') : t('regenerateGuestLink')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addSlotsOpen} onOpenChange={setAddSlotsOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('schedulingAddSlots')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              <TimezoneBanner />
              <div className="grid gap-2">
                <h4 className="text-sm font-medium">{t('schedulingAddSingleSlot')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">{t('schedulingSlotStart')}</Label>
                    <Input
                      type="datetime-local"
                      value={addSlotStart}
                      onChange={(e) => setAddSlotStart(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">{t('schedulingSlotEnd')}</Label>
                    <Input
                      type="datetime-local"
                      value={addSlotEnd}
                      onChange={(e) => setAddSlotEnd(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSlots}
                  disabled={addSlotsSubmitting || !addSlotStart.trim() || !addSlotEnd.trim()}
                >
                  {addSlotsSubmitting ? t('saving') : t('add')}
                </Button>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-2">{t('schedulingOrGenerateMany')}</h4>
                <p className={cn(COLORS.text.secondary, 'text-xs mb-3')}>{t('schedulingWhatDatesWork')}</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Start date</Label>
                    <Input
                      type="date"
                      value={genStartDate}
                      onChange={(e) => setGenStartDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">End date</Label>
                    <Input
                      type="date"
                      value={genEndDate}
                      onChange={(e) => setGenEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <p className={cn(COLORS.text.secondary, 'text-xs mb-2')}>{t('schedulingWhatTimesWork')}</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">{t('schedulingNoEarlierThan')}</Label>
                    <Input
                      type="time"
                      value={genNoEarlier}
                      onChange={(e) => setGenNoEarlier(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">{t('schedulingNoLaterThan')}</Label>
                    <Input
                      type="time"
                      value={genNoLater}
                      onChange={(e) => setGenNoLater(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-1 mb-3">
                  <Label className="text-xs">Slot length</Label>
                  <select
                    className="rounded border bg-background px-2 py-1.5 text-sm"
                    value={genStepMinutes}
                    onChange={(e) => setGenStepMinutes(Number(e.target.value))}
                  >
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                  </select>
                </div>
                {genStartDate && genEndDate && (
                  <p className="text-xs text-muted-foreground mb-2">
                    {(() => {
                      const slots = generateSlots({
      startDate: genStartDate,
      endDate: genEndDate,
      startTime: genNoEarlier,
      endTime: genNoLater,
      stepMinutes: genStepMinutes,
    });
                      return slots.length === 1
                        ? t('schedulingSlotsWillBeAdded', { count: 1 })
                        : t('schedulingSlotsWillBeAdded_other', { count: slots.length });
                    })()}
                  </p>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={handleGenerateSlots}
                  disabled={addSlotsSubmitting || !genStartDate || !genEndDate}
                >
                  {addSlotsSubmitting ? t('saving') : t('schedulingGenerateSlots')}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddSlotsOpen(false)}>
                {t('cancel')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CreateMeetingDialog
          open={createMeetingDialogOpen}
          onOpenChange={(open) => {
            setCreateMeetingDialogOpen(open);
            if (!open) setCreateMeetingFromPollContext(null);
          }}
          organizationId={organization.id}
          onSuccess={(meeting) => {
            setCreateMeetingDialogOpen(false);
            setCreateMeetingFromPollContext(null);
            onMeetingCreated?.(meeting);
          }}
          fromPollContext={createMeetingFromPollContext}
        />
      </div>
    );
  }

  if (detailOnlyMode) return null;

  return (
    <div className={cn(!embedded && SPACING.page.x, !embedded && SPACING.page.y, !embedded && SPACING.layout.contentMax)}>
    <TabPanelBody>
        <TabPanelHeader
          title={t('scheduling')}
          actions={
            permissions.isRepresentative ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Icon name="Plus" className="h-4 w-4 mr-2" />
                {t('schedulingCreatePoll')}
              </Button>
            ) : undefined
          }
        />

        <LoadingState isLoading={loading} mode="skeleton" skeletonVariant="card" skeletonCount={2}>
          <>
            {error && (
              <ErrorState message={error} onRetry={fetchPolls} variant="full-page" />
            )}
            {!error && polls.length === 0 && !loading && (
              <EmptyState
                icon={<Icon name="Clock" className="h-16 w-16" />}
                title={t('schedulingNoPolls')}
                description={t('schedulingNoPollsDescription')}
              />
            )}
            {!error && polls.length > 0 && (
              <ul className={cn(SPACING.content.gap)}>
                {polls.map((poll) => (
                  <li key={poll.id}>
                    <Card
                      className={cn(SPACING.card.base, SPACING.card.padding, 'cursor-pointer hover:bg-accent/50')}
                      onClick={() => setSelectedPollId(poll.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div className={cn(SPACING.tight.gap)}>
                          <h3 className={cn(NAVIGATION.typography.navItem, 'text-foreground')}>{poll.title}</h3>
                          <p className={cn(COLORS.text.secondary, 'text-xs')}>
                            {t('schedulingStatus')}: {t(`schedulingStatus_${poll.status}`)}
                            {poll.participationDeadline && poll.status === 'open' && (
                              <> · {t('schedulingRespondBy')}: {formatDateTime(poll.participationDeadline)}</>
                            )}
                            {needsFinalization(poll) && <> · {t('schedulingNeedsFinalization')}</>}
                            {poll.chosenSlotId && ` · ${t('schedulingFinalized')}`}
                          </p>
                        </div>
                        <Icon name="ChevronRight" className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </>
        </LoadingState>
    </TabPanelBody>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('schedulingCreatePoll')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t('schedulingTitle')}</Label>
              <Input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder={t('schedulingTitlePlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('schedulingDescription')} ({t('optional')})</Label>
              <Input
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder={t('schedulingDescriptionPlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('schedulingParticipationDeadline')}</Label>
              <Input
                type="datetime-local"
                value={createParticipationDeadline}
                onChange={(e) => setCreateParticipationDeadline(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleCreatePoll} disabled={createSubmitting || !createTitle.trim()}>
              {createSubmitting ? t('saving') : t('schedulingCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('schedulingCloseParticipation')}</DialogTitle>
          </DialogHeader>
          <p className={cn('text-sm', COLORS.text.secondary)}>{t('schedulingCloseParticipationConfirm')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseConfirmOpen(false)}>{t('cancel')}</Button>
            <Button onClick={() => void handleCloseParticipation()} disabled={closeSubmitting}>
              {closeSubmitting ? t('saving') : t('schedulingCloseParticipation')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={extendDeadlineOpen} onOpenChange={setExtendDeadlineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('schedulingExtendDeadline')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>{t('schedulingParticipationDeadline')}</Label>
            <Input
              type="datetime-local"
              value={extendDeadlineValue}
              onChange={(e) => setExtendDeadlineValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendDeadlineOpen(false)}>{t('cancel')}</Button>
            <Button onClick={() => void handleExtendDeadline()} disabled={extendSubmitting}>
              {extendSubmitting ? t('saving') : t('schedulingExtendDeadline')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateMeetingDialog
        open={createMeetingDialogOpen}
        onOpenChange={(open) => {
          setCreateMeetingDialogOpen(open);
          if (!open) setCreateMeetingFromPollContext(null);
        }}
        organizationId={organization.id}
        onSuccess={(meeting) => {
          setCreateMeetingDialogOpen(false);
          setCreateMeetingFromPollContext(null);
          onMeetingCreated?.(meeting);
        }}
        fromPollContext={createMeetingFromPollContext}
      />
    </div>
  );
}

