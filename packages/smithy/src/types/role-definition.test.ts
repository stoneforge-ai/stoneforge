/**
 * Role Definition Types Tests
 */

import { describe, test, expect } from 'bun:test';
import type { EntityId, DocumentId, Timestamp } from '@stoneforge/core';
import type {
  AgentBehaviors,
  DirectorRoleDefinition,
  WorkerRoleDefinition,
  StewardRoleDefinition,
} from './role-definition.js';
import {
  isAgentBehaviors,
  isDirectorRoleDefinition,
  isWorkerRoleDefinition,
  isStewardRoleDefinition,
  isAgentRoleDefinition,
  ROLE_DEFINITION_TAGS,
  generateRoleDefinitionTags,
} from './role-definition.js';

// Test helpers
const mockTimestamp = '2024-01-01T00:00:00.000Z' as Timestamp;
const mockEntityId = 'el-abc123' as EntityId;
const mockDocumentId = 'el-doc123' as unknown as DocumentId;

const createValidBaseDefinition = () => ({
  name: 'Test Role',
  description: 'A test role definition',
  systemPromptRef: mockDocumentId,
  maxConcurrentTasks: 1,
  behaviors: {
    onStartup: 'Initialize workspace',
    onTaskAssigned: 'Read task carefully',
  },
  tags: ['test'],
  createdAt: mockTimestamp,
  createdBy: mockEntityId,
  updatedAt: mockTimestamp,
});

describe('AgentBehaviors', () => {
  test('isAgentBehaviors returns true for valid behaviors', () => {
    const behaviors: AgentBehaviors = {
      onStartup: 'Initialize',
      onTaskAssigned: 'Read task',
      onStuck: 'Ask for help',
      onHandoff: 'Document context',
      onError: 'Log and retry',
    };
    expect(isAgentBehaviors(behaviors)).toBe(true);
  });

  test('isAgentBehaviors returns true for empty object', () => {
    expect(isAgentBehaviors({})).toBe(true);
  });

  test('isAgentBehaviors returns true for partial behaviors', () => {
    expect(isAgentBehaviors({ onStartup: 'Initialize' })).toBe(true);
    expect(isAgentBehaviors({ onError: 'Handle error' })).toBe(true);
  });

  test('isAgentBehaviors returns false for non-string fields', () => {
    expect(isAgentBehaviors({ onStartup: 123 })).toBe(false);
    expect(isAgentBehaviors({ onTaskAssigned: null })).toBe(false);
    expect(isAgentBehaviors({ onStuck: ['array'] })).toBe(false);
  });

  test('isAgentBehaviors returns false for non-objects', () => {
    expect(isAgentBehaviors(null)).toBe(false);
    expect(isAgentBehaviors(undefined)).toBe(false);
    expect(isAgentBehaviors('string')).toBe(false);
    expect(isAgentBehaviors(123)).toBe(false);
  });
});

describe('DirectorRoleDefinition', () => {
  test('isDirectorRoleDefinition returns true for valid director definition', () => {
    const definition: DirectorRoleDefinition = {
      ...createValidBaseDefinition(),
      role: 'director',
    };
    expect(isDirectorRoleDefinition(definition)).toBe(true);
  });

  test('isDirectorRoleDefinition returns false for worker role', () => {
    const definition = {
      ...createValidBaseDefinition(),
      role: 'worker',
      workerMode: 'ephemeral',
    };
    expect(isDirectorRoleDefinition(definition)).toBe(false);
  });

  test('isDirectorRoleDefinition returns false for missing required fields', () => {
    expect(isDirectorRoleDefinition({ role: 'director' })).toBe(false);
    expect(isDirectorRoleDefinition({})).toBe(false);
    expect(isDirectorRoleDefinition(null)).toBe(false);
  });
});

describe('WorkerRoleDefinition', () => {
  test('isWorkerRoleDefinition returns true for valid worker definition', () => {
    const definition: WorkerRoleDefinition = {
      ...createValidBaseDefinition(),
      role: 'worker',
    };
    expect(isWorkerRoleDefinition(definition)).toBe(true);
  });

  test('isWorkerRoleDefinition returns true with workerMode', () => {
    const ephemeralDef: WorkerRoleDefinition = {
      ...createValidBaseDefinition(),
      role: 'worker',
      workerMode: 'ephemeral',
    };
    const persistentDef: WorkerRoleDefinition = {
      ...createValidBaseDefinition(),
      role: 'worker',
      workerMode: 'persistent',
    };
    expect(isWorkerRoleDefinition(ephemeralDef)).toBe(true);
    expect(isWorkerRoleDefinition(persistentDef)).toBe(true);
  });

  test('isWorkerRoleDefinition returns false for invalid workerMode', () => {
    const definition = {
      ...createValidBaseDefinition(),
      role: 'worker',
      workerMode: 'invalid-mode',
    };
    expect(isWorkerRoleDefinition(definition)).toBe(false);
  });

  test('isWorkerRoleDefinition returns false for director role', () => {
    const definition = {
      ...createValidBaseDefinition(),
      role: 'director',
    };
    expect(isWorkerRoleDefinition(definition)).toBe(false);
  });
});

describe('StewardRoleDefinition', () => {
  test('isStewardRoleDefinition returns true for valid steward definition', () => {
    const definition: StewardRoleDefinition = {
      ...createValidBaseDefinition(),
      role: 'steward',
    };
    expect(isStewardRoleDefinition(definition)).toBe(true);
  });

  test('isStewardRoleDefinition returns true with stewardFocus', () => {
    const focuses = ['merge', 'docs'] as const;
    for (const focus of focuses) {
      const definition: StewardRoleDefinition = {
        ...createValidBaseDefinition(),
        role: 'steward',
        stewardFocus: focus,
      };
      expect(isStewardRoleDefinition(definition)).toBe(true);
    }
  });

  test('isStewardRoleDefinition returns false for invalid stewardFocus', () => {
    const definition = {
      ...createValidBaseDefinition(),
      role: 'steward',
      stewardFocus: 'invalid-focus',
    };
    expect(isStewardRoleDefinition(definition)).toBe(false);
  });
});

describe('AgentRoleDefinition (union type)', () => {
  test('isAgentRoleDefinition returns true for all valid role types', () => {
    const directorDef: DirectorRoleDefinition = {
      ...createValidBaseDefinition(),
      role: 'director',
    };
    const workerDef: WorkerRoleDefinition = {
      ...createValidBaseDefinition(),
      role: 'worker',
    };
    const stewardDef: StewardRoleDefinition = {
      ...createValidBaseDefinition(),
      role: 'steward',
    };

    expect(isAgentRoleDefinition(directorDef)).toBe(true);
    expect(isAgentRoleDefinition(workerDef)).toBe(true);
    expect(isAgentRoleDefinition(stewardDef)).toBe(true);
  });

  test('isAgentRoleDefinition returns false for invalid definitions', () => {
    expect(isAgentRoleDefinition({})).toBe(false);
    expect(isAgentRoleDefinition(null)).toBe(false);
    expect(isAgentRoleDefinition({ role: 'unknown' })).toBe(false);
  });
});

describe('Role Definition Tags', () => {
  test('ROLE_DEFINITION_TAGS contains expected tags', () => {
    expect(ROLE_DEFINITION_TAGS.ROLE_DEFINITION).toBe('role-definition');
    expect(ROLE_DEFINITION_TAGS.ROLE_PREFIX).toBe('role:');
    expect(ROLE_DEFINITION_TAGS.AGENT_PROMPT).toBe('agent-prompt');
  });

  test('generateRoleDefinitionTags creates correct tags for director', () => {
    const tags = generateRoleDefinitionTags('director');
    expect(tags).toContain('role-definition');
    expect(tags).toContain('agent-prompt');
    expect(tags).toContain('role:director');
    expect(tags).toHaveLength(3);
  });

  test('generateRoleDefinitionTags creates correct tags for worker', () => {
    const tags = generateRoleDefinitionTags('worker');
    expect(tags).toContain('role-definition');
    expect(tags).toContain('agent-prompt');
    expect(tags).toContain('role:worker');
    expect(tags).toHaveLength(3);
  });

  test('generateRoleDefinitionTags creates correct tags for steward', () => {
    const tags = generateRoleDefinitionTags('steward');
    expect(tags).toContain('role-definition');
    expect(tags).toContain('agent-prompt');
    expect(tags).toContain('role:steward');
    expect(tags).toHaveLength(3);
  });

  test('generateRoleDefinitionTags includes additional tags', () => {
    const tags = generateRoleDefinitionTags('worker', ['frontend', 'typescript']);
    expect(tags).toContain('role-definition');
    expect(tags).toContain('agent-prompt');
    expect(tags).toContain('role:worker');
    expect(tags).toContain('frontend');
    expect(tags).toContain('typescript');
    expect(tags).toHaveLength(5);
  });
});

describe('Role Definition Validation Edge Cases', () => {
  test('definition without optional fields is valid', () => {
    const minimalDefinition: DirectorRoleDefinition = {
      role: 'director',
      name: 'Minimal Director',
      systemPromptRef: mockDocumentId,
      createdAt: mockTimestamp,
      createdBy: mockEntityId,
      updatedAt: mockTimestamp,
    };
    expect(isDirectorRoleDefinition(minimalDefinition)).toBe(true);
  });

  test('definition with zero maxConcurrentTasks is valid', () => {
    const definition: WorkerRoleDefinition = {
      ...createValidBaseDefinition(),
      role: 'worker',
      maxConcurrentTasks: 0,
    };
    expect(isWorkerRoleDefinition(definition)).toBe(true);
  });

  test('definition with invalid maxConcurrentTasks is invalid', () => {
    const definition = {
      ...createValidBaseDefinition(),
      role: 'director',
      maxConcurrentTasks: 'not a number',
    };
    expect(isDirectorRoleDefinition(definition)).toBe(false);
  });
});
