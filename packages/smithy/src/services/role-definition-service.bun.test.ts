/**
 * Role Definition Service Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { createStorage, initializeSchema, type StorageBackend } from '@stoneforge/storage';
import { createEntity, EntityTypeValue, type EntityId } from '@stoneforge/core';
import { createQuarryAPI } from '@stoneforge/quarry';
import {
  createRoleDefinitionService,
  type RoleDefinitionService,
} from './role-definition-service.js';

describe('RoleDefinitionService', () => {
  let service: RoleDefinitionService;
  let systemEntityId: EntityId;
  let backend: StorageBackend;
  let testDbPath: string;

  beforeEach(async () => {
    // Create a unique test database path
    testDbPath = `/tmp/role-def-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;

    // Create storage backend
    backend = createStorage({ path: testDbPath });
    initializeSchema(backend);

    // Create API and service
    const api = createQuarryAPI(backend);
    service = createRoleDefinitionService(api);

    // Create a test entity to use as createdBy
    const testEntity = await createEntity({
      name: 'test-user',
      entityType: EntityTypeValue.HUMAN,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(testEntity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntityId = saved.id as unknown as EntityId;
  });

  afterEach(() => {
    backend.close();
    try {
      fs.unlinkSync(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createRoleDefinition', () => {
    test('creates a director role definition', async () => {
      const stored = await service.createRoleDefinition({
        role: 'director',
        name: 'Default Director',
        description: 'The main orchestrator',
        systemPrompt: 'You are a director agent responsible for coordinating work.',
        maxConcurrentTasks: 5,
        behaviors: {
          onStartup: 'Check for pending tasks',
          onTaskAssigned: 'Delegate to workers',
        },
        tags: ['default'],
        createdBy: systemEntityId,
      });

      expect(stored).toBeDefined();
      expect(stored.id).toBeDefined();
      expect(stored.definition.role).toBe('director');
      expect(stored.definition.name).toBe('Default Director');
      expect(stored.definition.description).toBe('The main orchestrator');
      expect(stored.definition.maxConcurrentTasks).toBe(5);
      expect(stored.definition.behaviors?.onStartup).toBe('Check for pending tasks');
    });

    test('creates a worker role definition with workerMode', async () => {
      const stored = await service.createRoleDefinition({
        role: 'worker',
        name: 'Frontend Worker',
        systemPrompt: 'You are a frontend developer specializing in React.',
        maxConcurrentTasks: 1,
        workerMode: 'ephemeral',
        createdBy: systemEntityId,
      });

      expect(stored.definition.role).toBe('worker');
      expect(stored.definition.name).toBe('Frontend Worker');
      if (stored.definition.role === 'worker') {
        expect(stored.definition.workerMode).toBe('ephemeral');
      }
    });

    test('creates a steward role definition with stewardFocus', async () => {
      const stored = await service.createRoleDefinition({
        role: 'steward',
        name: 'Merge Steward',
        systemPrompt: 'You handle branch merges and test validation.',
        maxConcurrentTasks: 3,
        stewardFocus: 'merge',
        behaviors: {
          onError: 'Create fix task and assign to worker',
        },
        createdBy: systemEntityId,
      });

      expect(stored.definition.role).toBe('steward');
      expect(stored.definition.name).toBe('Merge Steward');
      if (stored.definition.role === 'steward') {
        expect(stored.definition.stewardFocus).toBe('merge');
      }
    });

    test('creates role definition with default maxConcurrentTasks', async () => {
      const stored = await service.createRoleDefinition({
        role: 'director',
        name: 'Minimal Director',
        systemPrompt: 'A minimal prompt.',
        createdBy: systemEntityId,
      });

      // Default maxConcurrentTasks is 1 when not specified
      expect(stored.definition.maxConcurrentTasks).toBe(1);
    });
  });

  describe('getRoleDefinition', () => {
    test('retrieves a role definition by ID', async () => {
      const created = await service.createRoleDefinition({
        role: 'worker',
        name: 'Test Worker',
        systemPrompt: 'Test prompt',
        createdBy: systemEntityId,
      });

      const retrieved = await service.getRoleDefinition(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.definition.name).toBe('Test Worker');
    });

    test('returns undefined for non-existent ID', async () => {
      const retrieved = await service.getRoleDefinition('el-nonexistent' as unknown as import('@stoneforge/core').ElementId);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getSystemPrompt', () => {
    test('retrieves system prompt from role definition', async () => {
      const promptText = 'You are a helpful coding assistant.';
      const created = await service.createRoleDefinition({
        role: 'worker',
        name: 'Helper Worker',
        systemPrompt: promptText,
        createdBy: systemEntityId,
      });

      const prompt = await service.getSystemPrompt(created.id);
      expect(prompt).toBe(promptText);
    });

    test('returns undefined for non-existent definition', async () => {
      const prompt = await service.getSystemPrompt('el-nonexistent' as unknown as import('@stoneforge/core').ElementId);
      expect(prompt).toBeUndefined();
    });
  });

  describe('getSystemPromptFromRef', () => {
    test('retrieves prompt directly from document reference', async () => {
      const promptText = 'Direct reference prompt.';
      const created = await service.createRoleDefinition({
        role: 'director',
        name: 'Direct Ref Test',
        systemPrompt: promptText,
        createdBy: systemEntityId,
      });

      const prompt = await service.getSystemPromptFromRef(created.definition.systemPromptRef);
      expect(prompt).toBe(promptText);
    });
  });

  describe('updateRoleDefinition', () => {
    test('updates role definition name and description', async () => {
      const created = await service.createRoleDefinition({
        role: 'worker',
        name: 'Original Name',
        description: 'Original description',
        systemPrompt: 'Original prompt',
        createdBy: systemEntityId,
      });

      const updated = await service.updateRoleDefinition(created.id, {
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(updated.definition.name).toBe('Updated Name');
      expect(updated.definition.description).toBe('Updated description');
      // System prompt should remain unchanged
      const prompt = await service.getSystemPrompt(updated.id);
      expect(prompt).toBe('Original prompt');
    });

    test('updates system prompt', async () => {
      const created = await service.createRoleDefinition({
        role: 'worker',
        name: 'Prompt Update Test',
        systemPrompt: 'Version 1',
        createdBy: systemEntityId,
      });

      await service.updateRoleDefinition(created.id, {
        systemPrompt: 'Version 2 - improved instructions',
      });

      const prompt = await service.getSystemPrompt(created.id);
      expect(prompt).toBe('Version 2 - improved instructions');
    });

    test('updates maxConcurrentTasks', async () => {
      const created = await service.createRoleDefinition({
        role: 'worker',
        name: 'MaxTasks Update Test',
        systemPrompt: 'Test',
        maxConcurrentTasks: 1,
        createdBy: systemEntityId,
      });

      const updated = await service.updateRoleDefinition(created.id, {
        maxConcurrentTasks: 3,
      });

      expect(updated.definition.maxConcurrentTasks).toBe(3);
    });

    test('merges behaviors', async () => {
      const created = await service.createRoleDefinition({
        role: 'worker',
        name: 'Behavior Merge Test',
        systemPrompt: 'Test',
        behaviors: {
          onStartup: 'Original startup',
        },
        createdBy: systemEntityId,
      });

      const updated = await service.updateRoleDefinition(created.id, {
        behaviors: {
          onError: 'New error handler',
        },
      });

      expect(updated.definition.behaviors?.onStartup).toBe('Original startup');
      expect(updated.definition.behaviors?.onError).toBe('New error handler');
    });

    test('throws error for non-existent definition', async () => {
      await expect(
        service.updateRoleDefinition('el-nonexistent' as unknown as import('@stoneforge/core').ElementId, { name: 'New' })
      ).rejects.toThrow('Role definition not found');
    });
  });

  describe('listRoleDefinitions', () => {
    test('lists all role definitions', async () => {
      await service.createRoleDefinition({
        role: 'director',
        name: 'Director 1',
        systemPrompt: 'Director prompt',
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Worker 1',
        systemPrompt: 'Worker prompt',
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'steward',
        name: 'Steward 1',
        systemPrompt: 'Steward prompt',
        createdBy: systemEntityId,
      });

      const all = await service.listRoleDefinitions();
      expect(all).toHaveLength(3);
    });

    test('filters by role', async () => {
      await service.createRoleDefinition({
        role: 'director',
        name: 'Director',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Worker 1',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Worker 2',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });

      const workers = await service.listRoleDefinitions({ role: 'worker' });
      expect(workers).toHaveLength(2);
      expect(workers.every(r => r.definition.role === 'worker')).toBe(true);

      const directors = await service.listRoleDefinitions({ role: 'director' });
      expect(directors).toHaveLength(1);
    });

    test('filters by workerMode', async () => {
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Ephemeral Worker',
        systemPrompt: 'Prompt',
        workerMode: 'ephemeral',
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Persistent Worker',
        systemPrompt: 'Prompt',
        workerMode: 'persistent',
        createdBy: systemEntityId,
      });

      const ephemeral = await service.listRoleDefinitions({ workerMode: 'ephemeral' });
      expect(ephemeral).toHaveLength(1);
      expect(ephemeral[0].definition.name).toBe('Ephemeral Worker');
    });

    test('filters by stewardFocus', async () => {
      await service.createRoleDefinition({
        role: 'steward',
        name: 'Merge Steward',
        systemPrompt: 'Prompt',
        stewardFocus: 'merge',
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'steward',
        name: 'Docs Steward',
        systemPrompt: 'Prompt',
        stewardFocus: 'docs',
        createdBy: systemEntityId,
      });

      const mergeStewards = await service.listRoleDefinitions({ stewardFocus: 'merge' });
      expect(mergeStewards).toHaveLength(1);
      expect(mergeStewards[0].definition.name).toBe('Merge Steward');
    });

    test('filters by tags', async () => {
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Tagged Worker',
        systemPrompt: 'Prompt',
        tags: ['frontend', 'react'],
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Other Worker',
        systemPrompt: 'Prompt',
        tags: ['backend'],
        createdBy: systemEntityId,
      });

      const frontendWorkers = await service.listRoleDefinitions({ tags: ['frontend'] });
      expect(frontendWorkers).toHaveLength(1);
      expect(frontendWorkers[0].definition.name).toBe('Tagged Worker');
    });

    test('filters by name contains', async () => {
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Frontend Developer',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Backend Developer',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });

      const frontend = await service.listRoleDefinitions({ nameContains: 'frontend' });
      expect(frontend).toHaveLength(1);
      expect(frontend[0].definition.name).toBe('Frontend Developer');

      // Case insensitive
      const developers = await service.listRoleDefinitions({ nameContains: 'DEVELOPER' });
      expect(developers).toHaveLength(2);
    });
  });

  describe('getRoleDefinitionsByRole', () => {
    test('returns definitions for specific role', async () => {
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Worker A',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'worker',
        name: 'Worker B',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'director',
        name: 'Director',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });

      const workers = await service.getRoleDefinitionsByRole('worker');
      expect(workers).toHaveLength(2);
      expect(workers.every(r => r.definition.role === 'worker')).toBe(true);
    });
  });

  describe('getDefaultRoleDefinition', () => {
    test('returns first definition for role', async () => {
      await service.createRoleDefinition({
        role: 'director',
        name: 'First Director',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });
      await service.createRoleDefinition({
        role: 'director',
        name: 'Second Director',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });

      const defaultDirector = await service.getDefaultRoleDefinition('director');
      expect(defaultDirector).toBeDefined();
      // Should return one of them (order not guaranteed)
      expect(defaultDirector!.definition.role).toBe('director');
    });

    test('returns undefined when no definitions exist', async () => {
      const result = await service.getDefaultRoleDefinition('director');
      expect(result).toBeUndefined();
    });
  });

  describe('deleteRoleDefinition', () => {
    test('deletes a role definition', async () => {
      const created = await service.createRoleDefinition({
        role: 'worker',
        name: 'To Delete',
        systemPrompt: 'Prompt',
        createdBy: systemEntityId,
      });

      const deleted = await service.deleteRoleDefinition(created.id);
      expect(deleted).toBe(true);

      const retrieved = await service.getRoleDefinition(created.id);
      expect(retrieved).toBeUndefined();
    });

    test('returns false for non-existent definition', async () => {
      const deleted = await service.deleteRoleDefinition('el-nonexistent' as unknown as import('@stoneforge/core').ElementId);
      expect(deleted).toBe(false);
    });
  });

  describe('Integration: Agent with Role Definition', () => {
    test('stores complex role definition with all fields', async () => {
      const stored = await service.createRoleDefinition({
        role: 'worker',
        name: 'Full-Stack Developer',
        description: 'A versatile developer capable of frontend and backend work',
        systemPrompt: `You are a full-stack developer. Your responsibilities include:
- Writing clean, maintainable code
- Following best practices
- Writing tests for your code
- Documenting your changes`,
        maxConcurrentTasks: 2,
        behaviors: {
          onStartup: 'Review the task list and prioritize',
          onTaskAssigned: 'Analyze requirements and create a plan',
          onStuck: 'Break down the problem and seek help if needed',
          onHandoff: 'Document all context and next steps clearly',
          onError: 'Log the error and attempt recovery',
        },
        tags: ['fullstack', 'versatile', 'senior'],
        workerMode: 'persistent',
        createdBy: systemEntityId,
      });

      // Verify all fields are stored correctly
      expect(stored.definition.name).toBe('Full-Stack Developer');
      expect(stored.definition.description).toBe('A versatile developer capable of frontend and backend work');
      expect(stored.definition.maxConcurrentTasks).toBe(2);
      expect(stored.definition.behaviors?.onStartup).toBe('Review the task list and prioritize');
      expect(stored.definition.behaviors?.onTaskAssigned).toBe('Analyze requirements and create a plan');
      expect(stored.definition.behaviors?.onStuck).toBe('Break down the problem and seek help if needed');
      expect(stored.definition.behaviors?.onHandoff).toBe('Document all context and next steps clearly');
      expect(stored.definition.behaviors?.onError).toBe('Log the error and attempt recovery');
      expect(stored.definition.tags).toContain('fullstack');

      // Verify system prompt is retrievable
      const prompt = await service.getSystemPrompt(stored.id);
      expect(prompt).toContain('full-stack developer');
      expect(prompt).toContain('Writing clean, maintainable code');
    });
  });
});
