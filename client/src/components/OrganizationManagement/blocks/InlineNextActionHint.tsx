import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Icon } from '../../ui/Icon';
import { cn } from '../../ui/utils';
import type { ProtocolNextAction } from './protocolBlocks.types';
import { protocolUi } from './protocolUi';
import { RADIUS } from '../../../lib/designSystem';

export interface InlineNextActionHintProps {
  nextAction?: ProtocolNextAction;
  className?: string;
  onAct?: () => void;
  actLabel?: string;
}

export function InlineNextActionHint({ nextAction, className, onAct, actLabel }: InlineNextActionHintProps) {
  const { t } = useTranslation('organization');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [nextAction?.type, nextAction?.label, nextAction?.dismissible]);

  if (!nextAction || nextAction.type === 'none' || dismissed) {
    return null;
  }

  const isDismissible = nextAction.dismissible !== false;

  return (
    <aside
      className={cn(
        'mt-3 flex items-start justify-between gap-2 border border-border/60 bg-muted/25 px-3 py-2', RADIUS.panel,
        className
      )}
      aria-label={`Suggested next action: ${nextAction.label}`}
      aria-live="polite"
    >
      <div className="min-w-0">
        <p className={protocolUi.eyebrow}>
          {t('protocolCanvas.nextAction.prompt', { defaultValue: 'Next action' })}
        </p>
        <p className="truncate text-sm text-foreground">{nextAction.label}</p>
      </div>

      {isDismissible || onAct ? (
        <div className="flex shrink-0 items-center gap-1">
          {onAct ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onAct}
              aria-label={actLabel ?? nextAction.label}
              className="h-7 px-2 text-xs"
            >
              {actLabel ?? t('protocolCanvas.doIt', { defaultValue: 'Do it' })}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            aria-label={`Dismiss next action hint: ${nextAction.label}`}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {t('protocolCanvas.notNow', { defaultValue: 'Not now' })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            aria-label="Close next action hint"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <Icon name="X" className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
