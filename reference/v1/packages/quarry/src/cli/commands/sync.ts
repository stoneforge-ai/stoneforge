/**
 * Sync Commands - Export, Import, and Status operations
 *
 * Provides CLI commands for JSONL sync operations:
 * - export: Export elements to JSONL files
 * - import: Import elements from JSONL files
 * - status: Show sync status (dirty elements, etc.)
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createSyncService } from '../../sync/service.js';
import type { ExportResult, ImportResult } from '../../sync/types.js';
import { resolveDatabasePath, STONEFORGE_DIR, DEFAULT_DB_NAME } from '../db.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SYNC_DIR = 'sync';

// ============================================================================
// Database Helper
// ============================================================================

/**
 * Creates a SyncService instance from options
 */
function createSyncServiceFromOptions(options: GlobalOptions): {
  syncService: ReturnType<typeof createSyncService>;
  error?: string;
} {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return {
      syncService: null as unknown as ReturnType<typeof createSyncService>,
      error: 'No database found. Run "sf init" to initialize a workspace, or specify --db path',
    };
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    return { syncService: createSyncService(backend) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      syncService: null as unknown as ReturnType<typeof createSyncService>,
      error: `Failed to open database: ${message}`,
    };
  }
}

/**
 * Resolves sync directory from options or default
 */
function resolveSyncDir(options: { output?: string; input?: string }, isExport: boolean): string {
  const pathOption = isExport ? options.output : options.input;
  if (pathOption) {
    return resolve(pathOption);
  }

  // Default to .stoneforge/sync
  const stoneforgeDir = join(process.cwd(), STONEFORGE_DIR);
  return join(stoneforgeDir, DEFAULT_SYNC_DIR);
}

// ============================================================================
// Export Command
// ============================================================================

interface ExportOptions {
  output?: string;
  full?: boolean;
  'include-ephemeral'?: boolean;
}

const exportOptions: CommandOption[] = [
  {
    name: 'output',
    short: 'o',
    description: 'Output directory path (default: .stoneforge/sync)',
    hasValue: true,
  },
  {
    name: 'full',
    short: 'f',
    description: 'Full export (ignore dirty tracking)',
  },
  {
    name: 'include-ephemeral',
    description: 'Include ephemeral elements (default: exclude)',
  },
];

async function exportHandler(
  _args: string[],
  options: GlobalOptions & ExportOptions
): Promise<CommandResult> {
  const { syncService, error } = createSyncServiceFromOptions(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const outputDir = resolveSyncDir(options, true);

    const result: ExportResult = syncService.exportSync({
      outputDir,
      full: options.full ?? false,
      includeEphemeral: options['include-ephemeral'] ?? false,
    });

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(result);
    }

    if (mode === 'quiet') {
      return success(`${result.elementsExported}:${result.dependenciesExported}`);
    }

    // Human-readable output
    const exportType = result.incremental ? 'Incremental' : 'Full';
    const lines = [
      `${exportType} export completed`,
      '',
      `Elements exported:     ${result.elementsExported}`,
      `Dependencies exported: ${result.dependenciesExported}`,
      '',
      `Files:`,
      `  ${result.elementsFile}`,
      `  ${result.dependenciesFile}`,
    ];

    return success(result, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Export failed: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const exportCommand: Command = {
  name: 'export',
  description: 'Export elements to JSONL files',
  usage: 'sf export [options]',
  help: `Export elements and dependencies to JSONL files for version control.

By default, only exports elements that have been modified since the last export
(incremental export). Use --full for a complete export.

Options:
  -o, --output <dir>       Output directory (default: .stoneforge/sync)
  -f, --full               Full export (ignore dirty tracking)
      --include-ephemeral  Include ephemeral elements (excluded by default)

Output files:
  elements.jsonl      All exported elements
  dependencies.jsonl  All exported dependencies

Examples:
  sf export
  sf export --full
  sf export -o ./backup
  sf export --include-ephemeral`,
  options: exportOptions,
  handler: exportHandler as Command['handler'],
};

// ============================================================================
// Import Command
// ============================================================================

interface ImportOptions {
  input?: string;
  'dry-run'?: boolean;
  force?: boolean;
}

const importOptions: CommandOption[] = [
  {
    name: 'input',
    short: 'i',
    description: 'Input directory path (default: .stoneforge/sync)',
    hasValue: true,
  },
  {
    name: 'dry-run',
    short: 'n',
    description: 'Show what would be imported without making changes',
  },
  {
    name: 'force',
    short: 'f',
    description: 'Force import (remote always wins conflicts)',
  },
];

async function importHandler(
  _args: string[],
  options: GlobalOptions & ImportOptions
): Promise<CommandResult> {
  const { syncService, error } = createSyncServiceFromOptions(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const inputDir = resolveSyncDir(options, false);

    // Check if input directory exists
    if (!existsSync(inputDir)) {
      return failure(`Input directory not found: ${inputDir}`, ExitCode.NOT_FOUND);
    }

    const result: ImportResult = syncService.importSync({
      inputDir,
      dryRun: options['dry-run'] ?? false,
      force: options.force ?? false,
    });

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(result);
    }

    if (mode === 'quiet') {
      return success(`${result.elementsImported}:${result.dependenciesImported}`);
    }

    // Human-readable output
    const isDryRun = options['dry-run'] ?? false;
    const actionWord = isDryRun ? 'Would import' : 'Imported';

    const lines: string[] = [
      isDryRun ? 'Dry run - no changes made' : 'Import completed',
      '',
      `Elements:`,
      `  ${actionWord}: ${result.elementsImported}`,
      `  Skipped:  ${result.elementsSkipped}`,
      '',
      `Dependencies:`,
      `  ${actionWord}: ${result.dependenciesImported}`,
      `  Skipped:  ${result.dependenciesSkipped}`,
    ];

    // Show conflicts if any
    if (result.conflicts.length > 0) {
      lines.push('');
      lines.push(`Conflicts resolved: ${result.conflicts.length}`);
      for (const conflict of result.conflicts.slice(0, 5)) {
        lines.push(`  ${conflict.elementId}: ${conflict.resolution}`);
      }
      if (result.conflicts.length > 5) {
        lines.push(`  ... and ${result.conflicts.length - 5} more`);
      }
    }

    // Show errors if any
    if (result.errors.length > 0) {
      lines.push('');
      lines.push(`Errors: ${result.errors.length}`);
      for (const err of result.errors.slice(0, 5)) {
        lines.push(`  ${err.file}:${err.line}: ${err.message}`);
      }
      if (result.errors.length > 5) {
        lines.push(`  ... and ${result.errors.length - 5} more`);
      }
    }

    return success(result, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Import failed: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const importCommand: Command = {
  name: 'import',
  description: 'Import elements from JSONL files',
  usage: 'sf import [options]',
  help: `Import elements and dependencies from JSONL files.

Uses Last-Write-Wins (LWW) merge strategy by default:
- Compares updatedAt timestamps
- Later timestamp wins
- Tags are merged (union)
- Closed status wins over open states

Options:
  -i, --input <dir>    Input directory (default: .stoneforge/sync)
  -n, --dry-run        Show what would change without importing
  -f, --force          Force import (remote always wins)

Expected files:
  elements.jsonl      Elements to import
  dependencies.jsonl  Dependencies to import

Examples:
  sf import
  sf import --dry-run
  sf import -i ./backup
  sf import --force`,
  options: importOptions,
  handler: importHandler as Command['handler'],
};

// ============================================================================
// Status Command
// ============================================================================

async function statusHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return failure(
      'No database found. Run "sf init" to initialize a workspace, or specify --db path',
      ExitCode.GENERAL_ERROR
    );
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);

    // Get dirty element count
    const dirtyElements = backend.getDirtyElements();
    const dirtyCount = dirtyElements.length;

    // Get total element count
    const totalResult = backend.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM elements WHERE deleted_at IS NULL'
    );
    const totalCount = totalResult?.count ?? 0;

    // Check sync directory
    const syncDir = join(process.cwd(), STONEFORGE_DIR, DEFAULT_SYNC_DIR);
    const syncDirExists = existsSync(syncDir);
    const elementsFileExists = syncDirExists && existsSync(join(syncDir, 'elements.jsonl'));
    const dependenciesFileExists = syncDirExists && existsSync(join(syncDir, 'dependencies.jsonl'));

    // Build status object
    const status = {
      dirtyElementCount: dirtyCount,
      totalElementCount: totalCount,
      hasPendingChanges: dirtyCount > 0,
      syncDirectory: syncDir,
      syncDirectoryExists: syncDirExists,
      elementsFileExists,
      dependenciesFileExists,
    };

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(status);
    }

    if (mode === 'quiet') {
      return success(String(dirtyCount));
    }

    // Human-readable output
    const lines: string[] = [
      'Sync Status',
      '',
      `Total elements:   ${totalCount}`,
      `Pending changes:  ${dirtyCount}`,
      '',
      `Sync directory:   ${syncDir}`,
      `  Directory:      ${syncDirExists ? 'exists' : 'not found'}`,
      `  elements.jsonl: ${elementsFileExists ? 'exists' : 'not found'}`,
      `  dependencies.jsonl: ${dependenciesFileExists ? 'exists' : 'not found'}`,
    ];

    if (dirtyCount > 0) {
      lines.push('');
      lines.push('Run "sf export" to export pending changes.');
    }

    return success(status, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get status: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const statusCommand: Command = {
  name: 'status',
  description: 'Show sync status',
  usage: 'sf status',
  help: `Show the current sync status.

Displays:
- Number of elements with pending changes (dirty)
- Total element count
- Sync directory status
- Whether sync files exist

Examples:
  sf status
  sf status --json`,
  options: [],
  handler: statusHandler as Command['handler'],
};

// ============================================================================
// Sync Parent Command (for subcommand structure)
// ============================================================================

export const syncCommand: Command = {
  name: 'sync',
  description: 'Sync commands (export, import, status)',
  usage: 'sf sync <command> [options]',
  help: `JSONL sync commands for version control integration.

Commands:
  export   Export elements to JSONL files
  import   Import elements from JSONL files
  status   Show sync status

Examples:
  sf sync export
  sf sync import --dry-run
  sf sync status`,
  subcommands: {
    export: exportCommand,
    import: importCommand,
    status: statusCommand,
  },
  handler: async (_args, options) => {
    // Show help if no subcommand specified
    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({
        commands: ['export', 'import', 'status'],
      });
    }
    return failure('Usage: sf sync <command>\n\nCommands: export, import, status\n\nRun "sf sync --help" for more information.', ExitCode.INVALID_ARGUMENTS);
  },
};
