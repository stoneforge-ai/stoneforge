/**
 * Dispatch Command Tests
 *
 * Tests for orchestrator CLI dispatch commands structure and validation.
 * Note: Full integration tests would require database setup.
 */

import { describe, it, expect } from 'bun:test';
import { dispatchCommand } from './dispatch.js';

describe('Dispatch Command Structure', () => {
  describe('dispatchCommand', () => {
    it('should have correct name and description', () => {
      expect(dispatchCommand.name).toBe('dispatch');
      expect(dispatchCommand.description).toBe('Dispatch a task to an agent');
    });

    it('should have handler', () => {
      expect(typeof dispatchCommand.handler).toBe('function');
    });

    it('should have options', () => {
      expect(dispatchCommand.options).toBeDefined();
      expect(dispatchCommand.options!.length).toBe(4);
      expect(dispatchCommand.options![0].name).toBe('branch');
      expect(dispatchCommand.options![1].name).toBe('worktree');
      expect(dispatchCommand.options![2].name).toBe('session');
      expect(dispatchCommand.options![3].name).toBe('markAsStarted');
    });
  });
});

describe('Dispatch Command Validation', () => {
  describe('dispatchCommand', () => {
    it('should fail without arguments', async () => {
      const result = await dispatchCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });

    it('should fail with only task-id', async () => {
      const result = await dispatchCommand.handler(['el-task123'], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });
});
