/**
 * LibraryView - Displays documents within a selected library with search, sorting, and filtering
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { FolderOpen, Folder, FileText, Plus, Search, Filter, Trash2 } from 'lucide-react';
import { useShortcutVersion } from '../../../hooks';
import { getCurrentBinding } from '../../../lib/keyboard';
import { VirtualizedList } from '../../../components/shared/VirtualizedList';
import { useLibrary, useLibraryDocuments } from '../hooks';
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

interface LibraryViewProps {
  libraryId: string;
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onSelectLibrary: (id: string) => void;
  onNewDocument: () => void;
  onDeleteLibrary?: () => void;
  isMobile?: boolean;
}

export function LibraryView({
  libraryId,
  selectedDocumentId,
  onSelectDocument,
  onSelectLibrary,
  onNewDocument,
  onDeleteLibrary,
  isMobile = false,
}: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Sort state (persisted to localStorage)
  const [sortField, setSortField] = useState<DocumentSortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Filter state (session only)
  const [filters, setFilters] = useState<DocumentFilterConfig>(EMPTY_DOCUMENT_FILTER);

  const { data: library, isLoading: libraryLoading } = useLibrary(libraryId);
  const { data: documents = [], isLoading: docsLoading, error } = useLibraryDocuments(libraryId);
  useShortcutVersion();

  // Load stored sort on mount
  useEffect(() => {
    const stored = getStoredSort();
    setSortField(stored.field);
    setSortDirection(stored.direction);
  }, []);

  // Reset filters when library changes
  useEffect(() => {
    setFilters(EMPTY_DOCUMENT_FILTER);
    setSearchQuery('');
  }, [libraryId]);

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

  const isLoading = libraryLoading || docsLoading;

  // Include both documents from API and embedded _documents
  const allDocuments = useMemo(() => [
    ...documents,
    ...(library?._documents || []),
  ].filter((doc, index, self) =>
    index === self.findIndex((d) => d.id === doc.id)
  ), [documents, library?._documents]);

  // Extract all unique tags from documents
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    allDocuments.forEach((doc) => {
      ((doc as DocumentType).tags || []).forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [allDocuments]);

  // Client-side filtering with instant results
  const filteredDocuments = useMemo((): DocumentType[] => {
    // Apply search + filters
    const filterFn = createDocumentFilter(filters, searchQuery);
    const filtered = (allDocuments as DocumentType[]).filter(filterFn);

    // Sort by selected field and direction
    return sortData(filtered, { field: sortField, direction: sortDirection });
  }, [allDocuments, searchQuery, filters, sortField, sortDirection]);

  const activeFilterCount = getActiveFilterCount(filters);

  // Render function for virtualized document list item
  const renderDocumentItem = useCallback((doc: DocumentType) => (
    <div className="px-4">
      <DocumentListItem
        document={doc}
        isSelected={selectedDocumentId === doc.id}
        onClick={onSelectDocument}
        libraryId={libraryId}
        draggable={true}
      />
    </div>
  ), [selectedDocumentId, onSelectDocument, libraryId]);

  return (
    <div
      data-testid="library-view"
      className="h-full flex flex-col bg-white dark:bg-[var(--color-bg)]"
    >
      {/* Library Header */}
      <div
        data-testid="library-header"
        className={`flex-shrink-0 ${isMobile ? 'p-3' : 'p-4'} border-b border-gray-200 dark:border-[var(--color-border)]`}
      >
        <div className="flex items-center justify-between">
          <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'} min-w-0`}>
            <FolderOpen className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-yellow-500 flex-shrink-0`} />
            {library ? (
              <>
                <h3
                  data-testid="library-name"
                  className={`font-semibold text-gray-900 dark:text-[var(--color-text)] ${isMobile ? 'text-base' : 'text-lg'} truncate`}
                >
                  {library.name}
                </h3>
                <span
                  data-testid="library-doc-count"
                  className={`text-gray-400 dark:text-gray-500 flex-shrink-0 ${isMobile ? 'text-xs' : 'text-sm'}`}
                >
                  {filteredDocuments.length} {filteredDocuments.length === 1 ? 'doc' : 'docs'}
                </span>
              </>
            ) : (
              <div className="animate-pulse h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
            )}
          </div>
          {/* Hide buttons on mobile - use FAB instead */}
          {!isMobile && (
            <div className="flex items-center gap-2">
              {onDeleteLibrary && (
                <button
                  onClick={onDeleteLibrary}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                  title="Delete Library"
                  data-testid="delete-library-button"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onNewDocument}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-md transition-colors"
                data-testid="new-document-button-library"
              >
                <Plus className="w-4 h-4" />
                Create Document
                <kbd className="ml-1 text-xs bg-[var(--color-primary-700)]/50 text-white px-1 py-0.5 rounded">{getCurrentBinding('action.createDocument')}</kbd>
              </button>
            </div>
          )}
        </div>

        {/* Library description */}
        {library?.description && (
          <p
            data-testid="library-description"
            className={`mt-2 text-sm text-gray-600 dark:text-gray-400 ${isMobile ? 'line-clamp-2' : ''}`}
          >
            {library.description}
          </p>
        )}

        {/* Search box */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className={`w-full pl-9 pr-4 ${isMobile ? 'py-3' : 'py-2'} text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
            data-testid="library-search-input"
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

      {/* Sub-libraries section */}
      {library?._subLibraries && library._subLibraries.length > 0 && (
        <div data-testid="sub-libraries" className={`flex-shrink-0 ${isMobile ? 'p-3' : 'p-4'} border-b border-gray-100 dark:border-gray-800`}>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Sub-libraries
          </h4>
          <div className="flex flex-wrap gap-2">
            {library._subLibraries.map((subLib) => (
              <button
                key={subLib.id}
                data-testid={`sub-library-${subLib.id}`}
                onClick={() => onSelectLibrary(subLib.id)}
                className={`flex items-center gap-1.5 ${isMobile ? 'px-2.5 py-2' : 'px-3 py-1.5'} bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-md text-sm hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors cursor-pointer ${isMobile ? 'touch-target' : ''}`}
              >
                <Folder className="w-4 h-4" />
                {subLib.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Virtualized Documents Area */}
      <div
        data-testid="documents-container"
        className="flex-1 min-h-0"
      >
        {isLoading ? (
          <div
            data-testid="documents-loading"
            className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
          >
            Loading documents...
          </div>
        ) : error ? (
          <div
            data-testid="documents-error"
            className="flex items-center justify-center h-full text-red-500 dark:text-red-400"
          >
            Failed to load documents
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div
            data-testid="documents-empty"
            className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 px-4"
          >
            <FileText className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm">
              {searchQuery || hasActiveFilters(filters)
                ? 'No documents match your search or filters'
                : 'No documents in this library'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {searchQuery || hasActiveFilters(filters)
                ? 'Try adjusting your search or filters'
                : 'Add documents to organize your knowledge'}
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
            scrollRestoreId={`library-documents-${libraryId}`}
            testId="virtualized-documents-list"
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
