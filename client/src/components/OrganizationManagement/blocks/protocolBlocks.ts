import type {
  AgendaItemProtocolBlock,
  BrainstormProtocolBlock,
  BuildProtocolBlocksInput,
  BuildProtocolBlocksOutput,
  DatePollProtocolBlock,
  DecisionProtocolBlock,
  DocumentLinkProtocolBlock,
  ParagraphProtocolBlock,
  ProtocolBlock,
  ProtocolBlockLink,
  TodoProtocolBlock,
  VoteProtocolBlock,
} from './protocolBlocks.types';
import type { TimelineDecisionItem, TimelineEventItem, TimelineItem, TimelineParagraphItem } from '../../../lib/api/types/meetingMinutes';

type EventBlock = BrainstormProtocolBlock | VoteProtocolBlock | DatePollProtocolBlock | DocumentLinkProtocolBlock;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
};

const asString = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

const getEventType = (event: TimelineEventItem): string => {
  return event.eventType ?? asString(event.event?.eventType) ?? '';
};

const getEventPayload = (event: TimelineEventItem): Record<string, unknown> => {
  return asRecord(event.payload ?? event.event?.payload);
};

const inferSectionPreset = (paragraph: TimelineParagraphItem): ParagraphProtocolBlock['sectionPreset'] => {
  const explicit = asString((paragraph as Record<string, unknown>).sectionPreset);
  if (
    explicit === 'freeform' ||
    explicit === 'agenda' ||
    explicit === 'attendees' ||
    explicit === 'discussion' ||
    explicit === 'decisions' ||
    explicit === 'action_items' ||
    explicit === 'next_meeting'
  ) {
    return explicit;
  }

  return 'freeform';
};

const statusFromTodo = (status: string): TodoProtocolBlock['status'] => {
  const normalized = status.toLowerCase();
  if (normalized === 'done' || normalized === 'completed' || normalized === 'closed') {
    return 'completed';
  }
  if (normalized === 'in_progress' || normalized === 'partial') {
    return 'partial';
  }
  return 'open';
};

const getOrderIndex = (item: TimelineItem): number => asNumber(item.orderIndex) ?? Number.MAX_SAFE_INTEGER;

const ORDER_INDEX_LARGE = 1e10;
const toSortableTime = (value?: string): number => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const compareTimelineItems = (a: TimelineItem, b: TimelineItem): number => {
  const oa = getOrderIndex(a);
  const ob = getOrderIndex(b);
  const aSmall = oa < ORDER_INDEX_LARGE;
  const bSmall = ob < ORDER_INDEX_LARGE;

  if (aSmall !== bSmall) {
    const byTime = toSortableTime(a.occurredAt) - toSortableTime(b.occurredAt);
    if (byTime !== 0) return byTime;
    return oa - ob || a.id.localeCompare(b.id);
  }

  if (oa !== ob) return oa - ob;
  const byTime = toSortableTime(a.occurredAt) - toSortableTime(b.occurredAt);
  if (byTime !== 0) return byTime;
  return a.id.localeCompare(b.id);
};

const compareAgendaItems = (a: BuildProtocolBlocksInput['agendaItems'][number], b: BuildProtocolBlocksInput['agendaItems'][number]): number => {
  const orderDiff = a.orderIndex - b.orderIndex;
  if (orderDiff !== 0) return orderDiff;
  const timeDiff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (timeDiff !== 0) return timeDiff;
  return a.id.localeCompare(b.id);
};

const pushTopicLink = (links: ProtocolBlockLink[], sourceBlockId: string, agendaItemId: unknown): void => {
  const agendaId = asString(agendaItemId);
  if (!agendaId) return;
  links.push({
    id: `${sourceBlockId}:agenda:${agendaId}`,
    targetBlockId: `agenda:${agendaId}`,
    label: 'Related topic',
    relationship: 'references_topic',
  });
};

const inferEventBlock = (item: TimelineEventItem, fallbackAgendaItemId: string | null): EventBlock | null => {
  const eventType = getEventType(item);
  const payload = getEventPayload(item);
  const orderIndex = getOrderIndex(item);
  const resolvedAgendaItemId = asString(payload.agendaItemId) ?? fallbackAgendaItemId;
  const links: ProtocolBlockLink[] = [];
  pushTopicLink(links, `event:${item.id}`, resolvedAgendaItemId);

  const itemArcId = asString(item.arcId) ?? null;

  if (eventType === 'brainstorm_started' || eventType === 'brainstorm_ended') {
    const brainstormRootId = asString(payload.sourceEventId) ?? item.id;
    return {
      id: `brainstorm:${item.id}`,
      type: 'brainstorm',
      status: eventType === 'brainstorm_ended' ? 'closed' : 'open',
      occurredAt: item.occurredAt ?? null,
      orderIndex,
      sourceTimelineItemId: brainstormRootId,
      entityVersion: asString(item.entityVersion) ?? null,
      agendaItemId: resolvedAgendaItemId,
      arcId: itemArcId,
      event: item,
      options: (item.options ?? []).map((option) => ({ id: option.id, label: option.label })),
      links: links.length > 0 ? links : undefined,
    };
  }

  if (eventType === 'vote_started' || eventType === 'vote_ended') {
    return {
      id: `vote:${item.id}`,
      type: 'vote',
      status: eventType === 'vote_ended' || item.vote?.status === 'closed' ? 'closed' : 'open',
      occurredAt: item.occurredAt ?? null,
      orderIndex,
      sourceTimelineItemId: item.id,
      entityVersion: asString(item.entityVersion) ?? null,
      agendaItemId: resolvedAgendaItemId,
      arcId: itemArcId,
      event: item,
      vote: item.vote ?? null,
      links: links.length > 0 ? links : undefined,
    };
  }

  if (eventType === 'date_decided') {
    const chosenSlot =
      item.schedulingPoll?.chosenSlot && item.schedulingPoll.chosenSlot.startAt && item.schedulingPoll.chosenSlot.endAt
        ? { startAt: item.schedulingPoll.chosenSlot.startAt, endAt: item.schedulingPoll.chosenSlot.endAt }
        : null;
    return {
      id: `date_poll:${item.id}`,
      type: 'date_poll',
      status: chosenSlot ? 'completed' : 'recorded',
      occurredAt: item.occurredAt ?? null,
      orderIndex,
      sourceTimelineItemId: item.id,
      entityVersion: asString(item.entityVersion) ?? null,
      agendaItemId: resolvedAgendaItemId,
      arcId: itemArcId,
      event: item,
      pollId: asString(payload.schedulingPollId) ?? item.schedulingPoll?.id ?? null,
      chosenSlot,
      links: links.length > 0 ? links : undefined,
    };
  }

  if (eventType === 'document_created') {
    const documentId = asString(payload.documentId);
    if (!documentId) return null;
    return {
      id: `document:${item.id}`,
      type: 'document_link',
      status: 'recorded',
      occurredAt: item.occurredAt ?? null,
      orderIndex,
      sourceTimelineItemId: item.id,
      entityVersion: asString(item.entityVersion) ?? null,
      agendaItemId: resolvedAgendaItemId,
      arcId: itemArcId,
      event: item,
      documentId,
      title: asString(payload.title),
      links: links.length > 0 ? links : undefined,
    };
  }

  return null;
};

export const buildProtocolBlocks = (input: BuildProtocolBlocksInput): BuildProtocolBlocksOutput => {
  /**
   * Topic context comes only from timeline `topic_set` events (chronological cursor).
   * Do not seed from `detail.currentAgendaItemId`: that would re-bucket pre-meeting / pre-topic rows
   * into the active topic when the moderator selects an agenda item later.
   */
  let currentAgendaItemId: string | null = null;

  const timelineBlocks: ProtocolBlock[] = input.timelineItems
    .slice()
    .sort(compareTimelineItems)
    .flatMap((item): ProtocolBlock[] => {
      if (item.type === 'event') {
        const eventType = getEventType(item);
        if (eventType === 'topic_set') {
          const payload = getEventPayload(item);
          currentAgendaItemId = asString(payload.agendaItemId) ?? currentAgendaItemId;
          return [];
        }
      }

      if (item.type === 'paragraph') {
        const sectionPreset = inferSectionPreset(item);
        const paragraphAgendaId = asString(asRecord(item).agendaItemId) ?? currentAgendaItemId;
        const links: ProtocolBlockLink[] = [];
        pushTopicLink(links, `paragraph:${item.id}`, paragraphAgendaId);
        const block: ParagraphProtocolBlock = {
          id: `paragraph:${item.id}`,
          type: 'paragraph',
          status: 'recorded',
          occurredAt: item.occurredAt ?? null,
          orderIndex: getOrderIndex(item),
          sourceTimelineItemId: item.id,
          entityVersion: asString(asRecord(item).entityVersion) ?? null,
          agendaItemId: paragraphAgendaId,
          arcId: asString(asRecord(item).arcId) ?? null,
          paragraph: item,
          sectionPreset,
          links: links.length > 0 ? links : undefined,
        };
        return [block];
      }

      if (item.type === 'decision') {
        const decisionAgendaId = asString(asRecord(item).agendaItemId) ?? currentAgendaItemId;
        const links: ProtocolBlockLink[] = [];
        pushTopicLink(links, `decision:${item.id}`, decisionAgendaId);
        const block: DecisionProtocolBlock = {
          id: `decision:${item.id}`,
          type: 'decision',
          status: 'recorded',
          occurredAt: item.occurredAt ?? null,
          orderIndex: getOrderIndex(item),
          sourceTimelineItemId: item.id,
          entityVersion: asString(asRecord(item).entityVersion) ?? null,
          agendaItemId: decisionAgendaId,
          arcId: asString(asRecord(item).arcId) ?? null,
          decision: item,
          links: links.length > 0 ? links : undefined,
        };
        return [block];
      }

      if (item.type === 'todo') {
        const resolvedAgendaItemId = item.agendaItemId ?? currentAgendaItemId;
        const block: TodoProtocolBlock = {
          id: `todo:${item.id}`,
          type: 'todo',
          status: statusFromTodo(item.status),
          occurredAt: item.occurredAt ?? null,
          orderIndex: getOrderIndex(item),
          sourceTimelineItemId: item.id,
          entityVersion: asString(asRecord(item).entityVersion) ?? null,
          agendaItemId: resolvedAgendaItemId,
          arcId: asString(asRecord(item).arcId) ?? null,
          todo: item,
          links: resolvedAgendaItemId
            ? [
                {
                  id: `todo:${item.id}:agenda:${resolvedAgendaItemId}`,
                  targetBlockId: `agenda:${resolvedAgendaItemId}`,
                  label: 'Related topic',
                  relationship: 'references_topic',
                },
              ]
            : undefined,
        };
        return [block];
      }

      const eventBlock = inferEventBlock(item, currentAgendaItemId);
      return eventBlock ? [eventBlock] : [];
    });

  const agendaBlocks: AgendaItemProtocolBlock[] = input.agendaItems
    .slice()
    .sort(compareAgendaItems)
    .map((item) => ({
      id: `agenda:${item.id}`,
      type: 'agenda_item',
      status: item.id === input.detail.currentAgendaItemId ? 'open' : 'recorded',
      occurredAt: item.createdAt ?? null,
      orderIndex: item.orderIndex,
      agendaItemId: item.id,
      item,
      isCurrentTopic: item.id === input.detail.currentAgendaItemId,
    }));

  const decisionVoteIds = new Set(
    timelineBlocks
      .filter((block): block is DecisionProtocolBlock => block.type === 'decision')
      .map((block) => {
        const decision = block.decision as TimelineDecisionItem | undefined;
        return asString(decision?.meetingVoteId);
      })
      .filter((value): value is string => Boolean(value))
  );

  // Collapse repeated "brainstorm_started" snapshots (e.g. after option additions)
  // into one open brainstorm card per source event id, while keeping explicit
  // "brainstorm_ended" rows as separate closed entries in the timeline.
  const dedupedTimelineBlocks = (() => {
    const result: ProtocolBlock[] = [];
    const openBrainstormIndexBySource = new Map<string, number>();

    for (const block of timelineBlocks) {
      if (block.type !== 'brainstorm' || block.status !== 'open') {
        result.push(block);
        continue;
      }

      const sourceId = block.sourceTimelineItemId ?? block.id;
      const existingIndex = openBrainstormIndexBySource.get(sourceId);
      if (existingIndex == null) {
        openBrainstormIndexBySource.set(sourceId, result.length);
        result.push(block);
      } else {
        // Keep the latest snapshot to reflect newest option set.
        result[existingIndex] = block;
      }
    }

    return result;
  })();

  /**
   * Canonical decision-arc timeline for the canvas:
   * - Drop vote_started when vote_ended exists for the same meetingVoteId (see export merge rules).
   * - Drop stale open brainstorm_started snapshots after brainstorm_ended for the same root id.
   * Winning vote row keeps id vote:${eventId} of the retained timeline event (prefer ended row).
   */
  const normalizedTimelineBlocks = (() => {
    const voteIdsWithEnded = new Set<string>();
    for (const block of dedupedTimelineBlocks) {
      if (block.type !== 'vote') continue;
      const et = getEventType(block.event);
      const payload = getEventPayload(block.event);
      const vid = block.vote?.id ?? asString(payload.meetingVoteId) ?? asString(payload.meeting_vote_id);
      if (vid && et === 'vote_ended') voteIdsWithEnded.add(vid);
    }

    let next = dedupedTimelineBlocks.filter((block) => {
      if (block.type !== 'vote') return true;
      const et = getEventType(block.event);
      const payload = getEventPayload(block.event);
      const vid = block.vote?.id ?? asString(payload.meetingVoteId) ?? asString(payload.meeting_vote_id);
      if (vid && et === 'vote_started' && voteIdsWithEnded.has(vid)) return false;
      return true;
    });

    const voteKeepIndexById = new Map<string, number>();
    const voteDropIndices = new Set<number>();
    for (let i = 0; i < next.length; i += 1) {
      const block = next[i];
      if (block.type !== 'vote') continue;
      const et = getEventType(block.event);
      const payload = getEventPayload(block.event);
      const vid = block.vote?.id ?? asString(payload.meetingVoteId) ?? asString(payload.meeting_vote_id);
      if (!vid) continue;

      const existingIdx = voteKeepIndexById.get(vid);
      if (existingIdx == null) {
        voteKeepIndexById.set(vid, i);
        continue;
      }

      const existing = next[existingIdx];
      if (existing.type !== 'vote') continue;
      const existingEt = getEventType(existing.event);
      const currentWins =
        (et === 'vote_ended' && existingEt !== 'vote_ended') ||
        (et === existingEt && block.orderIndex >= existing.orderIndex);

      if (currentWins) {
        voteDropIndices.add(existingIdx);
        voteKeepIndexById.set(vid, i);
      } else {
        voteDropIndices.add(i);
      }
    }
    if (voteDropIndices.size > 0) {
      next = next.filter((_, i) => !voteDropIndices.has(i));
    }

    const brainstormEndedRoots = new Set<string>();
    for (const block of next) {
      if (block.type !== 'brainstorm' || block.status !== 'closed') continue;
      if (getEventType(block.event) !== 'brainstorm_ended') continue;
      const root = block.sourceTimelineItemId;
      if (root) brainstormEndedRoots.add(root);
    }

    next = next.filter((block) => {
      if (block.type !== 'brainstorm' || block.status !== 'open') return true;
      const root = block.sourceTimelineItemId ?? '';
      return !brainstormEndedRoots.has(root);
    });

    return next;
  })();

  const blocks = normalizedTimelineBlocks.map((block) => {
    if (block.type !== 'vote') return block;
    const payload = getEventPayload(block.event);
    const payloadVoteId = asString(payload.meetingVoteId) ?? asString(payload.meeting_vote_id);
    const blockVoteId = block.vote?.id ?? payloadVoteId;
    const enrichedVote = input.activeVote && blockVoteId && input.activeVote.id === blockVoteId ? input.activeVote : block.vote;
    const enrichedBlock = enrichedVote !== block.vote ? { ...block, vote: enrichedVote } : block;
    if (enrichedBlock.status !== 'closed') return enrichedBlock;
    const voteId = enrichedBlock.vote?.id;
    const hasDecision = voteId ? decisionVoteIds.has(voteId) : false;
    if (hasDecision) return enrichedBlock;
    return {
      ...enrichedBlock,
      nextAction: {
        type: 'record_decision' as const,
        label: 'Record decision',
        dismissible: true,
      },
    };
  });

  return {
    blocks: [...agendaBlocks, ...blocks],
  };
};

export default buildProtocolBlocks;
