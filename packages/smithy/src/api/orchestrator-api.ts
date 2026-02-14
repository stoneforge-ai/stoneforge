/**
 * Orchestrator API Implementation
 *
 * This module provides the OrchestratorAPI class that extends QuarryAPI
 * with orchestration-specific functionality for managing AI agents, their
 * sessions, and task assignments.
 *
 * The OrchestratorAPI wraps an existing QuarryAPI instance and adds:
 * - Agent registration and management
 * - Session tracking
 * - Orchestrator-specific task metadata
 */

import type { StorageBackend } from '@stoneforge/storage';
import {
  type Entity,
  type EntityId,
  type Task,
  type Channel,
  type ChannelId,
  type ElementId,
  ElementType,
  EntityTypeValue,
  createEntity,
  createDirectChannel,
  createTimestamp,
} from '@stoneforge/core';
import {
  type QuarryAPI,
  QuarryAPIImpl,
} from '@stoneforge/quarry';
import type {
  AgentRole,
  WorkerMetadata,
  StewardMetadata,
  DirectorMetadata,
  AgentMetadata,
  RegisterDirectorInput,
  RegisterWorkerInput,
  RegisterStewardInput,
  AgentFilter,
  OrchestratorTaskMeta,
} from '../types/index.js';
import {
  validateAgentMetadata,
  getOrchestratorTaskMeta,
  setOrchestratorTaskMeta,
  updateOrchestratorTaskMeta,
  generateBranchName,
  generateWorktreePath,
  createSlugFromTitle,
} from '../types/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Key used to store agent metadata in Entity.metadata
 */
const AGENT_META_KEY = 'agent';

/**
 * Generates a unique channel name for an agent based on agent name
 * Channel names follow the pattern: agent-{agentName}
 */
function generateAgentChannelName(agentName: string): string {
  return `agent-${agentName}`;
}

// ============================================================================
// Agent Entity Type (Entity with Agent Metadata)
// ============================================================================

/**
 * An Entity that represents an agent with orchestrator metadata.
 * The agent-specific metadata is stored under `entity.metadata.agent`
 */
export interface AgentEntity extends Entity {
  metadata: {
    agent: AgentMetadata;
    [key: string]: unknown;
  };
}

/**
 * Type guard to check if an entity is an agent entity
 */
export function isAgentEntity(entity: Entity): entity is AgentEntity {
  if (!entity.metadata || typeof entity.metadata !== 'object') {
    return false;
  }
  const agentMeta = (entity.metadata as Record<string, unknown>)[AGENT_META_KEY];
  return agentMeta !== undefined && validateAgentMetadata(agentMeta);
}

/**
 * Gets the agent metadata from an entity
 */
export function getAgentMetadata(entity: Entity): AgentMetadata | undefined {
  if (!entity.metadata || typeof entity.metadata !== 'object') {
    return undefined;
  }
  const agentMeta = (entity.metadata as Record<string, unknown>)[AGENT_META_KEY];
  if (validateAgentMetadata(agentMeta)) {
    return agentMeta as AgentMetadata;
  }
  return undefined;
}

// ============================================================================
// OrchestratorAPI Interface
// ============================================================================

/**
 * Extended API interface for orchestration operations
 */
export interface OrchestratorAPI extends QuarryAPI {
  // ----------------------------------------
  // Agent Registration
  // ----------------------------------------

  /**
   * Registers a Director agent
   */
  registerDirector(input: RegisterDirectorInput): Promise<AgentEntity>;

  /**
   * Registers a Worker agent
   */
  registerWorker(input: RegisterWorkerInput): Promise<AgentEntity>;

  /**
   * Registers a Steward agent
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
   * Gets available workers (idle or running but accepting tasks)
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
   * Gets the agent's channel for receiving messages
   */
  getAgentChannel(entityId: EntityId): Promise<ChannelId | undefined>;

  // ----------------------------------------
  // Orchestrator Task Metadata
  // ----------------------------------------

  /**
   * Sets orchestrator metadata on a task
   */
  setTaskOrchestratorMeta(
    taskId: ElementId,
    meta: OrchestratorTaskMeta
  ): Promise<Task>;

  /**
   * Updates orchestrator metadata on a task
   */
  updateTaskOrchestratorMeta(
    taskId: ElementId,
    updates: Partial<OrchestratorTaskMeta>
  ): Promise<Task>;

  /**
   * Gets orchestrator metadata from a task
   */
  getTaskOrchestratorMeta(taskId: ElementId): Promise<OrchestratorTaskMeta | undefined>;

  /**
   * Assigns a task to an agent (sets orchestrator metadata)
   */
  assignTaskToAgent(
    taskId: ElementId,
    agentId: EntityId,
    options?: {
      branch?: string;
      worktree?: string;
      sessionId?: string;
      markAsStarted?: boolean;
    }
  ): Promise<Task>;
}

// ============================================================================
// OrchestratorAPI Implementation
// ============================================================================

/**
 * OrchestratorAPI implementation that extends QuarryAPIImpl
 */
export class OrchestratorAPIImpl extends QuarryAPIImpl implements OrchestratorAPI {
  constructor(backend: StorageBackend) {
    super(backend);
  }

  // ----------------------------------------
  // Agent Registration
  // ----------------------------------------

  async registerDirector(input: RegisterDirectorInput): Promise<AgentEntity> {
    const agentMetadata: DirectorMetadata = {
      agentRole: 'director',
      sessionStatus: 'idle',
      maxConcurrentTasks: input.maxConcurrentTasks,
      roleDefinitionRef: input.roleDefinitionRef,
    };

    // Create the entity with agent metadata nested under the agent key
    const entity = await createEntity({
      name: input.name,
      entityType: EntityTypeValue.AGENT,
      createdBy: input.createdBy,
      tags: input.tags,
      metadata: { [AGENT_META_KEY]: agentMetadata },
    });

    // Save the entity using the generic create method
    // Cast the entity to satisfy the create method's signature
    const saved = await this.create<Entity>(entity as unknown as Record<string, unknown> & { type: typeof ElementType.ENTITY; createdBy: EntityId });
    const agentEntity = saved as AgentEntity;
    const agentEntityId = agentEntity.id as unknown as EntityId;

    // Create dedicated channel for the agent
    const channel = await this.createAgentChannel(input.name, agentEntityId, input.createdBy);

    // Update agent metadata with channel ID
    const updatedAgent = await this.updateAgentMetadata(agentEntityId, {
      channelId: channel.id as unknown as ChannelId,
    });

    return updatedAgent;
  }

  async registerWorker(input: RegisterWorkerInput): Promise<AgentEntity> {
    const agentMetadata: WorkerMetadata = {
      agentRole: 'worker',
      workerMode: input.workerMode,
      sessionStatus: 'idle',
      maxConcurrentTasks: input.maxConcurrentTasks,
      roleDefinitionRef: input.roleDefinitionRef,
    };

    // Create the entity with agent metadata nested under the agent key
    const entity = await createEntity({
      name: input.name,
      entityType: EntityTypeValue.AGENT,
      createdBy: input.createdBy,
      tags: input.tags,
      metadata: { [AGENT_META_KEY]: agentMetadata },
      reportsTo: input.reportsTo,
    });

    // Save the entity using the generic create method
    const saved = await this.create<Entity>(entity as unknown as Record<string, unknown> & { type: typeof ElementType.ENTITY; createdBy: EntityId });
    const agentEntity = saved as AgentEntity;
    const agentEntityId = agentEntity.id as unknown as EntityId;

    // Create dedicated channel for the agent
    const channel = await this.createAgentChannel(input.name, agentEntityId, input.createdBy);

    // Update agent metadata with channel ID
    const updatedAgent = await this.updateAgentMetadata(agentEntityId, {
      channelId: channel.id as unknown as ChannelId,
    });

    return updatedAgent;
  }

  async registerSteward(input: RegisterStewardInput): Promise<AgentEntity> {
    const agentMetadata: StewardMetadata = {
      agentRole: 'steward',
      stewardFocus: input.stewardFocus,
      triggers: input.triggers,
      sessionStatus: 'idle',
      maxConcurrentTasks: input.maxConcurrentTasks,
      roleDefinitionRef: input.roleDefinitionRef,
    };

    // Create the entity with agent metadata nested under the agent key
    const entity = await createEntity({
      name: input.name,
      entityType: EntityTypeValue.AGENT,
      createdBy: input.createdBy,
      tags: input.tags,
      metadata: { [AGENT_META_KEY]: agentMetadata },
      reportsTo: input.reportsTo,
    });

    // Save the entity using the generic create method
    const saved = await this.create<Entity>(entity as unknown as Record<string, unknown> & { type: typeof ElementType.ENTITY; createdBy: EntityId });
    const agentEntity = saved as AgentEntity;
    const agentEntityId = agentEntity.id as unknown as EntityId;

    // Create dedicated channel for the agent
    const channel = await this.createAgentChannel(input.name, agentEntityId, input.createdBy);

    // Update agent metadata with channel ID
    const updatedAgent = await this.updateAgentMetadata(agentEntityId, {
      channelId: channel.id as unknown as ChannelId,
    });

    return updatedAgent;
  }

  // ----------------------------------------
  // Agent Queries
  // ----------------------------------------

  async getAgent(entityId: EntityId): Promise<AgentEntity | undefined> {
    // Cast EntityId to ElementId - they are both branded string types
    const entity = await this.get<Entity>(entityId as unknown as ElementId);
    if (!entity || !isAgentEntity(entity)) {
      return undefined;
    }
    return entity;
  }

  async getAgentByName(name: string): Promise<AgentEntity | undefined> {
    // Use lookupEntityByName from the parent class
    const entity = await this.lookupEntityByName(name) as Entity | null;
    if (!entity || !isAgentEntity(entity)) {
      return undefined;
    }
    return entity;
  }

  async listAgents(filter?: AgentFilter): Promise<AgentEntity[]> {
    // Get all agent-type entities
    const entities = await this.list<Entity>({ type: ElementType.ENTITY });

    // Filter to only those with valid agent metadata and entityType 'agent'
    let agents = entities.filter((e): e is AgentEntity =>
      e.entityType === EntityTypeValue.AGENT && isAgentEntity(e)
    );

    // Apply additional filters
    if (filter) {
      if (filter.role !== undefined) {
        agents = agents.filter((a) => {
          const meta = getAgentMetadata(a);
          return meta?.agentRole === filter.role;
        });
      }
      if (filter.workerMode !== undefined) {
        agents = agents.filter((a) => {
          const meta = getAgentMetadata(a);
          return meta?.agentRole === 'worker' && (meta as WorkerMetadata).workerMode === filter.workerMode;
        });
      }
      if (filter.stewardFocus !== undefined) {
        agents = agents.filter((a) => {
          const meta = getAgentMetadata(a);
          return meta?.agentRole === 'steward' && (meta as StewardMetadata).stewardFocus === filter.stewardFocus;
        });
      }
      if (filter.sessionStatus !== undefined) {
        agents = agents.filter((a) => {
          const meta = getAgentMetadata(a);
          return meta?.sessionStatus === filter.sessionStatus;
        });
      }
      if (filter.reportsTo !== undefined) {
        agents = agents.filter((a) => a.reportsTo === filter.reportsTo);
      }
      if (filter.hasSession !== undefined) {
        agents = agents.filter((a) => {
          const meta = getAgentMetadata(a);
          return (meta?.sessionId !== undefined) === filter.hasSession;
        });
      }
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

    const updated = await this.update<Entity>(entityId as unknown as ElementId, {
      metadata: { ...agent.metadata, [AGENT_META_KEY]: updatedAgentMeta },
    });

    return updated as AgentEntity;
  }

  async getAgentChannel(entityId: EntityId): Promise<ChannelId | undefined> {
    const agent = await this.getAgent(entityId);
    if (!agent) {
      return undefined;
    }
    const meta = getAgentMetadata(agent);
    return meta?.channelId;
  }

  // ----------------------------------------
  // Orchestrator Task Metadata
  // ----------------------------------------

  async setTaskOrchestratorMeta(
    taskId: ElementId,
    meta: OrchestratorTaskMeta
  ): Promise<Task> {
    const task = await this.get<Task>(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const newMetadata = setOrchestratorTaskMeta(
      task.metadata as Record<string, unknown> | undefined,
      meta
    );

    return this.update<Task>(taskId, { metadata: newMetadata });
  }

  async updateTaskOrchestratorMeta(
    taskId: ElementId,
    updates: Partial<OrchestratorTaskMeta>
  ): Promise<Task> {
    const task = await this.get<Task>(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const newMetadata = updateOrchestratorTaskMeta(
      task.metadata as Record<string, unknown> | undefined,
      updates
    );

    return this.update<Task>(taskId, { metadata: newMetadata });
  }

  async getTaskOrchestratorMeta(taskId: ElementId): Promise<OrchestratorTaskMeta | undefined> {
    const task = await this.get<Task>(taskId);
    if (!task) {
      return undefined;
    }
    return getOrchestratorTaskMeta(task.metadata as Record<string, unknown> | undefined);
  }

  async assignTaskToAgent(
    taskId: ElementId,
    agentId: EntityId,
    options?: {
      branch?: string;
      worktree?: string;
      sessionId?: string;
      markAsStarted?: boolean;
    }
  ): Promise<Task> {
    const task = await this.get<Task>(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Generate branch and worktree names if not provided
    const slug = createSlugFromTitle(task.title);
    const branch = options?.branch ?? generateBranchName(agent.name, taskId, slug);
    const worktree = options?.worktree ?? generateWorktreePath(agent.name, slug);

    // Update task with assignee (and status if markAsStarted)
    const updates: Partial<Task> = { assignee: agentId };
    if (options?.markAsStarted) {
      updates.status = 'in_progress';
    }
    await this.update<Task>(taskId, updates);

    // Set orchestrator metadata
    return this.setTaskOrchestratorMeta(taskId, {
      assignedAgent: agentId,
      branch,
      worktree,
      sessionId: options?.sessionId,
      startedAt: createTimestamp(),
    });
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  /**
   * Creates a dedicated channel for an agent
   *
   * @param agentName - The name of the agent (used for channel naming)
   * @param agentId - The ID of the agent entity (used for membership)
   * @param createdBy - The entity that created the agent (will be a channel member)
   * @returns The created channel
   */
  private async createAgentChannel(agentName: string, agentId: EntityId, createdBy: EntityId): Promise<Channel> {
    // Look up the creator entity name for the channel display name
    const creatorEntity = await this.get(createdBy as unknown as ElementId);
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
    const savedChannel = await this.create<Channel>(
      channel as unknown as Record<string, unknown> & { type: 'channel'; createdBy: EntityId }
    );

    return savedChannel;
  }

  /**
   * Updates an agent's metadata
   */
  private async updateAgentMetadata(
    agentId: EntityId,
    updates: Partial<AgentMetadata>
  ): Promise<AgentEntity> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const currentMeta = getAgentMetadata(agent) ?? {};
    const updatedMeta = { ...currentMeta, ...updates };

    const updated = await this.update<Entity>(
      agentId as unknown as ElementId,
      { metadata: { ...agent.metadata, [AGENT_META_KEY]: updatedMeta } }
    );

    return updated as AgentEntity;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates an OrchestratorAPI instance
 */
export function createOrchestratorAPI(backend: StorageBackend): OrchestratorAPI {
  return new OrchestratorAPIImpl(backend);
}
