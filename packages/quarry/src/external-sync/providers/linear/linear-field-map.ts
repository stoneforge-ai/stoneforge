/**
 * Linear Field Mapping Configuration
 *
 * Defines how Stoneforge task fields map to Linear issue fields.
 *
 * Key differences from GitHub:
 * - Linear has native priority (0-4) — no label-based priority convention needed
 * - Linear has workflow state types — status mapping uses state types, not labels
 * - Task types use the same label convention as GitHub (type:bug, etc.)
 *
 * Priority mapping (Linear 0-4 ↔ Stoneforge 1-5):
 *   Linear 1 (Urgent)      ↔ Stoneforge 1 (critical)
 *   Linear 2 (High)        ↔ Stoneforge 2 (high)
 *   Linear 3 (Medium)      ↔ Stoneforge 3 (medium)
 *   Linear 4 (Low)         ↔ Stoneforge 4 (low)
 *   Linear 0 (No priority) ↔ Stoneforge 5 (minimal)
 *
 * Status mapping via workflow state TYPE (not name):
 *   Pull: triage/backlog → backlog, unstarted → open, started → in_progress,
 *         completed → closed, canceled → closed (closeReason: "canceled")
 *   Push: open → unstarted, in_progress/review → started,
 *         blocked → started (add "blocked" label), deferred/backlog → backlog,
 *         closed → completed
 */

import type { TaskStatus, Priority } from '@stoneforge/core';
import type { TaskFieldMapConfig } from '@stoneforge/core';
import type { TaskSyncFieldMapConfig } from '../../adapters/task-sync-adapter.js';
import type { LinearWorkflowState } from './linear-types.js';

// ============================================================================
// Status Label Mapping (for adapter-injected status labels)
// ============================================================================

/**
 * Maps Stoneforge TaskStatus values to label strings.
 * Linear doesn't natively use label-based status, but the adapter injects
 * sf:status:* labels into ExternalTask.labels to communicate granular workflow
 * state types through the generic field mapping system.
 *
 * This keeps the sync engine provider-agnostic — it reads status from labels
 * the same way for both GitHub (user-managed labels) and Linear (adapter-injected).
 */
export const LINEAR_STATUS_LABELS: Record<string, string> = {
  open: 'status:open',
  in_progress: 'status:in-progress',
  blocked: 'status:blocked',
  deferred: 'status:deferred',
  backlog: 'status:backlog',
  review: 'status:review',
  closed: 'status:closed',
  tombstone: 'status:tombstone',
};

// ============================================================================
// Priority Mapping
// ============================================================================

/**
 * Maps Stoneforge priority (1-5) to Linear priority (0-4).
 *
 * Stoneforge 1 (critical) → Linear 1 (Urgent)
 * Stoneforge 2 (high)     → Linear 2 (High)
 * Stoneforge 3 (medium)   → Linear 3 (Medium)
 * Stoneforge 4 (low)      → Linear 4 (Low)
 * Stoneforge 5 (minimal)  → Linear 0 (No priority)
 */
export function stoneforgePriorityToLinear(priority: Priority): number {
  switch (priority) {
    case 1:
      return 1; // critical → Urgent
    case 2:
      return 2; // high → High
    case 3:
      return 3; // medium → Medium
    case 4:
      return 4; // low → Low
    case 5:
      return 0; // minimal → No priority
    default:
      return 3; // fallback: Medium
  }
}

/**
 * Maps Linear priority (0-4) to Stoneforge priority (1-5).
 *
 * Linear 1 (Urgent)      → Stoneforge 1 (critical)
 * Linear 2 (High)        → Stoneforge 2 (high)
 * Linear 3 (Medium)      → Stoneforge 3 (medium)
 * Linear 4 (Low)         → Stoneforge 4 (low)
 * Linear 0 (No priority) → Stoneforge 5 (minimal)
 */
export function linearPriorityToStoneforge(priority: number): Priority {
  switch (priority) {
    case 1:
      return 1 as Priority; // Urgent → critical
    case 2:
      return 2 as Priority; // High → high
    case 3:
      return 3 as Priority; // Medium → medium
    case 4:
      return 4 as Priority; // Low → low
    case 0:
      return 5 as Priority; // No priority → minimal
    default:
      return 3 as Priority; // fallback: medium
  }
}

// ============================================================================
// Status / Workflow State Mapping
// ============================================================================

/**
 * Linear workflow state type as used in the API.
 */
export type LinearStateType = LinearWorkflowState['type'];

/**
 * Maps a Linear workflow state type to a Stoneforge TaskStatus.
 *
 * Pull direction:
 *   triage    → backlog
 *   backlog   → backlog
 *   unstarted → open
 *   started   → in_progress
 *   completed → closed
 *   canceled  → closed
 */
export function linearStateTypeToStatus(stateType: LinearStateType): {
  status: TaskStatus;
  closeReason?: string;
} {
  switch (stateType) {
    case 'triage':
      return { status: 'backlog' as TaskStatus };
    case 'backlog':
      return { status: 'backlog' as TaskStatus };
    case 'unstarted':
      return { status: 'open' as TaskStatus };
    case 'started':
      return { status: 'in_progress' as TaskStatus };
    case 'completed':
      return { status: 'closed' as TaskStatus };
    case 'canceled':
      return { status: 'closed' as TaskStatus, closeReason: 'canceled' };
    default:
      return { status: 'open' as TaskStatus };
  }
}

/**
 * Maps a Stoneforge TaskStatus to a Linear workflow state type.
 *
 * Push direction:
 *   open        → unstarted
 *   in_progress → started
 *   review      → started
 *   blocked     → started (caller should add "blocked" label)
 *   deferred    → backlog
 *   backlog     → backlog
 *   closed      → completed
 *   tombstone   → completed (treat as done)
 */
export function statusToLinearStateType(status: TaskStatus): LinearStateType {
  switch (status) {
    case 'open':
      return 'unstarted';
    case 'in_progress':
      return 'started';
    case 'review':
      return 'started';
    case 'blocked':
      return 'started';
    case 'deferred':
      return 'backlog';
    case 'backlog':
      return 'backlog';
    case 'closed':
      return 'completed';
    case 'tombstone':
      return 'completed';
    default:
      return 'unstarted';
  }
}

/**
 * Returns true if the given Stoneforge status should add a "blocked" label
 * in Linear (since Linear has no native blocked state).
 */
export function shouldAddBlockedLabel(status: TaskStatus): boolean {
  return status === 'blocked';
}

/**
 * Maps a Linear workflow state type to a sync label string (sf:status:*).
 *
 * The Linear adapter injects this label into ExternalTask.labels so the
 * generic field mapping system (stateToStatus) can extract granular statuses
 * without the sync engine needing to know about Linear-specific state types.
 *
 * Mapping:
 *   triage    → sf:status:backlog
 *   backlog   → sf:status:backlog
 *   unstarted → sf:status:open
 *   started   → sf:status:in-progress
 *   completed → sf:status:closed
 *   canceled  → sf:status:closed
 */
export function linearStateTypeToStatusLabel(stateType: LinearStateType): string {
  switch (stateType) {
    case 'triage':
      return 'sf:status:backlog';
    case 'backlog':
      return 'sf:status:backlog';
    case 'unstarted':
      return 'sf:status:open';
    case 'started':
      return 'sf:status:in-progress';
    case 'completed':
      return 'sf:status:closed';
    case 'canceled':
      return 'sf:status:closed';
    default:
      return 'sf:status:open';
  }
}

// ============================================================================
// TaskFieldMapConfig (for TaskSyncAdapter.getFieldMapConfig())
// ============================================================================

/**
 * Creates the Linear-specific TaskFieldMapConfig.
 *
 * This config describes the field mapping at the type level. The actual
 * runtime mapping logic lives in the adapter and the priority/status
 * functions above.
 */
export function createLinearFieldMapConfig(): TaskFieldMapConfig {
  return {
    provider: 'linear',
    fields: [
      {
        localField: 'title',
        externalField: 'title',
        direction: 'bidirectional',
      },
      {
        localField: 'descriptionRef',
        externalField: 'description',
        direction: 'bidirectional',
        toExternal: 'hydrateDescription',
        toLocal: 'createDescriptionDoc',
      },
      {
        localField: 'status',
        externalField: 'state',
        direction: 'bidirectional',
        toExternal: 'statusToLinearState',
        toLocal: 'linearStateToStatus',
      },
      {
        localField: 'priority',
        externalField: 'priority',
        direction: 'bidirectional',
        toExternal: 'stoneforgePriorityToLinear',
        toLocal: 'linearPriorityToStoneforge',
      },
      {
        localField: 'tags',
        externalField: 'labels',
        direction: 'bidirectional',
      },
      {
        localField: 'taskType',
        externalField: 'labels',
        direction: 'bidirectional',
        toExternal: 'taskTypeToLabel',
        toLocal: 'labelToTaskType',
      },
      {
        localField: 'assignee',
        externalField: 'assignee',
        direction: 'bidirectional',
      },
    ],
  };
}

// ============================================================================
// TaskSyncFieldMapConfig (for shared adapter utilities)
// ============================================================================

/**
 * Creates the Linear-specific TaskSyncFieldMapConfig used by the shared
 * task-sync-adapter utilities (taskToExternalTask, externalTaskToTaskUpdates).
 *
 * Linear has native priority, so priorityLabels are set to empty strings
 * (priority is mapped directly via the numeric field, not via labels).
 * The adapter handles priority conversion separately.
 *
 * Status mapping uses adapter-injected sf:status:* labels. The Linear adapter
 * injects these labels based on the workflow state type (e.g., started →
 * sf:status:in-progress), allowing the generic stateToStatus function to
 * extract granular statuses without coupling the sync engine to Linear.
 */
export function createLinearSyncFieldMapConfig(): TaskSyncFieldMapConfig {
  return {
    // Linear has native priority — we don't use label-based priority.
    // These are set to empty strings; the adapter maps priority directly.
    priorityLabels: {
      1: '',
      2: '',
      3: '',
      4: '',
      5: '',
    } as Record<Priority, string>,

    taskTypeLabels: {
      bug: 'type:bug',
      feature: 'type:feature',
      task: 'type:task',
      chore: 'type:chore',
    } as Record<string, string>,

    // Status labels for reading adapter-injected sf:status:* labels on pull.
    // The Linear adapter injects these labels based on workflow state type,
    // so parseExternalLabels() and stateToStatus() can extract granular statuses.
    statusLabels: LINEAR_STATUS_LABELS,

    syncLabelPrefix: 'sf:',

    statusToState: (status: TaskStatus): 'open' | 'closed' => {
      // For the shared adapter utility, we still need open/closed.
      // The actual state type mapping is handled by the adapter.
      switch (status) {
        case 'closed':
        case 'tombstone':
          return 'closed';
        default:
          return 'open';
      }
    },

    stateToStatus: (state: 'open' | 'closed', labels: string[]): TaskStatus => {
      // Check for adapter-injected sf:status:* labels first.
      // The Linear adapter injects these based on workflow state type
      // (e.g., started → sf:status:in-progress), giving us granular status
      // without coupling the sync engine to Linear-specific state types.
      const statusByLabel = new Map<string, TaskStatus>();
      for (const [status, label] of Object.entries(LINEAR_STATUS_LABELS)) {
        statusByLabel.set(label, status as TaskStatus);
      }

      const prefix = 'sf:';
      for (const label of labels) {
        if (label.startsWith(prefix)) {
          const value = label.slice(prefix.length);
          const matchedStatus = statusByLabel.get(value);
          if (matchedStatus !== undefined) {
            return matchedStatus;
          }
        }
      }

      // Fallback: basic open/closed mapping when no status label is present
      return state === 'closed' ? ('closed' as TaskStatus) : ('open' as TaskStatus);
    },
  };
}
