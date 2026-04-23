/**
 * Worker Task Service Tests
 *
 * Tests for the WorkerTaskService which orchestrates the complete workflow
 * for workers picking up tasks and working in isolated worktrees.
 *
 * @module
 */

import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest';
import { createTimestamp, Priority, Complexity } from '@stoneforge/core';
import type { Task, Entity, ElementId, EntityId, Timestamp } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';

import type { TaskAssignmentService } from './task-assignment-service.js';
import type { AgentRegistry } from './agent-registry.js';
import type { DispatchService, DispatchResult } from './dispatch-service.js';
import type { WorktreeManager, CreateWorktreeResult, WorktreeInfo } from '../git/worktree-manager.js';
import type { SpawnerService } from '../runtime/spawner.js';
import type { SessionManager, SessionRecord } from '../runtime/session-manager.js';
import type { AgentEntity } from '../api/orchestrator-api.js';

import {
  WorkerTaskServiceImpl,
  createWorkerTaskService,
  type WorkerTaskService,
  type StartWorkerOnTaskOptions,
} from './worker-task-service.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001' as ElementId,
    type: 'task',
    title: 'Test Task',
    status: 'open',
    priority: Priority.MEDIUM,
    complexity: Complexity.MEDIUM,
    tags: ['test', 'feature'],
    createdBy: 'user-001' as EntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    version: 1,
    metadata: {
      description: 'A test task for unit testing',
    },
    ...overrides,
  } as Task;
}

function createMockAgent(overrides: Partial<Entity> = {}): AgentEntity {
  return {
    id: 'agent-worker-001' as EntityId as unknown as ElementId,
    type: 'entity',
    name: 'Worker Alice',
    entityType: 'agent',
    tags: ['agent', 'worker'],
    createdBy: 'user-001' as EntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    version: 1,
    metadata: {
      agent: {
        agentRole: 'worker',
        workerMode: 'ephemeral',
        maxConcurrentTasks: 3,
      },
    },
    ...overrides,
  } as unknown as AgentEntity;
}

function createMockSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-001',
    providerSessionId: 'claude-session-abc123',
    agentId: 'agent-worker-001' as EntityId,
    agentRole: 'worker',
    workerMode: 'ephemeral',
    status: 'running',
    workingDirectory: '/path/to/worktree',
    createdAt: createTimestamp(),
    startedAt: createTimestamp(),
    lastActivityAt: createTimestamp(),
    ...overrides,
  } as SessionRecord;
}

function createMockWorktreeResult(): CreateWorktreeResult {
  return {
    worktree: {
      path: '/project/.stoneforge/.worktrees/worker-alice-test-task',
      relativePath: '.stoneforge/.worktrees/worker-alice-test-task',
      branch: 'agent/worker-alice/task-001-test-task',
      head: 'abc123',
      isMain: false,
      state: 'active',
      agentName: 'worker-alice',
      taskId: 'task-001' as ElementId,
      createdAt: createTimestamp(),
    },
    branch: 'agent/worker-alice/task-001-test-task',
    path: '/project/.stoneforge/.worktrees/worker-alice-test-task',
    branchCreated: true,
  };
}

function createMockDispatchResult(task: Task, agent: AgentEntity): DispatchResult {
  return {
    task,
    agent,
    notification: {
      id: 'msg-001' as ElementId,
      type: 'message',
      channelId: 'channel-agent-001',
      sender: 'system' as EntityId,
      contentRef: 'doc-001',
      tags: ['dispatch-notification'],
      createdBy: 'system' as EntityId,
      createdAt: createTimestamp(),
      updatedAt: createTimestamp(),
      version: 1,
      metadata: {},
    } as unknown as DispatchResult['notification'],
    channel: {
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
    } as unknown as DispatchResult['channel'],
    isNewAssignment: true,
    dispatchedAt: createTimestamp(),
  };
}

// ============================================================================
// Mock Factory Functions
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

function createMockTaskAssignment(): TaskAssignmentService {
  return {
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
    getTasksAwaitingMerge: vi.fn(),
  } as unknown as TaskAssignmentService;
}

function createMockAgentRegistry(): AgentRegistry {
  return {
    registerAgent: vi.fn(),
    updateAgent: vi.fn(),
    unregisterAgent: vi.fn(),
    getAgent: vi.fn(),
    listAgents: vi.fn(),
    getAgentsByRole: vi.fn(),
    getAvailableWorkers: vi.fn(),
    getStewards: vi.fn(),
    updateAgentStatus: vi.fn(),
    getAgentChannel: vi.fn(),
    getAgentChannelId: vi.fn(),
  } as unknown as AgentRegistry;
}

function createMockDispatchService(): DispatchService {
  return {
    dispatch: vi.fn(),
    dispatchBatch: vi.fn(),
    notifyAgent: vi.fn(),
  } as unknown as DispatchService;
}

function createMockWorktreeManager(): WorktreeManager {
  return {
    initWorkspace: vi.fn(),
    createWorktree: vi.fn(),
    removeWorktree: vi.fn(),
    suspendWorktree: vi.fn(),
    resumeWorktree: vi.fn(),
    listWorktrees: vi.fn(),
    getWorktree: vi.fn(),
    getWorktreesForAgent: vi.fn(),
    getWorktreePath: vi.fn(),
    worktreeExists: vi.fn(),
    getCurrentBranch: vi.fn(),
    getDefaultBranch: vi.fn(),
    branchExists: vi.fn(),
  } as unknown as WorktreeManager;
}

function createMockSpawnerService(): SpawnerService {
  return {
    spawn: vi.fn(),
    terminate: vi.fn(),
    suspend: vi.fn(),
    getSession: vi.fn(),
    listActiveSessions: vi.fn(),
    listAllSessions: vi.fn(),
    getMostRecentSession: vi.fn(),
    sendInput: vi.fn(),
    getEventEmitter: vi.fn(),
    checkReadyQueue: vi.fn(),
  } as unknown as SpawnerService;
}

function createMockSessionManager(): SessionManager {
  return {
    startSession: vi.fn(),
    resumeSession: vi.fn(),
    stopSession: vi.fn(),
    getSession: vi.fn(),
    listSessions: vi.fn(),
    getActiveSession: vi.fn(),
    getMostRecentResumableSession: vi.fn(),
    getSessionHistory: vi.fn(),
    getSessionHistoryByRole: vi.fn(),
    getPreviousSession: vi.fn(),
    persistSession: vi.fn(),
    messageSession: vi.fn(),
    getEventEmitter: vi.fn(),
  } as unknown as SessionManager;
}

// ============================================================================
// Tests
// ============================================================================

describe('WorkerTaskService', () => {
  let service: WorkerTaskService;
  let mockApi: QuarryAPI;
  let mockTaskAssignment: TaskAssignmentService;
  let mockAgentRegistry: AgentRegistry;
  let mockDispatchService: DispatchService;
  let mockWorktreeManager: WorktreeManager;
  let mockSpawnerService: SpawnerService;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    mockApi = createMockApi();
    mockTaskAssignment = createMockTaskAssignment();
    mockAgentRegistry = createMockAgentRegistry();
    mockDispatchService = createMockDispatchService();
    mockWorktreeManager = createMockWorktreeManager();
    mockSpawnerService = createMockSpawnerService();
    mockSessionManager = createMockSessionManager();

    service = createWorkerTaskService(
      mockApi,
      mockTaskAssignment,
      mockAgentRegistry,
      mockDispatchService,
      mockSpawnerService,
      mockSessionManager,
      mockWorktreeManager
    );
  });

  // ----------------------------------------
  // Factory Tests
  // ----------------------------------------

  describe('createWorkerTaskService', () => {
    it('should create a WorkerTaskService instance', () => {
      expect(service).toBeDefined();
      expect(service.startWorkerOnTask).toBeDefined();
      expect(service.completeTask).toBeDefined();
      expect(service.buildTaskContextPrompt).toBeDefined();
      expect(service.getTaskContext).toBeDefined();
      expect(service.cleanupTask).toBeDefined();
    });

    it('should work without worktree manager', () => {
      const serviceWithoutWorktree = createWorkerTaskService(
        mockApi,
        mockTaskAssignment,
        mockAgentRegistry,
        mockDispatchService,
        mockSpawnerService,
        mockSessionManager
        // No worktree manager
      );
      expect(serviceWithoutWorktree).toBeDefined();
    });
  });

  // ----------------------------------------
  // startWorkerOnTask Tests
  // ----------------------------------------

  describe('startWorkerOnTask', () => {
    const mockTask = createMockTask();
    const mockAgent = createMockAgent();
    const mockSession = createMockSessionRecord();
    const mockWorktreeResult = createMockWorktreeResult();

    beforeEach(() => {
      (mockAgentRegistry.getAgent as MockInstance).mockResolvedValue(mockAgent);
      (mockApi.get as MockInstance).mockResolvedValue(mockTask);
      (mockWorktreeManager.createWorktree as MockInstance).mockResolvedValue(mockWorktreeResult);
      (mockDispatchService.dispatch as MockInstance).mockResolvedValue(
        createMockDispatchResult(mockTask, mockAgent)
      );
      (mockSessionManager.startSession as MockInstance).mockResolvedValue({
        session: mockSession,
        events: null,
      });
      (mockTaskAssignment.updateSessionId as MockInstance).mockResolvedValue(mockTask);
    });

    it('should start a worker on a task with worktree', async () => {
      const result = await service.startWorkerOnTask(
        mockTask.id,
        mockAgent.id as unknown as EntityId
      );

      expect(result).toBeDefined();
      expect(result.task).toEqual(mockTask);
      expect(result.agent).toEqual(mockAgent);
      expect(result.worktree).toEqual(mockWorktreeResult);
      expect(result.session).toEqual(mockSession);
      expect(result.taskContextPrompt).toContain('Test Task');
      expect(result.startedAt).toBeDefined();
    });

    it('should create worktree with correct parameters', async () => {
      await service.startWorkerOnTask(
        mockTask.id,
        mockAgent.id as unknown as EntityId
      );

      expect(mockWorktreeManager.createWorktree).toHaveBeenCalledWith({
        agentName: 'Worker Alice',
        taskId: mockTask.id,
        taskTitle: mockTask.title,
        customBranch: undefined,
        customPath: undefined,
        baseBranch: undefined,
      });
    });

    it('should dispatch task with correct options', async () => {
      await service.startWorkerOnTask(
        mockTask.id,
        mockAgent.id as unknown as EntityId,
        { priority: 5 }
      );

      expect(mockDispatchService.dispatch).toHaveBeenCalledWith(
        mockTask.id,
        mockAgent.id,
        expect.objectContaining({
          branch: mockWorktreeResult.branch,
          worktree: mockWorktreeResult.path,
          markAsStarted: true,
        })
      );
    });

    it('should start session with worktree path', async () => {
      await service.startWorkerOnTask(
        mockTask.id,
        mockAgent.id as unknown as EntityId
      );

      expect(mockSessionManager.startSession).toHaveBeenCalledWith(
        mockAgent.id,
        expect.objectContaining({
          workingDirectory: mockWorktreeResult.path,
          worktree: mockWorktreeResult.path,
          interactive: false,
        })
      );
    });

    it('should update task with session ID', async () => {
      await service.startWorkerOnTask(
        mockTask.id,
        mockAgent.id as unknown as EntityId
      );

      expect(mockTaskAssignment.updateSessionId).toHaveBeenCalledWith(
        mockTask.id,
        mockSession.id
      );
    });

    it('should throw if agent not found', async () => {
      (mockAgentRegistry.getAgent as MockInstance).mockResolvedValue(null);

      await expect(
        service.startWorkerOnTask(mockTask.id, 'unknown-agent' as EntityId)
      ).rejects.toThrow('Agent not found: unknown-agent');
    });

    it('should throw if agent is not a worker', async () => {
      const directorAgent = createMockAgent({
        metadata: {
          agent: {
            agentRole: 'director',
          },
        },
      });
      (mockAgentRegistry.getAgent as MockInstance).mockResolvedValue(directorAgent);

      await expect(
        service.startWorkerOnTask(mockTask.id, directorAgent.id as unknown as EntityId)
      ).rejects.toThrow('not a worker');
    });

    it('should throw if task not found', async () => {
      (mockApi.get as MockInstance).mockResolvedValue(null);

      await expect(
        service.startWorkerOnTask('unknown-task' as ElementId, mockAgent.id as unknown as EntityId)
      ).rejects.toThrow('Task not found: unknown-task');
    });

    it('should skip worktree creation when skipWorktree is true', async () => {
      await service.startWorkerOnTask(
        mockTask.id,
        mockAgent.id as unknown as EntityId,
        {
          skipWorktree: true,
          workingDirectory: '/custom/path',
        }
      );

      expect(mockWorktreeManager.createWorktree).not.toHaveBeenCalled();
      expect(mockSessionManager.startSession).toHaveBeenCalledWith(
        mockAgent.id,
        expect.objectContaining({
          workingDirectory: '/custom/path',
        })
      );
    });

    it('should work without worktree manager', async () => {
      const serviceWithoutWorktree = createWorkerTaskService(
        mockApi,
        mockTaskAssignment,
        mockAgentRegistry,
        mockDispatchService,
        mockSpawnerService,
        mockSessionManager
        // No worktree manager
      );

      const result = await serviceWithoutWorktree.startWorkerOnTask(
        mockTask.id,
        mockAgent.id as unknown as EntityId
      );

      expect(result).toBeDefined();
      expect(result.worktree).toBeUndefined();
    });
  });

  // ----------------------------------------
  // completeTask Tests
  // ----------------------------------------

  describe('completeTask', () => {
    const mockTask = createMockTask({
      status: 'in_progress',
      metadata: {
        description: 'Test task',
        orchestrator: {
          branch: 'agent/worker/task-001-test',
          worktree: '/project/.stoneforge/.worktrees/worker-test',
        },
      },
    });

    const mockWorktree: WorktreeInfo = {
      path: '/project/.stoneforge/.worktrees/worker-test',
      relativePath: '.stoneforge/.worktrees/worker-test',
      branch: 'agent/worker/task-001-test',
      head: 'abc123',
      isMain: false,
      state: 'active',
    };

    beforeEach(() => {
      (mockApi.get as MockInstance).mockResolvedValue(mockTask);
      // completeTask now returns TaskCompletionResult with task nested under 'task' property
      (mockTaskAssignment.completeTask as MockInstance).mockResolvedValue({
        task: { ...mockTask, status: 'closed' },
      });
      (mockWorktreeManager.getWorktree as MockInstance).mockResolvedValue(mockWorktree);
    });

    it('should complete a task', async () => {
      const result = await service.completeTask(mockTask.id);

      expect(result).toBeDefined();
      expect(result.task.status).toBe('closed');
      expect(result.readyForMerge).toBe(true);
      expect(result.completedAt).toBeDefined();
    });

    it('should call taskAssignment.completeTask with options', async () => {
      await service.completeTask(mockTask.id, {
        summary: 'Implemented feature X',
        commitHash: 'abc123',
      });

      expect(mockTaskAssignment.completeTask).toHaveBeenCalledWith(
        mockTask.id,
        {
          summary: 'Implemented feature X',
          commitHash: 'abc123',
        }
      );
    });

    it('should include worktree info if available', async () => {
      const result = await service.completeTask(mockTask.id);

      expect(result.worktree).toEqual(mockWorktree);
    });

    it('should throw if task not found', async () => {
      (mockApi.get as MockInstance).mockResolvedValue(null);

      await expect(
        service.completeTask('unknown-task' as ElementId)
      ).rejects.toThrow('Task not found');
    });
  });

  // ----------------------------------------
  // buildTaskContextPrompt Tests
  // ----------------------------------------

  describe('buildTaskContextPrompt', () => {
    const mockTask = createMockTask({
      metadata: {
        description: 'Implement the user authentication feature',
        orchestrator: {
          branch: 'agent/worker/task-001-test',
          worktree: '/project/.stoneforge/.worktrees/worker-test',
        },
      },
    });
    const testWorkerId = 'agent-worker-001' as EntityId;

    beforeEach(() => {
      (mockApi.get as MockInstance).mockResolvedValue(mockTask);
    });

    it('should build a task context prompt', async () => {
      const prompt = await service.buildTaskContextPrompt(mockTask.id, testWorkerId);

      expect(prompt).toContain('# Task Assignment');
      expect(prompt).toContain(mockTask.id);
      expect(prompt).toContain(mockTask.title);
      expect(prompt).toContain('Implement the user authentication feature');
    });

    it('should include worker ID in prompt', async () => {
      const prompt = await service.buildTaskContextPrompt(mockTask.id, testWorkerId);

      expect(prompt).toContain(`**Worker ID:** ${testWorkerId}`);
    });

    it('should include git information if available', async () => {
      const prompt = await service.buildTaskContextPrompt(mockTask.id, testWorkerId);

      expect(prompt).toContain('## Git Information');
      expect(prompt).toContain('agent/worker/task-001-test');
      expect(prompt).toContain('.stoneforge/.worktrees/worker-test');
    });

    it('should include additional instructions if provided', async () => {
      const prompt = await service.buildTaskContextPrompt(
        mockTask.id,
        testWorkerId,
        'Focus on test coverage'
      );

      expect(prompt).toContain('## Additional Instructions');
      expect(prompt).toContain('Focus on test coverage');
    });

    it('should include tags if present', async () => {
      const prompt = await service.buildTaskContextPrompt(mockTask.id, testWorkerId);

      expect(prompt).toContain('test, feature');
    });

    it('should throw if task not found', async () => {
      (mockApi.get as MockInstance).mockResolvedValue(null);

      await expect(
        service.buildTaskContextPrompt('unknown-task' as ElementId, testWorkerId)
      ).rejects.toThrow('Task not found');
    });
  });

  // ----------------------------------------
  // getTaskContext Tests
  // ----------------------------------------

  describe('getTaskContext', () => {
    const mockTask = createMockTask({
      metadata: {
        description: 'Task description here',
        orchestrator: {
          branch: 'agent/worker/task-001',
          worktree: '/path/to/worktree',
        },
      },
    });

    beforeEach(() => {
      (mockApi.get as MockInstance).mockResolvedValue(mockTask);
    });

    it('should return task context', async () => {
      const context = await service.getTaskContext(mockTask.id);

      expect(context).toEqual({
        taskId: mockTask.id,
        title: mockTask.title,
        description: 'Task description here',
        tags: mockTask.tags,
        priority: mockTask.priority,
        complexity: mockTask.complexity,
        branch: 'agent/worker/task-001',
        worktreePath: '/path/to/worktree',
      });
    });

    it('should handle task without orchestrator metadata', async () => {
      const taskWithoutMeta = createMockTask({
        metadata: { description: 'Simple task' },
      });
      (mockApi.get as MockInstance).mockResolvedValue(taskWithoutMeta);

      const context = await service.getTaskContext(taskWithoutMeta.id);

      expect(context.branch).toBeUndefined();
      expect(context.worktreePath).toBeUndefined();
    });

    it('should throw if task not found', async () => {
      (mockApi.get as MockInstance).mockResolvedValue(null);

      await expect(
        service.getTaskContext('unknown-task' as ElementId)
      ).rejects.toThrow('Task not found');
    });
  });

  // ----------------------------------------
  // cleanupTask Tests
  // ----------------------------------------

  describe('cleanupTask', () => {
    const mockTask = createMockTask({
      metadata: {
        orchestrator: {
          worktree: '/project/.stoneforge/.worktrees/worker-test',
        },
      },
    });

    beforeEach(() => {
      (mockApi.get as MockInstance).mockResolvedValue(mockTask);
      (mockWorktreeManager.removeWorktree as MockInstance).mockResolvedValue(undefined);
    });

    it('should clean up task worktree', async () => {
      const result = await service.cleanupTask(mockTask.id);

      expect(result).toBe(true);
      expect(mockWorktreeManager.removeWorktree).toHaveBeenCalledWith(
        '/project/.stoneforge/.worktrees/worker-test',
        {
          deleteBranch: false,
          force: false,
        }
      );
    });

    it('should delete branch if requested', async () => {
      await service.cleanupTask(mockTask.id, true);

      expect(mockWorktreeManager.removeWorktree).toHaveBeenCalledWith(
        expect.any(String),
        {
          deleteBranch: true,
          force: false,
        }
      );
    });

    it('should return false if task not found', async () => {
      (mockApi.get as MockInstance).mockResolvedValue(null);

      const result = await service.cleanupTask('unknown-task' as ElementId);

      expect(result).toBe(false);
    });

    it('should return true if task has no worktree', async () => {
      const taskWithoutWorktree = createMockTask({
        metadata: {},
      });
      (mockApi.get as MockInstance).mockResolvedValue(taskWithoutWorktree);

      const result = await service.cleanupTask(taskWithoutWorktree.id);

      expect(result).toBe(true);
      expect(mockWorktreeManager.removeWorktree).not.toHaveBeenCalled();
    });

    it('should return false if removal fails', async () => {
      (mockWorktreeManager.removeWorktree as MockInstance).mockRejectedValue(
        new Error('Failed to remove')
      );

      const result = await service.cleanupTask(mockTask.id);

      expect(result).toBe(false);
    });

    it('should return false if worktree manager not available', async () => {
      const serviceWithoutWorktree = createWorkerTaskService(
        mockApi,
        mockTaskAssignment,
        mockAgentRegistry,
        mockDispatchService,
        mockSpawnerService,
        mockSessionManager
        // No worktree manager
      );

      const result = await serviceWithoutWorktree.cleanupTask(mockTask.id);

      expect(result).toBe(false);
    });
  });
});
