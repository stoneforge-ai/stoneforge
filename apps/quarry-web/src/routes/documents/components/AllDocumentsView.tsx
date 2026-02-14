/**
 * AllDocumentsView - Shows all documents with search, sorting, and filtering
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { FileText, Search, Plus, Filter } from 'lucide-react';
import { useShortcutVersion } from '../../../hooks';
import { getCurrentBinding } from '../../../lib/keyboard';
import { VirtualizedList } from '../../../components/shared/VirtualizedList';
import { useAllDocuments as useAllDocumentsPreloaded } from '../../../api/hooks/useAllElements';
import { sortData } from '../../../hooks/usePaginatedData';
import { DocumentListItem } from './DocumentListItem';
import { DOCUMENT_ITEM_HEIGHT } from '../constants';
import type { DocumentType } from '../types';
import {
  type DocumentSortField,
  type SortDirection,
  type DocumentFilterConfig,
  DocumentSortDropdown,
  DocumentFilterBar,
  MobileDocumentFilter,
  getStoredSort,
  setStoredSort,
  createDocumentFilter,
  EMPTY_DOCUMENT_FILTER,
  hasActiveFilters,
  getActiveFilterCount,
} from '@stoneforge/ui/documents';

interface AllDocumentsViewProps {
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onNewDocument: () => void;
  isMobile?: boolean;
}

export function AllDocumentsView({
  selectedDocumentId,
  onSelectDocument,
  onNewDocument,
  isMobile = false,
}: AllDocumentsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Sort state (persisted to localStorage)
  const [sortField, setSortField] = useState<DocumentSortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Filter state (session only)
  const [filters, setFilters] = useState<DocumentFilterConfig>(EMPTY_DOCUMENT_FILTER);

  useShortcutVersion();

  // Load stored sort on mount
  useEffect(() => {
    const stored = getStoredSort();
    setSortField(stored.field);
    setSortDirection(stored.direction);
  }, []);

  // Persist sort changes
  const handleSortFieldChange = (field: DocumentSortField) => {
    setSortField(field);
    setStoredSort(field, sortDirection);
  };

  const handleSortDirectionChange = (direction: SortDirection) => {
    setSortDirection(direction);
    setStoredSort(sortField, direction);
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_DOCUMENT_FILTER);
  };

  // Use upfront-loaded data
  const { data: allDocuments, isLoading: isDocumentsLoading } = useAllDocumentsPreloaded();

  // Extract all unique tags from documents
  const availableTags = useMemo(() => {
    if (!allDocuments) return [];
    const docs = allDocuments as unknown as DocumentType[];
    const tagSet = new Set<string>();
    docs.forEach((doc) => {
      (doc.tags || []).forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [allDocuments]);

  // Client-side filtering with instant results
  const filteredDocuments = useMemo((): DocumentType[] => {
    if (!allDocuments) return [];

    // Cast to DocumentType[]
    const docs = allDocuments as unknown as DocumentType[];

    // Apply search + filters
    const filterFn = createDocumentFilter(filters, searchQuery);
    const filtered = docs.filter(filterFn);

    // Sort by selected field and direction
    return sortData(filtered, { field: sortField, direction: sortDirection });
  }, [allDocuments, searchQuery, filters, sortField, sortDirection]);

  const totalItems = filteredDocuments.length;
  const isLoading = isDocumentsLoading;
  const activeFilterCount = getActiveFilterCount(filters);

  // Render function for virtualized document list item
  const renderDocumentItem = useCallback((doc: DocumentType) => (
    <div className={`${isMobile ? 'px-3' : 'px-4'}`}>
      <DocumentListItem
        document={doc}
        isSelected={selectedDocumentId === doc.id}
        onClick={onSelectDocument}
      />
    </div>
  ), [selectedDocumentId, onSelectDocument, isMobile]);

  return (
    <div
      data-testid="all-documents-view"
      className="h-full flex flex-col bg-white dark:bg-[var(--color-bg)]"
    >
      {/* Header */}
      <div
        data-testid="all-documents-header"
        className={`flex-shrink-0 ${isMobile ? 'p-3' : 'p-4'} border-b border-gray-200 dark:border-[var(--color-border)]`}
      >
        <div className="flex items-center justify-between">
          <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'} min-w-0`}>
            <FileText className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-blue-400 flex-shrink-0`} />
            <h3 className={`font-semibold text-gray-900 dark:text-[var(--color-text)] ${isMobile ? 'text-base' : 'text-lg'}`}>
              All Documents
            </h3>
            <span className={`text-gray-500 dark:text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`} data-testid="all-documents-count">
              {totalItems} {totalItems === 1 ? 'doc' : 'docs'}
            </span>
          </div>
          {/* Hide button on mobile - use FAB instead */}
          {!isMobile && (
            <button
              onClick={onNewDocument}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-md transition-colors"
              data-testid="new-document-button-all"
            >
              <Plus className="w-4 h-4" />
              Create Document
              <kbd className="ml-1 text-xs bg-[var(--color-primary-700)]/50 text-white px-1 py-0.5 rounded">{getCurrentBinding('action.createDocument')}</kbd>
            </button>
          )}
        </div>

        {/* Search box */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className={`w-full pl-9 pr-4 ${isMobile ? 'py-3' : 'py-2'} text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
            data-testid="documents-search-input"
          />
        </div>

        {/* Sort and Filter controls */}
        <div className="mt-3">
          {isMobile ? (
            // Mobile: simple filter button
            <div className="flex items-center gap-2">
              <DocumentSortDropdown
                sortField={sortField}
                sortDirection={sortDirection}
                onSortFieldChange={handleSortFieldChange}
                onSortDirectionChange={handleSortDirectionChange}
              />
              <button
                onClick={() => setMobileFilterOpen(true)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  hasActiveFilters(filters)
                    ? 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50'
                    : 'text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800'
                }`}
                data-testid="mobile-filter-button"
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          ) : (
            // Desktop: sort dropdown + filter bar
            <div className="flex items-start gap-3">
              <DocumentSortDropdown
                sortField={sortField}
                sortDirection={sortDirection}
                onSortFieldChange={handleSortFieldChange}
                onSortDirectionChange={handleSortDirectionChange}
              />
              <div className="flex-1">
                <DocumentFilterBar
                  filters={filters}
                  onFilterChange={setFilters}
                  onClearFilters={handleClearFilters}
                  availableTags={availableTags}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Virtualized Documents Area */}
      <div
        data-testid="all-documents-container"
        className="flex-1 min-h-0"
      >
        {isLoading ? (
          <div
            data-testid="all-documents-loading"
            className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
          >
            Loading documents...
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div
            data-testid="all-documents-empty"
            className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 px-4"
          >
            <FileText className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-center">
              {searchQuery || hasActiveFilters(filters)
                ? 'No documents match your search or filters'
                : 'No documents yet'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">
              {searchQuery || hasActiveFilters(filters)
                ? 'Try adjusting your search or filters'
                : 'Create documents to build your knowledge base'}
            </p>
          </div>
        ) : (
          <VirtualizedList
            items={filteredDocuments}
            getItemKey={(doc) => doc.id}
            estimateSize={isMobile ? 72 : DOCUMENT_ITEM_HEIGHT}
            renderItem={renderDocumentItem}
            overscan={5}
            className="h-full pt-2"
            scrollRestoreId="all-documents-scroll"
            testId="virtualized-all-documents-list"
            gap={isMobile ? 4 : 8}
          />
        )}
      </div>

      {/* Mobile filter sheet */}
      {isMobile && (
        <MobileDocumentFilter
          open={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          onClearFilters={handleClearFilters}
          availableTags={availableTags}
        />
      )}
    </div>
  );
}
