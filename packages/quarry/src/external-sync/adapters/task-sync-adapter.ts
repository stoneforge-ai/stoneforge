/**
 * Task Sync Adapter Utilities
 *
 * Shared field mapping logic for converting between Stoneforge tasks and
 * external task representations (e.g., GitHub Issues, Linear issues).
 *
 * These utilities are provider-agnostic — each provider supplies its own
 * TaskSyncFieldMapConfig that tells the adapter how to map statuses,
 * priorities, task types, and labels to/from the external system.
 *
 * Key functions:
 * - taskToExternalTask: Convert a Stoneforge Task → ExternalTaskInput for push
 * - externalTaskToTaskUpdates: Convert an ExternalTask → Partial<Task> for pull
 */

import type {
  Task,
  TaskStatus,
  Priority,
  TaskTypeValue,
  DocumentId,
  Document,
  Element,
  EntityId,
  ElementId,
} from '@stoneforge/core';
import type { ExternalTask, ExternalTaskInput } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { GITHUB_FIELD_MAP_CONFIG } from '../providers/github/github-field-map.js';
import { createLinearSyncFieldMapConfig } from '../providers/linear/linear-field-map.js';

// ============================================================================
// Minimal API Interface
// ============================================================================

/**
 * Minimal API interface used by task sync adapter utilities.
 * Only requires `get()` for description hydration.
 * Both QuarryAPI and SyncEngineAPI satisfy this interface structurally.
 */
export interface TaskSyncAPI {
  get<T extends Element>(id: ElementId): Promise<T | null>;
}

// ============================================================================
// Task Sync Field Map Configuration
// ============================================================================

/**
 * Provider-specific configuration for mapping task fields between
 * Stoneforge and an external system.
 *
 * Each provider (GitHub, Linear, etc.) supplies its own config that
 * describes how Stoneforge concepts map to the provider's label/state model.
 */
export interface TaskSyncFieldMapConfig {
  /**
   * Maps Stoneforge priority values to external label strings.
   * e.g., { 1: 'priority:critical', 2: 'priority:high', 3: 'priority:medium', ... }
   */
  readonly priorityLabels: Record<Priority, string>;

  /**
   * Maps Stoneforge task type values to external label strings.
   * e.g., { bug: 'type:bug', feature: 'type:feature', task: 'type:task', chore: 'type:chore' }
   */
  readonly taskTypeLabels: Record<TaskTypeValue, string>;

  /**
   * Optional: Maps Stoneforge TaskStatus values to external label strings.
   * When present, status labels are pushed alongside priority and type labels,
   * providing granular status visibility on external systems that only have
   * binary open/closed states (e.g., GitHub).
   *
   * Optional because some providers (e.g., Linear) map status natively
   * via workflow states and don't need label-based status mapping.
   *
   * e.g., { open: 'status:open', in_progress: 'status:in-progress', ... }
   */
  readonly statusLabels?: Record<string, string>;

  /**
   * Prefix for sync-managed labels in the external system.
   * Labels with this prefix are managed by the sync system and will be
   * added/removed automatically. User labels without this prefix are preserved.
   * e.g., 'sf:' would produce labels like 'sf:priority:critical', 'sf:type:bug'
   */
  readonly syncLabelPrefix: string;

  /**
   * Converts a Stoneforge TaskStatus to the external system's state.
   * Most external systems only have 'open' and 'closed' states.
   * e.g., 'in_progress' → 'open', 'closed' → 'closed'
   */
  readonly statusToState: (status: TaskStatus) => 'open' | 'closed';

  /**
   * Converts an external state + labels back to a Stoneforge TaskStatus.
   * Labels are provided to allow more granular status inference
   * (e.g., external 'open' + label 'status:in-progress' → 'in_progress').
   */
  readonly stateToStatus: (state: 'open' | 'closed', labels: string[]) => TaskStatus;
}

// ============================================================================
// Push: Stoneforge Task → External Task
// ============================================================================

/**
 * Converts a Stoneforge Task into an ExternalTaskInput for creating/updating
 * an issue in an external system.
 *
 * Handles:
 * - Title mapping (1:1)
 * - Status → state mapping via config.statusToState
 * - Tags → labels (user tags preserved, sync-managed labels added)
 * - Priority → label via config.priorityLabels
 * - Task type → label via config.taskTypeLabels
 * - Description hydration from descriptionRef document via api.get()
 *
 * Note: Assignees are intentionally NOT written to external systems.
 * Stoneforge assignees are ephemeral agents (e.g., el-xxxx) that don't
 * correspond to valid users on external platforms like GitHub.
 *
 * @param task - The Stoneforge task to convert
 * @param config - Provider-specific field mapping configuration
 * @param api - API with get() for hydrating description documents
 * @returns ExternalTaskInput ready for the provider adapter
 */
export async function taskToExternalTask(
  task: Task,
  config: TaskSyncFieldMapConfig,
  api: TaskSyncAPI
): Promise<ExternalTaskInput> {
  // Map title (1:1)
  const title = task.title;

  // Map status → state
  const state = config.statusToState(task.status);

  // Build labels from sync-managed fields + user tags
  const labels = buildExternalLabels(task, config);

  // Hydrate description from descriptionRef document
  const body = await hydrateDescription(task.descriptionRef, api);

  return {
    title,
    body,
    state,
    labels,
    // Assignees are intentionally omitted — Stoneforge assignees are ephemeral
    // agents (e.g., el-xxxx) that don't map to valid external system users.
    assignees: undefined,
    priority: task.priority,
  };
}

// ============================================================================
// Pull: External Task → Stoneforge Task Updates
// ============================================================================

/**
 * Converts an ExternalTask into a partial Task update object for applying
 * external changes to a local Stoneforge task.
 *
 * Handles:
 * - Title mapping (1:1)
 * - State + labels → status mapping via config.stateToStatus
 * - Labels → priority, taskType, tags (separating sync-managed from user labels)
 * - Assignees (first assignee mapped if present)
 *
 * If existingTask is provided, only changed fields are returned (diff mode).
 * If existingTask is undefined, all fields are returned (create mode).
 *
 * Note: Description (body) handling is NOT included in the returned partial.
 * The caller (sync engine) is responsible for creating/updating the description
 * Document and linking via descriptionRef, since that requires document creation
 * which is a separate API operation.
 *
 * @param externalTask - The external task to convert
 * @param existingTask - The existing local task (undefined for new tasks)
 * @param config - Provider-specific field mapping configuration
 * @returns Partial<Task> with only the changed fields (or all fields if no existingTask)
 */
export function externalTaskToTaskUpdates(
  externalTask: ExternalTask,
  existingTask: Task | undefined,
  config: TaskSyncFieldMapConfig
): Partial<Task> {
  // Parse external labels into structured data
  const parsed = parseExternalLabels(externalTask.labels, config);

  // Map state + labels → status
  const status = config.stateToStatus(externalTask.state, [...externalTask.labels]);

  // Map priority: prefer native priority from the ExternalTask (set by providers
  // with native priority support like Linear), fall back to label-based extraction,
  // then default to medium (3) if neither is available.
  const priority = externalTask.priority ?? parsed.priority ?? 3;

  // Map task type from labels (default to 'task' if not found)
  const taskType = parsed.taskType ?? 'task';

  // User tags = all labels that aren't sync-managed
  const tags = parsed.userTags;

  // Build the full update object
  const fullUpdate: Partial<Task> = {
    title: externalTask.title,
    status,
    priority: priority as Priority,
    taskType: taskType as TaskTypeValue,
    tags,
  };

  // Map first assignee if present
  if (externalTask.assignees.length > 0) {
    // Store assignee name in metadata for resolution by the sync engine
    // The sync engine is responsible for looking up the EntityId
    fullUpdate.metadata = {
      _pendingAssignee: externalTask.assignees[0],
    };
  }

  // Map external ref URL
  fullUpdate.externalRef = externalTask.url;

  // If no existing task, return full create input
  if (!existingTask) {
    return fullUpdate;
  }

  // Diff mode: only return changed fields
  return diffTaskUpdates(existingTask, fullUpdate);
}

// ============================================================================
// Label Building (Push)
// ============================================================================

/**
 * Builds the complete set of external labels for a task.
 *
 * Combines:
 * 1. Sync-managed priority label (prefixed)
 * 2. Sync-managed task type label (prefixed)
 * 3. Sync-managed status label (prefixed, when config.statusLabels is present)
 * 4. User tags from the task (not prefixed — these are user-owned)
 */
export function buildExternalLabels(
  task: Task,
  config: TaskSyncFieldMapConfig
): string[] {
  const labels: string[] = [];
  const prefix = config.syncLabelPrefix;

  // Add priority label
  const priorityLabel = config.priorityLabels[task.priority];
  if (priorityLabel) {
    labels.push(`${prefix}${priorityLabel}`);
  }

  // Add task type label
  const taskTypeLabel = config.taskTypeLabels[task.taskType];
  if (taskTypeLabel) {
    labels.push(`${prefix}${taskTypeLabel}`);
  }

  // Add status label (when config.statusLabels is present)
  if (config.statusLabels) {
    const statusLabel = config.statusLabels[task.status];
    if (statusLabel) {
      labels.push(`${prefix}${statusLabel}`);
    }
  }

  // Add user tags (not prefixed — these are user-managed)
  for (const tag of task.tags) {
    labels.push(tag);
  }

  return labels;
}

// ============================================================================
// Label Parsing (Pull)
// ============================================================================

/**
 * Result of parsing external labels into structured task fields
 */
export interface ParsedExternalLabels {
  /** Extracted priority value, or undefined if no priority label found */
  priority: Priority | undefined;
  /** Extracted task type value, or undefined if no task type label found */
  taskType: TaskTypeValue | undefined;
  /** Extracted status value, or undefined if no status label found */
  status: TaskStatus | undefined;
  /** Labels that are not sync-managed (user tags) */
  userTags: string[];
}

/**
 * Parses external labels into structured task field values.
 *
 * Separates sync-managed labels (prefixed) from user labels,
 * and extracts priority, task type, and status values from the managed labels.
 */
export function parseExternalLabels(
  labels: readonly string[],
  config: TaskSyncFieldMapConfig
): ParsedExternalLabels {
  const prefix = config.syncLabelPrefix;
  let priority: Priority | undefined;
  let taskType: TaskTypeValue | undefined;
  let status: TaskStatus | undefined;
  const userTags: string[] = [];

  // Build reverse lookup maps for priority and task type
  const priorityByLabel = buildReverseLookup(config.priorityLabels);
  const taskTypeByLabel = buildReverseLookup(config.taskTypeLabels);

  // Build reverse lookup for status labels (when present)
  const statusByLabel = config.statusLabels
    ? buildReverseLookup(config.statusLabels)
    : undefined;

  for (const label of labels) {
    if (label.startsWith(prefix)) {
      // This is a sync-managed label — extract the value part
      const value = label.slice(prefix.length);

      // Check if it's a priority label
      if (priorityByLabel.has(value)) {
        priority = priorityByLabel.get(value)! as Priority;
        continue;
      }

      // Check if it's a task type label
      if (taskTypeByLabel.has(value)) {
        taskType = taskTypeByLabel.get(value)! as TaskTypeValue;
        continue;
      }

      // Check if it's a status label
      if (statusByLabel && statusByLabel.has(value)) {
        status = statusByLabel.get(value)! as TaskStatus;
        continue;
      }

      // Sync-managed label we don't recognize — skip it
      // (could be from a newer version or a different adapter)
      continue;
    }

    // Not a sync-managed label — treat as user tag
    userTags.push(label);
  }

  return { priority, taskType, status, userTags };
}

// ============================================================================
// Description Handling
// ============================================================================

/**
 * Hydrates a task's description from its descriptionRef document.
 *
 * If the task has a descriptionRef, fetches the document via the API
 * and returns its content as the body string. Returns undefined if
 * no descriptionRef is set or the document is not found.
 */
export async function hydrateDescription(
  descriptionRef: DocumentId | undefined,
  api: TaskSyncAPI
): Promise<string | undefined> {
  if (!descriptionRef) {
    return undefined;
  }

  const doc = await api.get<Document>(descriptionRef as unknown as ElementId);
  if (!doc || doc.type !== 'document') {
    return undefined;
  }

  return doc.content || undefined;
}

/**
 * Resolves task assignee to an external-friendly name.
 *
 * @deprecated No longer used — Stoneforge assignees are ephemeral agents
 * that don't map to valid users on external platforms. Assignee writing
 * to external systems has been removed. This function is kept temporarily
 * for reference but will be removed in a future cleanup.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function resolveAssignees(
  task: Task,
  api: TaskSyncAPI
): Promise<string[]> {
  if (!task.assignee) {
    return [];
  }

  const entity = await api.get(task.assignee as unknown as ElementId);
  if (!entity || entity.type !== 'entity') {
    return [];
  }

  // Entity has a 'name' field
  const name = (entity as unknown as Record<string, unknown>).name;
  if (typeof name === 'string') {
    return [name];
  }

  return [];
}

// ============================================================================
// Diff Utilities
// ============================================================================

/**
 * Compares a full update against an existing task and returns only
 * the fields that actually changed.
 *
 * This prevents unnecessary updates when pulling changes from external
 * systems where the data hasn't actually changed.
 */
export function diffTaskUpdates(
  existingTask: Task,
  fullUpdate: Partial<Task>
): Partial<Task> {
  const diff: Partial<Task> = {};

  if (fullUpdate.title !== undefined && fullUpdate.title !== existingTask.title) {
    diff.title = fullUpdate.title;
  }

  if (fullUpdate.status !== undefined && fullUpdate.status !== existingTask.status) {
    diff.status = fullUpdate.status;
  }

  if (fullUpdate.priority !== undefined && fullUpdate.priority !== existingTask.priority) {
    diff.priority = fullUpdate.priority;
  }

  if (fullUpdate.taskType !== undefined && fullUpdate.taskType !== existingTask.taskType) {
    diff.taskType = fullUpdate.taskType;
  }

  if (fullUpdate.tags !== undefined && !arraysEqual(fullUpdate.tags, existingTask.tags)) {
    diff.tags = fullUpdate.tags;
  }

  if (fullUpdate.externalRef !== undefined && fullUpdate.externalRef !== existingTask.externalRef) {
    diff.externalRef = fullUpdate.externalRef;
  }

  // Include metadata if there's a pending assignee
  if (fullUpdate.metadata !== undefined) {
    const pendingAssignee = (fullUpdate.metadata as Record<string, unknown>)?._pendingAssignee;
    if (pendingAssignee !== undefined) {
      diff.metadata = fullUpdate.metadata;
    }
  }

  return diff;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Builds a reverse lookup map from a Record<K, V> to Map<V, K>.
 * Used to look up priority/task type values from their label strings.
 */
function buildReverseLookup<K extends string | number, V extends string>(
  record: Record<K, V>
): Map<V, K> {
  const map = new Map<V, K>();
  for (const [key, value] of Object.entries(record)) {
    // Keys from Record<Priority, string> come as strings from Object.entries
    // Need to convert numeric keys back to numbers
    const typedKey = isNaN(Number(key)) ? key : Number(key);
    map.set(value as V, typedKey as K);
  }
  return map;
}

/**
 * Compares two arrays for shallow equality (order-sensitive).
 */
function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  // Sort copies for order-independent comparison
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

// ============================================================================
// Provider Field Map Config Lookup
// ============================================================================

/**
 * Returns the TaskSyncFieldMapConfig for a given provider name.
 *
 * Shared utility used by both the CLI link-all command and the sync engine
 * push path to get the correct field mapping for a provider.
 *
 * @param providerName - The provider name (e.g., 'github', 'linear')
 * @returns The provider-specific TaskSyncFieldMapConfig
 */
export function getFieldMapConfigForProvider(providerName: string): TaskSyncFieldMapConfig {
  switch (providerName) {
    case 'github':
      return GITHUB_FIELD_MAP_CONFIG;
    case 'linear':
      return createLinearSyncFieldMapConfig();
    default:
      // Fallback to GitHub-style config for unknown providers
      return GITHUB_FIELD_MAP_CONFIG;
  }
}
