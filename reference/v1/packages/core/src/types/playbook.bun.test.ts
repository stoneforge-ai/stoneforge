/**
 * Playbook Type Tests
 */

import { describe, expect, test } from 'bun:test';
import {
  // Types
  type Playbook,
  type PlaybookId,
  type PlaybookStep,
  type PlaybookVariable,
  type VariableType,
  type ResolvedVariables,
  type ParsedCondition,
  type CreatePlaybookInput,
  type UpdatePlaybookInput,
  // Constants
  MIN_PLAYBOOK_NAME_LENGTH,
  MAX_PLAYBOOK_NAME_LENGTH,
  MIN_PLAYBOOK_TITLE_LENGTH,
  MAX_PLAYBOOK_TITLE_LENGTH,
  MAX_VARIABLE_NAME_LENGTH,
  MAX_STEP_ID_LENGTH,
  MAX_STEP_TITLE_LENGTH,
  MAX_STEP_DESCRIPTION_LENGTH,
  MAX_ASSIGNEE_LENGTH,
  MAX_CONDITION_LENGTH,
  MAX_STEPS,
  MAX_VARIABLES,
  MAX_EXTENDS,
  VARIABLE_NAME_PATTERN,
  STEP_ID_PATTERN,
  PLAYBOOK_NAME_PATTERN,
  VARIABLE_SUBSTITUTION_PATTERN,
  VariableType as VT,
  // Validation functions
  isValidVariableType,
  validateVariableType,
  isValidVariableName,
  validateVariableName,
  isValidDefaultForType,
  isValidEnumForType,
  isValidPlaybookVariable,
  validatePlaybookVariable,
  isValidStepId,
  validateStepId,
  isValidStepTitle,
  validateStepTitle,
  validateStepDescription,
  isValidPlaybookStep,
  validatePlaybookStep,
  isValidPlaybookName,
  validatePlaybookName,
  isValidPlaybookTitle,
  validatePlaybookTitle,
  isValidPlaybookVersion,
  validatePlaybookVersion,
  isValidPlaybookId,
  validatePlaybookId,
  validateSteps,
  validateVariables,
  validateExtends,
  // Type guards
  isPlaybook,
  validatePlaybook,
  // Factory functions
  createPlaybook,
  updatePlaybook,
  // Variable system
  resolveVariables,
  getVariableNames,
  getRequiredVariableNames,
  getOptionalVariableNames,
  // Condition system
  isTruthy,
  parseCondition,
  evaluateCondition,
  // Substitution system
  extractVariableNames,
  substituteVariables,
  hasVariables,
  filterStepsByConditions,
  // Utility functions
  getStepById,
  getVariableByName,
  hasPlaybookVariables,
  hasSteps,
  hasParents,
  hasDescription,
  getStepCount,
  getVariableCount,
  filterByNamePattern,
  filterByVariable,
  sortByName,
  sortByVersion,
  sortPlaybooksByCreatedAtDesc,
  sortPlaybooksByCreatedAtAsc,
  sortByStepCount,
  groupByHasParents,
  getAllParentNames,
  findChildPlaybooks,
  findByName,
  // Inheritance system
  type PlaybookLoader,
  type ResolvedInheritanceChain,
  type ResolvedPlaybook,
  resolveInheritanceChain,
  mergeVariables,
  mergeSteps,
  validateMergedSteps,
  resolvePlaybookInheritance,
  createPlaybookLoader,
  validateNoCircularInheritance,
} from './playbook.js';
import { ElementType, type EntityId, type Timestamp } from './element.js';
import { type DocumentId } from './document.js';
import { Priority, Complexity, TaskTypeValue } from './task.js';
import { ValidationError, ConflictError, NotFoundError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestPlaybook(overrides: Partial<Playbook> = {}): Playbook {
  return {
    id: 'el-abc123' as PlaybookId,
    type: ElementType.PLAYBOOK,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    name: 'test_playbook',
    title: 'Test Playbook Title',
    version: 1,
    steps: [],
    variables: [],
    ...overrides,
  };
}

function createTestStep(overrides: Partial<PlaybookStep> = {}): PlaybookStep {
  return {
    id: 'step_1',
    title: 'Test Step',
    ...overrides,
  };
}

function createTestVariable(overrides: Partial<PlaybookVariable> = {}): PlaybookVariable {
  return {
    name: 'test_var',
    type: VT.STRING,
    required: false,
    ...overrides,
  };
}

// ============================================================================
// Constants Tests
// ============================================================================

describe('Playbook Constants', () => {
  describe('Length limits', () => {
    test('MIN_PLAYBOOK_NAME_LENGTH is 1', () => {
      expect(MIN_PLAYBOOK_NAME_LENGTH).toBe(1);
    });

    test('MAX_PLAYBOOK_NAME_LENGTH is 100', () => {
      expect(MAX_PLAYBOOK_NAME_LENGTH).toBe(100);
    });

    test('MIN_PLAYBOOK_TITLE_LENGTH is 1', () => {
      expect(MIN_PLAYBOOK_TITLE_LENGTH).toBe(1);
    });

    test('MAX_PLAYBOOK_TITLE_LENGTH is 500', () => {
      expect(MAX_PLAYBOOK_TITLE_LENGTH).toBe(500);
    });

    test('MAX_VARIABLE_NAME_LENGTH is 50', () => {
      expect(MAX_VARIABLE_NAME_LENGTH).toBe(50);
    });

    test('MAX_STEP_ID_LENGTH is 50', () => {
      expect(MAX_STEP_ID_LENGTH).toBe(50);
    });

    test('MAX_STEP_TITLE_LENGTH is 500', () => {
      expect(MAX_STEP_TITLE_LENGTH).toBe(500);
    });

    test('MAX_STEP_DESCRIPTION_LENGTH is 5000', () => {
      expect(MAX_STEP_DESCRIPTION_LENGTH).toBe(5000);
    });

    test('MAX_ASSIGNEE_LENGTH is 200', () => {
      expect(MAX_ASSIGNEE_LENGTH).toBe(200);
    });

    test('MAX_CONDITION_LENGTH is 500', () => {
      expect(MAX_CONDITION_LENGTH).toBe(500);
    });

    test('MAX_STEPS is 1000', () => {
      expect(MAX_STEPS).toBe(1000);
    });

    test('MAX_VARIABLES is 100', () => {
      expect(MAX_VARIABLES).toBe(100);
    });

    test('MAX_EXTENDS is 10', () => {
      expect(MAX_EXTENDS).toBe(10);
    });
  });

  describe('VariableType', () => {
    test('has STRING value', () => {
      expect(VT.STRING).toBe('string');
    });

    test('has NUMBER value', () => {
      expect(VT.NUMBER).toBe('number');
    });

    test('has BOOLEAN value', () => {
      expect(VT.BOOLEAN).toBe('boolean');
    });

    test('has exactly 3 types', () => {
      expect(Object.keys(VT)).toHaveLength(3);
    });
  });

  describe('Patterns', () => {
    test('VARIABLE_NAME_PATTERN matches valid identifiers', () => {
      expect(VARIABLE_NAME_PATTERN.test('myVar')).toBe(true);
      expect(VARIABLE_NAME_PATTERN.test('_private')).toBe(true);
      expect(VARIABLE_NAME_PATTERN.test('var123')).toBe(true);
      expect(VARIABLE_NAME_PATTERN.test('MY_CONST')).toBe(true);
    });

    test('VARIABLE_NAME_PATTERN rejects invalid identifiers', () => {
      expect(VARIABLE_NAME_PATTERN.test('123var')).toBe(false);
      expect(VARIABLE_NAME_PATTERN.test('my-var')).toBe(false);
      expect(VARIABLE_NAME_PATTERN.test('my.var')).toBe(false);
      expect(VARIABLE_NAME_PATTERN.test('')).toBe(false);
    });

    test('STEP_ID_PATTERN matches valid step IDs', () => {
      expect(STEP_ID_PATTERN.test('step1')).toBe(true);
      expect(STEP_ID_PATTERN.test('_private_step')).toBe(true);
      expect(STEP_ID_PATTERN.test('step-with-dashes')).toBe(true);
      expect(STEP_ID_PATTERN.test('STEP_CONST')).toBe(true);
    });

    test('STEP_ID_PATTERN rejects invalid step IDs', () => {
      expect(STEP_ID_PATTERN.test('123step')).toBe(false);
      expect(STEP_ID_PATTERN.test('')).toBe(false);
    });

    test('PLAYBOOK_NAME_PATTERN matches valid names', () => {
      expect(PLAYBOOK_NAME_PATTERN.test('my_playbook')).toBe(true);
      expect(PLAYBOOK_NAME_PATTERN.test('deploy-service')).toBe(true);
      expect(PLAYBOOK_NAME_PATTERN.test('_private')).toBe(true);
    });

    test('VARIABLE_SUBSTITUTION_PATTERN matches {{variable}}', () => {
      const matches = 'Hello {{name}}, welcome to {{place}}'.match(
        new RegExp(VARIABLE_SUBSTITUTION_PATTERN.source, 'g')
      );
      expect(matches).toEqual(['{{name}}', '{{place}}']);
    });
  });
});

// ============================================================================
// Variable Type Validation Tests
// ============================================================================

describe('Variable Type Validation', () => {
  describe('isValidVariableType', () => {
    test('returns true for string', () => {
      expect(isValidVariableType('string')).toBe(true);
    });

    test('returns true for number', () => {
      expect(isValidVariableType('number')).toBe(true);
    });

    test('returns true for boolean', () => {
      expect(isValidVariableType('boolean')).toBe(true);
    });

    test('returns false for invalid types', () => {
      expect(isValidVariableType('object')).toBe(false);
      expect(isValidVariableType('array')).toBe(false);
      expect(isValidVariableType(123)).toBe(false);
      expect(isValidVariableType(null)).toBe(false);
    });
  });

  describe('validateVariableType', () => {
    test('returns valid type', () => {
      expect(validateVariableType('string')).toBe('string');
      expect(validateVariableType('number')).toBe('number');
      expect(validateVariableType('boolean')).toBe('boolean');
    });

    test('throws for invalid type', () => {
      expect(() => validateVariableType('invalid')).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Variable Name Validation Tests
// ============================================================================

describe('Variable Name Validation', () => {
  describe('isValidVariableName', () => {
    test('returns true for valid names', () => {
      expect(isValidVariableName('myVar')).toBe(true);
      expect(isValidVariableName('_private')).toBe(true);
      expect(isValidVariableName('x')).toBe(true);
    });

    test('returns false for empty string', () => {
      expect(isValidVariableName('')).toBe(false);
    });

    test('returns false for string starting with number', () => {
      expect(isValidVariableName('123var')).toBe(false);
    });

    test('returns false for too long names', () => {
      expect(isValidVariableName('a'.repeat(MAX_VARIABLE_NAME_LENGTH + 1))).toBe(false);
    });

    test('returns false for non-strings', () => {
      expect(isValidVariableName(123)).toBe(false);
      expect(isValidVariableName(null)).toBe(false);
    });
  });

  describe('validateVariableName', () => {
    test('returns valid name', () => {
      expect(validateVariableName('myVar')).toBe('myVar');
    });

    test('throws for non-string', () => {
      expect(() => validateVariableName(123)).toThrow(ValidationError);
    });

    test('throws for empty string', () => {
      expect(() => validateVariableName('')).toThrow(ValidationError);
    });

    test('throws for too long name', () => {
      expect(() => validateVariableName('a'.repeat(MAX_VARIABLE_NAME_LENGTH + 1))).toThrow(
        ValidationError
      );
    });

    test('throws for invalid pattern', () => {
      expect(() => validateVariableName('123var')).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Default/Enum Type Validation Tests
// ============================================================================

describe('Default and Enum Type Validation', () => {
  describe('isValidDefaultForType', () => {
    test('returns true for undefined', () => {
      expect(isValidDefaultForType(undefined, VT.STRING)).toBe(true);
    });

    test('validates string defaults', () => {
      expect(isValidDefaultForType('hello', VT.STRING)).toBe(true);
      expect(isValidDefaultForType(123, VT.STRING)).toBe(false);
    });

    test('validates number defaults', () => {
      expect(isValidDefaultForType(123, VT.NUMBER)).toBe(true);
      expect(isValidDefaultForType('123', VT.NUMBER)).toBe(false);
      expect(isValidDefaultForType(NaN, VT.NUMBER)).toBe(false);
    });

    test('validates boolean defaults', () => {
      expect(isValidDefaultForType(true, VT.BOOLEAN)).toBe(true);
      expect(isValidDefaultForType(false, VT.BOOLEAN)).toBe(true);
      expect(isValidDefaultForType('true', VT.BOOLEAN)).toBe(false);
    });
  });

  describe('isValidEnumForType', () => {
    test('returns false for empty array', () => {
      expect(isValidEnumForType([], VT.STRING)).toBe(false);
    });

    test('validates string enums', () => {
      expect(isValidEnumForType(['a', 'b', 'c'], VT.STRING)).toBe(true);
      expect(isValidEnumForType(['a', 1, 'c'], VT.STRING)).toBe(false);
    });

    test('validates number enums', () => {
      expect(isValidEnumForType([1, 2, 3], VT.NUMBER)).toBe(true);
      expect(isValidEnumForType([1, '2', 3], VT.NUMBER)).toBe(false);
      expect(isValidEnumForType([1, NaN, 3], VT.NUMBER)).toBe(false);
    });

    test('validates boolean enums', () => {
      expect(isValidEnumForType([true, false], VT.BOOLEAN)).toBe(true);
      expect(isValidEnumForType([true, 'false'], VT.BOOLEAN)).toBe(false);
    });
  });
});

// ============================================================================
// PlaybookVariable Validation Tests
// ============================================================================

describe('PlaybookVariable Validation', () => {
  describe('isValidPlaybookVariable', () => {
    test('returns true for minimal valid variable', () => {
      expect(isValidPlaybookVariable(createTestVariable())).toBe(true);
    });

    test('returns true for complete variable', () => {
      const variable = createTestVariable({
        description: 'A test variable',
        default: 'default_value',
        enum: ['a', 'b', 'c'],
      });
      expect(isValidPlaybookVariable(variable)).toBe(true);
    });

    test('returns false for invalid name', () => {
      expect(isValidPlaybookVariable({ ...createTestVariable(), name: '' })).toBe(false);
    });

    test('returns false for invalid type', () => {
      expect(isValidPlaybookVariable({ ...createTestVariable(), type: 'invalid' })).toBe(false);
    });

    test('returns false for non-boolean required', () => {
      expect(isValidPlaybookVariable({ ...createTestVariable(), required: 'yes' })).toBe(false);
    });

    test('returns false for non-object', () => {
      expect(isValidPlaybookVariable(null)).toBe(false);
      expect(isValidPlaybookVariable('variable')).toBe(false);
    });
  });

  describe('validatePlaybookVariable', () => {
    test('returns valid variable', () => {
      const variable = createTestVariable();
      expect(validatePlaybookVariable(variable)).toEqual(variable);
    });

    test('throws for non-object', () => {
      expect(() => validatePlaybookVariable(null)).toThrow(ValidationError);
    });

    test('throws for type mismatch in default', () => {
      expect(() =>
        validatePlaybookVariable({
          name: 'var',
          type: VT.NUMBER,
          required: false,
          default: 'not a number',
        })
      ).toThrow(ValidationError);
    });

    test('throws for non-array enum', () => {
      expect(() =>
        validatePlaybookVariable({
          name: 'var',
          type: VT.STRING,
          required: false,
          enum: 'not an array',
        })
      ).toThrow(ValidationError);
    });

    test('throws for empty enum', () => {
      expect(() =>
        validatePlaybookVariable({
          name: 'var',
          type: VT.STRING,
          required: false,
          enum: [],
        })
      ).toThrow(ValidationError);
    });

    test('throws for type mismatch in enum', () => {
      expect(() =>
        validatePlaybookVariable({
          name: 'var',
          type: VT.NUMBER,
          required: false,
          enum: ['a', 'b'],
        })
      ).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Step ID Validation Tests
// ============================================================================

describe('Step ID Validation', () => {
  describe('isValidStepId', () => {
    test('returns true for valid IDs', () => {
      expect(isValidStepId('step1')).toBe(true);
      expect(isValidStepId('step-two')).toBe(true);
      expect(isValidStepId('_step')).toBe(true);
    });

    test('returns false for empty string', () => {
      expect(isValidStepId('')).toBe(false);
    });

    test('returns false for too long ID', () => {
      expect(isValidStepId('a'.repeat(MAX_STEP_ID_LENGTH + 1))).toBe(false);
    });

    test('returns false for invalid pattern', () => {
      expect(isValidStepId('123step')).toBe(false);
    });
  });

  describe('validateStepId', () => {
    test('returns valid ID', () => {
      expect(validateStepId('step1')).toBe('step1');
    });

    test('throws for non-string', () => {
      expect(() => validateStepId(123)).toThrow(ValidationError);
    });

    test('throws for empty string', () => {
      expect(() => validateStepId('')).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Step Title/Description Validation Tests
// ============================================================================

describe('Step Title Validation', () => {
  describe('isValidStepTitle', () => {
    test('returns true for valid titles', () => {
      expect(isValidStepTitle('Step Title')).toBe(true);
      expect(isValidStepTitle('A')).toBe(true);
    });

    test('returns false for empty/whitespace', () => {
      expect(isValidStepTitle('')).toBe(false);
      expect(isValidStepTitle('   ')).toBe(false);
    });

    test('returns false for too long title', () => {
      expect(isValidStepTitle('a'.repeat(MAX_STEP_TITLE_LENGTH + 1))).toBe(false);
    });
  });

  describe('validateStepTitle', () => {
    test('returns trimmed title', () => {
      expect(validateStepTitle('  Step Title  ')).toBe('Step Title');
    });

    test('throws for empty string', () => {
      expect(() => validateStepTitle('')).toThrow(ValidationError);
    });

    test('throws for too long title', () => {
      expect(() => validateStepTitle('a'.repeat(MAX_STEP_TITLE_LENGTH + 1))).toThrow(
        ValidationError
      );
    });
  });

  describe('validateStepDescription', () => {
    test('returns undefined for undefined', () => {
      expect(validateStepDescription(undefined)).toBeUndefined();
    });

    test('returns undefined for null', () => {
      expect(validateStepDescription(null)).toBeUndefined();
    });

    test('returns valid description', () => {
      expect(validateStepDescription('A description')).toBe('A description');
    });

    test('throws for non-string', () => {
      expect(() => validateStepDescription(123)).toThrow(ValidationError);
    });

    test('throws for too long description', () => {
      expect(() => validateStepDescription('a'.repeat(MAX_STEP_DESCRIPTION_LENGTH + 1))).toThrow(
        ValidationError
      );
    });
  });
});

// ============================================================================
// PlaybookStep Validation Tests
// ============================================================================

describe('PlaybookStep Validation', () => {
  describe('isValidPlaybookStep', () => {
    test('returns true for minimal valid step', () => {
      expect(isValidPlaybookStep(createTestStep())).toBe(true);
    });

    test('returns true for complete step', () => {
      const step = createTestStep({
        description: 'A step description',
        taskType: TaskTypeValue.TASK,
        priority: Priority.MEDIUM,
        complexity: Complexity.MEDIUM,
        assignee: '{{user}}',
        dependsOn: ['step_0'],
        condition: '{{enabled}}',
      });
      expect(isValidPlaybookStep(step)).toBe(true);
    });

    test('returns false for invalid step ID', () => {
      expect(isValidPlaybookStep({ ...createTestStep(), id: '' })).toBe(false);
    });

    test('returns false for invalid title', () => {
      expect(isValidPlaybookStep({ ...createTestStep(), title: '' })).toBe(false);
    });

    test('returns false for non-object', () => {
      expect(isValidPlaybookStep(null)).toBe(false);
    });
  });

  describe('validatePlaybookStep', () => {
    test('returns valid step', () => {
      const step = createTestStep();
      expect(validatePlaybookStep(step)).toEqual(step);
    });

    test('throws for non-object', () => {
      expect(() => validatePlaybookStep(null)).toThrow(ValidationError);
    });

    test('throws for too long assignee', () => {
      expect(() =>
        validatePlaybookStep({
          id: 'step1',
          title: 'Title',
          assignee: 'a'.repeat(MAX_ASSIGNEE_LENGTH + 1),
        })
      ).toThrow(ValidationError);
    });

    test('throws for too long condition', () => {
      expect(() =>
        validatePlaybookStep({
          id: 'step1',
          title: 'Title',
          condition: 'a'.repeat(MAX_CONDITION_LENGTH + 1),
        })
      ).toThrow(ValidationError);
    });

    test('throws for non-array dependsOn', () => {
      expect(() =>
        validatePlaybookStep({
          id: 'step1',
          title: 'Title',
          dependsOn: 'step0' as unknown,
        })
      ).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Playbook Name/Title/Version Validation Tests
// ============================================================================

describe('Playbook Name Validation', () => {
  describe('isValidPlaybookName', () => {
    test('returns true for valid names', () => {
      expect(isValidPlaybookName('my_playbook')).toBe(true);
      expect(isValidPlaybookName('deploy-service')).toBe(true);
    });

    test('returns false for empty string', () => {
      expect(isValidPlaybookName('')).toBe(false);
    });

    test('returns false for too long name', () => {
      expect(isValidPlaybookName('a'.repeat(MAX_PLAYBOOK_NAME_LENGTH + 1))).toBe(false);
    });
  });

  describe('validatePlaybookName', () => {
    test('returns valid name', () => {
      expect(validatePlaybookName('my_playbook')).toBe('my_playbook');
    });

    test('throws for non-string', () => {
      expect(() => validatePlaybookName(123)).toThrow(ValidationError);
    });
  });
});

describe('Playbook Title Validation', () => {
  describe('isValidPlaybookTitle', () => {
    test('returns true for valid titles', () => {
      expect(isValidPlaybookTitle('My Playbook Title')).toBe(true);
      expect(isValidPlaybookTitle('A')).toBe(true);
    });

    test('returns false for empty/whitespace', () => {
      expect(isValidPlaybookTitle('')).toBe(false);
      expect(isValidPlaybookTitle('   ')).toBe(false);
    });
  });

  describe('validatePlaybookTitle', () => {
    test('returns trimmed title', () => {
      expect(validatePlaybookTitle('  My Title  ')).toBe('My Title');
    });

    test('throws for empty string', () => {
      expect(() => validatePlaybookTitle('')).toThrow(ValidationError);
    });
  });
});

describe('Playbook Version Validation', () => {
  describe('isValidPlaybookVersion', () => {
    test('returns true for valid versions', () => {
      expect(isValidPlaybookVersion(1)).toBe(true);
      expect(isValidPlaybookVersion(100)).toBe(true);
    });

    test('returns false for non-integers', () => {
      expect(isValidPlaybookVersion(1.5)).toBe(false);
    });

    test('returns false for version < 1', () => {
      expect(isValidPlaybookVersion(0)).toBe(false);
      expect(isValidPlaybookVersion(-1)).toBe(false);
    });
  });

  describe('validatePlaybookVersion', () => {
    test('returns valid version', () => {
      expect(validatePlaybookVersion(1)).toBe(1);
    });

    test('throws for non-number', () => {
      expect(() => validatePlaybookVersion('1')).toThrow(ValidationError);
    });

    test('throws for non-integer', () => {
      expect(() => validatePlaybookVersion(1.5)).toThrow(ValidationError);
    });

    test('throws for version < 1', () => {
      expect(() => validatePlaybookVersion(0)).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Playbook ID Validation Tests
// ============================================================================

describe('Playbook ID Validation', () => {
  describe('isValidPlaybookId', () => {
    test('returns true for valid IDs', () => {
      expect(isValidPlaybookId('el-abc123')).toBe(true);
      expect(isValidPlaybookId('el-xyz789')).toBe(true);
    });

    test('returns false for invalid format', () => {
      expect(isValidPlaybookId('abc123')).toBe(false);
      expect(isValidPlaybookId('')).toBe(false);
    });
  });

  describe('validatePlaybookId', () => {
    test('returns valid ID', () => {
      expect(validatePlaybookId('el-abc123')).toBe('el-abc123' as PlaybookId);
    });

    test('throws for invalid ID', () => {
      expect(() => validatePlaybookId('invalid')).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Steps Array Validation Tests
// ============================================================================

describe('validateSteps', () => {
  test('returns empty array for empty input', () => {
    expect(validateSteps([])).toEqual([]);
  });

  test('returns validated steps', () => {
    const steps = [createTestStep({ id: 'step1' }), createTestStep({ id: 'step2' })];
    expect(validateSteps(steps)).toEqual(steps);
  });

  test('throws for non-array', () => {
    expect(() => validateSteps('not an array')).toThrow(ValidationError);
  });

  test('throws for too many steps', () => {
    const steps = Array.from({ length: MAX_STEPS + 1 }, (_, i) =>
      createTestStep({ id: `step${i}` })
    );
    expect(() => validateSteps(steps)).toThrow(ValidationError);
  });

  test('throws for duplicate step IDs', () => {
    const steps = [createTestStep({ id: 'step1' }), createTestStep({ id: 'step1' })];
    expect(() => validateSteps(steps)).toThrow(ConflictError);
  });

  test('throws for unknown dependsOn reference', () => {
    const steps = [createTestStep({ id: 'step1', dependsOn: ['unknown'] })];
    expect(() => validateSteps(steps)).toThrow(NotFoundError);
  });

  test('throws for self-dependency', () => {
    const steps = [createTestStep({ id: 'step1', dependsOn: ['step1'] })];
    expect(() => validateSteps(steps)).toThrow(ConflictError);
  });

  test('allows valid dependsOn references', () => {
    const steps = [
      createTestStep({ id: 'step1' }),
      createTestStep({ id: 'step2', dependsOn: ['step1'] }),
    ];
    expect(validateSteps(steps)).toHaveLength(2);
  });
});

// ============================================================================
// Variables Array Validation Tests
// ============================================================================

describe('validateVariables', () => {
  test('returns empty array for empty input', () => {
    expect(validateVariables([])).toEqual([]);
  });

  test('returns validated variables', () => {
    const variables = [createTestVariable({ name: 'var1' }), createTestVariable({ name: 'var2' })];
    expect(validateVariables(variables)).toEqual(variables);
  });

  test('throws for non-array', () => {
    expect(() => validateVariables('not an array')).toThrow(ValidationError);
  });

  test('throws for too many variables', () => {
    const variables = Array.from({ length: MAX_VARIABLES + 1 }, (_, i) =>
      createTestVariable({ name: `var${i}` })
    );
    expect(() => validateVariables(variables)).toThrow(ValidationError);
  });

  test('throws for duplicate variable names', () => {
    const variables = [createTestVariable({ name: 'var1' }), createTestVariable({ name: 'var1' })];
    expect(() => validateVariables(variables)).toThrow(ConflictError);
  });
});

// ============================================================================
// Extends Array Validation Tests
// ============================================================================

describe('validateExtends', () => {
  test('returns undefined for undefined', () => {
    expect(validateExtends(undefined)).toBeUndefined();
  });

  test('returns undefined for null', () => {
    expect(validateExtends(null)).toBeUndefined();
  });

  test('returns validated extends array', () => {
    expect(validateExtends(['parent1', 'parent2'])).toEqual(['parent1', 'parent2']);
  });

  test('throws for non-array', () => {
    expect(() => validateExtends('not an array')).toThrow(ValidationError);
  });

  test('throws for too many extends', () => {
    const extends_ = Array.from({ length: MAX_EXTENDS + 1 }, (_, i) => `parent${i}`);
    expect(() => validateExtends(extends_)).toThrow(ValidationError);
  });

  test('throws for empty string in extends', () => {
    expect(() => validateExtends(['parent1', ''])).toThrow(ValidationError);
  });

  test('throws for duplicate parent names', () => {
    expect(() => validateExtends(['parent1', 'parent1'])).toThrow(ConflictError);
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('isPlaybook', () => {
  test('returns true for valid playbook', () => {
    expect(isPlaybook(createTestPlaybook())).toBe(true);
  });

  test('returns true for playbook with steps and variables', () => {
    const playbook = createTestPlaybook({
      steps: [createTestStep()],
      variables: [createTestVariable()],
    });
    expect(isPlaybook(playbook)).toBe(true);
  });

  test('returns false for non-object', () => {
    expect(isPlaybook(null)).toBe(false);
    expect(isPlaybook('playbook')).toBe(false);
  });

  test('returns false for wrong type', () => {
    expect(isPlaybook({ ...createTestPlaybook(), type: ElementType.TASK })).toBe(false);
  });

  test('returns false for invalid name', () => {
    expect(isPlaybook({ ...createTestPlaybook(), name: '' })).toBe(false);
  });

  test('returns false for invalid version', () => {
    expect(isPlaybook({ ...createTestPlaybook(), version: 0 })).toBe(false);
  });

  test('returns false for invalid steps', () => {
    expect(isPlaybook({ ...createTestPlaybook(), steps: 'invalid' })).toBe(false);
  });

  test('returns false for invalid variables', () => {
    expect(isPlaybook({ ...createTestPlaybook(), variables: 'invalid' })).toBe(false);
  });
});

describe('validatePlaybook', () => {
  test('returns valid playbook', () => {
    const playbook = createTestPlaybook();
    expect(validatePlaybook(playbook)).toEqual(playbook);
  });

  test('throws for non-object', () => {
    expect(() => validatePlaybook(null)).toThrow(ValidationError);
  });

  test('throws for missing id', () => {
    expect(() => validatePlaybook({ ...createTestPlaybook(), id: '' })).toThrow(ValidationError);
  });

  test('throws for wrong type', () => {
    expect(() => validatePlaybook({ ...createTestPlaybook(), type: 'task' })).toThrow(
      ValidationError
    );
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createPlaybook', () => {
  const validInput: CreatePlaybookInput = {
    name: 'my_playbook',
    title: 'My Playbook',
    createdBy: 'el-user1' as EntityId,
    steps: [],
    variables: [],
  };

  test('creates playbook with generated ID', async () => {
    const playbook = await createPlaybook(validInput);
    expect(playbook.id).toMatch(/^el-/);
    expect(playbook.type).toBe(ElementType.PLAYBOOK);
  });

  test('creates playbook with correct defaults', async () => {
    const playbook = await createPlaybook(validInput);
    expect(playbook.version).toBe(1);
    expect(playbook.tags).toEqual([]);
    expect(playbook.metadata).toEqual({});
  });

  test('creates playbook with provided values', async () => {
    const playbook = await createPlaybook({
      ...validInput,
      version: 2,
      tags: ['tag1'],
      metadata: { key: 'value' },
      extends: ['parent'],
    });
    expect(playbook.version).toBe(2);
    expect(playbook.tags).toEqual(['tag1']);
    expect(playbook.metadata).toEqual({ key: 'value' });
    expect(playbook.extends).toEqual(['parent']);
  });

  test('creates playbook with steps and variables', async () => {
    const playbook = await createPlaybook({
      ...validInput,
      steps: [createTestStep()],
      variables: [createTestVariable()],
    });
    expect(playbook.steps).toHaveLength(1);
    expect(playbook.variables).toHaveLength(1);
  });

  test('throws for self-extension', async () => {
    await expect(
      createPlaybook({
        ...validInput,
        extends: ['my_playbook'],
      })
    ).rejects.toThrow(ConflictError);
  });

  test('validates input', async () => {
    await expect(
      createPlaybook({
        ...validInput,
        name: '',
      })
    ).rejects.toThrow(ValidationError);
  });
});

// ============================================================================
// Update Function Tests
// ============================================================================

describe('updatePlaybook', () => {
  test('increments version on update', () => {
    const playbook = createTestPlaybook({ version: 1 });
    const updated = updatePlaybook(playbook, { title: 'New Title' });
    expect(updated.version).toBe(2);
  });

  test('updates title', () => {
    const playbook = createTestPlaybook();
    const updated = updatePlaybook(playbook, { title: 'New Title' });
    expect(updated.title).toBe('New Title');
  });

  test('updates steps', () => {
    const playbook = createTestPlaybook();
    const newSteps = [createTestStep({ id: 'new_step' })];
    const updated = updatePlaybook(playbook, { steps: newSteps });
    expect(updated.steps).toEqual(newSteps);
  });

  test('updates variables', () => {
    const playbook = createTestPlaybook();
    const newVars = [createTestVariable({ name: 'new_var' })];
    const updated = updatePlaybook(playbook, { variables: newVars });
    expect(updated.variables).toEqual(newVars);
  });

  test('updates extends', () => {
    const playbook = createTestPlaybook();
    const updated = updatePlaybook(playbook, { extends: ['parent1', 'parent2'] });
    expect(updated.extends).toEqual(['parent1', 'parent2']);
  });

  test('updates updatedAt timestamp', () => {
    const playbook = createTestPlaybook();
    const updated = updatePlaybook(playbook, { title: 'New' });
    expect(updated.updatedAt).not.toBe(playbook.updatedAt);
  });

  test('throws for self-extension in update', () => {
    const playbook = createTestPlaybook({ name: 'my_playbook' });
    expect(() => updatePlaybook(playbook, { extends: ['my_playbook'] })).toThrow(ConflictError);
  });

  test('preserves unmodified fields', () => {
    const playbook = createTestPlaybook({
      steps: [createTestStep()],
      variables: [createTestVariable()],
    });
    const updated = updatePlaybook(playbook, { title: 'New Title' });
    expect(updated.name).toBe(playbook.name);
    expect(updated.steps).toEqual(playbook.steps);
    expect(updated.variables).toEqual(playbook.variables);
  });
});

// ============================================================================
// Variable Resolution Tests
// ============================================================================

describe('resolveVariables', () => {
  test('resolves provided values', () => {
    const variables = [createTestVariable({ name: 'name', required: true, type: VT.STRING })];
    const resolved = resolveVariables(variables, { name: 'John' });
    expect(resolved.name).toBe('John');
  });

  test('uses default values', () => {
    const variables = [
      createTestVariable({ name: 'greeting', required: false, default: 'Hello' }),
    ];
    const resolved = resolveVariables(variables, {});
    expect(resolved.greeting).toBe('Hello');
  });

  test('throws for missing required variables', () => {
    const variables = [createTestVariable({ name: 'required_var', required: true })];
    expect(() => resolveVariables(variables, {})).toThrow(ValidationError);
  });

  test('skips optional variables without defaults', () => {
    const variables = [createTestVariable({ name: 'optional', required: false })];
    const resolved = resolveVariables(variables, {});
    expect('optional' in resolved).toBe(false);
  });

  test('validates type of provided values', () => {
    const variables = [createTestVariable({ name: 'count', type: VT.NUMBER, required: true })];
    expect(() => resolveVariables(variables, { count: 'not a number' })).toThrow(ValidationError);
  });

  test('validates enum constraints', () => {
    const variables = [
      createTestVariable({
        name: 'size',
        type: VT.STRING,
        required: true,
        enum: ['small', 'medium', 'large'],
      }),
    ];
    expect(() => resolveVariables(variables, { size: 'huge' })).toThrow(ValidationError);
  });

  test('accepts valid enum values', () => {
    const variables = [
      createTestVariable({
        name: 'size',
        type: VT.STRING,
        required: true,
        enum: ['small', 'medium', 'large'],
      }),
    ];
    const resolved = resolveVariables(variables, { size: 'medium' });
    expect(resolved.size).toBe('medium');
  });

  test('resolves number variables', () => {
    const variables = [createTestVariable({ name: 'count', type: VT.NUMBER, required: true })];
    const resolved = resolveVariables(variables, { count: 42 });
    expect(resolved.count).toBe(42);
  });

  test('resolves boolean variables', () => {
    const variables = [createTestVariable({ name: 'enabled', type: VT.BOOLEAN, required: true })];
    const resolved = resolveVariables(variables, { enabled: true });
    expect(resolved.enabled).toBe(true);
  });
});

describe('getVariableNames', () => {
  test('returns all variable names', () => {
    const variables = [createTestVariable({ name: 'a' }), createTestVariable({ name: 'b' })];
    expect(getVariableNames(variables)).toEqual(['a', 'b']);
  });

  test('returns empty array for no variables', () => {
    expect(getVariableNames([])).toEqual([]);
  });
});

describe('getRequiredVariableNames', () => {
  test('returns only required variable names', () => {
    const variables = [
      createTestVariable({ name: 'req', required: true }),
      createTestVariable({ name: 'opt', required: false }),
    ];
    expect(getRequiredVariableNames(variables)).toEqual(['req']);
  });
});

describe('getOptionalVariableNames', () => {
  test('returns only optional variable names', () => {
    const variables = [
      createTestVariable({ name: 'req', required: true }),
      createTestVariable({ name: 'opt', required: false }),
    ];
    expect(getOptionalVariableNames(variables)).toEqual(['opt']);
  });
});

// ============================================================================
// Condition System Tests
// ============================================================================

describe('isTruthy', () => {
  test('returns false for undefined', () => {
    expect(isTruthy(undefined)).toBe(false);
  });

  test('returns false for null', () => {
    expect(isTruthy(null)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isTruthy('')).toBe(false);
  });

  test('returns false for "false" (case insensitive)', () => {
    expect(isTruthy('false')).toBe(false);
    expect(isTruthy('FALSE')).toBe(false);
    expect(isTruthy('False')).toBe(false);
  });

  test('returns false for "0"', () => {
    expect(isTruthy('0')).toBe(false);
    expect(isTruthy(0)).toBe(false);
  });

  test('returns false for "no" (case insensitive)', () => {
    expect(isTruthy('no')).toBe(false);
    expect(isTruthy('NO')).toBe(false);
  });

  test('returns false for "off" (case insensitive)', () => {
    expect(isTruthy('off')).toBe(false);
    expect(isTruthy('OFF')).toBe(false);
  });

  test('returns true for non-empty strings', () => {
    expect(isTruthy('hello')).toBe(true);
    expect(isTruthy('true')).toBe(true);
    expect(isTruthy('yes')).toBe(true);
  });

  test('returns true for non-zero numbers', () => {
    expect(isTruthy(1)).toBe(true);
    expect(isTruthy(-1)).toBe(true);
    expect(isTruthy(0.1)).toBe(true);
  });

  test('returns true for boolean true', () => {
    expect(isTruthy(true)).toBe(true);
  });

  test('returns false for boolean false', () => {
    expect(isTruthy(false)).toBe(false);
  });
});

describe('parseCondition', () => {
  test('parses truthy condition', () => {
    const result = parseCondition('{{enabled}}');
    expect(result).toEqual({ operator: 'truthy', variableName: 'enabled' });
  });

  test('parses negation condition', () => {
    const result = parseCondition('!{{disabled}}');
    expect(result).toEqual({ operator: 'not', variableName: 'disabled' });
  });

  test('parses equals condition', () => {
    const result = parseCondition('{{env}} == production');
    expect(result).toEqual({
      operator: 'equals',
      variableName: 'env',
      compareValue: 'production',
    });
  });

  test('parses not-equals condition', () => {
    const result = parseCondition('{{env}} != development');
    expect(result).toEqual({
      operator: 'notEquals',
      variableName: 'env',
      compareValue: 'development',
    });
  });

  test('handles whitespace in expressions', () => {
    expect(parseCondition('  {{var}}  ')).toEqual({
      operator: 'truthy',
      variableName: 'var',
    });
    expect(parseCondition('{{var}}  ==  value')).toEqual({
      operator: 'equals',
      variableName: 'var',
      compareValue: 'value',
    });
  });

  test('throws for invalid syntax', () => {
    expect(() => parseCondition('invalid')).toThrow(ValidationError);
    expect(() => parseCondition('{{}} == value')).toThrow(ValidationError);
    expect(() => parseCondition('var == value')).toThrow(ValidationError);
  });
});

describe('evaluateCondition', () => {
  test('evaluates truthy conditions', () => {
    expect(evaluateCondition('{{enabled}}', { enabled: 'yes' })).toBe(true);
    expect(evaluateCondition('{{enabled}}', { enabled: '' })).toBe(false);
  });

  test('evaluates negation conditions', () => {
    expect(evaluateCondition('!{{disabled}}', { disabled: '' })).toBe(true);
    expect(evaluateCondition('!{{disabled}}', { disabled: 'yes' })).toBe(false);
  });

  test('evaluates equals conditions', () => {
    expect(evaluateCondition('{{env}} == prod', { env: 'prod' })).toBe(true);
    expect(evaluateCondition('{{env}} == prod', { env: 'dev' })).toBe(false);
  });

  test('evaluates not-equals conditions', () => {
    expect(evaluateCondition('{{env}} != dev', { env: 'prod' })).toBe(true);
    expect(evaluateCondition('{{env}} != dev', { env: 'dev' })).toBe(false);
  });

  test('handles missing variables', () => {
    expect(evaluateCondition('{{missing}}', {})).toBe(false);
    expect(evaluateCondition('!{{missing}}', {})).toBe(true);
    expect(evaluateCondition('{{missing}} == value', {})).toBe(false);
  });
});

// ============================================================================
// Substitution System Tests
// ============================================================================

describe('extractVariableNames', () => {
  test('extracts variable names from template', () => {
    const template = 'Hello {{name}}, welcome to {{place}}!';
    expect(extractVariableNames(template)).toEqual(['name', 'place']);
  });

  test('returns unique names', () => {
    const template = '{{name}} and {{name}} again';
    expect(extractVariableNames(template)).toEqual(['name']);
  });

  test('returns empty array for no variables', () => {
    expect(extractVariableNames('No variables here')).toEqual([]);
  });
});

describe('substituteVariables', () => {
  test('substitutes variables in template', () => {
    const result = substituteVariables('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  test('substitutes multiple variables', () => {
    const result = substituteVariables('{{greeting}}, {{name}}!', {
      greeting: 'Hello',
      name: 'World',
    });
    expect(result).toBe('Hello, World!');
  });

  test('converts numbers to strings', () => {
    const result = substituteVariables('Count: {{count}}', { count: 42 });
    expect(result).toBe('Count: 42');
  });

  test('converts booleans to strings', () => {
    const result = substituteVariables('Enabled: {{enabled}}', { enabled: true });
    expect(result).toBe('Enabled: true');
  });

  test('throws for missing variable by default', () => {
    expect(() => substituteVariables('Hello {{missing}}!', {})).toThrow(ValidationError);
  });

  test('replaces missing with empty string when allowMissing is true', () => {
    const result = substituteVariables('Hello {{missing}}!', {}, true);
    expect(result).toBe('Hello !');
  });
});

describe('hasVariables', () => {
  test('returns true for template with variables', () => {
    expect(hasVariables('Hello {{name}}')).toBe(true);
  });

  test('returns false for template without variables', () => {
    expect(hasVariables('Hello World')).toBe(false);
  });

  test('returns false for invalid variable syntax', () => {
    expect(hasVariables('Hello {name}')).toBe(false);
  });
});

describe('filterStepsByConditions', () => {
  test('includes steps without conditions', () => {
    const steps = [createTestStep({ id: 'step1' })];
    const result = filterStepsByConditions(steps, {});
    expect(result).toHaveLength(1);
  });

  test('includes steps with truthy conditions', () => {
    const steps = [createTestStep({ id: 'step1', condition: '{{enabled}}' })];
    const result = filterStepsByConditions(steps, { enabled: 'yes' });
    expect(result).toHaveLength(1);
  });

  test('excludes steps with falsy conditions', () => {
    const steps = [createTestStep({ id: 'step1', condition: '{{enabled}}' })];
    const result = filterStepsByConditions(steps, { enabled: '' });
    expect(result).toHaveLength(0);
  });

  test('filters mixed conditions correctly', () => {
    const steps = [
      createTestStep({ id: 'always' }),
      createTestStep({ id: 'when_enabled', condition: '{{enabled}}' }),
      createTestStep({ id: 'when_disabled', condition: '!{{enabled}}' }),
    ];
    const result = filterStepsByConditions(steps, { enabled: 'yes' });
    expect(result.map((s) => s.id)).toEqual(['always', 'when_enabled']);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('getStepById', () => {
  test('returns step with matching ID', () => {
    const playbook = createTestPlaybook({
      steps: [createTestStep({ id: 'step1' }), createTestStep({ id: 'step2' })],
    });
    const step = getStepById(playbook, 'step2');
    expect(step?.id).toBe('step2');
  });

  test('returns undefined for non-existent ID', () => {
    const playbook = createTestPlaybook({ steps: [createTestStep({ id: 'step1' })] });
    expect(getStepById(playbook, 'missing')).toBeUndefined();
  });
});

describe('getVariableByName', () => {
  test('returns variable with matching name', () => {
    const playbook = createTestPlaybook({
      variables: [createTestVariable({ name: 'var1' }), createTestVariable({ name: 'var2' })],
    });
    const variable = getVariableByName(playbook, 'var2');
    expect(variable?.name).toBe('var2');
  });

  test('returns undefined for non-existent name', () => {
    const playbook = createTestPlaybook({
      variables: [createTestVariable({ name: 'var1' })],
    });
    expect(getVariableByName(playbook, 'missing')).toBeUndefined();
  });
});

describe('hasPlaybookVariables', () => {
  test('returns true when playbook has variables', () => {
    const playbook = createTestPlaybook({ variables: [createTestVariable()] });
    expect(hasPlaybookVariables(playbook)).toBe(true);
  });

  test('returns false when playbook has no variables', () => {
    const playbook = createTestPlaybook({ variables: [] });
    expect(hasPlaybookVariables(playbook)).toBe(false);
  });
});

describe('hasSteps', () => {
  test('returns true when playbook has steps', () => {
    const playbook = createTestPlaybook({ steps: [createTestStep()] });
    expect(hasSteps(playbook)).toBe(true);
  });

  test('returns false when playbook has no steps', () => {
    const playbook = createTestPlaybook({ steps: [] });
    expect(hasSteps(playbook)).toBe(false);
  });
});

describe('hasParents', () => {
  test('returns true when playbook extends others', () => {
    const playbook = createTestPlaybook({ extends: ['parent'] });
    expect(hasParents(playbook)).toBe(true);
  });

  test('returns false when playbook has no extends', () => {
    const playbook = createTestPlaybook();
    expect(hasParents(playbook)).toBe(false);
  });

  test('returns false when extends is empty array', () => {
    const playbook = createTestPlaybook({ extends: [] });
    expect(hasParents(playbook)).toBe(false);
  });
});

describe('hasDescription', () => {
  test('returns true when playbook has descriptionRef', () => {
    const playbook = createTestPlaybook({ descriptionRef: 'el-doc1' as DocumentId });
    expect(hasDescription(playbook)).toBe(true);
  });

  test('returns false when playbook has no descriptionRef', () => {
    const playbook = createTestPlaybook();
    expect(hasDescription(playbook)).toBe(false);
  });
});

describe('getStepCount', () => {
  test('returns number of steps', () => {
    const playbook = createTestPlaybook({
      steps: [createTestStep({ id: 'step1' }), createTestStep({ id: 'step2' })],
    });
    expect(getStepCount(playbook)).toBe(2);
  });
});

describe('getVariableCount', () => {
  test('returns number of variables', () => {
    const playbook = createTestPlaybook({
      variables: [createTestVariable({ name: 'var1' }), createTestVariable({ name: 'var2' })],
    });
    expect(getVariableCount(playbook)).toBe(2);
  });
});

// ============================================================================
// Filter Function Tests
// ============================================================================

describe('filterByNamePattern', () => {
  test('filters playbooks by name pattern', () => {
    const playbooks = [
      createTestPlaybook({ name: 'deploy_prod' }),
      createTestPlaybook({ name: 'deploy_staging' }),
      createTestPlaybook({ name: 'build_app' }),
    ];
    const result = filterByNamePattern(playbooks, /^deploy/);
    expect(result).toHaveLength(2);
  });
});

describe('filterByVariable', () => {
  test('filters playbooks containing a specific variable', () => {
    const playbooks = [
      createTestPlaybook({
        name: 'p1',
        variables: [createTestVariable({ name: 'env' })],
      }),
      createTestPlaybook({
        name: 'p2',
        variables: [createTestVariable({ name: 'other' })],
      }),
    ];
    const result = filterByVariable(playbooks, 'env');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('p1');
  });
});

// ============================================================================
// Sort Function Tests
// ============================================================================

describe('sortByName', () => {
  test('sorts playbooks by name alphabetically', () => {
    const playbooks = [
      createTestPlaybook({ name: 'charlie' }),
      createTestPlaybook({ name: 'alpha' }),
      createTestPlaybook({ name: 'bravo' }),
    ];
    const sorted = sortByName(playbooks);
    expect(sorted.map((p) => p.name)).toEqual(['alpha', 'bravo', 'charlie']);
  });
});

describe('sortByVersion', () => {
  test('sorts playbooks by version descending', () => {
    const playbooks = [
      createTestPlaybook({ name: 'p1', version: 1 }),
      createTestPlaybook({ name: 'p2', version: 3 }),
      createTestPlaybook({ name: 'p3', version: 2 }),
    ];
    const sorted = sortByVersion(playbooks);
    expect(sorted.map((p) => p.version)).toEqual([3, 2, 1]);
  });
});

describe('sortPlaybooksByCreatedAtDesc', () => {
  test('sorts playbooks by creation date (newest first)', () => {
    const playbooks = [
      createTestPlaybook({ name: 'oldest', createdAt: '2025-01-01T00:00:00.000Z' as Timestamp }),
      createTestPlaybook({ name: 'newest', createdAt: '2025-01-03T00:00:00.000Z' as Timestamp }),
      createTestPlaybook({ name: 'middle', createdAt: '2025-01-02T00:00:00.000Z' as Timestamp }),
    ];
    const sorted = sortPlaybooksByCreatedAtDesc(playbooks);
    expect(sorted.map((p) => p.name)).toEqual(['newest', 'middle', 'oldest']);
  });
});

describe('sortPlaybooksByCreatedAtAsc', () => {
  test('sorts playbooks by creation date (oldest first)', () => {
    const playbooks = [
      createTestPlaybook({ name: 'oldest', createdAt: '2025-01-01T00:00:00.000Z' as Timestamp }),
      createTestPlaybook({ name: 'newest', createdAt: '2025-01-03T00:00:00.000Z' as Timestamp }),
      createTestPlaybook({ name: 'middle', createdAt: '2025-01-02T00:00:00.000Z' as Timestamp }),
    ];
    const sorted = sortPlaybooksByCreatedAtAsc(playbooks);
    expect(sorted.map((p) => p.name)).toEqual(['oldest', 'middle', 'newest']);
  });
});

describe('sortByStepCount', () => {
  test('sorts playbooks by step count (most steps first)', () => {
    const playbooks = [
      createTestPlaybook({ name: 'few', steps: [createTestStep()] }),
      createTestPlaybook({
        name: 'many',
        steps: [
          createTestStep({ id: 's1' }),
          createTestStep({ id: 's2' }),
          createTestStep({ id: 's3' }),
        ],
      }),
      createTestPlaybook({
        name: 'some',
        steps: [createTestStep({ id: 's1' }), createTestStep({ id: 's2' })],
      }),
    ];
    const sorted = sortByStepCount(playbooks);
    expect(sorted.map((p) => p.name)).toEqual(['many', 'some', 'few']);
  });
});

// ============================================================================
// Group Function Tests
// ============================================================================

describe('groupByHasParents', () => {
  test('groups playbooks by whether they have parents', () => {
    const playbooks = [
      createTestPlaybook({ name: 'standalone1' }),
      createTestPlaybook({ name: 'child1', extends: ['parent'] }),
      createTestPlaybook({ name: 'standalone2' }),
      createTestPlaybook({ name: 'child2', extends: ['parent'] }),
    ];
    const groups = groupByHasParents(playbooks);
    expect(groups.standalone).toHaveLength(2);
    expect(groups.extended).toHaveLength(2);
  });
});

describe('getAllParentNames', () => {
  test('returns all unique parent names', () => {
    const playbooks = [
      createTestPlaybook({ name: 'child1', extends: ['parent1', 'parent2'] }),
      createTestPlaybook({ name: 'child2', extends: ['parent1', 'parent3'] }),
      createTestPlaybook({ name: 'standalone' }),
    ];
    const parents = getAllParentNames(playbooks);
    expect(parents.sort()).toEqual(['parent1', 'parent2', 'parent3']);
  });
});

describe('findChildPlaybooks', () => {
  test('finds playbooks that extend a given parent', () => {
    const playbooks = [
      createTestPlaybook({ name: 'child1', extends: ['parent1'] }),
      createTestPlaybook({ name: 'child2', extends: ['parent1', 'parent2'] }),
      createTestPlaybook({ name: 'other', extends: ['parent2'] }),
      createTestPlaybook({ name: 'standalone' }),
    ];
    const children = findChildPlaybooks(playbooks, 'parent1');
    expect(children.map((p) => p.name).sort()).toEqual(['child1', 'child2']);
  });

  test('returns empty array when no children found', () => {
    const playbooks = [createTestPlaybook({ name: 'standalone' })];
    const children = findChildPlaybooks(playbooks, 'nonexistent');
    expect(children).toHaveLength(0);
  });
});

// ============================================================================
// findByName Tests
// ============================================================================

describe('findByName', () => {
  test('finds playbook by exact name', () => {
    const playbooks = [
      createTestPlaybook({ name: 'alpha' }),
      createTestPlaybook({ name: 'bravo' }),
      createTestPlaybook({ name: 'charlie' }),
    ];
    const found = findByName(playbooks, 'bravo');
    expect(found).toBeDefined();
    expect(found?.name).toBe('bravo');
  });

  test('finds playbook case-insensitively', () => {
    const playbooks = [createTestPlaybook({ name: 'MyPlaybook' })];
    expect(findByName(playbooks, 'myplaybook')).toBeDefined();
    expect(findByName(playbooks, 'MYPLAYBOOK')).toBeDefined();
    expect(findByName(playbooks, 'MyPlaybook')).toBeDefined();
  });

  test('returns undefined when not found', () => {
    const playbooks = [createTestPlaybook({ name: 'alpha' })];
    expect(findByName(playbooks, 'nonexistent')).toBeUndefined();
  });

  test('returns undefined for empty array', () => {
    expect(findByName([], 'anything')).toBeUndefined();
  });
});

// ============================================================================
// Playbook Inheritance Tests
// ============================================================================

describe('mergeVariables', () => {
  test('returns empty array for empty chain', () => {
    const result = mergeVariables([]);
    expect(result).toEqual([]);
  });

  test('returns variables from single playbook', () => {
    const playbook = createTestPlaybook({
      name: 'single',
      variables: [
        createTestVariable({ name: 'var1' }),
        createTestVariable({ name: 'var2' }),
      ],
    });
    const result = mergeVariables([playbook]);
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.name)).toEqual(['var1', 'var2']);
  });

  test('merges variables from parent and child (child overrides)', () => {
    const parent = createTestPlaybook({
      name: 'parent',
      variables: [
        createTestVariable({ name: 'shared', type: VT.STRING, description: 'parent' }),
        createTestVariable({ name: 'parentOnly', description: 'from parent' }),
      ],
    });
    const child = createTestPlaybook({
      name: 'child',
      extends: ['parent'],
      variables: [
        createTestVariable({ name: 'shared', type: VT.NUMBER, description: 'child' }),
        createTestVariable({ name: 'childOnly', description: 'from child' }),
      ],
    });
    const result = mergeVariables([parent, child]);
    expect(result).toHaveLength(3);

    // Child's definition should override parent's
    const shared = result.find((v) => v.name === 'shared');
    expect(shared?.type).toBe(VT.NUMBER);
    expect(shared?.description).toBe('child');

    // Both exclusive vars should be present
    expect(result.find((v) => v.name === 'parentOnly')).toBeDefined();
    expect(result.find((v) => v.name === 'childOnly')).toBeDefined();
  });

  test('merges multiple parent playbooks (left to right)', () => {
    const base = createTestPlaybook({
      name: 'base',
      variables: [createTestVariable({ name: 'var1', description: 'base' })],
    });
    const mixin1 = createTestPlaybook({
      name: 'mixin1',
      variables: [
        createTestVariable({ name: 'var1', description: 'mixin1' }),
        createTestVariable({ name: 'var2', description: 'mixin1' }),
      ],
    });
    const mixin2 = createTestPlaybook({
      name: 'mixin2',
      variables: [
        createTestVariable({ name: 'var2', description: 'mixin2' }),
        createTestVariable({ name: 'var3', description: 'mixin2' }),
      ],
    });
    const result = mergeVariables([base, mixin1, mixin2]);
    expect(result).toHaveLength(3);

    // Later playbooks override earlier ones
    expect(result.find((v) => v.name === 'var1')?.description).toBe('mixin1');
    expect(result.find((v) => v.name === 'var2')?.description).toBe('mixin2');
    expect(result.find((v) => v.name === 'var3')?.description).toBe('mixin2');
  });
});

describe('mergeSteps', () => {
  test('returns empty array for empty chain', () => {
    const result = mergeSteps([]);
    expect(result).toEqual([]);
  });

  test('returns steps from single playbook', () => {
    const playbook = createTestPlaybook({
      name: 'single',
      steps: [
        createTestStep({ id: 'step1' }),
        createTestStep({ id: 'step2' }),
      ],
    });
    const result = mergeSteps([playbook]);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(['step1', 'step2']);
  });

  test('merges steps from parent and child (child overrides same ID)', () => {
    const parent = createTestPlaybook({
      name: 'parent',
      steps: [
        createTestStep({ id: 'shared', title: 'Parent Shared' }),
        createTestStep({ id: 'parentOnly', title: 'Parent Only' }),
      ],
    });
    const child = createTestPlaybook({
      name: 'child',
      extends: ['parent'],
      steps: [
        createTestStep({ id: 'shared', title: 'Child Shared' }),
        createTestStep({ id: 'childOnly', title: 'Child Only' }),
      ],
    });
    const result = mergeSteps([parent, child]);
    expect(result).toHaveLength(3);

    // Child's step should override parent's (but keep order)
    const shared = result.find((s) => s.id === 'shared');
    expect(shared?.title).toBe('Child Shared');

    // Both exclusive steps should be present
    expect(result.find((s) => s.id === 'parentOnly')).toBeDefined();
    expect(result.find((s) => s.id === 'childOnly')).toBeDefined();
  });

  test('preserves step order from parent', () => {
    const parent = createTestPlaybook({
      name: 'parent',
      steps: [
        createTestStep({ id: 'step1', title: 'First' }),
        createTestStep({ id: 'step2', title: 'Second' }),
        createTestStep({ id: 'step3', title: 'Third' }),
      ],
    });
    const child = createTestPlaybook({
      name: 'child',
      extends: ['parent'],
      steps: [
        createTestStep({ id: 'step2', title: 'Modified Second' }),
        createTestStep({ id: 'step4', title: 'Fourth' }),
      ],
    });
    const result = mergeSteps([parent, child]);

    // Order should be: step1, step2, step3 (from parent), step4 (new from child)
    expect(result.map((s) => s.id)).toEqual(['step1', 'step2', 'step3', 'step4']);
    expect(result[1].title).toBe('Modified Second');
  });

  test('handles deep inheritance chain', () => {
    const grandparent = createTestPlaybook({
      name: 'grandparent',
      steps: [createTestStep({ id: 's1', title: 'GP' })],
    });
    const parent = createTestPlaybook({
      name: 'parent',
      extends: ['grandparent'],
      steps: [createTestStep({ id: 's2', title: 'P' })],
    });
    const child = createTestPlaybook({
      name: 'child',
      extends: ['parent'],
      steps: [createTestStep({ id: 's3', title: 'C' })],
    });
    const result = mergeSteps([grandparent, parent, child]);
    expect(result.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });
});

describe('validateMergedSteps', () => {
  test('passes for valid steps', () => {
    const steps: PlaybookStep[] = [
      createTestStep({ id: 'step1' }),
      createTestStep({ id: 'step2', dependsOn: ['step1'] }),
    ];
    expect(() => validateMergedSteps(steps)).not.toThrow();
  });

  test('throws on self-dependency', () => {
    const steps: PlaybookStep[] = [
      createTestStep({ id: 'step1', dependsOn: ['step1'] }),
    ];
    expect(() => validateMergedSteps(steps)).toThrow(ConflictError);
  });

  test('throws on unknown dependency reference', () => {
    const steps: PlaybookStep[] = [
      createTestStep({ id: 'step1', dependsOn: ['nonexistent'] }),
    ];
    expect(() => validateMergedSteps(steps)).toThrow(NotFoundError);
  });

  test('passes for empty steps array', () => {
    expect(() => validateMergedSteps([])).not.toThrow();
  });
});

describe('resolveInheritanceChain', () => {
  test('returns single-element chain for playbook without extends', async () => {
    const playbook = createTestPlaybook({ name: 'standalone' });
    const loader = createPlaybookLoader([playbook]);
    const result = await resolveInheritanceChain(playbook, loader);

    expect(result.chain).toHaveLength(1);
    expect(result.chain[0].name).toBe('standalone');
    expect(result.names.size).toBe(1);
  });

  test('resolves simple parent-child relationship', async () => {
    const parent = createTestPlaybook({ name: 'parent' });
    const child = createTestPlaybook({ name: 'child', extends: ['parent'] });
    const loader = createPlaybookLoader([parent, child]);

    const result = await resolveInheritanceChain(child, loader);

    // Chain should be: parent, child (root ancestors first)
    expect(result.chain).toHaveLength(2);
    expect(result.chain[0].name).toBe('parent');
    expect(result.chain[1].name).toBe('child');
  });

  test('resolves deep inheritance chain', async () => {
    const grandparent = createTestPlaybook({ name: 'grandparent' });
    const parent = createTestPlaybook({ name: 'parent', extends: ['grandparent'] });
    const child = createTestPlaybook({ name: 'child', extends: ['parent'] });
    const loader = createPlaybookLoader([grandparent, parent, child]);

    const result = await resolveInheritanceChain(child, loader);

    expect(result.chain).toHaveLength(3);
    expect(result.chain.map((p) => p.name)).toEqual(['grandparent', 'parent', 'child']);
  });

  test('resolves multiple parents (left to right)', async () => {
    const parentA = createTestPlaybook({ name: 'parentA' });
    const parentB = createTestPlaybook({ name: 'parentB' });
    const child = createTestPlaybook({ name: 'child', extends: ['parentA', 'parentB'] });
    const loader = createPlaybookLoader([parentA, parentB, child]);

    const result = await resolveInheritanceChain(child, loader);

    expect(result.chain).toHaveLength(3);
    // Parents should appear in extends order
    expect(result.chain[0].name).toBe('parentA');
    expect(result.chain[1].name).toBe('parentB');
    expect(result.chain[2].name).toBe('child');
  });

  test('handles diamond inheritance (grandparent loaded once)', async () => {
    const base = createTestPlaybook({ name: 'base' });
    const mixin1 = createTestPlaybook({ name: 'mixin1', extends: ['base'] });
    const mixin2 = createTestPlaybook({ name: 'mixin2', extends: ['base'] });
    const child = createTestPlaybook({ name: 'child', extends: ['mixin1', 'mixin2'] });
    const loader = createPlaybookLoader([base, mixin1, mixin2, child]);

    const result = await resolveInheritanceChain(child, loader);

    // base should appear only once
    expect(result.chain.filter((p) => p.name === 'base')).toHaveLength(1);
    expect(result.names.size).toBe(4);
  });

  test('throws on circular inheritance', async () => {
    const a = createTestPlaybook({ name: 'a', extends: ['b'] });
    const b = createTestPlaybook({ name: 'b', extends: ['a'] });
    const loader = createPlaybookLoader([a, b]);

    await expect(resolveInheritanceChain(a, loader)).rejects.toThrow(ConflictError);
  });

  test('throws on self-extension', async () => {
    const self = createTestPlaybook({ name: 'self', extends: ['self'] });
    const loader = createPlaybookLoader([self]);

    await expect(resolveInheritanceChain(self, loader)).rejects.toThrow(ConflictError);
  });

  test('throws when parent not found', async () => {
    const child = createTestPlaybook({ name: 'child', extends: ['nonexistent'] });
    const loader = createPlaybookLoader([child]);

    await expect(resolveInheritanceChain(child, loader)).rejects.toThrow(NotFoundError);
  });

  test('works with async loader', async () => {
    const parent = createTestPlaybook({ name: 'parent' });
    const child = createTestPlaybook({ name: 'child', extends: ['parent'] });
    const asyncLoader: PlaybookLoader = async (name) => {
      // Simulate async operation
      await new Promise((resolve) => setTimeout(resolve, 1));
      return [parent, child].find((p) => p.name.toLowerCase() === name.toLowerCase());
    };

    const result = await resolveInheritanceChain(child, asyncLoader);
    expect(result.chain).toHaveLength(2);
  });
});

describe('resolvePlaybookInheritance', () => {
  test('returns original for playbook without extends', async () => {
    const playbook = createTestPlaybook({
      name: 'standalone',
      variables: [createTestVariable({ name: 'v1' })],
      steps: [createTestStep({ id: 's1' })],
    });
    const loader = createPlaybookLoader([playbook]);

    const result = await resolvePlaybookInheritance(playbook, loader);

    expect(result.original).toBe(playbook);
    expect(result.variables).toEqual(playbook.variables);
    expect(result.steps).toEqual(playbook.steps);
    expect(result.inheritanceChain).toHaveLength(1);
  });

  test('merges variables and steps from parent', async () => {
    const parent = createTestPlaybook({
      name: 'parent',
      variables: [
        createTestVariable({ name: 'parentVar', description: 'from parent' }),
      ],
      steps: [
        createTestStep({ id: 'parentStep', title: 'Parent Step' }),
      ],
    });
    const child = createTestPlaybook({
      name: 'child',
      extends: ['parent'],
      variables: [
        createTestVariable({ name: 'childVar', description: 'from child' }),
      ],
      steps: [
        createTestStep({ id: 'childStep', title: 'Child Step' }),
      ],
    });
    const loader = createPlaybookLoader([parent, child]);

    const result = await resolvePlaybookInheritance(child, loader);

    expect(result.variables).toHaveLength(2);
    expect(result.variables.map((v) => v.name).sort()).toEqual(['childVar', 'parentVar']);

    expect(result.steps).toHaveLength(2);
    expect(result.steps.map((s) => s.id)).toEqual(['parentStep', 'childStep']);
  });

  test('child overrides parent variables with same name', async () => {
    const parent = createTestPlaybook({
      name: 'parent',
      variables: [
        createTestVariable({ name: 'shared', type: VT.STRING, default: 'parent default' }),
      ],
      steps: [],
    });
    const child = createTestPlaybook({
      name: 'child',
      extends: ['parent'],
      variables: [
        createTestVariable({ name: 'shared', type: VT.NUMBER, default: 42 }),
      ],
      steps: [],
    });
    const loader = createPlaybookLoader([parent, child]);

    const result = await resolvePlaybookInheritance(child, loader);

    expect(result.variables).toHaveLength(1);
    expect(result.variables[0].type).toBe(VT.NUMBER);
    expect(result.variables[0].default).toBe(42);
  });

  test('child overrides parent steps with same ID', async () => {
    const parent = createTestPlaybook({
      name: 'parent',
      variables: [],
      steps: [createTestStep({ id: 'shared', title: 'Parent Title' })],
    });
    const child = createTestPlaybook({
      name: 'child',
      extends: ['parent'],
      variables: [],
      steps: [createTestStep({ id: 'shared', title: 'Child Title' })],
    });
    const loader = createPlaybookLoader([parent, child]);

    const result = await resolvePlaybookInheritance(child, loader);

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].title).toBe('Child Title');
  });

  test('validates merged steps dependencies', async () => {
    const parent = createTestPlaybook({
      name: 'parent',
      variables: [],
      steps: [createTestStep({ id: 'parentStep' })],
    });
    const child = createTestPlaybook({
      name: 'child',
      extends: ['parent'],
      variables: [],
      steps: [createTestStep({ id: 'childStep', dependsOn: ['nonexistent'] })],
    });
    const loader = createPlaybookLoader([parent, child]);

    await expect(resolvePlaybookInheritance(child, loader)).rejects.toThrow(NotFoundError);
  });

  test('allows valid cross-playbook dependencies', async () => {
    const parent = createTestPlaybook({
      name: 'parent',
      variables: [],
      steps: [createTestStep({ id: 'parentStep' })],
    });
    const child = createTestPlaybook({
      name: 'child',
      extends: ['parent'],
      variables: [],
      steps: [createTestStep({ id: 'childStep', dependsOn: ['parentStep'] })],
    });
    const loader = createPlaybookLoader([parent, child]);

    const result = await resolvePlaybookInheritance(child, loader);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].dependsOn).toContain('parentStep');
  });

  test('handles complex diamond inheritance', async () => {
    // base -> [mixin1, mixin2] -> child
    const base = createTestPlaybook({
      name: 'base',
      variables: [createTestVariable({ name: 'baseVar', description: 'base' })],
      steps: [createTestStep({ id: 'baseStep', title: 'Base' })],
    });
    const mixin1 = createTestPlaybook({
      name: 'mixin1',
      extends: ['base'],
      variables: [
        createTestVariable({ name: 'baseVar', description: 'mixin1' }),
        createTestVariable({ name: 'mixin1Var' }),
      ],
      steps: [createTestStep({ id: 'mixin1Step' })],
    });
    const mixin2 = createTestPlaybook({
      name: 'mixin2',
      extends: ['base'],
      variables: [
        createTestVariable({ name: 'baseVar', description: 'mixin2' }),
        createTestVariable({ name: 'mixin2Var' }),
      ],
      steps: [createTestStep({ id: 'mixin2Step' })],
    });
    const child = createTestPlaybook({
      name: 'child',
      extends: ['mixin1', 'mixin2'],
      variables: [createTestVariable({ name: 'childVar' })],
      steps: [createTestStep({ id: 'childStep' })],
    });
    const loader = createPlaybookLoader([base, mixin1, mixin2, child]);

    const result = await resolvePlaybookInheritance(child, loader);

    // Variables: baseVar (overridden by mixin2), mixin1Var, mixin2Var, childVar
    expect(result.variables).toHaveLength(4);
    const baseVar = result.variables.find((v) => v.name === 'baseVar');
    expect(baseVar?.description).toBe('mixin2'); // mixin2 came after mixin1

    // Steps: baseStep, mixin1Step, mixin2Step, childStep
    expect(result.steps).toHaveLength(4);
    expect(result.steps.map((s) => s.id)).toEqual([
      'baseStep',
      'mixin1Step',
      'mixin2Step',
      'childStep',
    ]);

    // Inheritance chain should include all 4 playbooks
    expect(result.inheritanceChain).toHaveLength(4);
  });
});

describe('createPlaybookLoader', () => {
  test('creates loader from playbook array', () => {
    const playbooks = [
      createTestPlaybook({ name: 'alpha' }),
      createTestPlaybook({ name: 'bravo' }),
    ];
    const loader = createPlaybookLoader(playbooks);

    expect(loader('alpha')).toBeDefined();
    expect(loader('bravo')).toBeDefined();
    expect(loader('charlie')).toBeUndefined();
  });

  test('loader is case-insensitive', () => {
    const playbooks = [createTestPlaybook({ name: 'MyPlaybook' })];
    const loader = createPlaybookLoader(playbooks);

    expect(loader('myplaybook')).toBeDefined();
    expect(loader('MYPLAYBOOK')).toBeDefined();
  });
});

// ============================================================================
// validateNoCircularInheritance Tests
// ============================================================================

describe('validateNoCircularInheritance', () => {
  test('returns valid for playbook with no extends', async () => {
    const loader = createPlaybookLoader([]);
    const result = await validateNoCircularInheritance('new_playbook', undefined, loader);
    expect(result.valid).toBe(true);
  });

  test('returns valid for playbook with empty extends array', async () => {
    const loader = createPlaybookLoader([]);
    const result = await validateNoCircularInheritance('new_playbook', [], loader);
    expect(result.valid).toBe(true);
  });

  test('returns invalid for self-extension', async () => {
    const loader = createPlaybookLoader([]);
    const result = await validateNoCircularInheritance('self_extend', ['self_extend'], loader);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('cannot extend itself');
      expect(result.cycle).toEqual(['self_extend', 'self_extend']);
    }
  });

  test('returns valid when extending non-existent playbook (no cycle possible)', async () => {
    const loader = createPlaybookLoader([]);
    // Extending a non-existent playbook is not a cycle - it's a different validation
    const result = await validateNoCircularInheritance('new_playbook', ['nonexistent'], loader);
    expect(result.valid).toBe(true);
  });

  test('returns valid for simple valid inheritance', async () => {
    const base = createTestPlaybook({ name: 'base' });
    const loader = createPlaybookLoader([base]);

    const result = await validateNoCircularInheritance('child', ['base'], loader);
    expect(result.valid).toBe(true);
  });

  test('detects direct circular inheritance (A extends B, creating B extends A)', async () => {
    // Scenario: playbook-a extends playbook-b
    // Now we're trying to create playbook-b that extends playbook-a
    // This would create: playbook-b -> playbook-a -> playbook-b (cycle)
    const playbookA = createTestPlaybook({
      name: 'playbook_a',
      extends: ['playbook_b'],
    });
    const loader = createPlaybookLoader([playbookA]);

    const result = await validateNoCircularInheritance('playbook_b', ['playbook_a'], loader);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('circular inheritance');
      expect(result.cycle).toContain('playbook_b');
      expect(result.cycle).toContain('playbook_a');
    }
  });

  test('detects transitive circular inheritance (A extends B extends C, creating C extends A)', async () => {
    // Scenario: A extends B, B extends C
    // Now we're trying to create C that extends A
    // This would create: C -> A -> B -> C (cycle)
    const playbookA = createTestPlaybook({
      name: 'playbook_a',
      extends: ['playbook_b'],
    });
    const playbookB = createTestPlaybook({
      name: 'playbook_b',
      extends: ['playbook_c'],
    });
    const loader = createPlaybookLoader([playbookA, playbookB]);

    const result = await validateNoCircularInheritance('playbook_c', ['playbook_a'], loader);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('circular inheritance');
    }
  });

  test('returns valid for deep but acyclic inheritance', async () => {
    const base = createTestPlaybook({ name: 'base' });
    const middle = createTestPlaybook({ name: 'middle', extends: ['base'] });
    const loader = createPlaybookLoader([base, middle]);

    // Creating 'leaf' that extends 'middle' - no cycle
    const result = await validateNoCircularInheritance('leaf', ['middle'], loader);
    expect(result.valid).toBe(true);
  });

  test('detects cycle when extending multiple parents where one creates cycle', async () => {
    // Scenario: playbook_a exists with extends: ['new_playbook']
    // Creating new_playbook that extends ['base', 'playbook_a']
    // The 'base' parent is fine, but 'playbook_a' creates a cycle
    const base = createTestPlaybook({ name: 'base' });
    const playbookA = createTestPlaybook({
      name: 'playbook_a',
      extends: ['new_playbook'],
    });
    const loader = createPlaybookLoader([base, playbookA]);

    const result = await validateNoCircularInheritance('new_playbook', ['base', 'playbook_a'], loader);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('circular inheritance');
    }
  });

  test('handles diamond inheritance without cycle', async () => {
    // Diamond: D extends B and C, both B and C extend A
    // Creating D should be valid (no cycle, just shared ancestor)
    const base = createTestPlaybook({ name: 'base' });
    const middle1 = createTestPlaybook({ name: 'middle1', extends: ['base'] });
    const middle2 = createTestPlaybook({ name: 'middle2', extends: ['base'] });
    const loader = createPlaybookLoader([base, middle1, middle2]);

    const result = await validateNoCircularInheritance('diamond', ['middle1', 'middle2'], loader);
    expect(result.valid).toBe(true);
  });

  test('handles case-insensitive playbook names', async () => {
    const playbookA = createTestPlaybook({
      name: 'Playbook_A',
      extends: ['Playbook_B'],
    });
    const loader = createPlaybookLoader([playbookA]);

    // Using lowercase should still detect the cycle
    const result = await validateNoCircularInheritance('playbook_b', ['playbook_a'], loader);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('circular inheritance');
    }
  });
});
