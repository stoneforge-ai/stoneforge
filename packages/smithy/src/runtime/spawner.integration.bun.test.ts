/**
 * Spawner Service Integration Tests
 *
 * These tests validate the SpawnerService with a real Claude Code instance.
 * They require Claude Code to be installed and available in the PATH.
 *
 * Note: These tests are slower as they spawn actual Claude processes.
 * Run with: RUN_INTEGRATION_TESTS=true bun test src/runtime/spawner.integration.test.ts
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import type { EntityId } from '@stoneforge/core';
import {
  createSpawnerService,
  type SpawnerService,
  type SpawnedSessionEvent,
} from './spawner.js';

// Skip integration tests unless RUN_INTEGRATION_TESTS is explicitly set
// These tests require Claude Code to be installed and running
const skipIntegration = process.env.RUN_INTEGRATION_TESTS !== 'true';

// Helper to check if claude is available
async function isClaudeAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', 'claude'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

describe('SpawnerService Integration', () => {
  let service: SpawnerService;
  const testAgentId = 'integration-test-agent' as EntityId;

  beforeEach(async () => {
    if (skipIntegration) {
      return;
    }

    const claudeAvailable = await isClaudeAvailable();
    if (!claudeAvailable) {
      console.log('Skipping integration tests: Claude Code not available');
      return;
    }

    service = createSpawnerService({
      timeout: 30000, // 30 seconds for integration tests
    });
  });

  afterEach(async () => {
    if (!service) return;

    // Clean up any active sessions
    const sessions = service.listActiveSessions();
    for (const session of sessions) {
      try {
        await service.terminate(session.id, false); // Force kill
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  test.skipIf(skipIntegration)('spawns headless worker and receives init event', async () => {
    const claudeAvailable = await isClaudeAvailable();
    if (!claudeAvailable) {
      console.log('Skipping: Claude Code not available');
      return;
    }

    const result = await service.spawn(testAgentId, 'worker', {
      mode: 'headless',
      initialPrompt: 'Say hello and exit immediately',
    });

    expect(result.session).toBeDefined();
    expect(result.session.id).toBeDefined();
    expect(result.session.agentId).toBe(testAgentId);
    expect(result.session.agentRole).toBe('worker');
    expect(result.session.mode).toBe('headless');
    expect(result.session.status).toBe('running');
    expect(result.session.providerSessionId).toBeDefined();

    // Verify the session is tracked
    const session = service.getSession(result.session.id);
    expect(session).toBeDefined();
    expect(session?.status).toBe('running');

    // Clean up
    await service.terminate(result.session.id);
  }, 60000); // 60 second timeout for this test

  test.skipIf(skipIntegration)('receives events from headless agent', async () => {
    const claudeAvailable = await isClaudeAvailable();
    if (!claudeAvailable) {
      console.log('Skipping: Claude Code not available');
      return;
    }

    const events: SpawnedSessionEvent[] = [];

    const result = await service.spawn(testAgentId, 'worker', {
      mode: 'headless',
      initialPrompt: 'Output the text "test output" and nothing else',
    });

    // Collect events for a short period
    const eventPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 10000);

      result.events.on('event', (event: SpawnedSessionEvent) => {
        events.push(event);
        // If we get an assistant message, we're done
        if (event.type === 'assistant' && event.message) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    await eventPromise;

    // Verify we received events
    expect(events.length).toBeGreaterThan(0);

    // Clean up
    await service.terminate(result.session.id);
  }, 60000);

  test.skipIf(skipIntegration)('can terminate running session', async () => {
    const claudeAvailable = await isClaudeAvailable();
    if (!claudeAvailable) {
      console.log('Skipping: Claude Code not available');
      return;
    }

    const result = await service.spawn(testAgentId, 'worker', {
      mode: 'headless',
    });

    expect(result.session.status).toBe('running');

    // Terminate the session
    await service.terminate(result.session.id);

    // Verify session is terminated
    const session = service.getSession(result.session.id);
    expect(session?.status).toBe('terminated');
    expect(session?.endedAt).toBeDefined();
  }, 60000);

  test.skipIf(skipIntegration)('tracks multiple sessions', async () => {
    const claudeAvailable = await isClaudeAvailable();
    if (!claudeAvailable) {
      console.log('Skipping: Claude Code not available');
      return;
    }

    const agent1 = 'agent-1' as EntityId;
    const agent2 = 'agent-2' as EntityId;

    const result1 = await service.spawn(agent1, 'worker', { mode: 'headless' });
    const result2 = await service.spawn(agent2, 'worker', { mode: 'headless' });

    // Verify both sessions are tracked
    const allSessions = service.listActiveSessions();
    expect(allSessions.length).toBe(2);

    const agent1Sessions = service.listActiveSessions(agent1);
    expect(agent1Sessions.length).toBe(1);
    expect(agent1Sessions[0].id).toBe(result1.session.id);

    // Clean up
    await service.terminate(result1.session.id);
    await service.terminate(result2.session.id);
  }, 120000);
});
