/**
 * Settings Service
 *
 * Server-side key-value settings persisted to SQLite.
 * Used for workspace-wide configuration that needs to be accessible server-side,
 * such as default executable paths for agent providers.
 *
 * Settings are stored in the `settings` table as JSON-encoded values.
 */

import type { StorageBackend } from '@stoneforge/storage';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('settings-service');

// ============================================================================
// Types
// ============================================================================

/**
 * A setting stored in the database
 */
export interface Setting {
  key: string;
  value: unknown;
  updatedAt: string;
}

/**
 * Agent defaults configuration
 */
export interface ServerAgentDefaults {
  /** Provider name → executable path (e.g. { claude: '/usr/local/bin/claude-dev' }) */
  defaultExecutablePaths: Record<string, string>;
  /** Ordered list of executable names/paths for rate limit fallback. When one hits its limit, the next available is used. */
  fallbackChain?: string[];
}

/**
 * Well-known setting keys
 */
export const SETTING_KEYS = {
  AGENT_DEFAULTS: 'agentDefaults',
} as const;

// ============================================================================
// Interface
// ============================================================================

export interface SettingsService {
  /**
   * Get a setting by key
   */
  getSetting(key: string): Setting | undefined;

  /**
   * Set a setting (upsert)
   */
  setSetting(key: string, value: unknown): Setting;

  /**
   * Delete a setting by key
   * @returns true if the setting existed and was deleted
   */
  deleteSetting(key: string): boolean;

  /**
   * Get agent defaults (convenience method)
   */
  getAgentDefaults(): ServerAgentDefaults;

  /**
   * Update agent defaults (convenience method)
   */
  setAgentDefaults(defaults: ServerAgentDefaults): ServerAgentDefaults;
}

// ============================================================================
// Database Row Type
// ============================================================================

interface DbSetting {
  [key: string]: unknown;
  key: string;
  value: string;
  updated_at: string;
}

// ============================================================================
// Implementation
// ============================================================================

function dbToSetting(row: DbSetting): Setting {
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(row.value);
  } catch {
    parsedValue = row.value;
  }

  return {
    key: row.key,
    value: parsedValue,
    updatedAt: row.updated_at,
  };
}

const DEFAULT_AGENT_DEFAULTS: ServerAgentDefaults = {
  defaultExecutablePaths: {},
};

export function createSettingsService(storage: StorageBackend): SettingsService {
  return {
    getSetting(key: string): Setting | undefined {
      const row = storage.queryOne<DbSetting>(
        'SELECT key, value, updated_at FROM settings WHERE key = ?',
        [key]
      );
      if (!row) return undefined;
      return dbToSetting(row);
    },

    setSetting(key: string, value: unknown): Setting {
      const jsonValue = JSON.stringify(value);
      const updatedAt = new Date().toISOString();

      storage.run(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [key, jsonValue, updatedAt]
      );

      logger.debug(`Setting updated: ${key}`);

      return {
        key,
        value,
        updatedAt,
      };
    },

    deleteSetting(key: string): boolean {
      const result = storage.run('DELETE FROM settings WHERE key = ?', [key]);
      return result.changes > 0;
    },

    getAgentDefaults(): ServerAgentDefaults {
      const setting = this.getSetting(SETTING_KEYS.AGENT_DEFAULTS);
      if (!setting) {
        return { ...DEFAULT_AGENT_DEFAULTS };
      }

      // Validate shape — ensure defaultExecutablePaths exists and is an object
      const value = setting.value as Record<string, unknown>;
      const paths = value?.defaultExecutablePaths;

      const result: ServerAgentDefaults = {
        defaultExecutablePaths:
          paths && typeof paths === 'object' && !Array.isArray(paths)
            ? (paths as Record<string, string>)
            : {},
      };

      // Include fallbackChain if it's a valid array
      if (Array.isArray(value?.fallbackChain)) {
        result.fallbackChain = (value.fallbackChain as unknown[]).filter(
          (entry): entry is string => typeof entry === 'string'
        );
      }

      return result;
    },

    setAgentDefaults(defaults: ServerAgentDefaults): ServerAgentDefaults {
      // Validate that defaultExecutablePaths is a plain object of strings
      const paths = defaults.defaultExecutablePaths ?? {};
      const sanitized: Record<string, string> = {};
      for (const [provider, path] of Object.entries(paths)) {
        if (typeof path === 'string') {
          sanitized[provider] = path;
        }
      }

      const validated: ServerAgentDefaults = {
        defaultExecutablePaths: sanitized,
      };

      // Validate fallbackChain — must be an array; filter out non-string entries
      if (Array.isArray(defaults.fallbackChain)) {
        validated.fallbackChain = defaults.fallbackChain.filter(
          (entry): entry is string => typeof entry === 'string'
        );
      }

      this.setSetting(SETTING_KEYS.AGENT_DEFAULTS, validated);
      return validated;
    },
  };
}
