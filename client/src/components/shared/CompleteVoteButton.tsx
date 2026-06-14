/**
 * Shared Complete Vote Button
 * Consistent UX for completing votes across all vote types.
 * Disabled when quorum not met; shows tooltip per Consistency Matrix.
 * Keeps confirmation dialog open during API call to avoid app appearing frozen.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Icon } from '../ui/Icon';
import { TOUCH_TARGETS } from '../../lib/designSystem';

export interface CompleteVoteButtonProps {
  onComplete: () => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  quorumMet?: boolean;
  label?: string;
  /** Custom description for confirmation dialog */
  confirmDescription?: string;
  /** Optional callback after successful complete (e.g. refresh) */
  onSuccess?: () => void;
}

export function CompleteVoteButton({
  onComplete,
  disabled = false,
  loading = false,
  quorumMet = true,
  label,
  confirmDescription,
  onSuccess,
}: CompleteVoteButtonProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayLabel = label ?? t('completeVoteButton.label');
  const displayDescription = confirmDescription ?? t('completeVoteButton.defaultDescription');

  const handleClick = () => {
    if (loading || disabled || !quorumMet) return;
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onComplete();
      setShowConfirm(false);
      onSuccess?.();
    } catch {
      // Error handled in adapter/parent via toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!isSubmitting) setShowConfirm(open);
  };

  const isDisabled = disabled || loading || !quorumMet;
  const tooltipText = quorumMet
    ? t('completeVoteButton.tooltipReady')
    : t('completeVoteButton.tooltipQuorum');

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="default"
              size="sm"
              onClick={handleClick}
              disabled={isDisabled}
              className={TOUCH_TARGETS.button}
            >
              <Icon name="Check" className="w-4 h-4 mr-1" />
              {loading ? t('completeVoteButton.completing') : displayLabel}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>

      <AlertDialog open={showConfirm} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('completeVoteButton.title')}</AlertDialogTitle>
            <AlertDialogDescription>{displayDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <Button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Icon name="Loader2" className="h-4 w-4 animate-spin" />
                  {t('completeVoteButton.completing')}
                </>
              ) : (
                displayLabel
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
