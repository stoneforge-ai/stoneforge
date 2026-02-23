/**
 * Rate Limit Tracker Service
 *
 * A service that tracks which executables are rate-limited and when their
 * limits reset. Used by the dispatch system to avoid spawning sessions
 * against rate-limited executables and to select fallback executables
 * when the primary is throttled.
 *
 * Key features:
 * - Track rate-limited executables with reset timestamps
 * - Auto-expire stale entries (past reset times)
 * - Walk fallback chains to find available executables
 * - Query soonest reset time for scheduling retries
 * - Optional persistence to SQLite via SettingsService (survives restarts)
 *
 * @module
 */

import type { SettingsService } from './settings-service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('rate-limit-tracker');

// ============================================================================
// Types
// ============================================================================

/**
 * A single rate limit entry for a tracked executable.
 */
export interface RateLimitEntry {
  executable: string;
  resetsAt: Date;
  recordedAt: Date;
}

/**
 * Rate Limit Tracker interface for managing executable rate limit state.
 *
 * The tracker provides methods for:
 * - Recording rate-limited executables
 * - Checking whether an executable is currently limited
 * - Walking fallback chains to find available executables
 * - Querying when rate limits will reset
 */
export interface RateLimitTracker {
  /**
   * Mark an executable as rate-limited until the given reset time.
   * If the executable is already tracked, only update if the new
   * resetsAt is later than the existing one (never downgrade).
   */
  markLimited(executable: string, resetsAt: Date): void;

  /**
   * Check whether an executable is currently rate-limited.
   * Auto-expires stale entries whose resetsAt is in the past.
   */
  isLimited(executable: string): boolean;

  /**
   * Walk the fallback chain and return the first executable that
   * is not currently rate-limited. Returns undefined if all are limited.
   */
  getAvailableExecutable(fallbackChain: string[]): string | undefined;

  /**
   * Return the earliest resetsAt among all currently-limited executables
   * (after auto-expiring stale entries). Returns undefined if nothing is limited.
   */
  getSoonestResetTime(): Date | undefined;

  /**
   * Return all currently-limited entries (after auto-expiring stale ones).
   */
  getAllLimits(): RateLimitEntry[];

  /**
   * Return true if every executable in the fallback chain is currently
   * rate-limited (after auto-expiring stale entries).
   */
  isAllLimited(fallbackChain: string[]): boolean;

  /**
   * Reset all tracked state.
   */
  clear(): void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Settings key used to persist rate limit state.
 */
export const RATE_LIMITS_SETTING_KEY = 'rateLimits';

/**
 * Shape of a persisted rate limit entry.
 */
interface PersistedEntry {
  resetsAt: string; // ISO 8601
  recordedAt: string; // ISO 8601
}

/**
 * Shape of the persisted rate limits value in the settings table.
 */
type PersistedRateLimits = Record<string, PersistedEntry>;

// ============================================================================
// Internal Types
// ============================================================================

interface InternalEntry {
  resetsAt: Date;
  recordedAt: Date;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * In-memory implementation of the RateLimitTracker with optional SQLite persistence.
 *
 * Uses a Map keyed by executable name. Stale entries (resetsAt in the past)
 * are lazily cleaned up during read operations.
 *
 * When a SettingsService is provided, the tracker:
 * - Hydrates from persisted state on creation (skipping expired entries)
 * - Persists the current limits map on every markLimited() and clear() call
 */
class RateLimitTrackerImpl implements RateLimitTracker {
  private readonly limits: Map<string, InternalEntry> = new Map();
  private readonly settingsService: SettingsService | undefined;

  constructor(settingsService?: SettingsService) {
    this.settingsService = settingsService;
    if (settingsService) {
      this.hydrate();
    }
  }

  markLimited(executable: string, resetsAt: Date): void {
    const existing = this.limits.get(executable);
    if (existing && existing.resetsAt.getTime() >= resetsAt.getTime()) {
      // Existing entry has a later (or equal) reset time — don't downgrade
      return;
    }
    this.limits.set(executable, {
      resetsAt,
      recordedAt: new Date(),
    });
    this.persist();
  }

  isLimited(executable: string): boolean {
    const entry = this.limits.get(executable);
    if (!entry) {
      return false;
    }
    if (entry.resetsAt.getTime() <= Date.now()) {
      // Stale — auto-expire
      this.limits.delete(executable);
      return false;
    }
    return true;
  }

  getAvailableExecutable(fallbackChain: string[]): string | undefined {
    for (const executable of fallbackChain) {
      if (!this.isLimited(executable)) {
        return executable;
      }
    }
    return undefined;
  }

  getSoonestResetTime(): Date | undefined {
    this.expireStale();
    let soonest: Date | undefined;
    for (const entry of this.limits.values()) {
      if (!soonest || entry.resetsAt.getTime() < soonest.getTime()) {
        soonest = entry.resetsAt;
      }
    }
    return soonest;
  }

  getAllLimits(): RateLimitEntry[] {
    this.expireStale();
    const entries: RateLimitEntry[] = [];
    for (const [executable, entry] of this.limits) {
      entries.push({
        executable,
        resetsAt: entry.resetsAt,
        recordedAt: entry.recordedAt,
      });
    }
    return entries;
  }

  isAllLimited(fallbackChain: string[]): boolean {
    if (fallbackChain.length === 0) {
      return false;
    }
    return fallbackChain.every((executable) => this.isLimited(executable));
  }

  clear(): void {
    this.limits.clear();
    this.persist();
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  /**
   * Remove all entries whose resetsAt is in the past.
   */
  private expireStale(): void {
    const now = Date.now();
    for (const [executable, entry] of this.limits) {
      if (entry.resetsAt.getTime() <= now) {
        this.limits.delete(executable);
      }
    }
  }

  /**
   * Hydrate the in-memory map from persisted settings.
   * Skips entries whose resetsAt is already in the past.
   */
  private hydrate(): void {
    if (!this.settingsService) return;

    try {
      const setting = this.settingsService.getSetting(RATE_LIMITS_SETTING_KEY);
      if (!setting || !setting.value || typeof setting.value !== 'object') {
        return;
      }

      const persisted = setting.value as PersistedRateLimits;
      const now = Date.now();
      let hydratedCount = 0;
      let skippedCount = 0;

      for (const [executable, entry] of Object.entries(persisted)) {
        if (!entry || typeof entry.resetsAt !== 'string' || typeof entry.recordedAt !== 'string') {
          skippedCount++;
          continue;
        }

        const resetsAt = new Date(entry.resetsAt);
        const recordedAt = new Date(entry.recordedAt);

        // Skip entries whose resetsAt is already in the past
        if (resetsAt.getTime() <= now) {
          skippedCount++;
          continue;
        }

        // Validate dates are valid
        if (isNaN(resetsAt.getTime()) || isNaN(recordedAt.getTime())) {
          skippedCount++;
          continue;
        }

        this.limits.set(executable, { resetsAt, recordedAt });
        hydratedCount++;
      }

      if (hydratedCount > 0 || skippedCount > 0) {
        logger.info(`Hydrated ${hydratedCount} rate limits from settings (skipped ${skippedCount} expired/invalid)`);
      }
    } catch (err) {
      logger.warn('Failed to hydrate rate limits from settings:', err);
    }
  }

  /**
   * Persist the current in-memory limits map to settings.
   * Only active (non-expired) entries are persisted.
   */
  private persist(): void {
    if (!this.settingsService) return;

    try {
      // Expire stale entries before persisting so we don't write dead data
      this.expireStale();

      const persisted: PersistedRateLimits = {};
      for (const [executable, entry] of this.limits) {
        persisted[executable] = {
          resetsAt: entry.resetsAt.toISOString(),
          recordedAt: entry.recordedAt.toISOString(),
        };
      }

      this.settingsService.setSetting(RATE_LIMITS_SETTING_KEY, persisted);
    } catch (err) {
      logger.warn('Failed to persist rate limits to settings:', err);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a RateLimitTracker instance.
 *
 * When a SettingsService is provided, the tracker persists its state to SQLite
 * (key: `rateLimits`) and hydrates from it on creation — surviving server restarts.
 * Without a SettingsService, the tracker is purely in-memory.
 */
export function createRateLimitTracker(settingsService?: SettingsService): RateLimitTracker {
  return new RateLimitTrackerImpl(settingsService);
}
