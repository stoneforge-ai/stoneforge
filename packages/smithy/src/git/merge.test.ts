/**
 * Tests for git/merge.ts — mergeBranch() and helpers
 */

import { describe, test, expect, setDefaultTimeout } from 'bun:test';

// Git operations can be slow under I/O contention in full suite runs
setDefaultTimeout(30_000);
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mergeBranch, detectTargetBranch, execGitSafe } from './merge.js';

const execAsync = promisify(exec);

/**
 * Creates a temporary git repo with a "main" branch and returns its path.
 * Caller is responsible for cleanup.
 */
async function createTestRepo(): Promise<string> {
  const repoDir = path.join('/tmp', `merge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(repoDir, { recursive: true });

  await execAsync('git init -b main', { cwd: repoDir });
  await execAsync('git config user.email "test@test.com"', { cwd: repoDir });
  await execAsync('git config user.name "Test"', { cwd: repoDir });

  // Create initial commit
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test\n');
  await execAsync('git add . && git commit -m "Initial commit"', { cwd: repoDir });

  // Create .stoneforge/.worktrees dir (needed for temp worktrees)
  fs.mkdirSync(path.join(repoDir, '.stoneforge/.worktrees'), { recursive: true });

  return repoDir;
}

/**
 * Creates a bare "remote" repo and sets it as origin of the given repo.
 */
async function createRemote(repoDir: string): Promise<string> {
  const remoteDir = `${repoDir}-remote.git`;
  await execAsync(`git clone --bare "${repoDir}" "${remoteDir}"`);
  await execAsync(`git remote add origin "${remoteDir}"`, { cwd: repoDir }).catch(() => {
    // remote might already exist from clone
  });
  await execAsync(`git remote set-url origin "${remoteDir}"`, { cwd: repoDir });
  await execAsync('git push -u origin main', { cwd: repoDir });
  return remoteDir;
}

function rmrf(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Creates a repo + remote and returns both paths. Cleanup with rmrf(). */
async function setup(): Promise<{ repoDir: string; remoteDir: string }> {
  const repoDir = await createTestRepo();
  const remoteDir = await createRemote(repoDir);
  return { repoDir, remoteDir };
}

function cleanup(repoDir: string, remoteDir: string) {
  rmrf(repoDir);
  rmrf(remoteDir);
}

describe('execGitSafe', () => {
  test('refuses to run in workspace root', async () => {
    await expect(
      execGitSafe('status', '/some/root', '/some/root')
    ).rejects.toThrow('SAFETY');
  });

  test('allows running in a different directory', async () => {
    const repo = await createTestRepo();
    try {
      const sub = path.join(repo, 'sub');
      fs.mkdirSync(sub);
      const result = await execGitSafe('status', sub, repo);
      expect(result.stdout).toBeDefined();
    } finally {
      rmrf(repo);
    }
  });
});

describe('detectTargetBranch', () => {
  test('detects main as the target branch', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      const branch = await detectTargetBranch(repoDir);
      expect(branch).toBe('main');
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });
});

describe('mergeBranch', () => {
  test('squash merges a feature branch successfully', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      await execAsync('git checkout -b feature/test-merge', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'feature.ts'), 'export const x = 1;\n');
      await execAsync('git add . && git commit -m "Add feature"', { cwd: repoDir });
      await execAsync('git push origin feature/test-merge', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/test-merge',
        targetBranch: 'main',
        commitMessage: 'Test merge',
        syncLocal: false,
      });

      expect(result.success).toBe(true);
      expect(result.hasConflict).toBe(false);
      expect(result.commitHash).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify the commit was pushed to remote
      const { stdout: remoteLog } = await execAsync('git log --oneline -1', {
        cwd: repoDir,
        env: { ...process.env, GIT_DIR: remoteDir },
      });
      expect(remoteLog).toContain('Test merge');
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('detects merge conflicts', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      await execAsync('git checkout -b feature/conflict', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Feature version\n');
      await execAsync('git add . && git commit -m "Feature change"', { cwd: repoDir });
      await execAsync('git push origin feature/conflict', { cwd: repoDir });

      await execAsync('git checkout main', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Main version\n');
      await execAsync('git add . && git commit -m "Main change"', { cwd: repoDir });
      await execAsync('git push origin main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/conflict',
        targetBranch: 'main',
        commitMessage: 'Should fail',
      });

      expect(result.success).toBe(false);
      expect(result.hasConflict).toBe(true);
      expect(result.error).toBeDefined();
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('succeeds with merge strategy', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      await execAsync('git checkout -b feature/no-ff', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'noff.ts'), 'export const y = 2;\n');
      await execAsync('git add . && git commit -m "No-ff feature"', { cwd: repoDir });
      await execAsync('git push origin feature/no-ff', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/no-ff',
        targetBranch: 'main',
        mergeStrategy: 'merge',
        commitMessage: 'Merge no-ff',
        syncLocal: false,
      });

      expect(result.success).toBe(true);
      expect(result.hasConflict).toBe(false);
      expect(result.commitHash).toBeDefined();
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('skips push when autoPush is false', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      await execAsync('git checkout -b feature/no-push', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'nopush.ts'), 'export const z = 3;\n');
      await execAsync('git add . && git commit -m "No push"', { cwd: repoDir });
      await execAsync('git push origin feature/no-push', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/no-push',
        targetBranch: 'main',
        autoPush: false,
        commitMessage: 'Local only merge',
      });

      expect(result.success).toBe(true);

      const { stdout: remoteLog } = await execAsync(
        `git --git-dir="${remoteDir}" log --oneline main`,
      );
      expect(remoteLog).not.toContain('Local only merge');
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('skips preflight when disabled', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      await execAsync('git checkout -b feature/no-preflight', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'pre.ts'), 'export const p = 1;\n');
      await execAsync('git add . && git commit -m "No preflight"', { cwd: repoDir });
      await execAsync('git push origin feature/no-preflight', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/no-preflight',
        targetBranch: 'main',
        preflight: false,
        commitMessage: 'No preflight merge',
        syncLocal: false,
      });

      expect(result.success).toBe(true);
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('cleans up temp worktree even on failure', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'nonexistent-branch',
        targetBranch: 'main',
        preflight: false,
        commitMessage: 'Should fail',
      });

      expect(result.success).toBe(false);

      // Verify no leftover worktrees
      const { stdout: worktrees } = await execAsync('git worktree list', { cwd: repoDir });
      const lines = worktrees.trim().split('\n');
      expect(lines.length).toBe(1);
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });
});
