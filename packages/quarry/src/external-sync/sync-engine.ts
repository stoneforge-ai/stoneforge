/**
 * Sync Engine — orchestrates push/pull operations between Stoneforge and external services
 *
 * The sync engine coordinates bidirectional synchronization between Stoneforge elements
 * and external services (GitHub, Linear, etc.) using the provider registry and adapters.
 *
 * Core operations:
 * - push(): Push locally-changed linked elements to external services
 * - pull(): Pull externally-changed items into Stoneforge
 * - sync(): Bidirectional sync (push then pull)
 *
 * Change detection:
 * - Push: Query events since lastPushedAt, filter to elements with _externalSync metadata,
 *   compare content hash against lastPushedHash
 * - Pull: Call adapter.listIssuesSince() using global sync cursor from settings,
 *   compare against lastPulledHash
 *
 * Usage:
 * ```typescript
 * import { createSyncEngine } from '@stoneforge/quarry';
 *
 * const engine = createSyncEngine({ api, registry, settings });
 * const result = await engine.push({ all: true });
 * const result = await engine.pull();
 * const result = await engine.sync({ dryRun: true });
 * ```
 */

import type {
  ExternalSyncResult,
  ExternalSyncConflict,
  ExternalSyncError,
  ExternalSyncState,
  ExternalTask,
  ExternalDocument,
  TaskSyncAdapter,
  DocumentSyncAdapter,
  ConflictStrategy,
  SyncAdapterType,
  ExternalProvider,
  ProviderConfig,
  Document,
  DocumentId,
} from '@stoneforge/core';
import {
  getExternalSyncState,
  setExternalSyncState,
} from '@stoneforge/core';
import type {
  Element,
  ElementId,
  Timestamp,
  Task,
  EventType,
  EventFilter,
} from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import { createHash } from 'crypto';
import { computeContentHashSync } from '../sync/hash.js';
import type { ProviderRegistry } from './provider-registry.js';
import { taskToExternalTask, externalTaskToTaskUpdates, getFieldMapConfigForProvider } from './adapters/task-sync-adapter.js';
import { documentToExternalDocumentInput, externalDocumentToDocumentUpdates, computeExternalDocumentHash } from './adapters/document-sync-adapter.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for sync operations (push, pull, sync)
 */
export interface SyncOptions {
  /** Report what would change without making changes */
  readonly dryRun?: boolean;
  /** Sync specific tasks only (by element ID) */
  readonly taskIds?: readonly string[];
  /** Sync all linked tasks */
  readonly all?: boolean;
  /** Force push all linked tasks, skipping hash comparison and event query guards */
  readonly force?: boolean;
  /**
   * Filter sync operations to specific adapter types.
   * When set, only elements matching these adapter types will be processed.
   * When omitted or empty, all adapter types are processed (tasks + documents).
   */
  readonly adapterTypes?: readonly SyncAdapterType[];
}

/**
 * Minimal QuarryAPI interface — only the methods the sync engine needs.
 * Avoids coupling to the full QuarryAPI type.
 */
export interface SyncEngineAPI {
  /** Get a single element by ID */
  get<T extends Element>(id: ElementId): Promise<T | null>;
  /** List elements matching a filter */
  list<T extends Element>(filter?: Record<string, unknown>): Promise<T[]>;
  /** Update an element */
  update<T extends Element>(id: ElementId, updates: Partial<T>): Promise<T>;
  /** Create a new element */
  create<T extends Element>(input: Record<string, unknown>): Promise<T>;
  /** List events matching a filter */
  listEvents(filter?: EventFilter): Promise<Array<{ elementId: ElementId; eventType: string; createdAt: Timestamp }>>;
}

/**
 * Minimal settings interface for sync cursor storage.
 * Uses the generic getSetting/setSetting pattern.
 */
export interface SyncEngineSettings {
  /** Get a setting value by key */
  getSetting(key: string): { value: unknown } | undefined;
  /** Set a setting value by key */
  setSetting(key: string, value: unknown): { value: unknown };
}

/**
 * Conflict resolver interface — resolves conflicts when both local and remote changed.
 * The actual implementation is in conflict-resolver.ts (separate task).
 * The sync engine uses this interface to decouple from the resolver implementation.
 */
export interface SyncConflictResolver {
  /**
   * Resolve a conflict between local and remote versions.
   *
   * @param localElement - The local Stoneforge element
   * @param remoteItem - The external task/document/item (must have updatedAt)
   * @param strategy - The conflict strategy to apply
   * @returns Resolution result indicating which side wins, or 'manual' for unresolved
   */
  resolve(
    localElement: Element,
    remoteItem: ExternalTask | ExternalDocument,
    strategy: ConflictStrategy
  ): ConflictResolution;
}

/**
 * Result of conflict resolution
 */
export interface ConflictResolution {
  /** Which side won ('local', 'remote', or 'manual' for unresolved) */
  readonly winner: 'local' | 'remote' | 'manual';
  /** Whether the conflict was auto-resolved */
  readonly resolved: boolean;
}

/**
 * Configuration for the sync engine
 */
export interface SyncEngineConfig {
  /** QuarryAPI instance for element CRUD + events */
  readonly api: SyncEngineAPI;
  /** Provider registry for looking up providers and adapters */
  readonly registry: ProviderRegistry;
  /** Settings service for sync cursor storage */
  readonly settings?: SyncEngineSettings;
  /** Conflict resolver (optional — defaults to last-write-wins) */
  readonly conflictResolver?: SyncConflictResolver;
  /** Default conflict strategy */
  readonly defaultConflictStrategy?: ConflictStrategy;
  /** Default provider config (for pull — specifies which provider/project to sync) */
  readonly providerConfigs?: readonly ProviderConfig[];
}

// ============================================================================
// Settings Keys
// ============================================================================

/** Key prefix for sync cursor settings */
const SYNC_CURSOR_KEY_PREFIX = 'external_sync.cursor';

/**
 * Build a settings key for a sync cursor.
 * Format: external_sync.cursor.<provider>.<project>.<adapterType>
 */
function buildCursorKey(provider: string, project: string, adapterType: SyncAdapterType): string {
  return `${SYNC_CURSOR_KEY_PREFIX}.${provider}.${project}.${adapterType}`;
}

// ============================================================================
// Default Conflict Resolver
// ============================================================================

/**
 * Default conflict resolver — implements last-write-wins strategy.
 * Compares updatedAt timestamps from local element and remote item.
 */
const defaultConflictResolver: SyncConflictResolver = {
  resolve(
    localElement: Element,
    remoteItem: ExternalTask | ExternalDocument,
    strategy: ConflictStrategy
  ): ConflictResolution {
    switch (strategy) {
      case 'local_wins':
        return { winner: 'local', resolved: true };
      case 'remote_wins':
        return { winner: 'remote', resolved: true };
      case 'manual':
        return { winner: 'manual', resolved: false };
      case 'last_write_wins':
      default: {
        const localTime = new Date(localElement.updatedAt).getTime();
        const remoteTime = new Date(remoteItem.updatedAt).getTime();
        if (remoteTime >= localTime) {
          return { winner: 'remote', resolved: true };
        }
        return { winner: 'local', resolved: true };
      }
    }
  },
};

// ============================================================================
// SyncEngine
// ============================================================================

/**
 * Sync Engine — coordinates push/pull operations between Stoneforge and external services.
 *
 * The engine is stateless — all state is stored in element metadata (_externalSync)
 * and settings (sync cursors). Each operation reads current state, computes changes,
 * and writes updated state.
 */
export class SyncEngine {
  private readonly api: SyncEngineAPI;
  private readonly registry: ProviderRegistry;
  private readonly settings: SyncEngineSettings | undefined;
  private readonly conflictResolver: SyncConflictResolver;
  private readonly defaultStrategy: ConflictStrategy;
  private readonly providerConfigs: readonly ProviderConfig[];

  constructor(config: SyncEngineConfig) {
    this.api = config.api;
    this.registry = config.registry;
    this.settings = config.settings;
    this.conflictResolver = config.conflictResolver ?? defaultConflictResolver;
    this.defaultStrategy = config.defaultConflictStrategy ?? 'last_write_wins';
    this.providerConfigs = config.providerConfigs ?? [];
  }

  // --------------------------------------------------------------------------
  // Push — push locally-changed linked elements to external services
  // --------------------------------------------------------------------------

  /**
   * Push locally-changed linked elements to external services.
   *
   * Algorithm:
   * 1. Find elements with _externalSync metadata
   * 2. For each element, query events since lastPushedAt
   * 3. Compare current content hash against lastPushedHash
   * 4. If hash differs, push changes to external service via adapter
   * 5. Update _externalSync metadata with new timestamp and hash
   *
   * @param options - Push options (dryRun, taskIds, all)
   * @returns Aggregated sync result across all providers
   */
  async push(options: SyncOptions = {}): Promise<ExternalSyncResult> {
    const pushed: number[] = [];
    const skipped: number[] = [];
    const conflicts: ExternalSyncConflict[] = [];
    const errors: ExternalSyncError[] = [];
    const now = createTimestamp();

    // Step 1: Find elements to push
    const elements = await this.findLinkedElements(options);

    // Step 2: Process each element
    for (const element of elements) {
      const syncState = getExternalSyncState(element.metadata);
      if (!syncState) {
        // No sync state — shouldn't happen since we filtered for it, but guard
        skipped.push(1);
        continue;
      }

      // Skip if direction is pull-only
      if (syncState.direction === 'pull') {
        skipped.push(1);
        continue;
      }

      // Skip closed/tombstone tasks and archived documents — they're done
      // and shouldn't sync. If an element is later reopened/reactivated,
      // it will be picked up again naturally since the filter no longer applies.
      const elementStatus = (element as unknown as { status: string }).status;
      if (elementStatus === 'closed' || elementStatus === 'tombstone' || elementStatus === 'archived') {
        skipped.push(1);
        continue;
      }

      try {
        // Route by adapter type: tasks → pushElement(), documents → pushDocument()
        let result: 'pushed' | 'skipped';
        if (syncState.adapterType === 'document') {
          result = await this.pushDocument(element, syncState, options, now);
        } else {
          result = await this.pushElement(element, syncState, options, now);
        }

        if (result === 'pushed') {
          pushed.push(1);
        } else if (result === 'skipped') {
          skipped.push(1);
        }
      } catch (err) {
        errors.push({
          elementId: element.id,
          externalId: syncState.externalId,
          provider: syncState.provider,
          project: syncState.project,
          message: err instanceof Error ? err.message : String(err),
          retryable: isRetryableError(err),
        });
      }
    }

    return buildResult({
      pushed: pushed.length,
      pulled: 0,
      skipped: skipped.length,
      conflicts,
      errors,
      provider: this.getPrimaryProvider(),
      project: this.getPrimaryProject(),
    });
  }

  /**
   * Push a single element to its external service.
   *
   * @returns 'pushed' if changes were sent, 'skipped' if no changes detected
   */
  private async pushElement(
    element: Element,
    syncState: ExternalSyncState,
    options: SyncOptions,
    now: Timestamp
  ): Promise<'pushed' | 'skipped'> {
    // Check for actual content change via hash (skip when force is true)
    const currentHash = computeContentHashSync(element).hash;
    if (!options.force && syncState.lastPushedHash && currentHash === syncState.lastPushedHash) {
      return 'skipped';
    }

    // Verify events have occurred since last push (skip when force is true)
    if (!options.force && syncState.lastPushedAt) {
      const events = await this.api.listEvents({
        elementId: element.id,
        eventType: ['updated', 'closed', 'reopened'] as unknown as EventType[],
        after: syncState.lastPushedAt,
      } as EventFilter);

      if (events.length === 0) {
        return 'skipped';
      }
    }

    // Dry run — report but don't actually push
    if (options.dryRun) {
      return 'pushed';
    }

    // Get the adapter for this element's provider
    const adapter = this.getTaskAdapter(syncState.provider);
    if (!adapter) {
      throw new Error(`No task adapter found for provider '${syncState.provider}'`);
    }

    // Build external task input using the shared field mapping utilities.
    // This properly converts priority → sf:priority:* labels, taskType → sf:type:* labels,
    // status → open/closed state, hydrates description, and resolves assignees.
    const fieldMapConfig = getFieldMapConfigForProvider(syncState.provider);
    const taskInput = await taskToExternalTask(element as Task, fieldMapConfig, this.api);

    // Push to external service
    await adapter.updateIssue(syncState.project, syncState.externalId, taskInput);

    // Update sync state on element
    const updatedSyncState: ExternalSyncState = {
      ...syncState,
      lastPushedAt: now,
      lastPushedHash: currentHash,
    };

    await this.api.update(element.id, {
      metadata: setExternalSyncState(element.metadata, updatedSyncState),
    } as Partial<Element>);

    return 'pushed';
  }

  /**
   * Push a single document to its external service.
   *
   * Parallel to pushElement(), but uses document-specific conversion
   * (documentToExternalDocumentInput) and the DocumentSyncAdapter.
   *
   * @returns 'pushed' if changes were sent, 'skipped' if no changes detected
   */
  private async pushDocument(
    element: Element,
    syncState: ExternalSyncState,
    options: SyncOptions,
    now: Timestamp
  ): Promise<'pushed' | 'skipped'> {
    // Check for actual content change via hash (skip when force is true)
    const currentHash = computeContentHashSync(element).hash;
    if (!options.force && syncState.lastPushedHash && currentHash === syncState.lastPushedHash) {
      return 'skipped';
    }

    // Verify events have occurred since last push (skip when force is true)
    if (!options.force && syncState.lastPushedAt) {
      const events = await this.api.listEvents({
        elementId: element.id,
        eventType: ['updated'] as unknown as EventType[],
        after: syncState.lastPushedAt,
      } as EventFilter);

      if (events.length === 0) {
        return 'skipped';
      }
    }

    // Dry run — report but don't actually push
    if (options.dryRun) {
      return 'pushed';
    }

    // Get the document adapter for this element's provider
    const adapter = this.getDocumentAdapter(syncState.provider);
    if (!adapter) {
      throw new Error(`No document adapter found for provider '${syncState.provider}'`);
    }

    // Build external document input using the shared field mapping utilities
    const docInput = documentToExternalDocumentInput(element as unknown as Document);

    // Push to external service
    await adapter.updatePage(syncState.project, syncState.externalId, docInput);

    // Update sync state on element
    const updatedSyncState: ExternalSyncState = {
      ...syncState,
      lastPushedAt: now,
      lastPushedHash: currentHash,
    };

    await this.api.update(element.id, {
      metadata: setExternalSyncState(element.metadata, updatedSyncState),
    } as Partial<Element>);

    return 'pushed';
  }

  // --------------------------------------------------------------------------
  // Pull — pull externally-changed items into Stoneforge
  // --------------------------------------------------------------------------

  /**
   * Pull externally-changed items into Stoneforge.
   *
   * Algorithm:
   * 1. For each configured provider, get the sync cursor (last poll timestamp)
   * 2. Call adapter.listIssuesSince(project, cursor) to find changed items
   * 3. For each changed item:
   *    a. If linked to a local element, compare against lastPulledHash
   *    b. If unlinked and options.all is set, create a new Stoneforge task
   *    c. If both local and remote changed, use conflict resolver
   * 4. Update sync cursors and element metadata
   *
   * @param options - Pull options (dryRun, taskIds, all)
   * @returns Aggregated sync result
   */
  async pull(options: SyncOptions = {}): Promise<ExternalSyncResult> {
    const pulled: number[] = [];
    const skipped: number[] = [];
    const conflicts: ExternalSyncConflict[] = [];
    const errors: ExternalSyncError[] = [];
    const now = createTimestamp();
    const adapterFilter = options.adapterTypes && options.adapterTypes.length > 0
      ? new Set(options.adapterTypes)
      : null;

    // Get all task adapters from the registry (skip if filtered out)
    if (!adapterFilter || adapterFilter.has('task')) {
      const taskAdapterEntries = this.registry.getAdaptersOfType('task');

      for (const { provider, adapter } of taskAdapterEntries) {
        const taskAdapter = adapter as TaskSyncAdapter;
        const providerConfig = this.getProviderConfig(provider.name);
        const project = providerConfig?.defaultProject;

        if (!project) {
          // No project configured for this provider — skip
          continue;
        }

        try {
          const result = await this.pullFromProvider(
            provider,
            taskAdapter,
            project,
            options,
            now,
            conflicts,
            errors
          );

          pulled.push(result.pulled);
          skipped.push(result.skipped);
        } catch (err) {
          errors.push({
            provider: provider.name,
            project,
            message: err instanceof Error ? err.message : String(err),
            retryable: isRetryableError(err),
          });
        }
      }
    }

    // Get all document adapters from the registry (skip if filtered out)
    if (!adapterFilter || adapterFilter.has('document')) {
      const docAdapterEntries = this.registry.getAdaptersOfType('document');

      for (const { provider, adapter } of docAdapterEntries) {
        const docAdapter = adapter as DocumentSyncAdapter;
        const providerConfig = this.getProviderConfig(provider.name);
        const project = providerConfig?.defaultProject;

        if (!project) {
          continue;
        }

        try {
          const result = await this.pullDocumentsFromProvider(
            provider,
            docAdapter,
            project,
            options,
            now,
            conflicts,
            errors
          );

          pulled.push(result.pulled);
          skipped.push(result.skipped);
        } catch (err) {
          errors.push({
            provider: provider.name,
            project,
            message: err instanceof Error ? err.message : String(err),
            retryable: isRetryableError(err),
          });
        }
      }
    }

    return buildResult({
      pushed: 0,
      pulled: pulled.reduce((a, b) => a + b, 0),
      skipped: skipped.reduce((a, b) => a + b, 0),
      conflicts,
      errors,
      provider: this.getPrimaryProvider(),
      project: this.getPrimaryProject(),
    });
  }

  /**
   * Pull changes from a specific provider.
   */
  private async pullFromProvider(
    provider: ExternalProvider,
    adapter: TaskSyncAdapter,
    project: string,
    options: SyncOptions,
    now: Timestamp,
    conflicts: ExternalSyncConflict[],
    errors: ExternalSyncError[]
  ): Promise<{ pulled: number; skipped: number }> {
    let pulledCount = 0;
    let skippedCount = 0;

    // Get the sync cursor for this provider+project
    const syncCursor = this.getSyncCursor(provider.name, project, 'task');

    // Fetch changed items since cursor
    const externalItems = await adapter.listIssuesSince(project, syncCursor);

    // Get all locally-linked elements for matching
    const linkedElements = await this.findLinkedElementsForProvider(
      provider.name,
      project
    );

    // Build a map of externalId → local element for fast lookup
    const linkedByExternalId = new Map<string, Element>();
    for (const el of linkedElements) {
      const state = getExternalSyncState(el.metadata);
      if (state) {
        linkedByExternalId.set(state.externalId, el);
      }
    }

    for (const externalItem of externalItems) {
      // If taskIds filter is set, check if this external item matches
      if (options.taskIds) {
        const localEl = linkedByExternalId.get(externalItem.externalId);
        if (!localEl || !options.taskIds.includes(localEl.id)) {
          skippedCount++;
          continue;
        }
      }

      try {
        const result = await this.pullItem(
          provider,
          project,
          externalItem,
          linkedByExternalId,
          options,
          now,
          conflicts
        );

        if (result === 'pulled') {
          pulledCount++;
        } else if (result === 'skipped') {
          skippedCount++;
        } else if (result === 'created') {
          pulledCount++;
        }
      } catch (err) {
        errors.push({
          externalId: externalItem.externalId,
          provider: provider.name,
          project,
          message: err instanceof Error ? err.message : String(err),
          retryable: isRetryableError(err),
        });
      }
    }

    // Update sync cursor (unless dry run)
    if (!options.dryRun && externalItems.length > 0) {
      this.setSyncCursor(provider.name, project, 'task', now);
    }

    return { pulled: pulledCount, skipped: skippedCount };
  }

  /**
   * Pull a single external item into Stoneforge.
   *
   * @returns 'pulled' if local element was updated, 'skipped' if no changes,
   *          'created' if a new task was created
   */
  private async pullItem(
    provider: ExternalProvider,
    project: string,
    externalItem: ExternalTask,
    linkedByExternalId: Map<string, Element>,
    options: SyncOptions,
    now: Timestamp,
    conflicts: ExternalSyncConflict[]
  ): Promise<'pulled' | 'skipped' | 'created'> {
    const localElement = linkedByExternalId.get(externalItem.externalId);

    if (!localElement) {
      // Unlinked external item — create new task if --all flag is set
      if (options.all) {
        if (options.dryRun) {
          return 'created';
        }
        await this.createTaskFromExternal(provider, project, externalItem, now);
        return 'created';
      }
      return 'skipped';
    }

    // Linked element — check for actual change via hash
    const syncState = getExternalSyncState(localElement.metadata)!;

    // Skip if direction is push-only
    if (syncState.direction === 'push') {
      return 'skipped';
    }

    // Skip updates to closed/tombstone tasks UNLESS the external item is open
    // (which means someone reopened the issue externally — we should sync that).
    const localStatus = (localElement as unknown as { status: string }).status;
    if ((localStatus === 'closed' || localStatus === 'tombstone') && externalItem.state !== 'open') {
      return 'skipped';
    }

    // Compute a hash of the external item content to detect real changes
    const remoteContentKey = computeExternalItemHash(externalItem);
    if (syncState.lastPulledHash && remoteContentKey === syncState.lastPulledHash) {
      return 'skipped';
    }

    // Check for conflict: has local also changed since last pull?
    const localHash = computeContentHashSync(localElement).hash;
    const localChanged =
      syncState.lastPushedHash !== undefined && localHash !== syncState.lastPushedHash;

    if (localChanged) {
      // Both sides changed — use conflict resolver
      const resolution = this.conflictResolver.resolve(
        localElement,
        externalItem,
        this.defaultStrategy
      );

      conflicts.push({
        elementId: localElement.id,
        externalId: externalItem.externalId,
        provider: provider.name,
        project,
        localUpdatedAt: localElement.updatedAt,
        remoteUpdatedAt: externalItem.updatedAt,
        strategy: this.defaultStrategy,
        resolved: resolution.resolved,
        winner: resolution.resolved ? resolution.winner as 'local' | 'remote' : undefined,
      });

      if (!resolution.resolved) {
        // Manual resolution needed — tag the element
        if (!options.dryRun) {
          const tags = localElement.tags.includes('sync-conflict')
            ? localElement.tags
            : [...localElement.tags, 'sync-conflict'];
          await this.api.update(localElement.id, { tags } as Partial<Element>);
        }
        return 'skipped';
      }

      if (resolution.winner === 'local') {
        // Local wins — skip the pull, but update the pulled hash
        if (!options.dryRun) {
          const updatedSyncState: ExternalSyncState = {
            ...syncState,
            lastPulledAt: now,
            lastPulledHash: remoteContentKey,
          };
          await this.api.update(localElement.id, {
            metadata: setExternalSyncState(localElement.metadata, updatedSyncState),
          } as Partial<Element>);
        }
        return 'skipped';
      }
      // Remote wins — fall through to apply remote changes
    }

    // Dry run — report but don't actually apply
    if (options.dryRun) {
      return 'pulled';
    }

    // Apply remote changes to local element using provider field map config.
    // Pass the existing task for diff mode (only changed fields are returned).
    const updates = this.externalItemToUpdates(externalItem, localElement as unknown as Task);
    const updatedSyncState: ExternalSyncState = {
      ...syncState,
      lastPulledAt: now,
      lastPulledHash: remoteContentKey,
    };

    // Merge metadata: preserve existing metadata, add any from updates
    // (e.g., _pendingAssignee), and set the updated sync state.
    const updatesMetadata = (updates.metadata ?? {}) as Record<string, unknown>;
    const mergedMetadata = setExternalSyncState(
      { ...localElement.metadata, ...updatesMetadata },
      updatedSyncState
    );

    // Handle description (body) sync from external item.
    // The body is not included in externalItemToUpdates() because it requires
    // separate document creation/update operations.
    const descriptionRefUpdate = await this.syncDescriptionFromExternal(
      localElement as unknown as Task,
      externalItem
    );

    await this.api.update(localElement.id, {
      ...updates,
      ...descriptionRefUpdate,
      metadata: mergedMetadata,
    } as Partial<Element>);

    return 'pulled';
  }

  // --------------------------------------------------------------------------
  // Pull — document-specific helpers
  // --------------------------------------------------------------------------

  /**
   * Pull document changes from a specific provider.
   * Parallel to pullFromProvider(), but uses the DocumentSyncAdapter.
   */
  private async pullDocumentsFromProvider(
    provider: ExternalProvider,
    adapter: DocumentSyncAdapter,
    project: string,
    options: SyncOptions,
    now: Timestamp,
    conflicts: ExternalSyncConflict[],
    errors: ExternalSyncError[]
  ): Promise<{ pulled: number; skipped: number }> {
    let pulledCount = 0;
    let skippedCount = 0;

    // Get the sync cursor for this provider+project for documents
    const syncCursor = this.getSyncCursor(provider.name, project, 'document');

    // Fetch changed documents since cursor
    const externalDocs = await adapter.listPagesSince(project, syncCursor);

    // Get all locally-linked document elements for matching
    const linkedElements = await this.findLinkedElementsForProvider(
      provider.name,
      project
    );

    // Filter to only document-type linked elements
    const linkedDocuments = linkedElements.filter((el) => {
      const state = getExternalSyncState(el.metadata);
      return state && state.adapterType === 'document';
    });

    // Build a map of externalId → local element for fast lookup
    const linkedByExternalId = new Map<string, Element>();
    for (const el of linkedDocuments) {
      const state = getExternalSyncState(el.metadata);
      if (state) {
        linkedByExternalId.set(state.externalId, el);
      }
    }

    for (const externalDoc of externalDocs) {
      // If taskIds filter is set (used generically for element IDs), check if this external doc matches
      if (options.taskIds) {
        const localEl = linkedByExternalId.get(externalDoc.externalId);
        if (!localEl || !options.taskIds.includes(localEl.id)) {
          skippedCount++;
          continue;
        }
      }

      try {
        const result = await this.pullDocumentItem(
          provider,
          project,
          externalDoc,
          linkedByExternalId,
          options,
          now,
          conflicts
        );

        if (result === 'pulled') {
          pulledCount++;
        } else if (result === 'skipped') {
          skippedCount++;
        } else if (result === 'created') {
          pulledCount++;
        }
      } catch (err) {
        errors.push({
          externalId: externalDoc.externalId,
          provider: provider.name,
          project,
          message: err instanceof Error ? err.message : String(err),
          retryable: isRetryableError(err),
        });
      }
    }

    // Update sync cursor (unless dry run)
    if (!options.dryRun && externalDocs.length > 0) {
      this.setSyncCursor(provider.name, project, 'document', now);
    }

    return { pulled: pulledCount, skipped: skippedCount };
  }

  /**
   * Pull a single external document into Stoneforge.
   * Parallel to pullItem(), but uses document-specific conversion.
   *
   * @returns 'pulled' if local element was updated, 'skipped' if no changes,
   *          'created' if a new document was created
   */
  private async pullDocumentItem(
    provider: ExternalProvider,
    project: string,
    externalDoc: ExternalDocument,
    linkedByExternalId: Map<string, Element>,
    options: SyncOptions,
    now: Timestamp,
    conflicts: ExternalSyncConflict[]
  ): Promise<'pulled' | 'skipped' | 'created'> {
    const localElement = linkedByExternalId.get(externalDoc.externalId);

    if (!localElement) {
      // Unlinked external document — create new document if --all flag is set
      if (options.all) {
        if (options.dryRun) {
          return 'created';
        }
        await this.createDocumentFromExternal(provider, project, externalDoc, now);
        return 'created';
      }
      return 'skipped';
    }

    // Linked element — check for actual change via hash
    const syncState = getExternalSyncState(localElement.metadata)!;

    // Skip if direction is push-only
    if (syncState.direction === 'push') {
      return 'skipped';
    }

    // Skip updates to archived documents
    const localStatus = (localElement as unknown as { status: string }).status;
    if (localStatus === 'archived') {
      return 'skipped';
    }

    // Compute a hash of the external document content to detect real changes
    const remoteContentKey = computeExternalDocumentHash(externalDoc);
    if (syncState.lastPulledHash && remoteContentKey === syncState.lastPulledHash) {
      return 'skipped';
    }

    // Check for conflict: has local also changed since last pull?
    const localHash = computeContentHashSync(localElement).hash;
    const localChanged =
      syncState.lastPushedHash !== undefined && localHash !== syncState.lastPushedHash;

    if (localChanged) {
      // Both sides changed — use conflict resolver
      const resolution = this.conflictResolver.resolve(
        localElement,
        externalDoc,
        this.defaultStrategy
      );

      conflicts.push({
        elementId: localElement.id,
        externalId: externalDoc.externalId,
        provider: provider.name,
        project,
        localUpdatedAt: localElement.updatedAt,
        remoteUpdatedAt: externalDoc.updatedAt,
        strategy: this.defaultStrategy,
        resolved: resolution.resolved,
        winner: resolution.resolved ? resolution.winner as 'local' | 'remote' : undefined,
      });

      if (!resolution.resolved) {
        // Manual resolution needed — tag the element
        if (!options.dryRun) {
          const tags = localElement.tags.includes('sync-conflict')
            ? localElement.tags
            : [...localElement.tags, 'sync-conflict'];
          await this.api.update(localElement.id, { tags } as Partial<Element>);
        }
        return 'skipped';
      }

      if (resolution.winner === 'local') {
        // Local wins — skip the pull, but update the pulled hash
        if (!options.dryRun) {
          const updatedSyncState: ExternalSyncState = {
            ...syncState,
            lastPulledAt: now,
            lastPulledHash: remoteContentKey,
          };
          await this.api.update(localElement.id, {
            metadata: setExternalSyncState(localElement.metadata, updatedSyncState),
          } as Partial<Element>);
        }
        return 'skipped';
      }
      // Remote wins — fall through to apply remote changes
    }

    // Dry run — report but don't actually apply
    if (options.dryRun) {
      return 'pulled';
    }

    // Apply remote changes to local document using document field mapping.
    // Pass the existing document for diff mode (only changed fields are returned).
    const updates = externalDocumentToDocumentUpdates(
      externalDoc,
      localElement as unknown as Document
    );
    const updatedSyncState: ExternalSyncState = {
      ...syncState,
      lastPulledAt: now,
      lastPulledHash: remoteContentKey,
    };

    const mergedMetadata = setExternalSyncState(
      { ...localElement.metadata },
      updatedSyncState
    );

    await this.api.update(localElement.id, {
      ...updates,
      metadata: mergedMetadata,
    } as Partial<Element>);

    return 'pulled';
  }

  /**
   * Create a new Stoneforge document from an unlinked external document.
   */
  private async createDocumentFromExternal(
    provider: ExternalProvider,
    project: string,
    externalDoc: ExternalDocument,
    now: Timestamp
  ): Promise<Element> {
    const syncState: ExternalSyncState = {
      provider: provider.name,
      project,
      externalId: externalDoc.externalId,
      url: externalDoc.url,
      lastPulledAt: now,
      lastPulledHash: computeExternalDocumentHash(externalDoc),
      direction: 'bidirectional',
      adapterType: 'document',
    };

    // Use the document field mapping for conversion
    const docUpdates = externalDocumentToDocumentUpdates(externalDoc);

    const createInput: Record<string, unknown> = {
      type: 'document',
      title: docUpdates.title ?? externalDoc.title,
      content: docUpdates.content ?? externalDoc.content,
      contentType: docUpdates.contentType ?? 'markdown',
      status: 'active',
      category: 'other',
      version: 1,
      previousVersionId: null,
      immutable: false,
      tags: [],
      externalRef: externalDoc.url,
      createdBy: 'system',
      metadata: { _externalSync: syncState },
    };

    const element = await this.api.create<Element>(createInput);
    return element;
  }

  // --------------------------------------------------------------------------
  // Sync — bidirectional (push then pull)
  // --------------------------------------------------------------------------

  /**
   * Bidirectional sync — push then pull.
   *
   * Runs push first to send local changes, then pull to receive remote changes.
   * Results are merged from both operations.
   *
   * @param options - Sync options (dryRun, taskIds, all)
   * @returns Merged sync result
   */
  async sync(options: SyncOptions = {}): Promise<ExternalSyncResult> {
    const pushResult = await this.push(options);
    const pullResult = await this.pull(options);

    return {
      success: pushResult.success && pullResult.success,
      provider: pushResult.provider || pullResult.provider,
      project: pushResult.project || pullResult.project,
      adapterType: pushResult.adapterType || pullResult.adapterType,
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      skipped: pushResult.skipped + pullResult.skipped,
      conflicts: [...pushResult.conflicts, ...pullResult.conflicts],
      errors: [...pushResult.errors, ...pullResult.errors],
    };
  }

  // --------------------------------------------------------------------------
  // Element Discovery
  // --------------------------------------------------------------------------

  /**
   * Find elements that are linked to external services and match the given options.
   *
   * - If taskIds is specified, returns only those tasks (that have _externalSync)
   * - If all is true, returns all tasks with _externalSync metadata
   * - Otherwise, returns tasks with _externalSync that have been updated
   */
  private async findLinkedElements(options: SyncOptions): Promise<Element[]> {
    const adapterFilter = options.adapterTypes && options.adapterTypes.length > 0
      ? new Set(options.adapterTypes)
      : null;

    if (options.taskIds && options.taskIds.length > 0) {
      // Fetch specific elements (tasks or documents)
      const elements: Element[] = [];
      for (const id of options.taskIds) {
        const element = await this.api.get<Element>(id as ElementId);
        if (element) {
          const state = getExternalSyncState(element.metadata);
          if (state && (!adapterFilter || adapterFilter.has(state.adapterType))) {
            elements.push(element);
          }
        }
      }
      return elements;
    }

    // Fetch elements based on adapter type filter
    const collections: Element[][] = [];
    if (!adapterFilter || adapterFilter.has('task')) {
      collections.push(await this.api.list<Element>({ type: 'task' }));
    }
    if (!adapterFilter || adapterFilter.has('document')) {
      collections.push(await this.api.list<Element>({ type: 'document' }));
    }

    return collections.flat().filter((el) => {
      const state = getExternalSyncState(el.metadata);
      return state !== undefined && (!adapterFilter || adapterFilter.has(state.adapterType));
    });
  }

  /**
   * Find elements linked to a specific provider and project.
   */
  private async findLinkedElementsForProvider(
    providerName: string,
    project: string
  ): Promise<Element[]> {
    const allTasks = await this.api.list<Element>({ type: 'task' });
    const allDocs = await this.api.list<Element>({ type: 'document' });
    return [...allTasks, ...allDocs].filter((el) => {
      const state = getExternalSyncState(el.metadata);
      return state && state.provider === providerName && state.project === project;
    });
  }

  // --------------------------------------------------------------------------
  // Field Mapping Utilities
  // --------------------------------------------------------------------------

  /**
   * Convert an ExternalTask to partial updates for applying to a local element.
   *
   * Delegates to externalTaskToTaskUpdates() from task-sync-adapter.ts, which
   * uses the provider's TaskSyncFieldMapConfig for correct status, priority,
   * taskType, and tag mapping. The provider is looked up from item.provider.
   *
   * @param item - The external task to convert
   * @param existingTask - The existing local task (for diff mode), or undefined
   * @returns Partial<Task> with the mapped fields
   */
  private externalItemToUpdates(item: ExternalTask, existingTask?: Task): Partial<Task> {
    const config = getFieldMapConfigForProvider(item.provider);
    return externalTaskToTaskUpdates(item, existingTask, config);
  }

  // --------------------------------------------------------------------------
  // Task Creation (for pull with --all)
  // --------------------------------------------------------------------------

  /**
   * Create a new Stoneforge task from an unlinked external item.
   */
  private async createTaskFromExternal(
    provider: ExternalProvider,
    project: string,
    item: ExternalTask,
    now: Timestamp
  ): Promise<Element> {
    const syncState: ExternalSyncState = {
      provider: provider.name,
      project,
      externalId: item.externalId,
      url: item.url,
      lastPulledAt: now,
      lastPulledHash: computeExternalItemHash(item),
      direction: 'bidirectional',
      adapterType: 'task',
    };

    // Use the provider's field map config for correct status, priority,
    // taskType, and tag mapping — instead of hardcoded open/closed.
    const taskUpdates = this.externalItemToUpdates(item);

    // Merge metadata from field mapping (e.g., _pendingAssignee) with sync state
    const taskMetadata = (taskUpdates.metadata ?? {}) as Record<string, unknown>;

    // Create a description document if the external item has a body
    let descriptionRef: DocumentId | undefined;
    if (item.body && item.body.trim().length > 0) {
      descriptionRef = await this.createDescriptionDocument(
        item.body,
        taskUpdates.title ?? item.title
      );
    }

    const createInput: Record<string, unknown> = {
      type: 'task',
      title: taskUpdates.title ?? item.title,
      status: taskUpdates.status ?? 'open',
      priority: taskUpdates.priority,
      taskType: taskUpdates.taskType,
      tags: taskUpdates.tags ?? [...item.labels],
      externalRef: taskUpdates.externalRef ?? item.url,
      createdBy: 'system',
      metadata: { ...taskMetadata, _externalSync: syncState },
      ...(descriptionRef !== undefined && { descriptionRef }),
    };

    const element = await this.api.create<Element>(createInput);

    return element;
  }

  // --------------------------------------------------------------------------
  // Description Sync Helpers
  // --------------------------------------------------------------------------

  /**
   * Sync the description (body) from an external item to the local task's
   * description document.
   *
   * - If the task already has a descriptionRef, compare the body against the
   *   existing document content and update only if changed.
   * - If the task has no descriptionRef and the body is non-empty, create a
   *   new document and return the descriptionRef to link.
   * - If the body is empty/undefined, skip (don't delete existing descriptions).
   *
   * @returns Partial update with descriptionRef if a new document was created,
   *          or empty object if no descriptionRef change is needed.
   */
  private async syncDescriptionFromExternal(
    localTask: Task,
    externalItem: ExternalTask
  ): Promise<Partial<Task>> {
    const body = externalItem.body;

    // If body is empty/undefined, skip — don't delete existing descriptions
    if (!body || body.trim().length === 0) {
      return {};
    }

    if (localTask.descriptionRef) {
      // Task already has a description document — update if content changed
      const existingDoc = await this.api.get<Document>(
        localTask.descriptionRef as unknown as ElementId
      );

      if (existingDoc && existingDoc.type === 'document') {
        if (existingDoc.content !== body) {
          await this.api.update(localTask.descriptionRef as unknown as ElementId, {
            content: body,
          } as Partial<Element>);
        }
        // No descriptionRef change needed
        return {};
      }

      // Document not found — fall through to create a new one
    }

    // No existing description document — create a new one and link it
    const newDescRef = await this.createDescriptionDocument(body, localTask.title);
    return { descriptionRef: newDescRef } as Partial<Task>;
  }

  /**
   * Create a new description document for a task.
   *
   * Uses the same pattern as the server-side task creation:
   * - contentType: 'markdown'
   * - category: 'task-description' tag
   * - createdBy: 'system'
   *
   * @param body - The description content
   * @param taskTitle - The task title (used in the document title)
   * @returns The DocumentId of the created document
   */
  private async createDescriptionDocument(
    body: string,
    taskTitle: string
  ): Promise<DocumentId> {
    const docInput = {
      type: 'document',
      contentType: 'markdown',
      content: body,
      createdBy: 'system',
      tags: ['task-description'],
      title: `Description for task ${taskTitle}`,
      metadata: {},
      version: 1,
      previousVersionId: null,
      category: 'task-description',
      status: 'active',
      immutable: false,
    };

    const createdDoc = await this.api.create<Element>(docInput);
    return createdDoc.id as unknown as DocumentId;
  }

  // --------------------------------------------------------------------------
  // Sync Cursor Management
  // --------------------------------------------------------------------------

  /**
   * Get the sync cursor for a provider+project+adapterType.
   * Returns a timestamp indicating the last time we polled this combination.
   */
  private getSyncCursor(
    provider: string,
    project: string,
    adapterType: SyncAdapterType
  ): Timestamp {
    if (!this.settings) {
      // No settings service — return epoch
      return '1970-01-01T00:00:00.000Z' as Timestamp;
    }

    const key = buildCursorKey(provider, project, adapterType);
    const setting = this.settings.getSetting(key);
    if (setting && typeof setting.value === 'string') {
      return setting.value as Timestamp;
    }

    return '1970-01-01T00:00:00.000Z' as Timestamp;
  }

  /**
   * Update the sync cursor for a provider+project+adapterType.
   */
  private setSyncCursor(
    provider: string,
    project: string,
    adapterType: SyncAdapterType,
    cursor: Timestamp
  ): void {
    if (!this.settings) {
      return;
    }

    const key = buildCursorKey(provider, project, adapterType);
    this.settings.setSetting(key, cursor);
  }

  // --------------------------------------------------------------------------
  // Provider/Adapter Lookup
  // --------------------------------------------------------------------------

  /**
   * Get a TaskSyncAdapter for a given provider name.
   */
  private getTaskAdapter(providerName: string): TaskSyncAdapter | undefined {
    const provider = this.registry.get(providerName);
    if (!provider) return undefined;
    return provider.getTaskAdapter?.();
  }

  /**
   * Get a DocumentSyncAdapter for a given provider name.
   */
  private getDocumentAdapter(providerName: string): DocumentSyncAdapter | undefined {
    const provider = this.registry.get(providerName);
    if (!provider) return undefined;
    return provider.getDocumentAdapter?.();
  }

  /**
   * Get the ProviderConfig for a given provider name.
   */
  private getProviderConfig(providerName: string): ProviderConfig | undefined {
    return this.providerConfigs.find((c) => c.provider === providerName);
  }

  /**
   * Get the primary provider name (for result reporting).
   */
  private getPrimaryProvider(): string {
    if (this.providerConfigs.length > 0) {
      return this.providerConfigs[0].provider;
    }
    const providers = this.registry.list();
    return providers.length > 0 ? providers[0].name : 'unknown';
  }

  /**
   * Get the primary project (for result reporting).
   */
  private getPrimaryProject(): string {
    if (this.providerConfigs.length > 0 && this.providerConfigs[0].defaultProject) {
      return this.providerConfigs[0].defaultProject;
    }
    return '';
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute a content hash for an external item.
 * Used to detect real changes from the remote side.
 * Hashes key semantic fields in a deterministic order.
 */
function computeExternalItemHash(item: ExternalTask): string {
  // Build deterministic content representation with sorted keys
  const contentFields: Record<string, unknown> = {
    assignees: [...item.assignees].sort(),
    body: item.body ?? '',
    labels: [...item.labels].sort(),
    priority: item.priority,
    state: item.state,
    title: item.title,
  };

  const hashInput = `external:${JSON.stringify(contentFields)}`;
  return createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Check if an error is likely retryable (network issues, rate limits, etc.)
 */
function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes('rate limit') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('network') ||
    message.includes('503') ||
    message.includes('429')
  );
}

/**
 * Build a standardized ExternalSyncResult.
 */
function buildResult(params: {
  pushed: number;
  pulled: number;
  skipped: number;
  conflicts: ExternalSyncConflict[];
  errors: ExternalSyncError[];
  provider: string;
  project: string;
}): ExternalSyncResult {
  return {
    success: params.errors.length === 0,
    provider: params.provider,
    project: params.project,
    adapterType: 'task' as SyncAdapterType,
    pushed: params.pushed,
    pulled: params.pulled,
    skipped: params.skipped,
    conflicts: params.conflicts,
    errors: params.errors,
  };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new SyncEngine instance.
 *
 * @param config - Sync engine configuration
 * @returns A new SyncEngine instance
 *
 * @example
 * ```typescript
 * const engine = createSyncEngine({
 *   api: quarryApi,
 *   registry: providerRegistry,
 *   settings: settingsService,
 * });
 *
 * // Push locally-changed tasks
 * const pushResult = await engine.push({ all: true });
 *
 * // Pull externally-changed items
 * const pullResult = await engine.pull();
 *
 * // Bidirectional sync
 * const syncResult = await engine.sync({ dryRun: true });
 * ```
 */
export function createSyncEngine(config: SyncEngineConfig): SyncEngine {
  return new SyncEngine(config);
}
