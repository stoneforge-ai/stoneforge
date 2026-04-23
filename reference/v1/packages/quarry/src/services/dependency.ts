/**
 * Dependency Service - Core operations for managing dependencies
 *
 * Provides CRUD operations for dependencies:
 * - addDependency: Create a new dependency between elements
 * - removeDependency: Remove an existing dependency
 * - getDependencies: Get all dependencies from a source element
 * - getDependents: Get all elements that depend on a target
 *
 * All operations emit events for audit trail.
 */

import type { StorageBackend, Row } from '@stoneforge/storage';
import type {
  Dependency,
  DependencyType,
  CreateDependencyInput,
  ElementId,
  EntityId,
  EventWithoutId,
} from '@stoneforge/core';
import {
  createDependency,
  validateDependencyType,
  validateElementId,
  validateEntityId,
  DependencyType as DT,
  normalizeRelatesToDependency,
  participatesInCycleDetection,
  EventType,
  createEvent,
  NotFoundError,
  ConflictError,
  ErrorCode,
} from '@stoneforge/core';

// ============================================================================
// Database Row Types
// ============================================================================

/**
 * Row type for dependency table queries
 */
interface DependencyRow extends Row {
  blocked_id: string;
  blocker_id: string;
  type: string;
  created_at: string;
  created_by: string;
  metadata: string | null;
}

// ============================================================================
// Cycle Detection Types and Constants
// ============================================================================

/**
 * Configuration for cycle detection
 */
export interface CycleDetectionConfig {
  /** Maximum depth to traverse (default: 100) */
  maxDepth: number;
}

/**
 * Default cycle detection configuration
 */
export const DEFAULT_CYCLE_DETECTION_CONFIG: CycleDetectionConfig = {
  maxDepth: 100,
};

/**
 * Result of cycle detection check
 */
export interface CycleDetectionResult {
  /** Whether a cycle would be created */
  hasCycle: boolean;
  /** Path that forms the cycle (if detected) */
  cyclePath?: ElementId[];
  /** Number of nodes visited during detection */
  nodesVisited: number;
  /** Whether depth limit was reached */
  depthLimitReached: boolean;
}

// ============================================================================
// DependencyService Class
// ============================================================================

/**
 * Service for managing dependencies between elements
 */
export class DependencyService {
  constructor(private readonly db: StorageBackend) {}

  // --------------------------------------------------------------------------
  // Schema Initialization
  // --------------------------------------------------------------------------

  /**
   * Initialize the dependencies table schema
   * Should be called during database setup
   */
  initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dependencies (
        blocked_id TEXT NOT NULL,
        blocker_id TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        metadata TEXT,
        PRIMARY KEY (blocked_id, blocker_id, type)
      )
    `);

    // Create indexes for efficient lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dependencies_blocker ON dependencies(blocker_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dependencies_type ON dependencies(type)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dependencies_blocked_type ON dependencies(blocked_id, type)
    `);
  }

  // --------------------------------------------------------------------------
  // Add Dependency
  // --------------------------------------------------------------------------

  /**
   * Add a new dependency between elements
   *
   * @param input - Dependency creation input
   * @param cycleConfig - Optional configuration for cycle detection
   * @returns The created dependency
   * @throws ValidationError if input is invalid
   * @throws ConflictError if dependency already exists or would create a cycle
   */
  addDependency(
    input: CreateDependencyInput,
    cycleConfig?: CycleDetectionConfig
  ): Dependency {
    // Create and validate the dependency
    const dependency = createDependency(input);

    // For relates-to, normalize the direction (smaller ID is always blockedId)
    let blockedId = dependency.blockedId;
    let blockerId = dependency.blockerId;
    if (dependency.type === DT.RELATES_TO) {
      const normalized = normalizeRelatesToDependency(blockedId, blockerId);
      blockedId = normalized.blockedId;
      blockerId = normalized.blockerId;
    }

    // Check for cycles before inserting (for blocking dependency types)
    this.checkForCycle(blockedId, blockerId, dependency.type, cycleConfig);

    // Serialize metadata
    const metadataJson =
      Object.keys(dependency.metadata).length > 0
        ? JSON.stringify(dependency.metadata)
        : null;

    // Insert into database
    try {
      this.db.run(
        `INSERT INTO dependencies (blocked_id, blocker_id, type, created_at, created_by, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          blockedId,
          blockerId,
          dependency.type,
          dependency.createdAt,
          dependency.createdBy,
          metadataJson,
        ]
      );
    } catch (error) {
      // Check for duplicate key error
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new ConflictError(
          `Dependency already exists: ${blockedId} -> ${blockerId} (${dependency.type})`,
          ErrorCode.DUPLICATE_DEPENDENCY,
          { blockedId, blockerId, type: dependency.type }
        );
      }
      throw error;
    }

    // Return the dependency (with potentially normalized IDs for relates-to)
    if (dependency.type === DT.RELATES_TO && blockedId !== dependency.blockedId) {
      return {
        ...dependency,
        blockedId: blockedId as ElementId,
        blockerId: blockerId as ElementId,
      };
    }

    return dependency;
  }

  // --------------------------------------------------------------------------
  // Remove Dependency
  // --------------------------------------------------------------------------

  /**
   * Remove an existing dependency
   *
   * @param blockedId - Blocked element ID
   * @param blockerId - Blocker element ID
   * @param type - Dependency type
   * @param actor - Entity performing the removal (for events)
   * @returns true if dependency was removed
   * @throws NotFoundError if dependency doesn't exist
   */
  removeDependency(
    blockedId: ElementId,
    blockerId: ElementId,
    type: DependencyType,
    actor: EntityId
  ): boolean {
    // Validate inputs
    validateElementId(blockedId, 'blockedId');
    validateElementId(blockerId, 'blockerId');
    validateDependencyType(type);
    validateEntityId(actor, 'actor');

    // For relates-to, normalize the direction
    let normalizedBlocked = blockedId;
    let normalizedBlocker = blockerId;
    if (type === DT.RELATES_TO) {
      const normalized = normalizeRelatesToDependency(blockedId, blockerId);
      normalizedBlocked = normalized.blockedId as ElementId;
      normalizedBlocker = normalized.blockerId as ElementId;
    }

    // Delete from database
    const result = this.db.run(
      `DELETE FROM dependencies WHERE blocked_id = ? AND blocker_id = ? AND type = ?`,
      [normalizedBlocked, normalizedBlocker, type]
    );

    if (result.changes === 0) {
      throw new NotFoundError(
        `Dependency not found: ${normalizedBlocked} -> ${normalizedBlocker} (${type})`,
        ErrorCode.DEPENDENCY_NOT_FOUND,
        { blockedId: normalizedBlocked, blockerId: normalizedBlocker, type }
      );
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Get Dependencies
  // --------------------------------------------------------------------------

  /**
   * Get all dependencies where the given element is blocked
   *
   * @param blockedId - Blocked element ID
   * @param type - Optional filter by dependency type
   * @returns Array of dependencies
   */
  getDependencies(blockedId: ElementId, type?: DependencyType): Dependency[] {
    validateElementId(blockedId, 'blockedId');
    if (type !== undefined) {
      validateDependencyType(type);
    }

    let sql = `SELECT blocked_id, blocker_id, type, created_at, created_by, metadata
               FROM dependencies WHERE blocked_id = ?`;
    const params: unknown[] = [blockedId];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY created_at`;

    const rows = this.db.query<DependencyRow>(sql, params);
    return rows.map((row) => this.rowToDependency(row));
  }

  /**
   * Get all bidirectional relates-to dependencies for an element
   * (since relates-to is stored with normalized IDs, we need to check both directions)
   *
   * @param elementId - Element ID
   * @returns Array of relates-to dependencies
   */
  getRelatedTo(elementId: ElementId): Dependency[] {
    validateElementId(elementId, 'elementId');

    const sql = `SELECT blocked_id, blocker_id, type, created_at, created_by, metadata
                 FROM dependencies
                 WHERE type = ? AND (blocked_id = ? OR blocker_id = ?)
                 ORDER BY created_at`;

    const rows = this.db.query<DependencyRow>(sql, [DT.RELATES_TO, elementId, elementId]);
    return rows.map((row) => this.rowToDependency(row));
  }

  // --------------------------------------------------------------------------
  // Get Dependents
  // --------------------------------------------------------------------------

  /**
   * Get all elements that are blocked by a given blocker (reverse lookup)
   *
   * @param blockerId - Blocker element ID
   * @param type - Optional filter by dependency type
   * @returns Array of dependencies where blockerId is the blocker
   */
  getDependents(blockerId: ElementId, type?: DependencyType): Dependency[] {
    validateElementId(blockerId, 'blockerId');
    if (type !== undefined) {
      validateDependencyType(type);
    }

    let sql = `SELECT blocked_id, blocker_id, type, created_at, created_by, metadata
               FROM dependencies WHERE blocker_id = ?`;
    const params: unknown[] = [blockerId];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY created_at`;

    const rows = this.db.query<DependencyRow>(sql, params);
    return rows.map((row) => this.rowToDependency(row));
  }

  // --------------------------------------------------------------------------
  // Existence Check
  // --------------------------------------------------------------------------

  /**
   * Check if a specific dependency exists
   *
   * @param blockedId - Blocked element ID
   * @param blockerId - Blocker element ID
   * @param type - Dependency type
   * @returns true if dependency exists
   */
  exists(blockedId: ElementId, blockerId: ElementId, type: DependencyType): boolean {
    validateElementId(blockedId, 'blockedId');
    validateElementId(blockerId, 'blockerId');
    validateDependencyType(type);

    // For relates-to, normalize the direction
    let normalizedBlocked = blockedId;
    let normalizedBlocker = blockerId;
    if (type === DT.RELATES_TO) {
      const normalized = normalizeRelatesToDependency(blockedId, blockerId);
      normalizedBlocked = normalized.blockedId as ElementId;
      normalizedBlocker = normalized.blockerId as ElementId;
    }

    const result = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM dependencies
       WHERE blocked_id = ? AND blocker_id = ? AND type = ?`,
      [normalizedBlocked, normalizedBlocker, type]
    );

    return (result?.count ?? 0) > 0;
  }

  // --------------------------------------------------------------------------
  // Get Single Dependency
  // --------------------------------------------------------------------------

  /**
   * Get a specific dependency by its composite key
   *
   * @param blockedId - Blocked element ID
   * @param blockerId - Blocker element ID
   * @param type - Dependency type
   * @returns The dependency or undefined if not found
   */
  getDependency(
    blockedId: ElementId,
    blockerId: ElementId,
    type: DependencyType
  ): Dependency | undefined {
    validateElementId(blockedId, 'blockedId');
    validateElementId(blockerId, 'blockerId');
    validateDependencyType(type);

    // For relates-to, normalize the direction
    let normalizedBlocked = blockedId;
    let normalizedBlocker = blockerId;
    if (type === DT.RELATES_TO) {
      const normalized = normalizeRelatesToDependency(blockedId, blockerId);
      normalizedBlocked = normalized.blockedId as ElementId;
      normalizedBlocker = normalized.blockerId as ElementId;
    }

    const row = this.db.queryOne<DependencyRow>(
      `SELECT blocked_id, blocker_id, type, created_at, created_by, metadata
       FROM dependencies
       WHERE blocked_id = ? AND blocker_id = ? AND type = ?`,
      [normalizedBlocked, normalizedBlocker, type]
    );

    return row ? this.rowToDependency(row) : undefined;
  }

  // --------------------------------------------------------------------------
  // Bulk Operations
  // --------------------------------------------------------------------------

  /**
   * Get all dependencies for multiple source elements
   *
   * @param blockedIds - Array of blocked element IDs
   * @param type - Optional filter by dependency type
   * @returns Array of dependencies
   */
  getDependenciesForMany(blockedIds: ElementId[], type?: DependencyType): Dependency[] {
    if (blockedIds.length === 0) {
      return [];
    }

    blockedIds.forEach((id, i) => validateElementId(id, `blockedIds[${i}]`));
    if (type !== undefined) {
      validateDependencyType(type);
    }

    const placeholders = blockedIds.map(() => '?').join(',');
    let sql = `SELECT blocked_id, blocker_id, type, created_at, created_by, metadata
               FROM dependencies WHERE blocked_id IN (${placeholders})`;
    const params: unknown[] = [...blockedIds];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY blocked_id, created_at`;

    const rows = this.db.query<DependencyRow>(sql, params);
    return rows.map((row) => this.rowToDependency(row));
  }

  /**
   * Remove all dependencies from a source element
   *
   * @param blockedId - Blocked element ID
   * @param type - Optional filter by dependency type
   * @returns Number of dependencies removed
   */
  removeAllDependencies(blockedId: ElementId, type?: DependencyType): number {
    validateElementId(blockedId, 'blockedId');
    if (type !== undefined) {
      validateDependencyType(type);
    }

    let sql = `DELETE FROM dependencies WHERE blocked_id = ?`;
    const params: unknown[] = [blockedId];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    const result = this.db.run(sql, params);
    return result.changes;
  }

  /**
   * Remove all dependencies to a target element (cascade on element delete)
   *
   * @param blockerId - Blocker element ID
   * @returns Number of dependencies removed
   */
  removeAllDependents(blockerId: ElementId): number {
    validateElementId(blockerId, 'blockerId');

    const result = this.db.run(
      `DELETE FROM dependencies WHERE blocker_id = ?`,
      [blockerId]
    );
    return result.changes;
  }

  // --------------------------------------------------------------------------
  // Count Operations
  // --------------------------------------------------------------------------

  /**
   * Count dependencies from a source element
   */
  countDependencies(blockedId: ElementId, type?: DependencyType): number {
    validateElementId(blockedId, 'blockedId');
    if (type !== undefined) {
      validateDependencyType(type);
    }

    let sql = `SELECT COUNT(*) as count FROM dependencies WHERE blocked_id = ?`;
    const params: unknown[] = [blockedId];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    const result = this.db.queryOne<{ count: number }>(sql, params);
    return result?.count ?? 0;
  }

  /**
   * Count dependents of a target element
   */
  countDependents(blockerId: ElementId, type?: DependencyType): number {
    validateElementId(blockerId, 'blockerId');
    if (type !== undefined) {
      validateDependencyType(type);
    }

    let sql = `SELECT COUNT(*) as count FROM dependencies WHERE blocker_id = ?`;
    const params: unknown[] = [blockerId];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    const result = this.db.queryOne<{ count: number }>(sql, params);
    return result?.count ?? 0;
  }

  // --------------------------------------------------------------------------
  // Cycle Detection
  // --------------------------------------------------------------------------

  /**
   * Check if adding a dependency would create a cycle
   *
   * Uses BFS traversal from target to check if source is reachable
   * through existing blocking dependencies. Only blocking dependency
   * types participate in cycle detection (blocks, parent-child, awaits).
   *
   * The relates-to type is excluded because it's bidirectional by design.
   *
   * @param blockedId - The blocked element of the proposed dependency
   * @param blockerId - The blocker element of the proposed dependency
   * @param type - The type of dependency being added
   * @param config - Optional configuration for cycle detection
   * @returns CycleDetectionResult with cycle status and details
   */
  detectCycle(
    blockedId: ElementId,
    blockerId: ElementId,
    type: DependencyType,
    config: CycleDetectionConfig = DEFAULT_CYCLE_DETECTION_CONFIG
  ): CycleDetectionResult {
    validateElementId(blockedId, 'blockedId');
    validateElementId(blockerId, 'blockerId');
    validateDependencyType(type);

    // Non-blocking types don't participate in cycle detection
    if (!participatesInCycleDetection(type)) {
      return {
        hasCycle: false,
        nodesVisited: 0,
        depthLimitReached: false,
      };
    }

    // BFS from blocker to see if we can reach blockedId
    const visited = new Set<string>();
    const queue: { elementId: ElementId; depth: number; path: ElementId[] }[] = [
      { elementId: blockerId, depth: 0, path: [blockerId] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Check depth limit
      if (current.depth >= config.maxDepth) {
        return {
          hasCycle: false,
          nodesVisited: visited.size,
          depthLimitReached: true,
        };
      }

      // Skip already visited nodes
      if (visited.has(current.elementId)) {
        continue;
      }
      visited.add(current.elementId);

      // Found the blocked element - cycle detected!
      if (current.elementId === blockedId) {
        return {
          hasCycle: true,
          cyclePath: [...current.path, blockedId],
          nodesVisited: visited.size,
          depthLimitReached: false,
        };
      }

      // Get all blocking dependencies from this element
      const blockingDeps = this.getBlockingDependenciesFrom(current.elementId);
      for (const dep of blockingDeps) {
        if (!visited.has(dep.blockerId)) {
          queue.push({
            elementId: dep.blockerId,
            depth: current.depth + 1,
            path: [...current.path, dep.blockerId],
          });
        }
      }
    }

    return {
      hasCycle: false,
      nodesVisited: visited.size,
      depthLimitReached: false,
    };
  }

  /**
   * Check if adding a dependency would create a cycle and throw if so
   *
   * @param blockedId - The blocked element of the proposed dependency
   * @param blockerId - The blocker element of the proposed dependency
   * @param type - The type of dependency being added
   * @param config - Optional configuration for cycle detection
   * @throws ConflictError if a cycle would be created
   */
  checkForCycle(
    blockedId: ElementId,
    blockerId: ElementId,
    type: DependencyType,
    config?: CycleDetectionConfig
  ): void {
    const result = this.detectCycle(blockedId, blockerId, type, config);

    if (result.hasCycle) {
      const cyclePath = result.cyclePath?.join(' -> ') ?? `${blockerId} -> ... -> ${blockedId}`;
      throw new ConflictError(
        `Adding dependency would create a cycle: ${cyclePath}`,
        ErrorCode.CYCLE_DETECTED,
        {
          blockedId,
          blockerId,
          dependencyType: type,
          cyclePath: result.cyclePath,
        }
      );
    }
  }

  /**
   * Get all blocking dependencies from an element
   * (internal helper for cycle detection)
   */
  private getBlockingDependenciesFrom(elementId: ElementId): Dependency[] {
    const sql = `SELECT blocked_id, blocker_id, type, created_at, created_by, metadata
                 FROM dependencies
                 WHERE blocked_id = ? AND type IN (?, ?, ?)
                 ORDER BY created_at`;

    const rows = this.db.query<DependencyRow>(sql, [
      elementId,
      DT.BLOCKS,
      DT.PARENT_CHILD,
      DT.AWAITS,
    ]);
    return rows.map((row) => this.rowToDependency(row));
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Convert a database row to a Dependency object
   */
  private rowToDependency(row: DependencyRow): Dependency {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {};

    return {
      blockedId: row.blocked_id as ElementId,
      blockerId: row.blocker_id as ElementId,
      type: row.type as DependencyType,
      createdAt: row.created_at,
      createdBy: row.created_by as EntityId,
      metadata,
    };
  }
}

// ============================================================================
// Event Creation Helpers
// ============================================================================

/**
 * Create a dependency_added event
 *
 * Use this to create an audit event when a dependency is added.
 * The event should be persisted by an EventService.
 *
 * @param dependency - The dependency that was added
 * @returns An EventWithoutId ready to be persisted
 */
export function createDependencyAddedEvent(dependency: Dependency): EventWithoutId {
  return createEvent({
    elementId: dependency.blockedId,
    eventType: EventType.DEPENDENCY_ADDED,
    actor: dependency.createdBy,
    oldValue: null,
    newValue: {
      blockedId: dependency.blockedId,
      blockerId: dependency.blockerId,
      type: dependency.type,
      metadata: dependency.metadata,
    },
  });
}

/**
 * Create a dependency_removed event
 *
 * Use this to create an audit event when a dependency is removed.
 * The event should be persisted by an EventService.
 *
 * @param dependency - The dependency that was removed
 * @param actor - The entity that removed the dependency
 * @returns An EventWithoutId ready to be persisted
 */
export function createDependencyRemovedEvent(
  dependency: Dependency,
  actor: EntityId
): EventWithoutId {
  return createEvent({
    elementId: dependency.blockedId,
    eventType: EventType.DEPENDENCY_REMOVED,
    actor,
    oldValue: {
      blockedId: dependency.blockedId,
      blockerId: dependency.blockerId,
      type: dependency.type,
      metadata: dependency.metadata,
    },
    newValue: null,
  });
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new DependencyService instance
 */
export function createDependencyService(db: StorageBackend): DependencyService {
  return new DependencyService(db);
}

// Re-export EventWithoutId for convenience
export type { EventWithoutId } from '@stoneforge/core';
