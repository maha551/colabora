import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import { cn } from '../../../ui/utils';
import type { ParagraphProtocolBlock } from '../protocolBlocks.types';
import { trackProtocolCanvasAnalytics } from '../protocolCanvasAnalytics';
import { protocolUi } from '../protocolUi';

const SECTION_PRESET_LABELS: Record<ParagraphProtocolBlock['sectionPreset'], string> = {
  freeform: 'Freeform',
  agenda: 'Agenda',
  attendees: 'Attendees',
  discussion: 'Discussion',
  decisions: 'Decisions',
  action_items: 'Action items',
  next_meeting: 'Next meeting',
  unknown: 'Unknown section',
};

const MAX_PREVIEW_LENGTH = 280;

function toMarkdownSafePreview(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const textOnly = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^(#{1,6}\s*)/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!textOnly) {
    return '';
  }

  return textOnly.length > MAX_PREVIEW_LENGTH
    ? `${textOnly.slice(0, MAX_PREVIEW_LENGTH - 1).trimEnd()}…`
    : textOnly;
}

export interface ParagraphBlockProps {
  block: ParagraphProtocolBlock;
  className?: string;
  onEditParagraph?: () => void;
  onDeleteParagraph?: () => void;
  disableEdit?: boolean;
  disableDelete?: boolean;
}

export function ParagraphBlock({
  block,
  className,
  onEditParagraph,
  onDeleteParagraph,
  disableEdit = false,
  disableDelete = false,
}: ParagraphBlockProps) {
  const { t } = useTranslation(['organization', 'common']);
  const title = block.paragraph.title?.trim() || '';
  const textPreview = toMarkdownSafePreview(block.paragraph.text);
  const sectionLabel = t(`protocolCanvas.paragraphSection.${block.sectionPreset}`, {
    defaultValue: SECTION_PRESET_LABELS[block.sectionPreset] ?? SECTION_PRESET_LABELS.unknown,
  });
  const showSectionBadge = block.sectionPreset !== 'freeform' && block.sectionPreset !== 'unknown';
  const showTitle = Boolean(title);

  return (
    <section className={className} aria-label={`Paragraph content${showTitle ? `: ${title}` : ''}`}>
      <header className="mb-2 flex items-center justify-between gap-2">
        {showTitle ? <h4 className={protocolUi.bodyTitle}>{title}</h4> : <span />}
        {showSectionBadge ? (
          <Badge variant="outline" className="shrink-0" aria-label={`Section preset: ${sectionLabel}`}>
            {sectionLabel}
          </Badge>
        ) : null}
      </header>
      <p className={protocolUi.body}>
        {textPreview || t('protocolCanvas.noParagraphText', { defaultValue: 'No paragraph text available.' })}
      </p>
      {(onEditParagraph || onDeleteParagraph) && (
        <div className={cn('mt-3', protocolUi.blockActionsRow)}>
          {onEditParagraph && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={protocolUi.blockActionBtn}
              disabled={disableEdit}
              onClick={() => {
                trackProtocolCanvasAnalytics({ action: 'paragraph_edit', blockType: 'paragraph', blockId: block.id });
                onEditParagraph();
              }}
            >
              {t('buttons.edit', { ns: 'common' })}
            </Button>
          )}
          {onDeleteParagraph && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(protocolUi.blockActionBtn, protocolUi.blockActionBtnDelete)}
              disabled={disableDelete}
              onClick={() => {
                trackProtocolCanvasAnalytics({ action: 'paragraph_delete', blockType: 'paragraph', blockId: block.id });
                onDeleteParagraph();
              }}
            >
              {t('buttons.delete', { ns: 'common' })}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
