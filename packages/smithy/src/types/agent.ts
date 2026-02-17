/**
 * Agent Types - Role definitions for AI agents in the orchestration system
 *
 * This module defines the core types for agents in the Stoneforge Smithy:
 * - AgentRole: The primary role classification (director, steward, worker)
 * - WorkerMode: Whether a worker is ephemeral (short-lived) or persistent
 * - StewardFocus: The specialty area for steward agents (merge, docs)
 * - StewardTrigger: How stewards are activated (cron or event)
 *
 * Agents are stored as Entity elements with additional metadata in their
 * `metadata` field to track orchestrator-specific properties.
 */

import type { EntityId, ChannelId, Timestamp, ElementId } from '@stoneforge/core';

// ============================================================================
// Agent Role Types
// ============================================================================

/**
 * The primary role classification for agents in the orchestration system.
 *
 * - `director`: Strategic agent that creates and assigns tasks, reports to Human
 * - `steward`: Support agent that performs maintenance tasks (merge, docs)
 * - `worker`: Execution agent that produces code and completes tasks
 */
export type AgentRole = 'director' | 'steward' | 'worker';

/**
 * All valid agent role values
 */
export const AgentRoleValues = ['director', 'steward', 'worker'] as const;

/**
 * Type guard to check if a value is a valid AgentRole
 */
export function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === 'string' && AgentRoleValues.includes(value as AgentRole);
}

// ============================================================================
// Worker Mode Types
// ============================================================================

/**
 * The lifecycle mode for worker agents.
 *
 * - `ephemeral`: Short-lived workers spawned per task, reports to Director
 * - `persistent`: Long-lived workers that can handle multiple tasks, reports to Human
 */
export type WorkerMode = 'ephemeral' | 'persistent';

/**
 * All valid worker mode values
 */
export const WorkerModeValues = ['ephemeral', 'persistent'] as const;

/**
 * Type guard to check if a value is a valid WorkerMode
 */
export function isWorkerMode(value: unknown): value is WorkerMode {
  return typeof value === 'string' && WorkerModeValues.includes(value as WorkerMode);
}

// ============================================================================
// Steward Focus Types
// ============================================================================

/**
 * The specialty area for steward agents.
 *
 * - `merge`: Handles merging completed branches, running tests, cleanup
 * - `docs`: Scans and fixes documentation issues, auto-merges fixes
 * - `custom`: User-defined steward with a custom playbook and trigger configuration
 */
export type StewardFocus = 'merge' | 'docs' | 'custom';

/**
 * All valid steward focus values
 */
export const StewardFocusValues = ['merge', 'docs', 'custom'] as const;

/**
 * Type guard to check if a value is a valid StewardFocus
 */
export function isStewardFocus(value: unknown): value is StewardFocus {
  return typeof value === 'string' && StewardFocusValues.includes(value as StewardFocus);
}

// ============================================================================
// Steward Trigger Types
// ============================================================================

/**
 * Cron-based trigger for stewards - activates on a schedule
 */
export interface CronTrigger {
  /** Trigger type discriminator */
  readonly type: 'cron';
  /** Cron expression (e.g., "0 2 * * *" for 2 AM daily) */
  readonly schedule: string;
}

/**
 * Event-based trigger for stewards - activates when matching events occur
 */
export interface EventTrigger {
  /** Trigger type discriminator */
  readonly type: 'event';
  /** Event name to listen for (e.g., "task_completed", "branch_ready") */
  readonly event: string;
  /** Optional JavaScript-like condition expression */
  readonly condition?: string;
}

/**
 * Steward trigger - either cron-based or event-based
 */
export type StewardTrigger = CronTrigger | EventTrigger;

/**
 * Type guard to check if a trigger is a CronTrigger
 */
export function isCronTrigger(trigger: StewardTrigger): trigger is CronTrigger {
  return trigger.type === 'cron';
}

/**
 * Type guard to check if a trigger is an EventTrigger
 */
export function isEventTrigger(trigger: StewardTrigger): trigger is EventTrigger {
  return trigger.type === 'event';
}

/**
 * Type guard to check if a value is a valid StewardTrigger
 */
export function isStewardTrigger(value: unknown): value is StewardTrigger {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (obj.type === 'cron') {
    return typeof obj.schedule === 'string';
  }
  if (obj.type === 'event') {
    return typeof obj.event === 'string' && (obj.condition === undefined || typeof obj.condition === 'string');
  }
  return false;
}

// ============================================================================
// Agent Metadata Types
// ============================================================================

/**
 * Base metadata shared by all agent types
 */
export interface BaseAgentMetadata {
  /** The agent's role in the orchestration system */
  readonly agentRole: AgentRole;
  /** Direct channel ID for receiving messages */
  readonly channelId?: ChannelId;
  /** Provider session ID for resumption */
  readonly sessionId?: string;
  /** Path to the agent's worktree (for workers) */
  readonly worktree?: string;
  /** Current session status */
  readonly sessionStatus?: 'idle' | 'running' | 'suspended' | 'terminated';
  /** Timestamp of last activity */
  readonly lastActivityAt?: Timestamp;
  /**
   * Maximum number of tasks this agent can work on concurrently.
   * Default is 1 for most agents.
   */
  readonly maxConcurrentTasks?: number;
  /**
   * Reference to the role definition Document that defines this agent's
   * system prompt and behavioral configuration. If not set, the agent
   * uses default behavior.
   */
  readonly roleDefinitionRef?: ElementId;
  /** Agent provider name (e.g., 'claude', 'opencode'). Defaults to 'claude'. */
  readonly provider?: string;
  /** Model identifier to use (e.g., 'claude-sonnet-4-20250514'). If not set, uses provider default. */
  readonly model?: string;
}

/**
 * Director-specific metadata
 */
export interface DirectorMetadata extends BaseAgentMetadata {
  readonly agentRole: 'director';
}

/**
 * Worker-specific metadata
 */
export interface WorkerMetadata extends BaseAgentMetadata {
  readonly agentRole: 'worker';
  /** Whether this is an ephemeral or persistent worker */
  readonly workerMode: WorkerMode;
  /** Current branch the worker is working on */
  readonly branch?: string;
}

/**
 * Steward-specific metadata
 */
export interface StewardMetadata extends BaseAgentMetadata {
  readonly agentRole: 'steward';
  /** The steward's specialty area */
  readonly stewardFocus: StewardFocus;
  /** Triggers that activate this steward */
  readonly triggers?: StewardTrigger[];
  /**
   * Custom playbook content (markdown/plain text) for 'custom' stewards.
   * Describes what the steward should do when triggered.
   * Only used when stewardFocus is 'custom'.
   */
  readonly playbook?: string;
  /** Timestamp of last execution */
  readonly lastExecutedAt?: Timestamp;
  /** Timestamp of next scheduled execution (for cron triggers) */
  readonly nextScheduledAt?: Timestamp;
}

/**
 * Union type for all agent metadata types
 */
export type AgentMetadata = DirectorMetadata | WorkerMetadata | StewardMetadata;

/**
 * Type guard to check if metadata is DirectorMetadata
 */
export function isDirectorMetadata(metadata: AgentMetadata): metadata is DirectorMetadata {
  return metadata.agentRole === 'director';
}

/**
 * Type guard to check if metadata is WorkerMetadata
 */
export function isWorkerMetadata(metadata: AgentMetadata): metadata is WorkerMetadata {
  return metadata.agentRole === 'worker';
}

/**
 * Type guard to check if metadata is StewardMetadata
 */
export function isStewardMetadata(metadata: AgentMetadata): metadata is StewardMetadata {
  return metadata.agentRole === 'steward';
}

// ============================================================================
// Agent Registration Input Types
// ============================================================================

/**
 * Input for registering a Director agent
 */
export interface RegisterDirectorInput {
  /** Agent name (must be unique) */
  readonly name: string;
  /** Optional tags for the agent entity */
  readonly tags?: string[];
  /** Entity ID of the creator (usually a human) */
  readonly createdBy: EntityId;
  /** Maximum concurrent tasks (default: 1) */
  readonly maxConcurrentTasks?: number;
  /** Optional reference to a role definition for system prompt and behaviors */
  readonly roleDefinitionRef?: ElementId;
  /** Agent provider (e.g., 'claude', 'opencode'). Defaults to 'claude'. */
  readonly provider?: string;
  /** Model identifier to use (e.g., 'claude-sonnet-4-20250514'). If not set, uses provider default. */
  readonly model?: string;
}

/**
 * Input for registering a Worker agent
 */
export interface RegisterWorkerInput {
  /** Agent name (must be unique) */
  readonly name: string;
  /** Whether this is an ephemeral or persistent worker */
  readonly workerMode: WorkerMode;
  /** Optional tags for the agent entity */
  readonly tags?: string[];
  /** Entity ID of the creator */
  readonly createdBy: EntityId;
  /** Optional manager entity (Director for ephemeral, Human for persistent) */
  readonly reportsTo?: EntityId;
  /** Maximum concurrent tasks (default: 1) */
  readonly maxConcurrentTasks?: number;
  /** Optional reference to a role definition for system prompt and behaviors */
  readonly roleDefinitionRef?: ElementId;
  /** Agent provider (e.g., 'claude', 'opencode'). Defaults to 'claude'. */
  readonly provider?: string;
  /** Model identifier to use (e.g., 'claude-sonnet-4-20250514'). If not set, uses provider default. */
  readonly model?: string;
}

/**
 * Input for registering a Steward agent
 */
export interface RegisterStewardInput {
  /** Agent name (must be unique) */
  readonly name: string;
  /** The steward's specialty area */
  readonly stewardFocus: StewardFocus;
  /** Triggers that activate this steward */
  readonly triggers?: StewardTrigger[];
  /**
   * Custom playbook content (markdown/plain text) for 'custom' stewards.
   * Describes what the steward should do when triggered.
   */
  readonly playbook?: string;
  /** Optional tags for the agent entity */
  readonly tags?: string[];
  /** Entity ID of the creator */
  readonly createdBy: EntityId;
  /** Optional manager entity (usually the Director) */
  readonly reportsTo?: EntityId;
  /** Maximum concurrent tasks (default: 1) */
  readonly maxConcurrentTasks?: number;
  /** Optional reference to a role definition for system prompt and behaviors */
  readonly roleDefinitionRef?: ElementId;
  /** Agent provider (e.g., 'claude', 'opencode'). Defaults to 'claude'. */
  readonly provider?: string;
  /** Model identifier to use (e.g., 'claude-sonnet-4-20250514'). If not set, uses provider default. */
  readonly model?: string;
}

// ============================================================================
// Agent Query Types
// ============================================================================

/**
 * Filter options for querying agents
 */
export interface AgentFilter {
  /** Filter by role */
  readonly role?: AgentRole;
  /** Filter by worker mode (only applies when role is 'worker') */
  readonly workerMode?: WorkerMode;
  /** Filter by steward focus (only applies when role is 'steward') */
  readonly stewardFocus?: StewardFocus;
  /** Filter by session status */
  readonly sessionStatus?: 'idle' | 'running' | 'suspended' | 'terminated';
  /** Filter by manager */
  readonly reportsTo?: EntityId;
  /** Include only agents with sessions */
  readonly hasSession?: boolean;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validates agent metadata structure
 */
export function validateAgentMetadata(metadata: unknown): metadata is AgentMetadata {
  if (typeof metadata !== 'object' || metadata === null) {
    return false;
  }

  const obj = metadata as Record<string, unknown>;

  if (!isAgentRole(obj.agentRole)) {
    return false;
  }

  // Validate maxConcurrentTasks if present
  if (obj.maxConcurrentTasks !== undefined && typeof obj.maxConcurrentTasks !== 'number') {
    return false;
  }

  switch (obj.agentRole) {
    case 'director':
      return true;
    case 'worker':
      return isWorkerMode(obj.workerMode);
    case 'steward':
      if (!isStewardFocus(obj.stewardFocus)) {
        return false;
      }
      if (obj.triggers !== undefined) {
        if (!Array.isArray(obj.triggers)) {
          return false;
        }
        return obj.triggers.every(isStewardTrigger);
      }
      return true;
    default:
      return false;
  }
}
