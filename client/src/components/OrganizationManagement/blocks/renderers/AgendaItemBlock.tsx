import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import type { AgendaItemProtocolBlock } from '../protocolBlocks.types';
import { protocolUi } from '../protocolUi';

export interface AgendaItemBlockProps {
  block: AgendaItemProtocolBlock;
  className?: string;
  onSetCurrentTopic?: (agendaItemId: string) => void;
  disableSetCurrentTopic?: boolean;
}

export function AgendaItemBlock({ block, className, onSetCurrentTopic, disableSetCurrentTopic = false }: AgendaItemBlockProps) {
  const { t } = useTranslation('organization');
  const itemTitle = block.item.title?.trim() || t('protocolCanvas.untitledAgendaItem', { defaultValue: 'Untitled agenda item' });
  const topicLabel = block.isCurrentTopic
    ? t('currentTopicBadge', { defaultValue: 'Current topic' })
    : t('protocolCanvas.topic', { defaultValue: 'Topic' });
  const canSetCurrentTopic = Boolean(onSetCurrentTopic && !block.isCurrentTopic && !disableSetCurrentTopic);

  return (
    <section className={className} aria-label={`Agenda item: ${itemTitle}`}>
      <header className="flex items-center justify-between gap-2">
        <h4 className={protocolUi.bodyTitle}>{itemTitle}</h4>
        <Badge
          variant={block.isCurrentTopic ? 'default' : 'secondary'}
          className="shrink-0"
          aria-label={topicLabel}
        >
          {topicLabel}
        </Badge>
      </header>
      {onSetCurrentTopic && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canSetCurrentTopic}
            onClick={() => onSetCurrentTopic(block.item.id)}
          >
            {t('protocolCanvas.setCurrentTopic', { defaultValue: 'Set current topic' })}
          </Button>
        </div>
      )}
    </section>
  );
}
