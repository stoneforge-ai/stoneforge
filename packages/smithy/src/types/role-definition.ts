/**
 * Agent Role Definition Types
 *
 * This module defines the types for agent role definitions, which store
 * system prompts and behavioral configurations for agents.
 *
 * Role definitions allow agents to be configured with:
 * - System prompts stored as Documents
 * - Behavioral hooks for startup, task assignment, and stuck scenarios
 *
 * The system prompt is stored as a Document element, allowing versioning
 * and easy editing. The role definition references this document via its ID.
 */

import type { DocumentId, EntityId, Timestamp, ElementId } from '@stoneforge/core';
import type { AgentRole, WorkerMode, StewardFocus } from './agent.js';

// ============================================================================
// Role Definition Types
// ============================================================================

/**
 * Behavioral hooks for agents - scripts or prompts to execute on specific events
 */
export interface AgentBehaviors {
  /**
   * Instruction/prompt fragment appended to the agent's context on startup.
   * This can include workspace-specific context, conventions, or guidelines.
   */
  readonly onStartup?: string;

  /**
   * Instruction/prompt fragment appended when a task is assigned to the agent.
   * Can include task-specific guidelines or workflow requirements.
   */
  readonly onTaskAssigned?: string;

  /**
   * Instruction/prompt fragment appended when the agent appears stuck
   * (detected by monitoring). Can include debugging hints or escalation paths.
   */
  readonly onStuck?: string;

  /**
   * Instruction/prompt fragment appended before the agent creates a handoff.
   * Can include guidelines for context preservation.
   */
  readonly onHandoff?: string;

  /**
   * Instruction/prompt fragment for handling errors or failures.
   */
  readonly onError?: string;
}

/**
 * Base interface for all role definitions
 */
export interface BaseRoleDefinition {
  /**
   * The role type this definition applies to
   */
  readonly role: AgentRole;

  /**
   * Human-readable name for this role definition (e.g., "Default Director", "Frontend Worker")
   */
  readonly name: string;

  /**
   * Optional description of this role definition
   */
  readonly description?: string;

  /**
   * Reference to the Document containing the system prompt for this role.
   * The document should contain the full system prompt text.
   */
  readonly systemPromptRef: DocumentId;

  /**
   * Maximum number of concurrent tasks for agents using this role.
   * Default is 1.
   */
  readonly maxConcurrentTasks?: number;

  /**
   * Behavioral hooks - prompts/instructions for specific events
   */
  readonly behaviors?: AgentBehaviors;

  /**
   * Optional tags for categorization
   */
  readonly tags?: readonly string[];

  /**
   * When this role definition was created
   */
  readonly createdAt: Timestamp;

  /**
   * Who created this role definition
   */
  readonly createdBy: EntityId;

  /**
   * When this role definition was last updated
   */
  readonly updatedAt: Timestamp;
}

/**
 * Director-specific role definition
 */
export interface DirectorRoleDefinition extends BaseRoleDefinition {
  readonly role: 'director';
}

/**
 * Worker-specific role definition
 */
export interface WorkerRoleDefinition extends BaseRoleDefinition {
  readonly role: 'worker';

  /**
   * The worker mode this definition is designed for.
   * If not specified, applies to both ephemeral and persistent workers.
   */
  readonly workerMode?: WorkerMode;
}

/**
 * Steward-specific role definition
 */
export interface StewardRoleDefinition extends BaseRoleDefinition {
  readonly role: 'steward';

  /**
   * The steward focus area this definition is designed for.
   * If not specified, applies to all steward types.
   */
  readonly stewardFocus?: StewardFocus;
}

/**
 * Union type for all role definitions
 */
export type AgentRoleDefinition = DirectorRoleDefinition | WorkerRoleDefinition | StewardRoleDefinition;

// ============================================================================
// Role Definition Input Types
// ============================================================================

/**
 * Input for creating a role definition
 */
export interface CreateRoleDefinitionInput {
  /**
   * The role type this definition applies to
   */
  readonly role: AgentRole;

  /**
   * Human-readable name for this role definition
   */
  readonly name: string;

  /**
   * Optional description
   */
  readonly description?: string;

  /**
   * The system prompt content (will be stored as a Document)
   */
  readonly systemPrompt: string;

  /**
   * Maximum number of concurrent tasks (default: 1)
   */
  readonly maxConcurrentTasks?: number;

  /**
   * Behavioral hooks
   */
  readonly behaviors?: AgentBehaviors;

  /**
   * Optional tags
   */
  readonly tags?: string[];

  /**
   * Who is creating this definition
   */
  readonly createdBy: EntityId;

  /**
   * For workers: the specific worker mode this applies to
   */
  readonly workerMode?: WorkerMode;

  /**
   * For stewards: the specific steward focus this applies to
   */
  readonly stewardFocus?: StewardFocus;
}

/**
 * Input for updating a role definition
 */
export interface UpdateRoleDefinitionInput {
  /**
   * New name
   */
  readonly name?: string;

  /**
   * New description
   */
  readonly description?: string;

  /**
   * New system prompt content (will create new Document version)
   */
  readonly systemPrompt?: string;

  /**
   * Updated max concurrent tasks
   */
  readonly maxConcurrentTasks?: number;

  /**
   * Updated behaviors (merged with existing)
   */
  readonly behaviors?: Partial<AgentBehaviors>;

  /**
   * New tags (replaces existing)
   */
  readonly tags?: string[];
}

// ============================================================================
// Stored Role Definition (with ID)
// ============================================================================

/**
 * A role definition as stored in the database.
 * Role definitions are stored as Documents with JSON content type.
 */
export interface StoredRoleDefinition {
  /**
   * The element ID of the Document storing this role definition
   */
  readonly id: ElementId;

  /**
   * The role definition data
   */
  readonly definition: AgentRoleDefinition;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for AgentBehaviors
 */
export function isAgentBehaviors(value: unknown): value is AgentBehaviors {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;

  // All fields are optional strings
  const optionalStringFields = ['onStartup', 'onTaskAssigned', 'onStuck', 'onHandoff', 'onError'];
  for (const field of optionalStringFields) {
    if (obj[field] !== undefined && typeof obj[field] !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Type guard for DirectorRoleDefinition
 */
export function isDirectorRoleDefinition(value: unknown): value is DirectorRoleDefinition {
  if (!isBaseRoleDefinition(value)) {
    return false;
  }
  return (value as BaseRoleDefinition).role === 'director';
}

/**
 * Type guard for WorkerRoleDefinition
 */
export function isWorkerRoleDefinition(value: unknown): value is WorkerRoleDefinition {
  if (!isBaseRoleDefinition(value)) {
    return false;
  }
  const def = value as WorkerRoleDefinition;
  if (def.role !== 'worker') {
    return false;
  }
  // workerMode is optional, but if present must be valid
  if (def.workerMode !== undefined && def.workerMode !== 'ephemeral' && def.workerMode !== 'persistent') {
    return false;
  }
  return true;
}

/**
 * Type guard for StewardRoleDefinition
 */
export function isStewardRoleDefinition(value: unknown): value is StewardRoleDefinition {
  if (!isBaseRoleDefinition(value)) {
    return false;
  }
  const def = value as StewardRoleDefinition;
  if (def.role !== 'steward') {
    return false;
  }
  // stewardFocus is optional, but if present must be valid
  const validFoci = ['merge', 'docs'];
  if (def.stewardFocus !== undefined && !validFoci.includes(def.stewardFocus)) {
    return false;
  }
  return true;
}

/**
 * Type guard for any AgentRoleDefinition
 */
export function isAgentRoleDefinition(value: unknown): value is AgentRoleDefinition {
  return isDirectorRoleDefinition(value) || isWorkerRoleDefinition(value) || isStewardRoleDefinition(value);
}

/**
 * Type guard for base role definition structure
 */
function isBaseRoleDefinition(value: unknown): value is BaseRoleDefinition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;

  // Required fields
  if (typeof obj.role !== 'string') return false;
  if (typeof obj.name !== 'string') return false;
  if (typeof obj.systemPromptRef !== 'string') return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;

  // Optional fields
  if (obj.maxConcurrentTasks !== undefined && typeof obj.maxConcurrentTasks !== 'number') return false;
  if (obj.description !== undefined && typeof obj.description !== 'string') return false;
  if (obj.behaviors !== undefined && !isAgentBehaviors(obj.behaviors)) return false;
  if (obj.tags !== undefined && !Array.isArray(obj.tags)) return false;

  return true;
}

// ============================================================================
// Role Definition Query Types
// ============================================================================

/**
 * Filter options for querying role definitions
 */
export interface RoleDefinitionFilter {
  /**
   * Filter by role type
   */
  readonly role?: AgentRole;

  /**
   * Filter by worker mode (only applies when role is 'worker')
   */
  readonly workerMode?: WorkerMode;

  /**
   * Filter by steward focus (only applies when role is 'steward')
   */
  readonly stewardFocus?: StewardFocus;

  /**
   * Filter by tags (must have ALL specified tags)
   */
  readonly tags?: readonly string[];

  /**
   * Filter by name (partial match, case-insensitive)
   */
  readonly nameContains?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Tags used to identify role definition documents
 */
export const ROLE_DEFINITION_TAGS = {
  /** Main tag for all role definition documents */
  ROLE_DEFINITION: 'role-definition',
  /** Tag prefix for role type (e.g., 'role:director') */
  ROLE_PREFIX: 'role:',
  /** Tag prefix for agent prompt documents */
  AGENT_PROMPT: 'agent-prompt',
} as const;

/**
 * Generates tags for a role definition document
 */
export function generateRoleDefinitionTags(role: AgentRole, additionalTags?: string[]): string[] {
  const tags = [
    ROLE_DEFINITION_TAGS.ROLE_DEFINITION,
    ROLE_DEFINITION_TAGS.AGENT_PROMPT,
    `${ROLE_DEFINITION_TAGS.ROLE_PREFIX}${role}`,
  ];
  if (additionalTags) {
    tags.push(...additionalTags);
  }
  return tags;
}
