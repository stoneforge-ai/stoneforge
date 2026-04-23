/**
 * config command - Manage configuration
 *
 * Subcommands:
 * - show: Display current configuration
 * - set: Set a configuration value
 * - unset: Remove a configuration value
 * - edit: Open config file in default editor
 */

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Command, CommandResult, GlobalOptions } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import {
  getConfig,
  getValue,
  setValue,
  unsetValue,
  getConfigPath,
  getValueSource,
  isValidConfigPath,
  VALID_CONFIG_PATHS,
} from '../../config/index.js';

// ============================================================================
// Config Show
// ============================================================================

async function configShowHandler(
  args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  try {
    const config = getConfig();
    const configPath = getConfigPath();

    if (args.length > 0) {
      // Show specific value - validate path first
      const path = args[0];
      if (!isValidConfigPath(path)) {
        const validPaths = VALID_CONFIG_PATHS.join(', ');
        return failure(
          `Unknown configuration key: ${path}\nValid keys: ${validPaths}`,
          ExitCode.VALIDATION
        );
      }
      const value = getValue(path);
      const source = getValueSource(path);
      return success(
        { path, value, source },
        `${path} = ${JSON.stringify(value)} (from ${source})`
      );
    }

    // Show all config
    const lines: string[] = [
      `Configuration (from ${configPath ?? 'defaults'})`,
      '',
    ];

    for (const [section, values] of Object.entries(config)) {
      if (typeof values === 'object' && values !== null) {
        lines.push(`${section}:`);
        for (const [key, value] of Object.entries(values)) {
          lines.push(`  ${key}: ${JSON.stringify(value)}`);
        }
      } else {
        lines.push(`${section}: ${JSON.stringify(values)}`);
      }
    }

    return success(config, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to read configuration: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Config Set
// ============================================================================

async function configSetHandler(
  args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 2) {
    return failure('Usage: sf config set <path> <value>', ExitCode.INVALID_ARGUMENTS);
  }

  const [path, ...valueParts] = args;
  const valueStr = valueParts.join(' ');

  // Validate path is a known configuration key
  if (!isValidConfigPath(path)) {
    const validPaths = VALID_CONFIG_PATHS.join(', ');
    return failure(
      `Unknown configuration key: ${path}\nValid keys: ${validPaths}`,
      ExitCode.VALIDATION
    );
  }

  // Try to parse as JSON, fall back to string
  let value: unknown;
  try {
    value = JSON.parse(valueStr);
  } catch {
    value = valueStr;
  }

  try {
    setValue(path, value as never);
    return success(
      { path, value },
      `Set ${path} = ${JSON.stringify(value)}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to set configuration: ${message}`, ExitCode.VALIDATION);
  }
}

// ============================================================================
// Config Unset
// ============================================================================

async function configUnsetHandler(
  args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure('Usage: sf config unset <path>', ExitCode.INVALID_ARGUMENTS);
  }

  const path = args[0];

  // Validate path is a known configuration key
  if (!isValidConfigPath(path)) {
    const validPaths = VALID_CONFIG_PATHS.join(', ');
    return failure(
      `Unknown configuration key: ${path}\nValid keys: ${validPaths}`,
      ExitCode.VALIDATION
    );
  }

  try {
    unsetValue(path);
    return success(
      { path },
      `Unset ${path}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to unset configuration: ${message}`, ExitCode.VALIDATION);
  }
}

// ============================================================================
// Config Edit
// ============================================================================

/**
 * Get the editor command to use
 * Priority: $EDITOR > $VISUAL > platform default
 */
function getEditor(): string {
  if (process.env.EDITOR) {
    return process.env.EDITOR;
  }
  if (process.env.VISUAL) {
    return process.env.VISUAL;
  }
  // Platform-specific defaults
  if (process.platform === 'win32') {
    return 'notepad';
  }
  // Unix-like systems: try common editors
  return 'vi';
}

async function configEditHandler(
  _args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  try {
    const configPath = getConfigPath();

    if (!configPath) {
      return failure(
        'No configuration file found. Use "sf init" to create a workspace first.',
        ExitCode.NOT_FOUND
      );
    }

    // If the config file doesn't exist, create an empty one
    if (!existsSync(configPath)) {
      const dir = dirname(configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(
        configPath,
        '# Stoneforge Configuration\n# See docs for available options\n\n',
        'utf-8'
      );
    }

    const editor = getEditor();

    // Spawn editor and wait for it to close
    const result = spawnSync(editor, [configPath], {
      stdio: 'inherit',
      shell: true,
    });

    if (result.error) {
      return failure(
        `Failed to open editor "${editor}": ${result.error.message}`,
        ExitCode.GENERAL_ERROR
      );
    }

    if (result.status !== 0) {
      return failure(
        `Editor exited with status ${result.status}`,
        ExitCode.GENERAL_ERROR
      );
    }

    return success(
      { editor, path: configPath },
      `Edited ${configPath}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to edit configuration: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const configCommand: Command = {
  name: 'config',
  description: 'Manage configuration',
  usage: 'sf config <subcommand> [args]',
  help: `Manage Stoneforge configuration.

Configuration is loaded from (in order of precedence):
  1. CLI flags (--db, --actor)
  2. Environment variables (STONEFORGE_*)
  3. Config file (.stoneforge/config.yaml)
  4. Built-in defaults`,
  handler: configShowHandler,
  subcommands: {
    show: {
      name: 'show',
      description: 'Display current configuration',
      usage: 'sf config show [path]',
      help: `Display the current configuration.

If a path is specified, shows that specific value.
Otherwise, displays all configuration values.

Examples:
  sf config show              Show all configuration
  sf config show actor        Show actor setting
  sf config show sync.autoExport  Show sync.autoExport setting`,
      handler: configShowHandler,
    },
    set: {
      name: 'set',
      description: 'Set a configuration value',
      usage: 'sf config set <path> <value>',
      help: `Set a configuration value in the config file.

The value will be parsed as JSON if possible, otherwise stored as a string.

Examples:
  sf config set actor myagent
  sf config set sync.autoExport true
  sf config set playbooks.paths '["playbooks", "templates"]'`,
      handler: configSetHandler,
    },
    unset: {
      name: 'unset',
      description: 'Remove a configuration value',
      usage: 'sf config unset <path>',
      help: `Remove a configuration value from the config file.

The value will fall back to the default.

Examples:
  sf config unset actor
  sf config unset sync.autoExport`,
      handler: configUnsetHandler,
    },
    edit: {
      name: 'edit',
      description: 'Open config file in editor',
      usage: 'sf config edit',
      help: `Open the configuration file in your default editor.

The editor is determined by (in order of precedence):
  1. $EDITOR environment variable
  2. $VISUAL environment variable
  3. Platform default (vi on Unix, notepad on Windows)

If no config file exists, a default one will be created.

Examples:
  sf config edit                     Open in default editor
  EDITOR=nano sf config edit         Open in nano
  EDITOR="code --wait" sf config edit  Open in VS Code`,
      handler: configEditHandler,
    },
  },
};
