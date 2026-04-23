/**
 * VersionHistorySidebar - Shows document version history with restore capability
 */

import { History, X, Eye, RotateCcw } from 'lucide-react';
import { useDocumentVersions, useRestoreDocumentVersion } from '../hooks';
import { formatRelativeTime } from '../utils';

interface VersionHistorySidebarProps {
  documentId: string;
  currentVersion: number;
  onPreviewVersion: (version: number | null) => void;
  previewingVersion: number | null;
  onClose: () => void;
}

export function VersionHistorySidebar({
  documentId,
  currentVersion,
  onPreviewVersion,
  previewingVersion,
  onClose,
}: VersionHistorySidebarProps) {
  const { data: versions = [], isLoading, error } = useDocumentVersions(documentId);
  const restoreVersion = useRestoreDocumentVersion();

  const handleRestore = async (version: number) => {
    if (confirm(`Restore to version ${version}? This will create a new version with the restored content.`)) {
      try {
        await restoreVersion.mutateAsync({ id: documentId, version });
        onPreviewVersion(null);
      } catch {
        // Error is handled by mutation
      }
    }
  };

  return (
    <div
      data-testid="version-history-sidebar"
      className="w-72 border-l border-gray-200 bg-gray-50 flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900 text-sm">Version History</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          aria-label="Close version history"
          data-testid="version-history-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Version List */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div data-testid="version-history-loading" className="text-center text-gray-500 text-sm py-4">
            Loading versions...
          </div>
        )}

        {error && (
          <div data-testid="version-history-error" className="text-center text-red-500 text-sm py-4">
            Failed to load versions
          </div>
        )}

        {!isLoading && !error && versions.length === 0 && (
          <div data-testid="version-history-empty" className="text-center text-gray-500 text-sm py-4">
            No version history available
          </div>
        )}

        {!isLoading && !error && versions.length > 0 && (
          <div data-testid="version-history-list" className="space-y-1">
            {versions.map((version) => {
              const isCurrentVersion = version.version === currentVersion;
              const isPreviewing = previewingVersion === version.version;

              return (
                <div
                  key={version.version}
                  data-testid={`version-item-${version.version}`}
                  className={`p-2 rounded-md ${
                    isPreviewing
                      ? 'bg-blue-100 border border-blue-300'
                      : isCurrentVersion
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-white border border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">
                        v{version.version}
                      </span>
                      {isCurrentVersion && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          Current
                        </span>
                      )}
                      {isPreviewing && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          Previewing
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 mb-2">
                    {formatRelativeTime(version.updatedAt)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {!isCurrentVersion && (
                      <>
                        <button
                          onClick={() => onPreviewVersion(isPreviewing ? null : version.version!)}
                          data-testid={`version-preview-${version.version}`}
                          className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
                            isPreviewing
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <Eye className="w-3 h-3" />
                          {isPreviewing ? 'Exit Preview' : 'Preview'}
                        </button>
                        <button
                          onClick={() => handleRestore(version.version!)}
                          disabled={restoreVersion.isPending}
                          data-testid={`version-restore-${version.version}`}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Restore Error */}
      {restoreVersion.isError && (
        <div className="p-2 m-2 bg-red-50 text-red-700 text-xs rounded">
          {restoreVersion.error?.message || 'Failed to restore version'}
        </div>
      )}
    </div>
  );
}
