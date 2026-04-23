/**
 * MobileDocumentFilter - Full-screen filter sheet for mobile
 */

import { useEffect, useRef } from 'react';
import { ChevronLeft, Check, Tag } from 'lucide-react';
import type { DocumentFilterConfig } from '../types';
import { CONTENT_TYPE_FILTER_OPTIONS } from '../constants';
import { getActiveFilterCount } from '../utils';

interface MobileDocumentFilterProps {
  open: boolean;
  onClose: () => void;
  filters: DocumentFilterConfig;
  onFilterChange: (filters: DocumentFilterConfig) => void;
  onClearFilters: () => void;
  availableTags: string[];
}

export function MobileDocumentFilter({
  open,
  onClose,
  filters,
  onFilterChange,
  onClearFilters,
  availableTags,
}: MobileDocumentFilterProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const currentYRef = useRef<number>(0);
  const activeCount = getActiveFilterCount(filters);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  // Close on escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Handle browser back button
  useEffect(() => {
    if (!open) return;

    window.history.pushState({ mobileSheet: true }, '');

    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.mobileSheet === undefined) {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state?.mobileSheet) {
        window.history.back();
      }
    };
  }, [open, onClose]);

  // Handle swipe-to-close
  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;

    currentYRef.current = e.touches[0].clientY - startYRef.current;

    if (currentYRef.current < 0) {
      currentYRef.current = 0;
    }

    if (sheetRef.current && currentYRef.current > 0) {
      sheetRef.current.style.transform = `translateY(${currentYRef.current}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (startYRef.current === null) return;

    if (currentYRef.current > 100) {
      onClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = 'translateY(0)';
    }

    startYRef.current = null;
    currentYRef.current = 0;
  };

  // Focus trap
  useEffect(() => {
    if (open && sheetRef.current) {
      const firstFocusable = sheetRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, [open]);

  const handleContentTypeToggle = (type: string) => {
    const newTypes = filters.contentTypes.includes(type)
      ? filters.contentTypes.filter((t) => t !== type)
      : [...filters.contentTypes, type];
    onFilterChange({ ...filters, contentTypes: newTypes });
  };

  const handleTagToggle = (tag: string) => {
    const newTags = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag];
    onFilterChange({ ...filters, tags: newTags });
  };

  const handleClearAndClose = () => {
    onClearFilters();
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid="mobile-document-filter"
      role="dialog"
      aria-modal="true"
      aria-label="Document filters"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 top-0 bg-[var(--color-bg)] shadow-2xl flex flex-col transform transition-transform duration-200 ease-out"
        style={{ transform: open ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-[var(--color-border)] rounded-full" />

          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target"
            aria-label="Close"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <h2 className="flex-1 text-lg font-semibold text-[var(--color-text)]">
            Filters
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Content type filter */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
              Type
            </label>
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPE_FILTER_OPTIONS.map((option) => {
                const isSelected = filters.contentTypes.includes(option.value);
                return (
                  <button
                    key={option.value}
                    onClick={() => handleContentTypeToggle(option.value)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors touch-target ${
                      isSelected
                        ? `${option.color} border-transparent font-medium`
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                    data-testid={`mobile-filter-type-${option.value}`}
                  >
                    {isSelected && <Check className="w-4 h-4" />}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags filter */}
          {availableTags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                Tags
              </label>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const isSelected = filters.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => handleTagToggle(tag)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors touch-target ${
                        isSelected
                          ? 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100 border-transparent font-medium'
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                      }`}
                      data-testid={`mobile-filter-tag-${tag}`}
                    >
                      <Tag className="w-4 h-4" />
                      {tag}
                      {isSelected && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clear filters button */}
          {activeCount > 0 && (
            <button
              onClick={handleClearAndClose}
              className="w-full py-2.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors touch-target"
              data-testid="mobile-clear-filters"
            >
              Clear all filters ({activeCount})
            </button>
          )}

          {/* Apply button */}
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors touch-target"
            data-testid="mobile-apply-filters"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
