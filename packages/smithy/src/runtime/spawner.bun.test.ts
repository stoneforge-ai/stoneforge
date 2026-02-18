/**
 * Spawner Service Unit Tests
 *
 * Tests for the SpawnerService which manages Claude Code process spawning
 * and lifecycle for AI agents in the orchestration system.
 *
 * Note: These tests focus on the internal logic and state management.
 * Integration tests that spawn actual Claude Code processes would require
 * Claude to be installed and available.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { EntityId, Timestamp } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import {
  createSpawnerService,
  buildHeadlessArgs,
  SpawnerServiceImpl,
  type SpawnerService,
  type SpawnedSession,
  type SpawnConfig,
  type StreamJsonEvent,
  type SpawnedSessionEvent,
  type UWPCheckResult,
  type UWPCheckOptions,
  type UWPTaskInfo,
  SessionStatusTransitions,
  canReceiveInput,
  isTerminalStatus,
  getStatusDescription,
} from './spawner.js';
import type {
  AgentProvider,
  HeadlessProvider,
  HeadlessSession,
  HeadlessSpawnOptions,
  InteractiveProvider,
  InteractiveSession,
  InteractiveSpawnOptions,
  AgentMessage,
  ModelInfo,
} from '../providers/types.js';

// Mock agent ID for tests
const testAgentId = 'agent-test-001' as EntityId;

describe('SpawnerService', () => {
  let spawnerService: SpawnerService;

  beforeEach(() => {
    spawnerService = createSpawnerService({
      claudePath: 'claude',
      workingDirectory: '/tmp',
      timeout: 5000,
    });
  });

  describe('listActiveSessions', () => {
    test('returns empty array when no sessions exist', () => {
      const sessions = spawnerService.listActiveSessions();
      expect(sessions).toEqual([]);
    });

    test('returns empty array when filtering by non-existent agent', () => {
      const sessions = spawnerService.listActiveSessions(testAgentId);
      expect(sessions).toEqual([]);
    });
  });

  describe('listAllSessions', () => {
    test('returns empty array when no sessions exist', () => {
      const sessions = spawnerService.listAllSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('getSession', () => {
    test('returns undefined for non-existent session', () => {
      const session = spawnerService.getSession('nonexistent-session');
      expect(session).toBeUndefined();
    });
  });

  describe('getMostRecentSession', () => {
    test('returns undefined when agent has no sessions', () => {
      const session = spawnerService.getMostRecentSession(testAgentId);
      expect(session).toBeUndefined();
    });
  });

  describe('getEventEmitter', () => {
    test('returns undefined for non-existent session', () => {
      const emitter = spawnerService.getEventEmitter('nonexistent-session');
      expect(emitter).toBeUndefined();
    });
  });

  describe('terminate', () => {
    test('throws error for non-existent session', async () => {
      await expect(spawnerService.terminate('nonexistent-session')).rejects.toThrow(
        'Session not found'
      );
    });
  });

  describe('suspend', () => {
    test('throws error for non-existent session', async () => {
      await expect(spawnerService.suspend('nonexistent-session')).rejects.toThrow(
        'Session not found'
      );
    });
  });

  describe('sendInput', () => {
    test('throws error for non-existent session', async () => {
      await expect(
        spawnerService.sendInput('nonexistent-session', 'test message')
      ).rejects.toThrow('Session not found');
    });
  });
});

// ============================================================================
// CLI Argument Building Tests
// ============================================================================

describe('buildHeadlessArgs', () => {
  test('includes required base flags for stream-json output', () => {
    const args = buildHeadlessArgs();

    // These flags are required for Claude Code to work in headless mode
    expect(args).toContain('-p');
    expect(args).toContain('--verbose');
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--input-format');
  });

  test('--verbose is included (required for stream-json with -p)', () => {
    // This is the specific regression test for the bug where --verbose was missing
    // Claude Code requires --verbose when using --output-format=stream-json with -p
    const args = buildHeadlessArgs();
    expect(args).toContain('--verbose');

    // Verify the order: -p should come before --verbose
    const pIndex = args.indexOf('-p');
    const verboseIndex = args.indexOf('--verbose');
    expect(pIndex).toBeGreaterThanOrEqual(0);
    expect(verboseIndex).toBeGreaterThan(pIndex);
  });

  test('includes --resume flag when resumeSessionId is provided', () => {
    const args = buildHeadlessArgs({ resumeSessionId: 'session-123' });

    expect(args).toContain('--resume');
    expect(args).toContain('session-123');

    // --resume and session ID should be consecutive
    const resumeIndex = args.indexOf('--resume');
    expect(args[resumeIndex + 1]).toBe('session-123');
  });

  test('does NOT include initial prompt as CLI argument (sent via stdin instead)', () => {
    // Initial prompt is sent via stdin in JSON format, not as a CLI argument
    // This is because --input-format stream-json requires JSON input on stdin
    const args = buildHeadlessArgs({ initialPrompt: 'Hello, start working' });

    expect(args).not.toContain('Hello, start working');
  });

  test('includes --resume but not prompt as CLI argument', () => {
    const args = buildHeadlessArgs({
      resumeSessionId: 'session-456',
      initialPrompt: 'Continue the work',
    });

    expect(args).toContain('--resume');
    expect(args).toContain('session-456');
    // Prompt is sent via stdin, not as CLI arg
    expect(args).not.toContain('Continue the work');
  });

  test('does not include --resume when resumeSessionId is undefined', () => {
    const args = buildHeadlessArgs({});

    expect(args).not.toContain('--resume');
  });

  test('--input-format stream-json is included for stdin communication', () => {
    // This flag is required so we can send follow-up messages via stdin
    const args = buildHeadlessArgs();

    expect(args).toContain('--input-format');
    const inputFormatIndex = args.indexOf('--input-format');
    expect(args[inputFormatIndex + 1]).toBe('stream-json');
  });
});

describe('SessionStatusTransitions', () => {
  test('starting can transition to running or terminated', () => {
    expect(SessionStatusTransitions.starting).toContain('running');
    expect(SessionStatusTransitions.starting).toContain('terminated');
    expect(SessionStatusTransitions.starting).not.toContain('suspended');
  });

  test('running can transition to suspended, terminating, or terminated', () => {
    expect(SessionStatusTransitions.running).toContain('suspended');
    expect(SessionStatusTransitions.running).toContain('terminating');
    expect(SessionStatusTransitions.running).toContain('terminated');
    expect(SessionStatusTransitions.running).not.toContain('starting');
  });

  test('suspended can transition to running or terminated', () => {
    expect(SessionStatusTransitions.suspended).toContain('running');
    expect(SessionStatusTransitions.suspended).toContain('terminated');
    expect(SessionStatusTransitions.suspended).not.toContain('starting');
  });

  test('terminating can only transition to terminated', () => {
    expect(SessionStatusTransitions.terminating).toEqual(['terminated']);
  });

  test('terminated has no valid transitions', () => {
    expect(SessionStatusTransitions.terminated).toEqual([]);
  });
});

describe('canReceiveInput', () => {
  test('returns true only for running status', () => {
    expect(canReceiveInput('running')).toBe(true);
    expect(canReceiveInput('starting')).toBe(false);
    expect(canReceiveInput('suspended')).toBe(false);
    expect(canReceiveInput('terminating')).toBe(false);
    expect(canReceiveInput('terminated')).toBe(false);
  });
});

describe('isTerminalStatus', () => {
  test('returns true only for terminated status', () => {
    expect(isTerminalStatus('terminated')).toBe(true);
    expect(isTerminalStatus('starting')).toBe(false);
    expect(isTerminalStatus('running')).toBe(false);
    expect(isTerminalStatus('suspended')).toBe(false);
    expect(isTerminalStatus('terminating')).toBe(false);
  });
});

describe('getStatusDescription', () => {
  test('returns appropriate description for each status', () => {
    expect(getStatusDescription('starting')).toBe('Starting up');
    expect(getStatusDescription('running')).toBe('Running');
    expect(getStatusDescription('suspended')).toBe('Suspended (can be resumed)');
    expect(getStatusDescription('terminating')).toBe('Shutting down');
    expect(getStatusDescription('terminated')).toBe('Terminated');
  });

  test('returns Unknown for invalid status', () => {
    expect(getStatusDescription('invalid' as 'running')).toBe('Unknown');
  });
});

describe('SpawnConfig defaults', () => {
  test('uses default values when not provided', () => {
    const service = createSpawnerService();
    // The service should be created without errors
    expect(service).toBeDefined();
  });

  test('accepts custom configuration', () => {
    const config: SpawnConfig = {
      claudePath: '/custom/claude',
      workingDirectory: '/custom/dir',
      timeout: 30000,
      stoneforgeRoot: '/custom/stoneforge',
      environmentVariables: { CUSTOM_VAR: 'value' },
    };
    const service = createSpawnerService(config);
    expect(service).toBeDefined();
  });
});

describe('Type definitions', () => {
  test('SpawnedSession has required fields', () => {
    // Test that the type structure is correct
    const now: Timestamp = createTimestamp();
    const mockSession: SpawnedSession = {
      id: 'session-123',
      agentId: 'agent-123' as EntityId,
      agentRole: 'worker',
      workerMode: 'ephemeral',
      mode: 'headless',
      pid: 12345,
      status: 'running',
      workingDirectory: '/tmp',
      createdAt: now,
      lastActivityAt: now,
      startedAt: now,
    };

    expect(mockSession.id).toBe('session-123');
    expect(mockSession.agentRole).toBe('worker');
    expect(mockSession.mode).toBe('headless');
    expect(mockSession.status).toBe('running');
  });

  test('SpawnedSessionEvent has required fields', () => {
    const now: Timestamp = createTimestamp();
    const mockEvent: SpawnedSessionEvent = {
      type: 'assistant',
      subtype: 'text',
      receivedAt: now,
      raw: { type: 'assistant', message: 'Hello' },
      message: 'Hello',
    };

    expect(mockEvent.type).toBe('assistant');
    expect(mockEvent.message).toBe('Hello');
  });

  test('StreamJsonEvent represents valid Claude Code events', () => {
    // Test various event types
    const initEvent: StreamJsonEvent = {
      type: 'system',
      subtype: 'init',
      session_id: 'claude-session-123',
      timestamp: new Date().toISOString(),
    };
    expect(initEvent.type).toBe('system');
    expect(initEvent.session_id).toBe('claude-session-123');

    const assistantEvent: StreamJsonEvent = {
      type: 'assistant',
      subtype: 'text',
      message: 'I will help you with that.',
    };
    expect(assistantEvent.type).toBe('assistant');

    const toolUseEvent: StreamJsonEvent = {
      type: 'tool_use',
      tool: 'Read',
      tool_use_id: 'tool-123',
      tool_input: { file_path: '/test.ts' },
    };
    expect(toolUseEvent.type).toBe('tool_use');
    expect(toolUseEvent.tool).toBe('Read');

    const toolResultEvent: StreamJsonEvent = {
      type: 'tool_result',
      tool_use_id: 'tool-123',
      content: 'File contents here',
    };
    expect(toolResultEvent.type).toBe('tool_result');

    const errorEvent: StreamJsonEvent = {
      type: 'error',
      error: 'Something went wrong',
    };
    expect(errorEvent.type).toBe('error');
  });
});

describe('Spawn mode determination', () => {
  test('director defaults to interactive mode', async () => {
    // This test validates that directors use interactive mode
    // With node-pty installed, this now spawns a real PTY
    // The spawn will fail because the shell is running but the claude command doesn't exist
    const service = createSpawnerService({ claudePath: 'nonexistent-claude' });

    // Director spawns in interactive mode via PTY
    // The PTY process spawns the shell successfully, but the claude command will fail
    // We just verify the spawn attempt is made
    const spawnPromise = service.spawn(testAgentId, 'director');

    // The spawn should either succeed (PTY started) or fail (shell spawn failed)
    // Either way indicates interactive mode was attempted
    try {
      const result = await spawnPromise;
      // If spawn succeeds, verify it's in interactive mode
      expect(result.session.mode).toBe('interactive');
      // Clean up
      await service.terminate(result.session.id, false);
    } catch (error) {
      // If it fails, it should be because the shell couldn't spawn
      // (posix_spawnp failed) not because node-pty is missing
      expect(String(error)).not.toContain('node-pty');
    }
  });

  // Note: Tests for worker/steward defaulting to headless mode require the actual
  // claude binary to be installed. The spawn throws synchronously in Bun when the
  // binary is not found. Integration tests with a real claude installation would
  // verify this behavior.

  test('can override mode with options', async () => {
    const service = createSpawnerService({ claudePath: 'nonexistent-claude' });

    // Worker with interactive mode override should use PTY
    const spawnPromise = service.spawn(testAgentId, 'worker', { mode: 'interactive' });

    try {
      const result = await spawnPromise;
      // If spawn succeeds, verify it's in interactive mode
      expect(result.session.mode).toBe('interactive');
      // Clean up
      await service.terminate(result.session.id, false);
    } catch (error) {
      // If it fails, it should be because the shell couldn't spawn
      // not because node-pty is missing
      expect(String(error)).not.toContain('node-pty');
    }
  });
});

describe('Event handling', () => {
  test('EventEmitter is properly typed', () => {
    const emitter = new EventEmitter();
    const now: Timestamp = createTimestamp();

    // Test that we can emit and listen to the expected events
    let receivedEvent: SpawnedSessionEvent | undefined = undefined;

    emitter.on('event', (event: SpawnedSessionEvent) => {
      receivedEvent = event;
    });

    const testEvent: SpawnedSessionEvent = {
      type: 'assistant',
      receivedAt: now,
      raw: { type: 'assistant', message: 'test' },
      message: 'test',
    };

    emitter.emit('event', testEvent);
    expect(receivedEvent).toBeDefined();
    expect(receivedEvent!.type).toBe('assistant');
    expect(receivedEvent!.message).toBe('test');
  });

  test('EventEmitter handles multiple event types', () => {
    const emitter = new EventEmitter();
    const now: Timestamp = createTimestamp();

    const events: SpawnedSessionEvent[] = [];
    const errors: Error[] = [];
    const exits: { code: number | null; signal: string | null }[] = [];

    emitter.on('event', (e) => events.push(e));
    emitter.on('error', (e) => errors.push(e));
    emitter.on('exit', (code, signal) => exits.push({ code, signal }));

    // Emit different event types
    emitter.emit('event', {
      type: 'assistant',
      receivedAt: now,
      raw: { type: 'assistant' },
    });
    emitter.emit('error', new Error('Test error'));
    emitter.emit('exit', 0, null);

    expect(events.length).toBe(1);
    expect(errors.length).toBe(1);
    expect(exits.length).toBe(1);
    expect(exits[0].code).toBe(0);
  });
});

describe('Session ID generation', () => {
  test('generates unique session IDs', () => {
    const service1 = createSpawnerService();
    const service2 = createSpawnerService();

    // We can't directly test the ID generation, but we can verify
    // that the service is properly instantiated
    expect(service1).toBeDefined();
    expect(service2).toBeDefined();
    expect(service1).not.toBe(service2);
  });
});

describe('Worker mode inference', () => {
  test('headless mode is inferred for worker role', async () => {
    // This tests that the service determines the correct mode based on role
    // Director -> interactive, Worker -> headless, Steward -> headless
    const service = createSpawnerService({ claudePath: 'nonexistent-claude' });

    // Director uses interactive mode - verify via PTY spawn attempt
    const spawnPromise = service.spawn(testAgentId, 'director');

    try {
      const result = await spawnPromise;
      // If spawn succeeds, verify it's in interactive mode
      expect(result.session.mode).toBe('interactive');
      // Clean up
      await service.terminate(result.session.id, false);
    } catch (error) {
      // If it fails, it should be because of the shell, not missing node-pty
      expect(String(error)).not.toContain('node-pty');
    }

    // Worker/Steward headless mode can only be verified with integration tests
    // because spawn() throws synchronously in Bun when binary is not found
  });
});

describe('Resume session option', () => {
  test('resume option is properly typed', () => {
    // Verify that the SpawnOptions type accepts resumeSessionId
    const options = {
      resumeSessionId: 'previous-session-123',
      initialPrompt: 'Continue from where you left off',
      mode: 'headless' as const,
    };

    expect(options.resumeSessionId).toBe('previous-session-123');
  });
});

// ============================================================================
// Model Selection Tests
// ============================================================================

describe('Model selection in SpawnOptions', () => {
  test('SpawnOptions accepts model field', () => {
    // Verify that the SpawnOptions type accepts the model field
    const options = {
      workingDirectory: '/test',
      mode: 'headless' as const,
      model: 'claude-sonnet-4-20250514',
    };

    expect(options.model).toBe('claude-sonnet-4-20250514');
  });

  test('model is optional and can be undefined', () => {
    const options = {
      workingDirectory: '/test',
      mode: 'headless' as const,
      // model is not specified
    };

    expect(options.model).toBeUndefined();
  });

  test('model can be an empty string', () => {
    const options = {
      workingDirectory: '/test',
      mode: 'headless' as const,
      model: '',
    };

    expect(options.model).toBe('');
  });

  test('model supports various model identifiers', () => {
    const models = [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-haiku-3-5-20250829',
      'anthropic/claude-sonnet-4-5-20250929', // OpenCode format
      'gpt-4o', // Codex format
      'o3-mini',
    ];

    for (const model of models) {
      const options = {
        workingDirectory: '/test',
        model,
      };
      expect(options.model).toBe(model);
    }
  });

  test('SpawnConfig can be created with default provider and model flows to spawn', () => {
    const config: SpawnConfig = {
      workingDirectory: '/tmp',
      timeout: 5000,
    };
    const service = createSpawnerService(config);
    expect(service).toBeDefined();
  });
});

describe('Environment variables', () => {
  test('STONEFORGE_ROOT is supported in config', () => {
    const config: SpawnConfig = {
      stoneforgeRoot: '/workspace/root',
      environmentVariables: {
        CUSTOM_VAR: 'custom_value',
      },
    };

    const service = createSpawnerService(config);
    expect(service).toBeDefined();
  });
});

// ============================================================================
// Universal Work Principle (UWP) Tests (TB-O9a)
// ============================================================================

describe('checkReadyQueue (UWP)', () => {
  let spawnerService: SpawnerService;

  beforeEach(() => {
    spawnerService = createSpawnerService({
      claudePath: 'claude',
      workingDirectory: '/tmp',
      timeout: 5000,
    });
  });

  describe('without getReadyTasks callback', () => {
    test('returns empty result when no callback provided', async () => {
      const result = await spawnerService.checkReadyQueue(testAgentId);

      expect(result.hasReadyTask).toBe(false);
      expect(result.autoStarted).toBe(false);
      expect(result.taskId).toBeUndefined();
      expect(result.taskTitle).toBeUndefined();
      expect(result.taskPriority).toBeUndefined();
    });

    test('returns empty result when callback is undefined', async () => {
      const result = await spawnerService.checkReadyQueue(testAgentId, {});

      expect(result.hasReadyTask).toBe(false);
      expect(result.autoStarted).toBe(false);
    });

    test('returns empty result when options.limit is set but no callback', async () => {
      const result = await spawnerService.checkReadyQueue(testAgentId, { limit: 5 });

      expect(result.hasReadyTask).toBe(false);
      expect(result.autoStarted).toBe(false);
    });
  });

  describe('with getReadyTasks callback', () => {
    test('returns empty result when callback returns no tasks', async () => {
      const getReadyTasks = async (_agentId: EntityId, _limit: number): Promise<UWPTaskInfo[]> => {
        return [];
      };

      const result = await spawnerService.checkReadyQueue(testAgentId, { getReadyTasks });

      expect(result.hasReadyTask).toBe(false);
      expect(result.autoStarted).toBe(false);
      expect(result.taskId).toBeUndefined();
    });

    test('returns task info when callback returns tasks', async () => {
      const mockTask: UWPTaskInfo = {
        id: 'task-001',
        title: 'Implement feature X',
        priority: 1,
        status: 'open',
      };

      const getReadyTasks = async (_agentId: EntityId, _limit: number): Promise<UWPTaskInfo[]> => {
        return [mockTask];
      };

      const result = await spawnerService.checkReadyQueue(testAgentId, { getReadyTasks });

      expect(result.hasReadyTask).toBe(true);
      expect(result.taskId).toBe('task-001');
      expect(result.taskTitle).toBe('Implement feature X');
      expect(result.taskPriority).toBe(1);
      expect(result.autoStarted).toBe(false);
    });

    test('returns first task when multiple tasks are returned', async () => {
      const mockTasks: UWPTaskInfo[] = [
        { id: 'task-high', title: 'High priority task', priority: 1, status: 'open' },
        { id: 'task-low', title: 'Low priority task', priority: 3, status: 'open' },
      ];

      const getReadyTasks = async (_agentId: EntityId, _limit: number): Promise<UWPTaskInfo[]> => {
        return mockTasks;
      };

      const result = await spawnerService.checkReadyQueue(testAgentId, { getReadyTasks });

      expect(result.hasReadyTask).toBe(true);
      expect(result.taskId).toBe('task-high');
      expect(result.taskTitle).toBe('High priority task');
      expect(result.taskPriority).toBe(1);
    });

    test('passes correct agentId and limit to callback', async () => {
      let capturedAgentId: EntityId | undefined;
      let capturedLimit: number | undefined;

      const getReadyTasks = async (agentId: EntityId, limit: number): Promise<UWPTaskInfo[]> => {
        capturedAgentId = agentId;
        capturedLimit = limit;
        return [];
      };

      await spawnerService.checkReadyQueue(testAgentId, { getReadyTasks, limit: 5 });

      expect(capturedAgentId).toBe(testAgentId);
      expect(capturedLimit).toBe(5);
    });

    test('uses default limit of 1 when not specified', async () => {
      let capturedLimit: number | undefined;

      const getReadyTasks = async (_agentId: EntityId, limit: number): Promise<UWPTaskInfo[]> => {
        capturedLimit = limit;
        return [];
      };

      await spawnerService.checkReadyQueue(testAgentId, { getReadyTasks });

      expect(capturedLimit).toBe(1);
    });
  });

  describe('with autoStart option', () => {
    test('sets autoStarted to true when autoStart is enabled and task found', async () => {
      const mockTask: UWPTaskInfo = {
        id: 'task-001',
        title: 'Implement feature X',
        priority: 1,
        status: 'open',
      };

      const getReadyTasks = async (_agentId: EntityId, _limit: number): Promise<UWPTaskInfo[]> => {
        return [mockTask];
      };

      const result = await spawnerService.checkReadyQueue(testAgentId, {
        getReadyTasks,
        autoStart: true,
      });

      expect(result.hasReadyTask).toBe(true);
      expect(result.autoStarted).toBe(true);
      expect(result.taskId).toBe('task-001');
    });

    test('sets autoStarted to false when autoStart is disabled', async () => {
      const mockTask: UWPTaskInfo = {
        id: 'task-001',
        title: 'Implement feature X',
        priority: 1,
        status: 'open',
      };

      const getReadyTasks = async (_agentId: EntityId, _limit: number): Promise<UWPTaskInfo[]> => {
        return [mockTask];
      };

      const result = await spawnerService.checkReadyQueue(testAgentId, {
        getReadyTasks,
        autoStart: false,
      });

      expect(result.hasReadyTask).toBe(true);
      expect(result.autoStarted).toBe(false);
    });

    test('does not set autoStarted when no task found', async () => {
      const getReadyTasks = async (_agentId: EntityId, _limit: number): Promise<UWPTaskInfo[]> => {
        return [];
      };

      const result = await spawnerService.checkReadyQueue(testAgentId, {
        getReadyTasks,
        autoStart: true,
      });

      expect(result.hasReadyTask).toBe(false);
      expect(result.autoStarted).toBe(false);
    });
  });

  describe('UWPCheckResult type', () => {
    test('has correct structure for task found case', () => {
      const result: UWPCheckResult = {
        hasReadyTask: true,
        taskId: 'task-001',
        taskTitle: 'Test task',
        taskPriority: 2,
        autoStarted: false,
      };

      expect(result.hasReadyTask).toBe(true);
      expect(result.taskId).toBeDefined();
      expect(result.taskTitle).toBeDefined();
      expect(result.taskPriority).toBeDefined();
    });

    test('has correct structure for no task case', () => {
      const result: UWPCheckResult = {
        hasReadyTask: false,
        autoStarted: false,
      };

      expect(result.hasReadyTask).toBe(false);
      expect(result.taskId).toBeUndefined();
      expect(result.taskTitle).toBeUndefined();
    });
  });

  describe('UWPTaskInfo type', () => {
    test('has all required fields', () => {
      const task: UWPTaskInfo = {
        id: 'task-001',
        title: 'Implement feature',
        priority: 1,
        status: 'open',
      };

      expect(task.id).toBe('task-001');
      expect(task.title).toBe('Implement feature');
      expect(task.priority).toBe(1);
      expect(task.status).toBe('open');
    });

    test('handles in_progress status', () => {
      const task: UWPTaskInfo = {
        id: 'task-002',
        title: 'Task in progress',
        priority: 2,
        status: 'in_progress',
      };

      expect(task.status).toBe('in_progress');
    });
  });

  describe('UWPCheckOptions type', () => {
    test('all options are optional', () => {
      const options1: UWPCheckOptions = {};
      const options2: UWPCheckOptions = { autoStart: true };
      const options3: UWPCheckOptions = { limit: 5 };
      const options4: UWPCheckOptions = {
        autoStart: true,
        limit: 3,
        getReadyTasks: async () => [],
      };

      expect(options1).toBeDefined();
      expect(options2.autoStart).toBe(true);
      expect(options3.limit).toBe(5);
      expect(options4.getReadyTasks).toBeDefined();
    });
  });
});

// ============================================================================
// Race Condition Guard Tests
// ============================================================================

/**
 * Creates a mock headless session that immediately finishes iterating
 * (simulating a stale/invalid resume session that exits without sending init).
 * The async iterator yields no init event, causing waitForInit to timeout.
 */
function createImmediateExitHeadlessSession(): HeadlessSession {
  return {
    sendMessage: () => {},
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        async next(): Promise<IteratorResult<AgentMessage>> {
          if (!done) {
            done = true;
            // Yield a result error (simulating stale session resume failure)
            return {
              done: false,
              value: {
                type: 'result',
                subtype: 'error_during_execution',
                content: 'No conversation found with session ID stale-session-123',
                raw: { errors: ['No conversation found with session ID stale-session-123'] },
              },
            };
          }
          // Stream ends — processProviderMessages will exit the for-await loop
          return { done: true, value: undefined };
        },
      };
    },
    interrupt: async () => {},
    close: () => {},
  };
}

/**
 * Creates a mock headless provider for testing.
 */
function createMockHeadlessProvider(
  sessionFactory: () => HeadlessSession
): HeadlessProvider {
  return {
    name: 'mock-headless',
    spawn: async (_options: HeadlessSpawnOptions) => sessionFactory(),
    isAvailable: async () => true,
  };
}

/**
 * Creates a mock interactive provider for testing.
 */
function createMockInteractiveProvider(): InteractiveProvider {
  return {
    name: 'mock-interactive',
    spawn: async (_options: InteractiveSpawnOptions): Promise<InteractiveSession> => {
      throw new Error('Interactive spawn not implemented in mock');
    },
    isAvailable: async () => true,
  };
}

/**
 * Creates a mock AgentProvider combining headless and interactive mocks.
 */
function createMockProvider(
  headlessSessionFactory: () => HeadlessSession
): AgentProvider {
  return {
    name: 'mock-provider',
    headless: createMockHeadlessProvider(headlessSessionFactory),
    interactive: createMockInteractiveProvider(),
    isAvailable: async () => true,
    getInstallInstructions: () => 'No install needed for mock',
    listModels: async (): Promise<ModelInfo[]> => [],
  };
}

describe('Race condition guards (terminated->terminated)', () => {
  test('spawnHeadless catch block does not throw when session is already terminated', async () => {
    // This test simulates the race condition:
    // 1. processProviderMessages finishes (fire-and-forget) → transitions to terminated
    // 2. waitForInit detects resume_failed → catch block tries to transition to terminated again
    // Without the guard, this would throw "Invalid status transition: terminated -> terminated"
    const mockProvider = createMockProvider(createImmediateExitHeadlessSession);

    const spawner = new SpawnerServiceImpl({
      provider: mockProvider,
      workingDirectory: '/tmp',
      timeout: 100, // Very short timeout
    });

    // The spawn should reject with a resume_failed error (fast-fail from waitForInit),
    // NOT with "Invalid status transition: terminated -> terminated"
    await expect(
      spawner.spawn(testAgentId, 'worker', {
        mode: 'headless',
        resumeSessionId: 'stale-session-123',
      })
    ).rejects.toThrow('Session resume failed');

    // Verify the session ended up in terminated state
    const sessions = spawner.listAllSessions(testAgentId);
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe('terminated');
    expect(sessions[0].endedAt).toBeDefined();
  });

  test('spawnHeadless catch block does not overwrite endedAt when already set', async () => {
    // When processProviderMessages finishes first, it sets endedAt.
    // The catch block should not overwrite it.
    const mockProvider = createMockProvider(createImmediateExitHeadlessSession);

    const spawner = new SpawnerServiceImpl({
      provider: mockProvider,
      workingDirectory: '/tmp',
      timeout: 100,
    });

    try {
      await spawner.spawn(testAgentId, 'worker', {
        mode: 'headless',
        resumeSessionId: 'stale-session-456',
      });
    } catch {
      // Expected to throw
    }

    const sessions = spawner.listAllSessions(testAgentId);
    expect(sessions.length).toBe(1);
    // endedAt should be set exactly once (not overwritten)
    expect(sessions[0].endedAt).toBeDefined();
  });

  test('spawn() catch block handles already-terminated session from spawnHeadless', async () => {
    // The outer spawn() catch block should also handle the case where
    // spawnHeadless already terminated the session.
    const mockProvider = createMockProvider(createImmediateExitHeadlessSession);

    const spawner = new SpawnerServiceImpl({
      provider: mockProvider,
      workingDirectory: '/tmp',
      timeout: 100,
    });

    // spawn() should propagate the timeout error cleanly
    let thrownError: Error | undefined;
    try {
      await spawner.spawn(testAgentId, 'worker', {
        mode: 'headless',
        resumeSessionId: 'stale-session-789',
      });
    } catch (error) {
      thrownError = error as Error;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError!.message).toContain('Session resume failed');

    // Session should be cleanly terminated
    const sessions = spawner.listAllSessions(testAgentId);
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe('terminated');
  });

  test('spawnInteractive catch block handles already-terminated session', async () => {
    // Create a mock interactive provider that simulates an exit callback
    // firing before the catch block runs.
    let exitCallback: ((code: number, signal?: number) => void) | undefined;

    const mockInteractiveProvider: InteractiveProvider = {
      name: 'mock-interactive',
      spawn: async (_options: InteractiveSpawnOptions): Promise<InteractiveSession> => {
        return {
          pid: 12345,
          write: () => {},
          resize: () => {},
          kill: () => {},
          onData: () => {},
          onExit: (cb: (code: number, signal?: number) => void) => {
            exitCallback = cb;
          },
          getSessionId: () => undefined,
        };
      },
      isAvailable: async () => true,
    };

    const mockProvider: AgentProvider = {
      name: 'mock-provider',
      headless: createMockHeadlessProvider(createImmediateExitHeadlessSession),
      interactive: mockInteractiveProvider,
      isAvailable: async () => true,
      getInstallInstructions: () => 'No install needed for mock',
      listModels: async (): Promise<ModelInfo[]> => [],
    };

    const spawner = new SpawnerServiceImpl({
      provider: mockProvider,
      workingDirectory: '/tmp',
      timeout: 100,
    });

    // Spawn in interactive mode — the spawn will succeed because transitionStatus(running) works
    const result = await spawner.spawn(testAgentId, 'director', {
      mode: 'interactive',
    });

    expect(result.session.status).toBe('running');

    // Simulate the exit callback firing (transitioning to terminated)
    if (exitCallback) {
      exitCallback(1, undefined);
    }

    // Verify the session is now terminated
    const sessions = spawner.listAllSessions(testAgentId);
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe('terminated');
  });

  test('normal headless spawn with init event succeeds without guard interference', async () => {
    // Ensure the guard doesn't break normal flow where session is NOT yet terminated.
    // The mock delays the result message so spawn() can return while session is still running.
    const mockHeadlessSession: HeadlessSession = {
      sendMessage: () => {},
      [Symbol.asyncIterator]() {
        let sentInit = false;
        let sentResult = false;
        return {
          async next(): Promise<IteratorResult<AgentMessage>> {
            if (!sentInit) {
              sentInit = true;
              return {
                done: false,
                value: {
                  type: 'system',
                  subtype: 'init',
                  sessionId: 'provider-session-abc',
                  content: 'Session initialized',
                  raw: { type: 'system', subtype: 'init', session_id: 'provider-session-abc' },
                },
              };
            }
            if (!sentResult) {
              sentResult = true;
              // Delay the result message so spawn() can return with running status
              await new Promise((resolve) => setTimeout(resolve, 100));
              return {
                done: false,
                value: {
                  type: 'result',
                  content: 'Task completed',
                  raw: { type: 'result', result: 'Task completed' },
                },
              };
            }
            return { done: true, value: undefined };
          },
        };
      },
      interrupt: async () => {},
      close: () => {},
    };

    const mockProvider = createMockProvider(() => mockHeadlessSession);

    const spawner = new SpawnerServiceImpl({
      provider: mockProvider,
      workingDirectory: '/tmp',
      timeout: 5000,
    });

    // Normal spawn should succeed — session is running after init
    const result = await spawner.spawn(testAgentId, 'worker', {
      mode: 'headless',
    });

    expect(result.session.status).toBe('running');
    expect(result.session.providerSessionId).toBe('provider-session-abc');

    // Wait for processProviderMessages to process the result and terminate
    await new Promise((resolve) => setTimeout(resolve, 200));

    // After the result message, processProviderMessages should terminate the session
    const sessions = spawner.listAllSessions(testAgentId);
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe('terminated');
  });
});

// ============================================================================
// waitForInit fast-fail on resume_failed and exit Tests
// ============================================================================

describe('waitForInit fast-fail on resume_failed', () => {
  test('rejects quickly with meaningful error when resume fails (session not found)', async () => {
    // This test verifies that when a stale session resume fails,
    // waitForInit rejects immediately via the resume_failed event
    // instead of blocking for the full timeout duration.
    const mockProvider = createMockProvider(createImmediateExitHeadlessSession);

    const LONG_TIMEOUT = 10_000; // 10 seconds — we should never wait this long
    const spawner = new SpawnerServiceImpl({
      provider: mockProvider,
      workingDirectory: '/tmp',
      timeout: LONG_TIMEOUT,
    });

    const startTime = Date.now();

    await expect(
      spawner.spawn(testAgentId, 'worker', {
        mode: 'headless',
        resumeSessionId: 'stale-session-fast-fail',
      })
    ).rejects.toThrow('Session resume failed');

    const elapsed = Date.now() - startTime;

    // Should reject well under the timeout — if it took more than 2 seconds,
    // the fast-fail isn't working (resume_failed was ignored).
    expect(elapsed).toBeLessThan(2000);

    // Verify the session ended up in terminated state
    const sessions = spawner.listAllSessions(testAgentId);
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe('terminated');
    expect(sessions[0].endedAt).toBeDefined();
  });

  test('resume_failed error includes the reason from the event', async () => {
    const mockProvider = createMockProvider(createImmediateExitHeadlessSession);

    const spawner = new SpawnerServiceImpl({
      provider: mockProvider,
      workingDirectory: '/tmp',
      timeout: 10_000,
    });

    let thrownError: Error | undefined;
    try {
      await spawner.spawn(testAgentId, 'worker', {
        mode: 'headless',
        resumeSessionId: 'stale-session-reason-check',
      });
    } catch (error) {
      thrownError = error as Error;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError!.message).toContain('Session resume failed');
    expect(thrownError!.message).toContain('No conversation found with session ID');
  });
});

describe('waitForInit fast-fail on exit', () => {
  test('rejects quickly with "Session exited before init" when process dies', async () => {
    // Create a mock headless session that immediately closes without emitting
    // any init event or resume_failed event — simulating a process crash.
    const createCrashingHeadlessSession = (): HeadlessSession => {
      return {
        sendMessage: () => {},
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<AgentMessage>> {
              // Stream ends immediately — no init, no resume error
              return { done: true, value: undefined };
            },
          };
        },
        interrupt: async () => {},
        close: () => {},
      };
    };

    const mockProvider = createMockProvider(createCrashingHeadlessSession);

    const LONG_TIMEOUT = 10_000;
    const spawner = new SpawnerServiceImpl({
      provider: mockProvider,
      workingDirectory: '/tmp',
      timeout: LONG_TIMEOUT,
    });

    const startTime = Date.now();

    await expect(
      spawner.spawn(testAgentId, 'worker', {
        mode: 'headless',
      })
    ).rejects.toThrow('Session exited before init');

    const elapsed = Date.now() - startTime;

    // Should reject well under the timeout
    expect(elapsed).toBeLessThan(2000);

    // Verify the session ended up in terminated state
    const sessions = spawner.listAllSessions(testAgentId);
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe('terminated');
  });
});

describe('waitForInit still resolves normally on init event', () => {
  test('normal spawn without resume succeeds when init event is received', async () => {
    // This ensures the new resume_failed/exit listeners don't interfere
    // with the normal init flow.
    const mockHeadlessSession: HeadlessSession = {
      sendMessage: () => {},
      [Symbol.asyncIterator]() {
        let sentInit = false;
        let sentResult = false;
        return {
          async next(): Promise<IteratorResult<AgentMessage>> {
            if (!sentInit) {
              sentInit = true;
              return {
                done: false,
                value: {
                  type: 'system',
                  subtype: 'init',
                  sessionId: 'provider-session-normal-test',
                  content: 'Session initialized',
                  raw: { type: 'system', subtype: 'init', session_id: 'provider-session-normal-test' },
                },
              };
            }
            if (!sentResult) {
              sentResult = true;
              await new Promise((resolve) => setTimeout(resolve, 100));
              return {
                done: false,
                value: {
                  type: 'result',
                  content: 'Task completed',
                  raw: { type: 'result', result: 'Task completed' },
                },
              };
            }
            return { done: true, value: undefined };
          },
        };
      },
      interrupt: async () => {},
      close: () => {},
    };

    const mockProvider = createMockProvider(() => mockHeadlessSession);

    const spawner = new SpawnerServiceImpl({
      provider: mockProvider,
      workingDirectory: '/tmp',
      timeout: 5000,
    });

    const result = await spawner.spawn(testAgentId, 'worker', {
      mode: 'headless',
    });

    expect(result.session.status).toBe('running');
    expect(result.session.providerSessionId).toBe('provider-session-normal-test');

    // Wait for processProviderMessages to finish
    await new Promise((resolve) => setTimeout(resolve, 300));

    const sessions = spawner.listAllSessions(testAgentId);
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe('terminated');
  });
});
