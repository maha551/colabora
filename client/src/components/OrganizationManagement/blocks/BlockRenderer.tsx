import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../ui/utils';
import { useTimezone } from '../../../hooks/useTimezone';
import { Icon } from '../../ui/Icon';
import { BlockLinkChip } from './BlockLinkChip';
import { InlineNextActionHint } from './InlineNextActionHint';
import type { ProtocolBlock, ProtocolBlockStatus, ProtocolBlockType } from './protocolBlocks.types';
import {
  AgendaItemBlock,
  BrainstormBlock,
  DatePollBlock,
  DecisionBlock,
  DocumentLinkBlock,
  ParagraphBlock,
  TodoBlock,
  VoteBlock,
} from './renderers';
import { RADIUS } from '../../../lib/designSystem';
import { protocolUi, blockTypeIcon, statusChipStyle } from './protocolUi';

const BLOCK_TYPE_LABELS: Record<ProtocolBlockType, string> = {
  paragraph: 'Paragraph',
  agenda_item: 'Agenda item',
  brainstorm: 'Brainstorm',
  vote: 'Vote',
  decision: 'Decision',
  date_poll: 'Date poll',
  todo: 'To-do',
  document_link: 'Document link',
};

const BLOCK_STATUS_LABELS: Record<ProtocolBlockStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  completed: 'Completed',
  partial: 'Partial',
  stopped: 'Stopped',
  recorded: 'Recorded',
  deferred: 'Deferred',
};

export interface BlockRendererOverrideProps {
  block: ProtocolBlock;
  heading: string;
  statusLabel: string;
}

export type BlockTypeRendererMap = Partial<
  Record<ProtocolBlockType, (props: BlockRendererOverrideProps) => React.ReactNode>
>;

export interface BlockRendererProps {
  block: ProtocolBlock;
  className?: string;
  compact?: boolean;
  renderers?: BlockTypeRendererMap;
  onNavigateToBlock?: (targetBlockId: string) => void;
  onActNextAction?: (block: ProtocolBlock) => void;
  /**
   * Inactive layer in `DecisionSequenceStack`: hide footer timestamps, link chips, and next-action
   * hints so background cards read as previews, not a second active block.
   */
  stackPeekLayer?: boolean;
  /** Suppress next-action hints and link chips (document read-only view). */
  readOnly?: boolean;
  /** Attached to the root `<article>` (e.g. stack height sync). */
  articleRef?: React.Ref<HTMLElement>;
  articleStyle?: React.CSSProperties;
}

function getFallbackSummary(block: ProtocolBlock, t: (key: string, opts?: { defaultValue?: string; count?: number; documentId?: string }) => string): string {
  switch (block.type) {
    case 'paragraph':
      return (
        block.paragraph.title?.trim() ||
        block.paragraph.text?.trim() ||
        t('protocolCanvas.fallback.noParagraphContent', { defaultValue: 'No paragraph content.' })
      );
    case 'agenda_item':
      return block.item.title?.trim() || t('protocolCanvas.fallback.agendaTopic', { defaultValue: 'Agenda topic' });
    case 'brainstorm':
      return t('protocolCanvas.fallback.brainstormOptionCount', {
        count: block.options.length,
        defaultValue: '{{count}} option(s)',
      });
    case 'vote':
      return (
        block.vote?.title?.trim() ||
        getEventPayloadTitle(block.event.payload) ||
        t('protocolCanvas.fallback.voteEvent', { defaultValue: 'Vote event' })
      );
    case 'decision':
      return (
        (block.decision && typeof block.decision.title === 'string' ? block.decision.title.trim() : block.paragraph?.title?.trim()) ||
        (block.decision && typeof block.decision.text === 'string' ? block.decision.text.trim() : block.paragraph?.text?.trim()) ||
        t('protocolCanvas.fallback.decisionRecorded', { defaultValue: 'Decision recorded.' })
      );
    case 'date_poll':
      return block.chosenSlot
        ? t('protocolCanvas.fallback.datePollChosen', { defaultValue: 'Chosen slot recorded.' })
        : t('protocolCanvas.fallback.datePollUpdate', { defaultValue: 'Date poll update.' });
    case 'todo':
      return block.todo.title?.trim() || t('protocolCanvas.fallback.todoItem', { defaultValue: 'To-do item' });
    case 'document_link':
      return block.title?.trim() || t('protocolCanvas.fallback.documentNumber', { documentId: block.documentId, defaultValue: 'Document {{documentId}}' });
    default:
      return t('protocolCanvas.fallback.genericBlock', { defaultValue: 'Protocol block' });
  }
}

function getEventPayloadTitle(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || !('title' in payload)) {
    return undefined;
  }

  const title = payload.title;
  return typeof title === 'string' && title.trim() ? title.trim() : undefined;
}

function renderFallbackContent(block: ProtocolBlock, t: (key: string, opts?: { defaultValue?: string; count?: number; documentId?: string }) => string): React.ReactNode {
  const summary = getFallbackSummary(block, t);
  return (
    <>
      <p className="text-sm text-muted-foreground">{summary}</p>
    </>
  );
}

function renderDefaultTypedContent(
  block: ProtocolBlock,
  t: (key: string, opts?: { defaultValue?: string; count?: number; documentId?: string }) => string
): React.ReactNode {
  switch (block.type) {
    case 'paragraph':
      return <ParagraphBlock block={block} />;
    case 'agenda_item':
      return <AgendaItemBlock block={block} />;
    case 'brainstorm':
      return <BrainstormBlock block={block} />;
    case 'vote':
      return <VoteBlock block={block} />;
    case 'decision':
      return <DecisionBlock block={block} visualWeight="prominent" />;
    case 'date_poll':
      return <DatePollBlock block={block} />;
    case 'todo':
      return <TodoBlock block={block} />;
    case 'document_link':
      return <DocumentLinkBlock block={block} />;
    default:
      return renderFallbackContent(block, t);
  }
}

function readOptionalAuthorName(block: ProtocolBlock): string | null {
  if (block.type === 'decision' && block.decision && typeof (block.decision as { createdByUserName?: string }).createdByUserName === 'string') {
    const fromDecision = (block.decision as { createdByUserName?: string }).createdByUserName;
    if (fromDecision && fromDecision.trim()) return fromDecision.trim();
  }
  if (block.type === 'paragraph' || block.type === 'decision') {
    const p = block.paragraph as { createdByUserName?: string } | undefined;
    if (p && typeof p.createdByUserName === 'string' && p.createdByUserName.trim()) return p.createdByUserName.trim();
  }
  return null;
}

export function BlockRenderer({
  block,
  className,
  compact = false,
  renderers,
  onNavigateToBlock,
  onActNextAction,
  stackPeekLayer = false,
  readOnly = false,
  articleRef,
  articleStyle,
}: BlockRendererProps) {
  const { t } = useTranslation('organization');
  const { formatDateTime } = useTimezone();
  const formatBlockTimestamp = (iso: string | null): string | null => {
    if (!iso) return null;
    const formatted = formatDateTime(iso);
    return formatted || null;
  };
  const heading = t(`protocolCanvas.blockType.${block.type === 'agenda_item' ? 'agenda' : block.type === 'date_poll' ? 'datePoll' : block.type === 'document_link' ? 'document' : block.type}`, { defaultValue: BLOCK_TYPE_LABELS[block.type] });
  const statusLabel = t(`protocolCanvas.status.${block.status}`, { defaultValue: BLOCK_STATUS_LABELS[block.status] });
  const showShellStatus = block.type !== 'paragraph' && block.type !== 'decision';
  const overrideRenderer = renderers?.[block.type];
  const recordedAt = formatBlockTimestamp(block.occurredAt);
  const authorName = readOptionalAuthorName(block);
  const vote = block.type === 'vote' ? block.vote : null;
  const voteOpened = vote?.createdAt ? formatBlockTimestamp(vote.createdAt) : null;
  const voteClosed = vote?.closedAt ? formatBlockTimestamp(vote.closedAt) : null;

  return (
    <article
      ref={articleRef}
      style={articleStyle}
      data-protocol-block-id={block.id}
      aria-label={`${heading} block`}
      className={cn(protocolUi.surface, compact ? 'p-3 md:p-4' : 'p-4 md:p-5', className)}
    >
      <header className="mb-2 border-b border-border/60 pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Icon name={blockTypeIcon[block.type]} className="h-3 w-3 shrink-0 text-muted-foreground" />
            <h3 className={protocolUi.eyebrow}>{heading}</h3>
          </div>
          {showShellStatus ? (
            <span
              aria-label={`Status: ${statusLabel}`}
              className={cn(
                'inline-flex items-center border px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
                RADIUS.pill,
                statusChipStyle(block.status),
              )}
            >
              {statusLabel}
            </span>
          ) : null}
        </div>
      </header>
      <div className="min-w-0 space-y-3">
        {overrideRenderer
          ? overrideRenderer({ block, heading, statusLabel })
          : renderDefaultTypedContent(block, t)}
      </div>
      {!stackPeekLayer && !readOnly && (
        <>
          <BlockLinkChip links={block.links} onNavigateToBlock={onNavigateToBlock} />
          <InlineNextActionHint
            nextAction={block.nextAction}
            onAct={block.nextAction ? () => onActNextAction?.(block) : undefined}
          />
        </>
      )}
      {!stackPeekLayer &&
        (recordedAt || authorName || (block.type === 'vote' && vote && (voteOpened || voteClosed))) && (
        <footer className="mt-3 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          {recordedAt && <p>{t('protocolCanvas.recordedAt', { time: recordedAt, defaultValue: 'Recorded at {{time}}' })}</p>}
          {authorName && (
            <p>{t('protocolCanvas.recordedBy', { name: authorName, defaultValue: 'Recorded by {{name}}' })}</p>
          )}
          {block.type === 'vote' && vote && (voteOpened || voteClosed) && (
            <p>
              {voteOpened ? t('voteStartedAt', { time: voteOpened }) : ''}
              {voteOpened && voteClosed ? ' · ' : ''}
              {voteClosed ? t('voteClosedAt', { time: voteClosed }) : ''}
            </p>
          )}
        </footer>
      )}
    </article>
  );
}
