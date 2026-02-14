/**
 * Stats Command - Show system statistics
 *
 * Displays various statistics about the Stoneforge workspace.
 */

import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import type { QuarryAPI } from '../../api/types.js';
import { createAPI } from '../db.js';

// ============================================================================
// Stats Handler
// ============================================================================

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

async function statsHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const stats = await api.stats();

    // Build human-readable output
    const lines: string[] = [];

    lines.push('Workspace Statistics');
    lines.push('');

    // Element counts
    lines.push('Elements:');
    lines.push(`  Total: ${stats.totalElements}`);
    for (const [type, count] of Object.entries(stats.elementsByType)) {
      if (count > 0) {
        lines.push(`  ${type}: ${count}`);
      }
    }
    lines.push('');

    // Task status
    lines.push('Tasks:');
    lines.push(`  Ready: ${stats.readyTasks}`);
    lines.push(`  Blocked: ${stats.blockedTasks}`);
    lines.push('');

    // Dependencies and events
    lines.push('Relations:');
    lines.push(`  Dependencies: ${stats.totalDependencies}`);
    lines.push(`  Events: ${stats.totalEvents}`);
    lines.push('');

    // Database size
    lines.push('Storage:');
    lines.push(`  Database size: ${formatBytes(stats.databaseSize)}`);

    return success(stats, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get stats: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const statsCommand: Command = {
  name: 'stats',
  description: 'Show workspace statistics',
  usage: 'sf stats',
  help: `Show statistics about the Stoneforge workspace.

Displays:
- Total element counts by type
- Ready and blocked task counts
- Dependency and event counts
- Database size

Examples:
  sf stats              Show all statistics
  sf stats --json       Output as JSON`,
  handler: statsHandler,
};
