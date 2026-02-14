/**
 * MobileTaskCard - Card-based task display for mobile devices
 *
 * A touch-friendly task card designed for mobile list views.
 * Shows key task information in a compact, readable format.
 *
 * Features:
 * - Minimum 44px touch target
 * - Status and priority badges
 * - Truncated title with ID
 * - Assignee display
 * - Search highlighting support
 */

import { useMemo } from 'react';
import { CheckSquare, Square } from 'lucide-react';

interface Task {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  complexity: number;
  taskType: string;
  assignee?: string;
  tags: string[];
}

interface MobileTaskCardProps {
  task: Task;
  isSelected: boolean;
  isChecked: boolean;
  onCheck: (checked: boolean) => void;
  onClick: () => void;
  searchQuery?: string;
}

const PRIORITY_LABELS: Record<number, { label: string; color: string; border: string }> = {
  1: { label: 'Critical', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', border: 'border-l-red-500' },
  2: { label: 'High', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', border: 'border-l-orange-500' },
  3: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', border: 'border-l-yellow-500' },
  4: { label: 'Low', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', border: 'border-l-green-500' },
  5: { label: 'Trivial', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300', border: 'border-l-gray-400' },
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300',
  deferred: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300',
};

/**
 * Fuzzy search function that matches query characters in sequence within the title.
 */
function fuzzySearch(title: string, query: string): { matched: boolean; indices: number[] } | null {
  if (!query) return { matched: true, indices: [] };

  const lowerTitle = title.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const indices: number[] = [];
  let queryIdx = 0;

  for (let i = 0; i < lowerTitle.length && queryIdx < lowerQuery.length; i++) {
    if (lowerTitle[i] === lowerQuery[queryIdx]) {
      indices.push(i);
      queryIdx++;
    }
  }

  if (queryIdx === lowerQuery.length) {
    return { matched: true, indices };
  }

  return null;
}

/**
 * Highlights matched characters in a title based on match indices.
 */
function highlightMatches(title: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) {
    return <>{title}</>;
  }

  const result: React.ReactNode[] = [];
  const indexSet = new Set(indices);
  let lastIndex = 0;

  for (let i = 0; i < title.length; i++) {
    if (indexSet.has(i)) {
      if (i > lastIndex) {
        result.push(<span key={`text-${lastIndex}`}>{title.slice(lastIndex, i)}</span>);
      }
      result.push(
        <mark key={`match-${i}`} className="bg-yellow-200 text-gray-900 dark:bg-yellow-700 dark:text-white rounded-sm px-0.5">
          {title[i]}
        </mark>
      );
      lastIndex = i + 1;
    }
  }

  if (lastIndex < title.length) {
    result.push(<span key={`text-${lastIndex}`}>{title.slice(lastIndex)}</span>);
  }

  return <>{result}</>;
}

export function MobileTaskCard({
  task,
  isSelected,
  isChecked,
  onCheck,
  onClick,
  searchQuery,
}: MobileTaskCardProps) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;

  // Compute highlighted title based on search query
  const highlightedTitle = useMemo(() => {
    if (!searchQuery) return task.title;
    const searchResult = fuzzySearch(task.title, searchQuery);
    if (searchResult && searchResult.indices.length > 0) {
      return highlightMatches(task.title, searchResult.indices);
    }
    return task.title;
  }, [task.title, searchQuery]);

  const handleCheckboxClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    onCheck(!isChecked);
  };

  return (
    <div
      className={`
        relative flex gap-3 p-3 border-l-4 ${priority.border}
        bg-[var(--color-surface)] border-b border-[var(--color-border)]
        cursor-pointer transition-colors duration-150
        active:bg-[var(--color-surface-hover)]
        ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
      `}
      onClick={onClick}
      data-testid={`mobile-task-card-${task.id}`}
    >
      {/* Checkbox */}
      <button
        onClick={handleCheckboxClick}
        onTouchEnd={handleCheckboxClick}
        className="flex-shrink-0 p-1 -m-1 touch-target"
        data-testid={`mobile-task-checkbox-${task.id}`}
        aria-label={isChecked ? `Deselect task: ${task.title}` : `Select task: ${task.title}`}
      >
        {isChecked ? (
          <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        ) : (
          <Square className="w-5 h-5 text-[var(--color-text-tertiary)]" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <div
          className="font-medium text-[var(--color-text)] line-clamp-2 mb-1"
          data-testid={`mobile-task-title-${task.id}`}
        >
          {highlightedTitle}
        </div>

        {/* ID and meta row */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-xs text-[var(--color-text-muted)] font-mono">
            {task.id}
          </span>
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status badge */}
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${statusColor}`}>
            {task.status.replace('_', ' ')}
          </span>

          {/* Priority badge */}
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${priority.color}`}>
            {priority.label}
          </span>

          {/* Task type */}
          <span className="px-1.5 py-0.5 text-xs bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] rounded capitalize">
            {task.taskType}
          </span>

          {/* Assignee */}
          {task.assignee && (
            <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded truncate max-w-24">
              {task.assignee}
            </span>
          )}
        </div>
      </div>

      {/* Chevron indicator */}
      <div className="flex-shrink-0 self-center text-[var(--color-text-tertiary)]">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
