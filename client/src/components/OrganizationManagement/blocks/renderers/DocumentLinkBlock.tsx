import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../ui/button';
import { Icon } from '../../../ui/Icon';
import { cn } from '../../../ui/utils';
import type { DocumentLinkProtocolBlock } from '../protocolBlocks.types';
import { trackProtocolCanvasAnalytics } from '../protocolCanvasAnalytics';
import { protocolUi } from '../protocolUi';
import { RADIUS } from '../../../../lib/designSystem';

export interface DocumentLinkBlockProps {
  block: DocumentLinkProtocolBlock;
  className?: string;
  onOpenDocument?: (documentId: string) => void;
}

export function DocumentLinkBlock({ block, className, onOpenDocument }: DocumentLinkBlockProps) {
  const { t } = useTranslation('organization');
  const title =
    block.title?.trim() ||
    `${t('protocolCanvas.blockType.document', { defaultValue: 'Document' })} #${block.documentId}`;

  useEffect(() => {
    trackProtocolCanvasAnalytics({ action: 'document_link_view', blockType: 'document_link', blockId: block.id });
  }, [block.id]);

  const handleOpen = () => {
    trackProtocolCanvasAnalytics({ action: 'document_open', blockType: 'document_link', blockId: block.id });
    onOpenDocument?.(block.documentId);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-1.5">
        {onOpenDocument ? (
          <button
            type="button"
            onClick={handleOpen}
            aria-label={`${t('openDocument', { defaultValue: 'Open document' })}: ${title}`}
            className={cn(
              protocolUi.bodyTitle,
              'group flex w-full min-w-0 items-center gap-1.5 text-left transition-colors', RADIUS.control,
              'hover:text-primary hover:underline',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            )}
          >
            <span className="min-w-0">{title}</span>
            <Icon name="ExternalLink" className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
          </button>
        ) : (
          <p className={protocolUi.bodyTitle}>{title}</p>
        )}
        <p className={protocolUi.meta}>
          {t('protocolCanvas.documentCreatedDuringMeeting', {
            defaultValue: 'Linked from this meeting (document created event).',
          })}
        </p>
        <p className={cn(protocolUi.meta, 'font-mono')}>
          {t('protocolCanvas.documentId', { defaultValue: 'Document ID' })}: {block.documentId}
        </p>
      </div>

      {onOpenDocument && (
        <div className={protocolUi.blockActionsRow}>
          <Button type="button" size="sm" variant="secondary" className={protocolUi.blockActionBtn} onClick={handleOpen}>
            {t('openDocument', { defaultValue: 'Open document' })}
          </Button>
        </div>
      )}
    </div>
  );
}
