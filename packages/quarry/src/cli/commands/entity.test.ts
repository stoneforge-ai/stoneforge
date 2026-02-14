/**
 * Entity Command Tests
 *
 * Tests for entity register and list CLI commands.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { entityCommand, entityRegisterCommand, entityListCommand } from './entity.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_entity_workspace__');
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

  // Initialize database
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Entity Register Tests
// ============================================================================

describe('entity register command', () => {
  test('fails without name argument', async () => {
    const options = createTestOptions();
    const result = await entityRegisterCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('registers an agent entity by default', async () => {
    const options = createTestOptions();
    const result = await entityRegisterCommand.handler!(['test-agent'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as { name: string }).name).toBe('test-agent');
    expect((result.data as { entityType: string }).entityType).toBe('agent');
    expect((result.data as { id: string }).id).toMatch(/^el-/);
  });

  test('registers a human entity with --type', async () => {
    const options = createTestOptions({ type: 'human' } as GlobalOptions & { type: string });
    const result = await entityRegisterCommand.handler!(['alice'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { name: string }).name).toBe('alice');
    expect((result.data as { entityType: string }).entityType).toBe('human');
  });

  test('registers a system entity with --type', async () => {
    const options = createTestOptions({ type: 'system' } as GlobalOptions & { type: string });
    const result = await entityRegisterCommand.handler!(['ci-system'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { name: string }).name).toBe('ci-system');
    expect((result.data as { entityType: string }).entityType).toBe('system');
  });

  test('fails with invalid entity type', async () => {
    const options = createTestOptions({ type: 'invalid' } as GlobalOptions & { type: string });
    const result = await entityRegisterCommand.handler!(['test'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid entity type');
    expect(result.error).toContain('agent');
    expect(result.error).toContain('human');
    expect(result.error).toContain('system');
  });

  test('fails with invalid name format', async () => {
    const options = createTestOptions();
    const result = await entityRegisterCommand.handler!(['_invalid'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Validation error');
  });

  test('fails with reserved name', async () => {
    const options = createTestOptions();
    const result = await entityRegisterCommand.handler!(['system'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('reserved');
  });

  test('fails with duplicate name', async () => {
    const options = createTestOptions();

    // Register first entity
    await entityRegisterCommand.handler!(['test-entity'], options);

    // Try to register with same name
    const result = await entityRegisterCommand.handler!(['test-entity'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('already exists');
  });

  test('registers entity with tags', async () => {
    const options = createTestOptions({ tag: ['team-alpha', 'frontend'] } as GlobalOptions & { tag: string[] });
    const result = await entityRegisterCommand.handler!(['tagged-entity'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { tags: string[] }).tags).toEqual(['team-alpha', 'frontend']);
  });

  test('registers entity with public key', async () => {
    const validKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const options = createTestOptions({ 'public-key': validKey } as GlobalOptions & { 'public-key': string });
    const result = await entityRegisterCommand.handler!(['crypto-entity'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { publicKey: string }).publicKey).toBe(validKey);
  });

  test('rejects invalid public key - too short', async () => {
    const options = createTestOptions({ 'public-key': 'abc' } as GlobalOptions & { 'public-key': string });
    const result = await entityRegisterCommand.handler!(['invalid-key-entity'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid public key format');
  });

  test('rejects invalid public key - not base64', async () => {
    const options = createTestOptions({ 'public-key': 'invalid-key-not-base64!!!' } as GlobalOptions & { 'public-key': string });
    const result = await entityRegisterCommand.handler!(['invalid-key-entity2'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid public key format');
  });

  test('rejects empty public key', async () => {
    const options = createTestOptions({ 'public-key': '' } as GlobalOptions & { 'public-key': string });
    const result = await entityRegisterCommand.handler!(['empty-key-entity'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid public key format');
  });

  test('rejects public key with wrong length - too long', async () => {
    // 45 characters instead of 44
    const options = createTestOptions({ 'public-key': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' } as GlobalOptions & { 'public-key': string });
    const result = await entityRegisterCommand.handler!(['long-key-entity'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid public key format');
  });

  test('rejects public key without proper base64 padding', async () => {
    // Missing the trailing '=' that makes it 44 chars
    const options = createTestOptions({ 'public-key': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } as GlobalOptions & { 'public-key': string });
    const result = await entityRegisterCommand.handler!(['nopad-key-entity'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid public key format');
  });

  test('outputs JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await entityRegisterCommand.handler!(['json-entity'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('object');
  });

  test('outputs only ID in quiet mode', async () => {
    const options = createTestOptions({ quiet: true });
    const result = await entityRegisterCommand.handler!(['quiet-entity'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toMatch(/^el-/);
  });

  test('fails when database parent directory does not exist', async () => {
    const nonExistentPath = join(TEST_DIR, 'nonexistent', 'test.db');
    const options = createTestOptions({ db: nonExistentPath });
    const result = await entityRegisterCommand.handler!(['test'], options);

    // SQLite can't create a database if the parent directory doesn't exist
    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });
});

// ============================================================================
// Entity List Tests
// ============================================================================

describe('entity list command', () => {
  test('returns empty list when no entities exist', async () => {
    const options = createTestOptions();
    const result = await entityListCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual([]);
    expect(result.message).toContain('No entities found');
  });

  test('lists registered entities', async () => {
    const options = createTestOptions();

    // Register some entities
    await entityRegisterCommand.handler!(['entity-1'], options);
    await entityRegisterCommand.handler!(['entity-2'], { ...options, type: 'human' } as GlobalOptions & { type: string });
    await entityRegisterCommand.handler!(['entity-3'], { ...options, type: 'system' } as GlobalOptions & { type: string });

    // List entities
    const result = await entityListCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(3);
  });

  test('filters by entity type', async () => {
    const options = createTestOptions();

    // Register entities of different types
    await entityRegisterCommand.handler!(['agent-1'], options);
    await entityRegisterCommand.handler!(['agent-2'], options);
    await entityRegisterCommand.handler!(['human-1'], { ...options, type: 'human' } as GlobalOptions & { type: string });

    // List only agents
    const result = await entityListCommand.handler!([], { ...options, type: 'agent' } as GlobalOptions & { type: string });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(2);
    for (const entity of result.data as { entityType: string }[]) {
      expect(entity.entityType).toBe('agent');
    }
  });

  test('respects limit option', async () => {
    const options = createTestOptions();

    // Register several entities
    await entityRegisterCommand.handler!(['entity-1'], options);
    await entityRegisterCommand.handler!(['entity-2'], options);
    await entityRegisterCommand.handler!(['entity-3'], options);

    // List with limit
    const result = await entityListCommand.handler!([], { ...options, limit: 2 } as GlobalOptions & { limit: number });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('outputs JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    await entityRegisterCommand.handler!(['test-entity'], options);

    const result = await entityListCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('outputs only IDs in quiet mode', async () => {
    const options = createTestOptions();
    await entityRegisterCommand.handler!(['quiet-test'], options);

    const result = await entityListCommand.handler!([], { ...options, quiet: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });

  test('succeeds with explicit database path', async () => {
    const newDbDir = join(TEST_DIR, 'new-db');
    const newPath = join(newDbDir, 'test.db');
    // Create parent directory so SQLite can create the database
    mkdirSync(newDbDir, { recursive: true });
    const options = createTestOptions({ db: newPath });
    const result = await entityListCommand.handler!([], options);

    // With explicit db path (parent directory exists), should create and return empty list
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual([]);
  });
});

// ============================================================================
// Entity Parent Command Tests
// ============================================================================

describe('entity command', () => {
  test('has correct name', () => {
    expect(entityCommand.name).toBe('entity');
  });

  test('has description', () => {
    expect(entityCommand.description).toBeDefined();
    expect(entityCommand.description.length).toBeGreaterThan(0);
  });

  test('has usage', () => {
    expect(entityCommand.usage).toBeDefined();
    expect(entityCommand.usage).toContain('entity');
  });

  test('has help text', () => {
    expect(entityCommand.help).toBeDefined();
    expect(entityCommand.help).toContain('Manage');
  });

  test('has register subcommand', () => {
    expect(entityCommand.subcommands).toBeDefined();
    expect(entityCommand.subcommands!.register).toBeDefined();
    expect(entityCommand.subcommands!.register.name).toBe('register');
  });

  test('has list subcommand', () => {
    expect(entityCommand.subcommands).toBeDefined();
    expect(entityCommand.subcommands!.list).toBeDefined();
    expect(entityCommand.subcommands!.list.name).toBe('list');
  });

  test('defaults to list when no subcommand', async () => {
    const options = createTestOptions();
    await entityRegisterCommand.handler!(['test-entity'], options);

    const result = await entityCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

// ============================================================================
// Register Command Structure Tests
// ============================================================================

describe('entity register command structure', () => {
  test('has correct name', () => {
    expect(entityRegisterCommand.name).toBe('register');
  });

  test('has description', () => {
    expect(entityRegisterCommand.description).toBeDefined();
  });

  test('has usage', () => {
    expect(entityRegisterCommand.usage).toContain('register');
  });

  test('has help text', () => {
    expect(entityRegisterCommand.help).toBeDefined();
    expect(entityRegisterCommand.help).toContain('Register');
  });

  test('has --type option', () => {
    expect(entityRegisterCommand.options).toBeDefined();
    const typeOption = entityRegisterCommand.options!.find((o) => o.name === 'type');
    expect(typeOption).toBeDefined();
    expect(typeOption!.short).toBe('t');
  });

  test('has --public-key option', () => {
    const keyOption = entityRegisterCommand.options!.find((o) => o.name === 'public-key');
    expect(keyOption).toBeDefined();
  });

  test('has --tag option', () => {
    const tagOption = entityRegisterCommand.options!.find((o) => o.name === 'tag');
    expect(tagOption).toBeDefined();
  });
});

// ============================================================================
// List Command Structure Tests
// ============================================================================

describe('entity list command structure', () => {
  test('has correct name', () => {
    expect(entityListCommand.name).toBe('list');
  });

  test('has description', () => {
    expect(entityListCommand.description).toBeDefined();
  });

  test('has usage', () => {
    expect(entityListCommand.usage).toContain('list');
  });

  test('has help text', () => {
    expect(entityListCommand.help).toBeDefined();
    expect(entityListCommand.help).toContain('List');
  });

  test('has --type option', () => {
    expect(entityListCommand.options).toBeDefined();
    const typeOption = entityListCommand.options!.find((o) => o.name === 'type');
    expect(typeOption).toBeDefined();
    expect(typeOption!.short).toBe('t');
  });

  test('has --limit option', () => {
    const limitOption = entityListCommand.options!.find((o) => o.name === 'limit');
    expect(limitOption).toBeDefined();
    expect(limitOption!.short).toBe('l');
  });
});

// ============================================================================
// Entity Lifecycle E2E Tests
// ============================================================================

import { createQuarryAPI } from '../../api/quarry-api.js';
import type { Entity } from '@stoneforge/core';
import {
  updateEntity,
  deactivateEntity,
  reactivateEntity,
  isEntityActive,
  isEntityDeactivated,
  getDeactivationDetails,
  filterActiveEntities,
  filterDeactivatedEntities,
} from '@stoneforge/core';
import type { ElementId, EntityId } from '@stoneforge/core';

// Helper to create API instance for direct manipulation
function createTestAPI() {
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  return { api: createQuarryAPI(backend), backend };
}

// Helper to register an entity via CLI and return it
async function registerEntity(
  name: string,
  options: Partial<GlobalOptions> & { type?: string; 'public-key'?: string; tag?: string[] } = {}
): Promise<Entity> {
  const fullOptions = createTestOptions(options as Partial<GlobalOptions>) as GlobalOptions & { type?: string; 'public-key'?: string; tag?: string[] };
  if (options.type) fullOptions.type = options.type;
  if (options['public-key']) fullOptions['public-key'] = options['public-key'];
  if (options.tag) fullOptions.tag = options.tag;

  const result = await entityRegisterCommand.handler!([name], fullOptions);
  if (result.exitCode !== ExitCode.SUCCESS) {
    throw new Error(`Failed to register entity: ${result.error}`);
  }
  return result.data as Entity;
}

describe('entity lifecycle E2E scenarios', () => {
  test('complete entity lifecycle: register → update → list → verify', async () => {
    // 1. Register a new agent entity
    const entity = await registerEntity('lifecycle-agent', { type: 'agent', tag: ['v1'] });
    expect(entity.name).toBe('lifecycle-agent');
    expect(entity.entityType).toBe('agent');
    expect(entity.tags).toContain('v1');

    // 2. Update entity via API (update tags and metadata)
    const { api, backend } = createTestAPI();
    const retrieved = await api.get<Entity>(entity.id as ElementId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('lifecycle-agent');

    const updated = updateEntity(retrieved!, {
      tags: ['v1', 'updated'],
      metadata: { displayName: 'Lifecycle Agent V1' },
    });
    await api.update<Entity>(entity.id as ElementId, updated);
    backend.close();

    // 3. Verify via list command
    const listOptions = createTestOptions({ json: true });
    const listResult = await entityListCommand.handler!([], listOptions);
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const entities = listResult.data as Entity[];
    const found = entities.find((e) => e.name === 'lifecycle-agent');
    expect(found).toBeDefined();
    expect(found!.tags).toContain('updated');
    expect(found!.metadata.displayName).toBe('Lifecycle Agent V1');
  });

  test('entity with cryptographic identity lifecycle', async () => {
    const validPublicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

    // 1. Register entity with public key
    const entity = await registerEntity('crypto-agent', { 'public-key': validPublicKey });
    expect(entity.publicKey).toBe(validPublicKey);

    // 2. Verify entity shows up with public key
    const listOptions = createTestOptions({ json: true });
    const listResult = await entityListCommand.handler!([], listOptions);
    const entities = listResult.data as Entity[];
    const found = entities.find((e) => e.name === 'crypto-agent');
    expect(found).toBeDefined();
    expect(found!.publicKey).toBe(validPublicKey);

    // 3. Update public key (key rotation)
    const newPublicKey = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=';
    const { api, backend } = createTestAPI();
    const retrieved = await api.get<Entity>(entity.id as ElementId);
    const updated = updateEntity(retrieved!, { publicKey: newPublicKey });
    await api.update<Entity>(entity.id as ElementId, updated);
    backend.close();

    // 4. Verify key was updated
    const { api: api2, backend: backend2 } = createTestAPI();
    const refreshed = await api2.get<Entity>(entity.id as ElementId);
    expect(refreshed!.publicKey).toBe(newPublicKey);
    backend2.close();
  });

  test('entity deactivation and reactivation lifecycle', async () => {
    // 1. Register an entity
    const entity = await registerEntity('deactivate-test', { type: 'human' });
    expect(isEntityActive(entity)).toBe(true);

    // 2. Deactivate the entity
    const { api, backend } = createTestAPI();
    let retrieved = await api.get<Entity>(entity.id as ElementId);
    const deactivated = deactivateEntity(retrieved!, {
      deactivatedBy: 'el-admin' as EntityId,
      reason: 'User left the organization',
    });
    await api.update<Entity>(entity.id as ElementId, deactivated);
    backend.close();

    // 3. Verify entity is deactivated
    const { api: api2, backend: backend2 } = createTestAPI();
    retrieved = await api2.get<Entity>(entity.id as ElementId);
    expect(isEntityDeactivated(retrieved!)).toBe(true);
    expect(isEntityActive(retrieved!)).toBe(false);

    const details = getDeactivationDetails(retrieved!);
    expect(details).not.toBeNull();
    expect(details!.deactivatedBy).toBe('el-admin');
    expect(details!.reason).toBe('User left the organization');
    backend2.close();

    // 4. List should still show the entity (but we can filter it)
    const listResult = await entityListCommand.handler!([], createTestOptions({ json: true }));
    const allEntities = listResult.data as Entity[];
    const activeOnly = filterActiveEntities(allEntities);
    const deactivatedOnly = filterDeactivatedEntities(allEntities);

    // The deactivated entity should be in deactivatedOnly, not in activeOnly
    expect(deactivatedOnly.some((e) => e.name === 'deactivate-test')).toBe(true);
    expect(activeOnly.some((e) => e.name === 'deactivate-test')).toBe(false);

    // 5. Reactivate the entity
    const { api: api3, backend: backend3 } = createTestAPI();
    retrieved = await api3.get<Entity>(entity.id as ElementId);
    const reactivated = reactivateEntity(retrieved!, 'el-admin' as EntityId);
    await api3.update<Entity>(entity.id as ElementId, reactivated);
    backend3.close();

    // 6. Verify entity is active again
    const { api: api4, backend: backend4 } = createTestAPI();
    const final = await api4.get<Entity>(entity.id as ElementId);
    expect(isEntityActive(final!)).toBe(true);
    expect(isEntityDeactivated(final!)).toBe(false);
    expect(final!.metadata.reactivatedBy).toBe('el-admin');
    backend4.close();
  });

  test('multiple entities with different types lifecycle', async () => {
    // 1. Register entities of each type
    const agent = await registerEntity('multi-agent', { type: 'agent' });
    const human = await registerEntity('multi-human', { type: 'human' });
    const system = await registerEntity('multi-system', { type: 'system' });

    expect(agent.entityType).toBe('agent');
    expect(human.entityType).toBe('human');
    expect(system.entityType).toBe('system');

    // 2. List and filter by type
    const agentList = await entityListCommand.handler!(
      [],
      createTestOptions({ type: 'agent', json: true }) as GlobalOptions & { type: string }
    );
    expect((agentList.data as Entity[]).some((e) => e.name === 'multi-agent')).toBe(true);
    expect((agentList.data as Entity[]).some((e) => e.name === 'multi-human')).toBe(false);

    const humanList = await entityListCommand.handler!(
      [],
      createTestOptions({ type: 'human', json: true }) as GlobalOptions & { type: string }
    );
    expect((humanList.data as Entity[]).some((e) => e.name === 'multi-human')).toBe(true);

    // 3. Update each entity with type-specific metadata
    const { api, backend } = createTestAPI();
    const agentRetrieved = await api.get<Entity>(agent.id as ElementId);
    const agentUpdated = updateEntity(agentRetrieved!, {
      metadata: { model: 'claude-3-opus', capabilities: ['coding', 'analysis'] },
    });
    await api.update<Entity>(agent.id as ElementId, agentUpdated);

    const humanRetrieved = await api.get<Entity>(human.id as ElementId);
    const humanUpdated = updateEntity(humanRetrieved!, {
      metadata: { email: 'test@example.com', timezone: 'America/New_York' },
    });
    await api.update<Entity>(human.id as ElementId, humanUpdated);

    const systemRetrieved = await api.get<Entity>(system.id as ElementId);
    const systemUpdated = updateEntity(systemRetrieved!, {
      metadata: { serviceName: 'ci-pipeline', version: '1.0.0' },
    });
    await api.update<Entity>(system.id as ElementId, systemUpdated);
    backend.close();

    // 4. Verify metadata persists
    const { api: api2, backend: backend2 } = createTestAPI();
    const agentFinal = await api2.get<Entity>(agent.id as ElementId);
    expect(agentFinal!.metadata.model).toBe('claude-3-opus');
    expect(agentFinal!.metadata.capabilities).toEqual(['coding', 'analysis']);

    const humanFinal = await api2.get<Entity>(human.id as ElementId);
    expect(humanFinal!.metadata.email).toBe('test@example.com');

    const systemFinal = await api2.get<Entity>(system.id as ElementId);
    expect(systemFinal!.metadata.serviceName).toBe('ci-pipeline');
    backend2.close();
  });

  test('entity persistence across database connections', async () => {
    // 1. Register an entity
    const entity = await registerEntity('persistent-entity', {
      type: 'agent',
      tag: ['persistent'],
    });
    const entityId = entity.id as ElementId;

    // 2. Update via API
    const { api: api1, backend: backend1 } = createTestAPI();
    const retrieved = await api1.get<Entity>(entityId);
    const updated = updateEntity(retrieved!, {
      tags: ['persistent', 'updated'],
      metadata: { updateCount: 1 },
    });
    await api1.update<Entity>(entityId, updated);
    backend1.close();

    // 3. Reconnect and verify data persists
    const { api: api2, backend: backend2 } = createTestAPI();
    const persisted = await api2.get<Entity>(entityId);
    expect(persisted).toBeDefined();
    expect(persisted!.name).toBe('persistent-entity');
    expect(persisted!.tags).toContain('updated');
    expect(persisted!.metadata.updateCount).toBe(1);
    backend2.close();

    // 4. Make another update
    const { api: api3, backend: backend3 } = createTestAPI();
    const retrieved2 = await api3.get<Entity>(entityId);
    const updated2 = updateEntity(retrieved2!, {
      metadata: { updateCount: 2, lastUpdated: 'now' },
    });
    await api3.update<Entity>(entityId, updated2);
    backend3.close();

    // 5. Final verification
    const { api: api4, backend: backend4 } = createTestAPI();
    const final = await api4.get<Entity>(entityId);
    expect(final!.metadata.updateCount).toBe(2);
    expect(final!.metadata.lastUpdated).toBe('now');
    backend4.close();
  });

  test('entity tag management lifecycle', async () => {
    // 1. Create entity with initial tags
    const entity = await registerEntity('tagged-lifecycle', { tag: ['initial', 'test'] });
    expect(entity.tags).toEqual(['initial', 'test']);

    // 2. Update tags - replace entirely
    const { api, backend } = createTestAPI();
    let retrieved = await api.get<Entity>(entity.id as ElementId);
    let updated = updateEntity(retrieved!, { tags: ['replaced', 'new-tags'] });
    await api.update<Entity>(entity.id as ElementId, updated);
    backend.close();

    // 3. Verify replacement
    const { api: api2, backend: backend2 } = createTestAPI();
    retrieved = await api2.get<Entity>(entity.id as ElementId);
    expect(retrieved!.tags).toEqual(['replaced', 'new-tags']);
    expect(retrieved!.tags).not.toContain('initial');
    backend2.close();

    // 4. Clear all tags
    const { api: api3, backend: backend3 } = createTestAPI();
    retrieved = await api3.get<Entity>(entity.id as ElementId);
    updated = updateEntity(retrieved!, { tags: [] });
    await api3.update<Entity>(entity.id as ElementId, updated);
    backend3.close();

    // 5. Verify tags are cleared
    const { api: api4, backend: backend4 } = createTestAPI();
    retrieved = await api4.get<Entity>(entity.id as ElementId);
    expect(retrieved!.tags).toEqual([]);
    backend4.close();

    // 6. Add tags back
    const { api: api5, backend: backend5 } = createTestAPI();
    retrieved = await api5.get<Entity>(entity.id as ElementId);
    updated = updateEntity(retrieved!, { tags: ['restored', 'final'] });
    await api5.update<Entity>(entity.id as ElementId, updated);
    backend5.close();

    // 7. Final verification
    const { api: api6, backend: backend6 } = createTestAPI();
    const final = await api6.get<Entity>(entity.id as ElementId);
    expect(final!.tags).toEqual(['restored', 'final']);
    backend6.close();
  });

  test('entity uniqueness enforcement across lifecycle', async () => {
    // 1. Register an entity
    const entity = await registerEntity('unique-test');
    expect(entity.name).toBe('unique-test');

    // 2. Try to register with same name - should fail
    const duplicateResult = await entityRegisterCommand.handler!(
      ['unique-test'],
      createTestOptions()
    );
    expect(duplicateResult.exitCode).toBe(ExitCode.VALIDATION);
    expect(duplicateResult.error).toContain('already exists');

    // 3. Register with different name - should succeed
    const entity2 = await registerEntity('unique-test-2');
    expect(entity2.name).toBe('unique-test-2');

    // 4. Verify both exist
    const listResult = await entityListCommand.handler!([], createTestOptions({ json: true }));
    const entities = listResult.data as Entity[];
    expect(entities.some((e) => e.name === 'unique-test')).toBe(true);
    expect(entities.some((e) => e.name === 'unique-test-2')).toBe(true);
  });

  test('entity deactivation does not affect name uniqueness', async () => {
    // 1. Register an entity
    const entity = await registerEntity('deactivate-unique');

    // 2. Deactivate the entity
    const { api, backend } = createTestAPI();
    const retrieved = await api.get<Entity>(entity.id as ElementId);
    const deactivated = deactivateEntity(retrieved!, {
      deactivatedBy: 'el-admin' as EntityId,
    });
    await api.update<Entity>(entity.id as ElementId, deactivated);
    backend.close();

    // 3. Try to register with same name - should still fail
    // (deactivated entities still occupy the namespace)
    const duplicateResult = await entityRegisterCommand.handler!(
      ['deactivate-unique'],
      createTestOptions()
    );
    expect(duplicateResult.exitCode).toBe(ExitCode.VALIDATION);
    expect(duplicateResult.error).toContain('already exists');
  });

  test('rapid entity operations', async () => {
    // 1. Register multiple entities rapidly
    const entities: Entity[] = [];
    for (let i = 0; i < 10; i++) {
      const entity = await registerEntity(`rapid-entity-${i}`, {
        type: ['agent', 'human', 'system'][i % 3] as 'agent' | 'human' | 'system',
        tag: [`batch-${i}`],
      });
      entities.push(entity);
    }
    expect(entities.length).toBe(10);

    // 2. List and verify all were created
    const listResult = await entityListCommand.handler!([], createTestOptions({ json: true }));
    const allEntities = listResult.data as Entity[];
    for (let i = 0; i < 10; i++) {
      expect(allEntities.some((e) => e.name === `rapid-entity-${i}`)).toBe(true);
    }

    // 3. Update all entities in sequence
    const { api, backend } = createTestAPI();
    for (const entity of entities) {
      const retrieved = await api.get<Entity>(entity.id as ElementId);
      const updated = updateEntity(retrieved!, {
        metadata: { batchUpdated: true, originalName: entity.name },
      });
      await api.update<Entity>(entity.id as ElementId, updated);
    }
    backend.close();

    // 4. Verify all updates
    const { api: api2, backend: backend2 } = createTestAPI();
    for (const entity of entities) {
      const retrieved = await api2.get<Entity>(entity.id as ElementId);
      expect(retrieved!.metadata.batchUpdated).toBe(true);
    }
    backend2.close();
  });

  test('entity special characters in metadata', async () => {
    // 1. Register entity
    const entity = await registerEntity('special-chars');

    // 2. Update with special characters in metadata
    const { api, backend } = createTestAPI();
    const retrieved = await api.get<Entity>(entity.id as ElementId);
    const updated = updateEntity(retrieved!, {
      metadata: {
        displayName: "Test User's Entity",
        description: 'Line 1\nLine 2\tTabbed',
        unicode: 'Unicode: αβγ • 日本語 • 🎉',
        jsonLike: '{"nested": "value"}',
        quotes: '"quoted" and \'single\'',
      },
    });
    await api.update<Entity>(entity.id as ElementId, updated);
    backend.close();

    // 3. Verify metadata is preserved correctly
    const { api: api2, backend: backend2 } = createTestAPI();
    const final = await api2.get<Entity>(entity.id as ElementId);
    expect(final!.metadata.displayName).toBe("Test User's Entity");
    expect(final!.metadata.description).toBe('Line 1\nLine 2\tTabbed');
    expect(final!.metadata.unicode).toBe('Unicode: αβγ • 日本語 • 🎉');
    expect(final!.metadata.jsonLike).toBe('{"nested": "value"}');
    expect(final!.metadata.quotes).toBe('"quoted" and \'single\'');
    backend2.close();
  });
});

// ============================================================================
// Entity Manager Commands Tests
// ============================================================================

import {
  setManagerCommand,
  clearManagerCommand,
  reportsCommand,
  chainCommand,
} from './entity.js';

describe('entity manager commands', () => {
  test('set-manager: fails without arguments', async () => {
    const options = createTestOptions();
    const result = await setManagerCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('set-manager: fails with only one argument', async () => {
    const options = createTestOptions();
    const result = await setManagerCommand.handler!(['alice'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });

  test('set-manager: sets manager relationship', async () => {
    // Create manager and employee entities
    const manager = await registerEntity('manager-1');
    const employee = await registerEntity('employee-1');

    const options = createTestOptions();
    const result = await setManagerCommand.handler!(['employee-1', 'manager-1'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as Entity).reportsTo).toBe(manager.id);
  });

  test('set-manager: works with entity IDs', async () => {
    const manager = await registerEntity('manager-id');
    const employee = await registerEntity('employee-id');

    const options = createTestOptions();
    const result = await setManagerCommand.handler!([employee.id, manager.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('set-manager: fails with non-existent entity', async () => {
    await registerEntity('real-manager');

    const options = createTestOptions();
    const result = await setManagerCommand.handler!(['nonexistent', 'real-manager'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('set-manager: fails with non-existent manager', async () => {
    await registerEntity('real-employee');

    const options = createTestOptions();
    const result = await setManagerCommand.handler!(['real-employee', 'nonexistent-mgr'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('set-manager: fails with self-reference', async () => {
    await registerEntity('self-ref');

    const options = createTestOptions();
    const result = await setManagerCommand.handler!(['self-ref', 'self-ref'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
  });

  test('set-manager: outputs JSON in JSON mode', async () => {
    await registerEntity('json-manager');
    await registerEntity('json-employee');

    const options = createTestOptions({ json: true });
    const result = await setManagerCommand.handler!(['json-employee', 'json-manager'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('object');
    expect((result.data as Entity).name).toBe('json-employee');
  });

  test('set-manager: outputs ID in quiet mode', async () => {
    await registerEntity('quiet-manager');
    await registerEntity('quiet-employee');

    const options = createTestOptions({ quiet: true });
    const result = await setManagerCommand.handler!(['quiet-employee', 'quiet-manager'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });
});

describe('clear-manager command', () => {
  test('fails without argument', async () => {
    const options = createTestOptions();
    const result = await clearManagerCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('clears manager relationship', async () => {
    // Set up manager relationship first
    const manager = await registerEntity('clear-manager');
    const employee = await registerEntity('clear-employee');

    const options = createTestOptions();
    await setManagerCommand.handler!(['clear-employee', 'clear-manager'], options);

    // Clear the manager
    const result = await clearManagerCommand.handler!(['clear-employee'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Entity).reportsTo).toBeUndefined();
  });

  test('works with entity ID', async () => {
    const manager = await registerEntity('clear-mgr-2');
    const employee = await registerEntity('clear-emp-2');

    const options = createTestOptions();
    await setManagerCommand.handler!([employee.id, manager.id], options);

    const result = await clearManagerCommand.handler!([employee.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('fails with non-existent entity', async () => {
    const options = createTestOptions();
    const result = await clearManagerCommand.handler!(['nonexistent-clear'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });
});

describe('reports command (direct reports)', () => {
  test('fails without argument', async () => {
    const options = createTestOptions();
    const result = await reportsCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('returns empty for manager with no reports', async () => {
    await registerEntity('lonely-manager');

    const options = createTestOptions();
    const result = await reportsCommand.handler!(['lonely-manager'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Entity[]).length).toBe(0);
  });

  test('returns direct reports', async () => {
    const manager = await registerEntity('reports-manager');
    await registerEntity('report-1');
    await registerEntity('report-2');

    const options = createTestOptions();
    await setManagerCommand.handler!(['report-1', 'reports-manager'], options);
    await setManagerCommand.handler!(['report-2', 'reports-manager'], options);

    const result = await reportsCommand.handler!(['reports-manager'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Entity[]).length).toBe(2);
  });

  test('works with entity ID', async () => {
    const manager = await registerEntity('reports-mgr-id');

    const options = createTestOptions();
    const result = await reportsCommand.handler!([manager.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('fails with non-existent manager', async () => {
    const options = createTestOptions();
    const result = await reportsCommand.handler!(['nonexistent-reports-mgr'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('outputs JSON in JSON mode', async () => {
    await registerEntity('json-reports-mgr');

    const options = createTestOptions({ json: true });
    const result = await reportsCommand.handler!(['json-reports-mgr'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('outputs IDs in quiet mode', async () => {
    const manager = await registerEntity('quiet-reports-mgr');
    await registerEntity('quiet-report');
    await setManagerCommand.handler!(['quiet-report', 'quiet-reports-mgr'], createTestOptions());

    const options = createTestOptions({ quiet: true });
    const result = await reportsCommand.handler!(['quiet-reports-mgr'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });
});

describe('chain command (management chain)', () => {
  test('fails without argument', async () => {
    const options = createTestOptions();
    const result = await chainCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('returns empty chain for entity with no manager', async () => {
    await registerEntity('no-chain-entity');

    const options = createTestOptions();
    const result = await chainCommand.handler!(['no-chain-entity'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Entity[]).length).toBe(0);
    expect(result.message).toContain('no manager');
  });

  test('returns management chain', async () => {
    await registerEntity('ceo');
    await registerEntity('vp');
    await registerEntity('manager-chain');
    await registerEntity('employee-chain');

    const options = createTestOptions();
    await setManagerCommand.handler!(['vp', 'ceo'], options);
    await setManagerCommand.handler!(['manager-chain', 'vp'], options);
    await setManagerCommand.handler!(['employee-chain', 'manager-chain'], options);

    const result = await chainCommand.handler!(['employee-chain'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const chain = result.data as Entity[];
    expect(chain.length).toBe(3); // manager-chain -> vp -> ceo
    expect(chain[0].name).toBe('manager-chain');
    expect(chain[1].name).toBe('vp');
    expect(chain[2].name).toBe('ceo');
  });

  test('displays visual chain in human format', async () => {
    await registerEntity('visual-ceo');
    await registerEntity('visual-emp');
    await setManagerCommand.handler!(['visual-emp', 'visual-ceo'], createTestOptions());

    const options = createTestOptions();
    const result = await chainCommand.handler!(['visual-emp'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('visual-emp');
    expect(result.message).toContain('->');
    expect(result.message).toContain('visual-ceo');
  });

  test('works with entity ID', async () => {
    const entity = await registerEntity('chain-id-test');

    const options = createTestOptions();
    const result = await chainCommand.handler!([entity.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('fails with non-existent entity', async () => {
    const options = createTestOptions();
    const result = await chainCommand.handler!(['nonexistent-chain'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('outputs JSON in JSON mode', async () => {
    await registerEntity('json-chain');

    const options = createTestOptions({ json: true });
    const result = await chainCommand.handler!(['json-chain'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('outputs IDs in quiet mode', async () => {
    await registerEntity('quiet-ceo');
    await registerEntity('quiet-chain-emp');
    await setManagerCommand.handler!(['quiet-chain-emp', 'quiet-ceo'], createTestOptions());

    const options = createTestOptions({ quiet: true });
    const result = await chainCommand.handler!(['quiet-chain-emp'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });
});

describe('entity manager command structure', () => {
  test('set-manager has correct name', () => {
    expect(setManagerCommand.name).toBe('set-manager');
  });

  test('set-manager has description', () => {
    expect(setManagerCommand.description).toBeDefined();
  });

  test('set-manager has help', () => {
    expect(setManagerCommand.help).toContain('manager');
  });

  test('clear-manager has correct name', () => {
    expect(clearManagerCommand.name).toBe('clear-manager');
  });

  test('reports has correct name', () => {
    expect(reportsCommand.name).toBe('reports');
  });

  test('chain has correct name', () => {
    expect(chainCommand.name).toBe('chain');
  });

  test('entity command has manager subcommands', () => {
    expect(entityCommand.subcommands!['set-manager']).toBeDefined();
    expect(entityCommand.subcommands!['clear-manager']).toBeDefined();
    expect(entityCommand.subcommands!.reports).toBeDefined();
    expect(entityCommand.subcommands!.chain).toBeDefined();
  });
});
