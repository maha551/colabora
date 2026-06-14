/**
 * Centralized date and time formatting utility with timezone support
 *
 * All date and time displays throughout the application should use these functions
 * to ensure consistent formatting and proper timezone handling.
 */

import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

/**
 * Parse a date string handling SQLite and ISO formats
 * SQLite format (YYYY-MM-DD HH:MM:SS) is treated as UTC
 * ISO format with timezone info is parsed as-is
 * ISO format without timezone is treated as UTC
 */
export function parseDate(dateString: string | Date | undefined | null): Date | null {
  if (!dateString) return null;

  if (dateString instanceof Date) {
    return dateString;
  }

  if (typeof dateString !== 'string') {
    return null;
  }

  // Handle ISO format with timezone info
  if (dateString.includes('T') || dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

  // Handle SQLite datetime format (YYYY-MM-DD HH:MM:SS) - treat as UTC
  if (dateString.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
    const date = new Date(dateString + 'Z');
    return isNaN(date.getTime()) ? null : date;
  }

  // Try parsing as-is
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

const DEFAULT_LOCALE = 'en-US';

function resolveLocale(locale?: string): string {
  if (!locale) return DEFAULT_LOCALE;
  if (locale.includes('-')) return locale;
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Format date only with timezone support
 */
export function formatDate(
  date: Date | string | undefined | null,
  timezone?: string,
  options?: Intl.DateTimeFormatOptions,
  locale: string = DEFAULT_LOCALE
): string {
  const dateObj = parseDate(date);
  if (!dateObj) return '';
  const loc = resolveLocale(locale);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  };
  try {
    if (timezone) {
      return new Intl.DateTimeFormat(loc, {
        ...defaultOptions,
        timeZone: timezone,
      }).format(dateObj);
    }
    return new Intl.DateTimeFormat(loc, defaultOptions).format(dateObj);
  } catch {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, defaultOptions).format(dateObj);
  }
}

/**
 * Format time only with timezone support
 */
export function formatTime(
  date: Date | string | undefined | null,
  timezone?: string,
  options?: Intl.DateTimeFormatOptions,
  locale: string = DEFAULT_LOCALE
): string {
  const dateObj = parseDate(date);
  if (!dateObj) return '';
  const loc = resolveLocale(locale);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  };
  try {
    if (timezone) {
      return new Intl.DateTimeFormat(loc, {
        ...defaultOptions,
        timeZone: timezone,
      }).format(dateObj);
    }
    return new Intl.DateTimeFormat(loc, defaultOptions).format(dateObj);
  } catch {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, defaultOptions).format(dateObj);
  }
}

/**
 * Format date and time with timezone support
 */
export function formatDateTime(
  date: Date | string | undefined | null,
  timezone?: string,
  options?: Intl.DateTimeFormatOptions,
  locale: string = DEFAULT_LOCALE
): string {
  const dateObj = parseDate(date);
  if (!dateObj) return '';
  const loc = resolveLocale(locale);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  };
  try {
    if (timezone) {
      return new Intl.DateTimeFormat(loc, {
        ...defaultOptions,
        timeZone: timezone,
      }).format(dateObj);
    }
    return new Intl.DateTimeFormat(loc, defaultOptions).format(dateObj);
  } catch {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, defaultOptions).format(dateObj);
  }
}

/**
 * Format relative time using Intl.RelativeTimeFormat
 */
export function formatRelativeTime(
  date: Date | string | undefined | null,
  timezone?: string,
  locale: string = DEFAULT_LOCALE
): string {
  const dateObj = parseDate(date);
  if (!dateObj) return '';
  const loc = resolveLocale(locale);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  try {
    const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
    if (seconds < 0) {
      const ahead = Math.abs(seconds);
      if (ahead < 60) return rtf.format(Math.ceil(ahead), 'second');
      if (ahead < 3600) return rtf.format(Math.ceil(ahead / 60), 'minute');
      if (ahead < 86400) return rtf.format(Math.ceil(ahead / 3600), 'hour');
      if (ahead < 604800) return rtf.format(Math.ceil(ahead / 86400), 'day');
    } else {
      if (seconds < 60) return rtf.format(-seconds, 'second');
      if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute');
      if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), 'hour');
      if (seconds < 604800) return rtf.format(-Math.floor(seconds / 86400), 'day');
    }
  } catch {
    if (seconds < 0) {
      const ahead = Math.abs(seconds);
      if (ahead < 60) return 'in a moment';
      if (ahead < 3600) return `in ${Math.ceil(ahead / 60)}m`;
      if (ahead < 86400) return `in ${Math.ceil(ahead / 3600)}h`;
      if (ahead < 604800) return `in ${Math.ceil(ahead / 86400)}d`;
    } else {
      if (seconds < 60) return 'just now';
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    }
  }

  return formatDate(dateObj, timezone, { month: 'short', day: 'numeric' }, locale);
}

/**
 * Get the browser's default timezone
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Return YYYY-MM-DD calendar date for an instant in the given timezone
 */
export function getDateKeyInTimezone(
  date: Date | string | undefined | null,
  timezone: string
): string {
  const dateObj = parseDate(date);
  if (!dateObj) return '';
  try {
    return formatInTimeZone(dateObj, timezone, 'yyyy-MM-dd');
  } catch {
    return formatInTimeZone(dateObj, 'UTC', 'yyyy-MM-dd');
  }
}

/**
 * Convert UTC ISO instant to datetime-local input value (yyyy-MM-ddTHH:mm) in timezone
 */
export function toDateTimeLocalValue(
  isoOrDate: Date | string | undefined | null,
  timezone: string
): string {
  const dateObj = parseDate(isoOrDate);
  if (!dateObj) return '';
  try {
    return formatInTimeZone(dateObj, timezone, "yyyy-MM-dd'T'HH:mm");
  } catch {
    return formatInTimeZone(dateObj, 'UTC', "yyyy-MM-dd'T'HH:mm");
  }
}

/**
 * Parse datetime-local value as wall-clock time in timezone → UTC Date
 */
export function fromDateTimeLocalValue(localValue: string, timezone: string): Date | null {
  if (!localValue?.trim()) return null;
  const match = localValue.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  try {
    return fromZonedTime(
      new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0),
      timezone
    );
  } catch {
    return null;
  }
}

/**
 * Convert UTC ISO instant to date-only input value (yyyy-MM-dd) in timezone
 */
export function toDateInputValue(
  isoOrDate: Date | string | undefined | null,
  timezone: string
): string {
  const dateObj = parseDate(isoOrDate);
  if (!dateObj) return '';
  try {
    return formatInTimeZone(dateObj, timezone, 'yyyy-MM-dd');
  } catch {
    return formatInTimeZone(dateObj, 'UTC', 'yyyy-MM-dd');
  }
}

/**
 * Parse date-only value as start or end of day in timezone → UTC Date
 */
export function fromDateInputValue(
  dateStr: string,
  timezone: string,
  endOfDay = false
): Date | null {
  if (!dateStr?.trim()) return null;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d] = match;
  try {
    return fromZonedTime(
      new Date(
        Number(y),
        Number(mo) - 1,
        Number(d),
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0
      ),
      timezone
    );
  } catch {
    return null;
  }
}

export interface GenerateSlotsOptions {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  stepMinutes: number;
  timezone: string;
}

/**
 * Generate scheduling poll slots (When2Meet-style) in a given timezone.
 * Returns UTC ISO strings for startAt/endAt.
 */
export function generateSlotsInTimezone(options: GenerateSlotsOptions): Array<{ startAt: string; endAt: string }> {
  const { startDate, endDate, startTime, endTime, stepMinutes, timezone } = options;
  const slots: Array<{ startAt: string; endAt: string }> = [];

  const rangeStart = fromDateInputValue(startDate, timezone, false);
  const rangeEnd = fromDateInputValue(endDate, timezone, true);
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return slots;

  const [earlierH, earlierM] = startTime.split(':').map(Number);
  const [laterH, laterM] = endTime.split(':').map(Number);
  const startMinutes = earlierH * 60 + earlierM;
  const endMinutes = laterH * 60 + laterM;
  if (stepMinutes <= 0 || startMinutes >= endMinutes) return slots;

  let cursor = toZonedTime(rangeStart, timezone);
  const endZoned = toZonedTime(rangeEnd, timezone);
  const endDateKey = formatInTimeZone(rangeEnd, timezone, 'yyyy-MM-dd');

  while (true) {
    const dateKey = formatInTimeZone(cursor, timezone, 'yyyy-MM-dd');
    if (dateKey > endDateKey) break;

    for (let m = startMinutes; m < endMinutes; m += stepMinutes) {
      const fromH = Math.floor(m / 60);
      const fromM = m % 60;
      const toM = m + stepMinutes;
      const toH = Math.floor(toM / 60);
      const toM2 = toM % 60;

      const slotStartLocal = fromZonedTime(
        new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate(),
          fromH,
          fromM,
          0,
          0
        ),
        timezone
      );
      const slotEndLocal = fromZonedTime(
        new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate(),
          toH,
          toM2,
          0,
          0
        ),
        timezone
      );

      if (slotStartLocal >= rangeStart && slotEndLocal <= rangeEnd) {
        slots.push({
          startAt: slotStartLocal.toISOString(),
          endAt: slotEndLocal.toISOString(),
        });
      }
    }

    cursor = addDays(cursor, 1);
    if (formatInTimeZone(cursor, timezone, 'yyyy-MM-dd') > endDateKey) break;
  }

  return slots;
}

/**
 * Get calendar month date range (yyyy-MM-dd) in a given timezone for API queries
 */
export function getMonthDateRangeInTimezone(
  month: Date,
  timezone: string
): { from: string; to: string } {
  try {
    const year = formatInTimeZone(month, timezone, 'yyyy');
    const monthNum = formatInTimeZone(month, timezone, 'MM');
    const daysInMonth = new Date(Number(year), Number(monthNum), 0).getDate();
    return {
      from: `${year}-${monthNum}-01`,
      to: `${year}-${monthNum}-${String(daysInMonth).padStart(2, '0')}`,
    };
  } catch {
    const year = month.getUTCFullYear();
    const monthIndex = month.getUTCMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const monthNum = String(monthIndex + 1).padStart(2, '0');
    return {
      from: `${year}-${monthNum}-01`,
      to: `${year}-${monthNum}-${String(daysInMonth).padStart(2, '0')}`,
    };
  }
}

/**
 * Human-readable timezone label for UI banners
 */
export function formatTimezoneLabel(timezone: string, locale: string = DEFAULT_LOCALE): string {
  const loc = resolveLocale(locale);
  try {
    const formatter = new Intl.DateTimeFormat(loc, {
      timeZone: timezone,
      timeZoneName: 'longGeneric',
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart?.value) return tzPart.value;
  } catch {
    // fall through
  }

  const fallback = TIMEZONE_LABELS[timezone];
  if (fallback) return fallback;
  return timezone.replace(/_/g, ' ');
}

/** Static labels for UserProfile picker (English fallback) */
export const TIMEZONE_LABELS: Record<string, string> = {
  'Africa/Cairo': 'Cairo',
  'Africa/Johannesburg': 'Johannesburg',
  'Africa/Lagos': 'Lagos',
  'America/Anchorage': 'Alaska Time',
  'America/Buenos_Aires': 'Buenos Aires',
  'Asia/Bangkok': 'Bangkok',
  'Australia/Brisbane': 'Brisbane',
  'Europe/Brussels': 'Brussels',
  'Europe/Budapest': 'Budapest',
  'America/Chicago': 'Central Time (US & Canada)',
  'Europe/Copenhagen': 'Copenhagen',
  'Asia/Dhaka': 'Dhaka',
  'Asia/Dubai': 'Dubai',
  'America/New_York': 'Eastern Time (US & Canada)',
  'Europe/Athens': 'Athens',
  'Pacific/Honolulu': 'Hawaii Time',
  'Europe/Helsinki': 'Helsinki',
  'Asia/Hong_Kong': 'Hong Kong',
  'Europe/Istanbul': 'Istanbul',
  'Asia/Jakarta': 'Jakarta',
  'Asia/Karachi': 'Karachi',
  'Asia/Kolkata': 'Kolkata',
  'Europe/London': 'London',
  'Asia/Manila': 'Manila',
  'Australia/Melbourne': 'Melbourne',
  'America/Mexico_City': 'Mexico City',
  'Europe/Moscow': 'Moscow',
  'America/Denver': 'Mountain Time (US & Canada)',
  'Europe/Oslo': 'Oslo',
  'America/Los_Angeles': 'Pacific Time (US & Canada)',
  'Europe/Paris': 'Paris',
  'Australia/Perth': 'Perth',
  'Europe/Prague': 'Prague',
  'America/Sao_Paulo': 'São Paulo',
  'Asia/Seoul': 'Seoul',
  'Asia/Shanghai': 'Shanghai',
  'Asia/Singapore': 'Singapore',
  'Europe/Stockholm': 'Stockholm',
  'Australia/Sydney': 'Sydney',
  'Asia/Tokyo': 'Tokyo',
  'America/Toronto': 'Toronto',
  UTC: 'UTC (Coordinated Universal Time)',
  'America/Vancouver': 'Vancouver',
  'Europe/Vienna': 'Vienna',
  'Europe/Warsaw': 'Warsaw',
  'Europe/Zurich': 'Zurich',
};

export const TIMEZONE_OPTIONS = Object.entries(TIMEZONE_LABELS).map(([value, label]) => ({
  value,
  label,
}));
