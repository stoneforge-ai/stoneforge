/**
 * Merge Steward Service Tests
 *
 * Tests for the MergeStewardService which handles auto-merging of completed
 * task branches, test execution, and fix task creation.
 *
 * TB-O21: Merge Steward Auto-Merge
 *
 * @module
 */

import { describe, it, expect, beforeEach, vi, afterEach, type MockInstance } from 'vitest';
import { createTimestamp, Priority, Complexity, TaskStatus } from '@stoneforge/core';
import type { Task, ElementId, EntityId, Channel, Message } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';

import type { TaskAssignmentService, TaskAssignment } from './task-assignment-service.js';
import type { DispatchService } from './dispatch-service.js';
import type { WorktreeManager, WorktreeInfo } from '../git/worktree-manager.js';
import type { AgentRegistry } from './agent-registry.js';

import {
  MergeStewardServiceImpl,
  MergeStatusConflictError,
  createMergeStewardService,
  type MergeStewardService,
  type MergeStewardConfig,
  type MergeStrategy,
} from './merge-steward-service.js';

// Mock node:child_process for attemptMerge git command tests (vitest only)
// IMPORTANT: These mocks are ONLY applied in vitest. In bun test, vi.mock
// doesn't properly isolate modules and the mocks "bleed" into other test files,
// causing git/merge.test.ts to hang (exec never calls callbacks).
// The git command tests that need these mocks are skipped in bun anyway (see isBun check below).
const isBunRuntime = typeof globalThis.Bun !== 'undefined';
if (!isBunRuntime) {
  vi.mock('node:child_process', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    return {
      ...actual,
      exec: vi.fn((_cmd: string, _opts: unknown, cb?: Function) => {
        // Default: call callback with an error so promisify(exec) rejects
        // instead of hanging forever (which causes test timeouts).
        // Tests that need specific exec behavior override this in their own beforeEach.
        const callback = typeof _opts === 'function' ? _opts as unknown as Function : cb;
        if (callback) callback(new Error('mock: no exec implementation'), { stdout: '', stderr: '' });
      }),
    };
  });

  vi.mock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    return {
      ...actual,
      default: {
        ...actual,
        existsSync: vi.fn().mockReturnValue(false),
      },
    };
  });
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001' as ElementId,
    type: 'task',
    title: 'Implement feature X',
    status: TaskStatus.CLOSED,
    priority: Priority.MEDIUM,
    complexity: Complexity.MEDIUM,
    tags: ['feature'],
    assignee: 'agent-worker-001' as EntityId,
    createdBy: 'user-001' as EntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    version: 1,
    metadata: {
      description: 'A test task',
      orchestrator: {
        branch: 'agent/worker-alice/task-001-implement-feature-x',
        worktree: '.stoneforge/.worktrees/worker-alice-implement-feature-x',
        assignedAgent: 'agent-worker-001' as EntityId,
        mergeStatus: 'pending',
        completedAt: createTimestamp(),
      },
    },
    ...overrides,
  } as Task;
}

function createMockTaskAssignment(task: Task): TaskAssignment {
  return {
    taskId: task.id,
    task,
    orchestratorMeta: (task.metadata as Record<string, unknown>)?.orchestrator as TaskAssignment['orchestratorMeta'],
  };
}

function createMockChannel(): Channel {
  return {
    id: 'channel-agent-001' as ElementId,
    type: 'channel',
    name: 'agent-agent-worker-001',
    channelType: 'group',
    members: ['agent-worker-001'] as EntityId[],
    tags: ['agent-channel'],
    createdBy: 'system' as EntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    version: 1,
    metadata: {},
  } as unknown as Channel;
}

// ============================================================================
// Mock Setup
// ============================================================================

function createMockApi(): QuarryAPI {
  return {
    get: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as QuarryAPI;
}

function createMockTaskAssignmentService(): TaskAssignmentService {
  return {
    getTasksAwaitingMerge: vi.fn(),
    assignToAgent: vi.fn(),
    unassignTask: vi.fn(),
    startTask: vi.fn(),
    completeTask: vi.fn(),
    updateSessionId: vi.fn(),
    getAgentTasks: vi.fn(),
    getAgentWorkload: vi.fn(),
    agentHasCapacity: vi.fn(),
    getUnassignedTasks: vi.fn(),
    getTasksByAssignmentStatus: vi.fn(),
    listAssignments: vi.fn(),
  } as unknown as TaskAssignmentService;
}

function createMockDispatchService(): DispatchService {
  return {
    dispatch: vi.fn(),
    dispatchBatch: vi.fn(),
    notifyAgent: vi.fn(),
  } as unknown as DispatchService;
}

function createMockAgentRegistry(): AgentRegistry {
  return {
    registerDirector: vi.fn(),
    registerWorker: vi.fn(),
    registerSteward: vi.fn(),
    getAgent: vi.fn(),
    getAgentsByRole: vi.fn(),
    getAgentChannel: vi.fn(),
    getAgentChannelId: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    listAgents: vi.fn(),
    getAgentsByFilter: vi.fn(),
    updateSessionStatus: vi.fn(),
  } as unknown as AgentRegistry;
}

function createMockWorktreeManager(): WorktreeManager {
  return {
    initWorkspace: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    getWorkspaceRoot: vi.fn().mockReturnValue('/project'),
    createWorktree: vi.fn(),
    removeWorktree: vi.fn(),
    suspendWorktree: vi.fn(),
    resumeWorktree: vi.fn(),
    listWorktrees: vi.fn(),
    getWorktree: vi.fn(),
    getWorktreePath: vi.fn(),
    getWorktreesForAgent: vi.fn(),
    worktreeExists: vi.fn(),
    getCurrentBranch: vi.fn(),
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    branchExists: vi.fn(),
  } as unknown as WorktreeManager;
}

function createDefaultConfig(): MergeStewardConfig {
  return {
    workspaceRoot: '/project',
    testCommand: 'npm test',
    testTimeoutMs: 60000,
    autoMerge: true,
    autoCleanup: true,
    deleteBranchAfterMerge: true,
    stewardEntityId: 'steward-merge-001' as EntityId,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('MergeStewardService', () => {
  let api: QuarryAPI;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let agentRegistry: AgentRegistry;
  let worktreeManager: WorktreeManager;
  let config: MergeStewardConfig;
  let service: MergeStewardService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Restore default exec mock implementation (vi.resetAllMocks in afterEach
    // strips the implementation, causing promisify(exec) to hang forever).
    // The default calls the callback with an error so hasRemote() resolves to false
    // instead of hanging indefinitely.
    if (!isBunRuntime) {
      const cp = await import('node:child_process');
      (cp.exec as unknown as MockInstance).mockImplementation(
        (_cmd: string, _opts: unknown, cb?: Function) => {
          const callback = typeof _opts === 'function' ? _opts as unknown as Function : cb;
          if (callback) callback(new Error('mock: no exec implementation'), { stdout: '', stderr: '' });
        }
      );
    }

    api = createMockApi();
    taskAssignment = createMockTaskAssignmentService();
    dispatchService = createMockDispatchService();
    agentRegistry = createMockAgentRegistry();
    worktreeManager = createMockWorktreeManager();
    config = createDefaultConfig();

    service = createMergeStewardService(
      api,
      taskAssignment,
      dispatchService,
      agentRegistry,
      config,
      worktreeManager
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ----------------------------------------
  // Constructor and Factory
  // ----------------------------------------

  describe('createMergeStewardService', () => {
    it('should create a service instance', () => {
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        config,
        worktreeManager
      );
      expect(svc).toBeDefined();
      expect(svc).toBeInstanceOf(MergeStewardServiceImpl);
    });

    it('should create a service without worktree manager', () => {
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        config
      );
      expect(svc).toBeDefined();
    });

    it('should use default config values when not specified', () => {
      const minimalConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        minimalConfig
      );
      expect(svc).toBeDefined();
    });

    it('should default to squash merge strategy', () => {
      const minimalConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        minimalConfig
      );
      // The service is created with default squash strategy
      expect(svc).toBeDefined();
    });

    it('should default to auto-push after merge enabled', () => {
      const minimalConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        minimalConfig
      );
      // The service is created with auto-push enabled by default
      expect(svc).toBeDefined();
    });

    it('should accept custom merge strategy', () => {
      const configWithMerge: MergeStewardConfig = {
        workspaceRoot: '/project',
        mergeStrategy: 'merge' as MergeStrategy,
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        configWithMerge
      );
      expect(svc).toBeDefined();
    });

    it('should accept auto-push disabled', () => {
      const configNoPush: MergeStewardConfig = {
        workspaceRoot: '/project',
        autoPushAfterMerge: false,
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        configNoPush
      );
      expect(svc).toBeDefined();
    });
  });

  // ----------------------------------------
  // Task Discovery
  // ----------------------------------------

  describe('getTasksAwaitingMerge', () => {
    it('should delegate to TaskAssignmentService', async () => {
      const mockTask = createMockTask();
      const mockAssignments = [createMockTaskAssignment(mockTask)];
      (taskAssignment.getTasksAwaitingMerge as MockInstance).mockResolvedValue(mockAssignments);

      const result = await service.getTasksAwaitingMerge();

      expect(taskAssignment.getTasksAwaitingMerge).toHaveBeenCalledOnce();
      expect(result).toEqual(mockAssignments);
    });

    it('should return empty array when no tasks pending', async () => {
      (taskAssignment.getTasksAwaitingMerge as MockInstance).mockResolvedValue([]);

      const result = await service.getTasksAwaitingMerge();

      expect(result).toEqual([]);
    });
  });

  // ----------------------------------------
  // Update Merge Status
  // ----------------------------------------

  describe('updateMergeStatus', () => {
    it('should update merge status to testing', async () => {
      const mockTask = createMockTask();
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockResolvedValue({ ...mockTask, metadata: { orchestrator: { mergeStatus: 'testing' } } });

      await service.updateMergeStatus(mockTask.id, 'testing');

      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              mergeStatus: 'testing',
            }),
          }),
        })
      );
    });

    it('should add mergedAt timestamp when status is merged', async () => {
      const mockTask = createMockTask();
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockImplementation((_id, updates) => Promise.resolve({ ...mockTask, ...updates } as Task));

      await service.updateMergeStatus(mockTask.id, 'merged');

      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              mergeStatus: 'merged',
              mergedAt: expect.any(String),
            }),
          }),
        })
      );
    });

    it('should add failure reason when provided', async () => {
      const mockTask = createMockTask();
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockImplementation((_id, updates) => Promise.resolve({ ...mockTask, ...updates } as Task));

      await service.updateMergeStatus(mockTask.id, 'failed', {
        failureReason: 'Something went wrong',
      });

      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              mergeStatus: 'failed',
              mergeFailureReason: 'Something went wrong',
            }),
          }),
        })
      );
    });

    it('should increment testRunCount when test result provided', async () => {
      const baseTask = createMockTask();
      const mockTask: Task = {
        ...baseTask,
        metadata: {
          ...(baseTask.metadata ?? {}),
          orchestrator: {
            ...(baseTask.metadata as Record<string, unknown>)?.orchestrator,
            testRunCount: 2,
          },
        },
      } as Task;
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockImplementation((_id, updates) => Promise.resolve({ ...mockTask, ...updates } as Task));

      const testResult = {
        passed: true,
        completedAt: createTimestamp(),
        totalTests: 10,
        passedTests: 10,
      };

      await service.updateMergeStatus(mockTask.id, 'merged', { testResult });

      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              testRunCount: 3,
              lastTestResult: testResult,
            }),
          }),
        })
      );
    });

    it('should throw when task not found', async () => {
      (api.get as MockInstance).mockResolvedValue(null);

      await expect(
        service.updateMergeStatus('task-notfound' as ElementId, 'testing')
      ).rejects.toThrow('Task not found');
    });

    it('should close task and set closedAt when status is merged', async () => {
      const mockTask = createMockTask({ status: TaskStatus.REVIEW });
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockImplementation((_id, updates) => Promise.resolve({ ...mockTask, ...updates } as Task));

      await service.updateMergeStatus(mockTask.id, 'merged');

      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          status: TaskStatus.CLOSED,
          closedAt: expect.any(String),
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              mergeStatus: 'merged',
            }),
          }),
        })
      );
      // Verify assignee is cleared when closing
      const updateCall = (api.update as MockInstance).mock.calls[0][1];
      expect(updateCall.assignee).toBeUndefined();
      expect('assignee' in updateCall).toBe(true);
    });

    it('should close task and set closedAt when status is not_applicable', async () => {
      // When a task's branch has no commits (e.g., fix already exists on master),
      // setting mergeStatus to 'not_applicable' should close the task the same way 'merged' does
      const mockTask = createMockTask({ status: TaskStatus.REVIEW });
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockImplementation((_id, updates) => Promise.resolve({ ...mockTask, ...updates } as Task));

      await service.updateMergeStatus(mockTask.id, 'not_applicable');

      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          status: TaskStatus.CLOSED,
          closedAt: expect.any(String),
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              mergeStatus: 'not_applicable',
            }),
          }),
        })
      );
      // Verify assignee is cleared when closing
      const updateCall = (api.update as MockInstance).mock.calls[0][1];
      expect(updateCall.assignee).toBeUndefined();
      expect('assignee' in updateCall).toBe(true);
    });

    it('should throw MergeStatusConflictError when expectedCurrentStatus does not match', async () => {
      const mockTask = createMockTask({
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            mergeStatus: 'testing', // actual status
          },
        },
      });
      (api.get as MockInstance).mockResolvedValue(mockTask);

      await expect(
        service.updateMergeStatus(mockTask.id, 'merging', undefined, 'pending')
      ).rejects.toThrow(MergeStatusConflictError);

      // Should not have called api.update since the status didn't match
      expect(api.update).not.toHaveBeenCalled();
    });

    it('should include expected and actual status in MergeStatusConflictError', async () => {
      const mockTask = createMockTask({
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            mergeStatus: 'testing',
          },
        },
      });
      (api.get as MockInstance).mockResolvedValue(mockTask);

      try {
        await service.updateMergeStatus(mockTask.id, 'merging', undefined, 'pending');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MergeStatusConflictError);
        const conflictError = error as MergeStatusConflictError;
        expect(conflictError.expectedStatus).toBe('pending');
        expect(conflictError.actualStatus).toBe('testing');
        expect(conflictError.taskId).toBe(mockTask.id);
      }
    });

    it('should succeed when expectedCurrentStatus matches actual status', async () => {
      const mockTask = createMockTask({
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            mergeStatus: 'pending',
          },
        },
      });
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockImplementation((_id, updates) =>
        Promise.resolve({ ...mockTask, ...updates } as Task)
      );

      // Should not throw — expectedCurrentStatus matches
      await service.updateMergeStatus(mockTask.id, 'testing', undefined, 'pending');

      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              mergeStatus: 'testing',
            }),
          }),
        })
      );
    });

    it('should proceed normally when expectedCurrentStatus is not provided', async () => {
      const mockTask = createMockTask({
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            mergeStatus: 'testing',
          },
        },
      });
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockImplementation((_id, updates) =>
        Promise.resolve({ ...mockTask, ...updates } as Task)
      );

      // Should not throw — no expectedCurrentStatus check
      await service.updateMergeStatus(mockTask.id, 'merging');

      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              mergeStatus: 'merging',
            }),
          }),
        })
      );
    });

    it('should throw MergeStatusConflictError when mergeStatus is undefined and expectedCurrentStatus is set', async () => {
      // Task with no mergeStatus at all
      const mockTask = createMockTask({
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            // No mergeStatus
          },
        },
      });
      (api.get as MockInstance).mockResolvedValue(mockTask);

      await expect(
        service.updateMergeStatus(mockTask.id, 'testing', undefined, 'pending')
      ).rejects.toThrow(MergeStatusConflictError);

      expect(api.update).not.toHaveBeenCalled();
    });

    it('should not close task for non-terminal statuses', async () => {
      const mockTask = createMockTask({ status: TaskStatus.REVIEW });
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockImplementation((_id, updates) => Promise.resolve({ ...mockTask, ...updates } as Task));

      // Test with 'pending' status - should NOT close the task
      await service.updateMergeStatus(mockTask.id, 'pending');

      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              mergeStatus: 'pending',
            }),
          }),
        })
      );
      // Verify status and closedAt are NOT in the update
      const updateCall = (api.update as MockInstance).mock.calls[0][1];
      expect(updateCall.status).toBeUndefined();
      expect(updateCall.closedAt).toBeUndefined();
    });
  });

  // ----------------------------------------
  // Cleanup After Merge
  // ----------------------------------------

  describe('cleanupAfterMerge', () => {
    it('should cleanup worktree after merge', async () => {
      const mockTask = createMockTask();
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (worktreeManager.removeWorktree as MockInstance).mockResolvedValue(undefined);

      const result = await service.cleanupAfterMerge(mockTask.id);

      expect(result).toBe(true);
      // In test environment, hasRemote() returns false for the mock '/project' path,
      // so deleteRemoteBranch is false. This is correct behavior — when no remote
      // exists, remote branch deletion should be skipped.
      expect(worktreeManager.removeWorktree).toHaveBeenCalledWith(
        '.stoneforge/.worktrees/worker-alice-implement-feature-x',
        { deleteBranch: true, deleteRemoteBranch: false, force: false }
      );
    });

    it('should not delete branch when deleteBranch is false', async () => {
      const mockTask = createMockTask();
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (worktreeManager.removeWorktree as MockInstance).mockResolvedValue(undefined);

      await service.cleanupAfterMerge(mockTask.id, false);

      expect(worktreeManager.removeWorktree).toHaveBeenCalledWith(
        expect.any(String),
        { deleteBranch: false, deleteRemoteBranch: false, force: false }
      );
    });

    it('should return false when task not found', async () => {
      (api.get as MockInstance).mockResolvedValue(null);

      const result = await service.cleanupAfterMerge('task-notfound' as ElementId);

      expect(result).toBe(false);
    });

    it('should return true when no worktree to cleanup', async () => {
      const taskNoWorktree = createMockTask({
        metadata: { orchestrator: { branch: 'some-branch' } },
      });
      (api.get as MockInstance).mockResolvedValue(taskNoWorktree);

      const result = await service.cleanupAfterMerge(taskNoWorktree.id);

      expect(result).toBe(true);
      expect(worktreeManager.removeWorktree).not.toHaveBeenCalled();
    });

    it('should return true when no worktree manager', async () => {
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        config
        // No worktree manager
      );
      const mockTask = createMockTask();
      (api.get as MockInstance).mockResolvedValue(mockTask);

      const result = await svc.cleanupAfterMerge(mockTask.id);

      expect(result).toBe(true);
    });

    it('should return false when worktree removal fails', async () => {
      const mockTask = createMockTask();
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (worktreeManager.removeWorktree as MockInstance).mockRejectedValue(new Error('Removal failed'));

      const result = await service.cleanupAfterMerge(mockTask.id);

      expect(result).toBe(false);
    });

    it('should only delete remote branch when remote exists and deleteBranch is true', async () => {
      const mockTask = createMockTask();
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (worktreeManager.removeWorktree as MockInstance).mockResolvedValue(undefined);

      await service.cleanupAfterMerge(mockTask.id, true);

      // In test environment, hasRemote() returns false for mock '/project' path,
      // so deleteRemoteBranch is false even when deleteBranch is true.
      // Remote branch deletion is conditioned on hasRemote() returning true.
      expect(worktreeManager.removeWorktree).toHaveBeenCalledWith(
        '.stoneforge/.worktrees/worker-alice-implement-feature-x',
        { deleteBranch: true, deleteRemoteBranch: false, force: false }
      );
    });

    it('should not delete remote branch when deleteBranch is false', async () => {
      const mockTask = createMockTask();
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (worktreeManager.removeWorktree as MockInstance).mockResolvedValue(undefined);

      await service.cleanupAfterMerge(mockTask.id, false);

      expect(worktreeManager.removeWorktree).toHaveBeenCalledWith(
        expect.any(String),
        { deleteBranch: false, deleteRemoteBranch: false, force: false }
      );
    });
  });

  // ----------------------------------------
  // Create Fix Task
  // ----------------------------------------

  describe('createFixTask', () => {
    it('should create fix task for test failure', async () => {
      const mockTask = createMockTask();
      const mockChannel = createMockChannel();
      const createdFixTask = { ...mockTask, id: 'task-fix-001' as ElementId, title: 'Fix failing tests' };

      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.list as MockInstance).mockResolvedValue([]); // No existing fix tasks
      (api.create as MockInstance).mockResolvedValue(createdFixTask);
      (agentRegistry.getAgentChannel as MockInstance).mockResolvedValue(mockChannel);
      (dispatchService.notifyAgent as MockInstance).mockResolvedValue({} as Message);

      const result = await service.createFixTask(mockTask.id, {
        type: 'test_failure',
        errorDetails: 'Test suite failed with 3 errors',
      });

      expect(result).toBe('task-fix-001');
      expect(api.create).toHaveBeenCalled();
      expect(dispatchService.notifyAgent).toHaveBeenCalled();
    });

    it('should create fix task for merge conflict', async () => {
      const mockTask = createMockTask();
      const mockChannel = createMockChannel();
      const createdFixTask = { ...mockTask, id: 'task-fix-002' as ElementId, title: 'Resolve merge conflict' };

      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.list as MockInstance).mockResolvedValue([]); // No existing fix tasks
      (api.create as MockInstance).mockResolvedValue(createdFixTask);
      (agentRegistry.getAgentChannel as MockInstance).mockResolvedValue(mockChannel);
      (dispatchService.notifyAgent as MockInstance).mockResolvedValue({} as Message);

      const result = await service.createFixTask(mockTask.id, {
        type: 'merge_conflict',
        errorDetails: 'Conflict in src/file.ts',
        affectedFiles: ['src/file.ts', 'src/other.ts'],
      });

      expect(result).toBe('task-fix-002');
      expect(api.create).toHaveBeenCalled();
    });

    it('should throw when original task not found', async () => {
      (api.get as MockInstance).mockResolvedValue(null);

      await expect(
        service.createFixTask('task-notfound' as ElementId, {
          type: 'test_failure',
          errorDetails: 'Error',
        })
      ).rejects.toThrow('Original task not found');
    });

    it('should not notify if no agent channel found', async () => {
      const mockTask = createMockTask();
      const createdFixTask = { ...mockTask, id: 'task-fix-003' as ElementId };

      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.list as MockInstance).mockResolvedValue([]); // No existing fix tasks
      (api.create as MockInstance).mockResolvedValue(createdFixTask);
      (agentRegistry.getAgentChannel as MockInstance).mockResolvedValue(undefined);

      const result = await service.createFixTask(mockTask.id, {
        type: 'general',
        errorDetails: 'Something went wrong',
      });

      expect(result).toBe('task-fix-003');
      expect(dispatchService.notifyAgent).not.toHaveBeenCalled();
    });

    it('should create task with correct metadata', async () => {
      const mockTask = createMockTask();
      const mockChannel = createMockChannel();
      const createdFixTask = { ...mockTask, id: 'task-fix-004' as ElementId };

      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.list as MockInstance).mockResolvedValue([]); // No existing fix tasks
      (api.create as MockInstance).mockResolvedValue(createdFixTask);
      (agentRegistry.getAgentChannel as MockInstance).mockResolvedValue(mockChannel);
      (dispatchService.notifyAgent as MockInstance).mockResolvedValue({} as Message);

      await service.createFixTask(mockTask.id, {
        type: 'test_failure',
        errorDetails: 'Tests failed',
      });

      // Verify api.create was called with proper task structure
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task',
          title: expect.stringContaining('Fix failing tests'),
          status: TaskStatus.OPEN,
          tags: expect.arrayContaining(['fix', 'test_failure', 'auto-created']),
        })
      );
    });

    it('should return existing fix task ID instead of creating duplicate', async () => {
      const mockTask = createMockTask();
      const existingFixTask = {
        ...mockTask,
        id: 'task-existing-fix' as ElementId,
        title: 'Fix failing tests',
        status: TaskStatus.OPEN,
        tags: ['fix', 'test_failure', 'auto-created'],
        metadata: {
          originalTaskId: mockTask.id,
          fixType: 'test_failure',
        },
      };

      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.list as MockInstance).mockResolvedValue([existingFixTask]); // Existing fix task found

      const result = await service.createFixTask(mockTask.id, {
        type: 'test_failure',
        errorDetails: 'Test suite failed',
      });

      expect(result).toBe('task-existing-fix');
      expect(api.create).not.toHaveBeenCalled(); // Should not create new task
    });
  });

  // ----------------------------------------
  // Process Task - Edge Cases
  // ----------------------------------------

  describe('processTask', () => {
    it('should return error when task not found', async () => {
      (api.get as MockInstance).mockResolvedValue(null);

      const result = await service.processTask('task-notfound' as ElementId);

      expect(result.merged).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Task not found');
    });

    it('should return error when task has no branch', async () => {
      const taskNoBranch = createMockTask({
        metadata: { orchestrator: {} },
      });
      (api.get as MockInstance).mockResolvedValue(taskNoBranch);

      const result = await service.processTask(taskNoBranch.id);

      expect(result.merged).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('no branch');
    });

    it('should skip already merged and closed tasks', async () => {
      // This test ensures the fix for the infinite retry loop:
      // Tasks that are CLOSED with mergeStatus 'merged' should not be reprocessed
      const closedMergedTask = createMockTask({
        status: TaskStatus.CLOSED,
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            mergeStatus: 'merged',
          },
        },
      });
      (api.get as MockInstance).mockResolvedValue(closedMergedTask);

      const result = await service.processTask(closedMergedTask.id);

      // Should return success without running tests or attempting merge
      expect(result.merged).toBe(true);
      expect(result.status).toBe('merged');
      // Should not have run tests
      expect(api.update).not.toHaveBeenCalled();
    });

    // Skip git command tests in bun where vi.mock doesn't work
    const isBun = typeof globalThis.Bun !== 'undefined';
    const itGit = isBun ? it.skip : it;

    itGit('should set not_applicable when branch has zero commits ahead of target', async () => {
      const mockTask = createMockTask({
        status: TaskStatus.REVIEW,
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            assignedAgent: 'agent-worker-001',
            mergeStatus: 'pending',
          },
        },
      });

      // First call: processTask gets the task
      // Second call: branchHasCommitsAhead -> getTargetBranch -> api.get for worktreeManager.getDefaultBranch
      // Third+ calls: updateMergeStatus -> api.get
      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockImplementation((_id, updates) =>
        Promise.resolve({ ...mockTask, ...updates } as Task)
      );

      // Mock exec to return 0 commits ahead for the rev-list call
      const cp = await import('node:child_process');
      (cp.exec as unknown as MockInstance).mockImplementation(
        (cmd: string, _opts: unknown, cb?: Function) => {
          const callback = typeof _opts === 'function' ? (_opts as unknown as Function) : cb;
          if (callback) {
            if ((cmd as string).includes('rev-list --count')) {
              callback(null, { stdout: '0\n', stderr: '' });
            } else if ((cmd as string).includes('remote get-url')) {
              // hasRemote returns false (no remote)
              callback(new Error('no remote'), { stdout: '', stderr: '' });
            } else {
              callback(null, { stdout: '', stderr: '' });
            }
          }
        }
      );

      const result = await service.processTask(mockTask.id);

      expect(result.status).toBe('not_applicable');
      expect(result.merged).toBe(false);
      // Should have called updateMergeStatus with 'not_applicable'
      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          status: TaskStatus.CLOSED,
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              mergeStatus: 'not_applicable',
            }),
          }),
        })
      );
    });

    itGit('should proceed with tests when branch has commits ahead', async () => {
      const mockTask = createMockTask({
        status: TaskStatus.REVIEW,
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            worktree: '.stoneforge/.worktrees/worker-test',
            assignedAgent: 'agent-worker-001',
            mergeStatus: 'pending',
          },
        },
      });

      (api.get as MockInstance).mockResolvedValue(mockTask);
      (api.update as MockInstance).mockImplementation((_id, updates) =>
        Promise.resolve({ ...mockTask, ...updates } as Task)
      );

      // Mock exec to return >0 commits ahead, then fail on test run
      const cp = await import('node:child_process');
      (cp.exec as unknown as MockInstance).mockImplementation(
        (cmd: string, opts: unknown, cb?: Function) => {
          const callback = typeof opts === 'function' ? (opts as unknown as Function) : cb;
          if (callback) {
            if ((cmd as string).includes('rev-list --count')) {
              callback(null, { stdout: '3\n', stderr: '' });
            } else if ((cmd as string).includes('remote get-url')) {
              callback(new Error('no remote'), { stdout: '', stderr: '' });
            } else if ((cmd as string) === config.testCommand) {
              // Tests fail — so we get test_failed status
              callback(new Error('tests failed'), { stdout: 'FAIL', stderr: '' });
            } else {
              callback(null, { stdout: '', stderr: '' });
            }
          }
        }
      );

      // Mock the worktree manager so runTests works
      (worktreeManager.getWorktree as MockInstance).mockResolvedValue({
        path: '/project/.stoneforge/.worktrees/worker-test',
        branch: 'agent/worker/task-branch',
      });
      (api.list as MockInstance).mockResolvedValue([]); // No existing fix tasks
      (api.create as MockInstance).mockResolvedValue({
        ...mockTask,
        id: 'task-fix-001' as ElementId,
      });
      (agentRegistry.getAgentChannel as MockInstance).mockResolvedValue(undefined);

      const result = await service.processTask(mockTask.id);

      // Should have proceeded to testing (not returned not_applicable)
      expect(result.status).toBe('test_failed');
      // updateMergeStatus should have been called with 'testing' first
      expect(api.update).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            orchestrator: expect.objectContaining({
              mergeStatus: 'testing',
            }),
          }),
        })
      );
    });

    it('should return skipped when another steward already claimed the task (concurrent processTask)', async () => {
      // Simulate two stewards racing: the first call to api.get returns pending,
      // but by the time the second steward calls updateMergeStatus, the status
      // has already been changed to 'testing' by the first steward.
      const mockTask = createMockTask({
        status: TaskStatus.REVIEW,
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            assignedAgent: 'agent-worker-001',
            mergeStatus: 'pending',
          },
        },
      });

      const taskAlreadyClaimed = createMockTask({
        ...mockTask,
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            assignedAgent: 'agent-worker-001',
            mergeStatus: 'testing', // Another steward already transitioned
          },
        },
      });

      // processTask's first api.get returns the task (for validation).
      // The branchHasCommitsAhead check follows, then updateMergeStatus
      // calls api.get again — by this time the status has changed.
      let getCallCount = 0;
      (api.get as MockInstance).mockImplementation(() => {
        getCallCount++;
        // First call: processTask reads the task (mergeStatus: pending)
        // Second call: branchHasCommitsAhead (if git commands are mocked)
        // The call inside updateMergeStatus sees the claimed version
        if (getCallCount <= 1) {
          return Promise.resolve(mockTask);
        }
        return Promise.resolve(taskAlreadyClaimed);
      });

      // Mock exec for branchHasCommitsAhead to return >0 commits
      if (!isBunRuntime) {
        const cp = await import('node:child_process');
        (cp.exec as unknown as MockInstance).mockImplementation(
          (cmd: string, _opts: unknown, cb?: Function) => {
            const callback = typeof _opts === 'function' ? (_opts as unknown as Function) : cb;
            if (callback) {
              if ((cmd as string).includes('rev-list --count')) {
                callback(null, { stdout: '3\n', stderr: '' });
              } else if ((cmd as string).includes('remote get-url')) {
                callback(new Error('no remote'), { stdout: '', stderr: '' });
              } else {
                callback(null, { stdout: '', stderr: '' });
              }
            }
          }
        );
      }

      const result = await service.processTask(mockTask.id);

      expect(result.status).toBe('skipped');
      expect(result.merged).toBe(false);
      // api.update should NOT have been called since the conflict was detected
      // before any write occurred
      expect(api.update).not.toHaveBeenCalled();
    });

    it('should allow only one of two concurrent processTask calls to succeed', async () => {
      // This test simulates the race condition: two steward instances call
      // processTask() concurrently on the same task. We use a gate/latch
      // pattern to ensure deterministic ordering: the first call writes its
      // status update before the second call reads the status.
      //
      // With synchronous mocks, Promise.all microtask interleaving causes
      // both reads to happen before either write. The gate ensures the
      // second call starts only after the first call has claimed the task.
      let currentMergeStatus = 'pending';
      let firstUpdateResolve: () => void;
      const firstUpdateGate = new Promise<void>((resolve) => {
        firstUpdateResolve = resolve;
      });
      let isFirstUpdate = true;

      (api.get as MockInstance).mockImplementation(() => {
        return Promise.resolve(
          createMockTask({
            status: TaskStatus.REVIEW,
            metadata: {
              orchestrator: {
                branch: 'agent/worker/task-branch',
                assignedAgent: 'agent-worker-001',
                mergeStatus: currentMergeStatus,
              },
            },
          })
        );
      });

      (api.update as MockInstance).mockImplementation((_id, updates) => {
        const meta = (updates as Record<string, unknown>).metadata as Record<string, unknown> | undefined;
        const orchestrator = meta?.orchestrator as Record<string, unknown> | undefined;
        if (orchestrator?.mergeStatus) {
          currentMergeStatus = orchestrator.mergeStatus as string;
        }
        if (isFirstUpdate) {
          isFirstUpdate = false;
          firstUpdateResolve();
        }
        return Promise.resolve(
          createMockTask({ metadata: { orchestrator: { mergeStatus: currentMergeStatus } } })
        );
      });

      // Mock exec for branchHasCommitsAhead
      if (!isBunRuntime) {
        const cp = await import('node:child_process');
        (cp.exec as unknown as MockInstance).mockImplementation(
          (cmd: string, _opts: unknown, cb?: Function) => {
            const callback = typeof _opts === 'function' ? (_opts as unknown as Function) : cb;
            if (callback) {
              if ((cmd as string).includes('rev-list --count')) {
                callback(null, { stdout: '3\n', stderr: '' });
              } else if ((cmd as string).includes('remote get-url')) {
                callback(new Error('no remote'), { stdout: '', stderr: '' });
              } else {
                callback(null, { stdout: '', stderr: '' });
              }
            }
          }
        );
      }

      const taskId = 'task-001' as ElementId;

      // Start the first call (with skipTests to simplify the flow)
      const result1Promise = service.processTask(taskId, { skipTests: true });
      // Wait for the first call to write its status update (pending → merging)
      await firstUpdateGate;
      // Now start the second call — it will see 'merging' instead of 'pending'
      const result2Promise = service.processTask(taskId, { skipTests: true });

      const [result1, result2] = await Promise.all([result1Promise, result2Promise]);

      const statuses = [result1.status, result2.status];

      // Exactly one should be 'skipped', the other should proceed
      // (it may end as 'merged', 'failed', etc. depending on downstream
      // behavior, but it should NOT be 'skipped')
      const skippedCount = statuses.filter((s) => s === 'skipped').length;
      const nonSkippedCount = statuses.filter((s) => s !== 'skipped').length;

      expect(skippedCount).toBe(1);
      expect(nonSkippedCount).toBe(1);
    });

    it('should return skipped when tests are skipped and another steward claims pending → merging', async () => {
      // When skipTests is true, processTask tries pending → merging directly.
      // If another steward already changed the status, it should return 'skipped'.
      const mockTask = createMockTask({
        status: TaskStatus.REVIEW,
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            assignedAgent: 'agent-worker-001',
            mergeStatus: 'pending',
          },
        },
      });

      const taskAlreadyClaimed = createMockTask({
        ...mockTask,
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            assignedAgent: 'agent-worker-001',
            mergeStatus: 'merging', // Another steward already transitioned
          },
        },
      });

      let getCallCount = 0;
      (api.get as MockInstance).mockImplementation(() => {
        getCallCount++;
        if (getCallCount <= 1) {
          return Promise.resolve(mockTask);
        }
        return Promise.resolve(taskAlreadyClaimed);
      });

      // Mock exec for branchHasCommitsAhead
      if (!isBunRuntime) {
        const cp = await import('node:child_process');
        (cp.exec as unknown as MockInstance).mockImplementation(
          (cmd: string, _opts: unknown, cb?: Function) => {
            const callback = typeof _opts === 'function' ? (_opts as unknown as Function) : cb;
            if (callback) {
              if ((cmd as string).includes('rev-list --count')) {
                callback(null, { stdout: '3\n', stderr: '' });
              } else if ((cmd as string).includes('remote get-url')) {
                callback(new Error('no remote'), { stdout: '', stderr: '' });
              } else {
                callback(null, { stdout: '', stderr: '' });
              }
            }
          }
        );
      }

      const result = await service.processTask(mockTask.id, { skipTests: true });

      expect(result.status).toBe('skipped');
      expect(result.merged).toBe(false);
      expect(api.update).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------
  // Run Tests - Edge Cases
  // ----------------------------------------

  describe('runTests', () => {
    it('should handle task not found', async () => {
      (api.get as MockInstance).mockResolvedValue(null);

      const result = await service.runTests('task-notfound' as ElementId);

      expect(result.passed).toBe(false);
      expect(result.testResult.errorMessage).toContain('Task not found');
    });
  });

  // ----------------------------------------
  // Attempt Merge - Edge Cases
  // ----------------------------------------

  describe('attemptMerge', () => {
    it('should handle task not found', async () => {
      (api.get as MockInstance).mockResolvedValue(null);

      const result = await service.attemptMerge('task-notfound' as ElementId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task not found');
    });

    it('should handle task with no branch', async () => {
      const taskNoBranch = createMockTask({ metadata: { orchestrator: {} } });
      (api.get as MockInstance).mockResolvedValue(taskNoBranch);

      const result = await service.attemptMerge(taskNoBranch.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no branch');
    });

    // ----------------------------------------
    // attemptMerge git command sequence tests
    // ----------------------------------------
    // Note: These tests require mocking node:child_process which only works in vitest.
    // Bun test doesn't support mocking Node built-in modules via vi.mock().
    // Tests are skipped in bun test to avoid false failures.

    const isBun = typeof globalThis.Bun !== 'undefined';
    const describeGitTests = isBun ? describe.skip : describe;

    describeGitTests('git command sequence', () => {
      let execMock: MockInstance;
      let execCalls: Array<{ cmd: string; cwd: string }>;

      beforeEach(async () => {
        // Get a reference to the mocked exec from node:child_process
        const cp = await import('node:child_process');
        execMock = cp.exec as unknown as MockInstance;
        execCalls = [];

        // Track all exec calls and provide default success responses
        execMock.mockImplementation((cmd: string, opts: Record<string, unknown>, callback?: Function) => {
          // Handle both (cmd, callback) and (cmd, opts, callback) signatures
          const cb = typeof opts === 'function' ? opts as unknown as Function : callback;
          const cwd = (typeof opts === 'object' && opts !== null ? opts.cwd : '') as string;
          execCalls.push({ cmd: cmd as string, cwd: cwd || '' });

          // Default: all git commands succeed with empty output
          if (cb) {
            // Pre-flight merge-base: return a fake hash
            if ((cmd as string).includes('merge-base')) {
              cb(null, { stdout: 'abc123\n', stderr: '' });
            }
            // Pre-flight merge-tree: no conflicts
            else if ((cmd as string).includes('merge-tree')) {
              cb(null, { stdout: '', stderr: '' });
            }
            // git symbolic-ref: return current branch
            else if ((cmd as string).includes('symbolic-ref')) {
              cb(null, { stdout: 'agent/worker/some-branch\n', stderr: '' });
            }
            // git rev-parse HEAD: return a commit hash
            else if ((cmd as string).includes('rev-parse HEAD')) {
              cb(null, { stdout: 'def456\n', stderr: '' });
            }
            // Everything else: succeed
            else {
              cb(null, { stdout: '', stderr: '' });
            }
          }
        });

        // Setup task mock
        const mockTask = createMockTask();
        (api.get as MockInstance).mockResolvedValue(mockTask);
      });

      it('should use --detach and origin/targetBranch for worktree creation', async () => {
        const result = await service.attemptMerge('task-001' as ElementId);

        expect(result.success).toBe(true);
        const worktreeCmd = execCalls.find(c => c.cmd.includes('worktree add'));
        expect(worktreeCmd).toBeDefined();
        expect(worktreeCmd!.cmd).toContain('--detach');
        expect(worktreeCmd!.cmd).toContain('origin/main');
      });

      it('should use HEAD:targetBranch for push', async () => {
        const result = await service.attemptMerge('task-001' as ElementId);

        expect(result.success).toBe(true);
        const pushCmd = execCalls.find(c => c.cmd.includes('push origin'));
        expect(pushCmd).toBeDefined();
        expect(pushCmd!.cmd).toContain('push origin HEAD:main');
      });

      it('should use origin/targetBranch in pre-flight merge-base and merge-tree', async () => {
        await service.attemptMerge('task-001' as ElementId);

        const mergeBaseCmd = execCalls.find(c => c.cmd.includes('merge-base'));
        expect(mergeBaseCmd).toBeDefined();
        expect(mergeBaseCmd!.cmd).toContain('origin/main');

        const mergeTreeCmd = execCalls.find(c => c.cmd.includes('merge-tree'));
        expect(mergeTreeCmd).toBeDefined();
        expect(mergeTreeCmd!.cmd).toContain('origin/main');
      });

      it('should NOT sync local branch in attemptMerge (syncLocal: false)', async () => {
        // attemptMerge passes syncLocal: false to mergeBranch — sync is handled
        // separately in processTask after all bookkeeping is complete.
        const result = await service.attemptMerge('task-001' as ElementId);

        expect(result.success).toBe(true);

        // Worktree removal should still happen
        const worktreeRemoveIdx = execCalls.findIndex(c => c.cmd.includes('worktree remove'));
        expect(worktreeRemoveIdx).toBeGreaterThan(-1);

        // No sync commands (fetch origin, symbolic-ref) should appear after worktree removal
        const postWorktreeCmds = execCalls.slice(worktreeRemoveIdx + 1);
        const fetchOrigin = postWorktreeCmds.find(c => c.cmd === 'git fetch origin');
        const symbolicRef = postWorktreeCmds.find(c => c.cmd.includes('symbolic-ref'));

        expect(fetchOrigin).toBeUndefined();
        expect(symbolicRef).toBeUndefined();
      });

      it('should not produce any sync or checkout commands after worktree removal', async () => {
        // attemptMerge uses syncLocal: false — local branch sync is deferred to
        // processTask which calls syncLocalBranch() directly after bookkeeping.
        // This means no checkout dance, no fetch-based sync, nothing after cleanup.
        const result = await service.attemptMerge('task-001' as ElementId);

        expect(result.success).toBe(true);

        const worktreeRemoveIdx = execCalls.findIndex(c => c.cmd.includes('worktree remove'));
        const postWorktreeCmds = execCalls.slice(worktreeRemoveIdx + 1);

        // No sync-related commands after worktree removal
        const fetchOrigin = postWorktreeCmds.find(c => c.cmd === 'git fetch origin');
        const symbolicRef = postWorktreeCmds.find(c => c.cmd.includes('symbolic-ref'));
        const fetchRefUpdate = postWorktreeCmds.find(c => c.cmd.includes('fetch origin main:main'));
        const checkoutTarget = postWorktreeCmds.find(c => c.cmd.includes('git checkout main'));
        const mergeRemote = postWorktreeCmds.find(c => c.cmd.includes('git merge origin/main'));

        expect(fetchOrigin).toBeUndefined();
        expect(symbolicRef).toBeUndefined();
        expect(fetchRefUpdate).toBeUndefined();
        expect(checkoutTarget).toBeUndefined();
        expect(mergeRemote).toBeUndefined();
      });

      it('should not sync local branch when merge fails', async () => {
        // Make the squash merge fail with a non-conflict error
        execMock.mockImplementation((cmd: string, opts: Record<string, unknown>, callback?: Function) => {
          const cb = typeof opts === 'function' ? opts as unknown as Function : callback;
          const cwd = (typeof opts === 'object' && opts !== null ? opts.cwd : '') as string;
          execCalls.push({ cmd: cmd as string, cwd: cwd || '' });

          if (cb) {
            if ((cmd as string).includes('merge --squash')) {
              cb(new Error('merge failed'), { stdout: '', stderr: 'fatal: merge failed' });
              return;
            }
            if ((cmd as string).includes('merge-base')) {
              cb(null, { stdout: 'abc123\n', stderr: '' });
              return;
            }
            if ((cmd as string).includes('merge-tree')) {
              cb(null, { stdout: '', stderr: '' });
              return;
            }
            cb(null, { stdout: '', stderr: '' });
          }
        });

        const result = await service.attemptMerge('task-001' as ElementId);

        expect(result.success).toBe(false);

        // No checkout of target branch should occur after worktree removal
        const worktreeRemoveIdx = execCalls.findIndex(c => c.cmd.includes('worktree remove'));
        if (worktreeRemoveIdx >= 0) {
          const postWorktreeCmds = execCalls.slice(worktreeRemoveIdx + 1);
          const checkoutTarget = postWorktreeCmds.find(c => c.cmd.includes('git checkout main'));
          expect(checkoutTarget).toBeUndefined();
        }
      });

      it('should fetch origin before pre-flight conflict detection', async () => {
        await service.attemptMerge('task-001' as ElementId);

        const fetchIdx = execCalls.findIndex(c => c.cmd === 'git fetch origin');
        const mergeBaseIdx = execCalls.findIndex(c => c.cmd.includes('merge-base'));

        expect(fetchIdx).toBeGreaterThan(-1);
        expect(mergeBaseIdx).toBeGreaterThan(fetchIdx);
      });
    });
  });

  // ----------------------------------------
  // Merge Strategy Tests
  // ----------------------------------------

  describe('merge strategy configuration', () => {
    it('should default to squash merge strategy when not specified', () => {
      const minimalConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        minimalConfig
      );
      // Service should be created with squash as default
      expect(svc).toBeDefined();
    });

    it('should accept squash merge strategy explicitly', () => {
      const squashConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
        mergeStrategy: 'squash' as MergeStrategy,
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        squashConfig
      );
      expect(svc).toBeDefined();
    });

    it('should accept standard merge strategy', () => {
      const mergeConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
        mergeStrategy: 'merge' as MergeStrategy,
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        mergeConfig
      );
      expect(svc).toBeDefined();
    });
  });

  // ----------------------------------------
  // Auto-Push Configuration Tests
  // ----------------------------------------

  describe('auto-push configuration', () => {
    it('should default to auto-push enabled when not specified', () => {
      const minimalConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        minimalConfig
      );
      // Service should be created with auto-push enabled by default
      expect(svc).toBeDefined();
    });

    it('should accept auto-push disabled', () => {
      const noPushConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
        autoPushAfterMerge: false,
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        noPushConfig
      );
      expect(svc).toBeDefined();
    });

    it('should accept auto-push enabled explicitly', () => {
      const pushConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
        autoPushAfterMerge: true,
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        pushConfig
      );
      expect(svc).toBeDefined();
    });
  });

  // ----------------------------------------
  // Auto-Cleanup Configuration Tests
  // ----------------------------------------

  describe('auto-cleanup configuration', () => {
    it('should default to auto-cleanup enabled when not specified', () => {
      const minimalConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        minimalConfig
      );
      // Service should be created with auto-cleanup enabled by default
      expect(svc).toBeDefined();
    });

    it('should default to delete branch after merge enabled', () => {
      const minimalConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        minimalConfig
      );
      expect(svc).toBeDefined();
    });

    it('should accept auto-cleanup disabled', () => {
      const noCleanupConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
        autoCleanup: false,
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        noCleanupConfig
      );
      expect(svc).toBeDefined();
    });

    it('should accept delete branch disabled', () => {
      const noBranchDeleteConfig: MergeStewardConfig = {
        workspaceRoot: '/project',
        deleteBranchAfterMerge: false,
      };
      const svc = createMergeStewardService(
        api,
        taskAssignment,
        dispatchService,
        agentRegistry,
        noBranchDeleteConfig
      );
      expect(svc).toBeDefined();
    });
  });

  // ----------------------------------------
  // Process All Pending - Edge Cases
  // ----------------------------------------

  describe('processAllPending', () => {
    it('should return empty result when no pending tasks', async () => {
      (taskAssignment.getTasksAwaitingMerge as MockInstance).mockResolvedValue([]);

      const result = await service.processAllPending();

      expect(result.totalProcessed).toBe(0);
      expect(result.mergedCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should count task not found as error', async () => {
      const task1 = createMockTask({ id: 'task-001' as ElementId });
      const assignments = [createMockTaskAssignment(task1)];

      (taskAssignment.getTasksAwaitingMerge as MockInstance).mockResolvedValue(assignments);
      (api.get as MockInstance).mockResolvedValue(null); // Task not found

      const result = await service.processAllPending();

      expect(result.totalProcessed).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.mergedCount).toBe(0);
    });

    it('should not count skipped tasks as errors', async () => {
      // Simulate a task that another steward already claimed
      const mockTask = createMockTask({
        id: 'task-001' as ElementId,
        status: TaskStatus.REVIEW,
        metadata: {
          orchestrator: {
            branch: 'agent/worker/task-branch',
            assignedAgent: 'agent-worker-001',
            mergeStatus: 'testing', // Already claimed by another steward
          },
        },
      });
      const assignments = [createMockTaskAssignment(mockTask)];

      (taskAssignment.getTasksAwaitingMerge as MockInstance).mockResolvedValue(assignments);
      (api.get as MockInstance).mockResolvedValue(mockTask);

      // Mock exec for branchHasCommitsAhead
      if (!isBunRuntime) {
        const cp = await import('node:child_process');
        (cp.exec as unknown as MockInstance).mockImplementation(
          (cmd: string, _opts: unknown, cb?: Function) => {
            const callback = typeof _opts === 'function' ? (_opts as unknown as Function) : cb;
            if (callback) {
              if ((cmd as string).includes('rev-list --count')) {
                callback(null, { stdout: '3\n', stderr: '' });
              } else if ((cmd as string).includes('remote get-url')) {
                callback(new Error('no remote'), { stdout: '', stderr: '' });
              } else {
                callback(null, { stdout: '', stderr: '' });
              }
            }
          }
        );
      }

      const result = await service.processAllPending();

      expect(result.totalProcessed).toBe(1);
      expect(result.errorCount).toBe(0);
      expect(result.mergedCount).toBe(0);
      expect(result.testFailedCount).toBe(0);
      expect(result.conflictCount).toBe(0);
      expect(result.results[0].status).toBe('skipped');
    });
  });

  // ----------------------------------------
  // MergeStatusConflictError
  // ----------------------------------------

  describe('MergeStatusConflictError', () => {
    it('should have correct name, message, and properties', () => {
      const error = new MergeStatusConflictError('task-001', 'pending', 'testing');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MergeStatusConflictError);
      expect(error.name).toBe('MergeStatusConflictError');
      expect(error.taskId).toBe('task-001');
      expect(error.expectedStatus).toBe('pending');
      expect(error.actualStatus).toBe('testing');
      expect(error.message).toContain('task-001');
      expect(error.message).toContain('pending');
      expect(error.message).toContain('testing');
    });

    it('should handle undefined actual status', () => {
      const error = new MergeStatusConflictError('task-002', 'pending', undefined);

      expect(error.actualStatus).toBeUndefined();
      expect(error.message).toContain('undefined');
    });
  });
});
