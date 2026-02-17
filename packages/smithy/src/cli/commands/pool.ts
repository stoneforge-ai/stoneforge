/**
 * Pool Commands - CLI operations for agent pool management
 *
 * Provides commands for managing agent pools:
 * - pool list: List all agent pools
 * - pool show <id>: Show pool details
 * - pool create <name>: Create a new agent pool
 * - pool update <id>: Update pool configuration
 * - pool delete <id>: Delete a pool
 * - pool status <id>: Show pool status with active agents
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getFormatter, getOutputMode, OPERATOR_ENTITY_ID } from '@stoneforge/quarry/cli';
import type { EntityId, ElementId } from '@stoneforge/core';
import type { AgentPool, CreatePoolInput, UpdatePoolInput, PoolAgentTypeConfig, AgentRole, WorkerMode, StewardFocus } from '../../types/index.js';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates orchestrator API client and pool service
 */
async function createPoolClient(options: GlobalOptions): Promise<{
  poolService: import('../../services/index.js').AgentPoolService | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createOrchestratorAPI } = await import('../../api/index.js');
    const { createAgentPoolService, createAgentRegistry } = await import('../../services/index.js');
    const { createSpawnerService, createSessionManager } = await import('../../runtime/index.js');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return {
        poolService: null,
        error: 'No .stoneforge directory found. Run "sf init" first.',
      };
    }

    const dbPath = options.db ?? `${stoneforgeDir}/stoneforge.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = createOrchestratorAPI(backend);

    // Create agent registry
    const agentRegistry = createAgentRegistry(api);

    // Create spawner and session manager
    const spawner = createSpawnerService();
    const sessionManager = createSessionManager(spawner, api, agentRegistry);

    // Create pool service
    const poolService = createAgentPoolService(api, sessionManager, agentRegistry);

    return { poolService };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { poolService: null, error: `Failed to initialize pool service: ${message}` };
  }
}

/**
 * Parses agent type configuration from CLI string format
 * Format: "role[:workerMode|stewardFocus][:priority][:maxSlots]"
 * Examples:
 *   "worker:ephemeral:100:5" - ephemeral workers, priority 100, max 5 slots
 *   "worker:persistent:50"   - persistent workers, priority 50
 *   "steward:merge"          - merge stewards
 *   "worker"                 - all workers with default settings
 */
function parseAgentTypeConfig(configStr: string): PoolAgentTypeConfig | null {
  const parts = configStr.split(':');
  if (parts.length === 0) return null;

  const role = parts[0] as AgentRole;
  if (!['worker', 'steward'].includes(role)) {
    return null;
  }

  // Build config properties
  let workerMode: WorkerMode | undefined;
  let stewardFocus: StewardFocus | undefined;
  let priority: number | undefined;
  let maxSlots: number | undefined;

  if (parts.length > 1) {
    if (role === 'worker') {
      if (['ephemeral', 'persistent'].includes(parts[1])) {
        workerMode = parts[1] as WorkerMode;
      } else if (!isNaN(parseInt(parts[1], 10))) {
        // It's a priority number
        priority = parseInt(parts[1], 10);
      }
    } else if (role === 'steward') {
      if (['merge', 'docs', 'custom'].includes(parts[1])) {
        stewardFocus = parts[1] as StewardFocus;
      } else if (!isNaN(parseInt(parts[1], 10))) {
        priority = parseInt(parts[1], 10);
      }
    }
  }

  if (parts.length > 2) {
    const maybeNum = parseInt(parts[2], 10);
    if (!isNaN(maybeNum)) {
      priority = maybeNum;
    }
  }

  if (parts.length > 3) {
    const maybeSlots = parseInt(parts[3], 10);
    if (!isNaN(maybeSlots)) {
      maxSlots = maybeSlots;
    }
  }

  // Build the config object with all properties upfront
  const config: PoolAgentTypeConfig = {
    role: role as Exclude<AgentRole, 'director'>,
    ...(workerMode !== undefined && { workerMode }),
    ...(stewardFocus !== undefined && { stewardFocus }),
    ...(priority !== undefined && { priority }),
    ...(maxSlots !== undefined && { maxSlots }),
  };

  return config;
}

/**
 * Formats agent type config for display
 */
function formatAgentTypeConfig(config: PoolAgentTypeConfig): string {
  let result = config.role;
  if (config.workerMode) result += `:${config.workerMode}`;
  if (config.stewardFocus) result += `:${config.stewardFocus}`;
  if (config.priority !== undefined) result += ` (priority: ${config.priority})`;
  if (config.maxSlots !== undefined) result += ` (max: ${config.maxSlots})`;
  return result;
}

// ============================================================================
// Pool List Command
// ============================================================================

interface PoolListOptions {
  enabled?: boolean;
  available?: boolean;
  tag?: string;
}

const poolListOptions: CommandOption[] = [
  {
    name: 'enabled',
    short: 'e',
    description: 'Only show enabled pools',
  },
  {
    name: 'available',
    short: 'a',
    description: 'Only show pools with available slots',
  },
  {
    name: 'tag',
    short: 't',
    description: 'Filter by tag',
    hasValue: true,
  },
];

async function poolListHandler(
  _args: string[],
  options: GlobalOptions & PoolListOptions
): Promise<CommandResult> {
  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? 'Failed to create pool service', ExitCode.GENERAL_ERROR);
  }

  try {
    const pools = await poolService.listPools({
      enabled: options.enabled,
      hasAvailableSlots: options.available,
      tags: options.tag ? [options.tag] : undefined,
    });

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(pools);
    }

    if (mode === 'quiet') {
      return success(pools.map((p) => p.id).join('\n'));
    }

    if (pools.length === 0) {
      return success(null, 'No agent pools found');
    }

    const headers = ['ID', 'NAME', 'SIZE', 'ACTIVE', 'AVAILABLE', 'ENABLED'];
    const rows = pools.map((pool) => [
      pool.id,
      pool.config.name,
      String(pool.config.maxSize),
      String(pool.status.activeCount),
      String(pool.status.availableSlots),
      pool.config.enabled ? 'yes' : 'no',
    ]);

    const table = formatter.table(headers, rows);
    return success(pools, `${table}\n${pools.length} pool(s)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list pools: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const poolListCommand: Command = {
  name: 'list',
  description: 'List agent pools',
  usage: 'sf pool list [options]',
  help: `List all agent pools.

Options:
  -e, --enabled     Only show enabled pools
  -a, --available   Only show pools with available slots
  -t, --tag <tag>   Filter by tag

Examples:
  sf pool list
  sf pool list --enabled
  sf pool list --available
  sf pool list --tag production`,
  options: poolListOptions,
  handler: poolListHandler as Command['handler'],
};

// ============================================================================
// Pool Show Command
// ============================================================================

async function poolShowHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [idOrName] = args;

  if (!idOrName) {
    return failure('Usage: sf pool show <id|name>\nExample: sf pool show default', ExitCode.INVALID_ARGUMENTS);
  }

  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? 'Failed to create pool service', ExitCode.GENERAL_ERROR);
  }

  try {
    // Try to get by ID first, then by name
    let pool: AgentPool | undefined;
    if (idOrName.startsWith('el-')) {
      pool = await poolService.getPool(idOrName as ElementId);
    }
    if (!pool) {
      pool = await poolService.getPoolByName(idOrName);
    }

    if (!pool) {
      return failure(`Pool not found: ${idOrName}`, ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(pool);
    }

    if (mode === 'quiet') {
      return success(pool.id);
    }

    const lines = [
      `ID:          ${pool.id}`,
      `Name:        ${pool.config.name}`,
      `Description: ${pool.config.description ?? '-'}`,
      `Max Size:    ${pool.config.maxSize}`,
      `Enabled:     ${pool.config.enabled ? 'yes' : 'no'}`,
      `Created:     ${pool.createdAt}`,
      '',
      'Status:',
      `  Active:    ${pool.status.activeCount}`,
      `  Available: ${pool.status.availableSlots}`,
      `  Updated:   ${pool.status.lastUpdatedAt}`,
    ];

    if (pool.config.agentTypes.length > 0) {
      lines.push('', 'Agent Types:');
      for (const typeConfig of pool.config.agentTypes) {
        lines.push(`  - ${formatAgentTypeConfig(typeConfig)}`);
      }
    }

    if (pool.config.tags && pool.config.tags.length > 0) {
      lines.push(`Tags:        ${pool.config.tags.join(', ')}`);
    }

    if (pool.status.activeAgentIds.length > 0) {
      lines.push('', 'Active Agents:');
      for (const agentId of pool.status.activeAgentIds) {
        lines.push(`  - ${agentId}`);
      }
    }

    return success(pool, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to show pool: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const poolShowCommand: Command = {
  name: 'show',
  description: 'Show pool details',
  usage: 'sf pool show <id|name>',
  help: `Show detailed information about an agent pool.

Arguments:
  id|name    Pool identifier or name

Examples:
  sf pool show default
  sf pool show el-abc123`,
  options: [],
  handler: poolShowHandler as Command['handler'],
};

// ============================================================================
// Pool Create Command
// ============================================================================

interface PoolCreateOptions {
  size?: string;
  description?: string;
  agentType?: string | string[];
  tags?: string;
  disabled?: boolean;
}

const poolCreateOptions: CommandOption[] = [
  {
    name: 'size',
    short: 's',
    description: 'Maximum pool size (default: 5)',
    hasValue: true,
  },
  {
    name: 'description',
    short: 'd',
    description: 'Pool description',
    hasValue: true,
  },
  {
    name: 'agentType',
    short: 't',
    description: 'Agent type config (can repeat). Format: role[:mode|focus][:priority][:maxSlots]',
    hasValue: true,
  },
  {
    name: 'tags',
    description: 'Comma-separated tags',
    hasValue: true,
  },
  {
    name: 'disabled',
    description: 'Create pool in disabled state',
  },
];

async function poolCreateHandler(
  args: string[],
  options: GlobalOptions & PoolCreateOptions
): Promise<CommandResult> {
  const [name] = args;

  if (!name) {
    return failure('Usage: sf pool create <name> [options]\nExample: sf pool create default --size 5', ExitCode.INVALID_ARGUMENTS);
  }

  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? 'Failed to create pool service', ExitCode.GENERAL_ERROR);
  }

  try {
    const maxSize = options.size ? parseInt(options.size, 10) : 5;
    if (isNaN(maxSize) || maxSize < 1 || maxSize > 1000) {
      return failure('Invalid size. Must be between 1 and 1000.', ExitCode.VALIDATION);
    }

    // Parse agent types
    const agentTypes: PoolAgentTypeConfig[] = [];
    const agentTypeInputs = Array.isArray(options.agentType)
      ? options.agentType
      : options.agentType
        ? [options.agentType]
        : [];

    for (const typeStr of agentTypeInputs) {
      const typeConfig = parseAgentTypeConfig(typeStr);
      if (!typeConfig) {
        return failure(
          `Invalid agent type format: ${typeStr}. ` +
          `Use: role[:mode|focus][:priority][:maxSlots] (e.g., worker:ephemeral:100:5)`,
          ExitCode.VALIDATION
        );
      }
      agentTypes.push(typeConfig);
    }

    const input: CreatePoolInput = {
      name,
      description: options.description,
      maxSize,
      agentTypes,
      enabled: !options.disabled,
      tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : undefined,
      createdBy: (options.actor ?? OPERATOR_ENTITY_ID) as EntityId,
    };

    const pool = await poolService.createPool(input);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(pool);
    }

    if (mode === 'quiet') {
      return success(pool.id);
    }

    return success(pool, `Created pool '${name}': ${pool.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create pool: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const poolCreateCommand: Command = {
  name: 'create',
  description: 'Create an agent pool',
  usage: 'sf pool create <name> [options]',
  help: `Create a new agent pool.

Arguments:
  name    Pool name (must be unique)

Options:
  -s, --size <n>              Maximum pool size (default: 5)
  -d, --description <text>    Pool description
  -t, --agentType <config>    Agent type config (can repeat)
                              Format: role[:mode|focus][:priority][:maxSlots]
  --tags <tags>               Comma-separated tags
  --disabled                  Create pool in disabled state

Agent Type Format Examples:
  worker                     All workers with default settings
  worker:ephemeral           Ephemeral workers only
  worker:ephemeral:100       Ephemeral workers with priority 100
  worker:persistent:50:3     Persistent workers, priority 50, max 3 slots
  steward:merge              Merge stewards
  steward:docs:80            Docs stewards with priority 80

Examples:
  sf pool create default --size 5
  sf pool create workers --size 10 -t worker:ephemeral -t worker:persistent
  sf pool create merge-pool --size 2 -t steward:merge:100
  sf pool create production --size 20 --tags "prod,critical"`,
  options: poolCreateOptions,
  handler: poolCreateHandler as Command['handler'],
};

// ============================================================================
// Pool Update Command
// ============================================================================

interface PoolUpdateOptions {
  size?: string;
  description?: string;
  agentType?: string | string[];
  tags?: string;
  enable?: boolean;
  disable?: boolean;
}

const poolUpdateOptions: CommandOption[] = [
  {
    name: 'size',
    short: 's',
    description: 'Maximum pool size',
    hasValue: true,
  },
  {
    name: 'description',
    short: 'd',
    description: 'Pool description',
    hasValue: true,
  },
  {
    name: 'agentType',
    short: 't',
    description: 'Agent type config (replaces existing, can repeat)',
    hasValue: true,
  },
  {
    name: 'tags',
    description: 'Comma-separated tags (replaces existing)',
    hasValue: true,
  },
  {
    name: 'enable',
    description: 'Enable the pool',
  },
  {
    name: 'disable',
    description: 'Disable the pool',
  },
];

async function poolUpdateHandler(
  args: string[],
  options: GlobalOptions & PoolUpdateOptions
): Promise<CommandResult> {
  const [idOrName] = args;

  if (!idOrName) {
    return failure('Usage: sf pool update <id|name> [options]\nExample: sf pool update default --size 10', ExitCode.INVALID_ARGUMENTS);
  }

  if (options.enable && options.disable) {
    return failure('Cannot use both --enable and --disable', ExitCode.VALIDATION);
  }

  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? 'Failed to create pool service', ExitCode.GENERAL_ERROR);
  }

  try {
    // Find the pool
    let pool: AgentPool | undefined;
    if (idOrName.startsWith('el-')) {
      pool = await poolService.getPool(idOrName as ElementId);
    }
    if (!pool) {
      pool = await poolService.getPoolByName(idOrName);
    }

    if (!pool) {
      return failure(`Pool not found: ${idOrName}`, ExitCode.NOT_FOUND);
    }

    // Validate and parse options first
    let maxSize: number | undefined;
    if (options.size !== undefined) {
      maxSize = parseInt(options.size, 10);
      if (isNaN(maxSize) || maxSize < 1 || maxSize > 1000) {
        return failure('Invalid size. Must be between 1 and 1000.', ExitCode.VALIDATION);
      }
    }

    let agentTypes: PoolAgentTypeConfig[] | undefined;
    if (options.agentType !== undefined) {
      agentTypes = [];
      const agentTypeInputs = Array.isArray(options.agentType)
        ? options.agentType
        : [options.agentType];

      for (const typeStr of agentTypeInputs) {
        const typeConfig = parseAgentTypeConfig(typeStr);
        if (!typeConfig) {
          return failure(
            `Invalid agent type format: ${typeStr}`,
            ExitCode.VALIDATION
          );
        }
        agentTypes.push(typeConfig);
      }
    }

    const parsedTags = options.tags !== undefined
      ? options.tags.split(',').map((t) => t.trim())
      : undefined;

    const enabled = options.enable ? true : options.disable ? false : undefined;

    // Build updates object with all properties upfront
    const updates: UpdatePoolInput = {
      ...(options.description !== undefined && { description: options.description }),
      ...(maxSize !== undefined && { maxSize }),
      ...(agentTypes !== undefined && { agentTypes }),
      ...(parsedTags !== undefined && { tags: parsedTags }),
      ...(enabled !== undefined && { enabled }),
    };

    const updatedPool = await poolService.updatePool(pool.id, updates);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updatedPool);
    }

    if (mode === 'quiet') {
      return success(updatedPool.id);
    }

    return success(updatedPool, `Updated pool '${updatedPool.config.name}'`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to update pool: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const poolUpdateCommand: Command = {
  name: 'update',
  description: 'Update pool configuration',
  usage: 'sf pool update <id|name> [options]',
  help: `Update an agent pool configuration.

Arguments:
  id|name    Pool identifier or name

Options:
  -s, --size <n>              Maximum pool size
  -d, --description <text>    Pool description
  -t, --agentType <config>    Agent type config (replaces existing, can repeat)
  --tags <tags>               Comma-separated tags (replaces existing)
  --enable                    Enable the pool
  --disable                   Disable the pool

Examples:
  sf pool update default --size 10
  sf pool update workers --enable
  sf pool update merge-pool --disable
  sf pool update production --description "Production agent pool"`,
  options: poolUpdateOptions,
  handler: poolUpdateHandler as Command['handler'],
};

// ============================================================================
// Pool Delete Command
// ============================================================================

interface PoolDeleteOptions {
  force?: boolean;
}

const poolDeleteOptions: CommandOption[] = [
  {
    name: 'force',
    short: 'f',
    description: 'Delete even if agents are active',
  },
];

async function poolDeleteHandler(
  args: string[],
  options: GlobalOptions & PoolDeleteOptions
): Promise<CommandResult> {
  const [idOrName] = args;

  if (!idOrName) {
    return failure('Usage: sf pool delete <id|name>\nExample: sf pool delete old-pool', ExitCode.INVALID_ARGUMENTS);
  }

  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? 'Failed to create pool service', ExitCode.GENERAL_ERROR);
  }

  try {
    // Find the pool
    let pool: AgentPool | undefined;
    if (idOrName.startsWith('el-')) {
      pool = await poolService.getPool(idOrName as ElementId);
    }
    if (!pool) {
      pool = await poolService.getPoolByName(idOrName);
    }

    if (!pool) {
      return failure(`Pool not found: ${idOrName}`, ExitCode.NOT_FOUND);
    }

    // Check for active agents
    if (pool.status.activeCount > 0 && !options.force) {
      return failure(
        `Pool '${pool.config.name}' has ${pool.status.activeCount} active agent(s). ` +
        `Use --force to delete anyway.`,
        ExitCode.VALIDATION
      );
    }

    await poolService.deletePool(pool.id);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ deleted: pool.id, name: pool.config.name });
    }

    if (mode === 'quiet') {
      return success(pool.id);
    }

    return success({ deleted: pool.id }, `Deleted pool '${pool.config.name}'`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to delete pool: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const poolDeleteCommand: Command = {
  name: 'delete',
  description: 'Delete an agent pool',
  usage: 'sf pool delete <id|name>',
  help: `Delete an agent pool.

Arguments:
  id|name    Pool identifier or name

Options:
  -f, --force    Delete even if agents are active

Examples:
  sf pool delete old-pool
  sf pool delete el-abc123 --force`,
  options: poolDeleteOptions,
  handler: poolDeleteHandler as Command['handler'],
};

// ============================================================================
// Pool Status Command
// ============================================================================

async function poolStatusHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [idOrName] = args;

  if (!idOrName) {
    return failure('Usage: sf pool status <id|name>\nExample: sf pool status default', ExitCode.INVALID_ARGUMENTS);
  }

  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? 'Failed to create pool service', ExitCode.GENERAL_ERROR);
  }

  try {
    // Find the pool
    let pool: AgentPool | undefined;
    if (idOrName.startsWith('el-')) {
      pool = await poolService.getPool(idOrName as ElementId);
    }
    if (!pool) {
      pool = await poolService.getPoolByName(idOrName);
    }

    if (!pool) {
      return failure(`Pool not found: ${idOrName}`, ExitCode.NOT_FOUND);
    }

    // Refresh status from session manager
    const status = await poolService.getPoolStatus(pool.id);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        poolId: pool.id,
        poolName: pool.config.name,
        ...status,
      });
    }

    if (mode === 'quiet') {
      return success(`${status.activeCount}/${pool.config.maxSize}`);
    }

    const lines = [
      `Pool:        ${pool.config.name} (${pool.id})`,
      `Enabled:     ${pool.config.enabled ? 'yes' : 'no'}`,
      '',
      'Capacity:',
      `  Max Size:    ${pool.config.maxSize}`,
      `  Active:      ${status.activeCount}`,
      `  Available:   ${status.availableSlots}`,
      `  Utilization: ${Math.round((status.activeCount / pool.config.maxSize) * 100)}%`,
      '',
      `Last Updated: ${status.lastUpdatedAt}`,
    ];

    if (Object.keys(status.activeByType).length > 0) {
      lines.push('', 'Active by Type:');
      for (const [typeKey, count] of Object.entries(status.activeByType)) {
        lines.push(`  ${typeKey}: ${count}`);
      }
    }

    if (status.activeAgentIds.length > 0) {
      lines.push('', 'Active Agents:');
      for (const agentId of status.activeAgentIds) {
        lines.push(`  - ${agentId}`);
      }
    }

    return success(status, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get pool status: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const poolStatusCommand: Command = {
  name: 'status',
  description: 'Show pool status',
  usage: 'sf pool status <id|name>',
  help: `Show the current status of an agent pool.

Arguments:
  id|name    Pool identifier or name

Examples:
  sf pool status default
  sf pool status el-abc123`,
  options: [],
  handler: poolStatusHandler as Command['handler'],
};

// ============================================================================
// Pool Refresh Command
// ============================================================================

async function poolRefreshHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? 'Failed to create pool service', ExitCode.GENERAL_ERROR);
  }

  try {
    await poolService.refreshAllPoolStatus();

    const pools = await poolService.listPools();

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(pools);
    }

    if (mode === 'quiet') {
      return success(String(pools.length));
    }

    return success(pools, `Refreshed status for ${pools.length} pool(s)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to refresh pool status: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const poolRefreshCommand: Command = {
  name: 'refresh',
  description: 'Refresh pool status from sessions',
  usage: 'sf pool refresh',
  help: `Refresh the status of all agent pools based on current sessions.

Examples:
  sf pool refresh`,
  options: [],
  handler: poolRefreshHandler as Command['handler'],
};

// ============================================================================
// Main Pool Command
// ============================================================================

export const poolCommand: Command = {
  name: 'pool',
  description: 'Manage agent pools',
  usage: 'sf pool <subcommand> [options]',
  help: `Manage agent pools for concurrency limiting.

Agent pools allow you to limit the maximum number of agents running
concurrently. When a pool is at capacity, new agent spawns are blocked
until slots become available.

Subcommands:
  list      List all agent pools
  show      Show pool details
  create    Create a new pool
  update    Update pool configuration
  delete    Delete a pool
  status    Show pool status with active agents
  refresh   Refresh pool status from sessions

Examples:
  sf pool list
  sf pool create default --size 5
  sf pool show default
  sf pool status default
  sf pool update default --size 10
  sf pool delete old-pool`,
  subcommands: {
    list: poolListCommand,
    show: poolShowCommand,
    create: poolCreateCommand,
    update: poolUpdateCommand,
    delete: poolDeleteCommand,
    status: poolStatusCommand,
    refresh: poolRefreshCommand,
    // Aliases
    ls: poolListCommand,
    get: poolShowCommand,
    add: poolCreateCommand,
    rm: poolDeleteCommand,
  },
  handler: poolListCommand.handler, // Default to list
  options: [],
};
