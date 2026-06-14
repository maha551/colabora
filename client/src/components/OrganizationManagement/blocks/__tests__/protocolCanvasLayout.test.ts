import {
  dedupeCanvasTimelineBlocks,
  groupBlocksByAgendaId,
  groupBlocksBySequence,
  mergeArcGroups,
} from '../protocolCanvasLayout';
import type { ProtocolBlock } from '../protocolBlocks.types';

function block(id: string, type: ProtocolBlock['type'], extras: Partial<ProtocolBlock> = {}): ProtocolBlock {
  return {
    id,
    type,
    status: 'recorded',
    occurredAt: '2026-06-05T12:00:00.000Z',
    orderIndex: 1,
    ...extras,
  } as ProtocolBlock;
}

describe('protocolCanvasLayout', () => {
  it('dedupeCanvasTimelineBlocks keeps last duplicate id', () => {
    const blocks = [
      block('vote:a', 'vote'),
      block('paragraph:p1', 'paragraph'),
      block('vote:a', 'vote', { orderIndex: 2 }),
    ];
    const result = dedupeCanvasTimelineBlocks(blocks);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('paragraph:p1');
    expect(result[1].orderIndex).toBe(2);
  });

  it('groupBlocksByAgendaId buckets by agendaItemId', () => {
    const map = groupBlocksByAgendaId([
      block('p1', 'paragraph', { agendaItemId: 'ag-1' }),
      block('p2', 'paragraph', { agendaItemId: null }),
      block('p3', 'paragraph', { agendaItemId: 'ag-1' }),
    ]);
    expect(map.get('ag-1')).toHaveLength(2);
    expect(map.get(null)).toHaveLength(1);
  });

  it('mergeArcGroups merges groups with same arc key', () => {
    const groups: ProtocolBlock[][] = [
      [block('b1', 'brainstorm', { arcId: 'arc-1' })],
      [block('v1', 'vote', { arcId: 'arc-1' })],
      [block('p1', 'paragraph')],
    ];
    const merged = mergeArcGroups(groups);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toHaveLength(2);
    expect(merged[1]).toHaveLength(1);
  });

  it('groupBlocksBySequence groups adjacent arc blocks with same arcId', () => {
    const blocks = [
      block('b1', 'brainstorm', { arcId: 'arc-1' }),
      block('v1', 'vote', { arcId: 'arc-1' }),
      block('p1', 'paragraph'),
    ];
    const groups = groupBlocksBySequence(blocks);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1]).toHaveLength(1);
  });
});
