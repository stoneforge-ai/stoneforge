/**
 * VirtualizedChatList - TB131
 *
 * A specialized virtualized list component for chat/message interfaces.
 * Handles reverse scroll (oldest at top, newest at bottom) with:
 * - Auto-scroll to bottom on new messages (when already at bottom)
 * - "Jump to latest" button when scrolled up
 * - Day separator support
 * - Smooth virtualization with @tanstack/react-virtual
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import { ChevronDown } from 'lucide-react';

export interface VirtualizedChatListProps<T> {
  /**
   * Array of messages to render (should be in chronological order - oldest first)
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
   */
  scrollRestoreId?: string;

  /**
   * Test ID for the container
   */
  testId?: string;

  /**
   * Render function for empty state
   */
  renderEmpty?: () => React.ReactNode;

  /**
   * Gap between items in pixels
   * @default 8
   */
  gap?: number;

  /**
   * Callback when scrolled to top (for loading older messages)
   */
  onScrollToTop?: () => void;

  /**
   * Whether older messages are currently loading
   */
  isLoadingMore?: boolean;

  /**
   * Whether there are more older messages to load
   */
  hasMore?: boolean;

  /**
   * Threshold in pixels from top to trigger onScrollToTop
   * @default 100
   */
  loadMoreThreshold?: number;

  /**
   * ID of the latest message (used to detect new messages)
   * When this changes and user is at bottom, auto-scroll to bottom
   */
  latestMessageId?: string | number;

  /**
   * Called when a new message arrives while user is scrolled up
   * Useful for showing notification that new messages are below
   */
  onNewMessageWhileScrolledUp?: () => void;
}

// Threshold to consider "at bottom" (in pixels from bottom)
const AT_BOTTOM_THRESHOLD = 100;

export function VirtualizedChatList<T>({
  items,
  getItemKey,
  estimateSize,
  renderItem,
  overscan = 5,
  className = '',
  innerClassName = '',
  scrollRestoreId: _scrollRestoreId, // Reserved for future scroll restoration feature
  testId,
  renderEmpty,
  gap = 8,
  onScrollToTop,
  isLoadingMore = false,
  hasMore = false,
  loadMoreThreshold = 100,
  latestMessageId,
  onNewMessageWhileScrolledUp,
}: VirtualizedChatListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const lastLatestMessageIdRef = useRef(latestMessageId);
  const isInitialMount = useRef(true);
  const scrollCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Enable dynamic measurement for variable height items
    measureElement: (element) => {
      return element.getBoundingClientRect().height;
    },
  });

  // Check if scrolled to bottom
  const checkIfAtBottom = useCallback(() => {
    if (!parentRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom < AT_BOTTOM_THRESHOLD;
  }, []);

  // Check if scrolled to top
  const checkIfAtTop = useCallback(() => {
    if (!parentRef.current) return false;
    return parentRef.current.scrollTop < loadMoreThreshold;
  }, [loadMoreThreshold]);

  // Scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (parentRef.current) {
      parentRef.current.scrollTo({
        top: parentRef.current.scrollHeight,
        behavior,
      });
      setIsAtBottom(true);
      setShowJumpToLatest(false);
    }
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    // Debounce scroll checks
    if (scrollCheckTimeoutRef.current) {
      clearTimeout(scrollCheckTimeoutRef.current);
    }

    scrollCheckTimeoutRef.current = setTimeout(() => {
      const atBottom = checkIfAtBottom();
      const atTop = checkIfAtTop();

      setIsAtBottom(atBottom);
      setShowJumpToLatest(!atBottom && items.length > 0);

      // Load more when scrolled to top
      if (atTop && hasMore && !isLoadingMore && onScrollToTop) {
        onScrollToTop();
      }
    }, 50);
  }, [checkIfAtBottom, checkIfAtTop, hasMore, isLoadingMore, onScrollToTop, items.length]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollCheckTimeoutRef.current) {
        clearTimeout(scrollCheckTimeoutRef.current);
      }
    };
  }, []);

  // Scroll to bottom on initial mount
  useEffect(() => {
    if (isInitialMount.current && items.length > 0) {
      // Use immediate scroll on initial mount
      requestAnimationFrame(() => {
        scrollToBottom('instant');
        isInitialMount.current = false;
      });
    }
  }, [items.length, scrollToBottom]);

  // Handle new message detection
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      lastLatestMessageIdRef.current = latestMessageId;
      return;
    }

    // Check if a new message arrived
    if (latestMessageId !== lastLatestMessageIdRef.current) {
      lastLatestMessageIdRef.current = latestMessageId;

      if (isAtBottom) {
        // Auto-scroll to bottom if user was at bottom
        requestAnimationFrame(() => {
          scrollToBottom('smooth');
        });
      } else {
        // Notify that new message arrived while scrolled up
        setShowJumpToLatest(true);
        if (onNewMessageWhileScrolledUp) {
          onNewMessageWhileScrolledUp();
        }
      }
    }
  }, [latestMessageId, isAtBottom, scrollToBottom, onNewMessageWhileScrolledUp]);

  // Render empty state
  if (items.length === 0 && !isLoadingMore) {
    return (
      <div
        ref={parentRef}
        className={`h-full ${className}`}
        data-testid={testId}
      >
        {renderEmpty ? renderEmpty() : (
          <div className="flex items-center justify-center h-full text-gray-500">
            No messages
          </div>
        )}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="relative h-full">
      {/* Loading indicator at top */}
      {isLoadingMore && (
        <div
          className="absolute top-0 left-0 right-0 z-10 flex justify-center py-2 bg-gradient-to-b from-white to-transparent"
          data-testid={`${testId}-loading-more`}
        >
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            Loading older messages...
          </div>
        </div>
      )}

      {/* Virtualized list container */}
      <div
        ref={parentRef}
        className={`overflow-auto h-full ${className}`}
        data-testid={testId}
        onScroll={handleScroll}
        tabIndex={0}
        role="log"
        aria-live="polite"
        aria-label="Messages"
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
                ref={virtualizer.measureElement}
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

      {/* Jump to latest button */}
      {showJumpToLatest && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-full shadow-lg hover:bg-blue-600 transition-all hover:shadow-xl"
          data-testid={`${testId}-jump-to-latest`}
          aria-label="Jump to latest messages"
        >
          <ChevronDown className="w-4 h-4" />
          Jump to latest
        </button>
      )}
    </div>
  );
}

/**
 * Hook to expose VirtualizedChatList controls
 */
export function useChatListControls() {
  const scrollToBottomRef = useRef<(() => void) | null>(null);

  const setScrollToBottom = useCallback((fn: () => void) => {
    scrollToBottomRef.current = fn;
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollToBottomRef.current?.();
  }, []);

  return { scrollToBottom, setScrollToBottom };
}
