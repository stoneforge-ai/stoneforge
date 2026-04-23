/**
 * Handoff Service Unit Tests (TB-O10e)
 *
 * Tests for the HandoffService which enables agent session handoffs:
 * - Self-handoff: Agent hands off to fresh instance of itself
 * - Agent-to-agent handoff: Agent hands off to another agent (TB-O10f)
 *
 * Note: These tests use mock implementations of SessionManager, AgentRegistry,
 * and QuarryAPI to test handoff logic without actual processes or database.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { EntityId, ChannelId, DocumentId, Document, Message } from '@stoneforge/core';
import { createTimestamp, ElementType, ContentType } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';
import type { SessionManager, SessionRecord, SessionFilter, SessionHistoryEntry, RoleSessionHistoryEntry } from './session-manager.js';
import type { AgentRegistry, AgentEntity } from '../services/agent-registry.js';
import type { AgentMetadata, AgentRole } from '../types/agent.js';
import {
  createHandoffService,
  type HandoffService,
  type SelfHandoffOptions,
  type AgentHandoffOptions,
  HANDOFF_DOCUMENT_TAG,
  HANDOFF_MESSAGE_TYPE,
} from './handoff.js';

// ============================================================================
// Mock Factories
// ============================================================================

const testAgentId = 'el-test001' as EntityId;
const testAgentId2 = 'el-test002' as EntityId;
const testCreatorId = 'el-creator' as EntityId;
const testChannelId = 'el-chan001' as ChannelId;
const testChannelId2 = 'el-chan002' as ChannelId;

let sessionIdCounter = 0;
let documentIdCounter = 0;
let messageIdCounter = 0;

function createMockAgent(
  agentId: EntityId,
  channelId?: ChannelId,
  role: AgentRole = 'worker'
): AgentEntity {
  const baseMetadata = {
    agentRole: role,
    workerMode: role === 'worker' ? ('ephemeral' as const) : undefined,
    sessionStatus: 'idle' as const,
    channelId,
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

function createMockSession(
  agentId: EntityId,
  status: 'running' | 'suspended' | 'terminated' = 'running'
): SessionRecord {
  sessionIdCounter++;
  const now = createTimestamp();
  return {
    id: `session-mock-${sessionIdCounter}`,
    providerSessionId: `claude-session-${sessionIdCounter}`,
    agentId,
    agentRole: 'worker',
    workerMode: 'ephemeral',
    pid: 12345 + sessionIdCounter,
    status,
    workingDirectory: '/tmp',
    createdAt: now,
    startedAt: now,
    lastActivityAt: now,
    endedAt: status !== 'running' ? now : undefined,
  };
}

function createMockSessionManager(sessions: Map<string, SessionRecord>): SessionManager {
  const sessionHistory = new Map<EntityId, SessionHistoryEntry[]>();

  return {
    async startSession(agentId: EntityId, options?: any): Promise<{ session: SessionRecord; events: EventEmitter }> {
      const session = createMockSession(agentId);
      sessions.set(session.id, session);
      return { session, events: new EventEmitter() };
    },

    async resumeSession(agentId: EntityId, options: any): Promise<{ session: SessionRecord; events: EventEmitter; uwpCheck?: any }> {
      const session = createMockSession(agentId);
      sessions.set(session.id, session);
      return { session, events: new EventEmitter() };
    },

    async stopSession(sessionId: string, options?: any): Promise<void> {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      const updatedSession = {
        ...session,
        status: 'terminated' as const,
        endedAt: createTimestamp(),
      };
      sessions.set(sessionId, updatedSession);
    },

    async suspendSession(sessionId: string, reason?: string): Promise<void> {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      const updatedSession = {
        ...session,
        status: 'suspended' as const,
        endedAt: createTimestamp(),
        terminationReason: reason,
      };
      sessions.set(sessionId, updatedSession);
    },

    getSession(sessionId: string): SessionRecord | undefined {
      return sessions.get(sessionId);
    },

    getActiveSession(agentId: EntityId): SessionRecord | undefined {
      for (const session of sessions.values()) {
        if (session.agentId === agentId && session.status === 'running') {
          return session;
        }
      }
      return undefined;
    },

    listSessions(filter?: SessionFilter): SessionRecord[] {
      return Array.from(sessions.values());
    },

    getMostRecentResumableSession(agentId: EntityId): SessionRecord | undefined {
      const agentSessions = Array.from(sessions.values())
        .filter((s) => s.agentId === agentId && s.providerSessionId)
        .sort((a, b) => {
          const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
          const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
          return bTime - aTime;
        });
      return agentSessions[0];
    },

    async getSessionHistory(agentId: EntityId, limit?: number): Promise<SessionHistoryEntry[]> {
      return sessionHistory.get(agentId)?.slice(0, limit) ?? [];
    },

    async getSessionHistoryByRole(role: AgentRole, limit?: number): Promise<RoleSessionHistoryEntry[]> {
      return [];
    },

    async getPreviousSession(role: AgentRole): Promise<RoleSessionHistoryEntry | undefined> {
      return undefined;
    },

    async messageSession(sessionId: string, options: any): Promise<any> {
      return { success: true };
    },

    getEventEmitter(sessionId: string): EventEmitter | undefined {
      const session = sessions.get(sessionId);
      if (!session) return undefined;
      return new EventEmitter();
    },

    async persistSession(sessionId: string): Promise<void> {},

    async loadSessionState(agentId: EntityId): Promise<void> {},
  };
}

function createMockAgentRegistry(
  agents: Map<EntityId, AgentEntity>,
  channels: Map<EntityId, ChannelId>
): AgentRegistry {
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

    async getAgentsByRole(role: AgentRole): Promise<AgentEntity[]> {
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
      return [];
    },

    async getDirector(): Promise<AgentEntity | undefined> {
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
      return agent;
    },

    async updateAgentMetadata(
      entityId: EntityId,
      updates: Partial<AgentMetadata>
    ): Promise<AgentEntity> {
      const agent = agents.get(entityId);
      if (!agent) {
        throw new Error(`Agent not found: ${entityId}`);
      }
      return agent;
    },

    async getAgentChannel(entityId: EntityId): Promise<any | undefined> {
      const channelId = channels.get(entityId);
      if (!channelId) return undefined;
      return { id: channelId, name: `agent-${entityId}` };
    },

    async getAgentChannelId(entityId: EntityId): Promise<ChannelId | undefined> {
      return channels.get(entityId);
    },
  } as AgentRegistry;
}

function createMockApi(
  savedDocuments: Map<string, Document>,
  savedMessages: Map<string, Message>,
  listDocuments: Document[] = []
): QuarryAPI {
  return {
    async create(element: any): Promise<any> {
      if (element.type === ElementType.DOCUMENT) {
        documentIdCounter++;
        const docId = `el-doc${documentIdCounter.toString().padStart(3, '0')}` as DocumentId;
        const doc = { ...element, id: docId } as Document;
        savedDocuments.set(docId, doc);
        return doc;
      }
      if (element.type === ElementType.MESSAGE) {
        messageIdCounter++;
        const msgId = `el-msg${messageIdCounter.toString().padStart(3, '0')}`;
        const msg = { ...element, id: msgId } as Message;
        savedMessages.set(msgId, msg);
        return msg;
      }
      return element;
    },

    async list(filter?: any): Promise<any[]> {
      if (filter?.type === 'document') {
        if (filter?.tags?.includes(HANDOFF_DOCUMENT_TAG)) {
          return listDocuments.filter((doc) =>
            doc.tags?.includes(HANDOFF_DOCUMENT_TAG)
          );
        }
        return listDocuments;
      }
      return [];
    },

    // Add other required methods as stubs
    async get(id: string): Promise<any> {
      return savedDocuments.get(id) ?? savedMessages.get(id);
    },

    async update(id: string, updates: any): Promise<any> {
      return { id, ...updates };
    },

    async delete(id: string): Promise<void> {},
  } as unknown as QuarryAPI;
}

// ============================================================================
// Tests
// ============================================================================

describe('HandoffService', () => {
  let handoffService: HandoffService;
  let sessionManager: SessionManager;
  let registry: AgentRegistry;
  let api: QuarryAPI;
  let sessions: Map<string, SessionRecord>;
  let agents: Map<EntityId, AgentEntity>;
  let channels: Map<EntityId, ChannelId>;
  let savedDocuments: Map<string, Document>;
  let savedMessages: Map<string, Message>;

  beforeEach(() => {
    sessionIdCounter = 0;
    documentIdCounter = 0;
    messageIdCounter = 0;

    sessions = new Map();
    agents = new Map();
    channels = new Map();
    savedDocuments = new Map();
    savedMessages = new Map();

    // Set up agents with channels
    agents.set(testAgentId, createMockAgent(testAgentId, testChannelId));
    agents.set(testAgentId2, createMockAgent(testAgentId2, testChannelId2));
    channels.set(testAgentId, testChannelId);
    channels.set(testAgentId2, testChannelId2);

    sessionManager = createMockSessionManager(sessions);
    registry = createMockAgentRegistry(agents, channels);
    api = createMockApi(savedDocuments, savedMessages);
    handoffService = createHandoffService(sessionManager, registry, api);
  });

  // ============================================================================
  // TB-O10e: Self-Handoff Tests
  // ============================================================================

  describe('selfHandoff', () => {
    test('successfully performs self-handoff for running session', async () => {
      // Create a running session for the agent
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: SelfHandoffOptions = {
        contextSummary: 'Working on feature X, completed steps 1-3, step 4 in progress',
        nextSteps: 'Continue with step 4, then proceed to step 5',
        reason: 'Context overflow',
      };

      const result = await handoffService.selfHandoff(testAgentId, session.id, options);

      expect(result.success).toBe(true);
      expect(result.handoffDocumentId).toBeDefined();
      expect(result.messageId).toBeDefined();
      expect(result.suspendedSession).toBeDefined();
      expect(result.suspendedSession?.status).toBe('suspended');
      expect(result.error).toBeUndefined();
    });

    test('creates handoff document with correct content', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: SelfHandoffOptions = {
        contextSummary: 'Test context summary',
        nextSteps: 'Test next steps',
        reason: 'Test reason',
        metadata: { customField: 'customValue' },
      };

      const result = await handoffService.selfHandoff(testAgentId, session.id, options);

      expect(result.success).toBe(true);
      expect(savedDocuments.size).toBe(1);

      const doc = savedDocuments.get(result.handoffDocumentId as string);
      expect(doc).toBeDefined();
      expect(doc?.tags).toContain(HANDOFF_DOCUMENT_TAG);
      expect(doc?.tags).toContain('self-handoff');
      expect(doc?.metadata?.handoffType).toBe('self');
      expect(doc?.metadata?.fromAgentId).toBe(testAgentId);
      expect(doc?.metadata?.customField).toBe('customValue');

      // Verify document content
      const content = JSON.parse(doc?.content ?? '{}');
      expect(content.type).toBe('handoff');
      expect(content.fromAgentId).toBe(testAgentId);
      expect(content.toAgentId).toBeUndefined();
      expect(content.contextSummary).toBe('Test context summary');
      expect(content.nextSteps).toBe('Test next steps');
      expect(content.reason).toBe('Test reason');
      expect(content.providerSessionId).toBe(session.providerSessionId);
    });

    test('creates handoff message in agent channel', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: SelfHandoffOptions = {
        contextSummary: 'Test context',
      };

      const result = await handoffService.selfHandoff(testAgentId, session.id, options);

      expect(result.success).toBe(true);
      expect(savedMessages.size).toBe(1);

      const msg = savedMessages.get(result.messageId as string);
      expect(msg).toBeDefined();
      expect(msg?.channelId).toBe(testChannelId);
      expect(msg?.sender).toBe(testAgentId);
      expect(msg?.metadata?.type).toBe(HANDOFF_MESSAGE_TYPE);
      expect(msg?.metadata?.handoffType).toBe('self');
      expect(msg?.metadata?.fromAgentId).toBe(testAgentId);
    });

    test('suspends the session after handoff', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: SelfHandoffOptions = {
        contextSummary: 'Test context',
        reason: 'Custom reason',
      };

      const result = await handoffService.selfHandoff(testAgentId, session.id, options);

      expect(result.success).toBe(true);

      const updatedSession = sessions.get(session.id);
      expect(updatedSession?.status).toBe('suspended');
      expect(updatedSession?.terminationReason).toBe('Self-handoff: Custom reason');
    });

    test('fails for non-existent session', async () => {
      const options: SelfHandoffOptions = {
        contextSummary: 'Test context',
      };

      const result = await handoffService.selfHandoff(testAgentId, 'nonexistent-session', options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    test('fails for session belonging to different agent', async () => {
      const session = createMockSession(testAgentId2, 'running'); // Session belongs to agent2
      sessions.set(session.id, session);

      const options: SelfHandoffOptions = {
        contextSummary: 'Test context',
      };

      // Try to handoff as agent1
      const result = await handoffService.selfHandoff(testAgentId, session.id, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not belong to agent');
    });

    test('fails for non-running session', async () => {
      const session = createMockSession(testAgentId, 'suspended');
      sessions.set(session.id, session);

      const options: SelfHandoffOptions = {
        contextSummary: 'Test context',
      };

      const result = await handoffService.selfHandoff(testAgentId, session.id, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot handoff session in status');
    });

    test('fails for agent without channel', async () => {
      // Create agent without channel
      const noChannelAgentId = 'el-nochann' as EntityId;
      agents.set(noChannelAgentId, createMockAgent(noChannelAgentId, undefined));
      // Don't add channel

      const session = createMockSession(noChannelAgentId, 'running');
      sessions.set(session.id, session);

      const options: SelfHandoffOptions = {
        contextSummary: 'Test context',
      };

      const result = await handoffService.selfHandoff(noChannelAgentId, session.id, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('has no channel');
    });

    test('includes provider session ID for predecessor queries', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: SelfHandoffOptions = {
        contextSummary: 'Test context',
      };

      const result = await handoffService.selfHandoff(testAgentId, session.id, options);

      expect(result.success).toBe(true);

      const doc = savedDocuments.get(result.handoffDocumentId as string);
      const content = JSON.parse(doc?.content ?? '{}');
      expect(content.providerSessionId).toBe(session.providerSessionId);
    });

    test('preserves provider session ID in suspended session', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);
      const originalClaudeSessionId = session.providerSessionId;

      const options: SelfHandoffOptions = {
        contextSummary: 'Test context',
      };

      const result = await handoffService.selfHandoff(testAgentId, session.id, options);

      expect(result.success).toBe(true);
      expect(result.suspendedSession?.providerSessionId).toBe(originalClaudeSessionId);
    });
  });

  // ============================================================================
  // TB-O10f: Agent-to-Agent Handoff Tests
  // ============================================================================

  describe('handoffToAgent', () => {
    test('successfully performs handoff to another agent', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: AgentHandoffOptions = {
        contextSummary: 'Handing off task X to another agent',
        nextSteps: 'Continue with the implementation',
        reason: 'Need specialist expertise',
        taskIds: ['task-001', 'task-002'],
      };

      const result = await handoffService.handoffToAgent(
        testAgentId,
        testAgentId2,
        session.id,
        options
      );

      expect(result.success).toBe(true);
      expect(result.handoffDocumentId).toBeDefined();
      expect(result.messageId).toBeDefined();
      expect(result.targetAgentId).toBe(testAgentId2);
      expect(result.suspendedSession).toBeDefined();
    });

    test('creates handoff document with target agent info', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: AgentHandoffOptions = {
        contextSummary: 'Transfer context',
        taskIds: ['task-001'],
      };

      const result = await handoffService.handoffToAgent(
        testAgentId,
        testAgentId2,
        session.id,
        options
      );

      expect(result.success).toBe(true);

      const doc = savedDocuments.get(result.handoffDocumentId as string);
      expect(doc?.tags).toContain(HANDOFF_DOCUMENT_TAG);
      expect(doc?.tags).toContain('agent-handoff');
      expect(doc?.metadata?.handoffType).toBe('agent-to-agent');
      expect(doc?.metadata?.fromAgentId).toBe(testAgentId);
      expect(doc?.metadata?.toAgentId).toBe(testAgentId2);
      expect(doc?.metadata?.taskIds).toEqual(['task-001']);

      const content = JSON.parse(doc?.content ?? '{}');
      expect(content.toAgentId).toBe(testAgentId2);
      expect(content.taskIds).toEqual(['task-001']);
    });

    test('sends message to target agent channel', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: AgentHandoffOptions = {
        contextSummary: 'Transfer context',
      };

      const result = await handoffService.handoffToAgent(
        testAgentId,
        testAgentId2,
        session.id,
        options
      );

      expect(result.success).toBe(true);

      const msg = savedMessages.get(result.messageId as string);
      expect(msg?.channelId).toBe(testChannelId2); // Target agent's channel
      expect(msg?.sender).toBe(testAgentId); // From source agent
      expect(msg?.metadata?.type).toBe(HANDOFF_MESSAGE_TYPE);
      expect(msg?.metadata?.handoffType).toBe('agent-to-agent');
      expect(msg?.metadata?.toAgentId).toBe(testAgentId2);
    });

    test('fails for non-existent target agent', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const nonExistentAgent = 'el-noexist' as EntityId;

      const options: AgentHandoffOptions = {
        contextSummary: 'Transfer context',
      };

      const result = await handoffService.handoffToAgent(
        testAgentId,
        nonExistentAgent,
        session.id,
        options
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Target agent not found');
    });

    test('fails for target agent without channel', async () => {
      // Create agent without channel
      const noChannelAgentId = 'el-nochann' as EntityId;
      agents.set(noChannelAgentId, createMockAgent(noChannelAgentId, undefined));

      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: AgentHandoffOptions = {
        contextSummary: 'Transfer context',
      };

      const result = await handoffService.handoffToAgent(
        testAgentId,
        noChannelAgentId,
        session.id,
        options
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('has no channel');
    });

    test('suspends source session after handoff', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: AgentHandoffOptions = {
        contextSummary: 'Transfer context',
        reason: 'Custom handoff reason',
      };

      const result = await handoffService.handoffToAgent(
        testAgentId,
        testAgentId2,
        session.id,
        options
      );

      expect(result.success).toBe(true);

      const updatedSession = sessions.get(session.id);
      expect(updatedSession?.status).toBe('suspended');
      expect(updatedSession?.terminationReason).toContain(testAgentId2);
    });
  });

  // ============================================================================
  // Handoff Query Tests
  // ============================================================================

  describe('getLastHandoff', () => {
    test('returns undefined when no handoff exists', async () => {
      const handoff = await handoffService.getLastHandoff(testAgentId);
      expect(handoff).toBeUndefined();
    });

    test('returns most recent self-handoff', async () => {
      // Create a running session and do a self-handoff
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: SelfHandoffOptions = {
        contextSummary: 'Latest context',
        nextSteps: 'Do something',
      };

      await handoffService.selfHandoff(testAgentId, session.id, options);

      // Now update the mock API to return the saved documents in list()
      const listDocuments = Array.from(savedDocuments.values());
      api = createMockApi(savedDocuments, savedMessages, listDocuments);
      handoffService = createHandoffService(sessionManager, registry, api);

      const handoff = await handoffService.getLastHandoff(testAgentId);

      expect(handoff).toBeDefined();
      expect(handoff?.type).toBe('handoff');
      expect(handoff?.fromAgentId).toBe(testAgentId);
      expect(handoff?.contextSummary).toBe('Latest context');
      expect(handoff?.nextSteps).toBe('Do something');
    });

    test('returns most recent agent-to-agent handoff for target', async () => {
      // Create a running session for source agent
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      const options: AgentHandoffOptions = {
        contextSummary: 'Transfer to you',
        taskIds: ['task-001'],
      };

      await handoffService.handoffToAgent(testAgentId, testAgentId2, session.id, options);

      // Update mock API to return saved documents
      const listDocuments = Array.from(savedDocuments.values());
      api = createMockApi(savedDocuments, savedMessages, listDocuments);
      handoffService = createHandoffService(sessionManager, registry, api);

      // Check handoff for target agent
      const handoff = await handoffService.getLastHandoff(testAgentId2);

      expect(handoff).toBeDefined();
      expect(handoff?.toAgentId).toBe(testAgentId2);
      expect(handoff?.fromAgentId).toBe(testAgentId);
      expect(handoff?.taskIds).toEqual(['task-001']);
    });
  });

  describe('hasPendingHandoff', () => {
    test('returns false when no handoff exists', async () => {
      const hasPending = await handoffService.hasPendingHandoff(testAgentId);
      expect(hasPending).toBe(false);
    });

    test('returns true after self-handoff', async () => {
      const session = createMockSession(testAgentId, 'running');
      sessions.set(session.id, session);

      await handoffService.selfHandoff(testAgentId, session.id, {
        contextSummary: 'Test context',
      });

      // Update mock API
      const listDocuments = Array.from(savedDocuments.values());
      api = createMockApi(savedDocuments, savedMessages, listDocuments);
      handoffService = createHandoffService(sessionManager, registry, api);

      const hasPending = await handoffService.hasPendingHandoff(testAgentId);
      expect(hasPending).toBe(true);
    });
  });
});
