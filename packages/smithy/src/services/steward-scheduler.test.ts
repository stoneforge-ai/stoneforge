/**
 * Steward Scheduler Service Tests
 *
 * Tests for the steward scheduler service including:
 * - Cron scheduling
 * - Event triggers with condition evaluation
 * - Execution history tracking
 * - Lifecycle management
 *
 * TB-O23: Steward Scheduler Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EntityId } from '@stoneforge/core';
import { EntityTypeValue, createTimestamp } from '@stoneforge/core';

import type {
  StewardTrigger,
  StewardMetadata,
} from '../types/index.js';
import type { AgentRegistry, AgentEntity } from './agent-registry.js';
import {
  createStewardScheduler,
  createDefaultStewardExecutor,
  isValidCronExpression,
  evaluateCondition,
  StewardSchedulerImpl,
  type StewardExecutor,
  type StewardExecutionResult,
  type StewardScheduler,
} from './steward-scheduler.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockAgentEntity(
  id: string,
  name: string,
  focus: 'merge' | 'health' | 'reminder' | 'ops',
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

function createMockExecutor(): StewardExecutor {
  return vi.fn(async (_steward, _context): Promise<StewardExecutionResult> => ({
    success: true,
    output: 'Executed successfully',
    durationMs: 100,
    itemsProcessed: 1,
  }));
}

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('isValidCronExpression', () => {
  it('should validate standard 5-part cron expression', () => {
    expect(isValidCronExpression('* * * * *')).toBe(true);
    expect(isValidCronExpression('0 2 * * *')).toBe(true);
    expect(isValidCronExpression('*/15 * * * *')).toBe(true);
    expect(isValidCronExpression('0 0 1 * *')).toBe(true);
    expect(isValidCronExpression('0 12 * * 1-5')).toBe(true);
  });

  it('should validate 6-part cron expression with seconds', () => {
    expect(isValidCronExpression('* * * * * *')).toBe(true);
    expect(isValidCronExpression('0 * * * * *')).toBe(true);
  });

  it('should reject invalid cron expressions', () => {
    expect(isValidCronExpression('* * * *')).toBe(false); // Too few parts
    expect(isValidCronExpression('* * * * * * *')).toBe(false); // Too many parts
    expect(isValidCronExpression('')).toBe(false);
    expect(isValidCronExpression('invalid')).toBe(false);
  });
});

describe('evaluateCondition', () => {
  it('should evaluate simple property access', () => {
    expect(evaluateCondition("task.status === 'closed'", { task: { status: 'closed' } })).toBe(true);
    expect(evaluateCondition("task.status === 'closed'", { task: { status: 'open' } })).toBe(false);
  });

  it('should evaluate nested property access', () => {
    expect(
      evaluateCondition(
        "task.assignedAgent.role === 'worker'",
        { task: { assignedAgent: { role: 'worker' } } }
      )
    ).toBe(true);
  });

  it('should handle optional chaining in condition', () => {
    expect(
      evaluateCondition(
        "task.assignedAgent?.role === 'worker'",
        { task: {} }
      )
    ).toBe(false);
  });

  it('should evaluate numeric comparisons', () => {
    expect(evaluateCondition('count > 5', { count: 10 })).toBe(true);
    expect(evaluateCondition('count > 5', { count: 3 })).toBe(false);
  });

  it('should handle missing properties gracefully', () => {
    expect(evaluateCondition('foo.bar === "test"', {})).toBe(false);
  });

  it('should handle invalid expressions gracefully', () => {
    expect(evaluateCondition('this is not valid JavaScript', {})).toBe(false);
  });

  it('should evaluate boolean conditions', () => {
    expect(evaluateCondition('isEnabled', { isEnabled: true })).toBe(true);
    expect(evaluateCondition('!isDisabled', { isDisabled: false })).toBe(true);
  });

  it('should reject code injection attempts', () => {
    expect(evaluateCondition('eval("alert(1)")', {})).toBe(false);
    expect(evaluateCondition('require("child_process")', {})).toBe(false);
    expect(evaluateCondition('process.exit(1)', {})).toBe(false);
    expect(evaluateCondition('x = 1', { x: 0 })).toBe(false);
    expect(evaluateCondition('true; process.exit(1)', {})).toBe(false);
    expect(evaluateCondition('`${process.env.SECRET}`', {})).toBe(false);
    expect(evaluateCondition('constructor.constructor("return process")()', {})).toBe(false);
    expect(evaluateCondition('x["constructor"]', { x: {} })).toBe(false);
  });
});

// ============================================================================
// Scheduler Lifecycle Tests
// ============================================================================

describe('StewardSchedulerImpl', () => {
  let scheduler: StewardScheduler;
  let mockRegistry: AgentRegistry;
  let mockExecutor: StewardExecutor;
  let mockSteward: AgentEntity;

  beforeEach(() => {
    mockSteward = createMockAgentEntity('steward-1', 'Test Steward', 'merge', [
      { type: 'cron', schedule: '*/5 * * * *' },
      { type: 'event', event: 'task_completed', condition: "task.status === 'closed'" },
    ]);
    mockRegistry = createMockAgentRegistry([mockSteward]);
    mockExecutor = createMockExecutor();
    scheduler = createStewardScheduler(mockRegistry, mockExecutor);
  });

  afterEach(async () => {
    if (scheduler.isRunning()) {
      await scheduler.stop();
    }
  });

  describe('lifecycle', () => {
    it('should start and stop correctly', async () => {
      expect(scheduler.isRunning()).toBe(false);

      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      await scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should be idempotent for start/stop', async () => {
      await scheduler.start();
      await scheduler.start(); // Should not throw
      expect(scheduler.isRunning()).toBe(true);

      await scheduler.stop();
      await scheduler.stop(); // Should not throw
      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('steward registration', () => {
    it('should register a steward with triggers', async () => {
      const success = await scheduler.registerSteward('steward-1' as EntityId);
      expect(success).toBe(true);

      const stats = scheduler.getStats();
      expect(stats.registeredStewards).toBe(1);
      expect(stats.activeCronJobs).toBe(1);
      expect(stats.activeEventSubscriptions).toBe(1);
    });

    it('should fail to register non-existent steward', async () => {
      const success = await scheduler.registerSteward('non-existent' as EntityId);
      expect(success).toBe(false);
    });

    it('should unregister a steward', async () => {
      await scheduler.registerSteward('steward-1' as EntityId);
      const unregistered = await scheduler.unregisterSteward('steward-1' as EntityId);
      expect(unregistered).toBe(true);

      const stats = scheduler.getStats();
      expect(stats.registeredStewards).toBe(0);
    });

    it('should refresh a steward registration', async () => {
      await scheduler.registerSteward('steward-1' as EntityId);
      await scheduler.refreshSteward('steward-1' as EntityId);

      const stats = scheduler.getStats();
      expect(stats.registeredStewards).toBe(1);
    });

    it('should register all stewards from registry', async () => {
      const count = await scheduler.registerAllStewards();
      expect(count).toBe(1);
    });
  });

  describe('scheduled jobs', () => {
    it('should track scheduled jobs', async () => {
      await scheduler.registerSteward('steward-1' as EntityId);

      const jobs = scheduler.getScheduledJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].stewardId).toBe('steward-1');
      expect(jobs[0].trigger.schedule).toBe('*/5 * * * *');
    });

    it('should filter scheduled jobs by steward', async () => {
      await scheduler.registerSteward('steward-1' as EntityId);

      const jobs = scheduler.getScheduledJobs('steward-1' as EntityId);
      expect(jobs.length).toBe(1);

      const noJobs = scheduler.getScheduledJobs('other' as EntityId);
      expect(noJobs.length).toBe(0);
    });
  });

  describe('event subscriptions', () => {
    it('should track event subscriptions', async () => {
      await scheduler.registerSteward('steward-1' as EntityId);

      const subs = scheduler.getEventSubscriptions();
      expect(subs.length).toBe(1);
      expect(subs[0].trigger.event).toBe('task_completed');
    });

    it('should filter event subscriptions by steward', async () => {
      await scheduler.registerSteward('steward-1' as EntityId);

      const subs = scheduler.getEventSubscriptions('steward-1' as EntityId);
      expect(subs.length).toBe(1);

      const noSubs = scheduler.getEventSubscriptions('other' as EntityId);
      expect(noSubs.length).toBe(0);
    });
  });

  describe('manual execution', () => {
    it('should execute a steward manually', async () => {
      const result = await scheduler.executeSteward('steward-1' as EntityId);
      expect(result.success).toBe(true);
      expect(mockExecutor).toHaveBeenCalled();
    });

    it('should fail when steward not found', async () => {
      const result = await scheduler.executeSteward('non-existent' as EntityId);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should track manual execution in history', async () => {
      await scheduler.executeSteward('steward-1' as EntityId);

      const history = scheduler.getExecutionHistory();
      expect(history.length).toBe(1);
      expect(history[0].manual).toBe(true);
    });
  });

  describe('event publishing', () => {
    beforeEach(async () => {
      await scheduler.registerSteward('steward-1' as EntityId);
      await scheduler.start();
    });

    it('should trigger steward on matching event', async () => {
      const triggered = await scheduler.publishEvent('task_completed', {
        task: { status: 'closed' },
      });
      expect(triggered).toBe(1);

      // Give async execution a moment
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockExecutor).toHaveBeenCalled();
    });

    it('should not trigger when condition does not match', async () => {
      const triggered = await scheduler.publishEvent('task_completed', {
        task: { status: 'open' },
      });
      expect(triggered).toBe(0);
    });

    it('should not trigger for unsubscribed events', async () => {
      const triggered = await scheduler.publishEvent('some_other_event', {});
      expect(triggered).toBe(0);
    });

    it('should not trigger when scheduler is stopped', async () => {
      await scheduler.stop();

      const triggered = await scheduler.publishEvent('task_completed', {
        task: { status: 'closed' },
      });
      expect(triggered).toBe(0);
    });
  });

  describe('execution history', () => {
    it('should track execution history', async () => {
      await scheduler.executeSteward('steward-1' as EntityId);
      await scheduler.executeSteward('steward-1' as EntityId);

      const history = scheduler.getExecutionHistory();
      expect(history.length).toBe(2);
    });

    it('should get last execution for steward', async () => {
      await scheduler.executeSteward('steward-1' as EntityId);

      const last = scheduler.getLastExecution('steward-1' as EntityId);
      expect(last).toBeDefined();
      expect(last?.stewardId).toBe('steward-1');
    });

    it('should filter history by steward', async () => {
      await scheduler.executeSteward('steward-1' as EntityId);

      const history = scheduler.getExecutionHistory({ stewardId: 'steward-1' as EntityId });
      expect(history.length).toBe(1);

      const noHistory = scheduler.getExecutionHistory({ stewardId: 'other' as EntityId });
      expect(noHistory.length).toBe(0);
    });

    it('should filter history by success', async () => {
      await scheduler.executeSteward('steward-1' as EntityId);

      const successes = scheduler.getExecutionHistory({ success: true });
      expect(successes.length).toBe(1);

      const failures = scheduler.getExecutionHistory({ success: false });
      expect(failures.length).toBe(0);
    });

    it('should limit history entries', async () => {
      await scheduler.executeSteward('steward-1' as EntityId);
      await scheduler.executeSteward('steward-1' as EntityId);
      await scheduler.executeSteward('steward-1' as EntityId);

      const history = scheduler.getExecutionHistory({ limit: 2 });
      expect(history.length).toBe(2);
    });
  });

  describe('statistics', () => {
    it('should report correct statistics', async () => {
      await scheduler.registerSteward('steward-1' as EntityId);
      await scheduler.executeSteward('steward-1' as EntityId);

      const stats = scheduler.getStats();
      expect(stats.registeredStewards).toBe(1);
      expect(stats.activeCronJobs).toBe(1);
      expect(stats.activeEventSubscriptions).toBe(1);
      expect(stats.totalExecutions).toBe(1);
      expect(stats.successfulExecutions).toBe(1);
      expect(stats.failedExecutions).toBe(0);
    });
  });

  describe('events', () => {
    it('should emit execution:started event', async () => {
      const listener = vi.fn();
      scheduler.on('execution:started', listener);

      await scheduler.executeSteward('steward-1' as EntityId);

      expect(listener).toHaveBeenCalled();
    });

    it('should emit execution:completed event', async () => {
      const listener = vi.fn();
      scheduler.on('execution:completed', listener);

      await scheduler.executeSteward('steward-1' as EntityId);

      expect(listener).toHaveBeenCalled();
    });

    it('should emit steward:registered event', async () => {
      const listener = vi.fn();
      scheduler.on('steward:registered', listener);

      await scheduler.registerSteward('steward-1' as EntityId);

      expect(listener).toHaveBeenCalledWith('steward-1');
    });

    it('should emit steward:unregistered event', async () => {
      const listener = vi.fn();
      scheduler.on('steward:unregistered', listener);

      await scheduler.registerSteward('steward-1' as EntityId);
      await scheduler.unregisterSteward('steward-1' as EntityId);

      expect(listener).toHaveBeenCalledWith('steward-1');
    });
  });
});

// ============================================================================
// Default Executor Tests
// ============================================================================

describe('createDefaultStewardExecutor', () => {
  it('should create a working executor', async () => {
    const executor = createDefaultStewardExecutor();
    const steward = createMockAgentEntity('steward-1', 'Test Steward', 'merge');

    const result = await executor(steward, {
      trigger: { type: 'event', event: 'manual' },
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Test Steward');
    expect(result.output).toContain('merge');
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createStewardScheduler', () => {
  it('should create a scheduler instance', () => {
    const registry = createMockAgentRegistry();
    const executor = createMockExecutor();

    const scheduler = createStewardScheduler(registry, executor);

    expect(scheduler).toBeDefined();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('should accept configuration options', () => {
    const registry = createMockAgentRegistry();
    const executor = createMockExecutor();

    const scheduler = createStewardScheduler(registry, executor, {
      maxHistoryPerSteward: 50,
      defaultTimeoutMs: 10000,
    });

    expect(scheduler).toBeDefined();
  });
});

// ============================================================================
// Failed Execution Tests
// ============================================================================

describe('StewardSchedulerImpl - error handling', () => {
  it('should handle executor errors gracefully', async () => {
    const mockSteward = createMockAgentEntity('steward-1', 'Test Steward', 'merge');
    const mockRegistry = createMockAgentRegistry([mockSteward]);
    const failingExecutor: StewardExecutor = vi.fn(async () => {
      throw new Error('Execution failed');
    });

    const scheduler = createStewardScheduler(mockRegistry, failingExecutor);

    const result = await scheduler.executeSteward('steward-1' as EntityId);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Execution failed');

    // Should track in history as failed
    const history = scheduler.getExecutionHistory({ success: false });
    expect(history.length).toBe(1);
  });

  it('should emit execution:failed event on error', async () => {
    const mockSteward = createMockAgentEntity('steward-1', 'Test Steward', 'merge');
    const mockRegistry = createMockAgentRegistry([mockSteward]);
    const failingExecutor: StewardExecutor = vi.fn(async () => {
      throw new Error('Execution failed');
    });

    const scheduler = createStewardScheduler(mockRegistry, failingExecutor);
    const listener = vi.fn();
    scheduler.on('execution:failed', listener);

    await scheduler.executeSteward('steward-1' as EntityId);

    expect(listener).toHaveBeenCalled();
  });
});

// ============================================================================
// Cron Schedule Parsing Tests
// ============================================================================

describe('StewardSchedulerImpl - cron scheduling', () => {
  let scheduler: StewardScheduler;
  let mockRegistry: AgentRegistry;
  let mockExecutor: StewardExecutor;

  afterEach(async () => {
    if (scheduler?.isRunning()) {
      await scheduler.stop();
    }
  });

  it('should parse every minute schedule', async () => {
    const steward = createMockAgentEntity('steward-1', 'Test', 'merge', [
      { type: 'cron', schedule: '* * * * *' },
    ]);
    mockRegistry = createMockAgentRegistry([steward]);
    mockExecutor = createMockExecutor();
    scheduler = createStewardScheduler(mockRegistry, mockExecutor);

    await scheduler.registerSteward('steward-1' as EntityId);
    const jobs = scheduler.getScheduledJobs();
    expect(jobs.length).toBe(1);
  });

  it('should parse every N minutes schedule', async () => {
    const steward = createMockAgentEntity('steward-1', 'Test', 'merge', [
      { type: 'cron', schedule: '*/15 * * * *' },
    ]);
    mockRegistry = createMockAgentRegistry([steward]);
    mockExecutor = createMockExecutor();
    scheduler = createStewardScheduler(mockRegistry, mockExecutor);

    await scheduler.registerSteward('steward-1' as EntityId);
    const jobs = scheduler.getScheduledJobs();
    expect(jobs.length).toBe(1);
  });

  it('should parse daily schedule', async () => {
    const steward = createMockAgentEntity('steward-1', 'Test', 'merge', [
      { type: 'cron', schedule: '0 2 * * *' }, // 2 AM daily
    ]);
    mockRegistry = createMockAgentRegistry([steward]);
    mockExecutor = createMockExecutor();
    scheduler = createStewardScheduler(mockRegistry, mockExecutor);

    await scheduler.registerSteward('steward-1' as EntityId);
    const jobs = scheduler.getScheduledJobs();
    expect(jobs.length).toBe(1);
  });
});

// ============================================================================
// Multiple Steward Tests
// ============================================================================

describe('StewardSchedulerImpl - multiple stewards', () => {
  it('should handle multiple stewards', async () => {
    const steward1 = createMockAgentEntity('steward-1', 'Merge Steward', 'merge', [
      { type: 'event', event: 'task_completed' },
    ]);
    const steward2 = createMockAgentEntity('steward-2', 'Health Steward', 'health', [
      { type: 'cron', schedule: '*/5 * * * *' },
    ]);
    const mockRegistry = createMockAgentRegistry([steward1, steward2]);
    const mockExecutor = createMockExecutor();
    const scheduler = createStewardScheduler(mockRegistry, mockExecutor);

    await scheduler.registerAllStewards();

    const stats = scheduler.getStats();
    expect(stats.registeredStewards).toBe(2);
    expect(stats.activeCronJobs).toBe(1);
    expect(stats.activeEventSubscriptions).toBe(1);

    await scheduler.stop();
  });

  it('should trigger multiple stewards for same event', async () => {
    const steward1 = createMockAgentEntity('steward-1', 'Steward 1', 'merge', [
      { type: 'event', event: 'task_completed' },
    ]);
    const steward2 = createMockAgentEntity('steward-2', 'Steward 2', 'ops', [
      { type: 'event', event: 'task_completed' },
    ]);
    const mockRegistry = createMockAgentRegistry([steward1, steward2]);
    const mockExecutor = createMockExecutor();
    const scheduler = createStewardScheduler(mockRegistry, mockExecutor);

    await scheduler.registerAllStewards();
    await scheduler.start();

    const triggered = await scheduler.publishEvent('task_completed', { task: {} });
    expect(triggered).toBe(2);

    await scheduler.stop();
  });
});

// ============================================================================
// Steward Without Triggers Tests
// ============================================================================

describe('StewardSchedulerImpl - steward without triggers', () => {
  it('should register steward without triggers', async () => {
    const steward = createMockAgentEntity('steward-1', 'Manual Steward', 'ops', []);
    const mockRegistry = createMockAgentRegistry([steward]);
    const mockExecutor = createMockExecutor();
    const scheduler = createStewardScheduler(mockRegistry, mockExecutor);

    const success = await scheduler.registerSteward('steward-1' as EntityId);
    expect(success).toBe(true);

    // Should have no jobs or subscriptions
    const stats = scheduler.getStats();
    expect(stats.activeCronJobs).toBe(0);
    expect(stats.activeEventSubscriptions).toBe(0);

    // Should still be able to execute manually
    const result = await scheduler.executeSteward('steward-1' as EntityId);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// getNextCronTime Tests (M-3)
// ============================================================================

describe('getNextCronTime', () => {
  let impl: StewardSchedulerImpl;

  beforeEach(() => {
    const mockRegistry = createMockAgentRegistry();
    const mockExecutor = createMockExecutor();
    impl = new StewardSchedulerImpl(mockRegistry, mockExecutor);
  });

  it('should return next minute for * * * * *', () => {
    const now = new Date(2025, 5, 15, 10, 30, 0); // June 15, 10:30 local
    const next = impl.getNextCronTime('* * * * *', now);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(10);
    expect(next!.getMinutes()).toBe(31);
  });

  it('should return next 9:00 AM for 0 9 * * *', () => {
    const now = new Date(2025, 5, 15, 10, 30, 0); // June 15, 10:30 local
    const next = impl.getNextCronTime('0 9 * * *', now);
    expect(next).not.toBeNull();
    // Next 9:00 AM after 10:30 is the next day
    expect(next!.getHours()).toBe(9);
    expect(next!.getMinutes()).toBe(0);
    expect(next!.getDate()).toBe(16);
  });

  it('should return same day 9:00 AM when before 9:00', () => {
    const now = new Date(2025, 5, 15, 7, 30, 0); // June 15, 07:30 local
    const next = impl.getNextCronTime('0 9 * * *', now);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(9);
    expect(next!.getMinutes()).toBe(0);
    expect(next!.getDate()).toBe(15);
  });

  it('should handle */5 * * * * (every 5 minutes)', () => {
    const now = new Date(2025, 5, 15, 10, 32, 0); // June 15, 10:32 local
    const next = impl.getNextCronTime('*/5 * * * *', now);
    expect(next).not.toBeNull();
    // Next 5-min boundary after 10:32 is 10:35
    expect(next!.getHours()).toBe(10);
    expect(next!.getMinutes()).toBe(35);
  });

  it('should handle 0 0 * * 1 (every Monday midnight)', () => {
    // 2025-06-15 is a Sunday (local time)
    const now = new Date(2025, 5, 15, 10, 0, 0); // June 15, 10:00 local
    const next = impl.getNextCronTime('0 0 * * 1', now);
    expect(next).not.toBeNull();
    // Next Monday is June 16
    expect(next!.getDate()).toBe(16);
    expect(next!.getHours()).toBe(0);
    expect(next!.getMinutes()).toBe(0);
  });

  it('should return null for invalid expressions', () => {
    expect(impl.getNextCronTime('invalid')).toBeNull();
    expect(impl.getNextCronTime('* * *')).toBeNull();
    expect(impl.getNextCronTime('')).toBeNull();
  });

  it('should handle 6-field expressions (ignoring seconds)', () => {
    const now = new Date(2025, 5, 15, 10, 30, 0); // June 15, 10:30 local
    const next = impl.getNextCronTime('0 * * * * *', now);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(10);
    expect(next!.getMinutes()).toBe(31);
  });

  it('should handle ranges like 0 9-17 * * *', () => {
    const now = new Date(2025, 5, 15, 18, 0, 0); // June 15, 18:00 local
    const next = impl.getNextCronTime('0 9-17 * * *', now);
    expect(next).not.toBeNull();
    // Next match after 18:00 is 9:00 next day
    expect(next!.getDate()).toBe(16);
    expect(next!.getHours()).toBe(9);
  });

  it('should handle lists like 0,30 * * * *', () => {
    const now = new Date(2025, 5, 15, 10, 15, 0); // June 15, 10:15 local
    const next = impl.getNextCronTime('0,30 * * * *', now);
    expect(next).not.toBeNull();
    expect(next!.getMinutes()).toBe(30);
    expect(next!.getHours()).toBe(10);
  });
});

// ============================================================================
// startImmediately Behavior Tests
// ============================================================================

describe('StewardSchedulerImpl - startImmediately behavior', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('should register all stewards on start() when startImmediately is true', async () => {
    const steward = createMockAgentEntity('steward-1', 'Auto Steward', 'merge', [
      { type: 'cron', schedule: '*/20 * * * *' },
    ]);
    const registry = createMockAgentRegistry([steward]);
    const executor = createMockExecutor();
    const scheduler = createStewardScheduler(registry, executor, { startImmediately: true });

    await scheduler.start();

    const stats = scheduler.getStats();
    expect(stats.registeredStewards).toBe(1);
    expect(stats.activeCronJobs).toBe(1);
    expect(registry.getStewards).toHaveBeenCalled();

    await scheduler.stop();
  });

  it('should NOT register stewards on start() when startImmediately is false', async () => {
    const steward = createMockAgentEntity('steward-1', 'Manual Steward', 'merge', [
      { type: 'cron', schedule: '*/20 * * * *' },
    ]);
    const registry = createMockAgentRegistry([steward]);
    const executor = createMockExecutor();
    const scheduler = createStewardScheduler(registry, executor, { startImmediately: false });

    await scheduler.start();

    const stats = scheduler.getStats();
    expect(stats.registeredStewards).toBe(0);
    expect(stats.activeCronJobs).toBe(0);
    expect(registry.getStewards).not.toHaveBeenCalled();

    await scheduler.stop();
  });

  it('should create active cron jobs with nextRunAt when registerAllStewards() called after start()', async () => {
    const steward = createMockAgentEntity('steward-1', 'Cron Steward', 'merge', [
      { type: 'cron', schedule: '*/20 * * * *' },
    ]);
    const registry = createMockAgentRegistry([steward]);
    const executor = createMockExecutor();
    const scheduler = createStewardScheduler(registry, executor, { startImmediately: false });

    await scheduler.start();
    const registered = await scheduler.registerAllStewards();
    expect(registered).toBe(1);

    const jobs = scheduler.getScheduledJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].nextRunAt).toBeDefined();
    expect(jobs[0].nextRunAt).toBeInstanceOf(Date);

    await scheduler.stop();
  });
});

// ============================================================================
// Logging Tests
// ============================================================================

describe('StewardSchedulerImpl - logging', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('should warn on invalid cron schedule in scheduleNextRun', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const steward = createMockAgentEntity('steward-1', 'Bad Cron', 'merge', [
      { type: 'cron', schedule: 'not-valid-cron' },
    ]);
    const registry = createMockAgentRegistry([steward]);
    const executor = createMockExecutor();
    const scheduler = createStewardScheduler(registry, executor);

    await scheduler.start();
    await scheduler.registerSteward('steward-1' as EntityId);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[steward-scheduler] Failed to compute next run time'),
    );

    await scheduler.stop();
  });

  it('should log registration counts on registerAllStewards', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const steward = createMockAgentEntity('steward-1', 'Log Test', 'merge', [
      { type: 'cron', schedule: '*/5 * * * *' },
    ]);
    const registry = createMockAgentRegistry([steward]);
    const executor = createMockExecutor();
    const scheduler = createStewardScheduler(registry, executor);

    await scheduler.registerAllStewards();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[steward-scheduler] Registered 1/1 steward(s)'),
    );

    await scheduler.stop();
  });

  it('should log on scheduler start', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const registry = createMockAgentRegistry([]);
    const executor = createMockExecutor();
    const scheduler = createStewardScheduler(registry, executor);

    await scheduler.start();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[steward-scheduler] Started with'),
    );

    await scheduler.stop();
  });
});
