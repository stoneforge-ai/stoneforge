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
import { mergeBranch, detectTargetBranch, execGitSafe, hasRemote, syncLocalBranchFromCommit } from './merge.js';

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
