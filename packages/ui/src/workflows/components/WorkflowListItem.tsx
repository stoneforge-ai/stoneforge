/**
 * @stoneforge/ui Workflow List Item
 *
 * Card component for displaying a workflow in a list view.
 */

import { ChevronRight } from 'lucide-react';
import type { Workflow } from '../types';
import { formatRelativeTime, formatDate } from '../utils';
import { StatusBadge } from './StatusBadge';

interface WorkflowListItemProps {
  workflow: Workflow;
  isSelected?: boolean;
  onClick?: (id: string) => void;
}

export function WorkflowListItem({
  workflow,
  isSelected = false,
  onClick,
}: WorkflowListItemProps) {
  return (
    <div
      data-testid={`workflow-item-${workflow.id}`}
      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
          : 'bg-white dark:bg-[var(--color-surface)] border-gray-200 dark:border-[var(--color-border)] hover:border-gray-300 dark:hover:border-[var(--color-border-hover)] hover:bg-gray-50 dark:hover:bg-[var(--color-surface-hover)]'
      }`}
      onClick={() => onClick?.(workflow.id)}
    >
      <div className="flex items-start justify-between mb-2">
        <h3
          data-testid="workflow-item-title"
          className="font-medium text-gray-900 dark:text-[var(--color-text)] truncate flex-1"
        >
          {workflow.title}
        </h3>
        <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2" />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <StatusBadge status={workflow.status} />
        {workflow.ephemeral && (
          <span className="text-xs text-gray-600 dark:text-[var(--color-text-secondary)] bg-gray-100 dark:bg-[var(--color-surface-hover)] px-1.5 py-0.5 rounded">
            Ephemeral
          </span>
        )}
        <span className="text-xs text-gray-500 dark:text-[var(--color-text-tertiary)]" title={formatDate(workflow.updatedAt)}>
          Updated {formatRelativeTime(workflow.updatedAt)}
        </span>
      </div>

      {workflow.tags && workflow.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {workflow.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-[var(--color-surface-hover)] text-gray-600 dark:text-[var(--color-text-secondary)] rounded"
            >
              {tag}
            </span>
          ))}
          {workflow.tags.length > 3 && (
            <span className="text-xs text-gray-400 dark:text-[var(--color-text-tertiary)]">+{workflow.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}
