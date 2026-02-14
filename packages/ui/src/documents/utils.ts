/**
 * @stoneforge/ui Documents Utilities
 *
 * Storage helpers and filter creation for document components.
 */

import type { DocumentSortField, SortDirection, DocumentFilterConfig } from './types';
import { DOCUMENT_STORAGE_KEYS, DOCUMENT_SORT_OPTIONS } from './constants';

// ============================================================================
// Sort Storage
// ============================================================================

export function getStoredSort(): { field: DocumentSortField; direction: SortDirection } {
  if (typeof window === 'undefined') {
    return { field: 'updatedAt', direction: 'desc' };
  }

  const storedField = localStorage.getItem(DOCUMENT_STORAGE_KEYS.sortField) as DocumentSortField | null;
  const storedDirection = localStorage.getItem(DOCUMENT_STORAGE_KEYS.sortDirection) as SortDirection | null;

  // Validate stored field is valid
  const validFields: DocumentSortField[] = ['updatedAt', 'createdAt', 'title', 'contentType'];
  const field: DocumentSortField = storedField && validFields.includes(storedField) ? storedField : 'updatedAt';

  // Validate stored direction is valid
  const direction: SortDirection = storedDirection === 'asc' || storedDirection === 'desc' ? storedDirection : 'desc';

  return { field, direction };
}

export function setStoredSort(field: DocumentSortField, direction: SortDirection): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DOCUMENT_STORAGE_KEYS.sortField, field);
  localStorage.setItem(DOCUMENT_STORAGE_KEYS.sortDirection, direction);
}

// ============================================================================
// Filter Helpers
// ============================================================================

/**
 * Creates a filter function that can be used to filter documents.
 * Combines content type filters, tag filters, and optional search query.
 */
export function createDocumentFilter(
  config: DocumentFilterConfig,
  search?: string
): (doc: { title?: string; contentType?: string; tags?: string[] }) => boolean {
  const searchLower = search?.toLowerCase().trim() || '';
  const hasContentTypeFilter = config.contentTypes.length > 0;
  const hasTagFilter = config.tags.length > 0;
  const hasSearch = searchLower.length > 0;

  // No filters active
  if (!hasContentTypeFilter && !hasTagFilter && !hasSearch) {
    return () => true;
  }

  return (doc) => {
    // Search filter: check title
    if (hasSearch) {
      const title = (doc.title || '').toLowerCase();
      if (!title.includes(searchLower)) {
        return false;
      }
    }

    // Content type filter: doc must match one of selected types
    if (hasContentTypeFilter) {
      const docType = (doc.contentType || 'text').toLowerCase();
      if (!config.contentTypes.some((t) => t.toLowerCase() === docType)) {
        return false;
      }
    }

    // Tag filter: doc must have at least one of selected tags
    if (hasTagFilter) {
      const docTags = doc.tags || [];
      if (!config.tags.some((tag) => docTags.includes(tag))) {
        return false;
      }
    }

    return true;
  };
}

/**
 * Returns the count of active filters in a filter config.
 */
export function getActiveFilterCount(config: DocumentFilterConfig): number {
  return config.contentTypes.length + config.tags.length;
}

/**
 * Returns true if any filters are active.
 */
export function hasActiveFilters(config: DocumentFilterConfig): boolean {
  return getActiveFilterCount(config) > 0;
}

/**
 * Gets the default direction for a sort field.
 */
export function getDefaultDirection(field: DocumentSortField): SortDirection {
  const option = DOCUMENT_SORT_OPTIONS.find((o) => o.value === field);
  return option?.defaultDirection ?? 'desc';
}
