/**
 * Document Links Components
 * - DocumentLinkPickerModal
 * - LinkedDocumentCard
 * - LinkedDocumentsSection
 */

import React, { useState } from 'react';
import {
  Link2,
  X,
  Search,
  FileText,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  ExternalLink,
  Unlink,
} from 'lucide-react';
import { useDocumentLinks, useAddDocumentLink, useRemoveDocumentLink, useAllDocumentsForPicker } from '../hooks';
import type { DocumentType } from '../types';

/**
 * Modal for selecting a document to link
 */
interface DocumentLinkPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDocument: (documentId: string) => void;
  currentDocumentId: string;
  existingLinkIds: string[];
}

export function DocumentLinkPickerModal({
  isOpen,
  onClose,
  onSelectDocument,
  currentDocumentId,
  existingLinkIds,
}: DocumentLinkPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: documents = [], isLoading } = useAllDocumentsForPicker();

  // Filter documents: exclude current document, existing links, and apply search
  const filteredDocuments = documents.filter((doc) => {
    if (doc.id === currentDocumentId) return false;
    if (existingLinkIds.includes(doc.id)) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        (doc.title?.toLowerCase().includes(query)) ||
        doc.id.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Handle escape key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="document-link-picker-modal"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal content */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-500" />
            Link Document
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            aria-label="Close"
            data-testid="document-link-picker-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by title or ID..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              data-testid="document-link-search"
            />
          </div>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading documents...</div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery.trim() ? 'No matching documents found' : 'No documents available to link'}
            </div>
          ) : (
            <div className="space-y-2" data-testid="document-link-list">
              {filteredDocuments.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-colors"
                  data-testid={`document-link-option-${doc.id}`}
                >
                  <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {doc.title || `Document ${doc.id}`}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="font-mono">{doc.id}</span>
                      <span>·</span>
                      <span>{doc.contentType}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Linked document card - displays a linked document with remove option
 */
interface LinkedDocumentCardProps {
  document: DocumentType;
  direction: 'outgoing' | 'incoming';
  onRemove: () => void;
  onNavigate: () => void;
  isRemoving: boolean;
}

export function LinkedDocumentCard({
  document,
  direction,
  onRemove,
  onNavigate,
  isRemoving,
}: LinkedDocumentCardProps) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors group"
      data-testid={`linked-document-${document.id}`}
    >
      {/* Direction indicator */}
      <div
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
          direction === 'outgoing' ? 'bg-blue-100' : 'bg-green-100'
        }`}
        title={direction === 'outgoing' ? 'Links to' : 'Linked from'}
      >
        {direction === 'outgoing' ? (
          <ArrowRight className="w-3 h-3 text-blue-600" />
        ) : (
          <ArrowLeft className="w-3 h-3 text-green-600" />
        )}
      </div>

      {/* Document info */}
      <div className="flex-1 min-w-0">
        <button
          onClick={onNavigate}
          className="font-medium text-gray-900 hover:text-blue-600 truncate block text-left w-full"
          data-testid={`linked-document-title-${document.id}`}
        >
          {document.title || `Document ${document.id}`}
        </button>
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <span className="font-mono">{document.id}</span>
          <span>·</span>
          <span>{document.contentType}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onNavigate}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
          title="Open document"
          data-testid={`linked-document-open-${document.id}`}
        >
          <ExternalLink className="w-4 h-4" />
        </button>
        {direction === 'outgoing' && (
          <button
            onClick={onRemove}
            disabled={isRemoving}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
            title="Remove link"
            data-testid={`linked-document-remove-${document.id}`}
          >
            <Unlink className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * LinkedDocumentsSection - Shows outgoing and incoming document links
 */
interface LinkedDocumentsSectionProps {
  documentId: string;
  onNavigateToDocument: (id: string) => void;
}

export function LinkedDocumentsSection({
  documentId,
  onNavigateToDocument,
}: LinkedDocumentsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  const { data: links, isLoading, isError } = useDocumentLinks(documentId);
  const addLink = useAddDocumentLink();
  const removeLink = useRemoveDocumentLink();

  const outgoing = links?.outgoing || [];
  const incoming = links?.incoming || [];
  const totalLinks = outgoing.length + incoming.length;

  const handleAddLink = (targetDocumentId: string) => {
    addLink.mutate({ blockedId: documentId, targetDocumentId });
    setShowPicker(false);
  };

  const handleRemoveLink = (blockerId: string) => {
    removeLink.mutate({ blockedId: documentId, blockerId });
  };

  const existingOutgoingIds = outgoing.map((doc) => doc.id);

  return (
    <div className="mb-6" data-testid="linked-documents-section">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700 w-full"
        data-testid="linked-documents-toggle"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <Link2 className="w-3 h-3" />
        <span>Linked Documents</span>
        {totalLinks > 0 && (
          <span className="text-gray-400 font-normal">({totalLinks})</span>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-4">
          {isLoading && (
            <div className="text-sm text-gray-500">Loading links...</div>
          )}

          {isError && (
            <div className="text-sm text-red-500">Failed to load links</div>
          )}

          {!isLoading && !isError && (
            <>
              {/* Outgoing links section */}
              {outgoing.length > 0 && (
                <div data-testid="outgoing-links-section">
                  <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" />
                    Links to ({outgoing.length})
                  </div>
                  <div className="space-y-2">
                    {outgoing.map((doc) => (
                      <LinkedDocumentCard
                        key={doc.id}
                        document={doc}
                        direction="outgoing"
                        onRemove={() => handleRemoveLink(doc.id)}
                        onNavigate={() => onNavigateToDocument(doc.id)}
                        isRemoving={removeLink.isPending}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Incoming links section */}
              {incoming.length > 0 && (
                <div data-testid="incoming-links-section">
                  <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" />
                    Linked from ({incoming.length})
                  </div>
                  <div className="space-y-2">
                    {incoming.map((doc) => (
                      <LinkedDocumentCard
                        key={doc.id}
                        document={doc}
                        direction="incoming"
                        onRemove={() => {}}
                        onNavigate={() => onNavigateToDocument(doc.id)}
                        isRemoving={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {totalLinks === 0 && (
                <div className="text-sm text-gray-400 italic" data-testid="no-links-message">
                  No linked documents
                </div>
              )}

              {/* Add link button */}
              <button
                onClick={() => setShowPicker(true)}
                disabled={addLink.isPending}
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                data-testid="add-document-link-button"
              >
                <Plus className="w-4 h-4" />
                Link Document
              </button>

              {/* Error message */}
              {addLink.isError && (
                <div className="text-sm text-red-500 mt-2">
                  {addLink.error?.message || 'Failed to add link'}
                </div>
              )}
              {removeLink.isError && (
                <div className="text-sm text-red-500 mt-2">
                  {removeLink.error?.message || 'Failed to remove link'}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Document link picker modal */}
      <DocumentLinkPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelectDocument={handleAddLink}
        currentDocumentId={documentId}
        existingLinkIds={existingOutgoingIds}
      />
    </div>
  );
}
