/**
 * Task Routes Tests — Reset Endpoint Session Termination
 *
 * Tests that the POST /api/tasks/:id/reset endpoint terminates
 * any active session for the assigned agent before clearing state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTimestamp, Priority, Complexity, TaskStatus } from '@stoneforge/core';
import type { Task, ElementId, EntityId } from '@stoneforge/core';
import type { Services } from '../services.js';
import { createTaskRoutes } from './tasks.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001' as ElementId,
    type: 'task',
    title: 'Test Task',
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.MEDIUM,
    complexity: Complexity.MEDIUM,
    tags: [],
    assignee: 'agent-worker-001' as EntityId,
    createdBy: 'user-001' as EntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    version: 1,
    metadata: {
      orchestrator: {
        branch: 'agent/worker/task-001',
        worktree: '/path/to/worktree',
        sessionId: 'session-001',
        startedAt: createTimestamp(),
        reconciliationCount: 0,
      },
    },
    ...overrides,
  } as Task;
}

// ============================================================================
// Mock Services Factory
// ============================================================================

function createMockServices() {
  const api = {
    get: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getDependencies: vi.fn().mockResolvedValue([]),
    getDependents: vi.fn().mockResolvedValue([]),
  };

  const sessionManager = {
    getActiveSession: vi.fn(),
    stopSession: vi.fn().mockResolvedValue(undefined),
    startSession: vi.fn(),
    resumeSession: vi.fn(),
    suspendSession: vi.fn(),
    interruptSession: vi.fn(),
    getSession: vi.fn(),
    listSessions: vi.fn(),
    getMostRecentResumableSession: vi.fn(),
    getSessionHistory: vi.fn(),
  };

  const storageBackend = {
    query: vi.fn().mockReturnValue([]),
  };

  const services = {
    api,
    agentRegistry: {
      getAgent: vi.fn(),
      listAgents: vi.fn(),
      getAgentsByRole: vi.fn(),
      getAvailableWorkers: vi.fn(),
      updateAgentStatus: vi.fn(),
    },
    taskAssignmentService: {
      getUnassignedTasks: vi.fn(),
      getAgentTasks: vi.fn(),
    },
    dispatchService: {},
    workerTaskService: {
      startWorkerOnTask: vi.fn(),
      completeTask: vi.fn(),
      getTaskContext: vi.fn(),
      buildTaskContextPrompt: vi.fn(),
      cleanupTask: vi.fn(),
    },
    storageBackend,
    sessionManager,
  } as unknown as Services;

  return { services, api, sessionManager, storageBackend };
}

// ============================================================================
// Tests
// ============================================================================

describe('POST /api/tasks/:id/reset — session termination', () => {
  let services: Services;
  let api: ReturnType<typeof createMockServices>['api'];
  let sessionManager: ReturnType<typeof createMockServices>['sessionManager'];

  beforeEach(() => {
    const mocks = createMockServices();
    services = mocks.services;
    api = mocks.api;
    sessionManager = mocks.sessionManager;
  });

  it('terminates active session before resetting task', async () => {
    const task = createMockTask();
    const activeSession = { id: 'session-001', agentId: 'agent-worker-001', status: 'running' };

    api.get.mockResolvedValue(task);
    api.update.mockResolvedValue(task);
    sessionManager.getActiveSession.mockReturnValue(activeSession);

    const app = createTaskRoutes(services);

    const res = await app.request('/api/tasks/task-001/reset', { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Session manager should have been called to find and stop the session
    expect(sessionManager.getActiveSession).toHaveBeenCalledWith('agent-worker-001');
    expect(sessionManager.stopSession).toHaveBeenCalledWith('session-001', {
      graceful: true,
      reason: 'Task was reset',
    });
  });

  it('proceeds with reset when no active session exists', async () => {
    const task = createMockTask();

    api.get.mockResolvedValue(task);
    api.update.mockResolvedValue(task);
    sessionManager.getActiveSession.mockReturnValue(undefined);

    const app = createTaskRoutes(services);

    const res = await app.request('/api/tasks/task-001/reset', { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Should check for active session but not attempt to stop
    expect(sessionManager.getActiveSession).toHaveBeenCalledWith('agent-worker-001');
    expect(sessionManager.stopSession).not.toHaveBeenCalled();
  });

  it('continues with reset even if session termination fails', async () => {
    const task = createMockTask();
    const activeSession = { id: 'session-001', agentId: 'agent-worker-001', status: 'running' };

    api.get.mockResolvedValue(task);
    api.update.mockResolvedValue(task);
    sessionManager.getActiveSession.mockReturnValue(activeSession);
    sessionManager.stopSession.mockRejectedValue(new Error('Session already terminated'));

    const app = createTaskRoutes(services);

    const res = await app.request('/api/tasks/task-001/reset', { method: 'POST' });
    const body = await res.json();

    // Reset should succeed even though session stop failed
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Session termination was attempted
    expect(sessionManager.stopSession).toHaveBeenCalledWith('session-001', {
      graceful: true,
      reason: 'Task was reset',
    });
  });

  it('skips session termination when task has no assignee', async () => {
    // Task with no assignee but in_progress status (edge case)
    const task = createMockTask({
      assignee: undefined,
      status: TaskStatus.IN_PROGRESS,
    });

    api.get.mockResolvedValue(task);
    api.update.mockResolvedValue(task);

    const app = createTaskRoutes(services);

    const res = await app.request('/api/tasks/task-001/reset', { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Should not attempt session termination without assignee
    expect(sessionManager.getActiveSession).not.toHaveBeenCalled();
    expect(sessionManager.stopSession).not.toHaveBeenCalled();
  });

  it('rejects reset for tasks that cannot be reset', async () => {
    const task = createMockTask({
      assignee: undefined,
      status: TaskStatus.OPEN,
    });

    api.get.mockResolvedValue(task);

    const app = createTaskRoutes(services);

    const res = await app.request('/api/tasks/task-001/reset', { method: 'POST' });

    expect(res.status).toBe(400);

    // Should not attempt session termination
    expect(sessionManager.getActiveSession).not.toHaveBeenCalled();
  });

  it('returns 404 for non-existent task', async () => {
    api.get.mockResolvedValue(null);

    const app = createTaskRoutes(services);

    const res = await app.request('/api/tasks/task-999/reset', { method: 'POST' });

    expect(res.status).toBe(404);

    // Should not attempt session termination
    expect(sessionManager.getActiveSession).not.toHaveBeenCalled();
  });
});
