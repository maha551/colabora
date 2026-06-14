import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { COLORS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';

export interface UnfinalizeMinutesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  onUnfinalize: () => void;
}

export function UnfinalizeMinutesDialog({
  open,
  onOpenChange,
  submitting,
  onUnfinalize,
}: UnfinalizeMinutesDialogProps) {
  const { t } = useTranslation('organization');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('unfinalizeMinutes', { defaultValue: 'Unfinalize minutes' })}</DialogTitle>
        </DialogHeader>
        <p className={cn(COLORS.text.secondary, 'text-sm')}>
          {t('unfinalizeConfirm', { defaultValue: 'Unfinalize so moderators can edit again?' })}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button variant="destructive" onClick={onUnfinalize} disabled={submitting}>
            {submitting ? t('saving') : t('unfinalizeMinutes', { defaultValue: 'Unfinalize minutes' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
