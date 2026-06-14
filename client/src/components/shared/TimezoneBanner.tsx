import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTimezone } from '../../hooks/useTimezone';
import { cn } from '../ui/utils';
import { COLORS } from '../../lib/designSystem';

interface TimezoneBannerProps {
  className?: string;
}

export function TimezoneBanner({ className }: TimezoneBannerProps) {
  const { t } = useTranslation('common');
  const { timezoneLabel, timezoneMismatch } = useTimezone();

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        COLORS.text.secondary,
        className
      )}
      role="note"
    >
      <p>
        {t('timezone.displayBanner', {
          timezone: timezoneLabel,
          defaultValue: 'Times shown in {{timezone}}',
        })}
      </p>
      {timezoneMismatch && (
        <p className={cn('mt-1 text-xs', COLORS.text.secondary)}>
          {t('timezone.browserMismatchWarning', {
            defaultValue:
              'Your profile timezone differs from your browser. Inputs use your profile timezone.',
          })}
        </p>
      )}
    </div>
  );
}
