import type { ProtocolBlock } from './protocolBlocks.types';

const ARC_BLOCK_TYPES = new Set(['brainstorm', 'vote', 'decision', 'date_poll']);

export function isDecisionSequenceBlockType(block: ProtocolBlock): boolean {
  return ARC_BLOCK_TYPES.has(block.type);
}

/** Arc-based sequence key for grouping decision-arc blocks (server stamps arcId via FK chain). */
export function getSequenceKeyFromBlock(block: ProtocolBlock): string | null {
  return block.arcId ?? null;
}

/**
 * Sequence key for collapse / stack grouping; works for single-card arcs (e.g. brainstorm-only).
 */
export function getGroupSequenceKeyFromBlocks(group: ProtocolBlock[]): string | null {
  if (group.length === 0) return null;
  if (!group.every(isDecisionSequenceBlockType)) return null;
  for (let i = group.length - 1; i >= 0; i -= 1) {
    const key = getSequenceKeyFromBlock(group[i]);
    if (key) return key;
  }
  return null;
}

export function isDecisionArcStackGroup(group: ProtocolBlock[]): boolean {
  return group.length > 0 && group.every(isDecisionSequenceBlockType);
}

/** Canonical display order inside a stacked arc. */
const ROLE_ORDER = ['date_poll', 'brainstorm', 'vote', 'decision'] as const;

export function sortDecisionArcLayers(group: ProtocolBlock[]): ProtocolBlock[] {
  const allowed = new Set<string>(ROLE_ORDER);
  return group
    .filter((b) => allowed.has(b.type))
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.type as (typeof ROLE_ORDER)[number]) -
        ROLE_ORDER.indexOf(b.type as (typeof ROLE_ORDER)[number])
    );
}
