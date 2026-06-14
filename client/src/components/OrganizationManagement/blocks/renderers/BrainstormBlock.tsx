import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../ui/button';
import { Label } from '../../../ui/label';
import { Textarea } from '../../../ui/textarea';
import { cn } from '../../../ui/utils';
import type { BrainstormProtocolBlock } from '../protocolBlocks.types';
import { trackProtocolCanvasAnalytics } from '../protocolCanvasAnalytics';
import { protocolUi } from '../protocolUi';
import { RADIUS } from '../../../../lib/designSystem';

/** Matches server validation in meeting-minutes.js POST /brainstorm/options */
export const BRAINSTORM_IDEA_MAX_LENGTH = 280;

export interface BrainstormBlockProps {
  block: BrainstormProtocolBlock;
  className?: string;
  /** When set and brainstorm is open, shows inline composer for any meeting member. */
  onSubmitBrainstormIdea?: (label: string) => Promise<void>;
  brainstormIdeaSubmitting?: boolean;
  onEndBrainstorm?: (brainstormStartedEventId: string) => void;
  onCloseBrainstormAndVote?: (
    brainstormStartedEventId: string,
    options: { id: string; label: string }[]
  ) => void;
}

export function BrainstormBlock({
  block,
  className,
  onSubmitBrainstormIdea,
  brainstormIdeaSubmitting = false,
  onEndBrainstorm,
  onCloseBrainstormAndVote,
}: BrainstormBlockProps) {
  const { t } = useTranslation('organization');
  const composerId = useId();
  const [ideaDraft, setIdeaDraft] = useState('');
  const brainstormSourceId = block.sourceTimelineItemId ?? block.id;
  const isOpen = block.status === 'open';
  const canMutate = isOpen;
  const hasOptions = block.options.length > 0;

  const fire = (action: string) => {
    trackProtocolCanvasAnalytics({ action, blockType: 'brainstorm', blockId: block.id });
  };

  const handleSubmitIdea = async () => {
    const trimmed = ideaDraft.trim();
    if (!trimmed || brainstormIdeaSubmitting || !onSubmitBrainstormIdea) return;
    fire('brainstorm_add_option');
    try {
      await onSubmitBrainstormIdea(trimmed);
      setIdeaDraft('');
    } catch {
      /* Parent shows toast; keep draft */
    }
  };

  return (
    <section className={cn('space-y-3', className)} aria-label={t('protocolCanvas.brainstormSectionLabel', { defaultValue: 'Brainstorm' })}>
      <div
        className={cn(
          'border px-3 py-2 text-xs font-medium', RADIUS.panel,
          isOpen ? 'border-primary/40 bg-primary/5 text-primary' : 'border-border/60 bg-muted/30 text-muted-foreground'
        )}
        role="status"
      >
        {isOpen
          ? t('protocolCanvas.brainstormStatusOpen', { defaultValue: 'Collecting ideas' })
          : t('protocolCanvas.brainstormStatusClosed', { defaultValue: 'Brainstorm closed' })}
      </div>

      <div aria-label={t('protocolCanvas.brainstormOptionsLabel', { defaultValue: 'Submitted ideas' })}>
        {hasOptions ? (
          <ul className="space-y-2" role="list">
            {block.options.map((option) => (
              <li
                key={option.id}
                className={cn("border border-border/50 bg-card px-3 py-2 text-sm leading-snug text-foreground shadow-sm", RADIUS.control)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className={protocolUi.bodySubtitle}>{t('protocolCanvas.noOptionsYet', { defaultValue: 'No options yet.' })}</p>
        )}
      </div>

      <p className={protocolUi.meta}>
        {canMutate
          ? t('protocolCanvas.brainstormOpenHint', { defaultValue: 'Any meeting member can add ideas while this brainstorm is open.' })
          : t('protocolCanvas.brainstormClosedHint', { defaultValue: 'This brainstorm is no longer accepting new options.' })}
      </p>

      {onSubmitBrainstormIdea && isOpen ? (
        <div className={cn("space-y-2 border border-border/50 bg-muted/10 p-3", RADIUS.panel)}>
          <Label htmlFor={composerId} className={cn(protocolUi.meta, 'text-foreground')}>
            {t('protocolCanvas.brainstormOptionLabel', { defaultValue: 'Your idea' })}
          </Label>
          <Textarea
            id={composerId}
            value={ideaDraft}
            maxLength={BRAINSTORM_IDEA_MAX_LENGTH}
            disabled={brainstormIdeaSubmitting}
            placeholder={t('protocolCanvas.brainstormOptionPlaceholder', { defaultValue: 'Describe the idea…' })}
            className="min-h-[72px] resize-y text-sm"
            onChange={(e) => setIdeaDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleSubmitIdea();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={protocolUi.meta}>
              {ideaDraft.length}/{BRAINSTORM_IDEA_MAX_LENGTH}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={protocolUi.blockActionBtn}
              disabled={brainstormIdeaSubmitting || !ideaDraft.trim()}
              onClick={() => void handleSubmitIdea()}
            >
              {brainstormIdeaSubmitting ? t('saving', { defaultValue: 'Saving…' }) : t('addOption', { defaultValue: 'Add idea' })}
            </Button>
          </div>
        </div>
      ) : null}

      {(onCloseBrainstormAndVote || onEndBrainstorm) ? (
        <div className={protocolUi.blockActionsStack} aria-label={t('protocolCanvas.brainstormActionsLabel', { defaultValue: 'Brainstorm actions' })}>
          {onCloseBrainstormAndVote ? (
            <div className="flex flex-wrap items-center justify-start gap-2">
              <Button
                size="sm"
                variant="outline"
                className={protocolUi.blockActionBtn}
                disabled={!canMutate || !hasOptions}
                onClick={() => {
                  fire('brainstorm_close_and_vote');
                  onCloseBrainstormAndVote(brainstormSourceId, block.options);
                }}
              >
                {t('closeAndVote', { defaultValue: 'Close and vote' })}
              </Button>
            </div>
          ) : null}
          {onEndBrainstorm ? (
            <div className="flex flex-wrap items-center justify-start gap-2">
              <Button
                size="sm"
                variant="ghost"
                className={cn(protocolUi.blockActionBtn, 'text-muted-foreground')}
                disabled={!canMutate}
                onClick={() => {
                  fire('brainstorm_end');
                  onEndBrainstorm(brainstormSourceId);
                }}
              >
                {t('endBrainstorm', { defaultValue: 'End brainstorm' })}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
