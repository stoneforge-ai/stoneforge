/**
 * @stoneforge/ui Documents Constants
 *
 * Sort options, filter options, and storage keys for document components.
 */

import type { DocumentSortOption, ContentTypeFilterOption, DocumentFilterConfig } from './types';

// ============================================================================
// Sort Options
// ============================================================================

export const DOCUMENT_SORT_OPTIONS: DocumentSortOption[] = [
  { value: 'updatedAt', label: 'Updated', defaultDirection: 'desc' },
  { value: 'createdAt', label: 'Created', defaultDirection: 'desc' },
  { value: 'title', label: 'Title', defaultDirection: 'asc' },
  { value: 'contentType', label: 'Type', defaultDirection: 'asc' },
];

// ============================================================================
// Content Type Filter Options
// ============================================================================

export const CONTENT_TYPE_FILTER_OPTIONS: ContentTypeFilterOption[] = [
  { value: 'text', label: 'Text', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
  { value: 'markdown', label: 'Markdown', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' },
  { value: 'json', label: 'JSON', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
];

// ============================================================================
// Storage Keys
// ============================================================================

export const DOCUMENT_STORAGE_KEYS = {
  sortField: 'documents.sortBy',
  sortDirection: 'documents.sortDir',
} as const;

// ============================================================================
// Empty Filter Config
// ============================================================================

export const EMPTY_DOCUMENT_FILTER: DocumentFilterConfig = {
  contentTypes: [],
  tags: [],
};
