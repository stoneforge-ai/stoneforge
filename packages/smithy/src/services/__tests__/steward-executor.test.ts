/**
 * Steward Executor Integration Tests
 *
 * Integration tests that verify the full trigger-to-execution path:
 * trigger fires -> executor called -> correct steward service invoked -> real result returned.
 *
 * - 'merge' stewards call MergeStewardService.processAllPending()
 * - 'docs' stewards spawn agent sessions via SessionManager
 *
 * These tests use mocked services passed to createStewardExecutor(), and exercise the
 * scheduler's executeSteward() / publishEvent() to trigger execution without waiting for cron.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EntityId } from '@stoneforge/core';
import { EntityTypeValue, createTimestamp } from '@stoneforge/core';

import type {
  StewardTrigger,
  StewardMetadata,
  StewardFocus,
} from '../../types/index.js';
import type { AgentRegistry, AgentEntity } from '../agent-registry.js';
import {
  createStewardScheduler,
  createStewardExecutor,
  type StewardExecutor,
  type StewardScheduler,
  type StewardExecutorDeps,
} from '../steward-scheduler.js';
import type { MergeStewardService } from '../merge-steward-service.js';
import type { DocsStewardService } from '../docs-steward-service.js';
import type { SessionManager } from '../../runtime/session-manager.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockAgentEntity(
  id: string,
  name: string,
  focus: StewardFocus,
  triggers: StewardTrigger[] = []
): AgentEntity {
  const metadata: StewardMetadata = {
    agentRole: 'steward',
    stewardFocus: focus,
    triggers,
    sessionStatus: 'idle',
  };

  return {
    id: id,
    type: 'entity',
    name,
    entityType: EntityTypeValue.AGENT,
    createdBy: 'test-user' as EntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    version: 1,
    metadata: { agent: metadata },
    tags: [],
  } as unknown as AgentEntity;
}

function createMockAgentRegistry(
  agents: AgentEntity[] = []
): AgentRegistry {
  return {
    registerAgent: vi.fn(),
    registerDirector: vi.fn(),
    registerWorker: vi.fn(),
    registerSteward: vi.fn(),
    getAgent: vi.fn(async (id: EntityId) => agents.find(a => String(a.id) === String(id))),
    getAgentByName: vi.fn(async (name: string) => agents.find(a => a.name === name)),
    listAgents: vi.fn(async () => agents),
    getAgentsByRole: vi.fn(async (role: string) =>
      agents.filter(a => {
        const meta = a.metadata?.agent as StewardMetadata | undefined;
        return meta?.agentRole === role;
      })
    ),
    getAvailableWorkers: vi.fn(async () => []),
    getStewards: vi.fn(async () =>
      agents.filter(a => {
        const meta = a.metadata?.agent as StewardMetadata | undefined;
        return meta?.agentRole === 'steward';
      })
    ),
    getDirector: vi.fn(async () => undefined),
    updateAgentSession: vi.fn(async (id: EntityId) => agents.find(a => String(a.id) === String(id))),
    updateAgentMetadata: vi.fn(async (id: EntityId, _updates: unknown) => {
      const agent = agents.find(a => String(a.id) === String(id));
      return agent;
    }),
    getAgentChannel: vi.fn(async () => undefined),
    getAgentChannelId: vi.fn(async () => undefined),
  } as unknown as AgentRegistry;
}

function createMockMergeStewardService(): MergeStewardService {
  return {
    processAllPending: vi.fn(async () => ({
      totalProcessed: 3,
      mergedCount: 2,
      testFailedCount: 0,
      conflictCount: 0,
      errorCount: 1,
      results: [],
      durationMs: 150,
    })),
    getTasksAwaitingMerge: vi.fn(async () => []),
    runTests: vi.fn(),
    mergeTask: vi.fn(),
    processTask: vi.fn(),
  } as unknown as MergeStewardService;
}

function createMockDocsStewardService(): DocsStewardService {
  return {
    scanAll: vi.fn(async () => ({
      issues: [
        { type: 'file_path', file: 'docs/guide.md', line: 10, description: 'Broken path', currentValue: './missing.ts', confidence: 'high', context: '', complexity: 'low' },
        { type: 'internal_link', file: 'docs/api.md', line: 25, description: 'Dead link', currentValue: '#nonexistent', confidence: 'medium', context: '', complexity: 'low' },
      ],
      filesScanned: 42,
      durationMs: 300,
    })),
    verifyFilePaths: vi.fn(async () => []),
    verifyInternalLinks: vi.fn(async () => []),
    verifyExports: vi.fn(async () => []),
    verifyCliCommands: vi.fn(async () => []),
    verifyTypeFields: vi.fn(async () => []),
    verifyApiMethods: vi.fn(async () => []),
  } as unknown as DocsStewardService;
}

function createMockSessionManager(): SessionManager {
  return {
    getActiveSession: vi.fn(() => undefined),
    startSession: vi.fn(async (_agentId: EntityId, _options?: unknown) => ({
      session: {
        id: `session-mock-${Date.now()}`,
        agentId: _agentId,
        mode: 'headless' as const,
        status: 'running' as const,
        agentRole: 'steward',
      },
      events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    })),
  } as unknown as SessionManager;
}

function createDeps(overrides: Partial<StewardExecutorDeps> = {}): StewardExecutorDeps {
  return {
    mergeStewardService: overrides.mergeStewardService ?? createMockMergeStewardService(),
    docsStewardService: overrides.docsStewardService ?? createMockDocsStewardService(),
    sessionManager: overrides.sessionManager ?? createMockSessionManager(),
    projectRoot: overrides.projectRoot ?? '/tmp/test-project',
  };
}

// ============================================================================
// Integration Tests: Trigger -> Executor -> Service -> Result
// ============================================================================

describe('Steward Executor Integration Tests', () => {
  let deps: StewardExecutorDeps;
  let executor: StewardExecutor;

  beforeEach(() => {
    deps = createDeps();
    executor = createStewardExecutor(deps);
  });

  // --------------------------------------------------------------------------
  // Test 1: Merge steward cron trigger
  // --------------------------------------------------------------------------
  describe('merge steward cron trigger', () => {
    it('should call mergeStewardService.processAllPending() and return real data', async () => {
      const mergeSteward = createMockAgentEntity('merge-steward-1', 'Merger', 'merge', [
        { type: 'cron', schedule: '*/5 * * * *' },
      ]);
      const registry = createMockAgentRegistry([mergeSteward]);
      const scheduler = createStewardScheduler(registry, executor);

      // Manually execute the steward (simulates cron fire)
      const result = await scheduler.executeSteward('merge-steward-1' as EntityId);

      expect(result.success).toBe(true);
      expect(deps.mergeStewardService.processAllPending).toHaveBeenCalledTimes(1);
      expect(result.output).toContain('Processed 3 tasks');
      expect(result.output).toContain('2 merged');
      expect(result.output).toContain('1 failed');
      expect(result.itemsProcessed).toBe(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      await scheduler.stop();
    });

    it('should record execution in scheduler history', async () => {
      const mergeSteward = createMockAgentEntity('merge-steward-1', 'Merger', 'merge', [
        { type: 'cron', schedule: '*/5 * * * *' },
      ]);
      const registry = createMockAgentRegistry([mergeSteward]);
      const scheduler = createStewardScheduler(registry, executor);

      await scheduler.executeSteward('merge-steward-1' as EntityId);

      const history = scheduler.getExecutionHistory();
      expect(history.length).toBe(1);
      expect(history[0].stewardId).toBe('merge-steward-1');
      expect(history[0].result?.success).toBe(true);
      expect(history[0].result?.itemsProcessed).toBe(3);

      await scheduler.stop();
    });
  });

  // --------------------------------------------------------------------------
  // Test 2: Docs steward cron trigger
  // --------------------------------------------------------------------------
  describe('docs steward cron trigger', () => {
    it('should spawn a session via sessionManager', async () => {
      const docsSteward = createMockAgentEntity('docs-steward-1', 'DocsScanner', 'docs', [
        { type: 'cron', schedule: '0 */6 * * *' },
      ]);
      const registry = createMockAgentRegistry([docsSteward]);
      const scheduler = createStewardScheduler(registry, executor);

      const result = await scheduler.executeSteward('docs-steward-1' as EntityId);

      expect(result.success).toBe(true);
      expect(deps.sessionManager.startSession).toHaveBeenCalledTimes(1);
      expect(result.output).toContain('Spawned docs steward session');
      expect(result.itemsProcessed).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      await scheduler.stop();
    });
  });

  // --------------------------------------------------------------------------
  // Test 3: Unknown focus type
  // --------------------------------------------------------------------------
  describe('unknown focus type', () => {
    it('should return success: false gracefully when executor receives unknown focus', async () => {
      // Call the executor directly with an agent that has no valid metadata.
      // getAgentMetadata returns undefined when validation fails for an invalid
      // focus, so the executor sees focus = undefined and hits the default branch.
      const unknownAgent = {
        id: 'unknown-steward-1',
        type: 'entity',
        name: 'UnknownSteward',
        entityType: EntityTypeValue.AGENT,
        createdBy: 'test-user' as EntityId,
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
        version: 1,
        // No valid agent metadata — simulates an entity with an unrecognised focus
        metadata: {},
        tags: [],
      } as unknown as AgentEntity;

      const result = await executor(unknownAgent, {
        trigger: { type: 'event' as const, event: 'manual' },
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown steward focus');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // No service should have been called
      expect(deps.mergeStewardService.processAllPending).not.toHaveBeenCalled();
      expect(deps.docsStewardService.scanAll).not.toHaveBeenCalled();
    });

    it('should return success: false via scheduler when steward has invalid focus', async () => {
      // When the agent metadata validation rejects the focus, the scheduler
      // returns an error before even reaching the executor.
      const unknownSteward = createMockAgentEntity(
        'unknown-steward-1',
        'UnknownSteward',
        'invalid-focus' as StewardFocus,
        [{ type: 'cron', schedule: '* * * * *' }]
      );
      const registry = createMockAgentRegistry([unknownSteward]);
      const scheduler = createStewardScheduler(registry, executor);

      const result = await scheduler.executeSteward('unknown-steward-1' as EntityId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a steward');
      expect(result.durationMs).toBe(0);

      await scheduler.stop();
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: Service error handling
  // --------------------------------------------------------------------------
  describe('service error handling', () => {
    it('should return success: false with error message when service throws', async () => {
      const failingMergeService = createMockMergeStewardService();
      (failingMergeService.processAllPending as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection lost')
      );

      const failDeps = createDeps({ mergeStewardService: failingMergeService });
      const failExecutor = createStewardExecutor(failDeps);

      const mergeSteward = createMockAgentEntity('merge-steward-1', 'FailingMerger', 'merge', [
        { type: 'cron', schedule: '*/5 * * * *' },
      ]);
      const registry = createMockAgentRegistry([mergeSteward]);
      const scheduler = createStewardScheduler(registry, failExecutor);

      const result = await scheduler.executeSteward('merge-steward-1' as EntityId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection lost');
      expect(result.output).toContain('Database connection lost');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      await scheduler.stop();
    });

    it('should continue operating after one steward fails (error isolation)', async () => {
      const failingMergeService = createMockMergeStewardService();
      (failingMergeService.processAllPending as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Merge service crashed')
      );

      const isolationDeps = createDeps({ mergeStewardService: failingMergeService });
      const isolationExecutor = createStewardExecutor(isolationDeps);

      // Set up two stewards: one that will fail (merge) and one that should succeed (docs via session)
      const mergeSteward = createMockAgentEntity('merge-steward-1', 'FailingMerger', 'merge', [
        { type: 'cron', schedule: '*/5 * * * *' },
      ]);
      const docsSteward = createMockAgentEntity('docs-steward-1', 'DocsScanner', 'docs', [
        { type: 'cron', schedule: '*/10 * * * *' },
      ]);
      const registry = createMockAgentRegistry([mergeSteward, docsSteward]);
      const scheduler = createStewardScheduler(registry, isolationExecutor);

      // Execute the failing merge steward first
      const mergeResult = await scheduler.executeSteward('merge-steward-1' as EntityId);
      expect(mergeResult.success).toBe(false);
      expect(mergeResult.error).toBe('Merge service crashed');

      // The scheduler should still work fine - execute docs steward (spawns session)
      const docsResult = await scheduler.executeSteward('docs-steward-1' as EntityId);
      expect(docsResult.success).toBe(true);
      expect(isolationDeps.sessionManager.startSession).toHaveBeenCalledTimes(1);
      expect(docsResult.itemsProcessed).toBe(1);

      // Verify both executions are recorded in history
      const history = scheduler.getExecutionHistory();
      expect(history.length).toBe(2);

      const failedHistory = scheduler.getExecutionHistory({ success: false });
      expect(failedHistory.length).toBe(1);

      const successHistory = scheduler.getExecutionHistory({ success: true });
      expect(successHistory.length).toBe(1);

      await scheduler.stop();
    });
  });
});
