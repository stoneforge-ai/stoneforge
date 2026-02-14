/**
 * Orchestrator Task Metadata Tests
 */

import { describe, test, expect } from 'bun:test';
import type { ElementId } from '@stoneforge/core';
import {
  type OrchestratorTaskMeta,
  type MergeStatus,
  type TestResult,
  MergeStatusValues,
  isMergeStatus,
  isTestResult,
  getOrchestratorTaskMeta,
  setOrchestratorTaskMeta,
  updateOrchestratorTaskMeta,
  isOrchestratorTaskMeta,
  generateBranchName,
  generateWorktreePath,
  generateSessionBranchName,
  generateSessionWorktreePath,
  createSlugFromTitle,
} from './task-meta.js';

describe('MergeStatus', () => {
  test('MergeStatusValues contains all valid statuses', () => {
    expect(MergeStatusValues).toEqual([
      'pending',
      'testing',
      'merging',
      'merged',
      'conflict',
      'test_failed',
      'failed',
      'not_applicable',
    ]);
  });

  test('isMergeStatus returns true for valid statuses', () => {
    for (const status of MergeStatusValues) {
      expect(isMergeStatus(status)).toBe(true);
    }
  });

  test('isMergeStatus returns false for invalid statuses', () => {
    expect(isMergeStatus('complete')).toBe(false);
    expect(isMergeStatus('in_progress')).toBe(false);
    expect(isMergeStatus('')).toBe(false);
    expect(isMergeStatus(null)).toBe(false);
    expect(isMergeStatus(undefined)).toBe(false);
  });
});

describe('TestResult', () => {
  test('isTestResult validates test results', () => {
    expect(isTestResult({ passed: true, completedAt: '2024-01-01T00:00:00Z' })).toBe(true);
    expect(isTestResult({ passed: false, completedAt: '2024-01-01T00:00:00Z', errorMessage: 'Tests failed' })).toBe(true);
    expect(isTestResult({ passed: true, completedAt: '2024-01-01T00:00:00Z', totalTests: 10, passedTests: 10 })).toBe(true);
  });

  test('isTestResult rejects invalid test results', () => {
    expect(isTestResult(null)).toBe(false);
    expect(isTestResult(undefined)).toBe(false);
    expect(isTestResult({})).toBe(false);
    expect(isTestResult({ passed: true })).toBe(false); // missing completedAt
    expect(isTestResult({ completedAt: '2024-01-01T00:00:00Z' })).toBe(false); // missing passed
    expect(isTestResult({ passed: 'yes', completedAt: '2024-01-01T00:00:00Z' })).toBe(false); // passed not boolean
  });
});

describe('OrchestratorTaskMeta utilities', () => {
  describe('getOrchestratorTaskMeta', () => {
    test('extracts orchestrator metadata from task metadata', () => {
      const taskMeta = {
        orchestrator: {
          branch: 'agent/alice/task-1-feature',
          worktree: '.stoneforge/.worktrees/alice-feature',
        },
      };

      const result = getOrchestratorTaskMeta(taskMeta);
      expect(result).toEqual({
        branch: 'agent/alice/task-1-feature',
        worktree: '.stoneforge/.worktrees/alice-feature',
      });
    });

    test('returns undefined when no orchestrator metadata', () => {
      expect(getOrchestratorTaskMeta(undefined)).toBeUndefined();
      expect(getOrchestratorTaskMeta({})).toBeUndefined();
      expect(getOrchestratorTaskMeta({ other: 'data' })).toBeUndefined();
    });
  });

  describe('setOrchestratorTaskMeta', () => {
    test('sets orchestrator metadata on task metadata', () => {
      const existingMeta = { customField: 'value' };
      const orchMeta: OrchestratorTaskMeta = {
        branch: 'agent/alice/task-1',
        worktree: '.stoneforge/.worktrees/alice-task-1',
      };

      const result = setOrchestratorTaskMeta(existingMeta, orchMeta);

      expect(result).toEqual({
        customField: 'value',
        orchestrator: {
          branch: 'agent/alice/task-1',
          worktree: '.stoneforge/.worktrees/alice-task-1',
        },
      });
    });

    test('overwrites existing orchestrator metadata', () => {
      const existingMeta = {
        orchestrator: { branch: 'old-branch' },
      };
      const orchMeta: OrchestratorTaskMeta = {
        branch: 'new-branch',
      };

      const result = setOrchestratorTaskMeta(existingMeta, orchMeta);

      expect(result.orchestrator).toEqual({ branch: 'new-branch' });
    });
  });

  describe('updateOrchestratorTaskMeta', () => {
    test('updates existing orchestrator metadata', () => {
      const existingMeta = {
        orchestrator: {
          branch: 'agent/alice/task-1',
          worktree: '.stoneforge/.worktrees/alice-task-1',
        },
      };

      const result = updateOrchestratorTaskMeta(existingMeta, {
        mergeStatus: 'pending',
      });

      expect(result.orchestrator).toEqual({
        branch: 'agent/alice/task-1',
        worktree: '.stoneforge/.worktrees/alice-task-1',
        mergeStatus: 'pending',
      });
    });

    test('creates orchestrator metadata if not present', () => {
      const result = updateOrchestratorTaskMeta(undefined, {
        branch: 'agent/alice/task-1',
      });

      expect(result.orchestrator).toEqual({
        branch: 'agent/alice/task-1',
      });
    });
  });
});

describe('isOrchestratorTaskMeta', () => {
  test('validates valid orchestrator task metadata', () => {
    expect(isOrchestratorTaskMeta({})).toBe(true); // All fields optional
    expect(isOrchestratorTaskMeta({ branch: 'agent/alice/task-1' })).toBe(true);
    expect(isOrchestratorTaskMeta({ worktree: '.stoneforge/.worktrees/alice' })).toBe(true);
    expect(isOrchestratorTaskMeta({ sessionId: 'session-123' })).toBe(true);
    expect(isOrchestratorTaskMeta({ mergeStatus: 'pending' })).toBe(true);
    expect(isOrchestratorTaskMeta({
      branch: 'agent/alice/task-1',
      worktree: '.stoneforge/.worktrees/alice',
      sessionId: 'session-123',
      mergeStatus: 'testing',
    })).toBe(true);
  });

  test('rejects invalid orchestrator task metadata', () => {
    expect(isOrchestratorTaskMeta(null)).toBe(false);
    expect(isOrchestratorTaskMeta(undefined)).toBe(false);
    expect(isOrchestratorTaskMeta({ branch: 123 })).toBe(false);
    expect(isOrchestratorTaskMeta({ worktree: 123 })).toBe(false);
    expect(isOrchestratorTaskMeta({ sessionId: 123 })).toBe(false);
    expect(isOrchestratorTaskMeta({ mergeStatus: 'invalid' })).toBe(false);
  });
});

describe('Branch and Worktree naming utilities', () => {
  describe('createSlugFromTitle', () => {
    test('converts title to slug', () => {
      expect(createSlugFromTitle('Implement user authentication')).toBe('implement-user-authentication');
      expect(createSlugFromTitle('Fix Bug #123')).toBe('fix-bug-123');
      expect(createSlugFromTitle('Add New Feature!')).toBe('add-new-feature');
    });

    test('handles special characters', () => {
      expect(createSlugFromTitle('Test: API Endpoints')).toBe('test-api-endpoints');
      expect(createSlugFromTitle('Fix (urgent) issue')).toBe('fix-urgent-issue');
    });

    test('truncates long titles', () => {
      const longTitle = 'This is a very long title that should be truncated because it exceeds the maximum length';
      const slug = createSlugFromTitle(longTitle);
      expect(slug.length).toBeLessThanOrEqual(30);
    });

    test('handles edge cases', () => {
      expect(createSlugFromTitle('')).toBe('');
      expect(createSlugFromTitle('---')).toBe('');
      expect(createSlugFromTitle('   ')).toBe('');
    });
  });

  describe('generateBranchName', () => {
    test('generates branch name with slug', () => {
      const taskId = 'task-abc123' as ElementId;
      const result = generateBranchName('alice', taskId, 'implement-feature');
      expect(result).toBe('agent/alice/task-abc123-implement-feature');
    });

    test('generates branch name without slug', () => {
      const taskId = 'task-abc123' as ElementId;
      const result = generateBranchName('alice', taskId);
      expect(result).toBe('agent/alice/task-abc123');
    });

    test('sanitizes worker name', () => {
      const taskId = 'task-abc123' as ElementId;
      const result = generateBranchName('Alice_Worker', taskId, 'feature');
      expect(result).toBe('agent/alice-worker/task-abc123-feature');
    });
  });

  describe('generateWorktreePath', () => {
    test('generates worktree path with slug', () => {
      const result = generateWorktreePath('alice', 'implement-feature');
      expect(result).toBe('.stoneforge/.worktrees/alice-implement-feature');
    });

    test('generates worktree path without slug', () => {
      const result = generateWorktreePath('alice');
      expect(result).toBe('.stoneforge/.worktrees/alice');
    });

    test('sanitizes worker name', () => {
      const result = generateWorktreePath('Bob_Worker', 'feature');
      expect(result).toBe('.stoneforge/.worktrees/bob-worker-feature');
    });
  });

  describe('generateSessionBranchName', () => {
    test('generates session branch name', () => {
      const result = generateSessionBranchName('bob', '20240115143022');
      expect(result).toBe('session/bob-20240115143022');
    });

    test('sanitizes worker name', () => {
      const result = generateSessionBranchName('Alice_Worker', '20240115143022');
      expect(result).toBe('session/alice-worker-20240115143022');
    });

    test('handles special characters in name', () => {
      const result = generateSessionBranchName('My Worker!', '20240115143022');
      expect(result).toBe('session/my-worker--20240115143022');
    });
  });

  describe('generateSessionWorktreePath', () => {
    test('generates session worktree path', () => {
      const result = generateSessionWorktreePath('bob', '20240115143022');
      expect(result).toBe('.stoneforge/.worktrees/bob-session-20240115143022');
    });

    test('sanitizes worker name', () => {
      const result = generateSessionWorktreePath('Alice_Worker', '20240115143022');
      expect(result).toBe('.stoneforge/.worktrees/alice-worker-session-20240115143022');
    });

    test('handles special characters in name', () => {
      const result = generateSessionWorktreePath('My Worker!', '20240115143022');
      expect(result).toBe('.stoneforge/.worktrees/my-worker--session-20240115143022');
    });
  });
});
