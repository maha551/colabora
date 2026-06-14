import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { Icon } from '../ui/Icon';
import { Organization } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';

interface BootstrapCompletionDialogProps {
  organization: Organization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BootstrapCompletionDialog({
  organization,
  open,
  onOpenChange,
  onSuccess
}: BootstrapCompletionDialogProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const handleComplete = async () => {
    if (!confirm) {
      toast.error(t('confirmCompleteBootstrap'));
      return;
    }

    setLoading(true);
    try {
      await governanceApi.completeBootstrap(organization.id, true);
      toast.success(t('bootstrapCompleted'));
      onSuccess?.();
      onOpenChange(false);
    } catch (error: unknown) {
      logger.error('Failed to complete bootstrap:', error);
      const errorMessage = error instanceof Error ? error.message : t('bootstrapCompletionDialog.failedToComplete');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('bootstrapCompletionDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('bootstrapCompletionDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Icon name="AlertTriangle" className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('bootstrapCompletionDialog.whatThisMeans')}</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>{t('bootstrapCompletionDialog.disableBootstrap')}</li>
                <li>{t('bootstrapCompletionDialog.lockRules')}</li>
                <li>{t('bootstrapCompletionDialog.normalRules')}</li>
                <li>{t('bootstrapCompletionDialog.cannotUndo')}</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="confirm-bootstrap"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="confirm-bootstrap" className="text-sm">
              {t('bootstrapCompletionDialog.confirmLabel')}
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {tCommon('buttons.cancel')}
            </Button>
            <Button
              onClick={handleComplete}
              disabled={!confirm || loading}
            >
              {loading ? t('bootstrapCompletionDialog.completing') : t('bootstrapCompletionDialog.complete')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
