/**
 * ID Length Cache Service
 *
 * Provides efficient caching for ID hash length calculation.
 * This service avoids querying element count on every ID generation
 * by caching the count and calculated length with periodic invalidation.
 *
 * The cache is automatically invalidated:
 * - After a configurable TTL (default: 60 seconds)
 * - When explicitly refreshed
 * - After a significant number of creates (growth threshold)
 */

import type { StorageBackend } from '@stoneforge/storage';
import { calculateIdLength, MIN_HASH_LENGTH, MAX_HASH_LENGTH } from '@stoneforge/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the ID length cache
 */
export interface IdLengthCacheConfig {
  /**
   * Time-to-live for cached values in milliseconds.
   * After this time, the cache will be refreshed on next access.
   * Default: 60000 (60 seconds)
   */
  ttlMs?: number;

  /**
   * Minimum number of element creations before triggering a refresh.
   * This helps catch rapid growth before TTL expires.
   * Default: 100
   */
  growthThreshold?: number;

  /**
   * Minimum hash length to use, regardless of element count.
   * Default: 4 (provides reasonable collision resistance)
   */
  minLength?: number;
}

/**
 * Cached ID length data
 */
interface CachedData {
  /** Cached element count */
  elementCount: number;
  /** Calculated hash length based on element count */
  hashLength: number;
  /** Timestamp when cache was last updated */
  updatedAt: number;
  /** Number of elements created since last refresh */
  createsSinceRefresh: number;
}

/**
 * Statistics for cache monitoring
 */
export interface IdLengthCacheStats {
  /** Current element count */
  elementCount: number;
  /** Current hash length */
  hashLength: number;
  /** Number of cache hits since creation */
  hits: number;
  /** Number of cache misses (refreshes) since creation */
  misses: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Time since last refresh in milliseconds */
  ageMs: number;
  /** Whether cache is currently stale */
  isStale: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_TTL_MS = 60000; // 60 seconds
const DEFAULT_GROWTH_THRESHOLD = 100;
const DEFAULT_MIN_LENGTH = MIN_HASH_LENGTH + 1; // 4 characters

// ============================================================================
// IdLengthCache Service
// ============================================================================

/**
 * Service for caching ID hash length calculations.
 *
 * This service provides efficient access to the optimal ID hash length
 * without querying the database on every ID generation.
 *
 * @example
 * ```typescript
 * const cache = createIdLengthCache(storage);
 *
 * // Get optimal hash length for ID generation
 * const hashLength = cache.getHashLength();
 *
 * // Notify cache of new element creation (for growth tracking)
 * cache.notifyCreate();
 *
 * // Force refresh if needed
 * cache.refresh();
 * ```
 */
export class IdLengthCache {
  private cache: CachedData | null = null;
  private hits: number = 0;
  private misses: number = 0;
  private readonly ttlMs: number;
  private readonly growthThreshold: number;
  private readonly minLength: number;

  constructor(
    private readonly db: StorageBackend,
    config: IdLengthCacheConfig = {}
  ) {
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.growthThreshold = config.growthThreshold ?? DEFAULT_GROWTH_THRESHOLD;
    this.minLength = Math.max(
      MIN_HASH_LENGTH,
      Math.min(MAX_HASH_LENGTH, config.minLength ?? DEFAULT_MIN_LENGTH)
    );
  }

  /**
   * Get the optimal hash length for ID generation.
   *
   * Returns the cached hash length if valid, otherwise refreshes
   * the cache first. This is the main method to call when generating IDs.
   *
   * @returns The optimal hash length (3-8)
   */
  getHashLength(): number {
    if (this.isStale()) {
      this.refresh();
      this.misses++;
    } else {
      this.hits++;
    }
    return this.cache!.hashLength;
  }

  /**
   * Get the cached element count.
   *
   * This is the element count at the last refresh, not necessarily
   * the current count in the database.
   *
   * @returns The cached element count
   */
  getElementCount(): number {
    if (!this.cache) {
      this.refresh();
    }
    return this.cache!.elementCount;
  }

  /**
   * Notify the cache that a new element was created.
   *
   * This increments the internal counter and may trigger a refresh
   * if the growth threshold is exceeded.
   */
  notifyCreate(): void {
    if (this.cache) {
      this.cache.createsSinceRefresh++;

      // Check if growth threshold exceeded
      if (this.cache.createsSinceRefresh >= this.growthThreshold) {
        // Check if we might need a longer hash
        const newCount = this.cache.elementCount + this.cache.createsSinceRefresh;
        const newLength = this.calculateLength(newCount);
        if (newLength > this.cache.hashLength) {
          this.refresh();
        }
      }
    }
  }

  /**
   * Force a cache refresh.
   *
   * Queries the database for the current element count and
   * recalculates the optimal hash length.
   */
  refresh(): void {
    const elementCount = this.db.getElementCount();
    const hashLength = this.calculateLength(elementCount);

    this.cache = {
      elementCount,
      hashLength,
      updatedAt: Date.now(),
      createsSinceRefresh: 0,
    };
  }

  /**
   * Check if the cache is stale and needs refresh.
   */
  isStale(): boolean {
    if (!this.cache) {
      return true;
    }

    const age = Date.now() - this.cache.updatedAt;
    return age >= this.ttlMs;
  }

  /**
   * Clear the cache, forcing a refresh on next access.
   */
  clear(): void {
    this.cache = null;
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats(): IdLengthCacheStats {
    if (!this.cache) {
      this.refresh();
    }

    const totalAccesses = this.hits + this.misses;
    const hitRate = totalAccesses > 0 ? this.hits / totalAccesses : 0;
    const ageMs = Date.now() - this.cache!.updatedAt;

    return {
      elementCount: this.cache!.elementCount,
      hashLength: this.cache!.hashLength,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      ageMs,
      isStale: this.isStale(),
    };
  }

  /**
   * Calculate the optimal hash length for an element count.
   *
   * Applies the minimum length constraint.
   */
  private calculateLength(elementCount: number): number {
    const calculated = calculateIdLength(elementCount);
    return Math.max(this.minLength, calculated);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new IdLengthCache instance.
 *
 * @param db - Storage backend for querying element count
 * @param config - Optional cache configuration
 * @returns A new IdLengthCache instance
 *
 * @example
 * ```typescript
 * // Basic usage
 * const cache = createIdLengthCache(storage);
 *
 * // With custom configuration
 * const cache = createIdLengthCache(storage, {
 *   ttlMs: 30000, // 30 second TTL
 *   growthThreshold: 50, // Refresh after 50 creates
 *   minLength: 5, // Minimum 5-character hashes
 * });
 * ```
 */
export function createIdLengthCache(
  db: StorageBackend,
  config?: IdLengthCacheConfig
): IdLengthCache {
  return new IdLengthCache(db, config);
}
