/**
 * Demo Mode Service Unit Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '@stoneforge/quarry';
import type { EntityId } from '@stoneforge/core';
import { createAgentRegistry, type AgentRegistry } from './agent-registry.js';
import { createSettingsService, type SettingsService } from './settings-service.js';
import {
  createDemoModeService,
  DEMO_PROVIDER,
  DEMO_MODEL,
  DEMO_MODE_SAVED_CONFIGS_KEY,
  type DemoModeService,
} from './demo-mode-service.js';
import { getAgentMetadata } from '../api/orchestrator-api.js';

describe('DemoModeService', () => {
  let agentRegistry: AgentRegistry;
  let settingsService: SettingsService;
  let demoModeService: DemoModeService;
  let testDbPath: string;
  let configEnabled: boolean;
  const createdBy = 'el-0000' as EntityId;

  beforeEach(() => {
    testDbPath = `/tmp/demo-mode-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath });
    initializeSchema(storage);

    const api = createQuarryAPI(storage);
    agentRegistry = createAgentRegistry(api);
    settingsService = createSettingsService(storage);
    configEnabled = false;

    demoModeService = createDemoModeService({
      agentRegistry,
      settingsService,
      persistConfigFlag: (enabled) => { configEnabled = enabled; },
      readConfigFlag: () => configEnabled,
    });
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('isEnabled returns false by default', () => {
    expect(demoModeService.isEnabled()).toBe(false);
  });

  test('getStatus returns correct default status', () => {
    const status = demoModeService.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.provider).toBe(DEMO_PROVIDER);
    expect(status.model).toBe(DEMO_MODEL);
    expect(status.savedConfigCount).toBe(0);
  });

  test('enable switches all agents to demo provider/model', async () => {
    // Register two workers with different providers
    await agentRegistry.registerWorker({
      name: 'worker-1',
      workerMode: 'ephemeral',
      createdBy,
      provider: 'claude-code',
      model: 'claude-sonnet-4-20250514',
    });
    await agentRegistry.registerWorker({
      name: 'worker-2',
      workerMode: 'ephemeral',
      createdBy,
      provider: 'codex',
      model: 'codex-large',
    });

    const result = await demoModeService.enable();

    expect(result.enabled).toBe(true);
    expect(result.agentsUpdated).toBe(2);
    expect(result.provider).toBe(DEMO_PROVIDER);
    expect(result.model).toBe(DEMO_MODEL);
    expect(configEnabled).toBe(true);

    // Verify agents were updated
    const agents = await agentRegistry.listAgents();
    for (const agent of agents) {
      const meta = getAgentMetadata(agent);
      expect(meta?.provider).toBe(DEMO_PROVIDER);
      expect(meta?.model).toBe(DEMO_MODEL);
    }
  });

  test('enable saves previous configs to settings', async () => {
    await agentRegistry.registerWorker({
      name: 'worker-a',
      workerMode: 'ephemeral',
      createdBy,
      provider: 'claude-code',
      model: 'claude-sonnet-4-20250514',
    });

    await demoModeService.enable();

    const saved = settingsService.getSetting(DEMO_MODE_SAVED_CONFIGS_KEY);
    expect(saved).toBeDefined();
    const configs = saved!.value as Array<{ agentName: string; provider: string; model: string }>;
    expect(configs.length).toBe(1);
    expect(configs[0].agentName).toBe('worker-a');
    expect(configs[0].provider).toBe('claude-code');
    expect(configs[0].model).toBe('claude-sonnet-4-20250514');
  });

  test('disable restores previous configs', async () => {
    await agentRegistry.registerWorker({
      name: 'worker-restore',
      workerMode: 'ephemeral',
      createdBy,
      provider: 'claude-code',
      model: 'claude-sonnet-4-20250514',
    });

    await demoModeService.enable();
    const result = await demoModeService.disable();

    expect(result.enabled).toBe(false);
    expect(result.agentsUpdated).toBe(1);
    expect(configEnabled).toBe(false);

    // Verify agent was restored
    const agents = await agentRegistry.listAgents();
    const meta = getAgentMetadata(agents[0]);
    expect(meta?.provider).toBe('claude-code');
    expect(meta?.model).toBe('claude-sonnet-4-20250514');

    // Verify saved configs were cleaned up
    const saved = settingsService.getSetting(DEMO_MODE_SAVED_CONFIGS_KEY);
    expect(saved).toBeUndefined();
  });

  test('getStatus reflects enabled state after enable', async () => {
    await agentRegistry.registerWorker({
      name: 'worker-status',
      workerMode: 'ephemeral',
      createdBy,
    });

    await demoModeService.enable();
    const status = demoModeService.getStatus();

    expect(status.enabled).toBe(true);
    expect(status.savedConfigCount).toBe(1);
  });

  test('enable with no agents succeeds', async () => {
    const result = await demoModeService.enable();
    expect(result.enabled).toBe(true);
    expect(result.agentsUpdated).toBe(0);
  });

  test('disable with no saved configs succeeds', async () => {
    configEnabled = true;
    const result = await demoModeService.disable();
    expect(result.enabled).toBe(false);
    expect(result.agentsUpdated).toBe(0);
  });
});
