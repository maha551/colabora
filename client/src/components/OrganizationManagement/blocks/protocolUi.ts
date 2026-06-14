import type { ProtocolBlockStatus, ProtocolBlockType } from './protocolBlocks.types';
export const blockTypeIcon: Record<ProtocolBlockType, string> = {
  paragraph: 'FileText',
  agenda_item: 'ListOrdered',
  brainstorm: 'Lightbulb',
  vote: 'Vote',
  decision: 'CheckCircle2',
  date_poll: 'Calendar',
  todo: 'ListTodo',
  document_link: 'FileText',
};

const STATUS_CHIP_STYLES: Record<ProtocolBlockStatus, string> = {
  open: 'border-[var(--status-active-border)] bg-[var(--status-active-bg)] text-[var(--status-active-text)]',
  closed: 'border-[var(--status-draft-border)] bg-[var(--status-draft-bg)] text-[var(--status-draft-text)]',
  completed: 'border-[var(--status-approved-border)] bg-[var(--status-approved-bg)] text-[var(--status-approved-text)]',
  deferred: 'border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]',
  partial: 'border-[var(--status-proposed-border)] bg-[var(--status-proposed-bg)] text-[var(--status-proposed-text)]',
  stopped: 'border-[var(--status-rejected-border)] bg-[var(--status-rejected-bg)] text-[var(--status-rejected-text)]',
  recorded: 'border-[var(--status-approved-border)] bg-[var(--status-approved-bg)] text-[var(--status-approved-text)]',
};

export function statusChipStyle(status: ProtocolBlockStatus): string {
  return STATUS_CHIP_STYLES[status] ?? STATUS_CHIP_STYLES.closed;
}

/**
 * Shared Tailwind class fragments for protocol (minutes) blocks and the agenda canvas.
 * Keeps block type labels visually subordinate to each block's primary content.
 */
export const protocolUi = {
  /** Block type (shell) + canvas section labels (Agenda, Before first topic, \u2026) */
  eyebrow: 'text-xs font-semibold uppercase tracking-wider text-muted-foreground',
  /** Primary heading inside block body (vote title, poll title, todo title, \u2026) */
  bodyTitle: 'text-sm font-semibold leading-snug text-foreground',
  /** Secondary line under the title (summaries, counts) */
  bodySubtitle: 'text-sm text-muted-foreground',
  /** Long preview / paragraph body copy */
  body: 'text-sm leading-relaxed text-muted-foreground',
  /** Fine print (IDs, hints, timestamps in-body) */
  meta: 'text-xs text-muted-foreground',
  /** Standard divider before primary actions inside a block */
  actionRow: 'border-t border-border/60 pt-3',
  /**
   * Toolbar row under block content: rule + left-aligned actions (consistent across paragraph, todo, vote, \u2026).
   * Omit extra \`mt-3\` when the parent already uses \`space-y-*\` between content and this row.
   */
  blockActionsRow: 'flex flex-wrap items-center justify-start gap-2 border-t border-border/60 pt-3',
  /** Multi-line action areas (e.g. brainstorm): rule + stacked rows, each row left-aligned */
  blockActionsStack: 'flex flex-col gap-3 border-t border-border/60 pt-3',
  /** Compact control height so ABSATZ / TO-DO / vote footer actions match */
  blockActionBtn: 'min-h-9 shrink-0 px-3 py-1.5 text-xs gap-1.5 [&_svg]:size-3.5',
  /** Use with \`variant="outline"\` \u2014 muted delete, not solid red */
  blockActionBtnDelete:
    'border-border text-muted-foreground hover:border-destructive/45 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/25',
  /** Matches BlockRenderer card chrome for topic rows / agenda chrome (RADIUS.chrome) */
  surface: 'rounded-xl border border-border/60 bg-card shadow-sm',
  /** Lighter grouped panel (agenda jump chips) — same radius, less elevation (RADIUS.chrome) */
  surfaceMuted: 'rounded-xl border border-border/60 bg-card/60',
  /** Decision sequence stack (minutes): padding inside the deck so peek strips and cards aren\u2019t flush to edges */
  decisionSequenceDeck: 'relative pt-1 pb-2 md:pt-2 md:pb-3',
  /**
   * When the overlapped deck is active: extra bottom breathing room so a short front card doesn\u2019t feel crushed
   * against the next canvas block while taller peek layers extend below.
   */
  decisionSequenceDeckStacked: 'pb-5 md:pb-6',
  /** Minimum shell height for the front stack card when another layer exists (viewport-capped). */
  decisionSequenceFrontCardMin: 'min-h-[min(40vh,17.5rem)] md:min-h-[min(34vh,16rem)]',
  /** Front card is a decision: taller shell so it reads closer to vote-style presence in a stack. */
  decisionSequenceFrontCardMinDecision: 'min-h-[min(48vh,22rem)] md:min-h-[min(42vh,19rem)]',
  /** Timeline rail: vertical line connecting blocks */
  timelineRail: 'relative before:absolute before:left-4 before:top-0 before:bottom-0 before:w-px before:bg-border/60',
  /** Timeline dot: positioned on the rail per block */
  timelineDot: 'absolute -left-[5px] top-5 z-[1] h-2.5 w-2.5 rounded-full border-2 border-background',
} as const;
