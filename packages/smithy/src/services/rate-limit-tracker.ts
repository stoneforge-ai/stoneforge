/**
 * Rate Limit Tracker Service
 *
 * An in-memory service that tracks which executables are rate-limited
 * and when their limits reset. Used by the dispatch system to avoid
 * spawning sessions against rate-limited executables and to select
 * fallback executables when the primary is throttled.
 *
 * Key features:
 * - Track rate-limited executables with reset timestamps
 * - Auto-expire stale entries (past reset times)
 * - Walk fallback chains to find available executables
 * - Query soonest reset time for scheduling retries
 *
 * @module
 */

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
 * In-memory implementation of the RateLimitTracker.
 *
 * Uses a Map keyed by executable name. Stale entries (resetsAt in the past)
 * are lazily cleaned up during read operations.
 */
class RateLimitTrackerImpl implements RateLimitTracker {
  private readonly limits: Map<string, InternalEntry> = new Map();

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
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a RateLimitTracker instance.
 *
 * No constructor arguments — this is purely in-memory with no DB or
 * service dependencies.
 */
export function createRateLimitTracker(): RateLimitTracker {
  return new RateLimitTrackerImpl();
}
