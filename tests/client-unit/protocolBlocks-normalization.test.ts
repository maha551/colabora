import { buildProtocolBlocks } from '../../client/src/components/OrganizationManagement/blocks/protocolBlocks';
import type { Meeting } from '../../client/src/lib/api/types/meetings';
import type { MeetingAgendaItem } from '../../client/src/lib/api/types/meetingAgenda';
import type { TimelineItem } from '../../client/src/lib/api/types/meetingMinutes';

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

const agendaItems: MeetingAgendaItem[] = [];

describe('buildProtocolBlocks decision-arc normalization', () => {
  it('merges vote_started and vote_ended into one vote block', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'event',
        id: 'e-vote-start',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'vote_started',
        payload: { agendaItemId: 'a1', meetingVoteId: 'vote-99' },
        vote: {
          id: 'vote-99',
          meetingId: 'm1',
          title: 'Pick',
          status: 'open',
          anonymous: false,
          createdByUserId: 'u1',
          createdAt: '2026-01-01T10:00:00.000Z',
          closedAt: null,
          sourceEventId: null,
        },
        orderIndex: 1,
      },
      {
        type: 'event',
        id: 'e-vote-end',
        occurredAt: '2026-01-01T10:05:00.000Z',
        eventType: 'vote_ended',
        payload: { agendaItemId: 'a1', meetingVoteId: 'vote-99' },
        vote: {
          id: 'vote-99',
          meetingId: 'm1',
          title: 'Pick',
          status: 'closed',
          anonymous: false,
          createdByUserId: 'u1',
          createdAt: '2026-01-01T10:00:00.000Z',
          closedAt: '2026-01-01T10:05:00.000Z',
          sourceEventId: null,
        },
        orderIndex: 2,
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems,
      activeVote: null,
    });

    const votes = blocks.filter((b) => b.type === 'vote');
    expect(votes).toHaveLength(1);
    expect(votes[0]?.id).toBe('vote:e-vote-end');
    if (votes[0]?.type === 'vote') {
      expect(votes[0].vote?.status).toBe('closed');
    }
  });

  it('collapses duplicate vote_ended rows for the same meetingVoteId', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'event',
        id: 'e-vote-end-1',
        occurredAt: '2026-01-01T10:05:00.000Z',
        eventType: 'vote_ended',
        payload: { agendaItemId: 'a1', meetingVoteId: 'vote-99' },
        vote: {
          id: 'vote-99',
          meetingId: 'm1',
          title: 'Pick',
          status: 'closed',
          anonymous: false,
          createdByUserId: 'u1',
          createdAt: '2026-01-01T10:00:00.000Z',
          closedAt: '2026-01-01T10:05:00.000Z',
          sourceEventId: null,
        },
        orderIndex: 2,
      },
      {
        type: 'event',
        id: 'e-vote-end-2',
        occurredAt: '2026-01-01T10:06:00.000Z',
        eventType: 'vote_ended',
        payload: { agendaItemId: 'a1', meetingVoteId: 'vote-99' },
        vote: {
          id: 'vote-99',
          meetingId: 'm1',
          title: 'Pick',
          status: 'closed',
          anonymous: false,
          createdByUserId: 'u1',
          createdAt: '2026-01-01T10:00:00.000Z',
          closedAt: '2026-01-01T10:06:00.000Z',
          sourceEventId: null,
        },
        orderIndex: 3,
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems,
      activeVote: null,
    });

    const votes = blocks.filter((b) => b.type === 'vote');
    expect(votes).toHaveLength(1);
    expect(votes[0]?.id).toBe('vote:e-vote-end-2');
  });

  it('drops open brainstorm after brainstorm_ended for same root (keeps closed + vote)', () => {
    const timelineItems: TimelineItem[] = [
      {
        type: 'event',
        id: 'e-root',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'brainstorm_started',
        payload: { agendaItemId: 'a1' },
        options: [{ id: 'o1', label: 'Idea' }],
        orderIndex: 1,
      },
      {
        type: 'event',
        id: 'e-end',
        occurredAt: '2026-01-01T10:01:00.000Z',
        eventType: 'brainstorm_ended',
        payload: { agendaItemId: 'a1', sourceEventId: 'e-root' },
        options: [{ id: 'o1', label: 'Idea' }],
        orderIndex: 2,
      },
      {
        type: 'event',
        id: 'e-vote-start',
        occurredAt: '2026-01-01T10:02:00.000Z',
        eventType: 'vote_started',
        payload: { agendaItemId: 'a1', meetingVoteId: 'vote-x' },
        vote: {
          id: 'vote-x',
          meetingId: 'm1',
          title: 'T',
          status: 'open',
          anonymous: false,
          createdByUserId: 'u1',
          createdAt: '2026-01-01T10:02:00.000Z',
          closedAt: null,
          sourceEventId: 'e-root',
        },
        orderIndex: 3,
      },
    ];

    const { blocks } = buildProtocolBlocks({
      detail: baseMeeting,
      timelineItems,
      agendaItems,
      activeVote: null,
    });

    expect(blocks.filter((b) => b.type === 'brainstorm' && b.status === 'open')).toHaveLength(0);
    expect(blocks.filter((b) => b.type === 'brainstorm' && b.status === 'closed')).toHaveLength(1);
    expect(blocks.filter((b) => b.type === 'vote')).toHaveLength(1);
  });

  it('after brainstorm_ended keeps only closed brainstorm snapshot row (no stale open card)', () => {
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
      agendaItems,
      activeVote: null,
    });

    const brainstormBlocks = blocks.filter((block) => block.type === 'brainstorm');
    expect(brainstormBlocks).toHaveLength(1);
    expect(brainstormBlocks[0]?.status).toBe('closed');
  });
});
