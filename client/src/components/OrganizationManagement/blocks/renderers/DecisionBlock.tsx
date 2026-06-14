import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../ui/utils';
import type { DecisionProtocolBlock } from '../protocolBlocks.types';
import { trackProtocolCanvasAnalytics } from '../protocolCanvasAnalytics';
import { protocolUi } from '../protocolUi';

export interface DecisionBlockProps {
  block: DecisionProtocolBlock;
  className?: string;
  createTodoSlot?: React.ReactNode;
  secondaryActionSlot?: React.ReactNode;
  /**
   * `prominent` — larger quote typography for protocol canvas (closer visual weight to vote cards).
   */
  visualWeight?: 'standard' | 'prominent';
}

function getDecisionParts(block: DecisionProtocolBlock): {
  headline?: string;
  detail?: string;
  fallback: string;
} {
  const title = block.decision && typeof block.decision.title === 'string' ? block.decision.title.trim() : undefined;
  const titleFromParagraph = block.paragraph?.title?.trim();
  const text = block.decision && typeof block.decision.text === 'string' ? block.decision.text.trim() : undefined;
  const textFromParagraph = block.paragraph?.text?.trim();

  const head = title || titleFromParagraph;
  const body = text || textFromParagraph;

  if (head && body && head !== body) {
    return { headline: head, detail: body, fallback: `${head}: ${body}` };
  }

  const single = head || body || '';
  return { fallback: single || 'Decision recorded.' };
}

export function DecisionBlock({
  block,
  className,
  createTodoSlot,
  secondaryActionSlot,
  visualWeight = 'prominent',
}: DecisionBlockProps) {
  const { t } = useTranslation('organization');
  const parts = getDecisionParts(block);
  const fallbackCopy =
    parts.fallback.trim() || t('protocolCanvas.decisionRecorded', { defaultValue: 'Decision recorded.' });

  useEffect(() => {
    trackProtocolCanvasAnalytics({ action: 'decision_view', blockType: 'decision', blockId: block.id });
  }, [block.id]);

  const prominent = visualWeight === 'prominent';

  return (
    <section className={cn('space-y-3', className)} aria-label={t('protocolCanvas.decisionDetailsLabel', { defaultValue: 'Decision' })}>
      <blockquote
        className={cn(
          prominent
            ? cn(
                'border-l-[6px] border-primary/75 bg-muted/25 py-4 pl-5 pr-3 sm:py-5 sm:pl-7 sm:pr-5',
                'rounded-r-lg shadow-sm'
              )
            : cn('border-l-4 border-primary/70 bg-muted/20 py-2 pl-4 pr-2', 'rounded-r-md'),
          !prominent && 'text-sm leading-relaxed font-medium text-foreground'
        )}
      >
        {prominent && parts.headline && parts.detail ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl md:text-2xl">
              {parts.headline}
            </p>
            <p className="text-base leading-snug text-muted-foreground sm:text-lg md:text-xl">{parts.detail}</p>
          </div>
        ) : prominent ? (
          <p className="text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl md:text-2xl">
            {fallbackCopy}
          </p>
        ) : (
          <p>{fallbackCopy}</p>
        )}
      </blockquote>

      {createTodoSlot || secondaryActionSlot ? (
        <div className={protocolUi.blockActionsRow} aria-label={t('protocolCanvas.decisionActionsLabel', { defaultValue: 'Follow-up actions' })}>
          {createTodoSlot ? <div className="shrink-0">{createTodoSlot}</div> : null}
          {secondaryActionSlot ? <div className="shrink-0">{secondaryActionSlot}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
