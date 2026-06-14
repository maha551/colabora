/**
 * Compact one-row lifecycle status for list/card views.
 * Shows current step pearl + label + optional first date line; expand trigger for full stepper.
 * For meeting minutes, shows "Minutes (draft)" or "Minutes finalized" + date.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Document } from '../types';
import { useTimezone } from '../hooks/useTimezone';
import { Icon } from './ui/Icon';
import { Button } from './ui/button';
import { getPrimaryLifecycleStep } from '../lib/documentLifecycle';
import { COLORS, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';

export interface DocumentLifecycleCompactRowProps {
  document: Document;
  onExpandClick?: () => void;
  expandLabel?: string;
  /** Optional id for the expandable region (a11y aria-controls) */
  expandedContentId?: string;
  isExpanded?: boolean;
  /** Hide the date line on narrow viewports to avoid crowding action buttons */
  hideDateOnNarrow?: boolean;
  className?: string;
}

export function DocumentLifecycleCompactRow({
  document,
  onExpandClick,
  expandLabel,
  expandedContentId,
  isExpanded = false,
  hideDateOnNarrow = false,
  className,
}: DocumentLifecycleCompactRowProps) {
  const { t } = useTranslation('documents');
  const { formatDate } = useTimezone();
  const formatLifecycleDate = (date: string) =>
    formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' });

  if (!document || document.ownershipType !== 'organizational' || !document.id) {
    return null;
  }

  const docWithKind = document as Document & { documentKind?: string; minutesFinalizedAt?: string | null };
  if (docWithKind.documentKind === 'meeting_minutes') {
    const label = docWithKind.minutesFinalizedAt
      ? t('lifecycleStepper.minutesFinalized', { defaultValue: 'Minutes finalized' })
      : t('lifecycleStepper.minutesDraft', { defaultValue: 'Minutes (draft)' });
    const dateStr = docWithKind.minutesFinalizedAt
      ? formatLifecycleDate(docWithKind.minutesFinalizedAt)
      : '';
    return (
      <div className={cn('flex items-center gap-2 min-w-0', className)} role="row" aria-label={t('statusRowLabel', { defaultValue: 'Document status' })}>
        <span className={cn('text-xs font-medium', COLORS.text.secondary)}>{label}</span>
        {dateStr && <span className={cn('text-[10px] sm:text-xs', COLORS.text.hint)}>{dateStr}</span>}
      </div>
    );
  }

  const currentStep = getPrimaryLifecycleStep(
    document,
    (key, opts) => t(key, opts as Record<string, unknown>),
    formatLifecycleDate
  );
  if (!currentStep) return null;

  const showExpandControl = onExpandClick != null && expandLabel != null;

  return (
    <div
      className={cn('flex items-center gap-2 min-w-0', className)}
      role="row"
      aria-label={t('statusRowLabel', { defaultValue: 'Document status' })}
    >
      <div
        className={cn(
          'flex items-center justify-center border flex-shrink-0 w-8 h-8', RADIUS.pill,
          currentStep.pearlClassName
        )}
        aria-hidden
      >
        <Icon name={currentStep.iconName} size="xs" className="shrink-0" aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-1.5">
        <span className={cn('text-xs font-medium truncate', COLORS.text.primary)}>
          {currentStep.label}
        </span>
        {currentStep.dateLines[0] && (
          <span
            className={cn(
              'text-[10px] sm:text-xs truncate',
              COLORS.text.secondary,
              hideDateOnNarrow && 'hidden sm:inline'
            )}
          >
            {currentStep.dateLines[0]}
          </span>
        )}
      </div>
      {showExpandControl && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onExpandClick();
          }}
          className="flex-shrink-0 h-8 min-w-[44px] touch-manipulation text-xs"
          aria-expanded={isExpanded}
          aria-controls={expandedContentId}
          aria-label={isExpanded ? (t('hideStatusDetailsAria', { defaultValue: 'Hide status details' })) : expandLabel}
        >
          {isExpanded ? (
            <>
              <Icon name="ChevronUp" className="h-3.5 w-3.5 mr-1" aria-hidden />
              {t('hideStatusDetails', { defaultValue: 'Hide' })}
            </>
          ) : (
            <>
              <Icon name="ChevronDown" className="h-3.5 w-3.5 mr-1" aria-hidden />
              {expandLabel}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
