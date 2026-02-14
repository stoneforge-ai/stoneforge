/**
 * ResponsiveDataList - Responsive data display component
 *
 * Renders data as cards on mobile and as a more compact list on desktop/tablet.
 * Combines virtualization, sorting, and pagination for optimal performance.
 *
 * Features:
 * - Mobile (< 640px): Card layout with touch-friendly spacing
 * - Desktop (>= 640px): Compact list layout
 * - Virtualization support via VirtualizedList
 * - Consistent empty state handling
 * - Dark mode support
 */

import { ReactNode } from 'react';
import { useIsMobile } from '../../hooks/useBreakpoint';
import { VirtualizedList } from './VirtualizedList';

export interface ResponsiveDataListProps<T> {
  /** Array of items to display */
  items: T[];
  /** Unique key extractor for each item */
  keyExtractor: (item: T) => string;
  /** Render function for mobile card view */
  renderMobileCard: (item: T, index: number) => ReactNode;
  /** Render function for desktop list item */
  renderDesktopItem: (item: T, index: number) => ReactNode;
  /** Empty state component to show when no items */
  emptyState?: ReactNode;
  /** Loading state indicator */
  isLoading?: boolean;
  /** Loading skeleton component */
  loadingSkeleton?: ReactNode;
  /** Estimated item height for mobile cards */
  mobileItemHeight?: number;
  /** Estimated item height for desktop items */
  desktopItemHeight?: number;
  /** Whether to use virtualization (recommended for large lists) */
  useVirtualization?: boolean;
  /** Scroll restoration key */
  scrollRestoreId?: string;
  /** Additional className for the container */
  className?: string;
  /** Test ID for the list container */
  testId?: string;
}

export function ResponsiveDataList<T>({
  items,
  keyExtractor,
  renderMobileCard,
  renderDesktopItem,
  emptyState,
  isLoading = false,
  loadingSkeleton,
  mobileItemHeight = 120,
  desktopItemHeight = 64,
  useVirtualization = true,
  scrollRestoreId,
  className = '',
  testId = 'data-list',
}: ResponsiveDataListProps<T>) {
  const isMobile = useIsMobile();

  // Loading state
  if (isLoading && loadingSkeleton) {
    return <div data-testid={`${testId}-loading`}>{loadingSkeleton}</div>;
  }

  // Empty state
  if (items.length === 0) {
    if (emptyState) {
      return <div data-testid={`${testId}-empty`}>{emptyState}</div>;
    }
    return (
      <div
        className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400"
        data-testid={`${testId}-empty`}
      >
        No items to display
      </div>
    );
  }

  // Mobile card layout
  if (isMobile) {
    if (useVirtualization && items.length > 20) {
      return (
        <VirtualizedList
          items={items}
          getItemKey={(item) => keyExtractor(item)}
          estimateSize={() => mobileItemHeight}
          renderItem={(item, index) => (
            <div
              key={keyExtractor(item)}
              className="px-3 py-2"
              data-testid={`${testId}-mobile-item-${index}`}
            >
              {renderMobileCard(item, index)}
            </div>
          )}
          gap={8}
          scrollRestoreId={scrollRestoreId}
          className={`${className}`}
          testId={`${testId}-virtualized`}
        />
      );
    }

    return (
      <div className={`space-y-2 px-3 py-2 ${className}`} data-testid={`${testId}-mobile`}>
        {items.map((item, index) => (
          <div key={keyExtractor(item)} data-testid={`${testId}-mobile-item-${index}`}>
            {renderMobileCard(item, index)}
          </div>
        ))}
      </div>
    );
  }

  // Desktop/tablet list layout
  if (useVirtualization && items.length > 20) {
    return (
      <VirtualizedList
        items={items}
        getItemKey={(item) => keyExtractor(item)}
        estimateSize={() => desktopItemHeight}
        renderItem={(item, index) => (
          <div key={keyExtractor(item)} data-testid={`${testId}-desktop-item-${index}`}>
            {renderDesktopItem(item, index)}
          </div>
        )}
        gap={0}
        scrollRestoreId={scrollRestoreId}
        className={`${className}`}
        testId={`${testId}-virtualized`}
      />
    );
  }

  return (
    <div className={`divide-y divide-gray-200 dark:divide-gray-700 ${className}`} data-testid={`${testId}-desktop`}>
      {items.map((item, index) => (
        <div key={keyExtractor(item)} data-testid={`${testId}-desktop-item-${index}`}>
          {renderDesktopItem(item, index)}
        </div>
      ))}
    </div>
  );
}

/**
 * ResponsiveDataListHeader - Header component for data lists with responsive controls
 */
export interface ResponsiveDataListHeaderProps {
  /** Title of the list */
  title?: ReactNode;
  /** Total item count */
  totalCount?: number;
  /** Search input component */
  searchInput?: ReactNode;
  /** Sort dropdown component */
  sortDropdown?: ReactNode;
  /** Filter controls component */
  filterControls?: ReactNode;
  /** Action buttons (e.g., Create New) */
  actions?: ReactNode;
  /** Additional className */
  className?: string;
}

export function ResponsiveDataListHeader({
  title,
  totalCount,
  searchInput,
  sortDropdown,
  filterControls,
  actions,
  className = '',
}: ResponsiveDataListHeaderProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className={`space-y-3 px-3 py-3 ${className}`}>
        {/* Top row: Title + Actions */}
        {(title || actions) && (
          <div className="flex items-center justify-between">
            {title && (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
                {totalCount !== undefined && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">({totalCount})</span>
                )}
              </div>
            )}
            {actions}
          </div>
        )}

        {/* Search row */}
        {searchInput && <div className="w-full">{searchInput}</div>}

        {/* Controls row: Sort + Filter */}
        {(sortDropdown || filterControls) && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-3 px-3">
            {sortDropdown}
            {filterControls}
          </div>
        )}
      </div>
    );
  }

  // Desktop/tablet header
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${className}`}>
      <div className="flex items-center gap-4 min-w-0">
        {title && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            {totalCount !== undefined && (
              <span className="text-sm text-gray-500 dark:text-gray-400">({totalCount})</span>
            )}
          </div>
        )}
        {searchInput && <div className="flex-1 max-w-md">{searchInput}</div>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {filterControls}
        {sortDropdown}
        {actions}
      </div>
    </div>
  );
}
