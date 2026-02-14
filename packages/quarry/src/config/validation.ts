/**
 * Configuration Validation
 *
 * Validates configuration values for correctness and consistency.
 */

import { ValidationError, ErrorCode } from '@stoneforge/core';
import { isValidIdentityMode } from '../systems/identity.js';
import type {
  Configuration,
  PartialConfiguration,
  ConfigValidationResult,
} from './types.js';
import {
  MIN_EXPORT_DEBOUNCE,
  MAX_EXPORT_DEBOUNCE,
  MIN_TIME_TOLERANCE,
  MAX_TIME_TOLERANCE,
  MAX_TTL,
} from './defaults.js';
import { validateDurationRange, formatDuration } from './duration.js';

// ============================================================================
// Field Validators
// ============================================================================

/**
 * Validates an actor name
 */
export function isValidActor(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  // Actor must be non-empty and contain only valid identifier characters
  return value.length > 0 && /^[a-zA-Z0-9_-]+$/.test(value);
}

/**
 * Validates actor and throws if invalid
 */
export function validateActor(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Actor must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'actor', value, expected: 'string' }
    );
  }
  if (value.length === 0) {
    throw new ValidationError(
      'Actor cannot be empty',
      ErrorCode.INVALID_INPUT,
      { field: 'actor', value }
    );
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new ValidationError(
      'Actor must contain only alphanumeric characters, hyphens, and underscores',
      ErrorCode.INVALID_INPUT,
      { field: 'actor', value, expected: 'alphanumeric, hyphen, underscore' }
    );
  }
  return value;
}

/**
 * Validates a database filename
 */
export function isValidDatabase(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  // Must be non-empty, end with .db, and not contain path separators
  return (
    value.length > 0 &&
    value.endsWith('.db') &&
    !value.includes('/') &&
    !value.includes('\\')
  );
}

/**
 * Validates database and throws if invalid
 */
export function validateDatabase(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Database must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'database', value, expected: 'string' }
    );
  }
  if (value.length === 0) {
    throw new ValidationError(
      'Database cannot be empty',
      ErrorCode.INVALID_INPUT,
      { field: 'database', value }
    );
  }
  if (!value.endsWith('.db')) {
    throw new ValidationError(
      'Database must end with .db extension',
      ErrorCode.INVALID_INPUT,
      { field: 'database', value, expected: '*.db' }
    );
  }
  if (value.includes('/') || value.includes('\\')) {
    throw new ValidationError(
      'Database must be a filename, not a path',
      ErrorCode.INVALID_INPUT,
      { field: 'database', value }
    );
  }
  return value;
}

/**
 * Validates a JSONL filename
 */
export function isValidJsonlFilename(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return (
    value.length > 0 &&
    value.endsWith('.jsonl') &&
    !value.includes('/') &&
    !value.includes('\\')
  );
}

/**
 * Validates JSONL filename and throws if invalid
 */
export function validateJsonlFilename(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      `${field} must be a string`,
      ErrorCode.INVALID_INPUT,
      { field, value, expected: 'string' }
    );
  }
  if (value.length === 0) {
    throw new ValidationError(
      `${field} cannot be empty`,
      ErrorCode.INVALID_INPUT,
      { field, value }
    );
  }
  if (!value.endsWith('.jsonl')) {
    throw new ValidationError(
      `${field} must end with .jsonl extension`,
      ErrorCode.INVALID_INPUT,
      { field, value, expected: '*.jsonl' }
    );
  }
  if (value.includes('/') || value.includes('\\')) {
    throw new ValidationError(
      `${field} must be a filename, not a path`,
      ErrorCode.INVALID_INPUT,
      { field, value }
    );
  }
  return value;
}

/**
 * Validates playbook paths array
 */
export function isValidPlaybookPaths(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((p) => typeof p === 'string' && p.length > 0);
}

/**
 * Validates playbook paths and throws if invalid
 */
export function validatePlaybookPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(
      'Playbook paths must be an array',
      ErrorCode.INVALID_INPUT,
      { field: 'playbooks.paths', value, expected: 'array of strings' }
    );
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw new ValidationError(
        `Playbook path at index ${i} must be a string`,
        ErrorCode.INVALID_INPUT,
        { field: `playbooks.paths[${i}]`, value: value[i], expected: 'string' }
      );
    }
    if (value[i].length === 0) {
      throw new ValidationError(
        `Playbook path at index ${i} cannot be empty`,
        ErrorCode.INVALID_INPUT,
        { field: `playbooks.paths[${i}]`, value: value[i] }
      );
    }
  }
  return value as string[];
}

// ============================================================================
// Full Configuration Validation
// ============================================================================

/**
 * Validates a complete configuration object
 *
 * @param config - Configuration to validate
 * @returns Validated configuration
 * @throws ValidationError if validation fails
 */
export function validateConfiguration(config: unknown): Configuration {
  if (typeof config !== 'object' || config === null) {
    throw new ValidationError(
      'Configuration must be an object',
      ErrorCode.INVALID_INPUT,
      { value: config }
    );
  }

  const obj = config as Record<string, unknown>;

  // Validate actor (optional)
  if (obj.actor !== undefined) {
    validateActor(obj.actor);
  }

  // Validate database
  if (typeof obj.database !== 'string') {
    throw new ValidationError(
      'Configuration must include database',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'database' }
    );
  }
  validateDatabase(obj.database);

  // Validate sync
  if (typeof obj.sync !== 'object' || obj.sync === null) {
    throw new ValidationError(
      'Configuration must include sync object',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'sync' }
    );
  }
  const sync = obj.sync as Record<string, unknown>;
  if (typeof sync.autoExport !== 'boolean') {
    throw new ValidationError(
      'sync.autoExport must be a boolean',
      ErrorCode.INVALID_INPUT,
      { field: 'sync.autoExport', value: sync.autoExport, expected: 'boolean' }
    );
  }
  if (typeof sync.exportDebounce !== 'number') {
    throw new ValidationError(
      'sync.exportDebounce must be a number',
      ErrorCode.INVALID_INPUT,
      { field: 'sync.exportDebounce', value: sync.exportDebounce, expected: 'number' }
    );
  }
  validateDurationRange(sync.exportDebounce, MIN_EXPORT_DEBOUNCE, MAX_EXPORT_DEBOUNCE, 'sync.exportDebounce');
  validateJsonlFilename(sync.elementsFile, 'sync.elementsFile');
  validateJsonlFilename(sync.dependenciesFile, 'sync.dependenciesFile');

  // Validate playbooks
  if (typeof obj.playbooks !== 'object' || obj.playbooks === null) {
    throw new ValidationError(
      'Configuration must include playbooks object',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'playbooks' }
    );
  }
  const playbooks = obj.playbooks as Record<string, unknown>;
  validatePlaybookPaths(playbooks.paths);

  // Validate tombstone
  if (typeof obj.tombstone !== 'object' || obj.tombstone === null) {
    throw new ValidationError(
      'Configuration must include tombstone object',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'tombstone' }
    );
  }
  const tombstone = obj.tombstone as Record<string, unknown>;
  if (typeof tombstone.ttl !== 'number') {
    throw new ValidationError(
      'tombstone.ttl must be a number',
      ErrorCode.INVALID_INPUT,
      { field: 'tombstone.ttl', value: tombstone.ttl, expected: 'number' }
    );
  }
  if (typeof tombstone.minTtl !== 'number') {
    throw new ValidationError(
      'tombstone.minTtl must be a number',
      ErrorCode.INVALID_INPUT,
      { field: 'tombstone.minTtl', value: tombstone.minTtl, expected: 'number' }
    );
  }
  validateDurationRange(tombstone.ttl, tombstone.minTtl, MAX_TTL, 'tombstone.ttl');
  validateDurationRange(tombstone.minTtl, 1, tombstone.ttl, 'tombstone.minTtl');

  // Validate identity
  if (typeof obj.identity !== 'object' || obj.identity === null) {
    throw new ValidationError(
      'Configuration must include identity object',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'identity' }
    );
  }
  const identity = obj.identity as Record<string, unknown>;
  if (!isValidIdentityMode(identity.mode)) {
    throw new ValidationError(
      'identity.mode must be a valid identity mode',
      ErrorCode.INVALID_INPUT,
      { field: 'identity.mode', value: identity.mode, expected: ['soft', 'cryptographic', 'hybrid'] }
    );
  }
  if (typeof identity.timeTolerance !== 'number') {
    throw new ValidationError(
      'identity.timeTolerance must be a number',
      ErrorCode.INVALID_INPUT,
      { field: 'identity.timeTolerance', value: identity.timeTolerance, expected: 'number' }
    );
  }
  validateDurationRange(identity.timeTolerance, MIN_TIME_TOLERANCE, MAX_TIME_TOLERANCE, 'identity.timeTolerance');

  return config as Configuration;
}

/**
 * Validates a configuration without throwing, returns result
 */
export function validateConfigurationSafe(config: unknown): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    validateConfiguration(config);
    return { valid: true, errors, warnings };
  } catch (err) {
    if (err instanceof ValidationError) {
      errors.push(err.message);
    } else {
      errors.push(String(err));
    }
    return { valid: false, errors, warnings };
  }
}

/**
 * Validates partial configuration for merging
 */
export function validatePartialConfiguration(config: PartialConfiguration): void {
  if (config.actor !== undefined) {
    validateActor(config.actor);
  }
  if (config.database !== undefined) {
    validateDatabase(config.database);
  }
  if (config.sync?.exportDebounce !== undefined) {
    validateDurationRange(
      config.sync.exportDebounce,
      MIN_EXPORT_DEBOUNCE,
      MAX_EXPORT_DEBOUNCE,
      'sync.exportDebounce'
    );
  }
  if (config.sync?.elementsFile !== undefined) {
    validateJsonlFilename(config.sync.elementsFile, 'sync.elementsFile');
  }
  if (config.sync?.dependenciesFile !== undefined) {
    validateJsonlFilename(config.sync.dependenciesFile, 'sync.dependenciesFile');
  }
  if (config.playbooks?.paths !== undefined) {
    validatePlaybookPaths(config.playbooks.paths);
  }
  if (config.identity?.mode !== undefined && !isValidIdentityMode(config.identity.mode)) {
    throw new ValidationError(
      'identity.mode must be a valid identity mode',
      ErrorCode.INVALID_INPUT,
      { field: 'identity.mode', value: config.identity.mode, expected: ['soft', 'cryptographic', 'hybrid'] }
    );
  }
  if (config.identity?.timeTolerance !== undefined) {
    validateDurationRange(
      config.identity.timeTolerance,
      MIN_TIME_TOLERANCE,
      MAX_TIME_TOLERANCE,
      'identity.timeTolerance'
    );
  }
  // Cross-field validation for tombstone
  if (config.tombstone?.ttl !== undefined && config.tombstone?.minTtl !== undefined) {
    if (config.tombstone.ttl < config.tombstone.minTtl) {
      throw new ValidationError(
        `tombstone.ttl (${formatDuration(config.tombstone.ttl)}) must be >= tombstone.minTtl (${formatDuration(config.tombstone.minTtl)})`,
        ErrorCode.INVALID_INPUT,
        { field: 'tombstone.ttl', value: config.tombstone.ttl, expected: `>= ${config.tombstone.minTtl}` }
      );
    }
  }
}
