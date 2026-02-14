/**
 * Playbook YAML Support
 *
 * Handles YAML playbook file parsing, validation, and file discovery.
 * Playbook files use the `.playbook.yaml` extension and can be stored in
 * configured playbook directories.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'yaml';
import { ValidationError, NotFoundError, ConflictError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import type { EntityId } from './element.js';
import {
  type Playbook,
  type PlaybookVariable,
  type PlaybookStep,
  type CreatePlaybookInput,
  VariableType,
  FunctionRuntime,
  isValidVariableType,
  isValidFunctionRuntime,
  isFunctionStep,
  PLAYBOOK_NAME_PATTERN,
  MAX_PLAYBOOK_NAME_LENGTH,
  MAX_PLAYBOOK_TITLE_LENGTH,
  MAX_VARIABLE_NAME_LENGTH,
  MAX_STEP_ID_LENGTH,
  MAX_STEP_TITLE_LENGTH,
  MAX_STEP_DESCRIPTION_LENGTH,
  MAX_CONDITION_LENGTH,
  MAX_ASSIGNEE_LENGTH,
  MAX_FUNCTION_CODE_LENGTH,
  MAX_FUNCTION_COMMAND_LENGTH,
  MAX_FUNCTION_TIMEOUT,
  MAX_STEPS,
  MAX_VARIABLES,
  MAX_EXTENDS,
} from './playbook.js';
import type { Priority, Complexity, TaskTypeValue } from './task.js';

// ============================================================================
// Constants
// ============================================================================

/** File extension for playbook YAML files */
export const PLAYBOOK_FILE_EXTENSION = '.playbook.yaml';

/** Alternative file extension (also supported) */
export const PLAYBOOK_FILE_EXTENSION_ALT = '.playbook.yml';

/** Default playbook directories relative to .stoneforge */
export const DEFAULT_PLAYBOOK_DIRS = ['playbooks'];

// ============================================================================
// YAML Schema Types
// ============================================================================

/**
 * YAML representation of a PlaybookVariable
 * Uses snake_case for YAML conventions
 */
export interface YamlPlaybookVariable {
  /** Variable name */
  name: string;
  /** Variable description */
  description?: string;
  /** Variable type: 'string' | 'number' | 'boolean' */
  type: string;
  /** Whether the variable is required */
  required: boolean;
  /** Default value */
  default?: unknown;
  /** Allowed values for enum */
  enum?: unknown[];
}

/**
 * YAML representation of a PlaybookStep
 * Uses snake_case for YAML conventions
 */
export interface YamlPlaybookStep {
  /** Step identifier */
  id: string;
  /** Step title (supports variable substitution) */
  title: string;
  /** Step description (supports variable substitution) */
  description?: string;
  /** Step type: 'task' (default) or 'function' */
  step_type?: string;
  /** Task type (for task steps) */
  task_type?: string;
  /** Priority (1-5) (for task steps) */
  priority?: number;
  /** Complexity (1-5) (for task steps) */
  complexity?: number;
  /** Assignee (supports variable substitution) (for task steps) */
  assignee?: string;
  /** Function runtime: 'typescript', 'python', or 'shell' (for function steps) */
  runtime?: string;
  /** Code to execute (for typescript/python function steps) */
  code?: string;
  /** Command to execute (for shell function steps) */
  command?: string;
  /** Timeout in milliseconds (for function steps) */
  timeout?: number;
  /** Step dependencies */
  depends_on?: string[];
  /** Condition for inclusion */
  condition?: string;
}

/**
 * YAML representation of a Playbook file
 * Uses snake_case for YAML conventions
 */
export interface YamlPlaybookFile {
  /** Playbook name (unique identifier) */
  name: string;
  /** Display title */
  title: string;
  /** Version number */
  version?: number;
  /** Variable definitions */
  variables?: YamlPlaybookVariable[];
  /** Step definitions */
  steps?: YamlPlaybookStep[];
  /** Parent playbooks to inherit from */
  extends?: string[];
}

// ============================================================================
// Discovery Types
// ============================================================================

/**
 * Result of discovering a playbook file
 */
export interface DiscoveredPlaybook {
  /** Full path to the playbook file */
  path: string;
  /** Playbook name (derived from filename) */
  name: string;
  /** Directory containing the playbook */
  directory: string;
}

/**
 * Options for playbook discovery
 */
export interface PlaybookDiscoveryOptions {
  /** Additional directories to search */
  additionalPaths?: string[];
  /** Whether to search recursively within directories */
  recursive?: boolean;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Expands ~ to home directory in a path
 */
export function expandPath(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (filePath === '~') {
    return os.homedir();
  }
  return filePath;
}

/**
 * Extracts playbook name from a filename
 * @example "my-workflow.playbook.yaml" -> "my-workflow"
 */
export function extractPlaybookName(filename: string): string {
  const basename = path.basename(filename);
  if (basename.endsWith(PLAYBOOK_FILE_EXTENSION)) {
    return basename.slice(0, -PLAYBOOK_FILE_EXTENSION.length);
  }
  if (basename.endsWith(PLAYBOOK_FILE_EXTENSION_ALT)) {
    return basename.slice(0, -PLAYBOOK_FILE_EXTENSION_ALT.length);
  }
  return basename;
}

/**
 * Checks if a filename is a playbook file
 */
export function isPlaybookFile(filename: string): boolean {
  const basename = path.basename(filename);
  return (
    basename.endsWith(PLAYBOOK_FILE_EXTENSION) ||
    basename.endsWith(PLAYBOOK_FILE_EXTENSION_ALT)
  );
}

// ============================================================================
// YAML Parsing
// ============================================================================

/**
 * Parses YAML content into a playbook file structure
 *
 * @param content - YAML string content
 * @param filePath - Path to file (for error messages)
 * @returns Parsed YAML playbook object
 */
export function parseYamlPlaybook(content: string, filePath?: string): YamlPlaybookFile {
  try {
    const parsed = yaml.parse(content);

    if (parsed === null || parsed === undefined) {
      throw new ValidationError(
        `Playbook file is empty${filePath ? ` (${filePath})` : ''}`,
        ErrorCode.MISSING_REQUIRED_FIELD,
        { filePath }
      );
    }

    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ValidationError(
        `Playbook file must contain an object${filePath ? ` (${filePath})` : ''}`,
        ErrorCode.INVALID_INPUT,
        { value: typeof parsed, filePath }
      );
    }

    return parsed as YamlPlaybookFile;
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
    throw new ValidationError(
      `Failed to parse playbook YAML${filePath ? ` (${filePath})` : ''}: ${err instanceof Error ? err.message : String(err)}`,
      ErrorCode.INVALID_INPUT,
      { filePath }
    );
  }
}

// ============================================================================
// YAML to Internal Conversion
// ============================================================================

/**
 * Converts a YAML variable to internal PlaybookVariable format
 */
function convertYamlVariable(yamlVar: YamlPlaybookVariable, index: number): PlaybookVariable {
  // Validate type
  if (!isValidVariableType(yamlVar.type)) {
    throw new ValidationError(
      `Invalid variable type at variables[${index}]: '${yamlVar.type}'. Must be one of: ${Object.values(VariableType).join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: `variables[${index}].type`, value: yamlVar.type }
    );
  }

  const variable: PlaybookVariable = {
    name: yamlVar.name,
    type: yamlVar.type as VariableType,
    required: yamlVar.required ?? false,
  };

  if (yamlVar.description !== undefined) {
    variable.description = yamlVar.description;
  }

  if (yamlVar.default !== undefined) {
    variable.default = yamlVar.default;
  }

  if (yamlVar.enum !== undefined) {
    variable.enum = yamlVar.enum;
  }

  return variable;
}

/**
 * Converts a YAML step to internal PlaybookStep format
 */
function convertYamlStep(yamlStep: YamlPlaybookStep, _index: number): PlaybookStep {
  // Check if this is a function step
  if (yamlStep.step_type === 'function') {
    const functionStep = {
      id: yamlStep.id,
      title: yamlStep.title,
      stepType: 'function' as const,
      runtime: (yamlStep.runtime ?? 'typescript') as FunctionRuntime,
      description: yamlStep.description,
      code: yamlStep.code,
      command: yamlStep.command,
      timeout: yamlStep.timeout,
      dependsOn: yamlStep.depends_on,
      condition: yamlStep.condition,
    };

    // Clean up undefined values
    if (functionStep.description === undefined) delete functionStep.description;
    if (functionStep.code === undefined) delete functionStep.code;
    if (functionStep.command === undefined) delete functionStep.command;
    if (functionStep.timeout === undefined) delete functionStep.timeout;
    if (functionStep.dependsOn === undefined) delete functionStep.dependsOn;
    if (functionStep.condition === undefined) delete functionStep.condition;

    return functionStep;
  }

  // Default to task step
  const step: PlaybookStep = {
    id: yamlStep.id,
    title: yamlStep.title,
  };

  if (yamlStep.description !== undefined) {
    step.description = yamlStep.description;
  }

  if (yamlStep.task_type !== undefined) {
    (step as any).taskType = yamlStep.task_type as TaskTypeValue;
  }

  if (yamlStep.priority !== undefined) {
    (step as any).priority = yamlStep.priority as Priority;
  }

  if (yamlStep.complexity !== undefined) {
    (step as any).complexity = yamlStep.complexity as Complexity;
  }

  if (yamlStep.assignee !== undefined) {
    (step as any).assignee = yamlStep.assignee;
  }

  if (yamlStep.depends_on !== undefined) {
    step.dependsOn = yamlStep.depends_on;
  }

  if (yamlStep.condition !== undefined) {
    step.condition = yamlStep.condition;
  }

  return step;
}

/**
 * Converts YAML playbook to CreatePlaybookInput format
 *
 * @param yamlPlaybook - Parsed YAML playbook
 * @param createdBy - Entity ID for the creator
 * @returns CreatePlaybookInput suitable for createPlaybook()
 */
export function convertYamlToPlaybookInput(
  yamlPlaybook: YamlPlaybookFile,
  createdBy: EntityId
): CreatePlaybookInput {
  // Convert variables
  const variables: PlaybookVariable[] = [];
  if (yamlPlaybook.variables) {
    for (let i = 0; i < yamlPlaybook.variables.length; i++) {
      variables.push(convertYamlVariable(yamlPlaybook.variables[i], i));
    }
  }

  // Convert steps
  const steps: PlaybookStep[] = [];
  if (yamlPlaybook.steps) {
    for (let i = 0; i < yamlPlaybook.steps.length; i++) {
      steps.push(convertYamlStep(yamlPlaybook.steps[i], i));
    }
  }

  const input: CreatePlaybookInput = {
    name: yamlPlaybook.name,
    title: yamlPlaybook.title,
    createdBy,
    variables,
    steps,
  };

  if (yamlPlaybook.version !== undefined) {
    input.version = yamlPlaybook.version;
  }

  if (yamlPlaybook.extends !== undefined && yamlPlaybook.extends.length > 0) {
    input.extends = yamlPlaybook.extends;
  }

  return input;
}

// ============================================================================
// YAML Schema Validation
// ============================================================================

/**
 * Validates a YAML playbook structure before conversion
 * Provides detailed error messages for schema violations
 *
 * @param yamlPlaybook - Parsed YAML playbook to validate
 * @param filePath - Optional file path for error messages
 */
export function validateYamlPlaybook(yamlPlaybook: YamlPlaybookFile, filePath?: string): void {
  const context = filePath ? ` in ${filePath}` : '';

  // Validate required fields
  if (typeof yamlPlaybook.name !== 'string' || yamlPlaybook.name.length === 0) {
    throw new ValidationError(
      `Playbook name is required${context}`,
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'name', filePath }
    );
  }

  if (typeof yamlPlaybook.title !== 'string' || yamlPlaybook.title.length === 0) {
    throw new ValidationError(
      `Playbook title is required${context}`,
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'title', filePath }
    );
  }

  // Validate name format
  if (!PLAYBOOK_NAME_PATTERN.test(yamlPlaybook.name)) {
    throw new ValidationError(
      `Invalid playbook name '${yamlPlaybook.name}'${context}. Must start with a letter or underscore, followed by alphanumeric, underscore, or hyphen`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', value: yamlPlaybook.name, filePath }
    );
  }

  if (yamlPlaybook.name.length > MAX_PLAYBOOK_NAME_LENGTH) {
    throw new ValidationError(
      `Playbook name exceeds maximum length of ${MAX_PLAYBOOK_NAME_LENGTH} characters${context}`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', expected: `<= ${MAX_PLAYBOOK_NAME_LENGTH} characters`, actual: yamlPlaybook.name.length, filePath }
    );
  }

  // Validate title length
  if (yamlPlaybook.title.trim().length > MAX_PLAYBOOK_TITLE_LENGTH) {
    throw new ValidationError(
      `Playbook title exceeds maximum length of ${MAX_PLAYBOOK_TITLE_LENGTH} characters${context}`,
      ErrorCode.TITLE_TOO_LONG,
      { field: 'title', expected: `<= ${MAX_PLAYBOOK_TITLE_LENGTH} characters`, actual: yamlPlaybook.title.length, filePath }
    );
  }

  // Validate version if present
  if (yamlPlaybook.version !== undefined) {
    if (typeof yamlPlaybook.version !== 'number' || !Number.isInteger(yamlPlaybook.version) || yamlPlaybook.version < 1) {
      throw new ValidationError(
        `Playbook version must be a positive integer${context}`,
        ErrorCode.INVALID_INPUT,
        { field: 'version', value: yamlPlaybook.version, expected: 'positive integer', filePath }
      );
    }
  }

  // Validate variables array
  if (yamlPlaybook.variables !== undefined) {
    if (!Array.isArray(yamlPlaybook.variables)) {
      throw new ValidationError(
        `Playbook variables must be an array${context}`,
        ErrorCode.INVALID_INPUT,
        { field: 'variables', value: typeof yamlPlaybook.variables, expected: 'array', filePath }
      );
    }

    if (yamlPlaybook.variables.length > MAX_VARIABLES) {
      throw new ValidationError(
        `Playbook exceeds maximum of ${MAX_VARIABLES} variables${context}`,
        ErrorCode.INVALID_INPUT,
        { field: 'variables', expected: `<= ${MAX_VARIABLES} items`, actual: yamlPlaybook.variables.length, filePath }
      );
    }

    // Validate each variable
    const variableNames = new Set<string>();
    for (let i = 0; i < yamlPlaybook.variables.length; i++) {
      validateYamlVariable(yamlPlaybook.variables[i], i, context, variableNames);
    }
  }

  // Validate steps array
  if (yamlPlaybook.steps !== undefined) {
    if (!Array.isArray(yamlPlaybook.steps)) {
      throw new ValidationError(
        `Playbook steps must be an array${context}`,
        ErrorCode.INVALID_INPUT,
        { field: 'steps', value: typeof yamlPlaybook.steps, expected: 'array', filePath }
      );
    }

    if (yamlPlaybook.steps.length > MAX_STEPS) {
      throw new ValidationError(
        `Playbook exceeds maximum of ${MAX_STEPS} steps${context}`,
        ErrorCode.INVALID_INPUT,
        { field: 'steps', expected: `<= ${MAX_STEPS} items`, actual: yamlPlaybook.steps.length, filePath }
      );
    }

    // Validate each step
    const stepIds = new Set<string>();
    for (let i = 0; i < yamlPlaybook.steps.length; i++) {
      validateYamlStep(yamlPlaybook.steps[i], i, context, stepIds);
    }

    // Validate depends_on references
    for (let i = 0; i < yamlPlaybook.steps.length; i++) {
      const step = yamlPlaybook.steps[i];
      if (step.depends_on) {
        for (const depId of step.depends_on) {
          if (!stepIds.has(depId)) {
            throw new NotFoundError(
              `Step '${step.id}' depends on unknown step '${depId}'${context}`,
              ErrorCode.NOT_FOUND,
              { field: `steps[${i}].depends_on`, value: depId, filePath }
            );
          }
          if (depId === step.id) {
            throw new ConflictError(
              `Step '${step.id}' cannot depend on itself${context}`,
              ErrorCode.CYCLE_DETECTED,
              { field: `steps[${i}].depends_on`, value: depId, filePath }
            );
          }
        }
      }
    }
  }

  // Validate extends array
  if (yamlPlaybook.extends !== undefined) {
    if (!Array.isArray(yamlPlaybook.extends)) {
      throw new ValidationError(
        `Playbook extends must be an array${context}`,
        ErrorCode.INVALID_INPUT,
        { field: 'extends', value: typeof yamlPlaybook.extends, expected: 'array', filePath }
      );
    }

    if (yamlPlaybook.extends.length > MAX_EXTENDS) {
      throw new ValidationError(
        `Playbook exceeds maximum of ${MAX_EXTENDS} parent playbooks${context}`,
        ErrorCode.INVALID_INPUT,
        { field: 'extends', expected: `<= ${MAX_EXTENDS} items`, actual: yamlPlaybook.extends.length, filePath }
      );
    }

    const parentNames = new Set<string>();
    for (let i = 0; i < yamlPlaybook.extends.length; i++) {
      const parent = yamlPlaybook.extends[i];
      if (typeof parent !== 'string' || parent.length === 0) {
        throw new ValidationError(
          `Extends entry must be a non-empty string${context}`,
          ErrorCode.INVALID_INPUT,
          { field: `extends[${i}]`, value: parent, filePath }
        );
      }
      if (parent === yamlPlaybook.name) {
        throw new ConflictError(
          `Playbook cannot extend itself${context}`,
          ErrorCode.CYCLE_DETECTED,
          { field: `extends[${i}]`, value: parent, filePath }
        );
      }
      if (parentNames.has(parent)) {
        throw new ConflictError(
          `Duplicate parent playbook: ${parent}${context}`,
          ErrorCode.ALREADY_EXISTS,
          { field: `extends[${i}]`, value: parent, filePath }
        );
      }
      parentNames.add(parent);
    }
  }
}

/**
 * Validates a single YAML variable
 */
function validateYamlVariable(
  variable: YamlPlaybookVariable,
  index: number,
  context: string,
  seenNames: Set<string>
): void {
  // Validate name
  if (typeof variable.name !== 'string' || variable.name.length === 0) {
    throw new ValidationError(
      `Variable name is required at variables[${index}]${context}`,
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: `variables[${index}].name` }
    );
  }

  if (variable.name.length > MAX_VARIABLE_NAME_LENGTH) {
    throw new ValidationError(
      `Variable name exceeds maximum length at variables[${index}]${context}`,
      ErrorCode.INVALID_INPUT,
      { field: `variables[${index}].name`, expected: `<= ${MAX_VARIABLE_NAME_LENGTH} characters`, actual: variable.name.length }
    );
  }

  if (seenNames.has(variable.name)) {
    throw new ConflictError(
      `Duplicate variable name '${variable.name}' at variables[${index}]${context}`,
      ErrorCode.ALREADY_EXISTS,
      { field: `variables[${index}].name`, value: variable.name }
    );
  }
  seenNames.add(variable.name);

  // Validate type
  if (typeof variable.type !== 'string') {
    throw new ValidationError(
      `Variable type is required at variables[${index}]${context}`,
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: `variables[${index}].type` }
    );
  }

  if (!isValidVariableType(variable.type)) {
    throw new ValidationError(
      `Invalid variable type '${variable.type}' at variables[${index}]${context}. Must be one of: ${Object.values(VariableType).join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: `variables[${index}].type`, value: variable.type }
    );
  }

  // Validate required field
  if (variable.required !== undefined && typeof variable.required !== 'boolean') {
    throw new ValidationError(
      `Variable required must be a boolean at variables[${index}]${context}`,
      ErrorCode.INVALID_INPUT,
      { field: `variables[${index}].required`, value: variable.required, expected: 'boolean' }
    );
  }
}

/**
 * Validates a single YAML step
 */
function validateYamlStep(
  step: YamlPlaybookStep,
  index: number,
  context: string,
  seenIds: Set<string>
): void {
  // Validate id
  if (typeof step.id !== 'string' || step.id.length === 0) {
    throw new ValidationError(
      `Step id is required at steps[${index}]${context}`,
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: `steps[${index}].id` }
    );
  }

  if (step.id.length > MAX_STEP_ID_LENGTH) {
    throw new ValidationError(
      `Step id exceeds maximum length at steps[${index}]${context}`,
      ErrorCode.INVALID_INPUT,
      { field: `steps[${index}].id`, expected: `<= ${MAX_STEP_ID_LENGTH} characters`, actual: step.id.length }
    );
  }

  if (seenIds.has(step.id)) {
    throw new ConflictError(
      `Duplicate step id '${step.id}' at steps[${index}]${context}`,
      ErrorCode.ALREADY_EXISTS,
      { field: `steps[${index}].id`, value: step.id }
    );
  }
  seenIds.add(step.id);

  // Validate title
  if (typeof step.title !== 'string' || step.title.trim().length === 0) {
    throw new ValidationError(
      `Step title is required at steps[${index}]${context}`,
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: `steps[${index}].title` }
    );
  }

  if (step.title.length > MAX_STEP_TITLE_LENGTH) {
    throw new ValidationError(
      `Step title exceeds maximum length at steps[${index}]${context}`,
      ErrorCode.TITLE_TOO_LONG,
      { field: `steps[${index}].title`, expected: `<= ${MAX_STEP_TITLE_LENGTH} characters`, actual: step.title.length }
    );
  }

  // Validate optional description
  if (step.description !== undefined && typeof step.description !== 'string') {
    throw new ValidationError(
      `Step description must be a string at steps[${index}]${context}`,
      ErrorCode.INVALID_INPUT,
      { field: `steps[${index}].description`, value: typeof step.description, expected: 'string' }
    );
  }

  if (step.description && step.description.length > MAX_STEP_DESCRIPTION_LENGTH) {
    throw new ValidationError(
      `Step description exceeds maximum length at steps[${index}]${context}`,
      ErrorCode.INVALID_INPUT,
      { field: `steps[${index}].description`, expected: `<= ${MAX_STEP_DESCRIPTION_LENGTH} characters`, actual: step.description.length }
    );
  }

  // Validate optional condition
  if (step.condition !== undefined && typeof step.condition !== 'string') {
    throw new ValidationError(
      `Step condition must be a string at steps[${index}]${context}`,
      ErrorCode.INVALID_INPUT,
      { field: `steps[${index}].condition`, value: typeof step.condition, expected: 'string' }
    );
  }

  if (step.condition && step.condition.length > MAX_CONDITION_LENGTH) {
    throw new ValidationError(
      `Step condition exceeds maximum length at steps[${index}]${context}`,
      ErrorCode.INVALID_INPUT,
      { field: `steps[${index}].condition`, expected: `<= ${MAX_CONDITION_LENGTH} characters`, actual: step.condition.length }
    );
  }

  // Validate optional assignee
  if (step.assignee !== undefined && typeof step.assignee !== 'string') {
    throw new ValidationError(
      `Step assignee must be a string at steps[${index}]${context}`,
      ErrorCode.INVALID_INPUT,
      { field: `steps[${index}].assignee`, value: typeof step.assignee, expected: 'string' }
    );
  }

  if (step.assignee && step.assignee.length > MAX_ASSIGNEE_LENGTH) {
    throw new ValidationError(
      `Step assignee exceeds maximum length at steps[${index}]${context}`,
      ErrorCode.INVALID_INPUT,
      { field: `steps[${index}].assignee`, expected: `<= ${MAX_ASSIGNEE_LENGTH} characters`, actual: step.assignee.length }
    );
  }

  // Validate optional depends_on
  if (step.depends_on !== undefined) {
    if (!Array.isArray(step.depends_on)) {
      throw new ValidationError(
        `Step depends_on must be an array at steps[${index}]${context}`,
        ErrorCode.INVALID_INPUT,
        { field: `steps[${index}].depends_on`, value: typeof step.depends_on, expected: 'array' }
      );
    }
    for (let i = 0; i < step.depends_on.length; i++) {
      if (typeof step.depends_on[i] !== 'string') {
        throw new ValidationError(
          `Step depends_on entries must be strings at steps[${index}].depends_on[${i}]${context}`,
          ErrorCode.INVALID_INPUT,
          { field: `steps[${index}].depends_on[${i}]`, value: step.depends_on[i], expected: 'string' }
        );
      }
    }
  }

  // Validate optional priority
  if (step.priority !== undefined) {
    if (typeof step.priority !== 'number' || !Number.isInteger(step.priority) || step.priority < 1 || step.priority > 5) {
      throw new ValidationError(
        `Step priority must be an integer between 1 and 5 at steps[${index}]${context}`,
        ErrorCode.INVALID_INPUT,
        { field: `steps[${index}].priority`, value: step.priority, expected: '1-5' }
      );
    }
  }

  // Validate optional complexity
  if (step.complexity !== undefined) {
    if (typeof step.complexity !== 'number' || !Number.isInteger(step.complexity) || step.complexity < 1 || step.complexity > 5) {
      throw new ValidationError(
        `Step complexity must be an integer between 1 and 5 at steps[${index}]${context}`,
        ErrorCode.INVALID_INPUT,
        { field: `steps[${index}].complexity`, value: step.complexity, expected: '1-5' }
      );
    }
  }

  // Validate function step fields
  if (step.step_type === 'function') {
    // Validate runtime
    if (step.runtime !== undefined && !isValidFunctionRuntime(step.runtime)) {
      throw new ValidationError(
        `Invalid function runtime '${step.runtime}' at steps[${index}]${context}. Must be one of: ${Object.values(FunctionRuntime).join(', ')}`,
        ErrorCode.INVALID_INPUT,
        { field: `steps[${index}].runtime`, value: step.runtime }
      );
    }

    // Validate code length
    if (step.code !== undefined && typeof step.code === 'string' && step.code.length > MAX_FUNCTION_CODE_LENGTH) {
      throw new ValidationError(
        `Function code exceeds maximum length at steps[${index}]${context}`,
        ErrorCode.INVALID_INPUT,
        { field: `steps[${index}].code`, expected: `<= ${MAX_FUNCTION_CODE_LENGTH} characters`, actual: step.code.length }
      );
    }

    // Validate command length
    if (step.command !== undefined && typeof step.command === 'string' && step.command.length > MAX_FUNCTION_COMMAND_LENGTH) {
      throw new ValidationError(
        `Function command exceeds maximum length at steps[${index}]${context}`,
        ErrorCode.INVALID_INPUT,
        { field: `steps[${index}].command`, expected: `<= ${MAX_FUNCTION_COMMAND_LENGTH} characters`, actual: step.command.length }
      );
    }

    // Validate timeout
    if (step.timeout !== undefined) {
      if (typeof step.timeout !== 'number' || !Number.isInteger(step.timeout) || step.timeout < 1 || step.timeout > MAX_FUNCTION_TIMEOUT) {
        throw new ValidationError(
          `Function timeout must be an integer between 1 and ${MAX_FUNCTION_TIMEOUT} at steps[${index}]${context}`,
          ErrorCode.INVALID_INPUT,
          { field: `steps[${index}].timeout`, value: step.timeout, expected: `1-${MAX_FUNCTION_TIMEOUT}` }
        );
      }
    }

    // Function steps should not have task-specific fields
    if (step.task_type !== undefined || step.priority !== undefined || step.complexity !== undefined || step.assignee !== undefined) {
      throw new ValidationError(
        `Function steps should not have task-specific fields (task_type, priority, complexity, assignee) at steps[${index}]${context}`,
        ErrorCode.INVALID_INPUT,
        { field: `steps[${index}]` }
      );
    }
  }
}

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Discovers playbook files in specified directories
 *
 * @param searchPaths - Directories to search for playbook files
 * @param options - Discovery options
 * @returns Array of discovered playbooks
 */
export function discoverPlaybookFiles(
  searchPaths: string[],
  options: PlaybookDiscoveryOptions = {}
): DiscoveredPlaybook[] {
  const discovered: DiscoveredPlaybook[] = [];
  const seen = new Set<string>();

  const allPaths = [
    ...searchPaths.map(expandPath),
    ...(options.additionalPaths?.map(expandPath) ?? []),
  ];

  for (const searchPath of allPaths) {
    if (!fs.existsSync(searchPath)) {
      continue;
    }

    const stat = fs.statSync(searchPath);
    if (!stat.isDirectory()) {
      continue;
    }

    discoverInDirectory(searchPath, discovered, seen, options.recursive ?? false);
  }

  return discovered;
}

/**
 * Recursively discovers playbook files in a directory
 */
function discoverInDirectory(
  directory: string,
  discovered: DiscoveredPlaybook[],
  seen: Set<string>,
  recursive: boolean
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    // Directory not readable, skip
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isFile() && isPlaybookFile(entry.name)) {
      const name = extractPlaybookName(entry.name);
      const normalizedName = name.toLowerCase();

      // Skip duplicates (first one wins)
      if (!seen.has(normalizedName)) {
        seen.add(normalizedName);
        discovered.push({
          path: fullPath,
          name,
          directory,
        });
      }
    } else if (entry.isDirectory() && recursive) {
      discoverInDirectory(fullPath, discovered, seen, recursive);
    }
  }
}

/**
 * Finds a playbook file by name in the search paths
 *
 * @param name - Playbook name to find
 * @param searchPaths - Directories to search
 * @returns Path to the playbook file, or undefined if not found
 */
export function findPlaybookFile(name: string, searchPaths: string[]): string | undefined {
  const normalizedName = name.toLowerCase();

  for (const searchPath of searchPaths.map(expandPath)) {
    if (!fs.existsSync(searchPath)) {
      continue;
    }

    const stat = fs.statSync(searchPath);
    if (!stat.isDirectory()) {
      continue;
    }

    // Try both extensions
    const yamlPath = path.join(searchPath, `${name}${PLAYBOOK_FILE_EXTENSION}`);
    if (fs.existsSync(yamlPath)) {
      return yamlPath;
    }

    const ymlPath = path.join(searchPath, `${name}${PLAYBOOK_FILE_EXTENSION_ALT}`);
    if (fs.existsSync(ymlPath)) {
      return ymlPath;
    }

    // Also search for case-insensitive match
    try {
      const entries = fs.readdirSync(searchPath);
      for (const entry of entries) {
        if (!isPlaybookFile(entry)) continue;
        const entryName = extractPlaybookName(entry);
        if (entryName.toLowerCase() === normalizedName) {
          return path.join(searchPath, entry);
        }
      }
    } catch {
      // Directory not readable, skip
      continue;
    }
  }

  return undefined;
}

// ============================================================================
// File Loading
// ============================================================================

/**
 * Reads and parses a playbook file
 *
 * @param filePath - Path to the playbook file
 * @returns Parsed and validated YAML playbook
 */
export function readPlaybookFile(filePath: string): YamlPlaybookFile {
  if (!fs.existsSync(filePath)) {
    throw new NotFoundError(
      `Playbook file not found: ${filePath}`,
      ErrorCode.NOT_FOUND,
      { filePath }
    );
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const yamlPlaybook = parseYamlPlaybook(content, filePath);
    validateYamlPlaybook(yamlPlaybook, filePath);
    return yamlPlaybook;
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError || err instanceof ConflictError) {
      throw err;
    }
    throw new ValidationError(
      `Failed to read playbook file '${filePath}': ${err instanceof Error ? err.message : String(err)}`,
      ErrorCode.INVALID_INPUT,
      { filePath }
    );
  }
}

/**
 * Loads a playbook from a YAML file and converts it to CreatePlaybookInput
 *
 * @param filePath - Path to the playbook file
 * @param createdBy - Entity ID for the creator
 * @returns CreatePlaybookInput suitable for createPlaybook()
 */
export function loadPlaybookFromFile(filePath: string, createdBy: EntityId): CreatePlaybookInput {
  const yamlPlaybook = readPlaybookFile(filePath);
  return convertYamlToPlaybookInput(yamlPlaybook, createdBy);
}

// ============================================================================
// Internal to YAML Conversion
// ============================================================================

/**
 * Converts internal PlaybookVariable to YAML format
 */
function convertVariableToYaml(variable: PlaybookVariable): YamlPlaybookVariable {
  const yamlVar: YamlPlaybookVariable = {
    name: variable.name,
    type: variable.type,
    required: variable.required,
  };

  if (variable.description !== undefined) {
    yamlVar.description = variable.description;
  }

  if (variable.default !== undefined) {
    yamlVar.default = variable.default;
  }

  if (variable.enum !== undefined) {
    yamlVar.enum = variable.enum;
  }

  return yamlVar;
}

/**
 * Converts internal PlaybookStep to YAML format
 */
function convertStepToYaml(step: PlaybookStep): YamlPlaybookStep {
  const yamlStep: YamlPlaybookStep = {
    id: step.id,
    title: step.title,
  };

  if (step.description !== undefined) {
    yamlStep.description = step.description;
  }

  // Handle function steps
  if (isFunctionStep(step)) {
    yamlStep.step_type = 'function';
    yamlStep.runtime = step.runtime;

    if (step.code !== undefined) {
      yamlStep.code = step.code;
    }

    if (step.command !== undefined) {
      yamlStep.command = step.command;
    }

    if (step.timeout !== undefined) {
      yamlStep.timeout = step.timeout;
    }
  } else {
    // Handle task steps
    if (step.taskType !== undefined) {
      yamlStep.task_type = step.taskType;
    }

    if (step.priority !== undefined) {
      yamlStep.priority = step.priority;
    }

    if (step.complexity !== undefined) {
      yamlStep.complexity = step.complexity;
    }

    if (step.assignee !== undefined) {
      yamlStep.assignee = step.assignee;
    }
  }

  // Common fields
  if (step.dependsOn !== undefined && step.dependsOn.length > 0) {
    yamlStep.depends_on = step.dependsOn;
  }

  if (step.condition !== undefined) {
    yamlStep.condition = step.condition;
  }

  return yamlStep;
}

/**
 * Converts internal Playbook to YAML format
 *
 * @param playbook - Internal Playbook object
 * @returns YAML playbook object
 */
export function convertPlaybookToYaml(playbook: Playbook): YamlPlaybookFile {
  const yamlPlaybook: YamlPlaybookFile = {
    name: playbook.name,
    title: playbook.title,
    version: playbook.version,
  };

  if (playbook.variables.length > 0) {
    yamlPlaybook.variables = playbook.variables.map(convertVariableToYaml);
  }

  if (playbook.steps.length > 0) {
    yamlPlaybook.steps = playbook.steps.map(convertStepToYaml);
  }

  if (playbook.extends && playbook.extends.length > 0) {
    yamlPlaybook.extends = playbook.extends;
  }

  return yamlPlaybook;
}

/**
 * Serializes a playbook to YAML string
 *
 * @param playbook - Internal Playbook object
 * @returns YAML string representation
 */
export function serializePlaybookToYaml(playbook: Playbook): string {
  const yamlPlaybook = convertPlaybookToYaml(playbook);
  return yaml.stringify(yamlPlaybook, {
    indent: 2,
    lineWidth: 120,
  });
}

/**
 * Writes a playbook to a YAML file
 *
 * @param playbook - Internal Playbook object
 * @param filePath - Path to write to
 */
export function writePlaybookFile(playbook: Playbook, filePath: string): void {
  const dir = path.dirname(filePath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = `# ${playbook.title}\n# Playbook: ${playbook.name}\n\n${serializePlaybookToYaml(playbook)}`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ============================================================================
// File Watching
// ============================================================================

/**
 * Types of playbook file events
 */
export type PlaybookFileEvent = 'added' | 'changed' | 'removed';

/**
 * Playbook file change event details
 */
export interface PlaybookFileChange {
  /** Type of change */
  event: PlaybookFileEvent;
  /** Playbook name (derived from filename) */
  name: string;
  /** Full path to the file */
  path: string;
  /** Directory containing the file */
  directory: string;
  /** Timestamp of the event */
  timestamp: Date;
}

/**
 * Callback for playbook file changes
 */
export type PlaybookFileChangeCallback = (change: PlaybookFileChange) => void;

/**
 * Options for PlaybookFileWatcher
 */
export interface PlaybookFileWatcherOptions {
  /** Additional directories to watch */
  additionalPaths?: string[];
  /** Debounce delay in milliseconds (default: 100) */
  debounceMs?: number;
  /** Whether to watch recursively within directories */
  recursive?: boolean;
}

/**
 * Internal structure for tracking watched directories
 */
interface WatchedDirectory {
  /** The fs.FSWatcher instance */
  watcher: fs.FSWatcher;
  /** Set of known playbook files in this directory */
  knownFiles: Set<string>;
}

/**
 * Watches playbook directories for file changes
 *
 * Provides automatic notification when playbook files (.playbook.yaml, .playbook.yml)
 * are added, modified, or deleted. Uses native file system watching with debouncing
 * to handle rapid successive changes.
 *
 * @example
 * ```typescript
 * const watcher = new PlaybookFileWatcher(['.stoneforge/playbooks']);
 *
 * watcher.on('change', (change) => {
 *   console.log(`Playbook ${change.name} was ${change.event}`);
 * });
 *
 * watcher.start();
 * // ... later
 * watcher.stop();
 * ```
 */
export class PlaybookFileWatcher {
  private readonly searchPaths: string[];
  private readonly options: Required<Pick<PlaybookFileWatcherOptions, 'debounceMs' | 'recursive'>>;
  private readonly watchers: Map<string, WatchedDirectory> = new Map();
  private readonly callbacks: Set<PlaybookFileChangeCallback> = new Set();
  private readonly debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private _isRunning = false;

  /**
   * Creates a new PlaybookFileWatcher
   *
   * @param searchPaths - Directories to watch for playbook files
   * @param options - Watcher configuration options
   */
  constructor(searchPaths: string[], options: PlaybookFileWatcherOptions = {}) {
    this.searchPaths = [
      ...searchPaths.map(expandPath),
      ...(options.additionalPaths?.map(expandPath) ?? []),
    ];
    this.options = {
      debounceMs: options.debounceMs ?? 100,
      recursive: options.recursive ?? false,
    };
  }

  /**
   * Whether the watcher is currently running
   */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Get the list of paths being watched
   */
  get watchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Register a callback for playbook file changes
   *
   * @param callback - Function to call when a change occurs
   * @returns Function to unregister the callback
   */
  on(event: 'change', callback: PlaybookFileChangeCallback): () => void {
    if (event !== 'change') {
      throw new Error(`Unknown event type: ${event}`);
    }
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Unregister a callback
   *
   * @param callback - The callback to remove
   */
  off(callback: PlaybookFileChangeCallback): void {
    this.callbacks.delete(callback);
  }

  /**
   * Start watching for playbook file changes
   *
   * Initializes file watchers on all configured directories and begins
   * emitting change events. Also performs an initial scan to detect
   * existing playbook files.
   */
  start(): void {
    if (this._isRunning) {
      return;
    }

    this._isRunning = true;

    for (const searchPath of this.searchPaths) {
      this.watchDirectory(searchPath);
    }
  }

  /**
   * Stop watching for changes
   *
   * Closes all file watchers and cleans up resources. Pending debounced
   * events will be cancelled.
   */
  stop(): void {
    if (!this._isRunning) {
      return;
    }

    this._isRunning = false;

    // Close all watchers
    for (const [_path, watched] of this.watchers) {
      try {
        watched.watcher.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.watchers.clear();

    // Cancel all pending debounce timers
    for (const [_key, timer] of this.debounceTimers) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Force a rescan of all watched directories
   *
   * Useful for detecting files that may have been added or removed
   * while the watcher was temporarily unable to receive events.
   */
  rescan(): void {
    if (!this._isRunning) {
      return;
    }

    for (const searchPath of this.searchPaths) {
      this.scanDirectory(searchPath);
    }
  }

  /**
   * Get all currently known playbook files
   *
   * @returns Array of discovered playbook information
   */
  getKnownPlaybooks(): DiscoveredPlaybook[] {
    const playbooks: DiscoveredPlaybook[] = [];

    for (const [directory, watched] of this.watchers) {
      for (const filePath of watched.knownFiles) {
        playbooks.push({
          path: filePath,
          name: extractPlaybookName(filePath),
          directory,
        });
      }
    }

    return playbooks;
  }

  /**
   * Start watching a single directory
   */
  private watchDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      return;
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return;
    }

    if (this.watchers.has(dirPath)) {
      return;
    }

    try {
      // Create the watcher
      const watcher = fs.watch(dirPath, { persistent: false }, (eventType, filename) => {
        if (filename) {
          this.handleFileEvent(dirPath, filename, eventType);
        }
      });

      watcher.on('error', (_err) => {
        // Watcher error, try to recover by removing and potentially re-adding
        this.unwatchDirectory(dirPath);
      });

      // Track known files
      const knownFiles = new Set<string>();
      this.scanDirectoryFiles(dirPath, knownFiles);

      this.watchers.set(dirPath, { watcher, knownFiles });

      // If recursive, also watch subdirectories
      if (this.options.recursive) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            this.watchDirectory(path.join(dirPath, entry.name));
          }
        }
      }
    } catch {
      // Failed to watch directory, ignore
    }
  }

  /**
   * Stop watching a single directory
   */
  private unwatchDirectory(dirPath: string): void {
    const watched = this.watchers.get(dirPath);
    if (watched) {
      try {
        watched.watcher.close();
      } catch {
        // Ignore errors during cleanup
      }
      this.watchers.delete(dirPath);
    }
  }

  /**
   * Scan a directory for playbook files
   */
  private scanDirectory(dirPath: string): void {
    const watched = this.watchers.get(dirPath);
    if (!watched) {
      return;
    }

    const currentFiles = new Set<string>();
    this.scanDirectoryFiles(dirPath, currentFiles);

    // Detect removed files
    for (const knownFile of watched.knownFiles) {
      if (!currentFiles.has(knownFile)) {
        this.emitChange({
          event: 'removed',
          name: extractPlaybookName(knownFile),
          path: knownFile,
          directory: dirPath,
          timestamp: new Date(),
        });
      }
    }

    // Detect added files
    for (const currentFile of currentFiles) {
      if (!watched.knownFiles.has(currentFile)) {
        this.emitChange({
          event: 'added',
          name: extractPlaybookName(currentFile),
          path: currentFile,
          directory: dirPath,
          timestamp: new Date(),
        });
      }
    }

    // Update known files
    watched.knownFiles = currentFiles;
  }

  /**
   * Scan directory and populate the file set
   */
  private scanDirectoryFiles(dirPath: string, files: Set<string>): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && isPlaybookFile(entry.name)) {
          files.add(path.join(dirPath, entry.name));
        } else if (entry.isDirectory() && this.options.recursive) {
          this.scanDirectoryFiles(path.join(dirPath, entry.name), files);
        }
      }
    } catch {
      // Directory not readable, ignore
    }
  }

  /**
   * Handle a file system event
   */
  private handleFileEvent(directory: string, filename: string, eventType: string): void {
    const filePath = path.join(directory, filename);

    // Only process playbook files
    if (!isPlaybookFile(filename)) {
      // Check if it's a new directory (for recursive watching)
      if (this.options.recursive && eventType === 'rename') {
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            this.watchDirectory(filePath);
          }
        } catch {
          // Ignore stat errors
        }
      }
      return;
    }

    // Debounce rapid changes to the same file
    const debounceKey = filePath;
    const existingTimer = this.debounceTimers.get(debounceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(debounceKey);
      this.processFileChange(directory, filePath);
    }, this.options.debounceMs);

    this.debounceTimers.set(debounceKey, timer);
  }

  /**
   * Process a file change after debouncing
   */
  private processFileChange(directory: string, filePath: string): void {
    const watched = this.watchers.get(directory);
    if (!watched) {
      return;
    }

    const wasKnown = watched.knownFiles.has(filePath);
    const exists = fs.existsSync(filePath);

    let event: PlaybookFileEvent;

    if (exists && !wasKnown) {
      // New file
      event = 'added';
      watched.knownFiles.add(filePath);
    } else if (exists && wasKnown) {
      // Modified file
      event = 'changed';
    } else if (!exists && wasKnown) {
      // Deleted file
      event = 'removed';
      watched.knownFiles.delete(filePath);
    } else {
      // File doesn't exist and wasn't known, ignore
      return;
    }

    this.emitChange({
      event,
      name: extractPlaybookName(filePath),
      path: filePath,
      directory,
      timestamp: new Date(),
    });
  }

  /**
   * Emit a change event to all registered callbacks
   */
  private emitChange(change: PlaybookFileChange): void {
    for (const callback of this.callbacks) {
      try {
        callback(change);
      } catch {
        // Ignore callback errors
      }
    }
  }
}
