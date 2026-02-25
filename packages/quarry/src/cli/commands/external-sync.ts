/**
 * External Sync Commands - Manage bidirectional sync with external services
 *
 * Provides CLI commands for external service synchronization:
 * - config: Show/set provider configuration (tokens, projects)
 * - link: Link a task to an external issue
 * - link-all: Bulk-link all unlinked tasks to external issues
 * - unlink: Remove external link from a task
 * - push: Push linked tasks to external service
 * - pull: Pull changes from external for linked tasks
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
import type { Task, ElementId, ExternalProvider, ExternalSyncState, SyncDirection } from '@stoneforge/core';

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

  const configData = {
    enabled,
    conflictStrategy,
    defaultDirection,
    pollInterval,
    autoLink,
    autoLinkProvider,
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
    `  Auto-link provider: ${autoLinkProvider ?? '(not set)'}`,
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
      'Usage: sf external-sync config set-auto-link <provider>',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [provider] = args;

  // Validate provider name
  if (!VALID_AUTO_LINK_PROVIDERS.includes(provider)) {
    return failure(
      `Invalid provider "${provider}". Must be one of: ${VALID_AUTO_LINK_PROVIDERS.join(', ')}`,
      ExitCode.VALIDATION
    );
  }

  // Check if provider has a token configured
  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  let tokenWarning: string | undefined;
  if (!settingsError) {
    const providerConfig = settingsService.getProviderConfig(provider);
    if (!providerConfig?.token) {
      tokenWarning = `Warning: Provider "${provider}" has no token configured. Auto-link will not work until a token is set. Run "sf external-sync config set-token ${provider} <token>".`;
    }
  }

  // Set both autoLink and autoLinkProvider
  setValue('externalSync.autoLink', true);
  setValue('externalSync.autoLinkProvider', provider);

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ autoLink: true, autoLinkProvider: provider, warning: tokenWarning });
  }

  if (mode === 'quiet') {
    return success(provider);
  }

  const lines = [`Auto-link enabled with provider "${provider}".`];
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
  // Set autoLink to false and clear autoLinkProvider
  setValue('externalSync.autoLink', false);
  setValue('externalSync.autoLinkProvider', undefined);

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ autoLink: false, autoLinkProvider: null });
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
}

const linkOptions: CommandOption[] = [
  {
    name: 'provider',
    short: 'p',
    description: 'Provider name (default: github)',
    hasValue: true,
  },
];

async function linkHandler(
  args: string[],
  options: GlobalOptions & LinkOptions
): Promise<CommandResult> {
  if (args.length < 2) {
    return failure(
      'Usage: sf external-sync link <taskId> <url-or-issue-number>',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [taskId, urlOrNumber] = args;
  const provider = options.provider ?? 'github';

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Resolve task
  let task: Task | null;
  try {
    task = await api.get<Task>(taskId as ElementId);
  } catch {
    return failure(`Task not found: ${taskId}`, ExitCode.NOT_FOUND);
  }

  if (!task) {
    return failure(`Task not found: ${taskId}`, ExitCode.NOT_FOUND);
  }

  if (task.type !== 'task') {
    return failure(`Element ${taskId} is not a task (type: ${task.type})`, ExitCode.VALIDATION);
  }

  // Determine the external URL
  let externalUrl: string;
  let externalId: string;

  if (/^\d+$/.test(urlOrNumber)) {
    // Bare number — construct URL from default project
    const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
    if (settingsError) {
      return failure(settingsError, ExitCode.GENERAL_ERROR);
    }

    const providerConfig = settingsService.getProviderConfig(provider);
    if (!providerConfig?.defaultProject) {
      return failure(
        `No default project configured for provider "${provider}". ` +
        `Run "sf external-sync config set-project ${provider} <owner/repo>" first, ` +
        `or provide a full URL.`,
        ExitCode.VALIDATION
      );
    }

    externalId = urlOrNumber;
    if (provider === 'github') {
      const baseUrl = providerConfig.apiBaseUrl
        ? providerConfig.apiBaseUrl.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '')
        : 'https://github.com';
      externalUrl = `${baseUrl}/${providerConfig.defaultProject}/issues/${urlOrNumber}`;
    } else {
      // Generic URL construction for other providers
      externalUrl = `${providerConfig.defaultProject}#${urlOrNumber}`;
    }
  } else {
    // Full URL provided
    externalUrl = urlOrNumber;
    // Extract issue number from URL
    const match = urlOrNumber.match(/\/(\d+)\/?$/);
    externalId = match ? match[1] : urlOrNumber;
  }

  // Extract project from URL if possible
  let project: string | undefined;
  const ghMatch = externalUrl.match(/github\.com\/([^/]+\/[^/]+)\//);
  if (ghMatch) {
    project = ghMatch[1];
  }

  // Update task with externalRef and _externalSync metadata
  const syncMetadata = {
    provider,
    project: project ?? '',
    externalId,
    url: externalUrl,
    direction: getValue('externalSync.defaultDirection'),
    adapterType: 'task' as const,
  };

  try {
    const existingMetadata = (task.metadata ?? {}) as Record<string, unknown>;
    await api.update<Task>(taskId as ElementId, {
      externalRef: externalUrl,
      metadata: {
        ...existingMetadata,
        _externalSync: syncMetadata,
      },
    } as Partial<Task>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to update task: ${message}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ taskId, externalUrl, provider, externalId, project });
  }

  if (mode === 'quiet') {
    return success(externalUrl);
  }

  return success(
    { taskId, externalUrl, provider, externalId },
    `Linked task ${taskId} to ${externalUrl}`
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
      'Usage: sf external-sync unlink <taskId>',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [taskId] = args;

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Resolve task
  let task: Task | null;
  try {
    task = await api.get<Task>(taskId as ElementId);
  } catch {
    return failure(`Task not found: ${taskId}`, ExitCode.NOT_FOUND);
  }

  if (!task) {
    return failure(`Task not found: ${taskId}`, ExitCode.NOT_FOUND);
  }

  if (task.type !== 'task') {
    return failure(`Element ${taskId} is not a task (type: ${task.type})`, ExitCode.VALIDATION);
  }

  if (!task.externalRef) {
    return failure(`Task ${taskId} is not linked to an external issue`, ExitCode.VALIDATION);
  }

  // Clear externalRef and _externalSync metadata
  try {
    const existingMetadata = (task.metadata ?? {}) as Record<string, unknown>;
    const { _externalSync: _, ...restMetadata } = existingMetadata;
    await api.update<Task>(taskId as ElementId, {
      externalRef: undefined,
      metadata: restMetadata,
    } as Partial<Task>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to update task: ${message}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ taskId, unlinked: true });
  }

  if (mode === 'quiet') {
    return success(taskId);
  }

  return success(
    { taskId, unlinked: true },
    `Unlinked task ${taskId} from external issue`
  );
}

// ============================================================================
// Push Command
// ============================================================================

interface PushOptions {
  all?: boolean;
}

const pushOptions: CommandOption[] = [
  {
    name: 'all',
    short: 'a',
    description: 'Push all linked tasks',
  },
];

async function pushHandler(
  args: string[],
  options: GlobalOptions & PushOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Find tasks to push
  let taskIds: string[];

  if (options.all) {
    // Find all tasks with _externalSync metadata
    try {
      const allTasks = await api.list({ type: 'task' });
      taskIds = allTasks
        .filter((t) => {
          const task = t as Task;
          return task.externalRef && (task.metadata as Record<string, unknown>)?._externalSync;
        })
        .map((t) => t.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(`Failed to list tasks: ${message}`, ExitCode.GENERAL_ERROR);
    }
  } else if (args.length > 0) {
    taskIds = args;
  } else {
    return failure(
      'Usage: sf external-sync push [taskId...] or sf external-sync push --all',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  if (taskIds.length === 0) {
    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ pushed: 0, tasks: [] });
    }
    return success({ pushed: 0 }, 'No linked tasks found to push.');
  }

  // Validate tasks are linked
  const linkedTasks: Array<{ id: string; externalRef: string; syncMeta: Record<string, unknown> }> = [];
  const errors: string[] = [];

  for (const taskId of taskIds) {
    try {
      const task = await api.get<Task>(taskId as ElementId);
      if (!task) {
        errors.push(`${taskId}: not found`);
        continue;
      }
      if (!task.externalRef || !(task.metadata as Record<string, unknown>)?._externalSync) {
        errors.push(`${taskId}: not linked to external issue`);
        continue;
      }
      linkedTasks.push({
        id: task.id,
        externalRef: task.externalRef,
        syncMeta: (task.metadata as Record<string, unknown>)._externalSync as Record<string, unknown>,
      });
    } catch {
      errors.push(`${taskId}: not found`);
    }
  }

  const mode = getOutputMode(options);
  const result = {
    pushed: linkedTasks.length,
    skipped: errors.length,
    tasks: linkedTasks.map((t) => ({ id: t.id, externalRef: t.externalRef })),
    errors,
  };

  if (mode === 'json') {
    return success(result);
  }

  if (mode === 'quiet') {
    return success(String(linkedTasks.length));
  }

  const lines: string[] = [
    `Push: ${linkedTasks.length} task(s) queued for push`,
    '',
  ];

  for (const task of linkedTasks) {
    lines.push(`  ${task.id} → ${task.externalRef}`);
  }

  if (errors.length > 0) {
    lines.push('');
    lines.push(`Skipped (${errors.length}):`);
    for (const err of errors) {
      lines.push(`  ${err}`);
    }
  }

  lines.push('');
  lines.push('Note: Push requires a running sync daemon or server. Tasks have been validated and are ready for sync.');

  return success(result, lines.join('\n'));
}

// ============================================================================
// Pull Command
// ============================================================================

interface PullOptions {
  provider?: string;
  discover?: boolean;
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
];

async function pullHandler(
  _args: string[],
  options: GlobalOptions & PullOptions
): Promise<CommandResult> {
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

  // Validate providers have tokens
  const validProviders: string[] = [];
  const invalidProviders: string[] = [];

  for (const name of providerNames) {
    const config = settings.providers[name];
    if (config?.token) {
      validProviders.push(name);
    } else {
      invalidProviders.push(name);
    }
  }

  const mode = getOutputMode(options);
  const result = {
    providers: validProviders,
    discover: options.discover ?? false,
    message: 'Pull requires a running sync daemon or server.',
    invalidProviders,
  };

  if (mode === 'json') {
    return success(result);
  }

  if (mode === 'quiet') {
    return success(validProviders.join(','));
  }

  const lines: string[] = [
    `Pull: ${validProviders.length} provider(s) ready`,
    '',
  ];

  for (const name of validProviders) {
    const config = settings.providers[name];
    lines.push(`  ${name}: ${config.defaultProject ?? '(no default project)'}`);
  }

  if (invalidProviders.length > 0) {
    lines.push('');
    lines.push(`Skipped (no token): ${invalidProviders.join(', ')}`);
  }

  if (options.discover) {
    lines.push('');
    lines.push('Discovery mode: will look for new unlinked issues.');
  }

  lines.push('');
  lines.push('Note: Pull requires a running sync daemon or server to execute the actual sync.');

  return success(result, lines.join('\n'));
}

// ============================================================================
// Sync Command (bidirectional)
// ============================================================================

interface SyncOptions {
  'dry-run'?: boolean;
}

const syncOptions: CommandOption[] = [
  {
    name: 'dry-run',
    short: 'n',
    description: 'Show what would change without making changes',
  },
];

async function syncHandler(
  _args: string[],
  options: GlobalOptions & SyncOptions
): Promise<CommandResult> {
  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  if (settingsError) {
    return failure(settingsError, ExitCode.GENERAL_ERROR);
  }

  const settings = settingsService.getExternalSyncSettings();
  const isDryRun = options['dry-run'] ?? false;

  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  // Get linked tasks
  let linkedTasks: Array<{ id: string; externalRef: string; provider: string }> = [];
  try {
    const allTasks = await api.list({ type: 'task' });
    linkedTasks = allTasks
      .filter((t) => {
        const task = t as Task;
        return task.externalRef && (task.metadata as Record<string, unknown>)?._externalSync;
      })
      .map((t) => {
        const task = t as Task;
        const syncMeta = (task.metadata as Record<string, unknown>)?._externalSync as Record<string, unknown>;
        return {
          id: task.id,
          externalRef: task.externalRef!,
          provider: (syncMeta?.provider as string) ?? 'unknown',
        };
      });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }

  const configuredProviders = Object.keys(settings.providers).filter(
    (name) => settings.providers[name]?.token
  );

  const mode = getOutputMode(options);
  const result = {
    dryRun: isDryRun,
    linkedTaskCount: linkedTasks.length,
    configuredProviders,
    tasks: linkedTasks,
  };

  if (mode === 'json') {
    return success(result);
  }

  if (mode === 'quiet') {
    return success(String(linkedTasks.length));
  }

  const lines: string[] = [
    isDryRun ? 'Sync (dry run) - no changes will be made' : 'Bidirectional Sync',
    '',
    `  Configured providers: ${configuredProviders.length > 0 ? configuredProviders.join(', ') : '(none)'}`,
    `  Linked tasks:         ${linkedTasks.length}`,
    '',
  ];

  if (linkedTasks.length > 0) {
    lines.push('  Tasks:');
    for (const task of linkedTasks.slice(0, 20)) {
      lines.push(`    ${task.id} ↔ ${task.externalRef} (${task.provider})`);
    }
    if (linkedTasks.length > 20) {
      lines.push(`    ... and ${linkedTasks.length - 20} more`);
    }
  }

  if (configuredProviders.length === 0) {
    lines.push('');
    lines.push('No providers configured. Run "sf external-sync config set-token <provider> <token>" first.');
  } else {
    lines.push('');
    lines.push('Note: Sync requires a running sync daemon or server to execute the actual sync operations.');
  }

  return success(result, lines.join('\n'));
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

  // Count linked tasks and check for conflicts
  let linkedCount = 0;
  let conflictCount = 0;
  const providerCounts: Record<string, number> = {};

  try {
    const allTasks = await api.list({ type: 'task' });
    for (const t of allTasks) {
      const task = t as Task;
      if (task.externalRef && (task.metadata as Record<string, unknown>)?._externalSync) {
        linkedCount++;
        const syncMeta = (task.metadata as Record<string, unknown>)._externalSync as Record<string, unknown>;
        const provider = (syncMeta?.provider as string) ?? 'unknown';
        providerCounts[provider] = (providerCounts[provider] ?? 0) + 1;
      }
      if (task.tags?.includes('sync-conflict')) {
        conflictCount++;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }

  // Build cursor info
  const cursors: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings.syncCursors)) {
    cursors[key] = value;
  }

  const mode = getOutputMode(options);
  const statusData = {
    enabled,
    linkedTaskCount: linkedCount,
    conflictCount,
    providerCounts,
    configuredProviders: Object.keys(settings.providers),
    syncCursors: cursors,
    pollIntervalMs: settings.pollIntervalMs,
    defaultDirection: settings.defaultDirection,
  };

  if (mode === 'json') {
    return success(statusData);
  }

  if (mode === 'quiet') {
    return success(`${linkedCount}:${conflictCount}`);
  }

  const lines: string[] = [
    'External Sync Status',
    '',
    `  Enabled:             ${enabled ? 'yes' : 'no'}`,
    `  Linked tasks:        ${linkedCount}`,
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
      const count = providerCounts[name] ?? 0;
      const hasToken = config.token ? 'yes' : 'no';
      lines.push(`    ${name}: ${count} linked task(s), token: ${hasToken}, project: ${config.defaultProject ?? '(not set)'}`);
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
      'Usage: sf external-sync resolve <taskId> --keep local|remote',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [taskId] = args;
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

  // Resolve task
  let task: Task | null;
  try {
    task = await api.get<Task>(taskId as ElementId);
  } catch {
    return failure(`Task not found: ${taskId}`, ExitCode.NOT_FOUND);
  }

  if (!task) {
    return failure(`Task not found: ${taskId}`, ExitCode.NOT_FOUND);
  }

  if (task.type !== 'task') {
    return failure(`Element ${taskId} is not a task (type: ${task.type})`, ExitCode.VALIDATION);
  }

  if (!task.tags?.includes('sync-conflict')) {
    return failure(
      `Task ${taskId} does not have a sync conflict. Only tasks tagged with "sync-conflict" can be resolved.`,
      ExitCode.VALIDATION
    );
  }

  // Remove sync-conflict tag and update metadata
  try {
    const newTags = (task.tags ?? []).filter((t) => t !== 'sync-conflict');
    const existingMetadata = (task.metadata ?? {}) as Record<string, unknown>;
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

    await api.update<Task>(taskId as ElementId, {
      tags: newTags,
      metadata: {
        ...restMetadata,
        _externalSync: updatedSyncMeta,
      },
    } as Partial<Task>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to resolve conflict: ${message}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ taskId, resolved: true, kept: keep });
  }

  if (mode === 'quiet') {
    return success(taskId);
  }

  return success(
    { taskId, resolved: true, kept: keep },
    `Resolved sync conflict for task ${taskId} (kept: ${keep})`
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
    description: 'Only link tasks with this status (can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'dry-run',
    short: 'n',
    description: 'List tasks that would be linked without creating external issues',
  },
  {
    name: 'batch-size',
    short: 'b',
    description: 'How many tasks to process concurrently (default: 10)',
    hasValue: true,
    defaultValue: '10',
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
    if (!providerConfig?.token) {
      return { error: `Provider "${providerName}" has no token configured. Run "sf external-sync config set-token ${providerName} <token>" first.` };
    }

    const project = projectOverride ?? providerConfig.defaultProject;
    if (!project) {
      return { error: `No project specified and provider "${providerName}" has no default project configured. Use --project or run "sf external-sync config set-project ${providerName} <project>" first.` };
    }

    let provider: ExternalProvider;

    if (providerName === 'github') {
      const { createGitHubProvider } = await import('../../external-sync/providers/github/index.js');
      provider = createGitHubProvider({
        provider: 'github',
        token: providerConfig.token,
        apiBaseUrl: providerConfig.apiBaseUrl,
        defaultProject: project,
      });
    } else if (providerName === 'linear') {
      const { createLinearProvider } = await import('../../external-sync/providers/linear/index.js');
      provider = createLinearProvider({
        apiKey: providerConfig.token,
      });
    } else {
      return { error: `Unsupported provider: "${providerName}". Supported providers: github, linear` };
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
 */
async function processBatch(
  tasks: Task[],
  adapter: { createIssue(project: string, issue: { title: string; body?: string; labels?: string[] }): Promise<{ externalId: string; url: string }> },
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

  for (const task of tasks) {
    try {
      // Create the external issue
      const externalTask = await adapter.createIssue(project, {
        title: task.title,
        body: task.descriptionRef ? `Stoneforge task: ${task.id}` : undefined,
        labels: task.tags ? [...task.tags] : undefined,
      });

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
      progressLines.push(`Failed to link ${task.id}: ${message}`);
      failed++;
    }
  }

  return { succeeded, failed, rateLimited, resetAt };
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

  const isDryRun = options['dry-run'] ?? false;
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

  // Filter to unlinked tasks (no _externalSync metadata)
  let unlinkedTasks = allTasks.filter((task) => {
    const metadata = (task.metadata ?? {}) as Record<string, unknown>;
    return !metadata._externalSync;
  });

  // Apply status filter if specified
  if (statusFilters.length > 0) {
    unlinkedTasks = unlinkedTasks.filter((task) => statusFilters.includes(task.status));
  }

  // Skip tombstone tasks by default (soft-deleted)
  unlinkedTasks = unlinkedTasks.filter((task) => task.status !== 'tombstone');

  const mode = getOutputMode(options);

  if (unlinkedTasks.length === 0) {
    const result = { linked: 0, failed: 0, skipped: 0, total: 0, dryRun: isDryRun };
    if (mode === 'json') {
      return success(result);
    }
    return success(result, 'No unlinked tasks found matching the specified criteria.');
  }

  // Dry run — just list tasks that would be linked
  if (isDryRun) {
    const taskList = unlinkedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
    }));

    if (mode === 'json') {
      return success({
        dryRun: true,
        provider: providerName,
        total: unlinkedTasks.length,
        tasks: taskList,
      });
    }

    if (mode === 'quiet') {
      return success(String(unlinkedTasks.length));
    }

    const lines: string[] = [
      `Dry run: ${unlinkedTasks.length} task(s) would be linked to ${providerName}`,
      '',
    ];

    for (const task of unlinkedTasks) {
      lines.push(`  ${task.id}  ${task.status.padEnd(12)} ${task.title}`);
    }

    return success({ dryRun: true, provider: providerName, total: unlinkedTasks.length, tasks: taskList }, lines.join('\n'));
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

  // Process tasks in batches
  const progressLines: string[] = [];
  let totalSucceeded = 0;
  let totalFailed = 0;
  let rateLimited = false;
  let rateLimitResetAt: number | undefined;

  for (let i = 0; i < unlinkedTasks.length; i += batchSize) {
    const batch = unlinkedTasks.slice(i, i + batchSize);

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
    if (i + batchSize < unlinkedTasks.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const skipped = unlinkedTasks.length - totalSucceeded - totalFailed;

  // Build result
  const result = {
    provider: providerName,
    project,
    linked: totalSucceeded,
    failed: totalFailed,
    skipped,
    total: unlinkedTasks.length,
    rateLimited,
    rateLimitResetAt: rateLimitResetAt ? new Date(rateLimitResetAt * 1000).toISOString() : undefined,
  };

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

const configSetAutoLinkCommand: Command = {
  name: 'set-auto-link',
  description: 'Enable auto-link with a provider',
  usage: 'sf external-sync config set-auto-link <provider>',
  help: `Enable auto-link for new tasks with the specified provider.

When auto-link is enabled, newly created Stoneforge tasks will automatically
get a corresponding external issue created and linked.

Arguments:
  provider    Provider name (github or linear)

Examples:
  sf external-sync config set-auto-link github
  sf external-sync config set-auto-link linear`,
  options: [],
  handler: configSetAutoLinkHandler as Command['handler'],
};

const configDisableAutoLinkCommand: Command = {
  name: 'disable-auto-link',
  description: 'Disable auto-link',
  usage: 'sf external-sync config disable-auto-link',
  help: `Disable auto-link for new tasks.

Clears the auto-link provider and disables automatic external issue creation.

Examples:
  sf external-sync config disable-auto-link`,
  options: [],
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
  set-auto-link <provider>         Enable auto-link with a provider
  disable-auto-link                Disable auto-link

Examples:
  sf external-sync config
  sf external-sync config set-token github ghp_xxxxxxxxxxxx
  sf external-sync config set-project github my-org/my-repo
  sf external-sync config set-auto-link github
  sf external-sync config disable-auto-link`,
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
  description: 'Link a task to an external issue',
  usage: 'sf external-sync link <taskId> <url-or-issue-number>',
  help: `Link a Stoneforge task to an external issue (e.g., GitHub issue).

Sets the task's externalRef and _externalSync metadata. If given a bare
issue number, constructs the URL from the provider's default project.

Arguments:
  taskId           Stoneforge task ID
  url-or-number    Full URL or bare issue number

Options:
  -p, --provider   Provider name (default: github)

Examples:
  sf external-sync link el-abc123 https://github.com/org/repo/issues/42
  sf external-sync link el-abc123 42
  sf external-sync link el-abc123 42 --provider github`,
  options: linkOptions,
  handler: linkHandler as Command['handler'],
};

// ============================================================================
// Link-All Command
// ============================================================================

const linkAllCommand: Command = {
  name: 'link-all',
  description: 'Bulk-link all unlinked tasks to external issues',
  usage: 'sf external-sync link-all --provider <provider> [--project <project>] [--status <status>] [--dry-run] [--batch-size <n>]',
  help: `Create external issues for all unlinked tasks and link them in bulk.

Finds all tasks that do NOT have external sync metadata and creates
a corresponding external issue for each one, then links them.

Options:
  -p, --provider <name>    Provider to link to (required)
      --project <project>  Override the default project
  -s, --status <status>    Only link tasks with this status (can be repeated)
  -n, --dry-run            List tasks that would be linked without creating issues
  -b, --batch-size <n>     Tasks to process concurrently (default: 10)

Rate Limits:
  If a rate limit is hit, the command stops gracefully and reports how
  many tasks were linked. Re-run the command to continue linking.

Examples:
  sf external-sync link-all --provider github
  sf external-sync link-all --provider github --status open
  sf external-sync link-all --provider github --status open --status in_progress
  sf external-sync link-all --provider github --dry-run
  sf external-sync link-all --provider github --project my-org/my-repo
  sf external-sync link-all --provider linear --batch-size 5`,
  options: linkAllOptions,
  handler: linkAllHandler as Command['handler'],
};

// ============================================================================
// Unlink Command
// ============================================================================

const unlinkCommand: Command = {
  name: 'unlink',
  description: 'Remove external link from a task',
  usage: 'sf external-sync unlink <taskId>',
  help: `Remove the external link from a Stoneforge task.

Clears the task's externalRef field and _externalSync metadata.

Arguments:
  taskId    Stoneforge task ID

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
  description: 'Push linked tasks to external service',
  usage: 'sf external-sync push [taskId...] [--all]',
  help: `Push specific linked tasks to their external service, or push all linked tasks.

If specific task IDs are given, pushes only those tasks. With --all,
pushes every task that has an external link.

Arguments:
  taskId...    One or more task IDs to push (optional with --all)

Options:
  -a, --all    Push all linked tasks

Examples:
  sf external-sync push el-abc123
  sf external-sync push el-abc123 el-def456
  sf external-sync push --all`,
  options: pushOptions,
  handler: pushHandler as Command['handler'],
};

// ============================================================================
// Pull Command
// ============================================================================

const pullCommand: Command = {
  name: 'pull',
  description: 'Pull changes from external for linked tasks',
  usage: 'sf external-sync pull [--provider <name>] [--discover]',
  help: `Pull changes from external services for all linked tasks.

Optionally discover new issues not yet linked to Stoneforge tasks.

Options:
  -p, --provider <name>   Pull from specific provider (default: all configured)
  -d, --discover          Discover new unlinked issues

Examples:
  sf external-sync pull
  sf external-sync pull --provider github
  sf external-sync pull --discover`,
  options: pullOptions,
  handler: pullHandler as Command['handler'],
};

// ============================================================================
// Sync Command
// ============================================================================

const biSyncCommand: Command = {
  name: 'sync',
  description: 'Bidirectional sync with external services',
  usage: 'sf external-sync sync [--dry-run]',
  help: `Run bidirectional sync between Stoneforge and external services.

Performs both push and pull operations. In dry-run mode, reports what
would change without making any modifications.

Options:
  -n, --dry-run    Show what would change without making changes

Examples:
  sf external-sync sync
  sf external-sync sync --dry-run`,
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

Displays linked task count, last sync times, configured providers,
and pending conflicts.

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
  usage: 'sf external-sync resolve <taskId> --keep local|remote',
  help: `Resolve a sync conflict by choosing which version to keep.

Tasks with sync conflicts are tagged with "sync-conflict". This command
resolves the conflict by keeping either the local or remote version.

Arguments:
  taskId    Task ID with a sync conflict

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
  config set-auto-link <provider>     Enable auto-link with a provider
  config disable-auto-link            Disable auto-link
  link <taskId> <url-or-issue-number> Link task to external issue
  link-all --provider <name>          Bulk-link all unlinked tasks
  unlink <taskId>                     Remove external link
  push [taskId...]                    Push linked task(s) to external
  pull                                Pull changes from external
  sync [--dry-run]                    Bidirectional sync
  status                              Show sync state
  resolve <taskId> --keep local|remote Resolve sync conflict

Examples:
  sf external-sync config
  sf external-sync config set-token github ghp_xxxxxxxxxxxx
  sf external-sync config set-project github my-org/my-repo
  sf external-sync config set-auto-link github
  sf external-sync config disable-auto-link
  sf external-sync link el-abc123 42
  sf external-sync link-all --provider github
  sf external-sync link-all --provider github --dry-run
  sf external-sync push --all
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
