/**
 * Agent Commands - CLI operations for orchestrator agents
 *
 * Provides commands for agent management:
 * - agent list: List all registered agents
 * - agent show <id>: Show agent details
 * - agent register <name>: Register a new agent
 * - agent start <id>: Start (spawn) a Claude Code process for an agent
 * - agent stop <id>: Stop an agent session
 * - agent stream <id>: Get agent channel for streaming
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getFormatter, getOutputMode, OPERATOR_ENTITY_ID } from '@stoneforge/quarry/cli';
import type { EntityId, ElementId } from '@stoneforge/core';
import type { AgentRole, WorkerMode, StewardFocus } from '../../types/index.js';
import type { OrchestratorAPI, AgentEntity } from '../../api/index.js';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates orchestrator API client
 */
async function createOrchestratorClient(options: GlobalOptions): Promise<{
  api: OrchestratorAPI | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createOrchestratorAPI } = await import('../../api/index.js');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return {
        api: null,
        error: 'No .stoneforge directory found. Run "sf init" first.',
      };
    }

    const dbPath = options.db ?? `${stoneforgeDir}/stoneforge.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = createOrchestratorAPI(backend);

    return { api };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { api: null, error: `Failed to initialize API: ${message}` };
  }
}

/**
 * Gets agent metadata from agent entity
 */
function getAgentMeta(agent: AgentEntity): Record<string, unknown> {
  return (agent.metadata?.agent ?? {}) as unknown as Record<string, unknown>;
}

/**
 * Streams output from a spawned session's event emitter
 * This is a long-running operation that continues until the session ends
 */
async function streamSpawnedSession(
  events: import('node:events').EventEmitter,
  sessionMode: 'headless' | 'interactive'
): Promise<void> {
  return new Promise((resolve) => {
    const onInterrupt = () => {
      console.log('\n[Stream interrupted]');
      cleanup();
      resolve();
    };

    const cleanup = () => {
      process.off('SIGINT', onInterrupt);
      events.off('event', onEvent);
      events.off('pty-data', onPtyData);
      events.off('exit', onExit);
      events.off('error', onError);
    };

    const onEvent = (event: { type: string; message?: string; tool?: { name?: string } }) => {
      if (event.type === 'assistant' && event.message) {
        process.stdout.write(event.message);
      } else if (event.type === 'tool_use' && event.tool?.name) {
        console.log(`\n[Tool: ${event.tool.name}]`);
      } else if (event.type === 'result' && event.message) {
        console.log(`\n[Result: ${event.message}]`);
      }
    };

    const onPtyData = (data: string) => {
      process.stdout.write(data);
    };

    const onExit = (code: number | null, signal: string | null) => {
      // User-friendly message for normal exit, show exit code for debugging on errors
      const exitMessage = code === 0
        ? 'The agent has stopped the session'
        : `The agent session ended unexpectedly (exit code ${code})${signal ? ` (signal: ${signal})` : ''}`;
      console.log(`\n[${exitMessage}]`);
      cleanup();
      resolve();
    };

    const onError = (error: Error) => {
      console.error(`\n[Error: ${error.message}]`);
    };

    process.on('SIGINT', onInterrupt);

    if (sessionMode === 'headless') {
      events.on('event', onEvent);
    } else {
      events.on('pty-data', onPtyData);
    }

    events.on('exit', onExit);
    events.on('error', onError);
  });
}

// ============================================================================
// Agent List Command
// ============================================================================

interface AgentListOptions {
  role?: string;
  status?: string;
  workerMode?: string;
  focus?: string;
  reportsTo?: string;
  hasSession?: boolean;
}

const agentListOptions: CommandOption[] = [
  {
    name: 'role',
    short: 'r',
    description: 'Filter by role (director, worker, steward)',
    hasValue: true,
  },
  {
    name: 'status',
    short: 's',
    description: 'Filter by session status (idle, running, suspended, terminated)',
    hasValue: true,
  },
  {
    name: 'workerMode',
    short: 'm',
    description: 'Filter by worker mode (ephemeral, persistent)',
    hasValue: true,
  },
  {
    name: 'focus',
    short: 'f',
    description: 'Filter by steward focus (merge, docs)',
    hasValue: true,
  },
  {
    name: 'reportsTo',
    description: 'Filter by manager entity ID',
    hasValue: true,
  },
  {
    name: 'hasSession',
    description: 'Filter to agents with active sessions',
  },
];

async function agentListHandler(
  _args: string[],
  options: GlobalOptions & AgentListOptions
): Promise<CommandResult> {
  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    let agents: AgentEntity[];

    // Filter by role if specified
    if (options.role) {
      const validRoles = ['director', 'worker', 'steward'];
      if (!validRoles.includes(options.role)) {
        return failure(
          `Invalid role: ${options.role}. Must be one of: ${validRoles.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      agents = await api.getAgentsByRole(options.role as AgentRole);
    } else {
      agents = await api.listAgents();
    }

    // Additional filter by status
    if (options.status) {
      const validStatuses = ['idle', 'running', 'suspended', 'terminated'];
      if (!validStatuses.includes(options.status)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      agents = agents.filter((a) => {
        const meta = getAgentMeta(a);
        return meta.sessionStatus === options.status;
      });
    }

    // Filter by worker mode
    if (options.workerMode) {
      const validModes = ['ephemeral', 'persistent'];
      if (!validModes.includes(options.workerMode)) {
        return failure(
          `Invalid workerMode: ${options.workerMode}. Must be one of: ${validModes.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      agents = agents.filter((a) => {
        const meta = getAgentMeta(a);
        return meta.workerMode === options.workerMode;
      });
    }

    // Filter by steward focus
    if (options.focus) {
      const validFocuses = ['merge', 'docs', 'custom'];
      if (!validFocuses.includes(options.focus)) {
        return failure(
          `Invalid focus: ${options.focus}. Must be one of: ${validFocuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      agents = agents.filter((a) => {
        const meta = getAgentMeta(a);
        return meta.stewardFocus === options.focus;
      });
    }

    // Filter by manager
    if (options.reportsTo) {
      agents = agents.filter((a) => a.reportsTo === options.reportsTo);
    }

    // Filter by has session
    if (options.hasSession) {
      agents = agents.filter((a) => {
        const meta = getAgentMeta(a);
        return meta.sessionId !== undefined;
      });
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(agents);
    }

    if (mode === 'quiet') {
      return success(agents.map((a) => a.id).join('\n'));
    }

    if (agents.length === 0) {
      return success(null, 'No agents found');
    }

    const headers = ['ID', 'NAME', 'ROLE', 'STATUS', 'SESSION'];
    const rows = agents.map((agent) => {
      const meta = getAgentMeta(agent);
      return [
        agent.id,
        agent.name ?? '-',
        (meta.agentRole as string) ?? '-',
        (meta.sessionStatus as string) ?? 'idle',
        (meta.sessionId as string)?.slice(0, 8) ?? '-',
      ];
    });

    const table = formatter.table(headers, rows);
    return success(agents, `${table}\n${agents.length} agent(s)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list agents: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentListCommand: Command = {
  name: 'list',
  description: 'List registered agents',
  usage: 'sf agent list [options]',
  help: `List all registered orchestrator agents.

Options:
  -r, --role <role>        Filter by role (director, worker, steward)
  -s, --status <status>    Filter by session status (idle, running, suspended, terminated)
  -m, --workerMode <mode>  Filter by worker mode (ephemeral, persistent)
  -f, --focus <focus>      Filter by steward focus (merge, docs)
  --reportsTo <id>         Filter by manager entity ID
  --hasSession             Filter to agents with active sessions

Examples:
  sf agent list
  sf agent list --role worker
  sf agent list --role worker --workerMode ephemeral
  sf agent list --status running
  sf agent list --role steward --focus merge
  sf agent list --hasSession`,
  options: agentListOptions,
  handler: agentListHandler as Command['handler'],
};

// ============================================================================
// Agent Show Command
// ============================================================================

async function agentShowHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf agent show <id>\nExample: sf agent show el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    const agent = await api.getAgent(id as EntityId);
    if (!agent) {
      return failure(`Agent not found: ${id}`, ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(agent);
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    const meta = getAgentMeta(agent);
    const lines = [
      `ID:       ${agent.id}`,
      `Name:     ${agent.name ?? '-'}`,
      `Role:     ${meta.agentRole ?? '-'}`,
      `Status:   ${meta.sessionStatus ?? 'idle'}`,
      `Session:  ${meta.sessionId ?? '-'}`,
      `Channel:  ${meta.channelId ?? '-'}`,
      `Created:  ${agent.createdAt}`,
    ];

    if (meta.workerMode) {
      lines.push(`Mode:     ${meta.workerMode}`);
    }
    if (meta.stewardFocus) {
      lines.push(`Focus:    ${meta.stewardFocus}`);
    }

    return success(agent, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to show agent: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentShowCommand: Command = {
  name: 'show',
  description: 'Show agent details',
  usage: 'sf agent show <id>',
  help: `Show detailed information about an agent.

Arguments:
  id    Agent identifier

Examples:
  sf agent show el-abc123`,
  options: [],
  handler: agentShowHandler as Command['handler'],
};

// ============================================================================
// Agent Register Command
// ============================================================================

interface AgentRegisterOptions {
  role?: string;
  mode?: string;
  focus?: string;
  maxTasks?: string;
  tags?: string;
  reportsTo?: string;
  roleDef?: string;
  trigger?: string;
  provider?: string;
  model?: string;
}

const agentRegisterOptions: CommandOption[] = [
  {
    name: 'role',
    short: 'r',
    description: 'Agent role (worker, director, steward)',
    hasValue: true,
    required: true,
  },
  {
    name: 'mode',
    short: 'm',
    description: 'Worker mode (ephemeral, persistent)',
    hasValue: true,
  },
  {
    name: 'focus',
    short: 'f',
    description: 'Steward focus (merge, docs)',
    hasValue: true,
  },
  {
    name: 'maxTasks',
    short: 't',
    description: 'Maximum concurrent tasks (default: 1)',
    hasValue: true,
  },
  {
    name: 'tags',
    description: 'Comma-separated tags',
    hasValue: true,
  },
  {
    name: 'reportsTo',
    description: 'Manager entity ID',
    hasValue: true,
  },
  {
    name: 'roleDef',
    description: 'Role definition document ID',
    hasValue: true,
  },
  {
    name: 'trigger',
    description: 'Steward cron trigger (e.g., "0 2 * * *")',
    hasValue: true,
  },
  {
    name: 'provider',
    description: 'Agent provider (e.g., claude, opencode)',
    hasValue: true,
  },
  {
    name: 'model',
    description: 'LLM model to use (e.g., claude-sonnet-4-5-20250929)',
    hasValue: true,
  },
];

async function agentRegisterHandler(
  args: string[],
  options: GlobalOptions & AgentRegisterOptions
): Promise<CommandResult> {
  const [name] = args;

  if (!name) {
    return failure('Usage: sf agent register <name> --role <role> [options]\nExample: sf agent register MyWorker --role worker', ExitCode.INVALID_ARGUMENTS);
  }

  if (!options.role) {
    return failure('--role is required', ExitCode.INVALID_ARGUMENTS);
  }

  const validRoles = ['director', 'worker', 'steward'];
  if (!validRoles.includes(options.role)) {
    return failure(
      `Invalid role: ${options.role}. Must be one of: ${validRoles.join(', ')}`,
      ExitCode.VALIDATION
    );
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    // Use the default operator entity for CLI operations
    const createdBy = (options.actor ?? OPERATOR_ENTITY_ID) as EntityId;
    const maxConcurrentTasks = options.maxTasks ? parseInt(options.maxTasks, 10) : 1;
    const tags = options.tags ? options.tags.split(',').map(t => t.trim()) : undefined;
    const reportsTo = options.reportsTo as EntityId | undefined;
    const roleDefinitionRef = options.roleDef as ElementId | undefined;

    let agent: AgentEntity;

    switch (options.role as AgentRole) {
      case 'director':
        agent = await api.registerDirector({
          name,
          createdBy,
          maxConcurrentTasks,
          tags,
          roleDefinitionRef,
          provider: options.provider,
          model: options.model,
        });
        break;

      case 'worker': {
        const workerMode = (options.mode as WorkerMode) ?? 'ephemeral';
        const validModes = ['ephemeral', 'persistent'];
        if (!validModes.includes(workerMode)) {
          return failure(
            `Invalid mode: ${workerMode}. Must be one of: ${validModes.join(', ')}`,
            ExitCode.VALIDATION
          );
        }
        agent = await api.registerWorker({
          name,
          createdBy,
          workerMode,
          maxConcurrentTasks,
          tags,
          reportsTo,
          roleDefinitionRef,
          provider: options.provider,
          model: options.model,
        });
        break;
      }

      case 'steward': {
        const stewardFocus = (options.focus as StewardFocus) ?? 'merge';
        const validFocuses = ['merge', 'docs', 'custom'];
        if (!validFocuses.includes(stewardFocus)) {
          return failure(
            `Invalid focus: ${stewardFocus}. Must be one of: ${validFocuses.join(', ')}`,
            ExitCode.VALIDATION
          );
        }
        // Parse trigger if provided
        const triggers: Array<{ type: 'cron'; schedule: string }> = [];
        if (options.trigger) {
          triggers.push({ type: 'cron', schedule: options.trigger });
        }
        agent = await api.registerSteward({
          name,
          createdBy,
          stewardFocus,
          triggers,
          maxConcurrentTasks,
          tags,
          reportsTo,
          roleDefinitionRef,
          provider: options.provider,
          model: options.model,
        });
        break;
      }

      default:
        return failure(`Unknown role: ${options.role}`, ExitCode.VALIDATION);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(agent);
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    return success(agent, `Registered ${options.role} agent: ${agent.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to register agent: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentRegisterCommand: Command = {
  name: 'register',
  description: 'Register a new agent',
  usage: 'sf agent register <name> --role <role> [options]',
  help: `Register a new orchestrator agent.

Arguments:
  name    Agent name

Options:
  -r, --role <role>       Agent role: director, worker, steward (required)
  -m, --mode <mode>       Worker mode: ephemeral, persistent (default: ephemeral)
  -f, --focus <focus>     Steward focus: merge, docs
  -t, --maxTasks <n>      Maximum concurrent tasks (default: 1)
  --tags <tags>           Comma-separated tags (e.g., "frontend,urgent")
  --reportsTo <id>        Manager entity ID (for workers/stewards)
  --roleDef <id>          Role definition document ID
  --trigger <cron>        Steward cron trigger (e.g., "0 2 * * *")
  --provider <name>       Agent provider (e.g., claude, opencode)
  --model <model>         LLM model to use (e.g., claude-sonnet-4-5-20250929)

Examples:
  sf agent register MyWorker --role worker --mode ephemeral
  sf agent register MainDirector --role director
  sf agent register MergeSteward --role steward --focus merge
  sf agent register MyWorker --role worker --tags "frontend,urgent"
  sf agent register TeamWorker --role worker --reportsTo el-director123
  sf agent register DocsSteward --role steward --focus docs --trigger "0 9 * * *"
  sf agent register OcWorker --role worker --provider opencode
  sf agent register MyWorker --role worker --model claude-sonnet-4-5-20250929`,
  options: agentRegisterOptions,
  handler: agentRegisterHandler as Command['handler'],
};

// ============================================================================
// Agent Stop Command
// ============================================================================

interface AgentStopOptions {
  graceful?: boolean;
  reason?: string;
}

const agentStopOptions: CommandOption[] = [
  {
    name: 'graceful',
    short: 'g',
    description: 'Graceful shutdown (default: true)',
  },
  {
    name: 'no-graceful',
    description: 'Force immediate shutdown',
  },
  {
    name: 'reason',
    short: 'r',
    description: 'Reason for stopping the agent',
    hasValue: true,
  },
];

async function agentStopHandler(
  args: string[],
  options: GlobalOptions & AgentStopOptions & { 'no-graceful'?: boolean }
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf agent stop <id> [options]\nExample: sf agent stop el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    // Determine graceful mode (default true unless --no-graceful is set)
    const graceful = options['no-graceful'] !== true;

    const agent = await api.updateAgentSession(
      id as EntityId,
      undefined,
      'idle'
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        ...agent,
        graceful,
        reason: options.reason,
      });
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    let message = `Stopped agent ${id}`;
    if (!graceful) {
      message += ' (forced)';
    }
    if (options.reason) {
      message += `: ${options.reason}`;
    }

    return success(agent, message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to stop agent: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentStopCommand: Command = {
  name: 'stop',
  description: 'Stop an agent session',
  usage: 'sf agent stop <id> [options]',
  help: `Stop an agent session.

Arguments:
  id    Agent identifier

Options:
  -g, --graceful        Graceful shutdown (default: true)
  --no-graceful         Force immediate shutdown
  -r, --reason <text>   Reason for stopping the agent

Examples:
  sf agent stop el-abc123
  sf agent stop el-abc123 --reason "Task completed"
  sf agent stop el-abc123 --no-graceful`,
  options: agentStopOptions,
  handler: agentStopHandler as Command['handler'],
};

// ============================================================================
// Agent Stream Command
// ============================================================================

async function agentStreamHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf agent stream <id>\nExample: sf agent stream el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    const channelId = await api.getAgentChannel(id as EntityId);
    if (!channelId) {
      return failure(`No channel found for agent: ${id}`, ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ channelId, agentId: id });
    }

    return success(
      { channelId },
      `Agent ${id} channel: ${channelId}\nUse "sf channel stream ${channelId}" to watch messages`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get agent stream: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentStreamCommand: Command = {
  name: 'stream',
  description: 'Get agent channel for streaming',
  usage: 'sf agent stream <id>',
  help: `Get the channel ID for an agent to stream messages.

Arguments:
  id    Agent identifier

Examples:
  sf agent stream el-abc123`,
  options: [],
  handler: agentStreamHandler as Command['handler'],
};

// ============================================================================
// Agent Start Command
// ============================================================================

interface AgentStartOptions {
  prompt?: string;
  mode?: string;
  resume?: string;
  workdir?: string;
  cols?: string;
  rows?: string;
  timeout?: string;
  env?: string;
  taskId?: string;
  stream?: boolean;
  provider?: string;
  model?: string;
}

const agentStartOptions: CommandOption[] = [
  {
    name: 'prompt',
    short: 'p',
    description: 'Initial prompt to send to the agent',
    hasValue: true,
  },
  {
    name: 'mode',
    short: 'm',
    description: 'Spawn mode (headless, interactive)',
    hasValue: true,
  },
  {
    name: 'resume',
    short: 'r',
    description: 'Provider session ID to resume',
    hasValue: true,
  },
  {
    name: 'workdir',
    short: 'w',
    description: 'Working directory for the agent',
    hasValue: true,
  },
  {
    name: 'cols',
    description: 'Terminal columns for interactive mode (default: 120)',
    hasValue: true,
  },
  {
    name: 'rows',
    description: 'Terminal rows for interactive mode (default: 30)',
    hasValue: true,
  },
  {
    name: 'timeout',
    description: 'Timeout in milliseconds (default: 120000)',
    hasValue: true,
  },
  {
    name: 'env',
    short: 'e',
    description: 'Environment variables (KEY=VALUE, can repeat)',
    hasValue: true,
  },
  {
    name: 'taskId',
    short: 't',
    description: 'Task ID to assign to this agent',
    hasValue: true,
  },
  {
    name: 'stream',
    description: 'Stream agent output after spawning',
  },
  {
    name: 'provider',
    description: 'Override agent provider for this session',
    hasValue: true,
  },
  {
    name: 'model',
    description: 'Override model for this session (e.g., claude-opus-4-6)',
    hasValue: true,
  },
];

async function agentStartHandler(
  args: string[],
  options: GlobalOptions & AgentStartOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf agent start <id> [options]\nExample: sf agent start el-abc123 --prompt "Begin working"', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the agent to verify it exists and get its role
    const agent = await api.getAgent(id as EntityId);
    if (!agent) {
      return failure(`Agent not found: ${id}`, ExitCode.NOT_FOUND);
    }

    const meta = getAgentMeta(agent);
    const agentRole = (meta.agentRole as AgentRole) ?? 'worker';

    // Import the spawner service
    const { createSpawnerService } = await import('../../runtime/index.js');
    const { findStoneforgeDir } = await import('@stoneforge/quarry');

    // Parse environment variables
    const environmentVariables: Record<string, string> = {};
    if (options.env) {
      const parts = options.env.split('=');
      if (parts.length >= 2) {
        const key = parts[0];
        const value = parts.slice(1).join('=');
        environmentVariables[key] = value;
      }
    }

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    const spawner = createSpawnerService({
      workingDirectory: options.workdir ?? process.cwd(),
      stoneforgeRoot: stoneforgeDir ?? undefined,
      timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
      environmentVariables: Object.keys(environmentVariables).length > 0 ? environmentVariables : undefined,
    });

    // Determine spawn mode
    let spawnMode: 'headless' | 'interactive' | undefined;
    if (options.mode) {
      if (options.mode !== 'headless' && options.mode !== 'interactive') {
        return failure(
          `Invalid mode: ${options.mode}. Must be 'headless' or 'interactive'`,
          ExitCode.VALIDATION
        );
      }
      spawnMode = options.mode as 'headless' | 'interactive';
    }

    // Spawn the agent
    const result = await spawner.spawn(id as EntityId, agentRole, {
      initialPrompt: options.prompt,
      mode: spawnMode,
      resumeSessionId: options.resume,
      workingDirectory: options.workdir,
      cols: options.cols ? parseInt(options.cols, 10) : undefined,
      rows: options.rows ? parseInt(options.rows, 10) : undefined,
    });

    // If task ID is provided, assign the task to this agent
    if (options.taskId) {
      await api.assignTaskToAgent(
        options.taskId as ElementId,
        id as EntityId,
        { sessionId: result.session.id }
      );
    }

    // If --stream is set, stream the session output
    if (options.stream) {
      console.log(`Spawned agent ${id}`);
      console.log(`  Session ID:  ${result.session.id}`);
      console.log(`  Mode:        ${result.session.mode}`);
      console.log('\nStreaming output (Press Ctrl+C to stop):\n');

      await streamSpawnedSession(result.events, result.session.mode);

      return success(result.session, 'Stream ended');
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        sessionId: result.session.id,
        providerSessionId: result.session.providerSessionId,
        agentId: id,
        status: result.session.status,
        mode: result.session.mode,
        pid: result.session.pid,
        taskId: options.taskId,
      });
    }

    if (mode === 'quiet') {
      return success(result.session.id);
    }

    const lines = [
      `Spawned agent ${id}`,
      `  Session ID:  ${result.session.id}`,
      `  Provider ID: ${result.session.providerSessionId ?? '-'}`,
      `  Status:      ${result.session.status}`,
      `  Mode:        ${result.session.mode}`,
      `  PID:         ${result.session.pid ?? '-'}`,
    ];
    if (options.taskId) {
      lines.push(`  Task ID:     ${options.taskId}`);
    }

    return success(result.session, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to start agent: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentStartCommand: Command = {
  name: 'start',
  description: 'Start an agent process',
  usage: 'sf agent start <id> [options]',
  help: `Start a new agent process.

Arguments:
  id    Agent identifier

Options:
  -p, --prompt <text>      Initial prompt to send to the agent
  -m, --mode <mode>        Start mode: headless, interactive
  -r, --resume <id>        Resume a previous session
  -w, --workdir <path>     Working directory for the agent
  --cols <n>               Terminal columns for interactive mode (default: 120)
  --rows <n>               Terminal rows for interactive mode (default: 30)
  --timeout <ms>           Timeout in milliseconds (default: 120000)
  -e, --env <KEY=VALUE>    Environment variable to set
  -t, --taskId <id>        Task ID to assign to this agent
  --stream                 Stream agent output after starting
  --provider <name>        Override agent provider for this session
  --model <model>          Override model for this session

Examples:
  sf agent start el-abc123
  sf agent start el-abc123 --mode interactive
  sf agent start el-abc123 --mode interactive --cols 160 --rows 40
  sf agent start el-abc123 --prompt "Start working on your assigned tasks"
  sf agent start el-abc123 --resume prev-session-id
  sf agent start el-abc123 --env MY_VAR=value
  sf agent start el-abc123 --taskId el-task456
  sf agent start el-abc123 --stream
  sf agent start el-abc123 --provider opencode
  sf agent start el-abc123 --model claude-opus-4-6`,
  options: agentStartOptions,
  handler: agentStartHandler as Command['handler'],
};

// ============================================================================
// Main Agent Command
// ============================================================================

export const agentCommand: Command = {
  name: 'agent',
  description: 'Manage orchestrator agents',
  usage: 'sf agent <subcommand> [options]',
  help: `Manage orchestrator agents.

Subcommands:
  list      List all registered agents
  show      Show agent details
  register  Register a new agent
  start     Start an agent process
  stop      Stop an agent session
  stream    Get agent channel for streaming

Examples:
  sf agent list
  sf agent register MyWorker --role worker
  sf agent start el-abc123
  sf agent start el-abc123 --mode interactive`,
  subcommands: {
    list: agentListCommand,
    show: agentShowCommand,
    register: agentRegisterCommand,
    start: agentStartCommand,
    stop: agentStopCommand,
    stream: agentStreamCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    create: agentRegisterCommand,
    ls: agentListCommand,
    get: agentShowCommand,
    view: agentShowCommand,
  },
  handler: agentListCommand.handler, // Default to list
  options: [],
};
