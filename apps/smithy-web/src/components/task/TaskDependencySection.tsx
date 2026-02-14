/**
 * TaskDependencySection - Displays task dependencies (blocked by and blocks)
 *
 * Shows:
 * - Tasks that block this task (Blocked By)
 * - Tasks that this task blocks (Blocks)
 * - Progress indicator for resolved blockers
 * - Add/remove dependency functionality
 */

import { useState, useRef, useEffect } from 'react';
import {
  Link2,
  ChevronDown,
  ChevronRight,
  Circle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Loader2,
  Eye,
  PlayCircle,
  Plus,
  X,
  Search,
} from 'lucide-react';
import {
  useTaskDependencies,
  useAddDependency,
  useRemoveDependency,
  type DependencyInfo,
} from '../../api/hooks/useTaskDependencies';
import { useTasks } from '../../api/hooks/useTasks';
import type { TaskStatus, Priority } from '../../api/types';

interface TaskDependencySectionProps {
  taskId: string;
  onNavigateToTask?: (taskId: string) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function TaskDependencySection({ taskId, onNavigateToTask }: TaskDependencySectionProps) {
  const { data, isLoading, error } = useTaskDependencies(taskId);
  const [isBlockedByExpanded, setIsBlockedByExpanded] = useState(true);
  const [isBlocksExpanded, setIsBlocksExpanded] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const addDependency = useAddDependency();
  const removeDependency = useRemoveDependency();

  const blockedBy = data?.blockedBy ?? [];
  const blocks = data?.blocks ?? [];
  const progress = data?.progress ?? { resolved: 0, total: 0 };

  const hasNoDependencies = blockedBy.length === 0 && blocks.length === 0;

  const handleAddBlocker = (blockerId: string) => {
    addDependency.mutate(
      { taskId, blockerId },
      { onSuccess: () => setShowAddModal(false) }
    );
  };

  const handleRemoveBlocker = (blockerId: string) => {
    removeDependency.mutate({ taskId, blockerId });
  };

  // Get existing blocker IDs to exclude from the add modal
  const existingBlockerIds = blockedBy.map((dep) => dep.task.id);

  if (isLoading) {
    return (
      <div className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading dependencies...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]">
        <div className="text-sm text-[var(--color-danger)]">
          Failed to load dependencies: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]"
      data-testid="dependencies-section"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
          <Link2 className="w-3 h-3" />
          Dependencies
        </div>
        {progress.total > 0 && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {progress.resolved}/{progress.total} resolved
          </span>
        )}
      </div>

      {/* Empty State */}
      {hasNoDependencies && (
        <div className="text-sm text-[var(--color-text-tertiary)] mb-3" data-testid="dependencies-empty">
          No dependencies
        </div>
      )}

      {/* Blocked By Section */}
      {blockedBy.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setIsBlockedByExpanded(!isBlockedByExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)] mb-2 hover:text-[var(--color-text)]"
            data-testid="blocked-by-toggle"
          >
            {isBlockedByExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Blocked By ({progress.resolved}/{progress.total} resolved)
          </button>
          {isBlockedByExpanded && (
            <div className="space-y-2" data-testid="blocked-by-list">
              {blockedBy.map((dep) => (
                <DependencyCard
                  key={dep.task.id}
                  dependency={dep}
                  onClick={onNavigateToTask ? () => onNavigateToTask(dep.task.id) : undefined}
                  onRemove={() => handleRemoveBlocker(dep.task.id)}
                  isRemoving={removeDependency.isPending && removeDependency.variables?.blockerId === dep.task.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Blocker Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors w-full mb-4"
        data-testid="add-blocker-btn"
      >
        <Plus className="w-4 h-4" />
        Add Blocker
      </button>

      {/* Blocks Section */}
      {blocks.length > 0 && (
        <div>
          <button
            onClick={() => setIsBlocksExpanded(!isBlocksExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)] mb-2 hover:text-[var(--color-text)]"
            data-testid="blocks-toggle"
          >
            {isBlocksExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Blocks ({blocks.length})
          </button>
          {isBlocksExpanded && (
            <div className="space-y-2" data-testid="blocks-list">
              {blocks.map((dep) => (
                <DependencyCard
                  key={dep.task.id}
                  dependency={dep}
                  onClick={onNavigateToTask ? () => onNavigateToTask(dep.task.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Blocker Modal */}
      <AddBlockerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSelect={handleAddBlocker}
        excludeTaskIds={[taskId, ...existingBlockerIds]}
        isAdding={addDependency.isPending}
      />
    </div>
  );
}

// ============================================================================
// DependencyCard Component
// ============================================================================

interface DependencyCardProps {
  dependency: DependencyInfo;
  onClick?: () => void;
  onRemove?: () => void;
  isRemoving?: boolean;
}

function DependencyCard({ dependency, onClick, onRemove, isRemoving }: DependencyCardProps) {
  const { task } = dependency;
  const isResolved = task.status === 'closed';
  const isClickable = !!onClick;

  return (
    <div
      className={`w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] group ${
        isResolved ? 'opacity-70' : ''
      } ${isClickable ? 'hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-primary)]' : ''} transition-colors`}
      data-testid={`dependency-card-${task.id}`}
    >
      {/* Status Icon */}
      <StatusIcon status={task.status} />

      {/* Title - clickable area */}
      {isClickable ? (
        <button
          onClick={onClick}
          className={`flex-1 text-sm text-[var(--color-text)] truncate text-left hover:text-[var(--color-primary)] ${
            isResolved ? 'line-through' : ''
          }`}
        >
          {task.title}
        </button>
      ) : (
        <span
          className={`flex-1 text-sm text-[var(--color-text)] truncate ${
            isResolved ? 'line-through' : ''
          }`}
        >
          {task.title}
        </span>
      )}

      {/* Priority Badge */}
      <PriorityBadge priority={task.priority} />

      {/* Remove Button (only for blockedBy items with onRemove) */}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={isRemoving}
          className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          aria-label="Remove blocker"
          data-testid={`remove-blocker-${task.id}`}
        >
          {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
        </button>
      )}

      {/* Arrow (only show if clickable and no remove button) */}
      {isClickable && !onRemove && (
        <ArrowRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />
      )}
    </div>
  );
}

// ============================================================================
// Add Blocker Modal
// ============================================================================

interface AddBlockerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (taskId: string) => void;
  excludeTaskIds: string[];
  isAdding: boolean;
}

function AddBlockerModal({ isOpen, onClose, onSelect, excludeTaskIds, isAdding }: AddBlockerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: tasksData, isLoading } = useTasks();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isAdding) {
          onClose();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isAdding, onClose]);

  // Reset search when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter tasks: exclude self, already blockers, and closed tasks
  const availableTasks = (tasksData?.tasks ?? []).filter((task) => {
    if (excludeTaskIds.includes(task.id)) return false;
    if (task.status === 'closed') return false;
    if (searchQuery) {
      return task.title.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="add-blocker-modal">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={() => !isAdding && onClose()} />
      {/* Dialog */}
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col border border-[var(--color-border)]">
        <div className="p-4 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Add Blocking Task</h3>
            <button
              onClick={onClose}
              disabled={isAdding}
              className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] rounded"
              data-testid="add-blocker-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-3">
            Select a task that must be completed before this task can proceed.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              data-testid="add-blocker-search"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-tertiary)]" />
            </div>
          ) : availableTasks.length === 0 ? (
            <div className="text-center py-8 text-[var(--color-text-tertiary)]" data-testid="add-blocker-empty">
              {searchQuery ? 'No tasks match your search' : 'No available tasks to add as blockers'}
            </div>
          ) : (
            <div className="space-y-2">
              {availableTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => onSelect(task.id)}
                  disabled={isAdding}
                  className="w-full flex items-center gap-3 p-3 text-left bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors disabled:opacity-50"
                  data-testid={`add-blocker-item-${task.id}`}
                >
                  <StatusIcon status={task.status} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--color-text)] truncate">
                      {task.title}
                    </div>
                    <div className="text-xs text-[var(--color-text-tertiary)] font-mono">
                      {task.id}
                    </div>
                  </div>
                  <PriorityBadge priority={task.priority} />
                  {isAdding && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Status Icon Component
// ============================================================================

interface StatusIconProps {
  status: TaskStatus;
}

function StatusIcon({ status }: StatusIconProps) {
  switch (status) {
    case 'open':
      return <Circle className="w-4 h-4 text-blue-500" />;
    case 'in_progress':
      return <PlayCircle className="w-4 h-4 text-yellow-500" />;
    case 'blocked':
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case 'review':
      return <Eye className="w-4 h-4 text-purple-500" />;
    case 'closed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'deferred':
      return <Clock className="w-4 h-4 text-gray-500" />;
    default:
      return <Circle className="w-4 h-4 text-gray-400" />;
  }
}

// ============================================================================
// Priority Badge Component
// ============================================================================

interface PriorityBadgeProps {
  priority: Priority;
}

function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = getPriorityConfig(priority);

  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${config.className}`}
      title={config.label}
    >
      P{priority}
    </span>
  );
}

function getPriorityConfig(priority: Priority): { label: string; className: string } {
  switch (priority) {
    case 1:
      return {
        label: 'Critical',
        className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      };
    case 2:
      return {
        label: 'High',
        className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      };
    case 3:
      return {
        label: 'Medium',
        className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      };
    case 4:
      return {
        label: 'Low',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      };
    case 5:
      return {
        label: 'Minimal',
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
      };
    default:
      return {
        label: `P${priority}`,
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
      };
  }
}
