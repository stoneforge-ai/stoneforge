/**
 * Task Commands Tests
 *
 * Tests for the shared helpers used by `sf task <subcommand>` — in particular
 * the merge-provider selection logic that was previously hard-wired to the
 * `LocalMergeProvider` regardless of `merge.requireApproval` config.
 *
 * Regression: <https://github.com/stoneforge-ai/stoneforge/issues/...>
 */

import { describe, it, expect, mock } from 'bun:test';
import type { MergeRequestProvider, MergeRequestResult, CreateMergeRequestOptions } from '../../services/merge-request-provider.js';
import type { Task } from '@stoneforge/core';
import {
  taskHandoffCommand,
  taskCompleteCommand,
  taskMergeCommand,
  taskRejectCommand,
  taskSyncCommand,
  taskSetOwnerCommand,
  selectMergeProvider,
  assertGhCliAvailable,
  type GhProbe,
} from './task.js';

// ============================================================================
// Test fixtures
// ============================================================================

function makeStubProvider(name: 'local' | 'github'): MergeRequestProvider {
  return {
    name,
    async createMergeRequest(_task: Task, _options: CreateMergeRequestOptions): Promise<MergeRequestResult> {
      return { provider: name };
    },
  };
}

// ============================================================================
// selectMergeProvider — the regression the fix addresses
// ============================================================================

describe('selectMergeProvider', () => {
  const localStub = makeStubProvider('local');
  const githubStub = makeStubProvider('github');

  /** Spy factories so we can assert which one was invoked. */
  function makeFactories() {
    const local = mock(() => localStub);
    const github = mock(() => githubStub);
    return { local, github };
  }

  it('returns LocalMergeProvider when requireApproval is false', () => {
    const factories = makeFactories();
    const provider = selectMergeProvider({ merge: { requireApproval: false } }, factories);

    expect(provider).toBe(localStub);
    expect(provider.name).toBe('local');
    expect(factories.local).toHaveBeenCalledTimes(1);
    expect(factories.github).not.toHaveBeenCalled();
  });

  it('returns GitHubMergeProvider when requireApproval is true', () => {
    const factories = makeFactories();
    const provider = selectMergeProvider({ merge: { requireApproval: true } }, factories);

    expect(provider).toBe(githubStub);
    expect(provider.name).toBe('github');
    expect(factories.github).toHaveBeenCalledTimes(1);
    expect(factories.local).not.toHaveBeenCalled();
  });

  it('defaults to LocalMergeProvider when merge.requireApproval is undefined', () => {
    const factories = makeFactories();
    const provider = selectMergeProvider({ merge: {} }, factories);

    expect(provider).toBe(localStub);
    expect(factories.local).toHaveBeenCalledTimes(1);
    expect(factories.github).not.toHaveBeenCalled();
  });

  it('defaults to LocalMergeProvider when merge config is absent entirely', () => {
    const factories = makeFactories();
    const provider = selectMergeProvider({}, factories);

    expect(provider).toBe(localStub);
    expect(factories.local).toHaveBeenCalledTimes(1);
    expect(factories.github).not.toHaveBeenCalled();
  });

  it('treats merge.requireApproval=undefined as the default (false)', () => {
    // Mirrors `loadConfig()` output where merge is present but the field
    // hasn't been overridden — `?? false` should kick in and we stay local.
    const factories = makeFactories();
    const provider = selectMergeProvider(
      { merge: { requireApproval: undefined } },
      factories,
    );

    expect(provider.name).toBe('local');
  });
});

// ============================================================================
// assertGhCliAvailable — the new error path when gh is missing
// ============================================================================

describe('assertGhCliAvailable', () => {
  it('resolves silently when gh is on PATH', async () => {
    const probe: GhProbe = mock(async () => ({ available: true }));
    await expect(assertGhCliAvailable(probe)).resolves.toBeUndefined();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('throws a user-friendly error when gh is missing', async () => {
    const probe: GhProbe = mock(async () => ({
      available: false,
      reason: 'spawn gh ENOENT',
    }));

    await expect(assertGhCliAvailable(probe)).rejects.toThrow(
      /Cannot create GitHub pull requests/,
    );
  });

  it('error message references requireApproval and how to fix it', async () => {
    const probe: GhProbe = async () => ({ available: false, reason: 'spawn gh ENOENT' });

    let caught: Error | undefined;
    try {
      await assertGhCliAvailable(probe);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).toContain('gh');
    expect(caught!.message).toContain('cli.github.com');
    expect(caught!.message).toContain('merge.requireApproval');
  });

  it('includes the probe failure reason in the error detail', async () => {
    const probe: GhProbe = async () => ({ available: false, reason: 'spawn gh ENOENT' });

    let caught: Error | undefined;
    try {
      await assertGhCliAvailable(probe);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught!.message).toContain('spawn gh ENOENT');
  });

  it('omits the detail parens when probe returns no reason', async () => {
    const probe: GhProbe = async () => ({ available: false });

    let caught: Error | undefined;
    try {
      await assertGhCliAvailable(probe);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).toBeDefined();
    // Ensure we don't emit empty parentheses like "PATH (). Install …"
    expect(caught!.message).not.toMatch(/PATH\s*\(\s*\)/);
  });
});

// ============================================================================
// Command structure — parity with sibling test files (agent.bun.test.ts etc.)
// ============================================================================

describe('taskHandoffCommand structure', () => {
  it('has correct name and description', () => {
    expect(taskHandoffCommand.name).toBe('handoff');
    expect(typeof taskHandoffCommand.description).toBe('string');
    expect(taskHandoffCommand.description.length).toBeGreaterThan(0);
  });

  it('exposes a handler function', () => {
    expect(typeof taskHandoffCommand.handler).toBe('function');
  });
});

describe('taskCompleteCommand structure', () => {
  it('has correct name and description', () => {
    expect(taskCompleteCommand.name).toBe('complete');
    expect(typeof taskCompleteCommand.description).toBe('string');
  });

  it('exposes a handler function', () => {
    expect(typeof taskCompleteCommand.handler).toBe('function');
  });

  it('declares the --no-mr option', () => {
    const noMr = taskCompleteCommand.options!.find((o) => o.name === 'no-mr');
    expect(noMr).toBeDefined();
  });
});

describe('taskMergeCommand structure', () => {
  it('has correct name and description', () => {
    expect(taskMergeCommand.name).toBe('merge');
    expect(typeof taskMergeCommand.description).toBe('string');
  });

  it('exposes a handler function', () => {
    expect(typeof taskMergeCommand.handler).toBe('function');
  });
});

describe('taskRejectCommand structure', () => {
  it('has correct name and description', () => {
    expect(taskRejectCommand.name).toBe('reject');
    expect(typeof taskRejectCommand.description).toBe('string');
  });

  it('declares the --reason option', () => {
    const reason = taskRejectCommand.options!.find((o) => o.name === 'reason');
    expect(reason).toBeDefined();
    expect(reason!.hasValue).toBe(true);
  });
});

describe('taskSyncCommand structure', () => {
  it('has correct name and description', () => {
    expect(taskSyncCommand.name).toBe('sync');
    expect(typeof taskSyncCommand.description).toBe('string');
  });
});

describe('taskSetOwnerCommand structure', () => {
  it('has correct name and description', () => {
    expect(taskSetOwnerCommand.name).toBe('set-owner');
    expect(typeof taskSetOwnerCommand.description).toBe('string');
  });
});
