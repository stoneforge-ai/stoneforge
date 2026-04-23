/**
 * Tool Permission Checking
 *
 * Logic for determining whether a tool action is allowed or requires
 * approval in restricted permission mode.
 *
 * @module
 */

import type { ToolPermissionCheck } from './types.js';
import { AUTO_ALLOWED_TOOLS, AUTO_ALLOWED_SF_COMMANDS } from './types.js';

/**
 * Checks if a tool is auto-allowed in restricted permission mode.
 *
 * @param toolName - The name of the tool (e.g., 'Read', 'Bash', 'Edit')
 * @param toolArgs - The tool's arguments/input
 * @param allowedBashCommands - Configurable list of allowed bash command prefixes
 * @returns Permission check result
 */
export function checkToolPermission(
  toolName: string,
  toolArgs: unknown,
  allowedBashCommands: string[]
): ToolPermissionCheck {
  // Check if tool is in the auto-allowed list
  if (AUTO_ALLOWED_TOOLS.includes(toolName)) {
    return { allowed: true, reason: `Tool "${toolName}" is auto-allowed` };
  }

  // Special handling for Bash tool - check the command
  if (toolName === 'Bash' || toolName === 'bash') {
    return checkBashPermission(toolArgs, allowedBashCommands);
  }

  // Any other tool is restricted
  return { allowed: false, reason: `Tool "${toolName}" requires approval in restricted mode` };
}

/**
 * Checks if a Bash command is allowed without approval.
 *
 * A bash command is allowed if:
 * 1. It starts with one of the configured allowed command prefixes
 * 2. It is an "sf" command with an allowed subcommand
 *
 * @param toolArgs - The Bash tool arguments (expected to have a `command` field)
 * @param allowedBashCommands - Configurable list of allowed bash command prefixes
 * @returns Permission check result
 */
function checkBashPermission(
  toolArgs: unknown,
  allowedBashCommands: string[]
): ToolPermissionCheck {
  const command = extractBashCommand(toolArgs);
  if (!command) {
    return { allowed: false, reason: 'Bash command could not be determined' };
  }

  // Normalize: trim and collapse whitespace
  const normalizedCommand = command.trim();

  // Check if it's an allowed sf command
  if (isSfCommandAllowed(normalizedCommand)) {
    return { allowed: true, reason: `Stoneforge CLI command is auto-allowed` };
  }

  // Check against the configurable allowlist
  if (isBashCommandAllowed(normalizedCommand, allowedBashCommands)) {
    return { allowed: true, reason: `Bash command matches allowlist` };
  }

  return { allowed: false, reason: `Bash command "${truncateCommand(normalizedCommand)}" requires approval` };
}

/**
 * Extracts the command string from Bash tool arguments.
 */
function extractBashCommand(toolArgs: unknown): string | undefined {
  if (!toolArgs || typeof toolArgs !== 'object') return undefined;

  const args = toolArgs as Record<string, unknown>;

  // The Bash tool typically uses a `command` field
  if (typeof args.command === 'string') {
    return args.command;
  }

  // Fallback: check for `input` field
  if (typeof args.input === 'string') {
    return args.input;
  }

  return undefined;
}

/**
 * Checks if a command is an allowed sf (Stoneforge) CLI command.
 */
function isSfCommandAllowed(command: string): boolean {
  // Match "sf <subcommand>" at the start of the command
  // Also handle chained commands with && or ;
  const firstCommand = command.split(/\s*(?:&&|;|\|)\s*/)[0].trim();

  if (!firstCommand.startsWith('sf ')) {
    return false;
  }

  // Extract the subcommand (second word)
  const parts = firstCommand.split(/\s+/);
  if (parts.length < 2) return false;

  const subcommand = parts[1];
  return AUTO_ALLOWED_SF_COMMANDS.includes(subcommand);
}

/**
 * Checks if a bash command matches one of the allowed command prefixes.
 *
 * The match is prefix-based: if the normalized command starts with one of the
 * allowed commands, it is permitted. This allows "git status --short" to match
 * the "git status" allowlist entry.
 *
 * For piped/chained commands (using &&, ;, or |), only the first command is checked.
 */
function isBashCommandAllowed(command: string, allowedCommands: string[]): boolean {
  // For piped/chained commands, check each part
  const commandParts = command.split(/\s*(?:&&|;)\s*/);

  for (const part of commandParts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;

    // Check if this part of the command is in the allowed list
    const partAllowed = allowedCommands.some((allowed) => {
      const normalizedAllowed = allowed.trim();
      // Exact match or prefix match (command starts with allowed + space or is exactly allowed)
      return (
        trimmedPart === normalizedAllowed ||
        trimmedPart.startsWith(normalizedAllowed + ' ') ||
        trimmedPart.startsWith(normalizedAllowed + '\t')
      );
    });

    if (!partAllowed) {
      // Check if it's an allowed sf command
      if (!isSfCommandAllowed(trimmedPart)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Truncates a command for display in messages.
 */
function truncateCommand(command: string, maxLength = 80): string {
  if (command.length <= maxLength) return command;
  return command.substring(0, maxLength) + '...';
}
