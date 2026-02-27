/**
 * Entity Commands - Entity registration and listing
 *
 * Provides CLI commands for entity operations:
 * - entity register: Register a new entity (agent, human, or system)
 * - entity list: List all registered entities
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { createEntity, EntityTypeValue, type Entity, type CreateEntityInput } from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { getFormatter } from '../formatter.js';
import { ValidationError, ConflictError } from '@stoneforge/core';
import { getValue, loadConfig } from '../../config/index.js';
import { isValidPublicKey } from '../../systems/identity.js';
import { createAPI as createSharedAPI } from '../db.js';

/**
 * Get the current actor from options or config
 */
function getActor(options: GlobalOptions): string {
  if (options.actor) {
    return options.actor;
  }
  loadConfig();
  return getValue('actor') || 'anonymous';
}

// ============================================================================
// Entity Register Command
// ============================================================================

interface RegisterOptions extends GlobalOptions {
  type?: string;
  'public-key'?: string;
  tag?: string[];
}

async function entityRegisterHandler(
  args: string[],
  options: RegisterOptions
): Promise<CommandResult> {
  if (args.length === 0) {
    return failure('Usage: sf entity register <name> [--type <type>]\nExample: sf entity register claude --type agent', ExitCode.INVALID_ARGUMENTS);
  }

  const name = args[0];
  const entityType = (options.type || 'agent') as EntityTypeValue;

  // Validate entity type
  const validTypes = Object.values(EntityTypeValue);
  if (!validTypes.includes(entityType)) {
    return failure(
      `Invalid entity type: ${entityType}. Must be one of: ${validTypes.join(', ')}`,
      ExitCode.VALIDATION
    );
  }

  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    const actor = getActor(options);
    const tags = options.tag || [];
    const publicKey = options['public-key'];

    // Validate public key format if provided
    if (publicKey !== undefined) {
      if (!isValidPublicKey(publicKey)) {
        return failure(
          'Invalid public key format. Expected base64-encoded Ed25519 public key (44 characters ending with =)',
          ExitCode.VALIDATION
        );
      }
    }

    const input: CreateEntityInput = {
      name,
      entityType,
      createdBy: actor as EntityId,
      ...(publicKey && { publicKey }),
      ...(tags.length > 0 && { tags }),
    };

    // Create the entity
    const entity = await createEntity(input, api.getIdGeneratorConfig());
    // Persist to database
    const created = await api.create(entity as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(created);
    }

    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(
      created,
      `Registered ${entityType} entity: ${name} (${created.id})`
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return failure(`Validation error: ${err.message}`, ExitCode.VALIDATION);
    }
    if (err instanceof ConflictError) {
      return failure(`Entity already exists: ${err.message}`, ExitCode.VALIDATION);
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to register entity: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const registerOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: 'Entity type: agent, human, or system (default: agent)',
    hasValue: true,
  },
  {
    name: 'public-key',
    description: 'Base64-encoded Ed25519 public key for cryptographic identity',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Tag to add to entity (can be repeated)',
    hasValue: true,
    array: true,
  },
];

// ============================================================================
// Entity List Command
// ============================================================================

interface ListOptions extends GlobalOptions {
  type?: string;
  limit?: number;
}

async function entityListHandler(
  _args: string[],
  options: ListOptions
): Promise<CommandResult> {
  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'entity' as const,
    };

    if (options.limit) {
      filter.limit = options.limit;
    }

    // Get entities
    const entities = await api.list<Entity>(filter);

    // Filter by entity type if specified
    let filteredEntities = entities;
    if (options.type) {
      filteredEntities = entities.filter((e) => e.entityType === options.type);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(filteredEntities);
    }

    if (mode === 'quiet') {
      return success(filteredEntities.map((e) => e.id).join('\n'));
    }

    if (filteredEntities.length === 0) {
      return success(filteredEntities, 'No entities found.');
    }

    // Human-readable output
    const lines: string[] = [];
    lines.push('Entities:');
    lines.push('');

    for (const entity of filteredEntities) {
      const typeIcon = getEntityTypeIcon(entity.entityType);
      const keyIndicator = entity.publicKey ? ' 🔑' : '';
      lines.push(`${typeIcon} ${entity.name} (${entity.id})${keyIndicator}`);
      lines.push(`   Type: ${entity.entityType}`);
      if (entity.tags.length > 0) {
        lines.push(`   Tags: ${entity.tags.join(', ')}`);
      }
    }

    lines.push('');
    lines.push(`Total: ${filteredEntities.length} entities`);

    return success(filteredEntities, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list entities: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

function getEntityTypeIcon(entityType: EntityTypeValue): string {
  switch (entityType) {
    case EntityTypeValue.AGENT:
      return '[A]';
    case EntityTypeValue.HUMAN:
      return '[H]';
    case EntityTypeValue.SYSTEM:
      return '[S]';
    default:
      return '[?]';
  }
}

const listOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: 'Filter by entity type: agent, human, or system',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of entities to return',
    hasValue: true,
  },
];

// ============================================================================
// Entity Lookup Helper
// ============================================================================

/**
 * Resolves an entity by ID or name.
 * If the value starts with 'el-', it's treated as an ID.
 * Otherwise, it's looked up by name.
 */
async function resolveEntity(api: QuarryAPI, idOrName: string): Promise<Entity | null> {
  if (idOrName.startsWith('el-')) {
    // Treat as ID
    return api.get<Entity>(idOrName as ElementId);
  }

  // Look up by name
  const entity = await api.lookupEntityByName(idOrName);
  return entity as Entity | null;
}

// ============================================================================
// Set Manager Command
// ============================================================================

async function setManagerHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 2) {
    return failure(
      'Usage: sf entity set-manager <entity> <manager>\nExample: sf entity set-manager alice bob',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [entityArg, managerArg] = args;

  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    // Resolve entity
    const entity = await resolveEntity(api, entityArg);
    if (!entity) {
      return failure(`Entity not found: ${entityArg}`, ExitCode.NOT_FOUND);
    }

    // Resolve manager
    const manager = await resolveEntity(api, managerArg);
    if (!manager) {
      return failure(`Manager entity not found: ${managerArg}`, ExitCode.NOT_FOUND);
    }

    const actor = getActor(options);

    // Set the manager
    const updated = await api.setEntityManager(
      entity.id as unknown as EntityId,
      manager.id as unknown as EntityId,
      actor as EntityId
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(
      updated,
      `Set ${entity.name}'s manager to ${manager.name}`
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return failure(`Validation error: ${err.message}`, ExitCode.VALIDATION);
    }
    if (err instanceof ConflictError) {
      return failure(`Conflict: ${err.message}`, ExitCode.VALIDATION);
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to set manager: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const setManagerCommand: Command = {
  name: 'set-manager',
  description: 'Set an entity\'s manager',
  usage: 'sf entity set-manager <entity> <manager>',
  help: `Set the manager for an entity.

Arguments:
  entity    Entity ID or name to update
  manager   Manager entity ID or name

The entity will report to the specified manager.
Validates that:
- Both entities exist
- No self-reference
- No circular management chains

Examples:
  sf entity set-manager alice bob
  sf entity set-manager el-abc123 el-def456`,
  options: [],
  handler: setManagerHandler as Command['handler'],
};

// ============================================================================
// Clear Manager Command
// ============================================================================

async function clearManagerHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      'Usage: sf entity clear-manager <entity>\nExample: sf entity clear-manager alice',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [entityArg] = args;

  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    // Resolve entity
    const entity = await resolveEntity(api, entityArg);
    if (!entity) {
      return failure(`Entity not found: ${entityArg}`, ExitCode.NOT_FOUND);
    }

    const actor = getActor(options);

    // Clear the manager
    const updated = await api.clearEntityManager(
      entity.id as unknown as EntityId,
      actor as EntityId
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, `Cleared manager for ${entity.name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to clear manager: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const clearManagerCommand: Command = {
  name: 'clear-manager',
  description: 'Clear an entity\'s manager',
  usage: 'sf entity clear-manager <entity>',
  help: `Clear the manager for an entity.

Arguments:
  entity    Entity ID or name to update

Removes the reporting relationship for the entity.

Examples:
  sf entity clear-manager alice
  sf entity clear-manager el-abc123`,
  options: [],
  handler: clearManagerHandler as Command['handler'],
};

// ============================================================================
// Reports Command (Direct Reports)
// ============================================================================

async function reportsHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      'Usage: sf entity reports <manager>\nExample: sf entity reports bob',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [managerArg] = args;

  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    // Resolve manager
    const manager = await resolveEntity(api, managerArg);
    if (!manager) {
      return failure(`Manager entity not found: ${managerArg}`, ExitCode.NOT_FOUND);
    }

    // Get direct reports
    const reports = await api.getDirectReports(manager.id as unknown as EntityId);

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(reports);
    }

    if (mode === 'quiet') {
      return success(reports.map((e) => e.id).join('\n'));
    }

    if (reports.length === 0) {
      return success(reports, `No direct reports for ${manager.name}`);
    }

    // Human-readable table output
    const headers = ['ID', 'NAME', 'TYPE'];
    const rows = reports.map((entity) => {
      const e = entity as Entity;
      return [e.id, e.name, e.entityType];
    });

    const table = formatter.table(headers, rows);
    const summary = `\n${reports.length} direct report(s) for ${manager.name}`;

    return success(reports, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get direct reports: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const reportsCommand: Command = {
  name: 'reports',
  description: 'List direct reports for a manager',
  usage: 'sf entity reports <manager>',
  help: `List entities that report directly to a manager.

Arguments:
  manager    Manager entity ID or name

Examples:
  sf entity reports bob
  sf entity reports el-abc123
  sf entity reports bob --json`,
  options: [],
  handler: reportsHandler as Command['handler'],
};

// ============================================================================
// Chain Command (Management Chain)
// ============================================================================

async function chainHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      'Usage: sf entity chain <entity>\nExample: sf entity chain alice',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [entityArg] = args;

  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    // Resolve entity
    const entity = await resolveEntity(api, entityArg);
    if (!entity) {
      return failure(`Entity not found: ${entityArg}`, ExitCode.NOT_FOUND);
    }

    // Get management chain
    const chain = await api.getManagementChain(entity.id as unknown as EntityId);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(chain);
    }

    if (mode === 'quiet') {
      return success(chain.map((e) => e.id).join('\n'));
    }

    if (chain.length === 0) {
      return success(chain, `${entity.name} has no manager`);
    }

    // Human-readable visual chain
    const names = [entity.name, ...chain.map((e) => (e as Entity).name)];
    const chainDisplay = names.join(' -> ');

    return success(chain, `Management chain: ${chainDisplay}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get management chain: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const chainCommand: Command = {
  name: 'chain',
  description: 'Show management chain for an entity',
  usage: 'sf entity chain <entity>',
  help: `Show the management chain for an entity.

Arguments:
  entity    Entity ID or name

Displays the chain from the entity up to the root (CEO/top-level).
Output format: entity -> manager -> manager's manager -> ... -> root

Examples:
  sf entity chain alice
  sf entity chain el-abc123
  sf entity chain alice --json`,
  options: [],
  handler: chainHandler as Command['handler'],
};

// ============================================================================
// Command Definitions
// ============================================================================

export const entityRegisterCommand: Command = {
  name: 'register',
  description: 'Register a new entity',
  usage: 'sf entity register <name> [--type <type>]',
  help: `Register a new entity in the system.

Entities represent identities - AI agents, humans, or system processes.
They are the actors that create and interact with elements.

Options:
  --type, -t    Entity type: agent, human, or system (default: agent)
  --public-key  Base64-encoded Ed25519 public key for cryptographic identity
  --tag         Tag to add to entity (can be repeated)

Examples:
  sf entity register claude --type agent
  sf entity register bob --type human
  sf entity register ci-system --type system
  sf entity register alice --tag team-alpha --tag frontend`,
  options: registerOptions,
  handler: entityRegisterHandler as Command['handler'],
};

export const entityListCommand: Command = {
  name: 'list',
  description: 'List all registered entities',
  usage: 'sf entity list [--type <type>]',
  help: `List all registered entities.

Options:
  --type, -t    Filter by entity type: agent, human, or system
  --limit, -l   Maximum number of entities to return

Examples:
  sf entity list
  sf entity list --type agent
  sf entity list --type human --limit 10
  sf entity list --json`,
  options: listOptions,
  handler: entityListHandler as Command['handler'],
};

export const entityCommand: Command = {
  name: 'entity',
  description: 'Manage entities (agents, humans, systems)',
  usage: 'sf entity <subcommand>',
  help: `Manage entities in the system.

Entities represent identities - AI agents, humans, or system processes.
They are used for attribution, assignment, and access control.

Subcommands:
  register       Register a new entity
  list           List all registered entities
  set-manager    Set an entity's manager
  clear-manager  Clear an entity's manager
  reports        List direct reports for a manager
  chain          Show management chain for an entity

Examples:
  sf entity register claude --type agent
  sf entity list
  sf entity list --type human
  sf entity set-manager alice bob
  sf entity reports bob
  sf entity chain alice

Note: Use 'sf show <id>', 'sf update <id>', 'sf delete <id>' for any element.`,
  handler: async (args: string[], options: GlobalOptions): Promise<CommandResult> => {
    // Default to list if no subcommand
    return entityListHandler(args, options as ListOptions);
  },
  subcommands: {
    register: entityRegisterCommand,
    list: entityListCommand,
    'set-manager': setManagerCommand,
    'clear-manager': clearManagerCommand,
    reports: reportsCommand,
    chain: chainCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    ls: entityListCommand,
    create: entityRegisterCommand,
  },
};
