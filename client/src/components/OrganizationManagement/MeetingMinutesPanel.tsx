/**
 * Shared minutes panel: agenda-first timeline, action bar.
 * Used in both embed overlay and standalone layout to avoid duplication.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimezone } from '../../hooks/useTimezone';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Icon } from '../ui/Icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { LoadingState } from '../ui/LoadingState';
import { SPACING, COLORS, NAVIGATION, Z_INDEX, RADIUS } from '../../lib/designSystem';
import { meetingMinutesApi } from '../../lib/api';
import { cn } from '../ui/utils';
import { toast } from 'sonner';
import {
  BottomActionBar,
  ProtocolTimelineCanvas,
  protocolUi,
  type BlockTypeRendererMap,
  dedupeCanvasTimelineBlocks,
} from './blocks';
import { BrainstormBlock, DatePollBlock, DecisionBlock, DocumentLinkBlock, ParagraphBlock, TodoBlock, VoteBlock } from './blocks/renderers';
import { buildProtocolBlocks } from './blocks/protocolBlocks';
import { getNewestProtocolCanvasBlockId } from './blocks/meetingMinutesFollowLive';
import type { DatePollProtocolBlock, ProtocolBlock } from './blocks/protocolBlocks.types';
import type { Meeting } from '../../lib/api/types/meetings';
import type { MeetingAgendaItem } from '../../lib/api/types/meetingAgenda';
import type { TimelineItem, TimelineEventItem, TimelineTodoItem } from '../../lib/api/types/meetingMinutes';
import type { MeetingVote } from '../../lib/api/types/meetingMinutes';

export interface AgendaRowProps {
  item: MeetingAgendaItem;
  isCurrentTopic: boolean;
  isModerator: boolean;
  disabled: boolean;
  onSetCurrentTopic: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
}

export function AgendaRow({
  item,
  isCurrentTopic,
  isModerator,
  disabled,
  onSetCurrentTopic,
  onStartEdit,
  onDelete,
}: AgendaRowProps) {
  const { t } = useTranslation('organization');
  return (
    <li
      className={cn(
        'flex items-center gap-2 flex-wrap py-2 border-b border-border/40 last:border-b-0',
        isCurrentTopic ? cn('ring-inset ring-2 ring-primary/50 bg-muted/50 px-2 -mx-2', RADIUS.control) : ''
      )}
    >
      <button
        type="button"
        onClick={!disabled ? onSetCurrentTopic : undefined}
        disabled={disabled}
        className={cn(
          'flex-1 min-w-0 font-semibold text-foreground text-left text-base leading-tight',
          !disabled && 'hover:underline cursor-pointer'
        )}
      >
        {item.title}
      </button>
      {isCurrentTopic && (
        <span className={cn('text-xs font-medium rounded px-1.5 py-0.5 shrink-0', COLORS.statusBg.info, COLORS.status.info)}>
          {t('currentTopicBadge')}
        </span>
      )}
      {isModerator && !disabled && (
        <div className={cn(SPACING.toolbar.row, SPACING.toolbar.gap)}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onStartEdit} aria-label={t('editAgendaItem')}>
            <Icon name="Edit" className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onDelete} aria-label={t('delete')}>
            <Icon name="Trash2" className="h-4 w-4" />
          </Button>
        </div>
      )}
    </li>
  );
}

function getTimelineTopicTitles(
  timelineItems: TimelineItem[],
  agendaItems: MeetingAgendaItem[]
): { topicTitleByIndex: (string | null)[]; topicSetTitleByIndex: (string | null)[] } {
  const agendaIdToTitle = new Map(agendaItems.map((a) => [a.id, a.title]));
  const topicTitleByIndex: (string | null)[] = [];
  const topicSetTitleByIndex: (string | null)[] = [];
  let lastTopicTitle: string | null = null;
  for (let i = 0; i < timelineItems.length; i++) {
    const item = timelineItems[i];
    if (item.type === 'event') {
      const ev = item as TimelineEventItem;
      const eventType = ev.eventType ?? ev.event?.eventType ?? '';
      const payload = ev.payload ?? ev.event?.payload;
      if (eventType === 'topic_set' && payload && typeof payload.agendaItemId === 'string') {
        const title = agendaIdToTitle.get(payload.agendaItemId) ?? null;
        topicSetTitleByIndex[i] = title;
        lastTopicTitle = title;
      } else {
        topicSetTitleByIndex[i] = null;
      }
    } else {
      topicSetTitleByIndex[i] = null;
    }
    topicTitleByIndex[i] = lastTopicTitle;
  }
  return { topicTitleByIndex, topicSetTitleByIndex };
}

function isHiddenTopicSetEvent(item: TimelineItem): boolean {
  if (item.type !== 'event') return false;
  const ev = item as TimelineEventItem;
  const eventType = ev.eventType ?? ev.event?.eventType ?? '';
  return eventType === 'topic_set';
}

function getTimelineItemReorderLabel(item: TimelineItem): string {
  if (item.type === 'paragraph') {
    const title = item.title?.trim();
    const text = item.text?.trim();
    return title || (text ? text.slice(0, 80) : '') || 'Paragraph';
  }
  if (item.type === 'todo') {
    return item.title?.trim() || 'To-do';
  }
  const ev = item as TimelineEventItem;
  const eventType = ev.eventType ?? ev.event?.eventType ?? 'event';
  if (eventType === 'topic_set') return 'Topic';
  const payload = ev.payload ?? ev.event?.payload;
  if (payload && typeof payload === 'object' && 'title' in payload) {
    const title = (payload as { title?: unknown }).title;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }
  return eventType.replace(/_/g, ' ');
}

export interface MeetingMinutesPanelProps {
  variant: 'embed' | 'standalone';
  detail: Meeting;
  timelineItems: TimelineItem[];
  agendaItems: MeetingAgendaItem[];
  timelineLoading: boolean;
  agendaLoading: boolean;
  agendaError: string | null;
  /** When true, new updates scroll to bottom; when false, scroll to changed block only. */
  followLive: boolean;
  onFollowLiveChange: (value: boolean) => void;
  /** Call when turning follow-live on so viewport jumps to latest (replaces old Jump to live). */
  onScrollToBottom?: () => void;
  isModerator: boolean;
  organizationId: string;
  currentUserId: string;
  activeVoteId: string | null;
  activeVote: MeetingVote | null;
  exportMinutesSubmitting: boolean;
  closeBrainstormAndVoteSubmitting: boolean;
  startBrainstormSubmitting: boolean;
  timelineScrollContainerRef: React.RefObject<HTMLDivElement | null>;
  timelineEndRef: React.RefObject<HTMLDivElement | null>;
  jumpToDecisions: () => void;
  hasDecisionsSection: boolean;
  onSetCurrentTopic: (agendaItemId: string) => void;
  onDeleteAgendaItem: (itemId: string) => void;
  onEditAgendaItem: (itemId: string, title: string) => void;
  fetchTimeline: (
    meetingId: string,
    opts?: { silent?: boolean; scrollToLive?: boolean; scrollToBlockId?: string | null; meetingVoteIdForScroll?: string | null }
  ) => void;
  fetchActiveVote: (meetingId: string, voteId: string) => void;
  /** After a successful cast; parent sets active vote and refetches that vote. */
  onVoteCast?: (voteId: string) => void;
  /** Moderator closes an open meeting vote. */
  onCloseVote?: (voteId: string) => void;
  closeVoteSubmitting?: boolean;
  onEndBrainstorm: (brainstormStartedEventId: string) => void;
  onCloseBrainstormAndVote: (brainstormStartedEventId: string, options: { id: string; label: string }[]) => void;
  onEditParagraph: (item: TimelineItem) => void;
  /** Called when moderator deletes a paragraph (minutes only, before finalize). */
  onDeleteParagraph?: (item: TimelineItem) => void;
  onTodoStatusChange: (todoId: string, status: string) => void;
  onTodoEdit: (item: TimelineTodoItem) => void;
  onTodoDelete: (todoId: string) => void;
  todoActionSubmitting: boolean;
  /** When true, timeline is shown as a flat list with drag handles; reorder is allowed. */
  reorderMode?: boolean;
  onReorderModeChange?: (value: boolean) => void;
  /** Called with new ordered item ids after a successful drag; parent should persist and refetch. */
  onReorderTimeline?: (itemIds: string[]) => Promise<void>;
  onAddParagraph: () => void;
  onAddDecision: (context?: { meetingVoteId?: string; agendaItemId?: string }) => void;
  onAddTodo: () => void;
  onStartVote: () => void;
  /** Propose organization vote (e.g. subgroup_creation) linked to a meeting decision. */
  onProposeOrgVote?: (decision: { id: string; title?: string | null; text?: string }) => void;
  onStartBrainstorm: () => void;
  onDateDecided: () => void;
  onDocumentCreated: () => void;
  onExportMinutes: () => void;
  onFinalizeMinutes: () => void;
  onUnfinalizeMinutes: () => void;
  onAddAgendaItem: () => void;
  setUnfinalizeConfirmOpen: (open: boolean) => void;
  /** Embed only: overlay controls */
  overlayPinned?: boolean;
  onCloseOverlay?: () => void;
  onPinOverlay?: (pinned: boolean) => void;
  /** Open document view (e.g. from "document created" timeline block). */
  onNavigateToDocument?: (documentId: string) => void;
  /** Navigate by hash (e.g. to schedule poll from date_decided poll card). */
  onNavigateToHash?: (hash: string) => void;
  /** Open create-meeting dialog from a finalized date poll (date_decided poll card). */
  onCreateMeetingFromPoll?: (context: { pollId: string; chosenSlot: { startAt: string; endAt: string }; defaultTitle: string }) => void;
}

export function MeetingMinutesPanel({
  variant,
  detail,
  timelineItems,
  agendaItems,
  timelineLoading,
  agendaLoading,
  agendaError,
  followLive,
  onFollowLiveChange,
  onScrollToBottom,
  isModerator,
  organizationId,
  currentUserId,
  activeVoteId: _activeVoteId,
  activeVote,
  exportMinutesSubmitting,
  closeBrainstormAndVoteSubmitting: _closeBrainstormAndVoteSubmitting,
  startBrainstormSubmitting,
  timelineScrollContainerRef,
  timelineEndRef,
  jumpToDecisions,
  hasDecisionsSection,
  onSetCurrentTopic,
  onDeleteAgendaItem,
  onEditAgendaItem,
  fetchTimeline,
  fetchActiveVote: _fetchActiveVote,
  onVoteCast,
  onCloseVote,
  closeVoteSubmitting: _closeVoteSubmitting,
  onEndBrainstorm,
  onCloseBrainstormAndVote,
  onEditParagraph,
  onDeleteParagraph,
  onTodoStatusChange,
  onTodoEdit,
  onTodoDelete,
  todoActionSubmitting: _todoActionSubmitting,
  reorderMode = false,
  onReorderModeChange,
  onReorderTimeline,
  onAddParagraph,
  onAddDecision,
  onAddTodo,
  onStartVote,
  onProposeOrgVote,
  onStartBrainstorm,
  onDateDecided,
  onDocumentCreated,
  onExportMinutes,
  onFinalizeMinutes,
  onUnfinalizeMinutes: _onUnfinalizeMinutes,
  onAddAgendaItem,
  setUnfinalizeConfirmOpen,
  overlayPinned = false,
  onCloseOverlay,
  onPinOverlay,
  onNavigateToDocument,
  onNavigateToHash,
  onCreateMeetingFromPoll,
}: MeetingMinutesPanelProps) {
  const { t } = useTranslation('organization');
  const { formatDateTime } = useTimezone();
  const isEmbed = variant === 'embed';
  const blockNavHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockNavLastHighlightedRef = useRef<HTMLElement | null>(null);
  const lastAutoFocusedCanvasBlockIdRef = useRef<string | null>(null);
  const [submittingBrainstormEventId, setSubmittingBrainstormEventId] = useState<string | null>(null);
  const [liveFollowAnnounce, setLiveFollowAnnounce] = useState('');

  useEffect(() => {
    return () => {
      if (blockNavHighlightTimeoutRef.current) {
        clearTimeout(blockNavHighlightTimeoutRef.current);
      }
    };
  }, []);

  const handleNavigateToBlock = useCallback(
    (targetBlockId: string) => {
      const id = targetBlockId?.trim();
      if (!id) return;
      const root = timelineScrollContainerRef.current;
      if (!root) return;

      const escaped = (() => {
        try {
          const g = globalThis as typeof globalThis & { CSS?: { escape?: (s: string) => string } };
          if (typeof g.CSS?.escape === 'function') return g.CSS.escape(id);
        } catch {
          /* ignore */
        }
        return id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      })();

      const el = root.querySelector<HTMLElement>(`[data-protocol-block-id="${escaped}"]`);
      if (!el) return;

      if (blockNavHighlightTimeoutRef.current) {
        clearTimeout(blockNavHighlightTimeoutRef.current);
      }
      const prev = blockNavLastHighlightedRef.current;
      if (prev && prev !== el) {
        prev.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background', 'transition-shadow');
      }

      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background', 'transition-shadow');
      blockNavLastHighlightedRef.current = el;

      blockNavHighlightTimeoutRef.current = setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background', 'transition-shadow');
        if (blockNavLastHighlightedRef.current === el) {
          blockNavLastHighlightedRef.current = null;
        }
      }, 2200);
    },
    [timelineScrollContainerRef]
  );

  const submitBrainstormOption = useCallback(
    async (brainstormEventId: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed || !detail.id) return;
      setSubmittingBrainstormEventId(brainstormEventId);
      try {
        await meetingMinutesApi.addBrainstormOption(organizationId, detail.id, { brainstormEventId, label: trimmed });
        toast.success(t('addOption'));
        fetchTimeline(detail.id, { silent: true, scrollToBlockId: brainstormEventId });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('meetingError'));
        throw e;
      } finally {
        setSubmittingBrainstormEventId(null);
      }
    },
    [detail.id, fetchTimeline, organizationId, t]
  );

  const protocolBlocks = useMemo(
    () =>
      buildProtocolBlocks({
        detail,
        timelineItems,
        agendaItems,
        activeVote,
      }),
    [detail, timelineItems, agendaItems, activeVote]
  );

  const blockRenderers = useMemo<BlockTypeRendererMap>(
    () => ({
      paragraph: ({ block }) => {
        if (block.type !== 'paragraph') return null;
        const canEdit = isModerator && !detail.minutesFinalizedAt;
        return (
          <ParagraphBlock
            block={block}
            onEditParagraph={() => onEditParagraph(block.paragraph)}
            onDeleteParagraph={onDeleteParagraph ? () => onDeleteParagraph(block.paragraph) : undefined}
            disableEdit={!canEdit}
            disableDelete={!canEdit}
          />
        );
      },
      vote: ({ block }) => {
        if (block.type !== 'vote') return null;
        return (
          <VoteBlock
            block={block}
            organizationId={organizationId}
            meetingId={detail.id}
            onCastVote={onVoteCast ? (voteId) => detail.id && onVoteCast(voteId) : undefined}
            onCloseVote={onCloseVote}
          />
        );
      },
      brainstorm: ({ block }) => {
        if (block.type !== 'brainstorm') return null;
        const brainstormSourceId = block.sourceTimelineItemId ?? block.id;
        const canAddBrainstormIdea = !detail.minutesFinalizedAt && block.status === 'open';
        const canModerateBrainstorm = isModerator && !detail.minutesFinalizedAt && block.status === 'open';
        return (
          <BrainstormBlock
            block={block}
            onSubmitBrainstormIdea={canAddBrainstormIdea ? (idea) => submitBrainstormOption(brainstormSourceId, idea) : undefined}
            brainstormIdeaSubmitting={submittingBrainstormEventId === brainstormSourceId}
            onEndBrainstorm={canModerateBrainstorm ? onEndBrainstorm : undefined}
            onCloseBrainstormAndVote={canModerateBrainstorm ? onCloseBrainstormAndVote : undefined}
          />
        );
      },
      todo: ({ block }) => {
        if (block.type !== 'todo') return null;
        return (
          <TodoBlock
            block={block}
            onEditTodo={onTodoEdit}
            onDeleteTodo={onTodoDelete}
            onStatusChange={onTodoStatusChange}
          />
        );
      },
      decision: ({ block }) => {
        if (block.type !== 'decision') return null;
        const canAct = isModerator && !detail.minutesFinalizedAt;
        const decisionId = block.decision && typeof block.decision === 'object' && 'id' in block.decision
          ? String(block.decision.id)
          : block.sourceTimelineItemId;
        const decisionTitle = block.decision && typeof block.decision === 'object'
          ? (typeof block.decision.title === 'string' ? block.decision.title : null)
          : null;
        const decisionText = block.decision && typeof block.decision === 'object'
          ? (typeof block.decision.text === 'string' ? block.decision.text : '')
          : '';
        const linkedOrgVoteId = block.decision && typeof block.decision === 'object' && 'organizationVoteId' in block.decision
          ? (block.decision.organizationVoteId as string | null)
          : null;
        return (
          <DecisionBlock
            block={block}
            visualWeight="prominent"
            createTodoSlot={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={protocolUi.blockActionBtn}
                disabled={!canAct}
                onClick={onAddTodo}
              >
                <Icon name="ListOrdered" className="h-3.5 w-3.5" aria-hidden />
                {t('addTodo', { defaultValue: 'Add to-do' })}
              </Button>
            }
            proposeOrgVoteSlot={onProposeOrgVote && decisionId && !linkedOrgVoteId ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={protocolUi.blockActionBtn}
                disabled={!canAct}
                onClick={() => onProposeOrgVote({ id: decisionId, title: decisionTitle, text: decisionText })}
              >
                <Icon name="Vote" className="h-3.5 w-3.5" aria-hidden />
                {t('protocolCanvas.proposeOrgVote', { defaultValue: 'Propose organization vote' })}
              </Button>
            ) : undefined}
            secondaryActionSlot={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={protocolUi.blockActionBtn}
                disabled={!canAct}
                onClick={onStartVote}
              >
                <Icon name="Vote" className="h-3.5 w-3.5" aria-hidden />
                {t('startVote')}
              </Button>
            }
          />
        );
      },
      document_link: ({ block }) => {
        if (block.type !== 'document_link') return null;
        return <DocumentLinkBlock block={block} onOpenDocument={onNavigateToDocument} />;
      },
      date_poll: ({ block }) => {
        if (block.type !== 'date_poll') return null;
        const datePollBlock: DatePollProtocolBlock = block;
        const schedulingPoll = (datePollBlock.event as { schedulingPoll?: { status?: unknown; title?: unknown } }).schedulingPoll;
        const status = typeof schedulingPoll?.status === 'string' ? schedulingPoll.status : 'open';
        const defaultTitle = typeof schedulingPoll?.title === 'string' && schedulingPoll.title.trim()
          ? schedulingPoll.title
          : t('timelineEvent.date_poll', { defaultValue: 'Date poll' });
        const pollHash = organizationId && datePollBlock.pollId
          ? `#/organization/${organizationId}/schedule/polls/${datePollBlock.pollId}`
          : '';
        return (
          <DatePollBlock
            block={datePollBlock}
            viewPollSlot={pollHash && onNavigateToHash ? (
              <Button
                variant="outline"
                size="sm"
                className={protocolUi.blockActionBtn}
                onClick={() => onNavigateToHash(pollHash)}
              >
                <Icon name="Calendar" className="h-3.5 w-3.5" aria-hidden />
                {t('viewPoll', { defaultValue: 'View poll' })}
              </Button>
            ) : undefined}
            createMeetingSlot={
              status === 'finalized' &&
              datePollBlock.chosenSlot &&
              datePollBlock.pollId &&
              onCreateMeetingFromPoll ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className={protocolUi.blockActionBtn}
                  onClick={() => {
                    const pollId = datePollBlock.pollId as string;
                    const chosen = datePollBlock.chosenSlot as NonNullable<DatePollProtocolBlock['chosenSlot']>;
                    onCreateMeetingFromPoll({
                      pollId,
                      chosenSlot: {
                        startAt: chosen.startAt,
                        endAt: chosen.endAt,
                      },
                      defaultTitle,
                    });
                  }}
                >
                  <Icon name="Video" className="h-3.5 w-3.5" aria-hidden />
                  {t('createMeeting', { defaultValue: 'Create meeting' })}
                </Button>
              ) : undefined
            }
          />
        );
      },
    }),
    [
      detail.id,
      detail.minutesFinalizedAt,
      isModerator,
      submitBrainstormOption,
      submittingBrainstormEventId,
      onEditParagraph,
      onDeleteParagraph,
      onVoteCast,
      onCloseVote,
      onEndBrainstorm,
      onCloseBrainstormAndVote,
      onTodoEdit,
      onTodoDelete,
      onTodoStatusChange,
      onAddTodo,
      onStartVote,
      onProposeOrgVote,
      onNavigateToDocument,
      onNavigateToHash,
      organizationId,
      onCreateMeetingFromPoll,
      t,
    ]
  );

  const { topicTitleByIndex, topicSetTitleByIndex } = getTimelineTopicTitles(timelineItems, agendaItems);
  const canSetCurrentTopic = isModerator && !detail.minutesFinalizedAt;
  const handleActNextAction = useCallback(
    (block: ProtocolBlock) => {
      if (block.nextAction?.type === 'record_decision') {
        const ctx: { meetingVoteId?: string; agendaItemId?: string } = {};
        if (block.type === 'vote' && block.vote?.id) ctx.meetingVoteId = block.vote.id;
        if (block.agendaItemId) ctx.agendaItemId = block.agendaItemId;
        onAddDecision(Object.keys(ctx).length > 0 ? ctx : undefined);
      } else if (block.nextAction?.type === 'propose_org_vote' && block.type === 'decision' && onProposeOrgVote) {
        const decision = block.decision;
        const id = decision && typeof decision === 'object' && 'id' in decision ? String(decision.id) : block.sourceTimelineItemId;
        if (!id) return;
        const title = decision && typeof decision === 'object' && typeof decision.title === 'string' ? decision.title : null;
        const text = decision && typeof decision === 'object' && typeof decision.text === 'string' ? decision.text : '';
        onProposeOrgVote({ id, title, text });
      }
    },
    [onAddDecision, onProposeOrgVote]
  );
  const canvasTimelineBlocks = useMemo(() => {
    const timelineOnly = protocolBlocks.blocks.filter((block): block is ProtocolBlock => block.type !== 'agenda_item');
    return dedupeCanvasTimelineBlocks(timelineOnly);
  }, [protocolBlocks.blocks]);

  const reorderSortableTimelineIds = useMemo(
    () => timelineItems.filter((i) => !isHiddenTopicSetEvent(i)).map((i) => i.id),
    [timelineItems]
  );

  useEffect(() => {
    if (!followLive) {
      lastAutoFocusedCanvasBlockIdRef.current = null;
    }
  }, [followLive]);

  useEffect(() => {
    if (!followLive || reorderMode) return;
    const newestId = getNewestProtocolCanvasBlockId(canvasTimelineBlocks);
    if (!newestId) return;
    if (lastAutoFocusedCanvasBlockIdRef.current === newestId) return;
    lastAutoFocusedCanvasBlockIdRef.current = newestId;
    handleNavigateToBlock(newestId);
    setLiveFollowAnnounce(t('protocolCanvas.aria.followLiveNewBlock', { defaultValue: 'New minutes entry added.' }));
  }, [canvasTimelineBlocks, followLive, reorderMode, handleNavigateToBlock, t]);

  function SortableBlockRow({
    item,
    index: _index,
    topicTitle: _topicTitle,
    topicSetTitle: _topicSetTitle,
    renderWithHandle,
  }: {
    item: TimelineItem;
    index: number;
    topicTitle: string | null;
    topicSetTitle: string | null;
    renderWithHandle: (dragHandle: React.ReactNode) => React.ReactNode;
  }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
    const dragHandle = (
      <div
        className={cn('cursor-grab active:cursor-grabbing p-1 -m-1 rounded touch-none shrink-0', COLORS.text.secondary)}
        {...attributes}
        {...listeners}
      >
        <Icon name="GripVertical" className="w-5 h-5" />
      </div>
    );
    return (
      <li className={cn('list-none', isEmbed && 'min-w-0')}>
        <div ref={setNodeRef} style={style} className={cn(isDragging && 'z-10')}>
          {renderWithHandle(dragHandle)}
        </div>
      </li>
    );
  }

  const scrollBottomPad =
    'pb-[calc(var(--header-height,3.5rem)+env(safe-area-inset-bottom,0px))]';
  const scrollAreaClass = isEmbed
    ? cn('flex-1 min-h-0 min-w-0 overflow-auto mt-1 relative', scrollBottomPad)
    : cn('flex-1 min-h-0 overflow-auto', scrollBottomPad);
  const contentWrapperClass = isEmbed
    ? 'flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden pl-4 pr-4 pt-2 pb-0'
    : 'min-w-0 flex flex-col flex-1 min-h-0 overflow-hidden';
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !onReorderTimeline || !Array.isArray(timelineItems)) return;
      const oldIndex = timelineItems.findIndex((i) => i.id === active.id);
      const newIndex = timelineItems.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(timelineItems.map((i) => i.id), oldIndex, newIndex);
      onReorderTimeline(newOrder);
    },
    [timelineItems, onReorderTimeline]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={contentWrapperClass}>
        {isEmbed && (
          <div
            className={cn(
              `relative flex-none sticky top-0 ${Z_INDEX.sticky} -mx-4 border-b border-border/40 bg-background/95 px-2 py-1.5 backdrop-blur-sm`,
              !detail.minutesFinalizedAt && 'border-b-0',
              'after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-3 after:translate-y-full after:bg-gradient-to-b after:from-background/95 after:to-transparent',
            )}
          >
            {detail.minutesFinalizedAt && (
              <div className={cn("mb-1 flex flex-none flex-wrap items-center gap-2 border border-[var(--status-approved-border)] bg-[var(--status-approved-bg)] px-2 py-1", RADIUS.control)}>
                <p className="break-words text-xs font-medium text-[var(--status-approved-text)]">
                  {t('minutesFinalized')}
                  <span className="ml-2 font-normal opacity-80">
                    ({formatDateTime(detail.minutesFinalizedAt)})
                  </span>
                </p>
                {isModerator && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setUnfinalizeConfirmOpen(true)}>
                    <Icon name="RotateCcw" className="mr-1 h-3 w-3" />
                    {t('unfinalizeMinutes', { defaultValue: 'Unfinalize minutes' })}
                  </Button>
                )}
              </div>
            )}
            <div className="flex min-w-0 w-full items-center justify-between gap-1">
              <span className={cn(NAVIGATION.typography.navItem, 'min-w-0 truncate text-sm text-foreground')}>{t('minutes')}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                {onCloseOverlay && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseOverlay();
                    }}
                    title={t('closeOverlay')}
                    aria-label={t('closeOverlay')}
                  >
                    <Icon name="X" className="h-4 w-4" />
                  </Button>
                )}
                {onPinOverlay && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPinOverlay(!overlayPinned);
                    }}
                    title={overlayPinned ? t('unpinOverlay') : t('pinOverlay')}
                    aria-label={overlayPinned ? t('unpinOverlay') : t('pinOverlay')}
                  >
                    <Icon name={overlayPinned ? 'PinOff' : 'Pin'} className="h-4 w-4 shrink-0" />
                  </Button>
                )}
                {detail.minutesDocumentId && (
                  <>
                    <div className="flex items-center gap-1 border-l border-border/40 pl-1">
                      <Switch
                        id="follow-live-embed"
                        checked={followLive}
                        onCheckedChange={(checked) => {
                          onFollowLiveChange(checked);
                          if (checked) onScrollToBottom?.();
                        }}
                        aria-label={t('followLive')}
                      />
                      <Label htmlFor="follow-live-embed" className="hidden cursor-pointer items-center gap-1 text-xs font-normal sm:inline-flex">
                        {followLive && (
                          <span className={cn("inline-block h-2 w-2 bg-green-500 animate-pulse", RADIUS.pill)} aria-hidden />
                        )}
                        {t('followLive')}
                      </Label>
                      {isModerator && !detail.minutesFinalizedAt && onReorderModeChange && (
                        <>
                          <Switch
                            id="reorder-mode-embed"
                            checked={reorderMode}
                            onCheckedChange={onReorderModeChange}
                            className="ml-1"
                            aria-label={t('allowReorder', { defaultValue: 'Allow reorder' })}
                          />
                          <Label htmlFor="reorder-mode-embed" className="hidden cursor-pointer text-xs font-normal md:inline">
                            {t('allowReorder', { defaultValue: 'Allow reorder' })}
                          </Label>
                        </>
                      )}
                    </div>
                    {isModerator && !detail.minutesFinalizedAt && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-8 shrink-0 px-2"
                        onClick={onFinalizeMinutes}
                        title={t('finalizeMinutes')}
                        aria-label={t('finalizeMinutes')}
                      >
                        <Icon name="Lock" className="h-4 w-4" />
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" aria-label={t('protocolChrome.embedMoreActions', { defaultValue: 'More actions' })}>
                          <Icon name="MoreHorizontal" className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {hasDecisionsSection && (
                          <DropdownMenuItem onClick={jumpToDecisions}>
                            <Icon name="ListOrdered" className="mr-2 h-4 w-4" />
                            {t('jumpToDecisions')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem disabled={exportMinutesSubmitting} onClick={onExportMinutes}>
                          <Icon name="Download" className="mr-2 h-4 w-4" />
                          {exportMinutesSubmitting ? t('saving') : t('exportMinutes')}
                        </DropdownMenuItem>
                        {isModerator && !detail.minutesFinalizedAt && (
                          <DropdownMenuItem onClick={onFinalizeMinutes}>
                            <Icon name="Lock" className="mr-2 h-4 w-4" />
                            {t('finalizeMinutes')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {!isEmbed && (
          <div className={`flex-none sticky top-0 ${Z_INDEX.sticky} bg-background/95 backdrop-blur-sm border-b border-border/40 pb-2`}>
            {detail.minutesFinalizedAt && (
              <div className={cn('flex-none mb-1 flex flex-wrap items-center gap-2')}>
                <p className={cn(COLORS.text.secondary, 'text-sm font-medium break-words')}>
                  {t('minutesFinalized')}
                  <span className="ml-2 text-muted-foreground font-normal">
                    ({formatDateTime(detail.minutesFinalizedAt)})
                  </span>
                </p>
                {isModerator && (
                  <Button variant="outline" size="sm" onClick={() => setUnfinalizeConfirmOpen(true)}>
                    <Icon name="RotateCcw" className="h-3.5 w-3.5 mr-1" />
                    {t('unfinalizeMinutes', { defaultValue: 'Unfinalize minutes' })}
                  </Button>
                )}
              </div>
            )}
            <div className={cn(SPACING.toolbar.row, SPACING.toolbar.gap)}>
              <h3 className={cn(NAVIGATION.typography.navItem, 'text-foreground min-w-0')}>{t('minutes')}</h3>
              <div className={cn('flex items-center gap-1.5 shrink-0', 'flex-wrap')}>
                <div className="flex items-center gap-2">
                  <Switch
                    id="follow-live-standalone"
                    checked={followLive}
                    onCheckedChange={(checked) => {
                      onFollowLiveChange(checked);
                      if (checked) onScrollToBottom?.();
                    }}
                    aria-label={t('followLive')}
                  />
                  <Label htmlFor="follow-live-standalone" className="flex items-center gap-1 text-sm font-normal cursor-pointer">
                    {followLive && (
                      <span className={cn("inline-block h-2 w-2 bg-green-500 animate-pulse", RADIUS.pill)} aria-hidden />
                    )}
                    {t('followLive')}
                  </Label>
                  {isModerator && !detail.minutesFinalizedAt && onReorderModeChange && (
                    <>
                      <Switch
                        id="reorder-mode-standalone"
                        checked={reorderMode}
                        onCheckedChange={onReorderModeChange}
                        aria-label={t('allowReorder', { defaultValue: 'Allow reorder' })}
                      />
                      <Label htmlFor="reorder-mode-standalone" className="text-sm font-normal cursor-pointer">
                        {t('allowReorder', { defaultValue: 'Allow reorder' })}
                      </Label>
                    </>
                  )}
                </div>
                {hasDecisionsSection && (
                  <Button variant="ghost" size="sm" onClick={jumpToDecisions}>{t('jumpToDecisions')}</Button>
                )}
                <Button variant="ghost" size="sm" disabled={exportMinutesSubmitting} onClick={onExportMinutes}>
                  {exportMinutesSubmitting ? t('saving') : t('exportMinutes')}
                </Button>
                {isModerator && !detail.minutesFinalizedAt && (
                  <Button variant="default" size="sm" onClick={onFinalizeMinutes}>
                    <Icon name="Lock" className="h-4 w-4 mr-2 shrink-0" />
                    {t('finalizeMinutes')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
        {!detail.minutesDocumentId ? (
          <p className={cn(COLORS.text.hint, 'text-sm py-2')}>{t('noMinutesDocumentYet')}</p>
        ) : (
            <div ref={timelineScrollContainerRef as React.LegacyRef<HTMLDivElement>} className={scrollAreaClass}>
              <LoadingState isLoading={timelineLoading || agendaLoading} mode="skeleton" skeletonVariant="card" skeletonCount={4}>
                {agendaError ? (
                  <p className={cn(COLORS.text.hint, 'text-sm py-2')}>{agendaError}</p>
                ) : reorderMode && onReorderTimeline ? (
                      <>
                        <p className={cn('text-xs text-muted-foreground', SPACING.tight.gap)}>
                          {t('protocolCanvas.reorderCanvasHint', {
                            defaultValue: 'Drag entries to change order. Turn off reorder to return to protocol view.',
                          })}
                        </p>
                        <DndContext onDragEnd={handleDragEnd} sensors={sensors} collisionDetection={closestCenter}>
                          <SortableContext items={reorderSortableTimelineIds} strategy={verticalListSortingStrategy}>
                            <ul className={cn(SPACING.content.gap, 'list-none p-0 m-0 pb-2', isEmbed && 'min-w-0')}>
                              {timelineItems.map((item, index) =>
                                isHiddenTopicSetEvent(item)
                                  ? null
                                  : (
                                  <SortableBlockRow
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    topicTitle={topicTitleByIndex[index] ?? null}
                                    topicSetTitle={topicSetTitleByIndex[index] ?? null}
                                    renderWithHandle={(dragHandle) => (
                                      <div
                                        className={cn(
                                          'flex items-center gap-2 border border-border/60 bg-card px-3 py-2', RADIUS.panel,
                                          isEmbed && 'min-w-0'
                                        )}
                                      >
                                        {dragHandle}
                                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground shrink-0">
                                          {item.type}
                                        </span>
                                        <span className="text-sm text-foreground truncate min-w-0">
                                          {getTimelineItemReorderLabel(item)}
                                        </span>
                                      </div>
                                    )}
                                  />
                                )
                              )}
                            </ul>
                          </SortableContext>
                        </DndContext>
                      </>
                    ) : (
                  <div className={cn(SPACING.content.gap, 'pb-2')}>
                    <p className="sr-only" aria-live="polite" aria-atomic="true">
                      {liveFollowAnnounce}
                    </p>
                    <ProtocolTimelineCanvas
                      timelineItems={timelineItems}
                      agendaItems={agendaItems}
                      meetingDetail={detail}
                      activeVote={activeVote}
                      layout={isEmbed ? 'embed' : 'standalone'}
                      isEmbed={isEmbed}
                      blockRenderers={blockRenderers}
                      onNavigateToBlock={handleNavigateToBlock}
                      onActNextAction={handleActNextAction}
                      onSetCurrentTopic={onSetCurrentTopic}
                      canSetCurrentTopic={canSetCurrentTopic}
                      showAgendaNav
                    />
                  </div>
                )}
              </LoadingState>
              <div ref={timelineEndRef as React.LegacyRef<HTMLDivElement>} />
            </div>
        )}
      </div>
      <BottomActionBar
        isEmbed={isEmbed}
        isModerator={isModerator}
        hasMinutesDocument={!!detail.minutesDocumentId}
        minutesFinalized={!!detail.minutesFinalizedAt}
        startBrainstormSubmitting={startBrainstormSubmitting}
        onAddAgendaItem={() => {
          onAddAgendaItem();
        }}
        onAddParagraph={onAddParagraph}
        onAddTodo={onAddTodo}
        onStartVote={onStartVote}
        onStartBrainstorm={onStartBrainstorm}
        onDateDecided={onDateDecided}
        onDocumentCreated={onDocumentCreated}
        onRecordDecision={onAddDecision}
        moderatorIsRecordingLabel={t('moderatorIsRecording')}
        t={t}
      />
    </div>
  );
}
