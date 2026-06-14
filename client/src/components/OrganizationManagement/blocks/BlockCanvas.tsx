import React from 'react';
import { cn } from '../../ui/utils';
import { Icon } from '../../ui/Icon';
import { BlockRenderer, type BlockTypeRendererMap } from './BlockRenderer';
import type { ProtocolBlock } from './protocolBlocks.types';
import { protocolUi } from './protocolUi';

export interface BlockCanvasProps {
  blocks: ProtocolBlock[];
  className?: string;
  listClassName?: string;
  itemClassName?: string;
  /**
   * `embed` keeps full-width flow in constrained panels;
   * `standalone` centers on wider pages.
   */
  layout?: 'embed' | 'standalone';
  compact?: boolean;
  /** Block IDs that should be preceded by a date separator. */
  dateSeparatorBlockIds?: Set<string>;
  /** Render a date separator for the given ISO date string. */
  renderDateSeparator?: (isoDate: string, compact?: boolean) => React.ReactNode;
  emptyState?: React.ReactNode;
  emptyStateLabel?: string;
  ariaLabel?: string;
  blockRenderers?: BlockTypeRendererMap;
  onNavigateToBlock?: (targetBlockId: string) => void;
  onActNextAction?: (block: ProtocolBlock) => void;
  readOnly?: boolean;
}

export function BlockCanvas({
  blocks,
  className,
  listClassName,
  itemClassName,
  layout = 'embed',
  compact = false,
  dateSeparatorBlockIds,
  renderDateSeparator,
  emptyState,
  emptyStateLabel = 'No protocol blocks available.',
  ariaLabel = 'Protocol blocks',
  blockRenderers,
  onNavigateToBlock,
  onActNextAction,
  readOnly = false,
}: BlockCanvasProps) {
  if (blocks.length === 0) {
    return (
      <section
        className={cn('w-full', layout === 'standalone' && 'mx-auto max-w-4xl', className)}
        aria-label={ariaLabel}
      >
        {emptyState ?? (
          <div
            className={cn(
              protocolUi.surfaceMuted,
              'flex flex-col items-center justify-center border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground',
            )}
            role="status"
            aria-live="polite"
          >
            <Icon name="FileText" className="mb-2 h-8 w-8 text-muted-foreground/40" />
            {emptyStateLabel}
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      className={cn('w-full', layout === 'standalone' && 'mx-auto max-w-4xl', className)}
      aria-label={ariaLabel}
    >
      <ul
        className={cn(
          compact ? 'space-y-2' : 'space-y-2.5',
          listClassName,
        )}
        role="list"
      >
        {blocks.map((block) => (
          <React.Fragment key={block.id}>
            {dateSeparatorBlockIds?.has(block.id) && block.occurredAt && renderDateSeparator?.(block.occurredAt, compact)}
            <li className={cn('relative', itemClassName)}>
              <BlockRenderer
                block={block}
                compact={compact}
                renderers={blockRenderers}
                onNavigateToBlock={onNavigateToBlock}
                onActNextAction={onActNextAction}
                readOnly={readOnly}
              />
            </li>
          </React.Fragment>
        ))}
      </ul>
    </section>
  );
}
