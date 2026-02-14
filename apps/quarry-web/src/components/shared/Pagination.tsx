/**
 * Universal Pagination Component
 *
 * Features:
 * - Page numbers with ellipsis for large page counts
 * - First/Last/Prev/Next navigation buttons
 * - Page size selector (10, 25, 50, 100)
 * - Shows current range (e.g., "Showing 1-25 of 142")
 * - Responsive design: stacked layout on mobile, horizontal on desktop
 * - Touch-friendly tap targets (44px minimum)
 */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useIsMobile } from '../../hooks/useBreakpoint';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  showPageSizeSelector?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = true,
}: PaginationProps) {
  const isMobile = useIsMobile();
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers to display - fewer on mobile
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = isMobile ? 3 : 5;

    if (totalPages <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > (isMobile ? 2 : 3)) {
        pages.push('ellipsis');
      }

      // Show pages around current - fewer on mobile
      const range = isMobile ? 0 : 1;
      const start = Math.max(2, currentPage - range);
      const end = Math.min(totalPages - 1, currentPage + range);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - (isMobile ? 1 : 2)) {
        pages.push('ellipsis');
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  if (totalPages <= 1 && !showPageSizeSelector) {
    return (
      <div className="flex items-center justify-center sm:justify-between px-3 sm:px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
          {totalItems === 0 ? 'No items' : `Showing ${totalItems} item${totalItems !== 1 ? 's' : ''}`}
        </span>
      </div>
    );
  }

  // Mobile layout: stacked vertically
  if (isMobile) {
    return (
      <div
        className="flex flex-col gap-3 px-3 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        data-testid="pagination"
      >
        {/* Top row: Item count + page size selector */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="pagination-info">
            {totalItems === 0 ? 'No items' : `${startItem}-${endItem} of ${totalItems}`}
          </span>

          {/* Page size selector - compact on mobile */}
          {showPageSizeSelector && onPageSizeChange && (
            <select
              id="pagination-page-size-mobile"
              value={pageSize}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
              className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 touch-target"
              data-testid="pagination-page-size"
              aria-label="Items per page"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Bottom row: Page navigation - centered and touch-friendly */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1">
            {/* Previous page - larger touch target */}
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="min-w-[44px] h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed active:bg-gray-200 dark:active:bg-gray-600 transition-colors"
              aria-label="Previous page"
              data-testid="pagination-prev"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Page numbers - touch-friendly buttons */}
            <div className="flex items-center gap-1">
              {getPageNumbers().map((page, index) =>
                page === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className="px-1 text-gray-400 dark:text-gray-500 text-sm">
                    …
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => onPageChange(page)}
                    className={`min-w-[40px] h-[40px] px-2 text-sm rounded-lg transition-colors ${
                      page === currentPage
                        ? 'bg-blue-600 text-white font-medium'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 active:bg-gray-200 dark:active:bg-gray-600'
                    }`}
                    data-testid={`pagination-page-${page}`}
                    aria-current={page === currentPage ? 'page' : undefined}
                  >
                    {page}
                  </button>
                )
              )}
            </div>

            {/* Next page - larger touch target */}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="min-w-[44px] h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed active:bg-gray-200 dark:active:bg-gray-600 transition-colors"
              aria-label="Next page"
              data-testid="pagination-next"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Desktop/tablet layout: horizontal
  return (
    <div
      className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      data-testid="pagination"
    >
      {/* Left side: Item count */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500 dark:text-gray-400" data-testid="pagination-info">
          {totalItems === 0 ? 'No items' : `Showing ${startItem}-${endItem} of ${totalItems}`}
        </span>

        {/* Page size selector */}
        {showPageSizeSelector && onPageSizeChange && (
          <div className="flex items-center gap-2">
            <label htmlFor="pagination-page-size" className="text-sm text-gray-500 dark:text-gray-400">Show</label>
            <select
              id="pagination-page-size"
              value={pageSize}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              data-testid="pagination-page-size"
              aria-label="Items per page"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500 dark:text-gray-400">per page</span>
          </div>
        )}
      </div>

      {/* Right side: Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {/* First page */}
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="First page"
            data-testid="pagination-first"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          {/* Previous page */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
            data-testid="pagination-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1 mx-2">
            {getPageNumbers().map((page, index) =>
              page === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="px-2 text-gray-400 dark:text-gray-500">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => onPageChange(page)}
                  className={`min-w-[32px] h-8 px-2 text-sm rounded transition-colors ${
                    page === currentPage
                      ? 'bg-blue-600 text-white font-medium'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                  }`}
                  data-testid={`pagination-page-${page}`}
                  aria-current={page === currentPage ? 'page' : undefined}
                >
                  {page}
                </button>
              )
            )}
          </div>

          {/* Next page */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
            data-testid="pagination-next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Last page */}
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Last page"
            data-testid="pagination-last"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
