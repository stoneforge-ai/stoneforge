/**
 * Diagnostics Routes
 *
 * Provides runtime diagnostics for the orchestration system.
 * Used by `sf doctor` to display runtime health information.
 */

import { Hono } from 'hono';
import type { Services } from '../services.js';
import type { StorageBackend } from '@stoneforge/storage';
import { getOrchestratorTaskMeta } from '../../types/task-meta.js';
import type { EntityId, Task } from '@stoneforge/core';
import { TaskStatus } from '@stoneforge/core';
import { getAgentMetadata } from '../../services/agent-registry.js';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitDiagnostic {
  executable: string;
  resetsAt: string;
}

export interface StuckTaskDiagnostic {
  taskId: string;
  title: string;
  status: string;
  assignee?: string;
  resumeCount: number;
  mergeStatus?: string;
}

export interface MergeQueueDiagnostic {
  awaitingMergeCount: number;
  stuckInTestingCount: number;
  stuckInMergingCount: number;
  stuckTasks: Array<{
    taskId: string;
    title: string;
    mergeStatus: string;
    updatedAt: string;
  }>;
}

export interface ErrorRateDiagnostic {
  lastHourCount: number;
  lastDayCount: number;
}

export interface AgentPoolDiagnostic {
  totalAgents: number;
  idleAgents: number;
  busyAgents: number;
  utilizationPercent: number;
  sessions: Array<{
    agentId: string;
    agentName: string;
    role: string;
    sessionId: string;
    durationMs: number;
  }>;
}

export interface DiagnosticsResponse {
  timestamp: string;
  rateLimits: {
    isPaused: boolean;
    limits: RateLimitDiagnostic[];
    soonestReset?: string;
  };
  stuckTasks: StuckTaskDiagnostic[];
  mergeQueue: MergeQueueDiagnostic;
  errorRate: ErrorRateDiagnostic;
  agentPool: AgentPoolDiagnostic;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Stuck merge threshold: tasks in 'testing' or 'merging' for longer than this are flagged.
 * Default: 10 minutes.
 */
const STUCK_MERGE_THRESHOLD_MS = 10 * 60 * 1000;

// ============================================================================
// Route Factory
// ============================================================================

export function createDiagnosticsRoutes(services: Services) {
  const app = new Hono();

  app.get('/api/health/diagnostics', async (c) => {
    try {
      const diagnostics = await collectDiagnostics(services);
      return c.json(diagnostics);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to collect diagnostics: ${message}` }, 500);
    }
  });

  return app;
}

// ============================================================================
// Diagnostics Collection
// ============================================================================

async function collectDiagnostics(services: Services): Promise<DiagnosticsResponse> {
  const [rateLimits, stuckTasks, mergeQueue, errorRate, agentPool] = await Promise.all([
    collectRateLimits(services),
    collectStuckTasks(services),
    collectMergeQueue(services),
    collectErrorRate(services.storageBackend),
    collectAgentPool(services),
  ]);

  return {
    timestamp: new Date().toISOString(),
    rateLimits,
    stuckTasks,
    mergeQueue,
    errorRate,
    agentPool,
  };
}

// ============================================================================
// Rate Limit Diagnostics
// ============================================================================

function collectRateLimits(services: Services): DiagnosticsResponse['rateLimits'] {
  if (!services.dispatchDaemon) {
    return { isPaused: false, limits: [] };
  }

  const status = services.dispatchDaemon.getRateLimitStatus();
  return {
    isPaused: status.isPaused,
    limits: status.limits.map((l) => ({
      executable: l.executable,
      resetsAt: l.resetsAt,
    })),
    soonestReset: status.soonestReset,
  };
}

// ============================================================================
// Stuck Tasks Diagnostics
// ============================================================================

async function collectStuckTasks(services: Services): Promise<StuckTaskDiagnostic[]> {
  const stuckTasks: StuckTaskDiagnostic[] = [];

  // Get all tasks and filter by status in memory
  const allTasks = await services.api.list<Task>({ type: 'task' });

  const candidateTasks = allTasks.filter(
    (t) => t.status === TaskStatus.IN_PROGRESS || t.status === TaskStatus.REVIEW
  );

  for (const task of candidateTasks) {
    const meta = getOrchestratorTaskMeta(task.metadata);
    if (!meta) continue;

    const resumeCount = meta.resumeCount ?? 0;

    // Check if there is no active session for this task's assigned agent
    if (meta.assignedAgent && resumeCount >= 2) {
      const activeSession = services.sessionManager.getActiveSession(
        meta.assignedAgent as EntityId
      );

      if (!activeSession) {
        stuckTasks.push({
          taskId: task.id,
          title: task.title || task.id,
          status: task.status,
          assignee: meta.assignedAgent,
          resumeCount,
          mergeStatus: meta.mergeStatus,
        });
      }
    }
  }

  return stuckTasks;
}

// ============================================================================
// Merge Queue Diagnostics
// ============================================================================

async function collectMergeQueue(services: Services): Promise<MergeQueueDiagnostic> {
  // Get all tasks and filter by REVIEW status
  const allTasks = await services.api.list<Task>({ type: 'task' });
  const reviewTasks = allTasks.filter((t) => t.status === TaskStatus.REVIEW);

  let awaitingMergeCount = 0;
  let stuckInTestingCount = 0;
  let stuckInMergingCount = 0;
  const stuckTasks: MergeQueueDiagnostic['stuckTasks'] = [];

  const now = Date.now();

  for (const task of reviewTasks) {
    const meta = getOrchestratorTaskMeta(task.metadata);
    const mergeStatus = meta?.mergeStatus || 'pending';

    if (mergeStatus === 'pending') {
      awaitingMergeCount++;
    }

    // Check if stuck in testing or merging
    const updatedAt = task.updatedAt
      ? new Date(task.updatedAt).getTime()
      : 0;

    const timeSinceUpdate = now - updatedAt;

    if (mergeStatus === 'testing' && timeSinceUpdate > STUCK_MERGE_THRESHOLD_MS) {
      stuckInTestingCount++;
      stuckTasks.push({
        taskId: task.id,
        title: task.title || task.id,
        mergeStatus,
        updatedAt: task.updatedAt || '',
      });
    }

    if (mergeStatus === 'merging' && timeSinceUpdate > STUCK_MERGE_THRESHOLD_MS) {
      stuckInMergingCount++;
      stuckTasks.push({
        taskId: task.id,
        title: task.title || task.id,
        mergeStatus,
        updatedAt: task.updatedAt || '',
      });
    }
  }

  return {
    awaitingMergeCount,
    stuckInTestingCount,
    stuckInMergingCount,
    stuckTasks,
  };
}

// ============================================================================
// Error Rate Diagnostics
// ============================================================================

function collectErrorRate(storage: StorageBackend): ErrorRateDiagnostic {
  const now = new Date();

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Query operation_log for error counts
  try {
    const lastHourResult = storage.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM operation_log WHERE level = 'error' AND timestamp >= ?`,
      [oneHourAgo]
    );

    const lastDayResult = storage.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM operation_log WHERE level = 'error' AND timestamp >= ?`,
      [oneDayAgo]
    );

    return {
      lastHourCount: lastHourResult[0]?.count ?? 0,
      lastDayCount: lastDayResult[0]?.count ?? 0,
    };
  } catch {
    // operation_log table might not exist
    return { lastHourCount: 0, lastDayCount: 0 };
  }
}

// ============================================================================
// Agent Pool Diagnostics
// ============================================================================

async function collectAgentPool(services: Services): Promise<AgentPoolDiagnostic> {
  const agents = await services.agentRegistry.listAgents();

  let busyAgents = 0;
  let idleAgents = 0;
  const sessions: AgentPoolDiagnostic['sessions'] = [];

  const now = Date.now();

  for (const agent of agents) {
    const agentId = agent.id as unknown as EntityId;
    const activeSession = services.sessionManager.getActiveSession(agentId);
    const meta = getAgentMetadata(agent);

    if (activeSession && activeSession.status === 'running') {
      busyAgents++;
      const startedAt = activeSession.startedAt
        ? new Date(activeSession.startedAt).getTime()
        : now;
      sessions.push({
        agentId: agent.id,
        agentName: agent.name || agent.id,
        role: meta?.agentRole || 'unknown',
        sessionId: activeSession.id,
        durationMs: now - startedAt,
      });
    } else {
      idleAgents++;
    }
  }

  const totalAgents = agents.length;
  const utilizationPercent = totalAgents > 0
    ? Math.round((busyAgents / totalAgents) * 100)
    : 0;

  return {
    totalAgents,
    idleAgents,
    busyAgents,
    utilizationPercent,
    sessions,
  };
}
