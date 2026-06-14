import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { cn } from '../ui/utils';

interface OverviewPinButtonProps {
  eventId: string;
  pinnedEventId?: string | null;
  canPin: boolean;
  onPin: (eventId: string) => Promise<void>;
  onUnpin: () => Promise<void>;
  size?: 'sm' | 'icon';
  className?: string;
}

export function OverviewPinButton({
  eventId,
  pinnedEventId,
  canPin,
  onPin,
  onUnpin,
  size = 'sm',
  className,
}: OverviewPinButtonProps) {
  const { t } = useTranslation('organization');
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canPin) return null;

  const isPinned = pinnedEventId === eventId;
  const hasOtherPin = !!pinnedEventId && pinnedEventId !== eventId;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;

    if (isPinned) {
      setBusy(true);
      try {
        await onUnpin();
      } finally {
        setBusy(false);
      }
      return;
    }

    if (hasOtherPin) {
      setReplaceOpen(true);
      return;
    }

    setBusy(true);
    try {
      await onPin(eventId);
    } finally {
      setBusy(false);
    }
  };

  const confirmReplace = async () => {
    setReplaceOpen(false);
    setBusy(true);
    try {
      await onPin(eventId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={size === 'icon' ? 'icon' : 'sm'}
        className={cn('shrink-0', size === 'icon' ? 'h-7 w-7' : 'h-7 px-2', className)}
        onClick={handleClick}
        disabled={busy}
        aria-label={isPinned ? t('dashboardUnpinFromOverview') : t('dashboardPinToOverview')}
        title={isPinned ? t('dashboardUnpinFromOverview') : t('dashboardPinToOverview')}
      >
        <Icon
          name="Pin"
          className={cn('h-3.5 w-3.5', isPinned && 'text-primary fill-primary')}
        />
      </Button>

      <AlertDialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dashboardReplacePinTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('dashboardReplacePinDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReplace}>{t('dashboardPinToOverview')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
