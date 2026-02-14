/**
 * MergeRequestActions - Context-aware action buttons
 *
 * Actions vary based on merge status:
 * - pending: Merge, Run Tests, View MR
 * - testing/merging: (waiting), View MR
 * - merged: View MR, View Diff
 * - conflict/failed: Create Fix Task, View Conflicts, View MR
 * - test_failed: Create Fix Task, Re-run Tests, View Logs
 */

import { useState } from 'react';
import {
  GitMerge,
  FlaskConical,
  ExternalLink,
  AlertCircle,
  Loader2,
  Wrench,
  RefreshCw,
  FileCode,
} from 'lucide-react';
import type { Task } from '../../api/types';
import {
  canMerge,
  canRunTests,
  canCreateFixTask,
  useMergeMutation,
  useRunTestsMutation,
  useCreateFixTaskMutation,
} from '../../api/hooks/useMergeRequests';

interface MergeRequestActionsProps {
  task: Task;
  onViewMergeRequest?: () => void;
  onViewDiff?: () => void;
  onViewConflicts?: () => void;
  onViewLogs?: () => void;
  variant?: 'default' | 'compact';
}

export function MergeRequestActions({
  task,
  onViewMergeRequest,
  onViewDiff,
  onViewConflicts,
  onViewLogs,
  variant = 'default',
}: MergeRequestActionsProps) {
  const mergeStatus = task.metadata?.orchestrator?.mergeStatus;
  const mergeMutation = useMergeMutation();
  const runTestsMutation = useRunTestsMutation();
  const createFixTaskMutation = useCreateFixTaskMutation();

  const [showFixTaskDialog, setShowFixTaskDialog] = useState(false);

  const isTransient = mergeStatus === 'testing' || mergeStatus === 'merging';

  const handleMerge = async () => {
    await mergeMutation.mutateAsync({ taskId: task.id });
  };

  const handleRunTests = async () => {
    await runTestsMutation.mutateAsync({ taskId: task.id });
  };

  const handleCreateFixTask = async (reason: string) => {
    await createFixTaskMutation.mutateAsync({ taskId: task.id, reason });
    setShowFixTaskDialog(false);
  };

  const buttonClass = variant === 'compact'
    ? 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50'
    : 'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50';

  return (
    <div className="space-y-3" data-testid="merge-request-actions">
      {/* Primary Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Merge Button (pending only) */}
        {canMerge(task) && (
          <button
            onClick={handleMerge}
            disabled={mergeMutation.isPending}
            className={`${buttonClass} bg-green-600 text-white hover:bg-green-700 disabled:hover:bg-green-600`}
            data-testid="merge-button"
          >
            {mergeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitMerge className="w-4 h-4" />
            )}
            <span>{mergeMutation.isPending ? 'Merging...' : 'Merge'}</span>
          </button>
        )}

        {/* Run Tests Button (pending or test_failed) */}
        {canRunTests(task) && (
          <button
            onClick={handleRunTests}
            disabled={runTestsMutation.isPending}
            className={`${buttonClass} bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]`}
            data-testid="run-tests-button"
          >
            {runTestsMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mergeStatus === 'test_failed' ? (
              <RefreshCw className="w-4 h-4" />
            ) : (
              <FlaskConical className="w-4 h-4" />
            )}
            <span>
              {runTestsMutation.isPending
                ? 'Running...'
                : mergeStatus === 'test_failed'
                ? 'Re-run Tests'
                : 'Run Tests'}
            </span>
          </button>
        )}

        {/* Create Fix Task Button (conflict, test_failed, failed) */}
        {canCreateFixTask(task) && (
          <button
            onClick={() => setShowFixTaskDialog(true)}
            disabled={createFixTaskMutation.isPending}
            className={`${buttonClass} bg-amber-600 text-white hover:bg-amber-700`}
            data-testid="create-fix-task-button"
          >
            {createFixTaskMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wrench className="w-4 h-4" />
            )}
            <span>Create Fix Task</span>
          </button>
        )}

        {/* Transient State Indicator */}
        {isTransient && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{mergeStatus === 'testing' ? 'Tests running...' : 'Merge in progress...'}</span>
          </div>
        )}
      </div>

      {/* Secondary Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* View MR */}
        {onViewMergeRequest && (
          <button
            onClick={onViewMergeRequest}
            className={`${buttonClass} bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] border border-[var(--color-border)]`}
            data-testid="view-mr-button"
          >
            <ExternalLink className="w-4 h-4" />
            <span>View MR</span>
          </button>
        )}

        {/* View Diff (merged only) */}
        {mergeStatus === 'merged' && onViewDiff && (
          <button
            onClick={onViewDiff}
            className={`${buttonClass} bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] border border-[var(--color-border)]`}
            data-testid="view-diff-button"
          >
            <FileCode className="w-4 h-4" />
            <span>View Diff</span>
          </button>
        )}

        {/* View Conflicts (conflict only) */}
        {mergeStatus === 'conflict' && onViewConflicts && (
          <button
            onClick={onViewConflicts}
            className={`${buttonClass} bg-[var(--color-surface-elevated)] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800`}
            data-testid="view-conflicts-button"
          >
            <AlertCircle className="w-4 h-4" />
            <span>View Conflicts</span>
          </button>
        )}

        {/* View Logs (test_failed only) */}
        {mergeStatus === 'test_failed' && onViewLogs && (
          <button
            onClick={onViewLogs}
            className={`${buttonClass} bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] border border-[var(--color-border)]`}
            data-testid="view-logs-button"
          >
            <FileCode className="w-4 h-4" />
            <span>View Logs</span>
          </button>
        )}
      </div>

      {/* Error Display */}
      {(mergeMutation.isError || runTestsMutation.isError || createFixTaskMutation.isError) && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              {mergeMutation.error?.message ||
                runTestsMutation.error?.message ||
                createFixTaskMutation.error?.message}
            </span>
          </div>
        </div>
      )}

      {/* Create Fix Task Dialog */}
      {showFixTaskDialog && (
        <CreateFixTaskDialog
          task={task}
          onSubmit={handleCreateFixTask}
          onCancel={() => setShowFixTaskDialog(false)}
          isSubmitting={createFixTaskMutation.isPending}
        />
      )}
    </div>
  );
}

// ============================================================================
// Create Fix Task Dialog
// ============================================================================

interface CreateFixTaskDialogProps {
  task: Task;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function CreateFixTaskDialog({
  task,
  onSubmit,
  onCancel,
  isSubmitting,
}: CreateFixTaskDialogProps) {
  const [reason, setReason] = useState(() => {
    const mergeStatus = task.metadata?.orchestrator?.mergeStatus;
    const testResult = task.metadata?.orchestrator?.lastTestResult;

    if (mergeStatus === 'conflict') {
      return 'Fix merge conflicts';
    } else if (mergeStatus === 'test_failed' && testResult?.errorMessage) {
      return `Fix test failures: ${testResult.errorMessage}`;
    } else if (mergeStatus === 'test_failed') {
      return 'Fix failing tests';
    } else if (mergeStatus === 'failed') {
      const failureReason = task.metadata?.orchestrator?.mergeFailureReason;
      return failureReason ? `Fix: ${failureReason}` : 'Fix merge failure';
    }
    return '';
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="create-fix-task-dialog">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">
          Create Fix Task
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Create a new task assigned to the same agent to fix the issues with this merge request.
        </p>

        <div className="mb-4">
          <label
            htmlFor="fix-reason"
            className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
          >
            Reason / Description
          </label>
          <textarea
            id="fix-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent resize-none"
            placeholder="Describe what needs to be fixed..."
            data-testid="fix-reason-input"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            data-testid="fix-task-cancel"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(reason)}
            disabled={isSubmitting || !reason.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:hover:bg-amber-600"
            data-testid="fix-task-submit"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Wrench className="w-4 h-4" />
                Create Fix Task
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
