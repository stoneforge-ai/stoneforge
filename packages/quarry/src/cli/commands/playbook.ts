/**
 * Playbook Commands - Collection command interface for playbooks
 *
 * Provides CLI commands for playbook operations:
 * - playbook list: List playbooks with filtering
 * - playbook show: Show playbook details
 * - playbook validate: Validate playbook structure
 * - playbook create: Create a new playbook
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import {
  createPlaybook,
  validatePlaybook,
  validateSteps,
  validateVariables,
  validateNoCircularInheritance,
  resolveInheritanceChain,
  type Playbook,
  type CreatePlaybookInput,
  type PlaybookStep,
  type PlaybookVariable,
  VariableType,
  type PlaybookLoader,
} from '@stoneforge/core';
import { validateCreateWorkflow } from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Playbook List Command
// ============================================================================

interface PlaybookListOptions {
  limit?: string;
}

const playbookListOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function playbookListHandler(
  _args: string[],
  options: GlobalOptions & PlaybookListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'playbook',
    };

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Playbook>(filter);
    const items = result.items;

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((p) => p.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, 'No playbooks found');
    }

    // Build table
    const headers = ['ID', 'NAME', 'TITLE', 'VERSION', 'STEPS', 'CREATED'];
    const rows = items.map((p) => [
      p.id,
      p.name,
      p.title.length > 30 ? p.title.substring(0, 27) + '...' : p.title,
      `v${p.version}`,
      String(p.steps.length),
      p.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${items.length} of ${result.total} playbooks`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list playbooks: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const playbookListCommand: Command = {
  name: 'list',
  description: 'List playbooks',
  usage: 'sf playbook list [options]',
  help: `List playbooks with optional filtering.

Options:
  -l, --limit <n>  Maximum results

Examples:
  sf playbook list
  sf playbook list --limit 10`,
  options: playbookListOptions,
  handler: playbookListHandler as Command['handler'],
};

// ============================================================================
// Playbook Show Command
// ============================================================================

interface PlaybookShowOptions {
  steps?: boolean;
  variables?: boolean;
}

const playbookShowOptions: CommandOption[] = [
  {
    name: 'steps',
    short: 's',
    description: 'Include step definitions',
    hasValue: false,
  },
  {
    name: 'variables',
    short: 'v',
    description: 'Include variable definitions',
    hasValue: false,
  },
];

async function playbookShowHandler(
  args: string[],
  options: GlobalOptions & PlaybookShowOptions
): Promise<CommandResult> {
  const [nameOrId] = args;

  if (!nameOrId) {
    return failure('Usage: sf playbook show <name|id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    let playbook: Playbook | null = null;

    // First try as ID
    if (nameOrId.startsWith('el-')) {
      playbook = await api.get<Playbook>(nameOrId as ElementId);
    }

    // If not found by ID, search by name
    if (!playbook) {
      const allPlaybooks = await api.list<Playbook>({ type: 'playbook' });
      playbook = allPlaybooks.find((p) => p.name === nameOrId) || null;
    }

    if (!playbook) {
      return failure(`Playbook not found: ${nameOrId}`, ExitCode.NOT_FOUND);
    }

    if (playbook.type !== 'playbook') {
      return failure(`Element ${nameOrId} is not a playbook (type: ${playbook.type})`, ExitCode.VALIDATION);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(playbook);
    }

    if (mode === 'quiet') {
      return success(playbook.id);
    }

    // Human-readable output
    let output = formatter.element(playbook as unknown as Record<string, unknown>);

    // Add playbook-specific info
    output += '\n\n--- Playbook Info ---\n';
    output += `Name:      ${playbook.name}\n`;
    output += `Version:   ${playbook.version}\n`;
    output += `Steps:     ${playbook.steps.length}\n`;
    output += `Variables: ${playbook.variables.length}\n`;
    if (playbook.extends && playbook.extends.length > 0) {
      output += `Extends:   ${playbook.extends.join(', ')}\n`;
    }

    // Show steps if requested
    if (options.steps && playbook.steps.length > 0) {
      output += '\n--- Steps ---\n';
      const stepHeaders = ['ID', 'TITLE', 'DEPENDS ON'];
      const stepRows = playbook.steps.map((s) => [
        s.id,
        s.title.length > 40 ? s.title.substring(0, 37) + '...' : s.title,
        s.dependsOn?.join(', ') || '-',
      ]);
      output += formatter.table(stepHeaders, stepRows);
    }

    // Show variables if requested
    if (options.variables && playbook.variables.length > 0) {
      output += '\n--- Variables ---\n';
      const varHeaders = ['NAME', 'TYPE', 'REQUIRED', 'DEFAULT'];
      const varRows = playbook.variables.map((v) => [
        v.name,
        v.type,
        v.required ? 'yes' : 'no',
        v.default !== undefined ? String(v.default) : '-',
      ]);
      output += formatter.table(varHeaders, varRows);
    }

    return success(playbook, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to show playbook: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const playbookShowCommand: Command = {
  name: 'show',
  description: 'Show playbook details',
  usage: 'sf playbook show <name|id> [options]',
  help: `Display detailed information about a playbook.

Arguments:
  name|id    Playbook name or identifier

Options:
  -s, --steps      Include step definitions
  -v, --variables  Include variable definitions

Examples:
  sf playbook show deploy
  sf playbook show el-abc123 --steps --variables
  sf playbook show deploy --json`,
  options: playbookShowOptions,
  handler: playbookShowHandler as Command['handler'],
};

// ============================================================================
// Playbook Validate Command
// ============================================================================

interface PlaybookValidateOptions {
  var?: string | string[];
  create?: boolean;
}

const playbookValidateOptions: CommandOption[] = [
  {
    name: 'var',
    description: 'Set variable for create-time validation (name=value, can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'create',
    short: 'c',
    description: 'Perform create-time validation (validates variables can be resolved)',
    hasValue: false,
  },
];

/**
 * Parses variable arguments in name=value format
 */
function parseVariableArgs(varArgs: string | string[] | undefined): Record<string, unknown> {
  const variables: Record<string, unknown> = {};
  if (!varArgs) return variables;

  const args = Array.isArray(varArgs) ? varArgs : [varArgs];
  for (const varArg of args) {
    const eqIndex = varArg.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Invalid variable format: ${varArg}. Use name=value`);
    }
    const name = varArg.slice(0, eqIndex);
    const value = varArg.slice(eqIndex + 1);

    // Try to parse as JSON for boolean/number types, otherwise use as string
    try {
      if (value === 'true') {
        variables[name] = true;
      } else if (value === 'false') {
        variables[name] = false;
      } else if (!isNaN(Number(value)) && value.trim() !== '') {
        variables[name] = Number(value);
      } else {
        variables[name] = value;
      }
    } catch {
      variables[name] = value;
    }
  }

  return variables;
}

async function playbookValidateHandler(
  args: string[],
  options: GlobalOptions & PlaybookValidateOptions
): Promise<CommandResult> {
  const [nameOrId] = args;

  if (!nameOrId) {
    return failure('Usage: sf playbook validate <name|id> [--var name=value] [--create]', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    let playbook: Playbook | null = null;

    // First try as ID
    if (nameOrId.startsWith('el-')) {
      playbook = await api.get<Playbook>(nameOrId as ElementId);
    }

    // If not found by ID, search by name
    if (!playbook) {
      const allPlaybooks = await api.list<Playbook>({ type: 'playbook' });
      playbook = allPlaybooks.find((p) => p.name === nameOrId) || null;
    }

    if (!playbook) {
      return failure(`Playbook not found: ${nameOrId}`, ExitCode.NOT_FOUND);
    }

    if (playbook.type !== 'playbook') {
      return failure(`Element ${nameOrId} is not a playbook (type: ${playbook.type})`, ExitCode.VALIDATION);
    }

    const issues: string[] = [];

    // Validate playbook structure
    try {
      validatePlaybook(playbook);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      issues.push(`Structure: ${message}`);
    }

    // Validate steps
    try {
      validateSteps(playbook.steps);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      issues.push(`Steps: ${message}`);
    }

    // Validate variables
    try {
      validateVariables(playbook.variables);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      issues.push(`Variables: ${message}`);
    }

    // Check for circular dependencies in steps
    const stepIds = new Set(playbook.steps.map((s) => s.id));
    for (const step of playbook.steps) {
      if (step.dependsOn) {
        for (const depId of step.dependsOn) {
          if (!stepIds.has(depId)) {
            issues.push(`Step '${step.id}' depends on unknown step '${depId}'`);
          }
        }
      }
    }

    // Check for unused variables in templates
    const definedVars = new Set(playbook.variables.map((v) => v.name));
    const varPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

    for (const step of playbook.steps) {
      let match: RegExpExecArray | null;
      const pattern = new RegExp(varPattern.source, 'g');
      while ((match = pattern.exec(step.title)) !== null) {
        if (!definedVars.has(match[1])) {
          issues.push(`Step '${step.id}' uses undefined variable '${match[1]}' in title`);
        }
      }

      if (step.description) {
        const descPattern = new RegExp(varPattern.source, 'g');
        while ((match = descPattern.exec(step.description)) !== null) {
          if (!definedVars.has(match[1])) {
            issues.push(`Step '${step.id}' uses undefined variable '${match[1]}' in description`);
          }
        }
      }

      if (step.condition) {
        const condPattern = new RegExp(varPattern.source, 'g');
        while ((match = condPattern.exec(step.condition)) !== null) {
          if (!definedVars.has(match[1])) {
            issues.push(`Step '${step.id}' uses undefined variable '${match[1]}' in condition`);
          }
        }
      }
    }

    // Check for circular inheritance (always, not just create-time)
    if (playbook.extends && playbook.extends.length > 0) {
      const allPlaybooks = await api.list<Playbook>({ type: 'playbook' });
      const playbookLoader: PlaybookLoader = (name: string) => {
        return allPlaybooks.find((p) => p.name.toLowerCase() === name.toLowerCase());
      };

      try {
        await resolveInheritanceChain(playbook, playbookLoader);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        issues.push(`Inheritance: ${message}`);
      }
    }

    // Create-time validation - run if --create flag is set or if --var is provided
    const shouldDoCreateValidation = options.create || options.var;
    let createValidationResult: Awaited<ReturnType<typeof validateCreateWorkflow>> | undefined;

    if (shouldDoCreateValidation) {
      // Parse provided variables
      let providedVars: Record<string, unknown> = {};
      try {
        providedVars = parseVariableArgs(options.var);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return failure(message, ExitCode.VALIDATION);
      }

      // Create a playbook loader that fetches from the database
      const allPlaybooks = await api.list<Playbook>({ type: 'playbook' });
      const playbookLoader: PlaybookLoader = (name: string) => {
        return allPlaybooks.find((p) => p.name.toLowerCase() === name.toLowerCase());
      };

      // Validate create-time variables
      createValidationResult = await validateCreateWorkflow(playbook, providedVars, playbookLoader);

      if (!createValidationResult.valid) {
        issues.push(`Create-time: ${createValidationResult.error}`);
      }
    }

    const mode = getOutputMode(options);

    // Build JSON result
    const jsonResult: Record<string, unknown> = {
      valid: issues.length === 0,
      issues,
      playbook: { id: playbook.id, name: playbook.name },
    };

    // Add create-time validation details if performed
    if (shouldDoCreateValidation && createValidationResult) {
      jsonResult.createValidation = {
        performed: true,
        valid: createValidationResult.valid,
        ...(createValidationResult.valid && {
          resolvedVariables: createValidationResult.resolvedVariables,
          includedSteps: createValidationResult.includedSteps?.map((s) => s.id),
          skippedSteps: createValidationResult.skippedSteps,
        }),
        ...(createValidationResult.error && { error: createValidationResult.error }),
      };
    }

    if (mode === 'json') {
      return success(jsonResult);
    }

    if (mode === 'quiet') {
      return success(issues.length === 0 ? 'valid' : 'invalid');
    }

    // Human-readable output
    let output = '';

    if (issues.length === 0) {
      output = `Playbook '${playbook.name}' is valid`;

      // Add create-time details if validation was performed
      if (shouldDoCreateValidation && createValidationResult?.valid) {
        output += '\n\n--- Create-time Validation ---';
        output += '\nVariables resolved successfully';
        if (createValidationResult.includedSteps && createValidationResult.includedSteps.length > 0) {
          output += `\nIncluded steps: ${createValidationResult.includedSteps.map((s) => s.id).join(', ')}`;
        }
        if (createValidationResult.skippedSteps && createValidationResult.skippedSteps.length > 0) {
          output += `\nSkipped steps: ${createValidationResult.skippedSteps.join(', ')}`;
        }
      }
    } else {
      const issueList = issues.map((i, idx) => `  ${idx + 1}. ${i}`).join('\n');
      output = `Playbook '${playbook.name}' has ${issues.length} issue(s):\n${issueList}`;
    }

    return success(jsonResult, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to validate playbook: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const playbookValidateCommand: Command = {
  name: 'validate',
  description: 'Validate playbook structure and create-time variables',
  usage: 'sf playbook validate <name|id> [--var name=value] [--create]',
  help: `Validate a playbook's structure and optionally test create-time variable resolution.

Structure Checks:
- Required fields are present
- Step IDs are unique
- Step dependencies reference existing steps
- Variables used in templates are defined
- No circular dependencies

Create-time Checks (with --create or --var):
- All required variables are provided
- Variable values match their declared types
- Enum values are within allowed list
- Variable substitution completes without errors
- Condition evaluation succeeds

Arguments:
  name|id    Playbook name or identifier

Options:
      --var <name=value>  Set variable for create-time validation (can be repeated)
  -c, --create            Perform create-time validation

Examples:
  sf playbook validate deploy
  sf playbook validate deploy --create
  sf playbook validate deploy --var env=production --var debug=true
  sf playbook validate el-abc123 --var version=1.0.0`,
  options: playbookValidateOptions,
  handler: playbookValidateHandler as Command['handler'],
};

// ============================================================================
// Playbook Create Command
// ============================================================================

interface PlaybookCreateOptions {
  name?: string;
  title?: string;
  step?: string | string[];
  variable?: string | string[];
  extends?: string | string[];
  tag?: string[];
}

const playbookCreateOptions: CommandOption[] = [
  {
    name: 'name',
    short: 'n',
    description: 'Playbook name (unique identifier, required)',
    hasValue: true,
    required: true,
  },
  {
    name: 'title',
    short: 't',
    description: 'Playbook title (display name, required)',
    hasValue: true,
    required: true,
  },
  {
    name: 'step',
    short: 's',
    description: 'Add step (format: id:title[:dependsOn,...], can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'variable',
    short: 'v',
    description: 'Add variable (format: name:type[:default][:required], can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'extends',
    short: 'e',
    description: 'Extend playbook (can be repeated)',
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

function parseStep(stepArg: string): PlaybookStep {
  const parts = stepArg.split(':');
  if (parts.length < 2) {
    throw new Error(`Invalid step format: ${stepArg}. Expected id:title[:dependsOn,...]`);
  }

  const id = parts[0].trim();
  const title = parts[1].trim();
  const dependsOn = parts.length > 2 ? parts[2].split(',').map((d) => d.trim()).filter(Boolean) : undefined;

  return {
    id,
    title,
    ...(dependsOn && dependsOn.length > 0 && { dependsOn }),
  };
}

function parseVariable(varArg: string): PlaybookVariable {
  const parts = varArg.split(':');
  if (parts.length < 2) {
    throw new Error(`Invalid variable format: ${varArg}. Expected name:type[:default][:required]`);
  }

  const name = parts[0].trim();
  const type = parts[1].trim() as VariableType;

  if (!Object.values(VariableType).includes(type)) {
    throw new Error(`Invalid variable type: ${type}. Must be one of: ${Object.values(VariableType).join(', ')}`);
  }

  let defaultValue: unknown;
  let required = true;

  if (parts.length > 2) {
    const defaultStr = parts[2].trim();
    if (defaultStr) {
      switch (type) {
        case VariableType.STRING:
          defaultValue = defaultStr;
          break;
        case VariableType.NUMBER:
          defaultValue = parseFloat(defaultStr);
          if (isNaN(defaultValue as number)) {
            throw new Error(`Invalid number default for variable '${name}': ${defaultStr}`);
          }
          break;
        case VariableType.BOOLEAN:
          if (defaultStr !== 'true' && defaultStr !== 'false') {
            throw new Error(`Invalid boolean default for variable '${name}': ${defaultStr}. Must be 'true' or 'false'`);
          }
          defaultValue = defaultStr === 'true';
          break;
      }
    }
  }

  if (parts.length > 3) {
    required = parts[3].trim().toLowerCase() !== 'false';
  }

  return {
    name,
    type,
    required,
    ...(defaultValue !== undefined && { default: defaultValue }),
  };
}

async function playbookCreateHandler(
  _args: string[],
  options: GlobalOptions & PlaybookCreateOptions
): Promise<CommandResult> {
  if (!options.name) {
    return failure('--name is required for creating a playbook', ExitCode.INVALID_ARGUMENTS);
  }

  if (!options.title) {
    return failure('--title is required for creating a playbook', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Parse steps
    const steps: PlaybookStep[] = [];
    if (options.step) {
      const stepArgs = Array.isArray(options.step) ? options.step : [options.step];
      for (const stepArg of stepArgs) {
        try {
          steps.push(parseStep(stepArg));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return failure(message, ExitCode.VALIDATION);
        }
      }
    }

    // Parse variables
    const variables: PlaybookVariable[] = [];
    if (options.variable) {
      const varArgs = Array.isArray(options.variable) ? options.variable : [options.variable];
      for (const varArg of varArgs) {
        try {
          variables.push(parseVariable(varArg));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return failure(message, ExitCode.VALIDATION);
        }
      }
    }

    // Parse extends
    let extendsPlaybooks: string[] | undefined;
    if (options.extends) {
      extendsPlaybooks = Array.isArray(options.extends) ? options.extends : [options.extends];
    }

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Validate that creating this playbook won't create circular inheritance
    if (extendsPlaybooks && extendsPlaybooks.length > 0) {
      const allPlaybooks = await api.list<Playbook>({ type: 'playbook' });
      const playbookLoader: PlaybookLoader = (name: string) => {
        return allPlaybooks.find((p) => p.name.toLowerCase() === name.toLowerCase());
      };

      const cycleCheck = await validateNoCircularInheritance(
        options.name,
        extendsPlaybooks,
        playbookLoader
      );

      if (!cycleCheck.valid) {
        return failure(cycleCheck.error, ExitCode.VALIDATION);
      }
    }

    const input: CreatePlaybookInput = {
      name: options.name,
      title: options.title,
      createdBy: actor,
      steps,
      variables,
      ...(extendsPlaybooks && { extends: extendsPlaybooks }),
      ...(tags && { tags }),
    };

    const playbook = await createPlaybook(input);
    const created = await api.create(playbook as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, `Created playbook ${created.id} (${options.name})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create playbook: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const playbookCreateCommand: Command = {
  name: 'create',
  description: 'Create a new playbook',
  usage: 'sf playbook create --name <name> --title <title> [options]',
  help: `Create a new playbook template.

Options:
  -n, --name <name>       Playbook name (unique identifier, required)
  -t, --title <title>     Playbook title (display name, required)
  -s, --step <spec>       Add step (format: id:title[:dependsOn,...])
  -v, --variable <spec>   Add variable (format: name:type[:default][:required])
  -e, --extends <name>    Extend playbook (can be repeated)
      --tag <tag>         Add tag (can be repeated)

Step format:
  id:title                       Basic step
  id:title:dep1,dep2             Step with dependencies

Variable format:
  name:type                      Required variable
  name:type:default              Variable with default
  name:type:default:false        Optional variable with default

Examples:
  sf playbook create --name deploy --title "Deployment Process"
  sf playbook create -n deploy -t "Deploy" -s "build:Build app" -s "test:Run tests:build"
  sf playbook create -n deploy -t "Deploy" -v "env:string" -v "debug:boolean:false:false"`,
  options: playbookCreateOptions,
  handler: playbookCreateHandler as Command['handler'],
};

// ============================================================================
// Playbook Root Command
// ============================================================================

export const playbookCommand: Command = {
  name: 'playbook',
  description: 'Manage playbooks (workflow templates)',
  usage: 'sf playbook <subcommand> [options]',
  help: `Manage playbooks - templates for creating workflows.

Playbooks define reusable sequences of tasks with variables, conditions,
and dependencies. They can be instantiated as workflows using 'sf workflow create'.

Subcommands:
  list       List playbooks
  show       Show playbook details
  validate   Validate playbook structure
  create     Create a new playbook

Examples:
  sf playbook list
  sf playbook show deploy --steps --variables
  sf playbook validate deploy
  sf playbook create --name deploy --title "Deployment"`,
  subcommands: {
    list: playbookListCommand,
    show: playbookShowCommand,
    validate: playbookValidateCommand,
    create: playbookCreateCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    new: playbookCreateCommand,
    add: playbookCreateCommand,
    ls: playbookListCommand,
    get: playbookShowCommand,
    view: playbookShowCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return playbookListHandler(args, options);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(playbookCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = `Unknown subcommand: ${args[0]}`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean?\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "sf playbook --help" to see available subcommands.';
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
