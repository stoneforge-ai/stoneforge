/**
 * Admin Commands Tests - doctor and migrate
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { doctorCommand, migrateCommand } from './admin.js';
import { createCommand } from './crud.js';
import { initCommand } from './init.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema, CURRENT_SCHEMA_VERSION } from '@stoneforge/storage';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_admin_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Doctor Command Tests
// ============================================================================

describe('doctor command', () => {
  test('reports error when no workspace exists', async () => {
    // Use a path that doesn't exist
    const options = createTestOptions({ db: undefined });
    // Change cwd temporarily by using a nonexistent .stoneforge
    rmSync(STONEFORGE_DIR, { recursive: true });

    // Point to a nonexistent database with --db
    const result = await doctorCommand.handler([], {
      ...options,
      db: join(TEST_DIR, 'nonexistent', 'test.db'),
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.data).toHaveProperty('healthy', false);
    expect(result.data.diagnostics).toBeInstanceOf(Array);
  });

  test('reports healthy for initialized database', async () => {
    // Initialize database with schema
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toHaveProperty('healthy', true);
    expect(result.message).toContain('System is healthy');
  });

  test('checks workspace exists', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const workspaceDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'workspace'
    );
    expect(workspaceDiag).toBeDefined();
    expect(workspaceDiag.status).toBe('ok');
  });

  test('checks database exists', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const dbDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'database'
    );
    expect(dbDiag).toBeDefined();
    expect(dbDiag.status).toBe('ok');
  });

  test('checks database connection', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const connDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'connection'
    );
    expect(connDiag).toBeDefined();
    expect(connDiag.status).toBe('ok');
  });

  test('checks schema version', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const schemaDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'schema_version'
    );
    expect(schemaDiag).toBeDefined();
    expect(schemaDiag.status).toBe('ok');
    expect(schemaDiag.message).toContain('up to date');
  });

  test('reports warning for outdated schema', async () => {
    // Create database with older schema version
    const backend = createStorage({ path: DB_PATH, create: true });
    // Initialize schema but then set an older version
    initializeSchema(backend);
    backend.setSchemaVersion(1);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const schemaDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'schema_version'
    );
    expect(schemaDiag).toBeDefined();
    expect(schemaDiag.status).toBe('warning');
    expect(schemaDiag.message).toContain('behind');
  });

  test('checks schema tables', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const tablesDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'schema_tables'
    );
    expect(tablesDiag).toBeDefined();
    expect(tablesDiag.status).toBe('ok');
    expect(tablesDiag.message).toContain('expected tables');
  });

  test('checks database integrity', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const integrityDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'integrity'
    );
    expect(integrityDiag).toBeDefined();
    expect(integrityDiag.status).toBe('ok');
    expect(integrityDiag.message).toContain('passed');
  });

  test('checks foreign key integrity', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const fkDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'foreign_keys'
    );
    expect(fkDiag).toBeDefined();
    expect(fkDiag.status).toBe('ok');
  });

  test('checks blocked cache - reports ok when empty and no blocked tasks', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const cacheDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'blocked_cache'
    );
    expect(cacheDiag).toBeDefined();
    expect(cacheDiag.status).toBe('ok');
  });

  test('checks blocked cache - reports warning when tasks have blocked status but no cache entry', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    // Create a task with status='blocked' but no blocked_cache entry
    // This simulates the state after an import without cache rebuild
    const taskId = 'el-test1';
    const taskData = {
      title: 'Test blocked task',
      status: 'blocked',
      priority: 2,
    };
    backend.run(
      `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
       VALUES (?, 'task', ?, datetime('now'), datetime('now'), 'test')`,
      [taskId, JSON.stringify(taskData)]
    );

    // Verify blocked_cache is empty
    const cacheCount = backend.query<{ count: number }>('SELECT COUNT(*) as count FROM blocked_cache');
    expect(cacheCount[0].count).toBe(0);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const cacheDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'blocked_cache'
    );
    expect(cacheDiag).toBeDefined();
    expect(cacheDiag.status).toBe('warning');
    expect(cacheDiag.message).toContain('inconsistent');
    expect(cacheDiag.message).toContain('blocked tasks missing from cache');
    expect(cacheDiag.details.missingCacheCount).toBe(1);
  });

  test('checks blocked cache - reports ok when tasks have blocked status with matching cache entry', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    // Create a blocker task (open)
    const blockerId = 'el-blocker';
    const blockerData = {
      title: 'Blocker task',
      status: 'open',
      priority: 2,
    };
    backend.run(
      `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
       VALUES (?, 'task', ?, datetime('now'), datetime('now'), 'test')`,
      [blockerId, JSON.stringify(blockerData)]
    );

    // Create a blocked task with matching cache entry
    const blockedId = 'el-blocked';
    const blockedData = {
      title: 'Blocked task',
      status: 'blocked',
      priority: 2,
    };
    backend.run(
      `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
       VALUES (?, 'task', ?, datetime('now'), datetime('now'), 'test')`,
      [blockedId, JSON.stringify(blockedData)]
    );

    // Add blocked_cache entry
    backend.run(
      `INSERT INTO blocked_cache (element_id, blocked_by, reason) VALUES (?, ?, ?)`,
      [blockedId, blockerId, 'Blocked by test']
    );

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const cacheDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'blocked_cache'
    );
    expect(cacheDiag).toBeDefined();
    expect(cacheDiag.status).toBe('ok');
    expect(cacheDiag.message).toBe('Blocked cache is consistent');
  });

  test('checks blocked cache - reports warning for orphaned cache entries', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    // Create an element so we can insert cache entry (FK constraint)
    const taskId = 'el-orphan';
    const taskData = {
      title: 'Test task',
      status: 'open',
      priority: 2,
    };
    backend.run(
      `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
       VALUES (?, 'task', ?, datetime('now'), datetime('now'), 'test')`,
      [taskId, JSON.stringify(taskData)]
    );

    // Add blocked_cache entry
    backend.run(
      `INSERT INTO blocked_cache (element_id, blocked_by, reason) VALUES (?, ?, ?)`,
      [taskId, 'el-nonexistent', 'Orphan test']
    );

    // Now delete the element to create an orphan (FK cascade should clean this up,
    // but let's verify the check works by disabling FK temporarily)
    backend.run('PRAGMA foreign_keys = OFF');
    backend.run('DELETE FROM elements WHERE id = ?', [taskId]);
    backend.run('PRAGMA foreign_keys = ON');

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const cacheDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'blocked_cache'
    );
    expect(cacheDiag).toBeDefined();
    expect(cacheDiag.status).toBe('warning');
    expect(cacheDiag.message).toContain('orphaned cache entries');
  });

  test('reports storage stats', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    const storageDiag = result.data.diagnostics.find(
      (d: { name: string }) => d.name === 'storage'
    );
    expect(storageDiag).toBeDefined();
    expect(storageDiag.status).toBe('ok');
    expect(storageDiag.message).toMatch(/Database size:/);
  });

  test('verbose mode shows details', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions({ verbose: true });
    const result = await doctorCommand.handler([], options);

    // Verbose output should include details
    expect(result.message).toBeDefined();
    // The detailed info about file size should be there
    expect(result.message).toContain('fileSize');
  });

  test('returns summary counts', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    expect(result.data.summary).toBeDefined();
    expect(result.data.summary).toHaveProperty('ok');
    expect(result.data.summary).toHaveProperty('warning');
    expect(result.data.summary).toHaveProperty('error');
    expect(result.data.summary.ok).toBeGreaterThan(0);
  });
});

// ============================================================================
// Migrate Command Tests
// ============================================================================

describe('migrate command', () => {
  test('reports when already up to date', async () => {
    // Initialize database with full schema
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await migrateCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('up to date');
    expect(result.data.migrationsApplied).toHaveLength(0);
  });

  test('fails when no database exists', async () => {
    const nonExistentPath = join(TEST_DIR, 'nonexistent', 'test.db');
    const options = createTestOptions({ db: nonExistentPath });
    const result = await migrateCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    // Error message depends on whether path is inaccessible
    expect(result.error).toBeDefined();
  });

  test('dry-run shows pending migrations without applying', async () => {
    // Create a database with schema version 1 (one behind current)
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    backend.setSchemaVersion(1);

    const options = createTestOptions({ dryRun: true } as GlobalOptions & { dryRun: boolean });
    const result = await migrateCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('dry run');
    expect((result.data as { pendingMigrations: unknown[] }).pendingMigrations).toBeDefined();
    expect((result.data as { pendingMigrations: unknown[] }).pendingMigrations.length).toBeGreaterThan(0);

    // Verify schema version didn't change
    const backend2 = createStorage({ path: DB_PATH, create: true });
    expect(backend2.getSchemaVersion()).toBe(1);
  });

  test('applies pending migrations', async () => {
    // Create a database with no schema
    const backend = createStorage({ path: DB_PATH, create: true });
    backend.setSchemaVersion(0);

    const options = createTestOptions();
    const result = await migrateCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Migration complete');
    expect(result.data.previousVersion).toBe(0);
    expect(result.data.currentVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.data.migrationsApplied.length).toBeGreaterThan(0);
  });

  test('shows migration descriptions', async () => {
    // Create a database with no schema
    const backend = createStorage({ path: DB_PATH, create: true });
    backend.setSchemaVersion(0);

    const options = createTestOptions();
    const result = await migrateCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Each migration should have a version and description
    for (const migration of result.data.migrationsApplied) {
      expect(migration).toHaveProperty('version');
      expect(migration).toHaveProperty('description');
      expect(typeof migration.version).toBe('number');
      expect(typeof migration.description).toBe('string');
    }
  });

  test('reports version numbers', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);

    const options = createTestOptions();
    const result = await migrateCommand.handler([], options);

    expect(result.data.previousVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.data.currentVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

// ============================================================================
// Command Structure Tests
// ============================================================================

describe('doctor command structure', () => {
  test('has correct name', () => {
    expect(doctorCommand.name).toBe('doctor');
  });

  test('has description', () => {
    expect(doctorCommand.description).toBeDefined();
    expect(doctorCommand.description.length).toBeGreaterThan(0);
  });

  test('has usage', () => {
    expect(doctorCommand.usage).toBeDefined();
    expect(doctorCommand.usage).toContain('doctor');
  });

  test('has help text', () => {
    expect(doctorCommand.help).toBeDefined();
    expect(doctorCommand.help).toContain('health');
  });
});

describe('migrate command structure', () => {
  test('has correct name', () => {
    expect(migrateCommand.name).toBe('migrate');
  });

  test('has description', () => {
    expect(migrateCommand.description).toBeDefined();
    expect(migrateCommand.description.length).toBeGreaterThan(0);
  });

  test('has usage', () => {
    expect(migrateCommand.usage).toBeDefined();
    expect(migrateCommand.usage).toContain('migrate');
  });

  test('has help text', () => {
    expect(migrateCommand.help).toBeDefined();
    expect(migrateCommand.help).toContain('migration');
  });

  test('has --dry-run option', () => {
    expect(migrateCommand.options).toBeDefined();
    const dryRunOption = migrateCommand.options!.find((o) => o.name === 'dry-run');
    expect(dryRunOption).toBeDefined();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('admin commands integration', () => {
  test('doctor reports warning when schema is outdated', async () => {
    // Create database with old schema version
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    backend.setSchemaVersion(1);

    const options = createTestOptions();
    const result = await doctorCommand.handler([], options);

    // Should report as warning (not error, since tables are present)
    expect(result.message).toContain('behind');
    expect((result.data as { summary: { warning: number } }).summary.warning).toBeGreaterThan(0);
  });

  test('migrate fixes schema issues reported by doctor', async () => {
    // Create database with no schema
    const backend = createStorage({ path: DB_PATH, create: true });
    backend.setSchemaVersion(0);

    // First doctor should report problems
    const doctorBefore = await doctorCommand.handler([], createTestOptions());
    expect(doctorBefore.exitCode).toBe(ExitCode.GENERAL_ERROR);

    // Run migrate
    const migrateResult = await migrateCommand.handler([], createTestOptions());
    expect(migrateResult.exitCode).toBe(ExitCode.SUCCESS);

    // Now doctor should be happy
    const doctorAfter = await doctorCommand.handler([], createTestOptions());
    expect(doctorAfter.exitCode).toBe(ExitCode.SUCCESS);
    expect(doctorAfter.data.healthy).toBe(true);
  });
});
