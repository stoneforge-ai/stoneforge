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
  mkdirSync(TEST_STONEFORGE_DIR, { recursive: true });

  const backend = createStorage({ path: TEST_DB_PATH, create: true });
  initializeSchema(backend);
  const api = createQuarryAPI(backend);

  // Create default operator entity (same as `sf init`)
  const now = createTimestamp();
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
}
