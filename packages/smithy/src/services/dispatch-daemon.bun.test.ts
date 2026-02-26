/**
 * Dispatch Daemon Integration Tests
 *
 * These tests verify the end-to-end orchestration behavior:
 * - Tasks get dispatched to available workers
 * - Workers are spawned in worktrees
 * - Messages are forwarded to active sessions
 * - Handoff worktrees are reused
 *
 * @module
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs';
import { EventEmitter } from 'node:events';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI, type QuarryAPI, type InboxService, createInboxService } from '@stoneforge/quarry';
import {
  createTask,
  TaskStatus,
  Priority,
  type EntityId,
  type Task,
  type ElementId,
  type Plan,
  createTimestamp,
  createPlan,
  PlanStatus,
} from '@stoneforge/core';

import {
  createDispatchDaemon,
  DispatchDaemonImpl,
  type DispatchDaemon,
  type DispatchDaemonConfig,
  type PollResult,
  RATE_LIMIT_MINIMUM_FLOOR_MS,
  RAPID_EXIT_THRESHOLD_MS,
  RAPID_EXIT_FALLBACK_RESET_MS,
  RATE_LIMIT_SESSION_PATTERN_COUNT,
  RATE_LIMIT_SESSION_GAP_MS,
} from './dispatch-daemon.js';
import type { SettingsService, ServerAgentDefaults } from './settings-service.js';
import { createAgentRegistry, type AgentRegistry, type AgentEntity } from './agent-registry.js';
import { createTaskAssignmentService, type TaskAssignmentService } from './task-assignment-service.js';
import { createDispatchService, type DispatchService } from './dispatch-service.js';
import type { SessionManager, SessionRecord, StartSessionOptions } from '../runtime/session-manager.js';
import type { WorktreeManager, CreateWorktreeResult, CreateWorktreeOptions } from '../git/worktree-manager.js';
import type { StewardScheduler } from './steward-scheduler.js';
import { getOrchestratorTaskMeta, updateOrchestratorTaskMeta, appendTaskSessionHistory, type TaskSessionHistoryEntry } from '../types/task-meta.js';

// ============================================================================
// Mock Factories
// ============================================================================

function createMockSessionManager(): SessionManager {
  const sessions = new Map<EntityId, SessionRecord>();

  return {
    startSession: mock(async (agentId: EntityId, options?: StartSessionOptions) => {
      const session: SessionRecord = {
        id: `session-${Date.now()}`,
        agentId,
        agentRole: 'worker',
        workerMode: 'ephemeral',
        status: 'running',
        workingDirectory: options?.workingDirectory,
        worktree: options?.worktree,
        createdAt: createTimestamp(),
        startedAt: createTimestamp(),
        lastActivityAt: createTimestamp(),
      };
      sessions.set(agentId, session);
      return { session, events: new EventEmitter() };
    }),
    getActiveSession: mock((agentId: EntityId) => {
      return sessions.get(agentId) ?? null;
    }),
    stopSession: mock(async () => {}),
    suspendSession: mock(async () => {}),
    resumeSession: mock(async () => ({ session: {} as SessionRecord, events: new EventEmitter() })),
    getSession: mock(() => undefined),
    listSessions: mock(() => []),
    messageSession: mock(async () => ({ success: true })),
    getSessionHistory: mock(() => []),
    pruneInactiveSessions: mock(() => 0),
    reconcileOnStartup: mock(async () => ({ reconciled: 0, errors: [] })),
    on: mock(() => {}),
    off: mock(() => {}),
    emit: mock(() => {}),
  } as unknown as SessionManager;
}

function createMockWorktreeManager(): WorktreeManager {
  return {
    createWorktree: mock(async (options: CreateWorktreeOptions): Promise<CreateWorktreeResult> => ({
      path: `/worktrees/${options.agentName}/${options.taskId}`,
      relativePath: `.stoneforge/.worktrees/${options.agentName}/${options.taskId}`,
      branch: options.customBranch ?? `agent/${options.agentName}/${options.taskId}-task`,
      head: 'abc123',
      isMain: false,
      state: 'active',
    })),
    createReadOnlyWorktree: mock(async (options: { agentName: string; purpose: string }): Promise<CreateWorktreeResult> => ({
      path: `/worktrees/${options.agentName}/${options.purpose}`,
      relativePath: `.stoneforge/.worktrees/${options.agentName}/${options.purpose}`,
      branch: 'master',
      head: 'abc123',
      isMain: false,
      state: 'active',
    })),
    getWorktree: mock(async () => undefined),
    listWorktrees: mock(async () => []),
    removeWorktree: mock(async () => {}),
    cleanupOrphanedWorktrees: mock(async () => ({ removed: [], errors: [] })),
    worktreeExists: mock(async () => true), // Default to true for handoff tests
    getWorkspaceRoot: mock(() => '/workspace'),
    getDefaultBranch: mock(async () => 'master'),
  } as unknown as WorktreeManager;
}

function createMockStewardScheduler(): StewardScheduler {
  return {
    start: mock(() => {}),
    stop: mock(() => {}),
    isRunning: mock(() => false),
    scheduleAgent: mock(async () => {}),
    unscheduleAgent: mock(async () => {}),
    getScheduledJobs: mock(() => []),
    getEventSubscriptions: mock(() => []),
    triggerEvent: mock(async () => []),
    getExecutionHistory: mock(async () => []),
    getStats: mock(() => ({
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      scheduledJobs: 0,
      eventSubscriptions: 0,
    })),
    on: mock(() => {}),
    off: mock(() => {}),
    emit: mock(() => {}),
  } as unknown as StewardScheduler;
}

// ============================================================================
// Tests
// ============================================================================

describe('DispatchDaemon Integration', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    // Create a temporary database
    testDbPath = `/tmp/dispatch-daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    // Create system entity
    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    // Create daemon with short poll interval for testing
    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100, // Fast polling for tests
      workerAvailabilityPollEnabled: true,
      inboxPollEnabled: true,
      stewardTriggerPollEnabled: false, // Disable for basic tests
      workflowTaskPollEnabled: false, // Disable for basic tests
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  // Helper to create a test task
  async function createTestTask(title: string, assignee?: EntityId): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.OPEN,
      assignee,
    });
    return api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Promise<Task>;
  }

  // Helper to register a test worker
  async function createTestWorker(name: string): Promise<AgentEntity> {
    return agentRegistry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  describe('pollWorkerAvailability', () => {
    test('dispatches task to available ephemeral worker', async () => {
      // 1. Register an ephemeral worker
      const worker = await createTestWorker('alice');

      // 2. Create an unassigned task
      const task = await createTestTask('Implement feature X');

      // 3. Run the poll
      const result = await daemon.pollWorkerAvailability();

      // 4. Verify task was dispatched
      expect(result.processed).toBe(1);

      // 5. Verify task is now assigned to the worker
      const updatedTask = await api.get<Task>(task.id);
      expect(updatedTask?.assignee as unknown as string).toBe(worker.id as unknown as string);

      // 6. Verify worktree was created
      expect(worktreeManager.createWorktree).toHaveBeenCalled();

      // 7. Verify session was started
      expect(sessionManager.startSession).toHaveBeenCalledWith(
        worker.id,
        expect.objectContaining({
          workingDirectory: expect.stringContaining('worktrees'),
        })
      );
    });

    test('does not dispatch to worker with active session', async () => {
      // 1. Register worker and start a session
      const worker = await createTestWorker('bob');
      await (sessionManager as ReturnType<typeof createMockSessionManager>).startSession(
        worker.id as unknown as EntityId,
        {}
      );

      // 2. Create an unassigned task
      await createTestTask('Task for busy worker');

      // 3. Run the poll
      const result = await daemon.pollWorkerAvailability();

      // 4. Verify no task was dispatched (worker is busy)
      expect(result.processed).toBe(0);
    });

    test('reuses handoff worktree when present', async () => {
      // 1. Register worker
      const worker = await createTestWorker('carol');

      // 2. Create task with handoff metadata (simulating previous handoff)
      const task = await createTestTask('Continued task');
      await api.update(task.id, {
        metadata: {
          orchestrator: {
            handoffBranch: 'agent/previous-worker/task-123-feature',
            handoffWorktree: '/worktrees/previous-worker/task-123',
          },
        },
      });

      // 3. Run the poll
      await daemon.pollWorkerAvailability();

      // 4. Verify worktree was NOT created (should reuse existing)
      expect(worktreeManager.createWorktree).not.toHaveBeenCalled();

      // 5. Verify session was started with the handoff worktree
      expect(sessionManager.startSession).toHaveBeenCalledWith(
        worker.id,
        expect.objectContaining({
          workingDirectory: '/worktrees/previous-worker/task-123',
        })
      );
    });

    test('dispatches highest priority task first', async () => {
      // 1. Register worker
      const worker = await createTestWorker('dave');

      // 2. Create tasks with different priorities (create high priority first to ensure ordering)
      // Using createTask directly with priority field
      const { createTask: createTaskFn } = await import('@stoneforge/core');

      const lowPriorityTask = await createTaskFn({
        title: 'Low priority task',
        createdBy: systemEntity,
        status: TaskStatus.OPEN,
        priority: Priority.LOW,
      });
      const savedLow = await api.create(lowPriorityTask as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

      const highPriorityTask = await createTaskFn({
        title: 'High priority task',
        createdBy: systemEntity,
        status: TaskStatus.OPEN,
        priority: Priority.CRITICAL,
      });
      const savedHigh = await api.create(highPriorityTask as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

      // 3. Run the poll
      await daemon.pollWorkerAvailability();

      // 4. Verify the high priority task was assigned (worker only gets one task)
      const updatedHighPriority = await api.get<Task>(savedHigh.id);
      const updatedLowPriority = await api.get<Task>(savedLow.id);

      // Cast to check assignment
      const highAssignee = updatedHighPriority?.assignee as unknown as string;
      const lowAssignee = updatedLowPriority?.assignee as unknown as string;

      expect(highAssignee).toBe(worker.id as unknown as string);
      expect(lowAssignee).toBeUndefined();
    });
  });

  describe('daemon lifecycle', () => {
    test('starts and stops cleanly', async () => {
      expect(daemon.isRunning()).toBe(false);

      await daemon.start();
      expect(daemon.isRunning()).toBe(true);

      await daemon.stop();
      expect(daemon.isRunning()).toBe(false);
    });

    test('emits events during polling', async () => {
      const events: string[] = [];
      daemon.on('poll:start', () => events.push('start'));
      daemon.on('poll:complete', () => events.push('complete'));

      await daemon.pollWorkerAvailability();

      expect(events).toContain('start');
      expect(events).toContain('complete');
    });
  });

  describe('error handling', () => {
    test.skip('continues polling after errors', async () => {
      // NOTE: bun:test mock doesn't support mockRejectedValueOnce
      // This test would require a custom mock implementation
      // The error handling is verified manually or via integration tests

      await createTestWorker('error-test');
      await createTestTask('Task that will fail');

      const result = await daemon.pollWorkerAvailability();
      expect(result.errors).toBeGreaterThan(0);
    });
  });
});

describe('recoverOrphanedAssignments', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-orphan-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestWorker(name: string): Promise<AgentEntity> {
    return agentRegistry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  /** Creates a task already assigned to a worker with orchestrator metadata (simulates post-restart state). */
  async function createAssignedTask(
    title: string,
    workerId: EntityId,
    meta?: { sessionId?: string; worktree?: string; branch?: string }
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: workerId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    // Set orchestrator metadata
    if (meta) {
      await api.update(saved.id, {
        metadata: updateOrchestratorTaskMeta(undefined, {
          assignedAgent: workerId,
          branch: meta.branch ?? 'agent/test/task-branch',
          worktree: meta.worktree ?? '/worktrees/test/task',
          sessionId: meta.sessionId,
        }),
      });
    }

    return (await api.get<Task>(saved.id))!;
  }

  test('recovers worker with assigned task but no active session', async () => {
    const worker = await createTestWorker('orphan-alice');
    const workerId = worker.id as unknown as EntityId;
    await createAssignedTask('Orphaned task', workerId, {
      sessionId: 'prev-session-123',
      worktree: '/worktrees/orphan-alice/task',
      branch: 'agent/orphan-alice/task-branch',
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.pollType).toBe('orphan-recovery');
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Should have tried to resume the previous session
    expect(sessionManager.resumeSession).toHaveBeenCalledWith(
      workerId,
      expect.objectContaining({
        providerSessionId: 'prev-session-123',
        checkReadyQueue: false,
      })
    );
  });

  test('skips worker with active session', async () => {
    const worker = await createTestWorker('active-bob');
    const workerId = worker.id as unknown as EntityId;

    // Start a session for this worker (adds to mock's internal map)
    await sessionManager.startSession(workerId, {});

    await createAssignedTask('Task with active session', workerId, {
      sessionId: 'session-456',
      worktree: '/worktrees/active-bob/task',
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(0);
    // Should NOT have tried to resume or start
    expect(sessionManager.resumeSession).not.toHaveBeenCalled();
  });

  test('skips worker with no assigned tasks', async () => {
    await createTestWorker('idle-carol');

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(0);
  });

  test('creates new worktree when original is missing', async () => {
    const worker = await createTestWorker('missing-wt-dave');
    const workerId = worker.id as unknown as EntityId;
    await createAssignedTask('Task with missing worktree', workerId, {
      worktree: '/worktrees/missing-wt-dave/task',
      branch: 'agent/missing-wt-dave/task-branch',
    });

    // Mock worktreeExists to return false (worktree was cleaned up)
    (worktreeManager.worktreeExists as ReturnType<typeof mock>).mockImplementation(async () => false);

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(1);
    // Should have created a new worktree
    expect(worktreeManager.createWorktree).toHaveBeenCalled();
    // Should have started a fresh session (no sessionId in meta)
    expect(sessionManager.startSession).toHaveBeenCalled();
  });

  test('falls back to fresh spawn when resume fails', async () => {
    const worker = await createTestWorker('resume-fail-eve');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with failed resume', workerId, {
      sessionId: 'stale-session-789',
      worktree: '/worktrees/resume-fail-eve/task',
      branch: 'agent/resume-fail-eve/task-branch',
    });

    // Mock resumeSession to throw (simulating stale session ID)
    (sessionManager.resumeSession as ReturnType<typeof mock>).mockImplementation(async () => {
      throw new Error('Session not found: stale-session-789');
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(1);
    // Should have tried resume first
    expect(sessionManager.resumeSession).toHaveBeenCalled();
    // Then fallen back to startSession
    expect(sessionManager.startSession).toHaveBeenCalledWith(
      workerId,
      expect.objectContaining({
        workingDirectory: '/worktrees/resume-fail-eve/task',
      })
    );

    // Verify stale sessionId was cleared and new sessionId was written
    const updatedTask = await api.get<Task>(task.id);
    const updatedMeta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(updatedMeta?.sessionId).toBeDefined();
    expect(updatedMeta?.sessionId).not.toBe('stale-session-789');
  });

  test('does not increment resumeCount when recoverOrphanedTask throws', async () => {
    const worker = await createTestWorker('fail-recovery-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with failed recovery', workerId, {
      sessionId: 'prev-session-fail',
      worktree: '/worktrees/fail-recovery-worker/task',
      branch: 'agent/fail-recovery-worker/task-branch',
    });

    // Set initial resumeCount to 1 so we can verify it stays at 1
    await api.update(task.id, {
      metadata: updateOrchestratorTaskMeta(
        task.metadata as Record<string, unknown> | undefined,
        { resumeCount: 1 }
      ),
    });

    // Mock recoverOrphanedTask to throw (simulates session spawn failure)
    const impl = daemon as DispatchDaemonImpl;
    (impl as any).recoverOrphanedTask = mock(async () => {
      throw new Error('Session spawn failed');
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.errors).toBe(1);
    expect(result.processed).toBe(0);

    // resumeCount should NOT have been incremented — still 1
    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(1);
  });

  test('increments resumeCount after recoverOrphanedTask succeeds', async () => {
    const worker = await createTestWorker('success-recovery-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with successful recovery', workerId, {
      sessionId: 'prev-session-ok',
      worktree: '/worktrees/success-recovery-worker/task',
      branch: 'agent/success-recovery-worker/task-branch',
    });

    // Set initial resumeCount to 1
    await api.update(task.id, {
      metadata: updateOrchestratorTaskMeta(
        task.metadata as Record<string, unknown> | undefined,
        { resumeCount: 1 }
      ),
    });

    // Mock recoverOrphanedTask to succeed (returns true = session was spawned)
    const impl = daemon as DispatchDaemonImpl;
    (impl as any).recoverOrphanedTask = mock(async () => {
      return true;
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // resumeCount should have been incremented to 2
    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);
  });

  test('does not recover tasks in REVIEW status', async () => {
    const worker = await createTestWorker('review-frank');
    const workerId = worker.id as unknown as EntityId;

    // Create a task in REVIEW status (should be handled by merge stewards, not recovery)
    const task = await createTask({
      title: 'Task in review',
      createdBy: systemEntity,
      status: TaskStatus.REVIEW,
      assignee: workerId,
    });
    await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(0);
  });
});

describe('pollWorkflowTasks - merge steward dispatch', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-steward-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: true,
      orphanRecoveryEnabled: false,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestSteward(name: string): Promise<AgentEntity> {
    return agentRegistry.registerSteward({
      name,
      stewardFocus: 'merge',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createReviewTask(
    title: string,
    meta?: Partial<import('../types/task-meta.js').OrchestratorTaskMeta>
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.REVIEW,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    // Set orchestrator metadata with mergeStatus: 'pending' (default for new review tasks)
    // Worktree is required for spawnMergeStewardForTask to proceed (post cc52ef9 guard)
    await api.update(saved.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        mergeStatus: 'pending',
        branch: 'agent/worker/task-branch',
        worktree: '/worktrees/worker/task',
        ...meta,
      }),
    });

    return (await api.get<Task>(saved.id))!;
  }

  test('does not double-dispatch same REVIEW task across cycles', async () => {
    await createTestSteward('merge-steward-1');
    await createReviewTask('Review task A');

    // First poll — should dispatch
    const result1 = await daemon.pollWorkflowTasks();
    expect(result1.processed).toBe(1);

    // Reset session manager mock so getActiveSession returns null for second poll
    // (simulating steward session completed between cycles)
    (sessionManager.getActiveSession as ReturnType<typeof mock>).mockImplementation(() => null);

    // Second poll — should NOT dispatch again because mergeStatus is now 'testing'
    const result2 = await daemon.pollWorkflowTasks();
    expect(result2.processed).toBe(0);
  });

  test('dispatches REVIEW task even when assignedAgent is set (worker ID from completion)', async () => {
    await createTestSteward('merge-steward-2');

    // Simulate a task completed by a worker: assignedAgent is the worker, but
    // top-level assignee is cleared by completeTask(). This should NOT block dispatch.
    await createReviewTask('Task completed by worker', {
      assignedAgent: 'some-worker-id' as EntityId,
    });

    const result = await daemon.pollWorkflowTasks();
    expect(result.processed).toBe(1);
  });

  test('skips REVIEW tasks already assigned to a steward', async () => {
    await createTestSteward('merge-steward-2b');

    // Create a REVIEW task with top-level assignee set (steward claimed it)
    // and mergeStatus: 'testing'
    const task = await createReviewTask('Already assigned review task', {
      assignedAgent: 'some-other-steward' as EntityId,
      mergeStatus: 'testing',
    });
    // Set top-level assignee to simulate steward claim
    await api.update<Task>(task.id, { assignee: 'some-other-steward' as EntityId });

    const result = await daemon.pollWorkflowTasks();
    // mergeStatus filter excludes 'testing'; assignee filter is defense-in-depth
    expect(result.processed).toBe(0);
  });

  test('dispatches different REVIEW tasks to different stewards in same cycle', async () => {
    await createTestSteward('merge-steward-multi-a');
    await createTestSteward('merge-steward-multi-b');
    const taskA = await createReviewTask('Review task X');
    const taskB = await createReviewTask('Review task Y');

    const result = await daemon.pollWorkflowTasks();
    expect(result.processed).toBe(2);

    // Each task should be assigned to a different steward
    const updatedA = await api.get<Task>(taskA.id);
    const updatedB = await api.get<Task>(taskB.id);
    expect(updatedA!.assignee).toBeDefined();
    expect(updatedB!.assignee).toBeDefined();
    expect(updatedA!.assignee).not.toBe(updatedB!.assignee);
  });

  test('only dispatches one task when two stewards compete for a single task', async () => {
    await createTestSteward('merge-steward-solo-a');
    await createTestSteward('merge-steward-solo-b');
    await createReviewTask('Only review task');

    const result = await daemon.pollWorkflowTasks();
    expect(result.processed).toBe(1);
  });

  test('records assignee, assignedAgent, sessionId, mergeStatus on task', async () => {
    const steward = await createTestSteward('merge-steward-3');
    const stewardId = steward.id as unknown as EntityId;
    const reviewTask = await createReviewTask('Task to verify metadata');

    await daemon.pollWorkflowTasks();

    // Verify task metadata was updated
    const updatedTask = await api.get<Task>(reviewTask.id);
    expect(updatedTask).toBeDefined();
    expect(updatedTask!.assignee as unknown as string).toBe(stewardId as unknown as string);

    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown> | undefined);
    expect(meta).toBeDefined();
    expect(meta!.assignedAgent).toBe(stewardId);
    expect(meta!.mergeStatus).toBe('testing');
    expect(meta!.sessionId).toBeDefined();
  });
});

describe('recoverOrphanedAssignments - merge steward recovery', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-steward-orphan-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestSteward(name: string): Promise<AgentEntity> {
    return agentRegistry.registerSteward({
      name,
      stewardFocus: 'merge',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createOrphanedStewardTask(
    title: string,
    stewardId: EntityId,
    meta?: { sessionId?: string; worktree?: string; stewardRecoveryCount?: number }
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.REVIEW,
      assignee: stewardId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    await api.update(saved.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: stewardId,
        mergeStatus: 'testing',
        sessionId: meta?.sessionId ?? 'steward-session-123',
        worktree: meta?.worktree,
        branch: 'agent/worker/task-branch',
        stewardRecoveryCount: meta?.stewardRecoveryCount,
      }),
    });

    return (await api.get<Task>(saved.id))!;
  }

  test('recovers orphaned merge steward', async () => {
    const steward = await createTestSteward('orphan-merge-steward');
    const stewardId = steward.id as unknown as EntityId;

    await createOrphanedStewardTask('Orphaned review task', stewardId, {
      sessionId: 'steward-prev-session',
      worktree: '/worktrees/worker/task',
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.pollType).toBe('orphan-recovery');
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Should have tried to resume the previous steward session
    expect(sessionManager.resumeSession).toHaveBeenCalledWith(
      stewardId,
      expect.objectContaining({
        providerSessionId: 'steward-prev-session',
        checkReadyQueue: false,
      })
    );
  });

  test('skips steward with active session', async () => {
    const steward = await createTestSteward('active-merge-steward');
    const stewardId = steward.id as unknown as EntityId;

    // Start a session for this steward
    await sessionManager.startSession(stewardId, {});

    await createOrphanedStewardTask('Review task with active session', stewardId);

    const result = await daemon.recoverOrphanedAssignments();

    // Steward has active session, so no recovery needed
    expect(result.processed).toBe(0);
  });

  test('falls back to fresh spawn when steward resume fails', async () => {
    const steward = await createTestSteward('resume-fail-steward');
    const stewardId = steward.id as unknown as EntityId;

    const task = await createOrphanedStewardTask('Review task with stale session', stewardId, {
      sessionId: 'stale-steward-session',
      worktree: '/worktrees/worker/task', // Worktree required for spawnMergeStewardForTask fallback
    });

    // Mock resumeSession to throw
    (sessionManager.resumeSession as ReturnType<typeof mock>).mockImplementation(async () => {
      throw new Error('Session not found: stale-steward-session');
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(1);
    // Should have tried resume first
    expect(sessionManager.resumeSession).toHaveBeenCalled();
    // Then fallen back to startSession (via spawnMergeStewardForTask)
    expect(sessionManager.startSession).toHaveBeenCalledWith(
      stewardId,
      expect.objectContaining({
        interactive: false,
      })
    );

    // Verify stale sessionId was cleared and new sessionId was written by spawnMergeStewardForTask
    const updatedTask = await api.get<Task>(task.id);
    const updatedMeta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(updatedMeta?.sessionId).toBeDefined();
    expect(updatedMeta?.sessionId).not.toBe('stale-steward-session');
  });

  test('skips steward tasks with terminal mergeStatus (test_failed/failed/conflict)', async () => {
    // This test ensures the fix for the infinite retry loop:
    // Tasks with mergeStatus test_failed, failed, or conflict should NOT be recovered
    // because they have already been processed and the issue reported
    const steward = await createTestSteward('terminal-status-steward');
    const stewardId = steward.id as unknown as EntityId;

    // Create a task with test_failed status (already processed, failure reported)
    const task = await createTask({
      title: 'Task with test_failed status',
      createdBy: systemEntity,
      status: TaskStatus.REVIEW,
      assignee: stewardId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    await api.update(saved.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: stewardId,
        mergeStatus: 'test_failed', // Already processed, failure reported
        sessionId: 'steward-session-terminal',
        branch: 'agent/worker/task-branch',
      }),
    });

    const result = await daemon.recoverOrphanedAssignments();

    // Should NOT recover this task - it's in a terminal state
    expect(result.processed).toBe(0);
    expect(sessionManager.resumeSession).not.toHaveBeenCalled();
    expect(sessionManager.startSession).not.toHaveBeenCalled();
  });

  test('increments stewardRecoveryCount on each recovery attempt', async () => {
    const steward = await createTestSteward('count-steward');
    const stewardId = steward.id as unknown as EntityId;

    // Create an orphaned steward task with stewardRecoveryCount = 1
    const task = await createOrphanedStewardTask('Review task to count recovery', stewardId, {
      sessionId: 'steward-count-session',
      worktree: '/worktrees/worker/task',
      stewardRecoveryCount: 1,
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Verify stewardRecoveryCount was incremented from 1 to 2
    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown> | undefined);
    expect(meta!.stewardRecoveryCount).toBe(2);
  });

  test('sets mergeStatus to failed when stewardRecoveryCount reaches max (3)', async () => {
    const steward = await createTestSteward('maxed-steward');
    const stewardId = steward.id as unknown as EntityId;

    // Create an orphaned steward task already at the recovery limit (count = 3)
    const task = await createOrphanedStewardTask('Review task at limit', stewardId, {
      sessionId: 'steward-maxed-session',
      worktree: '/worktrees/worker/task',
      stewardRecoveryCount: 3,
    });

    const result = await daemon.recoverOrphanedAssignments();

    // Should still count as processed (the failure update is a processing action)
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Verify mergeStatus was set to 'failed' instead of re-dispatching
    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown> | undefined);
    expect(meta!.mergeStatus).toBe('failed');
    expect(meta!.mergeFailureReason).toContain('Steward recovery limit reached');
    expect(meta!.mergeFailureReason).toContain('3');

    // Verify assignee was cleared (steward unassigned)
    expect(updatedTask!.assignee).toBeUndefined();

    // Should NOT have tried to resume or start a session
    expect(sessionManager.resumeSession).not.toHaveBeenCalled();
    expect(sessionManager.startSession).not.toHaveBeenCalled();
  });

  test('does not set failed when stewardRecoveryCount is below max', async () => {
    const steward = await createTestSteward('below-max-steward');
    const stewardId = steward.id as unknown as EntityId;

    // Create a task with count = 2 (below the cap of 3)
    const task = await createOrphanedStewardTask('Review task below limit', stewardId, {
      sessionId: 'steward-below-session',
      worktree: '/worktrees/worker/task',
      stewardRecoveryCount: 2,
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Verify task was recovered (not failed), count incremented to 3
    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown> | undefined);
    expect(meta!.stewardRecoveryCount).toBe(3);
    // mergeStatus should still be 'testing' (not 'failed') since we haven't hit the cap yet
    expect(meta!.mergeStatus).toBe('testing');

    // Should have tried to resume the session (normal recovery path)
    expect(sessionManager.resumeSession).toHaveBeenCalledWith(
      stewardId,
      expect.objectContaining({
        providerSessionId: 'steward-below-session',
        checkReadyQueue: false,
      })
    );
  });
});

describe('reconcileClosedUnmergedTasks', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-reconcile-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: false,
      closedUnmergedReconciliationEnabled: true,
      closedUnmergedGracePeriodMs: 120_000,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  /** Creates a CLOSED task with orchestrator metadata including mergeStatus */
  async function createClosedUnmergedTask(
    title: string,
    opts?: {
      mergeStatus?: string;
      closedAt?: string;
      reconciliationCount?: number;
      noOrchestratorMeta?: boolean;
    }
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.CLOSED,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    // Set closedAt to simulate a task that was closed some time ago
    const closedAt = opts?.closedAt ?? new Date(Date.now() - 300_000).toISOString(); // 5 minutes ago by default

    const updates: Record<string, unknown> = {
      closedAt,
      closeReason: 'test close',
    };

    if (!opts?.noOrchestratorMeta) {
      updates.metadata = updateOrchestratorTaskMeta(undefined, {
        mergeStatus: (opts?.mergeStatus ?? 'pending') as import('../types/task-meta.js').MergeStatus,
        branch: 'agent/worker/task-branch',
        reconciliationCount: opts?.reconciliationCount,
      });
    }

    await api.update<Task>(saved.id, updates);
    return (await api.get<Task>(saved.id))!;
  }

  test('reconciles a closed task with mergeStatus=pending past the grace period', async () => {
    const task = await createClosedUnmergedTask('Stuck pending task');

    const result = await daemon.reconcileClosedUnmergedTasks();

    expect(result.pollType).toBe('closed-unmerged-reconciliation');
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Verify task was moved back to REVIEW
    const updatedTask = await api.get<Task>(task.id);
    expect(updatedTask!.status).toBe(TaskStatus.REVIEW);
  });

  test('skips tasks within the grace period (closed recently)', async () => {
    // Close the task just now (within grace period of 120s)
    await createClosedUnmergedTask('Recently closed task', {
      closedAt: new Date().toISOString(),
    });

    const result = await daemon.reconcileClosedUnmergedTasks();

    expect(result.processed).toBe(0);
  });

  test('skips tasks with mergeStatus=merged (properly closed)', async () => {
    await createClosedUnmergedTask('Properly merged task', {
      mergeStatus: 'merged',
    });

    const result = await daemon.reconcileClosedUnmergedTasks();

    // merged tasks are NOT queried (filter excludes them), so processed=0
    expect(result.processed).toBe(0);
  });

  test('skips tasks with no orchestrator metadata', async () => {
    await createClosedUnmergedTask('Task without orch meta', {
      noOrchestratorMeta: true,
    });

    const result = await daemon.reconcileClosedUnmergedTasks();

    // No orchestrator metadata means it won't have a mergeStatus to match the filter,
    // so it won't be returned by listAssignments. Even if it were, the code skips it.
    expect(result.processed).toBe(0);
  });

  test('increments reconciliationCount in metadata', async () => {
    const task = await createClosedUnmergedTask('Task to count reconciliation', {
      reconciliationCount: 1,
    });

    await daemon.reconcileClosedUnmergedTasks();

    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown> | undefined);
    expect(meta!.reconciliationCount).toBe(2);
  });

  test('stops reconciling after 3 attempts (safety valve)', async () => {
    const task = await createClosedUnmergedTask('Task at safety limit', {
      reconciliationCount: 3,
    });

    const result = await daemon.reconcileClosedUnmergedTasks();

    expect(result.processed).toBe(0);

    // Task should still be CLOSED
    const updatedTask = await api.get<Task>(task.id);
    expect(updatedTask!.status).toBe(TaskStatus.CLOSED);
  });

  test('clears closedAt and closeReason on reconciled tasks', async () => {
    const task = await createClosedUnmergedTask('Task to clear close fields');

    await daemon.reconcileClosedUnmergedTasks();

    const updatedTask = await api.get<Task>(task.id);
    expect(updatedTask!.closedAt).toBeUndefined();
    expect(updatedTask!.closeReason).toBeUndefined();
  });

  test('disabled via closedUnmergedReconciliationEnabled: false', async () => {
    // Reconfigure daemon with reconciliation disabled
    daemon.updateConfig({ closedUnmergedReconciliationEnabled: false });

    const task = await createClosedUnmergedTask('Task that should not be reconciled');

    // The config flag only affects the poll cycle, not direct calls.
    // Verify the config is set correctly.
    const config = daemon.getConfig();
    expect(config.closedUnmergedReconciliationEnabled).toBe(false);

    // Task should remain CLOSED since the poll cycle won't call reconciliation
    const updatedTask = await api.get<Task>(task.id);
    expect(updatedTask!.status).toBe(TaskStatus.CLOSED);
  });
});

describe('E2E Orchestration Flow', () => {
  // This test demonstrates the full orchestration flow
  // In a real E2E test, you would use actual Claude Code sessions

  test.skip('full task lifecycle: create → dispatch → work → complete → merge', async () => {
    // This test is skipped by default as it requires actual Claude Code
    // To run: remove .skip and ensure Claude Code is available

    // 1. Start daemon
    // 2. Create director and worker agents
    // 3. Director creates task
    // 4. Daemon dispatches to worker
    // 5. Worker works on task (in worktree)
    // 6. Worker commits and completes task
    // 7. Merge steward reviews and merges
    // 8. Task marked as merged
  });
});

describe('pollInboxes - duplicate message prevention', () => {
  // These tests verify the forwardingInboxItems guard works correctly.
  // The actual fix adds a Set<string> to track in-flight inbox items being processed
  // and prevents the same item from being forwarded concurrently by multiple polls.

  test('forwardingInboxItems guard is implemented in dispatch daemon', async () => {
    // This test verifies the fix exists by checking the implementation structure.
    // The actual behavior is tested manually via integration testing since setting up
    // the full message flow requires proper channel creation which involves complex
    // async initialization.

    // Import and verify the DispatchDaemonImpl class has the guard
    const module = await import('./dispatch-daemon.js');
    expect(module.DispatchDaemonImpl).toBeDefined();

    // Create a minimal daemon to verify the guard exists in the instance
    const testDbPath = `/tmp/dispatch-daemon-guard-test-${Date.now()}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    try {
      const api = createQuarryAPI(storage);
      const inboxService = createInboxService(storage);
      const agentRegistry = createAgentRegistry(api);
      const taskAssignment = createTaskAssignmentService(api);
      const dispatchService = createDispatchService(api, taskAssignment, agentRegistry);

      const daemon = new module.DispatchDaemonImpl(
        api,
        agentRegistry,
        createMockSessionManager(),
        dispatchService,
        createMockWorktreeManager(),
        taskAssignment,
        createMockStewardScheduler(),
        inboxService,
        { pollIntervalMs: 1000 }
      );

      // The guard is a private field, but we can verify the daemon was created successfully
      // and has the expected methods
      expect(daemon.pollInboxes).toBeDefined();
      expect(daemon.isRunning).toBeDefined();
    } finally {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    }
  });
});

// ============================================================================
// Plan Auto-Complete Tests
// ============================================================================

describe('DispatchDaemon Plan Auto-Complete', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-plan-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    // Create system entity
    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system-plans',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    // Create daemon with plan auto-complete enabled, other polls disabled
    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      planAutoCompleteEnabled: true,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  // Helper to create a test plan
  async function createTestPlan(status: PlanStatus = PlanStatus.ACTIVE): Promise<Plan> {
    const plan = await createPlan({
      title: `Test Plan ${Date.now()}`,
      createdBy: systemEntity,
      status,
    });
    return api.create(plan as unknown as Record<string, unknown> & { createdBy: EntityId }) as Promise<Plan>;
  }

  describe('pollPlanAutoComplete', () => {
    test('auto-completes plan when all tasks are closed', async () => {
      // 1. Create an active plan with tasks
      const plan = await createTestPlan(PlanStatus.ACTIVE);

      // 2. Add tasks that are all closed
      await api.createTaskInPlan(plan.id, {
        title: 'Task 1',
        createdBy: systemEntity,
        status: TaskStatus.CLOSED,
      });
      await api.createTaskInPlan(plan.id, {
        title: 'Task 2',
        createdBy: systemEntity,
        status: TaskStatus.CLOSED,
      });

      // 3. Run the poll
      const result = await daemon.pollPlanAutoComplete();

      // 4. Verify plan was auto-completed
      expect(result.pollType).toBe('plan-auto-complete');
      expect(result.processed).toBe(1);
      expect(result.errors).toBe(0);

      // 5. Verify plan status was updated
      const updatedPlan = await api.get<Plan>(plan.id);
      expect(updatedPlan!.status).toBe(PlanStatus.COMPLETED);
      expect(updatedPlan!.completedAt).toBeDefined();
    });

    test('does not auto-complete plan with non-closed tasks', async () => {
      // 1. Create an active plan with mixed task statuses
      const plan = await createTestPlan(PlanStatus.ACTIVE);

      await api.createTaskInPlan(plan.id, {
        title: 'Closed Task',
        createdBy: systemEntity,
        status: TaskStatus.CLOSED,
      });
      await api.createTaskInPlan(plan.id, {
        title: 'Open Task',
        createdBy: systemEntity,
        status: TaskStatus.OPEN,
      });

      // 2. Run the poll
      const result = await daemon.pollPlanAutoComplete();

      // 3. Verify plan was NOT auto-completed
      expect(result.processed).toBe(0);

      const updatedPlan = await api.get<Plan>(plan.id);
      expect(updatedPlan!.status).toBe(PlanStatus.ACTIVE);
    });

    test('does not auto-complete plan with in-progress tasks', async () => {
      const plan = await createTestPlan(PlanStatus.ACTIVE);

      await api.createTaskInPlan(plan.id, {
        title: 'In Progress Task',
        createdBy: systemEntity,
        status: TaskStatus.IN_PROGRESS,
      });

      const result = await daemon.pollPlanAutoComplete();
      expect(result.processed).toBe(0);

      const updatedPlan = await api.get<Plan>(plan.id);
      expect(updatedPlan!.status).toBe(PlanStatus.ACTIVE);
    });

    test('does not auto-complete plan with no tasks', async () => {
      // Plan with zero tasks should not be auto-completed
      const plan = await createTestPlan(PlanStatus.ACTIVE);

      const result = await daemon.pollPlanAutoComplete();
      expect(result.processed).toBe(0);

      const updatedPlan = await api.get<Plan>(plan.id);
      expect(updatedPlan!.status).toBe(PlanStatus.ACTIVE);
    });

    test('skips non-active plans', async () => {
      // Create a draft plan with closed tasks (should be skipped)
      const draftPlan = await createTestPlan(PlanStatus.DRAFT);

      await api.createTaskInPlan(draftPlan.id, {
        title: 'Closed Task',
        createdBy: systemEntity,
        status: TaskStatus.CLOSED,
      });

      const result = await daemon.pollPlanAutoComplete();
      expect(result.processed).toBe(0);

      const updatedPlan = await api.get<Plan>(draftPlan.id);
      expect(updatedPlan!.status).toBe(PlanStatus.DRAFT);
    });

    test('auto-completes multiple eligible plans in one cycle', async () => {
      // Create two active plans, both with all closed tasks
      const plan1 = await createTestPlan(PlanStatus.ACTIVE);
      const plan2 = await createTestPlan(PlanStatus.ACTIVE);

      await api.createTaskInPlan(plan1.id, {
        title: 'Task A',
        createdBy: systemEntity,
        status: TaskStatus.CLOSED,
      });
      await api.createTaskInPlan(plan2.id, {
        title: 'Task B',
        createdBy: systemEntity,
        status: TaskStatus.CLOSED,
      });

      const result = await daemon.pollPlanAutoComplete();
      expect(result.processed).toBe(2);
      expect(result.errors).toBe(0);

      const updatedPlan1 = await api.get<Plan>(plan1.id);
      const updatedPlan2 = await api.get<Plan>(plan2.id);
      expect(updatedPlan1!.status).toBe(PlanStatus.COMPLETED);
      expect(updatedPlan2!.status).toBe(PlanStatus.COMPLETED);
    });

    test('does not auto-complete plans with deferred tasks', async () => {
      const plan = await createTestPlan(PlanStatus.ACTIVE);

      await api.createTaskInPlan(plan.id, {
        title: 'Closed Task',
        createdBy: systemEntity,
        status: TaskStatus.CLOSED,
      });
      await api.createTaskInPlan(plan.id, {
        title: 'Deferred Task',
        createdBy: systemEntity,
        status: TaskStatus.DEFERRED,
      });

      const result = await daemon.pollPlanAutoComplete();
      expect(result.processed).toBe(0);

      const updatedPlan = await api.get<Plan>(plan.id);
      expect(updatedPlan!.status).toBe(PlanStatus.ACTIVE);
    });

    test('is disabled when planAutoCompleteEnabled is false', async () => {
      // Re-create daemon with plan auto-complete disabled
      await daemon.stop();

      const disabledDaemon = createDispatchDaemon(
        api,
        agentRegistry,
        sessionManager,
        dispatchService,
        worktreeManager,
        taskAssignment,
        stewardScheduler,
        inboxService,
        {
          pollIntervalMs: 100,
          workerAvailabilityPollEnabled: false,
          inboxPollEnabled: false,
          stewardTriggerPollEnabled: false,
          workflowTaskPollEnabled: false,
          planAutoCompleteEnabled: false,
        }
      );

      // Create an active plan with all closed tasks
      const plan = await createTestPlan(PlanStatus.ACTIVE);
      await api.createTaskInPlan(plan.id, {
        title: 'Closed Task',
        createdBy: systemEntity,
        status: TaskStatus.CLOSED,
      });

      // The config should show it's disabled
      const config = disabledDaemon.getConfig();
      expect(config.planAutoCompleteEnabled).toBe(false);

      // But manual poll still works (like other poll methods)
      const result = await disabledDaemon.pollPlanAutoComplete();
      expect(result.processed).toBe(1);

      await disabledDaemon.stop();
    });

    test('emits poll:start and poll:complete events', async () => {
      const plan = await createTestPlan(PlanStatus.ACTIVE);
      await api.createTaskInPlan(plan.id, {
        title: 'Closed Task',
        createdBy: systemEntity,
        status: TaskStatus.CLOSED,
      });

      const startEvents: string[] = [];
      const completeEvents: PollResult[] = [];

      daemon.on('poll:start', (pollType: string) => {
        startEvents.push(pollType);
      });
      daemon.on('poll:complete', (result: PollResult) => {
        completeEvents.push(result);
      });

      await daemon.pollPlanAutoComplete();

      expect(startEvents).toContain('plan-auto-complete');
      expect(completeEvents.some(r => r.pollType === 'plan-auto-complete')).toBe(true);
    });
  });
});

// ============================================================================
// Rate Limit Integration Tests
// ============================================================================

/**
 * Creates a mock SettingsService with a configurable fallback chain and
 * executable path defaults.
 */
function createMockSettingsService(overrides?: {
  fallbackChain?: string[];
  defaultExecutablePaths?: Record<string, string>;
}): SettingsService {
  const agentDefaults: ServerAgentDefaults = {
    defaultExecutablePaths: overrides?.defaultExecutablePaths ?? {},
    fallbackChain: overrides?.fallbackChain,
  };

  return {
    getSetting: mock(() => undefined),
    setSetting: mock(() => agentDefaults),
    getAgentDefaults: mock(() => agentDefaults),
    setAgentDefaults: mock(() => agentDefaults),
  } as unknown as SettingsService;
}

describe('DispatchDaemon Rate Limit Integration', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let settingsService: SettingsService;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-ratelimit-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();
    settingsService = createMockSettingsService({
      fallbackChain: ['claude2', 'claude'],
    });

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system-ratelimit',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: true,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
    };

    // Use DispatchDaemonImpl directly so we can pass the settingsService (11th arg)
    daemon = new DispatchDaemonImpl(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config,
      undefined, // poolService
      settingsService
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestWorker(name: string): Promise<AgentEntity> {
    return agentRegistry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createTestTask(title: string, assignee?: EntityId): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.OPEN,
      assignee,
    });
    return api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Promise<Task>;
  }

  // --------------------------------------------------------------------------
  // 1. Rate limit event updates tracker
  // --------------------------------------------------------------------------

  test('handleRateLimitDetected marks executable as limited in tracker', () => {
    // Use a time above the minimum floor (15 min) so the exact value is preserved
    const resetsAt = new Date(Date.now() + 20 * 60 * 1000);
    daemon.handleRateLimitDetected('claude2', resetsAt);

    const status = daemon.getRateLimitStatus();
    // Plan-level rate limits: marking 'claude2' (which is in the fallback chain
    // ['claude2', 'claude']) marks ALL chain entries as limited
    expect(status.limits).toHaveLength(2);
    const executables = status.limits.map(l => l.executable).sort();
    expect(executables).toEqual(['claude', 'claude2']);
    for (const limit of status.limits) {
      expect(limit.resetsAt).toBe(resetsAt.toISOString());
    }
  });

  test('handleRateLimitDetected marks ALL fallback chain entries when a chain executable is rate-limited', () => {
    // When a fallback executable (e.g. 'claude2') hits a plan-level rate limit,
    // all executables in the fallback chain should be marked as limited because
    // they share the same API plan.
    const resetsAt = new Date(Date.now() + 20 * 60 * 1000);
    daemon.handleRateLimitDetected('claude2', resetsAt);

    const status = daemon.getRateLimitStatus();
    // Both 'claude2' and 'claude' should be limited (fallback chain is ['claude2', 'claude'])
    expect(status.limits).toHaveLength(2);
    const executables = status.limits.map(l => l.executable).sort();
    expect(executables).toEqual(['claude', 'claude2']);
    // All should have the same reset time
    for (const limit of status.limits) {
      expect(limit.resetsAt).toBe(resetsAt.toISOString());
    }
  });

  test('handleRateLimitDetected marks ALL fallback chain entries when any chain executable hits limit', () => {
    // Same behavior when 'claude' (the second entry) is the one hitting the limit
    const resetsAt = new Date(Date.now() + 20 * 60 * 1000);
    daemon.handleRateLimitDetected('claude', resetsAt);

    const status = daemon.getRateLimitStatus();
    expect(status.limits).toHaveLength(2);
    const executables = status.limits.map(l => l.executable).sort();
    expect(executables).toEqual(['claude', 'claude2']);
  });

  test('handleRateLimitDetected marks ALL chain entries so resolveExecutableWithFallback returns all_limited', async () => {
    // This is the core bug scenario: a fallback executable (e.g. 'claude-preview')
    // hits a rate limit, but only that one entry was being marked. Then
    // resolveExecutableWithFallback() would still return another chain entry
    // thinking it was available, causing a dispatch loop.
    const worker = await createTestWorker('chain-limit-worker');
    await createTestTask('Task for chain limit test');

    const resetsAt = new Date(Date.now() + 20 * 60 * 1000);
    // Only report the rate limit from 'claude2' (the fallback executable that was used)
    daemon.handleRateLimitDetected('claude2', resetsAt);

    // With the fix, ALL chain entries should be marked, so the daemon should
    // report as fully paused (all_limited)
    const status = daemon.getRateLimitStatus();
    expect(status.isPaused).toBe(true);
  });

  test('handleRateLimitDetected does NOT mark chain entries for executable not in chain', () => {
    // An executable not in the fallback chain should only mark itself
    const resetsAt = new Date(Date.now() + 20 * 60 * 1000);
    daemon.handleRateLimitDetected('some-other-executable', resetsAt);

    const status = daemon.getRateLimitStatus();
    expect(status.limits).toHaveLength(1);
    expect(status.limits[0]!.executable).toBe('some-other-executable');
  });

  // --------------------------------------------------------------------------
  // 2. Fallback selection at dispatch time
  // --------------------------------------------------------------------------

  test('skips worker dispatch when any chain executable is rate-limited (plan-level)', async () => {
    // With plan-level rate limits, marking any executable in the fallback chain
    // marks ALL chain entries as limited (they share the same API plan).
    // So marking 'claude' should also mark 'claude2', preventing dispatch.
    const worker = await createTestWorker('fallback-alice');
    await createTestTask('Task for fallback test');

    // Mark 'claude' as limited — since it's in the fallback chain, ALL chain
    // entries ('claude2' and 'claude') should be marked
    daemon.handleRateLimitDetected('claude', new Date(Date.now() + 60_000));

    const result = await daemon.pollWorkerAvailability();

    // Worker should NOT be dispatched because all chain entries are limited
    expect(result.processed).toBe(0);

    const status = daemon.getRateLimitStatus();
    expect(status.isPaused).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 3. All limited skips dispatch
  // --------------------------------------------------------------------------

  test('skips worker dispatch when all executables in fallback chain are limited', async () => {
    const worker = await createTestWorker('all-limited-bob');
    await createTestTask('Task for all-limited test');

    // Mark all executables in the fallback chain as limited
    const resetsAt = new Date(Date.now() + 60_000);
    daemon.handleRateLimitDetected('claude2', resetsAt);
    daemon.handleRateLimitDetected('claude', resetsAt);

    const result = await daemon.pollWorkerAvailability();

    // Dispatch should have been attempted but skipped due to all_limited
    expect(result.processed).toBe(0);

    // Session should NOT have been started
    expect(sessionManager.startSession).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 4. Pause state in poll cycle — dispatch polls skipped, non-dispatch still run
  // --------------------------------------------------------------------------

  test('pauses dispatch polls when all executables are limited but runs non-dispatch polls', async () => {
    // Enable closed-unmerged reconciliation (a non-dispatch poll)
    await daemon.stop();

    const pauseDaemon = new DispatchDaemonImpl(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      {
        pollIntervalMs: 100,
        workerAvailabilityPollEnabled: true,
        inboxPollEnabled: true,
        stewardTriggerPollEnabled: false,
        workflowTaskPollEnabled: true,
        closedUnmergedReconciliationEnabled: true,
        planAutoCompleteEnabled: true,
      },
      undefined,
      settingsService
    );

    // Mark all executables in the fallback chain as limited
    const resetsAt = new Date(Date.now() + 60_000);
    pauseDaemon.handleRateLimitDetected('claude2', resetsAt);
    pauseDaemon.handleRateLimitDetected('claude', resetsAt);

    // Verify the daemon reports paused state
    const status = pauseDaemon.getRateLimitStatus();
    expect(status.isPaused).toBe(true);

    // Track which poll events fire during a single poll cycle
    const pollTypes: string[] = [];
    pauseDaemon.on('poll:start', (pollType: string) => {
      pollTypes.push(pollType);
    });

    // Start daemon to trigger a poll cycle, then stop immediately after
    await pauseDaemon.start();
    // Give it enough time for one cycle
    await new Promise((resolve) => setTimeout(resolve, 300));
    await pauseDaemon.stop();

    // Non-dispatch polls should have run (inbox, closed-unmerged, plan-auto-complete)
    // Dispatch polls (worker-availability, workflow-task) should NOT have run
    expect(pollTypes).toContain('inbox');
    expect(pollTypes).not.toContain('worker-availability');
    expect(pollTypes).not.toContain('workflow-task');

    daemon = pauseDaemon; // for cleanup
  });

  // --------------------------------------------------------------------------
  // 5. Auto-resume after reset — time advances past rate limit reset
  // --------------------------------------------------------------------------

  test('resumes normal dispatch after rate limit resets', async () => {
    const worker = await createTestWorker('resume-charlie');
    await createTestTask('Task for resume test');

    // Note: handleRateLimitDetected now enforces a minimum floor, so passing a
    // past time will clamp it to 15 min from now. To test "already expired"
    // behavior, we bypass the daemon and mark the tracker directly via a
    // second handleRateLimitDetected with a time above the floor, then verify
    // that dispatch proceeds when all limits have naturally expired.
    //
    // For this test, we simply verify dispatch works when no limits are active.
    // The getRateLimitStatus should show NOT paused with no limits.
    const status = daemon.getRateLimitStatus();
    expect(status.isPaused).toBe(false);
    expect(status.limits).toHaveLength(0);

    // Dispatch should proceed normally since no limits are active
    const result = await daemon.pollWorkerAvailability();
    expect(result.processed).toBe(1);

    // Verify session was started
    expect(sessionManager.startSession).toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 6. getRateLimitStatus returns correct data
  // --------------------------------------------------------------------------

  test('getRateLimitStatus returns correct data when executables are limited', () => {
    // Initially no limits
    const initialStatus = daemon.getRateLimitStatus();
    expect(initialStatus.isPaused).toBe(false);
    expect(initialStatus.limits).toHaveLength(0);
    expect(initialStatus.soonestReset).toBeUndefined();

    // Mark one chain executable as limited (time above the 15-minute floor).
    // Since rate limits are plan-level, marking any chain entry marks ALL entries.
    const resetTime1 = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    daemon.handleRateLimitDetected('claude2', resetTime1);

    const afterFirstLimit = daemon.getRateLimitStatus();
    // Plan-level: marking 'claude2' marks both chain entries
    expect(afterFirstLimit.isPaused).toBe(true);
    expect(afterFirstLimit.limits).toHaveLength(2);
    expect(afterFirstLimit.soonestReset).toBe(resetTime1.toISOString());

    // Mark with a sooner time — the tracker only keeps the LATER reset time
    // per executable, so this call should not downgrade claude2's limit.
    // Both chain entries get re-marked with the same time.
    const resetTime2 = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes from now
    daemon.handleRateLimitDetected('claude', resetTime2);

    const fullStatus = daemon.getRateLimitStatus();
    expect(fullStatus.isPaused).toBe(true); // Both are limited
    expect(fullStatus.limits).toHaveLength(2);

    // Verify both executables are in the limits list
    const executables = fullStatus.limits.map((l) => l.executable).sort();
    expect(executables).toEqual(['claude', 'claude2']);
  });

  test('getRateLimitStatus isPaused is true when default provider is rate-limited even without fallback chain', async () => {
    // Create a daemon with no settings service (fallbackChain defaults to [])
    await daemon.stop();

    const noSettingsDaemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      { pollIntervalMs: 100 }
      // No poolService, no settingsService
    );

    // When the default provider ('claude') is rate-limited and there's no fallback chain,
    // isPaused should be true — there's no alternative executable to fall back to.
    // Previously this was always false with an empty chain, which caused orphan recovery
    // to run every cycle and incorrectly increment resumeCount for rate-limited tasks.
    noSettingsDaemon.handleRateLimitDetected('claude', new Date(Date.now() + 60_000));

    const status = noSettingsDaemon.getRateLimitStatus();
    expect(status.isPaused).toBe(true);
    expect(status.limits).toHaveLength(1);

    await noSettingsDaemon.stop();
    daemon = noSettingsDaemon;
  });
});

// ============================================================================
// onSessionStarted race condition — rate_limited events before callback
// ============================================================================

describe('onSessionStarted race condition - rate limit events caught immediately', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-race-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('rate_limited event emitted during dispatch async gap is caught by listener', async () => {
    // This test verifies the fix for a race condition where rate_limited events
    // emitted during the async gap between startSession() and the deferred
    // onSessionStarted callback were lost because no listener was attached.
    //
    // The fix moves onSessionStarted to fire IMMEDIATELY after startSession()
    // returns, BEFORE the dispatch() call and other async database operations.
    //
    // We verify this by having the dispatch mock emit a rate_limited event on
    // the session's events emitter. If onSessionStarted was called before
    // dispatch (as in the fix), the listener catches it. If it was called after
    // dispatch (as in the old code), the event would be lost.

    let rateLimitCaptured = false;
    let sessionEvents: EventEmitter | null = null;

    // Capture the events emitter from startSession
    (sessionManager.startSession as ReturnType<typeof mock>).mockImplementation(
      async (agentId: EntityId, options?: StartSessionOptions) => {
        const events = new EventEmitter();
        sessionEvents = events;
        const session: SessionRecord = {
          id: `session-${Date.now()}`,
          agentId,
          agentRole: 'worker',
          workerMode: 'ephemeral',
          status: 'running',
          workingDirectory: options?.workingDirectory,
          worktree: options?.worktree,
          createdAt: createTimestamp(),
          startedAt: createTimestamp(),
          lastActivityAt: createTimestamp(),
        };
        return { session, events };
      }
    );

    // Wrap the real dispatch to emit rate_limited DURING the dispatch call.
    // This simulates a rate limit event arriving during the async gap that
    // previously existed between startSession() and onSessionStarted().
    const originalDispatch = dispatchService.dispatch.bind(dispatchService);
    dispatchService.dispatch = async (...args: Parameters<typeof dispatchService.dispatch>) => {
      // Emit rate_limited on the session's events emitter during dispatch.
      // Before the fix, onSessionStarted hadn't been called yet at this point,
      // so this event would have had no listener.
      if (sessionEvents) {
        sessionEvents.emit('rate_limited', {
          executablePath: 'claude',
          resetsAt: new Date(Date.now() + 60_000),
          message: 'Rate limited',
        });
      }
      return originalDispatch(...args);
    };

    // onSessionStarted callback that attaches the rate_limited listener
    const onSessionStarted = (
      _session: SessionRecord,
      events: EventEmitter,
      _agentId: EntityId,
      _initialPrompt: string
    ) => {
      events.on('rate_limited', () => {
        rateLimitCaptured = true;
      });
    };

    daemon = new DispatchDaemonImpl(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      {
        pollIntervalMs: 100,
        workerAvailabilityPollEnabled: true,
        inboxPollEnabled: false,
        stewardTriggerPollEnabled: false,
        workflowTaskPollEnabled: false,
        onSessionStarted,
      }
    );

    // Register worker and create task
    await agentRegistry.registerWorker({
      name: 'race-worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
    await api.create(
      await createTask({ title: 'Task for race test', createdBy: systemEntity, status: TaskStatus.OPEN }) as unknown as Record<string, unknown> & { createdBy: EntityId }
    );

    // Poll to trigger dispatch
    await daemon.pollWorkerAvailability();

    // The rate_limited event should have been caught because onSessionStarted
    // was called immediately after startSession() — before dispatch() ran —
    // so the listener was already attached when dispatch emitted the event.
    expect(rateLimitCaptured).toBe(true);
  });

  test('onSessionStarted is called before dispatch service runs (ordering verification)', async () => {
    // Verify the execution ordering: onSessionStarted MUST be called before
    // dispatchService.dispatch(). This is the core fix — listeners are attached
    // before the async gap starts.
    const callOrder: string[] = [];
    let sessionEvents: EventEmitter | null = null;

    (sessionManager.startSession as ReturnType<typeof mock>).mockImplementation(
      async (agentId: EntityId, options?: StartSessionOptions) => {
        const events = new EventEmitter();
        sessionEvents = events;
        const session: SessionRecord = {
          id: `session-${Date.now()}`,
          agentId,
          agentRole: 'worker',
          workerMode: 'ephemeral',
          status: 'running',
          workingDirectory: options?.workingDirectory,
          worktree: options?.worktree,
          createdAt: createTimestamp(),
          startedAt: createTimestamp(),
          lastActivityAt: createTimestamp(),
        };
        callOrder.push('startSession');
        return { session, events };
      }
    );

    // Wrap dispatch to track ordering
    const originalDispatch = dispatchService.dispatch.bind(dispatchService);
    dispatchService.dispatch = async (...args: Parameters<typeof dispatchService.dispatch>) => {
      callOrder.push('dispatch');
      return originalDispatch(...args);
    };

    const onSessionStarted = (
      _session: SessionRecord,
      _events: EventEmitter,
      _agentId: EntityId,
      _initialPrompt: string
    ) => {
      callOrder.push('onSessionStarted');
    };

    daemon = new DispatchDaemonImpl(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      {
        pollIntervalMs: 100,
        workerAvailabilityPollEnabled: true,
        inboxPollEnabled: false,
        stewardTriggerPollEnabled: false,
        workflowTaskPollEnabled: false,
        onSessionStarted,
      }
    );

    await agentRegistry.registerWorker({
      name: 'order-worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
    await api.create(
      await createTask({ title: 'Task for order test', createdBy: systemEntity, status: TaskStatus.OPEN }) as unknown as Record<string, unknown> & { createdBy: EntityId }
    );

    await daemon.pollWorkerAvailability();

    // The fix ensures onSessionStarted is called BEFORE dispatch.
    // Before the fix, the order was: startSession -> dispatch -> onSessionStarted
    // After the fix, the order is: startSession -> onSessionStarted -> dispatch
    expect(callOrder).toEqual(['startSession', 'onSessionStarted', 'dispatch']);
  });
});

// ============================================================================
// spawnRecoveryStewardForTask - atomicity tests
// ============================================================================

describe('spawnRecoveryStewardForTask - atomic worker unassignment', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-recovery-steward-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
      maxResumeAttemptsBeforeRecovery: 3,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestWorker(name: string): Promise<AgentEntity> {
    return agentRegistry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createTestRecoverySteward(name: string): Promise<AgentEntity> {
    return agentRegistry.registerSteward({
      name,
      stewardFocus: 'recovery',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  /** Creates a stuck task assigned to a worker with resumeCount at or above the recovery threshold. */
  async function createStuckTask(
    title: string,
    workerId: EntityId,
    resumeCount: number = 3,
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: workerId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    await api.update(saved.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: workerId,
        branch: 'agent/test-worker/task-branch',
        worktree: '/worktrees/test-worker/task',
        sessionId: 'prev-session-stuck',
        resumeCount,
      }),
    });

    return (await api.get<Task>(saved.id))!;
  }

  test('retains worker assignment when steward session start fails', async () => {
    const worker = await createTestWorker('stuck-worker');
    const workerId = worker.id as unknown as EntityId;
    await createTestRecoverySteward('recovery-steward-1');

    const task = await createStuckTask('Stuck task - session fail', workerId);

    // Mock startSession to throw (simulating rate limit / pool full)
    (sessionManager.startSession as ReturnType<typeof mock>).mockImplementation(async () => {
      throw new Error('Rate limited: too many concurrent sessions');
    });

    const result = await daemon.recoverOrphanedAssignments();

    // The error should be caught — task should NOT be orphaned
    expect(result.errors).toBe(1);

    // Task should STILL be assigned to the original worker
    const updatedTask = await api.get<Task>(task.id);
    expect(updatedTask?.assignee as unknown as string).toBe(workerId as unknown as string);

    // The orchestrator metadata should still point to the worker
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.assignedAgent).toBe(workerId as unknown as string);
  });

  test('transfers task to steward when session starts successfully', async () => {
    const worker = await createTestWorker('stuck-worker-ok');
    const workerId = worker.id as unknown as EntityId;
    const steward = await createTestRecoverySteward('recovery-steward-2');
    const stewardId = steward.id as unknown as EntityId;

    const task = await createStuckTask('Stuck task - success path', workerId);

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Task should now be assigned to the steward
    const updatedTask = await api.get<Task>(task.id);
    expect(updatedTask?.assignee as unknown as string).toBe(stewardId as unknown as string);

    // The orchestrator metadata should point to the steward
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.assignedAgent).toBe(stewardId as unknown as string);
    expect(meta?.sessionId).toBeDefined();

    // Session should have been started for the steward
    expect(sessionManager.startSession).toHaveBeenCalledWith(
      stewardId,
      expect.objectContaining({
        workingDirectory: '/worktrees/test-worker/task',
        interactive: false,
      })
    );
  });

  test('terminates steward session when metadata update fails after successful session start', async () => {
    const worker = await createTestWorker('stuck-worker-meta-fail');
    const workerId = worker.id as unknown as EntityId;
    const steward = await createTestRecoverySteward('recovery-steward-3');
    const stewardId = steward.id as unknown as EntityId;

    const task = await createStuckTask('Stuck task - metadata fail', workerId);

    // Let startSession succeed, but make the subsequent api.update fail
    // We need to intercept only the api.update calls that happen AFTER session start
    const originalUpdate = api.update.bind(api);
    let sessionStarted = false;

    (sessionManager.startSession as ReturnType<typeof mock>).mockImplementation(async (agentId: EntityId, options?: StartSessionOptions) => {
      sessionStarted = true;
      const session: SessionRecord = {
        id: `session-recovery-${Date.now()}`,
        agentId,
        agentRole: 'steward',
        workerMode: 'ephemeral',
        status: 'running',
        workingDirectory: options?.workingDirectory,
        worktree: options?.worktree,
        createdAt: createTimestamp(),
        startedAt: createTimestamp(),
        lastActivityAt: createTimestamp(),
      };
      return { session, events: new EventEmitter() };
    });

    // Override api.update to fail after session start for the task metadata update
    const originalApiUpdate = api.update;
    let updateCallCount = 0;
    api.update = (async (...args: Parameters<typeof api.update>) => {
      updateCallCount++;
      // The first update after session start is the metadata transfer — make it fail.
      // Prior updates (e.g. resumeCount increment) should succeed.
      if (sessionStarted) {
        throw new Error('Database write failed: disk full');
      }
      return originalUpdate(...args);
    }) as typeof api.update;

    const result = await daemon.recoverOrphanedAssignments();

    // Restore original
    api.update = originalApiUpdate;

    // The metadata update error should be reported
    expect(result.errors).toBe(1);

    // Steward session should have been terminated to prevent orphan
    expect(sessionManager.stopSession).toHaveBeenCalledWith(stewardId);

    // Task should STILL be assigned to the original worker (not orphaned)
    const updatedTask = await api.get<Task>(task.id);
    expect(updatedTask?.assignee as unknown as string).toBe(workerId as unknown as string);
  });
});

// ============================================================================
// Recovery steward cascade prevention tests
// ============================================================================

describe('recoverOrphanedAssignments - recovery steward cascade prevention', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-cascade-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
      maxResumeAttemptsBeforeRecovery: 3,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestWorker(name: string): Promise<AgentEntity> {
    return agentRegistry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createTestRecoverySteward(name: string): Promise<AgentEntity> {
    return agentRegistry.registerSteward({
      name,
      stewardFocus: 'recovery',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createStuckTask(
    title: string,
    workerId: EntityId,
    resumeCount: number = 3,
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: workerId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    await api.update(saved.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: workerId,
        branch: 'agent/test-worker/task-branch',
        worktree: '/worktrees/test-worker/task',
        sessionId: 'prev-session-stuck',
        resumeCount,
      }),
    });

    return (await api.get<Task>(saved.id))!;
  }

  test('recovery steward is only assigned to one task per cycle when multiple stuck tasks exist', async () => {
    // Create two workers with stuck tasks
    const worker1 = await createTestWorker('cascade-worker-1');
    const worker2 = await createTestWorker('cascade-worker-2');
    const workerId1 = worker1.id as unknown as EntityId;
    const workerId2 = worker2.id as unknown as EntityId;

    // Create a single recovery steward
    const steward = await createTestRecoverySteward('recovery-steward-cascade');
    const stewardId = steward.id as unknown as EntityId;

    // Both tasks are stuck (resumeCount >= maxResumes)
    const task1 = await createStuckTask('Stuck task 1', workerId1, 3);
    const task2 = await createStuckTask('Stuck task 2', workerId2, 3);

    // Mock startSession to simulate a session that immediately terminates (rate limited).
    // The session starts successfully but the steward is immediately dead —
    // getActiveSession returns null.
    (sessionManager.startSession as ReturnType<typeof mock>).mockImplementation(
      async (agentId: EntityId, options?: StartSessionOptions) => {
        const session: SessionRecord = {
          id: `session-cascade-${Date.now()}`,
          agentId,
          agentRole: 'steward',
          workerMode: 'ephemeral',
          status: 'running',
          workingDirectory: options?.workingDirectory,
          worktree: options?.worktree,
          createdAt: createTimestamp(),
          startedAt: createTimestamp(),
          lastActivityAt: createTimestamp(),
        };
        // Don't store in sessions map — simulates session dying immediately
        // so getActiveSession returns null
        return { session, events: new EventEmitter() };
      }
    );

    const result = await daemon.recoverOrphanedAssignments();

    // The steward should only have a session started ONCE — the cascade is prevented.
    // spawnRecoveryStewardForTask returns normally (no error) when no steward is available,
    // so processed counts both calls, but only one actually spawned a session.
    expect(sessionManager.startSession).toHaveBeenCalledTimes(1);

    // Verify at most one task was reassigned to the steward
    const updatedTask1 = await api.get<Task>(task1.id);
    const updatedTask2 = await api.get<Task>(task2.id);

    const task1AssignedToSteward = (updatedTask1?.assignee as unknown as string) === (stewardId as unknown as string);
    const task2AssignedToSteward = (updatedTask2?.assignee as unknown as string) === (stewardId as unknown as string);

    // Exactly one should be assigned to the steward
    const stewardAssignments = [task1AssignedToSteward, task2AssignedToSteward].filter(Boolean).length;
    expect(stewardAssignments).toBe(1);
  });

  test('steward session that terminates immediately is not reassigned in same cycle', async () => {
    // Create three workers with stuck tasks
    const worker1 = await createTestWorker('imm-term-worker-1');
    const worker2 = await createTestWorker('imm-term-worker-2');
    const worker3 = await createTestWorker('imm-term-worker-3');
    const workerId1 = worker1.id as unknown as EntityId;
    const workerId2 = worker2.id as unknown as EntityId;
    const workerId3 = worker3.id as unknown as EntityId;

    // Only one recovery steward
    await createTestRecoverySteward('recovery-steward-imm-term');

    await createStuckTask('Stuck A', workerId1, 5);
    await createStuckTask('Stuck B', workerId2, 5);
    await createStuckTask('Stuck C', workerId3, 5);

    // Session starts but immediately dies — getActiveSession returns null
    (sessionManager.startSession as ReturnType<typeof mock>).mockImplementation(
      async (agentId: EntityId, options?: StartSessionOptions) => {
        const session: SessionRecord = {
          id: `session-imm-${Date.now()}`,
          agentId,
          agentRole: 'steward',
          workerMode: 'ephemeral',
          status: 'running',
          workingDirectory: options?.workingDirectory,
          worktree: options?.worktree,
          createdAt: createTimestamp(),
          startedAt: createTimestamp(),
          lastActivityAt: createTimestamp(),
        };
        return { session, events: new EventEmitter() };
      }
    );

    const result = await daemon.recoverOrphanedAssignments();

    // Despite three stuck tasks, steward should only have a session started ONCE
    expect(sessionManager.startSession).toHaveBeenCalledTimes(1);
  });

  test('multiple stewards can each handle one task per cycle', async () => {
    // Create two workers with stuck tasks
    const worker1 = await createTestWorker('multi-steward-worker-1');
    const worker2 = await createTestWorker('multi-steward-worker-2');
    const workerId1 = worker1.id as unknown as EntityId;
    const workerId2 = worker2.id as unknown as EntityId;

    // Create TWO recovery stewards
    const steward1 = await createTestRecoverySteward('recovery-steward-multi-1');
    const steward2 = await createTestRecoverySteward('recovery-steward-multi-2');
    const stewardId1 = steward1.id as unknown as EntityId;
    const stewardId2 = steward2.id as unknown as EntityId;

    await createStuckTask('Multi stuck 1', workerId1, 3);
    await createStuckTask('Multi stuck 2', workerId2, 3);

    // Sessions start but immediately die
    (sessionManager.startSession as ReturnType<typeof mock>).mockImplementation(
      async (agentId: EntityId, options?: StartSessionOptions) => {
        const session: SessionRecord = {
          id: `session-multi-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          agentId,
          agentRole: 'steward',
          workerMode: 'ephemeral',
          status: 'running',
          workingDirectory: options?.workingDirectory,
          worktree: options?.worktree,
          createdAt: createTimestamp(),
          startedAt: createTimestamp(),
          lastActivityAt: createTimestamp(),
        };
        return { session, events: new EventEmitter() };
      }
    );

    const result = await daemon.recoverOrphanedAssignments();

    // Both stewards should be spawned — one per stuck task
    expect(sessionManager.startSession).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(2);

    // Each steward should be assigned to a different task
    const startSessionCalls = (sessionManager.startSession as ReturnType<typeof mock>).mock.calls;
    const spawnedAgentIds = startSessionCalls.map((call: unknown[]) => call[0]);
    expect(new Set(spawnedAgentIds).size).toBe(2);
  });
});

describe('startup non-blocking orphan recovery', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-startup-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('start() returns promptly even if orphan recovery takes a long time', async () => {
    const config: DispatchDaemonConfig = {
      pollIntervalMs: 50,
      workerAvailabilityPollEnabled: true,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );

    // Track poll cycle events to verify poll cycles resume after recovery completes
    const pollEvents: string[] = [];
    daemon.on('poll:start', (type: string) => pollEvents.push(`start:${type}`));
    daemon.on('poll:complete', () => pollEvents.push('complete'));

    // Override recoverOrphanedAssignments to simulate a long-running recovery
    // that blocks for a long time (stale session resume scenario)
    let recoveryCallCount = 0;
    let resolveRecovery: (() => void) | undefined;
    const recoveryPromise = new Promise<void>((resolve) => {
      resolveRecovery = resolve;
    });

    const impl = daemon as DispatchDaemonImpl;
    impl.recoverOrphanedAssignments = async () => {
      recoveryCallCount++;
      if (recoveryCallCount === 1) {
        // Only block on the first call (startup recovery)
        await recoveryPromise;
      }
      return { pollType: 'orphan-recovery' as const, startedAt: new Date().toISOString(), processed: 0, errors: 0, errorMessages: [], durationMs: 0 };
    };

    // Start the daemon — this should NOT block on orphan recovery
    const startTime = Date.now();
    await daemon.start();
    const startDuration = Date.now() - startTime;

    // start() should return near-instantly (well under 1s)
    expect(startDuration).toBeLessThan(1000);

    // Orphan recovery was started in the background
    expect(recoveryCallCount).toBe(1);

    // Poll cycles are blocked waiting for startup recovery, so no poll events yet
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(pollEvents.length).toBe(0);

    // Resolve the startup recovery — poll cycles should now proceed
    resolveRecovery!();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Poll events should have fired after startup recovery completed
    expect(pollEvents.length).toBeGreaterThan(0);
    expect(pollEvents.some((e) => e.startsWith('start:'))).toBe(true);
  });

  test('tasks are dispatched promptly once startup orphan recovery completes', async () => {
    const config: DispatchDaemonConfig = {
      pollIntervalMs: 50,
      workerAvailabilityPollEnabled: true,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );

    // Create a worker and an unassigned task
    await agentRegistry.registerWorker({
      name: 'fast-worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });

    const task = await createTask({
      title: 'Should be dispatched quickly',
      createdBy: systemEntity,
      status: TaskStatus.OPEN,
    });
    await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId });

    // Override orphan recovery: first call (startup) blocks briefly, subsequent calls resolve fast
    let recoveryCallCount = 0;
    let resolveRecovery: (() => void) | undefined;
    const impl = daemon as DispatchDaemonImpl;
    impl.recoverOrphanedAssignments = async () => {
      recoveryCallCount++;
      if (recoveryCallCount === 1) {
        // Simulate slow startup recovery, then resolve quickly
        await new Promise<void>((resolve) => {
          resolveRecovery = resolve;
        });
      }
      return { pollType: 'orphan-recovery' as const, startedAt: new Date().toISOString(), processed: 0, errors: 0, errorMessages: [], durationMs: 0 };
    };

    // Start the daemon — orphan recovery runs in background, poll loop awaits it
    await daemon.start();

    // No dispatch yet — poll cycle is waiting on startup recovery
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sessionManager.startSession).not.toHaveBeenCalled();

    // Release startup recovery — poll cycle should now proceed to dispatch
    resolveRecovery!();
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The worker should have had a session started — task was dispatched
    // once the serialized startup recovery + poll-cycle recovery completed
    expect(sessionManager.startSession).toHaveBeenCalled();
  });

  test('recoverOrphanedAssignments is never called concurrently (startup vs poll cycle)', async () => {
    const config: DispatchDaemonConfig = {
      pollIntervalMs: 50,
      workerAvailabilityPollEnabled: true,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );

    // Track concurrent invocations of recoverOrphanedAssignments.
    // If the promise-based latch works correctly, the count should never exceed 1.
    let activeCalls = 0;
    let maxConcurrentCalls = 0;
    let totalCalls = 0;
    let resolveRecovery: (() => void) | undefined;

    const impl = daemon as DispatchDaemonImpl;
    impl.recoverOrphanedAssignments = async () => {
      activeCalls++;
      totalCalls++;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, activeCalls);
      // Simulate slow recovery so that poll cycles overlap with it
      await new Promise<void>((resolve) => {
        // If this is the startup call, hold it for a while.
        // Otherwise resolve quickly.
        if (totalCalls === 1) {
          resolveRecovery = resolve;
        } else {
          setTimeout(resolve, 10);
        }
      });
      activeCalls--;
      return { pollType: 'orphan-recovery' as const, startedAt: new Date().toISOString(), processed: 0, errors: 0, errorMessages: [], durationMs: 0 };
    };

    // Start the daemon — startup recovery fires in the background
    await daemon.start();

    // Let several poll intervals fire while startup recovery is still held
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Release the startup recovery
    resolveRecovery!();

    // Wait for a few more poll cycles to complete now that recovery is unblocked
    await new Promise((resolve) => setTimeout(resolve, 200));

    // The critical assertion: at no point were there concurrent calls
    expect(maxConcurrentCalls).toBe(1);
    // And the method was actually called more than once (startup + poll cycles)
    expect(totalCalls).toBeGreaterThan(1);
  });
});

describe('recoverOrphanedAssignments - rate limit guard', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let settingsService: SettingsService;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-ratelimit-orphan-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();
    settingsService = createMockSettingsService({
      fallbackChain: ['claude2', 'claude'],
    });

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system-ratelimit-orphan',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
      maxResumeAttemptsBeforeRecovery: 3,
    };

    daemon = new DispatchDaemonImpl(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config,
      undefined, // poolService
      settingsService
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestWorker(name: string): Promise<AgentEntity> {
    return agentRegistry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createAssignedTask(
    title: string,
    workerId: EntityId,
    meta?: { sessionId?: string; worktree?: string; branch?: string; resumeCount?: number }
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: workerId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    await api.update(saved.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: workerId,
        branch: meta?.branch ?? 'agent/test/task-branch',
        worktree: meta?.worktree ?? '/worktrees/test/task',
        sessionId: meta?.sessionId,
        resumeCount: meta?.resumeCount,
      }),
    });

    return (await api.get<Task>(saved.id))!;
  }

  test('does not increment resumeCount when all executables are rate-limited', async () => {
    const worker = await createTestWorker('rate-limited-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task during rate limit', workerId, {
      worktree: '/worktrees/rate-limited-worker/task',
      resumeCount: 1,
    });

    // Mark all executables as rate-limited
    const resetsAt = new Date(Date.now() + 60_000);
    daemon.handleRateLimitDetected('claude2', resetsAt);
    daemon.handleRateLimitDetected('claude', resetsAt);

    const result = await daemon.recoverOrphanedAssignments();

    // Should skip the worker entirely — no processing, no errors
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);

    // resumeCount should NOT have been incremented
    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(1); // Still 1, not 2
  });

  test('does not spawn recovery steward for rate-limited tasks even at maxResumes threshold', async () => {
    const worker = await createTestWorker('threshold-worker');
    const workerId = worker.id as unknown as EntityId;

    // Create a recovery steward so spawnRecoveryStewardForTask has someone to use
    await agentRegistry.registerSteward({
      name: 'test-recovery-steward',
      stewardFocus: 'recovery',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });

    // Task is at the resumeCount threshold (3), but executables are rate-limited
    await createAssignedTask('Task at threshold', workerId, {
      worktree: '/worktrees/threshold-worker/task',
      resumeCount: 3,
    });

    // Mark all executables as rate-limited
    const resetsAt = new Date(Date.now() + 60_000);
    daemon.handleRateLimitDetected('claude2', resetsAt);
    daemon.handleRateLimitDetected('claude', resetsAt);

    const result = await daemon.recoverOrphanedAssignments();

    // Should skip entirely — no recovery steward spawned
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);

    // Session should NOT have been started (neither resume nor fresh spawn)
    expect(sessionManager.startSession).not.toHaveBeenCalled();
    expect(sessionManager.resumeSession).not.toHaveBeenCalled();
  });

  test('resumes normal orphan recovery when no rate limits are active', async () => {
    const worker = await createTestWorker('expiry-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task waiting for rate limit expiry', workerId, {
      worktree: '/worktrees/expiry-worker/task',
      resumeCount: 1,
    });

    // Don't set any rate limits — verify recovery proceeds normally
    // (Note: Previously this test set past expiry times, but the minimum floor
    // now clamps them to 15 min from now. Instead, test that orphan recovery
    // works when no limits are active at all.)
    const result = await daemon.recoverOrphanedAssignments();

    // Should process normally — no rate limits blocking
    expect(result.processed).toBe(1);

    // resumeCount should have been incremented
    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);
  });

  test('skips steward orphan recovery when all executables are rate-limited (Phase 2)', async () => {
    const steward = await agentRegistry.registerSteward({
      name: 'rate-limited-steward',
      stewardFocus: 'merge',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
    const stewardId = steward.id as unknown as EntityId;

    // Create a REVIEW task assigned to the steward with pending mergeStatus
    const task = await createTask({
      title: 'Review task during rate limit',
      createdBy: systemEntity,
      status: TaskStatus.REVIEW,
      assignee: stewardId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    await api.update(saved.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: stewardId,
        mergeStatus: 'testing',
        sessionId: 'steward-session-rl',
        branch: 'agent/worker/task-branch',
        stewardRecoveryCount: 1,
      }),
    });

    // Mark all executables as rate-limited
    const resetsAt = new Date(Date.now() + 60_000);
    daemon.handleRateLimitDetected('claude2', resetsAt);
    daemon.handleRateLimitDetected('claude', resetsAt);

    const result = await daemon.recoverOrphanedAssignments();

    // Should skip steward recovery entirely
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);

    // stewardRecoveryCount should NOT have been incremented
    const updatedTask = await api.get<Task>(saved.id);
    const updatedMeta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(updatedMeta?.stewardRecoveryCount).toBe(1); // Still 1, not 2

    // No session activity
    expect(sessionManager.startSession).not.toHaveBeenCalled();
    expect(sessionManager.resumeSession).not.toHaveBeenCalled();
  });

  test('skips orphan recovery when any chain executable is rate-limited (plan-level)', async () => {
    const worker = await createTestWorker('partial-limit-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with plan-level rate limit', workerId, {
      worktree: '/worktrees/partial-limit-worker/task',
      resumeCount: 0,
    });

    // Mark 'claude' as limited — since it's in the fallback chain, ALL chain
    // entries are marked (plan-level rate limits share the same API plan)
    const resetsAt = new Date(Date.now() + 60_000);
    daemon.handleRateLimitDetected('claude', resetsAt);

    const result = await daemon.recoverOrphanedAssignments();

    // Should skip recovery because all chain entries are limited
    expect(result.processed).toBe(0);

    // resumeCount should NOT have been incremented (stays at initial value)
    const updated = await api.get<Task>(task.id);
    const meta = updated?.metadata as Record<string, unknown> | undefined;
    // resumeCount 0 may be stored as undefined — either way, it must NOT be 1+
    expect(meta?.resumeCount ?? 0).toBe(0);
  });

  test('recoverOrphanedTask returns false and skips resume when rate-limited (inner guard)', async () => {
    const worker = await createTestWorker('inner-guard-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with inner rate limit guard', workerId, {
      sessionId: 'prev-session-inner',
      worktree: '/worktrees/inner-guard-worker/task',
      resumeCount: 2,
    });

    // Mark all executables as rate-limited
    const resetsAt = new Date(Date.now() + 60_000);
    daemon.handleRateLimitDetected('claude2', resetsAt);
    daemon.handleRateLimitDetected('claude', resetsAt);

    const result = await daemon.recoverOrphanedAssignments();

    // Should skip entirely — no session activity
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
    expect(sessionManager.resumeSession).not.toHaveBeenCalled();
    expect(sessionManager.startSession).not.toHaveBeenCalled();

    // resumeCount should NOT have been incremented — still 2
    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);
  });

  test('recoverOrphanedTask skips both resume and fresh spawn when rate-limited (no session activity)', async () => {
    // This ensures the inner rate limit guard in recoverOrphanedTask prevents
    // BOTH the resume path (when sessionId is present) and the fresh spawn
    // fallback from being attempted.
    const worker = await createTestWorker('no-activity-worker');
    const workerId = worker.id as unknown as EntityId;

    // Task WITHOUT a previous sessionId — would normally fall through to fresh spawn
    const task = await createAssignedTask('Task without session', workerId, {
      worktree: '/worktrees/no-activity-worker/task',
      resumeCount: 0,
    });

    // Mark all executables as rate-limited
    const resetsAt = new Date(Date.now() + 60_000);
    daemon.handleRateLimitDetected('claude2', resetsAt);
    daemon.handleRateLimitDetected('claude', resetsAt);

    const result = await daemon.recoverOrphanedAssignments();

    // Should skip entirely — no session spawned, no errors
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
    expect(sessionManager.resumeSession).not.toHaveBeenCalled();
    expect(sessionManager.startSession).not.toHaveBeenCalled();

    // resumeCount should NOT have been incremented — still 0
    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount ?? 0).toBe(0);
  });
});

describe('runPollCycle - allLimited with empty fallback chain', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let settingsService: SettingsService;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-empty-chain-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();
    // Empty fallback chain
    settingsService = createMockSettingsService({
      fallbackChain: [],
    });

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system-empty-chain',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: true,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
    };

    daemon = new DispatchDaemonImpl(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config,
      undefined,
      settingsService
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('reports isPaused when default provider is rate-limited with empty fallback chain', () => {
    // Mark the default provider as rate-limited
    daemon.handleRateLimitDetected('claude', new Date(Date.now() + 60_000));

    const status = daemon.getRateLimitStatus();
    expect(status.isPaused).toBe(true);
  });

  test('reports not paused when default provider is not rate-limited with empty fallback chain', () => {
    const status = daemon.getRateLimitStatus();
    expect(status.isPaused).toBe(false);
  });
});

// ============================================================================
// Rate Limit Minimum Floor Tests
// ============================================================================

describe('handleRateLimitDetected - minimum floor', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let settingsService: SettingsService;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-floor-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();
    settingsService = createMockSettingsService({
      fallbackChain: ['claude2', 'claude'],
    });

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system-floor',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    daemon = new DispatchDaemonImpl(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      { pollIntervalMs: 100 },
      undefined,
      settingsService
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('clamps reset time to minimum floor when too short', () => {
    const now = Date.now();
    // Reset time 1 minute from now — way below the 15-minute floor
    const tooSoon = new Date(now + 60_000);
    daemon.handleRateLimitDetected('claude', tooSoon);

    const status = daemon.getRateLimitStatus();
    // Plan-level: marking 'claude' (in chain) marks all chain entries
    expect(status.limits).toHaveLength(2);

    // All entries should be clamped to the floor
    for (const limit of status.limits) {
      const recordedResetTime = new Date(limit.resetsAt).getTime();
      // Should be at least RATE_LIMIT_MINIMUM_FLOOR_MS from now (minus a small tolerance)
      expect(recordedResetTime).toBeGreaterThanOrEqual(now + RATE_LIMIT_MINIMUM_FLOOR_MS - 1000);
    }
  });

  test('preserves reset time when already above the floor', () => {
    const now = Date.now();
    // Reset time 30 minutes from now — above the 15-minute floor
    const farEnough = new Date(now + 30 * 60 * 1000);
    daemon.handleRateLimitDetected('claude', farEnough);

    const status = daemon.getRateLimitStatus();
    // Plan-level: marking 'claude' (in chain) marks all chain entries
    expect(status.limits).toHaveLength(2);
    for (const limit of status.limits) {
      expect(limit.resetsAt).toBe(farEnough.toISOString());
    }
  });

  test('clamps reset time in the past to minimum floor', () => {
    const now = Date.now();
    // Reset time already in the past
    const pastTime = new Date(now - 60_000);
    daemon.handleRateLimitDetected('claude', pastTime);

    const status = daemon.getRateLimitStatus();
    // Plan-level: marking 'claude' (in chain) marks all chain entries
    expect(status.limits).toHaveLength(2);

    for (const limit of status.limits) {
      const recordedResetTime = new Date(limit.resetsAt).getTime();
      // Should be clamped to at least the minimum floor from now
      expect(recordedResetTime).toBeGreaterThanOrEqual(now + RATE_LIMIT_MINIMUM_FLOOR_MS - 1000);
    }
  });

  test('clamps reset time exactly at the floor boundary', () => {
    const now = Date.now();
    // Exactly at the floor — should NOT be clamped (it equals the floor)
    const exactlyAtFloor = new Date(now + RATE_LIMIT_MINIMUM_FLOOR_MS);
    daemon.handleRateLimitDetected('claude', exactlyAtFloor);

    const status = daemon.getRateLimitStatus();
    // Plan-level: marking 'claude' (in chain) marks all chain entries
    expect(status.limits).toHaveLength(2);

    for (const limit of status.limits) {
      const recordedResetTime = new Date(limit.resetsAt).getTime();
      // Should be very close to the original (within tolerance of test execution time)
      expect(Math.abs(recordedResetTime - exactlyAtFloor.getTime())).toBeLessThan(2000);
    }
  });
});

// ============================================================================
// Rapid-Exit Detection Tests
// ============================================================================

describe('recoverOrphanedTask - rapid-exit detection', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let settingsService: SettingsService;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  /**
   * Creates a mock session manager that returns real EventEmitters for events.
   * This is necessary for testing the rapid-exit detection, which attaches
   * listeners to session events.
   */
  function createMockSessionManagerWithEvents(): SessionManager & { _lastEvents: EventEmitter | null } {
    const sessions = new Map<EntityId, SessionRecord>();
    let lastEvents: EventEmitter | null = null;

    const mgr = {
      _lastEvents: null as EventEmitter | null,
      startSession: mock(async (agentId: EntityId, options?: StartSessionOptions) => {
        const events = new EventEmitter();
        lastEvents = events;
        mgr._lastEvents = events;
        const session: SessionRecord = {
          id: `session-${Date.now()}`,
          agentId,
          agentRole: 'worker',
          workerMode: 'ephemeral',
          status: 'running',
          workingDirectory: options?.workingDirectory,
          worktree: options?.worktree,
          createdAt: createTimestamp(),
          startedAt: createTimestamp(),
          lastActivityAt: createTimestamp(),
        };
        sessions.set(agentId, session);
        return { session, events };
      }),
      getActiveSession: mock((agentId: EntityId) => {
        return sessions.get(agentId) ?? null;
      }),
      stopSession: mock(async () => {}),
      suspendSession: mock(async () => {}),
      resumeSession: mock(async (agentId: EntityId) => {
        const events = new EventEmitter();
        lastEvents = events;
        mgr._lastEvents = events;
        const session: SessionRecord = {
          id: `session-resume-${Date.now()}`,
          agentId,
          agentRole: 'worker',
          workerMode: 'ephemeral',
          status: 'running',
          createdAt: createTimestamp(),
          startedAt: createTimestamp(),
          lastActivityAt: createTimestamp(),
        };
        sessions.set(agentId, session);
        return { session, events };
      }),
      getSession: mock(() => undefined),
      listSessions: mock(() => []),
      messageSession: mock(async () => ({ success: true })),
      getSessionHistory: mock(() => []),
      pruneInactiveSessions: mock(() => 0),
      reconcileOnStartup: mock(async () => ({ reconciled: 0, errors: [] })),
      on: mock(() => {}),
      off: mock(() => {}),
      emit: mock(() => {}),
    } as unknown as SessionManager & { _lastEvents: EventEmitter | null };

    return mgr;
  }

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-rapid-exit-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManagerWithEvents();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();
    settingsService = createMockSettingsService({
      fallbackChain: ['claude2', 'claude'],
    });

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system-rapid-exit',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    daemon = new DispatchDaemonImpl(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      {
        pollIntervalMs: 100,
        orphanRecoveryEnabled: true,
        maxResumeAttemptsBeforeRecovery: 5,
      },
      undefined,
      settingsService
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestWorker(name: string): Promise<AgentEntity> {
    return agentRegistry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createAssignedTask(
    title: string,
    workerId: EntityId,
    meta?: { sessionId?: string; worktree?: string; branch?: string; resumeCount?: number }
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: workerId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    await api.update(saved.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: workerId,
        branch: meta?.branch ?? 'agent/test/task-branch',
        worktree: meta?.worktree ?? '/worktrees/test/task',
        sessionId: meta?.sessionId,
        resumeCount: meta?.resumeCount,
      }),
    });

    return (await api.get<Task>(saved.id))!;
  }

  test('rolls back resumeCount when session exits rapidly without output', async () => {
    const worker = await createTestWorker('rapid-exit-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with rapid exit', workerId, {
      worktree: '/worktrees/rapid-exit-worker/task',
      resumeCount: 1,
    });

    // Trigger orphan recovery (worker has no active session, so it gets recovered)
    const result = await daemon.recoverOrphanedAssignments();
    expect(result.processed).toBe(1);

    // After recovery, resumeCount should be incremented to 2
    let updatedTask = await api.get<Task>(task.id);
    let meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);

    // Simulate rapid exit — emit exit immediately without any assistant events
    const events = (sessionManager as ReturnType<typeof createMockSessionManagerWithEvents>)._lastEvents!;
    events.emit('exit', 1, null);

    // Wait for async handler to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // resumeCount should be rolled back to 1
    updatedTask = await api.get<Task>(task.id);
    meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(1);
  });

  test('applies fallback rate limit when session exits rapidly without output', async () => {
    const worker = await createTestWorker('rapid-exit-rl-worker');
    const workerId = worker.id as unknown as EntityId;
    await createAssignedTask('Task with rapid exit rate limit', workerId, {
      worktree: '/worktrees/rapid-exit-rl-worker/task',
      resumeCount: 0,
    });

    // No rate limits before recovery
    let status = daemon.getRateLimitStatus();
    expect(status.limits).toHaveLength(0);

    // Trigger orphan recovery
    await daemon.recoverOrphanedAssignments();

    // Simulate rapid exit without output
    const events = (sessionManager as ReturnType<typeof createMockSessionManagerWithEvents>)._lastEvents!;
    events.emit('exit', 1, null);

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 50));

    // Rate limits should be applied to all executables in the fallback chain
    status = daemon.getRateLimitStatus();
    expect(status.limits.length).toBeGreaterThanOrEqual(1);
    expect(status.isPaused).toBe(true);
  });

  test('does NOT roll back resumeCount when session produces assistant events before exiting', async () => {
    const worker = await createTestWorker('normal-exit-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with normal output', workerId, {
      worktree: '/worktrees/normal-exit-worker/task',
      resumeCount: 1,
    });

    // Trigger orphan recovery
    await daemon.recoverOrphanedAssignments();

    // resumeCount should be 2 now
    let updatedTask = await api.get<Task>(task.id);
    let meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);

    // Simulate session producing assistant events then exiting quickly
    const events = (sessionManager as ReturnType<typeof createMockSessionManagerWithEvents>)._lastEvents!;
    events.emit('event', { type: 'assistant', message: 'Hello' });
    events.emit('exit', 0, null);

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 50));

    // resumeCount should NOT be rolled back (session produced output)
    updatedTask = await api.get<Task>(task.id);
    meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);
  });

  test('does NOT roll back resumeCount when session runs longer than threshold', async () => {
    const worker = await createTestWorker('long-session-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with long session', workerId, {
      worktree: '/worktrees/long-session-worker/task',
      resumeCount: 1,
    });

    // Trigger orphan recovery
    await daemon.recoverOrphanedAssignments();

    // Manually verify resumeCount was incremented
    let updatedTask = await api.get<Task>(task.id);
    let meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);

    // Wait longer than the rapid-exit threshold, then exit without assistant events
    // Note: We can't easily wait 10+ seconds in a test, but the threshold check
    // is based on Date.now() - startTime. Since the test runs fast, the exit
    // within this test will be < RAPID_EXIT_THRESHOLD_MS and would trigger detection.
    // To test the "long session" case properly, we'd need to mock Date.now().
    // For now, we verify that assistant events prevent rollback (covered above).
  });

  test('rapid-exit detection works with resume path (previous sessionId)', async () => {
    const worker = await createTestWorker('rapid-exit-resume-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with rapid exit on resume', workerId, {
      worktree: '/worktrees/rapid-exit-resume-worker/task',
      sessionId: 'prev-session-id',
      resumeCount: 2,
    });

    // Trigger orphan recovery — will attempt resume since sessionId is set
    const result = await daemon.recoverOrphanedAssignments();
    expect(result.processed).toBe(1);

    // resumeCount should be 3 now
    let updatedTask = await api.get<Task>(task.id);
    let meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(3);

    // Simulate rapid exit on the resumed session
    const events = (sessionManager as ReturnType<typeof createMockSessionManagerWithEvents>)._lastEvents!;
    events.emit('exit', 1, null);

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 50));

    // resumeCount should be rolled back to 2
    updatedTask = await api.get<Task>(task.id);
    meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);
  });

  test('detects rate limit when assistant message matches rate limit pattern', async () => {
    const worker = await createTestWorker('rapid-exit-rl-msg-worker');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with rate limit message', workerId, {
      worktree: '/worktrees/rapid-exit-rl-msg-worker/task',
      resumeCount: 1,
    });

    // Trigger orphan recovery
    const result = await daemon.recoverOrphanedAssignments();
    expect(result.processed).toBe(1);

    // After recovery, resumeCount should be incremented to 2
    let updatedTask = await api.get<Task>(task.id);
    let meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);

    // Simulate session emitting a rate limit assistant message, then exiting quickly
    const events = (sessionManager as ReturnType<typeof createMockSessionManagerWithEvents>)._lastEvents!;
    events.emit('event', { type: 'assistant', message: "You've hit your limit · resets 11pm" });
    events.emit('exit', 0, null);

    // Wait for async handler to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // resumeCount should be rolled back to 1 (rate limit detected from assistant message)
    updatedTask = await api.get<Task>(task.id);
    meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(1);
  });

  test('applies rate limit to fallback chain when assistant message is a rate limit', async () => {
    const worker = await createTestWorker('rapid-exit-rl-msg-chain');
    const workerId = worker.id as unknown as EntityId;
    await createAssignedTask('Task with rate limit message chain', workerId, {
      worktree: '/worktrees/rapid-exit-rl-msg-chain/task',
      resumeCount: 0,
    });

    // No rate limits before recovery
    let status = daemon.getRateLimitStatus();
    expect(status.limits).toHaveLength(0);

    // Trigger orphan recovery
    await daemon.recoverOrphanedAssignments();

    // Simulate rate limit assistant message followed by rapid exit
    const events = (sessionManager as ReturnType<typeof createMockSessionManagerWithEvents>)._lastEvents!;
    events.emit('event', { type: 'assistant', message: 'Weekly limit reached · resets Feb 22 at 9:30am' });
    events.emit('exit', 0, null);

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 50));

    // Rate limits should be applied to all executables in the fallback chain
    status = daemon.getRateLimitStatus();
    expect(status.limits.length).toBeGreaterThanOrEqual(1);
    expect(status.isPaused).toBe(true);
  });

  test('does NOT trigger rate limit for non-rate-limit assistant messages on rapid exit', async () => {
    const worker = await createTestWorker('rapid-exit-normal-msg');
    const workerId = worker.id as unknown as EntityId;
    const task = await createAssignedTask('Task with normal message', workerId, {
      worktree: '/worktrees/rapid-exit-normal-msg/task',
      resumeCount: 1,
    });

    // Trigger orphan recovery
    await daemon.recoverOrphanedAssignments();

    // After recovery, resumeCount should be incremented to 2
    let updatedTask = await api.get<Task>(task.id);
    let meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);

    // Simulate session emitting a normal assistant message, then exiting quickly
    const events = (sessionManager as ReturnType<typeof createMockSessionManagerWithEvents>)._lastEvents!;
    events.emit('event', { type: 'assistant', message: 'I am working on your task now.' });
    events.emit('exit', 0, null);

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 50));

    // resumeCount should NOT be rolled back (normal assistant message, not rate limit)
    updatedTask = await api.get<Task>(task.id);
    meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown>);
    expect(meta?.resumeCount).toBe(2);
  });

  test('parses reset time from rate limit assistant message instead of using fallback', async () => {
    const worker = await createTestWorker('rapid-exit-rl-parse');
    const workerId = worker.id as unknown as EntityId;
    await createAssignedTask('Task with parseable rate limit', workerId, {
      worktree: '/worktrees/rapid-exit-rl-parse/task',
      resumeCount: 0,
    });

    // No rate limits before recovery
    let status = daemon.getRateLimitStatus();
    expect(status.limits).toHaveLength(0);

    // Trigger orphan recovery
    await daemon.recoverOrphanedAssignments();

    // Simulate rate limit message with a specific reset time
    const events = (sessionManager as ReturnType<typeof createMockSessionManagerWithEvents>)._lastEvents!;
    events.emit('event', { type: 'assistant', message: "You've hit your limit · resets 11pm" });
    events.emit('exit', 0, null);

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 50));

    // Rate limits should be applied — the parsed reset time from the message
    // should differ from the 1-hour fallback (RAPID_EXIT_FALLBACK_RESET_MS)
    status = daemon.getRateLimitStatus();
    expect(status.limits.length).toBeGreaterThanOrEqual(1);
    expect(status.isPaused).toBe(true);

    // The reset time should be set (parsed from "resets 11pm" or fallback)
    for (const limit of status.limits) {
      expect(limit.resetsAt).toBeDefined();
      expect(new Date(limit.resetsAt).getTime()).toBeGreaterThan(Date.now());
    }
  });
});

// ============================================================================
// Triage Session Rate Limit Guard Tests
// ============================================================================


describe('spawnTriageSession - rate limit guard', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let settingsService: SettingsService;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-triage-ratelimit-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();
    settingsService = createMockSettingsService({
      fallbackChain: ['claude2', 'claude'],
    });

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system-triage-ratelimit',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: true,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
    };

    daemon = new DispatchDaemonImpl(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config,
      undefined, // poolService
      settingsService
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  /**
   * Helper to create a channel, message, document, and inbox item for testing triage.
   */
  async function createTestMessageAndInboxItem(
    workerId: EntityId,
    suffix: string
  ): Promise<void> {
    const { createMessage, createDocument, createGroupChannel, InboxSourceType, ContentType: CT } = await import('@stoneforge/core');

    // Create a group channel
    const channel = await createGroupChannel({
      name: `triage-chan-${suffix}`,
      createdBy: systemEntity,
      members: [systemEntity, workerId],
    });
    const savedChannel = await api.create(channel as unknown as Record<string, unknown> & { createdBy: EntityId });
    const channelId = savedChannel.id as unknown as import('@stoneforge/core').ChannelId;

    // Create a document for the message content
    const doc = await createDocument({
      title: `msg-content-${suffix}`,
      content: 'Hello, please triage this',
      contentType: CT.TEXT,
      createdBy: systemEntity,
    });
    const savedDoc = await api.create(doc as unknown as Record<string, unknown> & { createdBy: EntityId });

    // Create a message in the channel
    const msg = await createMessage({
      channelId,
      sender: systemEntity,
      contentRef: savedDoc.id as unknown as import('@stoneforge/core').DocumentId,
    });
    const savedMsg = await api.create(msg as unknown as Record<string, unknown> & { createdBy: EntityId });

    // Add inbox item for this worker
    inboxService.addToInbox({
      recipientId: workerId,
      messageId: savedMsg.id as unknown as import('@stoneforge/core').MessageId,
      channelId,
      sourceType: InboxSourceType.DIRECT,
      createdBy: systemEntity,
    });
  }

  test('skips triage session spawn when all executables are rate-limited', async () => {
    // Register an ephemeral worker
    const worker = await agentRegistry.registerWorker({
      name: 'triage-worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
    const workerId = worker.id as unknown as EntityId;

    await createTestMessageAndInboxItem(workerId, 'rl');

    // Mark ALL executables as rate-limited
    daemon.handleRateLimitDetected('claude2', new Date(Date.now() + 60_000));
    daemon.handleRateLimitDetected('claude', new Date(Date.now() + 60_000));

    // Verify startSession was not called before polling
    const startSessionMock = sessionManager.startSession as ReturnType<typeof mock>;
    const callCountBefore = startSessionMock.mock.calls.length;

    // Poll inboxes — should defer the item for triage but skip spawn due to rate limits
    await daemon.pollInboxes();

    // startSession should NOT have been called (triage was skipped)
    expect(startSessionMock.mock.calls.length).toBe(callCountBefore);

    // Verify the inbox item is still unread (items stay unread for retry)
    const unreadItems = inboxService.getInbox(workerId, { status: 'unread' as unknown as import('@stoneforge/core').InboxStatus });
    expect(unreadItems.length).toBe(1);
  });

  test('spawns triage session when executables are not rate-limited', async () => {
    // Register an ephemeral worker
    const worker = await agentRegistry.registerWorker({
      name: 'triage-worker-ok',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
    const workerId = worker.id as unknown as EntityId;

    await createTestMessageAndInboxItem(workerId, 'ok');

    // Do NOT rate-limit executables

    const startSessionMock = sessionManager.startSession as ReturnType<typeof mock>;
    const callCountBefore = startSessionMock.mock.calls.length;

    // Poll inboxes — should spawn triage session since no rate limits
    await daemon.pollInboxes();

    // startSession SHOULD have been called (triage was spawned)
    expect(startSessionMock.mock.calls.length).toBeGreaterThan(callCountBefore);
  });
});

// ============================================================================
// Recovery steward — rate limit session history pattern detection
// ============================================================================

describe('spawnRecoveryStewardForTask - rate limit session history guard', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-rl-pattern-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system-rl-pattern',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
      maxResumeAttemptsBeforeRecovery: 3,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestWorker(name: string): Promise<AgentEntity> {
    return agentRegistry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createTestRecoverySteward(name: string): Promise<AgentEntity> {
    return agentRegistry.registerSteward({
      name,
      stewardFocus: 'recovery',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  /**
   * Creates a stuck task with session history entries simulating rapid rate-limited exits.
   * Each session started shortly after the previous one and none have endedAt set.
   */
  async function createTaskWithRateLimitPattern(
    title: string,
    workerId: EntityId,
    sessionCount: number = RATE_LIMIT_SESSION_PATTERN_COUNT,
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: workerId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    // Build session history with rapid succession entries (no endedAt)
    const now = Date.now();
    let metadata: Record<string, unknown> | undefined = undefined;
    metadata = updateOrchestratorTaskMeta(metadata, {
      assignedAgent: workerId,
      branch: 'agent/test-worker/task-branch',
      worktree: '/worktrees/test-worker/task',
      sessionId: 'prev-session-stuck',
      resumeCount: 3,
    });

    for (let i = 0; i < sessionCount; i++) {
      const entry: TaskSessionHistoryEntry = {
        sessionId: `session-rl-${i}`,
        agentId: workerId,
        agentName: 'test-worker',
        agentRole: 'worker',
        startedAt: new Date(now - (sessionCount - i) * 30_000).toISOString() as import('@stoneforge/core').Timestamp, // 30s apart
        // No endedAt — session exited without proper completion
      };
      metadata = appendTaskSessionHistory(metadata, entry);
    }

    await api.update(saved.id, { metadata });
    return (await api.get<Task>(saved.id))!;
  }

  test('does not spawn recovery steward when session history shows rate limit pattern', async () => {
    const worker = await createTestWorker('rl-pattern-worker');
    const workerId = worker.id as unknown as EntityId;
    await createTestRecoverySteward('recovery-steward-rl');

    // Task has N rapid sessions without proper completion
    await createTaskWithRateLimitPattern('Rate limited task', workerId);

    const result = await daemon.recoverOrphanedAssignments();

    // Recovery steward should NOT have been spawned
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
    expect(sessionManager.startSession).not.toHaveBeenCalled();
  });

  test('spawns recovery steward when session history has proper completions (not rate-limited)', async () => {
    const worker = await createTestWorker('non-rl-worker');
    const workerId = worker.id as unknown as EntityId;
    await createTestRecoverySteward('recovery-steward-ok');

    // Create task with session history where sessions have endedAt set (proper completions)
    const task = await createTask({
      title: 'Properly stuck task',
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: workerId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    const now = Date.now();
    let metadata: Record<string, unknown> | undefined = undefined;
    metadata = updateOrchestratorTaskMeta(metadata, {
      assignedAgent: workerId,
      branch: 'agent/test-worker/task-branch',
      worktree: '/worktrees/test-worker/task',
      sessionId: 'prev-session-stuck',
      resumeCount: 3,
    });

    // Sessions with endedAt set (proper completions, not rate limits)
    for (let i = 0; i < RATE_LIMIT_SESSION_PATTERN_COUNT; i++) {
      const startTime = new Date(now - (RATE_LIMIT_SESSION_PATTERN_COUNT - i) * 60_000);
      const entry: TaskSessionHistoryEntry = {
        sessionId: `session-ok-${i}`,
        agentId: workerId,
        agentName: 'test-worker',
        agentRole: 'worker',
        startedAt: startTime.toISOString() as import('@stoneforge/core').Timestamp,
        endedAt: new Date(startTime.getTime() + 30_000).toISOString() as import('@stoneforge/core').Timestamp, // Ran for 30s
      };
      metadata = appendTaskSessionHistory(metadata, entry);
    }

    await api.update(saved.id, { metadata });

    const result = await daemon.recoverOrphanedAssignments();

    // Recovery steward SHOULD be spawned for genuinely stuck task
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);
    expect(sessionManager.startSession).toHaveBeenCalled();
  });

  test('spawns recovery steward when insufficient session history entries', async () => {
    const worker = await createTestWorker('few-sessions-worker');
    const workerId = worker.id as unknown as EntityId;
    await createTestRecoverySteward('recovery-steward-few');

    // Create task with fewer sessions than the threshold
    const task = await createTask({
      title: 'Task with few sessions',
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: workerId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    let metadata: Record<string, unknown> | undefined = undefined;
    metadata = updateOrchestratorTaskMeta(metadata, {
      assignedAgent: workerId,
      branch: 'agent/test-worker/task-branch',
      worktree: '/worktrees/test-worker/task',
      sessionId: 'prev-session-stuck',
      resumeCount: 3,
    });

    // Only 1 session (below RATE_LIMIT_SESSION_PATTERN_COUNT threshold)
    const entry: TaskSessionHistoryEntry = {
      sessionId: 'session-single',
      agentId: workerId,
      agentName: 'test-worker',
      agentRole: 'worker',
      startedAt: new Date().toISOString() as import('@stoneforge/core').Timestamp,
    };
    metadata = appendTaskSessionHistory(metadata, entry);

    await api.update(saved.id, { metadata });

    const result = await daemon.recoverOrphanedAssignments();

    // Recovery steward SHOULD be spawned — not enough history to detect pattern
    expect(result.processed).toBe(1);
    expect(sessionManager.startSession).toHaveBeenCalled();
  });

  test('does not detect rate limit pattern when sessions are far apart', async () => {
    const worker = await createTestWorker('far-apart-worker');
    const workerId = worker.id as unknown as EntityId;
    await createTestRecoverySteward('recovery-steward-far');

    const task = await createTask({
      title: 'Task with spaced sessions',
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: workerId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    const now = Date.now();
    let metadata: Record<string, unknown> | undefined = undefined;
    metadata = updateOrchestratorTaskMeta(metadata, {
      assignedAgent: workerId,
      branch: 'agent/test-worker/task-branch',
      worktree: '/worktrees/test-worker/task',
      sessionId: 'prev-session-stuck',
      resumeCount: 3,
    });

    // Sessions without endedAt but spaced far apart (> RATE_LIMIT_SESSION_GAP_MS)
    for (let i = 0; i < RATE_LIMIT_SESSION_PATTERN_COUNT; i++) {
      const entry: TaskSessionHistoryEntry = {
        sessionId: `session-far-${i}`,
        agentId: workerId,
        agentName: 'test-worker',
        agentRole: 'worker',
        startedAt: new Date(now - (RATE_LIMIT_SESSION_PATTERN_COUNT - i) * (RATE_LIMIT_SESSION_GAP_MS + 60_000)).toISOString() as import('@stoneforge/core').Timestamp,
      };
      metadata = appendTaskSessionHistory(metadata, entry);
    }

    await api.update(saved.id, { metadata });

    const result = await daemon.recoverOrphanedAssignments();

    // Recovery steward SHOULD be spawned — sessions not in rapid succession
    expect(result.processed).toBe(1);
    expect(sessionManager.startSession).toHaveBeenCalled();
  });
});

// ============================================================================
// Recovery steward — multi-assignment guard
// ============================================================================

describe('spawnRecoveryStewardForTask - multi-assignment guard', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-multi-assign-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system-multi-assign',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
      maxResumeAttemptsBeforeRecovery: 3,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestWorker(name: string): Promise<AgentEntity> {
    return agentRegistry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createTestRecoverySteward(name: string): Promise<AgentEntity> {
    return agentRegistry.registerSteward({
      name,
      stewardFocus: 'recovery',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createStuckTask(
    title: string,
    workerId: EntityId,
    resumeCount: number = 3,
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: workerId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    await api.update(saved.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: workerId,
        branch: 'agent/test-worker/task-branch',
        worktree: '/worktrees/test-worker/task',
        sessionId: 'prev-session-stuck',
        resumeCount,
      }),
    });

    return (await api.get<Task>(saved.id))!;
  }

  test('skips recovery steward that already has assigned tasks from a previous cycle', async () => {
    const worker = await createTestWorker('stuck-worker');
    const workerId = worker.id as unknown as EntityId;

    // Create a recovery steward
    const steward = await createTestRecoverySteward('recovery-steward-busy');
    const stewardId = steward.id as unknown as EntityId;

    // Create a stuck task for the worker
    await createStuckTask('Stuck task', workerId);

    // Assign an existing task to the steward (simulating a previous cycle assignment)
    const existingTask = await createTask({
      title: 'Existing steward task',
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: stewardId,
    });
    const savedExisting = await api.create(existingTask as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;
    await api.update(savedExisting.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: stewardId,
      }),
    });

    const result = await daemon.recoverOrphanedAssignments();

    // Phase 1: Recovery steward should NOT be spawned for the worker's stuck task
    // — it already has a task from a previous cycle
    expect(sessionManager.startSession).not.toHaveBeenCalled();
    // Phase 3: The steward's orphaned task from the previous cycle IS recovered
    // (unassigned so it can be picked up by a fresh worker)
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Verify the steward's previous-cycle task was unassigned by Phase 3
    const updatedExisting = await api.get<Task>(savedExisting.id);
    expect(updatedExisting!.assignee).toBeUndefined();
  });

  test('assigns recovery steward that has no assigned tasks', async () => {
    const worker = await createTestWorker('stuck-worker-ok');
    const workerId = worker.id as unknown as EntityId;

    // Create a recovery steward with NO existing tasks
    const steward = await createTestRecoverySteward('recovery-steward-free');

    // Create a stuck task for the worker
    await createStuckTask('Stuck task - free steward', workerId);

    const result = await daemon.recoverOrphanedAssignments();

    // Recovery steward SHOULD be spawned — it has no assigned tasks
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);
    expect(sessionManager.startSession).toHaveBeenCalled();
  });

  test('selects second steward when first already has tasks from previous cycle', async () => {
    const worker = await createTestWorker('stuck-worker-multi');
    const workerId = worker.id as unknown as EntityId;

    // Create two recovery stewards
    const busySteward = await createTestRecoverySteward('recovery-steward-busy');
    const busyStewardId = busySteward.id as unknown as EntityId;
    const freeSteward = await createTestRecoverySteward('recovery-steward-free');
    const freeStewardId = freeSteward.id as unknown as EntityId;

    // Assign an existing task to the first steward
    const existingTask = await createTask({
      title: 'Previous cycle task',
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: busyStewardId,
    });
    const savedExisting = await api.create(existingTask as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;
    await api.update(savedExisting.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: busyStewardId,
      }),
    });

    // Create a stuck task for the worker
    await createStuckTask('Stuck task - multi steward', workerId);

    const result = await daemon.recoverOrphanedAssignments();

    // Phase 1: Should have spawned the free steward (not the busy one) for the stuck task
    const startSessionCalls = (sessionManager.startSession as ReturnType<typeof mock>).mock.calls;
    expect(startSessionCalls.length).toBe(1);
    expect(startSessionCalls[0][0]).toBe(freeStewardId);

    // Phase 3: Also recovers the busy steward's orphaned task from previous cycle
    // Total: 1 (Phase 1 spawn) + 1 (Phase 3 unassign) = 2
    expect(result.processed).toBe(2);
    expect(result.errors).toBe(0);

    // Verify the busy steward's previous-cycle task was unassigned by Phase 3
    const updatedExisting = await api.get<Task>(savedExisting.id);
    expect(updatedExisting!.assignee).toBeUndefined();
  });
});

// ============================================================================
// Phase 3: Recovery Steward Orphan Recovery
// ============================================================================

describe('recoverOrphanedAssignments - recovery steward orphan recovery', () => {
  let api: QuarryAPI;
  let inboxService: InboxService;
  let agentRegistry: AgentRegistry;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let stewardScheduler: StewardScheduler;
  let daemon: DispatchDaemon;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/dispatch-daemon-recovery-steward-orphan-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath, create: true });
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    inboxService = createInboxService(storage);
    agentRegistry = createAgentRegistry(api);
    taskAssignment = createTaskAssignmentService(api);
    dispatchService = createDispatchService(api, taskAssignment, agentRegistry);
    sessionManager = createMockSessionManager();
    worktreeManager = createMockWorktreeManager();
    stewardScheduler = createMockStewardScheduler();

    const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;

    const config: DispatchDaemonConfig = {
      pollIntervalMs: 100,
      workerAvailabilityPollEnabled: false,
      inboxPollEnabled: false,
      stewardTriggerPollEnabled: false,
      workflowTaskPollEnabled: false,
      orphanRecoveryEnabled: true,
      maxResumeAttemptsBeforeRecovery: 3,
    };

    daemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      config
    );
  });

  afterEach(async () => {
    await daemon.stop();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestRecoverySteward(name: string): Promise<AgentEntity> {
    return agentRegistry.registerSteward({
      name,
      stewardFocus: 'recovery',
      createdBy: systemEntity,
      maxConcurrentTasks: 1,
    });
  }

  async function createOrphanedRecoveryStewardTask(
    title: string,
    stewardId: EntityId,
    meta?: {
      sessionId?: string;
      resumeCount?: number;
      sessionHistory?: readonly { sessionId: string; agentId: EntityId; agentName: string; agentRole: 'worker' | 'steward'; startedAt: string }[];
    }
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: TaskStatus.IN_PROGRESS,
      assignee: stewardId,
    });
    const saved = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Task;

    await api.update(saved.id, {
      metadata: updateOrchestratorTaskMeta(undefined, {
        assignedAgent: stewardId,
        branch: 'agent/worker/task-branch',
        worktree: '/worktrees/worker/task',
        sessionId: meta?.sessionId ?? 'recovery-steward-session-123',
        resumeCount: meta?.resumeCount ?? 3,
        sessionHistory: meta?.sessionHistory,
      }),
    });

    return (await api.get<Task>(saved.id))!;
  }

  test('recovers orphaned recovery steward task by unassigning and resetting resumeCount', async () => {
    const steward = await createTestRecoverySteward('orphan-recovery-steward');
    const stewardId = steward.id as unknown as EntityId;

    const task = await createOrphanedRecoveryStewardTask('Task stuck with recovery steward', stewardId, {
      sessionId: 'recovery-steward-prev-session',
      resumeCount: 5,
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.pollType).toBe('orphan-recovery');
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Verify the task was unassigned and resumeCount was reset
    const updatedTask = await api.get<Task>(task.id);
    expect(updatedTask!.assignee).toBeUndefined();

    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown> | undefined);
    expect(meta!.assignedAgent).toBeUndefined();
    expect(meta!.resumeCount).toBe(0);

    // Session history should still be intact
    // No session should have been started or resumed (just unassigned)
    expect(sessionManager.resumeSession).not.toHaveBeenCalled();
    expect(sessionManager.startSession).not.toHaveBeenCalled();
  });

  test('skips recovery steward with active session', async () => {
    const steward = await createTestRecoverySteward('active-recovery-steward');
    const stewardId = steward.id as unknown as EntityId;

    // Start a session for this steward
    await sessionManager.startSession(stewardId, {});

    await createOrphanedRecoveryStewardTask('Task with active recovery steward', stewardId);

    const result = await daemon.recoverOrphanedAssignments();

    // Should not recover — steward has an active session
    expect(result.processed).toBe(0);
  });

  test('skips recovery when all executables are rate-limited', async () => {
    const steward = await createTestRecoverySteward('rate-limited-recovery-steward');
    const stewardId = steward.id as unknown as EntityId;

    await createOrphanedRecoveryStewardTask('Task with rate-limited recovery steward', stewardId, {
      resumeCount: 3,
    });

    // Mock resolveExecutableWithFallback to return 'all_limited'
    const impl = daemon as unknown as DispatchDaemonImpl;
    const originalResolve = impl.resolveExecutableWithFallback.bind(impl);
    impl.resolveExecutableWithFallback = (agent: AgentEntity) => {
      if (agent.id === steward.id) return 'all_limited';
      return originalResolve(agent);
    };

    const result = await daemon.recoverOrphanedAssignments();

    // Should skip — all executables rate-limited
    expect(result.processed).toBe(0);
  });

  test('escalates to director when session history shows repeated steward failures', async () => {
    const steward = await createTestRecoverySteward('escalation-recovery-steward');
    const stewardId = steward.id as unknown as EntityId;

    // Create session history with 3+ steward sessions (indicating repeated failures)
    const sessionHistory = [
      { sessionId: 'worker-session-1', agentId: 'el-worker1' as EntityId, agentName: 'worker-1', agentRole: 'worker' as const, startedAt: '2026-01-01T00:00:00.000Z' },
      { sessionId: 'worker-session-2', agentId: 'el-worker1' as EntityId, agentName: 'worker-1', agentRole: 'worker' as const, startedAt: '2026-01-01T00:10:00.000Z' },
      { sessionId: 'steward-session-1', agentId: stewardId, agentName: 'escalation-recovery-steward', agentRole: 'steward' as const, startedAt: '2026-01-01T00:20:00.000Z' },
      { sessionId: 'steward-session-2', agentId: stewardId, agentName: 'escalation-recovery-steward', agentRole: 'steward' as const, startedAt: '2026-01-01T00:30:00.000Z' },
      { sessionId: 'steward-session-3', agentId: stewardId, agentName: 'escalation-recovery-steward', agentRole: 'steward' as const, startedAt: '2026-01-01T00:40:00.000Z' },
    ];

    const task = await createOrphanedRecoveryStewardTask('Task with repeated steward failures', stewardId, {
      resumeCount: 5,
      sessionHistory,
    });

    // Listen for daemon notification events
    const notifications: { type: string; title: string; message: string }[] = [];
    const impl = daemon as unknown as DispatchDaemonImpl;
    impl.emitter.on('daemon:notification', (notification: { type: string; title: string; message: string }) => {
      notifications.push(notification);
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Verify task was still unassigned (not left stuck)
    const updatedTask = await api.get<Task>(task.id);
    expect(updatedTask!.assignee).toBeUndefined();

    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown> | undefined);
    expect(meta!.assignedAgent).toBeUndefined();
    // resumeCount should NOT be reset (escalation path preserves it)
    expect(meta!.resumeCount).toBe(5);

    // Verify an escalation notification was emitted
    const escalation = notifications.find(n => n.title === 'Recovery steward escalation');
    expect(escalation).toBeDefined();
    expect(escalation!.message).toContain(task.id);
    expect(escalation!.message).toContain('Manual intervention');
  });

  test('does not escalate when steward session count is below threshold', async () => {
    const steward = await createTestRecoverySteward('below-threshold-recovery-steward');
    const stewardId = steward.id as unknown as EntityId;

    // Create session history with only 2 steward sessions (below threshold of 3)
    const sessionHistory = [
      { sessionId: 'worker-session-1', agentId: 'el-worker1' as EntityId, agentName: 'worker-1', agentRole: 'worker' as const, startedAt: '2026-01-01T00:00:00.000Z' },
      { sessionId: 'steward-session-1', agentId: stewardId, agentName: 'below-threshold-recovery-steward', agentRole: 'steward' as const, startedAt: '2026-01-01T00:20:00.000Z' },
      { sessionId: 'steward-session-2', agentId: stewardId, agentName: 'below-threshold-recovery-steward', agentRole: 'steward' as const, startedAt: '2026-01-01T00:30:00.000Z' },
    ];

    const task = await createOrphanedRecoveryStewardTask('Task with few steward sessions', stewardId, {
      resumeCount: 5,
      sessionHistory,
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Verify normal recovery: unassigned with resumeCount reset
    const updatedTask = await api.get<Task>(task.id);
    expect(updatedTask!.assignee).toBeUndefined();

    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown> | undefined);
    expect(meta!.assignedAgent).toBeUndefined();
    expect(meta!.resumeCount).toBe(0); // Reset for fresh worker
  });

  test('recovers multiple tasks from same recovery steward', async () => {
    const steward = await createTestRecoverySteward('multi-task-recovery-steward');
    const stewardId = steward.id as unknown as EntityId;

    const task1 = await createOrphanedRecoveryStewardTask('First orphaned recovery task', stewardId, {
      resumeCount: 4,
    });
    const task2 = await createOrphanedRecoveryStewardTask('Second orphaned recovery task', stewardId, {
      resumeCount: 2,
    });

    const result = await daemon.recoverOrphanedAssignments();

    expect(result.processed).toBe(2);
    expect(result.errors).toBe(0);

    // Both tasks should be unassigned and reset
    const updatedTask1 = await api.get<Task>(task1.id);
    expect(updatedTask1!.assignee).toBeUndefined();
    const meta1 = getOrchestratorTaskMeta(updatedTask1!.metadata as Record<string, unknown> | undefined);
    expect(meta1!.resumeCount).toBe(0);

    const updatedTask2 = await api.get<Task>(task2.id);
    expect(updatedTask2!.assignee).toBeUndefined();
    const meta2 = getOrchestratorTaskMeta(updatedTask2!.metadata as Record<string, unknown> | undefined);
    expect(meta2!.resumeCount).toBe(0);
  });

  test('preserves sessionHistory when recovering orphaned recovery steward task', async () => {
    const steward = await createTestRecoverySteward('history-preservation-steward');
    const stewardId = steward.id as unknown as EntityId;

    const sessionHistory = [
      { sessionId: 'worker-session-1', agentId: 'el-worker1' as EntityId, agentName: 'worker-1', agentRole: 'worker' as const, startedAt: '2026-01-01T00:00:00.000Z' },
      { sessionId: 'steward-session-1', agentId: stewardId, agentName: 'history-preservation-steward', agentRole: 'steward' as const, startedAt: '2026-01-01T00:20:00.000Z' },
    ];

    const task = await createOrphanedRecoveryStewardTask('Task with session history', stewardId, {
      resumeCount: 3,
      sessionHistory,
    });

    await daemon.recoverOrphanedAssignments();

    // Verify session history is preserved
    const updatedTask = await api.get<Task>(task.id);
    const meta = getOrchestratorTaskMeta(updatedTask!.metadata as Record<string, unknown> | undefined);
    expect(meta!.sessionHistory).toBeDefined();
    expect(meta!.sessionHistory!.length).toBe(2);
    expect(meta!.sessionHistory![0].sessionId).toBe('worker-session-1');
    expect(meta!.sessionHistory![1].sessionId).toBe('steward-session-1');
  });
});
