import { buildProtocolBlocks } from '../protocolBlocks';
import type { Meeting } from '../../../../lib/api/types/meetings';
import type { MeetingAgendaItem } from '../../../../lib/api/types/meetingAgenda';
import type { TimelineItem } from '../../../../lib/api/types/meetingMinutes';

const baseMeeting: Meeting = {
  id: 'm1',
  organizationId: 'org1',
  title: 'Weekly',
  scheduledAt: '2026-01-01T09:00:00.000Z',
  endAt: null,
  location: null,
  meetingLink: null,
  meetingProvider: null,
  createdByUserId: 'u1',
  createdFromSchedulingPollId: null,
  createdAt: '2026-01-01T08:00:00.000Z',
  updatedAt: '2026-01-01T08:00:00.000Z',
  currentAgendaItemId: 'a2',
};

const agendaItems: MeetingAgendaItem[] = [
  {
    id: 'a2',
    meetingId: 'm1',
    title: 'Topic B',
    orderIndex: 2,
    createdAt: '2026-01-01T08:02:00.000Z',
    updatedAt: '2026-01-01T08:02:00.000Z',
    createdByUserId: 'u1',
  },
  {
    id: 'a1',
    meetingId: 'm1',
    title: 'Topic A',
    orderIndex: 1,
    createdAt: '2026-01-01T08:01:00.000Z',
    updatedAt: '2026-01-01T08:01:00.000Z',
    createdByUserId: 'u1',
  },
];

describe('buildProtocolBlocks', () => {
  it('sorts timeline blocks by orderIndex then occurredAt and prepends agenda items deterministically', () => {
    const timelineItems: TimelineItem[] = [
      { type: 'paragraph', id: 'p2', occurredAt: '2026-01-01T10:02:00.000Z', title: 'Notes', orderIndex: 20 },
      { type: 'paragraph', id: 'p1', occurredAt: '2026-01-01T10:01:00.000Z', title: 'Intro', orderIndex: 10 },
      { type: 'paragraph', id: 'p3', occurredAt: '2026-01-01T10:00:00.000Z', orderIndex: 30 },
      { type: 'paragraph', id: 'p4', occurredAt: '2026-01-01T10:03:00.000Z', orderIndex: 40 },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems,
      activeVote: null,
    });

    expect(blocks.map((block) => block.id)).toEqual([
      'agenda:a1',
      'agenda:a2',
      'paragraph:p1',
      'paragraph:p2',
      'paragraph:p3',
      'paragraph:p4',
    ]);
  });

  it('maps reliable timeline types to protocol block types', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'paragraph',
        id: 'p-note',
        occurredAt: '2026-01-01T10:00:00.000Z',
        title: 'Notes',
        orderIndex: 1,
      },
      {
        type: 'decision',
        id: 'd1',
        occurredAt: '2026-01-01T10:00:30.000Z',
        title: 'Decision',
        text: 'Approved',
        orderIndex: 2,
      },
      {
        type: 'event',
        id: 'e-brainstorm',
        occurredAt: '2026-01-01T10:01:00.000Z',
        eventType: 'brainstorm_started',
        payload: { agendaItemId: 'a1' },
        orderIndex: 3,
      },
      {
        type: 'event',
        id: 'e-vote',
        occurredAt: '2026-01-01T10:02:00.000Z',
        eventType: 'vote_ended',
        payload: { agendaItemId: 'a1' },
        orderIndex: 4,
      },
      {
        type: 'event',
        id: 'e-date',
        occurredAt: '2026-01-01T10:03:00.000Z',
        eventType: 'date_decided',
        payload: { schedulingPollId: 'poll1' },
        orderIndex: 5,
      },
      {
        type: 'event',
        id: 'e-doc',
        occurredAt: '2026-01-01T10:04:00.000Z',
        eventType: 'document_created',
        payload: { documentId: 'doc1', title: 'Minutes Draft' },
        orderIndex: 6,
      },
      {
        type: 'todo',
        id: 't1',
        occurredAt: '2026-01-01T10:05:00.000Z',
        title: 'Follow up',
        dueDate: '2026-01-03T00:00:00.000Z',
        status: 'open',
        responsibleUserId: 'u2',
        agendaItemId: 'a1',
        orderIndex: 7,
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems: [],
      activeVote: null,
    });

    expect(blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'decision',
      'brainstorm',
      'vote',
      'date_poll',
      'document_link',
      'todo',
    ]);

    const voteBlock = blocks.find((block) => block.type === 'vote');
    expect(voteBlock?.nextAction?.type).toBe('record_decision');
  });

  it('suppresses record_decision only when a decision is linked to the same vote', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'event',
        id: 'e-vote-ended',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'vote_ended',
        payload: { agendaItemId: 'a1' },
        vote: {
          id: 'vote-1',
          meetingId: 'm1',
          title: 'Choose option',
          status: 'closed',
          anonymous: false,
          createdByUserId: 'u1',
          createdAt: '2026-01-01T09:58:00.000Z',
          closedAt: '2026-01-01T10:00:00.000Z',
          sourceEventId: null,
        },
        orderIndex: 1,
      },
      {
        type: 'decision',
        id: 'd1',
        occurredAt: '2026-01-01T10:02:00.000Z',
        orderIndex: 2,
        meetingVoteId: 'vote-1',
        title: 'Decision',
        text: 'Approved option A',
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems: [],
      activeVote: null,
    });
    const vote = blocks.find((b) => b.type === 'vote');
    expect(vote?.nextAction).toBeUndefined();
  });

  it('infers basic agenda links from reliable references', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'event',
        id: 'e-vote-linked',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'vote_started',
        payload: { agendaItemId: 'a1' },
        orderIndex: 1,
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems: [],
      activeVote: null,
    });

    const vote = blocks[0];
    expect(vote.type).toBe('vote');
    expect(vote.links?.[0]).toMatchObject({
      relationship: 'references_topic',
      targetBlockId: 'agenda:a1',
    });
  });

  it('does not backfill topic from meeting currentAgendaItemId without topic_set (stays before-first-topic)', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'paragraph',
        id: 'p-no-topic',
        occurredAt: '2026-01-01T10:00:00.000Z',
        title: 'General note',
        orderIndex: 1,
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems: [],
      activeVote: null,
    });

    const paragraph = blocks.find((block) => block.type === 'paragraph');
    expect(paragraph?.agendaItemId).toBeNull();
  });

  it('uses paragraph agendaItemId from timeline item when present without topic_set', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'paragraph',
        id: 'p-scoped',
        occurredAt: '2026-01-01T10:00:00.000Z',
        title: 'Note',
        orderIndex: 1,
        agendaItemId: 'a1',
      } as TimelineItem,
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems: [],
      activeVote: null,
    });

    const paragraph = blocks.find((block) => block.type === 'paragraph');
    expect(paragraph?.agendaItemId).toBe('a1');
  });

  it('keeps pre-topic_set rows unscoped after a later topic_set in the same timeline', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'paragraph',
        id: 'p-early',
        occurredAt: '2026-01-01T09:00:00.000Z',
        title: 'Before topic',
        orderIndex: 1,
      },
      {
        type: 'event',
        id: 'e-topic',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'topic_set',
        payload: { agendaItemId: 'a1' },
        orderIndex: 2,
      },
      {
        type: 'paragraph',
        id: 'p-late',
        occurredAt: '2026-01-01T11:00:00.000Z',
        title: 'After topic',
        orderIndex: 3,
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: { ...baseMeeting, currentAgendaItemId: 'a1' },
      timelineItems,
      agendaItems: [],
      activeVote: null,
    });

    const early = blocks.find((b) => b.type === 'paragraph' && b.sourceTimelineItemId === 'p-early');
    const late = blocks.find((b) => b.type === 'paragraph' && b.sourceTimelineItemId === 'p-late');
    expect(early?.agendaItemId).toBeNull();
    expect(late?.agendaItemId).toBe('a1');
  });

  it('preserves vote sourceEventId and propagates arcId for semantic sequence grouping', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'event',
        id: 'e-vote-linked',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'vote_started',
        payload: { agendaItemId: 'a1' },
        vote: {
          id: 'vote-1',
          meetingId: 'm1',
          title: 'Budget',
          status: 'open',
          anonymous: false,
          createdByUserId: 'u1',
          createdAt: '2026-01-01T10:00:00.000Z',
          closedAt: null,
          sourceEventId: 'e-brainstorm',
        },
        arcId: 'arc-123',
        orderIndex: 1,
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems: [],
      activeVote: null,
    });

    const vote = blocks.find((block) => block.type === 'vote');
    expect(vote?.type).toBe('vote');
    if (vote?.type === 'vote') {
      expect(vote.vote?.sourceEventId).toBe('e-brainstorm');
    }
    expect(vote?.arcId).toBe('arc-123');
  });

  it('dedupes repeated brainstorm_started snapshots but keeps brainstorm_ended as separate entry', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'event',
        id: 'e-brainstorm-1',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'brainstorm_started',
        payload: { agendaItemId: 'a1' },
        options: [{ id: 'o1', label: 'Option A' }],
        orderIndex: 1,
      },
      {
        type: 'event',
        id: 'e-brainstorm-1-snapshot',
        occurredAt: '2026-01-01T10:02:00.000Z',
        eventType: 'brainstorm_started',
        payload: { agendaItemId: 'a1', sourceEventId: 'e-brainstorm-1' },
        options: [
          { id: 'o1', label: 'Option A' },
          { id: 'o2', label: 'Option B' },
        ],
        orderIndex: 2,
      },
      {
        type: 'event',
        id: 'e-brainstorm-end',
        occurredAt: '2026-01-01T10:03:00.000Z',
        eventType: 'brainstorm_ended',
        payload: { agendaItemId: 'a1', sourceEventId: 'e-brainstorm-1' },
        options: [
          { id: 'o1', label: 'Option A' },
          { id: 'o2', label: 'Option B' },
        ],
        orderIndex: 3,
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems: [],
      activeVote: null,
    });

    const brainstormBlocks = blocks.filter((block) => block.type === 'brainstorm');
    // After brainstorm_ended, open brainstorm_started snapshots for the same root are suppressed (canvas canonical view).
    expect(brainstormBlocks).toHaveLength(1);

    const closedBrainstorm = brainstormBlocks.find((block) => block.status === 'closed');
    expect(closedBrainstorm?.sourceTimelineItemId).toBe('e-brainstorm-1');
    if (closedBrainstorm?.type === 'brainstorm') {
      expect(closedBrainstorm.options.map((o) => o.label)).toEqual(['Option A', 'Option B']);
    }
  });

  it('passes timeline entityVersion into protocol blocks when present', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'todo',
        id: 't-entity-version',
        occurredAt: '2026-01-01T10:05:00.000Z',
        title: 'Archive metadata',
        dueDate: '2026-01-03T00:00:00.000Z',
        status: 'open',
        responsibleUserId: 'u2',
        orderIndex: 7,
        entityVersion: '3',
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems: [],
      activeVote: null,
    });

    const todoBlock = blocks.find((block) => block.type === 'todo');
    expect(todoBlock?.entityVersion).toBe('3');
  });
});

describe('protocolUi tokens', () => {
  it('matches snapshot to prevent accidental regressions', async () => {
    const { protocolUi } = await import('../protocolUi');
    expect(protocolUi).toMatchSnapshot();
  });

  it('blockTypeIcon covers all ProtocolBlockType values', async () => {
    const { blockTypeIcon } = await import('../protocolUi');
    const expectedTypes = ['paragraph', 'agenda_item', 'brainstorm', 'vote', 'decision', 'date_poll', 'todo', 'document_link'];
    for (const t of expectedTypes) {
      expect(blockTypeIcon[t as keyof typeof blockTypeIcon]).toBeDefined();
    }
  });

  it('statusChipStyle returns CSS variable classes for all statuses', async () => {
    const { statusChipStyle } = await import('../protocolUi');
    const statuses = ['open', 'closed', 'completed', 'deferred', 'partial', 'stopped', 'recorded'] as const;
    for (const s of statuses) {
      const cls = statusChipStyle(s);
      expect(cls).toContain('var(--status-');
    }
  });
});
