/**
 * @stoneforge/ui Documents Types
 *
 * Type definitions for document sorting and filtering.
 */

export type DocumentSortField = 'updatedAt' | 'createdAt' | 'title' | 'contentType';
export type SortDirection = 'asc' | 'desc';

export interface DocumentSortOption {
  value: DocumentSortField;
  label: string;
  defaultDirection: SortDirection;
}

export interface ContentTypeFilterOption {
  value: string;
  label: string;
  color: string;
}

export interface DocumentFilterConfig {
  contentTypes: string[];  // Multi-select
  tags: string[];          // Multi-select
}
