/**
 * Session Routes - Rate Limit Guard Tests
 *
 * Tests that POST /api/agents/:id/start and POST /api/agents/:id/resume
 * return HTTP 429 with Retry-After header when all executables are rate-limited.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Hono } from 'hono';
import type { EntityId } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import type { SessionRecord } from '@stoneforge/smithy';
import { createSessionRoutes } from './sessions.js';
import type { Services } from '../services.js';

// ============================================================================
// Minimal mock factories
// ============================================================================

function createMockServices(overrides?: {
  rateLimitPaused?: boolean;
  soonestReset?: string;
}): Services {
  const isPaused = overrides?.rateLimitPaused ?? false;
  const soonestReset = overrides?.soonestReset;

  const mockAgent = {
    id: 'agent-test-123',
    name: 'test-worker',
    metadata: { agent: { agentRole: 'worker', workerMode: 'ephemeral' } },
  };

  return {
    api: {
      get: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    orchestratorApi: {
      assignTaskToAgent: vi.fn(async () => ({})),
    },
    agentRegistry: {
      getAgent: vi.fn(async () => mockAgent),
      getDirector: vi.fn(async () => ({ id: 'director-123' })),
      listAgents: vi.fn(async () => []),
    },
    sessionManager: {
      getActiveSession: vi.fn(() => null),
      startSession: vi.fn(async (agentId: EntityId) => {
        const session: SessionRecord = {
          id: `session-${Date.now()}`,
          agentId,
          agentRole: 'worker',
          workerMode: 'ephemeral',
          mode: 'headless',
          status: 'running',
          workingDirectory: '/tmp/test',
          createdAt: createTimestamp(),
          startedAt: createTimestamp(),
          lastActivityAt: createTimestamp(),
        };
        return { session, events: new EventEmitter() };
      }),
      resumeSession: vi.fn(async (agentId: EntityId) => {
        const session: SessionRecord = {
          id: `session-${Date.now()}`,
          agentId,
          agentRole: 'worker',
          workerMode: 'ephemeral',
          mode: 'headless',
          status: 'running',
          workingDirectory: '/tmp/test',
          createdAt: createTimestamp(),
          startedAt: createTimestamp(),
          lastActivityAt: createTimestamp(),
          providerSessionId: 'provider-123',
        };
        return { session, events: new EventEmitter(), uwpCheck: undefined };
      }),
      getMostRecentResumableSession: vi.fn(() => ({
        id: 'session-resumable',
        providerSessionId: 'provider-123',
      })),
      getSession: vi.fn(() => undefined),
      listSessions: vi.fn(() => []),
      getSessionHistory: vi.fn(async () => []),
    },
    spawnerService: {},
    worktreeManager: undefined,
    taskAssignmentService: {},
    dispatchService: {},
    roleDefinitionService: {},
    workerTaskService: {},
    stewardScheduler: {},
    pluginExecutor: {},
    poolService: undefined,
    inboxService: {},
    mergeStewardService: {},
    docsStewardService: {},
    dispatchDaemon: {
      getRateLimitStatus: vi.fn(() => ({
        isPaused,
        limits: isPaused ? [{ executable: 'claude', resetsAt: soonestReset ?? new Date(Date.now() + 60_000).toISOString() }] : [],
        soonestReset,
      })),
      // Satisfy the DispatchDaemon interface enough to avoid type errors
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      isRunning: vi.fn(() => false),
    },
    sessionInitialPrompts: new Map<string, string>(),
    sessionMessageService: {
      saveMessage: vi.fn(() => {}),
      getSessionMessages: vi.fn(() => []),
      getLatestDisplayableMessages: vi.fn(() => new Map()),
    },
    storageBackend: {},
  } as unknown as Services;
}

// ============================================================================
// Tests
// ============================================================================

describe('Session Routes - Rate Limit Guard', () => {
  describe('POST /api/agents/:id/start', () => {
    test('returns 429 with Retry-After when all executables are rate-limited', async () => {
      const soonestReset = new Date(Date.now() + 30_000).toISOString();
      const services = createMockServices({
        rateLimitPaused: true,
        soonestReset,
      });

      const app = new Hono();
      app.route('/', createSessionRoutes(services, vi.fn(() => {})));

      const response = await app.request('/api/agents/agent-test-123/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(429);

      const retryAfter = response.headers.get('Retry-After');
      expect(retryAfter).toBeDefined();
      expect(Number(retryAfter)).toBeGreaterThan(0);
      expect(Number(retryAfter)).toBeLessThanOrEqual(30);

      const body = await response.json() as { error: { code: string; message: string; retryAfter: number; soonestReset: string } };
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.message).toContain('rate-limited');
      expect(body.error.retryAfter).toBeGreaterThan(0);
      expect(body.error.soonestReset).toBe(soonestReset);
    });

    test('allows session start when executables are not rate-limited', async () => {
      const services = createMockServices({
        rateLimitPaused: false,
      });

      const app = new Hono();
      app.route('/', createSessionRoutes(services, vi.fn(() => {})));

      const response = await app.request('/api/agents/agent-test-123/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Should succeed (201) since no rate limit
      expect(response.status).toBe(201);
      const body = await response.json() as { success: boolean };
      expect(body.success).toBe(true);
    });

    test('returns 429 with default Retry-After when soonestReset is not available', async () => {
      const services = createMockServices({
        rateLimitPaused: true,
        soonestReset: undefined,
      });

      const app = new Hono();
      app.route('/', createSessionRoutes(services, vi.fn(() => {})));

      const response = await app.request('/api/agents/agent-test-123/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(429);
      const retryAfter = response.headers.get('Retry-After');
      expect(retryAfter).toBe('60'); // Default 60 seconds
    });
  });

  describe('POST /api/agents/:id/resume', () => {
    test('returns 429 with Retry-After when all executables are rate-limited', async () => {
      const soonestReset = new Date(Date.now() + 45_000).toISOString();
      const services = createMockServices({
        rateLimitPaused: true,
        soonestReset,
      });

      const app = new Hono();
      app.route('/', createSessionRoutes(services, vi.fn(() => {})));

      const response = await app.request('/api/agents/agent-test-123/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(429);

      const retryAfter = response.headers.get('Retry-After');
      expect(retryAfter).toBeDefined();
      expect(Number(retryAfter)).toBeGreaterThan(0);
      expect(Number(retryAfter)).toBeLessThanOrEqual(45);

      const body = await response.json() as { error: { code: string; message: string; retryAfter: number; soonestReset: string } };
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.message).toContain('rate-limited');
    });

    test('allows session resume when executables are not rate-limited', async () => {
      const services = createMockServices({
        rateLimitPaused: false,
      });

      const app = new Hono();
      app.route('/', createSessionRoutes(services, vi.fn(() => {})));

      const response = await app.request('/api/agents/agent-test-123/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Should succeed (201) since no rate limit
      expect(response.status).toBe(201);
      const body = await response.json() as { success: boolean };
      expect(body.success).toBe(true);
    });
  });

  describe('when dispatchDaemon is undefined', () => {
    test('allows session start without rate limit check', async () => {
      const services = createMockServices();
      // Override dispatchDaemon to be undefined (no git repo scenario)
      (services as { dispatchDaemon: undefined }).dispatchDaemon = undefined;

      const app = new Hono();
      app.route('/', createSessionRoutes(services, vi.fn(() => {})));

      const response = await app.request('/api/agents/agent-test-123/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Should succeed since dispatchDaemon is undefined (no rate limit check possible)
      expect(response.status).toBe(201);
    });
  });
});
