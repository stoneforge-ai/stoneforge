/**
 * Documents Page - Notion-style document library interface
 *
 * Features:
 * - Library tree sidebar
 * - Library selection
 * - Document list
 * - Nested library navigation
 * - Document detail display
 */

import { useState, useEffect } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ElementNotFound } from '../../components/shared/ElementNotFound';
import { MobileDetailSheet } from '../../components/shared/MobileDetailSheet';
import { CreateDocumentModal } from '../../components/document/CreateDocumentModal';
import { CreateLibraryModal } from '../../components/document/CreateLibraryModal';
import { useDeepLink, useShortcutVersion } from '../../hooks';
import { useIsMobile } from '../../hooks/useBreakpoint';
import { useAllDocuments as useAllDocumentsPreloaded } from '../../api/hooks/useAllElements';
import { DeleteLibraryModal } from '@stoneforge/ui/documents';

import { useLibraries, useLibrary } from './hooks';
import type { DocumentType } from './types';
import {
  LibraryTree,
  LibraryView,
  AllDocumentsView,
  DocumentDetailPanel,
} from './components';

export function DocumentsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/documents' });
  const isMobile = useIsMobile();
  useShortcutVersion();

  const queryClient = useQueryClient();
  const { data: libraries = [], isLoading, error } = useLibraries();

  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    search.library ?? null
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    search.selected ?? null
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateLibraryModal, setShowCreateLibraryModal] = useState(false);
  const [showDeleteLibraryModal, setShowDeleteLibraryModal] = useState(false);
  const [deleteTargetLibraryId, setDeleteTargetLibraryId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Get delete target library details for delete modal
  const { data: deleteTargetLibrary } = useLibrary(deleteTargetLibraryId || '');
  const deleteTargetLibraryDocCount = deleteTargetLibrary?._documents?.length || 0;

  // Delete library mutation
  const deleteLibraryMutation = useMutation({
    mutationFn: async ({ libraryId, cascade }: { libraryId: string; cascade: boolean }) => {
      const response = await fetch(`/api/libraries/${libraryId}?cascade=${cascade}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to delete library');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowDeleteLibraryModal(false);
      // Clear selection only if we deleted the currently selected library
      if (deleteTargetLibraryId === selectedLibraryId) {
        setSelectedLibraryId(null);
      }
      setDeleteTargetLibraryId(null);
      setDeleteError(null);
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
  });
  // Expand state - initialized from localStorage
  const [isDocumentExpanded, setIsDocumentExpandedState] = useState(false);
  const [expandedInitialized, setExpandedInitialized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Initialize expand state from localStorage on mount
  useEffect(() => {
    if (!expandedInitialized) {
      const stored = localStorage.getItem('document.expanded');
      if (stored === 'true') {
        setIsDocumentExpandedState(true);
      }
      setExpandedInitialized(true);
    }
  }, [expandedInitialized]);

  // Wrapper for setIsDocumentExpanded that also persists to localStorage
  const setIsDocumentExpanded = (value: boolean | ((prev: boolean) => boolean)) => {
    setIsDocumentExpandedState((prev) => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      localStorage.setItem('document.expanded', newValue.toString());
      return newValue;
    });
  };

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Use upfront-loaded data for deep-link navigation
  const { data: allDocuments } = useAllDocumentsPreloaded();

  // Deep-link navigation
  const deepLink = useDeepLink({
    data: allDocuments as DocumentType[] | undefined,
    selectedId: search.selected,
    currentPage: 1,
    pageSize: 1000,
    getId: (doc: DocumentType) => doc.id,
    routePath: '/documents',
    rowTestIdPrefix: 'document-item-',
    autoNavigate: false,
    highlightDelay: 200,
  });

  // Sync state from URL on mount and when search changes
  useEffect(() => {
    if (search.selected && search.selected !== selectedDocumentId) {
      setSelectedDocumentId(search.selected);
    }
    if (!search.selected && selectedDocumentId) {
      setSelectedDocumentId(null);
    }
    if (search.library && search.library !== selectedLibraryId) {
      setSelectedLibraryId(search.library);
    }
    if (!search.library && selectedLibraryId) {
      setSelectedLibraryId(null);
    }
  }, [search.selected, search.library]);

  // Toggle expand/collapse for a library in the tree
  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Expand all ancestors of a library in the tree
  const expandAncestors = (libraryId: string) => {
    const library = libraries.find(l => l.id === libraryId);
    if (!library) return;

    const ancestorsToExpand: string[] = [];
    let current = library;
    while (current.parentId) {
      ancestorsToExpand.push(current.parentId);
      const parent = libraries.find(l => l.id === current.parentId);
      if (!parent) break;
      current = parent;
    }

    if (ancestorsToExpand.length > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of ancestorsToExpand) {
          next.add(id);
        }
        return next;
      });
    }
  };

  // Clear document selection and collapse when library changes
  const handleSelectLibrary = (libraryId: string | null) => {
    setSelectedLibraryId(libraryId);
    setSelectedDocumentId(null);
    setIsDocumentExpanded(false);
    if (libraryId) {
      expandAncestors(libraryId);
    }
  };

  const handleSelectDocument = (documentId: string) => {
    setSelectedDocumentId(documentId);
    navigate({ to: '/documents', search: { selected: documentId, library: selectedLibraryId ?? undefined } });
  };

  const handleCloseDocument = () => {
    setSelectedDocumentId(null);
    navigate({ to: '/documents', search: { selected: undefined, library: selectedLibraryId ?? undefined } });
  };

  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
  };

  const handleOpenCreateLibraryModal = () => {
    setShowCreateLibraryModal(true);
  };

  const handleCloseCreateLibraryModal = () => {
    setShowCreateLibraryModal(false);
  };

  const handleLibraryCreated = (library: { id: string }) => {
    setSelectedLibraryId(library.id);
  };

  const handleDocumentCreated = (document: { id: string }) => {
    setSelectedDocumentId(document.id);
  };

  const handleMobileBack = () => {
    setSelectedDocumentId(null);
    navigate({ to: '/documents', search: { selected: undefined, library: selectedLibraryId ?? undefined } });
  };

  const handleOpenDeleteLibraryModal = (libraryId?: string) => {
    setDeleteError(null);
    // If a library ID is provided (from tree row button), use it; otherwise use selected library
    setDeleteTargetLibraryId(libraryId || selectedLibraryId);
    setShowDeleteLibraryModal(true);
  };

  const handleCloseDeleteLibraryModal = () => {
    setShowDeleteLibraryModal(false);
    setDeleteTargetLibraryId(null);
    setDeleteError(null);
  };

  const handleDeleteLibrary = async (deleteDocuments: boolean) => {
    if (!deleteTargetLibraryId) return;
    await deleteLibraryMutation.mutateAsync({
      libraryId: deleteTargetLibraryId,
      cascade: deleteDocuments,
    });
  };

  if (error) {
    return (
      <div
        data-testid="documents-page-error"
        className="flex items-center justify-center h-full px-4"
      >
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load libraries</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  // Determine the main content view
  const renderMainContent = (mobile = false) => {
    if (selectedLibraryId) {
      return (
        <LibraryView
          libraryId={selectedLibraryId}
          selectedDocumentId={selectedDocumentId}
          onSelectDocument={handleSelectDocument}
          onSelectLibrary={handleSelectLibrary}
          onNewDocument={handleOpenCreateModal}
          onDeleteLibrary={handleOpenDeleteLibraryModal}
          isMobile={mobile}
        />
      );
    }

    return (
      <AllDocumentsView
        selectedDocumentId={selectedDocumentId}
        onSelectDocument={handleSelectDocument}
        onNewDocument={handleOpenCreateModal}
        isMobile={mobile}
      />
    );
  };

  // Mobile: Two-screen navigation pattern
  if (isMobile) {
    return (
      <div data-testid="documents-page" className="flex flex-col h-full relative">
        {/* Mobile: Show document list when no document selected */}
        {!selectedDocumentId && (
          <>
            {isLoading ? (
              <div
                data-testid="libraries-loading"
                className="flex-1 flex items-center justify-center"
              >
                <div className="text-gray-500 dark:text-gray-400">Loading...</div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden">
                {renderMainContent(true)}
              </div>
            )}

            {/* Mobile FAB for creating new document */}
            <button
              onClick={handleOpenCreateModal}
              className="fixed bottom-20 right-4 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors z-30 touch-target"
              data-testid="mobile-create-document-fab"
              aria-label="Create new document"
            >
              <Plus className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Mobile: Show full-screen document editor when document selected */}
        {selectedDocumentId && (
          <MobileDetailSheet
            open={true}
            onClose={handleMobileBack}
            title="Document"
            data-testid="mobile-document-sheet"
          >
            {deepLink.notFound ? (
              <ElementNotFound
                elementType="Document"
                elementId={selectedDocumentId}
                backRoute="/documents"
                backLabel="Back to Documents"
                onDismiss={handleMobileBack}
              />
            ) : (
              <div className="h-full">
                <DocumentDetailPanel
                  documentId={selectedDocumentId}
                  onClose={handleMobileBack}
                  isExpanded={true}
                  isFullscreen={false}
                  onDocumentCloned={handleDocumentCreated}
                  libraryId={selectedLibraryId}
                  onNavigateToDocument={handleSelectDocument}
                  isMobile={true}
                />
              </div>
            )}
          </MobileDetailSheet>
        )}

        {/* Create Document Modal */}
        <CreateDocumentModal
          isOpen={showCreateModal}
          onClose={handleCloseCreateModal}
          onSuccess={handleDocumentCreated}
          defaultLibraryId={selectedLibraryId || undefined}
          isMobile={true}
        />

        {/* Create Library Modal */}
        <CreateLibraryModal
          isOpen={showCreateLibraryModal}
          onClose={handleCloseCreateLibraryModal}
          onSuccess={handleLibraryCreated}
          defaultParentId={selectedLibraryId || undefined}
        />

        {/* Delete Library Modal */}
        <DeleteLibraryModal
          isOpen={showDeleteLibraryModal}
          onClose={handleCloseDeleteLibraryModal}
          onConfirm={handleDeleteLibrary}
          library={deleteTargetLibraryId && deleteTargetLibrary ? { id: deleteTargetLibraryId, name: deleteTargetLibrary.name } : null}
          documentCount={deleteTargetLibraryDocCount}
          isDeleting={deleteLibraryMutation.isPending}
          error={deleteError}
          isMobile={true}
        />
      </div>
    );
  }

  // Desktop: Side-by-side layout
  return (
    <div data-testid="documents-page" className="flex h-full">
      {/* Fullscreen Panel - overlays everything when in fullscreen mode */}
      {isFullscreen && selectedDocumentId && (
        <div
          data-testid="document-fullscreen-panel"
          className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col"
        >
          <DocumentDetailPanel
            documentId={selectedDocumentId}
            onClose={() => setIsFullscreen(false)}
            isExpanded={true}
            onToggleExpand={() => setIsFullscreen(false)}
            isFullscreen={true}
            onExitFullscreen={() => setIsFullscreen(false)}
            onDocumentCloned={handleDocumentCreated}
            libraryId={selectedLibraryId}
            onNavigateToDocument={handleSelectDocument}
          />
        </div>
      )}

      {/* Library Tree Sidebar - hide in fullscreen mode */}
      {!isFullscreen && (
        <>
          {isLoading ? (
            <div
              data-testid="libraries-loading"
              className="w-64 border-r border-gray-200 dark:border-[var(--color-border)] flex items-center justify-center"
            >
              <div className="text-gray-500 dark:text-gray-400">Loading libraries...</div>
            </div>
          ) : (
            <div data-testid="library-tree-sidebar">
              <LibraryTree
                libraries={libraries}
                selectedLibraryId={selectedLibraryId}
                expandedIds={expandedIds}
                onSelectLibrary={handleSelectLibrary}
                onToggleExpand={handleToggleExpand}
                onNewDocument={handleOpenCreateModal}
                onNewLibrary={handleOpenCreateLibraryModal}
                onSelectDocument={handleSelectDocument}
                onDeleteLibrary={handleOpenDeleteLibraryModal}
              />
            </div>
          )}
        </>
      )}

      {/* Main Content Area - with or without document detail panel (hidden in fullscreen) */}
      {!isFullscreen && (
        <div className="flex-1 flex overflow-hidden">
          {/* Document List / Library View - hide when document is expanded */}
          {(!selectedDocumentId || !isDocumentExpanded) && (
            <div className={`${selectedDocumentId ? 'flex-1 border-r border-gray-200 dark:border-[var(--color-border)]' : 'flex-1'} h-full overflow-hidden`}>
              {renderMainContent()}
            </div>
          )}

          {/* Document Detail Panel or Not Found */}
          {selectedDocumentId && (
            <div className={`${isDocumentExpanded ? 'flex-1' : 'flex-1'} flex-shrink-0 overflow-hidden`}>
              {deepLink.notFound ? (
                <ElementNotFound
                  elementType="Document"
                  elementId={selectedDocumentId}
                  backRoute="/documents"
                  backLabel="Back to Documents"
                  onDismiss={handleCloseDocument}
                />
              ) : (
                <DocumentDetailPanel
                  documentId={selectedDocumentId}
                  onClose={handleCloseDocument}
                  isExpanded={isDocumentExpanded}
                  onToggleExpand={() => setIsDocumentExpanded(!isDocumentExpanded)}
                  isFullscreen={false}
                  onEnterFullscreen={() => setIsFullscreen(true)}
                  onDocumentCloned={handleDocumentCreated}
                  libraryId={selectedLibraryId}
                  onNavigateToDocument={handleSelectDocument}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Document Modal */}
      <CreateDocumentModal
        isOpen={showCreateModal}
        onClose={handleCloseCreateModal}
        onSuccess={handleDocumentCreated}
        defaultLibraryId={selectedLibraryId || undefined}
      />

      {/* Create Library Modal */}
      <CreateLibraryModal
        isOpen={showCreateLibraryModal}
        onClose={handleCloseCreateLibraryModal}
        onSuccess={handleLibraryCreated}
        defaultParentId={selectedLibraryId || undefined}
      />

      {/* Delete Library Modal */}
      <DeleteLibraryModal
        isOpen={showDeleteLibraryModal}
        onClose={handleCloseDeleteLibraryModal}
        onConfirm={handleDeleteLibrary}
        library={deleteTargetLibraryId && deleteTargetLibrary ? { id: deleteTargetLibraryId, name: deleteTargetLibrary.name } : null}
        documentCount={deleteTargetLibraryDocCount}
        isDeleting={deleteLibraryMutation.isPending}
        error={deleteError}
        isMobile={isMobile}
      />
    </div>
  );
}

// Default export for route
export default DocumentsPage;
