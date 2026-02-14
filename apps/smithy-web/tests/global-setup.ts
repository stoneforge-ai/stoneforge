/**
 * Playwright globalSetup for test data seeding.
 *
 * Note: The .stoneforge-test directory and database schema are created by
 * setup-test-db.ts which runs before the webServer starts. This ensures
 * the DB exists before the server needs it.
 *
 * globalSetup focuses on seeding test data (e.g., the operator entity).
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '@stoneforge/quarry';
import { ElementType, createTimestamp, EntityTypeValue } from '@stoneforge/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const TEST_STONEFORGE_DIR = resolve(PROJECT_ROOT, '.stoneforge-test');
const TEST_DB_PATH = resolve(TEST_STONEFORGE_DIR, 'stoneforge.db');

export default async function globalSetup() {
  // Ensure directory exists (may already be created by setup-test-db.ts)
  mkdirSync(TEST_STONEFORGE_DIR, { recursive: true });

  // Connect to the database (schema may already be initialized by setup-test-db.ts)
  const backend = createStorage({ path: TEST_DB_PATH, create: true });
  initializeSchema(backend);
  const api = createQuarryAPI(backend);

  // Create default operator entity (same as `sf init`)
  // Use try-catch in case it already exists from a previous run
  const now = createTimestamp();
  try {
    await api.create({
      id: 'el-0000',
      type: ElementType.ENTITY,
      createdAt: now,
      updatedAt: now,
      createdBy: 'el-0000',
      tags: [],
      metadata: {},
      name: 'operator',
      entityType: EntityTypeValue.HUMAN,
    });
  } catch (error) {
    // Ignore if already exists - this can happen if reusing test DB
    const existing = await api.get('el-0000');
    if (!existing) {
      throw error;
    }
  }
}
