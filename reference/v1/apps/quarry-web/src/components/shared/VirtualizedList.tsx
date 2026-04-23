/**
 * VirtualizedList - TB68
 *
 * A reusable virtualized list component using @tanstack/react-virtual.
 * Renders only visible items for optimal performance with large datasets.
 *
 * Features:
 * - Renders only visible items (+ overscan for smooth scrolling)
 * - Supports dynamic item heights via estimateSize
 * - Scroll position restoration on navigation
 * - Works with any item type via generics
 */

import { useRef, useEffect, useCallback } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';

// Storage for scroll positions keyed by route/listId
const scrollPositionStore = new Map<string, number>();

export interface VirtualizedListProps<T> {
  /**
   * Array of items to render
   */
  items: T[];

  /**
   * Function to extract unique key from item
   */
  getItemKey: (item: T, index: number) => string | number;

  /**
   * Estimated height of each item in pixels.
   * Can be a number (fixed) or function (dynamic based on item)
   */
  estimateSize: number | ((index: number) => number);

  /**
   * Render function for each item
   */
  renderItem: (item: T, index: number, virtualItem: VirtualItem) => React.ReactNode;

  /**
   * Number of items to render outside visible area (improves scroll smoothness)
   * @default 5
   */
  overscan?: number;

  /**
   * CSS class name for the outer container
   */
  className?: string;

  /**
   * CSS class name for the inner content container
   */
  innerClassName?: string;

  /**
   * ID for scroll position restoration (e.g., route path)
   * If provided, scroll position will be saved and restored when returning
   */
  scrollRestoreId?: string;

  /**
   * Height of the container. If not set, the container will need its own height styling.
   */
  height?: number | string;

  /**
   * Test ID for the container
   */
  testId?: string;

  /**
   * Render function for empty state
   */
  renderEmpty?: () => React.ReactNode;

  /**
   * Called when scroll position changes
   */
  onScroll?: (scrollOffset: number) => void;

  /**
   * Gap between items in pixels
   * @default 0
   */
  gap?: number;
}

export function VirtualizedList<T>({
  items,
  getItemKey,
  estimateSize,
  renderItem,
  overscan = 5,
  className = '',
  innerClassName = '',
  scrollRestoreId,
  height,
  testId,
  renderEmpty,
  onScroll,
  gap = 0,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Convert estimateSize to function format
  const estimateSizeFn = typeof estimateSize === 'function'
    ? estimateSize
    : () => estimateSize;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => estimateSizeFn(index) + (index < items.length - 1 ? gap : 0),
    overscan,
    getItemKey: (index) => getItemKey(items[index], index),
  });

  // Restore scroll position on mount
  useEffect(() => {
    if (scrollRestoreId && parentRef.current) {
      const savedPosition = scrollPositionStore.get(scrollRestoreId);
      if (savedPosition !== undefined && savedPosition > 0) {
        // Small delay to ensure virtualizer is ready
        requestAnimationFrame(() => {
          virtualizer.scrollToOffset(savedPosition);
        });
      }
    }
  }, [scrollRestoreId]);

  // Save scroll position on unmount or when scrollRestoreId changes
  useEffect(() => {
    return () => {
      if (scrollRestoreId && parentRef.current) {
        const currentOffset = virtualizer.scrollOffset;
        if (currentOffset !== null && currentOffset > 0) {
          scrollPositionStore.set(scrollRestoreId, currentOffset);
        }
      }
    };
  }, [scrollRestoreId, virtualizer]);

  // Debounced scroll handler for external callback
  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      const offset = virtualizer.scrollOffset;
      if (offset !== null && onScroll) {
        onScroll(offset);
      }

      // Also save to store
      if (scrollRestoreId && offset !== null && offset > 0) {
        scrollPositionStore.set(scrollRestoreId, offset);
      }
    }, 100);
  }, [virtualizer, onScroll, scrollRestoreId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Render empty state
  if (items.length === 0) {
    return (
      <div
        ref={parentRef}
        className={className}
        style={height ? { height } : undefined}
        data-testid={testId}
      >
        {renderEmpty ? renderEmpty() : (
          <div className="flex items-center justify-center h-full text-gray-500">
            No items
          </div>
        )}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${className}`}
      style={height ? { height } : undefined}
      data-testid={testId}
      onScroll={handleScroll}
      tabIndex={0}
      role="region"
      aria-label="Scrollable list"
    >
      <div
        className={innerClassName}
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
        data-testid={testId ? `${testId}-inner` : undefined}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              data-index={virtualItem.index}
              data-testid={testId ? `${testId}-item-${virtualItem.index}` : undefined}
            >
              {renderItem(item, virtualItem.index, virtualItem)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Hook to programmatically control scroll position for a virtualized list
 */
export function useScrollPosition(scrollRestoreId: string) {
  const saveScrollPosition = useCallback((offset: number) => {
    scrollPositionStore.set(scrollRestoreId, offset);
  }, [scrollRestoreId]);

  const getScrollPosition = useCallback(() => {
    return scrollPositionStore.get(scrollRestoreId) ?? 0;
  }, [scrollRestoreId]);

  const clearScrollPosition = useCallback(() => {
    scrollPositionStore.delete(scrollRestoreId);
  }, [scrollRestoreId]);

  return { saveScrollPosition, getScrollPosition, clearScrollPosition };
}

/**
 * Clear all saved scroll positions
 */
export function clearAllScrollPositions() {
  scrollPositionStore.clear();
}
