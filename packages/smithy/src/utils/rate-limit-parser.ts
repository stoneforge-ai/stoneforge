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
 * @param content - The raw message text from Claude Code
 * @returns The parsed reset `Date`, or `undefined` if parsing fails
 */
export function parseRateLimitResetTime(content: string): Date | undefined {
  // Try Format B first (most specific — includes a date)
  const formatB = FORMAT_B_REGEX.exec(content);
  if (formatB) {
    return parseDateAndTime(formatB);
  }

  // Try Format C (tomorrow + time — more specific than time-only)
  const formatC = FORMAT_C_REGEX.exec(content);
  if (formatC) {
    return parseTomorrowTime(formatC);
  }

  // Fall back to Format A (time only)
  const formatA = FORMAT_A_REGEX.exec(content);
  if (formatA) {
    return parseTimeOnly(formatA);
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
 */
function parseDateAndTime(match: RegExpExecArray): Date | undefined {
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
    const year = now.getFullYear();

    const result = new Date(year, month, day, hour24, minutes, 0, 0);

    // If the parsed date is in the past, assume it means next year
    if (result.getTime() < now.getTime()) {
      result.setFullYear(year + 1);
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
 */
function parseTomorrowTime(match: RegExpExecArray): Date | undefined {
  try {
    const hour12 = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3];

    if (isNaN(hour12) || isNaN(minutes)) return undefined;

    const hour24 = to24Hour(hour12, ampm);
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
 * future, otherwise tomorrow.
 */
function parseTimeOnly(match: RegExpExecArray): Date | undefined {
  try {
    const hour12 = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3];

    if (isNaN(hour12) || isNaN(minutes)) return undefined;

    const hour24 = to24Hour(hour12, ampm);
    const now = new Date();

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
