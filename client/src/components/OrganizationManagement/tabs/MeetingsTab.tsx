import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
import { Textarea } from '../../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { SPACING, COLORS, NAVIGATION, Z_INDEX, RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';
import { TabPanelHeader } from '../../layout/TabPanelHeader';
import { TabPanelBody } from '../../layout/TabPanelBody';
import { meetingsApi, meetingMinutesApi, meetingAgendaApi, meetingVotesApi, meetingModeratorsApi, paragraphsApi, exportApi, schedulingApi, organizationsApi, ApiError, invalidateCache } from '../../../lib/api';
import type { Meeting } from '../../../lib/api/types/meetings';
import type { MeetingAgendaItem } from '../../../lib/api/types/meetingAgenda';
import type { MinutesEvent, TimelineDecisionItem, TimelineEventItem, TimelineItem, TimelineParagraphItem, TimelineTodoItem } from '../../../lib/api/types/meetingMinutes';
import type { AssignableUser, MeetingUpdateData, MeetingVote } from '../../../lib/api/types/meetingMinutes';
import type { Organization, User } from '../../../types';
import type { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { toast } from 'sonner';
import { useMeetingWebSocket } from '../../../hooks/useMeetingWebSocket';
import { useVideoRoomCreationEnabled } from '../../../hooks/useVideoRoomConfig';
import { MeetingMinutesPanel } from '../MeetingMinutesPanel';
import { MeetingProtocolPanel } from '../MeetingProtocolPanel';
import { useAppChrome } from '../../../contexts/AppChromeContext';
import { getNewestTimelineItemIdForLiveScroll } from '../blocks/meetingMinutesFollowLive';
import { CreateMeetingDialog } from '../CreateMeetingDialog';
import { FinalizeMinutesDialog } from '../minutes/FinalizeMinutesDialog';
import { UnfinalizeMinutesDialog } from '../minutes/UnfinalizeMinutesDialog';
import { useTimezone } from '../../../hooks/useTimezone';
import { TimezoneBanner } from '../../shared/TimezoneBanner';

const VIDEO_PREFERENCE_KEY = 'meeting.video.preference';
const OVERLAY_PIN_KEY = 'meeting.overlay.pinned';
const OVERLAY_WIDTH_KEY = 'meeting.overlay.widthPct';
const OVERLAY_WIDTH_MIN = 30;
const OVERLAY_WIDTH_MAX = 55;
const OVERLAY_WIDTH_DEFAULT = 38;
const FOLLOW_LIVE_KEY = 'meeting.minutes.followLive';
const COMPACT_ACTION_AUTO_DISMISS_MS = 6000;
const HOVER_LEAVE_DELAY_MS = 800;
const WS_REFETCH_DEBOUNCE_MS = 120;
type VideoPreference = 'embed' | 'newtab';

/** Mirrors `buildProtocolBlocks` id prefixes for `data-protocol-block-id` (see protocolBlocks.ts). */
const PROTOCOL_BLOCK_DOM_ID_PREFIXES = [
  'brainstorm',
  'vote',
  'paragraph',
  'todo',
  'decision',
  'date_poll',
  'document',
  'agenda',
] as const;

/** Scroll to a timeline row in protocol canvas `[data-protocol-block-id]`. */
function scrollTimelineBlockIntoView(timelineItemId: string): void {
  for (const prefix of PROTOCOL_BLOCK_DOM_ID_PREFIXES) {
    const el = document.querySelector(`[data-protocol-block-id="${prefix}:${timelineItemId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
  }
  const todoScoped = document.querySelector(`[data-protocol-block-id^="todo:${timelineItemId}:"]`);
  todoScoped?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Insert markdown at cursor or wrap selection in a textarea; then update state and refocus. */
function insertMarkdown(
  value: string,
  setValue: (v: string) => void,
  ref: React.RefObject<HTMLTextAreaElement | null>,
  prefix: string,
  suffix: string
): void {
  const el = ref?.current;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const newText = before + prefix + selected + suffix + after;
  setValue(newText);
  const newCursor = start + prefix.length + selected.length + suffix.length;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(newCursor, newCursor);
  });
}

export interface MeetingsTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  isActive: boolean;
  initialMeetingId?: string | null;
  /** When navigating right after creating a meeting (e.g. from poll), pass it to show immediately without waiting for getMeeting. */
  initialMeeting?: Meeting | null;
  onClearInitialMeetingId?: () => void;
  /** When provided, Back to list calls this instead of clearing internal state (for embedded detail view). */
  onBack?: () => void;
  /** Navigate by pushing hash (for history alignment). */
  onNavigateToHash?: (hash: string) => void;
  /** Open document view (e.g. from minutes "document created" link). */
  onNavigateToDocument?: (documentId: string) => void;
  /** When true (default), omit page padding — parent shell owns SPACING.page.* */
  embedded?: boolean;
}

/** Resolve timeline block id for scroll-into-view after refetch when follow-live is off. */
function resolveScrollBlockId(eventType: string, data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (eventType === 'minutes-paragraph-added' || eventType === 'minutes-paragraph-updated') {
    const id = d.paragraphId;
    return typeof id === 'string' ? id : null;
  }
  if (eventType === 'minutes-event-added') {
    const ev = d.event as { id?: string } | undefined;
    if (ev && typeof ev.id === 'string') return ev.id;
  }
  if (eventType === 'brainstorm-option-added') {
    const id = d.brainstormEventId;
    return typeof id === 'string' ? id : null;
  }
  if (eventType === 'todo-added' || eventType === 'todo-updated') {
    const todo = d.todo as { id?: string } | undefined;
    if (todo && typeof todo.id === 'string') return todo.id;
  }
  if (eventType === 'decision-recorded') {
    const decision = d.decision as { id?: string } | undefined;
    if (decision && typeof decision.id === 'string') return decision.id;
  }
  if (eventType === 'vote-started' || eventType === 'vote-ended') {
    const item = d.item as { id?: string } | undefined;
    if (item && typeof item.id === 'string') return item.id;
  }
  return null;
}

function mapMinutesEventToTimelineItem(
  event: MinutesEvent,
  extras?: Pick<TimelineEventItem, 'vote' | 'options'>
): TimelineEventItem {
  const eventType = event.eventType ?? '';
  return {
    type: 'event',
    id: event.id,
    occurredAt: event.createdAt,
    orderIndex: event.orderIndex,
    eventType,
    payload: event.payload,
    ...(extras?.vote ? { vote: extras.vote } : {}),
    ...(extras?.options
      ? { options: extras.options }
      : eventType === 'brainstorm_started' || eventType === 'brainstorm_ended'
        ? { options: [] }
        : {}),
  };
}

function appendTimelineItemIfNew(prev: TimelineItem[], item: TimelineItem): TimelineItem[] {
  if (prev.some((it) => it.id === item.id)) return prev;
  return sortTimelineItems([...prev, item]);
}

function getTimelineEventVoteId(item: TimelineEventItem): string | null {
  const payload = (item.payload ?? item.event?.payload) as Record<string, unknown> | null | undefined;
  const fromPayload = payload?.meetingVoteId ?? payload?.meeting_vote_id;
  if (typeof fromPayload === 'string' && fromPayload.length > 0) return fromPayload;
  const fromVote = item.vote?.id;
  return typeof fromVote === 'string' && fromVote.length > 0 ? fromVote : null;
}

/** Replace matching vote_started row and upsert vote_ended (canonical post-close timeline state). */
function upsertVoteEndedTimelineItem(
  prev: TimelineItem[],
  endedItem: TimelineEventItem,
  meetingVoteId: string,
): TimelineItem[] {
  const withoutStarted = prev.filter((it) => {
    if (it.type !== 'event') return true;
    const ev = it as TimelineEventItem;
    const et = ev.eventType ?? ev.event?.eventType ?? '';
    if (et !== 'vote_started') return true;
    return getTimelineEventVoteId(ev) !== meetingVoteId;
  });
  const existingIdx = withoutStarted.findIndex((it) => it.id === endedItem.id);
  if (existingIdx >= 0) {
    const next = [...withoutStarted];
    next[existingIdx] = endedItem;
    return sortTimelineItems(next);
  }
  return sortTimelineItems([...withoutStarted, endedItem]);
}

function isVoteLifecycleMinutesEvent(data: MeetingUpdateData | undefined): boolean {
  const innerType =
    (data?.event as { eventType?: string } | undefined)?.eventType ??
    (data?.item as TimelineEventItem | undefined)?.eventType;
  return innerType === 'vote_started' || innerType === 'vote_ended';
}

function scrollTimelineAfterWsItem(
  blockId: string | null,
  followLive: boolean,
  timelineEndEl: HTMLDivElement | null
) {
  if (blockId && !followLive) {
    setTimeout(() => scrollTimelineBlockIntoView(blockId), 150);
  } else if (followLive) {
    setTimeout(() => timelineEndEl?.scrollIntoView({ behavior: 'smooth' }), 150);
  }
}

/** Sort timeline items the same way the server does (orderIndex, then occurredAt, then id). */
function sortTimelineItems(items: TimelineItem[]): TimelineItem[] {
  const ORDER_INDEX_LARGE = 1e10;
  const toSortableTime = (value?: string): number => {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  };
  return [...items].sort((a, b) => {
    const oa = Number((a as { orderIndex?: number }).orderIndex);
    const ob = Number((b as { orderIndex?: number }).orderIndex);
    const aSmall = oa < ORDER_INDEX_LARGE;
    const bSmall = ob < ORDER_INDEX_LARGE;
    const aTime = (a as { occurredAt?: string }).occurredAt;
    const bTime = (b as { occurredAt?: string }).occurredAt;
    if (aSmall !== bSmall) {
      const byTime = toSortableTime(aTime) - toSortableTime(bTime);
      if (byTime !== 0) return byTime;
      return oa - ob || (a.id || '').localeCompare(b.id || '');
    }
    if (oa !== ob) return oa - ob;
    const byTime = toSortableTime(aTime) - toSortableTime(bTime);
    if (byTime !== 0) return byTime;
    return (a.id || '').localeCompare(b.id || '');
  });
}

function mapTodoTimelineItem(todo: MeetingUpdateData['todo']): TimelineTodoItem {
  const t = todo as NonNullable<MeetingUpdateData['todo']>;
  return {
    type: 'todo',
    id: t.id,
    occurredAt: t.occurredAt ?? t.createdAt ?? new Date().toISOString(),
    orderIndex: t.orderIndex ?? (t as { order_index?: number }).order_index,
    title: t.title,
    description: t.description ?? null,
    dueDate: t.dueDate ?? (t as { due_date?: string }).due_date ?? '',
    status: t.status ?? 'pending',
    responsibleUserId: t.responsibleUserId ?? (t as { responsible_user_id?: string }).responsible_user_id ?? '',
    responsibleUserName: t.responsibleUserName ?? (t as { responsible_user_name?: string }).responsible_user_name ?? null,
    agendaItemId: t.agendaItemId ?? (t as { agenda_item_id?: string }).agenda_item_id ?? null,
  };
}

export function MeetingsTab({
  organization,
  currentUser,
  permissions,
  isActive,
  initialMeetingId,
  initialMeeting,
  onClearInitialMeetingId,
  onBack,
  onNavigateToHash,
  onNavigateToDocument,
  embedded = true,
}: MeetingsTabProps) {
  const { t } = useTranslation('organization');
  const {
    formatDateTime,
    toDateTimeLocalValue,
    fromDateTimeLocalValue,
    generateSlots,
    getMonthRange,
    toDateInputValue,
    fromDateInputValue,
  } = useTimezone();
  const { setFocusTitle } = useAppChrome();
  const videoRoomCreationEnabled = useVideoRoomCreationEnabled();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Meeting | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editScheduled, setEditScheduled] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editLink, setEditLink] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [createRoomSubmitting, setCreateRoomSubmitting] = useState(false);
  const [videoPreference, setVideoPreferenceState] = useState<VideoPreference>(() => {
    try {
      const v = localStorage.getItem(VIDEO_PREFERENCE_KEY);
      return v === 'embed' || v === 'newtab' ? v : 'embed';
    } catch {
      return 'embed';
    }
  });
  const [embedError, setEmbedError] = useState(false);

  useEffect(() => {
    if (selectedMeetingId && detail?.title) {
      setFocusTitle(detail.title);
    } else {
      setFocusTitle(null);
    }
  }, [selectedMeetingId, detail?.title, setFocusTitle]);

  /** Closed by default: minutes drawer opens when pointer reaches the right edge (embed layout). */
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayPinned, setOverlayPinnedState] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(OVERLAY_PIN_KEY) === 'true') {
        setOverlayPinnedState(true);
        setOverlayVisible(true);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);
  const setOverlayPinned = useCallback((pinned: boolean) => {
    setOverlayPinnedState(pinned);
    try {
      localStorage.setItem(OVERLAY_PIN_KEY, pinned ? 'true' : 'false');
    } catch {
      // localStorage unavailable
    }
    if (pinned) setOverlayVisible(true);
  }, []);
  const [overlayWidthPct, setOverlayWidthPct] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(OVERLAY_WIDTH_KEY));
      if (stored >= OVERLAY_WIDTH_MIN && stored <= OVERLAY_WIDTH_MAX) return stored;
    } catch {
      // localStorage unavailable
    }
    return OVERLAY_WIDTH_DEFAULT;
  });
  const overlayResizingRef = useRef(false);
  const handleOverlayResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    overlayResizingRef.current = true;
    const startX = e.clientX;
    const startWidth = overlayWidthPct;
    const vw = window.innerWidth;
    const onMove = (me: PointerEvent) => {
      const dx = startX - me.clientX;
      const newPct = Math.min(OVERLAY_WIDTH_MAX, Math.max(OVERLAY_WIDTH_MIN, startWidth + (dx / vw) * 100));
      setOverlayWidthPct(Math.round(newPct));
    };
    const onUp = () => {
      overlayResizingRef.current = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      setOverlayWidthPct((w) => {
        try { localStorage.setItem(OVERLAY_WIDTH_KEY, String(w)); } catch {
          // localStorage unavailable
        }
        return w;
      });
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [overlayWidthPct]);
  const [compactAction, setCompactAction] = useState<{ eventType: string; data: unknown; timestamp: string } | null>(null);
  const hoverLeaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverZoneJustRevealedRef = useRef(false);
  const compactAutoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const timelineEndRef = useRef<HTMLDivElement>(null);
  const timelineScrollContainerRef = useRef<HTMLDivElement>(null);
  const [followLive, setFollowLiveState] = useState(() => {
    try {
      const v = localStorage.getItem(FOLLOW_LIVE_KEY);
      return v !== 'false'; // default true
    } catch {
      return true;
    }
  });
  const setFollowLive = useCallback((value: boolean) => {
    setFollowLiveState(value);
    try {
      localStorage.setItem(FOLLOW_LIVE_KEY, value ? 'true' : 'false');
    } catch {
      // localStorage unavailable
    }
  }, []);
  const [activeVoteId, setActiveVoteId] = useState<string | null>(null);
  const [activeVote, setActiveVote] = useState<MeetingVote | null>(null);
  const [startVoteOpen, setStartVoteOpen] = useState(false);
  const [startVoteTitle, setStartVoteTitle] = useState('');
  const [startVoteOptions, setStartVoteOptions] = useState<string[]>(['', '']);
  const [startVoteSourceEventId, setStartVoteSourceEventId] = useState<string | null>(null);
  const [startVoteSubmitting, setStartVoteSubmitting] = useState(false);
  const [startBrainstormSubmitting, setStartBrainstormSubmitting] = useState(false);
  const [closeBrainstormAndVoteSubmitting, setCloseBrainstormAndVoteSubmitting] = useState(false);
  const [closeVoteSubmitting, setCloseVoteSubmitting] = useState(false);
  const [exportMinutesSubmitting, setExportMinutesSubmitting] = useState(false);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [finalizeSubmitting, setFinalizeSubmitting] = useState(false);
  const [addParagraphOpen, setAddParagraphOpen] = useState(false);
  const [addEntryMode, setAddEntryMode] = useState<'paragraph' | 'decision'>('paragraph');
  const [decisionContext, setDecisionContext] = useState<{ meetingVoteId?: string; agendaItemId?: string } | null>(null);
  const [addParagraphTitle, setAddParagraphTitle] = useState('');
  const [addParagraphText, setAddParagraphText] = useState('');
  const [addParagraphSubmitting, setAddParagraphSubmitting] = useState(false);
  const [proposeOrgVoteSubmitting, setProposeOrgVoteSubmitting] = useState(false);
  const [editParagraphOpen, setEditParagraphOpen] = useState(false);
  const [editParagraphItem, setEditParagraphItem] = useState<TimelineItem | null>(null);
  const [editParagraphNewTitle, setEditParagraphNewTitle] = useState('');
  const [editParagraphNewText, setEditParagraphNewText] = useState('');
  const [editParagraphSubmitting, setEditParagraphSubmitting] = useState(false);
  const [agendaItems, setAgendaItems] = useState<MeetingAgendaItem[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [addAgendaItemOpen, setAddAgendaItemOpen] = useState(false);
  const [addAgendaItemTitle, setAddAgendaItemTitle] = useState('');
  const [addAgendaItemSubmitting, setAddAgendaItemSubmitting] = useState(false);
  const [editingAgendaItemId, setEditingAgendaItemId] = useState<string | null>(null);
  const [editingAgendaItemTitle, setEditingAgendaItemTitle] = useState('');
  const [editAgendaItemSubmitting, setEditAgendaItemSubmitting] = useState(false);
  const [dateDecidedOpen, setDateDecidedOpen] = useState(false);
  /** 'date' = record single date in minutes; 'poll' = create scheduling poll */
  const [dateDecidedMode, setDateDecidedMode] = useState<'date' | 'poll'>('poll');
  const [dateDecidedValue, setDateDecidedValue] = useState('');
  const [datePollTitle, setDatePollTitle] = useState('');
  const [datePollDescription, setDatePollDescription] = useState('');
  const [datePollStartDate, setDatePollStartDate] = useState('');
  const [datePollEndDate, setDatePollEndDate] = useState('');
  const [datePollNoEarlier, setDatePollNoEarlier] = useState('09:00');
  const [datePollNoLater, setDatePollNoLater] = useState('18:00');
  const [datePollStepMinutes, setDatePollStepMinutes] = useState(60);
  const [datePollSubmitting, setDatePollSubmitting] = useState(false);
  const [documentCreatedOpen, setDocumentCreatedOpen] = useState(false);
  const [documentCreatedTitle, setDocumentCreatedTitle] = useState('');
  const [documentCreatedSubmitting, setDocumentCreatedSubmitting] = useState(false);
  const [unfinalizeConfirmOpen, setUnfinalizeConfirmOpen] = useState(false);
  const [unfinalizeSubmitting, setUnfinalizeSubmitting] = useState(false);
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  const [addTodoTitle, setAddTodoTitle] = useState('');
  const [addTodoDescription, setAddTodoDescription] = useState('');
  const [addTodoDueDate, setAddTodoDueDate] = useState('');
  const [addTodoResponsibleUserId, setAddTodoResponsibleUserId] = useState('');
  const [addTodoSubmitting, setAddTodoSubmitting] = useState(false);
  const [editTodoOpen, setEditTodoOpen] = useState(false);
  const [editTodoItem, setEditTodoItem] = useState<TimelineTodoItem | null>(null);
  const [editTodoTitle, setEditTodoTitle] = useState('');
  const [editTodoDescription, setEditTodoDescription] = useState('');
  const [editTodoDueDate, setEditTodoDueDate] = useState('');
  const [editTodoResponsibleUserId, setEditTodoResponsibleUserId] = useState('');
  const [editTodoStatus, setEditTodoStatus] = useState('');
  const [editTodoSubmitting, setEditTodoSubmitting] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [assignableUsersLoading, setAssignableUsersLoading] = useState(false);
  const [todoActionSubmitting, setTodoActionSubmitting] = useState(false);
  const [deleteTodoConfirmId, setDeleteTodoConfirmId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [createMeetingDialogOpen, setCreateMeetingDialogOpen] = useState(false);
  const [createMeetingFromPollContext, setCreateMeetingFromPollContext] = useState<{
    pollId: string;
    chosenSlot: { startAt: string; endAt: string };
    defaultTitle: string;
  } | null>(null);
  const [manageModeratorsOpen, setManageModeratorsOpen] = useState(false);
  const [newModeratorUserId, setNewModeratorUserId] = useState('');
  const [moderatorActionSubmitting, setModeratorActionSubmitting] = useState(false);
  const addParagraphTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editParagraphTextareaRef = useRef<HTMLTextAreaElement>(null);
  const startVoteTitleRef = useRef<HTMLInputElement>(null);
  const wsTimelineDebounceRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    opts: { blockId?: string | null; voteId?: string | null };
    meetingId: string;
    followLive: boolean;
  } | null>(null);
  const wsAgendaDebounceRef = useRef<{ timer: ReturnType<typeof setTimeout>; meetingId: string } | null>(null);
  const wsDetailDebounceRef = useRef<{ timer: ReturnType<typeof setTimeout>; meetingId: string } | null>(null);
  const wsActiveVoteDebounceRef = useRef<{ timer: ReturnType<typeof setTimeout>; meetingId: string; voteId: string } | null>(null);

  const setVideoPreference = useCallback((pref: VideoPreference) => {
    setVideoPreferenceState(pref);
    try {
      localStorage.setItem(VIDEO_PREFERENCE_KEY, pref);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchMeetings = useCallback(async () => {
    if (!organization.id) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getMonthRange(new Date());
      const res = await meetingsApi.listMeetings(organization.id, { from, to });
      setMeetings(res.meetings);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('meetingError');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [organization.id, t, getMonthRange]);

  const fetchDetail = useCallback(
    async (meetingId: string, silent = false) => {
      if (!organization.id) return;
      if (!silent) setDetailLoading(true);
      try {
        const m = await meetingsApi.getMeeting(organization.id, meetingId);
        setDetail(m);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('meetingError'));
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [organization.id, t]
  );

  const fetchTimeline = useCallback(
    async (
      meetingId: string,
      options?: {
        silent?: boolean;
        /** When follow-live is on, scroll to bottom after refetch. */
        scrollToLive?: boolean;
        /** Scroll to this timeline item after refetch (legacy `#minutes-block-…` or protocol canvas). */
        scrollToBlockId?: string | null;
        /** After refetch, find event row with this vote id and scroll to it (when follow-live off). */
        meetingVoteIdForScroll?: string | null;
      }
    ) => {
      if (!organization.id) return;
      const silent = options?.silent ?? false;
      if (!silent) setTimelineLoading(true);
      try {
        invalidateCache(`/minutes/timeline`);
        const res = await meetingMinutesApi.getTimeline(organization.id, meetingId);
        const items = res.items ?? [];
        setTimelineItems(items);

        const scrollBlock = (id: string) => {
          setTimeout(() => scrollTimelineBlockIntoView(id), 150);
        };
        const scrollEnd = () => {
          setTimeout(() => {
            timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 150);
        };

        if (options?.scrollToBlockId) {
          scrollBlock(options.scrollToBlockId);
        } else if (followLive && options?.scrollToLive) {
          const newestId = getNewestTimelineItemIdForLiveScroll(items);
          if (newestId) scrollBlock(newestId);
          else scrollEnd();
        } else if (!followLive && options?.meetingVoteIdForScroll) {
          const vid = options.meetingVoteIdForScroll;
          const eventItem = items.find((i) => {
            if (i.type !== 'event') return false;
            const ev = i as TimelineEventItem;
            const et = ev.eventType ?? ev.event?.eventType ?? '';
            if (et !== 'vote_started' && et !== 'vote_ended') return false;
            const p = (ev.payload ?? ev.event?.payload) as { meetingVoteId?: string } | undefined;
            return p?.meetingVoteId === vid;
          });
          if (eventItem) scrollBlock(eventItem.id);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('meetingError'));
        setTimelineItems([]);
      } finally {
        setTimelineLoading(false);
      }
    },
    [organization.id, t, followLive]
  );

  const fetchActiveVote = useCallback(
    async (meetingId: string, voteId: string) => {
      if (!organization.id) return;
      try {
        const vote = await meetingVotesApi.getVote(organization.id, meetingId, voteId);
        setActiveVote(vote);
      } catch {
        setActiveVote(null);
      }
    },
    [organization.id]
  );

  const handleVoteCast = useCallback(
    (voteId: string) => {
      if (!detail?.id) return;
      setActiveVoteId(voteId);
      fetchActiveVote(detail.id, voteId);
    },
    [detail?.id, fetchActiveVote]
  );

  const handleCloseVote = useCallback(
    async (voteId: string) => {
      if (!detail?.id || !organization.id) return;
      setCloseVoteSubmitting(true);
      try {
        await meetingVotesApi.closeVote(organization.id, detail.id, voteId);
        if (activeVoteId === voteId) {
          setActiveVoteId(null);
          setActiveVote(null);
        }
        toast.success(t('voteCompleted'));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('meetingError'));
      } finally {
        setCloseVoteSubmitting(false);
      }
    },
    [detail?.id, organization.id, activeVoteId, t]
  );

  const fetchAgenda = useCallback(
    async (meetingId: string) => {
      if (!organization.id) return;
      setAgendaLoading(true);
      setAgendaError(null);
      try {
        const res = await meetingAgendaApi.list(organization.id, meetingId);
        setAgendaItems(res.items ?? []);
      } catch (e) {
        setAgendaError(e instanceof Error ? e.message : t('meetingError'));
        setAgendaItems([]);
      } finally {
        setAgendaLoading(false);
      }
    },
    [organization.id, t]
  );

  const scheduleWsTimelineRefetch = useCallback(
    (opts?: { blockId?: string | null; voteId?: string | null }) => {
      const meetingId = detail?.id;
      if (!meetingId) return;
      const prev = wsTimelineDebounceRef.current;
      if (prev) {
        clearTimeout(prev.timer);
        prev.opts = opts ?? {};
        prev.meetingId = meetingId;
        prev.followLive = followLive;
      }
      const followLiveVal = followLive;
      const run = () => {
        const r = wsTimelineDebounceRef.current;
        wsTimelineDebounceRef.current = null;
        if (!r) return;
        if (r.opts.blockId) fetchTimeline(r.meetingId, { silent: true, scrollToBlockId: r.opts.blockId });
        else if (r.followLive) fetchTimeline(r.meetingId, { silent: true, scrollToLive: true });
        else if (r.opts.voteId) fetchTimeline(r.meetingId, { silent: true, meetingVoteIdForScroll: r.opts.voteId });
        else fetchTimeline(r.meetingId, { silent: true });
      };
      if (prev) {
        prev.timer = setTimeout(run, WS_REFETCH_DEBOUNCE_MS);
      } else {
        wsTimelineDebounceRef.current = {
          meetingId,
          opts: opts ?? {},
          followLive: followLiveVal,
          timer: setTimeout(run, WS_REFETCH_DEBOUNCE_MS),
        };
      }
    },
    [detail?.id, fetchTimeline, followLive]
  );

  const scheduleWsAgendaRefetch = useCallback(() => {
    const meetingId = detail?.id;
    if (!meetingId) return;
    const prev = wsAgendaDebounceRef.current;
    if (prev) clearTimeout(prev.timer);
    wsAgendaDebounceRef.current = {
      meetingId,
      timer: setTimeout(() => {
        const r = wsAgendaDebounceRef.current;
        wsAgendaDebounceRef.current = null;
        if (r) fetchAgenda(r.meetingId);
      }, WS_REFETCH_DEBOUNCE_MS),
    };
  }, [detail?.id, fetchAgenda]);

  const scheduleWsDetailRefetch = useCallback(() => {
    const meetingId = detail?.id;
    if (!meetingId) return;
    const prev = wsDetailDebounceRef.current;
    if (prev) clearTimeout(prev.timer);
    wsDetailDebounceRef.current = {
      meetingId,
      timer: setTimeout(() => {
        const r = wsDetailDebounceRef.current;
        wsDetailDebounceRef.current = null;
        if (r) fetchDetail(r.meetingId);
      }, WS_REFETCH_DEBOUNCE_MS),
    };
  }, [detail?.id, fetchDetail]);

  const scheduleWsActiveVoteRefetch = useCallback(
    (voteId: string) => {
      const meetingId = detail?.id;
      if (!meetingId) return;
      const prev = wsActiveVoteDebounceRef.current;
      if (prev) clearTimeout(prev.timer);
      wsActiveVoteDebounceRef.current = {
        meetingId,
        voteId,
        timer: setTimeout(() => {
          const r = wsActiveVoteDebounceRef.current;
          wsActiveVoteDebounceRef.current = null;
          if (r) fetchActiveVote(r.meetingId, r.voteId);
        }, WS_REFETCH_DEBOUNCE_MS),
      };
    },
    [detail?.id, fetchActiveVote]
  );

  const fetchAssignableUsers = useCallback(
    async (meetingId: string) => {
      if (!organization.id) return;
      setAssignableUsersLoading(true);
      try {
        const res = await meetingMinutesApi.getAssignableUsers(organization.id, meetingId);
        setAssignableUsers(res.users ?? []);
      } catch {
        setAssignableUsers([]);
      } finally {
        setAssignableUsersLoading(false);
      }
    },
    [organization.id]
  );

  const refreshModerators = useCallback(
    async (meetingId: string) => {
      if (!organization.id) return;
      try {
        const res = await meetingModeratorsApi.getModerators(organization.id, meetingId);
        setDetail((prev) => (prev && prev.id === meetingId ? { ...prev, moderators: res.moderators ?? [] } : prev));
      } catch {
        // keep stale moderators list; existing websocket/detail refetch will recover
      }
    },
    [organization.id]
  );

  useEffect(() => {
    if (isActive && organization.id) {
      fetchMeetings();
    }
  }, [isActive, organization.id, fetchMeetings]);

  useEffect(() => {
    if (initialMeetingId && organization.id) {
      setSelectedMeetingId(initialMeetingId);
      onClearInitialMeetingId?.();
      // When we have pre-loaded meeting data (e.g. just created from poll), show it immediately so we don't stay on loading
      if (initialMeeting?.id === initialMeetingId) {
        setDetail(initialMeeting);
      }
    }
  }, [initialMeetingId, organization.id, onClearInitialMeetingId, initialMeeting]);

  useEffect(() => {
    if (selectedMeetingId && organization.id) {
      // Silent when we have pre-loaded data (e.g. just created) or already have detail, to avoid loading flicker
      const useSilent = initialMeeting?.id === selectedMeetingId || detail?.id === selectedMeetingId;
      fetchDetail(selectedMeetingId, useSilent);
    } else if (!selectedMeetingId) {
      setDetail(null);
      setActiveVoteId(null);
      setActiveVote(null);
      setTimelineItems([]);
    }
  }, [selectedMeetingId, organization.id, fetchDetail, initialMeeting?.id]);

  useEffect(() => {
    if (detail?.minutesDocumentId && detail?.id && organization.id) {
      fetchTimeline(detail.id);
    } else {
      setTimelineItems([]);
    }
  }, [detail?.id, detail?.minutesDocumentId, organization.id, fetchTimeline]);

  useEffect(() => {
    if (detail?.id && organization.id) {
      fetchAgenda(detail.id);
    } else {
      setAgendaItems([]);
    }
  }, [detail?.id, organization.id, fetchAgenda]);

  // Scroll to protocol block when opened from unified search
  useEffect(() => {
    if (!detail?.id || timelineItems.length === 0) return;
    const blockId = sessionStorage.getItem('meetingSearchBlockId');
    if (!blockId) return;
    sessionStorage.removeItem('meetingSearchBlockId');
    setTimeout(() => scrollTimelineBlockIntoView(blockId), 300);
  }, [detail?.id, timelineItems]);

  // When timeline loads, if the last item is an open vote, set activeVoteId so we fetch and show live voting UI
  useEffect(() => {
    if (!detail?.id || !organization.id || timelineItems.length === 0) return;
    const last = timelineItems[timelineItems.length - 1];
    if (last.type !== 'event') return;
    const ev = last as TimelineEventItem;
    const eventType = ev.eventType ?? ev.event?.eventType ?? '';
    if (eventType !== 'vote_started' && eventType !== 'vote_ended') return;
    const voteId = ev.vote?.id ?? (ev.payload && typeof (ev.payload as { meetingVoteId?: string }).meetingVoteId === 'string' ? (ev.payload as { meetingVoteId: string }).meetingVoteId : null);
    if (voteId) {
      setActiveVoteId(voteId);
      fetchActiveVote(detail.id, voteId);
    }
  }, [detail?.id, organization.id, timelineItems, fetchActiveVote]);

  useEffect(() => {
    if (selectedMeetingId) setEmbedError(false);
  }, [selectedMeetingId, detail?.meetingLink]);

  // Subscribe to meeting room only when viewing meeting detail. Timeline is read-only from API.
  // When adding inline editing for the minutes document, subscribe to document room only in the
  // editor view to avoid duplicate subscriptions (meeting room + document room).
  const authToken =
    typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
  const { lastUpdate } = useMeetingWebSocket({
    meetingId: detail?.id ?? null,
    organizationId: organization.id,
    userId: currentUser.id,
    authToken,
  });

  useEffect(() => {
    if (!lastUpdate || !detail?.id || !organization.id) return;
    const et = lastUpdate.eventType;
    const data = lastUpdate.data as MeetingUpdateData | undefined;

    // Payload-driven: minutes-finalized
    if (et === 'minutes-finalized' && data?.finalizedAt != null) {
      setDetail((prev) => (prev ? { ...prev, minutesFinalizedAt: data.finalizedAt ?? null } : null));
    } else if (et === 'minutes-finalized') {
      scheduleWsDetailRefetch();
    }

    // Payload-driven: agenda
    if (et === 'agenda-item-added' && data?.agendaItem) {
      setAgendaItems((prev) => [...prev, data.agendaItem!].sort((a, b) => a.orderIndex - b.orderIndex));
    } else if (et === 'agenda-item-updated' && data?.agendaItem) {
      setAgendaItems((prev) => prev.map((it) => (it.id === data.agendaItem!.id ? data.agendaItem! : it)));
    } else if (et === 'agenda-item-removed' && data?.agendaItemId) {
      setAgendaItems((prev) => prev.filter((it) => it.id !== data.agendaItemId));
    } else if (et === 'agenda-reordered') {
      if (data?.order && Array.isArray(data.order) && data.order.length > 0) {
        const orderMap = new Map(data.order.map((o) => [o.id, o.orderIndex]));
        setAgendaItems((prev) => [...prev].sort((a, b) => (orderMap.get(a.id) ?? a.orderIndex) - (orderMap.get(b.id) ?? b.orderIndex)));
      } else {
        scheduleWsAgendaRefetch();
      }
    } else if (et === 'agenda-item-added' || et === 'agenda-item-updated' || et === 'agenda-item-removed') {
      scheduleWsAgendaRefetch();
    }

    // Payload-driven: moderators
    if (et === 'moderator-added' && data?.userId) {
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              moderators: [...(prev.moderators ?? []), { userId: data.userId!, userName: data.userName ?? '', source: 'invited' as const }],
            }
          : null
      );
    } else if (et === 'moderator-removed' && data?.userId) {
      setDetail((prev) => (prev ? { ...prev, moderators: (prev.moderators ?? []).filter((m) => m.userId !== data.userId) } : null));
    } else if (et === 'moderator-added' || et === 'moderator-removed') {
      scheduleWsDetailRefetch();
    }

    // Payload-driven: vote-started
    if (et === 'vote-started' && data?.meetingVoteId) {
      setActiveVoteId(data.meetingVoteId);
      if (data.vote) {
        setActiveVote(data.vote);
      } else {
        scheduleWsActiveVoteRefetch(data.meetingVoteId);
      }
      if (data.item) {
        setTimelineItems((prev) => appendTimelineItemIfNew(prev, data.item as TimelineItem));
        scrollTimelineAfterWsItem(
          resolveScrollBlockId(et, lastUpdate.data),
          followLive,
          timelineEndRef.current
        );
      } else {
        scheduleWsTimelineRefetch({ voteId: data.meetingVoteId });
      }
    }

    // Payload-driven: vote-updated (patch responseCounts only)
    if (et === 'vote-updated' && data?.meetingVoteId && data?.responseCounts) {
      if (activeVoteId === data.meetingVoteId) {
        setActiveVote((prev) => (prev ? { ...prev, responseCounts: data.responseCounts! } : null));
      }
      // Skip refetch for vote-updated when patching
    } else if (et === 'vote-updated' && data?.meetingVoteId) {
      if (activeVoteId === data.meetingVoteId) {
        scheduleWsActiveVoteRefetch(data.meetingVoteId);
      }
    }

    // Payload-driven: vote-ended
    if (et === 'vote-ended' && data?.meetingVoteId) {
      if (data.vote) {
        setActiveVote(data.vote);
      } else if (data?.result) {
        setActiveVote((prev) =>
          prev && prev.id === data.meetingVoteId ? { ...prev, status: 'closed' as const, responseCounts: data.result! } : prev
        );
      }
      setCompactAction((prev) => {
        if (prev?.eventType === 'vote-started' && (prev.data as { meetingVoteId?: string })?.meetingVoteId === data.meetingVoteId) return null;
        return prev;
      });
      if (data.item) {
        setTimelineItems((prev) =>
          upsertVoteEndedTimelineItem(prev, data.item as TimelineEventItem, data.meetingVoteId)
        );
        scrollTimelineAfterWsItem(
          resolveScrollBlockId(et, lastUpdate.data),
          followLive,
          timelineEndRef.current
        );
      } else {
        scheduleWsTimelineRefetch({ voteId: data.meetingVoteId });
      }
    }

    // Payload-driven: timeline (paragraphs, todos, paragraph-removed)
    if (et === 'minutes-paragraph-added' && data?.item) {
      setTimelineItems((prev) => sortTimelineItems([...prev, data.item! as TimelineItem]));
      const blockId = resolveScrollBlockId(et, lastUpdate.data);
      if (blockId && !followLive) {
        setTimeout(() => scrollTimelineBlockIntoView(blockId), 150);
      } else if (followLive) {
        setTimeout(() => timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
      }
    } else if (et === 'minutes-paragraph-added') {
      scheduleWsTimelineRefetch({ blockId: resolveScrollBlockId(et, lastUpdate.data) });
    }

    if (et === 'minutes-paragraph-updated' && data?.item) {
      setTimelineItems((prev) =>
        prev.map((it) => {
          if (it.type !== 'paragraph' || it.id !== (data.item as TimelineParagraphItem).id) return it;
          return { ...it, ...(data.item as TimelineItem) };
        })
      );
    } else if (et === 'minutes-paragraph-updated') {
      scheduleWsTimelineRefetch({ blockId: resolveScrollBlockId(et, lastUpdate.data) });
    }

    if (et === 'minutes-paragraph-removed' && data?.paragraphId) {
      setTimelineItems((prev) =>
        prev.filter((it) => !(it.type === 'paragraph' && (it.id === data.paragraphId || (it as TimelineParagraphItem).paragraphId === data.paragraphId)))
      );
    }

    // Payload-driven: todos
    if (et === 'todo-added' && data?.todo) {
      const todoItem = mapTodoTimelineItem(data.todo);
      setTimelineItems((prev) => sortTimelineItems([...prev, todoItem]));
    } else if (et === 'todo-updated' && data?.todo) {
      const todoItem = mapTodoTimelineItem(data.todo);
      setTimelineItems((prev) => prev.map((it) => (it.type === 'todo' && it.id === todoItem.id ? todoItem : it)));
    } else if (et === 'todo-removed' && data?.todoId) {
      setTimelineItems((prev) => prev.filter((it) => !(it.type === 'todo' && it.id === data.todoId)));
    } else if (et === 'todo-added' || et === 'todo-updated' || et === 'todo-removed') {
      const blockId = et !== 'todo-removed' ? resolveScrollBlockId(et, lastUpdate.data) : null;
      scheduleWsTimelineRefetch({ blockId });
    }

    if (et === 'decision-recorded' && data?.decision) {
      const d = data.decision;
      const decisionItem: TimelineDecisionItem = {
        type: 'decision',
        id: d.id,
        occurredAt: d.createdAt ?? new Date().toISOString(),
        orderIndex: d.orderIndex,
        title: d.title ?? null,
        text: d.text ?? '',
        status: d.status ?? 'recorded',
        agendaItemId: d.agendaItemId ?? null,
        meetingVoteId: d.meetingVoteId ?? null,
        sourceEventId: d.sourceEventId ?? null,
        createdByUserId: d.createdByUserId ?? null,
      };
      setTimelineItems((prev) => sortTimelineItems([...prev, decisionItem]));
    } else if (et === 'decision-recorded') {
      scheduleWsTimelineRefetch({ blockId: resolveScrollBlockId(et, lastUpdate.data) });
    }

    // Payload-driven: minutes-event-added (brainstorm, vote events, etc.)
    if (et === 'minutes-event-added' && !isVoteLifecycleMinutesEvent(data)) {
      const timelineItem =
        data?.item ??
        (data?.event ? mapMinutesEventToTimelineItem(data.event, data.vote ? { vote: data.vote } : undefined) : null);
      if (timelineItem) {
        setTimelineItems((prev) => appendTimelineItemIfNew(prev, timelineItem as TimelineItem));
        scrollTimelineAfterWsItem(
          resolveScrollBlockId(et, lastUpdate.data),
          followLive,
          timelineEndRef.current
        );
      } else {
        scheduleWsTimelineRefetch({ blockId: resolveScrollBlockId(et, lastUpdate.data) });
      }
    } else if (et === 'minutes-timeline-reordered') {
      scheduleWsTimelineRefetch({ blockId: null });
    }
    if (et === 'brainstorm-option-added') {
      scheduleWsTimelineRefetch({ blockId: resolveScrollBlockId(et, lastUpdate.data) });
    }

    // Payload-driven: current-topic-changed (already was)
    if (et === 'current-topic-changed' && data && 'currentAgendaItemId' in data) {
      setDetail((prev) => (prev ? { ...prev, currentAgendaItemId: data.currentAgendaItemId ?? null } : null));
    }

    const isEmbed = !!(detail.meetingLink && videoPreference === 'embed');
    const showCard = isEmbed && !overlayVisible;
    const cardEvents = ['minutes-event-added', 'minutes-paragraph-added', 'agenda-item-added', 'vote-started', 'brainstorm-option-added', 'minutes-paragraph-updated', 'decision-recorded'];
    const isInteractive = (ev: string, d: typeof data) =>
      ev === 'vote-started' || (ev === 'minutes-event-added' && (d?.event as { eventType?: string } | undefined)?.eventType === 'brainstorm_started');

    if (showCard && cardEvents.includes(et)) {
      const newInteractive = isInteractive(et, data);
      setCompactAction((prev) => {
        if (prev && newInteractive === false && isInteractive(prev.eventType, prev.data as typeof data)) return prev;
        return { eventType: et, data: lastUpdate.data, timestamp: lastUpdate.timestamp };
      });
      if (compactAutoDismissRef.current) {
        clearTimeout(compactAutoDismissRef.current);
        compactAutoDismissRef.current = null;
      }
      if (!isInteractive(et, data)) {
        compactAutoDismissRef.current = setTimeout(() => {
          compactAutoDismissRef.current = null;
          setCompactAction((prev) => (prev?.eventType === et && prev?.timestamp === lastUpdate.timestamp ? null : prev));
        }, COMPACT_ACTION_AUTO_DISMISS_MS);
      }
    }
  }, [
    lastUpdate,
    detail?.id,
    detail?.meetingLink,
    organization.id,
    scheduleWsTimelineRefetch,
    scheduleWsAgendaRefetch,
    scheduleWsDetailRefetch,
    scheduleWsActiveVoteRefetch,
    activeVoteId,
    overlayVisible,
    videoPreference,
    followLive,
  ]);

  useEffect(() => {
    return () => {
      if (hoverLeaveTimeoutRef.current) {
        clearTimeout(hoverLeaveTimeoutRef.current);
        hoverLeaveTimeoutRef.current = null;
      }
      if (compactAutoDismissRef.current) {
        clearTimeout(compactAutoDismissRef.current);
        compactAutoDismissRef.current = null;
      }
      if (wsTimelineDebounceRef.current?.timer) {
        clearTimeout(wsTimelineDebounceRef.current.timer);
        wsTimelineDebounceRef.current = null;
      }
      if (wsAgendaDebounceRef.current?.timer) {
        clearTimeout(wsAgendaDebounceRef.current.timer);
        wsAgendaDebounceRef.current = null;
      }
      if (wsDetailDebounceRef.current?.timer) {
        clearTimeout(wsDetailDebounceRef.current.timer);
        wsDetailDebounceRef.current = null;
      }
      if (wsActiveVoteDebounceRef.current?.timer) {
        clearTimeout(wsActiveVoteDebounceRef.current.timer);
        wsActiveVoteDebounceRef.current = null;
      }
    };
  }, []);

  const openEditDialog = () => {
    if (!detail) return;
    setEditTitle(detail.title);
    setEditScheduled(toDateTimeLocalValue(detail.scheduledAt));
    setEditEnd(detail.endAt ? toDateTimeLocalValue(detail.endAt) : '');
    setEditLocation(detail.location || '');
    setEditLink(detail.meetingLink || '');
    setEditOpen(true);
  };

  const handleUpdateMeeting = async () => {
    if (!detail || !organization.id) return;
    const title = editTitle.trim();
    if (!title) {
      toast.error(t('titleRequired'));
      return;
    }
    if (!editScheduled.trim()) {
      toast.error(t('dateTimeRequired'));
      return;
    }
    setEditSubmitting(true);
    try {
      const updated = await meetingsApi.updateMeeting(organization.id, detail.id, {
        title,
        scheduled_at: fromDateTimeLocalValue(editScheduled).toISOString(),
        end_at: editEnd.trim() ? fromDateTimeLocalValue(editEnd).toISOString() : null,
        location: editLocation.trim() || null,
        meeting_link: editLink.trim() || null,
      });
      setDetail(updated);
      toast.success(t('meetingUpdated'));
      setEditOpen(false);
      await fetchMeetings();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!detail || !organization.id) return;
    setCreateRoomSubmitting(true);
    try {
      const updated = await meetingsApi.createRoom(organization.id, detail.id);
      setDetail(updated);
      toast.success(t('videoRoomCreated'));
      await fetchMeetings();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setCreateRoomSubmitting(false);
    }
  };

  const openManageModerators = async () => {
    if (!detail?.id || !organization.id) return;
    setManageModeratorsOpen(true);
    await Promise.all([refreshModerators(detail.id), fetchAssignableUsers(detail.id)]);
  };

  const handleAddModerator = async () => {
    if (!detail?.id || !organization.id || !newModeratorUserId.trim()) return;
    setModeratorActionSubmitting(true);
    try {
      const moderator = await meetingModeratorsApi.addModerator(organization.id, detail.id, newModeratorUserId.trim());
      setDetail((prev) => {
        if (!prev || prev.id !== detail.id) return prev;
        const existing = prev.moderators ?? [];
        if (existing.some((m) => m.userId === moderator.userId)) return prev;
        return { ...prev, moderators: [...existing, moderator] };
      });
      setNewModeratorUserId('');
      toast.success(t('moderatorAdded', { defaultValue: 'Moderator added' }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setModeratorActionSubmitting(false);
    }
  };

  const handleRemoveModerator = async (userId: string) => {
    if (!detail?.id || !organization.id) return;
    setModeratorActionSubmitting(true);
    try {
      await meetingModeratorsApi.removeModerator(organization.id, detail.id, userId);
      setDetail((prev) => (prev ? { ...prev, moderators: (prev.moderators ?? []).filter((m) => m.userId !== userId) } : prev));
      toast.success(t('moderatorRemoved', { defaultValue: 'Moderator removed' }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setModeratorActionSubmitting(false);
    }
  };

  const canManageMeeting = detail
    ? detail.createdByUserId === currentUser.id || permissions.isRepresentative
    : false;

  const isModerator = Boolean(
    detail &&
      (detail.createdByUserId === currentUser.id ||
        permissions.isRepresentative ||
        (detail.moderators?.some((m) => m.userId === currentUser.id) ?? false))
  );

  /** Scroll to newest timeline row when user turns follow-live on. */
  const scrollMinutesToBottom = useCallback(() => {
    setTimeout(() => {
      const id = getNewestTimelineItemIdForLiveScroll(timelineItems);
      if (id) scrollTimelineBlockIntoView(id);
      else timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  }, [timelineItems]);

  const jumpToDecisions = useCallback(() => {
    const item = timelineItems.find((i) => i.type === 'decision');
    if (item) {
      scrollTimelineBlockIntoView(item.id);
    }
  }, [timelineItems]);

  const hasDecisionsSection = useMemo(
    () => timelineItems.some((i) => i.type === 'decision'),
    [timelineItems]
  );

  useEffect(() => {
    if (addParagraphOpen) {
      const t = setTimeout(() => addParagraphTextareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [addParagraphOpen]);

  useEffect(() => {
    if (editParagraphOpen) {
      const t = setTimeout(() => {
        editParagraphTextareaRef.current?.focus();
        editParagraphTextareaRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editParagraphOpen]);

  useEffect(() => {
    if (startVoteOpen) {
      const t = setTimeout(() => startVoteTitleRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [startVoteOpen]);

  useEffect(() => {
    if ((addTodoOpen || editTodoOpen) && detail?.id && organization.id) {
      fetchAssignableUsers(detail.id);
    }
  }, [addTodoOpen, editTodoOpen, detail?.id, organization.id, fetchAssignableUsers]);

  useEffect(() => {
    if (addTodoOpen && addTodoResponsibleUserId === '' && assignableUsers.length > 0) {
      setAddTodoResponsibleUserId(assignableUsers[0].userId);
    }
  }, [addTodoOpen, addTodoResponsibleUserId, assignableUsers]);

  useEffect(() => {
    if (editTodoItem && !timelineItems.some((i) => i.type === 'todo' && i.id === editTodoItem.id)) {
      setEditTodoOpen(false);
      setEditTodoItem(null);
    }
  }, [timelineItems, editTodoItem]);

  const handleStartVoteOpen = () => {
    setStartVoteTitle('');
    setStartVoteOptions(['', '']);
    setStartVoteSourceEventId(null);
    setStartVoteOpen(true);
  };

  const openStartVoteWithOptions = useCallback(
    ({ title, options, sourceEventId }: { title: string; options: string[]; sourceEventId?: string }) => {
      setStartVoteTitle(title);
      setStartVoteOptions(options.length >= 2 ? options : [...options, '', ''].slice(0, Math.max(2, options.length)));
      setStartVoteSourceEventId(sourceEventId ?? null);
      setStartVoteOpen(true);
    },
    []
  );

  const handleStartVoteSubmit = async () => {
    const title = startVoteTitle.trim();
    if (!title) {
      toast.error(t('titleRequired'));
      return;
    }
    const options = startVoteOptions.map((s) => s.trim()).filter(Boolean);
    if (options.length < 2) {
      toast.error(t('voteOptionsMinTwo'));
      return;
    }
    if (!detail || !organization.id) return;
    setStartVoteSubmitting(true);
    try {
      const vote = await meetingVotesApi.createVote(organization.id, detail.id, {
        title,
        options: options.map((label) => ({ label })),
        ...(startVoteSourceEventId != null && { sourceEventId: startVoteSourceEventId }),
      });
      setActiveVoteId(vote.id);
      setActiveVote(vote);
      setStartVoteOpen(false);
      setStartVoteSourceEventId(null);
      toast.success(t('voteStarted'));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        fetchTimeline(detail.id, { silent: true, meetingVoteIdForScroll: vote.id });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('meetingError');
      toast.error(e instanceof ApiError && e.status === 403 ? e.message : msg);
    } finally {
      setStartVoteSubmitting(false);
    }
  };

  const handleStartBrainstorm = async () => {
    if (!detail || !organization.id) return;
    setStartBrainstormSubmitting(true);
    try {
      const created = await meetingMinutesApi.createEvent(organization.id, detail.id, { eventType: 'brainstorm_started' });
      toast.success(t('brainstormStarted'));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        fetchTimeline(detail.id, { silent: true, scrollToBlockId: created.id });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('meetingError');
      toast.error(e instanceof ApiError && e.status === 403 ? t('onlyModeratorsCan') : msg);
    } finally {
      setStartBrainstormSubmitting(false);
    }
  };

  const handleEndBrainstorm = async (brainstormStartedEventId: string) => {
    if (!detail || !organization.id) return;
    try {
      const created = await meetingMinutesApi.createEvent(organization.id, detail.id, {
        eventType: 'brainstorm_ended',
        payload: { sourceEventId: brainstormStartedEventId },
      });
      toast.success(t('brainstormEnded', { defaultValue: 'Brainstorm ended' }));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        fetchTimeline(detail.id, { silent: true, scrollToBlockId: created.id });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('meetingError');
      toast.error(msg);
    }
  };

  const onCloseBrainstormAndVote = useCallback(
    async (brainstormStartedEventId: string, options: { id: string; label: string }[]) => {
      if (!detail || !organization.id) return;
      setCloseBrainstormAndVoteSubmitting(true);
      try {
        const preparedOptions = options
          .map((o) => ({ label: o.label.trim() }))
          .filter((o) => o.label.length > 0);
        if (preparedOptions.length < 2) {
          toast.error(t('voteOptionsMinTwo'));
          return;
        }
        const result = await meetingMinutesApi.closeBrainstormAndStartVote(organization.id, detail.id, {
          brainstormEventId: brainstormStartedEventId,
          title: t('voteOnBrainstorm', { defaultValue: 'Vote on ideas' }),
          options: preparedOptions,
        });
        setActiveVoteId(result.vote.id);
        setActiveVote(result.vote);
        toast.success(t('voteStarted'));
        if (followLive) {
          fetchTimeline(detail.id, { silent: true, scrollToLive: true });
        } else {
          fetchTimeline(detail.id, { silent: true, scrollToBlockId: result.endedEvent.id });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('meetingError');
        toast.error(msg);
      } finally {
        setCloseBrainstormAndVoteSubmitting(false);
      }
    },
    [detail, organization.id, t, followLive, fetchTimeline]
  );

  const openDateDecidedDialog = () => {
    setDateDecidedMode('poll');
    setDateDecidedValue(toDateInputValue(new Date()));
    const defaultTitle = detail?.title ? `${detail.title} – ${t('datePoll', { defaultValue: 'date poll' })}` : t('datePollDefaultTitle', { defaultValue: 'Next meeting date' });
    setDatePollTitle(defaultTitle);
    setDatePollDescription('');
    const today = toDateInputValue(new Date());
    setDatePollStartDate(today);
    setDatePollEndDate(today);
    setDatePollNoEarlier('09:00');
    setDatePollNoLater('18:00');
    setDatePollStepMinutes(60);
    setDateDecidedOpen(true);
  };

  const handleDateDecidedSubmit = async () => {
    if (!detail || !organization.id) return;
    const date = dateDecidedValue.trim();
    if (!date) {
      toast.error(t('dateRequired', { defaultValue: 'Please enter a date' }));
      return;
    }
    setDatePollSubmitting(true);
    try {
      const created = await meetingMinutesApi.createEvent(organization.id, detail.id, {
        eventType: 'date_decided',
        payload: { date },
      });
      setDateDecidedOpen(false);
      toast.success(t('dateDecidedAdded', { defaultValue: 'Date decided added to minutes' }));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        fetchTimeline(detail.id, { silent: true, scrollToBlockId: created.id });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setDatePollSubmitting(false);
    }
  };

  const handleDatePollSubmit = async () => {
    if (!detail || !organization.id) return;
    const title = datePollTitle.trim();
    if (!title) {
      toast.error(t('datePollTitleRequired', { defaultValue: 'Poll title is required' }));
      return;
    }
    if (!datePollStartDate || !datePollEndDate) {
      toast.error(t('schedulingSlotTimesRequired'));
      return;
    }
    const slots = generateSlots({
      startDate: datePollStartDate,
      endDate: datePollEndDate,
      startTime: datePollNoEarlier,
      endTime: datePollNoLater,
      stepMinutes: datePollStepMinutes,
    });
    if (slots.length === 0) {
      toast.error(t('schedulingSlotTimesRequired'));
      return;
    }
    setDatePollSubmitting(true);
    try {
      const { poll } = await schedulingApi.createSchedulingPoll(organization.id, {
        title,
        description: datePollDescription.trim() || null,
        sourceMeetingId: detail.id,
      });
      await schedulingApi.addSchedulingPollSlots(organization.id, poll.id, { slots });
      const created = await meetingMinutesApi.createEvent(organization.id, detail.id, {
        eventType: 'date_decided',
        payload: { schedulingPollId: poll.id },
      });
      setDateDecidedOpen(false);
      toast.success(t('datePollCreated', { defaultValue: 'Date poll created. Add slots and share the link so people can vote.' }));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        fetchTimeline(detail.id, { silent: true, scrollToBlockId: created.id });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setDatePollSubmitting(false);
    }
  };

  const openDocumentCreatedDialog = () => {
    setDocumentCreatedTitle('');
    setDocumentCreatedOpen(true);
  };

  const handleDocumentCreatedSubmit = async () => {
    if (!detail || !organization.id) return;
    const title = documentCreatedTitle.trim();
    if (!title) {
      toast.error(t('titleRequired'));
      return;
    }
    setDocumentCreatedSubmitting(true);
    try {
      const created = await meetingMinutesApi.createEvent(organization.id, detail.id, {
        eventType: 'document_created',
        payload: { title },
      });
      const payload = created.payload as { documentId?: string; title?: string } | null | undefined;
      if (payload?.documentId) {
        invalidateCache(`/api/documents/organization/${organization.id}`);
        invalidateCache('/api/documents');
      }
      setDocumentCreatedOpen(false);
      toast.success(t('documentCreatedAdded', { defaultValue: 'Document created added to minutes' }));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        fetchTimeline(detail.id, { silent: true, scrollToBlockId: created.id });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setDocumentCreatedSubmitting(false);
    }
  };

  const openAddTodoDialog = () => {
    setAddTodoTitle('');
    setAddTodoDescription('');
    setAddTodoDueDate(toDateInputValue(new Date()));
    setAddTodoResponsibleUserId(assignableUsers[0]?.userId ?? '');
    setAddTodoOpen(true);
  };

  const handleAddTodoSubmit = async () => {
    const title = addTodoTitle.trim();
    if (!title) {
      toast.error(t('todoTitleRequired', { defaultValue: 'Title is required' }));
      return;
    }
    if (!addTodoDueDate.trim()) {
      toast.error(t('todoDueDateRequired', { defaultValue: 'Due date is required' }));
      return;
    }
    if (!addTodoResponsibleUserId) {
      toast.error(t('todoOwnerRequired', { defaultValue: 'Owner is required' }));
      return;
    }
    if (!detail || !organization.id) return;
    setAddTodoSubmitting(true);
    try {
      const created = await meetingMinutesApi.createTodo(organization.id, detail.id, {
        title,
        description: addTodoDescription.trim() || null,
        dueDate: fromDateInputValue(addTodoDueDate)?.toISOString() ?? addTodoDueDate,
        responsibleUserId: addTodoResponsibleUserId,
        agendaItemId: detail.currentAgendaItemId ?? null,
      });
      setAddTodoOpen(false);
      toast.success(t('todoAdded', { defaultValue: 'To-do added' }));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        fetchTimeline(detail.id, { silent: true, scrollToBlockId: created.id });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setAddTodoSubmitting(false);
    }
  };

  const handleTodoStatusChange = async (todoId: string, status: string) => {
    if (!detail || !organization.id) return;
    setTodoActionSubmitting(true);
    try {
      await meetingMinutesApi.updateTodo(organization.id, detail.id, todoId, { status });
      toast.success(t('todoUpdated', { defaultValue: 'To-do updated' }));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        fetchTimeline(detail.id, { silent: true, scrollToBlockId: todoId });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setTodoActionSubmitting(false);
    }
  };

  const handleTodoEdit = (item: TimelineTodoItem) => {
    setEditTodoItem(item);
    setEditTodoTitle(item.title);
    setEditTodoDescription(item.description ?? '');
    setEditTodoDueDate(item.dueDate ? toDateInputValue(item.dueDate) : '');
    setEditTodoResponsibleUserId(item.responsibleUserId);
    setEditTodoStatus(item.status);
    setEditTodoOpen(true);
  };

  const handleEditTodoSubmit = async () => {
    if (!editTodoItem || !detail || !organization.id) return;
    const title = editTodoTitle.trim();
    if (!title && !detail.minutesFinalizedAt) {
      toast.error(t('todoTitleRequired', { defaultValue: 'Title is required' }));
      return;
    }
    setEditTodoSubmitting(true);
    try {
      if (detail.minutesFinalizedAt) {
        await meetingMinutesApi.updateTodo(organization.id, detail.id, editTodoItem.id, { status: editTodoStatus });
      } else {
        await meetingMinutesApi.updateTodo(organization.id, detail.id, editTodoItem.id, {
          title: title || undefined,
          description: editTodoDescription.trim() || null,
          dueDate: editTodoDueDate
            ? fromDateInputValue(editTodoDueDate)?.toISOString() ?? editTodoDueDate
            : undefined,
          responsibleUserId: editTodoResponsibleUserId || undefined,
          status: editTodoStatus,
        });
      }
      setEditTodoOpen(false);
      setEditTodoItem(null);
      toast.success(t('todoUpdated', { defaultValue: 'To-do updated' }));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        fetchTimeline(detail.id, { silent: true, scrollToBlockId: editTodoItem.id });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setEditTodoSubmitting(false);
    }
  };

  const handleTodoDelete = async (todoId: string) => {
    if (!detail || !organization.id) return;
    setTodoActionSubmitting(true);
    try {
      await meetingMinutesApi.deleteTodo(organization.id, detail.id, todoId);
      setDeleteTodoConfirmId(null);
      toast.success(t('todoDeleted', { defaultValue: 'To-do deleted' }));
      fetchTimeline(detail.id, { silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setTodoActionSubmitting(false);
    }
  };

  const openDeleteTodoConfirm = useCallback((todoId: string) => {
    setDeleteTodoConfirmId(todoId);
  }, []);

  const handleExportMinutes = async () => {
    if (!detail?.minutesDocumentId || !organization.id) return;
    setExportMinutesSubmitting(true);
    try {
      const blob = await exportApi.exportDocument(detail.minutesDocumentId, 'pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${detail.title || 'minutes'}.pdf`.replace(/[^a-z0-9.-]/gi, '_');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('exportMinutes'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setExportMinutesSubmitting(false);
    }
  };

  const handleFinalizeMinutes = async () => {
    if (!detail || !organization.id) return;
    setFinalizeSubmitting(true);
    try {
      await meetingMinutesApi.finalize(organization.id, detail.id);
      setFinalizeConfirmOpen(false);
      toast.success(t('minutesFinalized'));
      fetchDetail(detail.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('meetingError');
      toast.error(e instanceof ApiError && e.status === 403 ? e.message : msg);
    } finally {
      setFinalizeSubmitting(false);
    }
  };

  const handleUnfinalizeMinutes = async () => {
    if (!detail || !organization.id) return;
    setUnfinalizeSubmitting(true);
    try {
      await meetingMinutesApi.unfinalize(organization.id, detail.id);
      setUnfinalizeConfirmOpen(false);
      toast.success(t('minutesUnfinalized', { defaultValue: 'Minutes unfinalized' }));
      fetchDetail(detail.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('meetingError');
      toast.error(msg);
    } finally {
      setUnfinalizeSubmitting(false);
    }
  };

  const handleAddParagraph = async () => {
    const title = addParagraphTitle.trim();
    const text = addParagraphText.trim();
    if (!title && !text) {
      toast.error(t('paragraphTextRequired'));
      return;
    }
    if (!detail?.minutesDocumentId || !detail?.id || !organization.id) return;
    setAddParagraphSubmitting(true);
    try {
      if (addEntryMode === 'decision') {
        const agendaId = decisionContext?.agendaItemId ?? detail.currentAgendaItemId ?? undefined;
        const createdDecision = await meetingMinutesApi.createDecision(organization.id, detail.id, {
          ...(title ? { title } : {}),
          ...(text ? { text } : {}),
          ...(decisionContext?.meetingVoteId ? { meetingVoteId: decisionContext.meetingVoteId } : {}),
          ...(agendaId ? { agendaItemId: agendaId } : {}),
        });
        setAddParagraphOpen(false);
        setAddEntryMode('paragraph');
        setDecisionContext(null);
        setAddParagraphTitle('');
        setAddParagraphText('');
        toast.success(t('recordDecisionSuccess', { defaultValue: 'Decision recorded.' }));
        if (followLive) {
          fetchTimeline(detail.id, { silent: true, scrollToLive: true });
        } else {
          fetchTimeline(detail.id, { silent: true, scrollToBlockId: createdDecision.id });
        }
        return;
      }

      const created = await paragraphsApi.createParagraph(detail.minutesDocumentId, {
        ...(title ? { title, headingLevel: 'h2' as const } : {}),
        ...(text ? { text } : {}),
        asSuggestion: false,
      });
      setAddParagraphOpen(false);
      setAddEntryMode('paragraph');
      setAddParagraphTitle('');
      setAddParagraphText('');
      toast.success(t('addParagraphSuccess'));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        const blockId = created.paragraph?.id;
        if (blockId) {
          fetchTimeline(detail.id, { silent: true, scrollToBlockId: blockId });
        } else {
          fetchTimeline(detail.id, { silent: true });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('meetingError');
      toast.error(e instanceof ApiError && e.status === 403 ? t('onlyModeratorsCan') : msg);
    } finally {
      setAddParagraphSubmitting(false);
    }
  };

  const handleProposeOrgVoteFromDecision = async (decision: { id: string; title?: string | null; text?: string }) => {
    if (!detail?.id || !organization.id || proposeOrgVoteSubmitting) return;
    const name = (decision.title?.trim() || decision.text?.trim() || '').slice(0, 200);
    if (!name) {
      toast.error(t('protocolCanvas.proposeOrgVoteNeedsText', { defaultValue: 'Decision needs a title or text to propose a vote.' }));
      return;
    }
    setProposeOrgVoteSubmitting(true);
    try {
      const result = await organizationsApi.proposeSubgroup(organization.id, {
        name,
        description: decision.text?.trim() || undefined,
        sourceMeetingDecisionId: decision.id,
      });
      invalidateCache(`/api/organizations/${organization.id}/votes`);
      if (result.mode === 'vote_proposed') {
        toast.success(t('protocolCanvas.proposeOrgVoteSuccess', { defaultValue: 'Organization vote proposed from meeting decision.' }));
      } else {
        toast.success(t('protocolCanvas.proposeOrgVoteCreated', { defaultValue: 'Subgroup created from meeting decision.' }));
      }
      fetchTimeline(detail.id, { silent: true, scrollToBlockId: decision.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('meetingError');
      toast.error(e instanceof ApiError ? e.message : msg);
    } finally {
      setProposeOrgVoteSubmitting(false);
    }
  };

  const handleEditParagraphSubmit = async () => {
    const newTitle = editParagraphNewTitle.trim();
    const newText = editParagraphNewText.trim();
    const item = editParagraphItem;
    if (!item || item.type !== 'paragraph' || !detail?.minutesDocumentId || !detail?.id) return;
    const paragraphId = (item as TimelineParagraphItem).paragraphId ?? (item as TimelineParagraphItem).id;
    if (!paragraphId) return;
    const hadTitle = Boolean((item as { title?: string }).title && String((item as { title?: string }).title).trim());
    if (!newTitle && !newText) {
      toast.error(t('paragraphTextRequired'));
      return;
    }
    setEditParagraphSubmitting(true);
    try {
      // Backend partial update: send title when setting/clearing heading; always send text so body can be set/cleared
      const payload: { title?: string; text?: string; headingLevel?: 'h2' } = { text: newText };
      if (newTitle) {
        payload.title = newTitle;
        payload.headingLevel = 'h2';
      } else if (hadTitle) {
        payload.title = '';
      }
      await paragraphsApi.updateParagraph(detail.minutesDocumentId, paragraphId, payload);
      setEditParagraphOpen(false);
      setEditParagraphItem(null);
      setEditParagraphNewTitle('');
      setEditParagraphNewText('');
      toast.success(t('paragraphUpdated'));
      if (followLive) {
        fetchTimeline(detail.id, { silent: true, scrollToLive: true });
      } else {
        fetchTimeline(detail.id, { silent: true, scrollToBlockId: paragraphId });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('meetingError');
      toast.error(e instanceof ApiError && e.status === 403 ? t('onlyModeratorsCan') : msg);
    } finally {
      setEditParagraphSubmitting(false);
    }
  };

  const handleDeleteParagraph = useCallback(
    async (item: TimelineItem) => {
      if (item.type !== 'paragraph' || !detail?.minutesDocumentId || !detail?.id) return;
      const paragraphId = (item as TimelineParagraphItem).paragraphId ?? (item as TimelineParagraphItem).id;
      if (!paragraphId) return;
      try {
        await paragraphsApi.deleteParagraph(detail.minutesDocumentId, paragraphId);
        toast.success(t('paragraphDeleted', { defaultValue: 'Paragraph deleted.' }));
        fetchTimeline(detail.id, { silent: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('meetingError');
        toast.error(e instanceof ApiError && e.status === 403 ? t('onlyModeratorsCan') : msg);
      }
    },
    [detail?.id, detail?.minutesDocumentId, fetchTimeline, t]
  );

  const handleReorderTimeline = useCallback(
    async (itemIds: string[]) => {
      if (!detail?.id || !organization.id) return;
      try {
        await meetingMinutesApi.reorderTimeline(organization.id, detail.id, itemIds);
        toast.success(t('timelineReordered', { defaultValue: 'Order updated.' }));
        fetchTimeline(detail.id, { silent: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('meetingError');
        toast.error(msg);
      }
    },
    [detail?.id, organization.id, fetchTimeline, t]
  );

  const handleSetCurrentTopic = async (agendaItemId: string | null) => {
    if (!detail?.id || !organization.id) return;
    try {
      const result = await meetingAgendaApi.updateCurrentTopic(organization.id, detail.id, agendaItemId);
      setDetail((prev) => (prev ? { ...prev, currentAgendaItemId: result.currentAgendaItemId } : null));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    }
  };

  const handleAddAgendaItem = async () => {
    const title = addAgendaItemTitle.trim();
    if (!title || !detail?.id || !organization.id) return;
    setAddAgendaItemSubmitting(true);
    try {
      await meetingAgendaApi.create(organization.id, detail.id, { title });
      setAddAgendaItemOpen(false);
      setAddAgendaItemTitle('');
      toast.success(t('agendaItemAdded'));
      fetchAgenda(detail.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setAddAgendaItemSubmitting(false);
    }
  };

  const handleEditAgendaItem = async () => {
    if (!editingAgendaItemId || !editingAgendaItemTitle.trim() || !detail?.id || !organization.id) return;
    setEditAgendaItemSubmitting(true);
    try {
      await meetingAgendaApi.update(organization.id, detail.id, editingAgendaItemId, { title: editingAgendaItemTitle.trim() });
      setEditingAgendaItemId(null);
      setEditingAgendaItemTitle('');
      toast.success(t('agendaItemUpdated'));
      fetchAgenda(detail.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setEditAgendaItemSubmitting(false);
    }
  };

  const handleDeleteAgendaItem = async (itemId: string) => {
    if (!detail?.id || !organization.id) return;
    try {
      await meetingAgendaApi.remove(organization.id, detail.id, itemId);
      toast.success(t('agendaItemRemoved'));
      fetchAgenda(detail.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    }
  };

  // Dedicated page or in-tab detail: show shell immediately with loading state until meeting data arrives (Back is in parent when on dedicated page)
  if (selectedMeetingId && !detail) {
    return (
      <div className={cn(SPACING.section.gap, 'flex flex-col items-center justify-center gap-3 py-12')}>
        <LoadingSpinner size="lg" />
        <p className={cn(COLORS.text.secondary, 'text-sm')}>{t('loadingMeeting')}</p>
      </div>
    );
  }

  if (selectedMeetingId && detail) {
    const isEmbedLayout = !!(detail.meetingLink && videoPreference === 'embed');
    const openMeetingCreateFromPoll = (ctx: { pollId: string; chosenSlot: { startAt: string; endAt: string }; defaultTitle: string }) => {
      setCreateMeetingFromPollContext(ctx);
      setCreateMeetingDialogOpen(true);
    };
    const openParagraphEditor = (item: TimelineItem) => {
      const ti = (item as { title?: string }).title;
      const tx = (item as { text?: string }).text;
      setEditParagraphNewTitle(ti != null ? String(ti) : '');
      setEditParagraphNewText(tx != null ? String(tx) : '');
      setEditParagraphItem(item);
      setEditParagraphOpen(true);
    };
    const openAddParagraphDialog = () => {
      setAddEntryMode('paragraph');
      setAddParagraphTitle('');
      setAddParagraphText('');
      setAddParagraphOpen(true);
    };
    const openAddDecisionDialog = (ctx?: { meetingVoteId?: string; agendaItemId?: string }) => {
      setAddEntryMode('decision');
      setDecisionContext(ctx ?? null);
      setAddParagraphTitle('');
      setAddParagraphText('');
      setAddParagraphOpen(true);
    };
    const openAddAgendaItemDialog = () => {
      setAddAgendaItemTitle('');
      setAddAgendaItemOpen(true);
    };
    const getMeetingMinutesPanelProps = () => ({
      detail,
      timelineItems,
      agendaItems,
      timelineLoading,
      agendaLoading,
      agendaError,
      followLive,
      onFollowLiveChange: setFollowLive,
      onScrollToBottom: scrollMinutesToBottom,
      isModerator,
      organizationId: organization.id,
      currentUserId: currentUser.id,
      activeVoteId,
      activeVote,
      exportMinutesSubmitting,
      closeBrainstormAndVoteSubmitting,
      startBrainstormSubmitting,
      timelineScrollContainerRef,
      timelineEndRef,
      jumpToDecisions,
      hasDecisionsSection,
      onSetCurrentTopic: handleSetCurrentTopic,
      onDeleteAgendaItem: handleDeleteAgendaItem,
      onEditAgendaItem: (id: string, title: string) => { setEditingAgendaItemId(id); setEditingAgendaItemTitle(title); },
      fetchTimeline,
      fetchActiveVote,
      onVoteCast: handleVoteCast,
      onCloseVote: handleCloseVote,
      closeVoteSubmitting,
      onEndBrainstorm: handleEndBrainstorm,
      onCloseBrainstormAndVote,
      onEditParagraph: openParagraphEditor,
      onDeleteParagraph: handleDeleteParagraph,
      reorderMode,
      onReorderModeChange: setReorderMode,
      onReorderTimeline: handleReorderTimeline,
      onTodoStatusChange: handleTodoStatusChange,
      onTodoEdit: handleTodoEdit,
      onTodoDelete: openDeleteTodoConfirm,
      todoActionSubmitting,
      onAddParagraph: openAddParagraphDialog,
      onAddDecision: openAddDecisionDialog,
      onAddTodo: openAddTodoDialog,
      onStartVote: handleStartVoteOpen,
      onProposeOrgVote: permissions.isRepresentative ? handleProposeOrgVoteFromDecision : undefined,
      proposeOrgVoteSubmitting,
      onStartBrainstorm: handleStartBrainstorm,
      onDateDecided: openDateDecidedDialog,
      onDocumentCreated: openDocumentCreatedDialog,
      onExportMinutes: handleExportMinutes,
      onFinalizeMinutes: () => setFinalizeConfirmOpen(true),
      onUnfinalizeMinutes: handleUnfinalizeMinutes,
      onAddAgendaItem: openAddAgendaItemDialog,
      setUnfinalizeConfirmOpen,
      onNavigateToHash,
      onNavigateToDocument,
      onCreateMeetingFromPoll: openMeetingCreateFromPoll,
    });
    const meetingMinutesPanelSharedProps = getMeetingMinutesPanelProps();
    return (
      <div
        className={cn(
          'flex h-full min-h-0 w-full max-w-full flex-1 flex-col',
          isEmbedLayout && 'overflow-hidden'
        )}
      >
        <MeetingProtocolPanel
          detail={detail}
          organizationId={organization.id}
          videoPreference={videoPreference}
          onVideoPreferenceChange={setVideoPreference}
          canManageMeeting={canManageMeeting}
          isModerator={isModerator}
          onBack={onBack}
          onEditMeeting={openEditDialog}
          onManageModerators={openManageModerators}
          onCreateVideoRoom={handleCreateRoom}
          createRoomSubmitting={createRoomSubmitting}
          videoRoomCreationEnabled={videoRoomCreationEnabled}
        />
        <div className={cn(isEmbedLayout ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'flex min-h-0 flex-1 flex-col', 'flex flex-col')}>
          <LoadingState isLoading={detailLoading} mode="skeleton" skeletonVariant="card">
            <div className={cn(isEmbedLayout && 'flex min-h-0 flex-1 flex-col')}>
              {/* Embed: video full viewport + optional translucent minutes drawer on the right (portaled to body so parent overflow-x-hidden cannot clip fixed layers). */}
              {isEmbedLayout ? (
                <>
                  {typeof document !== 'undefined' &&
                    createPortal(
                      <>
                        {/* Video below edge strip in DOM so strip stays hit-testable above iframe */}
                        <div className="fixed inset-0 z-0 flex flex-col">
                          <Card className={cn("min-h-0 flex flex-1 flex-col border-0 shadow-none", RADIUS.editorial)}>
                            <div className={cn("relative h-full min-h-0 flex-1 overflow-hidden border border-border/60 bg-muted", RADIUS.editorial)}>
                              {embedError ? (
                                <div className={cn(SPACING.card.padding, SPACING.content.gap, 'absolute inset-0')}>
                                  <p className={cn(COLORS.text.secondary, 'text-sm')}>{t('couldNotEmbed')}</p>
                                  <Button size="sm" onClick={() => window.open(detail.meetingLink!, '_blank')}>
                                    {t('openInNewTab')}
                                  </Button>
                                </div>
                              ) : (
                                <iframe
                                  src={detail.meetingLink!}
                                  title={detail.title}
                                  className="h-full min-h-0 w-full object-cover"
                                  allow="camera; microphone; fullscreen; display-capture; autoplay; speaker-selection"
                                  referrerPolicy="strict-origin-when-cross-origin"
                                  onError={() => setEmbedError(true)}
                                />
                              )}
                            </div>
                          </Card>
                        </div>
                        {/* Minutes: fixed right; full-width sheet on small screens, partial transparent overlay from sm up */}
                        <div
                          className={cn(
                            `fixed right-0 bottom-0 ${Z_INDEX.dropdown} flex min-h-0 flex-col overflow-hidden border-l border-border/30 transition-all duration-200`,
                            'bg-background/95 shadow-2xl backdrop-blur-md sm:bg-background/40 sm:shadow-xl sm:backdrop-blur-xl',
                            !overlayVisible && 'pointer-events-none translate-x-full opacity-0',
                          )}
                          style={{
                            width: `min(100%, ${overlayWidthPct}%)`,
                            maxWidth: '42rem',
                            top: 'calc(var(--app-chrome-height, 56px) + var(--app-chrome-panel-height, 0px))',
                            maxHeight:
                              'calc(100dvh - var(--app-chrome-height, 56px) - var(--app-chrome-panel-height, 0px))',
                          }}
                          onMouseEnter={() => {
                            if (hoverLeaveTimeoutRef.current) {
                              clearTimeout(hoverLeaveTimeoutRef.current);
                              hoverLeaveTimeoutRef.current = null;
                            }
                          }}
                          onMouseLeave={() => {
                            if (overlayPinned) return;
                            hoverLeaveTimeoutRef.current = setTimeout(() => {
                              hoverLeaveTimeoutRef.current = null;
                              setOverlayVisible(false);
                            }, HOVER_LEAVE_DELAY_MS);
                          }}
                        >
                          {/* Resize handle on left edge */}
                          <div
                            className="absolute left-0 top-0 bottom-0 hidden w-1 cursor-col-resize bg-border/30 transition-colors hover:bg-primary/30 sm:block"
                            onPointerDown={handleOverlayResizeStart}
                            aria-hidden
                          />
                          <MeetingMinutesPanel
                            variant="embed"
                            {...meetingMinutesPanelSharedProps}
                            overlayPinned={overlayPinned}
                            onCloseOverlay={() => setOverlayVisible(false)}
                            onPinOverlay={setOverlayPinned}
                          />
                        </div>
                        {/* Right-edge hover zone: rendered last so it sits above iframe; disabled while overlay is showing (unpinned) */}
                        <div
                          className={cn(
                            `fixed right-0 top-0 bottom-0 ${Z_INDEX.overlay} w-12 sm:w-16 md:w-24`,
                            (overlayVisible || overlayPinned) && 'pointer-events-none'
                          )}
                          onMouseEnter={() => {
                            if (overlayPinned || overlayVisible) return;
                            if (hoverLeaveTimeoutRef.current) {
                              clearTimeout(hoverLeaveTimeoutRef.current);
                              hoverLeaveTimeoutRef.current = null;
                            }
                            hoverZoneJustRevealedRef.current = true;
                            setOverlayVisible(true);
                            setTimeout(() => {
                              hoverZoneJustRevealedRef.current = false;
                            }, 400);
                          }}
                          onMouseLeave={() => {
                            if (overlayPinned) return;
                            if (overlayVisible) return;
                            if (hoverZoneJustRevealedRef.current) return;
                            hoverLeaveTimeoutRef.current = setTimeout(() => {
                              hoverLeaveTimeoutRef.current = null;
                              setOverlayVisible(false);
                            }, HOVER_LEAVE_DELAY_MS);
                          }}
                          onClick={() => {
                            if (!overlayPinned && !overlayVisible) setOverlayVisible(true);
                          }}
                          onTouchStart={() => {
                            if (!overlayPinned && !overlayVisible) setOverlayVisible(true);
                          }}
                          aria-hidden
                        />
                        {!overlayVisible && compactAction && (
                          <div
                            className={cn(
                              `fixed right-24 top-1/2 ${Z_INDEX.chrome} flex max-w-[260px] -translate-y-1/2 flex-col gap-2 sm:right-28`,
                              SPACING.card.base,
                              SPACING.card.padding,
                              'border border-border/60 bg-background/95 shadow-lg backdrop-blur-sm'
                            )}
                            role="status"
                            aria-live="polite"
                            aria-label={t('minutesUpdate')}
                          >
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <p className={cn(COLORS.text.primary, 'min-w-0 break-words text-sm font-medium')}>
                                {compactAction.eventType === 'vote-started' &&
                                  t('voteStarted') +
                                    (typeof (compactAction.data as { title?: string })?.title === 'string'
                                      ? `: ${(compactAction.data as { title: string }).title}`
                                      : '')}
                                {compactAction.eventType === 'minutes-event-added' &&
                                  (compactAction.data as { event?: { eventType?: string } })?.event?.eventType === 'brainstorm_started' &&
                                  t('brainstormStarted')}
                                {compactAction.eventType === 'minutes-paragraph-added' && t('paragraphAdded')}
                                {compactAction.eventType === 'minutes-paragraph-updated' && t('paragraphUpdated')}
                                {compactAction.eventType === 'agenda-item-added' && t('agendaItemAdded')}
                                {compactAction.eventType === 'brainstorm-option-added' && t('newIdeaAdded')}
                                {compactAction.eventType === 'minutes-event-added' &&
                                  (compactAction.data as { event?: { eventType?: string } })?.event?.eventType !== 'brainstorm_started' &&
                                  t('paragraphAdded')}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 shrink-0 p-0"
                                onClick={() => setCompactAction(null)}
                                aria-label={t('dismiss')}
                              >
                                <Icon name="X" className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {compactAction.eventType === 'vote-started' ||
                              (compactAction.eventType === 'minutes-event-added' &&
                                (compactAction.data as { event?: { eventType?: string } })?.event?.eventType === 'brainstorm_started') ? (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setOverlayVisible(true);
                                    setOverlayPinned(true);
                                    setCompactAction(null);
                                  }}
                                >
                                  {compactAction.eventType === 'vote-started' ? t('openToVote') : t('openToAddIdeas')}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setOverlayVisible(true);
                                    setOverlayPinned(true);
                                    setCompactAction(null);
                                  }}
                                >
                                  {t('openMinutes')}
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </>,
                      document.body
                    )}
                  {/* In-flow placeholder so flex layout under the orb keeps viewport height */}
                  <div className="h-full min-h-0 w-full flex-1" aria-hidden />
                </>
              ) : (
                <>
                  {/* No embed: single column (video in new tab or no link); fills viewport under orb */}
                  <div className="flex min-h-0 flex-1 flex-col">
                    <MeetingMinutesPanel variant="standalone" {...meetingMinutesPanelSharedProps} />
                  </div>
                </>
              )}
            </div>
          </LoadingState>
        </div>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('editMeeting')}</DialogTitle>
            </DialogHeader>
            <div className={cn(SPACING.content.gap)}>
              <TimezoneBanner />
              <div>
                <Label>{t('meetingTitle')}</Label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder={t('meetingTitle')}
                />
              </div>
              <div>
                <Label>{t('meetingDate')} / {t('meetingTime')}</Label>
                <Input
                  type="datetime-local"
                  value={editScheduled}
                  onChange={(e) => setEditScheduled(e.target.value)}
                />
              </div>
              <div>
                <Label>{t('meetingEndTime')} ({t('optional')})</Label>
                <Input
                  type="datetime-local"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
              </div>
              <div>
                <Label>{t('meetingLocation')}</Label>
                <Input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder={t('meetingLocation')}
                />
              </div>
              <div>
                <Label>{t('pasteLink')}</Label>
                <Input
                  value={editLink}
                  onChange={(e) => setEditLink(e.target.value)}
                  placeholder={t('pasteLinkPlaceholder')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleUpdateMeeting} disabled={editSubmitting}>
                {editSubmitting ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={manageModeratorsOpen} onOpenChange={setManageModeratorsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('manageModerators', { defaultValue: 'Manage moderators' })}</DialogTitle>
            </DialogHeader>
            <div className={cn(SPACING.content.gap)}>
              <div className={cn(SPACING.tight.gap)}>
                <Label>{t('currentModerators', { defaultValue: 'Current moderators' })}</Label>
                <div className={cn(SPACING.tight.gap)}>
                  {(detail?.moderators ?? []).length === 0 ? (
                    <p className={cn(COLORS.text.hint, 'text-sm')}>{t('noModerators', { defaultValue: 'No moderators found' })}</p>
                  ) : (
                    (detail?.moderators ?? []).map((m) => (
                      <div key={m.userId} className={cn("flex items-center justify-between gap-2 border px-3 py-2", RADIUS.control)}>
                        <div className="min-w-0">
                          <p className={cn(COLORS.text.primary, 'text-sm truncate')}>{m.userName || m.userId}</p>
                          <p className={cn(COLORS.text.hint, 'text-xs')}>{m.source}</p>
                        </div>
                        {m.source === 'invited' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRemoveModerator(m.userId)}
                            disabled={moderatorActionSubmitting}
                          >
                            <Icon name="Trash2" className="h-4 w-4 mr-1" />
                            {t('remove', { defaultValue: 'Remove' })}
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className={cn(SPACING.tight.gap)}>
                <Label>{t('addModerator', { defaultValue: 'Add moderator' })}</Label>
                <Select value={newModeratorUserId} onValueChange={setNewModeratorUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectOwner', { defaultValue: 'Select owner' })} />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.userName || u.userId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddModerator} disabled={moderatorActionSubmitting || !newModeratorUserId}>
                  {moderatorActionSubmitting ? t('saving') : t('add', { defaultValue: 'Add' })}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addParagraphOpen} onOpenChange={setAddParagraphOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{addEntryMode === 'decision' ? t('recordDecision', { defaultValue: 'Record decision' }) : t('addParagraphTitle')}</DialogTitle>
            </DialogHeader>
            <div className={cn(SPACING.content.gap)}>
              <div>
                <Label>{addEntryMode === 'decision' ? t('decisionTitle', { defaultValue: 'Decision title (optional)' }) : t('addParagraphTitleLabel', { defaultValue: 'Section title (optional)' })}</Label>
                <Input
                  value={addParagraphTitle}
                  onChange={(e) => setAddParagraphTitle(e.target.value)}
                  placeholder={addEntryMode === 'decision' ? t('decisionTitlePlaceholder', { defaultValue: 'e.g. Budget approval' }) : t('addParagraphTitlePlaceholder', { defaultValue: 'e.g. Decisions' })}
                />
                <p className={cn(COLORS.text.hint, 'text-xs mt-1')}>
                  {addEntryMode === 'decision'
                    ? t('decisionTitleAndBodyHint', { defaultValue: 'Title is optional. Add details and outcomes for the recorded decision.' })
                    : t('addParagraphHeadingAndBodyHint', { defaultValue: 'Section is optional. You can add a heading, body text, or both.' })}
                </p>
              </div>
              <div>
                <Label>{addEntryMode === 'decision' ? t('decisionContentLabel', { defaultValue: 'Decision details' }) : t('addParagraphContentLabel')}</Label>
                <div className={cn(SPACING.tight.inline, 'flex flex-wrap items-center gap-1 mt-1 mb-1')}>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertMarkdown(addParagraphText, setAddParagraphText, addParagraphTextareaRef, '**', '**')}>
                    <strong>B</strong>
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs italic" onClick={() => insertMarkdown(addParagraphText, setAddParagraphText, addParagraphTextareaRef, '_', '_')}>
                    I
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertMarkdown(addParagraphText, setAddParagraphText, addParagraphTextareaRef, '\n- ', '')}>
                    • List
                  </Button>
                </div>
                <Textarea
                  ref={addParagraphTextareaRef}
                  value={addParagraphText}
                  onChange={(e) => setAddParagraphText(e.target.value)}
                  placeholder={addEntryMode === 'decision' ? t('decisionPlaceholder', { defaultValue: 'Describe the final decision and rationale…' }) : t('addParagraphPlaceholder')}
                  rows={4}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (!addParagraphSubmitting && (addParagraphTitle.trim() || addParagraphText.trim())) handleAddParagraph();
                    }
                  }}
                />
                <p className={cn(COLORS.text.hint, 'text-xs mt-1')}>{t('minutesParagraphFormattingHint')}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddParagraphOpen(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleAddParagraph} disabled={addParagraphSubmitting || (!addParagraphTitle.trim() && !addParagraphText.trim())}>
                {addParagraphSubmitting ? t('saving') : addEntryMode === 'decision' ? t('recordDecision', { defaultValue: 'Record decision' }) : t('addParagraph')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addTodoOpen} onOpenChange={setAddTodoOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('addTodo', { defaultValue: 'Add to-do' })}</DialogTitle>
            </DialogHeader>
            <div className={cn(SPACING.content.gap)}>
              <div>
                <Label>{t('todoTitle', { defaultValue: 'Title' })}</Label>
                <Input value={addTodoTitle} onChange={(e) => setAddTodoTitle(e.target.value)} placeholder={t('todoTitle', { defaultValue: 'Title' })} />
              </div>
              <div>
                <Label>{t('todoDescription', { defaultValue: 'Description' })}</Label>
                <Textarea value={addTodoDescription} onChange={(e) => setAddTodoDescription(e.target.value)} placeholder={t('todoDescriptionOptional', { defaultValue: 'Optional' })} rows={2} className="resize-none" />
              </div>
              <div>
                <Label>{t('todoDueDate', { defaultValue: 'Due date' })}</Label>
                <Input type="date" value={addTodoDueDate} onChange={(e) => setAddTodoDueDate(e.target.value)} />
              </div>
              <div>
                <Label>{t('todoOwner', { defaultValue: 'Owner' })}</Label>
                <Select value={addTodoResponsibleUserId} onValueChange={setAddTodoResponsibleUserId} disabled={assignableUsersLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('todoOwnerPlaceholder', { defaultValue: 'Select owner' })} />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.userId} value={u.userId}>{u.userName ?? u.userId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddTodoOpen(false)}>{t('cancel')}</Button>
              <Button onClick={handleAddTodoSubmit} disabled={addTodoSubmitting || !addTodoTitle.trim() || !addTodoDueDate || !addTodoResponsibleUserId}>
                {addTodoSubmitting ? t('saving') : t('addTodo', { defaultValue: 'Add to-do' })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editTodoOpen} onOpenChange={(open) => { if (!open) { setEditTodoOpen(false); setEditTodoItem(null); } }}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('editTodo', { defaultValue: 'Edit to-do' })}</DialogTitle>
            </DialogHeader>
            <div className={cn(SPACING.content.gap)}>
              {detail?.minutesFinalizedAt ? (
                <div>
                  <Label>{t('todoStatus', { defaultValue: 'Status' })}</Label>
                  <Select value={editTodoStatus} onValueChange={setEditTodoStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{t('todoStatus_pending', { defaultValue: 'Pending' })}</SelectItem>
                      <SelectItem value="in_progress">{t('todoStatus_in_progress', { defaultValue: 'In progress' })}</SelectItem>
                      <SelectItem value="done">{t('todoStatus_done', { defaultValue: 'Done' })}</SelectItem>
                      <SelectItem value="cancelled">{t('todoStatus_cancelled', { defaultValue: 'Cancelled' })}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className={cn(COLORS.text.hint, 'text-xs mt-1')}>{t('todoOnlyStatusEditableAfterFinalize', { defaultValue: 'Only status can be changed after minutes are finalized.' })}</p>
                </div>
              ) : (
                <>
                  <div>
                    <Label>{t('todoTitle', { defaultValue: 'Title' })}</Label>
                    <Input value={editTodoTitle} onChange={(e) => setEditTodoTitle(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('todoDescription', { defaultValue: 'Description' })}</Label>
                    <Textarea value={editTodoDescription} onChange={(e) => setEditTodoDescription(e.target.value)} rows={2} className="resize-none" />
                  </div>
                  <div>
                    <Label>{t('todoDueDate', { defaultValue: 'Due date' })}</Label>
                    <Input type="date" value={editTodoDueDate} onChange={(e) => setEditTodoDueDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('todoOwner', { defaultValue: 'Owner' })}</Label>
                    <Select value={editTodoResponsibleUserId} onValueChange={setEditTodoResponsibleUserId} disabled={assignableUsersLoading}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {assignableUsers.map((u) => (
                          <SelectItem key={u.userId} value={u.userId}>{u.userName ?? u.userId}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('todoStatus', { defaultValue: 'Status' })}</Label>
                    <Select value={editTodoStatus} onValueChange={setEditTodoStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">{t('todoStatus_pending', { defaultValue: 'Pending' })}</SelectItem>
                        <SelectItem value="in_progress">{t('todoStatus_in_progress', { defaultValue: 'In progress' })}</SelectItem>
                        <SelectItem value="done">{t('todoStatus_done', { defaultValue: 'Done' })}</SelectItem>
                        <SelectItem value="cancelled">{t('todoStatus_cancelled', { defaultValue: 'Cancelled' })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditTodoOpen(false); setEditTodoItem(null); }}>{t('cancel')}</Button>
              <Button onClick={handleEditTodoSubmit} disabled={editTodoSubmitting}>{editTodoSubmitting ? t('saving') : t('save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteTodoConfirmId} onOpenChange={(open) => { if (!open) setDeleteTodoConfirmId(null); }}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('deleteTodoConfirmTitle', { defaultValue: 'Delete to-do?' })}</DialogTitle>
            </DialogHeader>
            <p className={cn(COLORS.text.secondary, 'text-sm')}>{t('deleteTodoConfirmMessage', { defaultValue: 'This cannot be undone.' })}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTodoConfirmId(null)}>{t('cancel')}</Button>
              <Button variant="destructive" onClick={() => deleteTodoConfirmId && handleTodoDelete(deleteTodoConfirmId)} disabled={!!todoActionSubmitting}>
                {todoActionSubmitting ? t('saving') : t('deleteTodoConfirmButton', { defaultValue: 'Delete' })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addAgendaItemOpen} onOpenChange={setAddAgendaItemOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('addAgendaItem')}</DialogTitle>
            </DialogHeader>
            <div className={cn(SPACING.content.gap)}>
              <div>
                <Label>{t('agendaItemTitle')}</Label>
                <Input
                  value={addAgendaItemTitle}
                  onChange={(e) => setAddAgendaItemTitle(e.target.value)}
                  placeholder={t('agendaItemTitle')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddAgendaItemOpen(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleAddAgendaItem} disabled={addAgendaItemSubmitting || !addAgendaItemTitle.trim()}>
                {addAgendaItemSubmitting ? t('saving') : t('add')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!editingAgendaItemId}
          onOpenChange={(open) => { if (!open) { setEditingAgendaItemId(null); setEditingAgendaItemTitle(''); } }}
        >
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('editAgendaItem')}</DialogTitle>
            </DialogHeader>
            <div className={cn(SPACING.content.gap)}>
              <div>
                <Label>{t('agendaItemTitle')}</Label>
                <Input
                  value={editingAgendaItemTitle}
                  onChange={(e) => setEditingAgendaItemTitle(e.target.value)}
                  placeholder={t('agendaItemTitle')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditingAgendaItemId(null); setEditingAgendaItemTitle(''); }}>
                {t('cancel')}
              </Button>
              <Button onClick={handleEditAgendaItem} disabled={editAgendaItemSubmitting || !editingAgendaItemTitle.trim()}>
                {editAgendaItemSubmitting ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={editParagraphOpen}
          onOpenChange={(open) => {
            if (!open) {
              setEditParagraphOpen(false);
              setEditParagraphItem(null);
              setEditParagraphNewTitle('');
              setEditParagraphNewText('');
            }
          }}
        >
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('editParagraphTitle')}</DialogTitle>
            </DialogHeader>
            <div className={cn(SPACING.content.gap)}>
              <div>
                <Label>{t('addParagraphTitleLabel', { defaultValue: 'Section title (optional)' })}</Label>
                <Input
                  value={editParagraphNewTitle}
                  onChange={(e) => setEditParagraphNewTitle(e.target.value)}
                  placeholder={t('addParagraphTitlePlaceholder', { defaultValue: 'e.g. Decisions' })}
                />
              </div>
              <div>
                <Label>{t('addParagraphContentLabel')}</Label>
                <div className={cn(SPACING.tight.inline, 'flex flex-wrap items-center gap-1 mb-1')}>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertMarkdown(editParagraphNewText, setEditParagraphNewText, editParagraphTextareaRef, '**', '**')}>
                    <strong>B</strong>
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs italic" onClick={() => insertMarkdown(editParagraphNewText, setEditParagraphNewText, editParagraphTextareaRef, '_', '_')}>
                    I
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertMarkdown(editParagraphNewText, setEditParagraphNewText, editParagraphTextareaRef, '\n- ', '')}>
                    • List
                  </Button>
                </div>
                <Textarea
                  ref={editParagraphTextareaRef}
                  value={editParagraphNewText}
                  onChange={(e) => setEditParagraphNewText(e.target.value)}
                  placeholder={t('addParagraphPlaceholder')}
                  rows={6}
                  className="min-h-[120px] resize-y"
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (
                        !editParagraphSubmitting &&
                        (editParagraphNewTitle.trim() || editParagraphNewText.trim())
                      ) {
                        handleEditParagraphSubmit();
                      }
                    }
                  }}
                />
                <p className={cn(COLORS.text.hint, 'text-xs mt-1')}>
                  {t('minutesParagraphFormattingHint')} {t('editParagraphHintMinutes')}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditParagraphOpen(false);
                  setEditParagraphItem(null);
                  setEditParagraphNewTitle('');
                  setEditParagraphNewText('');
                }}
              >
                {t('cancel')}
              </Button>
              <Button onClick={handleEditParagraphSubmit} disabled={editParagraphSubmitting || (!editParagraphNewTitle.trim() && !editParagraphNewText.trim())}>
                {editParagraphSubmitting ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={startVoteOpen}
          onOpenChange={(open) => {
            setStartVoteOpen(open);
            if (!open) setStartVoteSourceEventId(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('startVote')}</DialogTitle>
            </DialogHeader>
            <div className={cn(SPACING.content.gap)}>
              <div>
                <Label>{t('voteTitle')}</Label>
                <Input
                  ref={startVoteTitleRef}
                  value={startVoteTitle}
                  onChange={(e) => setStartVoteTitle(e.target.value)}
                  placeholder={t('voteTitle')}
                />
              </div>
              <div>
                <Label>{t('addOption')}</Label>
                {startVoteOptions.map((val, i) => (
                  <div key={i} className={cn(SPACING.tight.inline, 'flex gap-2 mb-2')}>
                    <Input
                      value={val}
                      onChange={(e) => {
                        const next = [...startVoteOptions];
                        next[i] = e.target.value;
                        setStartVoteOptions(next);
                      }}
                      placeholder={t('optionLabel', { number: i + 1 })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setStartVoteOptions(startVoteOptions.filter((_, j) => j !== i))
                      }
                      disabled={startVoteOptions.length <= 2}
                    >
                      {t('remove')}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStartVoteOptions([...startVoteOptions, ''])}
                >
                  {t('addOption')}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStartVoteOpen(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleStartVoteSubmit} disabled={startVoteSubmitting}>
                {startVoteSubmitting ? t('saving') : t('startVote')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <FinalizeMinutesDialog
          open={finalizeConfirmOpen}
          onOpenChange={setFinalizeConfirmOpen}
          agendaCount={agendaItems.length}
          paragraphCount={timelineItems.filter((i) => i.type === 'paragraph').length}
          voteCount={timelineItems.filter((i) => i.type === 'event' && (i as TimelineEventItem).eventType === 'vote_started').length}
          submitting={finalizeSubmitting}
          onFinalize={handleFinalizeMinutes}
        />

        <Dialog open={dateDecidedOpen} onOpenChange={setDateDecidedOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('decideOnDate', { defaultValue: 'Decide on date' })}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className={cn(SPACING.tight.inline, 'flex flex-wrap gap-2')}>
                <Button
                  type="button"
                  variant={dateDecidedMode === 'date' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateDecidedMode('date')}
                >
                  {t('recordDate', { defaultValue: 'Record a date' })}
                </Button>
                <Button
                  type="button"
                  variant={dateDecidedMode === 'poll' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateDecidedMode('poll')}
                >
                  {t('createDatePoll', { defaultValue: 'Create a date poll' })}
                </Button>
              </div>
              {dateDecidedMode === 'date' ? (
                <div className="grid gap-2">
                  <Label htmlFor="date-decided-input">{t('date', { defaultValue: 'Date' })}</Label>
                  <Input
                    id="date-decided-input"
                    type="date"
                    value={dateDecidedValue}
                    onChange={(e) => setDateDecidedValue(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="date-poll-title">{t('datePollTitle', { defaultValue: 'Poll title' })}</Label>
                    <Input
                      id="date-poll-title"
                      value={datePollTitle}
                      onChange={(e) => setDatePollTitle(e.target.value)}
                      placeholder={t('datePollTitlePlaceholder', { defaultValue: 'e.g. Next meeting date' })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="date-poll-description">{t('description')} ({t('optional')})</Label>
                    <Input
                      id="date-poll-description"
                      value={datePollDescription}
                      onChange={(e) => setDatePollDescription(e.target.value)}
                      placeholder={t('datePollDescriptionPlaceholder', { defaultValue: 'e.g. Proposed in this meeting' })}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="date-poll-start-date">{t('from', { defaultValue: 'From' })}</Label>
                      <Input
                        id="date-poll-start-date"
                        type="date"
                        value={datePollStartDate}
                        onChange={(e) => setDatePollStartDate(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="date-poll-end-date">{t('to', { defaultValue: 'To' })}</Label>
                      <Input
                        id="date-poll-end-date"
                        type="date"
                        value={datePollEndDate}
                        onChange={(e) => setDatePollEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="date-poll-no-earlier">{t('noEarlierThan', { defaultValue: 'No earlier than' })}</Label>
                      <Input
                        id="date-poll-no-earlier"
                        type="time"
                        value={datePollNoEarlier}
                        onChange={(e) => setDatePollNoEarlier(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="date-poll-no-later">{t('noLaterThan', { defaultValue: 'No later than' })}</Label>
                      <Input
                        id="date-poll-no-later"
                        type="time"
                        value={datePollNoLater}
                        onChange={(e) => setDatePollNoLater(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="date-poll-step">{t('timeStep', { defaultValue: 'Time step (minutes)' })}</Label>
                      <Select
                        value={String(datePollStepMinutes)}
                        onValueChange={(v) => setDatePollStepMinutes(Number(v))}
                      >
                        <SelectTrigger id="date-poll-step">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15</SelectItem>
                          <SelectItem value="30">30</SelectItem>
                          <SelectItem value="60">60</SelectItem>
                          <SelectItem value="120">120</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDateDecidedOpen(false)}>
                {t('cancel')}
              </Button>
              {dateDecidedMode === 'date' ? (
                <Button onClick={handleDateDecidedSubmit} disabled={datePollSubmitting || !dateDecidedValue.trim()}>
                  {datePollSubmitting ? t('saving') : t('addToMinutes', { defaultValue: 'Add to minutes' })}
                </Button>
              ) : (
                <Button onClick={handleDatePollSubmit} disabled={datePollSubmitting || !datePollTitle.trim() || !datePollStartDate || !datePollEndDate}>
                  {datePollSubmitting ? t('saving') : t('create')}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={documentCreatedOpen} onOpenChange={setDocumentCreatedOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('documentCreated', { defaultValue: 'Document created' })}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <label htmlFor="document-created-title" className="text-sm font-medium">
                {t('title')}
              </label>
              <Input
                id="document-created-title"
                value={documentCreatedTitle}
                onChange={(e) => setDocumentCreatedTitle(e.target.value)}
                placeholder={t('documentTitlePlaceholder', { defaultValue: 'Document title' })}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDocumentCreatedOpen(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleDocumentCreatedSubmit} disabled={documentCreatedSubmitting}>
                {documentCreatedSubmitting ? t('saving') : t('addToMinutes', { defaultValue: 'Add to minutes' })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <UnfinalizeMinutesDialog
          open={unfinalizeConfirmOpen}
          onOpenChange={setUnfinalizeConfirmOpen}
          submitting={unfinalizeSubmitting}
          onUnfinalize={handleUnfinalizeMinutes}
        />

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
            fetchMeetings();
            setSelectedMeetingId(meeting.id);
            fetchDetail(meeting.id);
            const hash = `#/organization/${organization.id}/meetings/${meeting.id}`;
            if (onNavigateToHash) onNavigateToHash(hash);
            else if (typeof window !== 'undefined') window.location.hash = hash;
          }}
          fromPollContext={createMeetingFromPollContext}
        />
      </div>
    );
  }

  const listContent = (
    <TabPanelBody>
        <TabPanelHeader
          title={t('meetings')}
          actions={
            <Button
              size="sm"
              onClick={() => {
                const hash = `#/organization/${organization.id}/meetings/new`;
                if (onNavigateToHash) onNavigateToHash(hash);
                else if (typeof window !== 'undefined') window.location.hash = hash;
              }}
            >
              <Icon name="Plus" className="h-4 w-4 mr-2" />
              {t('newMeeting')}
            </Button>
          }
        />

        <LoadingState isLoading={loading} mode="skeleton" skeletonVariant="card" skeletonCount={2}>
          <>
            {error && (
              <ErrorState message={error} onRetry={fetchMeetings} variant="full-page" />
            )}
            {!error && meetings.length === 0 && (
              <EmptyState
                icon={<Icon name="Video" className="h-16 w-16" />}
                title={t('meetingsEmpty')}
                description={t('meetingsEmptyDescription')}
                action={
                  <Button
                    onClick={() => {
                      const hash = `#/organization/${organization.id}/meetings/new`;
                      if (onNavigateToHash) onNavigateToHash(hash);
                      else if (typeof window !== 'undefined') window.location.hash = hash;
                    }}
                  >
                    {t('newMeeting')}
                  </Button>
                }
              />
            )}
            {!error && meetings.length > 0 && (
              <ul className={cn(SPACING.content.gap)}>
                {meetings.map((m) => (
                  <li key={m.id}>
                    <Card
                      className={cn(
                        SPACING.card.base,
                        SPACING.card.padding,
                        SPACING.card.hover,
                        'cursor-pointer'
                      )}
                      onClick={() => {
                        const hash = `#/organization/${organization.id}/meetings/${m.id}`;
                        if (onNavigateToHash) onNavigateToHash(hash);
                        else if (typeof window !== 'undefined') window.location.hash = hash;
                      }}
                    >
                      <div className={cn(SPACING.tight.inline, 'flex flex-wrap items-center justify-between')}>
                        <div className={cn(SPACING.tight.gap)}>
                          <h3 className={cn(NAVIGATION.typography.navItem, 'text-foreground')}>{m.title}</h3>
                          <p className={cn(COLORS.text.secondary, 'text-sm')}>
                            {formatDateTime(m.scheduledAt)}
                            {m.location && ` · ${m.location}`}
                          </p>
                        </div>
                        {m.meetingLink && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVideoPreference('embed');
                              const hash = `#/organization/${organization.id}/meetings/${m.id}`;
                              if (onNavigateToHash) onNavigateToHash(hash);
                              else if (typeof window !== 'undefined') window.location.hash = hash;
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
          </>
        </LoadingState>
    </TabPanelBody>
  );

  if (embedded) {
    return listContent;
  }

  return (
    <div className={cn(SPACING.page.x, SPACING.page.y, SPACING.layout.contentMax)}>
      {listContent}
    </div>
  );
}
