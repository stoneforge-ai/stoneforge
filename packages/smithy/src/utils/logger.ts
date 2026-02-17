/**
 * Logger Utility
 *
 * Provides a structured logging framework with level-based filtering.
 * Supports DEBUG, INFO, WARNING, and ERROR levels with configurable
 * minimum log level via the LOG_LEVEL environment variable.
 *
 * Usage:
 *   import { createLogger } from '../utils/logger.js';
 *   const logger = createLogger('service-name');
 *   logger.info('Server started');
 *   logger.debug('Detailed info');
 *   logger.warn('Something unexpected');
 *   logger.error('Something failed', error);
 *
 * Environment:
 *   LOG_LEVEL=DEBUG|INFO|WARNING|ERROR (default: INFO)
 *
 * @module
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Supported log levels in ascending severity order.
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

/**
 * Logger interface with leveled logging methods.
 */
export interface Logger {
  /** Log at DEBUG level — detailed operational info (polling cycles, individual checks, etc.) */
  debug(message: string, ...args: unknown[]): void;
  /** Log at INFO level — key events (server start, agent spawned, plan completed, etc.) */
  info(message: string, ...args: unknown[]): void;
  /** Log at WARNING level — recoverable issues (stale sessions, retry attempts, etc.) */
  warn(message: string, ...args: unknown[]): void;
  /** Log at ERROR level — failures (uncaught errors, failed operations, etc.) */
  error(message: string, ...args: unknown[]): void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Log level severity values — higher number means more severe.
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
};

/**
 * Valid log level strings for validation.
 */
const VALID_LOG_LEVELS = new Set<string>(['DEBUG', 'INFO', 'WARNING', 'ERROR']);

/**
 * Default log level when LOG_LEVEL env var is not set or invalid.
 */
const DEFAULT_LOG_LEVEL: LogLevel = 'INFO';

// ============================================================================
// Log Level Resolution
// ============================================================================

/**
 * Resolves the current log level from the LOG_LEVEL environment variable.
 * Falls back to INFO if the variable is not set or invalid.
 *
 * The level is read fresh on each call so changes to process.env.LOG_LEVEL
 * take effect immediately without restart.
 */
export function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && VALID_LOG_LEVELS.has(envLevel)) {
    return envLevel as LogLevel;
  }
  return DEFAULT_LOG_LEVEL;
}

/**
 * Checks whether a message at the given level should be logged
 * based on the current minimum log level.
 */
function shouldLog(messageLevel: LogLevel): boolean {
  const currentLevel = getLogLevel();
  return LOG_LEVEL_VALUES[messageLevel] >= LOG_LEVEL_VALUES[currentLevel];
}

// ============================================================================
// Logger Factory
// ============================================================================

/**
 * Creates a scoped logger instance with the given service name prefix.
 *
 * The logger preserves the existing `[service-name]` prefix convention
 * used throughout the codebase and adds log-level filtering.
 *
 * @param serviceName - The service name used as a prefix (e.g., 'dispatch-daemon')
 * @returns A Logger instance with debug/info/warn/error methods
 *
 * @example
 * ```ts
 * const logger = createLogger('dispatch-daemon');
 * logger.info('Started polling');
 * // Output: [dispatch-daemon] Started polling
 *
 * logger.debug('Checking worker availability');
 * // Only shown when LOG_LEVEL=DEBUG
 * ```
 */
export function createLogger(serviceName: string): Logger {
  const prefix = `[${serviceName}]`;

  return {
    debug(message: string, ...args: unknown[]): void {
      if (shouldLog('DEBUG')) {
        if (args.length > 0) {
          console.debug(prefix, message, ...args);
        } else {
          console.debug(prefix, message);
        }
      }
    },

    info(message: string, ...args: unknown[]): void {
      if (shouldLog('INFO')) {
        if (args.length > 0) {
          console.log(prefix, message, ...args);
        } else {
          console.log(prefix, message);
        }
      }
    },

    warn(message: string, ...args: unknown[]): void {
      if (shouldLog('WARNING')) {
        if (args.length > 0) {
          console.warn(prefix, message, ...args);
        } else {
          console.warn(prefix, message);
        }
      }
    },

    error(message: string, ...args: unknown[]): void {
      if (shouldLog('ERROR')) {
        if (args.length > 0) {
          console.error(prefix, message, ...args);
        } else {
          console.error(prefix, message);
        }
      }
    },
  };
}
