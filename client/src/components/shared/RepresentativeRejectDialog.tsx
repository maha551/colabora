"use client";

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Icon } from '../ui/Icon';
import { SPACING, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

interface RepresentativeRejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  itemName: string;
  onConfirm: (reason: string) => Promise<void>;
}

export function RepresentativeRejectDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
}: RepresentativeRejectDialogProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(t('representativeRejectDialog.reasonRequired'));
      return;
    }
    if (trimmed.length > 2000) {
      setError(t('representativeRejectDialog.reasonTooLong'));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm(trimmed);
      onOpenChange(false);
    } catch {
      setError(t('representativeRejectDialog.failedToDecline'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = reason.trim().length >= 1 && reason.trim().length <= 2000 && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className={SPACING.content.gap}>
          <div className={SPACING.content.gap}>
            <Label htmlFor="reject-reason">
              {t('representativeRejectDialog.reasonLabel')} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              placeholder={t('representativeRejectDialog.reasonPlaceholder', { itemName })}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={2000}
              className="resize-none"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              {t('representativeRejectDialog.charCount', { count: reason.length })}
            </p>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className={SPACING.tight.inline}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {tCommon('buttons.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!canSubmit}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className={cn("animate-spin h-4 w-4 border-b-2 border-current", RADIUS.pill)} />
                  {t('representativeRejectDialog.declining')}
                </>
              ) : (
                <>
                  <Icon name="XCircle" className="h-4 w-4" />
                  {tCommon('buttons.decline')}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
