/**
 * Query API Types Tests
 *
 * Comprehensive tests for all Query API type definitions, type guards,
 * validation helpers, and constants.
 */

import { describe, it, expect } from 'bun:test';
import {
  // Type guards
  isSortDirection,
  isConflictStrategy,
  isExportFormat,
  isValidElementFilter,
  isValidTaskFilter,
  isValidGetOptions,
  isValidExportOptions,
  isValidImportOptions,
  // Constants
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  DEFAULT_CONFLICT_STRATEGY,
  DEFAULT_EXPORT_FORMAT,
  // Types (imported for type-level testing)
  type ElementFilter,
  type TaskFilter,
  type GetOptions,
  type HydrationOptions,
  type BlockedTask,
  type DependencyTree,
  type DependencyInput,
  type ExportOptions,
  type ImportOptions,
  type ImportResult,
  type ImportConflict,
  type SystemStats,
  type ListResult,
  type ElementInput,
  type PaginationOptions,
  type SortOptions,
} from './types.js';
import {
  ElementType,
  type Element,
  type ElementId,
  type EntityId,
  type Timestamp,
  TaskStatus,
  Priority,
  Complexity,
  TaskTypeValue,
  type Task,
  DependencyType,
} from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockElementId = 'el-abc123' as ElementId;
const mockEntityId = 'el-entity1' as EntityId;
const mockTimestamp = '2024-01-15T10:30:00.000Z' as Timestamp;

// ============================================================================
// SortDirection Tests
// ============================================================================

describe('SortDirection', () => {
  describe('isSortDirection', () => {
    it('should return true for "asc"', () => {
      expect(isSortDirection('asc')).toBe(true);
    });

    it('should return true for "desc"', () => {
      expect(isSortDirection('desc')).toBe(true);
    });

    it('should return false for invalid strings', () => {
      expect(isSortDirection('ascending')).toBe(false);
      expect(isSortDirection('descending')).toBe(false);
      expect(isSortDirection('ASC')).toBe(false);
      expect(isSortDirection('DESC')).toBe(false);
      expect(isSortDirection('')).toBe(false);
      expect(isSortDirection('up')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isSortDirection(null)).toBe(false);
      expect(isSortDirection(undefined)).toBe(false);
      expect(isSortDirection(1)).toBe(false);
      expect(isSortDirection(true)).toBe(false);
      expect(isSortDirection({})).toBe(false);
      expect(isSortDirection([])).toBe(false);
    });
  });
});

// ============================================================================
// ConflictStrategy Tests
// ============================================================================

describe('ConflictStrategy', () => {
  describe('isConflictStrategy', () => {
    it('should return true for "skip"', () => {
      expect(isConflictStrategy('skip')).toBe(true);
    });

    it('should return true for "overwrite"', () => {
      expect(isConflictStrategy('overwrite')).toBe(true);
    });

    it('should return true for "error"', () => {
      expect(isConflictStrategy('error')).toBe(true);
    });

    it('should return false for invalid strings', () => {
      expect(isConflictStrategy('ignore')).toBe(false);
      expect(isConflictStrategy('merge')).toBe(false);
      expect(isConflictStrategy('SKIP')).toBe(false);
      expect(isConflictStrategy('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isConflictStrategy(null)).toBe(false);
      expect(isConflictStrategy(undefined)).toBe(false);
      expect(isConflictStrategy(0)).toBe(false);
      expect(isConflictStrategy(false)).toBe(false);
    });
  });
});

// ============================================================================
// ExportFormat Tests
// ============================================================================

describe('ExportFormat', () => {
  describe('isExportFormat', () => {
    it('should return true for "jsonl"', () => {
      expect(isExportFormat('jsonl')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isExportFormat('json')).toBe(false);
      expect(isExportFormat('csv')).toBe(false);
      expect(isExportFormat('JSONL')).toBe(false);
      expect(isExportFormat('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isExportFormat(null)).toBe(false);
      expect(isExportFormat(undefined)).toBe(false);
      expect(isExportFormat(123)).toBe(false);
    });
  });
});

// ============================================================================
// ElementFilter Validation Tests
// ============================================================================

describe('ElementFilter', () => {
  describe('isValidElementFilter', () => {
    it('should return true for empty object', () => {
      expect(isValidElementFilter({})).toBe(true);
    });

    it('should return true for valid filter with type', () => {
      expect(isValidElementFilter({ type: ElementType.TASK })).toBe(true);
      expect(isValidElementFilter({ type: [ElementType.TASK, ElementType.DOCUMENT] })).toBe(true);
    });

    it('should return true for valid pagination options', () => {
      expect(isValidElementFilter({ limit: 10 })).toBe(true);
      expect(isValidElementFilter({ offset: 0 })).toBe(true);
      expect(isValidElementFilter({ limit: 50, offset: 100 })).toBe(true);
    });

    it('should return false for negative limit', () => {
      expect(isValidElementFilter({ limit: -1 })).toBe(false);
    });

    it('should return false for negative offset', () => {
      expect(isValidElementFilter({ offset: -5 })).toBe(false);
    });

    it('should return false for non-integer limit', () => {
      expect(isValidElementFilter({ limit: 10.5 })).toBe(false);
    });

    it('should return false for non-integer offset', () => {
      expect(isValidElementFilter({ offset: 2.5 })).toBe(false);
    });

    it('should return true for valid sort options', () => {
      expect(isValidElementFilter({ orderBy: 'createdAt', orderDir: 'asc' })).toBe(true);
      expect(isValidElementFilter({ orderBy: 'updatedAt', orderDir: 'desc' })).toBe(true);
    });

    it('should return false for invalid orderDir', () => {
      expect(isValidElementFilter({ orderDir: 'ascending' })).toBe(false);
    });

    it('should return true for valid tags filter', () => {
      expect(isValidElementFilter({ tags: ['urgent', 'bug'] })).toBe(true);
      expect(isValidElementFilter({ tags: [] })).toBe(true);
    });

    it('should return false for invalid tags (non-array)', () => {
      expect(isValidElementFilter({ tags: 'urgent' })).toBe(false);
    });

    it('should return false for invalid tags (non-string elements)', () => {
      expect(isValidElementFilter({ tags: [1, 2, 3] })).toBe(false);
      expect(isValidElementFilter({ tags: ['valid', 123] })).toBe(false);
    });

    it('should return true for valid tagsAny filter', () => {
      expect(isValidElementFilter({ tagsAny: ['urgent', 'important'] })).toBe(true);
    });

    it('should return false for invalid tagsAny', () => {
      expect(isValidElementFilter({ tagsAny: 'urgent' })).toBe(false);
      expect(isValidElementFilter({ tagsAny: [null] })).toBe(false);
    });

    it('should return true for boolean includeDeleted', () => {
      expect(isValidElementFilter({ includeDeleted: true })).toBe(true);
      expect(isValidElementFilter({ includeDeleted: false })).toBe(true);
    });

    it('should return false for non-boolean includeDeleted', () => {
      expect(isValidElementFilter({ includeDeleted: 'true' })).toBe(false);
      expect(isValidElementFilter({ includeDeleted: 1 })).toBe(false);
    });

    it('should return true for valid timestamp filters', () => {
      expect(isValidElementFilter({
        createdAfter: mockTimestamp,
        createdBefore: mockTimestamp,
        updatedAfter: mockTimestamp,
        updatedBefore: mockTimestamp,
      })).toBe(true);
    });

    it('should return true for valid createdBy filter', () => {
      expect(isValidElementFilter({ createdBy: mockEntityId })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidElementFilter(null)).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(isValidElementFilter('filter')).toBe(false);
      expect(isValidElementFilter(123)).toBe(false);
      expect(isValidElementFilter(true)).toBe(false);
    });

    it('should return true for complex valid filter', () => {
      const filter: ElementFilter = {
        type: [ElementType.TASK, ElementType.DOCUMENT],
        tags: ['project-alpha'],
        tagsAny: ['urgent', 'high-priority'],
        createdBy: mockEntityId,
        createdAfter: mockTimestamp,
        limit: 20,
        offset: 0,
        orderBy: 'createdAt',
        orderDir: 'desc',
        includeDeleted: false,
      };
      expect(isValidElementFilter(filter)).toBe(true);
    });
  });
});

// ============================================================================
// TaskFilter Validation Tests
// ============================================================================

describe('TaskFilter', () => {
  describe('isValidTaskFilter', () => {
    it('should return true for empty object', () => {
      expect(isValidTaskFilter({})).toBe(true);
    });

    it('should return true for valid task-specific filters', () => {
      expect(isValidTaskFilter({ status: TaskStatus.OPEN })).toBe(true);
      expect(isValidTaskFilter({ status: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] })).toBe(true);
      expect(isValidTaskFilter({ priority: Priority.HIGH })).toBe(true);
      expect(isValidTaskFilter({ complexity: Complexity.SIMPLE })).toBe(true);
      expect(isValidTaskFilter({ taskType: TaskTypeValue.BUG })).toBe(true);
    });

    it('should return true for assignee and owner filters', () => {
      expect(isValidTaskFilter({ assignee: mockEntityId })).toBe(true);
      expect(isValidTaskFilter({ owner: mockEntityId })).toBe(true);
    });

    it('should return true for boolean hasDeadline', () => {
      expect(isValidTaskFilter({ hasDeadline: true })).toBe(true);
      expect(isValidTaskFilter({ hasDeadline: false })).toBe(true);
    });

    it('should return false for non-boolean hasDeadline', () => {
      expect(isValidTaskFilter({ hasDeadline: 'yes' })).toBe(false);
      expect(isValidTaskFilter({ hasDeadline: 1 })).toBe(false);
    });

    it('should return true for boolean includeEphemeral', () => {
      expect(isValidTaskFilter({ includeEphemeral: true })).toBe(true);
      expect(isValidTaskFilter({ includeEphemeral: false })).toBe(true);
    });

    it('should return false for non-boolean includeEphemeral', () => {
      expect(isValidTaskFilter({ includeEphemeral: 'no' })).toBe(false);
    });

    it('should return true for deadlineBefore filter', () => {
      expect(isValidTaskFilter({ deadlineBefore: mockTimestamp })).toBe(true);
    });

    it('should inherit ElementFilter validation', () => {
      // Valid ElementFilter properties should work
      expect(isValidTaskFilter({ limit: 10, offset: 0 })).toBe(true);

      // Invalid ElementFilter properties should fail
      expect(isValidTaskFilter({ limit: -1 })).toBe(false);
      expect(isValidTaskFilter({ tags: 'invalid' })).toBe(false);
    });

    it('should return true for complex valid task filter', () => {
      const filter: TaskFilter = {
        type: ElementType.TASK,
        status: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
        priority: [Priority.CRITICAL, Priority.HIGH],
        complexity: Complexity.MEDIUM,
        assignee: mockEntityId,
        taskType: TaskTypeValue.FEATURE,
        hasDeadline: true,
        deadlineBefore: mockTimestamp,
        includeEphemeral: false,
        tags: ['sprint-1'],
        limit: 50,
        orderBy: 'priority',
        orderDir: 'asc',
      };
      expect(isValidTaskFilter(filter)).toBe(true);
    });
  });
});

// ============================================================================
// GetOptions Validation Tests
// ============================================================================

describe('GetOptions', () => {
  describe('isValidGetOptions', () => {
    it('should return true for empty object', () => {
      expect(isValidGetOptions({})).toBe(true);
    });

    it('should return true for valid hydration options', () => {
      expect(isValidGetOptions({ hydrate: { description: true } })).toBe(true);
      expect(isValidGetOptions({ hydrate: { content: true, attachments: true } })).toBe(true);
    });

    it('should return true for all hydration options', () => {
      const options: GetOptions = {
        hydrate: {
          description: true,
          content: true,
          attachments: true,
        },
      };
      expect(isValidGetOptions(options)).toBe(true);
    });

    it('should return true for empty hydrate object', () => {
      expect(isValidGetOptions({ hydrate: {} })).toBe(true);
    });

    it('should return false for non-boolean hydration values', () => {
      expect(isValidGetOptions({ hydrate: { description: 'yes' } })).toBe(false);
      expect(isValidGetOptions({ hydrate: { attachments: 1 } })).toBe(false);
      expect(isValidGetOptions({ hydrate: { content: null } })).toBe(false);
    });

    it('should return false for null hydrate', () => {
      expect(isValidGetOptions({ hydrate: null })).toBe(false);
    });

    it('should return false for non-object hydrate', () => {
      expect(isValidGetOptions({ hydrate: 'all' })).toBe(false);
      expect(isValidGetOptions({ hydrate: true })).toBe(false);
    });

    it('should return false for null value', () => {
      expect(isValidGetOptions(null)).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(isValidGetOptions('options')).toBe(false);
      expect(isValidGetOptions(123)).toBe(false);
    });
  });
});

// ============================================================================
// ExportOptions Validation Tests
// ============================================================================

describe('ExportOptions', () => {
  describe('isValidExportOptions', () => {
    it('should return true for empty object', () => {
      expect(isValidExportOptions({})).toBe(true);
    });

    it('should return true for valid format', () => {
      expect(isValidExportOptions({ format: 'jsonl' })).toBe(true);
    });

    it('should return false for invalid format', () => {
      expect(isValidExportOptions({ format: 'csv' })).toBe(false);
      expect(isValidExportOptions({ format: 'json' })).toBe(false);
    });

    it('should return true for valid types array', () => {
      expect(isValidExportOptions({ types: [ElementType.TASK, ElementType.DOCUMENT] })).toBe(true);
    });

    it('should return true for modifiedAfter timestamp', () => {
      expect(isValidExportOptions({ modifiedAfter: mockTimestamp })).toBe(true);
    });

    it('should return true for boolean includeDeleted', () => {
      expect(isValidExportOptions({ includeDeleted: true })).toBe(true);
      expect(isValidExportOptions({ includeDeleted: false })).toBe(true);
    });

    it('should return false for non-boolean includeDeleted', () => {
      expect(isValidExportOptions({ includeDeleted: 'true' })).toBe(false);
    });

    it('should return true for boolean includeDependencies', () => {
      expect(isValidExportOptions({ includeDependencies: true })).toBe(true);
    });

    it('should return false for non-boolean includeDependencies', () => {
      expect(isValidExportOptions({ includeDependencies: 'yes' })).toBe(false);
    });

    it('should return true for boolean includeEvents', () => {
      expect(isValidExportOptions({ includeEvents: true })).toBe(true);
    });

    it('should return false for non-boolean includeEvents', () => {
      expect(isValidExportOptions({ includeEvents: 1 })).toBe(false);
    });

    it('should return true for outputPath', () => {
      expect(isValidExportOptions({ outputPath: '/tmp/export.jsonl' })).toBe(true);
    });

    it('should return true for complex valid export options', () => {
      const options: ExportOptions = {
        format: 'jsonl',
        types: [ElementType.TASK, ElementType.DOCUMENT],
        modifiedAfter: mockTimestamp,
        includeDeleted: false,
        includeDependencies: true,
        includeEvents: true,
        outputPath: '/tmp/export.jsonl',
      };
      expect(isValidExportOptions(options)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidExportOptions(null)).toBe(false);
    });
  });
});

// ============================================================================
// ImportOptions Validation Tests
// ============================================================================

describe('ImportOptions', () => {
  describe('isValidImportOptions', () => {
    it('should return true for valid inputPath', () => {
      expect(isValidImportOptions({ inputPath: '/tmp/import.jsonl' })).toBe(true);
    });

    it('should return true for valid data', () => {
      expect(isValidImportOptions({ data: '{"id": "el-123"}' })).toBe(true);
    });

    it('should return false when neither inputPath nor data provided', () => {
      expect(isValidImportOptions({})).toBe(false);
    });

    it('should return false for non-string inputPath', () => {
      expect(isValidImportOptions({ inputPath: 123 })).toBe(false);
    });

    it('should return false for non-string data', () => {
      expect(isValidImportOptions({ data: { id: 'el-123' } })).toBe(false);
    });

    it('should return true for valid conflictStrategy', () => {
      expect(isValidImportOptions({ data: '{}', conflictStrategy: 'skip' })).toBe(true);
      expect(isValidImportOptions({ data: '{}', conflictStrategy: 'overwrite' })).toBe(true);
      expect(isValidImportOptions({ data: '{}', conflictStrategy: 'error' })).toBe(true);
    });

    it('should return false for invalid conflictStrategy', () => {
      expect(isValidImportOptions({ data: '{}', conflictStrategy: 'merge' })).toBe(false);
    });

    it('should return true for boolean validateFirst', () => {
      expect(isValidImportOptions({ data: '{}', validateFirst: true })).toBe(true);
      expect(isValidImportOptions({ data: '{}', validateFirst: false })).toBe(true);
    });

    it('should return false for non-boolean validateFirst', () => {
      expect(isValidImportOptions({ data: '{}', validateFirst: 'yes' })).toBe(false);
    });

    it('should return true for boolean dryRun', () => {
      expect(isValidImportOptions({ data: '{}', dryRun: true })).toBe(true);
      expect(isValidImportOptions({ data: '{}', dryRun: false })).toBe(true);
    });

    it('should return false for non-boolean dryRun', () => {
      expect(isValidImportOptions({ data: '{}', dryRun: 1 })).toBe(false);
    });

    it('should return true for complex valid import options', () => {
      const options: ImportOptions = {
        inputPath: '/tmp/import.jsonl',
        conflictStrategy: 'skip',
        validateFirst: true,
        dryRun: false,
      };
      expect(isValidImportOptions(options)).toBe(true);
    });

    it('should return true when both inputPath and data provided', () => {
      // Having both is allowed - implementation can choose which to use
      expect(isValidImportOptions({
        inputPath: '/tmp/import.jsonl',
        data: '{}',
      })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidImportOptions(null)).toBe(false);
    });
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  it('should have sensible DEFAULT_PAGE_SIZE', () => {
    expect(DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    expect(DEFAULT_PAGE_SIZE).toBe(10000);
  });

  it('should have sensible MAX_PAGE_SIZE', () => {
    expect(MAX_PAGE_SIZE).toBeGreaterThanOrEqual(DEFAULT_PAGE_SIZE);
    expect(MAX_PAGE_SIZE).toBe(10000);
  });

  it('should have DEFAULT_CONFLICT_STRATEGY as "error"', () => {
    expect(DEFAULT_CONFLICT_STRATEGY).toBe('error');
  });

  it('should have DEFAULT_EXPORT_FORMAT as "jsonl"', () => {
    expect(DEFAULT_EXPORT_FORMAT).toBe('jsonl');
  });
});

// ============================================================================
// Type Structure Tests (compile-time verification)
// ============================================================================

describe('Type Structures', () => {
  describe('BlockedTask', () => {
    it('should extend Task with blocking info', () => {
      // This is a compile-time check - if it compiles, the type is correct
      const blockedTask: BlockedTask = {
        id: mockElementId,
        type: ElementType.TASK,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        createdBy: mockEntityId,
        tags: [],
        metadata: {},
        title: 'Test Task',
        status: TaskStatus.BLOCKED,
        priority: Priority.MEDIUM,
        complexity: Complexity.MEDIUM,
        taskType: TaskTypeValue.TASK,
        blockedBy: 'el-blocker' as ElementId,
        blockReason: 'Waiting for dependency to complete',
      };

      expect(blockedTask.blockedBy).toBeDefined();
      expect(blockedTask.blockReason).toBeDefined();
      expect(blockedTask.title).toBeDefined(); // Task field
    });
  });

  describe('DependencyTree', () => {
    it('should have correct structure', () => {
      const tree: DependencyTree = {
        root: {
          element: {
            id: mockElementId,
            type: ElementType.TASK,
            createdAt: mockTimestamp,
            updatedAt: mockTimestamp,
            createdBy: mockEntityId,
            tags: [],
            metadata: {},
          },
          dependencies: [],
          dependents: [],
        },
        dependencyDepth: 0,
        dependentDepth: 0,
        nodeCount: 1,
      };

      expect(tree.root).toBeDefined();
      expect(tree.root.element).toBeDefined();
      expect(tree.root.dependencies).toEqual([]);
      expect(tree.root.dependents).toEqual([]);
      expect(tree.dependencyDepth).toBe(0);
      expect(tree.dependentDepth).toBe(0);
      expect(tree.nodeCount).toBe(1);
    });
  });

  describe('DependencyInput', () => {
    it('should have correct structure', () => {
      const input: DependencyInput = {
        blockedId: 'el-blocked' as ElementId,
        blockerId: 'el-blocker' as ElementId,
        type: DependencyType.BLOCKS,
        metadata: { reason: 'Technical dependency' },
      };

      expect(input.blockedId).toBeDefined();
      expect(input.blockerId).toBeDefined();
      expect(input.type).toBe(DependencyType.BLOCKS);
      expect(input.metadata).toBeDefined();
    });

    it('should allow optional metadata', () => {
      const input: DependencyInput = {
        blockedId: 'el-blocked' as ElementId,
        blockerId: 'el-blocker' as ElementId,
        type: DependencyType.RELATES_TO,
      };

      expect(input.metadata).toBeUndefined();
    });
  });

  describe('ImportResult', () => {
    it('should have correct structure', () => {
      const result: ImportResult = {
        success: true,
        elementsImported: 10,
        dependenciesImported: 5,
        eventsImported: 20,
        conflicts: [],
        errors: [],
        dryRun: false,
      };

      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(10);
      expect(result.conflicts).toEqual([]);
    });

    it('should support conflicts', () => {
      const conflict: ImportConflict = {
        elementId: mockElementId,
        conflictType: 'exists',
        details: 'Element already exists in database',
      };

      const result: ImportResult = {
        success: false,
        elementsImported: 0,
        dependenciesImported: 0,
        eventsImported: 0,
        conflicts: [conflict],
        errors: ['Import failed due to conflicts'],
        dryRun: false,
      };

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].conflictType).toBe('exists');
    });
  });

  describe('SystemStats', () => {
    it('should have correct structure', () => {
      const stats: SystemStats = {
        totalElements: 100,
        elementsByType: {
          [ElementType.TASK]: 50,
          [ElementType.DOCUMENT]: 30,
          [ElementType.ENTITY]: 20,
        },
        totalDependencies: 25,
        totalEvents: 500,
        readyTasks: 15,
        blockedTasks: 5,
        databaseSize: 1024 * 1024,
        computedAt: mockTimestamp,
      };

      expect(stats.totalElements).toBe(100);
      expect(stats.elementsByType[ElementType.TASK]).toBe(50);
      expect(stats.readyTasks).toBe(15);
    });
  });

  describe('ListResult', () => {
    it('should have correct structure', () => {
      const result: ListResult<Task> = {
        items: [],
        total: 100,
        offset: 0,
        limit: 50,
        hasMore: true,
      };

      expect(result.items).toEqual([]);
      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('ElementInput', () => {
    it('should have correct structure', () => {
      const input: ElementInput = {
        createdBy: mockEntityId,
        tags: ['test'],
        metadata: { key: 'value' },
      };

      expect(input.createdBy).toBeDefined();
      expect(input.id).toBeUndefined(); // Optional
    });

    it('should allow optional id', () => {
      const input: ElementInput = {
        id: mockElementId,
        createdBy: mockEntityId,
      };

      expect(input.id).toBe(mockElementId);
    });
  });

  describe('PaginationOptions', () => {
    it('should have correct structure', () => {
      const options: PaginationOptions = {
        limit: 50,
        offset: 100,
      };

      expect(options.limit).toBe(50);
      expect(options.offset).toBe(100);
    });

    it('should allow all fields to be optional', () => {
      const options: PaginationOptions = {};

      expect(options.limit).toBeUndefined();
      expect(options.offset).toBeUndefined();
    });
  });

  describe('SortOptions', () => {
    it('should have correct structure', () => {
      const options: SortOptions = {
        orderBy: 'createdAt',
        orderDir: 'desc',
      };

      expect(options.orderBy).toBe('createdAt');
      expect(options.orderDir).toBe('desc');
    });
  });

  describe('HydrationOptions', () => {
    it('should have correct structure', () => {
      const options: HydrationOptions = {
        description: true,
        content: true,
        attachments: false,
      };

      expect(options.description).toBe(true);
      expect(options.content).toBe(true);
    });
  });
});

// ============================================================================
// QuarryAPI Interface Tests
// ============================================================================

describe('QuarryAPI Interface', () => {
  it('should define all required CRUD methods', () => {
    // Create a mock that satisfies the QuarryAPI interface
    // We use type assertions for the generic methods since this is just testing interface structure
    const mockApi = {
      get: async (_id: ElementId, _options?: GetOptions) => null as Element | null,
      list: async (_filter?: ElementFilter) => [] as Element[],
      listPaginated: async (_filter?: ElementFilter): Promise<ListResult<Element>> => ({
        items: [],
        total: 0,
        offset: 0,
        limit: 50,
        hasMore: false,
      }),
      create: async (_input: ElementInput & Record<string, unknown>): Promise<Element> => ({
        id: mockElementId,
        type: ElementType.TASK,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        createdBy: mockEntityId,
        tags: [],
        metadata: {},
      }),
      update: async (_id: ElementId, _updates: Partial<Element>): Promise<Element> => ({
        id: mockElementId,
        type: ElementType.TASK,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        createdBy: mockEntityId,
        tags: [],
        metadata: {},
      }),
      delete: async (_id: ElementId, _reason?: string) => {},

      // Task operations
      ready: async (_filter?: TaskFilter) => [] as Task[],
      blocked: async (_filter?: TaskFilter) => [] as BlockedTask[],

      // Dependency operations
      addDependency: async (_dep: DependencyInput) => ({
        blockedId: mockElementId,
        blockerId: 'el-blocker' as ElementId,
        type: DependencyType.BLOCKS,
        createdAt: mockTimestamp,
        createdBy: mockEntityId,
        metadata: {},
      }),
      removeDependency: async (_blockedId: ElementId, _blockerId: ElementId, _type: DependencyType) => {},
      getDependencies: async (_id: ElementId, _types?: DependencyType[]) => [],
      getDependents: async (_id: ElementId, _types?: DependencyType[]) => [],
      getDependencyTree: async (_id: ElementId): Promise<DependencyTree> => ({
        root: {
          element: {
            id: mockElementId,
            type: ElementType.TASK,
            createdAt: mockTimestamp,
            updatedAt: mockTimestamp,
            createdBy: mockEntityId,
            tags: [],
            metadata: {},
          },
          dependencies: [],
          dependents: [],
        },
        dependencyDepth: 0,
        dependentDepth: 0,
        nodeCount: 1,
      }),

      // Search
      search: async (_query: string, _filter?: ElementFilter) => [] as Element[],

      // History
      getEvents: async (_id: ElementId, _filter?: unknown) => [],
      getDocumentVersion: async (_id: unknown, _version: number) => null,
      getDocumentHistory: async (_id: unknown) => [],

      // Sync
      export: async (_options?: ExportOptions) => '',
      import: async (_options: ImportOptions): Promise<ImportResult> => ({
        success: true,
        elementsImported: 0,
        dependenciesImported: 0,
        eventsImported: 0,
        conflicts: [],
        errors: [],
        dryRun: false,
      }),

      // Stats
      stats: async (): Promise<SystemStats> => ({
        totalElements: 0,
        elementsByType: {},
        totalDependencies: 0,
        totalEvents: 0,
        readyTasks: 0,
        blockedTasks: 0,
        databaseSize: 0,
        computedAt: mockTimestamp,
      }),
    };

    // Verify all methods exist and are functions
    expect(typeof mockApi.get).toBe('function');
    expect(typeof mockApi.list).toBe('function');
    expect(typeof mockApi.listPaginated).toBe('function');
    expect(typeof mockApi.create).toBe('function');
    expect(typeof mockApi.update).toBe('function');
    expect(typeof mockApi.delete).toBe('function');
    expect(typeof mockApi.ready).toBe('function');
    expect(typeof mockApi.blocked).toBe('function');
    expect(typeof mockApi.addDependency).toBe('function');
    expect(typeof mockApi.removeDependency).toBe('function');
    expect(typeof mockApi.getDependencies).toBe('function');
    expect(typeof mockApi.getDependents).toBe('function');
    expect(typeof mockApi.getDependencyTree).toBe('function');
    expect(typeof mockApi.search).toBe('function');
    expect(typeof mockApi.getEvents).toBe('function');
    expect(typeof mockApi.getDocumentVersion).toBe('function');
    expect(typeof mockApi.getDocumentHistory).toBe('function');
    expect(typeof mockApi.export).toBe('function');
    expect(typeof mockApi.import).toBe('function');
    expect(typeof mockApi.stats).toBe('function');

    // Verify method count matches expected API
    const methodCount = Object.keys(mockApi).length;
    expect(methodCount).toBe(20); // 6 CRUD + 2 Task + 5 Dependency + 1 Search + 3 History + 2 Sync + 1 Stats
  });
});

// ============================================================================
// Edge Cases and Boundary Tests
// ============================================================================

describe('Edge Cases', () => {
  describe('ElementFilter edge cases', () => {
    it('should handle limit of 0', () => {
      expect(isValidElementFilter({ limit: 0 })).toBe(true);
    });

    it('should handle very large limit', () => {
      expect(isValidElementFilter({ limit: 1000000 })).toBe(true);
    });

    it('should handle very large offset', () => {
      expect(isValidElementFilter({ offset: 1000000 })).toBe(true);
    });

    it('should handle empty tags array', () => {
      expect(isValidElementFilter({ tags: [] })).toBe(true);
    });

    it('should handle single-element tags array', () => {
      expect(isValidElementFilter({ tags: ['single'] })).toBe(true);
    });

    it('should allow unknown properties (extensibility)', () => {
      expect(isValidElementFilter({ customField: 'value' })).toBe(true);
    });
  });

  describe('Import/Export edge cases', () => {
    it('should handle empty data string', () => {
      expect(isValidImportOptions({ data: '' })).toBe(true);
    });

    it('should handle very long data string', () => {
      const longData = '{"id":"el-123"}'.repeat(10000);
      expect(isValidImportOptions({ data: longData })).toBe(true);
    });

    it('should handle path with special characters', () => {
      expect(isValidImportOptions({ inputPath: '/tmp/file with spaces.jsonl' })).toBe(true);
      expect(isValidExportOptions({ outputPath: '/tmp/特殊字符.jsonl' })).toBe(true);
    });
  });
});

// ============================================================================
// TypeScript Compile-Time Tests
// ============================================================================

// These tests verify type relationships at compile time
// If the file compiles, these are correct

describe('Type Relationships (compile-time)', () => {
  it('TaskFilter should extend ElementFilter', () => {
    const taskFilter: TaskFilter = {
      // ElementFilter properties
      type: ElementType.TASK,
      tags: ['tag1'],
      limit: 10,
      // TaskFilter-specific properties
      status: TaskStatus.OPEN,
      priority: Priority.HIGH,
    };

    // TaskFilter should be assignable to ElementFilter
    const elementFilter: ElementFilter = taskFilter;
    expect(elementFilter).toBeDefined();
  });

  it('BlockedTask should extend Task', () => {
    const task: Task = {
      id: mockElementId,
      type: ElementType.TASK,
      createdAt: mockTimestamp,
      updatedAt: mockTimestamp,
      createdBy: mockEntityId,
      tags: [],
      metadata: {},
      title: 'Test',
      status: TaskStatus.OPEN,
      priority: Priority.MEDIUM,
      complexity: Complexity.MEDIUM,
      taskType: TaskTypeValue.TASK,
    };

    // BlockedTask should include all Task fields
    const blockedTask: BlockedTask = {
      ...task,
      status: TaskStatus.BLOCKED,
      blockedBy: 'el-blocker' as ElementId,
      blockReason: 'Reason',
    };

    expect(blockedTask.title).toBe(task.title);
  });
});
