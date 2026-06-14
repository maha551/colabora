import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';
import type { ProtocolBlockLink } from './protocolBlocks.types';
import { RADIUS } from '../../../lib/designSystem';

export interface BlockLinkChipProps {
  links?: ProtocolBlockLink[];
  className?: string;
  onNavigateToBlock?: (targetBlockId: string) => void;
}

function getChipLabel(link: ProtocolBlockLink, translate: (key: string, opts: { defaultValue: string }) => string): string {
  const label = link.label?.trim() || translate('protocolCanvas.relatedBlock', { defaultValue: 'Related block' });
  return label;
}

export function BlockLinkChip({ links, className, onNavigateToBlock }: BlockLinkChipProps) {
  const { t } = useTranslation('organization');
  const visibleLinks = (links ?? []).filter((link) => link.relationship !== 'references_topic');

  if (!visibleLinks.length) {
    return null;
  }

  return (
    <ul className={cn('mt-3 flex flex-wrap gap-2', className)} aria-label="Related protocol blocks">
      {visibleLinks.map((link) => {
        const chipLabel = getChipLabel(link, t);
        const canNavigate = Boolean(onNavigateToBlock && link.targetBlockId);

        return (
          <li key={link.id}>
            {canNavigate ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn("h-7 px-2 text-xs", RADIUS.pill)}
                aria-label={`${chipLabel}. Navigate to related block.`}
                onClick={() => onNavigateToBlock?.(link.targetBlockId)}
              >
                {chipLabel}
              </Button>
            ) : (
              <Badge variant="outline" className={cn("px-2 py-1 text-xs", RADIUS.pill)}>
                {chipLabel}
              </Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}
