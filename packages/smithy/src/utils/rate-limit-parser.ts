/**
 * Rate Limit Parser Utility
 *
 * Detects and parses Claude Code rate limit messages emitted during
 * headless SDK sessions. Supports three known message formats:
 *
 *   1. Hourly/5-hour limit:  "You've hit your limit · resets 12am"
 *   2. Weekly limit:         "Weekly limit reached · resets Feb 22 at 9:30am"
 *   3. Tomorrow reset:       "resets tomorrow at 3pm"
 *
 * Messages may include an optional IANA timezone in parentheses:
 *   "You've hit your limit · resets 11pm (Pacific/Honolulu)"
 *
 * When a valid IANA timezone is detected, the parsed reset time is
 * computed in that timezone. Otherwise, server local time is used.
 *
 * Also provides a fallback function for when parsing fails, so callers
 * can always obtain a conservative reset time estimate.
 *
 * Usage:
 *   import { isRateLimitMessage, parseRateLimitResetTime, getFallbackResetTime } from '../utils/rate-limit-parser.js';
 *
 *   if (isRateLimitMessage(text)) {
 *     const resetAt = parseRateLimitResetTime(text) ?? getFallbackResetTime(text);
 *   }
 *
 * @module
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Month name abbreviations used in Format B reset times.
 */
const MONTH_NAMES: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Patterns to detect rate limit messages from Claude Code.
 *
 * Handles:
 * - "You've hit your limit" with straight (') or curly (\u2019) apostrophes
 * - "Weekly limit reached"
 * - Generic "limit" + "resets" co-occurrence in the same message
 */
export const RATE_LIMIT_PATTERNS: ReadonlyArray<RegExp> = [
  /you[\u2018\u2019''`]ve hit your limit/i,
  /weekly limit reached/i,
  /limit\b.*\bresets?\b/i,
];

/**
 * Regex to extract an IANA timezone name from parentheses at the end
 * of a rate limit message.
 *
 * Matches patterns like "(Pacific/Honolulu)", "(US/Eastern)", or
 * "(America/Indiana/Indianapolis)".
 *
 * IANA timezone names consist of Area/Location components, possibly
 * with sub-locations, using letters, digits, underscores, hyphens,
 * and plus signs.
 */
const TIMEZONE_REGEX =
  /\(([A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z][A-Za-z0-9_+-]*){0,2})\)\s*$/;

// ============================================================================
// Detection
// ============================================================================

/**
 * Returns `true` if the content matches any known rate limit pattern.
 */
export function isRateLimitMessage(content: string): boolean {
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(content));
}

// ============================================================================
// Parsing — reset time extraction
// ============================================================================

/**
 * Format B regex: "resets Mon DD at H:MMam/pm" or "resets Mon DD Ham/pm"
 *
 * The "at" keyword is optional to handle both "resets Feb 22 at 8pm"
 * and "resets Feb 22 8pm".
 *
 * Captures:
 *   [1] month name (e.g. "Feb" or "February")
 *   [2] day number  (e.g. "22")
 *   [3] hour        (e.g. "9" or "12")
 *   [4] minutes     (optional, e.g. "30")
 *   [5] am/pm       (e.g. "am")
 */
const FORMAT_B_REGEX =
  /resets?\s+([A-Za-z]+)\s+(\d{1,2})\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

/**
 * Format C regex: "resets tomorrow at H:MMam/pm" or "resets tomorrow at Ham/pm"
 *
 * Captures:
 *   [1] hour    (e.g. "3" or "12")
 *   [2] minutes (optional, e.g. "30")
 *   [3] am/pm
 */
const FORMAT_C_REGEX = /resets?\s+tomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

/**
 * Format A regex: "resets Ham/pm" or "resets H:MMam/pm" (time only, no date)
 *
 * Captures:
 *   [1] hour    (e.g. "12" or "3")
 *   [2] minutes (optional, e.g. "30")
 *   [3] am/pm
 */
const FORMAT_A_REGEX = /resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

/**
 * Parses the reset time embedded in a rate limit message.
 *
 * Returns a `Date` representing when the rate limit resets, or `undefined`
 * if the message does not contain a parseable reset time.
 *
 * If the message includes a valid IANA timezone in parentheses (e.g.
 * "(Pacific/Honolulu)"), the time is interpreted in that timezone.
 * Otherwise, server local time is used.
 *
 * @param content - The raw message text from Claude Code
 * @returns The parsed reset `Date`, or `undefined` if parsing fails
 */
export function parseRateLimitResetTime(content: string): Date | undefined {
  // Extract timezone if present (e.g. "(Pacific/Honolulu)")
  const timezone = extractTimezone(content);

  // Try Format B first (most specific — includes a date)
  const formatB = FORMAT_B_REGEX.exec(content);
  if (formatB) {
    return parseDateAndTime(formatB, timezone);
  }

  // Try Format C (tomorrow + time — more specific than time-only)
  const formatC = FORMAT_C_REGEX.exec(content);
  if (formatC) {
    return parseTomorrowTime(formatC, timezone);
  }

  // Fall back to Format A (time only)
  const formatA = FORMAT_A_REGEX.exec(content);
  if (formatA) {
    return parseTimeOnly(formatA, timezone);
  }

  return undefined;
}

/**
 * Returns a fallback reset time when the exact time cannot be parsed.
 * Uses the message content to determine the type of limit and applies
 * a conservative default sleep duration.
 *
 * - Weekly limit ("weekly"): 6 hours from now
 * - Hourly/daily limit (default): 1 hour from now
 */
export function getFallbackResetTime(content: string): Date {
  const isWeekly = /weekly/i.test(content);
  const fallbackMs = isWeekly ? 6 * 60 * 60 * 1000 : 1 * 60 * 60 * 1000;
  return new Date(Date.now() + fallbackMs);
}

// ============================================================================
// Timezone helpers
// ============================================================================

/**
 * Extracts an IANA timezone name from parentheses at the end of a message.
 * Returns `undefined` if no timezone pattern is found or if the extracted
 * name is not a valid IANA timezone.
 *
 * @example
 *   extractTimezone("resets 11pm (Pacific/Honolulu)") // "Pacific/Honolulu"
 *   extractTimezone("resets 11pm")                    // undefined
 *   extractTimezone("resets 11pm (Invalid/Zone)")     // undefined
 */
function extractTimezone(content: string): string | undefined {
  const match = TIMEZONE_REGEX.exec(content);
  if (!match) return undefined;
  const tz = match[1];
  return isValidTimezone(tz) ? tz : undefined;
}

/**
 * Checks whether the given string is a valid IANA timezone name
 * by attempting to create an `Intl.DateTimeFormat` with it.
 */
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes the UTC offset (in milliseconds) for a given IANA timezone
 * at a specific moment in time.
 *
 * The returned offset satisfies: localTime = utcTime + offset
 *
 * For example, `Pacific/Honolulu` (HST, UTC-10) returns approximately
 * -36_000_000 (−10 hours).
 */
function getTimezoneOffsetMs(timezone: string, atDate: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(atDate);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const val = parseInt(parts.find((p) => p.type === type)!.value, 10);
    // Some implementations return 24 for midnight; normalize to 0
    return type === 'hour' && val === 24 ? 0 : val;
  };

  const localAsUtcMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );

  return localAsUtcMs - atDate.getTime();
}

/**
 * Creates a `Date` from calendar components, interpreting them in the
 * specified IANA timezone. If no timezone is provided, uses server
 * local time (standard `Date` constructor behavior).
 *
 * Uses a two-pass approach to handle DST transitions correctly:
 * 1. Computes the timezone offset at a first guess (target as UTC)
 * 2. Verifies the offset at the adjusted time; re-adjusts if DST changed
 */
function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour24: number,
  minutes: number,
  timezone?: string,
): Date {
  if (!timezone) {
    return new Date(year, month, day, hour24, minutes, 0, 0);
  }

  // Express the target local time as a UTC timestamp (for arithmetic)
  const targetLocalMs = Date.UTC(year, month, day, hour24, minutes, 0, 0);

  // First pass: compute offset at the target time interpreted as UTC
  const offset1 = getTimezoneOffsetMs(timezone, new Date(targetLocalMs));
  const firstGuessMs = targetLocalMs - offset1;

  // Second pass: verify offset at the adjusted time (DST edge case)
  const offset2 = getTimezoneOffsetMs(timezone, new Date(firstGuessMs));
  if (offset1 !== offset2) {
    return new Date(targetLocalMs - offset2);
  }

  return new Date(firstGuessMs);
}

/**
 * Returns the current date/time components as they appear in the given
 * IANA timezone.
 *
 * Used for "is in the past?" and "today/tomorrow" comparisons that
 * need to be timezone-aware.
 */
function nowInTimezone(timezone: string): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const val = parseInt(parts.find((p) => p.type === type)!.value, 10);
    return type === 'hour' && val === 24 ? 0 : val;
  };

  return {
    year: get('year'),
    month: get('month') - 1, // 0-indexed to match Date constructor
    day: get('day'),
    hours: get('hour'),
    minutes: get('minute'),
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Converts a 12-hour time (hour + am/pm) to 24-hour format.
 */
function to24Hour(hour: number, ampm: string): number {
  const lower = ampm.toLowerCase();
  if (lower === 'am') {
    return hour === 12 ? 0 : hour;
  }
  // pm
  return hour === 12 ? 12 : hour + 12;
}

/**
 * Parses a Format B match (date + time) into a Date.
 *
 * If the resulting date is in the past, assumes next year.
 * When a timezone is provided, the time is interpreted in that timezone.
 */
function parseDateAndTime(
  match: RegExpExecArray,
  timezone?: string,
): Date | undefined {
  try {
    const monthStr = match[1].toLowerCase();
    const day = parseInt(match[2], 10);
    const hour12 = parseInt(match[3], 10);
    const minutes = match[4] ? parseInt(match[4], 10) : 0;
    const ampm = match[5];

    const month = MONTH_NAMES[monthStr.slice(0, 3)];
    if (month === undefined) return undefined;
    if (isNaN(day) || isNaN(hour12) || isNaN(minutes)) return undefined;

    const hour24 = to24Hour(hour12, ampm);
    const now = new Date();
    const year = timezone ? nowInTimezone(timezone).year : now.getFullYear();

    let result = createDateInTimezone(year, month, day, hour24, minutes, timezone);

    // If the parsed date is in the past, assume it means next year
    if (result.getTime() < now.getTime()) {
      result = createDateInTimezone(year + 1, month, day, hour24, minutes, timezone);
    }

    return result;
  } catch {
    return undefined;
  }
}

/**
 * Parses a Format C match (tomorrow + time) into a Date.
 *
 * Computes tomorrow's date and sets the parsed time on it.
 * When a timezone is provided, "tomorrow" is determined in that timezone.
 */
function parseTomorrowTime(
  match: RegExpExecArray,
  timezone?: string,
): Date | undefined {
  try {
    const hour12 = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3];

    if (isNaN(hour12) || isNaN(minutes)) return undefined;

    const hour24 = to24Hour(hour12, ampm);

    if (timezone) {
      const tzNow = nowInTimezone(timezone);
      // Compute tomorrow in the target timezone using UTC arithmetic
      // to avoid Date constructor month/day rollover issues
      const tomorrowUtc = new Date(
        Date.UTC(tzNow.year, tzNow.month, tzNow.day + 1),
      );
      return createDateInTimezone(
        tomorrowUtc.getUTCFullYear(),
        tomorrowUtc.getUTCMonth(),
        tomorrowUtc.getUTCDate(),
        hour24,
        minutes,
        timezone,
      );
    }

    const now = new Date();
    const result = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1, // tomorrow
      hour24,
      minutes,
      0,
      0,
    );

    return result;
  } catch {
    return undefined;
  }
}

/**
 * Parses a Format A match (time only) into a Date.
 *
 * Returns the next occurrence of that local time — today if still in the
 * future, otherwise tomorrow. When a timezone is provided, "today" and
 * "tomorrow" are determined in that timezone.
 */
function parseTimeOnly(
  match: RegExpExecArray,
  timezone?: string,
): Date | undefined {
  try {
    const hour12 = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3];

    if (isNaN(hour12) || isNaN(minutes)) return undefined;

    const hour24 = to24Hour(hour12, ampm);
    const now = new Date();

    if (timezone) {
      const tzNow = nowInTimezone(timezone);

      let result = createDateInTimezone(
        tzNow.year,
        tzNow.month,
        tzNow.day,
        hour24,
        minutes,
        timezone,
      );

      // If the time has already passed today (in the target timezone),
      // advance to tomorrow
      if (result.getTime() <= now.getTime()) {
        const tomorrowUtc = new Date(
          Date.UTC(tzNow.year, tzNow.month, tzNow.day + 1),
        );
        result = createDateInTimezone(
          tomorrowUtc.getUTCFullYear(),
          tomorrowUtc.getUTCMonth(),
          tomorrowUtc.getUTCDate(),
          hour24,
          minutes,
          timezone,
        );
      }

      return result;
    }

    const result = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour24,
      minutes,
      0,
      0,
    );

    // If the time has already passed today, advance to tomorrow
    if (result.getTime() <= now.getTime()) {
      result.setDate(result.getDate() + 1);
    }

    return result;
  } catch {
    return undefined;
  }
}
