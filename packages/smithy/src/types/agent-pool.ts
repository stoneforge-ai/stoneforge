/**
 * Agent Pool Types - Pool configuration for controlling agent concurrency
 *
 * Agent pools provide a way to limit the maximum number of agents running
 * concurrently across one or more agent types. The dispatch daemon respects
 * pool limits when spawning agents, and pools can have configurable priority
 * for each agent type to determine spawn order when there are multiple pending
 * tasks/resources.
 *
 * Key concepts:
 * - Pool size: Maximum number of concurrent agents across all types in the pool
 * - Agent type slots: Which agent types (worker, steward) can occupy pool slots
 * - Priority scores: Per-type priority for tie-breaking when multiple tasks are ready
 *
 * @module
 */

import type { EntityId, ElementId, Timestamp } from '@stoneforge/core';
import type { AgentRole, WorkerMode, StewardFocus } from './agent.js';

// ============================================================================
// Pool Agent Type Configuration
// ============================================================================

/**
 * Configuration for a specific agent type within a pool.
 * Defines which agents can occupy pool slots and their priority.
 */
export interface PoolAgentTypeConfig {
  /** The agent role (worker, steward) */
  readonly role: Exclude<AgentRole, 'director'>;
  /** Worker mode filter (only for role='worker') */
  readonly workerMode?: WorkerMode;
  /** Steward focus filter (only for role='steward') */
  readonly stewardFocus?: StewardFocus;
  /**
   * Priority score for this agent type (higher = higher priority).
   * Used to determine which type of agent to spawn when there are
   * multiple pending tasks/resources and only one pool slot available.
   * Default: 0
   */
  readonly priority?: number;
  /**
   * Maximum slots this agent type can occupy within the pool.
   * If not set, this type can occupy all available pool slots.
   * Must be <= pool maxSize.
   */
  readonly maxSlots?: number;
}

// ============================================================================
// Agent Pool Interface
// ============================================================================

/**
 * Agent Pool configuration stored as element metadata.
 * Pools are not a separate element type - they are stored as a configuration
 * in workspace settings or as a specialized Entity.
 */
export interface AgentPoolConfig {
  /** Unique pool name */
  readonly name: string;
  /** Human-readable description */
  readonly description?: string;
  /**
   * Maximum number of concurrent agents in this pool.
   * The dispatch daemon will not spawn new agents if the pool is full.
   */
  readonly maxSize: number;
  /**
   * Agent types that can occupy slots in this pool.
   * If empty, all ephemeral workers and stewards are included.
   */
  readonly agentTypes: PoolAgentTypeConfig[];
  /** Whether the pool is enabled (default: true) */
  readonly enabled?: boolean;
  /** Tags for categorization */
  readonly tags?: string[];
}

/**
 * Runtime status of an agent pool
 */
export interface AgentPoolStatus {
  /** Current number of active agents in the pool */
  readonly activeCount: number;
  /** Number of available slots (maxSize - activeCount) */
  readonly availableSlots: number;
  /** Breakdown of active agents by type */
  readonly activeByType: Record<string, number>;
  /** Agents currently occupying pool slots */
  readonly activeAgentIds: EntityId[];
  /** Timestamp when status was last updated */
  readonly lastUpdatedAt: Timestamp;
}

/**
 * Full agent pool with configuration and runtime status
 */
export interface AgentPool {
  /** Pool ID (element ID if stored as entity, or generated) */
  readonly id: ElementId;
  /** Pool configuration */
  readonly config: AgentPoolConfig;
  /** Current runtime status */
  readonly status: AgentPoolStatus;
  /** Pool creation timestamp */
  readonly createdAt: Timestamp;
  /** Entity that created this pool */
  readonly createdBy: EntityId;
}

// ============================================================================
// Pool Query Types
// ============================================================================

/**
 * Filter options for querying pools
 */
export interface AgentPoolFilter {
  /** Filter by enabled status */
  readonly enabled?: boolean;
  /** Filter by name pattern (substring match) */
  readonly nameContains?: string;
  /** Filter by tags (any match) */
  readonly tags?: string[];
  /** Filter to pools with available slots */
  readonly hasAvailableSlots?: boolean;
}

// ============================================================================
// Pool Operations
// ============================================================================

/**
 * Input for creating a new pool
 */
export interface CreatePoolInput {
  /** Unique pool name */
  readonly name: string;
  /** Human-readable description */
  readonly description?: string;
  /** Maximum concurrent agents */
  readonly maxSize: number;
  /** Agent type configurations */
  readonly agentTypes?: PoolAgentTypeConfig[];
  /** Whether pool is enabled (default: true) */
  readonly enabled?: boolean;
  /** Tags for categorization */
  readonly tags?: string[];
  /** Entity creating the pool */
  readonly createdBy: EntityId;
}

/**
 * Input for updating a pool
 */
export interface UpdatePoolInput {
  /** Updated description */
  readonly description?: string;
  /** Updated max size (must be >= current activeCount) */
  readonly maxSize?: number;
  /** Updated agent type configurations */
  readonly agentTypes?: PoolAgentTypeConfig[];
  /** Updated enabled status */
  readonly enabled?: boolean;
  /** Updated tags */
  readonly tags?: string[];
}

// ============================================================================
// Spawn Decision Types
// ============================================================================

/**
 * Result of checking if an agent can be spawned within pool constraints
 */
export interface PoolSpawnCheck {
  /** Whether the agent can be spawned */
  readonly canSpawn: boolean;
  /** The pool that governs this decision (if any) */
  readonly poolId?: ElementId;
  /** The pool name for display */
  readonly poolName?: string;
  /** Reason if canSpawn is false */
  readonly reason?: string;
  /** Number of slots that would be used after spawn */
  readonly slotsAfterSpawn?: number;
  /** Maximum slots in the pool */
  readonly maxSlots?: number;
}

/**
 * Agent spawn request for pool consideration
 */
export interface PoolSpawnRequest {
  /** The agent role */
  readonly role: Exclude<AgentRole, 'director'>;
  /** Worker mode (for workers) */
  readonly workerMode?: WorkerMode;
  /** Steward focus (for stewards) */
  readonly stewardFocus?: StewardFocus;
  /** The agent ID to spawn */
  readonly agentId: EntityId;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Valid pool name pattern: alphanumeric, hyphen, underscore
 */
const POOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Validates a pool name
 */
export function isValidPoolName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length < 1 || value.length > 64) return false;
  return POOL_NAME_PATTERN.test(value);
}

/**
 * Validates a pool max size
 */
export function isValidPoolSize(value: unknown): value is number {
  if (typeof value !== 'number') return false;
  if (!Number.isInteger(value)) return false;
  if (value < 1 || value > 1000) return false;
  return true;
}

/**
 * Validates a priority score
 */
export function isValidPriorityScore(value: unknown): value is number {
  if (typeof value !== 'number') return false;
  if (!Number.isInteger(value)) return false;
  return true;
}

/**
 * Validates a pool agent type configuration
 */
export function isValidPoolAgentTypeConfig(value: unknown): value is PoolAgentTypeConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Record<string, unknown>;

  // Role is required and must be worker or steward (not director)
  if (config.role !== 'worker' && config.role !== 'steward') return false;

  // Optional fields validation
  if (config.workerMode !== undefined) {
    if (config.workerMode !== 'ephemeral' && config.workerMode !== 'persistent') {
      return false;
    }
  }

  if (config.stewardFocus !== undefined) {
    const validFocuses = ['merge', 'docs', 'custom'];
    if (!validFocuses.includes(config.stewardFocus as string)) {
      return false;
    }
  }

  if (config.priority !== undefined && !isValidPriorityScore(config.priority)) {
    return false;
  }

  if (config.maxSlots !== undefined && !isValidPoolSize(config.maxSlots)) {
    return false;
  }

  return true;
}

/**
 * Validates a pool configuration
 */
export function isValidPoolConfig(value: unknown): value is AgentPoolConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Record<string, unknown>;

  if (!isValidPoolName(config.name)) return false;
  if (!isValidPoolSize(config.maxSize)) return false;

  if (config.agentTypes !== undefined) {
    if (!Array.isArray(config.agentTypes)) return false;
    for (const agentType of config.agentTypes) {
      if (!isValidPoolAgentTypeConfig(agentType)) return false;
    }
  }

  return true;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is an AgentPool
 */
export function isAgentPool(value: unknown): value is AgentPool {
  if (typeof value !== 'object' || value === null) return false;
  const pool = value as Record<string, unknown>;

  return (
    typeof pool.id === 'string' &&
    typeof pool.config === 'object' &&
    pool.config !== null &&
    typeof pool.status === 'object' &&
    pool.status !== null &&
    typeof pool.createdAt !== 'undefined' &&
    typeof pool.createdBy === 'string'
  );
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default pool configuration values
 */
export const POOL_DEFAULTS = {
  /** Default pool max size */
  maxSize: 5,
  /** Default enabled status */
  enabled: true,
  /** Default priority for agent types */
  defaultPriority: 0,
} as const;

/**
 * Pool metadata key for storing pool config in Entity metadata
 */
export const POOL_METADATA_KEY = 'agentPool' as const;
