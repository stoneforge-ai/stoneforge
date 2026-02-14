/**
 * MergeRequestCard - Card component for displaying merge request in list view
 *
 * Features:
 * - Colored left border indicating merge status
 * - Status pill + task title + relative time
 * - Branch name + PR number
 * - Agent avatar + test summary
 * - Manage dropdown (status update + delete)
 */

import { GitBranch, Bot, ExternalLink, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { Task } from '../../api/types';
import { MergeStatusBadge } from '../task';
import { getMergeStatusColor } from '../../api/hooks/useMergeRequests';
import { MergeRequestManageDropdown } from './MergeRequestManageDropdown';

interface MergeRequestCardProps {
  task: Task;
  assigneeName?: string;
  onClick?: () => void;
  isSelected?: boolean;
  onDeleted?: () => void;
}

export function MergeRequestCard({
  task,
  assigneeName,
  onClick,
  isSelected,
  onDeleted,
}: MergeRequestCardProps) {
  const orchestratorMeta = task.metadata?.orchestrator;
  const mergeStatus = orchestratorMeta?.mergeStatus;
  const testResult = orchestratorMeta?.lastTestResult;
  const branch = orchestratorMeta?.branch;

  const statusColors = mergeStatus ? getMergeStatusColor(mergeStatus) : null;

  return (
    <div
      className={`
        relative flex flex-col p-4 border rounded-lg cursor-pointer
        transition-all duration-150 ease-out
        ${isSelected
          ? 'bg-[var(--color-primary-muted)] border-[var(--color-primary)]'
          : 'bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border-hover)]'
        }
      `}
      onClick={onClick}
      data-testid={`merge-request-card-${task.id}`}
    >
      {/* Status border indicator */}
      {statusColors && (
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${statusColors.border.replace('border-', 'bg-')}`}
        />
      )}

      {/* Header Row: Status + Title + Time + Manage */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {mergeStatus && <MergeStatusBadge status={mergeStatus} />}
          <h3 className="text-sm font-medium text-[var(--color-text)] truncate" title={task.title}>
            {task.title}
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-[var(--color-text-tertiary)] whitespace-nowrap">
            {formatRelativeTime(task.updatedAt)}
          </span>
          <MergeRequestManageDropdown task={task} onDeleted={onDeleted} />
        </div>
      </div>

      {/* Second Row: Branch + PR */}
      <div className="flex items-center gap-2 mb-2 text-xs text-[var(--color-text-secondary)]">
        {branch && (
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
            <span className="font-mono truncate max-w-[200px]" title={branch}>
              {branch}
            </span>
            {branch !== 'main' && branch !== 'master' && (
              <>
                <span className="text-[var(--color-text-tertiary)]">&rarr;</span>
                <span className="font-mono">main</span>
              </>
            )}
          </div>
        )}
        {orchestratorMeta?.mergeRequestUrl && (
          <>
            <span className="text-[var(--color-text-tertiary)]">&bull;</span>
            <a
              href={orchestratorMeta.mergeRequestUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[var(--color-primary)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              <span>View MR</span>
            </a>
          </>
        )}
      </div>

      {/* Third Row: Agent + Test Summary */}
      <div className="flex items-center justify-between gap-4 text-xs">
        {/* Agent */}
        <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
          <Bot className="w-3.5 h-3.5 text-purple-500" />
          <span>{assigneeName || task.assignee || 'Unassigned'}</span>
        </div>

        {/* Test Summary */}
        {testResult && (
          <div className="flex items-center gap-1.5">
            {testResult.passed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-red-500" />
            )}
            <span className={testResult.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {testResult.totalTests !== undefined ? (
                <>
                  {testResult.passedTests ?? 0}/{testResult.totalTests} tests passed
                </>
              ) : (
                testResult.passed ? 'Tests passed' : 'Tests failed'
              )}
            </span>
          </div>
        )}

        {/* Show pending indicator if no test results */}
        {!testResult && mergeStatus === 'pending' && (
          <div className="flex items-center gap-1.5 text-[var(--color-text-tertiary)]">
            <Clock className="w-3.5 h-3.5" />
            <span>Awaiting review</span>
          </div>
        )}

        {/* Show running indicator for testing status */}
        {mergeStatus === 'testing' && (
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Running tests...</span>
          </div>
        )}

        {/* Show merging indicator */}
        {mergeStatus === 'merging' && (
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Merging...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
