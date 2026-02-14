/**
 * Merge Command Tests
 *
 * Tests for the `sf merge` CLI command structure and options.
 * Note: Full integration tests require a git repository.
 */

import { describe, it, expect } from 'bun:test';
import { mergeCommand } from './merge.js';

describe('Merge Command Structure', () => {
  describe('mergeCommand', () => {
    it('should have correct name and description', () => {
      expect(mergeCommand.name).toBe('merge');
      expect(mergeCommand.description).toBe('Squash-merge a branch into the default branch');
    });

    it('should have handler', () => {
      expect(typeof mergeCommand.handler).toBe('function');
    });

    it('should have options', () => {
      expect(mergeCommand.options).toBeDefined();
      expect(mergeCommand.options!.length).toBe(4);
      expect(mergeCommand.options![0].name).toBe('branch');
      expect(mergeCommand.options![1].name).toBe('into');
      expect(mergeCommand.options![2].name).toBe('message');
      expect(mergeCommand.options![3].name).toBe('cleanup');
    });

    it('branch option should accept a value', () => {
      const branchOpt = mergeCommand.options!.find(o => o.name === 'branch');
      expect(branchOpt).toBeDefined();
      expect(branchOpt!.hasValue).toBe(true);
      expect(branchOpt!.short).toBe('b');
    });

    it('into option should accept a value', () => {
      const intoOpt = mergeCommand.options!.find(o => o.name === 'into');
      expect(intoOpt).toBeDefined();
      expect(intoOpt!.hasValue).toBe(true);
      expect(intoOpt!.short).toBe('i');
    });

    it('message option should accept a value', () => {
      const msgOpt = mergeCommand.options!.find(o => o.name === 'message');
      expect(msgOpt).toBeDefined();
      expect(msgOpt!.hasValue).toBe(true);
      expect(msgOpt!.short).toBe('m');
    });

    it('cleanup option should be a flag (no value)', () => {
      const cleanupOpt = mergeCommand.options!.find(o => o.name === 'cleanup');
      expect(cleanupOpt).toBeDefined();
      expect(cleanupOpt!.hasValue).toBeUndefined();
    });

    it('should have help text', () => {
      expect(mergeCommand.help).toBeDefined();
      expect(mergeCommand.help).toContain('Squash-merge');
      expect(mergeCommand.help).toContain('--cleanup');
    });

    it('should have usage text', () => {
      expect(mergeCommand.usage).toBe('sf merge [options]');
    });
  });
});
