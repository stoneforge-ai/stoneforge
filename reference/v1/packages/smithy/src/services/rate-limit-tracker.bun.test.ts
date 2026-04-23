/**
 * Rate Limit Tracker Service Unit Tests
 *
 * Tests for the RateLimitTracker service, including in-memory behavior
 * and optional SQLite persistence via SettingsService.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createSettingsService, type SettingsService } from './settings-service.js';
import { createRateLimitTracker, RATE_LIMITS_SETTING_KEY, type RateLimitTracker } from './rate-limit-tracker.js';

describe('RateLimitTracker', () => {
  let tracker: RateLimitTracker;

  beforeEach(() => {
    tracker = createRateLimitTracker();
  });

  describe('markLimited + isLimited', () => {
    test('basic store and retrieve', () => {
      const futureDate = new Date(Date.now() + 60_000); // 1 minute from now
      tracker.markLimited('claude', futureDate);

      expect(tracker.isLimited('claude')).toBe(true);
    });

    test('isLimited returns false for unknown executable', () => {
      expect(tracker.isLimited('unknown-exec')).toBe(false);
    });

    test('multiple executables can be tracked independently', () => {
      const futureDate = new Date(Date.now() + 60_000);
      tracker.markLimited('claude', futureDate);
      tracker.markLimited('gpt-4', futureDate);

      expect(tracker.isLimited('claude')).toBe(true);
      expect(tracker.isLimited('gpt-4')).toBe(true);
      expect(tracker.isLimited('gemini')).toBe(false);
    });
  });

  describe('auto-expiry', () => {
    test('mark limited with past resetsAt returns false for isLimited', () => {
      const pastDate = new Date(Date.now() - 1_000); // 1 second ago
      tracker.markLimited('claude', pastDate);

      expect(tracker.isLimited('claude')).toBe(false);
    });

    test('expired entry is removed from getAllLimits', () => {
      const pastDate = new Date(Date.now() - 1_000);
      tracker.markLimited('claude', pastDate);

      const limits = tracker.getAllLimits();
      expect(limits).toHaveLength(0);
    });

    test('expired entries do not affect getSoonestResetTime', () => {
      const pastDate = new Date(Date.now() - 1_000);
      tracker.markLimited('claude', pastDate);

      expect(tracker.getSoonestResetTime()).toBeUndefined();
    });
  });

  describe('getAvailableExecutable', () => {
    test('returns first non-limited executable in chain', () => {
      const futureDate = new Date(Date.now() + 60_000);
      tracker.markLimited('claude', futureDate);

      const available = tracker.getAvailableExecutable(['claude', 'gpt-4', 'gemini']);
      expect(available).toBe('gpt-4');
    });

    test('returns first executable when none are limited', () => {
      const available = tracker.getAvailableExecutable(['claude', 'gpt-4', 'gemini']);
      expect(available).toBe('claude');
    });

    test('returns undefined when all executables are limited', () => {
      const futureDate = new Date(Date.now() + 60_000);
      tracker.markLimited('claude', futureDate);
      tracker.markLimited('gpt-4', futureDate);
      tracker.markLimited('gemini', futureDate);

      const available = tracker.getAvailableExecutable(['claude', 'gpt-4', 'gemini']);
      expect(available).toBeUndefined();
    });

    test('returns undefined for empty fallback chain', () => {
      const available = tracker.getAvailableExecutable([]);
      expect(available).toBeUndefined();
    });

    test('skips limited executables and returns first available', () => {
      const futureDate = new Date(Date.now() + 60_000);
      tracker.markLimited('claude', futureDate);
      tracker.markLimited('gpt-4', futureDate);

      const available = tracker.getAvailableExecutable(['claude', 'gpt-4', 'gemini']);
      expect(available).toBe('gemini');
    });
  });

  describe('getSoonestResetTime', () => {
    test('returns earliest reset time among limited executables', () => {
      const soon = new Date(Date.now() + 30_000);  // 30s from now
      const later = new Date(Date.now() + 120_000); // 2min from now

      tracker.markLimited('claude', later);
      tracker.markLimited('gpt-4', soon);

      const soonest = tracker.getSoonestResetTime();
      expect(soonest).toEqual(soon);
    });

    test('returns undefined when nothing is limited', () => {
      expect(tracker.getSoonestResetTime()).toBeUndefined();
    });

    test('returns the single reset time when only one executable is limited', () => {
      const futureDate = new Date(Date.now() + 60_000);
      tracker.markLimited('claude', futureDate);

      expect(tracker.getSoonestResetTime()).toEqual(futureDate);
    });
  });

  describe('isAllLimited', () => {
    test('returns true when all executables in chain are limited', () => {
      const futureDate = new Date(Date.now() + 60_000);
      tracker.markLimited('claude', futureDate);
      tracker.markLimited('gpt-4', futureDate);

      expect(tracker.isAllLimited(['claude', 'gpt-4'])).toBe(true);
    });

    test('returns false when at least one executable is available', () => {
      const futureDate = new Date(Date.now() + 60_000);
      tracker.markLimited('claude', futureDate);

      expect(tracker.isAllLimited(['claude', 'gpt-4'])).toBe(false);
    });

    test('returns false for empty fallback chain', () => {
      expect(tracker.isAllLimited([])).toBe(false);
    });

    test('returns false when expired entries make executables available', () => {
      const pastDate = new Date(Date.now() - 1_000);
      const futureDate = new Date(Date.now() + 60_000);
      tracker.markLimited('claude', pastDate);
      tracker.markLimited('gpt-4', futureDate);

      expect(tracker.isAllLimited(['claude', 'gpt-4'])).toBe(false);
    });
  });

  describe('markLimited with later resetsAt updates entry', () => {
    test('updating with a later resetsAt extends the limit', () => {
      const sooner = new Date(Date.now() + 30_000);
      const later = new Date(Date.now() + 120_000);

      tracker.markLimited('claude', sooner);
      tracker.markLimited('claude', later);

      // Should use the later time
      const limits = tracker.getAllLimits();
      const claudeEntry = limits.find((e) => e.executable === 'claude');
      expect(claudeEntry).toBeDefined();
      expect(claudeEntry!.resetsAt).toEqual(later);
    });

    test('updating with an earlier resetsAt does not downgrade', () => {
      const later = new Date(Date.now() + 120_000);
      const sooner = new Date(Date.now() + 30_000);

      tracker.markLimited('claude', later);
      tracker.markLimited('claude', sooner);

      // Should still use the later time (don't downgrade)
      const limits = tracker.getAllLimits();
      const claudeEntry = limits.find((e) => e.executable === 'claude');
      expect(claudeEntry).toBeDefined();
      expect(claudeEntry!.resetsAt).toEqual(later);
    });
  });

  describe('getAllLimits', () => {
    test('returns all currently-limited entries', () => {
      const future1 = new Date(Date.now() + 60_000);
      const future2 = new Date(Date.now() + 120_000);

      tracker.markLimited('claude', future1);
      tracker.markLimited('gpt-4', future2);

      const limits = tracker.getAllLimits();
      expect(limits).toHaveLength(2);

      const executables = limits.map((e) => e.executable).sort();
      expect(executables).toEqual(['claude', 'gpt-4']);
    });

    test('entries include executable, resetsAt, and recordedAt', () => {
      const futureDate = new Date(Date.now() + 60_000);
      const beforeMark = new Date();
      tracker.markLimited('claude', futureDate);

      const limits = tracker.getAllLimits();
      expect(limits).toHaveLength(1);

      const entry = limits[0]!;
      expect(entry.executable).toBe('claude');
      expect(entry.resetsAt).toEqual(futureDate);
      expect(entry.recordedAt.getTime()).toBeGreaterThanOrEqual(beforeMark.getTime());
      expect(entry.recordedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    test('returns empty array when nothing is limited', () => {
      expect(tracker.getAllLimits()).toEqual([]);
    });
  });

  describe('clear', () => {
    test('clears all tracked state', () => {
      const futureDate = new Date(Date.now() + 60_000);
      tracker.markLimited('claude', futureDate);
      tracker.markLimited('gpt-4', futureDate);

      tracker.clear();

      expect(tracker.isLimited('claude')).toBe(false);
      expect(tracker.isLimited('gpt-4')).toBe(false);
      expect(tracker.getAllLimits()).toEqual([]);
      expect(tracker.getSoonestResetTime()).toBeUndefined();
    });
  });
});

// ============================================================================
// Persistence Tests (with real SQLite via SettingsService)
// ============================================================================

describe('RateLimitTracker persistence', () => {
  let settingsService: SettingsService;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = `/tmp/rate-limit-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath });
    initializeSchema(storage);
    settingsService = createSettingsService(storage);
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('markLimited persists state to settings', () => {
    const tracker = createRateLimitTracker(settingsService);
    const futureDate = new Date(Date.now() + 60_000);

    tracker.markLimited('claude', futureDate);

    // Verify the setting was written
    const setting = settingsService.getSetting(RATE_LIMITS_SETTING_KEY);
    expect(setting).toBeDefined();
    expect(setting!.value).toBeDefined();

    const persisted = setting!.value as Record<string, { resetsAt: string; recordedAt: string }>;
    expect(persisted['claude']).toBeDefined();
    expect(persisted['claude']!.resetsAt).toBe(futureDate.toISOString());
    expect(persisted['claude']!.recordedAt).toBeDefined();
  });

  test('new tracker hydrates persisted state (simulates restart)', () => {
    const futureDate = new Date(Date.now() + 60_000);

    // First tracker: mark limited and let it persist
    const tracker1 = createRateLimitTracker(settingsService);
    tracker1.markLimited('claude', futureDate);
    tracker1.markLimited('gpt-4', futureDate);

    expect(tracker1.isLimited('claude')).toBe(true);
    expect(tracker1.isLimited('gpt-4')).toBe(true);

    // Second tracker: simulates a restart — hydrates from same settings
    const tracker2 = createRateLimitTracker(settingsService);

    expect(tracker2.isLimited('claude')).toBe(true);
    expect(tracker2.isLimited('gpt-4')).toBe(true);
    expect(tracker2.getAllLimits()).toHaveLength(2);
  });

  test('hydration skips entries whose resetsAt is in the past', () => {
    const pastDate = new Date(Date.now() - 5_000); // 5 seconds ago
    const futureDate = new Date(Date.now() + 60_000);

    // Manually write persisted state with one expired entry
    settingsService.setSetting(RATE_LIMITS_SETTING_KEY, {
      'expired-exec': {
        resetsAt: pastDate.toISOString(),
        recordedAt: new Date().toISOString(),
      },
      'active-exec': {
        resetsAt: futureDate.toISOString(),
        recordedAt: new Date().toISOString(),
      },
    });

    // New tracker should only hydrate the active entry
    const tracker = createRateLimitTracker(settingsService);

    expect(tracker.isLimited('expired-exec')).toBe(false);
    expect(tracker.isLimited('active-exec')).toBe(true);
    expect(tracker.getAllLimits()).toHaveLength(1);
    expect(tracker.getAllLimits()[0]!.executable).toBe('active-exec');
  });

  test('clear removes persisted state', () => {
    const futureDate = new Date(Date.now() + 60_000);

    const tracker = createRateLimitTracker(settingsService);
    tracker.markLimited('claude', futureDate);

    // Verify it's persisted
    expect(settingsService.getSetting(RATE_LIMITS_SETTING_KEY)).toBeDefined();

    tracker.clear();

    // Verify the setting was cleared (written as empty object)
    const setting = settingsService.getSetting(RATE_LIMITS_SETTING_KEY);
    expect(setting).toBeDefined();
    expect(setting!.value).toEqual({});

    // New tracker should see no limits
    const tracker2 = createRateLimitTracker(settingsService);
    expect(tracker2.getAllLimits()).toEqual([]);
  });

  test('persisted resetsAt and recordedAt are accurate ISO dates', () => {
    const futureDate = new Date(Date.now() + 60_000);
    const beforeMark = new Date();

    const tracker = createRateLimitTracker(settingsService);
    tracker.markLimited('claude', futureDate);

    // Read back from settings
    const setting = settingsService.getSetting(RATE_LIMITS_SETTING_KEY);
    const persisted = setting!.value as Record<string, { resetsAt: string; recordedAt: string }>;

    expect(new Date(persisted['claude']!.resetsAt).toISOString()).toBe(futureDate.toISOString());
    const recordedAt = new Date(persisted['claude']!.recordedAt);
    expect(recordedAt.getTime()).toBeGreaterThanOrEqual(beforeMark.getTime());
    expect(recordedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('multiple markLimited calls update persisted state', () => {
    const future1 = new Date(Date.now() + 60_000);
    const future2 = new Date(Date.now() + 120_000);

    const tracker = createRateLimitTracker(settingsService);
    tracker.markLimited('claude', future1);
    tracker.markLimited('gpt-4', future2);

    // Both should be persisted
    const setting = settingsService.getSetting(RATE_LIMITS_SETTING_KEY);
    const persisted = setting!.value as Record<string, { resetsAt: string; recordedAt: string }>;
    expect(Object.keys(persisted)).toHaveLength(2);
    expect(persisted['claude']).toBeDefined();
    expect(persisted['gpt-4']).toBeDefined();
  });

  test('tracker works without settingsService (backward-compatible)', () => {
    // No settingsService — purely in-memory, no errors
    const tracker = createRateLimitTracker();
    const futureDate = new Date(Date.now() + 60_000);

    tracker.markLimited('claude', futureDate);
    expect(tracker.isLimited('claude')).toBe(true);
    tracker.clear();
    expect(tracker.isLimited('claude')).toBe(false);

    // No setting written
    expect(settingsService.getSetting(RATE_LIMITS_SETTING_KEY)).toBeUndefined();
  });

  test('hydration handles malformed persisted data gracefully', () => {
    // Write junk data
    settingsService.setSetting(RATE_LIMITS_SETTING_KEY, {
      'bad-entry': { resetsAt: 'not-a-date', recordedAt: 'also-bad' },
      'missing-fields': {},
      'null-entry': null,
    });

    // Should not throw, just skip bad entries
    const tracker = createRateLimitTracker(settingsService);
    expect(tracker.getAllLimits()).toEqual([]);
  });

  test('hydration handles non-object setting value gracefully', () => {
    // Write a non-object value
    settingsService.setSetting(RATE_LIMITS_SETTING_KEY, 'just-a-string');

    // Should not throw
    const tracker = createRateLimitTracker(settingsService);
    expect(tracker.getAllLimits()).toEqual([]);
  });

  test('persisted state does not include expired entries from markLimited with past date', () => {
    const pastDate = new Date(Date.now() - 1_000);
    const futureDate = new Date(Date.now() + 60_000);

    const tracker = createRateLimitTracker(settingsService);
    tracker.markLimited('claude', futureDate);
    tracker.markLimited('expired', pastDate);

    // The persist call expires stale entries before writing
    const setting = settingsService.getSetting(RATE_LIMITS_SETTING_KEY);
    const persisted = setting!.value as Record<string, { resetsAt: string; recordedAt: string }>;

    // Only 'claude' should be persisted (expired entry cleaned up)
    expect(Object.keys(persisted)).toHaveLength(1);
    expect(persisted['claude']).toBeDefined();
    expect(persisted['expired']).toBeUndefined();
  });
});
