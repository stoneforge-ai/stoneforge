/**
 * TaskCard - Card component for displaying task information
 *
 * This is an orchestrator-specific TaskCard with action buttons and metadata.
 * Badge components are from @stoneforge/ui/domain.
 */

import { GitBranch, GitMerge, AlertTriangle, Bot, User, Clock, Calendar, MoreHorizontal, Play, CheckCircle2 } from 'lucide-react';
import type { Task } from '../../api/types';
import { TaskStatusBadge, TaskPriorityBadge, TaskTypeBadge } from '@stoneforge/ui/domain';

interface TaskCardProps {
  task: Task;
  assigneeName?: string;
  onStart?: () => void;
  onComplete?: () => void;
  onClick?: () => void;
  isStarting?: boolean;
  isCompleting?: boolean;
}

export function TaskCard({
  task,
  assigneeName,
  onStart,
  onComplete,
  onClick,
  isStarting,
  isCompleting,
}: TaskCardProps) {
  const orchestratorMeta = task.metadata?.orchestrator;
  const canStart = task.status === 'open' && task.assignee;
  const canComplete = task.status === 'in_progress';

  return (
    <div
      className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
      onClick={onClick}
      data-testid={`task-card-${task.id}`}
    >
      {/* Header - Title and Type */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-[var(--color-text)] truncate" title={task.title}>
            {task.title}
          </h3>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 font-mono">
            {task.id}
          </p>
        </div>
        <button
          className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)] rounded transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            // TODO: Open menu
          }}
          data-testid="task-card-menu"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Badges Row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <TaskStatusBadge
          status={task.status}
          mergeStatus={orchestratorMeta?.mergeStatus}
        />
        {task.status === 'review' && (orchestratorMeta?.mergeStatus === 'testing' || orchestratorMeta?.mergeStatus === 'merging') && (
          <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400" title="Steward reviewing">
            <Bot className="w-3.5 h-3.5 animate-pulse" />
            Reviewing
          </span>
        )}
        {task.status === 'closed' && orchestratorMeta?.mergeStatus === 'merged' && (
          <span className="inline-flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
            <GitMerge className="w-3.5 h-3.5" />
            Merged
          </span>
        )}
        {task.status === 'closed' && orchestratorMeta?.mergeStatus && orchestratorMeta.mergeStatus !== 'merged' && (
          <span className="inline-flex items-center text-orange-500 dark:text-orange-400" title="Closed but not merged">
            <AlertTriangle className="w-3.5 h-3.5" />
          </span>
        )}
        <TaskPriorityBadge priority={task.priority} />
        <TaskTypeBadge taskType={task.taskType} />
      </div>

      {/* Assignee */}
      {task.assignee && (
        <div className="flex items-center gap-2 mb-2 text-xs text-[var(--color-text-secondary)]">
          <User className="w-3.5 h-3.5" />
          <span>{assigneeName || task.assignee}</span>
        </div>
      )}

      {/* Branch (if has orchestrator metadata) */}
      {orchestratorMeta?.branch && (
        <div className="flex items-center gap-2 mb-2 text-xs text-[var(--color-text-secondary)]">
          <GitBranch className="w-3.5 h-3.5" />
          <span className="truncate font-mono" title={orchestratorMeta.branch}>
            {orchestratorMeta.branch}
          </span>
        </div>
      )}

      {/* Timestamps Row */}
      <div className="flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
        {task.deadline && (
          <div className="flex items-center gap-1" title="Deadline">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(task.deadline)}</span>
          </div>
        )}
        <div className="flex items-center gap-1" title="Updated">
          <Clock className="w-3 h-3" />
          <span>{formatDate(task.updatedAt)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      {(canStart || canComplete) && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
          {canStart && onStart && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStart();
              }}
              disabled={isStarting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[var(--color-primary)] bg-[var(--color-primary-muted)] rounded hover:bg-[var(--color-primary-muted)]/80 disabled:opacity-50 transition-colors"
              data-testid="task-start-button"
            >
              <Play className="w-3 h-3" />
              {isStarting ? 'Starting...' : 'Start'}
            </button>
          )}
          {canComplete && onComplete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onComplete();
              }}
              disabled={isCompleting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30 rounded hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50 transition-colors"
              data-testid="task-complete-button"
            >
              <CheckCircle2 className="w-3 h-3" />
              {isCompleting ? 'Completing...' : 'Complete'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
