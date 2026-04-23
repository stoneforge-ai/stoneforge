/**
 * Team Commands - Collection command interface for teams
 *
 * Provides CLI commands for team operations:
 * - team create: Create a new team
 * - team add: Add member to team
 * - team remove: Remove member from team
 * - team list: List teams
 * - team members: List team members
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import {
  createTeam,
  isTeamMember,
  isTeamDeleted,
  type Team,
  type CreateTeamInput,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Team Create Command
// ============================================================================

interface TeamCreateOptions {
  name?: string;
  member?: string | string[];
  tag?: string[];
}

const teamCreateOptions: CommandOption[] = [
  {
    name: 'name',
    short: 'n',
    description: 'Team name (required)',
    hasValue: true,
    required: true,
  },
  {
    name: 'member',
    short: 'm',
    description: 'Add member (can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'tag',
    description: 'Add tag (can be repeated)',
    hasValue: true,
    array: true,
  },
];

async function teamCreateHandler(
  _args: string[],
  options: GlobalOptions & TeamCreateOptions
): Promise<CommandResult> {
  if (!options.name) {
    return failure('--name is required for creating a team', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Handle members
    let members: EntityId[] | undefined;
    if (options.member) {
      members = (Array.isArray(options.member) ? options.member : [options.member]) as EntityId[];
    }

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    const input: CreateTeamInput = {
      name: options.name,
      createdBy: actor,
      ...(members && { members }),
      ...(tags && { tags }),
    };

    const team = await createTeam(input, api.getIdGeneratorConfig());
    const created = await api.create(team as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, `Created team ${created.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create team: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const teamCreateCommand: Command = {
  name: 'create',
  description: 'Create a new team',
  usage: 'sf team create --name <name> [options]',
  help: `Create a new team.

Options:
  -n, --name <name>     Team name (required)
  -m, --member <entity> Add member (can be repeated)
      --tag <tag>       Add tag (can be repeated)

Examples:
  sf team create --name "Engineering"
  sf team create -n "Design" -m el-user1 -m el-user2
  sf team create -n "Backend" --tag backend --tag api`,
  options: teamCreateOptions,
  handler: teamCreateHandler as Command['handler'],
};

// ============================================================================
// Team Add Command
// ============================================================================

async function teamAddHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [teamId, entityId] = args;

  if (!teamId || !entityId) {
    return failure('Usage: sf team add <team-id> <entity-id>\nExample: sf team add el-team123 el-user456', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // First check if already a member (for better UX message)
    const team = await api.get<Team>(teamId as ElementId);
    if (!team) {
      return failure(`Team not found: ${teamId}`, ExitCode.NOT_FOUND);
    }
    if (team.type !== 'team') {
      return failure(`Element ${teamId} is not a team (type: ${team.type})`, ExitCode.VALIDATION);
    }
    if (isTeamMember(team, entityId as EntityId)) {
      return success(team, `Entity ${entityId} is already a member of team ${teamId}`);
    }

    // Verify entity exists and is an entity type
    const entity = await api.get<Element>(entityId as ElementId);
    if (!entity) {
      return failure(`Entity not found: ${entityId}`, ExitCode.NOT_FOUND);
    }
    if (entity.type !== 'entity') {
      return failure(`Element ${entityId} is not an entity (type: ${entity.type})`, ExitCode.VALIDATION);
    }

    // Use the API method which handles validation, updates, and events
    await api.addTeamMember(
      teamId as ElementId,
      entityId as EntityId,
      { actor }
    );

    return success(
      { teamId, entityId },
      `Added ${entityId} to team ${teamId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to add member: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const teamAddCommand: Command = {
  name: 'add',
  description: 'Add member to team',
  usage: 'sf team add <team-id> <entity-id>',
  help: `Add a member to a team.

Arguments:
  team-id    Team identifier
  entity-id  Entity identifier to add

Examples:
  sf team add el-team123 el-user456`,
  handler: teamAddHandler as Command['handler'],
};

// ============================================================================
// Team Remove Command
// ============================================================================

async function teamRemoveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [teamId, entityId] = args;

  if (!teamId || !entityId) {
    return failure('Usage: sf team remove <team-id> <entity-id>\nExample: sf team remove el-team123 el-user456', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // First check if entity is a member (for better UX)
    const team = await api.get<Team>(teamId as ElementId);
    if (!team) {
      return failure(`Team not found: ${teamId}`, ExitCode.NOT_FOUND);
    }
    if (team.type !== 'team') {
      return failure(`Element ${teamId} is not a team (type: ${team.type})`, ExitCode.VALIDATION);
    }
    if (!isTeamMember(team, entityId as EntityId)) {
      return success(team, `Entity ${entityId} is not a member of team ${teamId}`);
    }

    // Use the API method which handles validation, updates, and events
    await api.removeTeamMember(
      teamId as ElementId,
      entityId as EntityId,
      { actor }
    );

    return success(
      { teamId, entityId },
      `Removed ${entityId} from team ${teamId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to remove member: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const teamRemoveCommand: Command = {
  name: 'remove',
  description: 'Remove member from team',
  usage: 'sf team remove <team-id> <entity-id>',
  help: `Remove a member from a team.

Arguments:
  team-id    Team identifier
  entity-id  Entity identifier to remove

Examples:
  sf team remove el-team123 el-user456`,
  handler: teamRemoveHandler as Command['handler'],
};

// ============================================================================
// Team Delete Command
// ============================================================================

interface TeamDeleteOptions {
  reason?: string;
  force?: boolean;
}

const teamDeleteOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: 'Reason for deletion',
    hasValue: true,
  },
  {
    name: 'force',
    short: 'f',
    description: 'Skip confirmation for teams with members',
    hasValue: false,
  },
];

async function teamDeleteHandler(
  args: string[],
  options: GlobalOptions & TeamDeleteOptions
): Promise<CommandResult> {
  const [teamId] = args;

  if (!teamId) {
    return failure('Usage: sf team delete <team-id> [options]\nExample: sf team delete el-team123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Get team
    const team = await api.get<Team>(teamId as ElementId);
    if (!team) {
      return failure(`Team not found: ${teamId}`, ExitCode.NOT_FOUND);
    }
    if (team.type !== 'team') {
      return failure(`Element ${teamId} is not a team (type: ${team.type})`, ExitCode.VALIDATION);
    }

    // Check if already deleted
    if (isTeamDeleted(team)) {
      return failure(`Team ${teamId} is already deleted`, ExitCode.VALIDATION);
    }

    // Warn if team has members (unless --force)
    if (team.members.length > 0 && !options.force) {
      return failure(
        `Team ${teamId} has ${team.members.length} member(s). Use --force to delete anyway.`,
        ExitCode.VALIDATION
      );
    }

    // Soft delete the team
    await api.delete(teamId as ElementId, { actor, reason: options.reason });

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(teamId);
    }

    return success(
      { teamId, deletedAt: new Date().toISOString() },
      `Deleted team ${teamId}${options.reason ? ` (reason: ${options.reason})` : ''}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to delete team: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const teamDeleteCommand: Command = {
  name: 'delete',
  description: 'Delete a team (soft delete)',
  usage: 'sf team delete <team-id> [options]',
  help: `Delete a team (soft delete).

Arguments:
  team-id    Team identifier

Options:
  -r, --reason <text>  Reason for deletion
  -f, --force          Skip confirmation for teams with members

Note: Teams with members require --force flag to delete.
      Soft delete preserves the team in audit trail.

Examples:
  sf team delete el-team123
  sf team delete el-team123 --reason "Team disbanded"
  sf team delete el-team123 --force`,
  options: teamDeleteOptions,
  handler: teamDeleteHandler as Command['handler'],
};

// ============================================================================
// Team List Command
// ============================================================================

interface TeamListOptions {
  member?: string;
  limit?: string;
}

const teamListOptions: CommandOption[] = [
  {
    name: 'member',
    short: 'm',
    description: 'Filter by member entity',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function teamListHandler(
  _args: string[],
  options: GlobalOptions & TeamListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'team',
    };

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Team>(filter);

    // Post-filter by member
    let items = result.items;
    if (options.member) {
      items = items.filter((t) => t.members.includes(options.member as EntityId));
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((t) => t.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, 'No teams found');
    }

    // Build table
    const headers = ['ID', 'NAME', 'MEMBERS', 'TAGS', 'CREATED'];
    const rows = items.map((t) => [
      t.id,
      t.name.length > 30 ? t.name.substring(0, 27) + '...' : t.name,
      String(t.members.length),
      t.tags.slice(0, 3).join(', ') + (t.tags.length > 3 ? '...' : ''),
      t.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${items.length} of ${result.total} teams`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list teams: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const teamListCommand: Command = {
  name: 'list',
  description: 'List teams',
  usage: 'sf team list [options]',
  help: `List teams.

Options:
  -m, --member <entity>  Filter by member entity
  -l, --limit <n>        Maximum results

Examples:
  sf team list
  sf team list --member el-user123
  sf team list --limit 10`,
  options: teamListOptions,
  handler: teamListHandler as Command['handler'],
};

// ============================================================================
// Team Members Command
// ============================================================================

async function teamMembersHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf team members <id>\nExample: sf team members el-team123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const team = await api.get<Team>(id as ElementId);

    if (!team) {
      return failure(`Team not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (team.type !== 'team') {
      return failure(`Element ${id} is not a team (type: ${team.type})`, ExitCode.VALIDATION);
    }

    const members = team.members;

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success({ members, count: members.length });
    }

    if (mode === 'quiet') {
      return success(members.join('\n'));
    }

    if (members.length === 0) {
      return success({ members: [], count: 0 }, 'No members');
    }

    // Build table
    const headers = ['MEMBER'];
    const rows = members.map((m) => [m]);

    const table = formatter.table(headers, rows);
    return success(
      { members, count: members.length },
      table + `\n${members.length} member(s)`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list members: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const teamMembersCommand: Command = {
  name: 'members',
  description: 'List team members',
  usage: 'sf team members <id>',
  help: `List members of a team.

Arguments:
  id    Team identifier

Examples:
  sf team members el-team123`,
  handler: teamMembersHandler as Command['handler'],
};

// ============================================================================
// Team Root Command
// ============================================================================

export const teamCommand: Command = {
  name: 'team',
  description: 'Manage teams (entity collections)',
  usage: 'sf team <subcommand> [options]',
  help: `Manage teams - collections of related entities.

Teams enable group-based operations, assignment, and organization.
Entities can belong to multiple teams.

Subcommands:
  create   Create a new team
  add      Add member to team
  remove   Remove member from team
  delete   Delete a team (soft delete)
  list     List teams
  members  List team members

Examples:
  sf team create --name "Engineering"
  sf team list --member el-user123
  sf team add el-team123 el-user456
  sf team members el-team123
  sf team delete el-team123

Note: Use 'sf show <id>', 'sf update <id>', 'sf delete <id>' for any element.`,
  subcommands: {
    create: teamCreateCommand,
    add: teamAddCommand,
    remove: teamRemoveCommand,
    delete: teamDeleteCommand,
    list: teamListCommand,
    members: teamMembersCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    new: teamCreateCommand,
    ls: teamListCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return teamListHandler(args, options);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(teamCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = `Unknown subcommand: ${args[0]}`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean?\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "sf team --help" to see available subcommands.';
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
