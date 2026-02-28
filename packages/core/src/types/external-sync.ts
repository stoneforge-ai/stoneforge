/**
 * External Sync Type Definitions
 *
 * Types for bidirectional synchronization between Stoneforge elements
 * and external services (GitHub, Linear, Notion, Slack, etc.).
 *
 * Architecture:
 * - Provider: Connection layer (auth, rate limits) for one external service
 * - Sync Adapter: Element-type-specific sync logic (tasks, documents, messages)
 * - External Items: Normalized representations of external resources
 * - Sync State: Per-element tracking of sync position and hashes
 */

import type { Timestamp } from './element.js';

// ============================================================================
// Sync Adapter Type
// ============================================================================

/**
 * Types of sync adapters a provider can support
 */
export const SyncAdapterType = {
  /** Task/issue sync (e.g., GitHub Issues, Linear) */
  TASK: 'task',
  /** Document/page sync (e.g., Notion, Obsidian) */
  DOCUMENT: 'document',
  /** Message/chat sync (e.g., Slack, Discord) */
  MESSAGE: 'message',
} as const;

export type SyncAdapterType = (typeof SyncAdapterType)[keyof typeof SyncAdapterType];

// ============================================================================
// Sync Direction
// ============================================================================

/**
 * Direction of synchronization
 */
export const SyncDirection = {
  /** Push local changes to external */
  PUSH: 'push',
  /** Pull external changes to local */
  PULL: 'pull',
  /** Sync in both directions */
  BIDIRECTIONAL: 'bidirectional',
} as const;

export type SyncDirection = (typeof SyncDirection)[keyof typeof SyncDirection];

// ============================================================================
// Conflict Strategy
// ============================================================================

/**
 * Strategies for resolving sync conflicts when both local and remote changed
 */
export const ConflictStrategy = {
  /** Compare updatedAt timestamps, most recent wins */
  LAST_WRITE_WINS: 'last_write_wins',
  /** Local version always takes precedence */
  LOCAL_WINS: 'local_wins',
  /** Remote version always takes precedence */
  REMOTE_WINS: 'remote_wins',
  /** Tag element with sync-conflict for manual resolution */
  MANUAL: 'manual',
} as const;

export type ConflictStrategy = (typeof ConflictStrategy)[keyof typeof ConflictStrategy];

// ============================================================================
// External Item Types — Normalized representations of external resources
// ============================================================================

/**
 * Normalized external task/issue — common shape across providers
 */
export interface ExternalTask {
  /** Unique identifier in the external system */
  readonly externalId: string;
  /** URL to view in external system */
  readonly url: string;
  /** Provider name (e.g., 'github', 'linear') */
  readonly provider: string;
  /** Project/repository identifier */
  readonly project: string;
  /** Issue/task title */
  readonly title: string;
  /** Issue/task body/description */
  readonly body?: string;
  /** Open/closed state */
  readonly state: 'open' | 'closed';
  /** Labels/tags */
  readonly labels: readonly string[];
  /** Assignee usernames/identifiers */
  readonly assignees: readonly string[];
  /**
   * Native priority value, normalized to Stoneforge priority (1-5).
   * Set by providers that have native priority support (e.g., Linear).
   * Providers without native priority (e.g., GitHub) leave this undefined
   * and use label-based priority instead.
   */
  readonly priority?: number;
  /** Creation timestamp (ISO 8601) */
  readonly createdAt: string;
  /** Last update timestamp (ISO 8601) */
  readonly updatedAt: string;
  /** Closure timestamp (ISO 8601) */
  readonly closedAt?: string;
  /** Raw provider response for lossless round-tripping */
  readonly raw?: Record<string, unknown>;
}

/**
 * Normalized external document/page (future)
 */
export interface ExternalDocument {
  /** Unique identifier in the external system */
  readonly externalId: string;
  /** URL to view in external system */
  readonly url: string;
  /** Provider name (e.g., 'notion', 'obsidian') */
  readonly provider: string;
  /** Project/workspace identifier */
  readonly project: string;
  /** Page/document title */
  readonly title: string;
  /** Page/document content */
  readonly content: string;
  /** Content format */
  readonly contentType: 'markdown' | 'html' | 'text';
  /** Last update timestamp (ISO 8601) */
  readonly updatedAt: string;
  /** Raw provider response for lossless round-tripping */
  readonly raw?: Record<string, unknown>;
}

/**
 * Normalized external message (future)
 */
export interface ExternalMessage {
  /** Unique identifier in the external system */
  readonly externalId: string;
  /** URL to view in external system */
  readonly url: string;
  /** Provider name (e.g., 'slack', 'discord') */
  readonly provider: string;
  /** Channel/conversation identifier */
  readonly channel: string;
  /** Sender username/identifier */
  readonly sender: string;
  /** Message content */
  readonly content: string;
  /** Message timestamp (ISO 8601) */
  readonly timestamp: string;
  /** Raw provider response for lossless round-tripping */
  readonly raw?: Record<string, unknown>;
}

// ============================================================================
// External Item Input Types — for creating/updating external resources
// ============================================================================

/**
 * Input for creating/updating an external task
 */
export interface ExternalTaskInput {
  readonly title: string;
  readonly body?: string;
  readonly state?: 'open' | 'closed';
  readonly labels?: readonly string[];
  readonly assignees?: readonly string[];
  /**
   * Native priority value as Stoneforge priority (1-5).
   * Providers with native priority support (e.g., Linear) convert this to
   * their native format (e.g., Linear 0-4). Providers without native priority
   * (e.g., GitHub) ignore this field and use label-based priority instead.
   */
  readonly priority?: number;
}

/**
 * Input for creating/updating an external document (future)
 */
export interface ExternalDocumentInput {
  readonly title: string;
  readonly content: string;
  readonly contentType?: 'markdown' | 'html' | 'text';
  /**
   * Optional library path for organizing documents into subdirectories.
   * Consists of slugified library names joined by '/', representing the
   * document's position in the library hierarchy.
   * Example: 'documentation/api-reference'
   *
   * Providers that support directory-based organization (e.g., folder)
   * use this to place documents in appropriate subdirectories.
   */
  readonly libraryPath?: string;
}

/**
 * Input for creating/sending an external message (future)
 */
export interface ExternalMessageInput {
  readonly content: string;
  readonly sender?: string;
}

// ============================================================================
// Field Mapping Configuration
// ============================================================================

/**
 * Describes how a single field maps between Stoneforge and external system
 */
export interface FieldMapping {
  /** Stoneforge field path */
  readonly localField: string;
  /** External system field path */
  readonly externalField: string;
  /** Direction of this field mapping */
  readonly direction: SyncDirection;
  /** Transform function name for local→external conversion */
  readonly toExternal?: string;
  /** Transform function name for external→local conversion */
  readonly toLocal?: string;
}

/**
 * Configuration for task field mapping between Stoneforge and a provider
 */
export interface TaskFieldMapConfig {
  /** Provider this mapping applies to */
  readonly provider: string;
  /** Individual field mappings */
  readonly fields: readonly FieldMapping[];
}

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Shared configuration for connecting to an external provider
 */
export interface ProviderConfig {
  /** Provider name (e.g., 'github', 'linear') */
  readonly provider: string;
  /** Authentication token */
  readonly token?: string;
  /** Base URL for API requests (e.g., 'https://api.github.com') */
  readonly apiBaseUrl?: string;
  /** Default project/repository for operations */
  readonly defaultProject?: string;
}

// ============================================================================
// Sync Adapters
// ============================================================================

/**
 * Task-specific sync adapter — maps between Stoneforge tasks and external issues
 */
export interface TaskSyncAdapter {
  /** Fetch a single issue by external ID */
  getIssue(project: string, externalId: string): Promise<ExternalTask | null>;
  /** List issues updated since a given timestamp */
  listIssuesSince(project: string, since: Timestamp): Promise<ExternalTask[]>;
  /** Create a new issue in the external system */
  createIssue(project: string, issue: ExternalTaskInput): Promise<ExternalTask>;
  /** Update an existing issue in the external system */
  updateIssue(
    project: string,
    externalId: string,
    updates: Partial<ExternalTaskInput>
  ): Promise<ExternalTask>;
  /** Get the field mapping configuration for this adapter */
  getFieldMapConfig(): TaskFieldMapConfig;
}

/**
 * Document-specific sync adapter (future — interface only)
 */
export interface DocumentSyncAdapter {
  /** Fetch a single page by external ID */
  getPage(project: string, externalId: string): Promise<ExternalDocument | null>;
  /** List pages updated since a given timestamp */
  listPagesSince(project: string, since: Timestamp): Promise<ExternalDocument[]>;
  /** Create a new page in the external system */
  createPage(project: string, page: ExternalDocumentInput): Promise<ExternalDocument>;
  /** Update an existing page in the external system */
  updatePage(
    project: string,
    externalId: string,
    updates: Partial<ExternalDocumentInput>
  ): Promise<ExternalDocument>;
}

/**
 * Message-specific sync adapter (future — interface only)
 */
export interface MessageSyncAdapter {
  /** List messages since a given timestamp */
  listMessagesSince(channel: string, since: Timestamp): Promise<ExternalMessage[]>;
  /** Send a message to the external system */
  sendMessage(channel: string, message: ExternalMessageInput): Promise<ExternalMessage>;
}

// ============================================================================
// External Provider
// ============================================================================

/**
 * A provider handles auth and API access for one external service.
 * It bundles connection concerns and one or more sync adapters.
 */
export interface ExternalProvider {
  /** Machine-readable provider name (e.g., 'github', 'linear', 'notion') */
  readonly name: string;
  /** Human-readable display name (e.g., 'GitHub', 'Linear') */
  readonly displayName: string;

  /** Test whether a connection to the provider is valid */
  testConnection(config: ProviderConfig): Promise<boolean>;

  /** Which adapter types this provider supports (e.g., ['task'] for GitHub v1) */
  readonly supportedAdapters: readonly SyncAdapterType[];

  /** Get the task sync adapter (returns undefined if not supported) */
  getTaskAdapter?(): TaskSyncAdapter;
  /** Get the document sync adapter (returns undefined if not supported) */
  getDocumentAdapter?(): DocumentSyncAdapter;
  /** Get the message sync adapter (returns undefined if not supported) */
  getMessageAdapter?(): MessageSyncAdapter;
}

// ============================================================================
// Sync State — stored in element.metadata._externalSync
// ============================================================================

/**
 * Per-element sync state, stored in element.metadata._externalSync.
 * Tracks the sync position and content hashes for change detection.
 */
export interface ExternalSyncState {
  /** Provider name (e.g., 'github') */
  readonly provider: string;
  /** Project/repository in the external system */
  readonly project: string;
  /** Unique identifier in the external system */
  readonly externalId: string;
  /** URL to view in external system */
  readonly url: string;
  /** Last time local changes were pushed to external */
  readonly lastPushedAt?: Timestamp;
  /** Last time external changes were pulled to local */
  readonly lastPulledAt?: Timestamp;
  /** Content hash at last push (for change detection) */
  readonly lastPushedHash?: string;
  /** Content hash at last pull (for change detection) */
  readonly lastPulledHash?: string;
  /** Sync direction for this element */
  readonly direction: SyncDirection;
  /** Which adapter type manages this sync */
  readonly adapterType: SyncAdapterType;
}

// ============================================================================
// Sync Result Types
// ============================================================================

/**
 * Result of a sync operation (push, pull, or bidirectional)
 */
export interface ExternalSyncResult {
  /** Whether the sync completed successfully */
  readonly success: boolean;
  /** Provider that was synced */
  readonly provider: string;
  /** Project/repository that was synced */
  readonly project: string;
  /** Adapter type used */
  readonly adapterType: SyncAdapterType;
  /** Number of items pushed to external */
  readonly pushed: number;
  /** Number of items pulled from external */
  readonly pulled: number;
  /** Number of items skipped (no changes) */
  readonly skipped: number;
  /** Conflicts that occurred during sync */
  readonly conflicts: readonly ExternalSyncConflict[];
  /** Errors that occurred during sync */
  readonly errors: readonly ExternalSyncError[];
}

/**
 * A conflict detected during sync — both local and remote changed
 */
export interface ExternalSyncConflict {
  /** Local element ID */
  readonly elementId: string;
  /** External item ID */
  readonly externalId: string;
  /** Provider name */
  readonly provider: string;
  /** Project/repository */
  readonly project: string;
  /** Local updated timestamp */
  readonly localUpdatedAt: Timestamp;
  /** Remote updated timestamp */
  readonly remoteUpdatedAt: string;
  /** Strategy used to resolve (or 'manual' if unresolved) */
  readonly strategy: ConflictStrategy;
  /** Whether the conflict was auto-resolved */
  readonly resolved: boolean;
  /** Which side won if resolved (undefined if unresolved) */
  readonly winner?: 'local' | 'remote';
}

/**
 * An error that occurred during sync for a specific item
 */
export interface ExternalSyncError {
  /** Local element ID (if applicable) */
  readonly elementId?: string;
  /** External item ID (if applicable) */
  readonly externalId?: string;
  /** Provider name */
  readonly provider: string;
  /** Project/repository */
  readonly project: string;
  /** Error message */
  readonly message: string;
  /** Error code from provider */
  readonly code?: string;
  /** Whether the error is retryable */
  readonly retryable: boolean;
}

// ============================================================================
// Validation Functions
// ============================================================================

/** All valid sync adapter type values */
export const VALID_SYNC_ADAPTER_TYPES = Object.values(SyncAdapterType);

/** All valid sync direction values */
export const VALID_SYNC_DIRECTIONS = Object.values(SyncDirection);

/** All valid conflict strategy values */
export const VALID_CONFLICT_STRATEGIES = Object.values(ConflictStrategy);

/**
 * Checks if a value is a valid SyncAdapterType
 */
export function isValidSyncAdapterType(value: unknown): value is SyncAdapterType {
  return typeof value === 'string' && VALID_SYNC_ADAPTER_TYPES.includes(value as SyncAdapterType);
}

/**
 * Checks if a value is a valid SyncDirection
 */
export function isValidSyncDirection(value: unknown): value is SyncDirection {
  return typeof value === 'string' && VALID_SYNC_DIRECTIONS.includes(value as SyncDirection);
}

/**
 * Checks if a value is a valid ConflictStrategy
 */
export function isValidConflictStrategy(value: unknown): value is ConflictStrategy {
  return typeof value === 'string' && VALID_CONFLICT_STRATEGIES.includes(value as ConflictStrategy);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for ExternalTask
 */
export function isExternalTask(value: unknown): value is ExternalTask {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.externalId === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.provider === 'string' &&
    typeof obj.project === 'string' &&
    typeof obj.title === 'string' &&
    (obj.state === 'open' || obj.state === 'closed') &&
    Array.isArray(obj.labels) &&
    Array.isArray(obj.assignees) &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
}

/**
 * Type guard for ExternalDocument
 */
export function isExternalDocument(value: unknown): value is ExternalDocument {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.externalId === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.provider === 'string' &&
    typeof obj.project === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.content === 'string' &&
    (obj.contentType === 'markdown' || obj.contentType === 'html' || obj.contentType === 'text') &&
    typeof obj.updatedAt === 'string'
  );
}

/**
 * Type guard for ExternalMessage
 */
export function isExternalMessage(value: unknown): value is ExternalMessage {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.externalId === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.provider === 'string' &&
    typeof obj.channel === 'string' &&
    typeof obj.sender === 'string' &&
    typeof obj.content === 'string' &&
    typeof obj.timestamp === 'string'
  );
}

/**
 * Type guard for ExternalSyncState
 */
export function isExternalSyncState(value: unknown): value is ExternalSyncState {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.provider === 'string' &&
    typeof obj.project === 'string' &&
    typeof obj.externalId === 'string' &&
    typeof obj.url === 'string' &&
    isValidSyncDirection(obj.direction) &&
    isValidSyncAdapterType(obj.adapterType)
  );
}

/**
 * Type guard for ProviderConfig
 */
export function isProviderConfig(value: unknown): value is ProviderConfig {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.provider === 'string' &&
    (obj.token === undefined || typeof obj.token === 'string') &&
    (obj.apiBaseUrl === undefined || typeof obj.apiBaseUrl === 'string') &&
    (obj.defaultProject === undefined || typeof obj.defaultProject === 'string')
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extracts the ExternalSyncState from an element's metadata, if present
 */
export function getExternalSyncState(
  metadata: Record<string, unknown>
): ExternalSyncState | undefined {
  const syncState = metadata._externalSync;
  if (syncState === undefined || syncState === null) return undefined;
  if (isExternalSyncState(syncState)) return syncState;
  return undefined;
}

/**
 * Returns metadata with the ExternalSyncState set
 */
export function setExternalSyncState(
  metadata: Record<string, unknown>,
  syncState: ExternalSyncState
): Record<string, unknown> {
  return { ...metadata, _externalSync: syncState };
}

/**
 * Returns metadata with the ExternalSyncState removed
 */
export function removeExternalSyncState(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const { _externalSync: _, ...rest } = metadata;
  return rest;
}

/**
 * Checks if an element has external sync state
 */
export function hasExternalSyncState(metadata: Record<string, unknown>): boolean {
  return getExternalSyncState(metadata) !== undefined;
}

/**
 * Gets a display string for sync direction
 */
export function getSyncDirectionDisplayName(direction: SyncDirection): string {
  switch (direction) {
    case SyncDirection.PUSH:
      return 'Push';
    case SyncDirection.PULL:
      return 'Pull';
    case SyncDirection.BIDIRECTIONAL:
      return 'Bidirectional';
    default:
      return direction;
  }
}

/**
 * Gets a display string for conflict strategy
 */
export function getConflictStrategyDisplayName(strategy: ConflictStrategy): string {
  switch (strategy) {
    case ConflictStrategy.LAST_WRITE_WINS:
      return 'Last Write Wins';
    case ConflictStrategy.LOCAL_WINS:
      return 'Local Wins';
    case ConflictStrategy.REMOTE_WINS:
      return 'Remote Wins';
    case ConflictStrategy.MANUAL:
      return 'Manual';
    default:
      return strategy;
  }
}

/**
 * Gets a display string for sync adapter type
 */
export function getSyncAdapterTypeDisplayName(adapterType: SyncAdapterType): string {
  switch (adapterType) {
    case SyncAdapterType.TASK:
      return 'Task';
    case SyncAdapterType.DOCUMENT:
      return 'Document';
    case SyncAdapterType.MESSAGE:
      return 'Message';
    default:
      return adapterType;
  }
}
