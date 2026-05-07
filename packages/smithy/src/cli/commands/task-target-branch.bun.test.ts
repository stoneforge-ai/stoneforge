/**
 * Tests for the workspace `merge.targetBranch` config fallback used by the
 * `sf task` merge-related commands. Regression for #63: previously, the
 * config workaround Adam suggested was only consumed by prompt-builders
 * (sessions/scheduler/dispatch-daemon) for system-prompt context — the actual
 * git tooling never loaded it, so setting `merge.target_branch` had no effect
 * on `sf task merge` / `sf task complete` / `sf task update --status merged`.
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfigTargetBranch } from './task.js';

// ============================================================================
// Helpers
// ============================================================================

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    try { fn?.(); } catch { /* ignore */ }
  }
});

/**
 * Creates a tmp `.stoneforge` workspace with an optional `config.yaml`,
 * chdirs into it, and registers cleanup.
 */
function chdirIntoTmpWorkspace(yamlContent?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'sf-target-branch-test-'));
  mkdirSync(join(root, '.stoneforge'), { recursive: true });
  if (yamlContent !== undefined) {
    writeFileSync(join(root, '.stoneforge', 'config.yaml'), yamlContent, 'utf8');
  }
  const cwdBefore = process.cwd();
  process.chdir(root);
  cleanups.push(() => {
    process.chdir(cwdBefore);
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

// ============================================================================
// Tests
// ============================================================================

describe('loadConfigTargetBranch', () => {
  it('returns the configured value when `merge.target_branch` is set', async () => {
    chdirIntoTmpWorkspace('merge:\n  target_branch: dev\n');
    const value = await loadConfigTargetBranch();
    expect(value).toBe('dev');
  });

  it('returns undefined when no config file exists', async () => {
    chdirIntoTmpWorkspace();
    const value = await loadConfigTargetBranch();
    expect(value).toBeUndefined();
  });

  it('returns undefined when config exists but `merge` block is absent', async () => {
    chdirIntoTmpWorkspace('logging:\n  level: info\n');
    const value = await loadConfigTargetBranch();
    expect(value).toBeUndefined();
  });

  it('returns undefined when `merge.target_branch` is null', async () => {
    chdirIntoTmpWorkspace('merge:\n  target_branch: null\n');
    const value = await loadConfigTargetBranch();
    expect(value).toBeUndefined();
  });

  it('returns undefined when `merge.target_branch` is an empty string', async () => {
    chdirIntoTmpWorkspace('merge:\n  target_branch: ""\n');
    const value = await loadConfigTargetBranch();
    expect(value).toBeUndefined();
  });

  it('preserves non-default branch names (e.g. "develop", "release/v2")', async () => {
    chdirIntoTmpWorkspace('merge:\n  target_branch: release/v2\n');
    const value = await loadConfigTargetBranch();
    expect(value).toBe('release/v2');
  });
});
