import type { ProtocolBlock } from './protocolBlocks.types';
import {
  getGroupSequenceKeyFromBlocks,
  getSequenceKeyFromBlock,
  isDecisionSequenceBlockType,
} from './decisionSequenceKeys';

export function dedupeCanvasTimelineBlocks(blocks: ProtocolBlock[]): ProtocolBlock[] {
  const lastIndexById = new Map<string, number>();
  for (let i = 0; i < blocks.length; i += 1) {
    lastIndexById.set(blocks[i].id, i);
  }
  return blocks.filter((block, index) => lastIndexById.get(block.id) === index);
}

export function groupBlocksByAgendaId(blocks: ProtocolBlock[]): Map<string | null, ProtocolBlock[]> {
  const map = new Map<string | null, ProtocolBlock[]>();
  for (const block of blocks) {
    const key = block.agendaItemId ?? null;
    const list = map.get(key) ?? [];
    list.push(block);
    map.set(key, list);
  }
  return map;
}

export function needsDateSeparator(
  blocks: ProtocolBlock[],
  getDateKey: (date: Date | string | undefined | null) => string,
): Set<string> {
  const result = new Set<string>();
  let lastDateKey: string | null = null;
  for (const block of blocks) {
    if (!block.occurredAt) continue;
    const dateKey = getDateKey(block.occurredAt);
    if (!dateKey) continue;
    if (lastDateKey && dateKey !== lastDateKey) {
      result.add(block.id);
    }
    lastDateKey = dateKey;
  }
  return result;
}

export function mergeArcGroups(groups: ProtocolBlock[][]): ProtocolBlock[][] {
  if (groups.length === 0) return groups;
  const firstIndexByKey = new Map<string, number>();
  const result: ProtocolBlock[][] = [];
  for (const group of groups) {
    const key = getGroupSequenceKeyFromBlocks(group);
    if (!key) {
      result.push(group);
      continue;
    }
    const existing = firstIndexByKey.get(key);
    if (existing != null) {
      result[existing] = [...result[existing], ...group];
    } else {
      firstIndexByKey.set(key, result.length);
      result.push([...group]);
    }
  }
  return result;
}

export function groupBlocksBySequence(blocks: ProtocolBlock[]): ProtocolBlock[][] {
  if (blocks.length === 0) return [];
  const groups: ProtocolBlock[][] = [];
  let current: ProtocolBlock[] = [];
  let currentIsSequence = false;
  let currentSequenceKey: string | null = null;
  for (const block of blocks) {
    const isSequence = isDecisionSequenceBlockType(block);
    const blockSequenceKey = isSequence ? getSequenceKeyFromBlock(block) : null;
    const sameTypedBand = isSequence === currentIsSequence;
    const canContinueSequence =
      isSequence &&
      currentIsSequence &&
      blockSequenceKey != null &&
      blockSequenceKey === currentSequenceKey;
    if (current.length === 0 || (sameTypedBand && (!isSequence || canContinueSequence))) {
      current.push(block);
      currentIsSequence = isSequence;
      currentSequenceKey = isSequence ? blockSequenceKey : null;
      continue;
    }
    groups.push(current);
    current = [block];
    currentIsSequence = isSequence;
    currentSequenceKey = isSequence ? blockSequenceKey : null;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}
