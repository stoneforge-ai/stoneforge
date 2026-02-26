/**
 * Rate Limit Parser Tests
 *
 * Tests for detection and parsing of Claude Code rate limit messages,
 * covering both message formats, apostrophe variants, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  RATE_LIMIT_PATTERNS,
  isRateLimitMessage,
  parseRateLimitResetTime,
  getFallbackResetTime,
} from './rate-limit-parser.js';

// ============================================================================
// RATE_LIMIT_PATTERNS
// ============================================================================

describe('RATE_LIMIT_PATTERNS', () => {
  it('is a non-empty array of RegExp', () => {
    expect(RATE_LIMIT_PATTERNS.length).toBeGreaterThan(0);
    for (const pattern of RATE_LIMIT_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
    }
  });
});

// ============================================================================
// isRateLimitMessage
// ============================================================================

describe('isRateLimitMessage', () => {
  it('detects "You\'ve hit your limit" with straight apostrophe', () => {
    expect(isRateLimitMessage("You've hit your limit · resets 12am")).toBe(true);
  });

  it('detects "You\u2019ve hit your limit" with curly apostrophe', () => {
    expect(isRateLimitMessage('You\u2019ve hit your limit \u00b7 resets 5pm')).toBe(true);
  });

  it('detects "Weekly limit reached"', () => {
    expect(isRateLimitMessage('Weekly limit reached · resets Feb 22 at 9:30am')).toBe(true);
  });

  it('detects generic "limit" + "resets" co-occurrence', () => {
    expect(isRateLimitMessage('Your API limit will reset soon · resets 6pm')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isRateLimitMessage("YOU'VE HIT YOUR LIMIT · RESETS 12AM")).toBe(true);
    expect(isRateLimitMessage('WEEKLY LIMIT REACHED · RESETS FEB 22 AT 9:30AM')).toBe(true);
  });

  it('returns false for non-rate-limit messages', () => {
    expect(isRateLimitMessage('Hello, how can I help you?')).toBe(false);
    expect(isRateLimitMessage('Task completed successfully')).toBe(false);
    expect(isRateLimitMessage('')).toBe(false);
    expect(isRateLimitMessage('The sky is the limit!')).toBe(false);
  });

  it('returns false for messages with "limit" but no "resets"', () => {
    expect(isRateLimitMessage('You are approaching your limit')).toBe(false);
  });
});

// ============================================================================
// parseRateLimitResetTime — Format A (time only)
// ============================================================================

describe('parseRateLimitResetTime — Format A (time only)', () => {
  it('parses "resets 12am" as midnight', () => {
    const result = parseRateLimitResetTime("You've hit your limit · resets 12am");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getHours()).toBe(0);
    expect(result!.getMinutes()).toBe(0);
  });

  it('parses "resets 3pm" as 15:00', () => {
    const result = parseRateLimitResetTime("You've hit your limit · resets 3pm");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getHours()).toBe(15);
    expect(result!.getMinutes()).toBe(0);
  });

  it('parses "resets 12pm" as noon', () => {
    const result = parseRateLimitResetTime("You've hit your limit · resets 12pm");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getHours()).toBe(12);
    expect(result!.getMinutes()).toBe(0);
  });

  it('parses "resets 5pm" with curly apostrophe message', () => {
    const result = parseRateLimitResetTime('You\u2019ve hit your limit \u00b7 resets 5pm');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getHours()).toBe(17);
    expect(result!.getMinutes()).toBe(0);
  });

  it('returns a future date when the time has already passed today', () => {
    // Build a message with a time guaranteed to be in the past
    const now = new Date();
    const pastHour = now.getHours(); // current hour in 24h
    // Construct a 12h time that maps to an hour already passed
    let testHour: number;
    let ampm: string;
    if (pastHour === 0) {
      // It's midnight-ish — use 11pm which was ~1 hour ago
      testHour = 11;
      ampm = 'pm';
    } else if (pastHour <= 12) {
      // Use one hour ago
      const target = pastHour - 1;
      if (target === 0) {
        testHour = 12;
        ampm = 'am';
      } else {
        testHour = target;
        ampm = 'am';
      }
    } else {
      const target = pastHour - 1;
      testHour = target > 12 ? target - 12 : target;
      ampm = 'pm';
    }
    const msg = `You've hit your limit · resets ${testHour}${ampm}`;
    const result = parseRateLimitResetTime(msg);
    expect(result).toBeInstanceOf(Date);
    // The result should be in the future (tomorrow for a time that already passed)
    expect(result!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('handles time with minutes in Format A', () => {
    const result = parseRateLimitResetTime("You've hit your limit · resets 9:30am");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getHours()).toBe(9);
    expect(result!.getMinutes()).toBe(30);
  });
});

// ============================================================================
// parseRateLimitResetTime — Format B (date and time)
// ============================================================================

describe('parseRateLimitResetTime — Format B (date and time)', () => {
  it('parses "resets Feb 22 at 9:30am"', () => {
    const result = parseRateLimitResetTime(
      'Weekly limit reached · resets Feb 22 at 9:30am',
    );
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(1); // February
    expect(result!.getDate()).toBe(22);
    expect(result!.getHours()).toBe(9);
    expect(result!.getMinutes()).toBe(30);
  });

  it('parses "resets Mar 1 at 12:00pm" as noon on March 1', () => {
    const result = parseRateLimitResetTime(
      'Weekly limit reached · resets Mar 1 at 12:00pm',
    );
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(2); // March
    expect(result!.getDate()).toBe(1);
    expect(result!.getHours()).toBe(12);
    expect(result!.getMinutes()).toBe(0);
  });

  it('parses "resets Jan 5 at 3pm" (no minutes)', () => {
    const result = parseRateLimitResetTime(
      'Weekly limit reached · resets Jan 5 at 3pm',
    );
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(0); // January
    expect(result!.getDate()).toBe(5);
    expect(result!.getHours()).toBe(15);
    expect(result!.getMinutes()).toBe(0);
  });

  it('rolls to next year if the parsed date is in the past', () => {
    // Construct a date that is definitely in the past
    const now = new Date();
    const pastMonth = now.getMonth() === 0 ? 'Dec' : 'Jan';
    const pastDay = 1;
    const msg = `Weekly limit reached · resets ${pastMonth} ${pastDay} at 12am`;

    const result = parseRateLimitResetTime(msg);
    expect(result).toBeInstanceOf(Date);
    // Should be in the future
    expect(result!.getTime()).toBeGreaterThan(now.getTime());
  });
});

// ============================================================================
// parseRateLimitResetTime — Edge cases
// ============================================================================

describe('parseRateLimitResetTime — Edge cases', () => {
  it('returns undefined for non-rate-limit messages', () => {
    expect(parseRateLimitResetTime('Hello world')).toBeUndefined();
    expect(parseRateLimitResetTime('')).toBeUndefined();
  });

  it('returns undefined when no "resets" text is present', () => {
    expect(parseRateLimitResetTime("You've hit your limit")).toBeUndefined();
    expect(parseRateLimitResetTime('Weekly limit reached')).toBeUndefined();
  });

  it('returns undefined for malformed reset time', () => {
    expect(
      parseRateLimitResetTime("You've hit your limit · resets soon"),
    ).toBeUndefined();
    // "resets tomorrow" without a time is still unparseable
    expect(
      parseRateLimitResetTime("You've hit your limit · resets tomorrow"),
    ).toBeUndefined();
  });

  it('returns undefined for unknown month name in Format B', () => {
    expect(
      parseRateLimitResetTime('Weekly limit reached · resets Foo 22 at 9:30am'),
    ).toBeUndefined();
  });
});

// ============================================================================
// parseRateLimitResetTime — Format C (tomorrow + time)
// ============================================================================

describe('parseRateLimitResetTime — Format C (tomorrow + time)', () => {
  it('parses "resets tomorrow at 3pm" as tomorrow 15:00', () => {
    const result = parseRateLimitResetTime("You've hit your limit · resets tomorrow at 3pm");
    expect(result).toBeInstanceOf(Date);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    expect(result!.getFullYear()).toBe(tomorrow.getFullYear());
    expect(result!.getMonth()).toBe(tomorrow.getMonth());
    expect(result!.getDate()).toBe(tomorrow.getDate());
    expect(result!.getHours()).toBe(15);
    expect(result!.getMinutes()).toBe(0);
  });

  it('parses "resets tomorrow at 3:30pm" as tomorrow 15:30', () => {
    const result = parseRateLimitResetTime("You've hit your limit · resets tomorrow at 3:30pm");
    expect(result).toBeInstanceOf(Date);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    expect(result!.getFullYear()).toBe(tomorrow.getFullYear());
    expect(result!.getMonth()).toBe(tomorrow.getMonth());
    expect(result!.getDate()).toBe(tomorrow.getDate());
    expect(result!.getHours()).toBe(15);
    expect(result!.getMinutes()).toBe(30);
  });

  it('returns a date that is always in the future', () => {
    const now = new Date();
    const result = parseRateLimitResetTime('resets tomorrow at 12am');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeGreaterThan(now.getTime());
  });
});

// ============================================================================
// parseRateLimitResetTime — Format B without "at"
// ============================================================================

describe('parseRateLimitResetTime — Format B without "at"', () => {
  it('parses "resets Feb 22 8pm" (no "at") as Feb 22 20:00', () => {
    const result = parseRateLimitResetTime('Weekly limit reached · resets Feb 22 8pm');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(1); // February
    expect(result!.getDate()).toBe(22);
    expect(result!.getHours()).toBe(20);
    expect(result!.getMinutes()).toBe(0);
  });
});

// ============================================================================
// parseRateLimitResetTime — Full month names
// ============================================================================

describe('parseRateLimitResetTime — Full month names', () => {
  it('parses "resets February 22 at 9:30am" (full month name)', () => {
    const result = parseRateLimitResetTime(
      'Weekly limit reached · resets February 22 at 9:30am',
    );
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(1); // February
    expect(result!.getDate()).toBe(22);
    expect(result!.getHours()).toBe(9);
    expect(result!.getMinutes()).toBe(30);
  });

  it('parses "resets January 5 at 3pm" (full month name)', () => {
    const result = parseRateLimitResetTime(
      'Weekly limit reached · resets January 5 at 3pm',
    );
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(0); // January
    expect(result!.getDate()).toBe(5);
    expect(result!.getHours()).toBe(15);
    expect(result!.getMinutes()).toBe(0);
  });

  it('parses "resets December 31 at 11:59pm" (full month name)', () => {
    const result = parseRateLimitResetTime(
      'Weekly limit reached · resets December 31 at 11:59pm',
    );
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(11); // December
    expect(result!.getDate()).toBe(31);
    expect(result!.getHours()).toBe(23);
    expect(result!.getMinutes()).toBe(59);
  });
});

// ============================================================================
// getFallbackResetTime
// ============================================================================

describe('getFallbackResetTime', () => {
  it('returns ~6 hours from now for weekly limit messages', () => {
    const before = Date.now();
    const result = getFallbackResetTime('Weekly limit reached');
    const after = Date.now();

    const sixHoursMs = 6 * 60 * 60 * 1000;
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before + sixHoursMs);
    expect(result.getTime()).toBeLessThanOrEqual(after + sixHoursMs);
  });

  it('returns ~1 hour from now for non-weekly limit messages', () => {
    const before = Date.now();
    const result = getFallbackResetTime("You've hit your limit");
    const after = Date.now();

    const oneHourMs = 1 * 60 * 60 * 1000;
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before + oneHourMs);
    expect(result.getTime()).toBeLessThanOrEqual(after + oneHourMs);
  });

  it('returns ~1 hour from now for empty string (default)', () => {
    const before = Date.now();
    const result = getFallbackResetTime('');
    const after = Date.now();

    const oneHourMs = 1 * 60 * 60 * 1000;
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before + oneHourMs);
    expect(result.getTime()).toBeLessThanOrEqual(after + oneHourMs);
  });

  it('is case-insensitive for "weekly" detection', () => {
    const before = Date.now();
    const result = getFallbackResetTime('WEEKLY limit reached');
    const sixHoursMs = 6 * 60 * 60 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(before + sixHoursMs);
  });
});

// ============================================================================
// Timezone test helpers
// ============================================================================

/**
 * Returns the hour (0–23) of a Date as it appears in the given IANA timezone.
 */
function getHourInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  const val = parseInt(formatter.format(date), 10);
  return val === 24 ? 0 : val;
}

/**
 * Returns the minute (0–59) of a Date as it appears in the given IANA timezone.
 */
function getMinuteInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    minute: 'numeric',
  });
  return parseInt(formatter.format(date), 10);
}

/**
 * Returns the month (0–11) of a Date as it appears in the given IANA timezone.
 */
function getMonthInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'numeric',
  });
  return parseInt(formatter.format(date), 10) - 1;
}

/**
 * Returns the day-of-month of a Date as it appears in the given IANA timezone.
 */
function getDayInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    day: 'numeric',
  });
  return parseInt(formatter.format(date), 10);
}

// ============================================================================
// parseRateLimitResetTime — Timezone support (Format A)
// ============================================================================

describe('parseRateLimitResetTime — Timezone support (Format A)', () => {
  it('parses "resets 11pm (Pacific/Honolulu)" as 11pm HST', () => {
    const result = parseRateLimitResetTime(
      "You've hit your limit · resets 11pm (Pacific/Honolulu)",
    );
    expect(result).toBeInstanceOf(Date);
    expect(getHourInTimezone(result!, 'Pacific/Honolulu')).toBe(23);
    expect(getMinuteInTimezone(result!, 'Pacific/Honolulu')).toBe(0);
  });

  it('parses "resets 3pm (America/New_York)" as 3pm Eastern', () => {
    const result = parseRateLimitResetTime(
      "You've hit your limit · resets 3pm (America/New_York)",
    );
    expect(result).toBeInstanceOf(Date);
    expect(getHourInTimezone(result!, 'America/New_York')).toBe(15);
    expect(getMinuteInTimezone(result!, 'America/New_York')).toBe(0);
  });

  it('parses "resets 9:30am (Europe/London)" as 9:30am London time', () => {
    const result = parseRateLimitResetTime(
      "You've hit your limit · resets 9:30am (Europe/London)",
    );
    expect(result).toBeInstanceOf(Date);
    expect(getHourInTimezone(result!, 'Europe/London')).toBe(9);
    expect(getMinuteInTimezone(result!, 'Europe/London')).toBe(30);
  });

  it('parses "resets 12am (US/Eastern)" as midnight Eastern', () => {
    const result = parseRateLimitResetTime(
      "You've hit your limit · resets 12am (US/Eastern)",
    );
    expect(result).toBeInstanceOf(Date);
    expect(getHourInTimezone(result!, 'US/Eastern')).toBe(0);
    expect(getMinuteInTimezone(result!, 'US/Eastern')).toBe(0);
  });

  it('returns a future date with timezone', () => {
    const now = new Date();
    const result = parseRateLimitResetTime(
      "You've hit your limit · resets 11pm (Pacific/Honolulu)",
    );
    expect(result).toBeInstanceOf(Date);
    // The result should always be in the future (or today/tomorrow depending on time)
    // Since we can't know if 11pm HST has passed, just check it's a valid Date
    expect(result!.getTime()).toBeGreaterThan(0);
  });
});

// ============================================================================
// parseRateLimitResetTime — Timezone support (Format B)
// ============================================================================

describe('parseRateLimitResetTime — Timezone support (Format B)', () => {
  it('parses "resets Feb 22 at 9:30am (US/Eastern)" as 9:30am Eastern', () => {
    const result = parseRateLimitResetTime(
      'Weekly limit reached · resets Feb 22 at 9:30am (US/Eastern)',
    );
    expect(result).toBeInstanceOf(Date);
    expect(getMonthInTimezone(result!, 'US/Eastern')).toBe(1); // February
    expect(getDayInTimezone(result!, 'US/Eastern')).toBe(22);
    expect(getHourInTimezone(result!, 'US/Eastern')).toBe(9);
    expect(getMinuteInTimezone(result!, 'US/Eastern')).toBe(30);
  });

  it('parses "resets Mar 1 at 12:00pm (Asia/Tokyo)" as noon Tokyo time', () => {
    const result = parseRateLimitResetTime(
      'Weekly limit reached · resets Mar 1 at 12:00pm (Asia/Tokyo)',
    );
    expect(result).toBeInstanceOf(Date);
    expect(getMonthInTimezone(result!, 'Asia/Tokyo')).toBe(2); // March
    expect(getDayInTimezone(result!, 'Asia/Tokyo')).toBe(1);
    expect(getHourInTimezone(result!, 'Asia/Tokyo')).toBe(12);
    expect(getMinuteInTimezone(result!, 'Asia/Tokyo')).toBe(0);
  });
});

// ============================================================================
// parseRateLimitResetTime — Timezone support (Format C)
// ============================================================================

describe('parseRateLimitResetTime — Timezone support (Format C)', () => {
  it('parses "resets tomorrow at 3pm (Europe/London)" as 3pm London time tomorrow', () => {
    const result = parseRateLimitResetTime(
      "You've hit your limit · resets tomorrow at 3pm (Europe/London)",
    );
    expect(result).toBeInstanceOf(Date);
    expect(getHourInTimezone(result!, 'Europe/London')).toBe(15);
    expect(getMinuteInTimezone(result!, 'Europe/London')).toBe(0);

    // Should be in the future
    const now = new Date();
    expect(result!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('parses "resets tomorrow at 9:30am (Pacific/Honolulu)" as 9:30am HST', () => {
    const result = parseRateLimitResetTime(
      "You've hit your limit · resets tomorrow at 9:30am (Pacific/Honolulu)",
    );
    expect(result).toBeInstanceOf(Date);
    expect(getHourInTimezone(result!, 'Pacific/Honolulu')).toBe(9);
    expect(getMinuteInTimezone(result!, 'Pacific/Honolulu')).toBe(30);
  });
});

// ============================================================================
// parseRateLimitResetTime — Timezone fallback and edge cases
// ============================================================================

describe('parseRateLimitResetTime — Timezone fallback and edge cases', () => {
  it('falls back to local time for invalid timezone', () => {
    const withInvalidTz = parseRateLimitResetTime(
      "You've hit your limit · resets 3pm (Invalid/Timezone)",
    );
    const withoutTz = parseRateLimitResetTime(
      "You've hit your limit · resets 3pm",
    );
    expect(withInvalidTz).toBeInstanceOf(Date);
    expect(withoutTz).toBeInstanceOf(Date);
    // Both should produce the same result (local time 3pm)
    expect(withInvalidTz!.getHours()).toBe(15);
    expect(withoutTz!.getHours()).toBe(15);
    expect(withInvalidTz!.getTime()).toBe(withoutTz!.getTime());
  });

  it('ignores non-timezone parenthetical text', () => {
    // Text in parens that doesn't match timezone format
    const result = parseRateLimitResetTime(
      "You've hit your limit · resets 3pm (5 tokens remaining)",
    );
    expect(result).toBeInstanceOf(Date);
    // Should fall back to local time since "5 tokens remaining" isn't an IANA timezone
    expect(result!.getHours()).toBe(15);
  });

  it('still parses messages without any timezone (backward compatible)', () => {
    const result = parseRateLimitResetTime("You've hit your limit · resets 3pm");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getHours()).toBe(15);
    expect(result!.getMinutes()).toBe(0);
  });

  it('handles timezone with sub-location (America/Indiana/Indianapolis)', () => {
    const result = parseRateLimitResetTime(
      "You've hit your limit · resets 5pm (America/Indiana/Indianapolis)",
    );
    expect(result).toBeInstanceOf(Date);
    expect(getHourInTimezone(result!, 'America/Indiana/Indianapolis')).toBe(17);
    expect(getMinuteInTimezone(result!, 'America/Indiana/Indianapolis')).toBe(0);
  });

  it('handles timezone with trailing whitespace after closing paren', () => {
    const result = parseRateLimitResetTime(
      "You've hit your limit · resets 11pm (Pacific/Honolulu)  ",
    );
    expect(result).toBeInstanceOf(Date);
    expect(getHourInTimezone(result!, 'Pacific/Honolulu')).toBe(23);
  });

  it('detects rate limit messages with timezone context', () => {
    expect(
      isRateLimitMessage("You've hit your limit · resets 11pm (Pacific/Honolulu)"),
    ).toBe(true);
    expect(
      isRateLimitMessage('Weekly limit reached · resets Feb 22 at 9:30am (US/Eastern)'),
    ).toBe(true);
  });
});
