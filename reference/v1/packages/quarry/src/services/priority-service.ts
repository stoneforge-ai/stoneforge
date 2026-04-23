/**
 * Priority Service - Dependency-based priority calculation and complexity inheritance
 *
 * Provides:
 * - Effective Priority: Computes a task's priority based on what depends on it
 *   (tasks blocking high-priority work inherit that urgency)
 * - Aggregate Complexity: Computes total effort including dependent task complexity
 */

import type { StorageBackend } from '@stoneforge/storage';
import type { ElementId, Task, Priority, Complexity } from '@stoneforge/core';
import { Priority as PriorityEnum, Complexity as ComplexityEnum, DependencyType as DT } from '@stoneforge/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Row type for dependency queries
 */
interface DependencyRow {
  blocked_id: string;
  blocker_id: string;
  type: string;
  [key: string]: unknown;
}

/**
 * Row type for task priority/complexity queries
 */
interface TaskPriorityRow {
  id: string;
  priority: number;
  complexity: number;
  [key: string]: unknown;
}

/**
 * Result of effective priority calculation
 */
export interface EffectivePriorityResult {
  /** The task's own/explicit priority */
  basePriority: Priority;
  /** The computed effective priority (may be higher due to dependents) */
  effectivePriority: Priority;
  /** IDs of high-priority tasks that depend on this task */
  dependentInfluencers: ElementId[];
  /** Whether the effective priority differs from base priority */
  isInfluenced: boolean;
}

/**
 * Result of aggregate complexity calculation
 */
export interface AggregateComplexityResult {
  /** The task's own complexity */
  baseComplexity: Complexity;
  /** Total complexity including blocked dependencies */
  aggregateComplexity: number;
  /** Number of dependent tasks included in calculation */
  dependentCount: number;
  /** Breakdown by dependency */
  dependentComplexities: Array<{ id: ElementId; complexity: Complexity }>;
}

/**
 * Task with calculated priority and complexity
 */
export interface TaskWithEffectivePriority extends Task {
  /** Computed effective priority based on dependents */
  effectivePriority: Priority;
  /** Whether this task's priority was influenced by dependents */
  priorityInfluenced: boolean;
  /** Aggregate complexity including dependent tasks */
  aggregateComplexity?: number;
}

/**
 * Configuration for priority calculation
 */
export interface PriorityCalculationConfig {
  /** Maximum depth for traversing dependency chain (default: 10) */
  maxDepth: number;
  /** Whether to include complexity aggregation (default: false) */
  includeComplexity: boolean;
}

/**
 * Default priority calculation configuration
 */
export const DEFAULT_PRIORITY_CONFIG: PriorityCalculationConfig = {
  maxDepth: 10,
  includeComplexity: false,
};

// ============================================================================
// PriorityService Class
// ============================================================================

/**
 * Service for computing dependency-based priority and complexity
 */
export class PriorityService {
  constructor(private readonly db: StorageBackend) {}

  // --------------------------------------------------------------------------
  // Effective Priority Calculation
  // --------------------------------------------------------------------------

  /**
   * Calculate the effective priority of a task based on its dependents.
   *
   * A task that blocks high-priority tasks should inherit that urgency.
   * The effective priority is the minimum (highest urgency) of:
   * - The task's own priority
   * - The priorities of all tasks that directly or transitively depend on it
   *
   * @param taskId - The task to calculate effective priority for
   * @param config - Optional configuration
   * @returns EffectivePriorityResult with calculation details
   */
  calculateEffectivePriority(
    taskId: ElementId,
    config: PriorityCalculationConfig = DEFAULT_PRIORITY_CONFIG
  ): EffectivePriorityResult {
    // Get the task's base priority
    const task = this.getTaskPriority(taskId);
    if (!task) {
      return {
        basePriority: PriorityEnum.MEDIUM,
        effectivePriority: PriorityEnum.MEDIUM,
        dependentInfluencers: [],
        isInfluenced: false,
      };
    }

    const basePriority = task.priority as Priority;

    // Find all tasks that depend on this task (direct and transitive)
    const dependentPriorities = this.collectDependentPriorities(taskId, config.maxDepth);

    // Find the highest priority (lowest number) among dependents
    let effectivePriority = basePriority;
    const influencers: ElementId[] = [];

    for (const { id, priority } of dependentPriorities) {
      if (priority < effectivePriority) {
        effectivePriority = priority as Priority;
        influencers.length = 0; // Reset - new highest priority found
        influencers.push(id);
      } else if (priority === effectivePriority && priority < basePriority) {
        influencers.push(id);
      }
    }

    return {
      basePriority,
      effectivePriority,
      dependentInfluencers: influencers,
      isInfluenced: effectivePriority !== basePriority,
    };
  }

  /**
   * Calculate effective priorities for multiple tasks efficiently
   *
   * @param taskIds - Array of task IDs to calculate priorities for
   * @param config - Optional configuration
   * @returns Map of taskId to EffectivePriorityResult
   */
  calculateEffectivePriorities(
    taskIds: ElementId[],
    config: PriorityCalculationConfig = DEFAULT_PRIORITY_CONFIG
  ): Map<ElementId, EffectivePriorityResult> {
    const results = new Map<ElementId, EffectivePriorityResult>();

    for (const taskId of taskIds) {
      results.set(taskId, this.calculateEffectivePriority(taskId, config));
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Aggregate Complexity Calculation
  // --------------------------------------------------------------------------

  /**
   * Calculate the aggregate complexity of a task including its blockers.
   *
   * This represents the total effort needed before this task can be considered
   * truly "done" - including all tasks it's waiting on.
   *
   * Note: This calculates complexity of tasks that THIS task depends on (blockers),
   * not tasks that depend on it.
   *
   * @param taskId - The task to calculate aggregate complexity for
   * @param config - Optional configuration
   * @returns AggregateComplexityResult with calculation details
   */
  calculateAggregateComplexity(
    taskId: ElementId,
    config: PriorityCalculationConfig = DEFAULT_PRIORITY_CONFIG
  ): AggregateComplexityResult {
    // Get the task's base complexity
    const task = this.getTaskPriority(taskId);
    if (!task) {
      return {
        baseComplexity: ComplexityEnum.MEDIUM,
        aggregateComplexity: ComplexityEnum.MEDIUM,
        dependentCount: 0,
        dependentComplexities: [],
      };
    }

    const baseComplexity = task.complexity as Complexity;

    // Find all tasks that this task depends on (blockers, direct and transitive)
    const blockerComplexities = this.collectBlockerComplexities(taskId, config.maxDepth);

    // Sum up complexities
    let totalComplexity = baseComplexity;
    const dependentComplexities: Array<{ id: ElementId; complexity: Complexity }> = [];

    for (const { id, complexity } of blockerComplexities) {
      totalComplexity += complexity;
      dependentComplexities.push({ id, complexity: complexity as Complexity });
    }

    return {
      baseComplexity,
      aggregateComplexity: totalComplexity,
      dependentCount: dependentComplexities.length,
      dependentComplexities,
    };
  }

  // --------------------------------------------------------------------------
  // Bulk Operations for ready() query optimization
  // --------------------------------------------------------------------------

  /**
   * Enhance an array of tasks with effective priority (for sorting)
   *
   * @param tasks - Array of tasks to enhance
   * @param config - Optional configuration
   * @returns Array of tasks with effectivePriority field
   */
  enhanceTasksWithEffectivePriority(
    tasks: Task[],
    config: PriorityCalculationConfig = DEFAULT_PRIORITY_CONFIG
  ): TaskWithEffectivePriority[] {
    if (tasks.length === 0) {
      return [];
    }

    // Get task IDs
    const taskIds = tasks.map((t) => t.id);

    // Calculate effective priorities for all tasks
    const priorityResults = this.calculateEffectivePriorities(taskIds, config);

    // Enhance tasks
    return tasks.map((task) => {
      const result = priorityResults.get(task.id);
      return {
        ...task,
        effectivePriority: result?.effectivePriority ?? task.priority,
        priorityInfluenced: result?.isInfluenced ?? false,
      };
    });
  }

  /**
   * Sort tasks by effective priority (highest priority first)
   *
   * @param tasks - Array of tasks with effective priority
   * @returns Sorted array (mutates in place and returns reference)
   */
  sortByEffectivePriority(tasks: TaskWithEffectivePriority[]): TaskWithEffectivePriority[] {
    return tasks.sort((a, b) => {
      // Primary sort: effective priority (lower number = higher priority)
      if (a.effectivePriority !== b.effectivePriority) {
        return a.effectivePriority - b.effectivePriority;
      }
      // Secondary sort: base priority (for ties in effective priority)
      return a.priority - b.priority;
    });
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Get a task's priority and complexity from the database
   */
  private getTaskPriority(taskId: ElementId): TaskPriorityRow | undefined {
    const sql = `
      SELECT e.id, json_extract(e.data, '$.priority') as priority,
             json_extract(e.data, '$.complexity') as complexity
      FROM elements e
      WHERE e.id = ? AND e.type = 'task'
    `;
    return this.db.queryOne<TaskPriorityRow>(sql, [taskId]);
  }

  /**
   * Collect priorities of all tasks that depend on a given task (transitively).
   *
   * blockedId = the element waiting, blockerId = the element doing the blocking.
   * To find tasks blocked by current.id, query WHERE blocker_id = current.id,
   * then read blocked_id to get the dependent tasks.
   */
  private collectDependentPriorities(
    taskId: ElementId,
    maxDepth: number
  ): Array<{ id: ElementId; priority: number }> {
    const result: Array<{ id: ElementId; priority: number }> = [];
    const visited = new Set<string>();
    const queue: Array<{ id: ElementId; depth: number }> = [{ id: taskId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth || visited.has(current.id)) {
        continue;
      }
      visited.add(current.id);

      // Find tasks that are blocked by this task (current.id is the blocker)
      const dependents = this.db.query<DependencyRow>(
        `SELECT d.blocked_id, d.blocker_id, d.type
         FROM dependencies d
         WHERE d.blocker_id = ? AND d.type = ?`,
        [current.id, DT.BLOCKS]
      );

      for (const dep of dependents) {
        const blockedId = dep.blocked_id as ElementId;
        if (!visited.has(blockedId)) {
          const task = this.getTaskPriority(blockedId);
          if (task) {
            result.push({ id: blockedId, priority: task.priority });
            queue.push({ id: blockedId, depth: current.depth + 1 });
          }
        }
      }
    }

    return result;
  }

  /**
   * Collect complexities of all tasks that this task depends on (blockers, transitively).
   *
   * blockedId = the element waiting, blockerId = the element doing the blocking.
   * To find tasks that block current.id, query WHERE blocked_id = current.id,
   * then read blocker_id to get the blocking tasks.
   */
  private collectBlockerComplexities(
    taskId: ElementId,
    maxDepth: number
  ): Array<{ id: ElementId; complexity: number }> {
    const result: Array<{ id: ElementId; complexity: number }> = [];
    const visited = new Set<string>();
    const queue: Array<{ id: ElementId; depth: number }> = [{ id: taskId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth || visited.has(current.id)) {
        continue;
      }
      visited.add(current.id);

      // Find tasks that block this task (current.id is the blocked element)
      const blockers = this.db.query<DependencyRow>(
        `SELECT d.blocked_id, d.blocker_id, d.type
         FROM dependencies d
         WHERE d.blocked_id = ? AND d.type = ?`,
        [current.id, DT.BLOCKS]
      );

      for (const dep of blockers) {
        const blockerId = dep.blocker_id as ElementId;
        if (!visited.has(blockerId)) {
          const task = this.getTaskPriority(blockerId);
          if (task) {
            result.push({ id: blockerId, complexity: task.complexity });
            queue.push({ id: blockerId, depth: current.depth + 1 });
          }
        }
      }
    }

    return result;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PriorityService instance
 */
export function createPriorityService(db: StorageBackend): PriorityService {
  return new PriorityService(db);
}
