/**
 * Performance Tests for Dependency Graph Operations
 *
 * These tests benchmark the dependency system under load:
 * - Cycle detection on deep chains (50+ nodes)
 * - Cycle detection on wide graphs (many siblings)
 * - Blocked cache rebuild on large datasets
 * - Ready work queries with complex dependency structures
 *
 * Performance targets based on spec:
 * - Cycle detection: <100ms for 50-node chains
 * - Blocked cache: ~25x speedup vs recursive dependency check
 * - Ready queries: O(n) on non-blocked elements (single table scan)
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  DependencyService,
  createDependencyService,
  DEFAULT_CYCLE_DETECTION_CONFIG,
} from './dependency.js';
import {
  BlockedCacheService,
  createBlockedCacheService,
} from './blocked-cache.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { ElementId, EntityId } from '@stoneforge/core';
import { DependencyType, GateType } from '@stoneforge/core';

// ============================================================================
// Test Configuration
// ============================================================================

/** Performance thresholds in milliseconds */
const PERF_THRESHOLDS = {
  /** Max time for cycle detection on 50-node chain */
  cycleDetection50Nodes: 100,
  /** Max time for cycle detection on 100-node chain */
  cycleDetection100Nodes: 200,
  /** Max time to add a dependency to a wide graph (50 siblings) */
  addToWideGraph: 50,
  /** Max time to rebuild cache with 100 elements */
  cacheRebuild100: 500,
  /** Max time to rebuild cache with 500 elements */
  cacheRebuild500: 2000,
  /** Max time per element for ready query */
  readyQueryPerElement: 1,
};

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a chain of blocking dependencies: A -> B -> C -> ...
 * Returns array of element IDs in order
 */
function createDependencyChain(
  service: DependencyService,
  length: number,
  createdBy: EntityId,
  type: DependencyType = DependencyType.BLOCKS
): ElementId[] {
  const ids: ElementId[] = [];
  for (let i = 0; i < length; i++) {
    ids.push(`el-chain-${i}` as ElementId);
  }

  for (let i = 0; i < ids.length - 1; i++) {
    service.addDependency({
      blockedId: ids[i + 1],
      blockerId: ids[i],
      type,
      createdBy,
    });
  }

  return ids;
}

/**
 * Create a wide graph where one element has many children
 * Returns { parent, children } IDs
 */
function createWideGraph(
  service: DependencyService,
  childCount: number,
  createdBy: EntityId,
  type: DependencyType = DependencyType.BLOCKS
): { parent: ElementId; children: ElementId[] } {
  const parent = 'el-wide-parent' as ElementId;
  const children: ElementId[] = [];

  for (let i = 0; i < childCount; i++) {
    const child = `el-wide-child-${i}` as ElementId;
    children.push(child);
    service.addDependency({
      blockedId: child,
      blockerId: parent,
      type,
      createdBy,
    });
  }

  return { parent, children };
}


/**
 * Helper to create test elements in the database for blocked cache tests
 */
function createTestElement(
  db: StorageBackend,
  id: string,
  type: string,
  status: string,
  createdBy: EntityId
): void {
  const now = new Date().toISOString();
  const data = JSON.stringify({ status, title: `Test ${id}` });
  db.run(
    `INSERT INTO elements (id, type, data, created_at, updated_at, created_by, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, type, data, now, now, createdBy, null]
  );
}

// ============================================================================
// Performance Tests
// ============================================================================

describe('Dependency Performance', () => {
  let db: StorageBackend;
  let service: DependencyService;
  const testEntity = 'en-perf-test' as EntityId;

  beforeEach(() => {
    db = createStorage({ path: ':memory:' });
    service = createDependencyService(db);
    service.initSchema();
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================================================
  // Cycle Detection Performance
  // ==========================================================================

  describe('Cycle Detection - Deep Chains', () => {
    test('detects cycle in 50-node chain within threshold', () => {
      const ids = createDependencyChain(service, 50, testEntity);

      const start = performance.now();
      const result = service.detectCycle(
        ids[0], // first element (blockedId) - would be blocked by last
        ids[ids.length - 1], // last element (blockerId) - would create cycle
        DependencyType.BLOCKS
      );
      const elapsed = performance.now() - start;

      expect(result.hasCycle).toBe(true);
      expect(elapsed).toBeLessThan(PERF_THRESHOLDS.cycleDetection50Nodes);
      expect(result.nodesVisited).toBe(50); // Should visit all nodes
    });

    test('detects cycle in 100-node chain within threshold', () => {
      const ids = createDependencyChain(service, 100, testEntity);

      const start = performance.now();
      const result = service.detectCycle(
        ids[0],
        ids[ids.length - 1],
        DependencyType.BLOCKS
      );
      const elapsed = performance.now() - start;

      expect(result.hasCycle).toBe(true);
      expect(elapsed).toBeLessThan(PERF_THRESHOLDS.cycleDetection100Nodes);
      // Default depth limit is 100, so should visit all nodes
      expect(result.nodesVisited).toBe(100);
    });

    test('depth limit prevents runaway on very deep chains', () => {
      // Create chain longer than default depth limit
      const ids = createDependencyChain(service, 150, testEntity);

      const start = performance.now();
      const result = service.detectCycle(
        ids[0],
        ids[ids.length - 1],
        DependencyType.BLOCKS
      );
      const elapsed = performance.now() - start;

      // Should hit depth limit before finding cycle
      expect(result.depthLimitReached).toBe(true);
      expect(result.hasCycle).toBe(false);
      // Should complete quickly due to depth limit
      expect(elapsed).toBeLessThan(PERF_THRESHOLDS.cycleDetection100Nodes);
    });

    test('no-cycle check is efficient on deep chain', () => {
      const ids = createDependencyChain(service, 50, testEntity);

      // Check adding unrelated dependency (no cycle possible)
      const start = performance.now();
      const result = service.detectCycle(
        'el-unrelated' as ElementId,
        ids[0],
        DependencyType.BLOCKS
      );
      const elapsed = performance.now() - start;

      expect(result.hasCycle).toBe(false);
      expect(elapsed).toBeLessThan(PERF_THRESHOLDS.cycleDetection50Nodes);
    });
  });

  describe('Cycle Detection - Wide Graphs', () => {
    test('adding to wide graph (50 children) is efficient', () => {
      const { parent } = createWideGraph(service, 50, testEntity);

      // Add new child - should be fast since no path from child to parent
      const start = performance.now();
      service.addDependency({
        blockedId: 'el-new-child' as ElementId,
        blockerId: parent,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(PERF_THRESHOLDS.addToWideGraph);
    });

    test('cycle check on wide graph with 100 children', () => {
      const { parent, children } = createWideGraph(service, 100, testEntity);

      // Check if adding dependency from child back to parent would cycle
      // Since parent blocks children, child blocking parent would create cycle
      // blockedId=parent, blockerId=children[50]
      const start = performance.now();
      const result = service.detectCycle(
        parent,
        children[50],
        DependencyType.BLOCKS
      );
      const elapsed = performance.now() - start;

      // Cycle IS detected: child50 -> (blocked_id=child50, blocker=parent) -> parent == blockedId
      expect(result.hasCycle).toBe(true);
      // Performance should still be good - we find the cycle quickly
      expect(elapsed).toBeLessThan(PERF_THRESHOLDS.addToWideGraph);
    });

    test('no cycle when adding unrelated dependency in wide graph', () => {
      createWideGraph(service, 100, testEntity);

      // Check if adding dependency between two unrelated elements would cycle
      const start = performance.now();
      const result = service.detectCycle(
        'el-unrelated-a' as ElementId,
        'el-unrelated-b' as ElementId,
        DependencyType.BLOCKS
      );
      const elapsed = performance.now() - start;

      // No cycle since these elements are unrelated to the graph
      expect(result.hasCycle).toBe(false);
      expect(elapsed).toBeLessThan(PERF_THRESHOLDS.addToWideGraph);
    });

    test('handles diamond pattern efficiently', () => {
      // Create multiple diamond patterns
      for (let i = 0; i < 20; i++) {
        const a = `el-d${i}-a` as ElementId;
        const b = `el-d${i}-b` as ElementId;
        const c = `el-d${i}-c` as ElementId;
        const d = `el-d${i}-d` as ElementId;

        service.addDependency({
          blockedId: b,
          blockerId: a,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
        service.addDependency({
          blockedId: c,
          blockerId: a,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
        service.addDependency({
          blockedId: d,
          blockerId: b,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
        service.addDependency({
          blockedId: d,
          blockerId: c,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
      }

      // Check cycle detection on diamond pattern
      // Would d blocking a create a cycle? blockedId=a, blockerId=d
      const start = performance.now();
      const result = service.detectCycle(
        'el-d10-a' as ElementId,
        'el-d10-d' as ElementId,
        DependencyType.BLOCKS
      );
      const elapsed = performance.now() - start;

      expect(result.hasCycle).toBe(true);
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Cycle Detection - Mixed Blocking Types', () => {
    test('handles mixed blocking types efficiently', () => {
      // Create chain with mixed blocking types
      const ids: ElementId[] = [];
      for (let i = 0; i < 30; i++) {
        ids.push(`el-mixed-${i}` as ElementId);
      }

      // Use different blocking types
      for (let i = 0; i < ids.length - 1; i++) {
        const type =
          i % 3 === 0
            ? DependencyType.BLOCKS
            : i % 3 === 1
              ? DependencyType.PARENT_CHILD
              : DependencyType.AWAITS;

        const metadata =
          type === DependencyType.AWAITS
            ? { gateType: GateType.TIMER, waitUntil: '2030-01-01T00:00:00.000Z' }
            : undefined;

        service.addDependency({
          blockedId: ids[i + 1],
          blockerId: ids[i],
          type,
          createdBy: testEntity,
          metadata,
        });
      }

      // Would last element blocking first create a cycle? blockedId=first, blockerId=last
      const start = performance.now();
      const result = service.detectCycle(
        ids[0],
        ids[ids.length - 1],
        DependencyType.BLOCKS
      );
      const elapsed = performance.now() - start;

      expect(result.hasCycle).toBe(true);
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Non-Blocking Dependencies', () => {
    test('non-blocking types skip cycle detection (instant)', () => {
      // Create chain with blocking dependencies
      createDependencyChain(service, 50, testEntity);

      // Non-blocking type should skip all traversal
      const start = performance.now();
      const result = service.detectCycle(
        'el-chain-49' as ElementId,
        'el-chain-0' as ElementId,
        DependencyType.REFERENCES // non-blocking
      );
      const elapsed = performance.now() - start;

      expect(result.hasCycle).toBe(false);
      expect(result.nodesVisited).toBe(0); // No traversal for non-blocking
      expect(elapsed).toBeLessThan(1); // Should be nearly instant
    });

    test('relates-to type skips cycle detection', () => {
      const start = performance.now();
      const result = service.detectCycle(
        'el-a' as ElementId,
        'el-b' as ElementId,
        DependencyType.RELATES_TO
      );
      const elapsed = performance.now() - start;

      expect(result.hasCycle).toBe(false);
      expect(result.nodesVisited).toBe(0);
      expect(elapsed).toBeLessThan(1);
    });
  });
});

describe('Blocked Cache Performance', () => {
  let db: StorageBackend;
  let cacheService: BlockedCacheService;
  const testEntity = 'en-cache-perf' as EntityId;

  beforeEach(() => {
    db = createStorage({ path: ':memory:' });
    initializeSchema(db);
    cacheService = createBlockedCacheService(db);
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================================================
  // Cache Rebuild Performance
  // ==========================================================================

  describe('Cache Rebuild', () => {
    test('rebuilds cache for 100 elements within threshold', () => {
      // Create 100 elements with blocking dependencies
      for (let i = 0; i < 100; i++) {
        const elementId = `el-rebuild-${i}`;
        createTestElement(db, elementId, 'task', 'open', testEntity);

        if (i > 0) {
          // Each element blocks the previous one
          db.run(
            `INSERT INTO dependencies (blocked_id, blocker_id, type, created_at, created_by, metadata)
             VALUES (?, ?, ?, ?, ?, null)`,
            [`el-rebuild-${i - 1}`, elementId, DependencyType.BLOCKS, new Date().toISOString(), testEntity]
          );
        }
      }

      const start = performance.now();
      const result = cacheService.rebuild();
      const elapsed = performance.now() - start;

      // 99 elements have blocking dependencies (1-99, not 0 since element 0 has no dependencies as source)
      expect(result.elementsChecked).toBe(99);
      expect(result.durationMs).toBeLessThan(PERF_THRESHOLDS.cacheRebuild100);
      expect(elapsed).toBeLessThan(PERF_THRESHOLDS.cacheRebuild100);
    });

    test('rebuilds cache for 500 elements within threshold', () => {
      // Create 500 elements with mixed dependency patterns
      for (let i = 0; i < 500; i++) {
        const elementId = `el-rebuild500-${i}`;
        createTestElement(db, elementId, 'task', 'open', testEntity);
      }

      // Create chain dependencies (every 5th element blocks the previous)
      for (let i = 5; i < 500; i += 5) {
        db.run(
          `INSERT INTO dependencies (blocked_id, blocker_id, type, created_at, created_by, metadata)
           VALUES (?, ?, ?, ?, ?, null)`,
          [`el-rebuild500-${i - 5}`, `el-rebuild500-${i}`, DependencyType.BLOCKS, new Date().toISOString(), testEntity]
        );
      }

      const start = performance.now();
      const result = cacheService.rebuild();
      const elapsed = performance.now() - start;

      expect(result.elementsChecked).toBe(99); // 100 elements with dependencies
      expect(elapsed).toBeLessThan(PERF_THRESHOLDS.cacheRebuild500);
    });

    test('rebuild handles parent-child hierarchies efficiently', () => {
      // Create a hierarchy: 10 plans, each with 10 tasks
      for (let plan = 0; plan < 10; plan++) {
        const planId = `el-plan-${plan}`;
        createTestElement(db, planId, 'plan', 'active', testEntity);

        for (let task = 0; task < 10; task++) {
          const taskId = `el-plan${plan}-task${task}`;
          createTestElement(db, taskId, 'task', 'open', testEntity);

          // Task is child of plan
          db.run(
            `INSERT INTO dependencies (blocked_id, blocker_id, type, created_at, created_by, metadata)
             VALUES (?, ?, ?, ?, ?, null)`,
            [taskId, planId, DependencyType.PARENT_CHILD, new Date().toISOString(), testEntity]
          );
        }
      }

      const start = performance.now();
      const result = cacheService.rebuild();
      const elapsed = performance.now() - start;

      expect(result.elementsChecked).toBe(100); // 100 tasks
      expect(elapsed).toBeLessThan(PERF_THRESHOLDS.cacheRebuild100);
    });
  });

  // ==========================================================================
  // Cache Query Performance
  // ==========================================================================

  describe('Cache Queries', () => {
    test('isBlocked query is O(1)', () => {
      // Create elements and populate cache
      for (let i = 0; i < 100; i++) {
        const elementId = `el-query-${i}`;
        createTestElement(db, elementId, 'task', 'open', testEntity);
        if (i % 2 === 0) {
          cacheService.addBlocked(
            elementId as ElementId,
            'el-blocker' as ElementId,
            `Blocked by test ${i}`
          );
        }
      }

      // Time individual queries
      const queryTimes: number[] = [];
      for (let i = 0; i < 100; i++) {
        const elementId = `el-query-${i}` as ElementId;
        const start = performance.now();
        cacheService.isBlocked(elementId);
        queryTimes.push(performance.now() - start);
      }

      // Average query time should be very low
      const avgQueryTime = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
      expect(avgQueryTime).toBeLessThan(PERF_THRESHOLDS.readyQueryPerElement);
    });

    test('getAllBlocked scales linearly with blocked count', () => {
      // Create 200 elements, half blocked
      for (let i = 0; i < 200; i++) {
        const elementId = `el-all-${i}`;
        createTestElement(db, elementId, 'task', 'open', testEntity);
        if (i < 100) {
          cacheService.addBlocked(
            elementId as ElementId,
            'el-blocker' as ElementId,
            `Blocked ${i}`
          );
        }
      }

      const start = performance.now();
      const blocked = cacheService.getAllBlocked();
      const elapsed = performance.now() - start;

      expect(blocked).toHaveLength(100);
      expect(elapsed).toBeLessThan(50); // Should be fast
    });

    test('getBlockedBy scales with count', () => {
      // Create 100 elements blocked by same blocker
      const blocker = 'el-main-blocker' as ElementId;
      for (let i = 0; i < 100; i++) {
        const elementId = `el-by-${i}`;
        createTestElement(db, elementId, 'task', 'open', testEntity);
        cacheService.addBlocked(elementId as ElementId, blocker, `Blocked ${i}`);
      }

      const start = performance.now();
      const blocked = cacheService.getBlockedBy(blocker);
      const elapsed = performance.now() - start;

      expect(blocked).toHaveLength(100);
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ==========================================================================
  // Incremental Update Performance
  // ==========================================================================

  describe('Incremental Updates', () => {
    test('addBlocked is O(1)', () => {
      // Pre-create elements
      for (let i = 0; i < 100; i++) {
        createTestElement(db, `el-inc-${i}`, 'task', 'open', testEntity);
      }

      const addTimes: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        cacheService.addBlocked(
          `el-inc-${i}` as ElementId,
          'el-blocker' as ElementId,
          `Reason ${i}`
        );
        addTimes.push(performance.now() - start);
      }

      const avgAddTime = addTimes.reduce((a, b) => a + b, 0) / addTimes.length;
      expect(avgAddTime).toBeLessThan(PERF_THRESHOLDS.readyQueryPerElement * 2);
    });

    test('removeBlocked is O(1)', () => {
      // Create and block elements
      for (let i = 0; i < 100; i++) {
        const elementId = `el-rem-${i}`;
        createTestElement(db, elementId, 'task', 'open', testEntity);
        cacheService.addBlocked(
          elementId as ElementId,
          'el-blocker' as ElementId,
          `Reason ${i}`
        );
      }

      const removeTimes: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        cacheService.removeBlocked(`el-rem-${i}` as ElementId);
        removeTimes.push(performance.now() - start);
      }

      const avgRemoveTime = removeTimes.reduce((a, b) => a + b, 0) / removeTimes.length;
      expect(avgRemoveTime).toBeLessThan(PERF_THRESHOLDS.readyQueryPerElement * 2);
    });
  });
});

describe('Combined Operations Performance', () => {
  let db: StorageBackend;
  let depService: DependencyService;
  let cacheService: BlockedCacheService;
  const testEntity = 'en-combined' as EntityId;

  beforeEach(() => {
    db = createStorage({ path: ':memory:' });
    initializeSchema(db);
    depService = createDependencyService(db);
    cacheService = createBlockedCacheService(db);
  });

  afterEach(() => {
    db.close();
  });

  test('workflow: create graph, rebuild cache, query', () => {
    // Create a realistic dependency graph
    // 50 tasks with various blocking relationships
    for (let i = 0; i < 50; i++) {
      createTestElement(db, `el-wf-${i}`, 'task', 'open', testEntity);
    }

    // Create dependency chains
    for (let i = 1; i < 50; i++) {
      if (i % 3 === 0) {
        // Every 3rd task blocks previous
        db.run(
          `INSERT INTO dependencies (blocked_id, blocker_id, type, created_at, created_by, metadata)
           VALUES (?, ?, ?, ?, ?, null)`,
          [`el-wf-${i - 1}`, `el-wf-${i}`, DependencyType.BLOCKS, new Date().toISOString(), testEntity]
        );
      }
    }

    const totalStart = performance.now();

    // Rebuild cache
    const rebuildResult = cacheService.rebuild();

    // Query blocked and non-blocked
    const blocked = cacheService.getAllBlocked();
    expect(blocked.length).toBeGreaterThanOrEqual(0);

    // Check individual elements
    for (let i = 0; i < 50; i++) {
      cacheService.isBlocked(`el-wf-${i}` as ElementId);
    }

    const totalElapsed = performance.now() - totalStart;

    expect(rebuildResult.elementsChecked).toBeGreaterThan(0);
    expect(totalElapsed).toBeLessThan(500);
  });

  test('stress: many dependencies between few elements', () => {
    // Create 10 elements with many dependency types between them
    const elements: ElementId[] = [];
    for (let i = 0; i < 10; i++) {
      const id = `el-stress-${i}` as ElementId;
      elements.push(id);
      createTestElement(db, id, 'task', 'open', testEntity);
    }

    // Add many non-blocking dependencies (should be fast)
    const nonBlockingTypes = [
      DependencyType.REFERENCES,
      DependencyType.RELATES_TO,
      DependencyType.CAUSED_BY,
    ];

    const start = performance.now();
    let depCount = 0;

    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        for (const type of nonBlockingTypes) {
          try {
            depService.addDependency({
              blockedId: elements[i],
              blockerId: elements[j],
              type,
              createdBy: testEntity,
            });
            depCount++;
          } catch {
            // Ignore duplicates for relates-to
          }
        }
      }
    }

    const elapsed = performance.now() - start;

    // Should be fast since non-blocking types skip cycle detection
    expect(depCount).toBeGreaterThan(50);
    expect(elapsed).toBeLessThan(500);
  });
});

// ============================================================================
// Benchmark Summary
// ============================================================================

describe('Performance Summary', () => {
  test('documents performance characteristics', () => {
    // This test documents expected performance characteristics
    // based on the dependency system specification

    const characteristics = {
      cycleDetection: {
        algorithm: 'BFS traversal from target to source',
        complexity: 'O(V + E) where V=vertices, E=edges',
        depthLimit: DEFAULT_CYCLE_DETECTION_CONFIG.maxDepth,
        optimizations: [
          'Non-blocking types skip traversal entirely',
          'Visited set prevents re-traversing nodes',
          'Depth limit prevents infinite loops',
        ],
      },
      blockedCache: {
        purpose: '~25x speedup on large datasets',
        readComplexity: 'O(1) for single element lookup',
        writeComplexity: 'O(1) for add/remove',
        rebuildComplexity: 'O(n * d) where n=elements, d=avg dependency depth',
        optimizations: [
          'Topological sort for transitive blocking',
          'Single table scan for ready queries',
          'Incremental updates avoid full rebuild',
        ],
      },
      thresholds: PERF_THRESHOLDS,
    };

    expect(characteristics.cycleDetection.depthLimit).toBe(100);
    expect(characteristics.blockedCache.readComplexity).toBe('O(1) for single element lookup');
  });
});
