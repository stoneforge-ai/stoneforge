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
 * Sync direction for external sync
 */
export type SyncDirection = 'push' | 'pull' | 'bidirectional';

/**
 * Provider configuration stored in settings (SQLite, NOT git-tracked)
 */
export interface ProviderConfig {
  /** Provider name (e.g. 'github', 'linear') */
  provider: string;
  /** Authentication token */
  token?: string;
  /** API base URL (for self-hosted instances) */
  apiBaseUrl?: string;
  /** Default project/repo for this provider */
  defaultProject?: string;
}

/**
 * External sync settings stored in SQLite (tokens, cursors, runtime state)
 */
export interface ExternalSyncSettings {
  /** Provider configurations keyed by provider name */
  providers: Record<string, ProviderConfig>;
  /** Sync cursors keyed by provider+project+adapterType */
  syncCursors: Record<string, string>;
  /** Poll interval in milliseconds */
  pollIntervalMs: number;
  /** Default sync direction */
  defaultDirection: SyncDirection;
}

/**
 * Well-known setting keys
 */
export const SETTING_KEYS = {
  AGENT_DEFAULTS: 'agentDefaults',
  RATE_LIMITS: 'rateLimits',
  EXTERNAL_SYNC: 'externalSync',
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

  /**
   * Get external sync settings (convenience method)
   */
  getExternalSyncSettings(): ExternalSyncSettings;

  /**
   * Update external sync settings (convenience method)
   */
  setExternalSyncSettings(settings: ExternalSyncSettings): ExternalSyncSettings;

  /**
   * Get a specific provider's configuration
   */
  getProviderConfig(provider: string): ProviderConfig | undefined;

  /**
   * Set a specific provider's configuration
   */
  setProviderConfig(provider: string, config: ProviderConfig): ProviderConfig;
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

const DEFAULT_EXTERNAL_SYNC_SETTINGS: ExternalSyncSettings = {
  providers: {},
  syncCursors: {},
  pollIntervalMs: 60000,
  defaultDirection: 'bidirectional',
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

    getExternalSyncSettings(): ExternalSyncSettings {
      const setting = this.getSetting(SETTING_KEYS.EXTERNAL_SYNC);
      if (!setting) {
        return { ...DEFAULT_EXTERNAL_SYNC_SETTINGS, providers: {}, syncCursors: {} };
      }

      const value = setting.value as Record<string, unknown>;

      // Validate and sanitize providers
      const rawProviders = value?.providers;
      const providers: Record<string, ProviderConfig> = {};
      if (rawProviders && typeof rawProviders === 'object' && !Array.isArray(rawProviders)) {
        for (const [name, config] of Object.entries(rawProviders as Record<string, unknown>)) {
          if (config && typeof config === 'object' && !Array.isArray(config)) {
            const pc = config as Record<string, unknown>;
            providers[name] = {
              provider: typeof pc.provider === 'string' ? pc.provider : name,
              token: typeof pc.token === 'string' ? pc.token : undefined,
              apiBaseUrl: typeof pc.apiBaseUrl === 'string' ? pc.apiBaseUrl : undefined,
              defaultProject: typeof pc.defaultProject === 'string' ? pc.defaultProject : undefined,
            };
          }
        }
      }

      // Validate and sanitize syncCursors
      const rawCursors = value?.syncCursors;
      const syncCursors: Record<string, string> = {};
      if (rawCursors && typeof rawCursors === 'object' && !Array.isArray(rawCursors)) {
        for (const [key, val] of Object.entries(rawCursors as Record<string, unknown>)) {
          if (typeof val === 'string') {
            syncCursors[key] = val;
          }
        }
      }

      return {
        providers,
        syncCursors,
        pollIntervalMs: typeof value?.pollIntervalMs === 'number' ? value.pollIntervalMs : DEFAULT_EXTERNAL_SYNC_SETTINGS.pollIntervalMs,
        defaultDirection: isValidSyncDirection(value?.defaultDirection) ? value.defaultDirection as SyncDirection : DEFAULT_EXTERNAL_SYNC_SETTINGS.defaultDirection,
      };
    },

    setExternalSyncSettings(settings: ExternalSyncSettings): ExternalSyncSettings {
      const validated: ExternalSyncSettings = {
        providers: settings.providers ?? {},
        syncCursors: settings.syncCursors ?? {},
        pollIntervalMs: typeof settings.pollIntervalMs === 'number' && settings.pollIntervalMs > 0
          ? settings.pollIntervalMs
          : DEFAULT_EXTERNAL_SYNC_SETTINGS.pollIntervalMs,
        defaultDirection: isValidSyncDirection(settings.defaultDirection)
          ? settings.defaultDirection
          : DEFAULT_EXTERNAL_SYNC_SETTINGS.defaultDirection,
      };

      this.setSetting(SETTING_KEYS.EXTERNAL_SYNC, validated);
      return validated;
    },

    getProviderConfig(provider: string): ProviderConfig | undefined {
      const settings = this.getExternalSyncSettings();
      return settings.providers[provider];
    },

    setProviderConfig(provider: string, config: ProviderConfig): ProviderConfig {
      const settings = this.getExternalSyncSettings();
      const sanitized: ProviderConfig = {
        provider: typeof config.provider === 'string' ? config.provider : provider,
        token: typeof config.token === 'string' ? config.token : undefined,
        apiBaseUrl: typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl : undefined,
        defaultProject: typeof config.defaultProject === 'string' ? config.defaultProject : undefined,
      };
      settings.providers[provider] = sanitized;
      this.setExternalSyncSettings(settings);
      return sanitized;
    },
  };
}

/**
 * Type guard for valid sync direction values
 */
function isValidSyncDirection(value: unknown): value is SyncDirection {
  return value === 'push' || value === 'pull' || value === 'bidirectional';
}
