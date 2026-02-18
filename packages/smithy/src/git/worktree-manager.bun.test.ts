/**
 * Worktree Manager Unit Tests
 *
 * Tests for the WorktreeManager which provides git worktree operations
 * for parallel development in the orchestration system.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  createWorktreeManager,
  type WorktreeManager,
  GitRepositoryNotFoundError,
  WorktreeError,
  isWorktreeState,
  isValidStateTransition,
  getWorktreeStateDescription,
  type WorktreeState,
} from './worktree-manager.js';
import {
  generateBranchName,
  generateWorktreePath,
  createSlugFromTitle,
} from '../types/task-meta.js';
import type { ElementId } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a temporary git repository for testing
 */
function createTempGitRepo(): string {
  const tempDir = `/tmp/worktree-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fs.mkdirSync(tempDir, { recursive: true });

  // Initialize git repo
  execSync('git init', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'pipe' });

  // Create initial commit (required for worktrees)
  fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Project\n');
  execSync('git add README.md', { cwd: tempDir, stdio: 'pipe' });
  execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'pipe' });

  return tempDir;
}

/**
 * Cleans up a temporary directory
 */
function cleanupTempDir(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    // Need to handle git worktrees specially - remove them first
    try {
      execSync('git worktree prune', { cwd: tempDir, stdio: 'pipe' });
    } catch {
      // Ignore
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Unit Tests - Type Guards and Utilities
// ============================================================================

describe('Worktree Type Guards and Utilities', () => {
  describe('isWorktreeState', () => {
    test('returns true for valid states', () => {
      expect(isWorktreeState('creating')).toBe(true);
      expect(isWorktreeState('active')).toBe(true);
      expect(isWorktreeState('suspended')).toBe(true);
      expect(isWorktreeState('merging')).toBe(true);
      expect(isWorktreeState('cleaning')).toBe(true);
      expect(isWorktreeState('archived')).toBe(true);
    });

    test('returns false for invalid states', () => {
      expect(isWorktreeState('invalid')).toBe(false);
      expect(isWorktreeState('')).toBe(false);
      expect(isWorktreeState(null)).toBe(false);
      expect(isWorktreeState(undefined)).toBe(false);
      expect(isWorktreeState(123)).toBe(false);
    });
  });

  describe('isValidStateTransition', () => {
    test('creating can transition to active or cleaning', () => {
      expect(isValidStateTransition('creating', 'active')).toBe(true);
      expect(isValidStateTransition('creating', 'cleaning')).toBe(true);
      expect(isValidStateTransition('creating', 'suspended')).toBe(false);
    });

    test('active can transition to suspended, merging, or cleaning', () => {
      expect(isValidStateTransition('active', 'suspended')).toBe(true);
      expect(isValidStateTransition('active', 'merging')).toBe(true);
      expect(isValidStateTransition('active', 'cleaning')).toBe(true);
      expect(isValidStateTransition('active', 'archived')).toBe(false);
    });

    test('suspended can transition to active or cleaning', () => {
      expect(isValidStateTransition('suspended', 'active')).toBe(true);
      expect(isValidStateTransition('suspended', 'cleaning')).toBe(true);
      expect(isValidStateTransition('suspended', 'merging')).toBe(false);
    });

    test('merging can transition to archived, cleaning, or active', () => {
      expect(isValidStateTransition('merging', 'archived')).toBe(true);
      expect(isValidStateTransition('merging', 'cleaning')).toBe(true);
      expect(isValidStateTransition('merging', 'active')).toBe(true);
    });

    test('cleaning can only transition to archived', () => {
      expect(isValidStateTransition('cleaning', 'archived')).toBe(true);
      expect(isValidStateTransition('cleaning', 'active')).toBe(false);
    });

    test('archived cannot transition anywhere', () => {
      expect(isValidStateTransition('archived', 'active')).toBe(false);
      expect(isValidStateTransition('archived', 'creating')).toBe(false);
    });
  });

  describe('getWorktreeStateDescription', () => {
    test('returns descriptions for all states', () => {
      expect(getWorktreeStateDescription('creating')).toBe('Being created');
      expect(getWorktreeStateDescription('active')).toBe('Active and in use');
      expect(getWorktreeStateDescription('suspended')).toBe('Suspended (can be resumed)');
      expect(getWorktreeStateDescription('merging')).toBe('Branch being merged');
      expect(getWorktreeStateDescription('cleaning')).toBe('Being cleaned up');
      expect(getWorktreeStateDescription('archived')).toBe('Archived (removed)');
    });

    test('returns Unknown for invalid state', () => {
      expect(getWorktreeStateDescription('invalid' as WorktreeState)).toBe('Unknown');
    });
  });
});

// ============================================================================
// Unit Tests - Branch and Path Generation (from task-meta.ts)
// ============================================================================

describe('Branch and Path Generation', () => {
  describe('generateBranchName', () => {
    test('generates branch with slug', () => {
      const branch = generateBranchName('alice', 'task-123' as ElementId, 'implement-feature');
      expect(branch).toBe('agent/alice/task-123-implement-feature');
    });

    test('generates branch without slug', () => {
      const branch = generateBranchName('alice', 'task-123' as ElementId);
      expect(branch).toBe('agent/alice/task-123');
    });

    test('sanitizes worker name', () => {
      const branch = generateBranchName('Alice Smith', 'task-123' as ElementId, 'feature');
      expect(branch).toBe('agent/alice-smith/task-123-feature');
    });

    test('truncates long slugs', () => {
      const longSlug = 'this-is-a-very-long-slug-that-should-be-truncated-to-fit';
      const branch = generateBranchName('alice', 'task-123' as ElementId, longSlug);
      expect(branch.length).toBeLessThan(80); // Reasonable max length
    });
  });

  describe('generateWorktreePath', () => {
    test('generates path with slug', () => {
      const wtPath = generateWorktreePath('alice', 'feature');
      expect(wtPath).toBe('.stoneforge/.worktrees/alice-feature');
    });

    test('generates path without slug', () => {
      const wtPath = generateWorktreePath('alice');
      expect(wtPath).toBe('.stoneforge/.worktrees/alice');
    });

    test('sanitizes worker name', () => {
      const wtPath = generateWorktreePath('Alice Smith', 'feature');
      expect(wtPath).toBe('.stoneforge/.worktrees/alice-smith-feature');
    });
  });

  describe('createSlugFromTitle', () => {
    test('converts title to slug', () => {
      expect(createSlugFromTitle('Implement Feature')).toBe('implement-feature');
    });

    test('handles special characters', () => {
      expect(createSlugFromTitle('Fix bug #123!')).toBe('fix-bug-123');
    });

    test('collapses multiple spaces/hyphens', () => {
      expect(createSlugFromTitle('Fix   multiple   spaces')).toBe('fix-multiple-spaces');
    });

    test('truncates long titles', () => {
      const longTitle = 'This is a very long title that should be truncated to a reasonable length';
      const slug = createSlugFromTitle(longTitle);
      expect(slug.length).toBeLessThanOrEqual(30);
    });
  });
});

// ============================================================================
// Unit Tests - WorktreeManager Initialization
// ============================================================================

describe('WorktreeManager Initialization', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempGitRepo();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('initializes successfully with git repo', async () => {
    const manager = createWorktreeManager({ workspaceRoot: tempDir });
    await manager.initWorkspace();

    expect(manager.isInitialized()).toBe(true);
    expect(manager.getWorkspaceRoot()).toBe(tempDir);
  });

  test('creates .stoneforge/.worktrees directory on init', async () => {
    const manager = createWorktreeManager({ workspaceRoot: tempDir });
    await manager.initWorkspace();

    expect(fs.existsSync(path.join(tempDir, '.stoneforge/.worktrees'))).toBe(true);
  });

  test('adds .stoneforge/.worktrees to .gitignore', async () => {
    const manager = createWorktreeManager({ workspaceRoot: tempDir });
    await manager.initWorkspace();

    const gitignore = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('/.stoneforge/.worktrees/');
  });

  test('throws GitRepositoryNotFoundError for non-git directory', async () => {
    const nonGitDir = `/tmp/non-git-${Date.now()}`;
    fs.mkdirSync(nonGitDir, { recursive: true });

    try {
      const manager = createWorktreeManager({ workspaceRoot: nonGitDir });
      await expect(manager.initWorkspace()).rejects.toThrow(GitRepositoryNotFoundError);
    } finally {
      cleanupTempDir(nonGitDir);
    }
  });

  test('throws error when using manager before initialization', async () => {
    const manager = createWorktreeManager({ workspaceRoot: tempDir });

    await expect(
      manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
      })
    ).rejects.toThrow('not initialized');
  });
});

// ============================================================================
// Unit Tests - Worktree Creation and Removal
// ============================================================================

describe('WorktreeManager Operations', () => {
  let tempDir: string;
  let manager: WorktreeManager;

  beforeEach(async () => {
    tempDir = createTempGitRepo();
    manager = createWorktreeManager({ workspaceRoot: tempDir });
    await manager.initWorkspace();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('createWorktree', () => {
    test('creates worktree with auto-generated paths', async () => {
      const result = await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
        taskTitle: 'Implement Feature',
      });

      expect(result.branch).toBe('agent/alice/task-123-implement-feature');
      expect(result.branchCreated).toBe(true);
      expect(result.worktree.state).toBe('active');
      expect(result.worktree.agentName).toBe('alice');
      expect(fs.existsSync(result.path)).toBe(true);
    });

    test('creates worktree with custom branch and path', async () => {
      const result = await manager.createWorktree({
        agentName: 'bob',
        taskId: 'task-456' as ElementId,
        customBranch: 'feature/custom-branch',
        customPath: '.stoneforge/.worktrees/custom-path',
      });

      expect(result.branch).toBe('feature/custom-branch');
      expect(result.worktree.relativePath).toBe('.stoneforge/.worktrees/custom-path');
      expect(fs.existsSync(result.path)).toBe(true);
    });

    test('removes stale worktree and recreates if worktree already exists', async () => {
      const first = await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
      });
      expect(fs.existsSync(first.path)).toBe(true);

      // Creating the same worktree again should succeed by removing the stale one
      const second = await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
      });
      expect(fs.existsSync(second.path)).toBe(true);
      expect(second.path).toBe(first.path);
    });

    test('uses existing branch if it already exists', async () => {
      // Create a branch first
      execSync('git branch existing-branch', { cwd: tempDir, stdio: 'pipe' });

      const result = await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
        customBranch: 'existing-branch',
      });

      expect(result.branch).toBe('existing-branch');
      expect(result.branchCreated).toBe(false);
    });
  });

  describe('removeWorktree', () => {
    test('removes worktree successfully', async () => {
      const result = await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
      });

      await manager.removeWorktree(result.worktree.relativePath);

      expect(fs.existsSync(result.path)).toBe(false);
      const exists = await manager.worktreeExists(result.worktree.relativePath);
      expect(exists).toBe(false);
    });

    test('removes worktree and deletes branch', async () => {
      const result = await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
      });

      await manager.removeWorktree(result.worktree.relativePath, {
        deleteBranch: true,
        forceBranchDelete: true,
      });

      const branchExists = await manager.branchExists(result.branch);
      expect(branchExists).toBe(false);
    });

    test('throws error for non-existent worktree', async () => {
      await expect(
        manager.removeWorktree('.stoneforge/.worktrees/nonexistent')
      ).rejects.toThrow('Worktree not found');
    });

    test('throws error when trying to remove main worktree', async () => {
      // The main worktree is the tempDir itself
      await expect(
        manager.removeWorktree(tempDir)
      ).rejects.toThrow('Cannot remove the main worktree');
    });
  });

  describe('suspendWorktree and resumeWorktree', () => {
    test('suspends and resumes worktree', async () => {
      const result = await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
      });

      await manager.suspendWorktree(result.worktree.relativePath);
      let worktree = await manager.getWorktree(result.worktree.relativePath);
      expect(worktree?.state).toBe('suspended');

      await manager.resumeWorktree(result.worktree.relativePath);
      worktree = await manager.getWorktree(result.worktree.relativePath);
      expect(worktree?.state).toBe('active');
    });

    test('throws error when suspending non-existent worktree', async () => {
      await expect(
        manager.suspendWorktree('.stoneforge/.worktrees/nonexistent')
      ).rejects.toThrow('Worktree not found');
    });

    test('throws error when resuming active worktree', async () => {
      const result = await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
      });

      await expect(
        manager.resumeWorktree(result.worktree.relativePath)
      ).rejects.toThrow('Cannot resume worktree in state');
    });
  });

  describe('listWorktrees', () => {
    test('lists all worktrees excluding main', async () => {
      await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-1' as ElementId,
      });
      await manager.createWorktree({
        agentName: 'bob',
        taskId: 'task-2' as ElementId,
      });

      const worktrees = await manager.listWorktrees();
      expect(worktrees.length).toBe(2);
      expect(worktrees.some(w => w.branch.includes('alice'))).toBe(true);
      expect(worktrees.some(w => w.branch.includes('bob'))).toBe(true);
    });

    test('lists all worktrees including main', async () => {
      await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-1' as ElementId,
      });

      const worktrees = await manager.listWorktrees(true);
      expect(worktrees.length).toBe(2); // main + alice
      expect(worktrees.some(w => w.isMain)).toBe(true);
    });
  });

  describe('getWorktree', () => {
    test('gets worktree by relative path', async () => {
      const result = await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
      });

      const worktree = await manager.getWorktree(result.worktree.relativePath);
      expect(worktree).toBeDefined();
      expect(worktree?.branch).toBe(result.branch);
    });

    test('gets worktree by absolute path', async () => {
      const result = await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-123' as ElementId,
      });

      const worktree = await manager.getWorktree(result.path);
      expect(worktree).toBeDefined();
      expect(worktree?.branch).toBe(result.branch);
    });

    test('returns undefined for non-existent worktree', async () => {
      const worktree = await manager.getWorktree('.stoneforge/.worktrees/nonexistent');
      expect(worktree).toBeUndefined();
    });
  });

  describe('getWorktreePath', () => {
    test('generates worktree path', () => {
      const wtPath = manager.getWorktreePath('alice', 'Feature Task');
      expect(wtPath).toBe(path.join(tempDir, '.stoneforge/.worktrees/alice-feature-task'));
    });

    test('generates worktree path without title', () => {
      const wtPath = manager.getWorktreePath('alice');
      expect(wtPath).toBe(path.join(tempDir, '.stoneforge/.worktrees/alice'));
    });
  });

  describe('getWorktreesForAgent', () => {
    test('gets worktrees for specific agent', async () => {
      await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-1' as ElementId,
        taskTitle: 'First Task',
      });
      await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-2' as ElementId,
        taskTitle: 'Second Task',
      });
      await manager.createWorktree({
        agentName: 'bob',
        taskId: 'task-3' as ElementId,
      });

      const aliceWorktrees = await manager.getWorktreesForAgent('alice');
      expect(aliceWorktrees.length).toBe(2);

      const bobWorktrees = await manager.getWorktreesForAgent('bob');
      expect(bobWorktrees.length).toBe(1);
    });

    test('returns empty array for agent with no worktrees', async () => {
      const worktrees = await manager.getWorktreesForAgent('nonexistent');
      expect(worktrees.length).toBe(0);
    });
  });
});

// ============================================================================
// Unit Tests - Branch Operations
// ============================================================================

describe('WorktreeManager Branch Operations', () => {
  let tempDir: string;
  let manager: WorktreeManager;

  beforeEach(async () => {
    tempDir = createTempGitRepo();
    manager = createWorktreeManager({ workspaceRoot: tempDir });
    await manager.initWorkspace();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('getCurrentBranch', () => {
    test('returns current branch', async () => {
      const branch = await manager.getCurrentBranch();
      // Should be 'main' or 'master' depending on git version
      expect(['main', 'master']).toContain(branch);
    });
  });

  describe('getDefaultBranch', () => {
    test('detects default branch', async () => {
      const branch = await manager.getDefaultBranch();
      expect(['main', 'master']).toContain(branch);
    });

    test('uses configured default branch', async () => {
      const customManager = createWorktreeManager({
        workspaceRoot: tempDir,
        defaultBaseBranch: 'develop',
      });
      await customManager.initWorkspace();

      // Create develop branch
      execSync('git branch develop', { cwd: tempDir, stdio: 'pipe' });

      const branch = await customManager.getDefaultBranch();
      expect(branch).toBe('develop');
    });
  });

  describe('branchExists', () => {
    test('returns true for existing branch', async () => {
      const exists = await manager.branchExists(await manager.getCurrentBranch());
      expect(exists).toBe(true);
    });

    test('returns false for non-existing branch', async () => {
      const exists = await manager.branchExists('nonexistent-branch');
      expect(exists).toBe(false);
    });
  });
});

// ============================================================================
// Unit Tests - Custom Worktree Directory
// ============================================================================

describe('WorktreeManager Custom Directory', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempGitRepo();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('uses custom worktree directory', async () => {
    const manager = createWorktreeManager({
      workspaceRoot: tempDir,
      worktreeDir: '.agents',
    });
    await manager.initWorkspace();

    expect(fs.existsSync(path.join(tempDir, '.agents'))).toBe(true);

    // Check .gitignore
    const gitignore = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('/.agents/');
  });
});

// ============================================================================
// Unit Tests - Error Messages
// ============================================================================

describe('Error Messages', () => {
  test('GitRepositoryNotFoundError has helpful message', () => {
    const error = new GitRepositoryNotFoundError('/path/to/project');
    expect(error.message).toContain('Git repository not found');
    expect(error.message).toContain('git init');
    expect(error.message).toContain('/path/to/project');
    expect(error.name).toBe('GitRepositoryNotFoundError');
  });

  test('WorktreeError includes code and details', () => {
    const error = new WorktreeError('Something failed', 'TEST_ERROR', 'Additional details');
    expect(error.message).toBe('Something failed');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.details).toBe('Additional details');
    expect(error.name).toBe('WorktreeError');
  });
});
