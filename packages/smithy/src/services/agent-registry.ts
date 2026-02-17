/**
 * Agent Registry Service
 *
 * This service provides agent registration and management functionality.
 * It allows registering agents with roles (director, worker, steward) and
 * querying agents by various criteria.
 *
 * Key features:
 * - Register agents with specific roles
 * - Query agents by role, status, and other filters
 * - Track agent session status
 * - Manage agent metadata
 * - Create dedicated channels for agent messaging (TB-O7a)
 *
 * @module
 */

import type { Entity, EntityId, ElementId, Channel, ChannelId } from '@stoneforge/core';
import { EntityTypeValue, createEntity, createTimestamp, createDirectChannel, generateDirectChannelName, duplicateName, asEntityId, asElementId } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';
import type {
  AgentRole,
  AgentMetadata,
  DirectorMetadata,
  WorkerMetadata,
  StewardMetadata,
  AgentFilter,
  RegisterDirectorInput,
  RegisterWorkerInput,
  RegisterStewardInput,
} from '../types/index.js';
// Import shared agent entity types from the API module to avoid duplication
import {
  type AgentEntity,
  isAgentEntity,
  getAgentMetadata,
} from '../api/orchestrator-api.js';

// Re-export for convenience
export type { AgentEntity };
export { isAgentEntity, getAgentMetadata };

// ============================================================================
// Constants
// ============================================================================

/**
 * Key used to store agent metadata in Entity.metadata
 */
const AGENT_META_KEY = 'agent';

/**
 * Prefix for agent channel names
 */
const AGENT_CHANNEL_PREFIX = 'agent-';

/**
 * Generates the channel name for an agent based on agent name
 * Channel names follow the pattern: agent-{agentName}
 */
export function generateAgentChannelName(agentName: string): string {
  return `${AGENT_CHANNEL_PREFIX}${agentName}`;
}

/**
 * Parses an agent name from a channel name
 * Returns null if the name doesn't match the agent channel pattern
 */
export function parseAgentChannelName(channelName: string): string | null {
  if (!channelName.startsWith(AGENT_CHANNEL_PREFIX)) {
    return null;
  }
  const agentName = channelName.slice(AGENT_CHANNEL_PREFIX.length);
  // Basic validation - must have a non-empty name
  if (!agentName || agentName.length === 0) {
    return null;
  }
  return agentName;
}

// ============================================================================
// Registration Input Types (Extended)
// ============================================================================

/**
 * Generic agent registration input
 */
export type RegisterAgentInput =
  | (RegisterDirectorInput & { role: 'director' })
  | (RegisterWorkerInput & { role: 'worker' })
  | (RegisterStewardInput & { role: 'steward' });

// ============================================================================
// Agent Registry Interface
// ============================================================================

/**
 * Agent Registry interface for managing agents in the orchestration system.
 *
 * The registry provides methods for:
 * - Registering agents with specific roles
 * - Querying agents by various criteria
 * - Managing agent session status
 */
export interface AgentRegistry {
  // ----------------------------------------
  // Agent Registration
  // ----------------------------------------

  /**
   * Registers a new agent with the given parameters.
   * This is a convenience method that dispatches to the appropriate
   * role-specific registration method.
   */
  registerAgent(input: RegisterAgentInput): Promise<AgentEntity>;

  /**
   * Registers a Director agent.
   * There should typically be only one Director per workspace.
   */
  registerDirector(input: RegisterDirectorInput): Promise<AgentEntity>;

  /**
   * Registers a Worker agent.
   * Workers can be ephemeral (short-lived, task-specific) or persistent (long-lived).
   */
  registerWorker(input: RegisterWorkerInput): Promise<AgentEntity>;

  /**
   * Registers a Steward agent.
   * Stewards perform support tasks like merging branches and scanning documentation.
   */
  registerSteward(input: RegisterStewardInput): Promise<AgentEntity>;

  // ----------------------------------------
  // Agent Queries
  // ----------------------------------------

  /**
   * Gets an agent by ID
   */
  getAgent(entityId: EntityId): Promise<AgentEntity | undefined>;

  /**
   * Gets an agent by name
   */
  getAgentByName(name: string): Promise<AgentEntity | undefined>;

  /**
   * Lists agents matching the filter
   */
  listAgents(filter?: AgentFilter): Promise<AgentEntity[]>;

  /**
   * Gets all agents with a specific role
   */
  getAgentsByRole(role: AgentRole): Promise<AgentEntity[]>;

  /**
   * Gets available workers (idle or with capacity for more tasks)
   */
  getAvailableWorkers(): Promise<AgentEntity[]>;

  /**
   * Gets all stewards
   */
  getStewards(): Promise<AgentEntity[]>;

  /**
   * Gets the Director agent (there should be only one per workspace)
   */
  getDirector(): Promise<AgentEntity | undefined>;

  // ----------------------------------------
  // Agent Session Management
  // ----------------------------------------

  /**
   * Updates an agent's session status
   */
  updateAgentSession(
    entityId: EntityId,
    sessionId: string | undefined,
    status: 'idle' | 'running' | 'suspended' | 'terminated'
  ): Promise<AgentEntity>;

  /**
   * Updates an agent's metadata
   */
  updateAgentMetadata(
    entityId: EntityId,
    updates: Partial<AgentMetadata>
  ): Promise<AgentEntity>;

  /**
   * Updates an agent's properties (e.g., name)
   */
  updateAgent(
    entityId: EntityId,
    updates: { name?: string }
  ): Promise<AgentEntity>;

  /**
   * Deletes an agent and its associated channel
   */
  deleteAgent(entityId: EntityId): Promise<void>;

  // ----------------------------------------
  // Agent Channel Operations (TB-O7a)
  // ----------------------------------------

  /**
   * Gets the dedicated channel for an agent.
   * Each agent has a channel named `agent-{agentId}` for receiving messages.
   *
   * @param agentId - The entity ID of the agent
   * @returns The agent's channel, or undefined if not found
   */
  getAgentChannel(agentId: EntityId): Promise<Channel | undefined>;

  /**
   * Gets the channel ID for an agent from its metadata.
   * This is faster than getAgentChannel() when you only need the ID.
   *
   * @param agentId - The entity ID of the agent
   * @returns The channel ID, or undefined if the agent has no channel
   */
  getAgentChannelId(agentId: EntityId): Promise<ChannelId | undefined>;
}

// ============================================================================
// Agent Registry Implementation
// ============================================================================

/**
 * Implementation of the Agent Registry service.
 *
 * This implementation uses the QuarryAPI for storage operations,
 * storing agent information as Entity elements with specialized metadata.
 */
export class AgentRegistryImpl implements AgentRegistry {
  private readonly api: QuarryAPI;

  constructor(api: QuarryAPI) {
    this.api = api;
  }

  // ----------------------------------------
  // Agent Registration
  // ----------------------------------------

  async registerAgent(input: RegisterAgentInput): Promise<AgentEntity> {
    switch (input.role) {
      case 'director':
        return this.registerDirector(input);
      case 'worker':
        return this.registerWorker(input);
      case 'steward':
        return this.registerSteward(input);
      default:
        throw new Error(`Unknown agent role: ${(input as { role: string }).role}`);
    }
  }

  async registerDirector(input: RegisterDirectorInput): Promise<AgentEntity> {
    const existing = await this.getAgentByName(input.name);
    if (existing) {
      throw duplicateName(input.name, 'agent', { existingId: existing.id });
    }

    const agentMetadata: DirectorMetadata = {
      agentRole: 'director',
      sessionStatus: 'idle',
      maxConcurrentTasks: input.maxConcurrentTasks,
      roleDefinitionRef: input.roleDefinitionRef,
      provider: input.provider,
      model: input.model,
    };

    const entity = await createEntity({
      name: input.name,
      entityType: EntityTypeValue.AGENT,
      createdBy: input.createdBy,
      tags: input.tags,
      metadata: { [AGENT_META_KEY]: agentMetadata },
    });

    return this.registerAgentWithRollback(
      entity as unknown as Record<string, unknown> & { createdBy: EntityId },
      input.name,
      input.createdBy
    );
  }

  async registerWorker(input: RegisterWorkerInput): Promise<AgentEntity> {
    const existing = await this.getAgentByName(input.name);
    if (existing) {
      throw duplicateName(input.name, 'agent', { existingId: existing.id });
    }

    const agentMetadata: WorkerMetadata = {
      agentRole: 'worker',
      workerMode: input.workerMode,
      sessionStatus: 'idle',
      maxConcurrentTasks: input.maxConcurrentTasks,
      roleDefinitionRef: input.roleDefinitionRef,
      provider: input.provider,
      model: input.model,
    };

    const entity = await createEntity({
      name: input.name,
      entityType: EntityTypeValue.AGENT,
      createdBy: input.createdBy,
      tags: input.tags,
      metadata: { [AGENT_META_KEY]: agentMetadata },
      reportsTo: input.reportsTo,
    });

    return this.registerAgentWithRollback(
      entity as unknown as Record<string, unknown> & { createdBy: EntityId },
      input.name,
      input.createdBy
    );
  }

  async registerSteward(input: RegisterStewardInput): Promise<AgentEntity> {
    const existing = await this.getAgentByName(input.name);
    if (existing) {
      throw duplicateName(input.name, 'agent', { existingId: existing.id });
    }

    const agentMetadata: StewardMetadata = {
      agentRole: 'steward',
      stewardFocus: input.stewardFocus,
      triggers: input.triggers,
      sessionStatus: 'idle',
      maxConcurrentTasks: input.maxConcurrentTasks,
      roleDefinitionRef: input.roleDefinitionRef,
      provider: input.provider,
      model: input.model,
    };

    const entity = await createEntity({
      name: input.name,
      entityType: EntityTypeValue.AGENT,
      createdBy: input.createdBy,
      tags: input.tags,
      metadata: { [AGENT_META_KEY]: agentMetadata },
      reportsTo: input.reportsTo,
    });

    return this.registerAgentWithRollback(
      entity as unknown as Record<string, unknown> & { createdBy: EntityId },
      input.name,
      input.createdBy
    );
  }

  // ----------------------------------------
  // Agent Queries
  // ----------------------------------------

  async getAgent(entityId: EntityId): Promise<AgentEntity | undefined> {
    // Cast EntityId to ElementId - they are both branded string types
    const entity = await this.api.get(asElementId(entityId));
    if (!entity || entity.type !== 'entity' || !isAgentEntity(entity as Entity)) {
      return undefined;
    }
    return entity as AgentEntity;
  }

  async getAgentByName(name: string): Promise<AgentEntity | undefined> {
    const entity = await this.api.lookupEntityByName(name);
    if (!entity || !isAgentEntity(entity as Entity)) {
      return undefined;
    }
    return entity as AgentEntity;
  }

  async listAgents(filter?: AgentFilter): Promise<AgentEntity[]> {
    // Get all entities
    const entities = await this.api.list({ type: 'entity' });

    // Filter to only agent-type entities with valid agent metadata
    let agents = (entities as Entity[]).filter((e): e is AgentEntity =>
      e.entityType === EntityTypeValue.AGENT && isAgentEntity(e)
    );

    // Apply additional filters
    if (filter) {
      agents = this.applyFilters(agents, filter);
    }

    return agents;
  }

  async getAgentsByRole(role: AgentRole): Promise<AgentEntity[]> {
    return this.listAgents({ role });
  }

  async getAvailableWorkers(): Promise<AgentEntity[]> {
    const workers = await this.listAgents({ role: 'worker' });
    return workers.filter((w) => {
      const meta = getAgentMetadata(w);
      const status = meta?.sessionStatus;
      // Consider idle or undefined (never started) as available
      return status === 'idle' || status === undefined;
    });
  }

  async getStewards(): Promise<AgentEntity[]> {
    return this.listAgents({ role: 'steward' });
  }

  async getDirector(): Promise<AgentEntity | undefined> {
    const directors = await this.listAgents({ role: 'director' });
    return directors[0];
  }

  // ----------------------------------------
  // Agent Session Management
  // ----------------------------------------

  async updateAgentSession(
    entityId: EntityId,
    sessionId: string | undefined,
    status: 'idle' | 'running' | 'suspended' | 'terminated'
  ): Promise<AgentEntity> {
    const agent = await this.getAgent(entityId);
    if (!agent) {
      throw new Error(`Agent not found: ${entityId}`);
    }

    const currentMeta = getAgentMetadata(agent);
    if (!currentMeta) {
      throw new Error(`Entity is not an agent: ${entityId}`);
    }

    const updatedAgentMeta: AgentMetadata = {
      ...currentMeta,
      sessionId,
      sessionStatus: status,
      lastActivityAt: createTimestamp(),
    } as AgentMetadata;

    // Cast EntityId to ElementId for update
    const updated = await this.api.update(asElementId(entityId), {
      metadata: { ...agent.metadata, [AGENT_META_KEY]: updatedAgentMeta },
    });

    return updated as AgentEntity;
  }

  async updateAgentMetadata(
    entityId: EntityId,
    updates: Partial<AgentMetadata>
  ): Promise<AgentEntity> {
    const agent = await this.getAgent(entityId);
    if (!agent) {
      throw new Error(`Agent not found: ${entityId}`);
    }

    const currentMeta = getAgentMetadata(agent);
    if (!currentMeta) {
      throw new Error(`Entity is not an agent: ${entityId}`);
    }

    const updatedAgentMeta: AgentMetadata = {
      ...currentMeta,
      ...updates,
    } as AgentMetadata;

    // Cast EntityId to ElementId for update
    const updated = await this.api.update(asElementId(entityId), {
      metadata: { ...agent.metadata, [AGENT_META_KEY]: updatedAgentMeta },
    });

    return updated as AgentEntity;
  }

  async updateAgent(
    entityId: EntityId,
    updates: { name?: string }
  ): Promise<AgentEntity> {
    const agent = await this.getAgent(entityId);
    if (!agent) {
      throw new Error(`Agent not found: ${entityId}`);
    }

    // Build update object with only provided fields
    const updateData: { name?: string } = {};
    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }

    // Cast EntityId to ElementId for update, explicitly type as Entity
    const updated = await this.api.update<Entity>(asElementId(entityId), updateData as Partial<Entity>);

    return updated as AgentEntity;
  }

  async deleteAgent(entityId: EntityId): Promise<void> {
    const agent = await this.getAgent(entityId);
    if (!agent) {
      throw new Error(`Agent not found: ${entityId}`);
    }

    // Get the agent's channel ID from metadata
    const meta = getAgentMetadata(agent);
    const channelId = meta?.channelId;

    // Delete the agent's channel if it exists
    if (channelId) {
      try {
        await this.api.delete(asElementId(channelId));
      } catch {
        // Best-effort channel deletion - continue even if it fails
      }
    }

    // Delete the agent entity
    await this.api.delete(asElementId(entityId));
  }

  // ----------------------------------------
  // Agent Channel Operations (TB-O7a)
  // ----------------------------------------

  async getAgentChannel(agentId: EntityId): Promise<Channel | undefined> {
    // First try to get the channel ID from the agent's metadata (fast path)
    const channelId = await this.getAgentChannelId(agentId);
    if (channelId) {
      const channel = await this.api.get(asElementId(channelId));
      if (channel && channel.type === 'channel') {
        return channel as Channel;
      }
    }

    // Fallback: look up agent to get createdBy, then search for the direct channel
    const agent = await this.getAgent(agentId);
    if (!agent) {
      return undefined;
    }

    // Direct channel name is based on sorted entity IDs
    const channelName = generateDirectChannelName(agent.createdBy, agentId);
    const channels = await this.api.searchChannels(channelName, {
      channelType: 'direct',
    });

    // Find exact match (searchChannels does pattern matching)
    const agentChannel = channels.find((c) => c.name === channelName);
    return agentChannel;
  }

  async getAgentChannelId(agentId: EntityId): Promise<ChannelId | undefined> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      return undefined;
    }

    const meta = getAgentMetadata(agent);
    return meta?.channelId;
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  /**
   * Creates an agent entity, its channel, and links them via metadata.
   * Rolls back on partial failure to prevent orphaned resources.
   */
  private async registerAgentWithRollback(
    entityData: Record<string, unknown> & { createdBy: EntityId },
    agentName: string,
    createdBy: EntityId
  ): Promise<AgentEntity> {
    const saved = await this.api.create(entityData);
    const agentEntity = saved as AgentEntity;
    const agentEntityId = asEntityId(agentEntity.id);

    let channel: Channel;
    try {
      channel = await this.createAgentChannel(agentName, agentEntityId, createdBy);
    } catch (channelError) {
      try { await this.api.delete(agentEntity.id); } catch { /* best-effort rollback */ }
      throw channelError;
    }

    try {
      return await this.updateAgentMetadata(agentEntityId, {
        channelId: channel.id,
      } as Partial<AgentMetadata>);
    } catch (metadataError) {
      try { await this.api.delete(channel.id); } catch { /* best-effort */ }
      try { await this.api.delete(agentEntity.id); } catch { /* best-effort */ }
      throw metadataError;
    }
  }

  /**
   * Creates a dedicated channel for an agent and updates the agent's metadata
   * with the channel ID.
   *
   * @param agentName - The name of the agent (used for channel naming)
   * @param agentId - The ID of the agent entity (used for membership)
   * @param createdBy - The entity that created the agent (will be a channel member)
   * @returns The created channel
   */
  private async createAgentChannel(agentName: string, agentId: EntityId, createdBy: EntityId): Promise<Channel> {
    // Look up the creator entity name for the channel display name
    const creatorEntity = await this.api.get(asElementId(createdBy));
    const creatorName = (creatorEntity as { name?: string } | null)?.name ?? 'operator';

    // Create a direct channel between the agent and the operator
    const channel = await createDirectChannel({
      entityA: createdBy,  // Operator (el-0000)
      entityB: agentId,    // The new agent
      entityAName: creatorName,
      entityBName: agentName,
      createdBy: createdBy,
      tags: ['agent-channel'],
      metadata: {
        agentId,
        agentName,
        purpose: 'Agent direct messaging channel',
      },
    });

    // Save the channel
    const savedChannel = await this.api.create<Channel>(
      channel as unknown as Record<string, unknown> & { createdBy: EntityId }
    );

    return savedChannel;
  }

  private applyFilters(agents: AgentEntity[], filter: AgentFilter): AgentEntity[] {
    let result = agents;

    if (filter.role !== undefined) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        return meta?.agentRole === filter.role;
      });
    }

    if (filter.workerMode !== undefined) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        return (
          meta?.agentRole === 'worker' &&
          (meta as WorkerMetadata).workerMode === filter.workerMode
        );
      });
    }

    if (filter.stewardFocus !== undefined) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        return (
          meta?.agentRole === 'steward' &&
          (meta as StewardMetadata).stewardFocus === filter.stewardFocus
        );
      });
    }

    if (filter.sessionStatus !== undefined) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        return meta?.sessionStatus === filter.sessionStatus;
      });
    }

    if (filter.reportsTo !== undefined) {
      result = result.filter((a) => a.reportsTo === filter.reportsTo);
    }

    if (filter.hasSession !== undefined) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        return (meta?.sessionId !== undefined) === filter.hasSession;
      });
    }

    return result;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates an AgentRegistry instance
 */
export function createAgentRegistry(api: QuarryAPI): AgentRegistry {
  return new AgentRegistryImpl(api);
}
