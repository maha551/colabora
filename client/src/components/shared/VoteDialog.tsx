/**
 * VoteDialog Component
 * 
 * Standardized dialog for casting votes with integrated VoteRadioGroup.
 * Handles both Yes/No/Abstain and PRO/NEUTRAL/CONTRA vote types.
 * 
 * Uses design system constants for consistent spacing and layout.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { VoteRadioGroup, VoteValue, VoteType } from './VoteRadioGroup';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { SPACING } from '../../lib/designSystem';
import { cn } from '../ui/utils';

interface VoteDialogProps {
  /** Dialog open state */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Optional dialog description */
  description?: string;
  /** Callback when vote is submitted */
  onSubmit: (vote: VoteValue) => Promise<void>;
  /** Loading state */
  isLoading?: boolean;
  /** Waiting for WebSocket update (shows different message) */
  isWaitingForUpdate?: boolean;
  /** Vote type determines the value format */
  voteType?: VoteType;
  /** Custom ID prefix for radio group (default: 'vote') */
  idPrefix?: string;
  /** Custom className */
  className?: string;
}

/**
 * VoteDialog Component
 * 
 * Provides a standardized voting dialog with proper loading states,
 * error handling, and design system integration.
 * 
 * @example
 * <VoteDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Cast Your Vote"
 *   description="Vote on this proposal"
 *   onSubmit={handleVote}
 *   isLoading={submitting}
 *   voteType="yes-no-abstain"
 * />
 */
export function VoteDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  isLoading = false,
  isWaitingForUpdate = false,
  voteType = 'yes-no-abstain',
  idPrefix = 'vote',
  className,
}: VoteDialogProps) {
  const { t } = useTranslation('common');
  const [selectedVote, setSelectedVote] = useState<VoteValue | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedVote || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(selectedVote);
      // Reset selection on success
      setSelectedVote('');
      onOpenChange(false);
    } catch (error) {
      // Error handling is done by parent component via toast
      // Just reset submitting state
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setSelectedVote('');
    onOpenChange(false);
  };

  const isDisabled = !selectedVote || isSubmitting || isLoading;
  const displayLoading = isSubmitting || isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(SPACING.card.padding, className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className={cn(SPACING.content.gap, 'py-4')}>
          <VoteRadioGroup
            value={selectedVote}
            onValueChange={(value) => setSelectedVote(value)}
            voteType={voteType}
            disabled={displayLoading}
            idPrefix={idPrefix}
          />
        </div>

        <div className={cn('flex gap-2 pt-4', SPACING.content.inline)}>
          <Button
            onClick={handleSubmit}
            disabled={isDisabled}
            className="flex-1"
          >
            {displayLoading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                {isWaitingForUpdate ? t('voteDialog.waitingForUpdate') : t('voteDialog.castingVote')}
              </>
            ) : (
              t('voteDialog.castVote')
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={displayLoading}
          >
            {t('buttons.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

