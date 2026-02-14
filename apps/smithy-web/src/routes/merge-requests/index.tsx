/**
 * Merge Requests Page - Review and manage merge requests from AI agents
 *
 * Features:
 * - List view optimized for queue processing workflow
 * - Filter pills with status counts (All, Needs Review, Testing, Conflicts)
 * - Right slide-over detail panel
 * - Status-first visual hierarchy with colored left border
 * - Context-aware actions based on merge status
 * - Keyboard shortcuts for quick navigation
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import {
  GitMerge,
  Loader2,
  AlertCircle,
  RefreshCw,
  Search,
  CheckCircle2,
} from 'lucide-react';
import {
  useMergeRequests,
  useMergeRequestCounts,
  type MergeRequestFilterStatus,
} from '../../api/hooks/useMergeRequests';
import { useAllEntities } from '../../api/hooks/useAllElements';
import {
  MergeRequestCard,
  MergeRequestDetailPanel,
  MergeRequestFilterBar,
} from '../../components/merge-request';

export function MergeRequestsPage() {
  const search = useSearch({ from: '/merge-requests' }) as {
    selected?: string;
    status?: MergeRequestFilterStatus;
    showMerged?: boolean;
  };
  const navigate = useNavigate();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const currentFilter = (search.status as MergeRequestFilterStatus) || 'all';
  const showMerged = search.showMerged ?? false;
  const selectedTaskId = search.selected;

  // Fetch data
  const {
    data: mergeRequests,
    isLoading,
    error,
    refetch,
  } = useMergeRequests({
    status: currentFilter,
    showMerged,
  });

  const { counts } = useMergeRequestCounts();
  const { data: entities } = useAllEntities();

  // Create entity name lookup map
  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (entities) {
      entities.forEach((e) => map.set(e.id, e.name));
    }
    return map;
  }, [entities]);

  // Filter by search query
  const filteredRequests = useMemo(() => {
    if (!mergeRequests) return [];
    if (!searchQuery.trim()) return mergeRequests;

    const query = searchQuery.toLowerCase();
    return mergeRequests.filter((task) => {
      const title = task.title.toLowerCase();
      const branch = task.metadata?.orchestrator?.branch?.toLowerCase() || '';
      const assigneeName = entityNameMap.get(task.assignee || '')?.toLowerCase() || '';
      return title.includes(query) || branch.includes(query) || assigneeName.includes(query);
    });
  }, [mergeRequests, searchQuery, entityNameMap]);

  // Keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'j': // Next item
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, filteredRequests.length - 1));
          break;
        case 'k': // Previous item
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter': // Open detail
          e.preventDefault();
          if (filteredRequests[focusedIndex]) {
            handleSelectTask(filteredRequests[focusedIndex].id);
          }
          break;
        case 'Escape': // Close panel
          e.preventDefault();
          handleCloseDetail();
          break;
        case 'r': // Refresh
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            refetch();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredRequests, focusedIndex, refetch]);

  // Auto-scroll focused item into view
  useEffect(() => {
    const element = document.querySelector(`[data-focused="true"]`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedIndex]);

  // Navigation handlers
  const setFilter = useCallback(
    (status: MergeRequestFilterStatus) => {
      navigate({
        to: '/merge-requests',
        search: {
          selected: search.selected,
          status: status === 'all' ? undefined : status,
          showMerged: search.showMerged,
        },
      });
    },
    [navigate, search.selected, search.showMerged]
  );

  const setShowMerged = useCallback(
    (show: boolean) => {
      navigate({
        to: '/merge-requests',
        search: {
          selected: search.selected,
          status: search.status,
          showMerged: show || undefined,
        },
      });
    },
    [navigate, search.selected, search.status]
  );

  const handleSelectTask = useCallback(
    (taskId: string) => {
      navigate({
        to: '/merge-requests',
        search: {
          selected: taskId,
          status: search.status,
          showMerged: search.showMerged,
        },
      });
    },
    [navigate, search.status, search.showMerged]
  );

  const handleCloseDetail = useCallback(() => {
    navigate({
      to: '/merge-requests',
      search: {
        selected: undefined,
        status: search.status,
        showMerged: search.showMerged,
      },
    });
  }, [navigate, search.status, search.showMerged]);

  return (
    <div className="space-y-4 animate-fade-in" data-testid="merge-requests-page">
      {/* Detail Panel - Slide-over */}
      {selectedTaskId && (
        <div className="fixed inset-0 z-40" data-testid="merge-request-detail-overlay">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={handleCloseDetail}
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-[var(--color-surface)] shadow-xl border-l border-[var(--color-border)] animate-slide-in-right">
            <MergeRequestDetailPanel
              taskId={selectedTaskId}
              onClose={handleCloseDetail}
              onDeleted={handleCloseDetail}
            />
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <GitMerge className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Merge Requests</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Review and merge completed agent work
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search merge requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent w-48 @md:w-64"
              data-testid="merge-requests-search"
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => refetch()}
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors"
            aria-label="Refresh"
            data-testid="merge-requests-refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <MergeRequestFilterBar
        currentFilter={currentFilter}
        counts={counts}
        showMerged={showMerged}
        onFilterChange={setFilter}
        onShowMergedChange={setShowMerged}
      />

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mb-4" />
          <p className="text-sm text-[var(--color-text-secondary)]">Loading merge requests...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-danger)] rounded-lg bg-[var(--color-danger-muted)]">
          <AlertCircle className="w-12 h-12 text-[var(--color-danger)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--color-text)]">Failed to load merge requests</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
            {error.message}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-surface)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
            data-testid="merge-requests-retry"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      ) : filteredRequests.length === 0 ? (
        <EmptyState searchQuery={searchQuery} currentFilter={currentFilter} />
      ) : (
        <div className="space-y-2" data-testid="merge-requests-list">
          {filteredRequests.map((task, index) => (
            <div
              key={task.id}
              data-focused={index === focusedIndex}
              className={index === focusedIndex ? 'ring-2 ring-[var(--color-primary)] rounded-lg' : ''}
            >
              <MergeRequestCard
                task={task}
                assigneeName={task.assignee ? entityNameMap.get(task.assignee) : undefined}
                onClick={() => handleSelectTask(task.id)}
                isSelected={task.id === selectedTaskId}
                onDeleted={() => {
                  // Close detail panel if this was the selected task
                  if (task.id === selectedTaskId) {
                    handleCloseDetail();
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Keyboard Shortcuts Help */}
      <div className="fixed bottom-4 right-4 text-xs text-[var(--color-text-tertiary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-sm hidden md:block">
        <span className="font-medium">Shortcuts:</span>{' '}
        <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-elevated)] rounded">j</kbd>/<kbd className="px-1.5 py-0.5 bg-[var(--color-surface-elevated)] rounded">k</kbd> navigate{' '}
        <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-elevated)] rounded">Enter</kbd> open{' '}
        <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-elevated)] rounded">Esc</kbd> close{' '}
        <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-elevated)] rounded">r</kbd> refresh
      </div>
    </div>
  );
}

// ============================================================================
// Empty State Component
// ============================================================================

interface EmptyStateProps {
  searchQuery: string;
  currentFilter: MergeRequestFilterStatus;
}

function EmptyState({ searchQuery, currentFilter }: EmptyStateProps) {
  if (searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
        <Search className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
        <h3 className="text-lg font-medium text-[var(--color-text)]">No matching merge requests</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
          No merge requests found matching &quot;{searchQuery}&quot;. Try a different search term.
        </p>
      </div>
    );
  }

  const emptyMessages: Record<MergeRequestFilterStatus, { title: string; description: string; icon: React.ReactNode }> = {
    all: {
      title: 'No merge requests',
      description: 'When agents complete tasks, their work will appear here for review and merging.',
      icon: <GitMerge className="w-12 h-12 text-[var(--color-text-tertiary)]" />,
    },
    needs_review: {
      title: 'No requests need review',
      description: 'All merge requests have been reviewed. Nice work!',
      icon: <CheckCircle2 className="w-12 h-12 text-green-500" />,
    },
    testing: {
      title: 'No tests running',
      description: 'No merge requests are currently running tests.',
      icon: <Loader2 className="w-12 h-12 text-blue-500" />,
    },
    conflicts: {
      title: 'No conflicts',
      description: 'No merge requests have conflicts. All clear!',
      icon: <CheckCircle2 className="w-12 h-12 text-green-500" />,
    },
    merged: {
      title: 'No merged requests',
      description: 'No merge requests have been merged yet.',
      icon: <GitMerge className="w-12 h-12 text-[var(--color-text-tertiary)]" />,
    },
  };

  const { title, description, icon } = emptyMessages[currentFilter];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
      {icon}
      <h3 className="text-lg font-medium text-[var(--color-text)] mt-4">{title}</h3>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
        {description}
      </p>
    </div>
  );
}
