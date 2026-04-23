/**
 * @stoneforge/ui Documents Module
 *
 * Shared types, utilities, and components for document sorting and filtering.
 * Use this module to build document list views in any Stoneforge app.
 *
 * Usage:
 * - Import everything: import * as Documents from '@stoneforge/ui/documents'
 * - Import types: import type { DocumentSortField, DocumentFilterConfig } from '@stoneforge/ui/documents'
 * - Import utils: import { getStoredSort, createDocumentFilter } from '@stoneforge/ui/documents'
 * - Import components: import { DocumentSortDropdown, DocumentFilterBar } from '@stoneforge/ui/documents'
 */

// Types
export type {
  DocumentSortField,
  SortDirection,
  DocumentSortOption,
  ContentTypeFilterOption,
  DocumentFilterConfig,
} from './types';

// Constants
export {
  DOCUMENT_SORT_OPTIONS,
  CONTENT_TYPE_FILTER_OPTIONS,
  DOCUMENT_STORAGE_KEYS,
  EMPTY_DOCUMENT_FILTER,
} from './constants';

// Utilities
export {
  getStoredSort,
  setStoredSort,
  createDocumentFilter,
  getActiveFilterCount,
  hasActiveFilters,
  getDefaultDirection,
} from './utils';

// Components
export * from './components';
