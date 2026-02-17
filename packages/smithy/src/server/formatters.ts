/**
 * Response Formatters
 *
 * Functions to format domain objects for JSON API responses.
 */

import type { Task } from '@stoneforge/core';
import type {
  SessionRecord,
  WorktreeInfo,
  StewardExecutionEntry,
  PluginExecutionResult,
  OrchestratorTaskMeta,
} from '../index.js';

/**
 * Compute the effective display status for a task.
 *
 * The `blocked` status is computed at display time, never stored directly.
 * A task is considered blocked when it has unresolved blocking dependencies
 * (i.e., it appears in the blocked_cache). Only tasks with an 'open' stored
 * status are shown as 'blocked' — tasks already in_progress, closed, etc.
 * retain their stored status.
 *
 * @param task - The task to compute the effective status for
 * @param blockedIds - Set of element IDs that are currently blocked (from blocked_cache)
 * @returns The effective display status
 */
export function getEffectiveTaskStatus(task: Task, blockedIds?: Set<string>): string {
  if (blockedIds && blockedIds.has(task.id) && task.status === 'open') {
    return 'blocked';
  }
  return task.status;
}

export function formatTaskResponse(task: Task, hydratedDescription?: string | null, blockedIds?: Set<string>) {
  const meta = (task.metadata as { orchestrator?: OrchestratorTaskMeta })?.orchestrator;
  // Use hydrated description from descriptionRef, or fall back to metadata.description
  const description = hydratedDescription ?? (task.metadata as { description?: string })?.description;

  // Compute effective display status: show 'blocked' for open tasks with unresolved dependencies
  const effectiveStatus = getEffectiveTaskStatus(task, blockedIds);

  return {
    id: task.id,
    title: task.title,
    description,
    status: effectiveStatus,
    priority: task.priority,
    complexity: task.complexity,
    taskType: task.taskType,
    assignee: task.assignee,
    owner: task.owner,
    deadline: task.deadline,
    scheduledFor: task.scheduledFor,
    tags: task.tags,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    metadata: {
      orchestrator: meta
        ? {
            branch: meta.branch,
            worktree: meta.worktree,
            sessionId: meta.sessionId,
            assignedAgent: meta.assignedAgent,
            startedAt: meta.startedAt,
            completedAt: meta.completedAt,
            mergeStatus: meta.mergeStatus,
            mergedAt: meta.mergedAt,
            lastTestResult: meta.lastTestResult,
            testRunCount: meta.testRunCount,
          }
        : undefined,
    },
  };
}

export function formatSessionRecord(session: SessionRecord) {
  return {
    id: session.id,
    providerSessionId: session.providerSessionId,
    agentId: session.agentId,
    agentRole: session.agentRole,
    workerMode: session.workerMode,
    pid: session.pid,
    status: session.status,
    workingDirectory: session.workingDirectory,
    worktree: session.worktree,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
    endedAt: session.endedAt,
    terminationReason: session.terminationReason,
  };
}

export function formatWorktreeInfo(worktree: WorktreeInfo) {
  return {
    path: worktree.path,
    relativePath: worktree.relativePath,
    branch: worktree.branch,
    head: worktree.head,
    isMain: worktree.isMain,
    state: worktree.state,
    agentName: worktree.agentName,
    taskId: worktree.taskId,
    createdAt: worktree.createdAt,
  };
}

export function formatExecutionEntry(entry: StewardExecutionEntry) {
  return {
    executionId: entry.executionId,
    stewardId: entry.stewardId,
    stewardName: entry.stewardName,
    trigger: entry.trigger,
    manual: entry.manual,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    result: entry.result,
    eventContext: entry.eventContext,
  };
}

export function formatPluginExecutionResult(result: PluginExecutionResult) {
  return {
    pluginName: result.pluginName,
    pluginType: result.pluginType,
    success: result.success,
    error: result.error,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    itemsProcessed: result.itemsProcessed,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
  };
}

export function generateActivitySummary(
  event: {
    eventType: string;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
  },
  elementType?: string,
  elementTitle?: string
): string {
  const typeLabel = elementType || 'item';
  const titlePart = elementTitle ? ` "${elementTitle}"` : '';

  switch (event.eventType) {
    case 'created':
      return `Created ${typeLabel}${titlePart}`;
    case 'updated':
      return `Updated ${typeLabel}${titlePart}`;
    case 'closed':
      return `Closed ${typeLabel}${titlePart}`;
    case 'reopened':
      return `Reopened ${typeLabel}${titlePart}`;
    case 'deleted':
      return `Deleted ${typeLabel}${titlePart}`;
    case 'dependency_added':
      return `Added dependency to ${typeLabel}${titlePart}`;
    case 'dependency_removed':
      return `Removed dependency from ${typeLabel}${titlePart}`;
    case 'tag_added': {
      const tag = event.newValue?.tag as string;
      return tag ? `Added tag "${tag}" to ${typeLabel}${titlePart}` : `Added tag to ${typeLabel}${titlePart}`;
    }
    case 'tag_removed': {
      const tag = event.oldValue?.tag as string;
      return tag
        ? `Removed tag "${tag}" from ${typeLabel}${titlePart}`
        : `Removed tag from ${typeLabel}${titlePart}`;
    }
    case 'member_added':
      return `Added member to ${typeLabel}${titlePart}`;
    case 'member_removed':
      return `Removed member from ${typeLabel}${titlePart}`;
    case 'auto_blocked':
      return `${typeLabel}${titlePart} was automatically blocked`;
    case 'auto_unblocked':
      return `${typeLabel}${titlePart} was automatically unblocked`;
    default:
      return `${event.eventType} on ${typeLabel}${titlePart}`;
  }
}
