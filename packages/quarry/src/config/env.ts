/**
 * Environment Variable Configuration
 *
 * Handles reading configuration from environment variables.
 */

import { isValidIdentityMode, type IdentityMode } from '../systems/identity.js';
import type { PartialConfiguration, EnvVar } from './types.js';
import { EnvVars } from './types.js';
import { tryParseDuration } from './duration.js';

// ============================================================================
// Boolean Parsing
// ============================================================================

/**
 * Truthy values for environment variables (case-insensitive)
 */
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

/**
 * Falsy values for environment variables (case-insensitive)
 */
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off']);

/**
 * Parses a boolean from an environment variable value
 *
 * @param value - Environment variable value
 * @returns Parsed boolean, or undefined if not a recognized boolean value
 */
export function parseEnvBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const lower = value.toLowerCase().trim();
  if (TRUTHY_VALUES.has(lower)) {
    return true;
  }
  if (FALSY_VALUES.has(lower)) {
    return false;
  }
  return undefined;
}

/**
 * Checks if a value is a recognized boolean string
 */
export function isEnvBoolean(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const lower = value.toLowerCase().trim();
  return TRUTHY_VALUES.has(lower) || FALSY_VALUES.has(lower);
}

// ============================================================================
// Duration Parsing
// ============================================================================

/**
 * Parses a duration from an environment variable value
 *
 * @param value - Environment variable value
 * @returns Parsed duration in ms, or undefined if invalid
 */
export function parseEnvDuration(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  // First try as duration string (e.g., '5m', '500ms')
  const asDuration = tryParseDuration(value);
  if (asDuration !== undefined) {
    return asDuration;
  }

  // Try as pure number (milliseconds) - only if it's a pure numeric string
  if (/^\d+(\.\d+)?$/.test(value)) {
    const asNumber = parseFloat(value);
    if (!isNaN(asNumber) && Number.isFinite(asNumber) && asNumber >= 0) {
      return Math.round(asNumber);
    }
  }

  return undefined;
}

// ============================================================================
// Environment Configuration Loading
// ============================================================================

/**
 * Gets a raw environment variable value
 */
export function getEnvVar(name: EnvVar): string | undefined {
  return process.env[name];
}

/**
 * Checks if an environment variable is set (non-empty)
 */
export function hasEnvVar(name: EnvVar): boolean {
  const value = process.env[name];
  return value !== undefined && value !== '';
}

/**
 * Loads configuration from environment variables
 *
 * @returns Partial configuration from environment variables
 */
export function loadEnvConfig(): PartialConfiguration {
  const config: PartialConfiguration = {};

  // Actor
  const actor = getEnvVar(EnvVars.ACTOR);
  if (actor !== undefined && actor !== '') {
    config.actor = actor;
  }

  // Database
  const database = getEnvVar(EnvVars.DATABASE);
  if (database !== undefined && database !== '') {
    config.database = database;
  }

  // Sync auto-export
  const autoExport = parseEnvBoolean(getEnvVar(EnvVars.SYNC_AUTO_EXPORT));
  if (autoExport !== undefined) {
    config.sync = config.sync || {};
    config.sync.autoExport = autoExport;
  }

  // Identity mode
  const identityMode = getEnvVar(EnvVars.IDENTITY_MODE);
  if (identityMode !== undefined && isValidIdentityMode(identityMode)) {
    config.identity = config.identity || {};
    config.identity.mode = identityMode as IdentityMode;
  }

  return config;
}

/**
 * Gets the config file path override from environment
 */
export function getEnvConfigPath(): string | undefined {
  const value = getEnvVar(EnvVars.CONFIG);
  return value !== undefined && value !== '' ? value : undefined;
}

/**
 * Gets the JSON output mode flag from environment
 */
export function getEnvJsonMode(): boolean | undefined {
  return parseEnvBoolean(getEnvVar(EnvVars.JSON));
}

/**
 * Gets the verbose/debug mode flag from environment
 */
export function getEnvVerboseMode(): boolean | undefined {
  return parseEnvBoolean(getEnvVar(EnvVars.VERBOSE));
}

// ============================================================================
// Environment Variable Information
// ============================================================================

/**
 * Gets information about all supported environment variables
 */
export function getEnvVarInfo(): Array<{
  name: EnvVar;
  configPath: string;
  type: string;
  description: string;
}> {
  return [
    {
      name: EnvVars.ACTOR,
      configPath: 'actor',
      type: 'string',
      description: 'Default actor name for operations',
    },
    {
      name: EnvVars.DATABASE,
      configPath: 'database',
      type: 'string',
      description: 'Database filename',
    },
    {
      name: EnvVars.CONFIG,
      configPath: '(file path)',
      type: 'string',
      description: 'Override config file path',
    },
    {
      name: EnvVars.JSON,
      configPath: '(output mode)',
      type: 'boolean',
      description: 'JSON output mode',
    },
    {
      name: EnvVars.VERBOSE,
      configPath: '(debug mode)',
      type: 'boolean',
      description: 'Verbose/debug mode',
    },
    {
      name: EnvVars.SYNC_AUTO_EXPORT,
      configPath: 'sync.autoExport',
      type: 'boolean',
      description: 'Auto-export on mutations',
    },
    {
      name: EnvVars.IDENTITY_MODE,
      configPath: 'identity.mode',
      type: 'string',
      description: 'Identity verification mode (soft, cryptographic, hybrid)',
    },
  ];
}

/**
 * Gets currently set environment variables for configuration
 */
export function getSetEnvVars(): Array<{ name: EnvVar; value: string }> {
  const result: Array<{ name: EnvVar; value: string }> = [];
  for (const name of Object.values(EnvVars)) {
    const value = process.env[name];
    if (value !== undefined && value !== '') {
      result.push({ name, value });
    }
  }
  return result;
}
