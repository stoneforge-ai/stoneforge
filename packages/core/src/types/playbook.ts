/**
 * Playbook Type - Workflow templates with variables and conditions
 *
 * Playbooks are templates for creating Workflows, defining reusable sequences
 * of tasks with variables, conditions, and dependencies. They enable standardized,
 * repeatable processes that can be instantiated multiple times with different parameters.
 */

import { ValidationError, ConflictError, NotFoundError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import {
  Element,
  ElementId,
  EntityId,
  ElementType,
  createTimestamp,
  validateTags,
  validateMetadata,
} from './element.js';
import { generateId, type IdGeneratorConfig } from '../id/generator.js';
import { DocumentId } from './document.js';
import { Priority, Complexity, TaskTypeValue } from './task.js';

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Branded type for Playbook IDs
 */
declare const PlaybookIdBrand: unique symbol;
export type PlaybookId = ElementId & { readonly [PlaybookIdBrand]: typeof PlaybookIdBrand };

// ============================================================================
// Variable Types
// ============================================================================

/**
 * Supported variable types
 */
export const VariableType = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
} as const;

export type VariableType = (typeof VariableType)[keyof typeof VariableType];

/**
 * Playbook variable definition
 */
export interface PlaybookVariable {
  /** Variable name (must be valid identifier) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Variable type */
  type: VariableType;
  /** Whether value must be provided */
  required: boolean;
  /** Default value if not provided */
  default?: unknown;
  /** Allowed values (for enums) */
  enum?: unknown[];
}

// ============================================================================
// Step Types
// ============================================================================

/**
 * Step type determines how the step is executed
 * - 'task': Creates an agent task to be executed by an assignee
 * - 'function': Executes code directly (TypeScript, Python, or shell)
 */
export const StepType = {
  TASK: 'task',
  FUNCTION: 'function',
} as const;

export type StepType = (typeof StepType)[keyof typeof StepType];

/**
 * Runtime environment for function steps
 */
export const FunctionRuntime = {
  TYPESCRIPT: 'typescript',
  PYTHON: 'python',
  SHELL: 'shell',
} as const;

export type FunctionRuntime = (typeof FunctionRuntime)[keyof typeof FunctionRuntime];

/**
 * Base playbook step definition (shared properties)
 */
export interface PlaybookStepBase {
  /** Unique step identifier within playbook */
  id: string;
  /** Step title (supports {{variable}} substitution) */
  title: string;
  /** Step description (supports {{variable}} substitution) */
  description?: string;
  /** Step IDs this step depends on */
  dependsOn?: string[];
  /** Condition expression for inclusion */
  condition?: string;
}

/**
 * Task step - creates an agent task to be executed
 */
export interface PlaybookTaskStep extends PlaybookStepBase {
  /** Step type - 'task' for agent-executed steps */
  stepType?: 'task';
  /** Task type classification */
  taskType?: TaskTypeValue;
  /** Default priority */
  priority?: Priority;
  /** Default complexity */
  complexity?: Complexity;
  /** Assignee (supports {{variable}} substitution) */
  assignee?: string;
}

/**
 * Function step - executes code directly
 */
export interface PlaybookFunctionStep extends PlaybookStepBase {
  /** Step type - 'function' for code execution */
  stepType: 'function';
  /** Runtime environment for the function */
  runtime: FunctionRuntime;
  /** Code to execute (for typescript/python) */
  code?: string;
  /** Command to execute (for shell) */
  command?: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Playbook step definition (task template or function)
 * Union type supporting both task and function steps
 */
export type PlaybookStep = PlaybookTaskStep | PlaybookFunctionStep;

// ============================================================================
// Validation Constants
// ============================================================================

/** Minimum name length */
export const MIN_PLAYBOOK_NAME_LENGTH = 1;

/** Maximum name length */
export const MAX_PLAYBOOK_NAME_LENGTH = 100;

/** Minimum title length */
export const MIN_PLAYBOOK_TITLE_LENGTH = 1;

/** Maximum title length */
export const MAX_PLAYBOOK_TITLE_LENGTH = 500;

/** Maximum variable name length */
export const MAX_VARIABLE_NAME_LENGTH = 50;

/** Maximum step ID length */
export const MAX_STEP_ID_LENGTH = 50;

/** Maximum step title length */
export const MAX_STEP_TITLE_LENGTH = 500;

/** Maximum step description length */
export const MAX_STEP_DESCRIPTION_LENGTH = 5000;

/** Maximum assignee length */
export const MAX_ASSIGNEE_LENGTH = 200;

/** Maximum condition length */
export const MAX_CONDITION_LENGTH = 500;

/** Maximum code length for function steps */
export const MAX_FUNCTION_CODE_LENGTH = 50000;

/** Maximum command length for shell steps */
export const MAX_FUNCTION_COMMAND_LENGTH = 5000;

/** Default function timeout in milliseconds */
export const DEFAULT_FUNCTION_TIMEOUT = 30000;

/** Maximum function timeout in milliseconds (10 minutes) */
export const MAX_FUNCTION_TIMEOUT = 600000;

/** Maximum number of steps */
export const MAX_STEPS = 1000;

/** Maximum number of variables */
export const MAX_VARIABLES = 100;

/** Maximum number of parent playbooks */
export const MAX_EXTENDS = 10;

/** Variable name pattern: valid identifier */
export const VARIABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Step ID pattern: alphanumeric with underscores and hyphens */
export const STEP_ID_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/** Playbook name pattern: alphanumeric with underscores and hyphens */
export const PLAYBOOK_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/** Variable substitution pattern */
export const VARIABLE_SUBSTITUTION_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

// ============================================================================
// Playbook Interface
// ============================================================================

/**
 * Playbook interface - extends Element with template properties
 */
export interface Playbook extends Element {
  /** Playbook type is always 'playbook' */
  readonly type: typeof ElementType.PLAYBOOK;

  // Identity
  /** Unique name for referencing */
  name: string;
  /** Display title, 1-500 characters */
  title: string;
  /** Reference to description Document */
  descriptionRef?: DocumentId;
  /** Template version number (starts at 1) */
  version: number;

  // Template Definition
  /** Task templates to create */
  steps: PlaybookStep[];
  /** Variable definitions */
  variables: PlaybookVariable[];

  // Composition
  /** Parent playbooks to inherit from */
  extends?: string[];
}

/**
 * Playbook with hydrated document references
 */
export interface HydratedPlaybook extends Playbook {
  /** Hydrated description Document content */
  description?: string;
}

// ============================================================================
// Validation Functions - Variable Types
// ============================================================================

/**
 * Validates a variable type
 */
export function isValidVariableType(value: unknown): value is VariableType {
  return typeof value === 'string' && Object.values(VariableType).includes(value as VariableType);
}

/**
 * Validates variable type and throws if invalid
 */
export function validateVariableType(value: unknown): VariableType {
  if (!isValidVariableType(value)) {
    throw new ValidationError(
      `Invalid variable type: ${value}. Must be one of: ${Object.values(VariableType).join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value, expected: Object.values(VariableType) }
    );
  }
  return value;
}

// ============================================================================
// Validation Functions - Variable Names
// ============================================================================

/**
 * Validates a variable name
 */
export function isValidVariableName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_VARIABLE_NAME_LENGTH) return false;
  return VARIABLE_NAME_PATTERN.test(value);
}

/**
 * Validates variable name and throws if invalid
 */
export function validateVariableName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('Variable name must be a string', ErrorCode.INVALID_INPUT, {
      field: 'name',
      value,
      expected: 'string',
    });
  }

  if (value.length === 0) {
    throw new ValidationError('Variable name cannot be empty', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'name',
      value,
    });
  }

  if (value.length > MAX_VARIABLE_NAME_LENGTH) {
    throw new ValidationError(
      `Variable name exceeds maximum length of ${MAX_VARIABLE_NAME_LENGTH} characters`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', expected: `<= ${MAX_VARIABLE_NAME_LENGTH} characters`, actual: value.length }
    );
  }

  if (!VARIABLE_NAME_PATTERN.test(value)) {
    throw new ValidationError(
      'Variable name must be a valid identifier (start with letter or underscore, followed by alphanumeric or underscore)',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: 'valid identifier pattern' }
    );
  }

  return value;
}

// ============================================================================
// Validation Functions - PlaybookVariable
// ============================================================================

/**
 * Validates that a default value matches the variable type
 */
export function isValidDefaultForType(defaultValue: unknown, type: VariableType): boolean {
  if (defaultValue === undefined) return true;

  switch (type) {
    case VariableType.STRING:
      return typeof defaultValue === 'string';
    case VariableType.NUMBER:
      return typeof defaultValue === 'number' && !isNaN(defaultValue);
    case VariableType.BOOLEAN:
      return typeof defaultValue === 'boolean';
    default:
      return false;
  }
}

/**
 * Validates that enum values match the variable type
 */
export function isValidEnumForType(enumValues: unknown[], type: VariableType): boolean {
  if (enumValues.length === 0) return false;

  switch (type) {
    case VariableType.STRING:
      return enumValues.every((v) => typeof v === 'string');
    case VariableType.NUMBER:
      return enumValues.every((v) => typeof v === 'number' && !isNaN(v));
    case VariableType.BOOLEAN:
      return enumValues.every((v) => typeof v === 'boolean');
    default:
      return false;
  }
}

/**
 * Validates a PlaybookVariable
 */
export function isValidPlaybookVariable(value: unknown): value is PlaybookVariable {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;

  // Required fields
  if (!isValidVariableName(obj.name)) return false;
  if (!isValidVariableType(obj.type)) return false;
  if (typeof obj.required !== 'boolean') return false;

  // Optional fields
  if (obj.description !== undefined && typeof obj.description !== 'string') return false;

  // Default value validation
  if (obj.default !== undefined && !isValidDefaultForType(obj.default, obj.type as VariableType)) {
    return false;
  }

  // Enum validation
  if (obj.enum !== undefined) {
    if (!Array.isArray(obj.enum)) return false;
    if (!isValidEnumForType(obj.enum, obj.type as VariableType)) return false;
  }

  return true;
}

/**
 * Validates a PlaybookVariable and throws if invalid
 */
export function validatePlaybookVariable(value: unknown): PlaybookVariable {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('PlaybookVariable must be an object', ErrorCode.INVALID_INPUT, {
      value,
    });
  }

  const obj = value as Record<string, unknown>;

  // Validate required fields
  validateVariableName(obj.name);
  validateVariableType(obj.type);

  if (typeof obj.required !== 'boolean') {
    throw new ValidationError('Variable required must be a boolean', ErrorCode.INVALID_INPUT, {
      field: 'required',
      value: obj.required,
      expected: 'boolean',
    });
  }

  // Validate optional description
  if (obj.description !== undefined && typeof obj.description !== 'string') {
    throw new ValidationError('Variable description must be a string', ErrorCode.INVALID_INPUT, {
      field: 'description',
      value: obj.description,
      expected: 'string',
    });
  }

  // Validate default matches type
  if (obj.default !== undefined) {
    if (!isValidDefaultForType(obj.default, obj.type as VariableType)) {
      throw new ValidationError(
        `Default value type mismatch: expected ${obj.type}, got ${typeof obj.default}`,
        ErrorCode.INVALID_INPUT,
        { field: 'default', value: obj.default, expected: obj.type }
      );
    }
  }

  // Validate enum
  if (obj.enum !== undefined) {
    if (!Array.isArray(obj.enum)) {
      throw new ValidationError('Variable enum must be an array', ErrorCode.INVALID_INPUT, {
        field: 'enum',
        value: obj.enum,
        expected: 'array',
      });
    }

    if (obj.enum.length === 0) {
      throw new ValidationError('Variable enum cannot be empty', ErrorCode.INVALID_INPUT, {
        field: 'enum',
        value: obj.enum,
      });
    }

    if (!isValidEnumForType(obj.enum, obj.type as VariableType)) {
      throw new ValidationError(
        `Enum values type mismatch: all values must be ${obj.type}`,
        ErrorCode.INVALID_INPUT,
        { field: 'enum', value: obj.enum, expected: obj.type }
      );
    }
  }

  return value as PlaybookVariable;
}

// ============================================================================
// Validation Functions - Step ID
// ============================================================================

/**
 * Validates a step ID
 */
export function isValidStepId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_STEP_ID_LENGTH) return false;
  return STEP_ID_PATTERN.test(value);
}

/**
 * Validates step ID and throws if invalid
 */
export function validateStepId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('Step ID must be a string', ErrorCode.INVALID_INPUT, {
      field: 'id',
      value,
      expected: 'string',
    });
  }

  if (value.length === 0) {
    throw new ValidationError('Step ID cannot be empty', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'id',
      value,
    });
  }

  if (value.length > MAX_STEP_ID_LENGTH) {
    throw new ValidationError(
      `Step ID exceeds maximum length of ${MAX_STEP_ID_LENGTH} characters`,
      ErrorCode.INVALID_INPUT,
      { field: 'id', expected: `<= ${MAX_STEP_ID_LENGTH} characters`, actual: value.length }
    );
  }

  if (!STEP_ID_PATTERN.test(value)) {
    throw new ValidationError(
      'Step ID must start with a letter or underscore, followed by alphanumeric, underscore, or hyphen',
      ErrorCode.INVALID_INPUT,
      { field: 'id', value, expected: 'valid step ID pattern' }
    );
  }

  return value;
}

// ============================================================================
// Validation Functions - Step Title/Description
// ============================================================================

/**
 * Validates a step title
 */
export function isValidStepTitle(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_STEP_TITLE_LENGTH;
}

/**
 * Validates step title and throws if invalid
 */
export function validateStepTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('Step title must be a string', ErrorCode.INVALID_INPUT, {
      field: 'title',
      value,
      expected: 'string',
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Step title cannot be empty', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'title',
      value,
    });
  }

  if (trimmed.length > MAX_STEP_TITLE_LENGTH) {
    throw new ValidationError(
      `Step title exceeds maximum length of ${MAX_STEP_TITLE_LENGTH} characters`,
      ErrorCode.TITLE_TOO_LONG,
      { field: 'title', expected: `<= ${MAX_STEP_TITLE_LENGTH} characters`, actual: trimmed.length }
    );
  }

  return trimmed;
}

/**
 * Validates optional step description
 */
export function validateStepDescription(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value !== 'string') {
    throw new ValidationError('Step description must be a string', ErrorCode.INVALID_INPUT, {
      field: 'description',
      value,
      expected: 'string',
    });
  }

  if (value.length > MAX_STEP_DESCRIPTION_LENGTH) {
    throw new ValidationError(
      `Step description exceeds maximum length of ${MAX_STEP_DESCRIPTION_LENGTH} characters`,
      ErrorCode.INVALID_INPUT,
      {
        field: 'description',
        expected: `<= ${MAX_STEP_DESCRIPTION_LENGTH} characters`,
        actual: value.length,
      }
    );
  }

  return value;
}

// ============================================================================
// Validation Functions - Step Type
// ============================================================================

/**
 * Validates a step type value
 */
export function isValidStepType(value: unknown): value is StepType {
  return value === undefined || value === StepType.TASK || value === StepType.FUNCTION;
}

/**
 * Validates a function runtime value
 */
export function isValidFunctionRuntime(value: unknown): value is FunctionRuntime {
  return (
    value === FunctionRuntime.TYPESCRIPT ||
    value === FunctionRuntime.PYTHON ||
    value === FunctionRuntime.SHELL
  );
}

/**
 * Type guard for task steps
 */
export function isTaskStep(step: PlaybookStep): step is PlaybookTaskStep {
  return step.stepType === undefined || step.stepType === StepType.TASK;
}

/**
 * Type guard for function steps
 */
export function isFunctionStep(step: PlaybookStep): step is PlaybookFunctionStep {
  return step.stepType === StepType.FUNCTION;
}

// ============================================================================
// Validation Functions - PlaybookStep
// ============================================================================

/**
 * Validates a PlaybookStep
 */
export function isValidPlaybookStep(value: unknown): value is PlaybookStep {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;

  // Required fields for all steps
  if (!isValidStepId(obj.id)) return false;
  if (!isValidStepTitle(obj.title)) return false;

  // Common optional fields
  if (obj.description !== undefined && typeof obj.description !== 'string') return false;
  if (obj.condition !== undefined && typeof obj.condition !== 'string') return false;

  // dependsOn must be an array of strings
  if (obj.dependsOn !== undefined) {
    if (!Array.isArray(obj.dependsOn)) return false;
    if (!obj.dependsOn.every((d) => typeof d === 'string')) return false;
  }

  // Validate based on step type
  const stepType = obj.stepType;

  if (stepType === StepType.FUNCTION) {
    // Function step validation
    if (!isValidFunctionRuntime(obj.runtime)) return false;
    if (obj.code !== undefined && typeof obj.code !== 'string') return false;
    if (obj.command !== undefined && typeof obj.command !== 'string') return false;
    if (obj.timeout !== undefined && typeof obj.timeout !== 'number') return false;
    // Must have either code or command based on runtime
    if (obj.runtime === FunctionRuntime.SHELL) {
      if (typeof obj.command !== 'string') return false;
    } else {
      if (typeof obj.code !== 'string') return false;
    }
  } else {
    // Task step validation (stepType is undefined or 'task')
    if (stepType !== undefined && stepType !== StepType.TASK) return false;
    if (obj.taskType !== undefined && typeof obj.taskType !== 'string') return false;
    if (obj.priority !== undefined && typeof obj.priority !== 'number') return false;
    if (obj.complexity !== undefined && typeof obj.complexity !== 'number') return false;
    if (obj.assignee !== undefined && typeof obj.assignee !== 'string') return false;
  }

  return true;
}

/**
 * Validates a PlaybookStep and throws if invalid
 */
export function validatePlaybookStep(value: unknown): PlaybookStep {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('PlaybookStep must be an object', ErrorCode.INVALID_INPUT, {
      value,
    });
  }

  const obj = value as Record<string, unknown>;

  // Validate required fields for all step types
  validateStepId(obj.id);
  validateStepTitle(obj.title);

  // Validate optional description
  validateStepDescription(obj.description);

  // Validate optional condition
  if (obj.condition !== undefined) {
    if (typeof obj.condition !== 'string') {
      throw new ValidationError('Step condition must be a string', ErrorCode.INVALID_INPUT, {
        field: 'condition',
        value: obj.condition,
        expected: 'string',
      });
    }
    if (obj.condition.length > MAX_CONDITION_LENGTH) {
      throw new ValidationError(
        `Step condition exceeds maximum length of ${MAX_CONDITION_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        {
          field: 'condition',
          expected: `<= ${MAX_CONDITION_LENGTH} characters`,
          actual: obj.condition.length,
        }
      );
    }
  }

  // Validate dependsOn
  if (obj.dependsOn !== undefined) {
    if (!Array.isArray(obj.dependsOn)) {
      throw new ValidationError('Step dependsOn must be an array', ErrorCode.INVALID_INPUT, {
        field: 'dependsOn',
        value: obj.dependsOn,
        expected: 'array',
      });
    }
    for (const dep of obj.dependsOn) {
      if (typeof dep !== 'string') {
        throw new ValidationError(
          'Step dependsOn entries must be strings',
          ErrorCode.INVALID_INPUT,
          {
            field: 'dependsOn',
            value: dep,
            expected: 'string',
          }
        );
      }
    }
  }

  // Validate based on step type
  const stepType = obj.stepType;

  if (stepType === StepType.FUNCTION) {
    // Validate function step
    validateFunctionStep(obj);
  } else if (stepType !== undefined && stepType !== StepType.TASK) {
    throw new ValidationError(
      `Invalid step type: ${stepType}. Must be 'task' or 'function'`,
      ErrorCode.INVALID_INPUT,
      { field: 'stepType', value: stepType, expected: ['task', 'function'] }
    );
  } else {
    // Validate task step
    validateTaskStep(obj);
  }

  return value as PlaybookStep;
}

/**
 * Validates task step specific fields
 */
function validateTaskStep(obj: Record<string, unknown>): void {
  // Validate optional assignee
  if (obj.assignee !== undefined) {
    if (typeof obj.assignee !== 'string') {
      throw new ValidationError('Step assignee must be a string', ErrorCode.INVALID_INPUT, {
        field: 'assignee',
        value: obj.assignee,
        expected: 'string',
      });
    }
    if (obj.assignee.length > MAX_ASSIGNEE_LENGTH) {
      throw new ValidationError(
        `Step assignee exceeds maximum length of ${MAX_ASSIGNEE_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        {
          field: 'assignee',
          expected: `<= ${MAX_ASSIGNEE_LENGTH} characters`,
          actual: obj.assignee.length,
        }
      );
    }
  }

  // Validate optional taskType
  if (obj.taskType !== undefined && typeof obj.taskType !== 'string') {
    throw new ValidationError('Step taskType must be a string', ErrorCode.INVALID_INPUT, {
      field: 'taskType',
      value: obj.taskType,
      expected: 'string',
    });
  }

  // Validate optional priority
  if (obj.priority !== undefined && typeof obj.priority !== 'number') {
    throw new ValidationError('Step priority must be a number', ErrorCode.INVALID_INPUT, {
      field: 'priority',
      value: obj.priority,
      expected: 'number',
    });
  }

  // Validate optional complexity
  if (obj.complexity !== undefined && typeof obj.complexity !== 'number') {
    throw new ValidationError('Step complexity must be a number', ErrorCode.INVALID_INPUT, {
      field: 'complexity',
      value: obj.complexity,
      expected: 'number',
    });
  }
}

/**
 * Validates function step specific fields
 */
function validateFunctionStep(obj: Record<string, unknown>): void {
  // Runtime is required for function steps
  if (!isValidFunctionRuntime(obj.runtime)) {
    throw new ValidationError(
      `Invalid function runtime: ${obj.runtime}. Must be 'typescript', 'python', or 'shell'`,
      ErrorCode.INVALID_INPUT,
      { field: 'runtime', value: obj.runtime, expected: ['typescript', 'python', 'shell'] }
    );
  }

  const runtime = obj.runtime as FunctionRuntime;

  // Shell steps require command
  if (runtime === FunctionRuntime.SHELL) {
    if (typeof obj.command !== 'string') {
      throw new ValidationError(
        'Shell function steps require a command',
        ErrorCode.MISSING_REQUIRED_FIELD,
        { field: 'command' }
      );
    }
    if (obj.command.length > MAX_FUNCTION_COMMAND_LENGTH) {
      throw new ValidationError(
        `Function command exceeds maximum length of ${MAX_FUNCTION_COMMAND_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        {
          field: 'command',
          expected: `<= ${MAX_FUNCTION_COMMAND_LENGTH} characters`,
          actual: obj.command.length,
        }
      );
    }
  } else {
    // TypeScript and Python steps require code
    if (typeof obj.code !== 'string') {
      throw new ValidationError(
        `${runtime} function steps require code`,
        ErrorCode.MISSING_REQUIRED_FIELD,
        { field: 'code' }
      );
    }
    if (obj.code.length > MAX_FUNCTION_CODE_LENGTH) {
      throw new ValidationError(
        `Function code exceeds maximum length of ${MAX_FUNCTION_CODE_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        {
          field: 'code',
          expected: `<= ${MAX_FUNCTION_CODE_LENGTH} characters`,
          actual: obj.code.length,
        }
      );
    }
  }

  // Validate optional timeout
  if (obj.timeout !== undefined) {
    if (typeof obj.timeout !== 'number') {
      throw new ValidationError('Function timeout must be a number', ErrorCode.INVALID_INPUT, {
        field: 'timeout',
        value: obj.timeout,
        expected: 'number',
      });
    }
    if (obj.timeout <= 0) {
      throw new ValidationError('Function timeout must be positive', ErrorCode.INVALID_INPUT, {
        field: 'timeout',
        value: obj.timeout,
        expected: '> 0',
      });
    }
    if (obj.timeout > MAX_FUNCTION_TIMEOUT) {
      throw new ValidationError(
        `Function timeout exceeds maximum of ${MAX_FUNCTION_TIMEOUT}ms`,
        ErrorCode.INVALID_INPUT,
        {
          field: 'timeout',
          expected: `<= ${MAX_FUNCTION_TIMEOUT}ms`,
          actual: obj.timeout,
        }
      );
    }
  }
}

// ============================================================================
// Validation Functions - Playbook Name/Title
// ============================================================================

/**
 * Validates a playbook name
 */
export function isValidPlaybookName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length < MIN_PLAYBOOK_NAME_LENGTH || value.length > MAX_PLAYBOOK_NAME_LENGTH) {
    return false;
  }
  return PLAYBOOK_NAME_PATTERN.test(value);
}

/**
 * Validates playbook name and throws if invalid
 */
export function validatePlaybookName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('Playbook name must be a string', ErrorCode.INVALID_INPUT, {
      field: 'name',
      value,
      expected: 'string',
    });
  }

  if (value.length === 0) {
    throw new ValidationError('Playbook name cannot be empty', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'name',
      value,
    });
  }

  if (value.length > MAX_PLAYBOOK_NAME_LENGTH) {
    throw new ValidationError(
      `Playbook name exceeds maximum length of ${MAX_PLAYBOOK_NAME_LENGTH} characters`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', expected: `<= ${MAX_PLAYBOOK_NAME_LENGTH} characters`, actual: value.length }
    );
  }

  if (!PLAYBOOK_NAME_PATTERN.test(value)) {
    throw new ValidationError(
      'Playbook name must start with a letter or underscore, followed by alphanumeric, underscore, or hyphen',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: 'valid playbook name pattern' }
    );
  }

  return value;
}

/**
 * Validates a playbook title
 */
export function isValidPlaybookTitle(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.length >= MIN_PLAYBOOK_TITLE_LENGTH && trimmed.length <= MAX_PLAYBOOK_TITLE_LENGTH
  );
}

/**
 * Validates playbook title and throws if invalid
 */
export function validatePlaybookTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('Playbook title must be a string', ErrorCode.INVALID_INPUT, {
      field: 'title',
      value,
      expected: 'string',
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Playbook title cannot be empty', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'title',
      value,
    });
  }

  if (trimmed.length > MAX_PLAYBOOK_TITLE_LENGTH) {
    throw new ValidationError(
      `Playbook title exceeds maximum length of ${MAX_PLAYBOOK_TITLE_LENGTH} characters`,
      ErrorCode.TITLE_TOO_LONG,
      {
        field: 'title',
        expected: `<= ${MAX_PLAYBOOK_TITLE_LENGTH} characters`,
        actual: trimmed.length,
      }
    );
  }

  return trimmed;
}

/**
 * Validates playbook version
 */
export function isValidPlaybookVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Validates playbook version and throws if invalid
 */
export function validatePlaybookVersion(value: unknown): number {
  if (typeof value !== 'number') {
    throw new ValidationError('Playbook version must be a number', ErrorCode.INVALID_INPUT, {
      field: 'version',
      value,
      expected: 'number',
    });
  }

  if (!Number.isInteger(value)) {
    throw new ValidationError('Playbook version must be an integer', ErrorCode.INVALID_INPUT, {
      field: 'version',
      value,
      expected: 'integer',
    });
  }

  if (value < 1) {
    throw new ValidationError(
      'Playbook version must be at least 1',
      ErrorCode.INVALID_INPUT,
      { field: 'version', value, expected: '>= 1' }
    );
  }

  return value;
}

// ============================================================================
// Validation Functions - Playbook ID
// ============================================================================

/**
 * Validates a playbook ID
 */
export function isValidPlaybookId(value: unknown): value is PlaybookId {
  if (typeof value !== 'string') return false;
  // Basic ID format check - el- prefix followed by alphanumeric with optional hierarchy
  return /^el-[a-z0-9]+(\.[0-9]+)*$/i.test(value);
}

/**
 * Validates playbook ID and throws if invalid
 */
export function validatePlaybookId(value: unknown): PlaybookId {
  if (!isValidPlaybookId(value)) {
    throw new ValidationError(`Invalid playbook ID: ${value}`, ErrorCode.INVALID_ID, {
      field: 'playbookId',
      value,
      expected: 'el-{hash} format',
    });
  }
  return value;
}

// ============================================================================
// Validation Functions - Steps Array
// ============================================================================

/**
 * Validates steps array (unique IDs, valid dependsOn references)
 */
export function validateSteps(steps: unknown): PlaybookStep[] {
  if (!Array.isArray(steps)) {
    throw new ValidationError('Steps must be an array', ErrorCode.INVALID_INPUT, {
      field: 'steps',
      value: steps,
      expected: 'array',
    });
  }

  if (steps.length > MAX_STEPS) {
    throw new ValidationError(
      `Steps array exceeds maximum length of ${MAX_STEPS}`,
      ErrorCode.INVALID_INPUT,
      { field: 'steps', expected: `<= ${MAX_STEPS} items`, actual: steps.length }
    );
  }

  // Validate each step
  const validatedSteps: PlaybookStep[] = [];
  const stepIds = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const step = validatePlaybookStep(steps[i]);
    validatedSteps.push(step);

    // Check for duplicate IDs
    if (stepIds.has(step.id)) {
      throw new ConflictError(
        `Duplicate step ID: ${step.id}`,
        ErrorCode.ALREADY_EXISTS,
        { field: `steps[${i}].id`, value: step.id }
      );
    }
    stepIds.add(step.id);
  }

  // Validate dependsOn references
  for (let i = 0; i < validatedSteps.length; i++) {
    const step = validatedSteps[i];
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        if (!stepIds.has(depId)) {
          throw new NotFoundError(
            `Step '${step.id}' depends on unknown step '${depId}'`,
            ErrorCode.NOT_FOUND,
            { field: `steps[${i}].dependsOn`, value: depId }
          );
        }
        // Check for self-dependency
        if (depId === step.id) {
          throw new ConflictError(
            `Step '${step.id}' cannot depend on itself`,
            ErrorCode.CYCLE_DETECTED,
            { field: `steps[${i}].dependsOn`, value: depId }
          );
        }
      }
    }
  }

  return validatedSteps;
}

// ============================================================================
// Validation Functions - Variables Array
// ============================================================================

/**
 * Validates variables array (unique names)
 */
export function validateVariables(variables: unknown): PlaybookVariable[] {
  if (!Array.isArray(variables)) {
    throw new ValidationError('Variables must be an array', ErrorCode.INVALID_INPUT, {
      field: 'variables',
      value: variables,
      expected: 'array',
    });
  }

  if (variables.length > MAX_VARIABLES) {
    throw new ValidationError(
      `Variables array exceeds maximum length of ${MAX_VARIABLES}`,
      ErrorCode.INVALID_INPUT,
      { field: 'variables', expected: `<= ${MAX_VARIABLES} items`, actual: variables.length }
    );
  }

  const validatedVariables: PlaybookVariable[] = [];
  const variableNames = new Set<string>();

  for (let i = 0; i < variables.length; i++) {
    const variable = validatePlaybookVariable(variables[i]);
    validatedVariables.push(variable);

    // Check for duplicate names
    if (variableNames.has(variable.name)) {
      throw new ConflictError(
        `Duplicate variable name: ${variable.name}`,
        ErrorCode.ALREADY_EXISTS,
        { field: `variables[${i}].name`, value: variable.name }
      );
    }
    variableNames.add(variable.name);
  }

  return validatedVariables;
}

// ============================================================================
// Validation Functions - Extends Array
// ============================================================================

/**
 * Validates extends array
 */
export function validateExtends(extendsArray: unknown): string[] | undefined {
  if (extendsArray === undefined || extendsArray === null) {
    return undefined;
  }

  if (!Array.isArray(extendsArray)) {
    throw new ValidationError('Extends must be an array', ErrorCode.INVALID_INPUT, {
      field: 'extends',
      value: extendsArray,
      expected: 'array',
    });
  }

  if (extendsArray.length > MAX_EXTENDS) {
    throw new ValidationError(
      `Extends array exceeds maximum length of ${MAX_EXTENDS}`,
      ErrorCode.INVALID_INPUT,
      { field: 'extends', expected: `<= ${MAX_EXTENDS} items`, actual: extendsArray.length }
    );
  }

  const parentNames = new Set<string>();
  for (let i = 0; i < extendsArray.length; i++) {
    const name = extendsArray[i];
    if (typeof name !== 'string' || name.length === 0) {
      throw new ValidationError(
        'Extends entries must be non-empty strings',
        ErrorCode.INVALID_INPUT,
        { field: `extends[${i}]`, value: name, expected: 'non-empty string' }
      );
    }

    // Check for duplicates
    if (parentNames.has(name)) {
      throw new ConflictError(
        `Duplicate parent playbook: ${name}`,
        ErrorCode.ALREADY_EXISTS,
        { field: `extends[${i}]`, value: name }
      );
    }
    parentNames.add(name);
  }

  return extendsArray as string[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Playbook
 */
export function isPlaybook(value: unknown): value is Playbook {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.PLAYBOOK) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check required playbook-specific properties
  if (!isValidPlaybookName(obj.name)) return false;
  if (!isValidPlaybookTitle(obj.title)) return false;
  if (!isValidPlaybookVersion(obj.version)) return false;
  if (!Array.isArray(obj.steps)) return false;
  if (!Array.isArray(obj.variables)) return false;

  // Check steps are valid
  for (const step of obj.steps as unknown[]) {
    if (!isValidPlaybookStep(step)) return false;
  }

  // Check variables are valid
  for (const variable of obj.variables as unknown[]) {
    if (!isValidPlaybookVariable(variable)) return false;
  }

  // Check optional properties have correct types when present
  if (obj.descriptionRef !== undefined && typeof obj.descriptionRef !== 'string') return false;
  if (obj.extends !== undefined) {
    if (!Array.isArray(obj.extends)) return false;
    for (const parent of obj.extends as unknown[]) {
      if (typeof parent !== 'string') return false;
    }
  }

  return true;
}

/**
 * Comprehensive validation of a playbook with detailed errors
 */
export function validatePlaybook(value: unknown): Playbook {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('Playbook must be an object', ErrorCode.INVALID_INPUT, {
      value,
    });
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Playbook id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.PLAYBOOK) {
    throw new ValidationError(`Playbook type must be '${ElementType.PLAYBOOK}'`, ErrorCode.INVALID_INPUT, {
      field: 'type',
      value: obj.type,
      expected: ElementType.PLAYBOOK,
    });
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError('Playbook createdAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'createdAt',
      value: obj.createdAt,
    });
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError('Playbook updatedAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'updatedAt',
      value: obj.updatedAt,
    });
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Playbook createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError('Playbook tags must be an array', ErrorCode.INVALID_INPUT, {
      field: 'tags',
      value: obj.tags,
      expected: 'array',
    });
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError('Playbook metadata must be an object', ErrorCode.INVALID_INPUT, {
      field: 'metadata',
      value: obj.metadata,
      expected: 'object',
    });
  }

  // Validate playbook-specific required fields
  validatePlaybookName(obj.name);
  validatePlaybookTitle(obj.title);
  validatePlaybookVersion(obj.version);
  validateSteps(obj.steps);
  validateVariables(obj.variables);

  // Validate optional fields
  validateExtends(obj.extends);

  return value as Playbook;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new playbook
 */
export interface CreatePlaybookInput {
  /** Unique name for referencing */
  name: string;
  /** Display title, 1-500 characters */
  title: string;
  /** Reference to the entity that created this playbook */
  createdBy: EntityId;
  /** Optional: Reference to description Document */
  descriptionRef?: DocumentId;
  /** Optional: Version number (default: 1) */
  version?: number;
  /** Task templates to create */
  steps: PlaybookStep[];
  /** Variable definitions */
  variables: PlaybookVariable[];
  /** Optional: Parent playbooks to inherit from */
  extends?: string[];
  /** Optional: tags */
  tags?: string[];
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new Playbook with validated inputs
 *
 * @param input - Playbook creation input
 * @param config - Optional ID generator configuration
 * @returns Promise resolving to the created Playbook
 */
export async function createPlaybook(
  input: CreatePlaybookInput,
  config?: IdGeneratorConfig
): Promise<Playbook> {
  // Validate required fields
  const name = validatePlaybookName(input.name);
  const title = validatePlaybookTitle(input.title);
  const steps = validateSteps(input.steps);
  const variables = validateVariables(input.variables);

  // Validate optional fields with defaults
  const version = input.version !== undefined ? validatePlaybookVersion(input.version) : 1;
  const extendsArray = validateExtends(input.extends);

  // Validate tags and metadata
  const tags = input.tags ? validateTags(input.tags) : [];
  const metadata = input.metadata ? validateMetadata(input.metadata) : {};

  // Check that playbook doesn't extend itself
  if (extendsArray && extendsArray.includes(name)) {
    throw new ConflictError(
      'Playbook cannot extend itself',
      ErrorCode.CYCLE_DETECTED,
      { field: 'extends', value: name }
    );
  }

  const now = createTimestamp();

  // Generate ID using name
  const id = await generateId({ identifier: name, createdBy: input.createdBy }, config);

  const playbook: Playbook = {
    id: id as PlaybookId,
    type: ElementType.PLAYBOOK,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    tags,
    metadata,
    name,
    title,
    version,
    steps,
    variables,
    ...(input.descriptionRef !== undefined && { descriptionRef: input.descriptionRef }),
    ...(extendsArray !== undefined && { extends: extendsArray }),
  };

  return playbook;
}

// ============================================================================
// Update Functions
// ============================================================================

/**
 * Input for updating a playbook
 */
export interface UpdatePlaybookInput {
  /** Optional: New title */
  title?: string;
  /** Optional: New steps */
  steps?: PlaybookStep[];
  /** Optional: New variables */
  variables?: PlaybookVariable[];
  /** Optional: New extends */
  extends?: string[];
  /** Optional: New description reference */
  descriptionRef?: DocumentId;
  /** Optional: New tags */
  tags?: string[];
  /** Optional: New metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Updates a playbook with new values (increments version)
 *
 * @param playbook - The current playbook
 * @param input - Update input
 * @returns The updated playbook
 */
export function updatePlaybook(playbook: Playbook, input: UpdatePlaybookInput): Playbook {
  const updates: Partial<Playbook> = {
    updatedAt: createTimestamp(),
    version: playbook.version + 1,
  };

  if (input.title !== undefined) {
    updates.title = validatePlaybookTitle(input.title);
  }

  if (input.steps !== undefined) {
    updates.steps = validateSteps(input.steps);
  }

  if (input.variables !== undefined) {
    updates.variables = validateVariables(input.variables);
  }

  if (input.extends !== undefined) {
    const extendsArray = validateExtends(input.extends);
    // Check that playbook doesn't extend itself
    if (extendsArray && extendsArray.includes(playbook.name)) {
      throw new ConflictError('Playbook cannot extend itself', ErrorCode.CYCLE_DETECTED, {
        field: 'extends',
        value: playbook.name,
      });
    }
    updates.extends = extendsArray;
  }

  if (input.descriptionRef !== undefined) {
    updates.descriptionRef = input.descriptionRef;
  }

  if (input.tags !== undefined) {
    updates.tags = validateTags(input.tags);
  }

  if (input.metadata !== undefined) {
    updates.metadata = validateMetadata(input.metadata);
  }

  return { ...playbook, ...updates };
}

// ============================================================================
// Variable System - Resolution and Validation
// ============================================================================

/**
 * Resolved variable values for instantiation
 */
export type ResolvedVariables = Record<string, string | number | boolean>;

/**
 * Resolves variable values with defaults and validation
 *
 * @param variables - Playbook variable definitions
 * @param providedValues - Values provided at instantiation time
 * @returns Resolved variable values
 */
export function resolveVariables(
  variables: PlaybookVariable[],
  providedValues: Record<string, unknown>
): ResolvedVariables {
  const resolved: ResolvedVariables = {};

  for (const variable of variables) {
    const providedValue = providedValues[variable.name];

    // Use provided value or default
    let value: unknown;
    if (providedValue !== undefined) {
      value = providedValue;
    } else if (variable.default !== undefined) {
      value = variable.default;
    } else if (variable.required) {
      throw new ValidationError(
        `Required variable '${variable.name}' was not provided`,
        ErrorCode.MISSING_REQUIRED_FIELD,
        { field: variable.name }
      );
    } else {
      // Optional variable with no default - skip
      continue;
    }

    // Type validation
    if (!isValidDefaultForType(value, variable.type)) {
      throw new ValidationError(
        `Variable '${variable.name}' type mismatch: expected ${variable.type}, got ${typeof value}`,
        ErrorCode.INVALID_INPUT,
        { field: variable.name, value, expected: variable.type }
      );
    }

    // Enum validation
    if (variable.enum && !variable.enum.includes(value)) {
      throw new ValidationError(
        `Variable '${variable.name}' value must be one of: ${variable.enum.join(', ')}`,
        ErrorCode.INVALID_INPUT,
        { field: variable.name, value, expected: variable.enum }
      );
    }

    resolved[variable.name] = value as string | number | boolean;
  }

  return resolved;
}

/**
 * Gets all variable names from playbook definitions
 */
export function getVariableNames(variables: PlaybookVariable[]): string[] {
  return variables.map((v) => v.name);
}

/**
 * Gets required variable names from playbook definitions
 */
export function getRequiredVariableNames(variables: PlaybookVariable[]): string[] {
  return variables.filter((v) => v.required).map((v) => v.name);
}

/**
 * Gets optional variable names from playbook definitions
 */
export function getOptionalVariableNames(variables: PlaybookVariable[]): string[] {
  return variables.filter((v) => !v.required).map((v) => v.name);
}

// ============================================================================
// Condition System
// ============================================================================

/**
 * Truthiness values - these evaluate to false
 */
const FALSY_VALUES = new Set(['', 'false', '0', 'no', 'off']);

/**
 * Evaluates if a value is truthy according to playbook rules
 */
export function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;

  const stringValue = String(value).toLowerCase();
  return !FALSY_VALUES.has(stringValue);
}

/**
 * Condition operator types
 */
export type ConditionOperator = 'truthy' | 'not' | 'equals' | 'notEquals';

/**
 * Parsed condition result
 */
export interface ParsedCondition {
  operator: ConditionOperator;
  variableName: string;
  compareValue?: string;
}

/**
 * Parses a condition expression
 *
 * Supported syntax:
 * - `{{var}}` - Include if var is truthy
 * - `!{{var}}` - Include if var is falsy
 * - `{{var}} == value` - Include if var equals value
 * - `{{var}} != value` - Include if var doesn't equal value
 */
export function parseCondition(condition: string): ParsedCondition {
  const trimmed = condition.trim();

  // Check for != operator
  const notEqualsMatch = trimmed.match(/^\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}\s*!=\s*(.+)$/);
  if (notEqualsMatch) {
    return {
      operator: 'notEquals',
      variableName: notEqualsMatch[1],
      compareValue: notEqualsMatch[2].trim(),
    };
  }

  // Check for == operator
  const equalsMatch = trimmed.match(/^\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}\s*==\s*(.+)$/);
  if (equalsMatch) {
    return {
      operator: 'equals',
      variableName: equalsMatch[1],
      compareValue: equalsMatch[2].trim(),
    };
  }

  // Check for negation
  const negationMatch = trimmed.match(/^!\s*\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}$/);
  if (negationMatch) {
    return {
      operator: 'not',
      variableName: negationMatch[1],
    };
  }

  // Check for simple truthy
  const truthyMatch = trimmed.match(/^\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}$/);
  if (truthyMatch) {
    return {
      operator: 'truthy',
      variableName: truthyMatch[1],
    };
  }

  throw new ValidationError(
    `Invalid condition syntax: ${condition}`,
    ErrorCode.INVALID_INPUT,
    { field: 'condition', value: condition }
  );
}

/**
 * Evaluates a condition with given variable values
 *
 * @param condition - Condition expression string
 * @param variables - Resolved variable values
 * @returns Whether the condition evaluates to true
 */
export function evaluateCondition(
  condition: string,
  variables: ResolvedVariables
): boolean {
  const parsed = parseCondition(condition);
  const value = variables[parsed.variableName];

  switch (parsed.operator) {
    case 'truthy':
      return isTruthy(value);
    case 'not':
      return !isTruthy(value);
    case 'equals':
      return String(value ?? '') === parsed.compareValue;
    case 'notEquals':
      return String(value ?? '') !== parsed.compareValue;
    default:
      return false;
  }
}

// ============================================================================
// Substitution System
// ============================================================================

/**
 * Extracts variable names from a template string
 */
export function extractVariableNames(template: string): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex to ensure consistent behavior
  const pattern = new RegExp(VARIABLE_SUBSTITUTION_PATTERN.source, 'g');
  while ((match = pattern.exec(template)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  return names;
}

/**
 * Substitutes variables in a template string
 *
 * @param template - Template string with {{variable}} placeholders
 * @param variables - Resolved variable values
 * @param allowMissing - If true, missing variables are replaced with empty string
 * @returns Substituted string
 */
export function substituteVariables(
  template: string,
  variables: ResolvedVariables,
  allowMissing: boolean = false
): string {
  return template.replace(VARIABLE_SUBSTITUTION_PATTERN, (match, varName) => {
    const value = variables[varName];
    if (value === undefined) {
      if (allowMissing) {
        return '';
      }
      throw new ValidationError(
        `Unresolved variable in template: ${varName}`,
        ErrorCode.MISSING_REQUIRED_FIELD,
        { field: varName, value: match }
      );
    }
    return String(value);
  });
}

/**
 * Checks if a template has any variable placeholders
 */
export function hasVariables(template: string): boolean {
  return VARIABLE_SUBSTITUTION_PATTERN.test(template);
}

// ============================================================================
// Step Filtering (by conditions)
// ============================================================================

/**
 * Filters steps by evaluating their conditions
 *
 * @param steps - Playbook steps
 * @param variables - Resolved variable values
 * @returns Steps that pass their conditions
 */
export function filterStepsByConditions(
  steps: PlaybookStep[],
  variables: ResolvedVariables
): PlaybookStep[] {
  return steps.filter((step) => {
    if (!step.condition) {
      return true; // No condition means always include
    }
    return evaluateCondition(step.condition, variables);
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets a step by ID
 */
export function getStepById(playbook: Playbook, stepId: string): PlaybookStep | undefined {
  return playbook.steps.find((s) => s.id === stepId);
}

/**
 * Gets a variable by name
 */
export function getVariableByName(
  playbook: Playbook,
  name: string
): PlaybookVariable | undefined {
  return playbook.variables.find((v) => v.name === name);
}

/**
 * Checks if a playbook has variables
 */
export function hasPlaybookVariables(playbook: Playbook): boolean {
  return playbook.variables.length > 0;
}

/**
 * Checks if a playbook has steps
 */
export function hasSteps(playbook: Playbook): boolean {
  return playbook.steps.length > 0;
}

/**
 * Checks if a playbook extends other playbooks
 */
export function hasParents(playbook: Playbook): boolean {
  return playbook.extends !== undefined && playbook.extends.length > 0;
}

/**
 * Checks if a playbook has a description reference
 */
export function hasDescription(playbook: Playbook): boolean {
  return playbook.descriptionRef !== undefined;
}

/**
 * Gets the step count
 */
export function getStepCount(playbook: Playbook): number {
  return playbook.steps.length;
}

/**
 * Gets the variable count
 */
export function getVariableCount(playbook: Playbook): number {
  return playbook.variables.length;
}

/**
 * Filter playbooks by name pattern
 */
export function filterByNamePattern<T extends Playbook>(
  playbooks: T[],
  pattern: RegExp
): T[] {
  return playbooks.filter((p) => pattern.test(p.name));
}

/**
 * Filter playbooks that have a specific variable
 */
export function filterByVariable<T extends Playbook>(
  playbooks: T[],
  variableName: string
): T[] {
  return playbooks.filter((p) => p.variables.some((v) => v.name === variableName));
}

/**
 * Sort playbooks by name
 */
export function sortByName<T extends Playbook>(playbooks: T[]): T[] {
  return [...playbooks].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Sort playbooks by version (newest first)
 */
export function sortByVersion<T extends Playbook>(playbooks: T[]): T[] {
  return [...playbooks].sort((a, b) => b.version - a.version);
}

/**
 * Sort playbooks by creation date (newest first)
 */
export function sortPlaybooksByCreatedAtDesc<T extends Playbook>(playbooks: T[]): T[] {
  return [...playbooks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Sort playbooks by creation date (oldest first)
 */
export function sortPlaybooksByCreatedAtAsc<T extends Playbook>(playbooks: T[]): T[] {
  return [...playbooks].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/**
 * Sort playbooks by step count (most steps first)
 */
export function sortByStepCount<T extends Playbook>(playbooks: T[]): T[] {
  return [...playbooks].sort((a, b) => b.steps.length - a.steps.length);
}

/**
 * Group playbooks by whether they have parents
 */
export function groupByHasParents<T extends Playbook>(
  playbooks: T[]
): { standalone: T[]; extended: T[] } {
  const standalone: T[] = [];
  const extended: T[] = [];

  for (const playbook of playbooks) {
    if (hasParents(playbook)) {
      extended.push(playbook);
    } else {
      standalone.push(playbook);
    }
  }

  return { standalone, extended };
}

/**
 * Gets all parent playbook names from an array of playbooks
 */
export function getAllParentNames(playbooks: Playbook[]): string[] {
  const parentNames = new Set<string>();
  for (const playbook of playbooks) {
    if (playbook.extends) {
      for (const parent of playbook.extends) {
        parentNames.add(parent);
      }
    }
  }
  return Array.from(parentNames);
}

/**
 * Finds playbooks that extend a given playbook name
 */
export function findChildPlaybooks<T extends Playbook>(
  playbooks: T[],
  parentName: string
): T[] {
  return playbooks.filter((p) => p.extends?.includes(parentName));
}

/**
 * Finds a playbook by name
 */
export function findByName<T extends Playbook>(playbooks: T[], name: string): T | undefined {
  const normalizedName = name.toLowerCase();
  return playbooks.find((p) => p.name.toLowerCase() === normalizedName);
}

// ============================================================================
// Playbook Inheritance System
// ============================================================================

/**
 * Playbook loader function type.
 * Used to load playbooks by name for inheritance resolution.
 */
export type PlaybookLoader = (name: string) => Playbook | undefined | Promise<Playbook | undefined>;

/**
 * Resolved inheritance chain for a playbook
 */
export interface ResolvedInheritanceChain {
  /** The inheritance chain in order from root ancestors to the target playbook */
  chain: Playbook[];
  /** All unique playbook names in the chain */
  names: Set<string>;
}

/**
 * Result of resolving playbook inheritance
 */
export interface ResolvedPlaybook {
  /** The original playbook (without merged inheritance) */
  original: Playbook;
  /** Merged variables from inheritance chain */
  variables: PlaybookVariable[];
  /** Merged steps from inheritance chain */
  steps: PlaybookStep[];
  /** The complete inheritance chain */
  inheritanceChain: Playbook[];
}

/**
 * Resolves the inheritance chain for a playbook.
 *
 * Detects circular inheritance and returns the chain in order from
 * root ancestors to the target playbook.
 *
 * @param playbook - The playbook to resolve inheritance for
 * @param loader - Function to load playbooks by name
 * @returns The resolved inheritance chain
 * @throws ConflictError if circular inheritance is detected
 * @throws NotFoundError if a parent playbook cannot be found
 */
export async function resolveInheritanceChain(
  playbook: Playbook,
  loader: PlaybookLoader
): Promise<ResolvedInheritanceChain> {
  const chain: Playbook[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>(); // For cycle detection

  // Recursive helper to resolve a playbook and its parents
  async function resolve(current: Playbook, path: string[]): Promise<void> {
    const name = current.name;

    // Check for circular inheritance
    if (visiting.has(name)) {
      const cycle = [...path, name].join(' -> ');
      throw new ConflictError(
        `Circular inheritance detected: ${cycle}`,
        ErrorCode.CYCLE_DETECTED,
        { chain: path, duplicate: name }
      );
    }

    // Skip if already fully processed
    if (visited.has(name)) {
      return;
    }

    // Mark as being visited (for cycle detection)
    visiting.add(name);

    // Process parent playbooks first (depth-first)
    if (current.extends && current.extends.length > 0) {
      for (const parentName of current.extends) {
        // Self-extension check
        if (parentName === name) {
          throw new ConflictError(
            `Playbook '${name}' cannot extend itself`,
            ErrorCode.CYCLE_DETECTED,
            { field: 'extends', value: name }
          );
        }

        // Skip if parent already processed
        if (visited.has(parentName)) {
          continue;
        }

        // Load parent playbook
        const parent = await Promise.resolve(loader(parentName));
        if (!parent) {
          throw new NotFoundError(
            `Parent playbook '${parentName}' not found (required by '${name}')`,
            ErrorCode.NOT_FOUND,
            { field: 'extends', value: parentName, requiredBy: name }
          );
        }

        // Recursively resolve parent
        await resolve(parent, [...path, name]);
      }
    }

    // Mark as fully visited and add to chain
    visiting.delete(name);
    visited.add(name);
    chain.push(current);
  }

  // Start resolution from the target playbook
  await resolve(playbook, []);

  return {
    chain,
    names: visited,
  };
}

/**
 * Merges variables from an inheritance chain.
 *
 * Variables are merged in order - later playbooks override earlier ones.
 * A variable with the same name replaces the parent's definition entirely.
 *
 * @param chain - The inheritance chain (from root ancestors to target)
 * @returns Merged array of variables
 */
export function mergeVariables(chain: Playbook[]): PlaybookVariable[] {
  const variableMap = new Map<string, PlaybookVariable>();

  // Process chain in order - later playbooks override earlier ones
  for (const playbook of chain) {
    for (const variable of playbook.variables) {
      variableMap.set(variable.name, variable);
    }
  }

  return Array.from(variableMap.values());
}

/**
 * Merges steps from an inheritance chain.
 *
 * Steps are merged in order:
 * - Same ID replaces parent's step
 * - New steps are added after parent's steps
 * - Order within each playbook is preserved
 *
 * @param chain - The inheritance chain (from root ancestors to target)
 * @returns Merged array of steps
 */
export function mergeSteps(chain: Playbook[]): PlaybookStep[] {
  const stepMap = new Map<string, { step: PlaybookStep; order: number }>();
  let orderCounter = 0;

  // Process chain in order - later playbooks override earlier ones
  for (const playbook of chain) {
    for (const step of playbook.steps) {
      const existing = stepMap.get(step.id);
      if (existing) {
        // Replace step but keep original order
        stepMap.set(step.id, { step, order: existing.order });
      } else {
        // New step gets next order
        stepMap.set(step.id, { step, order: orderCounter++ });
      }
    }
  }

  // Sort by order and return steps
  return Array.from(stepMap.values())
    .sort((a, b) => a.order - b.order)
    .map(({ step }) => step);
}

/**
 * Validates merged steps after inheritance resolution.
 *
 * Ensures:
 * - All step IDs are unique (guaranteed by mergeSteps)
 * - All dependsOn references are valid within the merged steps
 * - No self-dependencies
 *
 * @param steps - Merged steps to validate
 * @throws NotFoundError if dependsOn references unknown step
 * @throws ConflictError if self-dependency detected
 */
export function validateMergedSteps(steps: PlaybookStep[]): void {
  const stepIds = new Set(steps.map((s) => s.id));

  for (const step of steps) {
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        if (depId === step.id) {
          throw new ConflictError(
            `Step '${step.id}' cannot depend on itself`,
            ErrorCode.CYCLE_DETECTED,
            { field: 'dependsOn', value: depId }
          );
        }
        if (!stepIds.has(depId)) {
          throw new NotFoundError(
            `Step '${step.id}' depends on unknown step '${depId}'`,
            ErrorCode.NOT_FOUND,
            { field: 'dependsOn', value: depId, stepId: step.id }
          );
        }
      }
    }
  }
}

/**
 * Resolves full playbook inheritance.
 *
 * This is the main entry point for resolving playbook inheritance.
 * It resolves the inheritance chain, merges variables and steps,
 * and validates the result.
 *
 * @param playbook - The playbook to resolve
 * @param loader - Function to load playbooks by name
 * @returns Resolved playbook with merged variables and steps
 * @throws ConflictError if circular inheritance is detected
 * @throws NotFoundError if a parent playbook cannot be found
 */
export async function resolvePlaybookInheritance(
  playbook: Playbook,
  loader: PlaybookLoader
): Promise<ResolvedPlaybook> {
  // If playbook has no parents, return as-is
  if (!hasParents(playbook)) {
    return {
      original: playbook,
      variables: playbook.variables,
      steps: playbook.steps,
      inheritanceChain: [playbook],
    };
  }

  // Resolve the inheritance chain
  const { chain } = await resolveInheritanceChain(playbook, loader);

  // Merge variables and steps
  const mergedVariables = mergeVariables(chain);
  const mergedSteps = mergeSteps(chain);

  // Validate merged steps
  validateMergedSteps(mergedSteps);

  return {
    original: playbook,
    variables: mergedVariables,
    steps: mergedSteps,
    inheritanceChain: chain,
  };
}

/**
 * Creates a synchronous playbook loader from an array of playbooks.
 *
 * Useful for creating a loader for in-memory playbook collections.
 *
 * @param playbooks - Array of playbooks to search
 * @returns Loader function
 */
export function createPlaybookLoader(playbooks: Playbook[]): PlaybookLoader {
  return (name: string) => findByName(playbooks, name);
}

// ============================================================================
// Circular Inheritance Detection at Creation Time
// ============================================================================

/**
 * Validates that creating a playbook with the given name and extends would not
 * create circular inheritance.
 *
 * This is used during playbook creation to detect cycles BEFORE the playbook
 * is actually created and stored.
 *
 * @param name - The name of the playbook being created
 * @param extendsArray - The playbooks this new playbook will extend
 * @param loader - Function to load existing playbooks by name
 * @returns Object with valid flag and optional error message with cycle path
 * @throws ConflictError if circular inheritance would be created
 */
export async function validateNoCircularInheritance(
  name: string,
  extendsArray: string[] | undefined,
  loader: PlaybookLoader
): Promise<{ valid: true } | { valid: false; error: string; cycle: string[] }> {
  // No extends means no possibility of circular inheritance
  if (!extendsArray || extendsArray.length === 0) {
    return { valid: true };
  }

  const normalizedName = name.toLowerCase();

  // Check for self-extension (already handled in createPlaybook but good to be safe)
  if (extendsArray.some(ext => ext.toLowerCase() === normalizedName)) {
    return {
      valid: false,
      error: `Playbook '${name}' cannot extend itself`,
      cycle: [name, name],
    };
  }

  // For each parent, check if following its inheritance chain would eventually
  // lead back to the playbook we're creating
  for (const parentName of extendsArray) {
    const cycleCheck = await detectCycleFromParent(normalizedName, parentName, loader);
    if (cycleCheck.hasCycle) {
      return {
        valid: false,
        error: `Creating playbook would create circular inheritance: ${cycleCheck.cycle.join(' -> ')}`,
        cycle: cycleCheck.cycle,
      };
    }
  }

  return { valid: true };
}

/**
 * Checks if following the inheritance chain from a parent playbook would
 * create a cycle back to the target playbook name.
 *
 * @param targetName - The name of the playbook being created
 * @param parentName - The name of a parent playbook to check
 * @param loader - Function to load playbooks by name
 * @returns Object indicating if a cycle exists and the path
 */
async function detectCycleFromParent(
  targetName: string,
  parentName: string,
  loader: PlaybookLoader
): Promise<{ hasCycle: false } | { hasCycle: true; cycle: string[] }> {
  const visited = new Set<string>();
  const path: string[] = [targetName];
  // targetName is already normalized (lowercase) by the caller

  async function traverse(currentName: string): Promise<boolean> {
    const normalizedCurrent = currentName.toLowerCase();

    // If we've reached a playbook that extends the target, we have a cycle
    // This happens when an existing playbook already extends the one we're creating
    // OR when following the chain leads back to the target
    if (normalizedCurrent === targetName) {
      return true;
    }

    // Already visited this node in this traversal (existing cycle in DB - skip)
    if (visited.has(normalizedCurrent)) {
      return false;
    }

    visited.add(normalizedCurrent);
    path.push(currentName);

    // Load the playbook
    const playbook = await Promise.resolve(loader(currentName));

    // If the playbook doesn't exist, no cycle possible from this branch
    // (the extends validation for non-existent playbooks is a separate concern)
    if (!playbook) {
      path.pop();
      return false;
    }

    // Check all of this playbook's parents
    if (playbook.extends && playbook.extends.length > 0) {
      for (const grandparentName of playbook.extends) {
        if (await traverse(grandparentName)) {
          return true;
        }
      }
    }

    path.pop();
    return false;
  }

  // Start traversal from the parent
  const hasCycle = await traverse(parentName);

  if (hasCycle) {
    return { hasCycle: true, cycle: path };
  }

  return { hasCycle: false };
}
