/**
 * ActivityList Component
 *
 * Displays a list of activity events with infinite scrolling support.
 */

import { useRef, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { ActivityEvent } from '../../api/types.js';
import { ActivityCard } from './ActivityCard.js';

interface ActivityListProps {
  events: ActivityEvent[];
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onOpenInWorkspace?: (event: ActivityEvent) => void;
  emptyMessage?: string;
}

export function ActivityList({
  events,
  isLoading,
  hasMore,
  onLoadMore,
  onOpenInWorkspace,
  emptyMessage = 'No activity to show',
}: ActivityListProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Set up intersection observer for infinite scroll
  const setLoadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      if (node && hasMore && onLoadMore) {
        observerRef.current = new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting && !isLoading) {
              onLoadMore();
            }
          },
          { threshold: 0.1 }
        );
        observerRef.current.observe(node);
      }

      loadMoreRef.current = node;
    },
    [hasMore, isLoading, onLoadMore]
  );

  // Clean up observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  if (events.length === 0 && !isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-center"
        data-testid="activity-empty"
      >
        <p className="text-sm text-[var(--color-text-secondary)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="activity-list">
      {events.map((event) => (
        <ActivityCard
          key={event.id}
          event={event}
          onOpenInWorkspace={onOpenInWorkspace}
        />
      ))}

      {/* Load more trigger element */}
      {hasMore && (
        <div
          ref={setLoadMoreRef}
          className="flex items-center justify-center py-4"
          data-testid="activity-load-more"
        >
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading more...
            </div>
          )}
        </div>
      )}

      {/* Loading indicator for initial load */}
      {isLoading && events.length === 0 && (
        <div
          className="flex items-center justify-center py-12"
          data-testid="activity-loading"
        >
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-secondary)]" />
        </div>
      )}
    </div>
  );
}
