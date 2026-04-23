/**
 * Orchestrator Message Types (TB-O14a)
 *
 * Defines typed message conventions for inter-agent communication.
 * These types extend the base Stoneforge messaging system with
 * orchestrator-specific semantics.
 *
 * Message types:
 * - task-assignment: New task has been assigned to an agent
 * - status-update: Progress update from an agent
 * - help-request: Agent requesting assistance
 * - handoff: Session handoff between agents
 * - health-check: Health monitoring ping
 *
 * @module
 */

import type { EntityId, ElementId, Timestamp } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';

// Use ElementId for task IDs (tasks are elements)
type TaskId = ElementId;

// ============================================================================
// Message Type Constants
// ============================================================================

/**
 * Known message types for orchestrator inter-agent communication.
 */
export const MessageTypeValue = {
  TASK_ASSIGNMENT: 'task-assignment',
  STATUS_UPDATE: 'status-update',
  HELP_REQUEST: 'help-request',
  HANDOFF: 'handoff',
  HEALTH_CHECK: 'health-check',
  GENERIC: 'generic',
} as const;

export type MessageTypeValue = (typeof MessageTypeValue)[keyof typeof MessageTypeValue];

/**
 * Array of all message type values for iteration
 */
export const AllMessageTypes: readonly MessageTypeValue[] = Object.values(MessageTypeValue);

// ============================================================================
// Base Message Schema
// ============================================================================

/**
 * Base interface for all orchestrator message metadata.
 */
export interface BaseMessageMeta {
  /** Message type identifier */
  readonly type: MessageTypeValue;
  /** Timestamp when message was created */
  readonly timestamp: Timestamp;
  /** Optional correlation ID for tracking related messages */
  readonly correlationId?: string;
}

// ============================================================================
// Task Assignment Message (TB-O14a)
// ============================================================================

/**
 * Message sent when a task is assigned to an agent.
 */
export interface TaskAssignmentMessage extends BaseMessageMeta {
  readonly type: 'task-assignment';
  /** The task being assigned */
  readonly taskId: TaskId;
  /** Task title for display */
  readonly taskTitle: string;
  /** Task priority */
  readonly priority?: number;
  /** Who assigned the task */
  readonly assignedBy?: EntityId;
  /** Git branch for the task (if applicable) */
  readonly branch?: string;
  /** Worktree path (if applicable) */
  readonly worktree?: string;
  /** Whether this is a reassignment */
  readonly isReassignment?: boolean;
  /** Previous assignee (if reassignment) */
  readonly previousAssignee?: EntityId;
}

/**
 * Validates a TaskAssignmentMessage
 */
export function isTaskAssignmentMessage(value: unknown): value is TaskAssignmentMessage {
  if (!isObject(value)) return false;
  if (value.type !== 'task-assignment') return false;
  if (typeof value.taskId !== 'string') return false;
  if (typeof value.taskTitle !== 'string') return false;
  if (!isTimestamp(value.timestamp)) return false;
  return true;
}

/**
 * Creates a validated TaskAssignmentMessage
 */
export function createTaskAssignmentMessage(
  input: Omit<TaskAssignmentMessage, 'type' | 'timestamp'> & { timestamp?: Timestamp }
): TaskAssignmentMessage {
  return {
    type: 'task-assignment',
    timestamp: input.timestamp ?? createTimestamp(),
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    priority: input.priority,
    assignedBy: input.assignedBy,
    branch: input.branch,
    worktree: input.worktree,
    isReassignment: input.isReassignment,
    previousAssignee: input.previousAssignee,
    correlationId: input.correlationId,
  };
}

// ============================================================================
// Status Update Message (TB-O14a)
// ============================================================================

/**
 * Status update severity levels
 */
export const StatusUpdateSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

export type StatusUpdateSeverity = (typeof StatusUpdateSeverity)[keyof typeof StatusUpdateSeverity];

/**
 * Message sent to update status/progress.
 */
export interface StatusUpdateMessage extends BaseMessageMeta {
  readonly type: 'status-update';
  /** Agent sending the update */
  readonly agentId: EntityId;
  /** Status message text */
  readonly message: string;
  /** Severity level */
  readonly severity?: StatusUpdateSeverity;
  /** Related task (if applicable) */
  readonly taskId?: TaskId;
  /** Progress percentage (0-100) */
  readonly progress?: number;
  /** Current phase/step name */
  readonly phase?: string;
  /** Additional details */
  readonly details?: Record<string, unknown>;
}

/**
 * Validates a StatusUpdateMessage
 */
export function isStatusUpdateMessage(value: unknown): value is StatusUpdateMessage {
  if (!isObject(value)) return false;
  if (value.type !== 'status-update') return false;
  if (typeof value.agentId !== 'string') return false;
  if (typeof value.message !== 'string') return false;
  if (!isTimestamp(value.timestamp)) return false;
  return true;
}

/**
 * Creates a validated StatusUpdateMessage
 */
export function createStatusUpdateMessage(
  input: Omit<StatusUpdateMessage, 'type' | 'timestamp'> & { timestamp?: Timestamp }
): StatusUpdateMessage {
  return {
    type: 'status-update',
    timestamp: input.timestamp ?? createTimestamp(),
    agentId: input.agentId,
    message: input.message,
    severity: input.severity,
    taskId: input.taskId,
    progress: input.progress,
    phase: input.phase,
    details: input.details,
    correlationId: input.correlationId,
  };
}

// ============================================================================
// Help Request Message (TB-O14a)
// ============================================================================

/**
 * Help request urgency levels
 */
export const HelpRequestUrgency = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type HelpRequestUrgency = (typeof HelpRequestUrgency)[keyof typeof HelpRequestUrgency];

/**
 * Message sent when an agent needs assistance.
 */
export interface HelpRequestMessage extends BaseMessageMeta {
  readonly type: 'help-request';
  /** Agent requesting help */
  readonly agentId: EntityId;
  /** Description of the problem */
  readonly problem: string;
  /** What the agent has already tried */
  readonly attemptedSolutions?: string[];
  /** Related task (if applicable) */
  readonly taskId?: TaskId;
  /** Urgency level */
  readonly urgency?: HelpRequestUrgency;
  /** Error message (if applicable) */
  readonly errorMessage?: string;
  /** Stack trace (if applicable) */
  readonly stackTrace?: string;
  /** Suggested next steps */
  readonly suggestedActions?: string[];
}

/**
 * Validates a HelpRequestMessage
 */
export function isHelpRequestMessage(value: unknown): value is HelpRequestMessage {
  if (!isObject(value)) return false;
  if (value.type !== 'help-request') return false;
  if (typeof value.agentId !== 'string') return false;
  if (typeof value.problem !== 'string') return false;
  if (!isTimestamp(value.timestamp)) return false;
  return true;
}

/**
 * Creates a validated HelpRequestMessage
 */
export function createHelpRequestMessage(
  input: Omit<HelpRequestMessage, 'type' | 'timestamp'> & { timestamp?: Timestamp }
): HelpRequestMessage {
  return {
    type: 'help-request',
    timestamp: input.timestamp ?? createTimestamp(),
    agentId: input.agentId,
    problem: input.problem,
    attemptedSolutions: input.attemptedSolutions,
    taskId: input.taskId,
    urgency: input.urgency,
    errorMessage: input.errorMessage,
    stackTrace: input.stackTrace,
    suggestedActions: input.suggestedActions,
    correlationId: input.correlationId,
  };
}

// ============================================================================
// Handoff Message (TB-O14b)
// ============================================================================

/**
 * Message sent for session handoff between agents.
 * This extends the HandoffContent from handoff.ts with message-specific fields.
 */
export interface HandoffMessage extends BaseMessageMeta {
  readonly type: 'handoff';
  /** Agent initiating the handoff */
  readonly fromAgent: EntityId;
  /** Target agent (undefined for self-handoff) */
  readonly toAgent?: EntityId;
  /** Task IDs being transferred */
  readonly taskIds: TaskId[];
  /** Summary of current context */
  readonly contextSummary: string;
  /** Recommended next steps */
  readonly nextSteps?: string;
  /** Reason for handoff */
  readonly reason?: string;
  /** Provider session ID for predecessor queries */
  readonly providerSessionId?: string;
  /** Reference to handoff document */
  readonly handoffDocumentId?: string;
  /** Whether this is a self-handoff */
  readonly isSelfHandoff: boolean;
}

/**
 * Validates a HandoffMessage
 */
export function isHandoffMessage(value: unknown): value is HandoffMessage {
  if (!isObject(value)) return false;
  if (value.type !== 'handoff') return false;
  if (typeof value.fromAgent !== 'string') return false;
  if (!Array.isArray(value.taskIds)) return false;
  if (typeof value.contextSummary !== 'string') return false;
  if (typeof value.isSelfHandoff !== 'boolean') return false;
  if (!isTimestamp(value.timestamp)) return false;
  return true;
}

/**
 * Creates a validated HandoffMessage
 */
export function createHandoffMessage(
  input: Omit<HandoffMessage, 'type' | 'timestamp' | 'isSelfHandoff'> & {
    timestamp?: Timestamp;
    isSelfHandoff?: boolean;
  }
): HandoffMessage {
  return {
    type: 'handoff',
    timestamp: input.timestamp ?? createTimestamp(),
    fromAgent: input.fromAgent,
    toAgent: input.toAgent,
    taskIds: input.taskIds,
    contextSummary: input.contextSummary,
    nextSteps: input.nextSteps,
    reason: input.reason,
    providerSessionId: input.providerSessionId,
    handoffDocumentId: input.handoffDocumentId,
    isSelfHandoff: input.isSelfHandoff ?? (input.toAgent === undefined),
    correlationId: input.correlationId,
  };
}

// ============================================================================
// Health Check Message (TB-O14a)
// ============================================================================

/**
 * Health check result status
 */
export const HealthCheckStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
} as const;

export type HealthCheckStatus = (typeof HealthCheckStatus)[keyof typeof HealthCheckStatus];

/**
 * Message sent for health monitoring.
 */
export interface HealthCheckMessage extends BaseMessageMeta {
  readonly type: 'health-check';
  /** Agent being checked (target) */
  readonly targetAgentId: EntityId;
  /** Agent performing the check (source) */
  readonly sourceAgentId: EntityId;
  /** Whether this is a request or response */
  readonly isResponse: boolean;
  /** Health status (for responses) */
  readonly status?: HealthCheckStatus;
  /** Last activity timestamp (for responses) */
  readonly lastActivityAt?: Timestamp;
  /** Current task being worked on (for responses) */
  readonly currentTaskId?: TaskId;
  /** Additional health metrics */
  readonly metrics?: {
    /** Memory usage percentage */
    memoryUsage?: number;
    /** CPU usage percentage */
    cpuUsage?: number;
    /** Time since last output in milliseconds */
    timeSinceLastOutput?: number;
    /** Number of errors in current session */
    errorCount?: number;
  };
}

/**
 * Validates a HealthCheckMessage
 */
export function isHealthCheckMessage(value: unknown): value is HealthCheckMessage {
  if (!isObject(value)) return false;
  if (value.type !== 'health-check') return false;
  if (typeof value.targetAgentId !== 'string') return false;
  if (typeof value.sourceAgentId !== 'string') return false;
  if (typeof value.isResponse !== 'boolean') return false;
  if (!isTimestamp(value.timestamp)) return false;
  return true;
}

/**
 * Creates a validated HealthCheckMessage (request)
 */
export function createHealthCheckRequest(
  input: {
    targetAgentId: EntityId;
    sourceAgentId: EntityId;
    timestamp?: Timestamp;
    correlationId?: string;
  }
): HealthCheckMessage {
  return {
    type: 'health-check',
    timestamp: input.timestamp ?? createTimestamp(),
    targetAgentId: input.targetAgentId,
    sourceAgentId: input.sourceAgentId,
    isResponse: false,
    correlationId: input.correlationId ?? `health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

/**
 * Creates a validated HealthCheckMessage (response)
 */
export function createHealthCheckResponse(
  input: Omit<HealthCheckMessage, 'type' | 'timestamp' | 'isResponse'> & { timestamp?: Timestamp }
): HealthCheckMessage {
  return {
    type: 'health-check',
    timestamp: input.timestamp ?? createTimestamp(),
    targetAgentId: input.targetAgentId,
    sourceAgentId: input.sourceAgentId,
    isResponse: true,
    status: input.status,
    lastActivityAt: input.lastActivityAt,
    currentTaskId: input.currentTaskId,
    metrics: input.metrics,
    correlationId: input.correlationId,
  };
}

// ============================================================================
// Generic Message (for untyped messages)
// ============================================================================

/**
 * Generic message for backwards compatibility or custom types.
 */
export interface GenericMessage extends BaseMessageMeta {
  readonly type: 'generic';
  /** Message content/body */
  readonly content?: string;
  /** Custom data */
  readonly data?: Record<string, unknown>;
}

/**
 * Validates a GenericMessage
 */
export function isGenericMessage(value: unknown): value is GenericMessage {
  if (!isObject(value)) return false;
  if (value.type !== 'generic') return false;
  if (!isTimestamp(value.timestamp)) return false;
  return true;
}

/**
 * Creates a validated GenericMessage
 */
export function createGenericMessage(
  input: Omit<GenericMessage, 'type' | 'timestamp'> & { timestamp?: Timestamp }
): GenericMessage {
  return {
    type: 'generic',
    timestamp: input.timestamp ?? createTimestamp(),
    content: input.content,
    data: input.data,
    correlationId: input.correlationId,
  };
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all orchestrator message types
 */
export type OrchestratorMessage =
  | TaskAssignmentMessage
  | StatusUpdateMessage
  | HelpRequestMessage
  | HandoffMessage
  | HealthCheckMessage
  | GenericMessage;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validates any orchestrator message
 */
export function isOrchestratorMessage(value: unknown): value is OrchestratorMessage {
  if (!isObject(value)) return false;

  switch (value.type) {
    case 'task-assignment':
      return isTaskAssignmentMessage(value);
    case 'status-update':
      return isStatusUpdateMessage(value);
    case 'help-request':
      return isHelpRequestMessage(value);
    case 'handoff':
      return isHandoffMessage(value);
    case 'health-check':
      return isHealthCheckMessage(value);
    case 'generic':
      return isGenericMessage(value);
    default:
      return false;
  }
}

/**
 * Parses a message from raw metadata
 */
export function parseMessageMetadata(metadata: unknown): OrchestratorMessage | null {
  if (!isOrchestratorMessage(metadata)) {
    return null;
  }
  return metadata;
}

/**
 * Extracts message type from raw metadata
 */
export function getMessageType(metadata: unknown): MessageTypeValue | null {
  if (!isObject(metadata)) return null;
  const type = metadata.type;
  if (typeof type !== 'string') return null;
  if (AllMessageTypes.includes(type as MessageTypeValue)) {
    return type as MessageTypeValue;
  }
  return null;
}

/**
 * Validates message type value
 */
export function isMessageType(value: unknown): value is MessageTypeValue {
  return typeof value === 'string' && AllMessageTypes.includes(value as MessageTypeValue);
}

// ============================================================================
// Internal Helpers
// ============================================================================

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is Timestamp {
  // Timestamps can be numbers or ISO strings
  if (typeof value === 'number' && value > 0) return true;
  if (typeof value === 'string') {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
  return false;
}
