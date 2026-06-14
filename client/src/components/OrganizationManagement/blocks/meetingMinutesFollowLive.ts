import type { TimelineEventItem, TimelineItem } from '../../../lib/api/types/meetingMinutes';
import type { ProtocolBlock } from './protocolBlocks.types';

function parseTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function orderOf(item: { orderIndex?: number }): number {
  return typeof item.orderIndex === 'number' && Number.isFinite(item.orderIndex) ? item.orderIndex : 0;
}

/** Matches hidden topic rows in protocol canvas (see MeetingMinutesPanel). */
export function isTimelineItemHiddenFromLiveFocus(item: TimelineItem): boolean {
  if (item.type !== 'event') return false;
  const ev = item as TimelineEventItem;
  const eventType = ev.eventType ?? ev.event?.eventType ?? '';
  return eventType === 'topic_set';
}

/**
 * Newest timeline row by occurredAt (fallback createdAt on events), then orderIndex, then id.
 * Used when follow-live triggers a server refetch scroll target.
 */
export function getNewestTimelineItemIdForLiveScroll(items: TimelineItem[]): string | null {
  const visible = items.filter((i) => !isTimelineItemHiddenFromLiveFocus(i));
  if (visible.length === 0) return null;

  let best = visible[0]!;
  let bestTime = rowTime(best);
  let bestOrder = orderOf(best);

  for (let i = 1; i < visible.length; i++) {
    const cur = visible[i]!;
    const t = rowTime(cur);
    const o = orderOf(cur);
    if (t > bestTime) {
      best = cur;
      bestTime = t;
      bestOrder = o;
      continue;
    }
    if (t < bestTime) continue;
    if (o > bestOrder) {
      best = cur;
      bestTime = t;
      bestOrder = o;
      continue;
    }
    if (o === bestOrder && cur.id > best.id) {
      best = cur;
      bestTime = t;
      bestOrder = o;
    }
  }
  return best.id;
}

function rowTime(item: TimelineItem): number {
  const at = parseTime(item.occurredAt);
  if (at > 0) return at;
  if (item.type === 'event') {
    const ev = item as TimelineEventItem;
    const created = ev.event?.createdAt;
    return parseTime(typeof created === 'string' ? created : null);
  }
  return 0;
}

/** Newest rendered canvas block by occurredAt, then orderIndex, then id (not agenda headers). */
export function getNewestProtocolCanvasBlockId(blocks: ProtocolBlock[]): string | null {
  const canvas = blocks.filter((b) => b.type !== 'agenda_item');
  if (canvas.length === 0) return null;

  let best = canvas[0]!;
  for (let i = 1; i < canvas.length; i++) {
    const cur = canvas[i]!;
    const bt = parseTime(best.occurredAt);
    const ct = parseTime(cur.occurredAt);
    if (ct > bt) {
      best = cur;
      continue;
    }
    if (ct < bt) continue;
    const bo = orderOf(best);
    const co = orderOf(cur);
    if (co > bo) {
      best = cur;
      continue;
    }
    if (co === bo && cur.id > best.id) best = cur;
  }
  return best.id;
}
