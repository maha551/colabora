import React, { useState } from 'react';
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
import { Icon } from '../ui/Icon';
import { toast } from 'sonner';
import type { VoteReceiptPayload } from '../../lib/verification/voteReceipt';

interface VoteReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: VoteReceiptPayload | null;
  savedOnServer?: boolean;
}

export function VoteReceiptDialog({
  open,
  onOpenChange,
  receipt,
  savedOnServer = true,
}: VoteReceiptDialogProps) {
  const { t } = useTranslation('organization');
  const [copied, setCopied] = useState(false);

  if (!receipt) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(receipt.receiptId);
      setCopied(true);
      toast.success(t('voteReceipt.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('voteReceipt.copyFailed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="CheckCircle" className="h-5 w-5 text-green-600" />
            {t('voteReceipt.title')}
          </DialogTitle>
          <DialogDescription>{t('voteReceipt.description')}</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs break-all">
          {receipt.receiptId}
        </div>
        <p className="text-sm text-muted-foreground">{t('voteReceipt.keepSafe')}</p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {savedOnServer && (
            <span className="inline-flex items-center gap-1">
              <Icon name="Save" className="h-3 w-3" />
              {t('voteReceipt.savedOnAccount')}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Icon name="Save" className="h-3 w-3" />
            {t('voteReceipt.savedOnDevice')}
          </span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCopy}>
            {copied ? t('voteReceipt.copied') : t('voteReceipt.copy')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('voteReceipt.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
