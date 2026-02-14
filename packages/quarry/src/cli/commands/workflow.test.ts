/**
 * Workflow Commands Integration Tests
 *
 * Tests for the workflow CLI commands:
 * - workflow create: Instantiate a playbook into a workflow
 * - workflow list: List workflows
 * - workflow show: Show workflow details
 * - workflow delete: Delete ephemeral workflow
 * - workflow promote: Promote ephemeral to durable
 * - workflow gc: Garbage collect old ephemeral workflows
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { workflowCommand } from './workflow.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import type { Workflow } from '@stoneforge/core';
import { WorkflowStatus } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_workflow_workspace__');
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

// Helper to create a workflow and return its ID
async function createTestWorkflow(
  playbookName: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const createSubCmd = workflowCommand.subcommands!['create'];
  const options = createTestOptions({ ...extra });
  const result = await createSubCmd.handler([playbookName], options);
  return (result.data as { id: string }).id;
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Workflow Create Command Tests
// ============================================================================

describe('workflow create command', () => {
  const createSubCmd = workflowCommand.subcommands!['create'];

  test('creates a workflow from playbook name', async () => {
    const options = createTestOptions();
    const result = await createSubCmd.handler(['deploy'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const workflow = result.data as Workflow;
    expect(workflow.id).toMatch(/^el-/);
    expect(workflow.title).toContain('deploy');
    expect(workflow.type).toBe('workflow');
    expect(workflow.status).toBe(WorkflowStatus.PENDING);
    expect(workflow.ephemeral).toBe(false);
  });

  test('creates ephemeral workflow with --ephemeral flag', async () => {
    const options = createTestOptions({ ephemeral: true });
    const result = await createSubCmd.handler(['deploy'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = result.data as Workflow;
    expect(workflow.ephemeral).toBe(true);
  });

  test('creates workflow with custom title', async () => {
    const options = createTestOptions({ title: 'Custom Title' });
    const result = await createSubCmd.handler(['deploy'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = result.data as Workflow;
    expect(workflow.title).toBe('Custom Title');
  });

  test('creates workflow with variables', async () => {
    const options = createTestOptions({ var: ['env=prod', 'version=1.0'] });
    const result = await createSubCmd.handler(['deploy'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = result.data as Workflow;
    expect(workflow.variables.env).toBe('prod');
    expect(workflow.variables.version).toBe('1.0');
  });

  test('fails without playbook name', async () => {
    const options = createTestOptions();
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails with invalid variable format', async () => {
    const options = createTestOptions({ var: 'invalidformat' });
    const result = await createSubCmd.handler(['deploy'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid variable format');
  });
});

// ============================================================================
// Workflow List Command Tests
// ============================================================================

describe('workflow list command', () => {
  const listSubCmd = workflowCommand.subcommands!['list'];

  test('lists all workflows', async () => {
    await createTestWorkflow('deploy1');
    await createTestWorkflow('deploy2');

    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Workflow[]).length).toBe(2);
  });

  test('filters by ephemeral flag', async () => {
    await createTestWorkflow('durable');
    await createTestWorkflow('ephemeral', { ephemeral: true });

    const options = createTestOptions({ ephemeral: true });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workflows = result.data as Workflow[];
    expect(workflows.length).toBe(1);
    expect(workflows[0].ephemeral).toBe(true);
  });

  test('filters by durable flag', async () => {
    await createTestWorkflow('durable');
    await createTestWorkflow('ephemeral', { ephemeral: true });

    const options = createTestOptions({ durable: true });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workflows = result.data as Workflow[];
    expect(workflows.length).toBe(1);
    expect(workflows[0].ephemeral).toBe(false);
  });

  test('respects limit option', async () => {
    await createTestWorkflow('deploy1');
    await createTestWorkflow('deploy2');
    await createTestWorkflow('deploy3');

    const options = createTestOptions({ limit: '2' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Workflow[]).length).toBe(2);
  });

  test('returns empty message when no workflows', async () => {
    // Create and delete a workflow to initialize the database
    const workflowId = await createTestWorkflow('temp');
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);
    await api.delete(workflowId as unknown as ElementId, {});

    // Now list, which should filter out deleted (tombstone) workflows
    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No workflows found');
  });
});

// ============================================================================
// Workflow Show Command Tests
// ============================================================================

describe('workflow show command', () => {
  const showSubCmd = workflowCommand.subcommands!['show'];

  test('shows workflow details', async () => {
    const workflowId = await createTestWorkflow('deploy');

    const options = createTestOptions();
    const result = await showSubCmd.handler([workflowId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const workflow = result.data as Workflow;
    expect(String(workflow.id)).toBe(workflowId);
    expect(workflow.type).toBe('workflow');
  });

  test('fails without id', async () => {
    const options = createTestOptions();
    const result = await showSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent workflow', async () => {
    await createTestWorkflow('deploy');

    const options = createTestOptions();
    const result = await showSubCmd.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('fails when workflow is tombstoned (soft-deleted)', async () => {
    // Import delete command to soft-delete the workflow
    const { deleteCommand } = await import('./crud.js');

    // Create a workflow
    const workflowId = await createTestWorkflow('deploy');

    // Soft delete the workflow
    const deleteResult = await deleteCommand.handler([workflowId], createTestOptions({ force: true }));
    expect(deleteResult.exitCode).toBe(ExitCode.SUCCESS);

    // Try to show the tombstoned workflow - should fail with NOT_FOUND
    const result = await showSubCmd.handler([workflowId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Workflow not found');
  });
});

// ============================================================================
// Workflow Delete Command Tests
// ============================================================================

describe('workflow delete command', () => {
  const deleteSubCmd = workflowCommand.subcommands!['delete'];
  const showSubCmd = workflowCommand.subcommands!['show'];

  test('deletes an ephemeral workflow', async () => {
    const workflowId = await createTestWorkflow('ephemeral', { ephemeral: true });

    const options = createTestOptions();
    const result = await deleteSubCmd.handler([workflowId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Deleted');

    // After delete, the workflow is completely deleted and not accessible
    const showResult = await showSubCmd.handler([workflowId], createTestOptions({ json: true }));
    expect(showResult.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('fails for durable workflow', async () => {
    const workflowId = await createTestWorkflow('durable');

    const options = createTestOptions();
    const result = await deleteSubCmd.handler([workflowId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('durable');
  });

  test('fails without id', async () => {
    const options = createTestOptions();
    const result = await deleteSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails when workflow is tombstoned (soft-deleted)', async () => {
    // Import delete command to soft-delete the workflow
    const { deleteCommand } = await import('./crud.js');

    // Create an ephemeral workflow
    const workflowId = await createTestWorkflow('ephemeral', { ephemeral: true });

    // Soft delete the workflow
    const deleteResult = await deleteCommand.handler([workflowId], createTestOptions({ force: true }));
    expect(deleteResult.exitCode).toBe(ExitCode.SUCCESS);

    // Try to delete the tombstoned workflow - should fail with NOT_FOUND
    const result = await deleteSubCmd.handler([workflowId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Workflow not found');
  });
});

// ============================================================================
// Workflow Promote Command Tests
// ============================================================================

describe('workflow promote command', () => {
  const promoteSubCmd = workflowCommand.subcommands!['promote'];
  const showSubCmd = workflowCommand.subcommands!['show'];

  test('promotes an ephemeral workflow to durable', async () => {
    const workflowId = await createTestWorkflow('ephemeral', { ephemeral: true });

    const options = createTestOptions();
    const result = await promoteSubCmd.handler([workflowId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Promoted');

    // Verify workflow is now durable
    const showResult = await showSubCmd.handler([workflowId], createTestOptions({ json: true }));
    const workflow = showResult.data as Workflow;
    expect(workflow.ephemeral).toBe(false);
  });

  test('returns success for already durable workflow', async () => {
    const workflowId = await createTestWorkflow('durable');

    const options = createTestOptions();
    const result = await promoteSubCmd.handler([workflowId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already durable');
  });

  test('fails without id', async () => {
    const options = createTestOptions();
    const result = await promoteSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails when workflow is tombstoned (soft-deleted)', async () => {
    // Import delete command to soft-delete the workflow
    const { deleteCommand } = await import('./crud.js');

    // Create an ephemeral workflow
    const workflowId = await createTestWorkflow('ephemeral', { ephemeral: true });

    // Soft delete the workflow
    const deleteResult = await deleteCommand.handler([workflowId], createTestOptions({ force: true }));
    expect(deleteResult.exitCode).toBe(ExitCode.SUCCESS);

    // Try to promote the tombstoned workflow - should fail with NOT_FOUND
    const result = await promoteSubCmd.handler([workflowId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Workflow not found');
  });
});

// ============================================================================
// Workflow GC Command Tests
// ============================================================================

describe('workflow gc command', () => {
  const gcSubCmd = workflowCommand.subcommands!['gc'];

  test('reports no workflows eligible when empty', async () => {
    // Create a workflow that's not eligible (not ephemeral)
    await createTestWorkflow('durable');

    const options = createTestOptions();
    const result = await gcSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No workflows eligible');
  });

  test('dry-run shows what would be deleted', async () => {
    // Create a workflow first so database exists
    await createTestWorkflow('deploy');

    // Note: GC normally requires completed/failed ephemeral workflows older than threshold
    // For testing, we just verify the dry-run behavior
    const options = createTestOptions({ dryRun: true });
    const result = await gcSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('respects age option', async () => {
    // Create a workflow first so database exists
    await createTestWorkflow('deploy');

    const options = createTestOptions({ age: '30' });
    const result = await gcSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('fails with invalid age', async () => {
    // Create a workflow first so database exists
    await createTestWorkflow('deploy');

    const options = createTestOptions({ age: 'invalid' });
    const result = await gcSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Age must be');
  });
});

// ============================================================================
// Workflow Root Command Tests
// ============================================================================

describe('workflow root command', () => {
  test('defaults to list when no subcommand', async () => {
    await createTestWorkflow('deploy');

    const options = createTestOptions();
    const result = await workflowCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns error for unknown subcommand', async () => {
    const options = createTestOptions();
    const result = await workflowCommand.handler(['unknown'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Unknown subcommand');
  });
});

// ============================================================================
// Workflow Lifecycle E2E Tests
// ============================================================================

describe('workflow lifecycle scenarios', () => {
  const createSubCmd = workflowCommand.subcommands!['create'];
  const showSubCmd = workflowCommand.subcommands!['show'];
  const listSubCmd = workflowCommand.subcommands!['list'];
  const tasksSubCmd = workflowCommand.subcommands!['tasks'];
  const progressSubCmd = workflowCommand.subcommands!['progress'];
  const deleteSubCmd = workflowCommand.subcommands!['delete'];
  const promoteSubCmd = workflowCommand.subcommands!['promote'];

  test('complete workflow lifecycle: create → view → tasks → progress → update status', async () => {
    // 1. Create a workflow
    const createResult = await createSubCmd.handler(['deployment-pipeline'], createTestOptions({
      title: 'Production Deployment',
      var: ['env=production'],
    }));
    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = createResult.data as Workflow;
    expect(workflow.title).toBe('Production Deployment');
    expect(workflow.status).toBe(WorkflowStatus.PENDING);

    // 2. Show workflow details
    const showResult = await showSubCmd.handler([workflow.id as string], createTestOptions({ json: true }));
    expect(showResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((showResult.data as Workflow).id).toBe(workflow.id);

    // 3. View workflow in list
    const listResult = await listSubCmd.handler([], createTestOptions());
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((listResult.data as Workflow[]).map(w => w.id)).toContain(workflow.id);

    // 4. Check tasks (workflow created without steps has no tasks)
    const tasksResult = await tasksSubCmd.handler([workflow.id as string], createTestOptions({ json: true }));
    expect(tasksResult.exitCode).toBe(ExitCode.SUCCESS);
    // Empty workflow has no tasks
    expect((tasksResult.data as unknown[]) ?? []).toHaveLength(0);

    // 5. Check progress
    const progressResult = await progressSubCmd.handler([workflow.id as string], createTestOptions({ json: true }));
    expect(progressResult.exitCode).toBe(ExitCode.SUCCESS);
    const progress = progressResult.data as { totalTasks: number; completionPercentage: number };
    expect(progress.totalTasks).toBe(0);
    expect(progress.completionPercentage).toBe(0);
  });

  test('ephemeral workflow lifecycle: create → work → delete', async () => {
    // 1. Create ephemeral workflow
    const createResult = await createSubCmd.handler(['test-workflow'], createTestOptions({
      ephemeral: true,
      title: 'Ephemeral Test',
    }));
    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = createResult.data as Workflow;
    expect(workflow.ephemeral).toBe(true);

    // 2. Verify it appears in list with ephemeral filter
    let listResult = await listSubCmd.handler([], createTestOptions({ ephemeral: true }));
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((listResult.data as Workflow[]).map(w => w.id)).toContain(workflow.id);

    // 3. Delete the ephemeral workflow
    const deleteResult = await deleteSubCmd.handler([workflow.id as string], createTestOptions());
    expect(deleteResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(deleteResult.message).toContain('Deleted');

    // 4. Verify workflow is no longer accessible (deleted)
    const showResult = await showSubCmd.handler([workflow.id as string], createTestOptions());
    // After delete, showing the workflow returns NOT_FOUND since it's deleted
    expect(showResult.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('ephemeral to durable promotion: create → promote → verify durable', async () => {
    // 1. Create ephemeral workflow
    const createResult = await createSubCmd.handler(['promotable-workflow'], createTestOptions({
      ephemeral: true,
      title: 'Promotable Workflow',
    }));
    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = createResult.data as Workflow;
    expect(workflow.ephemeral).toBe(true);

    // 2. Promote to durable
    const promoteResult = await promoteSubCmd.handler([workflow.id as string], createTestOptions());
    expect(promoteResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(promoteResult.message).toContain('Promoted');

    // 3. Verify workflow is now durable
    const showResult = await showSubCmd.handler([workflow.id as string], createTestOptions({ json: true }));
    expect(showResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((showResult.data as Workflow).ephemeral).toBe(false);

    // 4. Verify it appears in durable list
    const listResult = await listSubCmd.handler([], createTestOptions({ durable: true }));
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((listResult.data as Workflow[]).map(w => w.id)).toContain(workflow.id);
  });

  test('workflow variables lifecycle: create with vars → verify stored', async () => {
    // 1. Create with multiple variables
    const createResult = await createSubCmd.handler(['parameterized-workflow'], createTestOptions({
      title: 'Variable Test',
      var: ['env=staging', 'version=2.0.0', 'region=us-west-2'],
    }));
    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = createResult.data as Workflow;

    // 2. Verify variables are stored
    expect(workflow.variables).toBeDefined();
    expect(workflow.variables.env).toBe('staging');
    expect(workflow.variables.version).toBe('2.0.0');
    expect(workflow.variables.region).toBe('us-west-2');

    // 3. Verify variables persist after retrieval
    const showResult = await showSubCmd.handler([workflow.id as string], createTestOptions({ json: true }));
    expect(showResult.exitCode).toBe(ExitCode.SUCCESS);
    const retrievedWorkflow = showResult.data as Workflow;
    expect(retrievedWorkflow.variables.env).toBe('staging');
  });

  test('multiple workflows lifecycle: create multiple → list → filter', async () => {
    // 1. Create multiple workflows with different properties
    await createSubCmd.handler(['wf-a'], createTestOptions({ title: 'Workflow A' }));
    await createSubCmd.handler(['wf-b'], createTestOptions({ title: 'Workflow B', ephemeral: true }));
    await createSubCmd.handler(['wf-c'], createTestOptions({ title: 'Workflow C' }));

    // 2. List all workflows
    let listResult = await listSubCmd.handler([], createTestOptions());
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const allWorkflows = listResult.data as Workflow[];
    expect(allWorkflows.length).toBeGreaterThanOrEqual(3);

    // 3. Filter by durable only
    listResult = await listSubCmd.handler([], createTestOptions({ durable: true }));
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const durableWorkflows = listResult.data as Workflow[];
    expect(durableWorkflows.every(w => w.ephemeral === false)).toBe(true);

    // 4. Filter by ephemeral only
    listResult = await listSubCmd.handler([], createTestOptions({ ephemeral: true }));
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const ephemeralWorkflows = listResult.data as Workflow[];
    expect(ephemeralWorkflows.every(w => w.ephemeral === true)).toBe(true);

    // 5. Limit results
    listResult = await listSubCmd.handler([], createTestOptions({ limit: '2' }));
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((listResult.data as Workflow[]).length).toBe(2);
  });

  test('error handling: operations on non-existent workflow', async () => {
    // Create a workflow first so the database exists
    await createSubCmd.handler(['setup-workflow'], createTestOptions({ title: 'Setup' }));
    const fakeId = 'el-nonexistent';

    // Show non-existent workflow
    const showResult = await showSubCmd.handler([fakeId], createTestOptions());
    expect(showResult.exitCode).toBe(ExitCode.NOT_FOUND);

    // Tasks/progress/delete/promote for non-existent workflow return GENERAL_ERROR
    // because they catch errors and return generic failure (could be improved)
    const tasksResult = await tasksSubCmd.handler([fakeId], createTestOptions());
    expect(tasksResult.exitCode).toBe(ExitCode.GENERAL_ERROR);

    const progressResult = await progressSubCmd.handler([fakeId], createTestOptions());
    expect(progressResult.exitCode).toBe(ExitCode.GENERAL_ERROR);

    const deleteResult = await deleteSubCmd.handler([fakeId], createTestOptions());
    expect(deleteResult.exitCode).toBe(ExitCode.NOT_FOUND);

    const promoteResult = await promoteSubCmd.handler([fakeId], createTestOptions());
    expect(promoteResult.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('workflow status transitions via API', async () => {
    // 1. Create workflow (starts in PENDING)
    const createResult = await createSubCmd.handler(['status-test'], createTestOptions({
      title: 'Status Transition Test',
    }));
    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = createResult.data as Workflow;
    expect(workflow.status).toBe(WorkflowStatus.PENDING);

    // 2. Manually update status via API
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Transition to RUNNING
    await api.update(workflow.id as ElementId, { status: WorkflowStatus.RUNNING });
    let showResult = await showSubCmd.handler([workflow.id as string], createTestOptions({ json: true }));
    expect((showResult.data as Workflow).status).toBe(WorkflowStatus.RUNNING);

    // Transition to COMPLETED
    await api.update(workflow.id as ElementId, { status: WorkflowStatus.COMPLETED });
    showResult = await showSubCmd.handler([workflow.id as string], createTestOptions({ json: true }));
    expect((showResult.data as Workflow).status).toBe(WorkflowStatus.COMPLETED);

    backend.close();
  });
});

// ============================================================================
// Workflow GC E2E Tests
// ============================================================================

describe('workflow garbage collection scenarios', () => {
  const createSubCmd = workflowCommand.subcommands!['create'];
  const gcSubCmd = workflowCommand.subcommands!['gc'];

  test('garbage collection respects age threshold', async () => {
    // Create an ephemeral workflow
    await createSubCmd.handler(['gc-test'], createTestOptions({
      ephemeral: true,
      title: 'GC Test Workflow',
    }));

    // Run GC with very high age threshold (won't delete anything)
    const gcResult = await gcSubCmd.handler([], createTestOptions({ age: '999' }));
    expect(gcResult.exitCode).toBe(ExitCode.SUCCESS);
    // New workflows are not old enough to be collected
  });

  test('garbage collection dry-run mode', async () => {
    // Create an ephemeral workflow
    await createSubCmd.handler(['dry-run-test'], createTestOptions({
      ephemeral: true,
      title: 'Dry Run Test',
    }));

    // Run GC in dry-run mode
    const gcResult = await gcSubCmd.handler([], createTestOptions({ dryRun: true }));
    expect(gcResult.exitCode).toBe(ExitCode.SUCCESS);
    // Should report what would be deleted without actually deleting
  });

  test('durable workflows are not affected by GC', async () => {
    // Create a durable workflow
    const createResult = await createSubCmd.handler(['durable-gc-test'], createTestOptions({
      title: 'Durable Workflow',
    }));
    const workflow = createResult.data as Workflow;
    expect(workflow.ephemeral).toBe(false);

    // Run GC
    const gcResult = await gcSubCmd.handler([], createTestOptions({ age: '0' }));
    expect(gcResult.exitCode).toBe(ExitCode.SUCCESS);

    // Durable workflow should still exist
    const showSubCmd = workflowCommand.subcommands!['show'];
    const showResult = await showSubCmd.handler([workflow.id as string], createTestOptions({ json: true }));
    expect(showResult.exitCode).toBe(ExitCode.SUCCESS);
  });
});
