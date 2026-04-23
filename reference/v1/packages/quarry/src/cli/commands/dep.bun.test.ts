/**
 * Dependency Commands Integration Tests
 *
 * Tests for the dependency management CLI commands:
 * - dep add: Add a dependency between elements
 * - dep remove: Remove a dependency
 * - dep list: List dependencies of an element
 * - dep tree: Show dependency tree for an element
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  depCommand,
  depAddCommand,
  depRemoveCommand,
  depListCommand,
  depTreeCommand,
} from './dep.js';
import { createCommand } from './crud.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '../../api/quarry-api.js';
import { DependencyType, type Dependency } from '@stoneforge/core';
import type { ElementId } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_dep_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides: T = {} as T
): GlobalOptions & T {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

// Helper to create a task and return its ID
async function createTestTask(
  title: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const options = createTestOptions({ title, ...extra });
  const result = await createCommand.handler(['task'], options);
  return (result.data as { id: string }).id;
}

// Helper to create API instance for direct manipulation
function createTestAPI() {
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  return { api: createQuarryAPI(backend), backend };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
  // Initialize the database so tests can run without auto-creation
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  backend.close();
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// dep add Command Tests
// ============================================================================

describe('dep add command', () => {
  test('adds a blocking dependency between tasks', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions({ type: 'blocks' });
    const result = await depAddCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    const dep = result.data as Dependency;
    expect(dep.blockedId).toBe(blockedId);
    expect(dep.blockerId).toBe(blockerId);
    expect(dep.type).toBe(DependencyType.BLOCKS);
  });

  test('adds an associative dependency', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions({ type: 'relates-to' });
    const result = await depAddCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const dep = result.data as Dependency;
    expect(dep.type).toBe(DependencyType.RELATES_TO);
  });

  test('accepts metadata as JSON', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const metadata = JSON.stringify({ note: 'test metadata', priority: 'high' });
    const options = createTestOptions({ type: 'references', metadata });
    const result = await depAddCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const dep = result.data as Dependency;
    expect(dep.metadata).toEqual({ note: 'test metadata', priority: 'high' });
  });

  test('fails without blocked argument', async () => {
    const options = createTestOptions({ type: 'blocks' });
    const result = await depAddCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails without blocker argument', async () => {
    const blockedId = await createTestTask('Blocked Task');

    const options = createTestOptions({ type: 'blocks' });
    const result = await depAddCommand.handler([blockedId], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails without type option', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions();
    const result = await depAddCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('type is required');
  });

  test('fails with invalid type', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions({ type: 'invalid-type' });
    const result = await depAddCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid dependency type');
  });

  test('fails when blocked element does not exist', async () => {
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions({ type: 'blocks' });
    const result = await depAddCommand.handler(['nonexistent-id', blockerId], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('fails when blocker element does not exist', async () => {
    const blockedId = await createTestTask('Blocked Task');

    const options = createTestOptions({ type: 'blocks' });
    const result = await depAddCommand.handler([blockedId, 'nonexistent-id'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('fails with invalid JSON metadata', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions({ type: 'references', metadata: 'not valid json' });
    const result = await depAddCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid JSON');
  });

  // NOTE: Cycle detection is not yet integrated into QuarryAPI (marked as TODO)
  // This test is skipped until cycle detection is implemented in the API layer
  test.skip('fails when dependency would create a cycle', async () => {
    const task1 = await createTestTask('Task 1');
    const task2 = await createTestTask('Task 2');

    // Create task1 -> task2 dependency
    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: task1 as ElementId,
      blockerId: task2 as ElementId,
      type: DependencyType.BLOCKS,
    });

    // Try to create task2 -> task1 dependency (would create a cycle)
    const options = createTestOptions({ type: 'blocks' });
    const result = await depAddCommand.handler([task2, task1], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('cycle');
  });

  test('returns JSON in JSON mode', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions({ type: 'blocks', json: true });
    const result = await depAddCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('object');
  });

  test('returns minimal output in quiet mode', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions({ type: 'blocks', quiet: true });
    const result = await depAddCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toContain('->');
  });
});

// ============================================================================
// dep remove Command Tests
// ============================================================================

describe('dep remove command', () => {
  test('removes an existing dependency', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    // Add dependency first
    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: blockedId as ElementId,
      blockerId: blockerId as ElementId,
      type: DependencyType.BLOCKS,
    });

    // Remove it via CLI
    const options = createTestOptions({ type: 'blocks' });
    const result = await depRemoveCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Removed');

    // Verify it's gone
    const { api: api2 } = createTestAPI();
    const deps = await api2.getDependencies(blockedId as ElementId);
    expect(deps.length).toBe(0);
  });

  test('fails without blocked argument', async () => {
    const options = createTestOptions({ type: 'blocks' });
    const result = await depRemoveCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });

  test('fails without blocker argument', async () => {
    const blockedId = await createTestTask('Blocked Task');

    const options = createTestOptions({ type: 'blocks' });
    const result = await depRemoveCommand.handler([blockedId], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });

  test('fails without type option', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions();
    const result = await depRemoveCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('type is required');
  });

  test('fails with invalid type', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions({ type: 'invalid-type' });
    const result = await depRemoveCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
  });

  test('fails when dependency does not exist', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const options = createTestOptions({ type: 'blocks' });
    const result = await depRemoveCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('returns JSON in JSON mode', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    // Add dependency first
    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: blockedId as ElementId,
      blockerId: blockerId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ type: 'blocks', json: true });
    const result = await depRemoveCommand.handler([blockedId, blockerId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as { removed: boolean }).removed).toBe(true);
  });
});

// ============================================================================
// dep list Command Tests
// ============================================================================

describe('dep list command', () => {
  test('lists outgoing dependencies', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId1 = await createTestTask('Blocker Task 1');
    const blockerId2 = await createTestTask('Blocker Task 2');

    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: blockedId as ElementId,
      blockerId: blockerId1 as ElementId,
      type: DependencyType.BLOCKS,
    });
    await api.addDependency({
      blockedId: blockedId as ElementId,
      blockerId: blockerId2 as ElementId,
      type: DependencyType.RELATES_TO,
    });

    const options = createTestOptions({ direction: 'out' });
    const result = await depListCommand.handler([blockedId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { dependencies: Dependency[]; dependents: Dependency[] };
    expect(data.dependencies.length).toBe(2);
    expect(data.dependents.length).toBe(0);
  });

  test('lists incoming dependencies', async () => {
    const blockerId = await createTestTask('Blocker Task');
    const blockedId1 = await createTestTask('Blocked Task 1');
    const blockedId2 = await createTestTask('Blocked Task 2');

    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: blockedId1 as ElementId,
      blockerId: blockerId as ElementId,
      type: DependencyType.BLOCKS,
    });
    await api.addDependency({
      blockedId: blockedId2 as ElementId,
      blockerId: blockerId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ direction: 'in' });
    const result = await depListCommand.handler([blockerId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { dependencies: Dependency[]; dependents: Dependency[] };
    expect(data.dependencies.length).toBe(0);
    expect(data.dependents.length).toBe(2);
  });

  test('lists both directions by default', async () => {
    const middleTask = await createTestTask('Middle Task');
    const upstreamTask = await createTestTask('Upstream Task');
    const downstreamTask = await createTestTask('Downstream Task');

    const { api } = createTestAPI();
    // middleTask depends on upstreamTask
    await api.addDependency({
      blockedId: middleTask as ElementId,
      blockerId: upstreamTask as ElementId,
      type: DependencyType.BLOCKS,
    });
    // downstreamTask depends on middleTask
    await api.addDependency({
      blockedId: downstreamTask as ElementId,
      blockerId: middleTask as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions();
    const result = await depListCommand.handler([middleTask], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { dependencies: Dependency[]; dependents: Dependency[] };
    expect(data.dependencies.length).toBe(1); // middleTask -> upstreamTask
    expect(data.dependents.length).toBe(1); // downstreamTask -> middleTask
  });

  test('filters by dependency type', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId1 = await createTestTask('Blocker Task 1');
    const blockerId2 = await createTestTask('Blocker Task 2');

    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: blockedId as ElementId,
      blockerId: blockerId1 as ElementId,
      type: DependencyType.BLOCKS,
    });
    await api.addDependency({
      blockedId: blockedId as ElementId,
      blockerId: blockerId2 as ElementId,
      type: DependencyType.RELATES_TO,
    });

    const options = createTestOptions({ type: 'blocks', direction: 'out' });
    const result = await depListCommand.handler([blockedId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { dependencies: Dependency[]; dependents: Dependency[] };
    expect(data.dependencies.length).toBe(1);
    expect(data.dependencies[0].type).toBe(DependencyType.BLOCKS);
  });

  test('fails without element argument', async () => {
    const options = createTestOptions();
    const result = await depListCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });

  test('fails when element does not exist', async () => {
    const options = createTestOptions();
    const result = await depListCommand.handler(['nonexistent-id'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('fails with invalid type filter', async () => {
    const blockedId = await createTestTask('Blocked Task');

    const options = createTestOptions({ type: 'invalid-type' });
    const result = await depListCommand.handler([blockedId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
  });

  test('fails with invalid direction', async () => {
    const blockedId = await createTestTask('Blocked Task');

    const options = createTestOptions({ direction: 'invalid' });
    const result = await depListCommand.handler([blockedId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
  });

  test('returns empty lists when no dependencies', async () => {
    const taskId = await createTestTask('Lonely Task');

    const options = createTestOptions();
    const result = await depListCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { dependencies: Dependency[]; dependents: Dependency[] };
    expect(data.dependencies.length).toBe(0);
    expect(data.dependents.length).toBe(0);
    expect(result.message).toContain('No outgoing');
    expect(result.message).toContain('No incoming');
  });

  test('returns JSON in JSON mode', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: blockedId as ElementId,
      blockerId: blockerId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ json: true });
    const result = await depListCommand.handler([blockedId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
  });

  test('returns IDs only in quiet mode', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: blockedId as ElementId,
      blockerId: blockerId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ quiet: true });
    const result = await depListCommand.handler([blockedId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain(blockerId);
  });
});

// ============================================================================
// dep tree Command Tests
// ============================================================================

describe('dep tree command', () => {
  test('shows dependency tree for element', async () => {
    const rootTask = await createTestTask('Root Task');
    const childTask1 = await createTestTask('Child Task 1');
    const childTask2 = await createTestTask('Child Task 2');
    const grandchildTask = await createTestTask('Grandchild Task');

    const { api } = createTestAPI();
    // Root depends on Child1 and Child2
    await api.addDependency({
      blockedId: rootTask as ElementId,
      blockerId: childTask1 as ElementId,
      type: DependencyType.BLOCKS,
    });
    await api.addDependency({
      blockedId: rootTask as ElementId,
      blockerId: childTask2 as ElementId,
      type: DependencyType.BLOCKS,
    });
    // Child1 depends on Grandchild
    await api.addDependency({
      blockedId: childTask1 as ElementId,
      blockerId: grandchildTask as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions();
    const result = await depTreeCommand.handler([rootTask], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    const tree = result.data as {
      root: unknown;
      nodeCount: number;
      dependencyDepth: number;
      dependentDepth: number;
    };
    expect(tree.nodeCount).toBeGreaterThanOrEqual(4);
    expect(tree.dependencyDepth).toBeGreaterThanOrEqual(2);
    expect(result.message).toContain('Dependency tree');
  });

  test('shows dependents (what depends on this)', async () => {
    const targetTask = await createTestTask('Target Task');
    const dependentTask1 = await createTestTask('Dependent Task 1');
    const dependentTask2 = await createTestTask('Dependent Task 2');

    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: dependentTask1 as ElementId,
      blockerId: targetTask as ElementId,
      type: DependencyType.BLOCKS,
    });
    await api.addDependency({
      blockedId: dependentTask2 as ElementId,
      blockerId: targetTask as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions();
    const result = await depTreeCommand.handler([targetTask], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tree = result.data as { dependentDepth: number };
    expect(tree.dependentDepth).toBeGreaterThanOrEqual(1);
    expect(result.message).toContain('Dependents');
  });

  test('fails without element argument', async () => {
    const options = createTestOptions();
    const result = await depTreeCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });

  test('fails when element does not exist', async () => {
    const options = createTestOptions();
    const result = await depTreeCommand.handler(['nonexistent-id'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('fails with invalid depth', async () => {
    const taskId = await createTestTask('Test Task');

    const options = createTestOptions({ depth: 'invalid' });
    const result = await depTreeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
  });

  test('fails with zero depth', async () => {
    const taskId = await createTestTask('Test Task');

    const options = createTestOptions({ depth: '0' });
    const result = await depTreeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('Test Task');

    const options = createTestOptions({ json: true });
    const result = await depTreeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('object');
  });

  test('returns IDs only in quiet mode', async () => {
    const blockedId = await createTestTask('Blocked Task');
    const blockerId = await createTestTask('Blocker Task');

    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: blockedId as ElementId,
      blockerId: blockerId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ quiet: true });
    const result = await depTreeCommand.handler([blockedId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain(blockedId);
    expect(result.data).toContain(blockerId);
  });

  test('handles element with no dependencies', async () => {
    const taskId = await createTestTask('Lonely Task');

    const options = createTestOptions();
    const result = await depTreeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tree = result.data as {
      dependencyDepth: number;
      dependentDepth: number;
      nodeCount: number;
    };
    expect(tree.dependencyDepth).toBe(0);
    expect(tree.dependentDepth).toBe(0);
    expect(tree.nodeCount).toBe(1);
    expect(result.message).toContain('(none)');
  });
});

// ============================================================================
// Main dep Command Tests
// ============================================================================

describe('dep command (parent)', () => {
  test('has correct subcommands', () => {
    expect(depCommand.subcommands).toBeDefined();
    expect(depCommand.subcommands?.add).toBe(depAddCommand);
    expect(depCommand.subcommands?.remove).toBe(depRemoveCommand);
    expect(depCommand.subcommands?.list).toBe(depListCommand);
    expect(depCommand.subcommands?.tree).toBe(depTreeCommand);
  });

  test('default handler works as dep list', async () => {
    const taskId = await createTestTask('Test Task');

    const options = createTestOptions();
    const result = await depCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { dependencies: Dependency[]; dependents: Dependency[] };
    expect(data.dependencies).toBeDefined();
    expect(data.dependents).toBeDefined();
  });
});

// ============================================================================
// Integration Tests - Full Workflow
// ============================================================================

describe('dependency workflow integration', () => {
  test('complete workflow: add, list, tree, remove', async () => {
    // Create tasks
    const task1 = await createTestTask('Task 1');
    const task2 = await createTestTask('Task 2');
    const task3 = await createTestTask('Task 3');

    // Add dependencies: task1 -> task2 -> task3
    let result = await depAddCommand.handler(
      [task1, task2],
      createTestOptions({ type: 'blocks' })
    );
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    result = await depAddCommand.handler(
      [task2, task3],
      createTestOptions({ type: 'blocks' })
    );
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // List dependencies for task2
    result = await depListCommand.handler([task2], createTestOptions());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const listData = result.data as { dependencies: Dependency[]; dependents: Dependency[] };
    expect(listData.dependencies.length).toBe(1); // task2 -> task3
    expect(listData.dependents.length).toBe(1); // task1 -> task2

    // Get tree for task1
    result = await depTreeCommand.handler([task1], createTestOptions());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const treeData = result.data as { nodeCount: number };
    expect(treeData.nodeCount).toBe(3);

    // Remove a dependency
    result = await depRemoveCommand.handler(
      [task1, task2],
      createTestOptions({ type: 'blocks' })
    );
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify removal
    result = await depListCommand.handler([task1], createTestOptions());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const afterRemove = result.data as { dependencies: Dependency[]; dependents: Dependency[] };
    expect(afterRemove.dependencies.length).toBe(0);
  });

  test('blocking dependency affects task readiness', async () => {
    const blockedTask = await createTestTask('Blocked Task');
    const blockerTask = await createTestTask('Blocker Task');

    // Add blocking dependency: blockerTask blocks blockedTask
    // CLI args: [blocked, blocker] with --type blocks
    // Semantics: blocked element waits for blocker to close
    const result = await depAddCommand.handler(
      [blockedTask, blockerTask],
      createTestOptions({ type: 'blocks' })
    );
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify via API that task is now blocked
    const { api } = createTestAPI();
    const ready = await api.ready();
    const blocked = await api.blocked();

    // Blocked task should not be in ready list
    expect(ready.some(t => t.id === blockedTask)).toBe(false);
    // Blocked task should be in blocked list
    expect(blocked.some(t => t.id === blockedTask)).toBe(true);
    // Blocker task should be in ready list (it's not blocked itself)
    expect(ready.some(t => t.id === blockerTask)).toBe(true);
  });
});
