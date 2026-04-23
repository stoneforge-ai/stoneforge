/**
 * Configuration System Types
 *
 * Defines all configuration interfaces and types for the Stoneforge system.
 * Supports file-based configuration, environment variables, and CLI overrides
 * with a clear precedence hierarchy.
 */

import { IdentityMode } from '../systems/identity.js';

// ============================================================================
// Duration Type
// ============================================================================

/**
 * Duration in milliseconds
 * Can be specified as number (ms) or duration string (e.g., '5m', '500ms')
 */
export type Duration = number;

/**
 * Duration string format
 * Supported units: ms, s, m, h, d
 */
export type DurationString = `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Sync configuration settings
 */
export interface SyncConfig {
  /** Auto-export on mutations (default: true) */
  autoExport: boolean;
  /** Debounce interval for exports (default: 300000ms / 5 minutes) */
  exportDebounce: Duration;
  /** Elements JSONL file name (default: 'elements.jsonl') */
  elementsFile: string;
  /** Dependencies JSONL file name (default: 'dependencies.jsonl') */
  dependenciesFile: string;
}

/**
 * Playbook configuration settings
 */
export interface PlaybookConfig {
  /** Playbook search paths */
  paths: string[];
}

/**
 * Tombstone (soft delete) configuration
 */
export interface TombstoneConfig {
  /** Time-to-live for tombstones (default: 30 days = 2592000000ms) */
  ttl: Duration;
  /** Minimum TTL allowed (default: 7 days = 604800000ms) */
  minTtl: Duration;
}

/**
 * CLI plugins configuration
 */
export interface PluginsConfig {
  /** Package names that export CLI plugins */
  packages: string[];
}

/**
 * Identity system configuration
 */
export interface IdentityConfigSection {
  /** Identity verification mode (default: 'soft') */
  mode: IdentityMode;
  /** Time tolerance for signature expiry (default: 5 minutes) */
  timeTolerance: Duration;
}

/**
 * Conflict resolution strategy for external sync
 */
export type ExternalSyncConflictStrategy = 'last_write_wins' | 'local_wins' | 'remote_wins' | 'manual';

/**
 * Sync direction for external sync
 */
export type SyncDirection = 'push' | 'pull' | 'bidirectional';

/**
 * External sync configuration
 */
export interface ExternalSyncConfig {
  /** Whether external sync is enabled (default: false) */
  enabled: boolean;
  /** Polling interval in ms (default: 60000) */
  pollInterval: Duration;
  /** Conflict resolution strategy (default: 'last_write_wins') */
  conflictStrategy: ExternalSyncConflictStrategy;
  /** Default sync direction (default: 'bidirectional') */
  defaultDirection: SyncDirection;
  /** Whether to auto-create external issues for new tasks (default: false) */
  autoLink: boolean;
  /** Which provider to auto-link tasks to (e.g., 'github', 'linear') */
  autoLinkProvider?: string;
  /** Which provider to auto-link documents to (e.g., 'folder', 'notion') */
  autoLinkDocumentProvider?: string;
}

// ============================================================================
// Workflow Preset Types
// ============================================================================

/**
 * Workflow preset names
 */
export type WorkflowPreset = 'auto' | 'review' | 'approve';

/**
 * Valid workflow preset values
 */
export const VALID_WORKFLOW_PRESETS: readonly WorkflowPreset[] = [
  'auto',
  'review',
  'approve',
] as const;

/**
 * Agent permission model
 */
export type AgentPermissionModel = 'unrestricted' | 'restricted';

/**
 * Valid agent permission model values
 */
export const VALID_PERMISSION_MODELS: readonly AgentPermissionModel[] = [
  'unrestricted',
  'restricted',
] as const;

/**
 * Merge configuration settings
 */
export interface MergeConfig {
  /** Whether to auto-merge when tests pass (default: true) */
  autoMerge: boolean;
  /** Target branch for merges (default: null = auto-detect main/master) */
  targetBranch: string | null;
  /** Whether merges require approval (default: false) */
  requireApproval: boolean;
}

/**
 * Workflow configuration settings
 */
export interface WorkflowConfig {
  /** The workflow preset used during init (for display/reference only) */
  preset: WorkflowPreset | null;
}

/**
 * Agents configuration settings
 */
export interface AgentsConfig {
  /** Permission model for agents (default: 'unrestricted') */
  permissionModel: AgentPermissionModel;
  /** Bash commands allowed without approval in restricted mode */
  allowedBashCommands: string[];
}

/**
 * Valid conflict strategy values
 */
export const VALID_CONFLICT_STRATEGIES: readonly ExternalSyncConflictStrategy[] = [
  'last_write_wins',
  'local_wins',
  'remote_wins',
  'manual',
] as const;

/**
 * Valid sync direction values
 */
export const VALID_SYNC_DIRECTIONS: readonly SyncDirection[] = [
  'push',
  'pull',
  'bidirectional',
] as const;

/**
 * Valid auto-link provider names
 */
export const VALID_AUTO_LINK_PROVIDERS: readonly string[] = [
  'github',
  'linear',
  'notion',
  'folder',
] as const;

/**
 * Complete Stoneforge configuration
 */
export interface Configuration {
  /** Workspace name (optional, for display purposes) */
  name?: string;
  /** Default actor name for operations */
  actor?: string;
  /** Base branch for merge targets (default: auto-detect) */
  baseBranch?: string;
  /** Database filename (default: 'stoneforge.db') */
  database: string;
  /** Sync settings */
  sync: SyncConfig;
  /** Playbook settings */
  playbooks: PlaybookConfig;
  /** Tombstone settings */
  tombstone: TombstoneConfig;
  /** Identity settings */
  identity: IdentityConfigSection;
  /** CLI plugins settings */
  plugins: PluginsConfig;
  /** External sync settings */
  externalSync: ExternalSyncConfig;
  /** Demo mode: configures all agents to use opencode provider with minimax-m2.5-free model (default: false) */
  demoMode: boolean;
  /** Merge settings */
  merge: MergeConfig;
  /** Workflow settings */
  workflow: WorkflowConfig;
  /** Agents settings */
  agents: AgentsConfig;
}

/**
 * Partial configuration for merging
 */
export type PartialConfiguration = {
  name?: string;
  actor?: string;
  baseBranch?: string;
  database?: string;
  sync?: Partial<SyncConfig>;
  playbooks?: Partial<PlaybookConfig>;
  tombstone?: Partial<TombstoneConfig>;
  identity?: Partial<IdentityConfigSection>;
  plugins?: Partial<PluginsConfig>;
  externalSync?: Partial<ExternalSyncConfig>;
  demoMode?: boolean;
  merge?: Partial<MergeConfig>;
  workflow?: Partial<WorkflowConfig>;
  agents?: Partial<AgentsConfig>;
};

// ============================================================================
// Configuration Source Tracking
// ============================================================================

/**
 * Source of a configuration value
 */
export const ConfigSource = {
  /** Built-in default value */
  DEFAULT: 'default',
  /** From config file */
  FILE: 'file',
  /** From environment variable */
  ENVIRONMENT: 'environment',
  /** From CLI flag */
  CLI: 'cli',
} as const;

export type ConfigSource = (typeof ConfigSource)[keyof typeof ConfigSource];

/**
 * Configuration value with source tracking
 */
export interface TrackedValue<T> {
  /** The configuration value */
  value: T;
  /** Where the value came from */
  source: ConfigSource;
}

/**
 * Configuration with source tracking for each value
 */
export interface TrackedConfiguration {
  name?: TrackedValue<string>;
  actor?: TrackedValue<string>;
  baseBranch?: TrackedValue<string>;
  database: TrackedValue<string>;
  sync: {
    autoExport: TrackedValue<boolean>;
    exportDebounce: TrackedValue<Duration>;
    elementsFile: TrackedValue<string>;
    dependenciesFile: TrackedValue<string>;
  };
  playbooks: {
    paths: TrackedValue<string[]>;
  };
  tombstone: {
    ttl: TrackedValue<Duration>;
    minTtl: TrackedValue<Duration>;
  };
  identity: {
    mode: TrackedValue<IdentityMode>;
    timeTolerance: TrackedValue<Duration>;
  };
  plugins: {
    packages: TrackedValue<string[]>;
  };
  externalSync: {
    enabled: TrackedValue<boolean>;
    pollInterval: TrackedValue<Duration>;
    conflictStrategy: TrackedValue<ExternalSyncConflictStrategy>;
    defaultDirection: TrackedValue<SyncDirection>;
    autoLink: TrackedValue<boolean>;
    autoLinkProvider?: TrackedValue<string>;
    autoLinkDocumentProvider?: TrackedValue<string>;
  };
  demoMode: TrackedValue<boolean>;
  merge: {
    autoMerge: TrackedValue<boolean>;
    targetBranch: TrackedValue<string | null>;
    requireApproval: TrackedValue<boolean>;
  };
  workflow: {
    preset: TrackedValue<WorkflowPreset | null>;
  };
  agents: {
    permissionModel: TrackedValue<AgentPermissionModel>;
    allowedBashCommands: TrackedValue<string[]>;
  };
}

// ============================================================================
// YAML File Format Types
// ============================================================================

/**
 * YAML configuration file structure
 * Uses snake_case to match YAML conventions
 */
export interface YamlConfigFile {
  name?: string;
  actor?: string;
  base_branch?: string;
  database?: string;
  sync?: {
    auto_export?: boolean;
    export_debounce?: string | number;
    elements_file?: string;
    dependencies_file?: string;
  };
  playbooks?: {
    paths?: string[];
  };
  tombstone?: {
    ttl?: string | number;
    min_ttl?: string | number;
  };
  identity?: {
    mode?: string;
    time_tolerance?: string | number;
  };
  plugins?: {
    packages?: string[];
  };
  external_sync?: {
    enabled?: boolean;
    poll_interval?: string | number;
    conflict_strategy?: string;
    default_direction?: string;
    auto_link?: boolean;
    auto_link_provider?: string;
    auto_link_document_provider?: string;
  };
  demo_mode?: boolean;
  merge?: {
    auto_merge?: boolean;
    target_branch?: string | null;
    require_approval?: boolean;
  };
  workflow?: {
    preset?: string | null;
  };
  agents?: {
    permission_model?: string;
    allowed_bash_commands?: string[];
  };
}

// ============================================================================
// Environment Variable Mapping
// ============================================================================

/**
 * Environment variable names for configuration
 */
export const EnvVars = {
  /** Default actor name */
  ACTOR: 'STONEFORGE_ACTOR',
  /** Base branch for merge targets */
  BASE_BRANCH: 'STONEFORGE_BASE_BRANCH',
  /** Database file path */
  DATABASE: 'STONEFORGE_DB',
  /** Config file path override */
  CONFIG: 'STONEFORGE_CONFIG',
  /** JSON output mode */
  JSON: 'STONEFORGE_JSON',
  /** Verbose/debug mode */
  VERBOSE: 'STONEFORGE_VERBOSE',
  /** Auto-export on mutations */
  SYNC_AUTO_EXPORT: 'STONEFORGE_SYNC_AUTO_EXPORT',
  /** Identity mode */
  IDENTITY_MODE: 'STONEFORGE_IDENTITY_MODE',
  /** Demo mode */
  DEMO_MODE: 'STONEFORGE_DEMO_MODE',
} as const;

export type EnvVar = (typeof EnvVars)[keyof typeof EnvVars];

// ============================================================================
// Configuration Operations
// ============================================================================

/**
 * Options for loading configuration
 */
export interface LoadConfigOptions {
  /** Override config file path */
  configPath?: string;
  /** Skip environment variables */
  skipEnv?: boolean;
  /** Skip config file loading (use defaults only) */
  skipFile?: boolean;
  /** CLI flag overrides */
  cliOverrides?: PartialConfiguration;
}

/**
 * Result of configuration file discovery
 */
export interface ConfigFileDiscovery {
  /** Path to found config file, if any */
  path?: string;
  /** Whether the file exists */
  exists: boolean;
  /** Directory containing .stoneforge */
  stoneforgeDir?: string;
}

/**
 * Result of configuration validation
 */
export interface ConfigValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation error messages */
  errors: string[];
  /** Warning messages (non-fatal) */
  warnings: string[];
}

// ============================================================================
// Configuration Path Types
// ============================================================================

/**
 * Valid configuration paths (as const array for runtime validation)
 */
export const VALID_CONFIG_PATHS = [
  'name',
  'actor',
  'baseBranch',
  'database',
  'sync.autoExport',
  'sync.exportDebounce',
  'sync.elementsFile',
  'sync.dependenciesFile',
  'playbooks.paths',
  'tombstone.ttl',
  'tombstone.minTtl',
  'identity.mode',
  'identity.timeTolerance',
  'plugins.packages',
  'externalSync.enabled',
  'externalSync.pollInterval',
  'externalSync.conflictStrategy',
  'externalSync.defaultDirection',
  'externalSync.autoLink',
  'externalSync.autoLinkProvider',
  'externalSync.autoLinkDocumentProvider',
  'demoMode',
  'merge.autoMerge',
  'merge.targetBranch',
  'merge.requireApproval',
  'workflow.preset',
  'agents.permissionModel',
  'agents.allowedBashCommands',
] as const;

/**
 * Dot-notation paths for configuration values
 */
export type ConfigPath = (typeof VALID_CONFIG_PATHS)[number];

/**
 * Type guard to check if a string is a valid ConfigPath
 */
export function isValidConfigPath(value: string): value is ConfigPath {
  return (VALID_CONFIG_PATHS as readonly string[]).includes(value);
}

/**
 * Maps config paths to their value types
 */
export interface ConfigPathTypes {
  name: string | undefined;
  actor: string | undefined;
  baseBranch: string | undefined;
  database: string;
  'sync.autoExport': boolean;
  'sync.exportDebounce': Duration;
  'sync.elementsFile': string;
  'sync.dependenciesFile': string;
  'playbooks.paths': string[];
  'tombstone.ttl': Duration;
  'tombstone.minTtl': Duration;
  'identity.mode': IdentityMode;
  'identity.timeTolerance': Duration;
  'plugins.packages': string[];
  'externalSync.enabled': boolean;
  'externalSync.pollInterval': Duration;
  'externalSync.conflictStrategy': ExternalSyncConflictStrategy;
  'externalSync.defaultDirection': SyncDirection;
  'externalSync.autoLink': boolean;
  'externalSync.autoLinkProvider': string | undefined;
  'externalSync.autoLinkDocumentProvider': string | undefined;
  demoMode: boolean;
  'merge.autoMerge': boolean;
  'merge.targetBranch': string | null;
  'merge.requireApproval': boolean;
  'workflow.preset': WorkflowPreset | null;
  'agents.permissionModel': AgentPermissionModel;
  'agents.allowedBashCommands': string[];
}
