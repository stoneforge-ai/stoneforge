/**
 * Orchestrator SDK Types
 *
 * This module exports all type definitions for the Stoneforge Smithy SDK.
 */

// Agent types
export {
  // Role types
  type AgentRole,
  AgentRoleValues,
  isAgentRole,
  // Worker mode types
  type WorkerMode,
  WorkerModeValues,
  isWorkerMode,
  // Steward focus types
  type StewardFocus,
  StewardFocusValues,
  isStewardFocus,
  // Steward trigger types
  type CronTrigger,
  type EventTrigger,
  type StewardTrigger,
  isCronTrigger,
  isEventTrigger,
  isStewardTrigger,
  // Agent metadata types
  type BaseAgentMetadata,
  type DirectorMetadata,
  type WorkerMetadata,
  type StewardMetadata,
  type AgentMetadata,
  isDirectorMetadata,
  isWorkerMetadata,
  isStewardMetadata,
  // Registration input types
  type RegisterDirectorInput,
  type RegisterWorkerInput,
  type RegisterStewardInput,
  // Query types
  type AgentFilter,
  // Validation
  validateAgentMetadata,
} from './agent.js';

// Task metadata types
export {
  type OrchestratorTaskMeta,
  type MergeStatus,
  MergeStatusValues,
  isMergeStatus,
  type TestResult,
  isTestResult,
  type HandoffHistoryEntry,
  type TaskSessionHistoryEntry,
  type SyncResultMeta,
  // Utilities
  getOrchestratorTaskMeta,
  setOrchestratorTaskMeta,
  updateOrchestratorTaskMeta,
  isOrchestratorTaskMeta,
  appendTaskSessionHistory,
  closeTaskSessionHistory,
  // Naming utilities
  generateBranchName,
  generateWorktreePath,
  generateSessionBranchName,
  generateSessionWorktreePath,
  createSlugFromTitle,
} from './task-meta.js';

// Role definition types
export {
  // Behavior types
  type AgentBehaviors,
  isAgentBehaviors,
  // Role definition types
  type BaseRoleDefinition,
  type DirectorRoleDefinition,
  type WorkerRoleDefinition,
  type StewardRoleDefinition,
  type AgentRoleDefinition,
  type StoredRoleDefinition,
  // Type guards
  isDirectorRoleDefinition,
  isWorkerRoleDefinition,
  isStewardRoleDefinition,
  isAgentRoleDefinition,
  // Input types
  type CreateRoleDefinitionInput,
  type UpdateRoleDefinitionInput,
  // Query types
  type RoleDefinitionFilter,
  // Constants and utilities
  ROLE_DEFINITION_TAGS,
  generateRoleDefinitionTags,
} from './role-definition.js';

// Message types (TB-O14a)
export {
  // Constants
  MessageTypeValue,
  AllMessageTypes,
  StatusUpdateSeverity,
  HelpRequestUrgency,
  HealthCheckStatus,
  // Message interfaces
  type BaseMessageMeta,
  type TaskAssignmentMessage,
  type StatusUpdateMessage,
  type HelpRequestMessage,
  type HandoffMessage,
  type HealthCheckMessage,
  type GenericMessage,
  type OrchestratorMessage,
  // Type guards (validation functions)
  isTaskAssignmentMessage,
  isStatusUpdateMessage,
  isHelpRequestMessage,
  isHandoffMessage,
  isHealthCheckMessage,
  isGenericMessage,
  isOrchestratorMessage,
  isMessageType,
  // Factory functions
  createTaskAssignmentMessage,
  createStatusUpdateMessage,
  createHelpRequestMessage,
  createHandoffMessage,
  createHealthCheckRequest,
  createHealthCheckResponse,
  createGenericMessage,
  // Utilities
  parseMessageMetadata,
  getMessageType,
} from './message-types.js';

// Agent pool types
export {
  // Pool configuration types
  type PoolAgentTypeConfig,
  type AgentPoolConfig,
  type AgentPoolStatus,
  type AgentPool,
  // Query types
  type AgentPoolFilter,
  // Operation types
  type CreatePoolInput,
  type UpdatePoolInput,
  // Spawn decision types
  type PoolSpawnCheck,
  type PoolSpawnRequest,
  // Validation functions
  isValidPoolName,
  isValidPoolSize,
  isValidPriorityScore,
  isValidPoolAgentTypeConfig,
  isValidPoolConfig,
  // Type guards
  isAgentPool,
  // Constants
  POOL_DEFAULTS,
  POOL_METADATA_KEY,
} from './agent-pool.js';
