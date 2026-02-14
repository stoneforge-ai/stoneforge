/**
 * Predecessor Query Service Unit Tests
 *
 * Tests for the PredecessorQueryService which enables agents to consult
 * previous sessions for context and guidance.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { EntityId } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import type {
  SessionManager,
  SessionRecord,
  RoleSessionHistoryEntry,
  StartSessionOptions,
  ResumeSessionOptions,
  StopSessionOptions,
  MessageSessionOptions,
  MessageSessionResult,
  SessionFilter,
  SessionHistoryEntry,
  ResumeUWPCheckResult,
} from './session-manager.js';
import {
  createPredecessorQueryService,
  type PredecessorQueryService,
  DEFAULT_QUERY_TIMEOUT_MS,
  MIN_QUERY_TIMEOUT_MS,
  MAX_QUERY_TIMEOUT_MS,
  TimeoutError,
  NoPredecessorError,
} from './predecessor-query.js';

// ============================================================================
// Mock Factories
// ============================================================================

const testAgentId = 'el-test001' as EntityId;
const testAgentId2 = 'el-test002' as EntityId;

interface MockSessionManagerState {
  sessions: Map<string, SessionRecord & { events: EventEmitter }>;
  roleHistory: Map<string, RoleSessionHistoryEntry[]>;
  resumeCallback?: (agentId: EntityId, options: ResumeSessionOptions) => void;
}

function createMockSessionManager(state: MockSessionManagerState): SessionManager {
  return {
    async startSession(
      agentId: EntityId,
      options?: StartSessionOptions
    ): Promise<{ session: SessionRecord; events: EventEmitter }> {
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const now = createTimestamp();
      const events = new EventEmitter();

      const session: SessionRecord & { events: EventEmitter } = {
        id: sessionId,
        providerSessionId: `claude-${sessionId}`,
        agentId,
        agentRole: 'worker',
        status: 'running',
        workingDirectory: options?.workingDirectory ?? '/test/dir',
        worktree: options?.worktree,
        createdAt: now,
        lastActivityAt: now,
        startedAt: now,
        events,
      };

      state.sessions.set(sessionId, session);
      return { session, events };
    },

    async resumeSession(
      agentId: EntityId,
      options: ResumeSessionOptions
    ): Promise<{ session: SessionRecord; events: EventEmitter; uwpCheck?: ResumeUWPCheckResult }> {
      // Call the callback if provided (for test verification)
      state.resumeCallback?.(agentId, options);

      const sessionId = `session-resumed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const now = createTimestamp();
      const events = new EventEmitter();

      const session: SessionRecord & { events: EventEmitter } = {
        id: sessionId,
        providerSessionId: options.providerSessionId,
        agentId,
        agentRole: 'worker',
        status: 'running',
        workingDirectory: options.workingDirectory ?? '/test/dir',
        worktree: options.worktree,
        createdAt: now,
        lastActivityAt: now,
        startedAt: now,
        events,
      };

      state.sessions.set(sessionId, session);
      return { session, events };
    },

    async stopSession(sessionId: string, _options?: StopSessionOptions): Promise<void> {
      const session = state.sessions.get(sessionId);
      if (session) {
        (session as { status: string }).status = 'terminated';
      }
    },

    async suspendSession(sessionId: string, reason?: string): Promise<void> {
      const session = state.sessions.get(sessionId);
      if (session) {
        (session as { status: string }).status = 'suspended';
        (session as { terminationReason?: string }).terminationReason = reason;
      }
    },

    getSession(sessionId: string): SessionRecord | undefined {
      return state.sessions.get(sessionId);
    },

    getActiveSession(agentId: EntityId): SessionRecord | undefined {
      for (const session of state.sessions.values()) {
        if (session.agentId === agentId && session.status === 'running') {
          return session;
        }
      }
      return undefined;
    },

    listSessions(_filter?: SessionFilter): SessionRecord[] {
      return Array.from(state.sessions.values());
    },

    getMostRecentResumableSession(agentId: EntityId): SessionRecord | undefined {
      const agentSessions = Array.from(state.sessions.values())
        .filter((s) => s.agentId === agentId && s.providerSessionId)
        .sort((a, b) => {
          const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
          const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
          return bTime - aTime;
        });
      return agentSessions[0];
    },

    async getSessionHistory(_agentId: EntityId, _limit?: number): Promise<SessionHistoryEntry[]> {
      return [];
    },

    async getSessionHistoryByRole(role: string, _limit?: number): Promise<RoleSessionHistoryEntry[]> {
      return state.roleHistory.get(role) ?? [];
    },

    async getPreviousSession(role: string): Promise<RoleSessionHistoryEntry | undefined> {
      const history = state.roleHistory.get(role) ?? [];
      return history.find(
        (h) => (h.status === 'suspended' || h.status === 'terminated') && h.providerSessionId
      );
    },

    async messageSession(
      _sessionId: string,
      _options: MessageSessionOptions
    ): Promise<MessageSessionResult> {
      return { success: true };
    },

    getEventEmitter(sessionId: string): EventEmitter | undefined {
      return state.sessions.get(sessionId)?.events;
    },

    async persistSession(_sessionId: string): Promise<void> {},

    async loadSessionState(_agentId: EntityId): Promise<void> {},
  };
}

function createMockRoleHistoryEntry(
  role: 'director' | 'worker' | 'steward',
  options?: {
    agentId?: EntityId;
    providerSessionId?: string | null; // null means explicitly no provider session ID
    status?: 'running' | 'suspended' | 'terminated';
  }
): RoleSessionHistoryEntry {
  const now = createTimestamp();
  // If providerSessionId is explicitly set to null or undefined, don't set it
  const providerSessionId = options?.providerSessionId === null || options?.providerSessionId === undefined
    ? (options?.providerSessionId === null ? undefined : `claude-session-${Date.now()}`)
    : options.providerSessionId;

  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    providerSessionId,
    status: options?.status ?? 'suspended',
    workingDirectory: '/test/predecessor',
    startedAt: now,
    endedAt: now,
    role,
    agentId: options?.agentId ?? testAgentId,
    agentName: `${role}-agent`,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('PredecessorQueryService', () => {
  let service: PredecessorQueryService;
  let sessionManager: SessionManager;
  let mockState: MockSessionManagerState;

  beforeEach(() => {
    mockState = {
      sessions: new Map(),
      roleHistory: new Map(),
    };
    sessionManager = createMockSessionManager(mockState);
    service = createPredecessorQueryService(sessionManager);
  });

  describe('hasPredecessor', () => {
    test('returns false when no sessions exist for role', async () => {
      const result = await service.hasPredecessor('director');
      expect(result).toBe(false);
    });

    test('returns true when suspended session exists with provider session ID', async () => {
      mockState.roleHistory.set('worker', [createMockRoleHistoryEntry('worker')]);

      const result = await service.hasPredecessor('worker');
      expect(result).toBe(true);
    });

    test('returns false when sessions exist but no provider session ID', async () => {
      mockState.roleHistory.set('worker', [
        createMockRoleHistoryEntry('worker', { providerSessionId: null }), // null means no provider session ID
      ]);

      const result = await service.hasPredecessor('worker');
      expect(result).toBe(false);
    });

    test('returns true for terminated session with provider session ID', async () => {
      mockState.roleHistory.set('director', [
        createMockRoleHistoryEntry('director', { status: 'terminated' }),
      ]);

      const result = await service.hasPredecessor('director');
      expect(result).toBe(true);
    });
  });

  describe('getPredecessorInfo', () => {
    test('returns undefined when no predecessor exists', async () => {
      const result = await service.getPredecessorInfo('steward');
      expect(result).toBeUndefined();
    });

    test('returns predecessor info when suspended session exists', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-session-abc',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const result = await service.getPredecessorInfo('worker');

      expect(result).toBeDefined();
      expect(result?.agentId).toBe(testAgentId);
      expect(result?.role).toBe('worker');
      expect(result?.providerSessionId).toBe('claude-session-abc');
      expect(result?.agentName).toBe('worker-agent');
    });

    test('returns undefined when session has no provider session ID', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        providerSessionId: null, // null means no provider session ID
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const result = await service.getPredecessorInfo('worker');
      expect(result).toBeUndefined();
    });
  });

  describe('consultPredecessor', () => {
    test('returns error when no predecessor exists', async () => {
      const result = await service.consultPredecessor(
        testAgentId2,
        'director',
        'What was your approach?'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No predecessor found');
      expect(result.completedAt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('resumes predecessor session with correct options', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-resume-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      let capturedOptions: ResumeSessionOptions | undefined;
      mockState.resumeCallback = (_agentId, options) => {
        capturedOptions = options;
      };

      // Start the query but don't await completion - we'll simulate response
      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'What was your approach?'
      );

      // Give it time to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Find the resumed session and emit response
      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        resumedSession.events.emit('event', {
          type: 'assistant',
          message: 'My approach was...',
          receivedAt: createTimestamp(),
          raw: { type: 'assistant', message: 'My approach was...' },
        });
        resumedSession.events.emit('event', {
          type: 'result',
          receivedAt: createTimestamp(),
          raw: { type: 'result', result: 'success' },
        });
      }

      await queryPromise;

      expect(capturedOptions).toBeDefined();
      expect(capturedOptions?.providerSessionId).toBe('claude-resume-test');
      expect(capturedOptions?.checkReadyQueue).toBe(false);
      expect(capturedOptions?.resumePrompt).toBe('What was your approach?');
    });

    test('includes context in prompt when provided', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-context-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      let capturedOptions: ResumeSessionOptions | undefined;
      mockState.resumeCallback = (_agentId, options) => {
        capturedOptions = options;
      };

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'What was your approach?',
        { context: 'Working on feature X' }
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        resumedSession.events.emit('event', {
          type: 'assistant',
          message: 'Response',
          receivedAt: createTimestamp(),
          raw: { type: 'assistant', message: 'Response' },
        });
        resumedSession.events.emit('event', {
          type: 'result',
          receivedAt: createTimestamp(),
          raw: { type: 'result' },
        });
      }

      await queryPromise;

      expect(capturedOptions?.resumePrompt).toContain('Context: Working on feature X');
      expect(capturedOptions?.resumePrompt).toContain('Question: What was your approach?');
    });

    test('captures response from predecessor', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-response-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'How did you solve the bug?'
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        // Emit multiple message chunks
        resumedSession.events.emit('event', {
          type: 'assistant',
          message: 'I solved the bug ',
          receivedAt: createTimestamp(),
          raw: { type: 'assistant', message: 'I solved the bug ' },
        });
        resumedSession.events.emit('event', {
          type: 'assistant',
          message: 'by refactoring the code.',
          receivedAt: createTimestamp(),
          raw: { type: 'assistant', message: 'by refactoring the code.' },
        });
        resumedSession.events.emit('event', {
          type: 'result',
          receivedAt: createTimestamp(),
          raw: { type: 'result' },
        });
      }

      const result = await queryPromise;

      expect(result.success).toBe(true);
      expect(result.response).toBe('I solved the bug by refactoring the code.');
    });

    test('suspends predecessor after response by default', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-suspend-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'Question?'
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        resumedSession.events.emit('event', {
          type: 'assistant',
          message: 'Answer',
          receivedAt: createTimestamp(),
          raw: { type: 'assistant', message: 'Answer' },
        });
        resumedSession.events.emit('event', {
          type: 'result',
          receivedAt: createTimestamp(),
          raw: { type: 'result' },
        });
      }

      await queryPromise;

      // Check that the session was suspended
      const updatedSession = mockState.sessions.get(resumedSession!.id);
      expect(updatedSession?.status).toBe('suspended');
      expect(updatedSession?.terminationReason).toBe('Predecessor query completed');
    });

    test('does not suspend predecessor when suspendAfterResponse is false', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-no-suspend-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'Question?',
        { suspendAfterResponse: false }
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        resumedSession.events.emit('event', {
          type: 'assistant',
          message: 'Answer',
          receivedAt: createTimestamp(),
          raw: { type: 'assistant', message: 'Answer' },
        });
        resumedSession.events.emit('event', {
          type: 'result',
          receivedAt: createTimestamp(),
          raw: { type: 'result' },
        });
      }

      await queryPromise;

      // Session should still be running
      const updatedSession = mockState.sessions.get(resumedSession!.id);
      expect(updatedSession?.status).toBe('running');
    });

    test('returns predecessor info in result', async () => {
      const historyEntry = createMockRoleHistoryEntry('director', {
        agentId: testAgentId,
        providerSessionId: 'claude-info-test',
      });
      mockState.roleHistory.set('director', [historyEntry]);

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'director',
        'What is the plan?'
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        resumedSession.events.emit('event', {
          type: 'assistant',
          message: 'The plan is...',
          receivedAt: createTimestamp(),
          raw: { type: 'assistant', message: 'The plan is...' },
        });
        resumedSession.events.emit('event', {
          type: 'result',
          receivedAt: createTimestamp(),
          raw: { type: 'result' },
        });
      }

      const result = await queryPromise;

      expect(result.predecessor).toBeDefined();
      expect(result.predecessor?.role).toBe('director');
      expect(result.predecessor?.providerSessionId).toBe('claude-info-test');
    });

    test('handles error events from predecessor', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-error-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'Question?'
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        resumedSession.events.emit('event', {
          type: 'error',
          receivedAt: createTimestamp(),
          raw: { type: 'error', error: 'Session error occurred' },
        });
      }

      const result = await queryPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session error occurred');
    });

    test('handles session exit with accumulated response', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-exit-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'Question?'
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        resumedSession.events.emit('event', {
          type: 'assistant',
          message: 'Partial response',
          receivedAt: createTimestamp(),
          raw: { type: 'assistant', message: 'Partial response' },
        });
        // Exit without result event
        resumedSession.events.emit('exit', 0, null);
      }

      const result = await queryPromise;

      expect(result.success).toBe(true);
      expect(result.response).toBe('Partial response');
    });

    test('handles session exit without response', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-exit-no-response',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'Question?'
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        // Exit without any response
        resumedSession.events.emit('exit', 1, null);
      }

      const result = await queryPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('exited with code 1');
    });
  });

  describe('active query management', () => {
    test('lists active queries', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-active-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      // Start a query
      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'Question?'
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const activeQueries = service.listActiveQueries();
      expect(activeQueries.length).toBe(1);
      expect(activeQueries[0].targetRole).toBe('worker');
      expect(activeQueries[0].message).toBe('Question?');

      // Complete the query
      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        resumedSession.events.emit('event', {
          type: 'result',
          receivedAt: createTimestamp(),
          raw: { type: 'result' },
        });
      }

      await queryPromise;
    });

    test('gets active query by ID', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-get-query-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'Question?'
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const activeQueries = service.listActiveQueries();
      expect(activeQueries.length).toBe(1);

      const query = service.getActiveQuery(activeQueries[0].id);
      expect(query).toBeDefined();
      expect(query?.requestingAgentId).toBe(testAgentId2);

      // Complete the query
      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        resumedSession.events.emit('event', {
          type: 'result',
          receivedAt: createTimestamp(),
          raw: { type: 'result' },
        });
      }

      await queryPromise;
    });

    test('cancels active query', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-cancel-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'Question?'
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const activeQueries = service.listActiveQueries();
      expect(activeQueries.length).toBe(1);

      // Cancel the query
      await service.cancelQuery(activeQueries[0].id);

      const result = await queryPromise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Query was cancelled');

      // Should be removed from active queries
      expect(service.listActiveQueries().length).toBe(0);
    });

    test('returns undefined for non-existent query ID', () => {
      const query = service.getActiveQuery('non-existent-id');
      expect(query).toBeUndefined();
    });

    test('cancel does nothing for non-existent query', async () => {
      // Should not throw
      await service.cancelQuery('non-existent-id');
    });
  });

  describe('timeout handling', () => {
    test('uses default timeout when not specified', async () => {
      // This is hard to test directly, but we verify the constant exists
      expect(DEFAULT_QUERY_TIMEOUT_MS).toBe(60000);
    });

    test('respects minimum timeout', async () => {
      expect(MIN_QUERY_TIMEOUT_MS).toBe(10000);
    });

    test('respects maximum timeout', async () => {
      expect(MAX_QUERY_TIMEOUT_MS).toBe(300000);
    });
  });

  describe('error classes', () => {
    test('TimeoutError has correct name', () => {
      const error = new TimeoutError('Test timeout');
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Test timeout');
    });

    test('NoPredecessorError has correct name and message', () => {
      const error = new NoPredecessorError('worker');
      expect(error.name).toBe('NoPredecessorError');
      expect(error.message).toBe('No predecessor found for role: worker');
    });
  });

  describe('query status tracking', () => {
    test('tracks query status through lifecycle', async () => {
      const historyEntry = createMockRoleHistoryEntry('worker', {
        agentId: testAgentId,
        providerSessionId: 'claude-status-test',
      });
      mockState.roleHistory.set('worker', [historyEntry]);

      const queryPromise = service.consultPredecessor(
        testAgentId2,
        'worker',
        'Question?'
      );

      // Give time for status to change to waiting_response
      await new Promise((resolve) => setTimeout(resolve, 100));

      const activeQueries = service.listActiveQueries();
      expect(activeQueries.length).toBe(1);
      expect(activeQueries[0].status).toBe('waiting_response');

      // Complete the query
      const sessions = Array.from(mockState.sessions.values());
      const resumedSession = sessions.find((s) => s.status === 'running');
      if (resumedSession) {
        resumedSession.events.emit('event', {
          type: 'assistant',
          message: 'Done',
          receivedAt: createTimestamp(),
          raw: { type: 'assistant', message: 'Done' },
        });
        resumedSession.events.emit('event', {
          type: 'result',
          receivedAt: createTimestamp(),
          raw: { type: 'result' },
        });
      }

      await queryPromise;
    });
  });
});
