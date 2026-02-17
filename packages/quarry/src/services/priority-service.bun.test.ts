import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  PriorityService,
  createPriorityService,
} from './priority-service.js';
import { DependencyService, createDependencyService } from './dependency.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { ElementId, EntityId, Task } from '@stoneforge/core';
import { DependencyType, Priority, Complexity, TaskStatus, ElementType, createTimestamp } from '@stoneforge/core';

// ============================================================================
// Test Setup
// ============================================================================

describe('PriorityService', () => {
  let db: StorageBackend;
  let service: PriorityService;
  let depService: DependencyService;

  // Test entity
  const testEntity = 'el-testuser1' as EntityId;

  /**
   * Helper to create a task in the database
   */
  function createTestTask(
    id: string,
    priority: Priority = Priority.MEDIUM,
    complexity: Complexity = Complexity.MEDIUM
  ): Task {
    const now = createTimestamp();
    const task: Task = {
      id: id as ElementId,
      type: ElementType.TASK,
      createdAt: now,
      updatedAt: now,
      createdBy: testEntity,
      tags: [],
      metadata: {},
      title: `Test Task ${id}`,
      status: TaskStatus.OPEN,
      priority,
      complexity,
      taskType: 'task',
    };

    // Insert into database
    db.run(
      `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [task.id, task.type, JSON.stringify(task), task.createdAt, task.updatedAt, task.createdBy]
    );

    return task;
  }

  beforeEach(() => {
    // Create in-memory database for each test with full schema
    db = createStorage({ path: ':memory:' });
    initializeSchema(db);
    service = createPriorityService(db);
    depService = createDependencyService(db);
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================================================
  // Effective Priority Calculation
  // ==========================================================================

  describe('calculateEffectivePriority', () => {
    test('returns base priority when no dependencies', () => {
      const task = createTestTask('el-task1', Priority.LOW);

      const result = service.calculateEffectivePriority(task.id);

      expect(result.basePriority).toBe(Priority.LOW);
      expect(result.effectivePriority).toBe(Priority.LOW);
      expect(result.isInfluenced).toBe(false);
      expect(result.dependentInfluencers).toHaveLength(0);
    });

    test('returns MEDIUM priority for non-existent task', () => {
      const result = service.calculateEffectivePriority('el-nonexistent' as ElementId);

      expect(result.basePriority).toBe(Priority.MEDIUM);
      expect(result.effectivePriority).toBe(Priority.MEDIUM);
      expect(result.isInfluenced).toBe(false);
    });

    test('inherits higher priority from dependent task', () => {
      // Create tasks: task1 (LOW) blocks task2 (HIGH)
      // Task1 should have effective priority HIGH because task2 depends on it
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);

      // task1 blocks task2 (task2 waits for task1 to close)
      // Semantics: "target waits for source to close"
      // So task1 -> task2 means task2 depends on task1
      depService.addDependency({
        blockedId: task2.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      expect(result.basePriority).toBe(Priority.LOW);
      expect(result.effectivePriority).toBe(Priority.HIGH);
      expect(result.isInfluenced).toBe(true);
      expect(result.dependentInfluencers).toContain(task2.id);
    });

    test('inherits CRITICAL priority from chain of dependents', () => {
      // Chain: task1 (LOW) -> task2 (MEDIUM) -> task3 (CRITICAL)
      // task1 blocks task2 blocks task3
      // task1 should have effective priority CRITICAL
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.MEDIUM);
      const task3 = createTestTask('el-task3', Priority.CRITICAL);

      // task1 blocks task2 (task2 waits for task1)
      depService.addDependency({
        blockedId: task2.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // task2 blocks task3 (task3 waits for task2)
      depService.addDependency({
        blockedId: task3.id,
        blockerId: task2.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      expect(result.basePriority).toBe(Priority.LOW);
      expect(result.effectivePriority).toBe(Priority.CRITICAL);
      expect(result.isInfluenced).toBe(true);
    });

    test('does not lower priority from dependent', () => {
      // task1 (HIGH) blocks task2 (LOW)
      // task1 should keep HIGH priority (not lowered to LOW)
      const task1 = createTestTask('el-task1', Priority.HIGH);
      const task2 = createTestTask('el-task2', Priority.LOW);

      // task1 blocks task2 (task2 waits for task1)
      depService.addDependency({
        blockedId: task2.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      expect(result.basePriority).toBe(Priority.HIGH);
      expect(result.effectivePriority).toBe(Priority.HIGH);
      expect(result.isInfluenced).toBe(false);
    });

    test('respects maxDepth configuration', () => {
      // Create a long chain that exceeds maxDepth
      const tasks: Task[] = [];
      for (let i = 0; i < 15; i++) {
        tasks.push(
          createTestTask(`el-task${i}`, i === 14 ? Priority.CRITICAL : Priority.LOW)
        );
      }

      // Chain them: task0 -> task1 -> task2 -> ... -> task14 (CRITICAL)
      // task0 blocks all others transitively
      for (let i = 0; i < tasks.length - 1; i++) {
        depService.addDependency({
          blockedId: tasks[i + 1].id,
          blockerId: tasks[i].id,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
      }

      // With default maxDepth of 10, task0 should not see task14's priority
      const result = service.calculateEffectivePriority(tasks[0].id);
      expect(result.effectivePriority).toBe(Priority.LOW);

      // With higher maxDepth, it should see it
      const resultDeep = service.calculateEffectivePriority(tasks[0].id, {
        maxDepth: 20,
        includeComplexity: false,
      });
      expect(resultDeep.effectivePriority).toBe(Priority.CRITICAL);
    });

    test('handles multiple dependents with different priorities', () => {
      // task1 blocks both task2 (HIGH) and task3 (CRITICAL)
      // task1 should have CRITICAL priority (the highest among dependents)
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);
      const task3 = createTestTask('el-task3', Priority.CRITICAL);

      // task1 blocks task2 (task2 waits for task1)
      depService.addDependency({
        blockedId: task2.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // task1 blocks task3 (task3 waits for task1)
      depService.addDependency({
        blockedId: task3.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      expect(result.basePriority).toBe(Priority.LOW);
      expect(result.effectivePriority).toBe(Priority.CRITICAL);
      expect(result.isInfluenced).toBe(true);
      expect(result.dependentInfluencers).toContain(task3.id);
    });
  });

  // ==========================================================================
  // Aggregate Complexity Calculation
  // ==========================================================================

  describe('calculateAggregateComplexity', () => {
    test('returns base complexity when no dependencies', () => {
      const task = createTestTask('el-task1', Priority.MEDIUM, Complexity.SIMPLE);

      const result = service.calculateAggregateComplexity(task.id);

      expect(result.baseComplexity).toBe(Complexity.SIMPLE);
      expect(result.aggregateComplexity).toBe(Complexity.SIMPLE);
      expect(result.dependentCount).toBe(0);
      expect(result.dependentComplexities).toHaveLength(0);
    });

    test('returns MEDIUM complexity for non-existent task', () => {
      const result = service.calculateAggregateComplexity('el-nonexistent' as ElementId);

      expect(result.baseComplexity).toBe(Complexity.MEDIUM);
      expect(result.aggregateComplexity).toBe(Complexity.MEDIUM);
    });

    test('sums complexity of blocking tasks', () => {
      // task1 (SIMPLE=2) waits for task2 (MEDIUM=3)
      // task2 blocks task1
      // Aggregate for task1 = 2 + 3 = 5
      const task1 = createTestTask('el-task1', Priority.MEDIUM, Complexity.SIMPLE);
      const task2 = createTestTask('el-task2', Priority.MEDIUM, Complexity.MEDIUM);

      // task2 blocks task1 (task1 waits for task2)
      depService.addDependency({
        blockedId: task1.id,
        blockerId: task2.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateAggregateComplexity(task1.id);

      expect(result.baseComplexity).toBe(Complexity.SIMPLE);
      expect(result.aggregateComplexity).toBe(5); // 2 + 3
      expect(result.dependentCount).toBe(1);
      expect(result.dependentComplexities).toHaveLength(1);
      expect(result.dependentComplexities[0].id).toBe(task2.id);
      expect(result.dependentComplexities[0].complexity).toBe(Complexity.MEDIUM);
    });

    test('sums complexity transitively', () => {
      // task3 blocks task2, task2 blocks task1
      // task1 waits for task2, task2 waits for task3
      // All have SIMPLE (2) complexity
      // Aggregate for task1 = 2 + 2 + 2 = 6
      const task1 = createTestTask('el-task1', Priority.MEDIUM, Complexity.SIMPLE);
      const task2 = createTestTask('el-task2', Priority.MEDIUM, Complexity.SIMPLE);
      const task3 = createTestTask('el-task3', Priority.MEDIUM, Complexity.SIMPLE);

      // task2 blocks task1 (task1 waits for task2)
      depService.addDependency({
        blockedId: task1.id,
        blockerId: task2.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // task3 blocks task2 (task2 waits for task3)
      depService.addDependency({
        blockedId: task2.id,
        blockerId: task3.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateAggregateComplexity(task1.id);

      expect(result.baseComplexity).toBe(Complexity.SIMPLE);
      expect(result.aggregateComplexity).toBe(6); // 2 + 2 + 2
      expect(result.dependentCount).toBe(2);
    });

    test('respects maxDepth configuration', () => {
      // Create chain: task14 blocks task13 blocks ... blocks task0
      // (task0 waits for task1 waits for task2 ... waits for task14)
      const tasks: Task[] = [];
      for (let i = 0; i < 15; i++) {
        tasks.push(createTestTask(`el-task${i}`, Priority.MEDIUM, Complexity.SIMPLE));
      }

      // task[i+1] blocks task[i] (task[i] waits for task[i+1])
      for (let i = 0; i < tasks.length - 1; i++) {
        depService.addDependency({
          blockedId: tasks[i].id,
          blockerId: tasks[i + 1].id,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
      }

      // With default maxDepth of 10, should only count 10 blockers
      const result = service.calculateAggregateComplexity(tasks[0].id);
      // task0 (2) + 9 blockers (2*9=18) = 20 (because depth 0 is task0, depths 1-9 are blockers)
      expect(result.aggregateComplexity).toBeLessThan(15 * 2); // Less than full chain
    });
  });

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  describe('calculateEffectivePriorities', () => {
    test('calculates priorities for multiple tasks', () => {
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);

      // task1 blocks task2 (task2 waits for task1)
      depService.addDependency({
        blockedId: task2.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const results = service.calculateEffectivePriorities([task1.id, task2.id]);

      expect(results.size).toBe(2);
      expect(results.get(task1.id)?.effectivePriority).toBe(Priority.HIGH);
      expect(results.get(task2.id)?.effectivePriority).toBe(Priority.HIGH);
    });

    test('returns empty map for empty input', () => {
      const results = service.calculateEffectivePriorities([]);
      expect(results.size).toBe(0);
    });
  });

  describe('enhanceTasksWithEffectivePriority', () => {
    test('adds effectivePriority field to tasks', () => {
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);

      // task1 blocks task2 (task2 waits for task1)
      depService.addDependency({
        blockedId: task2.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const enhanced = service.enhanceTasksWithEffectivePriority([task1, task2]);

      expect(enhanced).toHaveLength(2);
      const enhancedTask1 = enhanced.find((t) => t.id === task1.id);
      expect(enhancedTask1?.effectivePriority).toBe(Priority.HIGH);
      expect(enhancedTask1?.priorityInfluenced).toBe(true);
    });

    test('returns empty array for empty input', () => {
      const enhanced = service.enhanceTasksWithEffectivePriority([]);
      expect(enhanced).toHaveLength(0);
    });
  });

  describe('sortByEffectivePriority', () => {
    test('sorts by effective priority (highest first)', () => {
      // task1: base LOW, effective HIGH (due to dependency)
      // task2: base HIGH, effective HIGH
      // task3: base LOW, effective LOW
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);
      const task3 = createTestTask('el-task3', Priority.LOW);

      // task1 blocks task2 (task2 waits for task1)
      depService.addDependency({
        blockedId: task2.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const enhanced = service.enhanceTasksWithEffectivePriority([task3, task1, task2]);
      const sorted = service.sortByEffectivePriority(enhanced);

      // HIGH effective priority should come first
      expect(sorted[0].effectivePriority).toBe(Priority.HIGH);
      expect(sorted[1].effectivePriority).toBe(Priority.HIGH);
      expect(sorted[2].effectivePriority).toBe(Priority.LOW);
    });

    test('uses base priority as tiebreaker', () => {
      // Both tasks have effective priority HIGH
      // task1: base LOW (4), effective HIGH (2) - should come second
      // task2: base HIGH (2), effective HIGH (2) - should come first
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);

      // task1 blocks task2 (task2 waits for task1)
      depService.addDependency({
        blockedId: task2.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const enhanced = service.enhanceTasksWithEffectivePriority([task1, task2]);
      const sorted = service.sortByEffectivePriority(enhanced);

      // task2 has better base priority, should come first
      expect(sorted[0].id).toBe(task2.id);
      expect(sorted[1].id).toBe(task1.id);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    test('handles diamond dependency pattern', () => {
      // Diamond: task1 -> task2 and task3 -> task4
      //          task1 blocks task2 and task3
      //          task2 and task3 block task4
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.MEDIUM);
      const task3 = createTestTask('el-task3', Priority.MEDIUM);
      const task4 = createTestTask('el-task4', Priority.CRITICAL);

      // task1 blocks task2 (task2 waits for task1)
      depService.addDependency({
        blockedId: task2.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // task1 blocks task3 (task3 waits for task1)
      depService.addDependency({
        blockedId: task3.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // task2 blocks task4 (task4 waits for task2)
      depService.addDependency({
        blockedId: task4.id,
        blockerId: task2.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // task3 blocks task4 (task4 waits for task3)
      depService.addDependency({
        blockedId: task4.id,
        blockerId: task3.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      // task1 should inherit CRITICAL from task4 via both paths
      expect(result.effectivePriority).toBe(Priority.CRITICAL);
      expect(result.isInfluenced).toBe(true);
    });

    test('ignores non-blocking dependency types', () => {
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.CRITICAL);

      // task1 relates to task2 (not blocking)
      depService.addDependency({
        blockedId: task1.id,
        blockerId: task2.id,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      // Should not inherit priority from non-blocking dependency
      expect(result.effectivePriority).toBe(Priority.LOW);
      expect(result.isInfluenced).toBe(false);
    });

    test('handles task with no dependents but has blockers', () => {
      // task2 blocks task1, but nothing depends on task1
      const task1 = createTestTask('el-task1', Priority.HIGH);
      const task2 = createTestTask('el-task2', Priority.LOW);

      // task2 blocks task1 (task1 waits for task2)
      depService.addDependency({
        blockedId: task1.id,
        blockerId: task2.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      // task1 should keep its own priority (nothing depends on it)
      expect(result.effectivePriority).toBe(Priority.HIGH);
      expect(result.isInfluenced).toBe(false);
    });
  });
});
