/**
 * Rate Limit Tracker Service Unit Tests
 *
 * Tests for the in-memory RateLimitTracker service.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { createRateLimitTracker, type RateLimitTracker } from './rate-limit-tracker.js';

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
