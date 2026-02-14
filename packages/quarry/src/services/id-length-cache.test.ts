/**
 * Tests for IdLengthCache Service
 *
 * Tests caching behavior for ID hash length calculation,
 * including TTL expiration, growth threshold triggers, and statistics.
 */

import { describe, it, expect, spyOn } from 'bun:test';
import { IdLengthCache, createIdLengthCache } from './id-length-cache.js';
import type { StorageBackend } from '@stoneforge/storage';

// ============================================================================
// Mock Storage Backend
// ============================================================================

/**
 * Create a minimal mock storage backend for testing
 */
function createMockBackend(elementCount: number = 0): StorageBackend & { setElementCount: (count: number) => void } {
  let count = elementCount;
  return {
    getElementCount: () => count,
    setElementCount: (newCount: number) => { count = newCount; },
    // Other required interface methods (not used in these tests)
    isOpen: true,
    path: ':memory:',
    inTransaction: false,
    close: () => {},
    exec: () => {},
    query: () => [],
    queryOne: () => undefined,
    run: () => ({ changes: 0 }),
    prepare: () => ({ all: () => [], get: () => undefined, run: () => ({ changes: 0 }), finalize: () => {} }),
    transaction: (fn) => fn({} as any),
    getSchemaVersion: () => 0,
    setSchemaVersion: () => {},
    migrate: () => ({ fromVersion: 0, toVersion: 0, applied: [], success: true }),
    markDirty: () => {},
    getDirtyElements: () => [],
    clearDirty: () => {},
    clearDirtyElements: () => {},
    getNextChildNumber: () => 1,
    getChildCounter: () => 0,
    resetChildCounter: () => {},
    checkIntegrity: () => true,
    optimize: () => {},
    getStats: () => ({
      fileSize: 0,
      tableCount: 0,
      indexCount: 0,
      schemaVersion: 0,
      dirtyCount: 0,
      elementCount: count,
      walMode: true,
    }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('IdLengthCache', () => {
  describe('basic functionality', () => {
    it('should create cache with factory function', () => {
      const backend = createMockBackend();
      const cache = createIdLengthCache(backend);
      expect(cache).toBeInstanceOf(IdLengthCache);
    });

    it('should get hash length from empty database', () => {
      const backend = createMockBackend(0);
      const cache = new IdLengthCache(backend);
      const length = cache.getHashLength();
      expect(length).toBe(4); // Default minimum length
    });

    it('should calculate correct hash length for various element counts', () => {
      const testCases = [
        { count: 0, expectedLength: 4 },    // Minimum length
        { count: 50, expectedLength: 4 },   // Still at minimum
        { count: 100, expectedLength: 4 },  // At threshold
        { count: 500, expectedLength: 5 },  // Next tier
        { count: 3000, expectedLength: 6 }, // Next tier
        { count: 20000, expectedLength: 7 }, // Next tier
        { count: 100000, expectedLength: 8 }, // Max tier
      ];

      for (const { count, expectedLength } of testCases) {
        const backend = createMockBackend(count);
        const cache = new IdLengthCache(backend);
        const length = cache.getHashLength();
        expect(length).toBe(expectedLength);
      }
    });

    it('should return cached element count', () => {
      const backend = createMockBackend(500);
      const cache = new IdLengthCache(backend);
      expect(cache.getElementCount()).toBe(500);
    });
  });

  describe('caching behavior', () => {
    it('should cache hash length after first access', () => {
      const backend = createMockBackend(100);
      const getElementCountSpy = spyOn(backend, 'getElementCount');

      const cache = new IdLengthCache(backend);

      // First call - should query
      cache.getHashLength();
      expect(getElementCountSpy).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      cache.getHashLength();
      expect(getElementCountSpy).toHaveBeenCalledTimes(1);
    });

    it('should track cache hits and misses', () => {
      const backend = createMockBackend(100);
      const cache = new IdLengthCache(backend);

      // First access - miss
      cache.getHashLength();
      let stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);

      // Second access - hit
      cache.getHashLength();
      stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(1);
    });

    it('should calculate hit rate correctly', () => {
      const backend = createMockBackend(100);
      const cache = new IdLengthCache(backend);

      // 1 miss, 3 hits = 75% hit rate
      cache.getHashLength(); // miss
      cache.getHashLength(); // hit
      cache.getHashLength(); // hit
      cache.getHashLength(); // hit

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0.75);
    });
  });

  describe('TTL expiration', () => {
    it('should expire cache after TTL', async () => {
      const backend = createMockBackend(100);
      const cache = new IdLengthCache(backend, { ttlMs: 50 });
      const getElementCountSpy = spyOn(backend, 'getElementCount');

      // First access
      cache.getHashLength();
      expect(getElementCountSpy).toHaveBeenCalledTimes(1);

      // Wait for TTL
      await new Promise(resolve => setTimeout(resolve, 60));

      // Should refresh
      cache.getHashLength();
      expect(getElementCountSpy).toHaveBeenCalledTimes(2);
    });

    it('should report staleness correctly', async () => {
      const backend = createMockBackend(100);
      const cache = new IdLengthCache(backend, { ttlMs: 50 });

      cache.getHashLength();
      expect(cache.isStale()).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 60));
      expect(cache.isStale()).toBe(true);
    });
  });

  describe('growth threshold', () => {
    it('should not refresh before growth threshold', () => {
      const backend = createMockBackend(400);
      const cache = new IdLengthCache(backend, { growthThreshold: 100 });
      const getElementCountSpy = spyOn(backend, 'getElementCount');

      cache.getHashLength();
      expect(getElementCountSpy).toHaveBeenCalledTimes(1);

      // Notify of 50 creates (below threshold)
      for (let i = 0; i < 50; i++) {
        cache.notifyCreate();
      }

      // Should not have refreshed
      expect(getElementCountSpy).toHaveBeenCalledTimes(1);
    });

    it('should refresh when growth causes length increase', () => {
      // Start at count where we're near a tier boundary
      const backend = createMockBackend(400); // length 4, next tier at 500
      const cache = new IdLengthCache(backend, { growthThreshold: 100 });
      const getElementCountSpy = spyOn(backend, 'getElementCount');

      cache.getHashLength();
      expect(cache.getHashLength()).toBe(4);
      expect(getElementCountSpy).toHaveBeenCalledTimes(1);

      // Update backend count to cross tier
      backend.setElementCount(600);

      // Notify of 100 creates (meets threshold)
      for (let i = 0; i < 100; i++) {
        cache.notifyCreate();
      }

      // Should have checked and refreshed (since projected count crosses tier)
      expect(getElementCountSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('force refresh', () => {
    it('should force refresh when requested', () => {
      const backend = createMockBackend(100);
      const cache = new IdLengthCache(backend);
      const getElementCountSpy = spyOn(backend, 'getElementCount');

      cache.getHashLength();
      expect(getElementCountSpy).toHaveBeenCalledTimes(1);

      cache.refresh();
      expect(getElementCountSpy).toHaveBeenCalledTimes(2);
    });

    it('should clear cache and refresh on next access', () => {
      const backend = createMockBackend(100);
      const cache = new IdLengthCache(backend);
      const getElementCountSpy = spyOn(backend, 'getElementCount');

      cache.getHashLength();
      expect(getElementCountSpy).toHaveBeenCalledTimes(1);

      cache.clear();
      cache.getHashLength();
      expect(getElementCountSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('configuration', () => {
    it('should respect custom minimum length', () => {
      const backend = createMockBackend(0);
      const cache = new IdLengthCache(backend, { minLength: 5 });
      expect(cache.getHashLength()).toBe(5);
    });

    it('should clamp minimum length to valid range', () => {
      const backend = createMockBackend(0);

      // Too low - should use MIN_HASH_LENGTH (3)
      const cacheLow = new IdLengthCache(backend, { minLength: 1 });
      expect(cacheLow.getHashLength()).toBeGreaterThanOrEqual(3);

      // Too high - should use MAX_HASH_LENGTH (8)
      const cacheHigh = new IdLengthCache(backend, { minLength: 10 });
      expect(cacheHigh.getHashLength()).toBeLessThanOrEqual(8);
    });

    it('should respect custom TTL', async () => {
      const backend = createMockBackend(100);
      const cache = new IdLengthCache(backend, { ttlMs: 20 });
      const getElementCountSpy = spyOn(backend, 'getElementCount');

      cache.getHashLength();

      // Before TTL
      await new Promise(resolve => setTimeout(resolve, 10));
      cache.getHashLength();
      expect(getElementCountSpy).toHaveBeenCalledTimes(1);

      // After TTL
      await new Promise(resolve => setTimeout(resolve, 15));
      cache.getHashLength();
      expect(getElementCountSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('statistics', () => {
    it('should return complete statistics', () => {
      const backend = createMockBackend(500);
      const cache = new IdLengthCache(backend);

      cache.getHashLength();
      cache.getHashLength();

      const stats = cache.getStats();
      expect(stats).toMatchObject({
        elementCount: 500,
        hashLength: 5,
        hits: 1,
        misses: 1,
      });
      expect(typeof stats.hitRate).toBe('number');
      expect(typeof stats.ageMs).toBe('number');
      expect(typeof stats.isStale).toBe('boolean');
    });

    it('should report age correctly', async () => {
      const backend = createMockBackend(100);
      const cache = new IdLengthCache(backend);

      cache.getHashLength();
      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = cache.getStats();
      expect(stats.ageMs).toBeGreaterThanOrEqual(50);
      expect(stats.ageMs).toBeLessThan(100);
    });
  });
});
