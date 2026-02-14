/**
 * Session Manager Unit Tests
 *
 * Tests for the SessionManager which manages agent sessions with Claude Code
 * session ID support for resumable sessions and cross-restart persistence.
 *
 * Note: These tests use mock implementations of SpawnerService and AgentRegistry
 * to test the SessionManager's internal logic without actually spawning processes.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { EntityId, ChannelId } from '@stoneforge/core';
import { createTimestamp, ElementType } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';
import type {
  SpawnerService,
  SpawnedSession,
  SpawnResult,
  SpawnOptions,
  UWPCheckResult,
  UWPCheckOptions,
} from './spawner.js';
import type { AgentRegistry } from '../services/agent-registry.js';
import type { AgentEntity } from '../api/orchestrator-api.js';
import type { AgentMetadata } from '../types/agent.js';
import {
  createSessionManager,
  type SessionManager,
  type StartSessionOptions,
  type ResumeSessionOptions,
} from './session-manager.js';

// ============================================================================
// Mock Factories
// ============================================================================

const testAgentId = 'el-test001' as EntityId;
const testAgentId2 = 'el-test002' as EntityId;
const testAgentId3 = 'el-test003' as EntityId;
const testAgentId4 = 'el-test004' as EntityId;
const testCreatorId = 'el-creator' as EntityId;

let sessionIdCounter = 0;

function createMockAgent(
  agentId: EntityId,
  role: 'director' | 'worker' | 'steward' = 'worker',
  options?: { channelId?: string; sessionId?: string; sessionStatus?: 'idle' | 'running' | 'suspended' }
): AgentEntity {
  const baseMetadata = role === 'worker'
    ? {
        agentRole: 'worker' as const,
        workerMode: 'ephemeral' as const,
        sessionStatus: options?.sessionStatus ?? 'idle',
        sessionId: options?.sessionId,
        channelId: options?.channelId as ChannelId | undefined,
      }
    : {
        agentRole: role as 'director',
        sessionStatus: options?.sessionStatus ?? 'idle',
        sessionId: options?.sessionId,
        channelId: options?.channelId as ChannelId | undefined,
      };

  return {
    id: agentId,
    type: ElementType.ENTITY,
    name: `test-agent-${agentId}`,
    entityType: 'agent',
    version: 1,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    createdBy: testCreatorId,
    tags: [],
    metadata: {
      agent: baseMetadata,
    },
  } as unknown as AgentEntity;
}

function createMockSpawnerService(): SpawnerService & { _mockEmitters: Map<string, EventEmitter>; _mockSessions: Map<string, SpawnedSession> } {
  const sessions = new Map<string, SpawnedSession>();
  const emitters = new Map<string, EventEmitter>();

  return {
    _mockEmitters: emitters,
    _mockSessions: sessions,

    async spawn(
      agentId: EntityId,
      agentRole: 'director' | 'worker' | 'steward',
      options?: SpawnOptions
    ): Promise<SpawnResult> {
      sessionIdCounter++;
      const sessionId = `session-mock-${sessionIdCounter}`;
      const now = createTimestamp();
      const events = new EventEmitter();

      const mode = options?.mode ?? 'headless';
      const session: SpawnedSession = {
        id: sessionId,
        providerSessionId: `claude-session-${sessionIdCounter}`,
        agentId,
        agentRole,
        workerMode: agentRole === 'worker' ? 'ephemeral' : undefined,
        mode,
        // Only set PID for interactive sessions, matching real spawner behavior.
        // Headless sessions don't expose a PID immediately, and setting a fake PID
        // causes getActiveSession()/listSessions() to fail their isProcessAlive() checks.
        // Use the current process PID so the liveness check passes.
        pid: mode === 'interactive' ? process.pid : undefined,
        status: 'running',
        workingDirectory: options?.workingDirectory ?? '/tmp',
        createdAt: now,
        lastActivityAt: now,
        startedAt: now,
      };

      sessions.set(sessionId, session);
      emitters.set(sessionId, events);

      return { session, events };
    },

    async terminate(sessionId: string, graceful?: boolean): Promise<void> {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      sessions.set(sessionId, { ...session, status: 'terminated', endedAt: createTimestamp() });
      const emitter = emitters.get(sessionId);
      if (emitter) {
        emitter.emit('exit', 0, null);
      }
    },

    async suspend(sessionId: string): Promise<void> {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      if (session.status !== 'running') {
        throw new Error(`Cannot suspend session in status: ${session.status}`);
      }
      sessions.set(sessionId, { ...session, status: 'suspended' });
    },

    getSession(sessionId: string): SpawnedSession | undefined {
      return sessions.get(sessionId);
    },

    listActiveSessions(agentId?: EntityId): SpawnedSession[] {
      const allSessions = Array.from(sessions.values());
      const active = allSessions.filter((s) => s.status !== 'terminated');
      return agentId ? active.filter((s) => s.agentId === agentId) : active;
    },

    listAllSessions(agentId?: EntityId): SpawnedSession[] {
      const allSessions = Array.from(sessions.values());
      return agentId ? allSessions.filter((s) => s.agentId === agentId) : allSessions;
    },

    getMostRecentSession(agentId: EntityId): SpawnedSession | undefined {
      const agentSessions = Array.from(sessions.values())
        .filter((s) => s.agentId === agentId)
        .sort((a, b) => {
          const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
          const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
          return bTime - aTime;
        });
      return agentSessions[0];
    },

    async sendInput(sessionId: string, input: string): Promise<void> {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      if (session.status !== 'running') {
        throw new Error(`Cannot send input to session in status: ${session.status}`);
      }
    },

    getEventEmitter(sessionId: string): EventEmitter | undefined {
      return emitters.get(sessionId);
    },

    async checkReadyQueue(
      agentId: EntityId,
      options?: UWPCheckOptions
    ): Promise<UWPCheckResult> {
      return { hasReadyTask: false, autoStarted: false };
    },
  };
}

function createMockAgentRegistry(agents: Map<EntityId, AgentEntity>): AgentRegistry {
  const updatedMetadata = new Map<EntityId, Partial<AgentMetadata>>();

  return {
    async registerAgent(input: any): Promise<AgentEntity> {
      throw new Error('Not implemented in mock');
    },

    async registerDirector(input: any): Promise<AgentEntity> {
      throw new Error('Not implemented in mock');
    },

    async registerWorker(input: any): Promise<AgentEntity> {
      throw new Error('Not implemented in mock');
    },

    async registerSteward(input: any): Promise<AgentEntity> {
      throw new Error('Not implemented in mock');
    },

    async getAgent(entityId: EntityId): Promise<AgentEntity | undefined> {
      return agents.get(entityId);
    },

    async getAgentByName(name: string): Promise<AgentEntity | undefined> {
      for (const agent of agents.values()) {
        if (agent.name === name) {
          return agent;
        }
      }
      return undefined;
    },

    async listAgents(filter?: any): Promise<AgentEntity[]> {
      return Array.from(agents.values());
    },

    async getAgentsByRole(role: 'director' | 'worker' | 'steward'): Promise<AgentEntity[]> {
      return Array.from(agents.values()).filter((a) => {
        const meta = a.metadata?.agent;
        return meta && (meta as AgentMetadata).agentRole === role;
      });
    },

    async getAvailableWorkers(): Promise<AgentEntity[]> {
      return Array.from(agents.values()).filter((a) => {
        const meta = a.metadata?.agent;
        return meta && (meta as AgentMetadata).agentRole === 'worker';
      });
    },

    async getStewards(): Promise<AgentEntity[]> {
      return Array.from(agents.values()).filter((a) => {
        const meta = a.metadata?.agent;
        return meta && (meta as AgentMetadata).agentRole === 'steward';
      });
    },

    async getDirector(): Promise<AgentEntity | undefined> {
      for (const agent of agents.values()) {
        const meta = agent.metadata?.agent;
        if (meta && (meta as AgentMetadata).agentRole === 'director') {
          return agent;
        }
      }
      return undefined;
    },

    async updateAgentSession(
      entityId: EntityId,
      sessionId: string | undefined,
      status: 'idle' | 'running' | 'suspended' | 'terminated'
    ): Promise<AgentEntity> {
      const agent = agents.get(entityId);
      if (!agent) {
        throw new Error(`Agent not found: ${entityId}`);
      }
      const currentMeta = agent.metadata?.agent as AgentMetadata;
      const updatedAgent: AgentEntity = {
        ...agent,
        metadata: {
          ...agent.metadata,
          agent: {
            ...currentMeta,
            sessionId,
            sessionStatus: status,
          },
        },
      };
      agents.set(entityId, updatedAgent);
      return updatedAgent;
    },

    async updateAgentMetadata(
      entityId: EntityId,
      updates: Partial<AgentMetadata>
    ): Promise<AgentEntity> {
      const agent = agents.get(entityId);
      if (!agent) {
        throw new Error(`Agent not found: ${entityId}`);
      }
      const currentMeta = agent.metadata?.agent as AgentMetadata;
      const updatedAgent = {
        ...agent,
        metadata: {
          ...agent.metadata,
          agent: {
            ...currentMeta,
            ...updates,
          } as AgentMetadata,
        },
      } as AgentEntity;
      agents.set(entityId, updatedAgent);
      updatedMetadata.set(entityId, updates);
      return updatedAgent;
    },

    async getAgentChannel(entityId: EntityId): Promise<string | undefined> {
      const agent = agents.get(entityId);
      if (!agent) {
        return undefined;
      }
      const meta = agent.metadata?.agent as AgentMetadata;
      return meta?.channelId;
    },

    async getAgentChannelId(entityId: EntityId): Promise<string | undefined> {
      return this.getAgentChannel(entityId);
    },
  } as AgentRegistry;
}

function createMockApi(): QuarryAPI {
  return {} as QuarryAPI;
}

// ============================================================================
// Tests
// ============================================================================

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let spawner: SpawnerService & { _mockEmitters: Map<string, EventEmitter>; _mockSessions: Map<string, SpawnedSession> };
  let registry: AgentRegistry;
  let api: QuarryAPI;
  let agents: Map<EntityId, AgentEntity>;

  beforeEach(() => {
    sessionIdCounter = 0;
    agents = new Map();
    agents.set(testAgentId, createMockAgent(testAgentId, 'worker'));
    agents.set(testAgentId2, createMockAgent(testAgentId2, 'director'));

    spawner = createMockSpawnerService();
    registry = createMockAgentRegistry(agents);
    api = createMockApi();
    sessionManager = createSessionManager(spawner, api, registry);
  });

  describe('startSession', () => {
    test('starts a new session for an agent', async () => {
      const result = await sessionManager.startSession(testAgentId);

      expect(result.session).toBeDefined();
      expect(result.session.agentId).toBe(testAgentId);
      expect(result.session.status).toBe('running');
      expect(result.session.agentRole).toBe('worker');
      expect(result.session.providerSessionId).toBeDefined();
      expect(result.events).toBeInstanceOf(EventEmitter);
    });

    test('throws error for non-existent agent', async () => {
      const nonExistentId = 'el-nonexist' as EntityId;
      await expect(sessionManager.startSession(nonExistentId)).rejects.toThrow(
        'Agent not found'
      );
    });

    test('throws error if agent already has active session', async () => {
      await sessionManager.startSession(testAgentId);
      await expect(sessionManager.startSession(testAgentId)).rejects.toThrow(
        'already has an active session'
      );
    });

    test('applies start options correctly', async () => {
      const options: StartSessionOptions = {
        workingDirectory: '/custom/path',
        worktree: '/worktrees/test',
        initialPrompt: 'Hello agent',
      };

      const result = await sessionManager.startSession(testAgentId, options);

      expect(result.session.workingDirectory).toBe('/custom/path');
      expect(result.session.worktree).toBe('/worktrees/test');
    });

    test('updates agent session status in registry', async () => {
      await sessionManager.startSession(testAgentId);

      const agent = await registry.getAgent(testAgentId);
      const meta = agent?.metadata?.agent as AgentMetadata;
      expect(meta?.sessionStatus).toBe('running');
    });
  });

  describe('resumeSession', () => {
    test('resumes a session with provider session ID', async () => {
      const options: ResumeSessionOptions = {
        providerSessionId: 'claude-session-previous',
        workingDirectory: '/resume/path',
      };

      const result = await sessionManager.resumeSession(testAgentId, options);

      expect(result.session).toBeDefined();
      expect(result.session.agentId).toBe(testAgentId);
      expect(result.session.status).toBe('running');
    });

    test('throws error for non-existent agent', async () => {
      const nonExistentId = 'el-nonexist' as EntityId;
      await expect(
        sessionManager.resumeSession(nonExistentId, { providerSessionId: 'test' })
      ).rejects.toThrow('Agent not found');
    });

    test('throws error if agent already has active session', async () => {
      await sessionManager.startSession(testAgentId);
      await expect(
        sessionManager.resumeSession(testAgentId, { providerSessionId: 'test' })
      ).rejects.toThrow('already has an active session');
    });

    test('performs UWP check when enabled and callback provided', async () => {
      const mockReadyTasks = [
        { id: 'task-001', title: 'Fix critical bug', priority: 1, status: 'open' },
      ];

      const getReadyTasks = async (_agentId: EntityId, _limit: number) => mockReadyTasks;

      const result = await sessionManager.resumeSession(testAgentId, {
        providerSessionId: 'claude-session-previous',
        checkReadyQueue: true,
        getReadyTasks,
      });

      expect(result.uwpCheck).toBeDefined();
      expect(result.uwpCheck?.hasReadyTask).toBe(true);
      expect(result.uwpCheck?.taskId).toBe('task-001');
      expect(result.uwpCheck?.taskTitle).toBe('Fix critical bug');
      expect(result.uwpCheck?.taskPriority).toBe(1);
      expect(result.uwpCheck?.shouldProcessFirst).toBe(true);
    });

    test('UWP check returns empty result when no tasks assigned', async () => {
      const getReadyTasks = async (_agentId: EntityId, _limit: number) => [];

      const result = await sessionManager.resumeSession(testAgentId, {
        providerSessionId: 'claude-session-previous',
        checkReadyQueue: true,
        getReadyTasks,
      });

      expect(result.uwpCheck).toBeDefined();
      expect(result.uwpCheck?.hasReadyTask).toBe(false);
      expect(result.uwpCheck?.shouldProcessFirst).toBe(false);
      expect(result.uwpCheck?.taskId).toBeUndefined();
    });

    test('skips UWP check when checkReadyQueue is false', async () => {
      const getReadyTasks = async (_agentId: EntityId, _limit: number) => [
        { id: 'task-001', title: 'Some task', priority: 1, status: 'open' },
      ];

      const result = await sessionManager.resumeSession(testAgentId, {
        providerSessionId: 'claude-session-previous',
        checkReadyQueue: false,
        getReadyTasks,
      });

      expect(result.uwpCheck).toBeUndefined();
    });

    test('skips UWP check when no callback provided', async () => {
      const result = await sessionManager.resumeSession(testAgentId, {
        providerSessionId: 'claude-session-previous',
        checkReadyQueue: true,
        // No getReadyTasks callback
      });

      expect(result.uwpCheck).toBeUndefined();
    });

    test('UWP check defaults to enabled when not specified', async () => {
      const mockReadyTasks = [
        { id: 'task-002', title: 'Deploy feature', priority: 2, status: 'open' },
      ];

      const getReadyTasks = async (_agentId: EntityId, _limit: number) => mockReadyTasks;

      const result = await sessionManager.resumeSession(testAgentId, {
        providerSessionId: 'claude-session-previous',
        // checkReadyQueue not specified, should default to true
        getReadyTasks,
      });

      expect(result.uwpCheck).toBeDefined();
      expect(result.uwpCheck?.hasReadyTask).toBe(true);
      expect(result.uwpCheck?.taskId).toBe('task-002');
    });

    test('preserves resume prompt when UWP task found', async () => {
      const mockReadyTasks = [
        { id: 'task-003', title: 'Review PR', priority: 3, status: 'open' },
      ];

      const getReadyTasks = async (_agentId: EntityId, _limit: number) => mockReadyTasks;

      const result = await sessionManager.resumeSession(testAgentId, {
        providerSessionId: 'claude-session-previous',
        resumePrompt: 'Continue where you left off',
        getReadyTasks,
      });

      expect(result.uwpCheck?.hasReadyTask).toBe(true);
      expect(result.session.status).toBe('running');
    });
  });

  describe('stopSession', () => {
    test('stops a running session', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      await sessionManager.stopSession(session.id);

      const stoppedSession = sessionManager.getSession(session.id);
      expect(stoppedSession?.status).toBe('terminated');
      expect(stoppedSession?.endedAt).toBeDefined();
    });

    test('throws error for non-existent session', async () => {
      await expect(sessionManager.stopSession('nonexistent')).rejects.toThrow(
        'Session not found'
      );
    });

    test('records termination reason', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      await sessionManager.stopSession(session.id, { reason: 'User requested' });

      const stoppedSession = sessionManager.getSession(session.id);
      expect(stoppedSession?.terminationReason).toBe('User requested');
    });

    test('updates agent session status to idle', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      await sessionManager.stopSession(session.id);

      const agent = await registry.getAgent(testAgentId);
      const meta = agent?.metadata?.agent as AgentMetadata;
      expect(meta?.sessionStatus).toBe('idle');
    });

    test('clears active session for agent', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      await sessionManager.stopSession(session.id);

      const activeSession = sessionManager.getActiveSession(testAgentId);
      expect(activeSession).toBeUndefined();
    });
  });

  describe('suspendSession', () => {
    test('suspends a running session', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      await sessionManager.suspendSession(session.id);

      const suspendedSession = sessionManager.getSession(session.id);
      expect(suspendedSession?.status).toBe('suspended');
      expect(suspendedSession?.endedAt).toBeDefined();
    });

    test('throws error for non-existent session', async () => {
      await expect(sessionManager.suspendSession('nonexistent')).rejects.toThrow(
        'Session not found'
      );
    });

    test('records suspension reason', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      await sessionManager.suspendSession(session.id, 'Context overflow');

      const suspendedSession = sessionManager.getSession(session.id);
      expect(suspendedSession?.terminationReason).toBe('Context overflow');
    });

    test('updates agent session status to suspended', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      await sessionManager.suspendSession(session.id);

      const agent = await registry.getAgent(testAgentId);
      const meta = agent?.metadata?.agent as AgentMetadata;
      expect(meta?.sessionStatus).toBe('suspended');
    });

    test('preserves provider session ID for resumption', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      const providerSessionId = session.providerSessionId;

      await sessionManager.suspendSession(session.id);

      const agent = await registry.getAgent(testAgentId);
      const meta = agent?.metadata?.agent as AgentMetadata;
      expect(meta?.sessionId).toBe(providerSessionId);
    });
  });

  describe('getSession', () => {
    test('returns session by ID', async () => {
      const { session: created } = await sessionManager.startSession(testAgentId);

      const session = sessionManager.getSession(created.id);

      expect(session).toBeDefined();
      expect(session?.id).toBe(created.id);
      expect(session?.agentId).toBe(testAgentId);
    });

    test('returns undefined for non-existent session', () => {
      const session = sessionManager.getSession('nonexistent');
      expect(session).toBeUndefined();
    });
  });

  describe('getActiveSession', () => {
    test('returns active session for agent', async () => {
      const { session: created } = await sessionManager.startSession(testAgentId);

      const session = sessionManager.getActiveSession(testAgentId);

      expect(session).toBeDefined();
      expect(session?.id).toBe(created.id);
      expect(session?.status).toBe('running');
    });

    test('returns undefined when no active session', () => {
      const session = sessionManager.getActiveSession(testAgentId);
      expect(session).toBeUndefined();
    });

    test('returns undefined after session stopped', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(session.id);

      const activeSession = sessionManager.getActiveSession(testAgentId);
      expect(activeSession).toBeUndefined();
    });

    test('returns undefined after session suspended', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      await sessionManager.suspendSession(session.id);

      const activeSession = sessionManager.getActiveSession(testAgentId);
      expect(activeSession).toBeUndefined();
    });
  });

  describe('listSessions', () => {
    test('returns all sessions when no filter', async () => {
      await sessionManager.startSession(testAgentId);
      await sessionManager.startSession(testAgentId2);

      const sessions = sessionManager.listSessions();

      expect(sessions).toHaveLength(2);
    });

    test('filters by agentId', async () => {
      await sessionManager.startSession(testAgentId);
      await sessionManager.startSession(testAgentId2);

      const sessions = sessionManager.listSessions({ agentId: testAgentId });

      expect(sessions).toHaveLength(1);
      expect(sessions[0].agentId).toBe(testAgentId);
    });

    test('filters by role', async () => {
      await sessionManager.startSession(testAgentId); // worker
      await sessionManager.startSession(testAgentId2); // director

      const workerSessions = sessionManager.listSessions({ role: 'worker' });
      const directorSessions = sessionManager.listSessions({ role: 'director' });

      expect(workerSessions).toHaveLength(1);
      expect(workerSessions[0].agentRole).toBe('worker');
      expect(directorSessions).toHaveLength(1);
      expect(directorSessions[0].agentRole).toBe('director');
    });

    test('filters by status', async () => {
      const { session: session1 } = await sessionManager.startSession(testAgentId);
      await sessionManager.startSession(testAgentId2);
      await sessionManager.stopSession(session1.id);

      const runningSessions = sessionManager.listSessions({ status: 'running' });
      const terminatedSessions = sessionManager.listSessions({ status: 'terminated' });

      expect(runningSessions).toHaveLength(1);
      expect(terminatedSessions).toHaveLength(1);
    });

    test('filters by multiple statuses', async () => {
      const { session: session1 } = await sessionManager.startSession(testAgentId);
      const { session: session2 } = await sessionManager.startSession(testAgentId2);
      await sessionManager.stopSession(session1.id);
      await sessionManager.suspendSession(session2.id);

      const sessions = sessionManager.listSessions({
        status: ['terminated', 'suspended'],
      });

      expect(sessions).toHaveLength(2);
    });

    test('filters by resumable', async () => {
      await sessionManager.startSession(testAgentId);
      await sessionManager.startSession(testAgentId2);

      const resumableSessions = sessionManager.listSessions({ resumable: true });

      expect(resumableSessions).toHaveLength(2);
      expect(resumableSessions.every((s) => s.providerSessionId !== undefined)).toBe(true);
    });
  });

  describe('getMostRecentResumableSession', () => {
    test('returns most recent session with provider session ID', async () => {
      const { session: session1 } = await sessionManager.startSession(testAgentId);
      await sessionManager.suspendSession(session1.id);

      // Allow agent to start another session (clear the active check)
      await new Promise((resolve) => setTimeout(resolve, 10));

      const mostRecent = sessionManager.getMostRecentResumableSession(testAgentId);

      expect(mostRecent).toBeDefined();
      expect(mostRecent?.agentId).toBe(testAgentId);
      expect(mostRecent?.providerSessionId).toBeDefined();
    });

    test('returns undefined when no sessions exist', () => {
      const mostRecent = sessionManager.getMostRecentResumableSession(testAgentId);
      expect(mostRecent).toBeUndefined();
    });
  });

  describe('getSessionHistory', () => {
    test('returns session history for agent', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(session.id);

      const history = await sessionManager.getSessionHistory(testAgentId);

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(session.id);
    });

    test('returns empty array for agent with no history', async () => {
      const history = await sessionManager.getSessionHistory(testAgentId);
      expect(history).toEqual([]);
    });

    test('limits number of entries returned', async () => {
      // Create multiple sessions by stopping between each
      for (let i = 0; i < 5; i++) {
        const { session } = await sessionManager.startSession(testAgentId);
        await sessionManager.stopSession(session.id);
        // Small delay to ensure history is recorded
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Check history after each stop
        const historyAfterStop = await sessionManager.getSessionHistory(testAgentId, 10);
        expect(historyAfterStop.length).toBe(i + 1);
      }

      // Get all history first to see what we have
      const allHistory = await sessionManager.getSessionHistory(testAgentId, 10);
      // Should have 5 entries from 5 sessions
      expect(allHistory.length).toBe(5);

      // Now test the limit
      const limitedHistory = await sessionManager.getSessionHistory(testAgentId, 3);
      expect(limitedHistory).toHaveLength(3);
    });
  });

  describe('messageSession', () => {
    test('returns error for non-existent session', async () => {
      const result = await sessionManager.messageSession('nonexistent', {
        content: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    test('returns error when no content provided', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      const result = await sessionManager.messageSession(session.id, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Either contentRef or content must be provided');
    });

    test('returns error when agent has no channel', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      const result = await sessionManager.messageSession(session.id, {
        content: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent has no channel');
    });

    test('succeeds when agent has channel', async () => {
      // Update agent to have a channel
      const agent = agents.get(testAgentId)!;
      const updatedAgent = {
        ...agent,
        metadata: {
          ...agent.metadata,
          agent: {
            ...(agent.metadata?.agent as AgentMetadata),
            channelId: 'channel-test' as ChannelId,
          } as AgentMetadata,
        },
      } as AgentEntity;
      agents.set(testAgentId, updatedAgent);

      const { session } = await sessionManager.startSession(testAgentId);

      const result = await sessionManager.messageSession(session.id, {
        content: 'Hello agent',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getEventEmitter', () => {
    test('returns event emitter for active session', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      const emitter = sessionManager.getEventEmitter(session.id);

      expect(emitter).toBeInstanceOf(EventEmitter);
    });

    test('returns undefined for non-existent session', () => {
      const emitter = sessionManager.getEventEmitter('nonexistent');
      expect(emitter).toBeUndefined();
    });
  });

  describe('persistSession', () => {
    test('persists session state to agent metadata', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      await sessionManager.persistSession(session.id);

      const agent = await registry.getAgent(testAgentId);
      const meta = agent?.metadata?.agent as AgentMetadata;
      expect(meta?.sessionId).toBe(session.providerSessionId);
    });

    test('does nothing for non-existent session', async () => {
      // Should not throw
      await sessionManager.persistSession('nonexistent');
    });
  });

  describe('loadSessionState', () => {
    test('does nothing for non-existent agent', async () => {
      // Should not throw
      await sessionManager.loadSessionState('el-nonexist' as EntityId);
    });

    test('loads suspended session state', async () => {
      // Create an agent with a suspended session in metadata
      const agentWithSuspended = createMockAgent(testAgentId, 'worker', {
        sessionId: 'claude-suspended',
        sessionStatus: 'suspended',
      });
      // Add session history to agent metadata (under metadata.agent.sessionHistory)
      const agentMeta = agentWithSuspended.metadata?.agent as unknown as Record<string, unknown>;
      agentMeta.sessionHistory = [
        {
          id: 'session-old',
          providerSessionId: 'claude-suspended',
          status: 'suspended',
          workingDirectory: '/old/path',
          startedAt: createTimestamp(),
          endedAt: createTimestamp(),
        },
      ];
      agents.set(testAgentId, agentWithSuspended);

      await sessionManager.loadSessionState(testAgentId);

      // Should have loaded the suspended session
      const history = await sessionManager.getSessionHistory(testAgentId);
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe('event forwarding', () => {
    test('forwards events from spawner to session emitter', async () => {
      const { session, events } = await sessionManager.startSession(testAgentId);

      const receivedEvents: unknown[] = [];
      events.on('event', (event) => receivedEvents.push(event));

      // Emit event on spawner's emitter
      const spawnerEmitter = spawner._mockEmitters.get(session.id);
      spawnerEmitter?.emit('event', { type: 'assistant', message: 'Hello' });

      expect(receivedEvents).toHaveLength(1);
      expect((receivedEvents[0] as Record<string, unknown>).type).toBe('assistant');
    });

    test('forwards error events', async () => {
      const { session, events } = await sessionManager.startSession(testAgentId);

      const receivedErrors: Error[] = [];
      events.on('error', (error) => receivedErrors.push(error));

      // Emit error on spawner's emitter
      const spawnerEmitter = spawner._mockEmitters.get(session.id);
      spawnerEmitter?.emit('error', new Error('Test error'));

      expect(receivedErrors).toHaveLength(1);
      expect(receivedErrors[0].message).toBe('Test error');
    });

    test('updates session status on exit event', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      // Emit exit on spawner's emitter
      const spawnerEmitter = spawner._mockEmitters.get(session.id);
      spawnerEmitter?.emit('exit', 0, null);

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.status).toBe('terminated');
    });
  });

  describe('getApi', () => {
    test('returns the API instance', () => {
      const retrievedApi = (sessionManager as any).getApi();
      expect(retrievedApi).toBe(api);
    });
  });

  // ============================================================================
  // TB-O10c: Role-based Session History Tests
  // ============================================================================

  describe('getSessionHistoryByRole', () => {
    beforeEach(() => {
      // Add additional agents for role-based testing
      agents.set(testAgentId3, createMockAgent(testAgentId3, 'worker'));
      agents.set(testAgentId4, createMockAgent(testAgentId4, 'steward'));
    });

    test('returns empty array when no sessions exist for role', async () => {
      const history = await sessionManager.getSessionHistoryByRole('steward');
      expect(history).toEqual([]);
    });

    test('returns session history for a specific role', async () => {
      // Start and stop a worker session
      const { session } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(session.id);

      const workerHistory = await sessionManager.getSessionHistoryByRole('worker');

      expect(workerHistory.length).toBeGreaterThan(0);
      expect(workerHistory[0].role).toBe('worker');
      expect(workerHistory[0].agentId).toBe(testAgentId);
    });

    test('aggregates history from multiple agents with same role', async () => {
      // Start and stop sessions for two workers
      const { session: session1 } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(session1.id);

      const { session: session2 } = await sessionManager.startSession(testAgentId3);
      await sessionManager.stopSession(session2.id);

      const workerHistory = await sessionManager.getSessionHistoryByRole('worker');

      expect(workerHistory.length).toBe(2);
      expect(workerHistory.every((h) => h.role === 'worker')).toBe(true);
    });

    test('does not include sessions from other roles', async () => {
      // Start and stop a worker session
      const { session: workerSession } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(workerSession.id);

      // Start and stop a director session
      const { session: directorSession } = await sessionManager.startSession(testAgentId2);
      await sessionManager.stopSession(directorSession.id);

      const workerHistory = await sessionManager.getSessionHistoryByRole('worker');
      const directorHistory = await sessionManager.getSessionHistoryByRole('director');

      expect(workerHistory.length).toBe(1);
      expect(workerHistory[0].role).toBe('worker');
      expect(directorHistory.length).toBe(1);
      expect(directorHistory[0].role).toBe('director');
    });

    test('respects limit parameter', async () => {
      // Create multiple sessions for the same worker
      for (let i = 0; i < 5; i++) {
        const { session } = await sessionManager.startSession(testAgentId);
        await sessionManager.stopSession(session.id);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const limitedHistory = await sessionManager.getSessionHistoryByRole('worker', 3);

      expect(limitedHistory.length).toBe(3);
    });

    test('includes agent name in history entries', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(session.id);

      const history = await sessionManager.getSessionHistoryByRole('worker');

      expect(history[0].agentName).toBe(`test-agent-${testAgentId}`);
    });

    test('sorts history by most recent first', async () => {
      // Create sessions for two workers with time gap
      const { session: session1 } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(session1.id);

      await new Promise((resolve) => setTimeout(resolve, 20));

      const { session: session2 } = await sessionManager.startSession(testAgentId3);
      await sessionManager.stopSession(session2.id);

      const history = await sessionManager.getSessionHistoryByRole('worker');

      // Most recent session (session2) should be first
      expect(history[0].id).toBe(session2.id);
      expect(history[1].id).toBe(session1.id);
    });
  });

  describe('getPreviousSession', () => {
    beforeEach(() => {
      agents.set(testAgentId3, createMockAgent(testAgentId3, 'worker'));
    });

    test('returns undefined when no sessions exist for role', async () => {
      const previous = await sessionManager.getPreviousSession('steward');
      expect(previous).toBeUndefined();
    });

    test('returns undefined when only running sessions exist', async () => {
      // Start but don't stop a session
      await sessionManager.startSession(testAgentId);

      // Running sessions shouldn't be returned as "previous"
      const previous = await sessionManager.getPreviousSession('worker');
      expect(previous).toBeUndefined();
    });

    test('returns terminated session', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(session.id, { reason: 'Test termination' });

      const previous = await sessionManager.getPreviousSession('worker');

      expect(previous).toBeDefined();
      expect(previous?.id).toBe(session.id);
      expect(previous?.status).toBe('terminated');
      expect(previous?.terminationReason).toBe('Test termination');
    });

    test('returns suspended session', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      await sessionManager.suspendSession(session.id, 'Test suspension');

      const previous = await sessionManager.getPreviousSession('worker');

      expect(previous).toBeDefined();
      expect(previous?.id).toBe(session.id);
      expect(previous?.status).toBe('suspended');
      expect(previous?.terminationReason).toBe('Test suspension');
    });

    test('returns most recent ended session when multiple exist', async () => {
      // Create and stop first session
      const { session: session1 } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(session1.id);

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Create and suspend second session
      const { session: session2 } = await sessionManager.startSession(testAgentId3);
      await sessionManager.suspendSession(session2.id);

      const previous = await sessionManager.getPreviousSession('worker');

      // Should be the most recently ended session
      expect(previous?.id).toBe(session2.id);
    });

    test('returns correct role in previous session', async () => {
      // Create director session
      const { session: directorSession } = await sessionManager.startSession(testAgentId2);
      await sessionManager.stopSession(directorSession.id);

      // Create worker session
      const { session: workerSession } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(workerSession.id);

      const previousDirector = await sessionManager.getPreviousSession('director');
      const previousWorker = await sessionManager.getPreviousSession('worker');

      expect(previousDirector?.role).toBe('director');
      expect(previousWorker?.role).toBe('worker');
    });

    test('includes provider session ID for resumption', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      const providerSessionId = session.providerSessionId;
      await sessionManager.suspendSession(session.id);

      const previous = await sessionManager.getPreviousSession('worker');

      expect(previous?.providerSessionId).toBe(providerSessionId);
    });
  });

  describe('persistSession with history', () => {
    test('persists session history to agent metadata', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(session.id);

      // Force persist
      await sessionManager.persistSession(session.id);

      const agent = await registry.getAgent(testAgentId);
      // Session history is stored under metadata.agent.sessionHistory
      const agentMeta = agent?.metadata?.agent as unknown as Record<string, unknown>;
      const sessionHistory = agentMeta?.sessionHistory;

      expect(Array.isArray(sessionHistory)).toBe(true);
      expect((sessionHistory as Array<Record<string, unknown>>).length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Bug fix: Session leak prevention
  // ============================================================================

  describe('session leak prevention', () => {
    test('onExit cleans up sessions in starting status', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      // Manually set the session to 'starting' status to simulate a session
      // that exits before transitioning to 'running'
      const impl = sessionManager as unknown as { sessions: Map<string, any> };
      const internalSession = impl.sessions.get(session.id);
      impl.sessions.set(session.id, { ...internalSession, status: 'starting' });

      // Emit exit on spawner's emitter
      const spawnerEmitter = spawner._mockEmitters.get(session.id);
      spawnerEmitter?.emit('exit', 1, null);

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 50));

      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.status).toBe('terminated');

      // Active session should be cleared
      const activeSession = sessionManager.getActiveSession(testAgentId);
      expect(activeSession).toBeUndefined();
    });

    test('onExit cleans up sessions in terminating status', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      // Manually set the session to 'terminating' status
      const impl = sessionManager as unknown as { sessions: Map<string, any> };
      const internalSession = impl.sessions.get(session.id);
      impl.sessions.set(session.id, { ...internalSession, status: 'terminating' });

      // Emit exit on spawner's emitter
      const spawnerEmitter = spawner._mockEmitters.get(session.id);
      spawnerEmitter?.emit('exit', 0, null);

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 50));

      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.status).toBe('terminated');
    });

    test('onExit does not modify already-terminated sessions', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      await sessionManager.stopSession(session.id, { reason: 'Explicit stop' });

      // The session is already terminated — emitting exit again should not alter it
      const spawnerEmitter = spawner._mockEmitters.get(session.id);
      spawnerEmitter?.emit('exit', 0, null);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.status).toBe('terminated');
      expect(updatedSession?.terminationReason).toBe('Explicit stop');
    });

    test('onExit does not modify already-suspended sessions', async () => {
      const { session } = await sessionManager.startSession(testAgentId);
      await sessionManager.suspendSession(session.id, 'Suspended for later');

      // The session is already suspended — emitting exit should not alter it
      const spawnerEmitter = spawner._mockEmitters.get(session.id);
      spawnerEmitter?.emit('exit', 0, null);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.status).toBe('suspended');
      expect(updatedSession?.terminationReason).toBe('Suspended for later');
    });

    test('listSessions excludes sessions with dead PIDs', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      // Manually set a dead PID on the session to simulate a crashed process
      const impl = sessionManager as unknown as { sessions: Map<string, any> };
      const internalSession = impl.sessions.get(session.id);
      // PID 999999 should not exist
      impl.sessions.set(session.id, { ...internalSession, pid: 999999, status: 'running' });

      // listSessions should detect the dead PID and clean it up
      const runningSessions = sessionManager.listSessions({ status: 'running' });
      expect(runningSessions).toHaveLength(0);

      // The session should now be terminated
      const allSessions = sessionManager.listSessions({ status: 'terminated' });
      expect(allSessions).toHaveLength(1);
      expect(allSessions[0].terminationReason).toContain('Process no longer alive');
    });

    test('listSessions cleans up starting sessions with dead PIDs', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      // Set a dead PID and 'starting' status
      const impl = sessionManager as unknown as { sessions: Map<string, any> };
      const internalSession = impl.sessions.get(session.id);
      impl.sessions.set(session.id, { ...internalSession, pid: 999999, status: 'starting' });

      const startingSessions = sessionManager.listSessions({ status: ['starting', 'running'] });
      expect(startingSessions).toHaveLength(0);
    });

    test('listSessions cleans up headless sessions when spawner no longer tracks them', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      // The session is headless (worker), so it has no PID.
      // Simulate the spawner having already cleaned up (process exited, 5s elapsed).
      spawner._mockSessions.delete(session.id);

      // listSessions should detect the orphaned session via spawner cross-reference
      const runningSessions = sessionManager.listSessions({ status: ['starting', 'running'] });
      expect(runningSessions).toHaveLength(0);

      // The session should now be terminated
      const terminatedSessions = sessionManager.listSessions({ status: 'terminated' });
      expect(terminatedSessions).toHaveLength(1);
      expect(terminatedSessions[0].terminationReason).toContain('Process no longer alive');
    });

    test('getActiveSession cleans up headless sessions when spawner no longer tracks them', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      // Simulate the spawner cleaning up (headless process exited)
      spawner._mockSessions.delete(session.id);

      // getActiveSession should detect the orphan and return undefined
      const active = sessionManager.getActiveSession(testAgentId);
      expect(active).toBeUndefined();

      // Session should be terminated
      const found = sessionManager.getSession(session.id);
      expect(found?.status).toBe('terminated');
    });

    test('listSessions cleans up headless sessions when spawner shows terminated', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      // Simulate the spawner marking the session as terminated (but not yet deleted)
      const spawnerSession = spawner._mockSessions.get(session.id)!;
      spawner._mockSessions.set(session.id, { ...spawnerSession, status: 'terminated' });

      const runningSessions = sessionManager.listSessions({ status: ['starting', 'running'] });
      expect(runningSessions).toHaveLength(0);
    });

    test('scheduleTerminatedSessionCleanup removes session without persisted flag', async () => {
      const { session } = await sessionManager.startSession(testAgentId);

      // Manually terminate the session without persisting (persisted stays false)
      const impl = sessionManager as unknown as { sessions: Map<string, any> };
      const internalSession = impl.sessions.get(session.id);
      impl.sessions.set(session.id, {
        ...internalSession,
        status: 'terminated',
        persisted: false,
      });

      // Trigger the cleanup
      const smImpl = sessionManager as unknown as { scheduleTerminatedSessionCleanup: (id: string) => void };
      smImpl.scheduleTerminatedSessionCleanup(session.id);

      // Wait for the 5-second timeout plus a buffer
      await new Promise((resolve) => setTimeout(resolve, 5500));

      // Session should have been removed from the map
      const found = sessionManager.getSession(session.id);
      expect(found).toBeUndefined();
    }, 10000);
  });
});
