/**
 * Admin Commands - System health and maintenance operations
 *
 * Provides commands for:
 * - doctor: Check system health and diagnose issues
 * - migrate: Run database migrations
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { createStorage, type StorageBackend } from '@stoneforge/storage';
import {
  initializeSchema,
  getSchemaVersion,
  isSchemaUpToDate,
  getPendingMigrations,
  validateSchema,
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
} from '@stoneforge/storage';
import { resolveDatabasePath, STONEFORGE_DIR, DEFAULT_DB_NAME } from '../db.js';

// ============================================================================
// Doctor Command
// ============================================================================

interface DiagnosticResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

interface DoctorResult {
  healthy: boolean;
  diagnostics: DiagnosticResult[];
  summary: {
    ok: number;
    warning: number;
    error: number;
  };
}

async function doctorHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const diagnostics: DiagnosticResult[] = [];

  // 1. Check workspace exists
  const stoneforgeDir = join(process.cwd(), STONEFORGE_DIR);
  const workspaceExists = existsSync(stoneforgeDir);

  if (!workspaceExists && !options.db) {
    diagnostics.push({
      name: 'workspace',
      status: 'error',
      message: 'No .stoneforge directory found',
      details: { path: stoneforgeDir },
    });
    return buildDoctorResult(diagnostics, options);
  }

  diagnostics.push({
    name: 'workspace',
    status: 'ok',
    message: options.db ? `Using custom database path: ${options.db}` : `Workspace found at ${stoneforgeDir}`,
  });

  // 2. Check database file exists
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    diagnostics.push({
      name: 'database',
      status: 'error',
      message: 'Database file not found',
      details: { expectedPath: join(stoneforgeDir, DEFAULT_DB_NAME) },
    });
    return buildDoctorResult(diagnostics, options);
  }

  diagnostics.push({
    name: 'database',
    status: 'ok',
    message: `Database found at ${dbPath}`,
  });

  // 3. Check database can be opened
  let backend: StorageBackend;
  try {
    // Use create: true to allow opening existing databases without error
    // This doesn't create a new database, just allows opening existing ones
    backend = createStorage({ path: dbPath, create: true });
    diagnostics.push({
      name: 'connection',
      status: 'ok',
      message: 'Database connection successful',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      name: 'connection',
      status: 'error',
      message: `Failed to open database: ${message}`,
    });
    return buildDoctorResult(diagnostics, options);
  }

  // 4. Check schema version
  const schemaVersion = getSchemaVersion(backend);
  const schemaUpToDate = isSchemaUpToDate(backend);

  if (schemaVersion === 0) {
    diagnostics.push({
      name: 'schema_version',
      status: 'error',
      message: 'Database schema not initialized',
      details: { currentVersion: 0, expectedVersion: CURRENT_SCHEMA_VERSION },
    });
  } else if (!schemaUpToDate) {
    const pendingMigrations = getPendingMigrations(backend);
    diagnostics.push({
      name: 'schema_version',
      status: 'warning',
      message: `Schema version ${schemaVersion} is behind (current: ${CURRENT_SCHEMA_VERSION})`,
      details: {
        currentVersion: schemaVersion,
        expectedVersion: CURRENT_SCHEMA_VERSION,
        pendingMigrations: pendingMigrations.map((m) => ({
          version: m.version,
          description: m.description,
        })),
      },
    });
  } else {
    diagnostics.push({
      name: 'schema_version',
      status: 'ok',
      message: `Schema is at version ${schemaVersion} (up to date)`,
    });
  }

  // 5. Validate schema tables
  const schemaValidation = validateSchema(backend);

  if (!schemaValidation.valid) {
    diagnostics.push({
      name: 'schema_tables',
      status: 'error',
      message: `Missing tables: ${schemaValidation.missingTables.join(', ')}`,
      details: {
        missingTables: schemaValidation.missingTables,
        extraTables: schemaValidation.extraTables,
      },
    });
  } else {
    diagnostics.push({
      name: 'schema_tables',
      status: 'ok',
      message: 'All expected tables present',
      details: schemaValidation.extraTables.length > 0
        ? { extraTables: schemaValidation.extraTables }
        : undefined,
    });
  }

  // 6. Check database integrity
  try {
    const integrityResult = backend.query<{ integrity_check: string }>(
      'PRAGMA integrity_check'
    );

    if (integrityResult.length === 1 && integrityResult[0].integrity_check === 'ok') {
      diagnostics.push({
        name: 'integrity',
        status: 'ok',
        message: 'Database integrity check passed',
      });
    } else {
      diagnostics.push({
        name: 'integrity',
        status: 'error',
        message: 'Database integrity check failed',
        details: { issues: integrityResult.map((r) => r.integrity_check) },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      name: 'integrity',
      status: 'error',
      message: `Integrity check failed: ${message}`,
    });
  }

  // 7. Check foreign key integrity
  try {
    const fkResult = backend.query<{
      table: string;
      rowid: number;
      parent: string;
      fkid: number;
    }>('PRAGMA foreign_key_check');

    if (fkResult.length === 0) {
      diagnostics.push({
        name: 'foreign_keys',
        status: 'ok',
        message: 'Foreign key constraints satisfied',
      });
    } else {
      diagnostics.push({
        name: 'foreign_keys',
        status: 'warning',
        message: `${fkResult.length} foreign key violations found`,
        details: {
          violations: fkResult.slice(0, 10).map((r) => ({
            table: r.table,
            rowid: r.rowid,
            parent: r.parent,
          })),
          totalViolations: fkResult.length,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      name: 'foreign_keys',
      status: 'warning',
      message: `Foreign key check failed: ${message}`,
    });
  }

  // 8. Check blocked cache consistency
  try {
    // Check 1: Orphaned entries - cache entries referencing elements that don't exist
    const orphanedCache = backend.query<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM blocked_cache bc
      LEFT JOIN elements e ON bc.element_id = e.id
      WHERE e.id IS NULL
    `);

    // Check 2: Tasks with status='blocked' but no blocked_cache entry
    // These are tasks that have blocked status but the cache doesn't know about them
    const tasksWithBlockedStatusMissingCache = backend.query<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM elements e
      WHERE e.deleted_at IS NULL
        AND e.type = 'task'
        AND json_extract(e.data, '$.status') = 'blocked'
        AND e.id NOT IN (SELECT element_id FROM blocked_cache)
    `);

    // Check 3: Get total counts for diagnostics
    const blockedCacheCount = backend.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM blocked_cache'
    );
    const blockedStatusCount = backend.query<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM elements e
      WHERE e.deleted_at IS NULL
        AND e.type = 'task'
        AND json_extract(e.data, '$.status') = 'blocked'
    `);

    const orphanCount = orphanedCache[0].count;
    const missingCacheCount = tasksWithBlockedStatusMissingCache[0].count;
    const cacheEntries = blockedCacheCount[0].count;
    const tasksWithBlockedStatus = blockedStatusCount[0].count;

    if (orphanCount === 0 && missingCacheCount === 0) {
      diagnostics.push({
        name: 'blocked_cache',
        status: 'ok',
        message: 'Blocked cache is consistent',
        details: options.verbose ? { cacheEntries, tasksWithBlockedStatus } : undefined,
      });
    } else {
      const issues: string[] = [];
      const details: Record<string, unknown> = { cacheEntries, tasksWithBlockedStatus };

      if (orphanCount > 0) {
        issues.push(`${orphanCount} orphaned cache entries`);
        details.orphanedCount = orphanCount;
      }

      if (missingCacheCount > 0) {
        issues.push(`${missingCacheCount} blocked tasks missing from cache`);
        details.missingCacheCount = missingCacheCount;
      }

      diagnostics.push({
        name: 'blocked_cache',
        status: 'warning',
        message: `Blocked cache inconsistent: ${issues.join(', ')}. Cache may need rebuild.`,
        details,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      name: 'blocked_cache',
      status: 'warning',
      message: `Blocked cache check failed: ${message}`,
    });
  }

  // 9. Check database statistics
  try {
    const stats = backend.getStats();
    diagnostics.push({
      name: 'storage',
      status: 'ok',
      message: `Database size: ${formatBytes(stats.fileSize)}`,
      details: { fileSize: stats.fileSize },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      name: 'storage',
      status: 'warning',
      message: `Could not get storage stats: ${message}`,
    });
  }

  return buildDoctorResult(diagnostics, options);
}

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

/**
 * Build the doctor result from diagnostics
 */
function buildDoctorResult(
  diagnostics: DiagnosticResult[],
  options: GlobalOptions
): CommandResult {
  const summary = {
    ok: diagnostics.filter((d) => d.status === 'ok').length,
    warning: diagnostics.filter((d) => d.status === 'warning').length,
    error: diagnostics.filter((d) => d.status === 'error').length,
  };

  const healthy = summary.error === 0;

  const result: DoctorResult = {
    healthy,
    diagnostics,
    summary,
  };

  // Build human-readable output
  const lines: string[] = [];
  lines.push('System Health Check');
  lines.push('');

  for (const diag of diagnostics) {
    const statusIcon = diag.status === 'ok' ? '[OK]' : diag.status === 'warning' ? '[WARN]' : '[ERROR]';
    lines.push(`${statusIcon} ${diag.name}: ${diag.message}`);
    if (options.verbose && diag.details) {
      for (const [key, value] of Object.entries(diag.details)) {
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        lines.push(`     ${key}: ${valueStr}`);
      }
    }
  }

  lines.push('');
  lines.push(`Summary: ${summary.ok} ok, ${summary.warning} warnings, ${summary.error} errors`);

  if (healthy) {
    lines.push('');
    lines.push('System is healthy.');
  } else {
    lines.push('');
    lines.push('Issues detected. Run "sf migrate" to fix schema issues.');
  }

  return {
    exitCode: healthy ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    data: result,
    message: lines.join('\n'),
  };
}

// ============================================================================
// Migrate Command
// ============================================================================

interface MigrateResult {
  previousVersion: number;
  currentVersion: number;
  migrationsApplied: Array<{
    version: number;
    description: string;
  }>;
}

async function migrateHandler(
  _args: string[],
  options: GlobalOptions & { dryRun?: boolean }
): Promise<CommandResult> {
  // Check if database path can be resolved
  const dbPath = resolveDatabasePath(options, false);

  if (!dbPath) {
    return failure(
      'No database found. Run "sf init" to initialize a workspace, or specify --db path',
      ExitCode.GENERAL_ERROR
    );
  }

  // For dry-run, we need the database to exist
  if (options.dryRun && !existsSync(dbPath)) {
    return failure(
      'No database found. Run "sf init" to initialize a workspace, or specify --db path',
      ExitCode.GENERAL_ERROR
    );
  }

  // Open database
  let backend: StorageBackend;
  try {
    backend = createStorage({ path: dbPath, create: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to open database: ${message}`, ExitCode.GENERAL_ERROR);
  }

  const previousVersion = getSchemaVersion(backend);
  const pendingMigrations = getPendingMigrations(backend);

  if (pendingMigrations.length === 0) {
    return success(
      {
        previousVersion,
        currentVersion: previousVersion,
        migrationsApplied: [],
      },
      `Database is already at version ${previousVersion} (up to date)`
    );
  }

  // Dry run: just show what would be done
  if (options.dryRun) {
    const lines: string[] = [];
    lines.push('Migrations to apply (dry run):');
    lines.push('');
    for (const migration of pendingMigrations) {
      lines.push(`  v${migration.version}: ${migration.description}`);
    }
    lines.push('');
    lines.push(`Run "sf migrate" without --dry-run to apply these migrations.`);

    return success(
      {
        previousVersion,
        currentVersion: previousVersion,
        pendingMigrations: pendingMigrations.map((m) => ({
          version: m.version,
          description: m.description,
        })),
      },
      lines.join('\n')
    );
  }

  // Apply migrations
  try {
    const result = initializeSchema(backend);
    const currentVersion = getSchemaVersion(backend);

    const migrationsApplied = result.applied.map((version) => {
      const migration = MIGRATIONS.find((m) => m.version === version);
      return {
        version,
        description: migration?.description ?? 'Unknown migration',
      };
    });

    const lines: string[] = [];
    lines.push('Migration complete');
    lines.push('');
    lines.push(`Previous version: ${previousVersion}`);
    lines.push(`Current version: ${currentVersion}`);
    lines.push('');

    if (migrationsApplied.length > 0) {
      lines.push('Migrations applied:');
      for (const m of migrationsApplied) {
        lines.push(`  v${m.version}: ${m.description}`);
      }
    }

    return success(
      {
        previousVersion,
        currentVersion,
        migrationsApplied,
      } satisfies MigrateResult,
      lines.join('\n')
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Migration failed: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definitions
// ============================================================================

export const doctorCommand: Command = {
  name: 'doctor',
  description: 'Check system health and diagnose issues',
  usage: 'sf doctor',
  help: `Check system health and diagnose issues.

Performs the following checks:
- Workspace exists (.stoneforge directory)
- Database file exists and can be opened
- Schema version is current
- All expected tables are present
- Database integrity check (PRAGMA integrity_check)
- Foreign key constraint validation
- Blocked cache consistency
- Storage statistics

Use --verbose to see detailed diagnostic information.

Examples:
  sf doctor              Run all diagnostics
  sf doctor --verbose    Show detailed information
  sf doctor --json       Output as JSON`,
  handler: doctorHandler,
};

export const migrateCommand: Command = {
  name: 'migrate',
  description: 'Run database migrations',
  usage: 'sf migrate [--dry-run]',
  help: `Run database migrations to update the schema.

Migrations are run automatically when needed, but this command can be used to:
- Check what migrations would be applied (--dry-run)
- Manually trigger migration
- Verify migration status

Options:
  --dry-run    Show what migrations would be applied without running them

Examples:
  sf migrate             Run pending migrations
  sf migrate --dry-run   Preview migrations without applying`,
  options: [
    {
      name: 'dry-run',
      description: 'Show what would be done without making changes',
      hasValue: false,
    },
  ],
  handler: migrateHandler,
};
