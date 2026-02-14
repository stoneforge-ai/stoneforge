/**
 * PlanListItem - Desktop card for plan display in list view
 */

import { ChevronRight } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { highlightMatches, formatRelativeTime, formatDate } from '../utils';
import type { HydratedPlan } from '../types';

interface PlanListItemProps {
  plan: HydratedPlan;
  isSelected: boolean;
  onClick: (id: string) => void;
  searchMatchIndices?: number[];
  /** Optional ProgressRing component to render */
  progressRing?: React.ReactNode;
}

export function PlanListItem({
  plan,
  isSelected,
  onClick,
  searchMatchIndices,
  progressRing,
}: PlanListItemProps) {
  const progress = plan._progress;
  const hasProgress = progress && progress.totalTasks > 0;

  // Render title with optional search highlighting
  const titleContent = searchMatchIndices && searchMatchIndices.length > 0
    ? highlightMatches(plan.title, searchMatchIndices)
    : plan.title;

  return (
    <div
      data-testid={`plan-item-${plan.id}`}
      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
          : 'bg-white dark:bg-[var(--color-surface)] border-gray-200 dark:border-[var(--color-border)] hover:border-gray-300 dark:hover:border-[var(--color-border-hover)] hover:bg-gray-50 dark:hover:bg-[var(--color-surface-hover)]'
      }`}
      onClick={() => onClick(plan.id)}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left side: Title and metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <h3
              data-testid="plan-item-title"
              className="font-medium text-gray-900 dark:text-[var(--color-text)] truncate flex-1"
            >
              {titleContent}
            </h3>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status={plan.status} />
            <span className="text-xs text-gray-500 dark:text-[var(--color-text-tertiary)]" title={formatDate(plan.updatedAt)}>
              Updated {formatRelativeTime(plan.updatedAt)}
            </span>
          </div>

          {plan.tags && plan.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {plan.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-[var(--color-surface-hover)] text-gray-600 dark:text-[var(--color-text-secondary)] rounded"
                >
                  {tag}
                </span>
              ))}
              {plan.tags.length > 3 && (
                <span className="text-xs text-gray-400 dark:text-[var(--color-text-tertiary)]">+{plan.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Right side: Progress ring (mini, 32px) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {progressRing ? (
            progressRing
          ) : hasProgress ? (
            <div
              className="w-8 h-8 rounded-full border-2 border-blue-500 flex items-center justify-center"
              title={`${progress.completionPercentage}% complete`}
              data-testid={`plan-progress-${plan.id}`}
            >
              <span className="text-[10px] text-blue-500 font-medium">{progress.completionPercentage}%</span>
            </div>
          ) : (
            <div
              className="w-8 h-8 rounded-full border-2 border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center"
              title="No tasks in plan"
              data-testid={`plan-progress-empty-${plan.id}`}
            >
              <span className="text-[8px] text-gray-400 dark:text-gray-500">--</span>
            </div>
          )}
          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        </div>
      </div>
    </div>
  );
}
