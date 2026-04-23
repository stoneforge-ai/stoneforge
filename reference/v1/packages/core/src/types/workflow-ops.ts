/**
 * Workflow Operations - Ephemeral support and task-workflow linking
 *
 * Operations for managing workflows and their associated tasks:
 * - Delete: Delete a workflow and all its child tasks
 * - Garbage Collection: Clean up old ephemeral workflows
 * - Ephemeral filtering: Identify workflows/tasks to exclude from export
 */

import type { ElementId, EntityId } from './element.js';
import type { Task } from './task.js';
import type { Workflow } from './workflow.js';
import { isEligibleForGarbageCollection } from './workflow.js';
import type { Dependency } from './dependency.js';
import { DependencyType } from './dependency.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a delete operation
 */
export interface DeleteWorkflowResult {
  /** ID of the workflow that was deleted */
  workflowId: ElementId;
  /** Number of tasks that were deleted */
  tasksDeleted: number;
  /** Number of dependencies that were deleted */
  dependenciesDeleted: number;
  /** Whether the workflow was ephemeral */
  wasEphemeral: boolean;
}

/**
 * Result of garbage collection
 */
export interface GarbageCollectionResult {
  /** Number of workflows that were deleted */
  workflowsDeleted: number;
  /** Number of tasks that were deleted */
  tasksDeleted: number;
  /** Number of dependencies that were deleted */
  dependenciesDeleted: number;
  /** IDs of workflows that were deleted */
  deletedWorkflowIds: ElementId[];
}

/**
 * Options for garbage collection
 */
export interface GarbageCollectionOptions {
  /** Maximum age in milliseconds for workflows to be eligible */
  maxAgeMs: number;
  /** Whether to run in dry-run mode (no actual deletion) */
  dryRun?: boolean;
  /** Maximum number of workflows to delete in one run */
  limit?: number;
}

/**
 * Ephemeral filtering result
 */
export interface EphemeralFilterResult {
  /** IDs of ephemeral workflows to exclude */
  ephemeralWorkflowIds: Set<ElementId>;
  /** IDs of tasks that belong to ephemeral workflows */
  ephemeralTaskIds: Set<ElementId>;
}

// ============================================================================
// Ephemeral Filtering
// ============================================================================

/**
 * Identifies all ephemeral workflows and their associated task IDs.
 * Used to filter these elements from export operations.
 *
 * @param workflows - All workflows in the system
 * @param dependencies - All dependencies (to find parent-child relationships)
 * @returns Sets of workflow IDs and task IDs to exclude
 */
export function getEphemeralElementIds(
  workflows: Workflow[],
  dependencies: Dependency[]
): EphemeralFilterResult {
  // Find all ephemeral workflow IDs
  const ephemeralWorkflowIds = new Set<ElementId>();
  for (const workflow of workflows) {
    if (workflow.ephemeral) {
      ephemeralWorkflowIds.add(workflow.id);
    }
  }

  // Find all tasks that are children of ephemeral workflows
  const ephemeralTaskIds = new Set<ElementId>();
  for (const dep of dependencies) {
    if (
      dep.type === DependencyType.PARENT_CHILD &&
      ephemeralWorkflowIds.has(dep.blockerId)
    ) {
      // blockedId is the task (child), blockerId is the workflow (parent)
      ephemeralTaskIds.add(dep.blockedId);
    }
  }

  return {
    ephemeralWorkflowIds,
    ephemeralTaskIds,
  };
}

/**
 * Filters out ephemeral workflows and their tasks from a list of elements.
 *
 * @param elements - Array of mixed element types
 * @param ephemeralFilter - Result from getEphemeralElementIds
 * @returns Elements with ephemeral workflows and their tasks removed
 */
export function filterOutEphemeral<T extends { id: ElementId }>(
  elements: T[],
  ephemeralFilter: EphemeralFilterResult
): T[] {
  return elements.filter(
    (el) =>
      !ephemeralFilter.ephemeralWorkflowIds.has(el.id) &&
      !ephemeralFilter.ephemeralTaskIds.has(el.id)
  );
}

/**
 * Checks if an element should be excluded from export due to ephemeral status.
 *
 * @param elementId - The element ID to check
 * @param ephemeralFilter - Result from getEphemeralElementIds
 * @returns Whether the element should be excluded
 */
export function isEphemeralElement(
  elementId: ElementId,
  ephemeralFilter: EphemeralFilterResult
): boolean {
  return (
    ephemeralFilter.ephemeralWorkflowIds.has(elementId) ||
    ephemeralFilter.ephemeralTaskIds.has(elementId)
  );
}

// ============================================================================
// Workflow-Task Relationships
// ============================================================================

/**
 * Gets all task IDs that are children of a workflow.
 *
 * @param workflowId - The workflow ID
 * @param dependencies - All dependencies
 * @returns Array of task IDs that are children of the workflow
 */
export function getTaskIdsInWorkflow(
  workflowId: ElementId,
  dependencies: Dependency[]
): ElementId[] {
  return dependencies
    .filter(
      (dep) =>
        dep.type === DependencyType.PARENT_CHILD &&
        dep.blockerId === workflowId
    )
    .map((dep) => dep.blockedId);
}

/**
 * Gets all dependencies involving elements in a workflow.
 * This includes:
 * - Parent-child dependencies linking tasks to the workflow
 * - Blocks dependencies between tasks in the workflow
 * - Any other dependencies where source or target is in the workflow
 *
 * @param workflowId - The workflow ID
 * @param taskIds - The task IDs in the workflow
 * @param dependencies - All dependencies
 * @returns Dependencies involving the workflow or its tasks
 */
export function getDependenciesInWorkflow(
  workflowId: ElementId,
  taskIds: ElementId[],
  dependencies: Dependency[]
): Dependency[] {
  const workflowElementIds = new Set([workflowId, ...taskIds]);

  return dependencies.filter(
    (dep) =>
      workflowElementIds.has(dep.blockedId) ||
      workflowElementIds.has(dep.blockerId)
  );
}

// ============================================================================
// Garbage Collection Helpers
// ============================================================================

/**
 * Identifies workflows eligible for garbage collection.
 *
 * A workflow is eligible if:
 * - It is ephemeral
 * - It is in a terminal state (completed, failed, cancelled)
 * - It has been finished for longer than maxAgeMs
 *
 * @param workflows - All workflows to check
 * @param options - GC options including maxAgeMs
 * @returns Workflows eligible for garbage collection
 */
export function getGarbageCollectionCandidates(
  workflows: Workflow[],
  options: GarbageCollectionOptions
): Workflow[] {
  const now = Date.now();

  return workflows.filter((w) => {
    // Must be eligible (ephemeral + terminal)
    if (!isEligibleForGarbageCollection(w)) {
      return false;
    }

    // Must have finished
    if (!w.finishedAt) {
      return false;
    }

    // Must be old enough
    const finishedTime = new Date(w.finishedAt).getTime();
    const age = now - finishedTime;
    return age >= options.maxAgeMs;
  });
}

/**
 * Prepares data for a garbage collection run.
 * Returns all the workflows and their associated elements that should be deleted.
 *
 * @param candidates - Workflows to be garbage collected
 * @param dependencies - All dependencies
 * @param options - GC options
 * @returns Prepared GC data with workflows, tasks, and dependencies to delete
 */
export function prepareGarbageCollection(
  candidates: Workflow[],
  dependencies: Dependency[],
  options: GarbageCollectionOptions
): {
  workflows: Workflow[];
  taskIds: ElementId[];
  dependenciesToDelete: Dependency[];
} {
  // Apply limit if specified
  const workflowsToDelete = options.limit
    ? candidates.slice(0, options.limit)
    : candidates;

  const allTaskIds: ElementId[] = [];
  const allDependencies: Dependency[] = [];

  for (const workflow of workflowsToDelete) {
    const taskIds = getTaskIdsInWorkflow(workflow.id, dependencies);
    const workflowDeps = getDependenciesInWorkflow(
      workflow.id,
      taskIds,
      dependencies
    );

    allTaskIds.push(...taskIds);
    allDependencies.push(...workflowDeps);
  }

  // Deduplicate dependencies
  const uniqueDeps = new Map<string, Dependency>();
  for (const dep of allDependencies) {
    const key = `${dep.blockedId}:${dep.blockerId}:${dep.type}`;
    uniqueDeps.set(key, dep);
  }

  return {
    workflows: workflowsToDelete,
    taskIds: allTaskIds,
    dependenciesToDelete: Array.from(uniqueDeps.values()),
  };
}

// ============================================================================
// Delete Operation Helpers
// ============================================================================

/**
 * Validates that a workflow can be deleted.
 *
 * @param workflow - The workflow to validate
 * @returns Whether the workflow can be deleted
 */
export function canDeleteWorkflow(workflow: Workflow): {
  canDelete: boolean;
  reason?: string;
} {
  // Any workflow can be deleted, but we may want to warn about non-ephemeral
  return {
    canDelete: true,
    reason: workflow.ephemeral
      ? undefined
      : 'Warning: Deleting a durable workflow will permanently delete it and its tasks',
  };
}

/**
 * Prepares data for deleting a workflow.
 * Returns all the elements that need to be deleted.
 *
 * @param workflow - The workflow to delete
 * @param dependencies - All dependencies
 * @returns Prepared delete data
 */
export function prepareDeleteWorkflow(
  workflow: Workflow,
  dependencies: Dependency[]
): {
  taskIds: ElementId[];
  dependenciesToDelete: Dependency[];
} {
  const taskIds = getTaskIdsInWorkflow(workflow.id, dependencies);
  const depsToDelete = getDependenciesInWorkflow(
    workflow.id,
    taskIds,
    dependencies
  );

  return {
    taskIds,
    dependenciesToDelete: depsToDelete,
  };
}
