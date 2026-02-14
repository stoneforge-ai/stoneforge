/**
 * DocumentFilterBar - Collapsible filter bar with content type toggles, tags dropdown, and filter chips
 */

import { useState } from 'react';
import { Filter, ChevronDown, ChevronUp, X, Check, Tag } from 'lucide-react';
import type { DocumentFilterConfig } from '../types';
import { CONTENT_TYPE_FILTER_OPTIONS } from '../constants';
import { getActiveFilterCount, hasActiveFilters } from '../utils';

interface DocumentFilterBarProps {
  filters: DocumentFilterConfig;
  onFilterChange: (filters: DocumentFilterConfig) => void;
  onClearFilters: () => void;
  availableTags: string[];
}

export function DocumentFilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  availableTags,
}: DocumentFilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTagsDropdownOpen, setIsTagsDropdownOpen] = useState(false);
  const activeCount = getActiveFilterCount(filters);
  const hasFilters = hasActiveFilters(filters);

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

  const removeContentType = (type: string) => {
    onFilterChange({
      ...filters,
      contentTypes: filters.contentTypes.filter((t) => t !== type),
    });
  };

  const removeTag = (tag: string) => {
    onFilterChange({
      ...filters,
      tags: filters.tags.filter((t) => t !== tag),
    });
  };

  return (
    <div data-testid="document-filter-bar">
      {/* Filter toggle row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
            hasFilters
              ? 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900/70'
              : 'text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          data-testid="filter-toggle"
        >
          <Filter className="w-4 h-4" />
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full">
              {activeCount}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {/* Clear button */}
        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            data-testid="clear-filters"
          >
            Clear
          </button>
        )}
      </div>

      {/* Expanded filter panel */}
      {isExpanded && (
        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700" data-testid="filter-panel">
          {/* Content type filter */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Type
            </label>
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPE_FILTER_OPTIONS.map((option) => {
                const isSelected = filters.contentTypes.includes(option.value);
                return (
                  <button
                    key={option.value}
                    onClick={() => handleContentTypeToggle(option.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                      isSelected
                        ? `${option.color} border-transparent font-medium`
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                    data-testid={`filter-type-${option.value}`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags filter - multi-tag input */}
          {availableTags.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Tags
              </label>
              <div className="relative">
                {/* Selected tags as chips + input */}
                <div
                  className="flex flex-wrap items-center gap-1.5 min-h-[38px] px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 cursor-text"
                  onClick={() => setIsTagsDropdownOpen(true)}
                >
                  {/* Selected tag chips */}
                  {filters.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 rounded"
                    >
                      {tag}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTagToggle(tag);
                        }}
                        className="hover:opacity-70 transition-opacity"
                        data-testid={`remove-tag-input-${tag}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {/* Placeholder when empty */}
                  {filters.tags.length === 0 && (
                    <span className="text-sm text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                      <Tag className="w-4 h-4" />
                      Click to select tags...
                    </span>
                  )}
                </div>

                {/* Tags dropdown */}
                {isTagsDropdownOpen && (
                  <>
                    {/* Backdrop to close dropdown */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsTagsDropdownOpen(false)}
                    />
                    <div className="absolute left-0 top-full mt-1 w-full max-h-48 overflow-y-auto py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
                      {availableTags.filter((tag) => !filters.tags.includes(tag)).length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          All tags selected
                        </div>
                      ) : (
                        availableTags
                          .filter((tag) => !filters.tags.includes(tag))
                          .map((tag) => (
                            <button
                              key={tag}
                              onClick={() => handleTagToggle(tag)}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              data-testid={`filter-tag-${tag}`}
                            >
                              <Tag className="w-3 h-3 text-gray-400" />
                              <span>{tag}</span>
                            </button>
                          ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter chips when collapsed */}
      {!isExpanded && hasFilters && (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="filter-chips">
          {/* Content type chips */}
          {filters.contentTypes.map((type) => {
            const option = CONTENT_TYPE_FILTER_OPTIONS.find((o) => o.value === type);
            return (
              <span
                key={`type-${type}`}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${option?.color || 'bg-gray-100 text-gray-700'}`}
              >
                {option?.label || type}
                <button
                  onClick={() => removeContentType(type)}
                  className="hover:opacity-70 transition-opacity"
                  data-testid={`remove-type-${type}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          {/* Tag chips */}
          {filters.tags.map((tag) => (
            <span
              key={`tag-${tag}`}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 rounded-full"
            >
              <Tag className="w-3 h-3" />
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="hover:opacity-70 transition-opacity"
                data-testid={`remove-tag-${tag}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
