/**
 * Document Lifecycle Stepper (Pearl-Chain)
 * Shows the full document lifecycle in four steps: Proposal, Voting, Outcome, Amendments.
 * Each pearl displays forward events (deadlines, voting start/end, amendments open/closed).
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Document } from '../types';
import { useTimezone } from '../hooks/useTimezone';
import { Card } from './ui/card';
import { Icon } from './ui/Icon';
import { COLORS, SPACING, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';
import {
  getLifecycleSteps,
  getPrimaryLifecycleStep,
  type StepConfig,
  type StepState,
  type TFunctionLifecycle,
} from '../lib/documentLifecycle';

export type { StepConfig, StepState, TFunctionLifecycle };

export interface DocumentLifecycleStepperProps {
  document: Document;
  compact?: boolean;
  /** When false, do not wrap in Card (e.g. when embedded in list status row). Default true. */
  embedInCard?: boolean;
}

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

export function DocumentLifecycleStepper({ document: doc, compact = false, embedInCard = true }: DocumentLifecycleStepperProps) {
  const { t } = useTranslation('documents');
  const { formatDate } = useTimezone();
  const formatLifecycleDate = (date: string) => formatDate(date, DATE_FORMAT_OPTIONS);

  const isMinutes = (doc as Document & { documentKind?: string }).documentKind === 'meeting_minutes';
  const minutesFinalizedAt = (doc as Document & { minutesFinalizedAt?: string | null }).minutesFinalizedAt;

  const steps: StepConfig[] = useMemo(
    () => {
      if (!doc || doc.ownershipType !== 'organizational' || !doc.id || isMinutes) return [];
      return getLifecycleSteps(doc, t, formatLifecycleDate);
    },
    [doc, t, formatLifecycleDate, isMinutes]
  );

  if (!doc || doc.ownershipType !== 'organizational' || !doc.id) {
    return null;
  }

  // Minutes documents do not use proposal/voting lifecycle; show simple status instead of pearls
  if (isMinutes) {
    const label = minutesFinalizedAt
      ? t('lifecycleStepper.minutesFinalized', { defaultValue: 'Minutes finalized' })
      : t('lifecycleStepper.minutesDraft', { defaultValue: 'Minutes (draft)' });
    const dateStr = minutesFinalizedAt ? formatLifecycleDate(minutesFinalizedAt) : '';
    return (
      <Card className={cn(embedInCard && SPACING.card.base, 'border-border')}>
        <div className={cn('flex items-center gap-2 text-sm', SPACING.card.padding)}>
          <span className={cn(COLORS.text.secondary, 'font-medium')}>{label}</span>
          {dateStr && <span className={cn(COLORS.text.hint)}>{dateStr}</span>}
        </div>
      </Card>
    );
  }

  const primaryStep = getPrimaryLifecycleStep(doc, t, formatLifecycleDate);
  const currentIndex = primaryStep ? steps.findIndex((s) => s.id === primaryStep.id) : 0;
  const ariaLabel = t('lifecycleStepper.stepOf', {
    step: currentIndex >= 0 ? currentIndex + 1 : 1,
    label: primaryStep?.label ?? steps[0]?.label ?? '',
  });

  const pearlSize = compact ? 'w-8 h-8' : 'w-8 h-8 sm:w-10 sm:h-10';
  const iconSize = compact ? 'xs' : 'sm';

  const connectorClass = 'flex-1 h-px min-w-[6px] sm:min-w-[8px] bg-border/60 self-center';

  const listContent = (
    <ol
      role="list"
      aria-label={ariaLabel}
      className={cn(
        'flex items-start w-full gap-0 min-w-0',
        compact ? 'flex-nowrap' : 'flex-wrap'
      )}
    >
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          {index > 0 && <div className={connectorClass} aria-hidden />}
          <li
            role="listitem"
            aria-current={step.state === 'current' ? 'step' : undefined}
            aria-label={t('lifecycleStepper.stepOf', { step: index + 1, label: step.label })}
            className={cn(
              'flex flex-col items-center min-w-0',
              compact ? 'flex-shrink-0 min-w-[4rem]' : 'flex-1 basis-[9rem] sm:basis-[10rem]'
            )}
          >
            <div
              className={cn(
                'flex items-center justify-center border flex-shrink-0', RADIUS.pill,
                pearlSize,
                step.pearlClassName
              )}
            >
              <Icon name={step.iconName} size={iconSize} className="shrink-0" aria-hidden />
            </div>
            <div
              className={cn(
                'w-full text-center min-w-0',
                compact ? 'mt-1' : 'mt-1.5 sm:mt-2'
              )}
            >
              <div
                className={cn(
                  'whitespace-normal break-words leading-tight',
                  compact ? 'text-xs' : 'text-xs sm:text-sm',
                  step.state === 'current'
                    ? cn('font-medium', COLORS.text.primary)
                    : step.state === 'info'
                      ? cn('font-normal', COLORS.text.secondary)
                      : COLORS.text.secondary
                )}
              >
                {step.label}
              </div>
              {!compact && step.dateLines.length > 0 && (
                <div
                  className={cn(
                    'text-[10px] sm:text-xs whitespace-normal break-words leading-tight mt-0.5',
                    COLORS.text.secondary
                  )}
                >
                  {step.dateLines.join(' · ')}
                </div>
              )}
              {compact && step.dateLines[0] && (
                <div
                  className={cn(
                    'text-[10px] sm:text-xs whitespace-normal break-words leading-tight mt-0.5',
                    COLORS.text.secondary
                  )}
                >
                  {step.dateLines[0]}
                </div>
              )}
            </div>
          </li>
        </React.Fragment>
      ))}
    </ol>
  );

  if (compact) {
    return (
      <div className={cn('flex min-w-0 overflow-x-auto overflow-y-hidden', SPACING.tight.inline)}>
        {listContent}
      </div>
    );
  }

  const inner = compact
    ? (
      <div className="min-w-0 overflow-x-auto overflow-y-hidden">
        {listContent}
      </div>
    )
    : (
      <div className="min-w-0 overflow-visible">
        {listContent}
      </div>
    );

  if (!embedInCard) {
    return inner;
  }

  return (
    <Card className={cn(SPACING.card.base, SPACING.card.padding, SPACING.section.margin, 'overflow-hidden')}>
      {inner}
    </Card>
  );
}
