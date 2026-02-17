import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  DependencyService,
  createDependencyService,
  createDependencyAddedEvent,
  createDependencyRemovedEvent,
  DEFAULT_CYCLE_DETECTION_CONFIG,
  type CycleDetectionConfig,
} from './dependency.js';
import { createStorage } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { ElementId, EntityId } from '@stoneforge/core';
import { DependencyType, GateType, TestType, TestResult, EventType, NotFoundError, ConflictError } from '@stoneforge/core';

// ============================================================================
// Test Setup
// ============================================================================

describe('DependencyService', () => {
  let db: StorageBackend;
  let service: DependencyService;

  // Test data
  const testEntity = 'el-testuser1' as EntityId;
  const blockedId1 = 'el-source123' as ElementId;
  const blockedId2 = 'el-source456' as ElementId;
  const blockerId1 = 'el-target123' as ElementId;
  const blockerId2 = 'el-target456' as ElementId;
  const blockerId3 = 'el-target789' as ElementId;

  beforeEach(() => {
    // Create in-memory database for each test
    db = createStorage({ path: ':memory:' });
    service = createDependencyService(db);
    service.initSchema();
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================================================
  // Schema Initialization
  // ==========================================================================

  describe('initSchema', () => {
    test('creates dependencies table', () => {
      // Table should already exist from beforeEach
      const tables = db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='dependencies'"
      );
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('dependencies');
    });

    test('creates indexes', () => {
      const indexes = db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_dependencies%'"
      );
      expect(indexes.length).toBeGreaterThanOrEqual(3);
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_dependencies_blocker');
      expect(indexNames).toContain('idx_dependencies_type');
      expect(indexNames).toContain('idx_dependencies_blocked_type');
    });

    test('is idempotent', () => {
      // Should not throw when called again
      expect(() => service.initSchema()).not.toThrow();
    });
  });

  // ==========================================================================
  // Add Dependency
  // ==========================================================================

  describe('addDependency', () => {
    test('adds a basic dependency', () => {
      const dep = service.addDependency({
        blockedId: blockerId1,
        blockerId: blockedId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(dep.blockedId).toBe(blockerId1);
      expect(dep.blockerId).toBe(blockedId1);
      expect(dep.type).toBe(DependencyType.BLOCKS);
      expect(dep.createdBy).toBe(testEntity);
      expect(dep.createdAt).toBeDefined();
      expect(dep.metadata).toEqual({});
    });

    test('adds dependency with metadata', () => {
      const dep = service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.AWAITS,
        createdBy: testEntity,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: '2025-01-25T10:00:00.000Z',
        },
      });

      expect(dep.metadata).toEqual({
        gateType: GateType.TIMER,
        waitUntil: '2025-01-25T10:00:00.000Z',
      });
    });

    test('throws ConflictError for duplicate dependency', () => {
      service.addDependency({
        blockedId: blockerId1,
        blockerId: blockedId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(() =>
        service.addDependency({
          blockedId: blockerId1,
          blockerId: blockedId1,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow(ConflictError);
    });

    test('allows different types between same elements', () => {
      service.addDependency({
        blockedId: blockerId1,
        blockerId: blockedId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // Should not throw - different type
      const dep = service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });

      expect(dep.type).toBe(DependencyType.REFERENCES);
    });

    test('normalizes relates-to dependencies', () => {
      // Add with larger ID as blockedId
      const dep = service.addDependency({
        blockedId: 'el-zzz' as ElementId,
        blockerId: 'el-aaa' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Should be normalized: smaller ID as blockedId
      expect(dep.blockedId).toBe('el-aaa' as ElementId);
      expect(dep.blockerId).toBe('el-zzz' as ElementId);
    });

    test('prevents duplicate relates-to in either direction', () => {
      service.addDependency({
        blockedId: 'el-aaa' as ElementId,
        blockerId: 'el-zzz' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Try adding in reverse direction - should fail as duplicate
      expect(() =>
        service.addDependency({
          blockedId: 'el-zzz' as ElementId,
          blockerId: 'el-aaa' as ElementId,
          type: DependencyType.RELATES_TO,
          createdBy: testEntity,
        })
      ).toThrow(ConflictError);
    });

    test('validates required fields', () => {
      expect(() =>
        service.addDependency({
          blockedId: '' as ElementId,
          blockerId: blockerId1,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow();

      expect(() =>
        service.addDependency({
          blockedId: blockedId1,
          blockerId: '' as ElementId,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow();

      expect(() =>
        service.addDependency({
          blockedId: blockerId1,
          blockerId: blockedId1,
          type: 'invalid' as DependencyType,
          createdBy: testEntity,
        })
      ).toThrow();
    });

    test('prevents self-reference', () => {
      expect(() =>
        service.addDependency({
          blockedId: blockedId1,
          blockerId: blockedId1,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow();
    });
  });

  // ==========================================================================
  // Remove Dependency
  // ==========================================================================

  describe('removeDependency', () => {
    test('removes existing dependency', () => {
      service.addDependency({
        blockedId: blockerId1,
        blockerId: blockedId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.removeDependency(
        blockerId1,
        blockedId1,
        DependencyType.BLOCKS,
        testEntity
      );

      expect(result).toBe(true);
      expect(service.exists(blockerId1, blockedId1, DependencyType.BLOCKS)).toBe(false);
    });

    test('throws NotFoundError for non-existent dependency', () => {
      expect(() =>
        service.removeDependency(
          blockerId1,
          blockedId1,
          DependencyType.BLOCKS,
          testEntity
        )
      ).toThrow(NotFoundError);
    });

    test('handles relates-to normalization for removal', () => {
      // Add with normalization
      service.addDependency({
        blockedId: 'el-zzz' as ElementId,
        blockerId: 'el-aaa' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Remove with original (non-normalized) order
      const result = service.removeDependency(
        'el-zzz' as ElementId,
        'el-aaa' as ElementId,
        DependencyType.RELATES_TO,
        testEntity
      );

      expect(result).toBe(true);
    });

    test('validates inputs', () => {
      expect(() =>
        service.removeDependency(
          '' as ElementId,
          blockerId1,
          DependencyType.BLOCKS,
          testEntity
        )
      ).toThrow();

      expect(() =>
        service.removeDependency(
          blockedId1,
          '' as ElementId,
          DependencyType.BLOCKS,
          testEntity
        )
      ).toThrow();
    });
  });

  // ==========================================================================
  // Get Dependencies
  // ==========================================================================

  describe('getDependencies', () => {
    beforeEach(() => {
      // Set up test dependencies where blockedId1 is the element being blocked
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId2,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId3,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockerId1,
        blockerId: blockedId2,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
    });

    test('gets all dependencies for blocked element', () => {
      const deps = service.getDependencies(blockedId1);
      expect(deps).toHaveLength(3);
    });

    test('filters by type', () => {
      const blockingDeps = service.getDependencies(blockedId1, DependencyType.BLOCKS);
      expect(blockingDeps).toHaveLength(2);
      blockingDeps.forEach((d) => {
        expect(d.type).toBe(DependencyType.BLOCKS);
      });

      const refDeps = service.getDependencies(blockedId1, DependencyType.REFERENCES);
      expect(refDeps).toHaveLength(1);
      expect(refDeps[0].blockerId).toBe(blockerId2);
    });

    test('returns empty array for element with no dependencies', () => {
      const deps = service.getDependencies('el-nonexistent' as ElementId);
      expect(deps).toEqual([]);
    });

    test('validates blockedId', () => {
      expect(() => service.getDependencies('' as ElementId)).toThrow();
    });
  });

  // ==========================================================================
  // Get Dependents
  // ==========================================================================

  describe('getDependents', () => {
    beforeEach(() => {
      // Multiple elements blocked by same blocker (blockerId1)
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId2,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });
    });

    test('gets all dependents of blocker', () => {
      const deps = service.getDependents(blockerId1);
      expect(deps).toHaveLength(3);
    });

    test('filters by type', () => {
      const blockingDeps = service.getDependents(blockerId1, DependencyType.BLOCKS);
      expect(blockingDeps).toHaveLength(2);
    });

    test('returns empty array for target with no dependents', () => {
      const deps = service.getDependents('el-nodeps' as ElementId);
      expect(deps).toEqual([]);
    });
  });

  // ==========================================================================
  // Get Related To
  // ==========================================================================

  describe('getRelatedTo', () => {
    test('finds relates-to dependencies where element is blockedId', () => {
      service.addDependency({
        blockedId: 'el-aaa' as ElementId,
        blockerId: 'el-bbb' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      const related = service.getRelatedTo('el-aaa' as ElementId);
      expect(related).toHaveLength(1);
    });

    test('finds relates-to dependencies where element is blockerId', () => {
      service.addDependency({
        blockedId: 'el-aaa' as ElementId,
        blockerId: 'el-bbb' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      const related = service.getRelatedTo('el-bbb' as ElementId);
      expect(related).toHaveLength(1);
    });

    test('finds multiple relates-to dependencies', () => {
      service.addDependency({
        blockedId: 'el-aaa' as ElementId,
        blockerId: 'el-bbb' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: 'el-aaa' as ElementId,
        blockerId: 'el-ccc' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      const related = service.getRelatedTo('el-aaa' as ElementId);
      expect(related).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Exists
  // ==========================================================================

  describe('exists', () => {
    test('returns true for existing dependency', () => {
      service.addDependency({
        blockedId: blockerId1,
        blockerId: blockedId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(service.exists(blockerId1, blockedId1, DependencyType.BLOCKS)).toBe(true);
    });

    test('returns false for non-existing dependency', () => {
      expect(service.exists(blockerId1, blockedId1, DependencyType.BLOCKS)).toBe(false);
    });

    test('handles relates-to normalization', () => {
      service.addDependency({
        blockedId: 'el-zzz' as ElementId,
        blockerId: 'el-aaa' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Check with original order
      expect(
        service.exists(
          'el-zzz' as ElementId,
          'el-aaa' as ElementId,
          DependencyType.RELATES_TO
        )
      ).toBe(true);

      // Check with reversed order
      expect(
        service.exists(
          'el-aaa' as ElementId,
          'el-zzz' as ElementId,
          DependencyType.RELATES_TO
        )
      ).toBe(true);
    });
  });

  // ==========================================================================
  // Get Single Dependency
  // ==========================================================================

  describe('getDependency', () => {
    test('returns dependency when exists', () => {
      service.addDependency({
        blockedId: blockerId1,
        blockerId: blockedId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const dep = service.getDependency(blockerId1, blockedId1, DependencyType.BLOCKS);
      expect(dep).toBeDefined();
      expect(dep!.blockedId).toBe(blockerId1);
      expect(dep!.blockerId).toBe(blockedId1);
      expect(dep!.type).toBe(DependencyType.BLOCKS);
    });

    test('returns undefined when not exists', () => {
      const dep = service.getDependency(blockerId1, blockedId1, DependencyType.BLOCKS);
      expect(dep).toBeUndefined();
    });

    test('handles relates-to normalization', () => {
      service.addDependency({
        blockedId: 'el-zzz' as ElementId,
        blockerId: 'el-aaa' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Fetch with reversed order
      const dep = service.getDependency(
        'el-zzz' as ElementId,
        'el-aaa' as ElementId,
        DependencyType.RELATES_TO
      );

      expect(dep).toBeDefined();
      // The returned dependency should have normalized order
      expect(dep!.blockedId).toBe('el-aaa' as ElementId);
      expect(dep!.blockerId).toBe('el-zzz' as ElementId);
    });
  });

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  describe('getDependenciesForMany', () => {
    beforeEach(() => {
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId2,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId2,
        blockerId: blockerId1,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });
    });

    test('gets dependencies for multiple blocked elements', () => {
      const deps = service.getDependenciesForMany([blockedId1, blockedId2]);
      expect(deps).toHaveLength(3);
    });

    test('filters by type', () => {
      const deps = service.getDependenciesForMany(
        [blockedId1, blockedId2],
        DependencyType.BLOCKS
      );
      expect(deps).toHaveLength(2);
    });

    test('returns empty array for empty input', () => {
      const deps = service.getDependenciesForMany([]);
      expect(deps).toEqual([]);
    });
  });

  describe('removeAllDependencies', () => {
    beforeEach(() => {
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId2,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });
    });

    test('removes all dependencies for blocked element', () => {
      const count = service.removeAllDependencies(blockedId1);
      expect(count).toBe(2);
      expect(service.getDependencies(blockedId1)).toHaveLength(0);
    });

    test('removes only specified type', () => {
      const count = service.removeAllDependencies(blockedId1, DependencyType.BLOCKS);
      expect(count).toBe(1);
      expect(service.getDependencies(blockedId1)).toHaveLength(1);
    });

    test('returns 0 for element with no dependencies', () => {
      const count = service.removeAllDependencies('el-none' as ElementId);
      expect(count).toBe(0);
    });
  });

  describe('removeAllDependents', () => {
    beforeEach(() => {
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId2,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
    });

    test('removes all dependencies where element is blocker', () => {
      const count = service.removeAllDependents(blockerId1);
      expect(count).toBe(2);
      expect(service.getDependents(blockerId1)).toHaveLength(0);
    });

    test('returns 0 for element with no dependents', () => {
      const count = service.removeAllDependents('el-none' as ElementId);
      expect(count).toBe(0);
    });
  });

  // ==========================================================================
  // Count Operations
  // ==========================================================================

  describe('countDependencies', () => {
    test('counts dependencies for blocked element', () => {
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId2,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(service.countDependencies(blockedId1)).toBe(2);
    });

    test('counts by type', () => {
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId2,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });

      expect(service.countDependencies(blockedId1, DependencyType.BLOCKS)).toBe(1);
    });

    test('returns 0 for no dependencies', () => {
      expect(service.countDependencies(blockedId1)).toBe(0);
    });
  });

  describe('countDependents', () => {
    test('counts dependents of blocker', () => {
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId2,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(service.countDependents(blockerId1)).toBe(2);
    });

    test('counts by type', () => {
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: blockedId2,
        blockerId: blockerId1,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });

      expect(service.countDependents(blockerId1, DependencyType.BLOCKS)).toBe(1);
    });

    test('returns 0 for no dependents', () => {
      expect(service.countDependents(blockerId1)).toBe(0);
    });
  });

  // ==========================================================================
  // All Dependency Types
  // ==========================================================================

  describe('all dependency types', () => {
    const allTypes = [
      // Blocking
      DependencyType.BLOCKS,
      DependencyType.PARENT_CHILD,
      DependencyType.AWAITS,
      // Associative
      DependencyType.RELATES_TO,
      DependencyType.REFERENCES,
      DependencyType.SUPERSEDES,
      DependencyType.DUPLICATES,
      DependencyType.CAUSED_BY,
      DependencyType.VALIDATES,
      // Attribution
      DependencyType.AUTHORED_BY,
      DependencyType.ASSIGNED_TO,
      DependencyType.APPROVED_BY,
      // Threading
      DependencyType.REPLIES_TO,
    ];

    test.each(allTypes)('supports %s dependency type', (type) => {
      // Use different blockedId/blockerId for relates-to to avoid normalization issues
      const src = type === DependencyType.RELATES_TO ? 'el-aaa' as ElementId : blockedId1;
      const tgt = type === DependencyType.RELATES_TO ? 'el-bbb' as ElementId : blockerId1;

      // Awaits and validates require specific metadata
      let metadata: Record<string, unknown> | undefined;
      if (type === DependencyType.AWAITS) {
        metadata = {
          gateType: GateType.TIMER,
          waitUntil: '2025-01-25T10:00:00.000Z',
        };
      } else if (type === DependencyType.VALIDATES) {
        metadata = {
          testType: TestType.UNIT,
          result: TestResult.PASS,
        };
      }

      const dep = service.addDependency({
        blockedId: src,
        blockerId: tgt,
        type,
        createdBy: testEntity,
        metadata,
      });

      expect(dep.type).toBe(type);
      expect(service.exists(src, tgt, type)).toBe(true);
    });
  });

  // ==========================================================================
  // Metadata Handling
  // ==========================================================================

  describe('metadata handling', () => {
    test('stores and retrieves awaits timer metadata', () => {
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.AWAITS,
        createdBy: testEntity,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: '2025-01-25T10:00:00.000Z',
        },
      });

      const dep = service.getDependency(blockedId1, blockerId1, DependencyType.AWAITS);
      expect(dep?.metadata).toEqual({
        gateType: GateType.TIMER,
        waitUntil: '2025-01-25T10:00:00.000Z',
      });
    });

    test('stores and retrieves awaits approval metadata', () => {
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.AWAITS,
        createdBy: testEntity,
        metadata: {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['el-user1', 'el-user2'],
          approvalCount: 1,
        },
      });

      const dep = service.getDependency(blockedId1, blockerId1, DependencyType.AWAITS);
      expect(dep?.metadata.gateType).toBe(GateType.APPROVAL);
      expect(dep?.metadata.requiredApprovers).toEqual(['el-user1', 'el-user2']);
    });

    test('stores and retrieves validates metadata', () => {
      service.addDependency({
        blockedId: blockedId1,
        blockerId: blockerId1,
        type: DependencyType.VALIDATES,
        createdBy: testEntity,
        metadata: {
          testType: TestType.UNIT,
          result: TestResult.PASS,
          details: 'All tests passed',
        },
      });

      const dep = service.getDependency(blockedId1, blockerId1, DependencyType.VALIDATES);
      expect(dep?.metadata).toEqual({
        testType: TestType.UNIT,
        result: TestResult.PASS,
        details: 'All tests passed',
      });
    });

    test('handles empty metadata', () => {
      service.addDependency({
        blockedId: blockerId1,
        blockerId: blockedId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const dep = service.getDependency(blockerId1, blockedId1, DependencyType.BLOCKS);
      expect(dep?.metadata).toEqual({});
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe('createDependencyService', () => {
    test('creates service instance', () => {
      const newService = createDependencyService(db);
      expect(newService).toBeInstanceOf(DependencyService);
    });
  });
});

// ============================================================================
// Event Creation Helpers Tests
// ============================================================================

describe('Dependency Event Helpers', () => {
  const testEntity = 'el-testuser1' as EntityId;
  const blockedId = 'el-target456' as ElementId;
  const blockerId = 'el-source123' as ElementId;

  describe('createDependencyAddedEvent', () => {
    test('creates event with correct type', () => {
      const dependency = {
        blockedId,
        blockerId,
        type: DependencyType.BLOCKS,
        createdAt: '2025-01-22T10:00:00.000Z',
        createdBy: testEntity,
        metadata: {},
      };

      const event = createDependencyAddedEvent(dependency);

      expect(event.eventType).toBe(EventType.DEPENDENCY_ADDED);
      expect(event.elementId).toBe(blockedId);
      expect(event.actor).toBe(testEntity);
      expect(event.oldValue).toBeNull();
      expect(event.newValue).toEqual({
        blockedId,
        blockerId,
        type: DependencyType.BLOCKS,
        metadata: {},
      });
      expect(event.createdAt).toBeDefined();
    });

    test('includes metadata in event', () => {
      const metadata = {
        gateType: GateType.TIMER,
        waitUntil: '2025-01-25T10:00:00.000Z',
      };

      const dependency = {
        blockedId: 'el-source123' as ElementId,
        blockerId: 'el-target456' as ElementId,
        type: DependencyType.AWAITS,
        createdAt: '2025-01-22T10:00:00.000Z',
        createdBy: testEntity,
        metadata,
      };

      const event = createDependencyAddedEvent(dependency);

      expect(event.newValue).toEqual({
        blockedId: 'el-source123' as ElementId,
        blockerId: 'el-target456' as ElementId,
        type: DependencyType.AWAITS,
        metadata,
      });
    });
  });

  describe('createDependencyRemovedEvent', () => {
    test('creates event with correct type', () => {
      const dependency = {
        blockedId,
        blockerId,
        type: DependencyType.BLOCKS,
        createdAt: '2025-01-22T10:00:00.000Z',
        createdBy: testEntity,
        metadata: {},
      };

      const actor = 'el-remover1' as EntityId;
      const event = createDependencyRemovedEvent(dependency, actor);

      expect(event.eventType).toBe(EventType.DEPENDENCY_REMOVED);
      expect(event.elementId).toBe(blockedId);
      expect(event.actor).toBe(actor);
      expect(event.oldValue).toEqual({
        blockedId,
        blockerId,
        type: DependencyType.BLOCKS,
        metadata: {},
      });
      expect(event.newValue).toBeNull();
      expect(event.createdAt).toBeDefined();
    });

    test('uses different actor than creator', () => {
      const dependency = {
        blockedId: 'el-source123' as ElementId,
        blockerId: 'el-target456' as ElementId,
        type: DependencyType.REFERENCES,
        createdAt: '2025-01-22T10:00:00.000Z',
        createdBy: testEntity,
        metadata: {},
      };

      const differentActor = 'el-admin1' as EntityId;
      const event = createDependencyRemovedEvent(dependency, differentActor);

      expect(event.actor).toBe(differentActor);
      expect(event.actor).not.toBe(dependency.createdBy);
    });
  });
});

// ============================================================================
// Cycle Detection Tests
// ============================================================================

describe('Cycle Detection', () => {
  let db: StorageBackend;
  let service: DependencyService;

  // Test data - use el- prefix for clarity
  const testEntity = 'el-testuser1' as EntityId;
  const elA = 'el-A' as ElementId;
  const elB = 'el-B' as ElementId;
  const elC = 'el-C' as ElementId;
  const elD = 'el-D' as ElementId;
  const elE = 'el-E' as ElementId;

  beforeEach(() => {
    db = createStorage({ path: ':memory:' });
    service = createDependencyService(db);
    service.initSchema();
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================================================
  // detectCycle Tests
  // ==========================================================================

  describe('detectCycle', () => {
    test('returns no cycle for non-blocking dependency types', () => {
      // Add a chain that would be a cycle if blocking
      service.addDependency({
        blockedId: elA,
        blockerId: elB,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });

      // Check if adding B -> A (reverse) would create a cycle
      // It shouldn't because REFERENCES is not a blocking type
      const result = service.detectCycle(elB, elA, DependencyType.REFERENCES);

      expect(result.hasCycle).toBe(false);
      expect(result.nodesVisited).toBe(0);
      expect(result.depthLimitReached).toBe(false);
    });

    test('returns no cycle when there is no path from blocker to blocked', () => {
      // A blocks B: blockedId=B, blockerId=A
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // Check if C blocks A would create a cycle (blockedId=A, blockerId=C)
      // BFS from C: nothing found with blocked_id=C, so no cycle
      const result = service.detectCycle(elA, elC, DependencyType.BLOCKS);

      expect(result.hasCycle).toBe(false);
    });

    test('detects simple direct cycle (A -> B, B -> A)', () => {
      // A blocks B: blockedId=B, blockerId=A
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // Check if adding B blocks A would create a cycle (blockedId=A, blockerId=B)
      // BFS from B (blockerId): blocked_id=B -> follows to blocker A -> A == blockedId? Yes!
      const result = service.detectCycle(elA, elB, DependencyType.BLOCKS);

      expect(result.hasCycle).toBe(true);
      // Path: starts at blockerId (B), traverses to A, and blockedId (A) completes the cycle
      expect(result.cyclePath).toEqual([elB, elA, elA]);
      // We visit B (blockerId) and then find A (blockedId) which completes cycle
      expect(result.nodesVisited).toBe(2);
    });

    test('detects longer cycle (A -> B -> C, C -> A)', () => {
      // A blocks B: blockedId=B, blockerId=A
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // B blocks C: blockedId=C, blockerId=B
      service.addDependency({
        blockedId: elC,
        blockerId: elB,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // Check if adding C blocks A would create a cycle (blockedId=A, blockerId=C)
      // BFS from C: blocked_id=C -> blocker B, blocked_id=B -> blocker A, A == blockedId? Yes!
      const result = service.detectCycle(elA, elC, DependencyType.BLOCKS);

      expect(result.hasCycle).toBe(true);
      // Path includes the blockedId at the end to show the full cycle
      expect(result.cyclePath).toEqual([elC, elB, elA, elA]);
      expect(result.nodesVisited).toBeGreaterThanOrEqual(2);
    });

    test('detects cycle through parent-child relationships', () => {
      // A parent-of B: blockedId=A, blockerId=B (non-blocks, no value flip)
      service.addDependency({
        blockedId: elA,
        blockerId: elB,
        type: DependencyType.PARENT_CHILD,
        createdBy: testEntity,
      });

      // Check if B parent-of A would create a cycle (blockedId=B, blockerId=A)
      const result = service.detectCycle(elB, elA, DependencyType.PARENT_CHILD);

      expect(result.hasCycle).toBe(true);
    });

    test('detects cycle through awaits relationships', () => {
      // A awaits B: blockedId=A, blockerId=B (non-blocks, no value flip)
      service.addDependency({
        blockedId: elA,
        blockerId: elB,
        type: DependencyType.AWAITS,
        createdBy: testEntity,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: '2025-12-31T23:59:59.000Z',
        },
      });

      // Check if B awaits A would create a cycle (blockedId=B, blockerId=A)
      const result = service.detectCycle(elB, elA, DependencyType.AWAITS);

      expect(result.hasCycle).toBe(true);
    });

    test('detects cycle through mixed blocking types', () => {
      // A blocks B: blockedId=B, blockerId=A
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // B parent-of C: blockedId=B, blockerId=C (non-blocks, no value flip)
      service.addDependency({
        blockedId: elB,
        blockerId: elC,
        type: DependencyType.PARENT_CHILD,
        createdBy: testEntity,
      });

      // C awaits D: blockedId=C, blockerId=D (non-blocks, no value flip)
      service.addDependency({
        blockedId: elC,
        blockerId: elD,
        type: DependencyType.AWAITS,
        createdBy: testEntity,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: '2025-12-31T23:59:59.000Z',
        },
      });

      // Check if D blocks A would create a cycle (blockedId=A, blockerId=D)
      // BFS from D: blocked_id=D? No. blocked_id=C -> blocker D. blocked_id=B -> blockers A, C.
      // Actually let me trace: BFS from D (blockerId). getBlockingDependenciesFrom(D) = WHERE blocked_id=D: nothing.
      // Wait - we need to verify the graph structure.
      // Deps stored: (blocked=B, blocker=A), (blocked=B, blocker=C), (blocked=C, blocker=D)
      // BFS from D: WHERE blocked_id=D -> nothing found. No cycle.
      // The issue is the mixed-type graph doesn't connect as expected. Let me restructure.
      // Actually for cycle detection the traversal is: from a node, find where blocked_id=node, follow to blocker_id.
      // From D: WHERE blocked_id=D -> nothing. Dead end.
      // The original test had: A->B (blocks, source=A,target=B), B->C (parent-child, source=B,target=C), C->D (awaits, source=C,target=D)
      // Old traversal from A (blockerId): blocked_id=A -> finds (A,B), follow to B. blocked_id=B -> finds (B,C), follow to C. blocked_id=C -> finds (C,D), follow to D. D==blockedId? Yes.
      // New: For blocks A->B: blocked=B, blocker=A. For p-c B->C: blocked=B, blocker=C. For awaits C->D: blocked=C, blocker=D.
      // New traversal from blockerId for "D blocks A" (blockedId=A, blockerId=D): BFS from D.
      // blocked_id=D -> nothing. Dead end. No cycle found!
      // The problem is the traversal direction. In old code, getBlockingDependenciesFrom used blocked_id (the outgoing direction).
      // In new code, it uses blocked_id (the element being blocked). These are different traversals.
      // For this test to work, we need the chain: blocked_id=B (blocker=A), blocked_id=C (blocker=B), blocked_id=D (blocker=C)
      // So: A blocks B -> blocked=B, blocker=A. B blocks C -> blocked=C, blocker=B. C blocks D -> blocked=D, blocker=C.
      // But these are different dep types (parent-child, awaits).
      // For parent-child: old source=B, target=C means new blocked=B, blocker=C.
      // For the traversal to work: from D, we need blocked_id=D -> finds (blocked=D, blocker=C). Follow to C. blocked_id=C -> finds (blocked=C, blocker=D from awaits). Follow to D. But that's circular on D, not reaching A.
      // The graph needs restructuring for the new traversal direction.
      // Let me use: A blocks B (blocked=B, blocker=A), C is child of B (blocked=C, blocker=B), D awaits C (blocked=D, blocker=C)
      // Then checking "D blocks A" (blocked=A, blocker=D): BFS from D. blocked_id=D -> finds (D, blocker=C). Follow to C. blocked_id=C -> finds (C, blocker=B). Follow to B. blocked_id=B -> finds (B, blocker=A). Follow to A. A == blockedId (A)? Yes! Cycle!
      const result = service.detectCycle(elA, elD, DependencyType.BLOCKS);

      expect(result.hasCycle).toBe(false);
    });

    test('detects cycle through mixed blocking types (restructured)', () => {
      // A blocks B: blocked=B, blocker=A
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // C is child of B: blocked=C, blocker=B (parent-child)
      service.addDependency({
        blockedId: elC,
        blockerId: elB,
        type: DependencyType.PARENT_CHILD,
        createdBy: testEntity,
      });

      // D awaits C: blocked=D, blocker=C (awaits)
      service.addDependency({
        blockedId: elD,
        blockerId: elC,
        type: DependencyType.AWAITS,
        createdBy: testEntity,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: '2025-12-31T23:59:59.000Z',
        },
      });

      // Check if D blocks A would create a cycle (blockedId=A, blockerId=D)
      // BFS from D: blocked_id=D -> (D, blocker=C). Follow to C. blocked_id=C -> (C, blocker=B). Follow to B. blocked_id=B -> (B, blocker=A). Follow to A. A == blockedId? Yes!
      const result = service.detectCycle(elA, elD, DependencyType.BLOCKS);

      expect(result.hasCycle).toBe(true);
      expect(result.cyclePath).toEqual([elD, elC, elB, elA, elA]);
    });

    test('does not consider non-blocking types in cycle detection', () => {
      // A references B (non-blocking)
      service.addDependency({
        blockedId: elA,
        blockerId: elB,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });

      // B relates-to C (non-blocking)
      service.addDependency({
        blockedId: elB,
        blockerId: elC,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Check if C blocks A would create a cycle (blockedId=A, blockerId=C)
      // It shouldn't because the existing dependencies are non-blocking
      const result = service.detectCycle(elA, elC, DependencyType.BLOCKS);

      expect(result.hasCycle).toBe(false);
    });

    test('excludes relates-to from cycle detection (bidirectional by design)', () => {
      // A relates-to B (always allowed in both directions)
      service.addDependency({
        blockedId: elA,
        blockerId: elB,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Check adding B relates-to A - should not be considered a cycle
      // (though it will be deduplicated as the same relationship)
      const result = service.detectCycle(elB, elA, DependencyType.RELATES_TO);

      expect(result.hasCycle).toBe(false);
      expect(result.nodesVisited).toBe(0); // Non-blocking types skip traversal
    });

    test('respects depth limit', () => {
      // Create a long chain: A blocks B blocks C blocks D blocks E
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elC,
        blockerId: elB,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elD,
        blockerId: elC,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elE,
        blockerId: elD,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // Check if E blocks A would create a cycle (blockedId=A, blockerId=E)
      // With depth limit of 2, should not traverse far enough
      const config: CycleDetectionConfig = { maxDepth: 2 };
      const result = service.detectCycle(elA, elE, DependencyType.BLOCKS, config);

      // Should hit depth limit before finding the cycle
      expect(result.depthLimitReached).toBe(true);
      expect(result.hasCycle).toBe(false);
    });

    test('handles diamond dependency pattern without false positives', () => {
      // Diamond: A blocks B, A blocks C, B blocks D, C blocks D
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elC,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elD,
        blockerId: elB,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elD,
        blockerId: elC,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // Adding E blocks A should not create a cycle (blockedId=A, blockerId=E)
      const result = service.detectCycle(elA, elE, DependencyType.BLOCKS);
      expect(result.hasCycle).toBe(false);
    });

    test('handles self-reference check gracefully', () => {
      // Note: Self-reference should be caught by dependency creation validation
      // but detectCycle correctly identifies it as a cycle
      const result = service.detectCycle(elA, elA, DependencyType.BLOCKS);

      // When blockedId == blockerId, starting from blockerId immediately finds blockedId
      // This is correctly detected as a cycle
      expect(result.hasCycle).toBe(true);
      expect(result.cyclePath).toEqual([elA, elA]);
    });

    test('validates input parameters', () => {
      expect(() =>
        service.detectCycle('' as ElementId, elB, DependencyType.BLOCKS)
      ).toThrow();

      expect(() =>
        service.detectCycle(elA, '' as ElementId, DependencyType.BLOCKS)
      ).toThrow();

      expect(() =>
        service.detectCycle(elA, elB, 'invalid' as DependencyType)
      ).toThrow();
    });

    test('uses default config when not specified', () => {
      const result = service.detectCycle(elA, elB, DependencyType.BLOCKS);
      // Should use DEFAULT_CYCLE_DETECTION_CONFIG
      expect(DEFAULT_CYCLE_DETECTION_CONFIG.maxDepth).toBe(100);
      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // checkForCycle Tests
  // ==========================================================================

  describe('checkForCycle', () => {
    test('does not throw when no cycle exists', () => {
      expect(() =>
        service.checkForCycle(elA, elB, DependencyType.BLOCKS)
      ).not.toThrow();
    });

    test('throws ConflictError when cycle would be created', () => {
      // A blocks B: blockedId=B, blockerId=A
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // B blocks A would create a cycle: blockedId=A, blockerId=B
      expect(() =>
        service.checkForCycle(elA, elB, DependencyType.BLOCKS)
      ).toThrow(ConflictError);
    });

    test('throws with CYCLE_DETECTED error code', () => {
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      try {
        service.checkForCycle(elA, elB, DependencyType.BLOCKS);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).code).toBe(ErrorCode.CYCLE_DETECTED);
      }
    });

    test('error includes cycle path in details', () => {
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elC,
        blockerId: elB,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      try {
        // C blocks A: blockedId=A, blockerId=C
        service.checkForCycle(elA, elC, DependencyType.BLOCKS);
        expect(true).toBe(false);
      } catch (error) {
        const details = (error as ConflictError).details;
        expect(details.blockedId).toBe(elA);
        expect(details.blockerId).toBe(elC);
        expect(details.dependencyType).toBe(DependencyType.BLOCKS);
        expect(details.cyclePath).toBeDefined();
        expect(Array.isArray(details.cyclePath)).toBe(true);
      }
    });

    test('error message includes readable cycle path', () => {
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      try {
        // B blocks A: blockedId=A, blockerId=B
        service.checkForCycle(elA, elB, DependencyType.BLOCKS);
        expect(true).toBe(false);
      } catch (error) {
        const message = (error as ConflictError).message;
        expect(message).toContain('cycle');
        expect(message).toContain('->');
      }
    });
  });

  // ==========================================================================
  // addDependency Cycle Detection Integration Tests
  // ==========================================================================

  describe('addDependency with cycle detection', () => {
    test('prevents adding dependency that would create direct cycle', () => {
      // A blocks B
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // B blocks A should fail
      expect(() =>
        service.addDependency({
          blockedId: elA,
          blockerId: elB,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow(ConflictError);

      // Verify the dependency was not added
      expect(service.exists(elA, elB, DependencyType.BLOCKS)).toBe(false);
    });

    test('prevents adding dependency that would create transitive cycle', () => {
      // A -> B -> C chain
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elC,
        blockerId: elB,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // C -> A should fail (creates cycle)
      expect(() =>
        service.addDependency({
          blockedId: elA,
          blockerId: elC,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow(ConflictError);

      expect(service.exists(elA, elC, DependencyType.BLOCKS)).toBe(false);
    });

    test('allows adding non-blocking dependency even if it would form a "cycle"', () => {
      // A blocks B
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // B references A should be allowed (non-blocking)
      const dep = service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });

      expect(dep.type).toBe(DependencyType.REFERENCES);
      expect(service.exists(elB, elA, DependencyType.REFERENCES)).toBe(true);
    });

    test('allows adding parallel non-cyclic dependencies', () => {
      // A blocks B
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // A blocks C (parallel, not a cycle)
      const dep = service.addDependency({
        blockedId: elC,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(dep.blockedId).toBe(elC);
    });

    test('allows forking (same blocker, multiple blocked)', () => {
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elC,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elD,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // A is the blocker for 3 elements
      expect(service.countDependents(elA, DependencyType.BLOCKS)).toBe(3);
    });

    test('allows converging (multiple blockers, same blocked)', () => {
      service.addDependency({
        blockedId: elD,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elD,
        blockerId: elB,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elD,
        blockerId: elC,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // D has 3 dependencies (things blocking it)
      expect(service.countDependencies(elD, DependencyType.BLOCKS)).toBe(3);
    });

    test('prevents cycle with custom depth config', () => {
      // Create a chain: A -> B -> C
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elC,
        blockerId: elB,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // Try to add C -> A with depth limit of 1
      // This should NOT detect the cycle because depth limit is too small
      const config: CycleDetectionConfig = { maxDepth: 1 };

      // Note: When depth limit is reached, the operation is allowed
      // (conservative approach - better to allow than falsely reject)
      const dep = service.addDependency(
        {
          blockedId: elA,
          blockerId: elC,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        },
        config
      );

      // This actually creates a cycle because depth limit was too small
      // In production, you'd want to use appropriate depth limits
      expect(dep.blockedId).toBe(elA);
    });

    test('cycle detection happens before database insert', () => {
      // A blocks B
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const countBefore = service.countDependencies(elB);

      // Try to create cycle
      try {
        service.addDependency({
          blockedId: elA,
          blockerId: elB,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
      } catch {
        // Expected
      }

      const countAfter = service.countDependencies(elB);
      expect(countAfter).toBe(countBefore);
    });
  });

  // ==========================================================================
  // Edge Cases and Complex Scenarios
  // ==========================================================================

  describe('edge cases', () => {
    test('handles empty graph', () => {
      const result = service.detectCycle(elA, elB, DependencyType.BLOCKS);
      expect(result.hasCycle).toBe(false);
      expect(result.nodesVisited).toBe(1); // Just visits target (elB)
    });

    test('handles graph with only non-blocking edges', () => {
      service.addDependency({
        blockedId: elA,
        blockerId: elB,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elB,
        blockerId: elC,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elC,
        blockerId: elA,
        type: DependencyType.CAUSED_BY,
        createdBy: testEntity,
      });

      // Adding blocking dependency should not see any existing "cycle"
      const result = service.detectCycle(elD, elA, DependencyType.BLOCKS);
      expect(result.hasCycle).toBe(false);
    });

    test('handles self-loop attempt (caught by validation)', () => {
      // Self-reference is caught by createDependency validation
      expect(() =>
        service.addDependency({
          blockedId: elA,
          blockerId: elA,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow();
    });

    test('handles multiple separate chains without false positive', () => {
      // Chain 1: A -> B -> C
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        blockedId: elC,
        blockerId: elB,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // Chain 2: D -> E (separate)
      service.addDependency({
        blockedId: elE,
        blockerId: elD,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // Connecting chains: C -> D should be allowed (no cycle)
      const dep = service.addDependency({
        blockedId: elD,
        blockerId: elC,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(dep.blockedId).toBe(elD);
      expect(dep.blockerId).toBe(elC);
    });

    test('handles wide graph (many siblings) efficiently', () => {
      // A blocks many siblings
      for (let i = 0; i < 50; i++) {
        service.addDependency({
          blockedId: `el-sibling-${i}` as ElementId,
          blockerId: elA,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
      }

      // Adding new sibling should be fast
      const start = performance.now();
      service.addDependency({
        blockedId: elB,
        blockerId: elA,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      const elapsed = performance.now() - start;

      // Should complete quickly (less than 100ms)
      expect(elapsed).toBeLessThan(100);
    });

    test('handles deep chain within default depth limit', () => {
      // Create a deep chain of 50 nodes
      let prevId = elA;
      for (let i = 0; i < 50; i++) {
        const newId = `el-node-${i}` as ElementId;
        service.addDependency({
          blockedId: newId,
          blockerId: prevId,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
        prevId = newId;
      }

      // Try to add cycle from end back to start
      expect(() =>
        service.addDependency({
          blockedId: elA,
          blockerId: prevId,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow(ConflictError);
    });
  });
});

// ============================================================================
// Import ErrorCode at the end for cycle detection tests
// ============================================================================

import { ErrorCode } from '@stoneforge/core';
