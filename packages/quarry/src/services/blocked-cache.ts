/**
 * Blocked Cache Service
 *
 * Maintains a materialized view of blocked elements for efficient ready-work queries.
 * The blocked_cache table provides ~25x speedup for large datasets by avoiding
 * recursive dependency checks on every query.
 *
 * Blocking Rules:
 * - `blocks` dependency: Blocked element waits for blocker to close
 * - `parent-child` dependency: Blocked element (child) inherits blocked state from blocker (parent) (transitive)
 * - `awaits` dependency: Blocked element waits until gate is satisfied (timer, approval, etc.)
 *
 * Cache Invalidation Triggers:
 * - Blocking dependency added/removed
 * - Element status changes (especially closing)
 * - Gate satisfaction changes
 * - Parent blocking state changes
 */

import type { StorageBackend, Row } from '@stoneforge/storage';
import type { ElementId, EntityId, DependencyType, AwaitsMetadata } from '@stoneforge/core';
import { DependencyType as DT, GateType, isValidAwaitsMetadata } from '@stoneforge/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Status values that indicate an element is "done" and doesn't block others
 */
const COMPLETED_STATUSES = ['closed', 'completed', 'tombstone'] as const;

/**
 * Row type for blocked_cache table
 */
interface BlockedCacheRow extends Row {
  element_id: string;
  blocked_by: string;
  reason: string | null;
  previous_status: string | null;
}

/**
 * Row type for element queries
 */
interface ElementRow extends Row {
  id: string;
  type: string;
  data: string;
  deleted_at: string | null;
}

/**
 * Row type for dependency queries
 */
interface DependencyRow extends Row {
  blocked_id: string;
  blocker_id: string;
  type: string;
  created_at: string;
  created_by: string;
  metadata: string | null;
}

/**
 * Blocking information for an element
 */
export interface BlockingInfo {
  /** The element that is blocked */
  elementId: ElementId;
  /** The element causing the block */
  blockedBy: ElementId;
  /** Human-readable reason */
  reason: string;
  /** Status before becoming blocked (for restoration) */
  previousStatus?: string | null;
}

/**
 * Result of a cache rebuild operation
 */
export interface CacheRebuildResult {
  /** Number of elements checked */
  elementsChecked: number;
  /** Number of elements added to blocked cache */
  elementsBlocked: number;
  /** Time taken in milliseconds */
  durationMs: number;
}

/**
 * Options for gate checking
 */
export interface GateCheckOptions {
  /** Current time for timer gate checks (defaults to now) */
  currentTime?: Date;
}

/**
 * Callback for automatic status transitions
 */
export interface StatusTransitionCallback {
  /**
   * Called when an element should transition to blocked status
   * @param elementId - The element to block
   * @param previousStatus - The status to save for later restoration
   */
  onBlock: (elementId: ElementId, previousStatus: string) => void;

  /**
   * Called when an element should transition from blocked status
   * @param elementId - The element to unblock
   * @param statusToRestore - The status to restore to
   */
  onUnblock: (elementId: ElementId, statusToRestore: string) => void;
}

// ============================================================================
// BlockedCacheService Class
// ============================================================================

/**
 * Service for managing the blocked elements cache
 */
export class BlockedCacheService {
  private statusCallback?: StatusTransitionCallback;

  constructor(private readonly db: StorageBackend) {}

  /**
   * Set the callback for automatic status transitions
   * This allows the service to notify when elements should be blocked/unblocked
   */
  setStatusTransitionCallback(callback: StatusTransitionCallback): void {
    this.statusCallback = callback;
  }

  // --------------------------------------------------------------------------
  // Query Operations
  // --------------------------------------------------------------------------

  /**
   * Check if an element is blocked
   *
   * @param elementId - Element to check
   * @returns Blocking info if blocked, null if not blocked
   */
  isBlocked(elementId: ElementId): BlockingInfo | null {
    const row = this.db.queryOne<BlockedCacheRow>(
      'SELECT * FROM blocked_cache WHERE element_id = ?',
      [elementId]
    );

    if (!row) {
      return null;
    }

    return {
      elementId: row.element_id as ElementId,
      blockedBy: row.blocked_by as ElementId,
      reason: row.reason ?? 'Blocked by dependency',
      previousStatus: row.previous_status,
    };
  }

  /**
   * Get all blocked elements
   *
   * @returns Array of blocking info for all blocked elements
   */
  getAllBlocked(): BlockingInfo[] {
    const rows = this.db.query<BlockedCacheRow>('SELECT * FROM blocked_cache');

    return rows.map((row) => ({
      elementId: row.element_id as ElementId,
      blockedBy: row.blocked_by as ElementId,
      reason: row.reason ?? 'Blocked by dependency',
      previousStatus: row.previous_status,
    }));
  }

  /**
   * Get all elements blocked by a specific element
   *
   * @param blockerId - The element causing blocks
   * @returns Array of element IDs blocked by this element
   */
  getBlockedBy(blockerId: ElementId): ElementId[] {
    const rows = this.db.query<{ element_id: string }>(
      'SELECT element_id FROM blocked_cache WHERE blocked_by = ?',
      [blockerId]
    );

    return rows.map((row) => row.element_id as ElementId);
  }

  /**
   * Count blocked elements
   */
  count(): number {
    const row = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM blocked_cache'
    );
    return row?.count ?? 0;
  }

  // --------------------------------------------------------------------------
  // Cache Maintenance
  // --------------------------------------------------------------------------

  /**
   * Add a blocking entry to the cache
   *
   * @param elementId - Element being blocked
   * @param blockedBy - Element causing the block
   * @param reason - Human-readable reason
   * @param previousStatus - The element's status before becoming blocked
   */
  addBlocked(
    elementId: ElementId,
    blockedBy: ElementId,
    reason: string,
    previousStatus?: string | null
  ): void {
    this.db.run(
      `INSERT OR REPLACE INTO blocked_cache (element_id, blocked_by, reason, previous_status)
       VALUES (?, ?, ?, ?)`,
      [elementId, blockedBy, reason, previousStatus ?? null]
    );
  }

  /**
   * Remove a blocking entry from the cache
   *
   * @param elementId - Element to unblock
   */
  removeBlocked(elementId: ElementId): void {
    this.db.run('DELETE FROM blocked_cache WHERE element_id = ?', [elementId]);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.db.run('DELETE FROM blocked_cache');
  }

  // --------------------------------------------------------------------------
  // Blocking State Computation
  // --------------------------------------------------------------------------

  /**
   * Check if an element is in a completed state (doesn't block others)
   *
   * @param elementId - Element to check
   * @returns true if element is completed/closed/tombstone
   */
  private isElementCompleted(elementId: ElementId): boolean {
    const row = this.db.queryOne<ElementRow>(
      'SELECT id, data, deleted_at FROM elements WHERE id = ?',
      [elementId]
    );

    // Element doesn't exist - treat as non-blocking (external reference)
    if (!row) {
      return true;
    }

    // Deleted (tombstone)
    if (row.deleted_at) {
      return true;
    }

    // Check status in data
    try {
      const data = JSON.parse(row.data);
      const status = data.status;
      return COMPLETED_STATUSES.includes(status);
    } catch {
      return false;
    }
  }

  /**
   * Check if a blocker element is in a completed state (no longer blocking)
   *
   * @param blockerId - The blocker element to check
   * @returns true if blocker is completed/closed/tombstone (no longer blocking)
   */
  isBlockerCompleted(blockerId: ElementId): boolean {
    return this.isElementCompleted(blockerId);
  }

  /**
   * Get the current status of an element
   *
   * @param elementId - Element to check
   * @returns The element's status, or null if not found or no status
   */
  getElementStatus(elementId: ElementId): string | null {
    const row = this.db.queryOne<ElementRow>(
      'SELECT data FROM elements WHERE id = ?',
      [elementId]
    );

    if (!row) {
      return null;
    }

    try {
      const data = JSON.parse(row.data);
      return data.status ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Check if element is a task (has status field)
   */
  isTask(elementId: ElementId): boolean {
    const row = this.db.queryOne<ElementRow>(
      'SELECT type FROM elements WHERE id = ?',
      [elementId]
    );
    return row?.type === 'task';
  }

  /**
   * Check if element is a plan
   */
  isPlan(elementId: ElementId): boolean {
    const row = this.db.queryOne<ElementRow>(
      'SELECT type FROM elements WHERE id = ?',
      [elementId]
    );
    return row?.type === 'plan';
  }

  /**
   * Check if an awaits gate is satisfied
   *
   * @param metadata - The awaits dependency metadata
   * @param options - Gate check options
   * @returns true if gate is satisfied (not blocking)
   */
  isGateSatisfied(
    metadata: AwaitsMetadata,
    options: GateCheckOptions = {}
  ): boolean {
    const now = options.currentTime ?? new Date();

    switch (metadata.gateType) {
      case GateType.TIMER:
        // Timer gate: satisfied when current time >= waitUntil
        const waitUntil = new Date(metadata.waitUntil);
        return now >= waitUntil;

      case GateType.APPROVAL:
        // Approval gate: satisfied when enough approvers have approved
        const required = metadata.approvalCount ?? metadata.requiredApprovers.length;
        const current = metadata.currentApprovers?.length ?? 0;
        return current >= required;

      case GateType.EXTERNAL:
        // External gates are satisfied when explicitly marked via API
        return (metadata as { satisfied?: boolean }).satisfied === true;

      case GateType.WEBHOOK:
        // Webhook gates are satisfied when explicitly marked via callback
        return (metadata as { satisfied?: boolean }).satisfied === true;

      default:
        return false;
    }
  }

  /**
   * Compute the blocking state for a single element
   *
   * @param elementId - Element to check
   * @param options - Gate check options
   * @returns Blocking info if blocked, null if not blocked
   */
  computeBlockingState(
    elementId: ElementId,
    options: GateCheckOptions = {}
  ): BlockingInfo | null {
    // All blocking types now use consistent direction:
    // blocked_id = element that is waiting, blocker_id = element doing the blocking
    const blockingDeps = this.db.query<DependencyRow>(
      `SELECT * FROM dependencies
       WHERE blocked_id = ? AND type IN (?, ?, ?)`,
      [elementId, DT.BLOCKS, DT.PARENT_CHILD, DT.AWAITS]
    );

    for (const dep of blockingDeps) {
      const blockerId = dep.blocker_id as ElementId;
      const type = dep.type as DependencyType;

      switch (type) {
        case DT.BLOCKS:
          // Check if blocker is completed
          if (!this.isBlockerCompleted(blockerId)) {
            return {
              elementId,
              blockedBy: blockerId,
              reason: `Blocked by ${blockerId} (blocks dependency)`,
            };
          }
          break;

        case DT.PARENT_CHILD:
          // Check if parent is blocked (transitive)
          const parentBlocked = this.isBlocked(blockerId);
          if (parentBlocked) {
            return {
              elementId,
              blockedBy: blockerId,
              reason: `Blocked by parent ${blockerId} (parent is blocked)`,
            };
          }
          // For task-task hierarchy: child is blocked until parent completes
          // For task-plan hierarchy: tasks in a plan are NOT blocked by the plan's status
          // Plans are collections, not blocking parents
          if (!this.isPlan(blockerId) && !this.isBlockerCompleted(blockerId)) {
            return {
              elementId,
              blockedBy: blockerId,
              reason: `Blocked by parent ${blockerId} (parent not completed)`,
            };
          }
          break;

        case DT.AWAITS:
          // Check if gate is satisfied
          if (dep.metadata) {
            try {
              const metadata = JSON.parse(dep.metadata);
              if (isValidAwaitsMetadata(metadata)) {
                if (!this.isGateSatisfied(metadata, options)) {
                  return {
                    elementId,
                    blockedBy: blockerId,
                    reason: `Blocked by gate (${metadata.gateType})`,
                  };
                }
              }
            } catch {
              // Invalid metadata, treat as blocking
              return {
                elementId,
                blockedBy: blockerId,
                reason: 'Blocked by gate (invalid metadata)',
              };
            }
          }
          break;
      }
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Invalidation
  // --------------------------------------------------------------------------

  /**
   * Update blocking state for an element after a dependency change
   *
   * Handles automatic status transitions:
   * - When element becomes blocked: saves current status and triggers BLOCKED transition
   * - When element becomes unblocked: restores previous status
   *
   * @param elementId - Element whose dependencies changed
   * @param options - Gate check options
   */
  invalidateElement(elementId: ElementId, options: GateCheckOptions = {}): void {
    // Check current cached state
    const wasBlocked = this.isBlocked(elementId);

    // Compute new blocking state
    const shouldBeBlocked = this.computeBlockingState(elementId, options);

    // Case 1: Becoming blocked (wasn't blocked, now should be)
    if (!wasBlocked && shouldBeBlocked) {
      // Only handle automatic status transitions for tasks
      if (this.isTask(elementId) && this.statusCallback) {
        const currentStatus = this.getElementStatus(elementId);
        // Only trigger automatic block if not already in a terminal/deferred state
        // and not already blocked
        if (currentStatus && currentStatus !== 'blocked' &&
            currentStatus !== 'closed' && currentStatus !== 'tombstone' &&
            currentStatus !== 'deferred') {
          this.addBlocked(
            shouldBeBlocked.elementId,
            shouldBeBlocked.blockedBy,
            shouldBeBlocked.reason,
            currentStatus
          );
          this.statusCallback.onBlock(elementId, currentStatus);
          return;
        }
      }
      // Non-task or no callback: just update cache (no previous status to preserve)
      this.addBlocked(
        shouldBeBlocked.elementId,
        shouldBeBlocked.blockedBy,
        shouldBeBlocked.reason,
        null
      );
    }
    // Case 2: Becoming unblocked (was blocked, now shouldn't be)
    else if (wasBlocked && !shouldBeBlocked) {
      // Get the status to restore
      const statusToRestore = wasBlocked.previousStatus;

      // Remove from cache first
      this.removeBlocked(elementId);

      // Only handle automatic status transitions for tasks
      if (this.isTask(elementId) && this.statusCallback && statusToRestore) {
        // Only restore if currently blocked
        const currentStatus = this.getElementStatus(elementId);
        if (currentStatus === 'blocked') {
          this.statusCallback.onUnblock(elementId, statusToRestore);
        }
      }
    }
    // Case 3: Still blocked but by different element (update cache)
    else if (wasBlocked && shouldBeBlocked) {
      // Keep the original previousStatus, just update blocker/reason
      this.addBlocked(
        shouldBeBlocked.elementId,
        shouldBeBlocked.blockedBy,
        shouldBeBlocked.reason,
        wasBlocked.previousStatus
      );
    }
    // Case 4: Was not blocked, still not blocked - no action needed
  }

  /**
   * Update blocking state for all elements that depend on a changed element
   * Called when an element's status changes (especially when completing)
   *
   * @param changedId - Element whose status changed
   * @param options - Gate check options
   */
  invalidateDependents(changedId: ElementId, options: GateCheckOptions = {}): void {
    // All blocking types: when a blocker changes, invalidate all blocked elements
    const deps = this.db.query<DependencyRow>(
      `SELECT DISTINCT blocked_id, type FROM dependencies
       WHERE blocker_id = ? AND type IN (?, ?, ?)`,
      [changedId, DT.BLOCKS, DT.PARENT_CHILD, DT.AWAITS]
    );

    for (const dep of deps) {
      const blockedId = dep.blocked_id as ElementId;
      this.invalidateElement(blockedId, options);

      // For parent-child, also invalidate children (transitive)
      if (dep.type === DT.PARENT_CHILD) {
        this.invalidateChildren(blockedId, options);
      }
    }
  }

  /**
   * Recursively invalidate children of an element
   * Used for transitive parent-child blocking
   *
   * @param parentId - Parent element
   * @param options - Gate check options
   * @param visited - Set of already visited elements (cycle prevention)
   */
  private invalidateChildren(
    parentId: ElementId,
    options: GateCheckOptions = {},
    visited: Set<string> = new Set()
  ): void {
    if (visited.has(parentId)) {
      return;
    }
    visited.add(parentId);

    // Find all elements that have this as a parent
    const children = this.db.query<DependencyRow>(
      `SELECT blocked_id FROM dependencies
       WHERE blocker_id = ? AND type = ?`,
      [parentId, DT.PARENT_CHILD]
    );

    for (const child of children) {
      const childId = child.blocked_id as ElementId;
      this.invalidateElement(childId, options);
      this.invalidateChildren(childId, options, visited);
    }
  }

  // --------------------------------------------------------------------------
  // Gate Satisfaction
  // --------------------------------------------------------------------------

  /**
   * Result of a gate satisfaction operation
   */
  /**
   * Mark an external or webhook gate as satisfied.
   * Updates the dependency metadata and recomputes blocking state.
   *
   * @param blockedId - Element that has the awaits dependency
   * @param blockerId - Blocker element ID of the awaits dependency
   * @param actor - Entity marking the gate as satisfied
   * @param options - Gate check options
   * @returns True if gate was found and satisfied, false if not found
   */
  satisfyGate(
    blockedId: ElementId,
    blockerId: ElementId,
    actor: EntityId,
    options: GateCheckOptions = {}
  ): boolean {
    // Find the awaits dependency
    const dep = this.db.queryOne<DependencyRow>(
      `SELECT * FROM dependencies WHERE blocked_id = ? AND blocker_id = ? AND type = ?`,
      [blockedId, blockerId, DT.AWAITS]
    );

    if (!dep || !dep.metadata) {
      return false;
    }

    // Parse and validate metadata
    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(dep.metadata);
    } catch {
      return false;
    }

    // Check gate type - only external and webhook can be satisfied this way
    const gateType = metadata.gateType;
    if (gateType !== GateType.EXTERNAL && gateType !== GateType.WEBHOOK) {
      return false;
    }

    // Already satisfied?
    if (metadata.satisfied === true) {
      return true;
    }

    // Mark as satisfied
    metadata.satisfied = true;
    metadata.satisfiedAt = new Date().toISOString();
    metadata.satisfiedBy = actor;

    // Update the dependency metadata in the database
    this.db.run(
      `UPDATE dependencies SET metadata = ? WHERE blocked_id = ? AND blocker_id = ? AND type = ?`,
      [JSON.stringify(metadata), blockedId, blockerId, DT.AWAITS]
    );

    // Recompute blocking state for the blocked element
    this.invalidateElement(blockedId, options);

    return true;
  }

  /**
   * Record an approval for an approval gate.
   * Updates the dependency metadata with the new approver.
   *
   * @param blockedId - Element that has the awaits dependency
   * @param blockerId - Blocker element ID of the awaits dependency
   * @param approver - Entity recording their approval
   * @param options - Gate check options
   * @returns Object indicating success and current approval count
   */
  recordApproval(
    blockedId: ElementId,
    blockerId: ElementId,
    approver: EntityId,
    options: GateCheckOptions = {}
  ): { success: boolean; currentCount: number; requiredCount: number; satisfied: boolean } {
    // Find the awaits dependency
    const dep = this.db.queryOne<DependencyRow>(
      `SELECT * FROM dependencies WHERE blocked_id = ? AND blocker_id = ? AND type = ?`,
      [blockedId, blockerId, DT.AWAITS]
    );

    if (!dep || !dep.metadata) {
      return { success: false, currentCount: 0, requiredCount: 0, satisfied: false };
    }

    // Parse and validate metadata
    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(dep.metadata);
    } catch {
      return { success: false, currentCount: 0, requiredCount: 0, satisfied: false };
    }

    // Check gate type - only approval gates support this
    if (metadata.gateType !== GateType.APPROVAL) {
      return { success: false, currentCount: 0, requiredCount: 0, satisfied: false };
    }

    // Get required approvers and count
    const requiredApprovers = metadata.requiredApprovers as EntityId[];
    const requiredCount = (metadata.approvalCount as number | undefined) ?? requiredApprovers.length;

    // Check if approver is in the required list
    if (!requiredApprovers.includes(approver)) {
      return { success: false, currentCount: 0, requiredCount, satisfied: false };
    }

    // Initialize or get current approvers
    const currentApprovers: EntityId[] = (metadata.currentApprovers as EntityId[] | undefined) ?? [];

    // Check if already approved
    if (currentApprovers.includes(approver)) {
      return {
        success: true,
        currentCount: currentApprovers.length,
        requiredCount,
        satisfied: currentApprovers.length >= requiredCount,
      };
    }

    // Add the approval
    currentApprovers.push(approver);
    metadata.currentApprovers = currentApprovers;

    // Update the dependency metadata in the database
    this.db.run(
      `UPDATE dependencies SET metadata = ? WHERE blocked_id = ? AND blocker_id = ? AND type = ?`,
      [JSON.stringify(metadata), blockedId, blockerId, DT.AWAITS]
    );

    // Recompute blocking state for the blocked element
    this.invalidateElement(blockedId, options);

    const satisfied = currentApprovers.length >= requiredCount;
    return {
      success: true,
      currentCount: currentApprovers.length,
      requiredCount,
      satisfied,
    };
  }

  /**
   * Remove an approval from an approval gate.
   *
   * @param blockedId - Element that has the awaits dependency
   * @param blockerId - Blocker element ID of the awaits dependency
   * @param approver - Entity removing their approval
   * @param options - Gate check options
   * @returns Object indicating success and current approval count
   */
  removeApproval(
    blockedId: ElementId,
    blockerId: ElementId,
    approver: EntityId,
    options: GateCheckOptions = {}
  ): { success: boolean; currentCount: number; requiredCount: number; satisfied: boolean } {
    // Find the awaits dependency
    const dep = this.db.queryOne<DependencyRow>(
      `SELECT * FROM dependencies WHERE blocked_id = ? AND blocker_id = ? AND type = ?`,
      [blockedId, blockerId, DT.AWAITS]
    );

    if (!dep || !dep.metadata) {
      return { success: false, currentCount: 0, requiredCount: 0, satisfied: false };
    }

    // Parse and validate metadata
    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(dep.metadata);
    } catch {
      return { success: false, currentCount: 0, requiredCount: 0, satisfied: false };
    }

    // Check gate type
    if (metadata.gateType !== GateType.APPROVAL) {
      return { success: false, currentCount: 0, requiredCount: 0, satisfied: false };
    }

    // Get required approvers and count
    const requiredApprovers = metadata.requiredApprovers as EntityId[];
    const requiredCount = (metadata.approvalCount as number | undefined) ?? requiredApprovers.length;

    // Get current approvers
    const currentApprovers: EntityId[] = (metadata.currentApprovers as EntityId[] | undefined) ?? [];

    // Check if approver is in the list
    const index = currentApprovers.indexOf(approver);
    if (index === -1) {
      return {
        success: true,
        currentCount: currentApprovers.length,
        requiredCount,
        satisfied: currentApprovers.length >= requiredCount,
      };
    }

    // Remove the approval
    currentApprovers.splice(index, 1);
    metadata.currentApprovers = currentApprovers;

    // Update the dependency metadata in the database
    this.db.run(
      `UPDATE dependencies SET metadata = ? WHERE blocked_id = ? AND blocker_id = ? AND type = ?`,
      [JSON.stringify(metadata), blockedId, blockerId, DT.AWAITS]
    );

    // Recompute blocking state for the blocked element
    this.invalidateElement(blockedId, options);

    const satisfied = currentApprovers.length >= requiredCount;
    return {
      success: true,
      currentCount: currentApprovers.length,
      requiredCount,
      satisfied,
    };
  }

  // --------------------------------------------------------------------------
  // Full Rebuild
  // --------------------------------------------------------------------------

  /**
   * Rebuild the entire blocked cache from scratch
   *
   * This is useful for:
   * - Initial population after migration
   * - Recovery from cache corruption
   * - Periodic consistency checks
   *
   * The rebuild processes elements in topological order (parents before children)
   * to ensure transitive blocking is computed correctly.
   *
   * @param options - Gate check options
   * @returns Rebuild statistics
   */
  rebuild(options: GateCheckOptions = {}): CacheRebuildResult {
    const startTime = Date.now();

    // Clear existing cache
    this.clear();

    // Get all elements that could potentially be blocked
    // All blocking types use blocked_id as the waiting element
    const blocksBlocked = this.db.query<{ element_id: string }>(
      `SELECT DISTINCT blocked_id as element_id FROM dependencies WHERE type = ?`,
      [DT.BLOCKS]
    );
    const parentChildBlocked = this.db.query<{ element_id: string }>(
      `SELECT DISTINCT blocked_id as element_id FROM dependencies WHERE type = ?`,
      [DT.PARENT_CHILD]
    );
    const awaitsBlocked = this.db.query<{ element_id: string }>(
      `SELECT DISTINCT blocked_id as element_id FROM dependencies WHERE type = ?`,
      [DT.AWAITS]
    );

    // Combine all potentially blocked elements
    const allElements = new Set<string>();
    for (const e of blocksBlocked) allElements.add(e.element_id);
    for (const e of parentChildBlocked) allElements.add(e.element_id);
    for (const e of awaitsBlocked) allElements.add(e.element_id);

    let elementsChecked = 0;
    let elementsBlocked = 0;

    // Process elements in dependency order (BFS from roots)
    // This ensures parents are processed before children for transitive blocking
    const processed = new Set<string>();
    const queue: ElementId[] = [];

    // First pass: Find parent relationships for topological ordering
    const parentOf = new Map<string, string[]>(); // child -> parents

    for (const elementId of allElements) {
      const parents = this.db.query<DependencyRow>(
        `SELECT blocker_id FROM dependencies
         WHERE blocked_id = ? AND type = ?`,
        [elementId, DT.PARENT_CHILD]
      );
      parentOf.set(
        elementId,
        parents.map((p) => p.blocker_id).filter((p) => allElements.has(p))
      );
    }

    // Start with elements that have no parents in our set
    for (const elementId of allElements) {
      const parents = parentOf.get(elementId) ?? [];
      if (parents.length === 0) {
        queue.push(elementId as ElementId);
      }
    }

    // Process in order
    while (queue.length > 0) {
      const elementId = queue.shift()!;

      if (processed.has(elementId)) {
        continue;
      }

      // Check if all parents are processed
      const parents = parentOf.get(elementId) ?? [];
      const allParentsProcessed = parents.every((p) => processed.has(p));

      if (!allParentsProcessed) {
        // Put back in queue for later
        queue.push(elementId);
        continue;
      }

      processed.add(elementId);
      elementsChecked++;

      // Compute blocking state
      const blocking = this.computeBlockingState(elementId, options);
      if (blocking) {
        this.addBlocked(blocking.elementId, blocking.blockedBy, blocking.reason);
        elementsBlocked++;
      }

      // Add children to queue
      const children = this.db.query<DependencyRow>(
        `SELECT blocked_id FROM dependencies
         WHERE blocker_id = ? AND type = ?`,
        [elementId, DT.PARENT_CHILD]
      );
      for (const child of children) {
        if (!processed.has(child.blocked_id)) {
          queue.push(child.blocked_id as ElementId);
        }
      }
    }

    // Handle any remaining elements (shouldn't happen if graph is consistent)
    for (const elementId of allElements) {
      if (!processed.has(elementId)) {
        elementsChecked++;
        const blocking = this.computeBlockingState(elementId as ElementId, options);
        if (blocking) {
          this.addBlocked(blocking.elementId, blocking.blockedBy, blocking.reason);
          elementsBlocked++;
        }
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      elementsChecked,
      elementsBlocked,
      durationMs,
    };
  }

  // --------------------------------------------------------------------------
  // Dependency Event Handlers
  // --------------------------------------------------------------------------

  /**
   * Handle a blocking dependency being added
   *
   * @param blockedId - Element that is waiting/blocked
   * @param blockerId - Element doing the blocking
   * @param type - Type of dependency
   * @param metadata - Dependency metadata (for awaits)
   * @param options - Gate check options
   */
  onDependencyAdded(
    blockedId: ElementId,
    blockerId: ElementId,
    type: DependencyType,
    _metadata?: Record<string, unknown>,
    options: GateCheckOptions = {}
  ): void {
    // Only handle blocking dependency types
    if (type !== DT.BLOCKS && type !== DT.PARENT_CHILD && type !== DT.AWAITS) {
      return;
    }

    // All blocking types: blockedId is the waiting element
    this.invalidateElement(blockedId, options);

    // For parent-child, also invalidate all children (transitive)
    if (type === DT.PARENT_CHILD) {
      this.invalidateChildren(blockedId, options);
    }
  }

  /**
   * Handle a blocking dependency being removed
   *
   * @param blockedId - Element that had a blocking dependency removed
   * @param blockerId - Element that was doing the blocking
   * @param type - Type of dependency that was removed
   * @param options - Gate check options
   */
  onDependencyRemoved(
    blockedId: ElementId,
    blockerId: ElementId,
    type: DependencyType,
    options: GateCheckOptions = {}
  ): void {
    // Only handle blocking dependency types
    if (type !== DT.BLOCKS && type !== DT.PARENT_CHILD && type !== DT.AWAITS) {
      return;
    }

    // All blocking types: blockedId is the waiting element
    this.invalidateElement(blockedId, options);

    // For parent-child, also invalidate all children
    if (type === DT.PARENT_CHILD) {
      this.invalidateChildren(blockedId, options);
    }
  }

  /**
   * Handle an element's status changing
   *
   * @param elementId - Element whose status changed
   * @param oldStatus - Previous status
   * @param newStatus - New status
   * @param options - Gate check options
   */
  onStatusChanged(
    elementId: ElementId,
    oldStatus: string | null,
    newStatus: string,
    options: GateCheckOptions = {}
  ): void {
    const wasCompleted = COMPLETED_STATUSES.includes(oldStatus as typeof COMPLETED_STATUSES[number]);
    const isNowCompleted = COMPLETED_STATUSES.includes(newStatus as typeof COMPLETED_STATUSES[number]);

    // If completion status changed, invalidate all dependents
    if (wasCompleted !== isNowCompleted) {
      this.invalidateDependents(elementId, options);
    }
  }

  /**
   * Handle an element being deleted
   *
   * @param elementId - Element that was deleted
   * @param options - Gate check options
   */
  onElementDeleted(elementId: ElementId, options: GateCheckOptions = {}): void {
    // Remove from cache if blocked
    this.removeBlocked(elementId);

    // Invalidate dependents (deletion is like completion)
    this.invalidateDependents(elementId, options);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new BlockedCacheService instance
 */
export function createBlockedCacheService(db: StorageBackend): BlockedCacheService {
  return new BlockedCacheService(db);
}
