/**
 * Agent Pool Service
 *
 * This service manages agent pools - configurations that limit the maximum
 * number of agents running concurrently. The dispatch daemon consults this
 * service before spawning agents to ensure pool limits are respected.
 *
 * Key features:
 * - Create, update, delete agent pools
 * - Track active agents per pool (via session manager integration)
 * - Check spawn permissions based on pool capacity
 * - Priority-based agent type selection when pool has limited slots
 *
 * @module
 */

import type { EntityId, ElementId, Entity, Timestamp } from '@stoneforge/core';
import { createTimestamp, createEntity, EntityTypeValue, asEntityId, asElementId } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';

import type {
  AgentRole,
  WorkerMode,
  StewardFocus,
  AgentPoolConfig,
  AgentPoolStatus,
  AgentPool,
  AgentPoolFilter,
  CreatePoolInput,
  UpdatePoolInput,
  PoolSpawnCheck,
  PoolSpawnRequest,
  PoolAgentTypeConfig,
} from '../types/index.js';
import { POOL_DEFAULTS, POOL_METADATA_KEY, isValidPoolName, isValidPoolSize } from '../types/agent-pool.js';
import type { SessionManager } from '../runtime/session-manager.js';
import type { AgentRegistry, AgentEntity } from './agent-registry.js';
import { getAgentMetadata } from './agent-registry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('agent-pool');

// ============================================================================
// Constants
// ============================================================================

/**
 * Entity type value for pool entities
 * Pools are stored as special 'system' entities with pool metadata
 */
const POOL_ENTITY_TYPE = EntityTypeValue.SYSTEM;

/**
 * Tag used to identify pool entities
 */
const POOL_TAG = 'agent-pool';

// ============================================================================
// Agent Pool Service Interface
// ============================================================================

/**
 * Agent Pool Service interface for managing agent concurrency limits.
 *
 * The service provides methods for:
 * - Creating and managing pool configurations
 * - Checking pool capacity before spawning agents
 * - Tracking active agents per pool
 * - Priority-based spawn decisions
 */
export interface AgentPoolService {
  // ----------------------------------------
  // Pool CRUD Operations
  // ----------------------------------------

  /**
   * Creates a new agent pool.
   *
   * @param input - Pool creation input
   * @returns The created pool
   */
  createPool(input: CreatePoolInput): Promise<AgentPool>;

  /**
   * Gets a pool by ID.
   *
   * @param poolId - The pool element ID
   * @returns The pool or undefined if not found
   */
  getPool(poolId: ElementId): Promise<AgentPool | undefined>;

  /**
   * Gets a pool by name.
   *
   * @param name - The pool name
   * @returns The pool or undefined if not found
   */
  getPoolByName(name: string): Promise<AgentPool | undefined>;

  /**
   * Lists all pools matching the filter.
   *
   * @param filter - Optional filter criteria
   * @returns Array of pools
   */
  listPools(filter?: AgentPoolFilter): Promise<AgentPool[]>;

  /**
   * Updates a pool configuration.
   *
   * @param poolId - The pool element ID
   * @param updates - The updates to apply
   * @returns The updated pool
   */
  updatePool(poolId: ElementId, updates: UpdatePoolInput): Promise<AgentPool>;

  /**
   * Deletes a pool.
   *
   * @param poolId - The pool element ID
   */
  deletePool(poolId: ElementId): Promise<void>;

  // ----------------------------------------
  // Pool Status Operations
  // ----------------------------------------

  /**
   * Gets the current status of a pool (active count, available slots).
   *
   * @param poolId - The pool element ID
   * @returns The pool status
   */
  getPoolStatus(poolId: ElementId): Promise<AgentPoolStatus>;

  /**
   * Refreshes the status of all pools based on current sessions.
   * This synchronizes pool status with the actual running agents.
   */
  refreshAllPoolStatus(): Promise<void>;

  // ----------------------------------------
  // Spawn Decision Operations
  // ----------------------------------------

  /**
   * Checks if an agent can be spawned based on pool constraints.
   * Returns information about which pool governs the decision.
   *
   * @param request - The spawn request with agent type information
   * @returns The spawn check result
   */
  canSpawn(request: PoolSpawnRequest): Promise<PoolSpawnCheck>;

  /**
   * Gets all pools that an agent type belongs to.
   *
   * @param role - The agent role
   * @param workerMode - Worker mode (for workers)
   * @param stewardFocus - Steward focus (for stewards)
   * @returns Array of pools containing this agent type
   */
  getPoolsForAgentType(
    role: Exclude<AgentRole, 'director'>,
    workerMode?: WorkerMode,
    stewardFocus?: StewardFocus
  ): Promise<AgentPool[]>;

  /**
   * Determines the next agent type to spawn based on priority.
   * Used when a pool has available slots and multiple pending tasks.
   *
   * @param poolId - The pool element ID
   * @param pendingRequests - Array of pending spawn requests
   * @returns The highest priority request that can be spawned, or undefined
   */
  getNextSpawnPriority(
    poolId: ElementId,
    pendingRequests: PoolSpawnRequest[]
  ): Promise<PoolSpawnRequest | undefined>;

  // ----------------------------------------
  // Agent Tracking
  // ----------------------------------------

  /**
   * Notifies the service that an agent has been spawned.
   * Updates pool status accordingly.
   *
   * @param agentId - The spawned agent ID
   */
  onAgentSpawned(agentId: EntityId): Promise<void>;

  /**
   * Notifies the service that an agent session has ended.
   * Updates pool status accordingly.
   *
   * @param agentId - The agent ID whose session ended
   */
  onAgentSessionEnded(agentId: EntityId): Promise<void>;
}

// ============================================================================
// Agent Pool Service Implementation
// ============================================================================

/**
 * Implementation of the Agent Pool Service.
 */
export class AgentPoolServiceImpl implements AgentPoolService {
  private readonly api: QuarryAPI;
  private readonly sessionManager: SessionManager;
  private readonly agentRegistry: AgentRegistry;

  /**
   * In-memory cache of pool status.
   * Key: pool ID, Value: status
   */
  private readonly statusCache: Map<string, AgentPoolStatus> = new Map();

  constructor(
    api: QuarryAPI,
    sessionManager: SessionManager,
    agentRegistry: AgentRegistry
  ) {
    this.api = api;
    this.sessionManager = sessionManager;
    this.agentRegistry = agentRegistry;
  }

  // ----------------------------------------
  // Pool CRUD Operations
  // ----------------------------------------

  async createPool(input: CreatePoolInput): Promise<AgentPool> {
    // Validate input
    if (!isValidPoolName(input.name)) {
      throw new Error(`Invalid pool name: ${input.name}. Must start with a letter and contain only alphanumeric, hyphen, or underscore.`);
    }

    if (!isValidPoolSize(input.maxSize)) {
      throw new Error(`Invalid pool size: ${input.maxSize}. Must be between 1 and 1000.`);
    }

    // Check for duplicate name
    const existing = await this.getPoolByName(input.name);
    if (existing) {
      throw new Error(`Pool with name '${input.name}' already exists`);
    }

    // Build pool config
    const config: AgentPoolConfig = {
      name: input.name,
      description: input.description,
      maxSize: input.maxSize,
      agentTypes: input.agentTypes ?? [],
      enabled: input.enabled ?? POOL_DEFAULTS.enabled,
      tags: input.tags,
    };

    // Create pool as a system entity with pool metadata
    const entity = await createEntity({
      name: `pool-${input.name}`,
      entityType: POOL_ENTITY_TYPE,
      tags: [POOL_TAG, ...(input.tags ?? [])],
      createdBy: input.createdBy,
      metadata: {
        [POOL_METADATA_KEY]: config,
      },
    });

    const saved = await this.api.create<Entity>(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    const poolId = saved.id as ElementId;

    // Initialize status
    const status: AgentPoolStatus = {
      activeCount: 0,
      availableSlots: config.maxSize,
      activeByType: {},
      activeAgentIds: [],
      lastUpdatedAt: createTimestamp(),
    };

    this.statusCache.set(poolId, status);

    return {
      id: poolId,
      config,
      status,
      createdAt: saved.createdAt as Timestamp,
      createdBy: saved.createdBy,
    };
  }

  async getPool(poolId: ElementId): Promise<AgentPool | undefined> {
    const entity = await this.api.get(poolId);
    if (!entity || entity.type !== 'entity') {
      return undefined;
    }

    const poolEntity = entity as Entity;
    if (!poolEntity.tags?.includes(POOL_TAG)) {
      return undefined;
    }

    return this.entityToPool(poolEntity);
  }

  async getPoolByName(name: string): Promise<AgentPool | undefined> {
    // Look up by entity name pattern
    const entityName = `pool-${name}`;
    const element = await this.api.lookupEntityByName(entityName);
    if (!element) {
      return undefined;
    }

    if (!element.tags?.includes(POOL_TAG)) {
      return undefined;
    }

    // Cast Element to Entity - lookupEntityByName returns Entity elements
    return this.entityToPool(element as Entity);
  }

  async listPools(filter?: AgentPoolFilter): Promise<AgentPool[]> {
    // Get all entities with pool tag
    const entities = await this.api.list<Entity>({ type: 'entity', tags: [POOL_TAG] });
    let pools: AgentPool[] = [];

    for (const entity of entities) {
      const pool = await this.entityToPool(entity as Entity);
      if (pool) {
        pools.push(pool);
      }
    }

    // Apply filters
    if (filter) {
      if (filter.enabled !== undefined) {
        pools = pools.filter((p) => p.config.enabled === filter.enabled);
      }

      if (filter.nameContains) {
        const search = filter.nameContains.toLowerCase();
        pools = pools.filter((p) => p.config.name.toLowerCase().includes(search));
      }

      if (filter.tags && filter.tags.length > 0) {
        pools = pools.filter((p) =>
          filter.tags!.some((tag) => p.config.tags?.includes(tag))
        );
      }

      if (filter.hasAvailableSlots) {
        pools = pools.filter((p) => p.status.availableSlots > 0);
      }
    }

    return pools;
  }

  async updatePool(poolId: ElementId, updates: UpdatePoolInput): Promise<AgentPool> {
    const pool = await this.getPool(poolId);
    if (!pool) {
      throw new Error(`Pool not found: ${poolId}`);
    }

    // Validate max size update
    if (updates.maxSize !== undefined) {
      if (!isValidPoolSize(updates.maxSize)) {
        throw new Error(`Invalid pool size: ${updates.maxSize}. Must be between 1 and 1000.`);
      }

      // Cannot reduce below current active count
      if (updates.maxSize < pool.status.activeCount) {
        throw new Error(
          `Cannot reduce pool size to ${updates.maxSize}. ` +
          `${pool.status.activeCount} agents are currently active.`
        );
      }
    }

    // Build updated config
    const updatedConfig: AgentPoolConfig = {
      ...pool.config,
      description: updates.description ?? pool.config.description,
      maxSize: updates.maxSize ?? pool.config.maxSize,
      agentTypes: updates.agentTypes ?? pool.config.agentTypes,
      enabled: updates.enabled ?? pool.config.enabled,
      tags: updates.tags ?? pool.config.tags,
    };

    // Update entity
    await this.api.update(poolId, {
      metadata: {
        [POOL_METADATA_KEY]: updatedConfig,
      },
      tags: [POOL_TAG, ...(updatedConfig.tags ?? [])],
    });

    // Update status if max size changed
    const updatedStatus: AgentPoolStatus = {
      ...pool.status,
      availableSlots: updatedConfig.maxSize - pool.status.activeCount,
      lastUpdatedAt: createTimestamp(),
    };

    this.statusCache.set(poolId, updatedStatus);

    return {
      ...pool,
      config: updatedConfig,
      status: updatedStatus,
    };
  }

  async deletePool(poolId: ElementId): Promise<void> {
    const pool = await this.getPool(poolId);
    if (!pool) {
      throw new Error(`Pool not found: ${poolId}`);
    }

    // Warn but don't prevent if agents are active
    if (pool.status.activeCount > 0) {
      logger.warn(
        `Deleting pool '${pool.config.name}' with ${pool.status.activeCount} active agents. ` +
        `These agents will continue running but won't be tracked.`
      );
    }

    await this.api.delete(poolId);
    this.statusCache.delete(poolId);
  }

  // ----------------------------------------
  // Pool Status Operations
  // ----------------------------------------

  async getPoolStatus(poolId: ElementId): Promise<AgentPoolStatus> {
    // Check cache first
    const cached = this.statusCache.get(poolId);
    if (cached) {
      return cached;
    }

    // Refresh from session manager
    const pool = await this.getPool(poolId);
    if (!pool) {
      throw new Error(`Pool not found: ${poolId}`);
    }

    const status = await this.computePoolStatus(pool.config);
    this.statusCache.set(poolId, status);

    return status;
  }

  async refreshAllPoolStatus(): Promise<void> {
    const pools = await this.listPools();

    for (const pool of pools) {
      const status = await this.computePoolStatus(pool.config);
      this.statusCache.set(pool.id, status);
    }
  }

  // ----------------------------------------
  // Spawn Decision Operations
  // ----------------------------------------

  async canSpawn(request: PoolSpawnRequest): Promise<PoolSpawnCheck> {
    // Get pools that govern this agent type
    const pools = await this.getPoolsForAgentType(
      request.role,
      request.workerMode,
      request.stewardFocus
    );

    // If no pools govern this agent type, spawn is allowed
    if (pools.length === 0) {
      return { canSpawn: true };
    }

    // Check each pool for capacity
    // Agent can only spawn if ALL governing pools have capacity
    for (const pool of pools) {
      if (!pool.config.enabled) {
        continue; // Skip disabled pools
      }

      const status = await this.getPoolStatus(pool.id);

      if (status.availableSlots <= 0) {
        return {
          canSpawn: false,
          poolId: pool.id,
          poolName: pool.config.name,
          reason: `Pool '${pool.config.name}' is at capacity (${pool.config.maxSize} agents)`,
          slotsAfterSpawn: status.activeCount + 1,
          maxSlots: pool.config.maxSize,
        };
      }

      // Check per-type slot limits
      const typeConfig = this.findMatchingTypeConfig(pool.config, request);
      if (typeConfig?.maxSlots !== undefined) {
        const typeKey = this.getTypeKey(request);
        const currentTypeCount = status.activeByType[typeKey] ?? 0;

        if (currentTypeCount >= typeConfig.maxSlots) {
          return {
            canSpawn: false,
            poolId: pool.id,
            poolName: pool.config.name,
            reason: `Pool '${pool.config.name}' has reached max slots for ${typeKey} (${typeConfig.maxSlots})`,
            slotsAfterSpawn: currentTypeCount + 1,
            maxSlots: typeConfig.maxSlots,
          };
        }
      }
    }

    // All pools have capacity
    const primaryPool = pools[0];
    const primaryStatus = await this.getPoolStatus(primaryPool.id);

    return {
      canSpawn: true,
      poolId: primaryPool.id,
      poolName: primaryPool.config.name,
      slotsAfterSpawn: primaryStatus.activeCount + 1,
      maxSlots: primaryPool.config.maxSize,
    };
  }

  async getPoolsForAgentType(
    role: Exclude<AgentRole, 'director'>,
    workerMode?: WorkerMode,
    stewardFocus?: StewardFocus
  ): Promise<AgentPool[]> {
    const allPools = await this.listPools({ enabled: true });
    const matchingPools: AgentPool[] = [];

    for (const pool of allPools) {
      // If pool has no agentTypes configured, it governs all agents
      if (pool.config.agentTypes.length === 0) {
        matchingPools.push(pool);
        continue;
      }

      // Check if any agent type config matches
      const matches = pool.config.agentTypes.some((typeConfig) => {
        if (typeConfig.role !== role) return false;

        if (role === 'worker') {
          // If workerMode is specified in config, it must match
          if (typeConfig.workerMode !== undefined && typeConfig.workerMode !== workerMode) {
            return false;
          }
        }

        if (role === 'steward') {
          // If stewardFocus is specified in config, it must match
          if (typeConfig.stewardFocus !== undefined && typeConfig.stewardFocus !== stewardFocus) {
            return false;
          }
        }

        return true;
      });

      if (matches) {
        matchingPools.push(pool);
      }
    }

    return matchingPools;
  }

  async getNextSpawnPriority(
    poolId: ElementId,
    pendingRequests: PoolSpawnRequest[]
  ): Promise<PoolSpawnRequest | undefined> {
    const pool = await this.getPool(poolId);
    if (!pool) {
      return undefined;
    }

    const status = await this.getPoolStatus(poolId);
    if (status.availableSlots <= 0) {
      return undefined;
    }

    // Score each request based on pool's agent type priority
    const scoredRequests = pendingRequests.map((request) => {
      const typeConfig = this.findMatchingTypeConfig(pool.config, request);
      const priority = typeConfig?.priority ?? POOL_DEFAULTS.defaultPriority;

      // Check if this type is at its slot limit
      const typeKey = this.getTypeKey(request);
      const currentTypeCount = status.activeByType[typeKey] ?? 0;
      const atTypeLimit = typeConfig?.maxSlots !== undefined &&
        currentTypeCount >= typeConfig.maxSlots;

      return { request, priority, atTypeLimit };
    });

    // Filter out requests at their type limit
    const eligibleRequests = scoredRequests.filter((r) => !r.atTypeLimit);

    if (eligibleRequests.length === 0) {
      return undefined;
    }

    // Sort by priority (highest first)
    eligibleRequests.sort((a, b) => b.priority - a.priority);

    return eligibleRequests[0].request;
  }

  // ----------------------------------------
  // Agent Tracking
  // ----------------------------------------

  async onAgentSpawned(agentId: EntityId): Promise<void> {
    // Get agent details
    const agent = await this.agentRegistry.getAgent(agentId);
    if (!agent) {
      return;
    }

    const meta = getAgentMetadata(agent);
    if (!meta) {
      return;
    }

    // Directors are not pool-managed
    if (meta.agentRole === 'director') {
      return;
    }

    // Get pools governing this agent
    const pools = await this.getPoolsForAgentType(
      meta.agentRole as Exclude<AgentRole, 'director'>,
      (meta as { workerMode?: WorkerMode }).workerMode,
      (meta as { stewardFocus?: StewardFocus }).stewardFocus
    );

    // Update status for each pool
    for (const pool of pools) {
      const status = this.statusCache.get(pool.id) ?? await this.getPoolStatus(pool.id);
      const typeKey = this.getAgentTypeKey(agent);

      const updatedStatus: AgentPoolStatus = {
        activeCount: status.activeCount + 1,
        availableSlots: pool.config.maxSize - status.activeCount - 1,
        activeByType: {
          ...status.activeByType,
          [typeKey]: (status.activeByType[typeKey] ?? 0) + 1,
        },
        activeAgentIds: [...status.activeAgentIds, agentId],
        lastUpdatedAt: createTimestamp(),
      };

      this.statusCache.set(pool.id, updatedStatus);
    }
  }

  async onAgentSessionEnded(agentId: EntityId): Promise<void> {
    // Get agent details
    const agent = await this.agentRegistry.getAgent(agentId);
    if (!agent) {
      // Agent may have been deleted, just remove from all pools
      for (const [poolId, status] of this.statusCache.entries()) {
        if (status.activeAgentIds.includes(agentId)) {
          const updatedStatus: AgentPoolStatus = {
            activeCount: Math.max(0, status.activeCount - 1),
            availableSlots: status.availableSlots + 1,
            activeByType: status.activeByType, // Can't update type counts without agent info
            activeAgentIds: status.activeAgentIds.filter((id) => id !== agentId),
            lastUpdatedAt: createTimestamp(),
          };

          this.statusCache.set(poolId, updatedStatus);
        }
      }
      return;
    }

    const meta = getAgentMetadata(agent);
    if (!meta || meta.agentRole === 'director') {
      return;
    }

    // Get pools governing this agent
    const pools = await this.getPoolsForAgentType(
      meta.agentRole as Exclude<AgentRole, 'director'>,
      (meta as { workerMode?: WorkerMode }).workerMode,
      (meta as { stewardFocus?: StewardFocus }).stewardFocus
    );

    // Update status for each pool
    for (const pool of pools) {
      const status = this.statusCache.get(pool.id) ?? await this.getPoolStatus(pool.id);
      const typeKey = this.getAgentTypeKey(agent);

      const updatedStatus: AgentPoolStatus = {
        activeCount: Math.max(0, status.activeCount - 1),
        availableSlots: pool.config.maxSize - Math.max(0, status.activeCount - 1),
        activeByType: {
          ...status.activeByType,
          [typeKey]: Math.max(0, (status.activeByType[typeKey] ?? 0) - 1),
        },
        activeAgentIds: status.activeAgentIds.filter((id) => id !== agentId),
        lastUpdatedAt: createTimestamp(),
      };

      this.statusCache.set(pool.id, updatedStatus);
    }
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  /**
   * Converts an Entity to an AgentPool
   */
  private async entityToPool(entity: Entity): Promise<AgentPool | undefined> {
    const poolMetadata = entity.metadata?.[POOL_METADATA_KEY] as AgentPoolConfig | undefined;
    if (!poolMetadata) {
      return undefined;
    }

    // Get or compute status
    const poolId = entity.id as ElementId;
    let status = this.statusCache.get(poolId);
    if (!status) {
      status = await this.computePoolStatus(poolMetadata);
      this.statusCache.set(poolId, status);
    }

    return {
      id: poolId,
      config: poolMetadata,
      status,
      createdAt: entity.createdAt as Timestamp,
      createdBy: entity.createdBy,
    };
  }

  /**
   * Computes the current pool status from session manager
   */
  private async computePoolStatus(config: AgentPoolConfig): Promise<AgentPoolStatus> {
    // Get all running sessions
    const runningSessions = this.sessionManager.listSessions({ status: 'running' });

    // Filter to sessions for agent types in this pool
    const activeAgentIds: EntityId[] = [];
    const activeByType: Record<string, number> = {};

    for (const session of runningSessions) {
      // Get agent details
      const agent = await this.agentRegistry.getAgent(session.agentId);
      if (!agent) continue;

      const meta = getAgentMetadata(agent);
      if (!meta || meta.agentRole === 'director') continue;

      // Check if this agent type is governed by this pool
      const isGoverned = this.isAgentGovernedByPool(agent, config);
      if (!isGoverned) continue;

      // Track this agent
      activeAgentIds.push(session.agentId);
      const typeKey = this.getAgentTypeKey(agent);
      activeByType[typeKey] = (activeByType[typeKey] ?? 0) + 1;
    }

    return {
      activeCount: activeAgentIds.length,
      availableSlots: Math.max(0, config.maxSize - activeAgentIds.length),
      activeByType,
      activeAgentIds,
      lastUpdatedAt: createTimestamp(),
    };
  }

  /**
   * Checks if an agent is governed by a pool configuration
   */
  private isAgentGovernedByPool(agent: AgentEntity, config: AgentPoolConfig): boolean {
    const meta = getAgentMetadata(agent);
    if (!meta || meta.agentRole === 'director') return false;

    // If no agent types configured, pool governs all agents
    if (config.agentTypes.length === 0) {
      return true;
    }

    // Check if any type config matches
    return config.agentTypes.some((typeConfig) => {
      if (typeConfig.role !== meta.agentRole) return false;

      if (meta.agentRole === 'worker') {
        const workerMeta = meta as { workerMode?: WorkerMode };
        if (typeConfig.workerMode !== undefined && typeConfig.workerMode !== workerMeta.workerMode) {
          return false;
        }
      }

      if (meta.agentRole === 'steward') {
        const stewardMeta = meta as { stewardFocus?: StewardFocus };
        if (typeConfig.stewardFocus !== undefined && typeConfig.stewardFocus !== stewardMeta.stewardFocus) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Finds the matching type config for a spawn request
   */
  private findMatchingTypeConfig(
    config: AgentPoolConfig,
    request: PoolSpawnRequest
  ): PoolAgentTypeConfig | undefined {
    if (config.agentTypes.length === 0) {
      return undefined; // Default behavior, no specific config
    }

    return config.agentTypes.find((typeConfig) => {
      if (typeConfig.role !== request.role) return false;

      if (request.role === 'worker') {
        if (typeConfig.workerMode !== undefined && typeConfig.workerMode !== request.workerMode) {
          return false;
        }
      }

      if (request.role === 'steward') {
        if (typeConfig.stewardFocus !== undefined && typeConfig.stewardFocus !== request.stewardFocus) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Gets a type key for a spawn request (for activeByType tracking)
   */
  private getTypeKey(request: PoolSpawnRequest): string {
    if (request.role === 'worker') {
      return `worker:${request.workerMode ?? 'any'}`;
    }
    if (request.role === 'steward') {
      return `steward:${request.stewardFocus ?? 'any'}`;
    }
    return request.role;
  }

  /**
   * Gets a type key for an agent entity
   */
  private getAgentTypeKey(agent: AgentEntity): string {
    const meta = getAgentMetadata(agent);
    if (!meta) return 'unknown';

    if (meta.agentRole === 'worker') {
      const workerMeta = meta as { workerMode?: WorkerMode };
      return `worker:${workerMeta.workerMode ?? 'any'}`;
    }

    if (meta.agentRole === 'steward') {
      const stewardMeta = meta as { stewardFocus?: StewardFocus };
      return `steward:${stewardMeta.stewardFocus ?? 'any'}`;
    }

    return meta.agentRole;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates an AgentPoolService instance
 */
export function createAgentPoolService(
  api: QuarryAPI,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry
): AgentPoolService {
  return new AgentPoolServiceImpl(api, sessionManager, agentRegistry);
}
