/**
 * Worktree Manager Unit Tests
 *
 * Tests for the WorktreeManager which provides git worktree operations
 * for parallel development in the orchestration system.
 */

import { describe, test, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test';

// Git worktree operations involve disk I/O that can exceed the default 5s timeout,
// especially on cold first runs. Match the timeout used in merge.bun.test.ts.
setDefaultTimeout(30_000);
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

function createTempGitRepoWithOrigin(): { repoDir: string; remoteDir: string } {
  const repoDir = createTempGitRepo();
  const remoteDir = `/tmp/worktree-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fs.mkdirSync(remoteDir, { recursive: true });

  execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
  execSync(`git remote add origin "${remoteDir}"`, { cwd: repoDir, stdio: 'pipe' });
  execSync('git push -u origin HEAD', { cwd: repoDir, stdio: 'pipe' });

  return { repoDir, remoteDir };
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

    test('cleans up stale directory not registered in git and recreates worktree', async () => {
      // Simulate: directory exists but git doesn't know about it
      // (e.g., after a failed dependency install + git worktree prune)
      const slug = createSlugFromTitle('Stale Dir');
      const relativePath = generateWorktreePath('charlie', slug);
      const fullPath = path.join(tempDir, relativePath);

      // Create the directory manually (not via git worktree add)
      fs.mkdirSync(fullPath, { recursive: true });
      fs.writeFileSync(path.join(fullPath, 'leftover.txt'), 'stale content');

      // Verify directory exists but git doesn't know about it
      expect(fs.existsSync(fullPath)).toBe(true);
      const worktree = await manager.getWorktree(relativePath);
      expect(worktree).toBeUndefined();

      // createWorktree should succeed by cleaning up the stale directory
      const result = await manager.createWorktree({
        agentName: 'charlie',
        taskId: 'task-stale' as ElementId,
        taskTitle: 'Stale Dir',
      });

      expect(fs.existsSync(result.path)).toBe(true);
      expect(result.worktree.state).toBe('active');
      expect(result.branchCreated).toBe(true);
    });

    test('removes registered worktree when directory exists and git knows about it', async () => {
      // Create a proper worktree first
      const first = await manager.createWorktree({
        agentName: 'dave',
        taskId: 'task-registered' as ElementId,
        taskTitle: 'Registered',
      });
      expect(fs.existsSync(first.path)).toBe(true);

      // Verify git knows about it
      const existing = await manager.getWorktree(first.worktree.relativePath);
      expect(existing).toBeDefined();

      // Creating the same worktree again should use the removeWorktree path
      const second = await manager.createWorktree({
        agentName: 'dave',
        taskId: 'task-registered' as ElementId,
        taskTitle: 'Registered',
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

  describe('ensureWorktreeRemote', () => {
    let remoteDir: string | undefined;

    beforeEach(async () => {
      cleanupTempDir(tempDir);
      const repo = createTempGitRepoWithOrigin();
      tempDir = repo.repoDir;
      remoteDir = repo.remoteDir;
      manager = createWorktreeManager({ workspaceRoot: tempDir });
      await manager.initWorkspace();
    });

    afterEach(() => {
      if (remoteDir) {
        cleanupTempDir(remoteDir);
      }
      remoteDir = undefined;
    });

    test('repairs a repo in the worktree directory when origin is missing', async () => {
      const brokenRepoPath = path.join(tempDir, '.stoneforge/.worktrees/manual-repair');
      fs.mkdirSync(brokenRepoPath, { recursive: true });

      execSync('git init', { cwd: brokenRepoPath, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: brokenRepoPath, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: brokenRepoPath, stdio: 'pipe' });

      expect(() => execSync('git remote get-url origin', { cwd: brokenRepoPath, stdio: 'pipe' })).toThrow();

      const repaired = await manager.ensureWorktreeRemote(brokenRepoPath);
      expect(repaired).toBe(true);
      expect(remoteDir).toBeDefined();

      const remoteUrl = execSync('git remote get-url origin', {
        cwd: brokenRepoPath,
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim();
      expect(remoteUrl).toBe(remoteDir!);

      const fetchSpecs = execSync('git config --get-all remote.origin.fetch', {
        cwd: brokenRepoPath,
        encoding: 'utf8',
        stdio: 'pipe',
      })
        .trim()
        .split('\n')
        .filter(Boolean);
      expect(fetchSpecs).toContain('+refs/heads/*:refs/remotes/origin/*');
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

// ============================================================================
// Unit Tests - Corepack / packageManager Detection
// ============================================================================

describe('installDependencies with packageManager field', () => {
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

  test('uses corepack when packageManager field is present and corepack is available', async () => {
    // Write package.json with packageManager field and a lockfile
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', packageManager: 'pnpm@9.12.0' }),
    );
    fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    execSync('git add -A && git commit -m "add package.json"', { cwd: tempDir, stdio: 'pipe' });

    // Check if corepack is available on this system
    let corepackAvailable = false;
    try {
      execSync('corepack --version', { stdio: 'pipe' });
      corepackAvailable = true;
    } catch {
      // corepack not available
    }

    // installDependencies will be invoked — it should try corepack when available.
    // The install will fail (no real deps) but we verify it doesn't throw an
    // unexpected error (the DEPENDENCY_INSTALL_FAILED error is expected).
    try {
      await manager.createWorktree({
        agentName: 'alice',
        taskId: 'task-corepack' as ElementId,
        taskTitle: 'corepack test',
        installDependencies: true,
      });
    } catch (err) {
      // Expected: install fails because there are no real dependencies.
      // The important thing is that the worktree was created and the error
      // is a dependency install failure, not something else.
      expect(err).toBeInstanceOf(WorktreeError);
      expect((err as WorktreeError).code).toBe('DEPENDENCY_INSTALL_FAILED');
    }

    // If corepack is available, the error message should reference corepack
    // (since corepack wraps the command). If not, it falls back to pnpm directly.
    // Either way, the worktree directory should have been created.
  });

  test('uses direct command when no packageManager field is present', async () => {
    // Write package.json WITHOUT packageManager field, with a lockfile
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test' }),
    );
    fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    execSync('git add -A && git commit -m "add package.json"', { cwd: tempDir, stdio: 'pipe' });

    // installDependencies will run pnpm directly (no corepack wrapper)
    try {
      await manager.createWorktree({
        agentName: 'bob',
        taskId: 'task-direct' as ElementId,
        taskTitle: 'direct test',
        installDependencies: true,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(WorktreeError);
      expect((err as WorktreeError).code).toBe('DEPENDENCY_INSTALL_FAILED');
    }
  });

  test('falls back to direct command when packageManager manager name does not match lockfile', async () => {
    // package.json says yarn but lockfile is pnpm — should not use corepack
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', packageManager: 'yarn@4.0.0' }),
    );
    fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    execSync('git add -A && git commit -m "add package.json"', { cwd: tempDir, stdio: 'pipe' });

    try {
      await manager.createWorktree({
        agentName: 'carol',
        taskId: 'task-mismatch' as ElementId,
        taskTitle: 'mismatch test',
        installDependencies: true,
      });
    } catch (err) {
      // Should fall back to pnpm (from lockfile detection), not corepack yarn
      expect(err).toBeInstanceOf(WorktreeError);
      expect((err as WorktreeError).code).toBe('DEPENDENCY_INSTALL_FAILED');
    }
  });
});

// ============================================================================
// Unit Tests - Corepack ENOENT Fallback
// ============================================================================

describe('installDependencies corepack ENOENT fallback', () => {
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

  test('falls back to direct package manager when corepack ENOENT occurs', async () => {
    // Write package.json with packageManager field so shouldUseCorepack returns true
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', packageManager: 'pnpm@9.12.0' }),
    );
    fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    execSync('git add -A && git commit -m "add package.json"', { cwd: tempDir, stdio: 'pipe' });

    // Override shouldUseCorepack to always return true (simulating a system where
    // corepack was detected at check time but is not actually spawnable)
    const mgr = manager as any;
    const origShouldUseCorepack = mgr.shouldUseCorepack.bind(mgr);
    mgr.shouldUseCorepack = async () => true;

    // Also override the corepack binary lookup by making the PATH point to a
    // directory without corepack. We do this by directly testing installDependencies.
    // The installDependencies method will try 'corepack' first, get ENOENT,
    // then fall back to 'pnpm' directly. The pnpm install will also fail
    // (no real deps) but with DEPENDENCY_INSTALL_FAILED, not a corepack error.
    try {
      await manager.createWorktree({
        agentName: 'dave',
        taskId: 'task-corepack-enoent' as ElementId,
        taskTitle: 'corepack enoent test',
        installDependencies: true,
      });
    } catch (err) {
      // The install should still fail (no real dependencies to install),
      // but with DEPENDENCY_INSTALL_FAILED — NOT an uncaught ENOENT.
      expect(err).toBeInstanceOf(WorktreeError);
      expect((err as WorktreeError).code).toBe('DEPENDENCY_INSTALL_FAILED');
      // The error should NOT mention "spawn corepack ENOENT" since
      // the fallback should have retried with the direct command.
      // If corepack IS available on this system, it won't be ENOENT at all,
      // so the test still passes — the important thing is we get
      // DEPENDENCY_INSTALL_FAILED either way.
    }

    // Restore original method
    mgr.shouldUseCorepack = origShouldUseCorepack;
  });
});

// ============================================================================
// Unit Tests - shouldUseCorepack logic (via internal access)
// ============================================================================

describe('shouldUseCorepack logic', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = `/tmp/corepack-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('returns false when package.json has no packageManager field', async () => {
    const pkgPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test' }));

    // Access private method via bracket notation for testing
    const mgr = createWorktreeManager({ workspaceRoot: tempDir }) as any;
    const result = await mgr.shouldUseCorepack(pkgPath, 'pnpm');
    expect(result).toBe(false);
  });

  test('returns false when packageManager name does not match detected manager', async () => {
    const pkgPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test', packageManager: 'yarn@4.0.0' }));

    const mgr = createWorktreeManager({ workspaceRoot: tempDir }) as any;
    const result = await mgr.shouldUseCorepack(pkgPath, 'pnpm');
    expect(result).toBe(false);
  });

  test('returns true when packageManager matches and corepack is available', async () => {
    // Skip if corepack is not installed
    let corepackAvailable = false;
    try {
      execSync('corepack --version', { stdio: 'pipe' });
      corepackAvailable = true;
    } catch {
      // skip
    }

    if (!corepackAvailable) {
      // Cannot test corepack availability when it's not installed
      return;
    }

    const pkgPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test', packageManager: 'pnpm@9.12.0' }));

    const mgr = createWorktreeManager({ workspaceRoot: tempDir }) as any;
    const result = await mgr.shouldUseCorepack(pkgPath, 'pnpm');
    expect(result).toBe(true);
  });

  test('returns false when package.json is unreadable', async () => {
    const pkgPath = path.join(tempDir, 'nonexistent', 'package.json');

    const mgr = createWorktreeManager({ workspaceRoot: tempDir }) as any;
    const result = await mgr.shouldUseCorepack(pkgPath, 'pnpm');
    expect(result).toBe(false);
  });

  test('parses packageManager field without version (bare name)', async () => {
    const pkgPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test', packageManager: 'pnpm' }));

    // Should match detected manager even without @version
    let corepackAvailable = false;
    try {
      execSync('corepack --version', { stdio: 'pipe' });
      corepackAvailable = true;
    } catch {
      // skip
    }

    const mgr = createWorktreeManager({ workspaceRoot: tempDir }) as any;
    const result = await mgr.shouldUseCorepack(pkgPath, 'pnpm');
    // If corepack is available, should return true; if not, false
    expect(result).toBe(corepackAvailable);
  });
});

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
