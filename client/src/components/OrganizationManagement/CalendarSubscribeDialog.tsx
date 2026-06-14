import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calendarApi } from '../../lib/api/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { SPACING } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { toast } from 'sonner';

export interface CalendarSubscribeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string;
  organizationName?: string;
}

export function CalendarSubscribeDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
}: CalendarSubscribeDialogProps) {
  const { t } = useTranslation('organization');
  const [url, setUrl] = useState('');
  const [webcalUrl, setWebcalUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSubscribeUrl = useCallback(async () => {
    setLoading(true);
    try {
      const res = await calendarApi.getCalendarSubscribeUrl(organizationId);
      setUrl(res.url);
      setWebcalUrl(calendarApi.toWebcalUrl(res.url));
      setExpiresAt(res.expiresAt ?? null);
    } catch {
      toast.error(t('calendarError'));
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onOpenChange, t]);

  useEffect(() => {
    if (open) {
      loadSubscribeUrl();
    } else {
      setUrl('');
      setWebcalUrl('');
      setExpiresAt(null);
    }
  }, [open, loadSubscribeUrl]);

  const copyToClipboard = async (text: string, successKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t(successKey));
    } catch {
      toast.error(t('calendarError'));
    }
  };

  const title = organizationName
    ? t('calendarSubscribeDialogTitleOrg', { org: organizationName })
    : t('calendarSubscribeDialogTitleAll');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('calendarSubscribeDialogDescription')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('calendarLoading')}</p>
        ) : (
          <div className={cn(SPACING.content.gap, 'space-y-4')}>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('calendarSubscribeUrlLabel')}
              </p>
              <div className="flex gap-2">
                <code className="flex-1 truncate rounded border bg-muted px-2 py-1.5 text-xs">
                  {url}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(url, 'calendarSubscribeCopied')}
                >
                  <Icon name="Copy" className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('calendarSubscribeWebcalLabel')}
              </p>
              <div className="flex gap-2">
                <code className="flex-1 truncate rounded border bg-muted px-2 py-1.5 text-xs">
                  {webcalUrl}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(webcalUrl, 'calendarSubscribeWebcalCopied')}
                >
                  <Icon name="Copy" className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{t('calendarSubscribeHelpGoogle')}</p>
              <p>{t('calendarSubscribeHelpApple')}</p>
              {expiresAt && (
                <p>{t('calendarSubscribeExpires', { date: new Date(expiresAt).toLocaleDateString() })}</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
