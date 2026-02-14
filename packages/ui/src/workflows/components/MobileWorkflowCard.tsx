/**
 * @stoneforge/ui Mobile Workflow Card
 *
 * Mobile-optimized card component for displaying a workflow in a list.
 */

import { ChevronRight } from 'lucide-react';
import type { Workflow, WorkflowProgress } from '../types';
import { formatRelativeTime } from '../utils';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';

interface MobileWorkflowCardProps {
  workflow: Workflow;
  progress?: WorkflowProgress;
  onClick?: (id: string) => void;
}

export function MobileWorkflowCard({
  workflow,
  progress,
  onClick,
}: MobileWorkflowCardProps) {
  return (
    <div
      data-testid={`mobile-workflow-card-${workflow.id}`}
      className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg active:bg-[var(--color-surface-hover)] touch-target"
      onClick={() => onClick?.(workflow.id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-[var(--color-text)] truncate">
            {workflow.title}
          </h3>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            Updated {formatRelativeTime(workflow.updatedAt)}
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-[var(--color-text-tertiary)] flex-shrink-0 ml-2" />
      </div>

      {/* Status & Tags */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <StatusBadge status={workflow.status} size="sm" />
        {workflow.ephemeral && (
          <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
            Ephemeral
          </span>
        )}
        {workflow.tags?.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="px-1.5 py-0.5 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] rounded"
          >
            {tag}
          </span>
        ))}
        {workflow.tags && workflow.tags.length > 2 && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            +{workflow.tags.length - 2}
          </span>
        )}
      </div>

      {/* Progress */}
      {progress && progress.total > 0 && (
        <ProgressBar progress={progress} size="sm" showLabel />
      )}
    </div>
  );
}
