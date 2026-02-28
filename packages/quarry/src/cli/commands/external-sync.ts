/**
 * External Sync Commands - Manage bidirectional sync with external services
 *
 * Provides CLI commands for external service synchronization:
 * - config: Show/set provider configuration (tokens, projects)
 * - link: Link a task/document to an external issue/page
 * - link-all: Bulk-link all unlinked tasks or documents
 * - unlink: Remove external link from a task
 * - push: Push linked elements to external service
 * - pull: Pull changes from external for linked elements
 * - sync: Bidirectional sync (push + pull)
 * - status: Show sync state overview
 * - resolve: Resolve sync conflicts
 */

import type { Command, CommandResult, GlobalOptions, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { createAPI, resolveDatabasePath } from '../db.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { getValue, setValue, VALID_AUTO_LINK_PROVIDERS } from '../../config/index.js';
import type { Task, Document, ElementId, ExternalProvider, ExternalSyncState, SyncDirection, SyncAdapterType, TaskSyncAdapter, DocumentSyncAdapter } from '@stoneforge/core';
import { taskToExternalTask, getFieldMapConfigForProvider } from '../../external-sync/adapters/task-sync-adapter.js';
import { isSystemCategory, documentToExternalDocumentInput } from '../../external-sync/adapters/document-sync-adapter.js';

/**
 * Providers that do not require an authentication token.
 * These providers sync to local resources (e.g., filesystem directories)
 * and can be used with just a project/path configured.
 */
const TOKENLESS_PROVIDERS = new Set(['folder']);

// ============================================================================
// Type Flag Helper
// ============================================================================

/**
 * Parse the --type flag value into an array of SyncAdapterType values.
 *
 * @param typeFlag - The --type flag value: 'task', 'document', or 'all'
 * @returns Array of adapter types, or undefined for 'all' (no filter)
 */
function parseTypeFlag(typeFlag?: string): SyncAdapterType[] | undefined {
  if (!typeFlag || typeFlag === 'all') {
    return undefined; // No filter — process all types
  }
  if (typeFlag === 'task') {
    return ['task'];
  }
  if (typeFlag === 'document') {
    return ['document'];
  }
  return undefined; // Unknown value — treat as 'all'
}

/**
 * Validate the --type flag value.
 *
 * @returns Error message if invalid, undefined if valid
 */
function validateTypeFlag(typeFlag?: string): string | undefined {
  if (!typeFlag || typeFlag === 'all' || typeFlag === 'task' || typeFlag === 'document') {
    return undefined;
  }
  return `Invalid --type value "${typeFlag}". Must be one of: task, document, all`;
}

// ============================================================================
// Settings Service Helper
// ============================================================================

/**
 * Dynamically imports and creates a SettingsService from a storage backend.
 * Uses optional peer dependency @stoneforge/smithy.
 */
async function createSettingsServiceFromOptions(options: GlobalOptions): Promise<{
  settingsService: SettingsServiceLike;
  error?: string;
}> {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return {
      settingsService: null as unknown as SettingsServiceLike,
      error: 'No database found. Run "sf init" to initialize a workspace, or specify --db path',
    };
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);

    // Dynamic import to handle optional peer dependency
    const { createSettingsService } = await import('@stoneforge/smithy/services');
    return { settingsService: createSettingsService(backend) as SettingsServiceLike };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If the import fails, the smithy package isn't available
    if (message.includes('Cannot find') || message.includes('MODULE_NOT_FOUND')) {
      return {
        settingsService: null as unknown as SettingsServiceLike,
        error: 'External sync requires @stoneforge/smithy package. Ensure it is installed.',
      };
    }
    return {
      settingsService: null as unknown as SettingsServiceLike,
      error: `Failed to initialize settings: ${message}`,
    };
  }
}

/**
 * Lightweight interface matching the subset of SettingsService we need.
 * Avoids hard dependency on smithy types at compile time.
 */
interface ProviderConfigLike {
  provider: string;
  token?: string;
  apiBaseUrl?: string;
  defaultProject?: string;
}

interface ExternalSyncSettingsLike {
  providers: Record<string, ProviderConfigLike>;
  syncCursors: Record<string, string>;
  pollIntervalMs: number;
  defaultDirection: string;
}

interface SettingsServiceLike {
  getExternalSyncSettings(): ExternalSyncSettingsLike;
  setExternalSyncSettings(settings: ExternalSyncSettingsLike): ExternalSyncSettingsLike;
  getProviderConfig(provider: string): ProviderConfigLike | undefined;
  setProviderConfig(provider: string, config: ProviderConfigLike): ProviderConfigLike;
  getSetting(key: string): { value: unknown } | undefined;
  setSetting(key: string, value: unknown): { value: unknown };
}

// ============================================================================
// Token Masking
// ============================================================================

/**
 * Masks a token for display, showing only first 4 and last 4 characters
 */
function maskToken(token: string): string {
  if (token.length <= 8) {
    return '****';
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

// ============================================================================
// Config Command
// ============================================================================

async function configHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { settingsService, error } = await createSettingsServiceFromOptions(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  const settings = settingsService.getExternalSyncSettings();
  const mode = getOutputMode(options);

  // Also get file-based config for display
  const enabled = getValue('externalSync.enabled');
  const conflictStrategy = getValue('externalSync.conflictStrategy');
  const defaultDirection = getValue('externalSync.defaultDirection');
  const pollInterval = getValue('externalSync.pollInterval');
  const autoLink = getValue('externalSync.autoLink');
  const autoLinkProvider = getValue('externalSync.autoLinkProvider');
  const autoLinkDocumentProvider = getValue('externalSync.autoLinkDocumentProvider');

  const configData = {
    enabled,
    conflictStrategy,
    defaultDirection,
    pollInterval,
    autoLink,
    autoLinkProvider,
    autoLinkDocumentProvider,
    providers: Object.fromEntries(
      Object.entries(settings.providers).map(([name, config]) => [
        name,
        {
          ...config,
          token: config.token ? maskToken(config.token) : undefined,
        },
      ])
    ),
  };

  if (mode === 'json') {
    return success(configData);
  }

  if (mode === 'quiet') {
    const providerNames = Object.keys(settings.providers);
    return success(providerNames.length > 0 ? providerNames.join(',') : 'none');
  }

  // Human-readable output
  const lines: string[] = [
    'External Sync Configuration',
    '',
    `  Enabled:            ${enabled ? 'yes' : 'no'}`,
    `  Conflict strategy:  ${conflictStrategy}`,
    `  Default direction:  ${defaultDirection}`,
    `  Poll interval:      ${pollInterval}ms`,
    `  Auto-link:          ${autoLink ? 'yes' : 'no'}`,
    `  Auto-link provider (tasks): ${autoLinkProvider ?? '(not set)'}`,
    `  Auto-link provider (docs):  ${autoLinkDocumentProvider ?? '(not set)'}`,
    '',
  ];

  const providerEntries = Object.entries(settings.providers);
  if (providerEntries.length === 0) {
    lines.push('  Providers:          (none configured)');
    lines.push('');
    lines.push('  Run "sf external-sync config set-token <provider> <token>" to configure a provider.');
  } else {
    lines.push('  Providers:');
    for (const [name, config] of providerEntries) {
      lines.push(`    ${name}:`);
      lines.push(`      Token:           ${config.token ? maskToken(config.token) : '(not set)'}`);
      lines.push(`      API URL:         ${config.apiBaseUrl ?? '(default)'}`);
      lines.push(`      Default project: ${config.defaultProject ?? '(not set)'}`);
    }
  }

  return success(configData, lines.join('\n'));
}

// ============================================================================
// Config Set-Token Command
// ============================================================================

async function configSetTokenHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 2) {
    return failure(
      'Usage: sf external-sync config set-token <provider> <token>',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [provider, token] = args;

  const { settingsService, error } = await createSettingsServiceFromOptions(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  const existing = settingsService.getProviderConfig(provider) ?? { provider };
  settingsService.setProviderConfig(provider, { ...existing, token });

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ provider, tokenSet: true });
  }

  if (mode === 'quiet') {
    return success(provider);
  }

  return success(
    { provider, tokenSet: true },
    `Token set for provider "${provider}" (${maskToken(token)})`
  );
}

// ============================================================================
// Config Set-Project Command
// ============================================================================

async function configSetProjectHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 2) {
    return failure(
      'Usage: sf external-sync config set-project <provider> <project>',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [provider, project] = args;

  const { settingsService, error } = await createSettingsServiceFromOptions(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  const existing = settingsService.getProviderConfig(provider) ?? { provider };
  settingsService.setProviderConfig(provider, { ...existing, defaultProject: project });

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ provider, defaultProject: project });
  }

  if (mode === 'quiet') {
    return success(project);
  }

  return success(
    { provider, defaultProject: project },
    `Default project set for provider "${provider}": ${project}`
  );
}

// ============================================================================
// Config Set-Auto-Link Command
// ============================================================================

async function configSetAutoLinkHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      'Usage: sf external-sync config set-auto-link <provider> [--type task|document]',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [provider] = args;
  const typeFlag = (options as Record<string, unknown>).type as string | undefined;
  const linkType = typeFlag ?? 'task';

  // Validate --type flag
  if (linkType !== 'task' && linkType !== 'document') {
    return failure(
      `Invalid type "${linkType}". Must be one of: task, document`,
      ExitCode.VALIDATION
    );
  }

  // Validate provider name
  if (!VALID_AUTO_LINK_PROVIDERS.includes(provider)) {
    return failure(
      `Invalid provider "${provider}". Must be one of: ${VALID_AUTO_LINK_PROVIDERS.join(', ')}`,
      ExitCode.VALIDATION
    );
  }

  // Check if provider has a token configured (skip for tokenless providers like folder)
  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  let tokenWarning: string | undefined;
  if (!settingsError && !TOKENLESS_PROVIDERS.has(provider)) {
    const providerConfig = settingsService.getProviderConfig(provider);
    if (!providerConfig?.token) {
      tokenWarning = `Warning: Provider "${provider}" has no token configured. Auto-link will not work until a token is set. Run "sf external-sync config set-token ${provider} <token>".`;
    }
  }

  if (linkType === 'document') {
    // Set document auto-link provider
    setValue('externalSync.autoLinkDocumentProvider', provider);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ autoLinkDocumentProvider: provider, warning: tokenWarning });
    }

    if (mode === 'quiet') {
      return success(provider);
    }

    const lines = [`Auto-link for documents enabled with provider "${provider}".`];
    if (tokenWarning) {
      lines.push('');
      lines.push(tokenWarning);
    }

    return success(
      { autoLinkDocumentProvider: provider },
      lines.join('\n')
    );
  }

  // Default: task auto-link
  setValue('externalSync.autoLink', true);
  setValue('externalSync.autoLinkProvider', provider);

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ autoLink: true, autoLinkProvider: provider, warning: tokenWarning });
  }

  if (mode === 'quiet') {
    return success(provider);
  }

  const lines = [`Auto-link for tasks enabled with provider "${provider}".`];
  if (tokenWarning) {
    lines.push('');
    lines.push(tokenWarning);
  }

  return success(
    { autoLink: true, autoLinkProvider: provider },
    lines.join('\n')
  );
}

// ============================================================================
// Config Disable-Auto-Link Command
// ============================================================================

async function configDisableAutoLinkHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const typeFlag = (options as Record<string, unknown>).type as string | undefined;
  const linkType = typeFlag ?? 'all';

  // Validate --type flag
  if (linkType !== 'task' && linkType !== 'document' && linkType !== 'all') {
    return failure(
      `Invalid type "${linkType}". Must be one of: task, document, all`,
      ExitCode.VALIDATION
    );
  }

  const mode = getOutputMode(options);

  if (linkType === 'document') {
    // Only clear document auto-link provider
    setValue('externalSync.autoLinkDocumentProvider', undefined);

    if (mode === 'json') {
      return success({ autoLinkDocumentProvider: null });
    }

    if (mode === 'quiet') {
      return success('disabled');
    }

    return success(
      { autoLinkDocumentProvider: null },
      'Auto-link for documents disabled.'
    );
  }

  if (linkType === 'task') {
    // Only clear task auto-link
    setValue('externalSync.autoLink', false);
    setValue('externalSync.autoLinkProvider', undefined);

    if (mode === 'json') {
      return success({ autoLink: false, autoLinkProvider: null });
    }

    if (mode === 'quiet') {
      return success('disabled');
    }

    return success(
      { autoLink: false },
      'Auto-link for tasks disabled.'
    );
  }

  // Default: disable all
  setValue('externalSync.autoLink', false);
  setValue('externalSync.autoLinkProvider', undefined);
  setValue('externalSync.autoLinkDocumentProvider', undefined);

  if (mode === 'json') {
    return success({ autoLink: false, autoLinkProvider: null, autoLinkDocumentProvider: null });
  }

  if (mode === 'quiet') {
    return success('disabled');
  }

  return success(
    { autoLink: false },
    'Auto-link disabled.'
  );
}

// ============================================================================
// Link Command
// ============================================================================

interface LinkOptions {
  provider?: string;
  type?: string;
}

const linkOptions: CommandOption[] = [
  {
    name: 'provider',
    short: 'p',
    description: 'Provider name (default: github)',
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: 'Element type: task or document (default: task)',
    hasValue: true,
    defaultValue: 'task',
  },
];

async function linkHandler(
  args: string[],
  options: GlobalOptions & LinkOptions
): Promise<CommandResult> {
  const elementType = options.type ?? 'task';
  if (elementType !== 'task' && elementType !== 'document') {
    return failure(
      `Invalid --type value "${elementType}". Must be one of: task, document`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  if (args.length < 2) {
    return failure(
      `Usage: sf external-sync link <${elementType}Id> <url-or-external-id>`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [elementId, urlOrExternalId] = args;
  const provider = options.provider ?? 'github';

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Resolve the element (task or document)
  let element: Task | Document | null;
  try {
    element = await api.get<Task | Document>(elementId as ElementId);
  } catch {
    return failure(`Element not found: ${elementId}`, ExitCode.NOT_FOUND);
  }

  if (!element) {
    return failure(`Element not found: ${elementId}`, ExitCode.NOT_FOUND);
  }

  if (element.type !== elementType) {
    return failure(`Element ${elementId} is not a ${elementType} (type: ${element.type})`, ExitCode.VALIDATION);
  }

  // Determine the external URL and external ID
  let externalUrl: string;
  let externalId: string;

  if (/^\d+$/.test(urlOrExternalId)) {
    // Bare number — construct URL from default project
    const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
    if (settingsError) {
      return failure(settingsError, ExitCode.GENERAL_ERROR);
    }

    const providerConfig = settingsService.getProviderConfig(provider);
    if (!providerConfig?.defaultProject) {
      return failure(
        `No default project configured for provider "${provider}". ` +
        `Run "sf external-sync config set-project ${provider} <project>" first, ` +
        `or provide a full URL.`,
        ExitCode.VALIDATION
      );
    }

    externalId = urlOrExternalId;
    if (provider === 'github') {
      const baseUrl = providerConfig.apiBaseUrl
        ? providerConfig.apiBaseUrl.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '')
        : 'https://github.com';
      externalUrl = `${baseUrl}/${providerConfig.defaultProject}/issues/${urlOrExternalId}`;
    } else {
      // Generic URL construction for other providers
      externalUrl = `${providerConfig.defaultProject}#${urlOrExternalId}`;
    }
  } else {
    // Full URL or external ID provided
    externalUrl = urlOrExternalId;
    // Extract issue number from URL if present, otherwise use the full value
    const match = urlOrExternalId.match(/\/(\d+)\/?$/);
    externalId = match ? match[1] : urlOrExternalId;
  }

  // Extract project from URL if possible
  let project: string | undefined;
  const ghMatch = externalUrl.match(/github\.com\/([^/]+\/[^/]+)\//);
  if (ghMatch) {
    project = ghMatch[1];
  }

  // Determine the adapter type based on element type
  const adapterType: SyncAdapterType = elementType === 'document' ? 'document' : 'task';

  // Update element with externalRef and _externalSync metadata
  const syncMetadata = {
    provider,
    project: project ?? '',
    externalId,
    url: externalUrl,
    direction: getValue('externalSync.defaultDirection'),
    adapterType,
  };

  try {
    const existingMetadata = (element.metadata ?? {}) as Record<string, unknown>;
    await api.update(elementId as ElementId, {
      externalRef: externalUrl,
      metadata: {
        ...existingMetadata,
        _externalSync: syncMetadata,
      },
    } as Partial<Task | Document>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to update ${elementType}: ${message}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ elementId, elementType, externalUrl, provider, externalId, project, adapterType });
  }

  if (mode === 'quiet') {
    return success(externalUrl);
  }

  return success(
    { elementId, elementType, externalUrl, provider, externalId },
    `Linked ${elementType} ${elementId} to ${externalUrl}`
  );
}

// ============================================================================
// Unlink Command
// ============================================================================

async function unlinkHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      'Usage: sf external-sync unlink <elementId>',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [elementId] = args;

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Resolve element (task or document)
  let element: Task | Document | null;
  try {
    element = await api.get<Task | Document>(elementId as ElementId);
  } catch {
    return failure(`Element not found: ${elementId}`, ExitCode.NOT_FOUND);
  }

  if (!element) {
    return failure(`Element not found: ${elementId}`, ExitCode.NOT_FOUND);
  }

  if (element.type !== 'task' && element.type !== 'document') {
    return failure(`Element ${elementId} is not a task or document (type: ${(element as any).type})`, ExitCode.VALIDATION);
  }

  const hasExternalRef = (element as Task).externalRef;
  const hasExternalSync = (element.metadata as Record<string, unknown>)?._externalSync;
  if (!hasExternalRef && !hasExternalSync) {
    return failure(`Element ${elementId} is not linked to an external service`, ExitCode.VALIDATION);
  }

  // Clear externalRef and _externalSync metadata
  try {
    const existingMetadata = (element.metadata ?? {}) as Record<string, unknown>;
    const { _externalSync: _, ...restMetadata } = existingMetadata;
    await api.update(elementId as ElementId, {
      externalRef: undefined,
      metadata: restMetadata,
    } as Partial<Task | Document>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to update element: ${message}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ elementId, elementType: element.type, unlinked: true });
  }

  if (mode === 'quiet') {
    return success(elementId);
  }

  return success(
    { elementId, unlinked: true },
    `Unlinked ${element.type} ${elementId} from external service`
  );
}

// ============================================================================
// Push Command
// ============================================================================

interface PushOptions {
  all?: boolean;
  force?: boolean;
  type?: string;
}

const pushOptions: CommandOption[] = [
  {
    name: 'all',
    short: 'a',
    description: 'Push all linked elements',
  },
  {
    name: 'force',
    short: 'f',
    description: 'Push all linked elements regardless of whether they have changed',
  },
  {
    name: 'type',
    short: 't',
    description: 'Element type to push: task, document, or all (default: all)',
    hasValue: true,
    defaultValue: 'all',
  },
];

async function pushHandler(
  args: string[],
  options: GlobalOptions & PushOptions
): Promise<CommandResult> {
  // Validate --type flag
  const typeError = validateTypeFlag(options.type);
  if (typeError) {
    return failure(typeError, ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Get settings service to create a configured sync engine
  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  if (settingsError) {
    return failure(settingsError, ExitCode.GENERAL_ERROR);
  }

  const syncSettings = settingsService.getExternalSyncSettings();
  const providerConfigs = Object.values(syncSettings.providers).filter(
    (p): p is ProviderConfigLike & { token: string } => !!p.token
  );

  if (providerConfigs.length === 0) {
    return failure(
      'No providers configured with tokens. Run "sf external-sync config set-token <provider> <token>" first.',
      ExitCode.GENERAL_ERROR
    );
  }

  // Build sync options
  const { createSyncEngine, createConfiguredProviderRegistry } = await import('../../external-sync/index.js');
  const registry = createConfiguredProviderRegistry(
    providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    }))
  );

  const engine = createSyncEngine({
    api,
    registry,
    settings: settingsService,
    providerConfigs: providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    })),
  });

  // Build push options
  const adapterTypes = parseTypeFlag(options.type);
  const syncPushOptions: { taskIds?: string[]; all?: boolean; force?: boolean; adapterTypes?: SyncAdapterType[] } = {};
  if (adapterTypes) {
    syncPushOptions.adapterTypes = adapterTypes;
  }
  if (options.all) {
    syncPushOptions.all = true;
  } else if (args.length > 0) {
    syncPushOptions.taskIds = args;
  } else {
    return failure(
      'Usage: sf external-sync push [elementId...] or sf external-sync push --all',
      ExitCode.INVALID_ARGUMENTS
    );
  }
  if (options.force) {
    syncPushOptions.force = true;
  }

  try {
    const result = await engine.push(syncPushOptions);

    const mode = getOutputMode(options);
    const output = {
      success: result.success,
      pushed: result.pushed,
      skipped: result.skipped,
      errors: result.errors,
      conflicts: result.conflicts,
    };

    if (mode === 'json') {
      return success(output);
    }

    if (mode === 'quiet') {
      return success(String(result.pushed));
    }

    const typeLabel = options.type === 'document' ? 'document(s)' : options.type === 'task' ? 'task(s)' : 'element(s)';
    const lines: string[] = [
      `Push: ${result.pushed} ${typeLabel} pushed successfully`,
      '',
    ];

    if (result.skipped > 0) {
      lines.push(`Skipped: ${result.skipped}`);
    }

    if (result.errors.length > 0) {
      lines.push('');
      lines.push(`Errors (${result.errors.length}):`);
      for (const err of result.errors) {
        lines.push(`  ${err.elementId ?? 'unknown'}: ${err.message}`);
      }
    }

    if (result.conflicts.length > 0) {
      lines.push('');
      lines.push(`Conflicts (${result.conflicts.length}):`);
      for (const conflict of result.conflicts) {
        lines.push(`  ${conflict.elementId} ↔ ${conflict.externalId} (${conflict.strategy}, resolved: ${conflict.resolved})`);
      }
    }

    return success(output, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Push failed: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Pull Command
// ============================================================================

interface PullOptions {
  provider?: string;
  discover?: boolean;
  type?: string;
}

const pullOptions: CommandOption[] = [
  {
    name: 'provider',
    short: 'p',
    description: 'Provider to pull from (default: all configured)',
    hasValue: true,
  },
  {
    name: 'discover',
    short: 'd',
    description: 'Discover new issues not yet linked',
  },
  {
    name: 'type',
    short: 't',
    description: 'Element type to pull: task, document, or all (default: all)',
    hasValue: true,
    defaultValue: 'all',
  },
];

async function pullHandler(
  _args: string[],
  options: GlobalOptions & PullOptions
): Promise<CommandResult> {
  // Validate --type flag
  const typeError = validateTypeFlag(options.type);
  if (typeError) {
    return failure(typeError, ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  if (settingsError) {
    return failure(settingsError, ExitCode.GENERAL_ERROR);
  }

  const settings = settingsService.getExternalSyncSettings();
  const providerNames = options.provider
    ? [options.provider]
    : Object.keys(settings.providers);

  if (providerNames.length === 0) {
    return failure(
      'No providers configured. Run "sf external-sync config set-token <provider> <token>" first.',
      ExitCode.VALIDATION
    );
  }

  // Validate providers have tokens and build provider configs
  const providerConfigs: Array<{ provider: string; token: string; apiBaseUrl?: string; defaultProject?: string }> = [];
  const invalidProviders: string[] = [];

  for (const name of providerNames) {
    const config = settings.providers[name];
    if (config?.token) {
      providerConfigs.push({
        provider: config.provider,
        token: config.token,
        apiBaseUrl: config.apiBaseUrl,
        defaultProject: config.defaultProject,
      });
    } else {
      invalidProviders.push(name);
    }
  }

  if (providerConfigs.length === 0) {
    return failure(
      'No providers with valid tokens found. Run "sf external-sync config set-token <provider> <token>" first.',
      ExitCode.GENERAL_ERROR
    );
  }

  // Create sync engine (same pattern as pushHandler)
  const { createSyncEngine, createConfiguredProviderRegistry } = await import('../../external-sync/index.js');
  const registry = createConfiguredProviderRegistry(
    providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    }))
  );

  const engine = createSyncEngine({
    api,
    registry,
    settings: settingsService,
    providerConfigs: providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    })),
  });

  // Build pull options — discover maps to 'all' to create local tasks for unlinked external issues
  const adapterTypes = parseTypeFlag(options.type);
  const syncPullOptions: { all?: boolean; adapterTypes?: SyncAdapterType[] } = {};
  if (adapterTypes) {
    syncPullOptions.adapterTypes = adapterTypes;
  }
  if (options.discover) {
    syncPullOptions.all = true;
  }

  try {
    const result = await engine.pull(syncPullOptions);

    const mode = getOutputMode(options);
    const output = {
      success: result.success,
      pulled: result.pulled,
      skipped: result.skipped,
      errors: result.errors,
      conflicts: result.conflicts,
      invalidProviders,
    };

    if (mode === 'json') {
      return success(output);
    }

    if (mode === 'quiet') {
      return success(String(result.pulled));
    }

    const typeLabel = options.type === 'document' ? 'document(s)' : options.type === 'task' ? 'task(s)' : 'element(s)';
    const lines: string[] = [
      `Pull: ${result.pulled} ${typeLabel} pulled successfully`,
      '',
    ];

    if (result.skipped > 0) {
      lines.push(`Skipped: ${result.skipped}`);
    }

    if (invalidProviders.length > 0) {
      lines.push('');
      lines.push(`Skipped providers (no token): ${invalidProviders.join(', ')}`);
    }

    if (result.errors.length > 0) {
      lines.push('');
      lines.push(`Errors (${result.errors.length}):`);
      for (const err of result.errors) {
        lines.push(`  ${err.elementId ?? 'unknown'}: ${err.message}`);
      }
    }

    if (result.conflicts.length > 0) {
      lines.push('');
      lines.push(`Conflicts (${result.conflicts.length}):`);
      for (const conflict of result.conflicts) {
        lines.push(`  ${conflict.elementId} ↔ ${conflict.externalId} (${conflict.strategy}, resolved: ${conflict.resolved})`);
      }
    }

    return success(output, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Pull failed: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Sync Command (bidirectional)
// ============================================================================

interface SyncOptions {
  'dry-run'?: boolean;
  type?: string;
}

const syncOptions: CommandOption[] = [
  {
    name: 'dry-run',
    short: 'n',
    description: 'Show what would change without making changes',
  },
  {
    name: 'type',
    short: 't',
    description: 'Element type to sync: task, document, or all (default: all)',
    hasValue: true,
    defaultValue: 'all',
  },
];

async function syncHandler(
  _args: string[],
  options: GlobalOptions & SyncOptions
): Promise<CommandResult> {
  // Validate --type flag
  const typeError = validateTypeFlag(options.type);
  if (typeError) {
    return failure(typeError, ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  if (settingsError) {
    return failure(settingsError, ExitCode.GENERAL_ERROR);
  }

  const syncSettings = settingsService.getExternalSyncSettings();
  const isDryRun = options['dry-run'] ?? false;

  const providerConfigs = Object.values(syncSettings.providers).filter(
    (p): p is ProviderConfigLike & { token: string } => !!p.token
  );

  if (providerConfigs.length === 0) {
    return failure(
      'No providers configured with tokens. Run "sf external-sync config set-token <provider> <token>" first.',
      ExitCode.GENERAL_ERROR
    );
  }

  // Create sync engine (same pattern as pushHandler)
  const { createSyncEngine, createConfiguredProviderRegistry } = await import('../../external-sync/index.js');
  const registry = createConfiguredProviderRegistry(
    providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    }))
  );

  const engine = createSyncEngine({
    api,
    registry,
    settings: settingsService,
    providerConfigs: providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    })),
  });

  // Build sync options
  const adapterTypes = parseTypeFlag(options.type);
  const syncOpts: { dryRun?: boolean; adapterTypes?: SyncAdapterType[] } = {};
  if (adapterTypes) {
    syncOpts.adapterTypes = adapterTypes;
  }
  if (isDryRun) {
    syncOpts.dryRun = true;
  }

  try {
    const result = await engine.sync(syncOpts);

    const mode = getOutputMode(options);
    const output = {
      success: result.success,
      dryRun: isDryRun,
      pushed: result.pushed,
      pulled: result.pulled,
      skipped: result.skipped,
      errors: result.errors,
      conflicts: result.conflicts,
    };

    if (mode === 'json') {
      return success(output);
    }

    if (mode === 'quiet') {
      return success(`${result.pushed}/${result.pulled}`);
    }

    const typeLabel = options.type === 'document' ? 'document(s)' : options.type === 'task' ? 'task(s)' : 'element(s)';
    const lines: string[] = [
      isDryRun ? 'Sync (dry run) - showing what would change' : 'Bidirectional Sync Complete',
      '',
      `  Pushed: ${result.pushed} ${typeLabel}`,
      `  Pulled: ${result.pulled} ${typeLabel}`,
    ];

    if (result.skipped > 0) {
      lines.push(`  Skipped: ${result.skipped} (no changes)`);
    }

    if (result.errors.length > 0) {
      lines.push('');
      lines.push(`Errors (${result.errors.length}):`);
      for (const err of result.errors) {
        lines.push(`  ${err.elementId ?? 'unknown'}: ${err.message}`);
      }
    }

    if (result.conflicts.length > 0) {
      lines.push('');
      lines.push(`Conflicts (${result.conflicts.length}):`);
      for (const conflict of result.conflicts) {
        lines.push(`  ${conflict.elementId} ↔ ${conflict.externalId} (${conflict.strategy}, resolved: ${conflict.resolved})`);
      }
    }

    return success(output, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Sync failed: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Status Command
// ============================================================================

async function statusHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  if (settingsError) {
    return failure(settingsError, ExitCode.GENERAL_ERROR);
  }

  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  const settings = settingsService.getExternalSyncSettings();
  const enabled = getValue('externalSync.enabled');

  // Count linked tasks and documents, and check for conflicts
  let linkedTaskCount = 0;
  let linkedDocCount = 0;
  let conflictCount = 0;
  const providerTaskCounts: Record<string, number> = {};
  const providerDocCounts: Record<string, number> = {};

  try {
    const allTasks = await api.list({ type: 'task' });
    for (const t of allTasks) {
      const task = t as Task;
      if (task.externalRef && (task.metadata as Record<string, unknown>)?._externalSync) {
        linkedTaskCount++;
        const syncMeta = (task.metadata as Record<string, unknown>)._externalSync as Record<string, unknown>;
        const provider = (syncMeta?.provider as string) ?? 'unknown';
        providerTaskCounts[provider] = (providerTaskCounts[provider] ?? 0) + 1;
      }
      if (task.tags?.includes('sync-conflict')) {
        conflictCount++;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }

  try {
    const allDocs = await api.list({ type: 'document' });
    for (const d of allDocs) {
      const doc = d as Document;
      if ((doc.metadata as Record<string, unknown>)?._externalSync) {
        linkedDocCount++;
        const syncMeta = (doc.metadata as Record<string, unknown>)._externalSync as Record<string, unknown>;
        const provider = (syncMeta?.provider as string) ?? 'unknown';
        providerDocCounts[provider] = (providerDocCounts[provider] ?? 0) + 1;
      }
    }
  } catch {
    // If listing documents fails, continue with task counts only
  }

  // Build cursor info
  const cursors: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings.syncCursors)) {
    cursors[key] = value;
  }

  const mode = getOutputMode(options);
  const statusData = {
    enabled,
    linkedTaskCount,
    linkedDocumentCount: linkedDocCount,
    conflictCount,
    providerTaskCounts,
    providerDocumentCounts: providerDocCounts,
    configuredProviders: Object.keys(settings.providers),
    syncCursors: cursors,
    pollIntervalMs: settings.pollIntervalMs,
    defaultDirection: settings.defaultDirection,
  };

  if (mode === 'json') {
    return success(statusData);
  }

  if (mode === 'quiet') {
    return success(`${linkedTaskCount}:${linkedDocCount}:${conflictCount}`);
  }

  const lines: string[] = [
    'External Sync Status',
    '',
    `  Enabled:             ${enabled ? 'yes' : 'no'}`,
    `  Linked tasks:        ${linkedTaskCount}`,
    `  Linked documents:    ${linkedDocCount}`,
    `  Pending conflicts:   ${conflictCount}`,
    `  Poll interval:       ${settings.pollIntervalMs}ms`,
    `  Default direction:   ${settings.defaultDirection}`,
    '',
  ];

  // Provider breakdown
  const providerEntries = Object.entries(settings.providers);
  if (providerEntries.length > 0) {
    lines.push('  Providers:');
    for (const [name, config] of providerEntries) {
      const taskCount = providerTaskCounts[name] ?? 0;
      const docCount = providerDocCounts[name] ?? 0;
      const hasToken = config.token ? 'yes' : 'no';
      lines.push(`    ${name}: ${taskCount} linked task(s), ${docCount} linked document(s), token: ${hasToken}, project: ${config.defaultProject ?? '(not set)'}`);
    }
  } else {
    lines.push('  Providers: (none configured)');
  }

  // Sync cursors
  const cursorEntries = Object.entries(cursors);
  if (cursorEntries.length > 0) {
    lines.push('');
    lines.push('  Last sync cursors:');
    for (const [key, value] of cursorEntries) {
      lines.push(`    ${key}: ${value}`);
    }
  }

  if (conflictCount > 0) {
    lines.push('');
    lines.push(`  ⚠ ${conflictCount} conflict(s) need resolution. Run "sf external-sync resolve <taskId> --keep local|remote".`);
  }

  return success(statusData, lines.join('\n'));
}

// ============================================================================
// Resolve Command
// ============================================================================

interface ResolveOptions {
  keep?: string;
}

const resolveOptions: CommandOption[] = [
  {
    name: 'keep',
    short: 'k',
    description: 'Which version to keep: local or remote',
    hasValue: true,
    required: true,
  },
];

async function resolveHandler(
  args: string[],
  options: GlobalOptions & ResolveOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      'Usage: sf external-sync resolve <elementId> --keep local|remote',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [elementId] = args;
  const keep = options.keep;

  if (!keep || (keep !== 'local' && keep !== 'remote')) {
    return failure(
      'The --keep flag is required and must be either "local" or "remote"',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Resolve element (task or document)
  let element: Task | Document | null;
  try {
    element = await api.get<Task | Document>(elementId as ElementId);
  } catch {
    return failure(`Element not found: ${elementId}`, ExitCode.NOT_FOUND);
  }

  if (!element) {
    return failure(`Element not found: ${elementId}`, ExitCode.NOT_FOUND);
  }

  if (element.type !== 'task' && element.type !== 'document') {
    return failure(`Element ${elementId} is not a task or document (type: ${(element as any).type})`, ExitCode.VALIDATION);
  }

  const elementTags = (element as Task).tags;
  if (!elementTags?.includes('sync-conflict')) {
    return failure(
      `Element ${elementId} does not have a sync conflict. Only elements tagged with "sync-conflict" can be resolved.`,
      ExitCode.VALIDATION
    );
  }

  // Remove sync-conflict tag and update metadata
  try {
    const newTags = (elementTags ?? []).filter((t) => t !== 'sync-conflict');
    const existingMetadata = (element.metadata ?? {}) as Record<string, unknown>;
    const syncMeta = (existingMetadata._externalSync ?? {}) as Record<string, unknown>;

    // Record resolution in metadata
    const updatedSyncMeta = {
      ...syncMeta,
      lastConflictResolution: {
        resolvedAt: new Date().toISOString(),
        kept: keep,
      },
    };

    // Clear conflict data from metadata
    const { _syncConflict: _, ...restMetadata } = existingMetadata;

    await api.update(elementId as ElementId, {
      tags: newTags,
      metadata: {
        ...restMetadata,
        _externalSync: updatedSyncMeta,
      },
    } as Partial<Task | Document>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to resolve conflict: ${message}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ elementId, elementType: element.type, resolved: true, kept: keep });
  }

  if (mode === 'quiet') {
    return success(elementId);
  }

  return success(
    { elementId, resolved: true, kept: keep },
    `Resolved sync conflict for ${element.type} ${elementId} (kept: ${keep})`
  );
}

// ============================================================================
// Link-All Command
// ============================================================================

interface LinkAllOptions {
  provider?: string;
  project?: string;
  status?: string | string[];
  'dry-run'?: boolean;
  'batch-size'?: string;
  force?: boolean;
  type?: string;
  /** @internal Dependency injection for testing — overrides createProviderFromSettings */
  _providerFactory?: (
    providerName: string,
    projectOverride: string | undefined,
    options: GlobalOptions
  ) => Promise<{
    provider?: ExternalProvider;
    project?: string;
    direction?: SyncDirection;
    error?: string;
  }>;
}

const linkAllOptions: CommandOption[] = [
  {
    name: 'provider',
    short: 'p',
    description: 'Provider to link to (required)',
    hasValue: true,
    required: true,
  },
  {
    name: 'project',
    description: 'Override the default project',
    hasValue: true,
  },
  {
    name: 'status',
    short: 's',
    description: 'Only link elements with this status (can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'dry-run',
    short: 'n',
    description: 'List elements that would be linked without creating external issues/pages',
  },
  {
    name: 'batch-size',
    short: 'b',
    description: 'How many elements to process concurrently (default: 10)',
    hasValue: true,
    defaultValue: '10',
  },
  {
    name: 'force',
    short: 'f',
    description: 'Re-link elements that are already linked to a different provider',
  },
  {
    name: 'type',
    short: 't',
    description: 'Element type: task or document (default: task)',
    hasValue: true,
    defaultValue: 'task',
  },
];

/**
 * Helper to detect rate limit errors from GitHub or Linear providers.
 * Returns the reset timestamp (epoch seconds) if available, or undefined.
 */
function isRateLimitError(err: unknown): { isRateLimit: boolean; resetAt?: number } {
  // Try GitHub error shape
  if (
    err &&
    typeof err === 'object' &&
    'isRateLimited' in err &&
    (err as { isRateLimited: boolean }).isRateLimited
  ) {
    const rateLimit = (err as { rateLimit?: { reset?: number } | null }).rateLimit;
    return { isRateLimit: true, resetAt: rateLimit?.reset };
  }
  // Also check error message for rate limit keywords
  if (err instanceof Error && /rate.limit/i.test(err.message)) {
    return { isRateLimit: true };
  }
  return { isRateLimit: false };
}

/**
 * Extracts validation error details from a GitHub API error response.
 * GitHub's 422 responses include an `errors` array with `resource`, `field`,
 * `code`, and sometimes `value` or `message` entries.
 *
 * Example output: "invalid label: sf:priority:high"
 */
function extractValidationDetail(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;

  const responseBody = (err as { responseBody?: Record<string, unknown> | null }).responseBody;
  if (!responseBody || !Array.isArray(responseBody.errors)) return null;

  const details = (responseBody.errors as Array<Record<string, unknown>>)
    .map((e) => {
      const parts: string[] = [];
      if (e.code && typeof e.code === 'string') parts.push(e.code);
      if (e.field && typeof e.field === 'string') parts.push(e.field as string);
      if (e.value !== undefined) parts.push(String(e.value));
      if (e.message && typeof e.message === 'string') parts.push(e.message as string);
      return parts.join(': ');
    })
    .filter(Boolean);

  return details.length > 0 ? details.join('; ') : null;
}

/**
 * Creates an ExternalProvider instance from settings for the given provider name.
 * Returns the provider, project, and direction, or an error message.
 */
async function createProviderFromSettings(
  providerName: string,
  projectOverride: string | undefined,
  options: GlobalOptions
): Promise<{
  provider?: ExternalProvider;
  project?: string;
  direction?: SyncDirection;
  error?: string;
}> {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return { error: 'No database found. Run "sf init" to initialize a workspace, or specify --db path' };
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);

    // Dynamic import to handle optional peer dependency
    const { createSettingsService } = await import('@stoneforge/smithy/services');
    const settingsService = createSettingsService(backend) as {
      getProviderConfig(provider: string): { provider: string; token?: string; apiBaseUrl?: string; defaultProject?: string } | undefined;
    };

    const providerConfig = settingsService.getProviderConfig(providerName);
    const isTokenless = TOKENLESS_PROVIDERS.has(providerName);

    // Token-free providers (e.g., folder) only need a config entry — no token required.
    // All other providers require both a config entry and a token.
    if (!providerConfig) {
      if (isTokenless) {
        return { error: `Provider "${providerName}" is not configured. Run "sf external-sync config set-project ${providerName} <path>" first.` };
      }
      return { error: `Provider "${providerName}" has no token configured. Run "sf external-sync config set-token ${providerName} <token>" first.` };
    }
    if (!isTokenless && !providerConfig.token) {
      return { error: `Provider "${providerName}" has no token configured. Run "sf external-sync config set-token ${providerName} <token>" first.` };
    }

    const project = projectOverride ?? providerConfig?.defaultProject;
    if (!project) {
      return { error: `No project specified and provider "${providerName}" has no default project configured. Use --project or run "sf external-sync config set-project ${providerName} <project>" first.` };
    }

    let provider: ExternalProvider;

    // Token is guaranteed non-undefined for non-tokenless providers (validated above)
    if (providerName === 'github') {
      const { createGitHubProvider } = await import('../../external-sync/providers/github/index.js');
      provider = createGitHubProvider({
        provider: 'github',
        token: providerConfig.token!,
        apiBaseUrl: providerConfig.apiBaseUrl,
        defaultProject: project,
      });
    } else if (providerName === 'linear') {
      const { createLinearProvider } = await import('../../external-sync/providers/linear/index.js');
      provider = createLinearProvider({
        apiKey: providerConfig.token!,
      });
    } else if (providerName === 'notion') {
      const { createNotionProvider } = await import('../../external-sync/providers/notion/index.js');
      provider = createNotionProvider({
        token: providerConfig.token!,
      });
    } else if (providerName === 'folder') {
      const { createFolderProvider } = await import('../../external-sync/providers/folder/index.js');
      provider = createFolderProvider();
    } else {
      return { error: `Unsupported provider: "${providerName}". Supported providers: github, linear, notion, folder` };
    }

    const direction = (getValue('externalSync.defaultDirection') ?? 'bidirectional') as SyncDirection;

    return { provider, project, direction };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Cannot find') || message.includes('MODULE_NOT_FOUND')) {
      return { error: 'External sync requires @stoneforge/smithy package. Ensure it is installed.' };
    }
    return { error: `Failed to initialize provider: ${message}` };
  }
}

/**
 * Process a batch of tasks: create external issues and link them.
 * Uses the adapter's field mapping to include priority, taskType, and status
 * labels on the created external issues.
 */
async function processBatch(
  tasks: Task[],
  adapter: TaskSyncAdapter,
  api: ReturnType<typeof createAPI>['api'],
  providerName: string,
  project: string,
  direction: SyncDirection,
  progressLines: string[]
): Promise<{ succeeded: number; failed: number; rateLimited: boolean; resetAt?: number }> {
  let succeeded = 0;
  let failed = 0;
  let rateLimited = false;
  let resetAt: number | undefined;
  const fieldMapConfig = getFieldMapConfigForProvider(providerName);

  for (const task of tasks) {
    try {
      // Build the complete external task input using field mapping.
      // This maps priority → sf:priority:* labels, taskType → sf:type:* labels,
      // status → open/closed state, user tags → labels, and hydrates description.
      const externalInput = await taskToExternalTask(task, fieldMapConfig, api!);

      // Create the external issue with fully mapped fields
      const externalTask = await adapter.createIssue(project, externalInput);

      // Build the ExternalSyncState metadata
      const syncState: ExternalSyncState = {
        provider: providerName,
        project,
        externalId: externalTask.externalId,
        url: externalTask.url,
        direction,
        adapterType: 'task',
      };

      // Update the task with externalRef and _externalSync metadata
      const existingMetadata = (task.metadata ?? {}) as Record<string, unknown>;
      await api!.update<Task>(task.id as unknown as ElementId, {
        externalRef: externalTask.url,
        metadata: {
          ...existingMetadata,
          _externalSync: syncState,
        },
      } as Partial<Task>);

      progressLines.push(`Linked ${task.id} → ${externalTask.url}`);
      succeeded++;
    } catch (err) {
      // Check for rate limit errors
      const rlCheck = isRateLimitError(err);
      if (rlCheck.isRateLimit) {
        rateLimited = true;
        resetAt = rlCheck.resetAt;
        const message = err instanceof Error ? err.message : String(err);
        progressLines.push(`Rate limit hit while linking ${task.id}: ${message}`);
        // Stop processing further tasks in this batch
        break;
      }

      // Log warning and continue with next task
      const message = err instanceof Error ? err.message : String(err);
      const detail = extractValidationDetail(err);
      progressLines.push(
        detail
          ? `Failed to link ${task.id}: ${message} — ${detail}`
          : `Failed to link ${task.id}: ${message}`
      );
      failed++;
    }
  }

  return { succeeded, failed, rateLimited, resetAt };
}

/**
 * Process a batch of documents: create external pages and link them.
 */
async function processDocumentBatch(
  docs: Document[],
  adapter: DocumentSyncAdapter,
  api: ReturnType<typeof createAPI>['api'],
  providerName: string,
  project: string,
  direction: SyncDirection,
  progressLines: string[]
): Promise<{ succeeded: number; failed: number; rateLimited: boolean; resetAt?: number }> {
  let succeeded = 0;
  let failed = 0;
  let rateLimited = false;
  let resetAt: number | undefined;

  for (const doc of docs) {
    try {
      // Convert document to external document input
      const externalInput = documentToExternalDocumentInput(doc);

      // Create the external page
      const externalDoc = await adapter.createPage(project, externalInput);

      // Build the ExternalSyncState metadata
      const syncState: ExternalSyncState = {
        provider: providerName,
        project,
        externalId: externalDoc.externalId,
        url: externalDoc.url,
        direction,
        adapterType: 'document',
      };

      // Update the document with externalRef and _externalSync metadata
      const existingMetadata = (doc.metadata ?? {}) as Record<string, unknown>;
      await api!.update(doc.id as unknown as ElementId, {
        externalRef: externalDoc.url,
        metadata: {
          ...existingMetadata,
          _externalSync: syncState,
        },
      } as Partial<Document>);

      progressLines.push(`Linked ${doc.id} → ${externalDoc.url}`);
      succeeded++;
    } catch (err) {
      // Check for rate limit errors
      const rlCheck = isRateLimitError(err);
      if (rlCheck.isRateLimit) {
        rateLimited = true;
        resetAt = rlCheck.resetAt;
        const message = err instanceof Error ? err.message : String(err);
        progressLines.push(`Rate limit hit while linking ${doc.id}: ${message}`);
        break;
      }

      const message = err instanceof Error ? err.message : String(err);
      const detail = extractValidationDetail(err);
      progressLines.push(
        detail
          ? `Failed to link ${doc.id}: ${message} — ${detail}`
          : `Failed to link ${doc.id}: ${message}`
      );
      failed++;
    }
  }

  return { succeeded, failed, rateLimited, resetAt };
}

/**
 * Handle link-all for documents.
 * Queries all documents, filters out system categories and already-linked ones,
 * then creates external pages for each via the document adapter.
 */
async function linkAllDocumentsHandler(
  options: GlobalOptions & LinkAllOptions
): Promise<CommandResult> {
  const providerName = options.provider!;
  const isDryRun = options['dry-run'] ?? false;
  const force = options.force ?? false;
  const batchSize = parseInt(options['batch-size'] ?? '10', 10);
  if (isNaN(batchSize) || batchSize < 1) {
    return failure('--batch-size must be a positive integer', ExitCode.INVALID_ARGUMENTS);
  }

  // Parse status filters
  const statusFilters: string[] = [];
  if (options.status) {
    if (Array.isArray(options.status)) {
      statusFilters.push(...options.status);
    } else {
      statusFilters.push(options.status);
    }
  }

  // Get API for querying/updating documents
  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  // Query all documents
  let allDocs: Document[];
  try {
    const results = await api!.list({ type: 'document' });
    allDocs = results as Document[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list documents: ${message}`, ExitCode.GENERAL_ERROR);
  }

  // Filter out system categories (task-description, message-content)
  allDocs = allDocs.filter((doc) => !isSystemCategory(doc.category));

  // Filter documents: unlinked docs, plus (with --force) docs linked to a DIFFERENT provider
  let relinkedFromProvider: string | undefined;
  let relinkCount = 0;
  let docsToLink = allDocs.filter((doc) => {
    const metadata = (doc.metadata ?? {}) as Record<string, unknown>;
    const syncState = metadata._externalSync as ExternalSyncState | undefined;

    if (!syncState) {
      return true;
    }

    if (force && syncState.provider !== providerName) {
      relinkedFromProvider = syncState.provider;
      relinkCount++;
      return true;
    }

    return false;
  });

  // Apply status filter if specified (documents use 'active'/'archived')
  if (statusFilters.length > 0) {
    docsToLink = docsToLink.filter((doc) => statusFilters.includes(doc.status));
  }

  // Skip archived documents by default
  docsToLink = docsToLink.filter((doc) => doc.status !== 'archived');

  const mode = getOutputMode(options);

  if (docsToLink.length === 0) {
    const result = { linked: 0, failed: 0, skipped: 0, total: 0, dryRun: isDryRun, type: 'document' };
    if (mode === 'json') {
      return success(result);
    }
    const hint = force
      ? 'No documents found to re-link matching the specified criteria.'
      : 'No unlinked documents found. Use --force to re-link documents from a different provider.';
    return success(result, hint);
  }

  // Dry run — just list documents that would be linked
  if (isDryRun) {
    const docList = docsToLink.map((d) => ({
      id: d.id,
      title: d.title ?? '(untitled)',
      status: d.status,
      category: d.category,
    }));

    const jsonResult: Record<string, unknown> = {
      dryRun: true,
      provider: providerName,
      type: 'document',
      total: docsToLink.length,
      documents: docList,
    };
    if (force && relinkCount > 0) {
      jsonResult.force = true;
      jsonResult.relinkCount = relinkCount;
      jsonResult.relinkFromProvider = relinkedFromProvider;
    }

    if (mode === 'json') {
      return success(jsonResult);
    }

    if (mode === 'quiet') {
      return success(String(docsToLink.length));
    }

    const lines: string[] = [];
    if (force && relinkCount > 0) {
      lines.push(
        `Dry run: Re-linking ${relinkCount} document(s) from ${relinkedFromProvider} to ${providerName} (--force)`
      );
      const newCount = docsToLink.length - relinkCount;
      if (newCount > 0) {
        lines.push(`  Plus ${newCount} unlinked document(s) to link`);
      }
    } else {
      lines.push(`Dry run: ${docsToLink.length} document(s) would be linked to ${providerName}`);
    }
    lines.push('');

    for (const doc of docsToLink) {
      lines.push(`  ${doc.id}  ${doc.status.padEnd(12)} ${doc.category.padEnd(16)} ${doc.title ?? '(untitled)'}`);
    }

    return success(jsonResult, lines.join('\n'));
  }

  // Create provider for actual linking (supports DI for testing)
  const providerFactory = options._providerFactory ?? createProviderFromSettings;
  const {
    provider: externalProvider,
    project,
    direction,
    error: providerError,
  } = await providerFactory(providerName, options.project, options);

  if (providerError) {
    return failure(providerError, ExitCode.GENERAL_ERROR);
  }

  // Get the document adapter
  const docAdapter = externalProvider!.getDocumentAdapter?.();
  if (!docAdapter) {
    return failure(
      `Provider "${providerName}" does not support document sync`,
      ExitCode.GENERAL_ERROR
    );
  }

  const progressLines: string[] = [];

  // Log re-linking info when using --force
  if (force && relinkCount > 0 && mode !== 'json' && mode !== 'quiet') {
    progressLines.push(
      `Re-linking ${relinkCount} document(s) from ${relinkedFromProvider} to ${providerName} (--force)`
    );
    const newCount = docsToLink.length - relinkCount;
    if (newCount > 0) {
      progressLines.push(`Linking ${newCount} unlinked document(s)`);
    }
    progressLines.push('');
  }

  // Process documents in batches
  let totalSucceeded = 0;
  let totalFailed = 0;
  let rateLimited = false;
  let rateLimitResetAt: number | undefined;

  for (let i = 0; i < docsToLink.length; i += batchSize) {
    const batch = docsToLink.slice(i, i + batchSize);

    const batchResult = await processDocumentBatch(
      batch,
      docAdapter,
      api!,
      providerName,
      project!,
      direction!,
      progressLines
    );

    totalSucceeded += batchResult.succeeded;
    totalFailed += batchResult.failed;

    if (batchResult.rateLimited) {
      rateLimited = true;
      rateLimitResetAt = batchResult.resetAt;
      break;
    }

    if (i + batchSize < docsToLink.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const skipped = docsToLink.length - totalSucceeded - totalFailed;

  const result: Record<string, unknown> = {
    provider: providerName,
    project,
    type: 'document',
    linked: totalSucceeded,
    failed: totalFailed,
    skipped,
    total: docsToLink.length,
    rateLimited,
    rateLimitResetAt: rateLimitResetAt ? new Date(rateLimitResetAt * 1000).toISOString() : undefined,
  };
  if (force && relinkCount > 0) {
    result.force = true;
    result.relinkCount = relinkCount;
    result.relinkFromProvider = relinkedFromProvider;
  }

  if (mode === 'json') {
    return success(result);
  }

  if (mode === 'quiet') {
    return success(String(totalSucceeded));
  }

  const lines: string[] = [...progressLines, ''];
  const summaryParts = [`Linked ${totalSucceeded} documents to ${providerName}`];
  if (totalFailed > 0) {
    summaryParts.push(`(${totalFailed} failed)`);
  }
  if (skipped > 0) {
    summaryParts.push(`(${skipped} skipped)`);
  }
  lines.push(summaryParts.join(' '));

  if (rateLimited) {
    lines.push('');
    if (rateLimitResetAt) {
      const resetDate = new Date(rateLimitResetAt * 1000);
      lines.push(`Rate limit reached. Resets at ${resetDate.toISOString()}. Re-run this command after the reset to link remaining documents.`);
    } else {
      lines.push('Rate limit reached. Re-run this command later to link remaining documents.');
    }
  }

  return success(result, lines.join('\n'));
}

async function linkAllHandler(
  _args: string[],
  options: GlobalOptions & LinkAllOptions
): Promise<CommandResult> {
  const providerName = options.provider;
  if (!providerName) {
    return failure(
      'The --provider flag is required. Usage: sf external-sync link-all --provider <provider>',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const elementType = options.type ?? 'task';
  if (elementType !== 'task' && elementType !== 'document') {
    return failure(
      `Invalid --type value "${elementType}". Must be one of: task, document`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  // Document linking branch
  if (elementType === 'document') {
    return linkAllDocumentsHandler(options);
  }

  const isDryRun = options['dry-run'] ?? false;
  const force = options.force ?? false;
  const batchSize = parseInt(options['batch-size'] ?? '10', 10);
  if (isNaN(batchSize) || batchSize < 1) {
    return failure('--batch-size must be a positive integer', ExitCode.INVALID_ARGUMENTS);
  }

  // Parse status filters
  const statusFilters: string[] = [];
  if (options.status) {
    if (Array.isArray(options.status)) {
      statusFilters.push(...options.status);
    } else {
      statusFilters.push(options.status);
    }
  }

  // Get API for querying/updating tasks
  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  // Query all tasks
  let allTasks: Task[];
  try {
    const results = await api!.list({ type: 'task' });
    allTasks = results as Task[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }

  // Filter tasks: unlinked tasks, plus (with --force) tasks linked to a DIFFERENT provider
  let relinkedFromProvider: string | undefined;
  let relinkCount = 0;
  let tasksToLink = allTasks.filter((task) => {
    const metadata = (task.metadata ?? {}) as Record<string, unknown>;
    const syncState = metadata._externalSync as ExternalSyncState | undefined;

    if (!syncState) {
      // Unlinked task — always include
      return true;
    }

    if (force && syncState.provider !== providerName) {
      // Force mode: include tasks linked to a DIFFERENT provider
      relinkedFromProvider = syncState.provider;
      relinkCount++;
      return true;
    }

    // Already linked (to same provider, or force not set) — skip
    return false;
  });

  // Apply status filter if specified
  if (statusFilters.length > 0) {
    tasksToLink = tasksToLink.filter((task) => statusFilters.includes(task.status));
  }

  // Skip tombstone tasks by default (soft-deleted)
  tasksToLink = tasksToLink.filter((task) => task.status !== 'tombstone');

  const mode = getOutputMode(options);

  if (tasksToLink.length === 0) {
    const result = { linked: 0, failed: 0, skipped: 0, total: 0, dryRun: isDryRun };
    if (mode === 'json') {
      return success(result);
    }
    const hint = force
      ? 'No tasks found to re-link matching the specified criteria.'
      : 'No unlinked tasks found. Use --force to re-link tasks from a different provider.';
    return success(result, hint);
  }

  // Dry run — just list tasks that would be linked
  if (isDryRun) {
    const taskList = tasksToLink.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
    }));

    const jsonResult: Record<string, unknown> = {
      dryRun: true,
      provider: providerName,
      total: tasksToLink.length,
      tasks: taskList,
    };
    if (force && relinkCount > 0) {
      jsonResult.force = true;
      jsonResult.relinkCount = relinkCount;
      jsonResult.relinkFromProvider = relinkedFromProvider;
    }

    if (mode === 'json') {
      return success(jsonResult);
    }

    if (mode === 'quiet') {
      return success(String(tasksToLink.length));
    }

    const lines: string[] = [];
    if (force && relinkCount > 0) {
      lines.push(
        `Dry run: Re-linking ${relinkCount} task(s) from ${relinkedFromProvider} to ${providerName} (--force)`
      );
      const newCount = tasksToLink.length - relinkCount;
      if (newCount > 0) {
        lines.push(`  Plus ${newCount} unlinked task(s) to link`);
      }
    } else {
      lines.push(`Dry run: ${tasksToLink.length} task(s) would be linked to ${providerName}`);
    }
    lines.push('');

    for (const task of tasksToLink) {
      lines.push(`  ${task.id}  ${task.status.padEnd(12)} ${task.title}`);
    }

    return success(jsonResult, lines.join('\n'));
  }

  // Create provider for actual linking (supports DI for testing)
  const providerFactory = options._providerFactory ?? createProviderFromSettings;
  const {
    provider: externalProvider,
    project,
    direction,
    error: providerError,
  } = await providerFactory(providerName, options.project, options);

  if (providerError) {
    return failure(providerError, ExitCode.GENERAL_ERROR);
  }

  // Get the task adapter
  const adapter = externalProvider!.getTaskAdapter?.();
  if (!adapter) {
    return failure(
      `Provider "${providerName}" does not support task sync`,
      ExitCode.GENERAL_ERROR
    );
  }

  const progressLines: string[] = [];

  // Log re-linking info when using --force
  if (force && relinkCount > 0 && mode !== 'json' && mode !== 'quiet') {
    progressLines.push(
      `Re-linking ${relinkCount} task(s) from ${relinkedFromProvider} to ${providerName} (--force)`
    );
    const newCount = tasksToLink.length - relinkCount;
    if (newCount > 0) {
      progressLines.push(`Linking ${newCount} unlinked task(s)`);
    }
    progressLines.push('');
  }

  // Process tasks in batches
  let totalSucceeded = 0;
  let totalFailed = 0;
  let rateLimited = false;
  let rateLimitResetAt: number | undefined;

  for (let i = 0; i < tasksToLink.length; i += batchSize) {
    const batch = tasksToLink.slice(i, i + batchSize);

    const batchResult = await processBatch(
      batch,
      adapter,
      api!,
      providerName,
      project!,
      direction!,
      progressLines
    );

    totalSucceeded += batchResult.succeeded;
    totalFailed += batchResult.failed;

    if (batchResult.rateLimited) {
      rateLimited = true;
      rateLimitResetAt = batchResult.resetAt;
      break;
    }

    // Small delay between batches to be gentle on the API
    if (i + batchSize < tasksToLink.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const skipped = tasksToLink.length - totalSucceeded - totalFailed;

  // Build result
  const result: Record<string, unknown> = {
    provider: providerName,
    project,
    linked: totalSucceeded,
    failed: totalFailed,
    skipped,
    total: tasksToLink.length,
    rateLimited,
    rateLimitResetAt: rateLimitResetAt ? new Date(rateLimitResetAt * 1000).toISOString() : undefined,
  };
  if (force && relinkCount > 0) {
    result.force = true;
    result.relinkCount = relinkCount;
    result.relinkFromProvider = relinkedFromProvider;
  }

  if (mode === 'json') {
    return success(result);
  }

  if (mode === 'quiet') {
    return success(String(totalSucceeded));
  }

  // Human-readable output
  const lines: string[] = [...progressLines, ''];

  // Summary
  const summaryParts = [`Linked ${totalSucceeded} tasks to ${providerName}`];
  if (totalFailed > 0) {
    summaryParts.push(`(${totalFailed} failed)`);
  }
  if (skipped > 0) {
    summaryParts.push(`(${skipped} skipped)`);
  }
  lines.push(summaryParts.join(' '));

  if (rateLimited) {
    lines.push('');
    if (rateLimitResetAt) {
      const resetDate = new Date(rateLimitResetAt * 1000);
      lines.push(`Rate limit reached. Resets at ${resetDate.toISOString()}. Re-run this command after the reset to link remaining tasks.`);
    } else {
      lines.push('Rate limit reached. Re-run this command later to link remaining tasks.');
    }
  }

  return success(result, lines.join('\n'));
}

// ============================================================================
// Config Parent Command (for subcommand structure)
// ============================================================================

const configSetTokenCommand: Command = {
  name: 'set-token',
  description: 'Set authentication token for a provider',
  usage: 'sf external-sync config set-token <provider> <token>',
  help: `Store an authentication token for an external sync provider.

The token is stored in the local SQLite database (not git-tracked).

Arguments:
  provider    Provider name (e.g., github, linear)
  token       Authentication token

Examples:
  sf external-sync config set-token github ghp_xxxxxxxxxxxx
  sf external-sync config set-token linear lin_api_xxxxxxxxxxxx`,
  options: [],
  handler: configSetTokenHandler as Command['handler'],
};

const configSetProjectCommand: Command = {
  name: 'set-project',
  description: 'Set default project for a provider',
  usage: 'sf external-sync config set-project <provider> <project>',
  help: `Set the default project (e.g., owner/repo) for an external sync provider.

This is used when linking tasks with bare issue numbers.

Arguments:
  provider    Provider name (e.g., github, linear)
  project     Project identifier (e.g., owner/repo for GitHub)

Examples:
  sf external-sync config set-project github my-org/my-repo
  sf external-sync config set-project linear MY-PROJECT`,
  options: [],
  handler: configSetProjectHandler as Command['handler'],
};

const autoLinkTypeOption: CommandOption = {
  name: 'type',
  short: 't',
  description: 'Type of auto-link: task or document (default: task)',
  hasValue: true,
};

const configSetAutoLinkCommand: Command = {
  name: 'set-auto-link',
  description: 'Enable auto-link with a provider',
  usage: 'sf external-sync config set-auto-link <provider> [--type task|document]',
  help: `Enable auto-link for new elements with the specified provider.

When auto-link is enabled, newly created Stoneforge elements will automatically
get a corresponding external issue or page created and linked.

Use --type to specify whether to configure task or document auto-linking.
Defaults to task for backwards compatibility.

Arguments:
  provider    Provider name (github, linear, notion, or folder)

Options:
  --type, -t  Type of auto-link: task or document (default: task)

Examples:
  sf external-sync config set-auto-link github
  sf external-sync config set-auto-link linear
  sf external-sync config set-auto-link --type document folder
  sf external-sync config set-auto-link --type document notion`,
  options: [autoLinkTypeOption],
  handler: configSetAutoLinkHandler as Command['handler'],
};

const disableAutoLinkTypeOption: CommandOption = {
  name: 'type',
  short: 't',
  description: 'Type of auto-link to disable: task, document, or all (default: all)',
  hasValue: true,
};

const configDisableAutoLinkCommand: Command = {
  name: 'disable-auto-link',
  description: 'Disable auto-link',
  usage: 'sf external-sync config disable-auto-link [--type task|document|all]',
  help: `Disable auto-link for new elements.

Clears the auto-link provider and disables automatic external creation.

Use --type to specify which auto-link to disable:
  task      Only disable task auto-link
  document  Only disable document auto-link
  all       Disable both task and document auto-link (default)

Options:
  --type, -t  Type of auto-link to disable: task, document, or all (default: all)

Examples:
  sf external-sync config disable-auto-link
  sf external-sync config disable-auto-link --type task
  sf external-sync config disable-auto-link --type document`,
  options: [disableAutoLinkTypeOption],
  handler: configDisableAutoLinkHandler as Command['handler'],
};

const configParentCommand: Command = {
  name: 'config',
  description: 'Show or set provider configuration',
  usage: 'sf external-sync config [set-token|set-project|set-auto-link|disable-auto-link]',
  help: `Show current external sync provider configuration.

Tokens are masked in output for security.

Subcommands:
  set-token <provider> <token>     Store auth token
  set-project <provider> <project> Set default project
  set-auto-link <provider> [--type task|document]  Enable auto-link with a provider
  disable-auto-link [--type task|document|all]     Disable auto-link

Examples:
  sf external-sync config
  sf external-sync config set-token github ghp_xxxxxxxxxxxx
  sf external-sync config set-project github my-org/my-repo
  sf external-sync config set-auto-link github
  sf external-sync config set-auto-link --type document folder
  sf external-sync config disable-auto-link
  sf external-sync config disable-auto-link --type document`,
  subcommands: {
    'set-token': configSetTokenCommand,
    'set-project': configSetProjectCommand,
    'set-auto-link': configSetAutoLinkCommand,
    'disable-auto-link': configDisableAutoLinkCommand,
  },
  options: [],
  handler: configHandler as Command['handler'],
};

// ============================================================================
// Link Parent Command
// ============================================================================

const linkCommand: Command = {
  name: 'link',
  description: 'Link a task or document to an external issue/page',
  usage: 'sf external-sync link <elementId> <url-or-external-id> [--type task|document] [--provider <name>]',
  help: `Link a Stoneforge element (task or document) to an external issue or page.

Sets the element's externalRef and _externalSync metadata. If given a bare
issue number, constructs the URL from the provider's default project.

Use --type document to link a document element (default: task).

Arguments:
  elementId        Stoneforge element ID (task or document)
  url-or-id        Full URL, bare issue number, or external ID

Options:
  -p, --provider   Provider name (default: github)
  -t, --type       Element type: task or document (default: task)

Examples:
  sf external-sync link el-abc123 https://github.com/org/repo/issues/42
  sf external-sync link el-abc123 42
  sf external-sync link el-abc123 42 --provider github
  sf external-sync link el-doc456 https://notion.so/page-id --type document --provider notion`,
  options: linkOptions,
  handler: linkHandler as Command['handler'],
};

// ============================================================================
// Link-All Command
// ============================================================================

const linkAllCommand: Command = {
  name: 'link-all',
  description: 'Bulk-link all unlinked tasks or documents to external issues/pages',
  usage: 'sf external-sync link-all --provider <provider> [--type task|document] [--project <project>] [--status <status>] [--dry-run] [--batch-size <n>] [--force]',
  help: `Create external issues/pages for all unlinked elements and link them in bulk.

Finds all tasks (or documents with --type document) that do NOT have
external sync metadata and creates a corresponding external issue or
page for each one, then links them.

Use --type document to link documents instead of tasks. When linking
documents, system categories (task-description, message-content) are
automatically excluded.

Use --force to re-link elements that are already linked to a different provider.
Elements linked to the same target provider are always skipped.

Options:
  -p, --provider <name>    Provider to link to (required)
  -t, --type <type>        Element type: task or document (default: task)
      --project <project>  Override the default project
  -s, --status <status>    Only link elements with this status (can be repeated)
  -n, --dry-run            List elements that would be linked without creating issues/pages
  -b, --batch-size <n>     Elements to process concurrently (default: 10)
  -f, --force              Re-link elements already linked to a different provider

Rate Limits:
  If a rate limit is hit, the command stops gracefully and reports how
  many elements were linked. Re-run the command to continue linking.

Examples:
  sf external-sync link-all --provider github
  sf external-sync link-all --provider github --status open
  sf external-sync link-all --provider github --status open --status in_progress
  sf external-sync link-all --provider github --dry-run
  sf external-sync link-all --provider github --project my-org/my-repo
  sf external-sync link-all --provider linear --batch-size 5
  sf external-sync link-all --provider linear --force
  sf external-sync link-all --provider notion --type document
  sf external-sync link-all --provider notion --type document --dry-run`,
  options: linkAllOptions,
  handler: linkAllHandler as Command['handler'],
};

// ============================================================================
// Unlink Command
// ============================================================================

const unlinkCommand: Command = {
  name: 'unlink',
  description: 'Remove external link from a task or document',
  usage: 'sf external-sync unlink <elementId>',
  help: `Remove the external link from a Stoneforge task or document.

Clears the element's externalRef field and _externalSync metadata.
Works with both tasks and documents.

Arguments:
  elementId    Stoneforge element ID (task or document)

Examples:
  sf external-sync unlink el-abc123`,
  options: [],
  handler: unlinkHandler as Command['handler'],
};

// ============================================================================
// Push Command
// ============================================================================

const pushCommand: Command = {
  name: 'push',
  description: 'Push linked elements to external service',
  usage: 'sf external-sync push [elementId...] [--all] [--force] [--type task|document|all]',
  help: `Push specific linked elements to their external service, or push all linked elements.

If specific element IDs are given, pushes only those elements. With --all,
pushes every element that has an external link.

Use --force to push all linked elements regardless of whether their local
content has changed. This is useful when label generation logic changes
and the external representation needs to be refreshed.

Use --type to filter by element type (task, document, or all). Default: all.

Arguments:
  elementId...     One or more element IDs to push (optional with --all)

Options:
  -a, --all                Push all linked elements
  -f, --force              Push all linked elements regardless of whether they have changed
  -t, --type <type>        Element type to push: task, document, or all (default: all)

Examples:
  sf external-sync push el-abc123
  sf external-sync push el-abc123 el-def456
  sf external-sync push --all
  sf external-sync push --all --force
  sf external-sync push --all --type document
  sf external-sync push --all --type task
  sf external-sync push el-abc123 --force`,
  options: pushOptions,
  handler: pushHandler as Command['handler'],
};

// ============================================================================
// Pull Command
// ============================================================================

const pullCommand: Command = {
  name: 'pull',
  description: 'Pull changes from external for linked elements',
  usage: 'sf external-sync pull [--provider <name>] [--discover] [--type task|document|all]',
  help: `Pull changes from external services for all linked elements (tasks and documents).

Optionally discover new issues not yet linked to Stoneforge elements.

Use --type to filter by element type (task, document, or all). Default: all.

Options:
  -p, --provider <name>   Pull from specific provider (default: all configured)
  -d, --discover          Discover new unlinked issues
  -t, --type <type>       Element type to pull: task, document, or all (default: all)

Examples:
  sf external-sync pull
  sf external-sync pull --provider github
  sf external-sync pull --discover
  sf external-sync pull --type document
  sf external-sync pull --type task --provider notion`,
  options: pullOptions,
  handler: pullHandler as Command['handler'],
};

// ============================================================================
// Sync Command
// ============================================================================

const biSyncCommand: Command = {
  name: 'sync',
  description: 'Bidirectional sync with external services',
  usage: 'sf external-sync sync [--dry-run] [--type task|document|all]',
  help: `Run bidirectional sync between Stoneforge and external services.

Performs both push and pull operations for tasks and documents.
In dry-run mode, reports what would change without making any modifications.

Use --type to filter by element type (task, document, or all). Default: all.

Options:
  -n, --dry-run            Show what would change without making changes
  -t, --type <type>        Element type to sync: task, document, or all (default: all)

Examples:
  sf external-sync sync
  sf external-sync sync --dry-run
  sf external-sync sync --type document
  sf external-sync sync --type task`,
  options: syncOptions,
  handler: syncHandler as Command['handler'],
};

// ============================================================================
// Status Command
// ============================================================================

const extStatusCommand: Command = {
  name: 'status',
  description: 'Show external sync state',
  usage: 'sf external-sync status',
  help: `Show the current external sync state.

Displays linked task and document counts, last sync times, configured
providers, and pending conflicts.

Examples:
  sf external-sync status
  sf external-sync status --json`,
  options: [],
  handler: statusHandler as Command['handler'],
};

// ============================================================================
// Resolve Command
// ============================================================================

const resolveCommand: Command = {
  name: 'resolve',
  description: 'Resolve a sync conflict',
  usage: 'sf external-sync resolve <elementId> --keep local|remote',
  help: `Resolve a sync conflict by choosing which version to keep.

Elements (tasks or documents) with sync conflicts are tagged with "sync-conflict".
This command resolves the conflict by keeping either the local or remote version.

Arguments:
  elementId    Element ID with a sync conflict (task or document)

Options:
  -k, --keep <version>   Which version to keep: local or remote (required)

Examples:
  sf external-sync resolve el-abc123 --keep local
  sf external-sync resolve el-abc123 --keep remote`,
  options: resolveOptions,
  handler: resolveHandler as Command['handler'],
};

// ============================================================================
// External Sync Parent Command
// ============================================================================

export const externalSyncCommand: Command = {
  name: 'external-sync',
  description: 'External service sync commands',
  usage: 'sf external-sync <command> [options]',
  help: `Manage bidirectional synchronization between Stoneforge and external services
(GitHub Issues, Linear, etc.).

Commands:
  config                              Show provider configuration
  config set-token <provider> <token> Store auth token
  config set-project <provider> <project> Set default project
  config set-auto-link <provider> [--type task|document]  Enable auto-link
  config disable-auto-link [--type task|document|all]   Disable auto-link
  link <taskId> <url-or-issue-number> Link task to external issue
  link-all --provider <name>          Bulk-link all unlinked tasks
  unlink <taskId>                     Remove external link
  push [taskId...] [--force]           Push linked task(s) to external
  pull                                Pull changes from external
  sync [--dry-run]                    Bidirectional sync
  status                              Show sync state
  resolve <taskId> --keep local|remote Resolve sync conflict

Examples:
  sf external-sync config
  sf external-sync config set-token github ghp_xxxxxxxxxxxx
  sf external-sync config set-project github my-org/my-repo
  sf external-sync config set-auto-link github
  sf external-sync config set-auto-link --type document folder
  sf external-sync config disable-auto-link
  sf external-sync config disable-auto-link --type document
  sf external-sync link el-abc123 42
  sf external-sync link-all --provider github
  sf external-sync link-all --provider github --dry-run
  sf external-sync push --all
  sf external-sync push --all --force
  sf external-sync pull
  sf external-sync sync --dry-run
  sf external-sync status
  sf external-sync resolve el-abc123 --keep local`,
  subcommands: {
    config: configParentCommand,
    link: linkCommand,
    'link-all': linkAllCommand,
    unlink: unlinkCommand,
    push: pushCommand,
    pull: pullCommand,
    sync: biSyncCommand,
    status: extStatusCommand,
    resolve: resolveCommand,
  },
  handler: async (_args, options) => {
    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({
        commands: ['config', 'link', 'link-all', 'unlink', 'push', 'pull', 'sync', 'status', 'resolve'],
      });
    }
    return failure(
      'Usage: sf external-sync <command>\n\nCommands: config, link, link-all, unlink, push, pull, sync, status, resolve\n\nRun "sf external-sync --help" for more information.',
      ExitCode.INVALID_ARGUMENTS
    );
  },
};
