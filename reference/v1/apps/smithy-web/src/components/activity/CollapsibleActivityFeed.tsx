/**
 * CollapsibleActivityFeed - Wraps the existing activity feed
 * (filter tabs + infinite scroll) in a collapsible section.
 * Collapsed by default to keep the focus on the dashboard.
 */

import { useState, useMemo, useCallback } from 'react';
import { Filter, ChevronRight } from 'lucide-react';
import { ActivityList } from './ActivityList.js';
import { SessionActivityCard } from './SessionActivityCard.js';
import { useInfiniteActivity, useActivityStream } from '../../api/hooks/useActivity.js';
import type { ActivityFilterCategory, ActivityEvent } from '../../api/types.js';

const FILTER_CATEGORIES: { value: ActivityFilterCategory; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'agents', label: 'Agents' },
  { value: 'workflows', label: 'Workflows' },
];

export function CollapsibleActivityFeed() {
  const [isOpen, setIsOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<ActivityFilterCategory>('all');

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteActivity({ category: filterCategory, limit: 20 });

  const {
    sessionEvents,
    clearSessionEvents,
  } = useActivityStream(filterCategory);

  const events = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.events);
  }, [data]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleOpenInWorkspace = (event: ActivityEvent) => {
    console.log('Open in workspace:', event.elementId);
  };

  const handleOpenSessionInWorkspace = (sessionId: string) => {
    console.log('Open session in workspace:', sessionId);
  };

  return (
    <div data-testid="activity-feed-section">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] py-2 transition-colors duration-150"
        data-testid="activity-feed-toggle"
      >
        <ChevronRight
          className={`w-4 h-4 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
        />
        Activity Feed
        {(sessionEvents.length > 0 || events.length > 0) && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            ({sessionEvents.length + events.length} events)
          </span>
        )}
      </button>

      {isOpen && (
        <div className="space-y-4 mt-2">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 p-1 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
            <Filter className="w-4 h-4 text-[var(--color-text-tertiary)] ml-2 mr-1" />
            {FILTER_CATEGORIES.map((category) => (
              <button
                key={category.value}
                onClick={() => setFilterCategory(category.value)}
                data-testid={`activity-filter-${category.value}`}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 ${
                  filterCategory === category.value
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>

          {/* Live session events */}
          {sessionEvents.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Live Activity
                </h3>
                <button
                  onClick={clearSessionEvents}
                  className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {sessionEvents.slice(0, 5).map((event, index) => (
                  <SessionActivityCard
                    key={`${event.sessionId}-${index}`}
                    event={event}
                    onOpenInWorkspace={handleOpenSessionInWorkspace}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Historical feed */}
          <ActivityList
            events={events}
            isLoading={isLoading || isFetchingNextPage}
            hasMore={hasNextPage}
            onLoadMore={handleLoadMore}
            onOpenInWorkspace={handleOpenInWorkspace}
            emptyMessage={
              filterCategory === 'all'
                ? 'No activity yet. Activity will appear here when agents start working on tasks.'
                : `No ${filterCategory} activity to show.`
            }
          />
        </div>
      )}
    </div>
  );
}
