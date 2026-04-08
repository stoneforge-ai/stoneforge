/**
 * Agent Permission Model Types
 *
 * Defines types for the tool permission system used when
 * `agents.permissionModel` is set to `"restricted"` (Approve preset).
 *
 * @module
 */

import type { EntityId, Timestamp } from '@stoneforge/core';

// ============================================================================
// Auto-Allowed Tool Definitions
// ============================================================================

/**
 * Tools that are always auto-allowed in restricted mode.
 * These tools are safe for agents to use without human approval.
 */
export const AUTO_ALLOWED_TOOLS: readonly string[] = [
  // File operations
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',

  // Web operations
  'WebSearch',
  'WebFetch',

  // Task management
  'TodoRead',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
] as const;

/**
 * Stoneforge CLI subcommands that are auto-allowed in restricted mode.
 * The Bash tool is checked: if the command starts with "sf" followed by
 * one of these subcommands, it is allowed.
 */
export const AUTO_ALLOWED_SF_COMMANDS: readonly string[] = [
  'task',
  'document',
  'message',
  'inbox',
  'show',
  'plan',
  'dependency',
  'docs',
  'channel',
  'update',
] as const;

// ============================================================================
// Approval Request Types
// ============================================================================

/**
 * Status of an approval request
 */
export type ApprovalRequestStatus = 'pending' | 'approved' | 'denied';

/**
 * An approval request for a restricted tool action
 */
export interface ApprovalRequest {
  /** Unique identifier */
  readonly id: string;
  /** Agent that requested the action */
  readonly agentId: EntityId;
  /** Session ID where the request originated */
  readonly sessionId: string;
  /** Name of the tool being requested */
  readonly toolName: string;
  /** Arguments/input for the tool */
  readonly toolArgs: unknown;
  /** Current status */
  status: ApprovalRequestStatus;
  /** When the request was created */
  readonly requestedAt: Timestamp;
  /** When the request was resolved (approved/denied) */
  resolvedAt?: Timestamp;
  /** Who resolved the request */
  resolvedBy?: string;
}

/**
 * Input for creating a new approval request
 */
export interface CreateApprovalRequestInput {
  readonly agentId: EntityId;
  readonly sessionId: string;
  readonly toolName: string;
  readonly toolArgs: unknown;
}

/**
 * Input for resolving an approval request
 */
export interface ResolveApprovalRequestInput {
  readonly status: 'approved' | 'denied';
  readonly resolvedBy: string;
}

/**
 * Filter for querying approval requests
 */
export interface ApprovalRequestFilter {
  readonly status?: ApprovalRequestStatus;
  readonly agentId?: EntityId;
  readonly sessionId?: string;
  readonly limit?: number;
  readonly offset?: number;
}

// ============================================================================
// Permission Check Results
// ============================================================================

/**
 * Result of checking whether a tool is allowed
 */
export interface ToolPermissionCheck {
  /** Whether the tool is allowed without approval */
  readonly allowed: boolean;
  /** Reason for the decision */
  readonly reason: string;
}

// ============================================================================
// Approval Request Event
// ============================================================================

/**
 * Event emitted when an agent attempts a restricted action
 */
export interface ApprovalRequestEvent {
  readonly type: 'approval_request';
  readonly request: ApprovalRequest;
}

/**
 * Event emitted when an approval request is resolved
 */
export interface ApprovalResolvedEvent {
  readonly type: 'approval_resolved';
  readonly request: ApprovalRequest;
}
