import { parseHash, isMeetingProtocolDetail } from '../../client/src/lib/hashRoutes';
import {
  getNewestProtocolCanvasBlockId,
  getNewestTimelineItemIdForLiveScroll,
  isTimelineItemHiddenFromLiveFocus,
} from '../../client/src/components/OrganizationManagement/blocks/meetingMinutesFollowLive';
import type { ProtocolBlock } from '../../client/src/components/OrganizationManagement/blocks/protocolBlocks.types';
import type { TimelineItem } from '../../client/src/lib/api/types/meetingMinutes';

describe('isMeetingProtocolDetail', () => {
  it('is true for organization meeting detail hash shape', () => {
    expect(isMeetingProtocolDetail(parseHash('#/organization/org-1/meetings/meet-9'))).toBe(true);
  });

  it('is false for meetings/new', () => {
    expect(isMeetingProtocolDetail(parseHash('#/organization/org-1/meetings/new'))).toBe(false);
  });

  it('is false for org dashboard', () => {
    expect(isMeetingProtocolDetail(parseHash('#/organization/org-1/dashboard'))).toBe(false);
  });
});

describe('meetingMinutesFollowLive', () => {
  it('hides topic_set events from live focus', () => {
    const topicSet: TimelineItem = {
      type: 'event',
      id: 'e1',
      occurredAt: '2026-01-10T12:00:00.000Z',
      eventType: 'topic_set',
      payload: {},
    };
    expect(isTimelineItemHiddenFromLiveFocus(topicSet)).toBe(true);
    const paragraph: TimelineItem = {
      type: 'paragraph',
      id: 'p1',
      occurredAt: '2026-01-10T11:00:00.000Z',
    };
    expect(isTimelineItemHiddenFromLiveFocus(paragraph)).toBe(false);
  });

  it('picks newest timeline id by occurredAt', () => {
    const items: TimelineItem[] = [
      { type: 'paragraph', id: 'a', occurredAt: '2026-01-10T10:00:00.000Z', orderIndex: 1 },
      { type: 'paragraph', id: 'b', occurredAt: '2026-01-10T12:00:00.000Z', orderIndex: 2 },
      { type: 'paragraph', id: 'c', occurredAt: '2026-01-10T11:00:00.000Z', orderIndex: 3 },
    ];
    expect(getNewestTimelineItemIdForLiveScroll(items)).toBe('b');
  });

  it('picks newest canvas block id by occurredAt', () => {
    const blocks = [
      {
        id: 'paragraph:x',
        type: 'paragraph',
        occurredAt: '2026-01-10T09:00:00.000Z',
        orderIndex: 1,
        status: 'recorded',
        paragraph: { type: 'paragraph', id: 'x', occurredAt: '2026-01-10T09:00:00.000Z' },
        sectionPreset: 'freeform',
      },
      {
        id: 'paragraph:y',
        type: 'paragraph',
        occurredAt: '2026-01-10T15:00:00.000Z',
        orderIndex: 2,
        status: 'recorded',
        paragraph: { type: 'paragraph', id: 'y', occurredAt: '2026-01-10T15:00:00.000Z' },
        sectionPreset: 'freeform',
      },
    ] as ProtocolBlock[];
    expect(getNewestProtocolCanvasBlockId(blocks)).toBe('paragraph:y');
  });

  it('ignores agenda_item blocks when picking newest canvas id', () => {
    const blocks = [
      {
        id: 'agenda:a1',
        type: 'agenda_item',
        occurredAt: '2099-01-01T00:00:00.000Z',
        orderIndex: 0,
        status: 'open',
        item: {
          id: 'a1',
          meetingId: 'm',
          title: 'T',
          orderIndex: 0,
          createdAt: '',
          updatedAt: '',
          createdByUserId: null,
        },
      },
      {
        id: 'paragraph:z',
        type: 'paragraph',
        occurredAt: '2026-01-10T10:00:00.000Z',
        orderIndex: 1,
        status: 'recorded',
        paragraph: { type: 'paragraph', id: 'z', occurredAt: '2026-01-10T10:00:00.000Z' },
        sectionPreset: 'freeform',
      },
    ] as ProtocolBlock[];
    expect(getNewestProtocolCanvasBlockId(blocks)).toBe('paragraph:z');
  });
});
