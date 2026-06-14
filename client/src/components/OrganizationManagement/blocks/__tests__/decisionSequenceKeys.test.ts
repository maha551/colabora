import {
  isDecisionSequenceBlockType,
  getSequenceKeyFromBlock,
  getGroupSequenceKeyFromBlocks,
  isDecisionArcStackGroup,
  sortDecisionArcLayers,
} from '../decisionSequenceKeys';
import type { ProtocolBlock } from '../protocolBlocks.types';

function makeBlock(overrides: Partial<ProtocolBlock> & Pick<ProtocolBlock, 'type'>): ProtocolBlock {
  return {
    id: overrides.id ?? `${overrides.type}:test`,
    status: 'recorded',
    occurredAt: '2026-01-01T10:00:00.000Z',
    orderIndex: 0,
    ...overrides,
  } as ProtocolBlock;
}

describe('isDecisionSequenceBlockType', () => {
  it.each(['brainstorm', 'vote', 'decision', 'date_poll'] as const)(
    'returns true for %s',
    (type) => {
      expect(isDecisionSequenceBlockType(makeBlock({ type }))).toBe(true);
    },
  );

  it.each(['paragraph', 'todo', 'document_link', 'agenda_item'] as const)(
    'returns false for %s',
    (type) => {
      expect(isDecisionSequenceBlockType(makeBlock({ type }))).toBe(false);
    },
  );
});

describe('getSequenceKeyFromBlock', () => {
  it('returns arcId when present', () => {
    expect(getSequenceKeyFromBlock(makeBlock({ type: 'date_poll', arcId: 'arc-1' }))).toBe('arc-1');
  });

  it('returns null when arcId is absent', () => {
    expect(getSequenceKeyFromBlock(makeBlock({ type: 'brainstorm' }))).toBeNull();
  });
});

describe('getGroupSequenceKeyFromBlocks', () => {
  it('returns the arcId from the last block with one', () => {
    const group = [
      makeBlock({ type: 'date_poll', id: 'dp:1' }),
      makeBlock({ type: 'decision', id: 'd:1', arcId: 'arc-5' }),
    ];
    expect(getGroupSequenceKeyFromBlocks(group)).toBe('arc-5');
  });

  it('returns null for non-arc block types', () => {
    const group = [makeBlock({ type: 'paragraph', id: 'p:1' })];
    expect(getGroupSequenceKeyFromBlocks(group)).toBeNull();
  });
});

describe('isDecisionArcStackGroup', () => {
  it('returns true for a group of arc block types including date_poll', () => {
    const group = [
      makeBlock({ type: 'date_poll', id: 'dp:1' }),
      makeBlock({ type: 'decision', id: 'd:1' }),
    ];
    expect(isDecisionArcStackGroup(group)).toBe(true);
  });

  it('returns false for an empty group', () => {
    expect(isDecisionArcStackGroup([])).toBe(false);
  });

  it('returns false when group contains a non-arc type', () => {
    const group = [
      makeBlock({ type: 'brainstorm', id: 'b:1' }),
      makeBlock({ type: 'paragraph', id: 'p:1' }),
    ];
    expect(isDecisionArcStackGroup(group)).toBe(false);
  });
});

describe('sortDecisionArcLayers', () => {
  it('sorts date_poll → brainstorm → vote → decision', () => {
    const group = [
      makeBlock({ type: 'decision', id: 'd:1' }),
      makeBlock({ type: 'date_poll', id: 'dp:1' }),
      makeBlock({ type: 'vote', id: 'v:1' }),
      makeBlock({ type: 'brainstorm', id: 'b:1' }),
    ];
    const sorted = sortDecisionArcLayers(group);
    expect(sorted.map((b) => b.type)).toEqual(['date_poll', 'brainstorm', 'vote', 'decision']);
  });

  it('filters out non-arc block types', () => {
    const group = [
      makeBlock({ type: 'brainstorm', id: 'b:1' }),
      makeBlock({ type: 'paragraph', id: 'p:1' }),
      makeBlock({ type: 'vote', id: 'v:1' }),
    ];
    const sorted = sortDecisionArcLayers(group);
    expect(sorted.map((b) => b.type)).toEqual(['brainstorm', 'vote']);
  });

  it('handles date_poll + decision arc (no brainstorm/vote)', () => {
    const group = [
      makeBlock({ type: 'decision', id: 'd:1' }),
      makeBlock({ type: 'date_poll', id: 'dp:1' }),
    ];
    const sorted = sortDecisionArcLayers(group);
    expect(sorted.map((b) => b.type)).toEqual(['date_poll', 'decision']);
  });
});
