/**
 * Diagnostics Routes Tests
 *
 * Tests for GET /api/health/diagnostics endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Services } from '../services.js';
import { createDiagnosticsRoutes } from './diagnostics.js';

// ============================================================================
// Mock Services Factory
// ============================================================================

function createMockServices(overrides: Partial<MockOverrides> = {}) {
  const dispatchDaemon = overrides.dispatchDaemon === null
    ? undefined
    : {
        isRunning: vi.fn().mockReturnValue(true),
        getRateLimitStatus: vi.fn().mockReturnValue(
          overrides.rateLimitStatus ?? {
            isPaused: false,
            limits: [],
            soonestReset: undefined,
          }
        ),
      };

  const sessionManager = {
    getActiveSession: vi.fn().mockReturnValue(overrides.activeSession ?? undefined),
    listSessions: vi.fn().mockReturnValue([]),
  };

  const agentRegistry = {
    listAgents: vi.fn().mockResolvedValue(overrides.agents ?? []),
  };

  const api = {
    list: vi.fn().mockResolvedValue(overrides.tasks ?? []),
  };

  const storageBackend = {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('operation_log')) {
        if (sql.includes('1 hour') || sql.includes('60 * 60')) {
          return [{ count: overrides.errorLastHour ?? 0 }];
        }
        return [{ count: overrides.errorLastDay ?? 0 }];
      }
      return [];
    }),
  };

  // More specific mock for operation_log queries
  if (overrides.errorLastHour !== undefined || overrides.errorLastDay !== undefined) {
    let callCount = 0;
    storageBackend.query = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return [{ count: overrides.errorLastHour ?? 0 }];
      }
      return [{ count: overrides.errorLastDay ?? 0 }];
    });
  }

  return {
    api,
    agentRegistry,
    sessionManager,
    dispatchDaemon,
    storageBackend,
  } as unknown as Services;
}

interface MockOverrides {
  dispatchDaemon: null | undefined;
  rateLimitStatus: {
    isPaused: boolean;
    limits: Array<{ executable: string; resetsAt: string }>;
    soonestReset?: string;
  };
  activeSession: { id: string; status: string; startedAt: string } | undefined;
  agents: Array<{
    id: string;
    name: string;
    metadata: { agent: { agentRole: string } };
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    metadata?: Record<string, unknown>;
    updatedAt?: string;
  }>;
  errorLastHour: number;
  errorLastDay: number;
}

// ============================================================================
// Tests
// ============================================================================

describe('GET /api/health/diagnostics', () => {
  let services: Services;

  beforeEach(() => {
    services = createMockServices();
  });

  it('returns 200 with diagnostics data', async () => {
    const app = createDiagnosticsRoutes(services);
    const res = await app.request('/api/health/diagnostics');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timestamp).toBeDefined();
    expect(body.rateLimits).toBeDefined();
    expect(body.stuckTasks).toBeDefined();
    expect(body.mergeQueue).toBeDefined();
    expect(body.errorRate).toBeDefined();
    expect(body.agentPool).toBeDefined();
  });

  describe('rate limits', () => {
    it('returns empty limits when no daemon', async () => {
      services = createMockServices({ dispatchDaemon: null });
      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.rateLimits.isPaused).toBe(false);
      expect(body.rateLimits.limits).toEqual([]);
    });

    it('returns active rate limits', async () => {
      const resetTime = new Date(Date.now() + 3600000).toISOString();
      services = createMockServices({
        rateLimitStatus: {
          isPaused: true,
          limits: [{ executable: 'claude', resetsAt: resetTime }],
          soonestReset: resetTime,
        },
      });

      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.rateLimits.isPaused).toBe(true);
      expect(body.rateLimits.limits).toHaveLength(1);
      expect(body.rateLimits.limits[0].executable).toBe('claude');
      expect(body.rateLimits.soonestReset).toBe(resetTime);
    });
  });

  describe('stuck tasks', () => {
    it('returns empty when no stuck tasks', async () => {
      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.stuckTasks).toEqual([]);
    });

    it('identifies stuck tasks with high resume count and no active session', async () => {
      services = createMockServices({
        tasks: [
          {
            id: 'el-stuck1',
            title: 'Stuck task',
            status: 'in_progress',
            metadata: {
              orchestrator: {
                assignedAgent: 'el-worker1',
                resumeCount: 3,
              },
            },
          },
        ],
      });

      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.stuckTasks).toHaveLength(1);
      expect(body.stuckTasks[0].taskId).toBe('el-stuck1');
      expect(body.stuckTasks[0].resumeCount).toBe(3);
    });

    it('does not flag tasks with active sessions', async () => {
      services = createMockServices({
        tasks: [
          {
            id: 'el-active1',
            title: 'Active task',
            status: 'in_progress',
            metadata: {
              orchestrator: {
                assignedAgent: 'el-worker1',
                resumeCount: 5,
              },
            },
          },
        ],
        activeSession: { id: 'session-1', status: 'running', startedAt: new Date().toISOString() },
      });

      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.stuckTasks).toHaveLength(0);
    });

    it('does not flag tasks with low resume count', async () => {
      services = createMockServices({
        tasks: [
          {
            id: 'el-low',
            title: 'Low resume task',
            status: 'in_progress',
            metadata: {
              orchestrator: {
                assignedAgent: 'el-worker1',
                resumeCount: 1,
              },
            },
          },
        ],
      });

      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.stuckTasks).toHaveLength(0);
    });
  });

  describe('merge queue', () => {
    it('returns zero counts when no review tasks', async () => {
      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.mergeQueue.awaitingMergeCount).toBe(0);
      expect(body.mergeQueue.stuckInTestingCount).toBe(0);
      expect(body.mergeQueue.stuckInMergingCount).toBe(0);
      expect(body.mergeQueue.stuckTasks).toEqual([]);
    });

    it('counts tasks awaiting merge', async () => {
      services = createMockServices({
        tasks: [
          {
            id: 'el-review1',
            title: 'Review task',
            status: 'review',
            metadata: { orchestrator: { mergeStatus: 'pending' } },
          },
        ],
      });

      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.mergeQueue.awaitingMergeCount).toBe(1);
    });

    it('identifies tasks stuck in testing', async () => {
      const oldTime = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 mins ago
      services = createMockServices({
        tasks: [
          {
            id: 'el-testing1',
            title: 'Testing task',
            status: 'review',
            metadata: { orchestrator: { mergeStatus: 'testing' } },
            updatedAt: oldTime,
          },
        ],
      });

      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.mergeQueue.stuckInTestingCount).toBe(1);
      expect(body.mergeQueue.stuckTasks).toHaveLength(1);
      expect(body.mergeQueue.stuckTasks[0].mergeStatus).toBe('testing');
    });

    it('identifies tasks stuck in merging', async () => {
      const oldTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      services = createMockServices({
        tasks: [
          {
            id: 'el-merging1',
            title: 'Merging task',
            status: 'review',
            metadata: { orchestrator: { mergeStatus: 'merging' } },
            updatedAt: oldTime,
          },
        ],
      });

      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.mergeQueue.stuckInMergingCount).toBe(1);
    });
  });

  describe('error rate', () => {
    it('returns zero counts when no errors', async () => {
      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.errorRate.lastHourCount).toBe(0);
      expect(body.errorRate.lastDayCount).toBe(0);
    });

    it('returns error counts from operation_log', async () => {
      services = createMockServices({
        errorLastHour: 10,
        errorLastDay: 50,
      });

      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.errorRate.lastHourCount).toBe(10);
      expect(body.errorRate.lastDayCount).toBe(50);
    });
  });

  describe('agent pool', () => {
    it('returns zero counts when no agents', async () => {
      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.agentPool.totalAgents).toBe(0);
      expect(body.agentPool.idleAgents).toBe(0);
      expect(body.agentPool.busyAgents).toBe(0);
      expect(body.agentPool.utilizationPercent).toBe(0);
      expect(body.agentPool.sessions).toEqual([]);
    });

    it('counts idle and busy agents', async () => {
      const mockSessionManager = {
        getActiveSession: vi.fn().mockImplementation((agentId: string) => {
          if (agentId === 'el-busy') {
            return {
              id: 'session-1',
              status: 'running',
              startedAt: new Date(Date.now() - 60000).toISOString(),
            };
          }
          return undefined;
        }),
      };

      services = createMockServices({
        agents: [
          {
            id: 'el-busy',
            name: 'busy-worker',
            metadata: { agent: { agentRole: 'worker' } },
          },
          {
            id: 'el-idle',
            name: 'idle-worker',
            metadata: { agent: { agentRole: 'worker' } },
          },
        ],
      });

      // Override the session manager
      (services as unknown as { sessionManager: typeof mockSessionManager }).sessionManager = mockSessionManager;

      const app = createDiagnosticsRoutes(services);
      const res = await app.request('/api/health/diagnostics');
      const body = await res.json();

      expect(body.agentPool.totalAgents).toBe(2);
      expect(body.agentPool.busyAgents).toBe(1);
      expect(body.agentPool.idleAgents).toBe(1);
      expect(body.agentPool.utilizationPercent).toBe(50);
      expect(body.agentPool.sessions).toHaveLength(1);
      expect(body.agentPool.sessions[0].agentName).toBe('busy-worker');
    });
  });

  it('returns 500 when diagnostics collection fails', async () => {
    // Make api.list throw
    (services.api.list as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB connection lost')
    );

    const app = createDiagnosticsRoutes(services);
    const res = await app.request('/api/health/diagnostics');

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to collect diagnostics');
  });
});
