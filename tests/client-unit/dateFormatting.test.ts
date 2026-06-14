import {
  parseDate,
  formatRelativeTime,
  getDateKeyInTimezone,
  toDateTimeLocalValue,
  fromDateTimeLocalValue,
  generateSlotsInTimezone,
  getMonthDateRangeInTimezone,
} from '../../client/src/utils/dateFormatting';

describe('parseDate', () => {
  it('parses ISO with Z as UTC', () => {
    const d = parseDate('2026-01-15T20:00:00.000Z');
    expect(d?.toISOString()).toBe('2026-01-15T20:00:00.000Z');
  });

  it('parses SQLite datetime as UTC', () => {
    const d = parseDate('2026-01-15 20:00:00');
    expect(d?.toISOString()).toBe('2026-01-15T20:00:00.000Z');
  });

  it('returns null for invalid input', () => {
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe('getDateKeyInTimezone', () => {
  it('maps UTC instant to previous calendar day in US Pacific', () => {
    expect(getDateKeyInTimezone('2026-06-07T02:00:00.000Z', 'America/Los_Angeles')).toBe(
      '2026-06-06'
    );
  });

  it('keeps same UTC calendar day in UTC', () => {
    expect(getDateKeyInTimezone('2026-06-07T02:00:00.000Z', 'UTC')).toBe('2026-06-07');
  });
});

describe('datetime-local round-trip', () => {
  it('converts UTC to Eastern wall clock and back', () => {
    const iso = '2026-01-15T20:00:00.000Z';
    const local = toDateTimeLocalValue(iso, 'America/New_York');
    expect(local).toBe('2026-01-15T15:00');
    const back = fromDateTimeLocalValue(local, 'America/New_York');
    expect(back?.toISOString()).toBe(iso);
  });

  it('round-trips Berlin timezone', () => {
    const iso = '2026-06-06T10:30:00.000Z';
    const local = toDateTimeLocalValue(iso, 'Europe/Berlin');
    const back = fromDateTimeLocalValue(local, 'Europe/Berlin');
    expect(back?.toISOString()).toBe(iso);
  });
});

describe('generateSlotsInTimezone', () => {
  it('generates hourly slots for a single day', () => {
    const slots = generateSlotsInTimezone({
      startDate: '2026-06-09',
      endDate: '2026-06-09',
      startTime: '09:00',
      endTime: '12:00',
      stepMinutes: 60,
      timezone: 'America/New_York',
    });
    expect(slots).toHaveLength(3);
    expect(slots[0].startAt).toBeTruthy();
    expect(new Date(slots[0].endAt).getTime()).toBeGreaterThan(new Date(slots[0].startAt).getTime());
  });
});

describe('formatRelativeTime', () => {
  const fixedNow = new Date('2026-06-13T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats future dates as "in X" rather than "now"', () => {
    const inTwoHours = '2026-06-13T14:00:00.000Z';
    const result = formatRelativeTime(inTwoHours);
    expect(result).not.toBe('now');
    expect(result).toMatch(/in 2 hours?/i);
  });

  it('formats past dates as "X ago"', () => {
    const twoHoursAgo = '2026-06-13T10:00:00.000Z';
    const result = formatRelativeTime(twoHoursAgo);
    expect(result).toMatch(/2 hours? ago/i);
  });

  it('formats near-future dates in minutes', () => {
    const inThirtyMinutes = '2026-06-13T12:30:00.000Z';
    const result = formatRelativeTime(inThirtyMinutes);
    expect(result).not.toBe('now');
    expect(result).toMatch(/in 30 minutes?/i);
  });
});

describe('getMonthDateRangeInTimezone', () => {
  it('returns first and last day of month in timezone', () => {
    const month = new Date('2026-06-15T12:00:00.000Z');
    const range = getMonthDateRangeInTimezone(month, 'UTC');
    expect(range.from).toBe('2026-06-01');
    expect(range.to).toBe('2026-06-30');
  });
});
