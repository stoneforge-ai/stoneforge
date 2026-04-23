/**
 * @stoneforge/ui Workflow Progress Bar
 *
 * Displays workflow progress with a visual bar.
 * Supports both simple percentage and detailed segment views.
 */

import type { WorkflowProgress } from '../types';
import { PROGRESS_COLORS } from '../constants';

interface ProgressBarProps {
  /** Progress data */
  progress: WorkflowProgress;
  /** Whether to show the label with counts */
  showLabel?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show segmented progress (completed, in progress, blocked) */
  showSegments?: boolean;
}

export function ProgressBar({
  progress,
  showLabel = true,
  size = 'md',
  showSegments = false,
}: ProgressBarProps) {
  const { percentage, completed, inProgress, blocked, open, total } = progress;

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3',
  };

  const height = heightClasses[size];

  if (showSegments && total > 0) {
    // Calculate segment widths
    const completedWidth = (completed / total) * 100;
    const inProgressWidth = (inProgress / total) * 100;
    const blockedWidth = (blocked / total) * 100;

    return (
      <div data-testid="workflow-progress-bar" className="space-y-2">
        <div className={`flex ${height} bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden`}>
          {completedWidth > 0 && (
            <div
              className={`${PROGRESS_COLORS.completed} transition-all duration-500`}
              style={{ width: `${completedWidth}%` }}
              title={`Completed: ${completed}`}
            />
          )}
          {inProgressWidth > 0 && (
            <div
              className={`${PROGRESS_COLORS.inProgress} transition-all duration-500`}
              style={{ width: `${inProgressWidth}%` }}
              title={`In Progress: ${inProgress}`}
            />
          )}
          {blockedWidth > 0 && (
            <div
              className={`${PROGRESS_COLORS.blocked} transition-all duration-500`}
              style={{ width: `${blockedWidth}%` }}
              title={`Blocked: ${blocked}`}
            />
          )}
        </div>
        {showLabel && (
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${PROGRESS_COLORS.completed}`} />
              <span className="text-[var(--color-text-secondary)]">
                Completed ({completed})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${PROGRESS_COLORS.inProgress}`} />
              <span className="text-[var(--color-text-secondary)]">
                In Progress ({inProgress})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${PROGRESS_COLORS.blocked}`} />
              <span className="text-[var(--color-text-secondary)]">
                Blocked ({blocked})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${PROGRESS_COLORS.open}`} />
              <span className="text-[var(--color-text-secondary)]">
                Open ({open})
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Simple progress bar
  return (
    <div data-testid="workflow-progress-bar" className="flex items-center gap-2">
      <div className={`flex-1 bg-gray-200 dark:bg-gray-700 rounded-full ${height} overflow-hidden`}>
        <div
          className={`${height} bg-green-500 rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
          data-testid="workflow-progress-bar-fill"
        />
      </div>
      {showLabel && (
        <span
          data-testid="workflow-progress-label"
          className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
        >
          {completed}/{total} ({Math.round(percentage)}%)
        </span>
      )}
    </div>
  );
}
