/**
 * Metrics Command Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { metricsCommand } from './metrics.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_metrics_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

function seedMetrics(backend: StorageBackend) {
  const now = new Date().toISOString();
  const entries = [
    { id: 'pm-1', timestamp: now, provider: 'claude-code', model: 'claude-sonnet-4', session_id: 's1', task_id: 'el-abc1', agent_id: 'el-agent1', input_tokens: 5000, output_tokens: 2000, duration_ms: 10000, outcome: 'completed', estimated_cost: 0.045 },
    { id: 'pm-2', timestamp: now, provider: 'claude-code', model: 'claude-sonnet-4', session_id: 's2', task_id: 'el-abc2', agent_id: 'el-agent1', input_tokens: 3000, output_tokens: 1500, duration_ms: 8000, outcome: 'completed', estimated_cost: 0.0315 },
    { id: 'pm-3', timestamp: now, provider: 'claude-code', model: 'claude-opus-4', session_id: 's3', task_id: 'el-abc3', agent_id: 'el-agent2', input_tokens: 10000, output_tokens: 5000, duration_ms: 30000, outcome: 'failed', estimated_cost: 0.105 },
    { id: 'pm-4', timestamp: now, provider: 'opencode', model: null, session_id: 's4', task_id: null, agent_id: null, input_tokens: 1000, output_tokens: 500, duration_ms: 5000, outcome: 'completed', estimated_cost: 0.0105 },
  ];

  for (const entry of entries) {
    backend.run(
      `INSERT INTO provider_metrics (id, timestamp, provider, model, session_id, task_id, agent_id, input_tokens, output_tokens, duration_ms, outcome, estimated_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, entry.timestamp, entry.provider, entry.model, entry.session_id, entry.task_id, entry.agent_id, entry.input_tokens, entry.output_tokens, entry.duration_ms, entry.outcome, entry.estimated_cost]
    );
  }
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Metrics Command Tests
// ============================================================================

describe('metrics command', () => {
  test('shows empty message when no metrics exist', async () => {
    // Init DB first so schema is created
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No metrics recorded');
  });

  test('shows metrics summary', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions();
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Provider Metrics');
    expect(result.message).toContain('Summary:');
    expect(result.message).toContain('claude-code');
    expect(result.message).toContain('opencode');
    expect(result.message).toContain('By Provider');
    expect(result.data).toBeDefined();
  });

  test('filters by provider', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions({ provider: 'opencode' });
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('opencode');
    expect(result.message).toContain('Filtered by provider: opencode');

    // Should only show 1 group
    const data = result.data as { metrics: unknown[] };
    expect(data.metrics).toHaveLength(1);
  });

  test('filters by task ID', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions({ task: 'el-abc1' });
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Filtered by task: el-abc1');
    const data = result.data as { metrics: unknown[] };
    expect(data.metrics).toHaveLength(1);
  });

  test('filters by agent ID', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions({ agent: 'el-agent1' });
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Filtered by agent: el-agent1');
    const data = result.data as { metrics: unknown[] };
    expect(data.metrics).toHaveLength(1);
  });

  test('groups by model', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions({ 'group-by': 'model' });
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('By Model');
    expect(result.message).toContain('claude-sonnet-4');
  });

  test('groups by task', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions({ 'group-by': 'task' });
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('By Task');
    expect(result.message).toContain('el-abc1');
  });

  test('groups by agent', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions({ 'group-by': 'agent' });
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('By Agent');
    expect(result.message).toContain('el-agent1');
  });

  test('accepts range option', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions({ range: '30d' });
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('last 30 days');
    const data = result.data as { timeRange: { days: number } };
    expect(data.timeRange.days).toBe(30);
  });

  test('returns data in JSON-friendly format', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions({ json: true });
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const data = result.data as {
      timeRange: { days: number; label: string };
      groupBy: string;
      metrics: unknown[];
      totals: { totalTokens: number; sessionCount: number; estimatedCost: number };
    };

    expect(data.timeRange.days).toBe(7);
    expect(data.groupBy).toBe('provider');
    expect(data.metrics.length).toBeGreaterThan(0);
    expect(data.totals.totalTokens).toBeGreaterThan(0);
    expect(data.totals.sessionCount).toBe(4);
    expect(data.totals.estimatedCost).toBeGreaterThan(0);
  });

  test('shows estimated cost', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions();
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Estimated cost:');
    expect(result.message).toContain('Est. cost:');
  });

  test('shows error rate', async () => {
    const backend = createStorage({ path: DB_PATH });
    initializeSchema(backend);
    seedMetrics(backend);

    const options = createTestOptions();
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Error rate:');
  });

  test('fails when database does not exist', async () => {
    const nonExistentPath = join(TEST_DIR, 'nonexistent', 'test.db');
    const options = createTestOptions({ db: nonExistentPath });
    const result = await metricsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.error).toContain('No database found');
  });
});

// ============================================================================
// Command Structure Tests
// ============================================================================

describe('metrics command structure', () => {
  test('has correct name', () => {
    expect(metricsCommand.name).toBe('metrics');
  });

  test('has description', () => {
    expect(metricsCommand.description).toBeDefined();
    expect(metricsCommand.description.length).toBeGreaterThan(0);
  });

  test('has usage', () => {
    expect(metricsCommand.usage).toBeDefined();
    expect(metricsCommand.usage).toContain('metrics');
  });

  test('has help text', () => {
    expect(metricsCommand.help).toBeDefined();
    expect(metricsCommand.help).toContain('metrics');
  });

  test('has options defined', () => {
    expect(metricsCommand.options).toBeDefined();
    expect(metricsCommand.options!.length).toBe(5);

    const optionNames = metricsCommand.options!.map(o => o.name);
    expect(optionNames).toContain('range');
    expect(optionNames).toContain('provider');
    expect(optionNames).toContain('group-by');
    expect(optionNames).toContain('task');
    expect(optionNames).toContain('agent');
  });
});
