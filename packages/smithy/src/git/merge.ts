/**
 * Git Merge Utilities
 *
 * Shared squash-merge-in-temp-worktree logic used by both the Merge Steward
 * and the Docs Steward services.
 *
 * Pattern:
 *  1. Fetch origin (skipped when local-only / no remote)
 *  2. (Optional) Pre-flight conflict detection via git merge-tree
 *  3. Create temp worktree with detached HEAD at origin/<target> or local <target>
 *  4. Squash merge (or regular merge) source branch
 *  5. Commit with provided message
 *  6. Push HEAD:<target> to remote (skipped when local-only)
 *  7. Remove temp worktree (always, in finally)
 *  8. (Optional) Sync local target branch via fast-forward
 *
 * Local-only mode is auto-detected when no 'origin' remote exists, or can
 * be forced via the `localOnly` option in MergeBranchOptions.
 *
 * @module
 */

import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** Well-known default branch names that should never be auto-created */
const MAIN_BRANCH_NAMES = new Set(['main', 'master']);

// ============================================================================
// Types
// ============================================================================

export interface MergeBranchOptions {
  /** Workspace root (the main repo checkout) */
  workspaceRoot: string;
  /** Branch to merge from */
  sourceBranch: string;
  /** Branch to merge into (auto-detected if omitted) */
  targetBranch?: string;
  /** 'squash' (default) or 'merge' (--no-ff) */
  mergeStrategy?: 'squash' | 'merge';
  /** Push to remote after merge (default: true) */
  autoPush?: boolean;
  /** Commit message (required for squash, auto-generated for merge) */
  commitMessage?: string;
  /** Run pre-flight conflict detection via merge-tree (default: true) */
  preflight?: boolean;
  /** Fast-forward local target branch after push (default: true) */
  syncLocal?: boolean;
  /**
   * When true, skip all remote operations (fetch, push).
   * Auto-detected when no remote named 'origin' is configured.
   */
  localOnly?: boolean;
}

export interface MergeBranchResult {
  /** Whether the merge succeeded */
  success: boolean;
  /** Merge/squash commit hash if successful */
  commitHash?: string;
  /** Whether a conflict was detected */
  hasConflict: boolean;
  /** Error message if merge failed */
  error?: string;
  /** Files with conflicts, if any */
  conflictFiles?: string[];
  /** Whether the source branch was already fully merged into the target (zero commits ahead) */
  alreadyMerged?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Run a git command in a worktree directory.
 * Refuses to run in the workspace root to prevent corrupting the main repo HEAD.
 */
export async function execGitSafe(
  command: string,
  worktreePath: string,
  workspaceRoot: string
): Promise<{ stdout: string; stderr: string }> {
  if (path.resolve(worktreePath) === path.resolve(workspaceRoot)) {
    throw new Error(
      `SAFETY: Refusing to run "git ${command}" in main repo. Use a worktree.`
    );
  }
  return execAsync(`git ${command}`, { cwd: worktreePath, encoding: 'utf8' });
}

/**
 * Well-known sync files that should be preserved from the target branch
 * during merges. Source branches should never be authoritative for these
 * files — they are maintained by the auto-export service on the target.
 */
const SYNC_FILES = [
  '.stoneforge/sync/elements.jsonl',
  '.stoneforge/sync/dependencies.jsonl',
];

/**
 * Restore sync files to the target branch version after a merge.
 *
 * During squash-merges, source branches may carry divergent sync files
 * (from auto-export in worktrees, agent `git add .`, or full re-exports).
 * Git's text-based three-way merge of JSONL files can produce empty or
 * corrupted results. This function restores sync files to the target
 * branch version, since the target is always authoritative for sync state.
 *
 * @returns true if any files were restored (re-staged)
 */
async function restoreSyncFiles(
  mergeDir: string,
  workspaceRoot: string,
  targetRef: string
): Promise<boolean> {
  let restored = false;

  for (const syncFile of SYNC_FILES) {
    try {
      // Check if the sync file was changed by the merge
      const { stdout: diffOutput } = await execGitSafe(
        `diff --cached --name-only -- ${syncFile}`,
        mergeDir,
        workspaceRoot
      );

      if (diffOutput.trim()) {
        // File was changed — restore target branch version
        await execGitSafe(
          `checkout ${targetRef} -- ${syncFile}`,
          mergeDir,
          workspaceRoot
        );
        restored = true;
      }
    } catch {
      // File doesn't exist in one or both branches — skip
    }
  }

  return restored;
}

/**
 * Check whether a named remote exists in the repo.
 *
 * Runs `git remote get-url <remoteName>` which exits 0 when the remote
 * exists and non-zero otherwise.
 */
export async function hasRemote(
  workspaceRoot: string,
  remoteName = 'origin'
): Promise<boolean> {
  try {
    await execAsync(`git remote get-url ${remoteName}`, {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical branch detection function.
 *
 * All consumers in the codebase should delegate to this single function
 * to ensure consistent default-branch detection everywhere. The unified
 * fallback order is:
 *
 *  1. `configBaseBranch` (if provided — from user configuration)
 *  2. `git symbolic-ref refs/remotes/origin/HEAD` (most reliable remote indicator)
 *  3. `git remote show origin` HEAD branch (slower but authoritative)
 *  4. Check existence of origin/main, then origin/master
 *  5. Check existence of local main, then local master
 *  6. Fallback: "main"
 *
 * @param workspaceRoot - The git repository root directory
 * @param configBaseBranch - Optional config-provided base branch name (checked first)
 */
export async function detectTargetBranch(
  workspaceRoot: string,
  configBaseBranch?: string
): Promise<string> {
  // 1. Config value takes priority — if set, trust it unconditionally
  if (configBaseBranch) {
    return configBaseBranch;
  }

  const remoteExists = await hasRemote(workspaceRoot);

  if (remoteExists) {
    // 2. Try origin/HEAD symref (most reliable)
    try {
      const { stdout } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD', {
        cwd: workspaceRoot,
        encoding: 'utf8',
      });
      const match = stdout.trim().match(/refs\/remotes\/origin\/(.+)/);
      if (match) return match[1];
    } catch {
      // Fall through
    }

    // 3. Try `git remote show origin` HEAD branch
    try {
      const { stdout } = await execAsync('git remote show origin', {
        cwd: workspaceRoot,
        encoding: 'utf8',
      });
      const match = stdout.match(/HEAD branch: (.+)/);
      if (match) {
        const branch = match[1].trim();
        if (branch && branch !== '(unknown)') return branch;
      }
    } catch {
      // Fall through
    }

    // 4. Check existence of origin/main, then origin/master
    for (const name of ['main', 'master']) {
      try {
        await execAsync(`git rev-parse --verify origin/${name}`, {
          cwd: workspaceRoot,
          encoding: 'utf8',
        });
        return name;
      } catch {
        // Fall through
      }
    }
  }

  // 5. No remote or remote detection failed — try local branches
  for (const name of ['main', 'master']) {
    try {
      await execAsync(`git rev-parse --verify refs/heads/${name}`, {
        cwd: workspaceRoot,
        encoding: 'utf8',
      });
      return name;
    } catch {
      // Fall through
    }
  }

  // 6. Ultimate fallback
  return 'main';
}

// ============================================================================
// Review Branch Auto-Creation
// ============================================================================

/**
 * Ensures the target branch exists when it is a non-main branch (e.g.
 * `stoneforge/review`). If the branch does not exist locally or on the
 * remote, it is created from the current main branch HEAD and pushed.
 *
 * This is a no-op when the target branch is `main` or `master`.
 *
 * @param workspaceRoot - The git repository root directory
 * @param targetBranch - The branch to ensure exists
 * @param localOnly - Whether the repo has no remote (skip push)
 */
export async function ensureTargetBranchExists(
  workspaceRoot: string,
  targetBranch: string,
  localOnly = false
): Promise<void> {
  // Never auto-create main/master — they should already exist
  if (MAIN_BRANCH_NAMES.has(targetBranch)) {
    return;
  }

  // Check if the branch exists locally
  const localExists = await branchExistsLocally(workspaceRoot, targetBranch);

  // Check if the branch exists on the remote
  let remoteExists = false;
  if (!localOnly) {
    remoteExists = await branchExistsOnRemote(workspaceRoot, targetBranch);
  }

  // If the branch already exists somewhere, nothing to do
  if (localExists || remoteExists) {
    return;
  }

  // Detect the main branch to create from
  const mainBranch = await detectTargetBranch(workspaceRoot);
  const hasOrigin = await hasRemote(workspaceRoot);

  // Determine the base ref: prefer remote main when available
  const baseRef = hasOrigin && !localOnly ? `origin/${mainBranch}` : mainBranch;

  // When using a remote ref, ensure it exists locally by fetching.
  // The remote tracking ref (e.g. origin/main) may not exist if no
  // fetch has been performed yet in this session.
  if (hasOrigin && !localOnly) {
    try {
      await execAsync(`git fetch origin ${mainBranch}`, {
        cwd: workspaceRoot,
        encoding: 'utf8',
      });
    } catch {
      // If fetch fails (e.g. network issues), fall through and try
      // to use whatever ref is available — git branch will fail with
      // a clear error if the ref truly doesn't exist.
    }
  }

  // Create the branch locally from the main branch HEAD
  await execAsync(`git branch ${targetBranch} ${baseRef}`, {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });

  // Push to remote if we have one
  if (!localOnly && hasOrigin) {
    await execAsync(`git push -u origin ${targetBranch}`, {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });
  }
}

/**
 * Check whether a branch exists locally.
 */
async function branchExistsLocally(
  workspaceRoot: string,
  branchName: string
): Promise<boolean> {
  try {
    await execAsync(`git rev-parse --verify refs/heads/${branchName}`, {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a branch exists on origin.
 */
async function branchExistsOnRemote(
  workspaceRoot: string,
  branchName: string
): Promise<boolean> {
  try {
    await execAsync(`git rev-parse --verify refs/remotes/origin/${branchName}`, {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

/**
 * Perform a merge of `sourceBranch` into `targetBranch` using a temporary
 * worktree. This never touches the main repo's HEAD or index.
 */
export async function mergeBranch(options: MergeBranchOptions): Promise<MergeBranchResult> {
  const {
    workspaceRoot,
    sourceBranch,
    mergeStrategy = 'squash',
    autoPush = true,
    commitMessage,
    preflight = true,
    syncLocal = true,
  } = options;

  // Auto-detect local-only mode when no remote is configured
  const localOnly = options.localOnly ?? !(await hasRemote(workspaceRoot));

  const targetBranch = options.targetBranch ?? await detectTargetBranch(workspaceRoot);

  // 1. Fetch latest remote state (skip when local-only)
  // Must happen before ensureTargetBranchExists so that origin/<mainBranch>
  // is available as a valid ref when creating new branches from remote HEAD.
  if (!localOnly) {
    await execAsync('git fetch origin', { cwd: workspaceRoot, encoding: 'utf8' });
  }

  // Ensure the target branch exists (auto-creates review branches from main)
  await ensureTargetBranchExists(workspaceRoot, targetBranch, localOnly);

  // Build commit message
  const message = commitMessage
    ?? (mergeStrategy === 'squash'
      ? `Squash merge ${sourceBranch} into ${targetBranch}`
      : `Merge branch '${sourceBranch}'`);

  // 1b. Check if source branch has any commits ahead of target.
  // If count is 0, the branch is already fully merged — nothing to do.
  try {
    const targetRef = localOnly ? targetBranch : `origin/${targetBranch}`;
    // Always use local source ref — the actual merge (squash or no-ff) at line ~416
    // operates on the local sourceBranch, so the pre-check must match.
    // Using origin/${sourceBranch} would miss unpushed local commits.
    const sourceRef = sourceBranch;
    const { stdout: countStr } = await execAsync(
      `git rev-list --count ${targetRef}..${sourceRef}`,
      { cwd: workspaceRoot, encoding: 'utf8' }
    );
    const commitsAhead = parseInt(countStr.trim(), 10);
    if (commitsAhead === 0) {
      return {
        success: true,
        hasConflict: false,
        alreadyMerged: true,
      };
    }
  } catch {
    // If rev-list fails (e.g. branch doesn't exist on remote), continue
    // with the normal merge flow which will produce a proper error.
  }

  // 2. Pre-flight conflict detection via merge-tree
  // When local-only, use the local targetBranch ref instead of origin/<targetBranch>
  if (preflight) {
    const preflightRef = localOnly ? targetBranch : `origin/${targetBranch}`;
    try {
      const { stdout: mergeBase } = await execAsync(
        `git merge-base ${preflightRef} ${sourceBranch}`,
        { cwd: workspaceRoot, encoding: 'utf8' }
      );
      const dryRun = await execAsync(
        `git merge-tree ${mergeBase.trim()} ${preflightRef} ${sourceBranch}`,
        { cwd: workspaceRoot, encoding: 'utf8' }
      ).catch((e: { stdout?: string }) => e);
      if (/^<{7} .+/m.test((dryRun as { stdout?: string }).stdout ?? '')) {
        const dryRunOutput = (dryRun as { stdout: string }).stdout;
        const conflictFiles = [...dryRunOutput.matchAll(/\+\+\+ b\/(.+)/g)].map(m => m[1]);
        return {
          success: false,
          hasConflict: true,
          error: 'Pre-flight: merge conflicts detected',
          conflictFiles: conflictFiles.length > 0 ? conflictFiles : undefined,
        };
      }
    } catch {
      // merge-base can fail if branches have no common ancestor; continue to worktree merge
    }
  }

  // 3. Create temp worktree
  const safeName = sourceBranch.replace(/[^a-zA-Z0-9-]/g, '-');
  const mergeDirName = `_merge-${safeName}-${Date.now()}`;
  const mergeDir = path.join(workspaceRoot, '.stoneforge/.worktrees', mergeDirName);

  // Clean up leftover worktree from a previously crashed run
  if (fs.existsSync(mergeDir)) {
    await execAsync(`git worktree remove --force "${mergeDir}"`, {
      cwd: workspaceRoot, encoding: 'utf8',
    });
  }

  // Create with detached HEAD at the target ref.
  // When remote exists, use origin/<target> for the latest remote state;
  // when local-only, use the local <target> branch directly.
  const worktreeStartRef = localOnly ? targetBranch : `origin/${targetBranch}`;
  await execAsync(`git worktree add --detach "${mergeDir}" ${worktreeStartRef}`, {
    cwd: workspaceRoot, encoding: 'utf8',
  });

  let mergeResult: MergeBranchResult = { success: false, hasConflict: false, error: 'Merge did not complete' };

  try {
    let commitHash: string;

    if (mergeStrategy === 'squash') {
      await execGitSafe(`merge --squash ${sourceBranch}`, mergeDir, workspaceRoot);

      // Protect sync files: restore target branch versions after squash merge.
      // Source branches may have divergent sync files (from auto-export or
      // agent commits) that corrupt the target during three-way merge.
      // The target branch is always authoritative for sync state.
      await restoreSyncFiles(mergeDir, workspaceRoot, worktreeStartRef);

      await execGitSafe(`commit -m "${message.replace(/"/g, '\\"')}"`, mergeDir, workspaceRoot);
      const { stdout: hash } = await execGitSafe('rev-parse HEAD', mergeDir, workspaceRoot);
      commitHash = hash.trim();
    } else {
      await execGitSafe(
        `merge --no-ff -m "${message.replace(/"/g, '\\"')}" ${sourceBranch}`,
        mergeDir, workspaceRoot
      );

      // Protect sync files for regular merges too
      const syncRestored = await restoreSyncFiles(mergeDir, workspaceRoot, worktreeStartRef);
      if (syncRestored) {
        await execGitSafe('commit --amend --no-edit', mergeDir, workspaceRoot);
      }

      const { stdout: hash } = await execGitSafe('rev-parse HEAD', mergeDir, workspaceRoot);
      commitHash = hash.trim();
    }

    // 6. Push to remote (skip when local-only or push disabled)
    let pushFailed = false;
    if (autoPush && !localOnly) {
      try {
        await execGitSafe(`push origin HEAD:${targetBranch}`, mergeDir, workspaceRoot);

        // Verify push landed on remote
        try {
          await execAsync(`git fetch origin ${targetBranch}`, { cwd: workspaceRoot, encoding: 'utf8' });
          // git merge-base --is-ancestor exits 0 if commitHash is ancestor of origin/targetBranch
          await execAsync(`git merge-base --is-ancestor ${commitHash} origin/${targetBranch}`, {
            cwd: workspaceRoot, encoding: 'utf8',
          });
        } catch {
          pushFailed = true;
          mergeResult = {
            success: false,
            commitHash,
            hasConflict: false,
            error: `Merge succeeded locally and push appeared to succeed, but post-push verification failed: commit ${commitHash} is not on origin/${targetBranch}. The merge commit may not have been delivered to the remote. Retry the push or re-merge.`,
          };
        }
      } catch (pushError) {
        const pushErrorMsg = pushError instanceof Error ? pushError.message : String(pushError);
        pushFailed = true;
        mergeResult = {
          success: false,
          commitHash,
          hasConflict: false,
          error: `Merge succeeded locally but push to origin failed: ${pushErrorMsg}. The merge commit (${commitHash}) was not delivered to the remote. Retry the push or re-merge.`,
        };
      }
    }

    if (!pushFailed) {
      mergeResult = { success: true, commitHash, hasConflict: false };
    }
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    const output = (execError.stdout ?? '') + (execError.stderr ?? '') + (execError.message ?? '');

    if (output.includes('CONFLICT') || output.includes('Automatic merge failed')) {
      // Abort the merge to clean up
      try {
        if (mergeStrategy === 'squash') {
          await execGitSafe('reset --hard HEAD', mergeDir, workspaceRoot);
        } else {
          await execGitSafe('merge --abort', mergeDir, workspaceRoot);
        }
      } catch {
        // Ignore abort errors
      }

      const conflictMatch = output.match(/CONFLICT \([^)]+\): Merge conflict in (.+)/g);
      const conflictFiles = conflictMatch?.map((m) => {
        const match = m.match(/in (.+)$/);
        return match ? match[1] : '';
      }).filter(Boolean);

      mergeResult = {
        success: false,
        hasConflict: true,
        error: 'Merge conflict detected',
        conflictFiles,
      };
    } else {
      mergeResult = {
        success: false,
        hasConflict: false,
        error: output || 'Merge failed',
      };
    }
  } finally {
    // 7. Always remove temp worktree
    try {
      await execAsync(`git worktree remove --force "${mergeDir}"`, {
        cwd: workspaceRoot, encoding: 'utf8',
      });
    } catch {
      // Ignore cleanup errors
    }
  }

  // 8. Sync local target branch
  // In local-only mode, fast-forward the local target branch to the merge commit.
  // With a remote, sync local branch after push (best-effort).
  if (mergeResult.success && syncLocal) {
    if (localOnly) {
      await syncLocalBranchFromCommit(workspaceRoot, targetBranch, mergeResult.commitHash!);
    } else if (autoPush) {
      await syncLocalBranch(workspaceRoot, targetBranch);
    }
  }

  return mergeResult;
}

/**
 * Fast-forward the local target branch ref to match origin, without
 * the dangerous checkout dance.
 *
 * - When NOT on the target branch: `git fetch origin target:target`
 *   updates the local ref without touching the working tree at all.
 * - When ON the target branch: `git merge --ff-only origin/target`
 *   fast-forwards in place (unavoidably touches working tree files).
 * - If either fails (e.g. non-ff divergence): logs a warning and
 *   returns silently. The merge is already pushed to remote.
 */
export async function syncLocalBranch(
  workspaceRoot: string,
  targetBranch: string
): Promise<void> {
  try {
    // Determine current branch (may be detached HEAD in worktrees)
    let currentBranch: string | undefined;
    try {
      const { stdout } = await execAsync(
        'git symbolic-ref --short HEAD',
        { cwd: workspaceRoot, encoding: 'utf8' }
      );
      currentBranch = stdout.trim();
    } catch {
      // Detached HEAD — not on any branch
    }

    if (!currentBranch) {
      console.warn('[git/merge] WARNING: workspace is in detached HEAD state during syncLocalBranch. Skipping sync. Run `git checkout master` to fix.');
      return;
    }

    if (currentBranch === targetBranch) {
      // We're on the target branch — fast-forward in place
      await execAsync(`git merge --ff-only origin/${targetBranch}`, {
        cwd: workspaceRoot, encoding: 'utf8',
      });
    } else {
      // Not on target branch — update the ref without touching the worktree
      await execAsync(`git fetch origin ${targetBranch}:${targetBranch}`, {
        cwd: workspaceRoot, encoding: 'utf8',
      });
    }
  } catch {
    // Non-fatal: local branch sync is best-effort.
    // The merge is already pushed to remote — user can `git pull` manually.
    console.warn('[git/merge] Failed to fast-forward local target branch (non-ff divergence or missing ref). Run `git pull` to sync manually.');
  }
}

/**
 * Fast-forward the local target branch to a specific commit hash.
 *
 * Used in local-only mode where there is no remote to sync from.
 * Updates the branch ref directly using `git branch -f` when not on
 * the target branch, or `git merge --ff-only <hash>` when on it.
 */
export async function syncLocalBranchFromCommit(
  workspaceRoot: string,
  targetBranch: string,
  commitHash: string
): Promise<void> {
  try {
    // Determine current branch
    let currentBranch: string | undefined;
    try {
      const { stdout } = await execAsync(
        'git symbolic-ref --short HEAD',
        { cwd: workspaceRoot, encoding: 'utf8' }
      );
      currentBranch = stdout.trim();
    } catch {
      // Detached HEAD
    }

    if (currentBranch === targetBranch) {
      // On the target branch — fast-forward in place
      await execAsync(`git merge --ff-only ${commitHash}`, {
        cwd: workspaceRoot, encoding: 'utf8',
      });
    } else {
      // Not on target branch — force-update the ref to point at the merge commit
      await execAsync(`git branch -f ${targetBranch} ${commitHash}`, {
        cwd: workspaceRoot, encoding: 'utf8',
      });
    }
  } catch {
    console.warn('[git/merge] Failed to update local target branch after local-only merge.');
  }
}
