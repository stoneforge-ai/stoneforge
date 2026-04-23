/**
 * ExtensionDetailPage - Rich detail view for a single extension
 *
 * Displays full extension metadata, README, and changelog.
 * Rendered in an editor tab like VSCode's extension detail pages.
 *
 * Features:
 * - Large icon with extension name, publisher, and rating
 * - Install/Uninstall action button
 * - Tabbed content: Details (README) and Changelog
 * - Metadata sidebar with version info, categories, and links
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { marked } from 'marked';
import {
  Package,
  Star,
  Download,
  ExternalLink,
  Loader2,
  AlertCircle,
  Trash2,
  Folder,
  Link as LinkIcon,
  FileText,
  Scale,
} from 'lucide-react';
import { getExtensionMetadata } from '../../lib/openvsx/client';
import { useExtensionManager } from '../../lib/extensions';

// ============================================================================
// Types
// ============================================================================

export interface ExtensionDetailPageProps {
  /** Extension identifier in "namespace.name" format */
  extensionId: string;
  /** Optional class name */
  className?: string;
}

/** Detail tab options */
type DetailTab = 'details' | 'changelog';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a number with appropriate suffix (K, M, etc.)
 */
function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Format an ISO timestamp as relative time (e.g., "5 months ago")
 */
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Format an ISO timestamp as a date string
 */
function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Render star rating as filled/empty star icons
 */
function StarRating({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: fullStars }).map((_, i) => (
        <Star key={`full-${i}`} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
      ))}
      {hasHalfStar && (
        <Star key="half" className="w-3.5 h-3.5 text-yellow-400" style={{ clipPath: 'inset(0 50% 0 0)' }} />
      )}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <Star key={`empty-${i}`} className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
      ))}
      <span className="ml-1 text-xs text-[var(--color-text-secondary)]">
        ({rating.toFixed(1)})
      </span>
    </div>
  );
}

// ============================================================================
// Markdown Content Component
// ============================================================================

interface MarkdownContentProps {
  content: string;
  isLoading: boolean;
  error: string | null;
  emptyMessage: string;
}

function MarkdownContent({ content, isLoading, error, emptyMessage }: MarkdownContentProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-2" />
        <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="w-8 h-8 text-[var(--color-text-muted)] mb-2" />
        <p className="text-sm text-[var(--color-text-secondary)]">{emptyMessage}</p>
      </div>
    );
  }

  // Parse markdown to HTML
  const htmlContent = marked.parse(content);

  return (
    <div
      className="extension-readme-content prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: htmlContent as string }}
    />
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ExtensionDetailPage({ extensionId, className = '' }: ExtensionDetailPageProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('details');

  // Parse extensionId into namespace and name
  const [namespace, name] = extensionId.split('.');

  // Extension manager for install/uninstall
  const { installed, installing, install, uninstall } = useExtensionManager();

  // Check if this extension is installed
  const isInstalled = installed.some((ext) => ext.id === extensionId);
  const isInstalling = installing.has(extensionId);
  const [isUninstalling, setIsUninstalling] = useState(false);

  // Fetch full extension metadata
  const {
    data: extension,
    isLoading: metadataLoading,
    error: metadataError,
  } = useQuery({
    queryKey: ['extension', namespace, name],
    queryFn: () => getExtensionMetadata(namespace, name),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!namespace && !!name,
  });

  // Fetch README content
  const {
    data: readmeContent,
    isLoading: readmeLoading,
    error: readmeError,
  } = useQuery({
    queryKey: ['extension', namespace, name, 'readme'],
    queryFn: async () => {
      if (!extension?.files?.readme) return '';
      const response = await fetch(extension.files.readme);
      if (!response.ok) throw new Error('Failed to load README');
      return response.text();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!extension?.files?.readme,
  });

  // Fetch changelog content
  const {
    data: changelogContent,
    isLoading: changelogLoading,
    error: changelogError,
  } = useQuery({
    queryKey: ['extension', namespace, name, 'changelog'],
    queryFn: async () => {
      if (!extension?.files?.changelog) return '';
      const response = await fetch(extension.files.changelog);
      if (!response.ok) throw new Error('Failed to load changelog');
      return response.text();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!extension?.files?.changelog && activeTab === 'changelog',
  });

  // Handle install
  const handleInstall = useCallback(async () => {
    if (isInstalling || !namespace || !name) return;
    try {
      await install(namespace, name, 'latest');
    } catch (error) {
      console.error('[ExtensionDetailPage] Install failed:', error);
    }
  }, [namespace, name, isInstalling, install]);

  // Handle uninstall
  const handleUninstall = useCallback(async () => {
    if (isUninstalling) return;
    setIsUninstalling(true);
    try {
      await uninstall(extensionId);
    } catch (error) {
      console.error('[ExtensionDetailPage] Uninstall failed:', error);
    } finally {
      setIsUninstalling(false);
    }
  }, [extensionId, isUninstalling, uninstall]);

  // Loading state
  if (metadataLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  // Error state
  if (metadataError || !extension) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-center p-6 ${className}`}>
        <AlertCircle className="w-12 h-12 text-[var(--color-danger)] mb-4" />
        <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">Failed to Load Extension</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {metadataError instanceof Error ? metadataError.message : 'Could not load extension details.'}
        </p>
      </div>
    );
  }

  const displayName = extension.displayName || extension.name;
  const iconUrl = extension.files?.icon;

  return (
    <div className={`flex flex-col h-full overflow-hidden bg-[var(--color-bg)] ${className}`}>
      {/* Header Section */}
      <div className="flex-shrink-0 p-6 border-b border-[var(--color-border)]">
        <div className="flex items-start gap-4">
          {/* Extension Icon */}
          <div className="flex-shrink-0 w-20 h-20 rounded-lg bg-[var(--color-surface)] flex items-center justify-center overflow-hidden">
            {iconUrl ? (
              <img
                src={iconUrl}
                alt={`${displayName} icon`}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <Package
              className={`w-10 h-10 text-[var(--color-text-muted)] ${iconUrl ? 'hidden' : ''}`}
            />
          </div>

          {/* Extension Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1 truncate">
              {displayName}
            </h1>
            <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)] mb-2">
              <span>{extension.namespace}</span>
              {extension.downloadCount !== undefined && (
                <span className="flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" />
                  {formatCount(extension.downloadCount)}
                </span>
              )}
              {extension.averageRating !== undefined && extension.averageRating > 0 && (
                <StarRating rating={extension.averageRating} />
              )}
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2">
              {extension.description || 'No description available'}
            </p>
          </div>

          {/* Action Button */}
          <div className="flex-shrink-0">
            {isInstalled ? (
              <button
                onClick={handleUninstall}
                disabled={isUninstalling}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors
                  ${isUninstalling
                    ? 'bg-[var(--color-surface)] text-[var(--color-text-muted)] cursor-not-allowed'
                    : 'bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]/90'
                  }
                `}
              >
                {isUninstalling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isUninstalling ? 'Uninstalling...' : 'Uninstall'}</span>
              </button>
            ) : (
              <button
                onClick={handleInstall}
                disabled={isInstalling}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors
                  ${isInstalling
                    ? 'bg-[var(--color-surface)] text-[var(--color-text-muted)] cursor-not-allowed'
                    : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]'
                  }
                `}
              >
                {isInstalling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{isInstalling ? 'Installing...' : 'Install'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Horizontal Rule */}
      <hr className="border-[var(--color-border)]" />

      {/* Tab Navigation */}
      <div className="flex-shrink-0 flex items-center border-b border-[var(--color-border)] px-6">
        <button
          onClick={() => setActiveTab('details')}
          className={`
            px-4 py-3 text-sm font-medium transition-colors relative
            ${activeTab === 'details'
              ? 'text-[var(--color-text)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }
          `}
        >
          Details
          {activeTab === 'details' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)]" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('changelog')}
          className={`
            px-4 py-3 text-sm font-medium transition-colors relative
            ${activeTab === 'changelog'
              ? 'text-[var(--color-text)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }
          `}
        >
          Changelog
          {activeTab === 'changelog' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)]" />
          )}
        </button>
      </div>

      {/* Main Content Area (two-column layout) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 min-w-0" style={{ width: '70%' }}>
          {activeTab === 'details' && (
            <MarkdownContent
              content={readmeContent || ''}
              isLoading={readmeLoading}
              error={readmeError instanceof Error ? readmeError.message : null}
              emptyMessage="No details available"
            />
          )}
          {activeTab === 'changelog' && (
            <MarkdownContent
              content={changelogContent || ''}
              isLoading={changelogLoading}
              error={changelogError instanceof Error ? changelogError.message : null}
              emptyMessage="No changelog available"
            />
          )}
        </div>

        {/* Right Column: Metadata Sidebar */}
        <div
          className="flex-shrink-0 w-72 overflow-y-auto p-6 border-l border-[var(--color-border)] bg-[var(--color-surface)]"
          style={{ position: 'sticky', top: 0 }}
        >
          {/* Installation Section */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
              Installation
            </h3>
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Identifier</dt>
                <dd className="text-sm text-[var(--color-text)] font-mono">
                  {extensionId}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Version</dt>
                <dd className="text-sm text-[var(--color-text)]">{extension.version}</dd>
              </div>
              {extension.timestamp && (
                <div>
                  <dt className="text-xs text-[var(--color-text-muted)]">Last Updated</dt>
                  <dd className="text-sm text-[var(--color-text)]">
                    {formatRelativeTime(extension.timestamp)}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Marketplace Section */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
              Marketplace
            </h3>
            <dl className="space-y-2">
              {extension.timestamp && (
                <div>
                  <dt className="text-xs text-[var(--color-text-muted)]">Last Released</dt>
                  <dd className="text-sm text-[var(--color-text)]">
                    {formatDate(extension.timestamp)}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Categories Section */}
          {extension.categories && extension.categories.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
                Categories
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {extension.categories.map((category) => (
                  <span
                    key={category}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]"
                  >
                    {category}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resources Section */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
              Resources
            </h3>
            <ul className="space-y-2">
              {extension.repository && (
                <li>
                  <a
                    href={extension.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-[var(--color-primary)] hover:underline"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Repository</span>
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </a>
                </li>
              )}
              {extension.files?.license && (
                <li>
                  <a
                    href={extension.files.license}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-[var(--color-primary)] hover:underline"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>License</span>
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </a>
                </li>
              )}
              {extension.url && (
                <li>
                  <a
                    href={extension.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-[var(--color-primary)] hover:underline"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>Marketplace</span>
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Markdown Styles */}
      <style>{`
        .extension-readme-content {
          color: var(--color-text);
        }

        .extension-readme-content h1,
        .extension-readme-content h2,
        .extension-readme-content h3,
        .extension-readme-content h4,
        .extension-readme-content h5,
        .extension-readme-content h6 {
          color: var(--color-text);
          font-weight: 600;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
        }

        .extension-readme-content h1 {
          font-size: 1.5rem;
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 0.3em;
        }

        .extension-readme-content h2 {
          font-size: 1.25rem;
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 0.3em;
        }

        .extension-readme-content h3 {
          font-size: 1.1rem;
        }

        .extension-readme-content p {
          margin-bottom: 1em;
          line-height: 1.6;
        }

        .extension-readme-content a {
          color: var(--color-primary);
          text-decoration: none;
        }

        .extension-readme-content a:hover {
          text-decoration: underline;
        }

        .extension-readme-content code {
          background-color: var(--color-surface-hover);
          border-radius: 0.25rem;
          padding: 0.125rem 0.375rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.875em;
        }

        .extension-readme-content pre {
          background-color: var(--color-surface);
          border-radius: 0.375rem;
          padding: 0.75rem 1rem;
          overflow-x: auto;
          margin: 1em 0;
        }

        .extension-readme-content pre code {
          background-color: transparent;
          padding: 0;
          font-size: 0.875rem;
        }

        .extension-readme-content ul,
        .extension-readme-content ol {
          margin: 1em 0;
          padding-left: 2em;
        }

        .extension-readme-content li {
          margin-bottom: 0.25em;
        }

        .extension-readme-content blockquote {
          border-left: 4px solid var(--color-border);
          margin: 1em 0;
          padding-left: 1em;
          color: var(--color-text-secondary);
        }

        .extension-readme-content img {
          max-width: 100%;
          height: auto;
          border-radius: 0.375rem;
        }

        .extension-readme-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1em 0;
        }

        .extension-readme-content th,
        .extension-readme-content td {
          border: 1px solid var(--color-border);
          padding: 0.5em 1em;
          text-align: left;
        }

        .extension-readme-content th {
          background-color: var(--color-surface);
          font-weight: 600;
        }

        .extension-readme-content hr {
          border: none;
          border-top: 1px solid var(--color-border);
          margin: 2em 0;
        }
      `}</style>
    </div>
  );
}

export default ExtensionDetailPage;
