/**
 * Orchestrator Task Metadata Types
 *
 * This module defines the metadata structure for tasks in the orchestration system.
 * Tasks gain additional metadata when managed by the orchestrator to track:
 * - Git branch association
 * - Worktree location
 * - Claude Code session ID for resumption
 *
 * This metadata is stored in the task's `metadata` field alongside any existing
 * task metadata.
 */

import type { EntityId, ElementId, Timestamp } from '@stoneforge/core';

// ============================================================================
// Orchestrator Task Metadata
// ============================================================================

/**
 * Orchestrator-specific metadata attached to tasks managed by the orchestration system.
 *
 * This is stored in the task's `metadata` field under the `orchestrator` key:
 * ```typescript
 * task.metadata = {
 *   ...existingMetadata,
 *   orchestrator: OrchestratorTaskMeta
 * }
 * ```
 */
export interface OrchestratorTaskMeta {
  /** Git branch created for this task (e.g., "agent/alice/task-123-implement-feature") */
  readonly branch?: string;

  /** Path to the worktree where the agent is working (e.g., ".stoneforge/.worktrees/alice-implement-feature/") */
  readonly worktree?: string;

  /** Claude Code session ID for this task, enabling session resumption */
  readonly sessionId?: string;

  /** Entity ID of the agent assigned to this task */
  readonly assignedAgent?: EntityId;

  /** When the agent started working on this task */
  readonly startedAt?: Timestamp;

  /** When the agent completed this task (before merge) */
  readonly completedAt?: Timestamp;

  /** When the branch was merged */
  readonly mergedAt?: Timestamp;

  /** Merge status tracking */
  readonly mergeStatus?: MergeStatus;

  /** If merge failed, the reason */
  readonly mergeFailureReason?: string;

  /** Number of times tests have been run on this branch */
  readonly testRunCount?: number;

  /** Last test result */
  readonly lastTestResult?: TestResult;

  /** Number of times this task has been reconciled from a closed-but-unmerged state */
  readonly reconciliationCount?: number;

  /** Number of times this task has been recovered from a stuck merging/testing state */
  readonly stuckMergeRecoveryCount?: number;

  /**
   * Number of consecutive times the orphan recovery loop has resumed this task
   * without a status change. When this exceeds the configured threshold,
   * the daemon spawns a recovery steward instead of resuming the worker.
   */
  readonly resumeCount?: number;

  /**
   * Set of issue types that have been reported for this task.
   * Prevents duplicate messages/fix tasks for the same type of issue.
   * Format: "test_failure", "merge_conflict", etc.
   */
  readonly reportedIssues?: readonly string[];

  // ----------------------------------------
  // Handoff Context (for task continuation)
  // ----------------------------------------

  /** Branch preserved from handoff (may differ from current branch if not yet continued) */
  readonly handoffBranch?: string;

  /** Worktree path preserved from handoff */
  readonly handoffWorktree?: string;

  /** Session ID of the last agent that worked on this task before handoff */
  readonly lastSessionId?: string;

  /** Timestamp when the task was handed off */
  readonly handoffAt?: Timestamp;

  /** Entity ID of the agent who handed off the task */
  readonly handoffFrom?: EntityId;

  // ----------------------------------------
  // Merge Request Information (for completed tasks)
  // ----------------------------------------

  /** URL of the merge request created for this task */
  readonly mergeRequestUrl?: string;

  /** Merge request identifier (e.g. PR number) */
  readonly mergeRequestId?: number;

  /** Which provider created the merge request (e.g. 'github', 'local') */
  readonly mergeRequestProvider?: string;

  /** Completion summary provided by the agent */
  readonly completionSummary?: string;

  /** Last commit hash before completion */
  readonly lastCommitHash?: string;

  /** History of all handoffs for this task */
  readonly handoffHistory?: HandoffHistoryEntry[];

  /** History of all sessions (worker and steward) that worked on this task */
  readonly sessionHistory?: readonly TaskSessionHistoryEntry[];

  // ----------------------------------------
  // Branch Sync Information (for merge steward review)
  // ----------------------------------------

  /** Result of the most recent branch sync with master */
  readonly lastSyncResult?: SyncResultMeta;
}

/**
 * Metadata about a branch sync operation result
 */
export interface SyncResultMeta {
  /** Whether the sync succeeded without conflicts */
  readonly success: boolean;
  /** List of conflicted file paths (if any) */
  readonly conflicts?: string[];
  /** Error message (if sync failed for non-conflict reasons) */
  readonly error?: string;
  /** Human-readable message */
  readonly message: string;
  /** When the sync was performed */
  readonly syncedAt: Timestamp;
}

// ============================================================================
// Handoff History Entry
// ============================================================================

/**
 * An entry in the handoff history for a task
 */
export interface HandoffHistoryEntry {
  /** Session ID of the agent that handed off */
  readonly sessionId: string;
  /** Message explaining why the handoff occurred */
  readonly message?: string;
  /** Branch at time of handoff */
  readonly branch?: string;
  /** Worktree at time of handoff */
  readonly worktree?: string;
  /** When the handoff occurred */
  readonly handoffAt: Timestamp;
}

// ============================================================================
// Task Session History Entry
// ============================================================================

/**
 * An entry in the session history for a task, tracking all sessions (worker and steward)
 * that have worked on this task.
 */
export interface TaskSessionHistoryEntry {
  /** Internal session ID (used to fetch messages via GET /api/sessions/:id/messages) */
  readonly sessionId: string;
  /** Provider session ID (for resume) */
  readonly providerSessionId?: string;
  /** Entity ID of the agent */
  readonly agentId: EntityId;
  /** Display name of the agent */
  readonly agentName: string;
  /** Role of the agent */
  readonly agentRole: 'worker' | 'steward';
  /** Timestamp when the session started */
  readonly startedAt: Timestamp;
  /** Timestamp when the session ended (undefined if still running) */
  readonly endedAt?: Timestamp;
}

// ============================================================================
// Merge Status Types
// ============================================================================

/**
 * Status of the merge process for a completed task's branch
 */
export type MergeStatus =
  | 'pending'         // Task completed, awaiting merge
  | 'testing'         // Steward is running tests on the branch
  | 'merging'         // Tests passed, merge in progress
  | 'merged'          // Successfully merged
  | 'conflict'        // Merge conflict detected
  | 'test_failed'     // Tests failed, needs attention
  | 'failed'          // Merge failed for other reason
  | 'not_applicable'; // No merge needed (e.g., fix already existed on master)

/**
 * All valid merge status values
 */
export const MergeStatusValues = [
  'pending',
  'testing',
  'merging',
  'merged',
  'conflict',
  'test_failed',
  'failed',
  'not_applicable',
] as const;

/**
 * Type guard to check if a value is a valid MergeStatus
 */
export function isMergeStatus(value: unknown): value is MergeStatus {
  return typeof value === 'string' && MergeStatusValues.includes(value as MergeStatus);
}

// ============================================================================
// Test Result Types
// ============================================================================

/**
 * Result of running tests on a task's branch
 */
export interface TestResult {
  /** Whether tests passed */
  readonly passed: boolean;

  /** Total number of tests run */
  readonly totalTests?: number;

  /** Number of tests that passed */
  readonly passedTests?: number;

  /** Number of tests that failed */
  readonly failedTests?: number;

  /** Number of tests that were skipped */
  readonly skippedTests?: number;

  /** When the test run completed */
  readonly completedAt: Timestamp;

  /** Duration of the test run in milliseconds */
  readonly durationMs?: number;

  /** Error message if tests failed to run */
  readonly errorMessage?: string;
}

/**
 * Type guard to check if a value is a valid TestResult
 */
export function isTestResult(value: unknown): value is TestResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.passed === 'boolean' &&
    typeof obj.completedAt === 'string'
  );
}

// ============================================================================
// Orchestrator Task Metadata Utilities
// ============================================================================

/**
 * Extracts orchestrator metadata from a task's metadata field
 */
export function getOrchestratorTaskMeta(
  taskMetadata: Record<string, unknown> | undefined
): OrchestratorTaskMeta | undefined {
  if (!taskMetadata || typeof taskMetadata.orchestrator !== 'object') {
    return undefined;
  }
  return taskMetadata.orchestrator as OrchestratorTaskMeta;
}

/**
 * Sets orchestrator metadata on a task's metadata field
 */
export function setOrchestratorTaskMeta(
  existingMetadata: Record<string, unknown> | undefined,
  orchestratorMeta: OrchestratorTaskMeta
): Record<string, unknown> {
  return {
    ...existingMetadata,
    orchestrator: orchestratorMeta,
  };
}

/**
 * Updates orchestrator metadata on a task's metadata field
 */
export function updateOrchestratorTaskMeta(
  existingMetadata: Record<string, unknown> | undefined,
  updates: Partial<OrchestratorTaskMeta>
): Record<string, unknown> {
  const existing = getOrchestratorTaskMeta(existingMetadata) ?? {};
  return setOrchestratorTaskMeta(existingMetadata, {
    ...existing,
    ...updates,
  });
}

/**
 * Type guard to validate OrchestratorTaskMeta structure
 */
export function isOrchestratorTaskMeta(value: unknown): value is OrchestratorTaskMeta {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;

  // All fields are optional, so we just check types if present
  if (obj.branch !== undefined && typeof obj.branch !== 'string') return false;
  if (obj.worktree !== undefined && typeof obj.worktree !== 'string') return false;
  if (obj.sessionId !== undefined && typeof obj.sessionId !== 'string') return false;
  if (obj.assignedAgent !== undefined && typeof obj.assignedAgent !== 'string') return false;
  if (obj.mergeStatus !== undefined && !isMergeStatus(obj.mergeStatus)) return false;
  if (obj.lastTestResult !== undefined && !isTestResult(obj.lastTestResult)) return false;

  return true;
}

// ============================================================================
// Session History Utilities
// ============================================================================

/** Maximum number of session history entries to keep per task */
const MAX_SESSION_HISTORY_ENTRIES = 50;

/**
 * Appends a session history entry to the task's orchestrator metadata.
 * Caps the history at MAX_SESSION_HISTORY_ENTRIES entries.
 *
 * @param existingMetadata - The task's existing metadata
 * @param entry - The session history entry to append
 * @returns Updated task metadata with the new session history entry
 */
export function appendTaskSessionHistory(
  existingMetadata: Record<string, unknown> | undefined,
  entry: TaskSessionHistoryEntry
): Record<string, unknown> {
  const existing = getOrchestratorTaskMeta(existingMetadata);
  const existingHistory = existing?.sessionHistory ?? [];
  const newHistory = [...existingHistory, entry].slice(-MAX_SESSION_HISTORY_ENTRIES);

  return updateOrchestratorTaskMeta(existingMetadata, {
    sessionHistory: newHistory,
  });
}

/**
 * Closes a session history entry by setting the endedAt timestamp.
 * Finds the session history entry matching the sessionId that has no endedAt.
 *
 * @param existingMetadata - The task's existing metadata
 * @param sessionId - The session ID to close
 * @param endedAt - The timestamp when the session ended
 * @returns Updated task metadata with the closed session history entry
 */
export function closeTaskSessionHistory(
  existingMetadata: Record<string, unknown> | undefined,
  sessionId: string,
  endedAt: Timestamp
): Record<string, unknown> {
  const existing = getOrchestratorTaskMeta(existingMetadata);
  const existingHistory = existing?.sessionHistory ?? [];

  const updatedHistory = existingHistory.map((entry) => {
    if (entry.sessionId === sessionId && entry.endedAt === undefined) {
      return { ...entry, endedAt };
    }
    return entry;
  });

  return updateOrchestratorTaskMeta(existingMetadata, {
    sessionHistory: updatedHistory,
  });
}

// ============================================================================
// Branch and Worktree Naming Utilities
// ============================================================================

/**
 * Generates a branch name for an agent working on a task
 *
 * Format: agent/{worker-name}/{task-id}-{slug}
 *
 * @param workerName - The agent's name
 * @param taskId - The task ID
 * @param slug - URL-friendly slug derived from task title (optional)
 */
export function generateBranchName(
  workerName: string,
  taskId: ElementId,
  slug?: string
): string {
  const safeName = workerName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const safeTaskId = taskId.toLowerCase();
  if (slug) {
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30);
    return `agent/${safeName}/${safeTaskId}-${safeSlug}`;
  }
  return `agent/${safeName}/${safeTaskId}`;
}

/**
 * Generates a worktree path for an agent working on a task
 *
 * Format: .stoneforge/.worktrees/{worker-name}-{task-slug}/
 *
 * @param workerName - The agent's name
 * @param slug - URL-friendly slug derived from task title (optional)
 */
export function generateWorktreePath(
  workerName: string,
  slug?: string
): string {
  const safeName = workerName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (slug) {
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30);
    return `.stoneforge/.worktrees/${safeName}-${safeSlug}`;
  }
  return `.stoneforge/.worktrees/${safeName}`;
}

/**
 * Generates a branch name for a persistent worker session
 *
 * Format: session/{worker-name}-{timestamp}
 *
 * @param workerName - The agent's name
 * @param timestamp - Timestamp string (e.g. '20240115143022')
 */
export function generateSessionBranchName(
  workerName: string,
  timestamp: string
): string {
  const safeName = workerName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `session/${safeName}-${timestamp}`;
}

/**
 * Generates a worktree path for a persistent worker session
 *
 * Format: .stoneforge/.worktrees/{worker-name}-session-{timestamp}/
 *
 * @param workerName - The agent's name
 * @param timestamp - Timestamp string (e.g. '20240115143022')
 */
export function generateSessionWorktreePath(
  workerName: string,
  timestamp: string
): string {
  const safeName = workerName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `.stoneforge/.worktrees/${safeName}-session-${timestamp}`;
}

/**
 * Creates a URL-friendly slug from a task title
 */
export function createSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special characters
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .slice(0, 30)                  // Limit length
    .replace(/^-|-$/g, '');        // Trim leading/trailing hyphens
}
