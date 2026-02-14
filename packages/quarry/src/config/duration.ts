/**
 * Duration Parsing and Formatting
 *
 * Handles conversion between duration strings (e.g., '5m', '500ms', '24h')
 * and millisecond values.
 */

import { ValidationError, ErrorCode } from '@stoneforge/core';
import type { Duration, DurationString } from './types.js';

// ============================================================================
// Duration Units
// ============================================================================

/**
 * Duration unit multipliers (to milliseconds)
 */
export const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Duration string pattern: number followed by unit
 */
const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/;

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Checks if a value is a valid duration string
 */
export function isDurationString(value: unknown): value is DurationString {
  if (typeof value !== 'string') {
    return false;
  }
  return DURATION_PATTERN.test(value);
}

/**
 * Parses a duration string to milliseconds
 *
 * @param value - Duration string (e.g., '5m', '500ms', '24h', '30d')
 * @returns Duration in milliseconds
 * @throws ValidationError if format is invalid
 *
 * @example
 * parseDuration('500ms') // 500
 * parseDuration('5s')    // 5000
 * parseDuration('5m')    // 300000
 * parseDuration('24h')   // 86400000
 * parseDuration('30d')   // 2592000000
 */
export function parseDuration(value: string): Duration {
  const match = value.match(DURATION_PATTERN);
  if (!match) {
    throw new ValidationError(
      `Invalid duration format: '${value}'. Expected format: <number><unit> (e.g., '500ms', '5m', '24h', '30d')`,
      ErrorCode.INVALID_INPUT,
      { field: 'duration', value, expected: '<number><unit> where unit is ms, s, m, h, or d' }
    );
  }

  const [, numStr, unit] = match;
  const num = parseFloat(numStr);
  const multiplier = DURATION_UNITS[unit];

  if (multiplier === undefined) {
    throw new ValidationError(
      `Unknown duration unit: '${unit}'. Valid units: ms, s, m, h, d`,
      ErrorCode.INVALID_INPUT,
      { field: 'duration', value, expected: 'ms, s, m, h, or d' }
    );
  }

  const result = num * multiplier;

  if (!Number.isFinite(result)) {
    throw new ValidationError(
      `Duration overflow: '${value}' produces non-finite value`,
      ErrorCode.INVALID_INPUT,
      { field: 'duration', value }
    );
  }

  return Math.round(result);
}

/**
 * Parses a duration value that may be string or number
 *
 * @param value - Duration string or number (milliseconds)
 * @returns Duration in milliseconds
 */
export function parseDurationValue(value: string | number): Duration {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new ValidationError(
        `Invalid duration value: ${value}. Must be a non-negative finite number`,
        ErrorCode.INVALID_INPUT,
        { field: 'duration', value, expected: 'non-negative finite number' }
      );
    }
    return Math.round(value);
  }
  return parseDuration(value);
}

/**
 * Safely parses a duration, returning undefined on failure
 */
export function tryParseDuration(value: unknown): Duration | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    try {
      return parseDuration(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Formats a duration in milliseconds to a human-readable string
 * Uses the largest appropriate unit
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 *
 * @example
 * formatDuration(500)       // '500ms'
 * formatDuration(5000)      // '5s'
 * formatDuration(300000)    // '5m'
 * formatDuration(86400000)  // '24h'
 * formatDuration(2592000000) // '30d'
 */
export function formatDuration(ms: Duration): string {
  if (ms < 0) {
    throw new ValidationError(
      `Cannot format negative duration: ${ms}`,
      ErrorCode.INVALID_INPUT,
      { field: 'duration', value: ms }
    );
  }

  // Try each unit from largest to smallest
  if (ms >= DURATION_UNITS.d && ms % DURATION_UNITS.d === 0) {
    return `${ms / DURATION_UNITS.d}d`;
  }
  if (ms >= DURATION_UNITS.h && ms % DURATION_UNITS.h === 0) {
    return `${ms / DURATION_UNITS.h}h`;
  }
  if (ms >= DURATION_UNITS.m && ms % DURATION_UNITS.m === 0) {
    return `${ms / DURATION_UNITS.m}m`;
  }
  if (ms >= DURATION_UNITS.s && ms % DURATION_UNITS.s === 0) {
    return `${ms / DURATION_UNITS.s}s`;
  }
  return `${ms}ms`;
}

/**
 * Formats a duration with appropriate precision for display
 * May produce decimal values for better readability
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration string
 */
export function formatDurationHuman(ms: Duration): string {
  if (ms < 0) {
    throw new ValidationError(
      `Cannot format negative duration: ${ms}`,
      ErrorCode.INVALID_INPUT,
      { field: 'duration', value: ms }
    );
  }

  if (ms === 0) {
    return '0ms';
  }

  // Use the most appropriate unit
  if (ms >= DURATION_UNITS.d) {
    const days = ms / DURATION_UNITS.d;
    return days === Math.floor(days) ? `${days}d` : `${days.toFixed(1)}d`;
  }
  if (ms >= DURATION_UNITS.h) {
    const hours = ms / DURATION_UNITS.h;
    return hours === Math.floor(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  }
  if (ms >= DURATION_UNITS.m) {
    const mins = ms / DURATION_UNITS.m;
    return mins === Math.floor(mins) ? `${mins}m` : `${mins.toFixed(1)}m`;
  }
  if (ms >= DURATION_UNITS.s) {
    const secs = ms / DURATION_UNITS.s;
    return secs === Math.floor(secs) ? `${secs}s` : `${secs.toFixed(1)}s`;
  }
  return `${ms}ms`;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a duration is within an allowed range
 *
 * @param value - Duration in milliseconds
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param field - Field name for error messages
 * @returns The validated duration
 */
export function validateDurationRange(
  value: Duration,
  min: Duration,
  max: Duration,
  field: string
): Duration {
  if (value < min) {
    throw new ValidationError(
      `${field} must be at least ${formatDuration(min)}, got ${formatDuration(value)}`,
      ErrorCode.INVALID_INPUT,
      { field, value, expected: `>= ${formatDuration(min)}`, actual: formatDuration(value) }
    );
  }
  if (value > max) {
    throw new ValidationError(
      `${field} must be at most ${formatDuration(max)}, got ${formatDuration(value)}`,
      ErrorCode.INVALID_INPUT,
      { field, value, expected: `<= ${formatDuration(max)}`, actual: formatDuration(value) }
    );
  }
  return value;
}
