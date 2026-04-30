/**
 * Agent Command Tests
 *
 * Tests for orchestrator CLI agent commands structure and validation.
 */

import { describe, it, expect, test, beforeEach } from 'bun:test';
import { createStorage, initializeSchema } from '@stoneforge/quarry';
import { createOrchestratorAPI } from '../../api/index.js';
import { isAgentDisabled } from '../../services/agent-registry.js';
import type { EntityId } from '@stoneforge/core';
import type { AgentMetadata } from '../../types/index.js';
import {
  agentCommand,
  agentListCommand,
  agentShowCommand,
  agentRegisterCommand,
  agentStartCommand,
  agentStopCommand,
  agentStreamCommand,
  agentDisableCommand,
  agentEnableCommand,
} from './agent.js';

describe('Agent Command Structure', () => {
  describe('agentCommand (parent)', () => {
    it('should have correct name and description', () => {
      expect(agentCommand.name).toBe('agent');
      expect(agentCommand.description).toBe('Manage orchestrator agents');
    });

    it('should have all subcommands', () => {
      expect(agentCommand.subcommands).toBeDefined();
      expect(agentCommand.subcommands!.list).toBe(agentListCommand);
      expect(agentCommand.subcommands!.show).toBe(agentShowCommand);
      expect(agentCommand.subcommands!.register).toBe(agentRegisterCommand);
      expect(agentCommand.subcommands!.start).toBe(agentStartCommand);
      expect(agentCommand.subcommands!.stop).toBe(agentStopCommand);
      expect(agentCommand.subcommands!.stream).toBe(agentStreamCommand);
      expect(agentCommand.subcommands!.disable).toBe(agentDisableCommand);
      expect(agentCommand.subcommands!.enable).toBe(agentEnableCommand);
    });

    it('should default to list handler', () => {
      expect(agentCommand.handler).toBe(agentListCommand.handler);
    });
  });

  describe('agentListCommand', () => {
    it('should have correct structure', () => {
      expect(agentListCommand.name).toBe('list');
      expect(agentListCommand.description).toBe('List registered agents');
      expect(agentListCommand.usage).toBe('sf agent list [options]');
      expect(typeof agentListCommand.handler).toBe('function');
    });

    it('should have all filter options', () => {
      expect(agentListCommand.options).toBeDefined();
      expect(agentListCommand.options!.length).toBe(6);
      expect(agentListCommand.options![0].name).toBe('role');
      expect(agentListCommand.options![1].name).toBe('status');
      expect(agentListCommand.options![2].name).toBe('workerMode');
      expect(agentListCommand.options![3].name).toBe('focus');
      expect(agentListCommand.options![4].name).toBe('reportsTo');
      expect(agentListCommand.options![5].name).toBe('hasSession');
    });
  });

  describe('agentShowCommand', () => {
    it('should have correct structure', () => {
      expect(agentShowCommand.name).toBe('show');
      expect(agentShowCommand.description).toBe('Show agent details');
      expect(agentShowCommand.usage).toBe('sf agent show <id>');
      expect(typeof agentShowCommand.handler).toBe('function');
    });
  });

  describe('agentRegisterCommand', () => {
    it('should have correct structure', () => {
      expect(agentRegisterCommand.name).toBe('register');
      expect(agentRegisterCommand.description).toBe('Register a new agent');
      expect(agentRegisterCommand.usage).toBe('sf agent register <name> --role <role> [options]');
      expect(typeof agentRegisterCommand.handler).toBe('function');
    });

    it('should have all registration options', () => {
      expect(agentRegisterCommand.options).toBeDefined();
      expect(agentRegisterCommand.options!.length).toBe(11);

      // Required role option
      const roleOption = agentRegisterCommand.options![0];
      expect(roleOption.name).toBe('role');
      expect(roleOption.required).toBe(true);

      // Mode option for workers
      const modeOption = agentRegisterCommand.options![1];
      expect(modeOption.name).toBe('mode');
      expect(modeOption.hasValue).toBe(true);

      // Focus option for stewards
      const focusOption = agentRegisterCommand.options![2];
      expect(focusOption.name).toBe('focus');
      expect(focusOption.hasValue).toBe(true);

      // MaxTasks option
      const maxTasksOption = agentRegisterCommand.options![3];
      expect(maxTasksOption.name).toBe('maxTasks');
      expect(maxTasksOption.hasValue).toBe(true);

      // Tags option
      const tagsOption = agentRegisterCommand.options![4];
      expect(tagsOption.name).toBe('tags');
      expect(tagsOption.hasValue).toBe(true);

      // ReportsTo option
      const reportsToOption = agentRegisterCommand.options![5];
      expect(reportsToOption.name).toBe('reportsTo');
      expect(reportsToOption.hasValue).toBe(true);

      // RoleDef option
      const roleDefOption = agentRegisterCommand.options![6];
      expect(roleDefOption.name).toBe('roleDef');
      expect(roleDefOption.hasValue).toBe(true);

      // Trigger option
      const triggerOption = agentRegisterCommand.options![7];
      expect(triggerOption.name).toBe('trigger');
      expect(triggerOption.hasValue).toBe(true);

      // Provider option
      const providerOption = agentRegisterCommand.options![8];
      expect(providerOption.name).toBe('provider');
      expect(providerOption.hasValue).toBe(true);

      // Model option
      const modelOption = agentRegisterCommand.options![9];
      expect(modelOption.name).toBe('model');
      expect(modelOption.hasValue).toBe(true);

      // Target branch option
      const targetBranchOption = agentRegisterCommand.options![10];
      expect(targetBranchOption.name).toBe('targetBranch');
      expect(targetBranchOption.hasValue).toBe(true);
    });

    it('should have --model option with correct properties', () => {
      const modelOption = agentRegisterCommand.options!.find(opt => opt.name === 'model');
      expect(modelOption).toBeDefined();
      expect(modelOption!.hasValue).toBe(true);
      expect(modelOption!.description).toContain('LLM model');
    });

    it('should have --target-branch option with correct properties', () => {
      const targetBranchOption = agentRegisterCommand.options!.find(opt => opt.name === 'targetBranch');
      expect(targetBranchOption).toBeDefined();
      expect(targetBranchOption!.hasValue).toBe(true);
      expect(targetBranchOption!.description).toContain('Target branch');
    });

    it('should accept --target-branch flag via parser', async () => {
      const { parseArgs } = await import('@stoneforge/quarry/cli');
      const result = parseArgs(
        ['agent', 'register', 'TestDir', '--role', 'director', '--target-branch', 'staging'],
        agentRegisterCommand.options!,
        { strict: false }
      );
      expect(result.commandOptions.targetBranch).toBe('staging');
    });
  });

  describe('agentStartCommand', () => {
    it('should have correct structure', () => {
      expect(agentStartCommand.name).toBe('start');
      expect(agentStartCommand.description).toBe('Start an agent process');
      expect(agentStartCommand.usage).toBe('sf agent start <id> [options]');
      expect(typeof agentStartCommand.handler).toBe('function');
    });

    it('should have all start options', () => {
      expect(agentStartCommand.options).toBeDefined();
      expect(agentStartCommand.options!.length).toBe(12);
      expect(agentStartCommand.options![0].name).toBe('prompt');
      expect(agentStartCommand.options![1].name).toBe('mode');
      expect(agentStartCommand.options![2].name).toBe('resume');
      expect(agentStartCommand.options![3].name).toBe('workdir');
      expect(agentStartCommand.options![4].name).toBe('cols');
      expect(agentStartCommand.options![5].name).toBe('rows');
      expect(agentStartCommand.options![6].name).toBe('timeout');
      expect(agentStartCommand.options![7].name).toBe('env');
      expect(agentStartCommand.options![8].name).toBe('taskId');
      expect(agentStartCommand.options![9].name).toBe('stream');
      expect(agentStartCommand.options![10].name).toBe('provider');
      expect(agentStartCommand.options![11].name).toBe('model');
    });

    it('should have --model option with correct properties', () => {
      const modelOption = agentStartCommand.options!.find(opt => opt.name === 'model');
      expect(modelOption).toBeDefined();
      expect(modelOption!.hasValue).toBe(true);
      expect(modelOption!.description).toContain('model');
    });
  });

  describe('agentStopCommand', () => {
    it('should have correct structure', () => {
      expect(agentStopCommand.name).toBe('stop');
      expect(agentStopCommand.description).toBe('Stop an agent session');
      expect(agentStopCommand.usage).toBe('sf agent stop <id> [options]');
      expect(typeof agentStopCommand.handler).toBe('function');
    });

    it('should have all stop options', () => {
      expect(agentStopCommand.options).toBeDefined();
      expect(agentStopCommand.options!.length).toBe(3);
      expect(agentStopCommand.options![0].name).toBe('graceful');
      expect(agentStopCommand.options![1].name).toBe('no-graceful');
      expect(agentStopCommand.options![2].name).toBe('reason');
      expect(agentStopCommand.options![2].hasValue).toBe(true);
    });
  });

  describe('agentStreamCommand', () => {
    it('should have correct structure', () => {
      expect(agentStreamCommand.name).toBe('stream');
      expect(agentStreamCommand.description).toBe('Get agent channel for streaming');
      expect(agentStreamCommand.usage).toBe('sf agent stream <id>');
      expect(typeof agentStreamCommand.handler).toBe('function');
    });
  });

  describe('agentDisableCommand', () => {
    it('should have correct structure', () => {
      expect(agentDisableCommand.name).toBe('disable');
      expect(agentDisableCommand.description).toBe('Disable an agent (skipped by dispatch and scheduler, kept in the list)');
      expect(agentDisableCommand.usage).toBe('sf agent disable <id>');
      expect(typeof agentDisableCommand.handler).toBe('function');
    });
  });

  describe('agentEnableCommand', () => {
    it('should have correct structure', () => {
      expect(agentEnableCommand.name).toBe('enable');
      expect(agentEnableCommand.description).toBe('Enable a previously disabled agent');
      expect(agentEnableCommand.usage).toBe('sf agent enable <id>');
      expect(typeof agentEnableCommand.handler).toBe('function');
    });
  });
});

describe('Agent Command Validation', () => {
  describe('agentShowCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentShowCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });

  describe('agentRegisterCommand', () => {
    it('should fail without name argument', async () => {
      const result = await agentRegisterCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });

    it('should fail without role option', async () => {
      const result = await agentRegisterCommand.handler(['TestAgent'], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('--role');
    });

    it('should fail with invalid role', async () => {
      const result = await agentRegisterCommand.handler(['TestAgent'], { role: 'invalid' });
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Invalid role');
    });
  });

  describe('agentStartCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentStartCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });

  describe('agentStopCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentStopCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });

  describe('agentStreamCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentStreamCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });

  describe('agentDisableCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentDisableCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });

  describe('agentEnableCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentEnableCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });
});

// ============================================================================
// Behavioural round-trip tests for agent disable / enable
//
// The CLI handlers call createOrchestratorClient(), which runs
// findStoneforgeDir(process.cwd()) before honouring options.db. Invoking the
// handler literally in a test environment (no .stoneforge dir on disk) would
// always hit the "Run sf init first" early-return path, so these tests verify
// the mutation behaviour by calling the SAME api methods the handlers call,
// using an in-memory SQLite backend. The handler bodies are intentionally
// thin wrappers around api.updateAgentMetadata, so this approach gives full
// coverage of the observable effect without duplicating handler logic.
// ============================================================================

describe('agent disable / enable behavioural', () => {
  // Reuse the OPERATOR_ENTITY_ID constant ('el-0000') as the creator.
  // It is a valid EntityId string - no DB row is needed for it since
  // registerWorker only stores the value, it does not foreign-key-check it.
  const CREATOR = 'el-0000' as EntityId;

  let api: ReturnType<typeof createOrchestratorAPI>;
  let agentId: EntityId;

  beforeEach(async () => {
    const backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = createOrchestratorAPI(backend);

    const registered = await api.registerWorker({
      name: 'test-worker',
      workerMode: 'ephemeral',
      createdBy: CREATOR,
    });
    agentId = registered.id as unknown as EntityId;
  });

  test('disable round-trip: updateAgentMetadata sets disabled to true', async () => {
    // This mirrors exactly what agentDisableHandler does after resolving the API.
    await api.updateAgentMetadata(agentId, { disabled: true } as Partial<AgentMetadata>);

    const agent = await api.getAgent(agentId);
    expect(agent).toBeDefined();
    expect((agent!.metadata.agent as { disabled?: boolean }).disabled).toBe(true);
    expect(isAgentDisabled(agent!)).toBe(true);
  });

  test('enable round-trip: updateAgentMetadata removes disabled key from serialised JSON', async () => {
    // First disable the agent, then re-enable it - same sequence as the two
    // handlers called back-to-back.
    await api.updateAgentMetadata(agentId, { disabled: true } as Partial<AgentMetadata>);
    // Sanity-check that it is actually disabled before we enable it.
    const disabledAgent = await api.getAgent(agentId);
    expect(isAgentDisabled(disabledAgent!)).toBe(true);

    // This mirrors exactly what agentEnableHandler does after resolving the API.
    await api.updateAgentMetadata(agentId, { disabled: undefined } as Partial<AgentMetadata>);

    const agent = await api.getAgent(agentId);
    expect(agent).toBeDefined();

    // isAgentDisabled must return false after the enable call.
    expect(isAgentDisabled(agent!)).toBe(false);

    // JSON.stringify drops undefined values, so the serialised agent metadata
    // must contain no "disabled" key - this is the contract that
    // absent-means-enabled relies on.
    expect(JSON.stringify(agent!.metadata!.agent).includes('"disabled"')).toBe(false);
  });
});
