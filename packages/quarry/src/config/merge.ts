/**
 * Configuration Merging
 *
 * Deep merge utilities for combining configuration from multiple sources
 * with precedence handling.
 */

import type { Configuration, PartialConfiguration } from './types.js';
import { getDefaultConfig } from './defaults.js';

// ============================================================================
// Deep Merge Utilities
// ============================================================================

/**
 * Checks if a value is a plain object (not array, null, etc.)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Deep merges two objects, with source values overriding target values
 * Arrays are replaced, not merged
 *
 * @param target - Base object
 * @param source - Override object
 * @returns Merged object
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (sourceValue === undefined) {
      // Skip undefined values - don't override with undefined
      continue;
    }

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      // Recursively merge objects
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else {
      // Replace value (arrays, primitives, etc.)
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Merges partial configuration into a complete configuration
 *
 * @param base - Base configuration (typically defaults)
 * @param partial - Partial configuration to merge in
 * @returns Complete merged configuration
 */
export function mergeConfiguration(
  base: Configuration,
  partial: PartialConfiguration
): Configuration {
  const result: Configuration = {
    name: partial.name !== undefined ? partial.name : base.name,
    actor: partial.actor !== undefined ? partial.actor : base.actor,
    baseBranch: partial.baseBranch !== undefined ? partial.baseBranch : base.baseBranch,
    database: partial.database !== undefined ? partial.database : base.database,
    sync: {
      autoExport: partial.sync?.autoExport !== undefined ? partial.sync.autoExport : base.sync.autoExport,
      exportDebounce: partial.sync?.exportDebounce !== undefined ? partial.sync.exportDebounce : base.sync.exportDebounce,
      elementsFile: partial.sync?.elementsFile !== undefined ? partial.sync.elementsFile : base.sync.elementsFile,
      dependenciesFile: partial.sync?.dependenciesFile !== undefined ? partial.sync.dependenciesFile : base.sync.dependenciesFile,
    },
    playbooks: {
      paths: partial.playbooks?.paths !== undefined ? partial.playbooks.paths : [...base.playbooks.paths],
    },
    tombstone: {
      ttl: partial.tombstone?.ttl !== undefined ? partial.tombstone.ttl : base.tombstone.ttl,
      minTtl: partial.tombstone?.minTtl !== undefined ? partial.tombstone.minTtl : base.tombstone.minTtl,
    },
    identity: {
      mode: partial.identity?.mode !== undefined ? partial.identity.mode : base.identity.mode,
      timeTolerance: partial.identity?.timeTolerance !== undefined ? partial.identity.timeTolerance : base.identity.timeTolerance,
    },
    plugins: {
      packages: partial.plugins?.packages !== undefined ? partial.plugins.packages : [...(base.plugins?.packages ?? [])],
    },
    externalSync: {
      enabled: partial.externalSync?.enabled !== undefined ? partial.externalSync.enabled : base.externalSync.enabled,
      pollInterval: partial.externalSync?.pollInterval !== undefined ? partial.externalSync.pollInterval : base.externalSync.pollInterval,
      conflictStrategy: partial.externalSync?.conflictStrategy !== undefined ? partial.externalSync.conflictStrategy : base.externalSync.conflictStrategy,
      defaultDirection: partial.externalSync?.defaultDirection !== undefined ? partial.externalSync.defaultDirection : base.externalSync.defaultDirection,
      autoLink: partial.externalSync?.autoLink !== undefined ? partial.externalSync.autoLink : base.externalSync.autoLink,
      autoLinkProvider: partial.externalSync?.autoLinkProvider !== undefined ? partial.externalSync.autoLinkProvider : base.externalSync.autoLinkProvider,
      autoLinkDocumentProvider: partial.externalSync?.autoLinkDocumentProvider !== undefined ? partial.externalSync.autoLinkDocumentProvider : base.externalSync.autoLinkDocumentProvider,
    },
    demoMode: partial.demoMode !== undefined ? partial.demoMode : base.demoMode,
    merge: {
      autoMerge: partial.merge?.autoMerge !== undefined ? partial.merge.autoMerge : base.merge.autoMerge,
      targetBranch: partial.merge?.targetBranch !== undefined ? partial.merge.targetBranch : base.merge.targetBranch,
      requireApproval: partial.merge?.requireApproval !== undefined ? partial.merge.requireApproval : base.merge.requireApproval,
    },
    workflow: {
      preset: partial.workflow?.preset !== undefined ? partial.workflow.preset : base.workflow.preset,
    },
    agents: {
      permissionModel: partial.agents?.permissionModel !== undefined ? partial.agents.permissionModel : base.agents.permissionModel,
      allowedBashCommands: partial.agents?.allowedBashCommands !== undefined ? partial.agents.allowedBashCommands : base.agents.allowedBashCommands,
    },
  };
  return result;
}

/**
 * Merges multiple partial configurations in order
 * Later configurations override earlier ones
 *
 * @param base - Base configuration
 * @param partials - Partial configurations to merge, in order
 * @returns Complete merged configuration
 */
export function mergeConfigurations(
  base: Configuration,
  ...partials: PartialConfiguration[]
): Configuration {
  let result = base;
  for (const partial of partials) {
    result = mergeConfiguration(result, partial);
  }
  return result;
}

/**
 * Creates a configuration by merging defaults with partial config
 *
 * @param partial - Partial configuration
 * @returns Complete configuration with defaults filled in
 */
export function createConfiguration(partial?: PartialConfiguration): Configuration {
  const defaults = getDefaultConfig();
  if (!partial) {
    return defaults;
  }
  return mergeConfiguration(defaults, partial);
}

// ============================================================================
// Clone Utilities
// ============================================================================

/**
 * Creates a deep clone of a configuration
 */
export function cloneConfiguration(config: Configuration): Configuration {
  return {
    name: config.name,
    actor: config.actor,
    baseBranch: config.baseBranch,
    database: config.database,
    sync: {
      autoExport: config.sync.autoExport,
      exportDebounce: config.sync.exportDebounce,
      elementsFile: config.sync.elementsFile,
      dependenciesFile: config.sync.dependenciesFile,
    },
    playbooks: {
      paths: [...config.playbooks.paths],
    },
    tombstone: {
      ttl: config.tombstone.ttl,
      minTtl: config.tombstone.minTtl,
    },
    identity: {
      mode: config.identity.mode,
      timeTolerance: config.identity.timeTolerance,
    },
    plugins: {
      packages: [...(config.plugins?.packages ?? [])],
    },
    externalSync: {
      enabled: config.externalSync.enabled,
      pollInterval: config.externalSync.pollInterval,
      conflictStrategy: config.externalSync.conflictStrategy,
      defaultDirection: config.externalSync.defaultDirection,
      autoLink: config.externalSync.autoLink,
      autoLinkProvider: config.externalSync.autoLinkProvider,
      autoLinkDocumentProvider: config.externalSync.autoLinkDocumentProvider,
    },
    demoMode: config.demoMode,
    merge: {
      autoMerge: config.merge.autoMerge,
      targetBranch: config.merge.targetBranch,
      requireApproval: config.merge.requireApproval,
    },
    workflow: {
      preset: config.workflow.preset,
    },
    agents: {
      permissionModel: config.agents.permissionModel,
      allowedBashCommands: config.agents.allowedBashCommands,
    },
  };
}

// ============================================================================
// Diff Utilities
// ============================================================================

/**
 * Compares two configurations and returns the differences
 */
export function diffConfigurations(
  a: Configuration,
  b: Configuration
): PartialConfiguration {
  const diff: PartialConfiguration = {};

  if (a.name !== b.name) {
    diff.name = b.name;
  }
  if (a.actor !== b.actor) {
    diff.actor = b.actor;
  }
  if (a.baseBranch !== b.baseBranch) {
    diff.baseBranch = b.baseBranch;
  }
  if (a.database !== b.database) {
    diff.database = b.database;
  }

  // Sync diff
  const syncDiff: Partial<Configuration['sync']> = {};
  if (a.sync.autoExport !== b.sync.autoExport) {
    syncDiff.autoExport = b.sync.autoExport;
  }
  if (a.sync.exportDebounce !== b.sync.exportDebounce) {
    syncDiff.exportDebounce = b.sync.exportDebounce;
  }
  if (a.sync.elementsFile !== b.sync.elementsFile) {
    syncDiff.elementsFile = b.sync.elementsFile;
  }
  if (a.sync.dependenciesFile !== b.sync.dependenciesFile) {
    syncDiff.dependenciesFile = b.sync.dependenciesFile;
  }
  if (Object.keys(syncDiff).length > 0) {
    diff.sync = syncDiff;
  }

  // Playbooks diff
  if (JSON.stringify(a.playbooks.paths) !== JSON.stringify(b.playbooks.paths)) {
    diff.playbooks = { paths: b.playbooks.paths };
  }

  // Tombstone diff
  const tombstoneDiff: Partial<Configuration['tombstone']> = {};
  if (a.tombstone.ttl !== b.tombstone.ttl) {
    tombstoneDiff.ttl = b.tombstone.ttl;
  }
  if (a.tombstone.minTtl !== b.tombstone.minTtl) {
    tombstoneDiff.minTtl = b.tombstone.minTtl;
  }
  if (Object.keys(tombstoneDiff).length > 0) {
    diff.tombstone = tombstoneDiff;
  }

  // Identity diff
  const identityDiff: Partial<Configuration['identity']> = {};
  if (a.identity.mode !== b.identity.mode) {
    identityDiff.mode = b.identity.mode;
  }
  if (a.identity.timeTolerance !== b.identity.timeTolerance) {
    identityDiff.timeTolerance = b.identity.timeTolerance;
  }
  if (Object.keys(identityDiff).length > 0) {
    diff.identity = identityDiff;
  }

  // Plugins diff
  const aPackages = a.plugins?.packages ?? [];
  const bPackages = b.plugins?.packages ?? [];
  if (JSON.stringify(aPackages) !== JSON.stringify(bPackages)) {
    diff.plugins = { packages: bPackages };
  }

  // ExternalSync diff
  const externalSyncDiff: Partial<Configuration['externalSync']> = {};
  if (a.externalSync.enabled !== b.externalSync.enabled) {
    externalSyncDiff.enabled = b.externalSync.enabled;
  }
  if (a.externalSync.pollInterval !== b.externalSync.pollInterval) {
    externalSyncDiff.pollInterval = b.externalSync.pollInterval;
  }
  if (a.externalSync.conflictStrategy !== b.externalSync.conflictStrategy) {
    externalSyncDiff.conflictStrategy = b.externalSync.conflictStrategy;
  }
  if (a.externalSync.defaultDirection !== b.externalSync.defaultDirection) {
    externalSyncDiff.defaultDirection = b.externalSync.defaultDirection;
  }
  if (a.externalSync.autoLink !== b.externalSync.autoLink) {
    externalSyncDiff.autoLink = b.externalSync.autoLink;
  }
  if (a.externalSync.autoLinkProvider !== b.externalSync.autoLinkProvider) {
    externalSyncDiff.autoLinkProvider = b.externalSync.autoLinkProvider;
  }
  if (a.externalSync.autoLinkDocumentProvider !== b.externalSync.autoLinkDocumentProvider) {
    externalSyncDiff.autoLinkDocumentProvider = b.externalSync.autoLinkDocumentProvider;
  }
  if (Object.keys(externalSyncDiff).length > 0) {
    diff.externalSync = externalSyncDiff;
  }

  // DemoMode diff
  if (a.demoMode !== b.demoMode) {
    diff.demoMode = b.demoMode;
  }

  // Merge diff
  const mergeDiff: Partial<Configuration['merge']> = {};
  if (a.merge.autoMerge !== b.merge.autoMerge) {
    mergeDiff.autoMerge = b.merge.autoMerge;
  }
  if (a.merge.targetBranch !== b.merge.targetBranch) {
    mergeDiff.targetBranch = b.merge.targetBranch;
  }
  if (a.merge.requireApproval !== b.merge.requireApproval) {
    mergeDiff.requireApproval = b.merge.requireApproval;
  }
  if (Object.keys(mergeDiff).length > 0) {
    diff.merge = mergeDiff;
  }

  // Workflow diff
  if (a.workflow.preset !== b.workflow.preset) {
    diff.workflow = { preset: b.workflow.preset };
  }

  // Agents diff
  const agentsDiff: Partial<import('./types.js').AgentsConfig> = {};
  if (a.agents.permissionModel !== b.agents.permissionModel) {
    agentsDiff.permissionModel = b.agents.permissionModel;
  }
  if (JSON.stringify(a.agents.allowedBashCommands) !== JSON.stringify(b.agents.allowedBashCommands)) {
    agentsDiff.allowedBashCommands = b.agents.allowedBashCommands;
  }
  if (Object.keys(agentsDiff).length > 0) {
    diff.agents = agentsDiff;
  }

  return diff;
}

/**
 * Checks if two configurations are equal
 */
export function configurationsEqual(a: Configuration, b: Configuration): boolean {
  const aPackages = a.plugins?.packages ?? [];
  const bPackages = b.plugins?.packages ?? [];
  return (
    a.name === b.name &&
    a.actor === b.actor &&
    a.baseBranch === b.baseBranch &&
    a.database === b.database &&
    a.sync.autoExport === b.sync.autoExport &&
    a.sync.exportDebounce === b.sync.exportDebounce &&
    a.sync.elementsFile === b.sync.elementsFile &&
    a.sync.dependenciesFile === b.sync.dependenciesFile &&
    JSON.stringify(a.playbooks.paths) === JSON.stringify(b.playbooks.paths) &&
    a.tombstone.ttl === b.tombstone.ttl &&
    a.tombstone.minTtl === b.tombstone.minTtl &&
    a.identity.mode === b.identity.mode &&
    a.identity.timeTolerance === b.identity.timeTolerance &&
    JSON.stringify(aPackages) === JSON.stringify(bPackages) &&
    a.externalSync.enabled === b.externalSync.enabled &&
    a.externalSync.pollInterval === b.externalSync.pollInterval &&
    a.externalSync.conflictStrategy === b.externalSync.conflictStrategy &&
    a.externalSync.defaultDirection === b.externalSync.defaultDirection &&
    a.externalSync.autoLink === b.externalSync.autoLink &&
    a.externalSync.autoLinkProvider === b.externalSync.autoLinkProvider &&
    a.externalSync.autoLinkDocumentProvider === b.externalSync.autoLinkDocumentProvider &&
    a.demoMode === b.demoMode &&
    a.merge.autoMerge === b.merge.autoMerge &&
    a.merge.targetBranch === b.merge.targetBranch &&
    a.merge.requireApproval === b.merge.requireApproval &&
    a.workflow.preset === b.workflow.preset &&
    a.agents.permissionModel === b.agents.permissionModel &&
    JSON.stringify(a.agents.allowedBashCommands) === JSON.stringify(b.agents.allowedBashCommands)
  );
}
