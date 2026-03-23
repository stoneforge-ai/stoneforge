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
import { mergeBranch, detectTargetBranch, execGitSafe, hasRemote, syncLocalBranchFromCommit, ensureTargetBranchExists } from './merge.js';

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

describe('hasRemote', () => {
  test('returns true when remote exists', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      expect(await hasRemote(repoDir)).toBe(true);
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('returns false when no remote configured', async () => {
    const repoDir = await createTestRepo();
    try {
      expect(await hasRemote(repoDir)).toBe(false);
    } finally {
      rmrf(repoDir);
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

  test('detects main in local-only repo (no remote)', async () => {
    const repoDir = await createTestRepo();
    try {
      const branch = await detectTargetBranch(repoDir);
      expect(branch).toBe('main');
    } finally {
      rmrf(repoDir);
    }
  });

  test('returns configBaseBranch when provided', async () => {
    const repoDir = await createTestRepo();
    try {
      const branch = await detectTargetBranch(repoDir, 'develop');
      expect(branch).toBe('develop');
    } finally {
      rmrf(repoDir);
    }
  });

  test('returns configBaseBranch even when remote exists', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      const branch = await detectTargetBranch(repoDir, 'production');
      expect(branch).toBe('production');
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('ignores empty configBaseBranch and falls back to auto-detection', async () => {
    const repoDir = await createTestRepo();
    try {
      const branch = await detectTargetBranch(repoDir, '');
      expect(branch).toBe('main');
    } finally {
      rmrf(repoDir);
    }
  });

  test('detects master when only master branch exists', async () => {
    // Create a repo with only "master" branch
    const repoDir = path.join('/tmp', `merge-test-master-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(repoDir, { recursive: true });
    await execAsync('git init -b master', { cwd: repoDir });
    await execAsync('git config user.email "test@test.com"', { cwd: repoDir });
    await execAsync('git config user.name "Test"', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test\n');
    await execAsync('git add . && git commit -m "Initial commit"', { cwd: repoDir });
    fs.mkdirSync(path.join(repoDir, '.stoneforge/.worktrees'), { recursive: true });

    try {
      const branch = await detectTargetBranch(repoDir);
      expect(branch).toBe('master');
    } finally {
      rmrf(repoDir);
    }
  });

  test('falls back to "main" when no known branches exist', async () => {
    // Create a repo with a non-standard branch name
    const repoDir = path.join('/tmp', `merge-test-custom-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(repoDir, { recursive: true });
    await execAsync('git init -b custom-branch', { cwd: repoDir });
    await execAsync('git config user.email "test@test.com"', { cwd: repoDir });
    await execAsync('git config user.name "Test"', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test\n');
    await execAsync('git add . && git commit -m "Initial commit"', { cwd: repoDir });

    try {
      const branch = await detectTargetBranch(repoDir);
      expect(branch).toBe('main'); // Ultimate fallback
    } finally {
      rmrf(repoDir);
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

  test('returns failure when push to remote fails', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      await execAsync('git checkout -b feature/push-fail', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'pushfail.ts'), 'export const pf = 1;\n');
      await execAsync('git add . && git commit -m "Push fail feature"', { cwd: repoDir });
      await execAsync('git push origin feature/push-fail', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      // Add a pre-receive hook to the bare remote that rejects all pushes
      const hookPath = path.join(remoteDir, 'hooks', 'pre-receive');
      fs.writeFileSync(hookPath, '#!/bin/sh\nexit 1\n');
      fs.chmodSync(hookPath, 0o755);

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/push-fail',
        targetBranch: 'main',
        commitMessage: 'Should fail push',
        syncLocal: false,
      });

      expect(result.success).toBe(false);
      expect(result.hasConflict).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('push');
      // The merge commit should still be reported for diagnostics
      expect(result.commitHash).toBeDefined();
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

// ============================================================================
// Local-only merge tests (no remote configured)
// ============================================================================

describe('mergeBranch (local-only, no remote)', () => {
  test('squash merges successfully without a remote', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create a feature branch with changes
      await execAsync('git checkout -b feature/local-merge', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'local-feature.ts'), 'export const a = 1;\n');
      await execAsync('git add . && git commit -m "Add local feature"', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/local-merge',
        targetBranch: 'main',
        commitMessage: 'Local squash merge',
        syncLocal: false,
      });

      expect(result.success).toBe(true);
      expect(result.hasConflict).toBe(false);
      expect(result.commitHash).toBeDefined();
      expect(result.error).toBeUndefined();
    } finally {
      rmrf(repoDir);
    }
  });

  test('auto-detects local-only mode when no remote exists', async () => {
    const repoDir = await createTestRepo();
    try {
      // Verify no remote
      expect(await hasRemote(repoDir)).toBe(false);

      // Create a feature branch
      await execAsync('git checkout -b feature/auto-detect', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'auto.ts'), 'export const b = 2;\n');
      await execAsync('git add . && git commit -m "Auto detect"', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      // Should auto-detect local-only and succeed without trying to fetch/push
      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/auto-detect',
        targetBranch: 'main',
        commitMessage: 'Auto-detected local merge',
        syncLocal: false,
      });

      expect(result.success).toBe(true);
      expect(result.commitHash).toBeDefined();
    } finally {
      rmrf(repoDir);
    }
  });

  test('pre-flight conflict detection works with local refs', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create conflicting changes
      await execAsync('git checkout -b feature/local-conflict', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Feature version\n');
      await execAsync('git add . && git commit -m "Feature change"', { cwd: repoDir });

      await execAsync('git checkout main', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Main version\n');
      await execAsync('git add . && git commit -m "Main change"', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/local-conflict',
        targetBranch: 'main',
        commitMessage: 'Should conflict',
      });

      expect(result.success).toBe(false);
      expect(result.hasConflict).toBe(true);
      expect(result.error).toBeDefined();
    } finally {
      rmrf(repoDir);
    }
  });

  test('updates local target branch after local-only merge with syncLocal', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create a feature branch
      await execAsync('git checkout -b feature/sync-test', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'sync.ts'), 'export const c = 3;\n');
      await execAsync('git add . && git commit -m "Sync test"', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      // Get main's current commit before merge
      const { stdout: beforeHash } = await execAsync('git rev-parse main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/sync-test',
        targetBranch: 'main',
        commitMessage: 'Sync local merge',
        syncLocal: true,
      });

      expect(result.success).toBe(true);

      // main should now point at the merge commit
      const { stdout: afterHash } = await execAsync('git rev-parse main', { cwd: repoDir });
      expect(afterHash.trim()).toBe(result.commitHash);
      expect(afterHash.trim()).not.toBe(beforeHash.trim());
    } finally {
      rmrf(repoDir);
    }
  });

  test('merge strategy (no-ff) works without a remote', async () => {
    const repoDir = await createTestRepo();
    try {
      await execAsync('git checkout -b feature/local-noff', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'noff-local.ts'), 'export const d = 4;\n');
      await execAsync('git add . && git commit -m "Local no-ff"', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/local-noff',
        targetBranch: 'main',
        mergeStrategy: 'merge',
        commitMessage: 'Local no-ff merge',
        syncLocal: false,
      });

      expect(result.success).toBe(true);
      expect(result.hasConflict).toBe(false);
      expect(result.commitHash).toBeDefined();
    } finally {
      rmrf(repoDir);
    }
  });

  test('explicit localOnly: true skips remote operations even with remote configured', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      await execAsync('git checkout -b feature/force-local', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'force-local.ts'), 'export const e = 5;\n');
      await execAsync('git add . && git commit -m "Force local"', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/force-local',
        targetBranch: 'main',
        localOnly: true,
        commitMessage: 'Forced local merge',
        syncLocal: false,
      });

      expect(result.success).toBe(true);

      // Since localOnly: true, the push was skipped — remote should NOT have the merge
      const { stdout: remoteLog } = await execAsync(
        `git --git-dir="${remoteDir}" log --oneline main`,
      );
      expect(remoteLog).not.toContain('Forced local merge');
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('cleans up temp worktree on failure in local-only mode', async () => {
    const repoDir = await createTestRepo();
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
      rmrf(repoDir);
    }
  });
});

// ============================================================================
// Pre-flight conflict detection regression tests
// ============================================================================

describe('mergeBranch pre-flight conflict detection', () => {
  test('does NOT false-positive when source files contain literal conflict marker strings', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create a feature branch with a file containing literal conflict markers
      await execAsync('git checkout -b feature/conflict-literals', { cwd: repoDir });
      const fileWithMarkers = [
        '// This file documents git conflict markers for educational purposes',
        '// A conflict marker looks like:',
        '// <<<<<<< HEAD',
        '// your changes',
        '// =======',
        '// their changes',
        '// >>>>>>> branch-name',
        '',
        'export const CONFLICT_MARKER_EXAMPLE = "<<<<<<< HEAD";',
        'export const SEPARATOR = "=======";',
        'export const END_MARKER = ">>>>>>> some-branch";',
        '',
        '// Test fixture with inline markers',
        'export const testFixture = `',
        '<<<<<<< HEAD',
        'version A',
        '=======',
        'version B',
        '>>>>>>> feature',
        '`;',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(repoDir, 'conflict-docs.ts'), fileWithMarkers);
      await execAsync('git add . && git commit -m "Add file with conflict marker literals"', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/conflict-literals',
        targetBranch: 'main',
        commitMessage: 'Merge branch with conflict marker literals',
        syncLocal: false,
      });

      // Should succeed — the conflict markers are in file content, not real conflicts
      expect(result.success).toBe(true);
      expect(result.hasConflict).toBe(false);
      expect(result.commitHash).toBeDefined();
    } finally {
      rmrf(repoDir);
    }
  });

  test('still detects real merge conflicts in pre-flight', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create conflicting changes on two branches
      await execAsync('git checkout -b feature/real-conflict', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Feature branch version\n');
      await execAsync('git add . && git commit -m "Feature README change"', { cwd: repoDir });

      await execAsync('git checkout main', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Main branch version\n');
      await execAsync('git add . && git commit -m "Main README change"', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/real-conflict',
        targetBranch: 'main',
        commitMessage: 'Should detect conflict',
        preflight: true,
      });

      // Should fail with conflict
      expect(result.success).toBe(false);
      expect(result.hasConflict).toBe(true);
      expect(result.error).toContain('conflict');
    } finally {
      rmrf(repoDir);
    }
  });
});

// ============================================================================
// Already-merged / zero-commits-ahead detection tests
// ============================================================================

describe('mergeBranch already-merged detection', () => {
  test('returns alreadyMerged when branch has zero commits ahead (with remote)', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      // Create and merge a feature branch so it has zero commits ahead
      await execAsync('git checkout -b feature/already-merged', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'already.ts'), 'export const x = 1;\n');
      await execAsync('git add . && git commit -m "Feature commit"', { cwd: repoDir });
      await execAsync('git push origin feature/already-merged', { cwd: repoDir });

      // Now merge the feature into main manually (simulating a previous merge)
      await execAsync('git checkout main', { cwd: repoDir });
      await execAsync('git merge feature/already-merged', { cwd: repoDir });
      await execAsync('git push origin main', { cwd: repoDir });

      // Now try to merge again — should detect already-merged
      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/already-merged',
        targetBranch: 'main',
        commitMessage: 'Should not merge',
      });

      expect(result.success).toBe(true);
      expect(result.alreadyMerged).toBe(true);
      expect(result.hasConflict).toBe(false);
      expect(result.commitHash).toBeUndefined();
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('returns alreadyMerged when branch has zero commits ahead (local-only)', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create and merge a feature branch
      await execAsync('git checkout -b feature/local-already-merged', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'local-already.ts'), 'export const y = 2;\n');
      await execAsync('git add . && git commit -m "Local feature"', { cwd: repoDir });

      await execAsync('git checkout main', { cwd: repoDir });
      await execAsync('git merge feature/local-already-merged', { cwd: repoDir });

      // Now try to merge again — should detect already-merged
      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/local-already-merged',
        targetBranch: 'main',
        commitMessage: 'Should not merge',
      });

      expect(result.success).toBe(true);
      expect(result.alreadyMerged).toBe(true);
      expect(result.hasConflict).toBe(false);
      expect(result.commitHash).toBeUndefined();
    } finally {
      rmrf(repoDir);
    }
  });

  test('does NOT return alreadyMerged when branch has commits ahead', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      await execAsync('git checkout -b feature/not-yet-merged', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'not-merged.ts'), 'export const z = 3;\n');
      await execAsync('git add . && git commit -m "Not yet merged"', { cwd: repoDir });
      await execAsync('git push origin feature/not-yet-merged', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/not-yet-merged',
        targetBranch: 'main',
        commitMessage: 'Normal merge',
        syncLocal: false,
      });

      expect(result.success).toBe(true);
      expect(result.alreadyMerged).toBeUndefined();
      expect(result.commitHash).toBeDefined();
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });
});

// ============================================================================
// Review branch auto-creation tests
// ============================================================================

describe('ensureTargetBranchExists', () => {
  test('creates review branch from main when it does not exist (local-only)', async () => {
    const repoDir = await createTestRepo();
    try {
      await ensureTargetBranchExists(repoDir, 'stoneforge/review', true);

      // Verify the branch was created
      const { stdout } = await execAsync('git rev-parse --verify refs/heads/stoneforge/review', {
        cwd: repoDir,
      });
      expect(stdout.trim()).toBeTruthy();

      // Verify it points to the same commit as main
      const { stdout: mainHash } = await execAsync('git rev-parse main', { cwd: repoDir });
      expect(stdout.trim()).toBe(mainHash.trim());
    } finally {
      rmrf(repoDir);
    }
  });

  test('creates review branch from main and pushes to remote', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      await ensureTargetBranchExists(repoDir, 'stoneforge/review', false);

      // Verify the branch was created locally
      const { stdout: localHash } = await execAsync(
        'git rev-parse --verify refs/heads/stoneforge/review',
        { cwd: repoDir },
      );
      expect(localHash.trim()).toBeTruthy();

      // Verify the branch was pushed to remote
      const { stdout: remoteHash } = await execAsync(
        `git --git-dir="${remoteDir}" rev-parse --verify refs/heads/stoneforge/review`,
      );
      expect(remoteHash.trim()).toBe(localHash.trim());
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('is a no-op when branch already exists locally', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create the branch manually first
      await execAsync('git branch stoneforge/review', { cwd: repoDir });

      // Should not throw
      await ensureTargetBranchExists(repoDir, 'stoneforge/review', true);

      // Should still exist
      const { stdout } = await execAsync('git rev-parse --verify refs/heads/stoneforge/review', {
        cwd: repoDir,
      });
      expect(stdout.trim()).toBeTruthy();
    } finally {
      rmrf(repoDir);
    }
  });

  test('is a no-op for main branch', async () => {
    const repoDir = await createTestRepo();
    try {
      // Should not throw even though we pass 'main'
      await ensureTargetBranchExists(repoDir, 'main', true);
    } finally {
      rmrf(repoDir);
    }
  });

  test('is a no-op for master branch', async () => {
    const repoDir = await createTestRepo();
    try {
      await ensureTargetBranchExists(repoDir, 'master', true);
    } finally {
      rmrf(repoDir);
    }
  });
});

describe('mergeBranch with review branch target', () => {
  test('auto-creates review branch and merges into it (local-only)', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create a feature branch with changes
      await execAsync('git checkout -b feature/review-test', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'review-feature.ts'), 'export const r = 1;\n');
      await execAsync('git add . && git commit -m "Review feature"', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      // Merge into stoneforge/review — branch should be auto-created
      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/review-test',
        targetBranch: 'stoneforge/review',
        commitMessage: 'Merge to review branch',
        syncLocal: true,
      });

      expect(result.success).toBe(true);
      expect(result.hasConflict).toBe(false);
      expect(result.commitHash).toBeDefined();

      // Verify the review branch now has the merge commit
      const { stdout: reviewHash } = await execAsync(
        'git rev-parse stoneforge/review',
        { cwd: repoDir },
      );
      expect(reviewHash.trim()).toBe(result.commitHash);
    } finally {
      rmrf(repoDir);
    }
  });

  test('auto-creates review branch and merges into it (with remote)', async () => {
    const { repoDir, remoteDir } = await setup();
    try {
      // Create a feature branch with changes
      await execAsync('git checkout -b feature/review-remote', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'review-remote.ts'), 'export const s = 2;\n');
      await execAsync('git add . && git commit -m "Review remote feature"', { cwd: repoDir });
      await execAsync('git push origin feature/review-remote', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      // Merge into stoneforge/review — branch should be auto-created
      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/review-remote',
        targetBranch: 'stoneforge/review',
        commitMessage: 'Merge to review (remote)',
        syncLocal: false,
      });

      expect(result.success).toBe(true);
      expect(result.hasConflict).toBe(false);
      expect(result.commitHash).toBeDefined();

      // Verify the review branch exists on the remote with the merge
      const { stdout: remoteLog } = await execAsync(
        `git --git-dir="${remoteDir}" log --oneline stoneforge/review`,
      );
      expect(remoteLog).toContain('Merge to review (remote)');
    } finally {
      cleanup(repoDir, remoteDir);
    }
  });

  test('does not change behavior when target is main (Auto preset)', async () => {
    const repoDir = await createTestRepo();
    try {
      await execAsync('git checkout -b feature/auto-preset', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'auto-preset.ts'), 'export const t = 3;\n');
      await execAsync('git add . && git commit -m "Auto preset feature"', { cwd: repoDir });
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/auto-preset',
        targetBranch: 'main',
        commitMessage: 'Normal merge to main',
        syncLocal: false,
      });

      expect(result.success).toBe(true);
      expect(result.commitHash).toBeDefined();
    } finally {
      rmrf(repoDir);
    }
  });
});

// ============================================================================
// Sync file protection during merge
// ============================================================================

describe('mergeBranch sync file protection', () => {
  test('preserves target branch sync files during squash merge (local-only)', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create .stoneforge/sync/ with elements.jsonl on main
      const syncDir = path.join(repoDir, '.stoneforge/sync');
      fs.mkdirSync(syncDir, { recursive: true });
      const targetContent = '{"id":"el-001","type":"task","title":"Task 1"}\n{"id":"el-002","type":"task","title":"Task 2"}\n{"id":"el-003","type":"task","title":"Task 3"}\n';
      fs.writeFileSync(path.join(syncDir, 'elements.jsonl'), targetContent);
      await execAsync('git add . && git commit -m "Add sync files"', { cwd: repoDir });

      // Create feature branch
      await execAsync('git checkout -b feature/docs-fix', { cwd: repoDir });

      // Modify elements.jsonl on the feature branch (simulates agent full re-export)
      const sourceContent = '{"id":"el-001","type":"task","title":"Task 1 MODIFIED"}\n';
      fs.writeFileSync(path.join(syncDir, 'elements.jsonl'), sourceContent);

      // Also add a legitimate file change
      fs.writeFileSync(path.join(repoDir, 'docs.md'), '# Updated docs\n');
      await execAsync('git add . && git commit -m "Fix docs and re-export sync"', { cwd: repoDir });

      // Go back to main
      await execAsync('git checkout main', { cwd: repoDir });

      // Squash merge feature -> main
      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/docs-fix',
        targetBranch: 'main',
        mergeStrategy: 'squash',
        autoPush: false,
        commitMessage: 'docs: automated fixes',
        localOnly: true,
      });

      expect(result.success).toBe(true);
      expect(result.hasConflict).toBe(false);

      // The legitimate file change should be present
      const docsContent = fs.readFileSync(path.join(repoDir, 'docs.md'), 'utf8');
      expect(docsContent).toContain('Updated docs');

      // The sync file should be PRESERVED from the target branch (main), not overwritten
      const mergedElements = fs.readFileSync(path.join(syncDir, 'elements.jsonl'), 'utf8');
      expect(mergedElements).toBe(targetContent);
      expect(mergedElements).not.toContain('MODIFIED');
    } finally {
      rmrf(repoDir);
    }
  });

  test('preserves sync files when source branch empties them (local-only)', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create .stoneforge/sync/ with elements.jsonl on main
      const syncDir = path.join(repoDir, '.stoneforge/sync');
      fs.mkdirSync(syncDir, { recursive: true });
      const targetContent = '{"id":"el-001","type":"task","title":"Task 1"}\n{"id":"el-002","type":"task","title":"Task 2"}\n';
      fs.writeFileSync(path.join(syncDir, 'elements.jsonl'), targetContent);
      await execAsync('git add . && git commit -m "Add sync files"', { cwd: repoDir });

      // Create feature branch
      await execAsync('git checkout -b feature/empty-sync', { cwd: repoDir });

      // Empty elements.jsonl (simulates empty database export)
      fs.writeFileSync(path.join(syncDir, 'elements.jsonl'), '');

      // Add a legitimate change
      fs.writeFileSync(path.join(repoDir, 'feature.ts'), 'export const x = 1;\n');
      await execAsync('git add . && git commit -m "Add feature and empty sync"', { cwd: repoDir });

      // Go back to main
      await execAsync('git checkout main', { cwd: repoDir });

      // Squash merge
      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/empty-sync',
        targetBranch: 'main',
        mergeStrategy: 'squash',
        autoPush: false,
        commitMessage: 'feat: add feature',
        localOnly: true,
      });

      expect(result.success).toBe(true);

      // Sync file should be preserved from main (not emptied)
      const mergedElements = fs.readFileSync(path.join(syncDir, 'elements.jsonl'), 'utf8');
      expect(mergedElements).toBe(targetContent);

      // Feature file should be present
      expect(fs.existsSync(path.join(repoDir, 'feature.ts'))).toBe(true);
    } finally {
      rmrf(repoDir);
    }
  });

  test('does not interfere when sync files are unchanged (local-only)', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create .stoneforge/sync/ with elements.jsonl on main
      const syncDir = path.join(repoDir, '.stoneforge/sync');
      fs.mkdirSync(syncDir, { recursive: true });
      const content = '{"id":"el-001","type":"task","title":"Task 1"}\n';
      fs.writeFileSync(path.join(syncDir, 'elements.jsonl'), content);
      await execAsync('git add . && git commit -m "Add sync files"', { cwd: repoDir });

      // Create feature branch (don't touch sync files)
      await execAsync('git checkout -b feature/no-sync-change', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'feature.ts'), 'export const y = 2;\n');
      await execAsync('git add . && git commit -m "Add feature only"', { cwd: repoDir });

      // Go back to main
      await execAsync('git checkout main', { cwd: repoDir });

      const result = await mergeBranch({
        workspaceRoot: repoDir,
        sourceBranch: 'feature/no-sync-change',
        targetBranch: 'main',
        mergeStrategy: 'squash',
        autoPush: false,
        commitMessage: 'feat: clean merge',
        localOnly: true,
      });

      expect(result.success).toBe(true);

      // Sync file should be unchanged
      const mergedElements = fs.readFileSync(path.join(syncDir, 'elements.jsonl'), 'utf8');
      expect(mergedElements).toBe(content);
    } finally {
      rmrf(repoDir);
    }
  });
});

describe('syncLocalBranchFromCommit', () => {
  test('updates target branch ref to commit hash when not on target branch', async () => {
    const repoDir = await createTestRepo();
    try {
      // Create a feature branch with an extra commit
      await execAsync('git checkout -b feature/sync-commit', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'sync-commit.ts'), 'export const f = 6;\n');
      await execAsync('git add . && git commit -m "Sync commit"', { cwd: repoDir });
      const { stdout: featureHash } = await execAsync('git rev-parse HEAD', { cwd: repoDir });

      // Switch back to a different branch
      await execAsync('git checkout main', { cwd: repoDir });

      // Update main to point at the feature commit
      await syncLocalBranchFromCommit(repoDir, 'main', featureHash.trim());

      const { stdout: mainHash } = await execAsync('git rev-parse main', { cwd: repoDir });
      expect(mainHash.trim()).toBe(featureHash.trim());
    } finally {
      rmrf(repoDir);
    }
  });
});
