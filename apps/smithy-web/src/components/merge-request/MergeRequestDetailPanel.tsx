/**
 * MergeRequestDetailPanel - Slide-over panel with full merge request details
 *
 * Sections:
 * - Header: Back/close buttons, title
 * - Status badge (large, prominent)
 * - Task info (title, status, priority, description)
 * - Git info (branch, PR, agent)
 * - Test results (progress bar, counts)
 * - Timeline (completed, tests started, etc.)
 * - Merge failure section (if any)
 */

import {
  X,
  ArrowLeft,
  GitBranch,
  GitMerge,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  FileCode,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react';
import { useMergeRequest } from '../../api/hooks/useMergeRequests';
import { useAllEntities } from '../../api/hooks/useAllElements';
import { MergeStatusBadge, TaskStatusBadge, TaskPriorityBadge } from '../task';
import { TestResultsDisplay } from './TestResultsDisplay';
import { getMergeStatusColor } from '../../api/hooks/useMergeRequests';
import { MergeRequestManageDropdown } from './MergeRequestManageDropdown';

interface MergeRequestDetailPanelProps {
  taskId: string;
  onClose: () => void;
  onBack?: () => void;
  onDeleted?: () => void;
}

export function MergeRequestDetailPanel({
  taskId,
  onClose,
  onBack,
  onDeleted,
}: MergeRequestDetailPanelProps) {
  const { data: task, isLoading, error } = useMergeRequest(taskId);
  const { data: entities } = useAllEntities();

  const assigneeName = task?.assignee && entities
    ? entities.find((e) => e.id === task.assignee)?.name
    : undefined;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-surface)]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
          <span className="text-sm text-[var(--color-text-secondary)]">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--color-surface)]">
        <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-2" />
        <span className="text-sm text-[var(--color-text-secondary)]">
          {error?.message || 'Merge request not found'}
        </span>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 text-sm text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] rounded-md"
        >
          Close
        </button>
      </div>
    );
  }

  const orchestratorMeta = task.metadata?.orchestrator;
  const mergeStatus = orchestratorMeta?.mergeStatus;
  const testResult = orchestratorMeta?.lastTestResult;
  const branch = orchestratorMeta?.branch;
  const statusColors = mergeStatus ? getMergeStatusColor(mergeStatus) : null;

  return (
    <div className="h-full flex flex-col bg-[var(--color-surface)]" data-testid="merge-request-detail-panel">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
              aria-label="Back to list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Merge Request</h2>
        </div>
        <div className="flex items-center gap-1">
          {task && (
            <MergeRequestManageDropdown
              task={task}
              onDeleted={() => {
                onDeleted?.();
                onClose();
              }}
            />
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Status Section */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            {mergeStatus && (
              <div className={`px-3 py-1.5 rounded-md ${statusColors?.bg} ${statusColors?.text}`}>
                <MergeStatusBadge status={mergeStatus} />
              </div>
            )}
          </div>
          <h3 className="text-xl font-semibold text-[var(--color-text)] mb-1">{task.title}</h3>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{task.id}</p>
        </div>

        {/* Task Section */}
        <div className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]">
          <h4 className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-3 flex items-center gap-2">
            <ClipboardList className="w-3.5 h-3.5" />
            Task
          </h4>
          <div className="space-y-3">
            {/* Title */}
            <div>
              <span className="text-xs text-[var(--color-text-tertiary)]">Title</span>
              <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">{task.title}</p>
            </div>

            {/* Status & Priority row */}
            <div className="flex items-center gap-4">
              <div>
                <span className="text-xs text-[var(--color-text-tertiary)]">Status</span>
                <div className="mt-0.5">
                  <TaskStatusBadge status={task.status} />
                </div>
              </div>
              <div>
                <span className="text-xs text-[var(--color-text-tertiary)]">Priority</span>
                <div className="mt-0.5">
                  <TaskPriorityBadge priority={task.priority} />
                </div>
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <div>
                <span className="text-xs text-[var(--color-text-tertiary)]">Description</span>
                <p className="text-sm text-[var(--color-text)] mt-0.5 whitespace-pre-wrap line-clamp-4">
                  {task.description}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Git Info Section */}
        <div className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]">
          <h4 className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
            Git Info
          </h4>
          <div className="space-y-3">
            {/* Branch */}
            {branch && (
              <div className="flex items-center gap-2 text-sm">
                <GitBranch className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                <code className="font-mono text-[var(--color-text)]">{branch}</code>
                <span className="text-[var(--color-text-tertiary)]">&rarr;</span>
                <code className="font-mono text-[var(--color-text)]">main</code>
              </div>
            )}

            {/* Agent */}
            <div className="flex items-center gap-2 text-sm">
              <Bot className="w-4 h-4 text-purple-500" />
              <span className="text-[var(--color-text)]">
                {assigneeName || task.assignee || 'Unassigned'}
              </span>
            </div>

            {/* Merge Request URL */}
            {orchestratorMeta?.mergeRequestUrl && (
              <div className="flex items-center gap-2 text-sm">
                <GitMerge className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                <a
                  href={orchestratorMeta.mergeRequestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-primary)] hover:underline truncate"
                >
                  {orchestratorMeta.mergeRequestUrl}
                </a>
              </div>
            )}

            {/* Session */}
            {orchestratorMeta?.sessionId && (
              <div className="flex items-center gap-2 text-sm">
                <FileCode className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                <span className="text-[var(--color-text-secondary)]">Session:</span>
                <code className="font-mono text-xs text-[var(--color-text-tertiary)]">
                  {orchestratorMeta.sessionId}
                </code>
              </div>
            )}
          </div>
        </div>

        {/* Test Results Section */}
        {testResult && (
          <div className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]">
            <h4 className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
              Test Results
            </h4>
            <TestResultsDisplay result={testResult} />
            {orchestratorMeta?.testRunCount && orchestratorMeta.testRunCount > 1 && (
              <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                Test run #{orchestratorMeta.testRunCount}
              </p>
            )}
          </div>
        )}

        {/* Merge Failure Section */}
        {orchestratorMeta?.mergeFailureReason && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                  Merge Failed
                </h4>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {orchestratorMeta.mergeFailureReason}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Timeline Section */}
        <div className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]">
          <h4 className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
            Timeline
          </h4>
          <div className="space-y-3">
            {/* Completed */}
            {orchestratorMeta?.completedAt && (
              <TimelineItem
                icon={<CheckCircle2 className="w-4 h-4" />}
                color="text-green-500"
                label="Task completed"
                time={orchestratorMeta.completedAt}
              />
            )}

            {/* Test Result */}
            {testResult?.completedAt && (
              <TimelineItem
                icon={testResult.passed ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                color={testResult.passed ? 'text-green-500' : 'text-red-500'}
                label={testResult.passed ? 'Tests passed' : 'Tests failed'}
                time={testResult.completedAt}
              />
            )}

            {/* Merged */}
            {orchestratorMeta?.mergedAt && (
              <TimelineItem
                icon={<GitMerge className="w-4 h-4" />}
                color="text-purple-500"
                label="Merged to main"
                time={orchestratorMeta.mergedAt}
              />
            )}

            {/* Task timestamps */}
            <TimelineItem
              icon={<Clock className="w-4 h-4" />}
              color="text-[var(--color-text-tertiary)]"
              label="Created"
              time={task.createdAt}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

// ============================================================================
// Timeline Item Component
// ============================================================================

interface TimelineItemProps {
  icon: React.ReactNode;
  color: string;
  label: string;
  time: string;
}

function TimelineItem({ icon, color, label, time }: TimelineItemProps) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className={color}>{icon}</div>
      <span className="text-[var(--color-text)]">{label}</span>
      <span className="text-[var(--color-text-tertiary)] text-xs ml-auto" title={formatDateTime(time)}>
        {formatRelativeTime(time)}
      </span>
    </div>
  );
}

// ============================================================================
// Date Formatting
// ============================================================================

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
