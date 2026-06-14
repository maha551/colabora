import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/useAuthStore';
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatRelativeTime,
  getBrowserTimezone,
  parseDate,
  getDateKeyInTimezone,
  toDateTimeLocalValue,
  fromDateTimeLocalValue,
  toDateInputValue,
  fromDateInputValue,
  generateSlotsInTimezone,
  getMonthDateRangeInTimezone,
  formatTimezoneLabel,
  type GenerateSlotsOptions,
} from '../utils/dateFormatting';

/**
 * Hook to access user's timezone preference and timezone-aware date formatting functions.
 * Uses current i18n language for locale-aware date/time formatting.
 */
export function useTimezone() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const { i18n } = useTranslation();
  const locale = i18n.language || 'en';

  const timezone = useMemo(() => {
    if (currentUser?.preferences?.timezone) {
      return currentUser.preferences.timezone;
    }
    return getBrowserTimezone();
  }, [currentUser?.preferences?.timezone]);

  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const timezoneLabel = useMemo(
    () => formatTimezoneLabel(timezone, locale),
    [timezone, locale]
  );

  const timezoneMismatch = timezone !== browserTimezone;

  const formatters = useMemo(() => {
    return {
      formatDate: (date: Date | string | undefined | null, options?: Intl.DateTimeFormatOptions) =>
        formatDate(date, timezone, options, locale),
      formatTime: (date: Date | string | undefined | null, options?: Intl.DateTimeFormatOptions) =>
        formatTime(date, timezone, options, locale),
      formatDateTime: (date: Date | string | undefined | null, options?: Intl.DateTimeFormatOptions) =>
        formatDateTime(date, timezone, options, locale),
      formatRelativeTime: (date: Date | string | undefined | null) =>
        formatRelativeTime(date, timezone, locale),
      parseDate: (date: Date | string | undefined | null) => parseDate(date),
      getDateKey: (date: Date | string | undefined | null) => getDateKeyInTimezone(date, timezone),
      toDateTimeLocalValue: (isoOrDate: Date | string | undefined | null) =>
        toDateTimeLocalValue(isoOrDate, timezone),
      fromDateTimeLocalValue: (localValue: string) => fromDateTimeLocalValue(localValue, timezone),
      toDateInputValue: (isoOrDate: Date | string | undefined | null) =>
        toDateInputValue(isoOrDate, timezone),
      fromDateInputValue: (dateStr: string, endOfDay?: boolean) =>
        fromDateInputValue(dateStr, timezone, endOfDay),
      generateSlots: (opts: Omit<GenerateSlotsOptions, 'timezone'>) =>
        generateSlotsInTimezone({ ...opts, timezone }),
      getMonthRange: (month: Date) => getMonthDateRangeInTimezone(month, timezone),
    };
  }, [timezone, locale]);

  return {
    timezone,
    browserTimezone,
    timezoneLabel,
    timezoneMismatch,
    ...formatters,
  };
}
