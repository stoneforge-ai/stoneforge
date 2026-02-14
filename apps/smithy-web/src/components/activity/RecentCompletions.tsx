/**
 * RecentCompletions - Compact list of tasks completed in the last 24 hours
 */

import { CheckCircle, GitMerge, Clock, ArrowRight } from 'lucide-react';
import { useTasksByStatus } from '../../api/hooks/useTasks.js';
import { useAgentsByRole } from '../../api/hooks/useAgents.js';
import { formatRelativeTime } from '../../api/hooks/useActivity.js';
import type { Task } from '../../api/types.js';

const MAX_ITEMS = 8;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function getMergeStatusBadge(task: Task): { label: string; color: string } | null {
  const meta = task.metadata?.orchestrator;
  if (!meta?.mergeStatus) return null;

  switch (meta.mergeStatus) {
    case 'merged':
      return { label: 'Merged', color: 'text-[var(--color-success)] bg-[var(--color-success-muted)]' };
    case 'pending':
      return { label: 'Pending merge', color: 'text-[var(--color-warning)] bg-[var(--color-warning-muted)]' };
    case 'conflict':
      return { label: 'Conflict', color: 'text-[var(--color-error)] bg-[var(--color-error-muted)]' };
    default:
      return { label: meta.mergeStatus, color: 'text-[var(--color-text-secondary)] bg-[var(--color-surface)]' };
  }
}

export function RecentCompletions() {
  const { closed } = useTasksByStatus();
  const { allAgents } = useAgentsByRole();

  // Filter to last 24h and take max items
  const now = Date.now();
  const recentTasks = closed
    .filter((t) => {
      const closedTime = t.closedAt ? new Date(t.closedAt).getTime() : 0;
      return now - closedTime < TWENTY_FOUR_HOURS;
    })
    .sort((a, b) => {
      const aTime = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const bTime = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return bTime - aTime; // newest first
    })
    .slice(0, MAX_ITEMS);

  // Agent name lookup
  const agentNameMap = new Map(allAgents.map((a) => [a.id, a.name]));

  if (recentTasks.length === 0) {
    return null; // Don't render section if no recent completions
  }

  return (
    <div data-testid="recent-completions">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Recent Completions
        </h2>
        <a
          href="/tasks?status=closed"
          className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1"
        >
          View all
          <ArrowRight className="w-3 h-3" />
        </a>
      </div>

      <div className="space-y-1">
        {recentTasks.map((task) => {
          const assigneeName = task.assignee ? agentNameMap.get(task.assignee) : undefined;
          const mergeBadge = getMergeStatusBadge(task);
          const closedAt = task.closedAt || task.updatedAt;

          return (
            <div
              key={task.id}
              className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-[var(--color-surface-hover)] transition-colors duration-150 text-xs"
            >
              {mergeBadge?.label === 'Merged' ? (
                <GitMerge className="w-3.5 h-3.5 text-[var(--color-success)] flex-shrink-0" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5 text-[var(--color-success)] flex-shrink-0" />
              )}

              <span className="font-medium text-[var(--color-text)] flex-shrink-0">
                {task.externalRef || task.id}
              </span>

              <span className="text-[var(--color-text-secondary)] truncate flex-1">
                {task.title}
              </span>

              {assigneeName && (
                <span className="text-[var(--color-text-tertiary)] flex-shrink-0">
                  {assigneeName}
                </span>
              )}

              <span className="text-[var(--color-text-tertiary)] flex-shrink-0">
                {formatRelativeTime(closedAt)}
              </span>

              {mergeBadge && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${mergeBadge.color}`}
                >
                  {mergeBadge.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
