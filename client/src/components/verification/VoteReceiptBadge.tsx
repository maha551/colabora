import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { toast } from 'sonner';
import { checkReceiptOnOfficialList } from '../../lib/verification/voteReceipt';
import type { VoteReceiptPayload } from '../../lib/verification/voteReceipt';

interface VoteReceiptBadgeProps {
  receipt: VoteReceiptPayload;
  compact?: boolean;
}

export function VoteReceiptBadge({ receipt, compact = false }: VoteReceiptBadgeProps) {
  const { t } = useTranslation('organization');
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<boolean | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(receipt.receiptId);
      toast.success(t('voteReceipt.copied'));
    } catch {
      toast.error(t('voteReceipt.copyFailed'));
    }
  };

  const handleVerify = async () => {
    setChecking(true);
    setFound(null);
    try {
      const ok = await checkReceiptOnOfficialList(
        receipt.voteType,
        receipt.contestId,
        receipt.receiptId
      );
      setFound(ok);
    } catch {
      toast.error(t('voteReceipt.verifyFailed'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={`rounded-md border bg-muted/30 p-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground">{t('voteReceipt.yourReceipt')}</span>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
            {t('voteReceipt.copy')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={checking}
            onClick={handleVerify}
          >
            {checking ? (
              <Icon name="Loader2" className="h-3 w-3 animate-spin" />
            ) : (
              t('voteReceipt.verifyMine')
            )}
          </Button>
        </div>
      </div>
      {!compact && (
        <p className="mt-1 font-mono text-xs break-all text-foreground/80">{receipt.receiptId}</p>
      )}
      {found === true && (
        <p className="mt-2 text-xs text-green-700 dark:text-green-400">{t('voteReceipt.foundOnList')}</p>
      )}
      {found === false && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t('voteReceipt.notFoundYet')}</p>
      )}
    </div>
  );
}
