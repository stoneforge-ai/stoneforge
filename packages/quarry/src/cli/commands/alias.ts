/**
 * Alias Command - Show and manage command aliases
 *
 * Displays available command aliases.
 */

import type { Command, CommandResult } from '../types.js';
import { success } from '../types.js';
import { getOutputMode, getFormatter } from '../formatter.js';
import { getAllAliases } from '../runner.js';
import type { GlobalOptions } from '../types.js';

// ============================================================================
// Handler
// ============================================================================

function aliasHandler(
  _args: string[],
  options: GlobalOptions
): CommandResult {
  const aliasMap = getAllAliases();
  const mode = getOutputMode(options);

  if (mode === 'json') {
    const aliases: Record<string, string> = {};
    for (const [alias, target] of aliasMap) {
      aliases[alias] = target;
    }
    return success(aliases);
  }

  if (aliasMap.size === 0) {
    return success(null, 'No aliases defined');
  }

  if (mode === 'quiet') {
    const lines: string[] = [];
    for (const [alias, target] of aliasMap) {
      lines.push(`${alias}=${target}`);
    }
    return success(lines.join('\n'));
  }

  // Human-readable output
  const formatter = getFormatter(mode);
  const headers = ['ALIAS', 'COMMAND'];
  const rows: string[][] = [];

  // Sort aliases alphabetically
  const sortedAliases = Array.from(aliasMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  for (const [alias, target] of sortedAliases) {
    rows.push([alias, target]);
  }

  const table = formatter.table(headers, rows);
  return success(null, `Command Aliases:\n\n${table}`);
}

// ============================================================================
// Command Definition
// ============================================================================

export const aliasCommand: Command = {
  name: 'alias',
  description: 'Show command aliases',
  usage: 'sf alias',
  help: `Display all available command aliases.

Aliases provide shorter or more intuitive names for existing commands.

Examples:
  sf alias              # Show all aliases
  sf alias --json       # Output as JSON

Built-in aliases:
  add, new     -> create
  rm, remove   -> delete
  ls           -> list
  s, get       -> show
  todo, tasks  -> ready
  done, complete -> close
  st           -> status
  dep          -> dependency
  msg          -> message
  doc          -> document`,
  options: [],
  handler: aliasHandler,
};
