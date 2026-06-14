import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../ui/utils';
import { BlockRenderer, type BlockTypeRendererMap } from './BlockRenderer';
import type { ProtocolBlock } from './protocolBlocks.types';
import { protocolUi, statusChipStyle } from './protocolUi';
import { RADIUS } from '../../../lib/designSystem';

export interface DecisionSequenceStackProps {
  layers: ProtocolBlock[];
  blockRenderers?: BlockTypeRendererMap;
  onNavigateToBlock?: (targetBlockId: string) => void;
  onActNextAction?: (block: ProtocolBlock) => void;
  layout?: 'embed' | 'standalone';
  ariaLabel?: string;
  readOnly?: boolean;
}

function stripShowsStatusChip(block: ProtocolBlock): boolean {
  return block.type !== 'paragraph' && block.type !== 'decision';
}

function SequenceStageStrip({
  block,
  stageTitle,
  onSelect,
}: {
  block: ProtocolBlock;
  stageTitle: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation('organization');
  const statusLabel = t(`protocolCanvas.status.${block.status}`, {
    defaultValue: block.status,
  });
  const showChip = stripShowsStatusChip(block);
  const actionLabel = t('protocolCanvas.bringLayerForward', {
    label: stageTitle,
    defaultValue: 'Show {{label}}',
  });

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={actionLabel}
      data-protocol-block-id={block.id}
      className={cn(
        protocolUi.surface,
        'flex w-full min-h-11 items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
        'hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className={protocolUi.eyebrow}>{stageTitle}</h3>
        {showChip ? (
          <span
            aria-label={`Status: ${statusLabel}`}
            className={cn(
              'inline-flex shrink-0 items-center border px-2 py-0.5 text-xs font-medium uppercase tracking-wide', RADIUS.pill,
              statusChipStyle(block.status),
            )}
          >
            {statusLabel}
          </span>
        ) : null}
      </div>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{actionLabel}</span>
    </button>
  );
}

export function DecisionSequenceStack({
  layers,
  blockRenderers,
  onNavigateToBlock,
  onActNextAction,
  layout = 'embed',
  ariaLabel,
  readOnly = false,
}: DecisionSequenceStackProps) {
  const { t } = useTranslation('organization');
  const [activeLayerIndex, setActiveLayerIndex] = React.useState(Math.max(0, layers.length - 1));

  const prevLayerCountRef = React.useRef(layers.length);
  React.useEffect(() => {
    if (layers.length > prevLayerCountRef.current) {
      setActiveLayerIndex(Math.max(0, layers.length - 1));
    } else if (layers.length < prevLayerCountRef.current) {
      setActiveLayerIndex((prev) => Math.min(prev, Math.max(0, layers.length - 1)));
    }
    prevLayerCountRef.current = layers.length;
  }, [layers.length]);

  const label = ariaLabel ?? t('minutes', { defaultValue: 'Minutes' });

  const stageTitle = (block: ProtocolBlock) =>
    t(`protocolCanvas.blockType.${block.type === 'date_poll' ? 'datePoll' : block.type === 'document_link' ? 'document' : block.type}`, {
      defaultValue: block.type,
    });

  const stackMode = layers.length > 1;

  return (
    <section className={cn('w-full', layout === 'standalone' && 'mx-auto max-w-4xl')} aria-label={label}>
      {layers.length > 1 ? (
        <p className="sr-only">
          {t('protocolCanvas.sequenceLabel', { defaultValue: 'Decision sequence' })}
        </p>
      ) : null}
      <div
        aria-label={t('protocolCanvas.decisionSequenceStackRegion', {
          defaultValue: 'Decision sequence cards',
        })}
      >
        <div className={cn(protocolUi.decisionSequenceDeck, stackMode && protocolUi.decisionSequenceDeckStacked)}>
          {stackMode ? (
            <div className="flex flex-col gap-2">
              {layers.map((block, index) => {
                const isActive = index === activeLayerIndex;
                if (isActive) {
                  return (
                    <BlockRenderer
                      key={block.id}
                      block={block}
                      renderers={blockRenderers}
                      onNavigateToBlock={onNavigateToBlock}
                      onActNextAction={onActNextAction}
                      readOnly={readOnly}
                      stackPeekLayer={false}
                      className={cn(
                        'ring-2 ring-primary/20 shadow-md',
                        block.type === 'decision' || block.type === 'date_poll'
                          ? protocolUi.decisionSequenceFrontCardMinDecision
                          : protocolUi.decisionSequenceFrontCardMin
                      )}
                    />
                  );
                }
                return (
                  <SequenceStageStrip
                    key={block.id}
                    block={block}
                    stageTitle={stageTitle(block)}
                    onSelect={() => setActiveLayerIndex(index)}
                  />
                );
              })}
            </div>
          ) : layers[0] ? (
            <BlockRenderer
              block={layers[0]}
              renderers={blockRenderers}
              onNavigateToBlock={onNavigateToBlock}
              onActNextAction={onActNextAction}
              readOnly={readOnly}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
