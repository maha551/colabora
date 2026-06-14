import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { COLORS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';

export interface FinalizeMinutesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendaCount: number;
  paragraphCount: number;
  voteCount: number;
  submitting: boolean;
  onFinalize: () => void;
}

export function FinalizeMinutesDialog({
  open,
  onOpenChange,
  agendaCount,
  paragraphCount,
  voteCount,
  submitting,
  onFinalize,
}: FinalizeMinutesDialogProps) {
  const { t } = useTranslation('organization');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('finalizeMinutes')}</DialogTitle>
        </DialogHeader>
        <p className={cn(COLORS.text.secondary, 'text-sm')}>{t('finalizeConfirm')}</p>
        <p className={cn(COLORS.text.secondary, 'text-sm mt-2')}>
          {t('finalizeConfirmSummary', {
            agendaCount,
            paragraphCount,
            voteCount,
          })}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={onFinalize} disabled={submitting}>
            {submitting ? t('saving') : t('finalizeMinutes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
