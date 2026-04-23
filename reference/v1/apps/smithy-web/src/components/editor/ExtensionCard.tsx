/**
 * ExtensionCard - Card component for displaying extension info
 *
 * Displays extension details with install/uninstall actions.
 * Shows compatibility status and loading states.
 */

import { useState, useCallback, useMemo } from 'react';
import { Loader2, Download, Trash2, AlertTriangle, Package } from 'lucide-react';
import { Tooltip } from '@stoneforge/ui';
import type { OpenVSXExtensionSummary } from '../../lib/openvsx/client';
import type { InstalledExtension } from '../../lib/extensions';

// ============================================================================
// Types
// ============================================================================

export interface ExtensionCardProps {
  /** Extension summary from search results */
  extension: OpenVSXExtensionSummary;
  /** Whether this extension is installed */
  isInstalled: boolean;
  /** Installed extension info (if installed) */
  installedInfo?: InstalledExtension;
  /** Whether installation is in progress */
  isInstalling: boolean;
  /** Whether uninstallation is in progress */
  isUninstalling: boolean;
  /** Whether the extension is incompatible */
  isIncompatible?: boolean;
  /** Reasons why the extension is incompatible */
  incompatibilityReasons?: string[];
  /** Install handler */
  onInstall: (namespace: string, name: string) => void;
  /** Uninstall handler */
  onUninstall: (extensionId: string) => void;
  /** Click handler for opening extension details (not fired when clicking action button) */
  onClick?: (extension: OpenVSXExtensionSummary) => void;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a download count into a human-readable string.
 * e.g., 1_200_000 → "1.2M", 45_300 → "45.3K", 892 → "892"
 */
function formatDownloadCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

// ============================================================================
// ExtensionCard Component
// ============================================================================

export function ExtensionCard({
  extension,
  isInstalled,
  installedInfo,
  isInstalling,
  isUninstalling,
  isIncompatible = false,
  incompatibilityReasons = [],
  onInstall,
  onUninstall,
  onClick,
}: ExtensionCardProps) {
  const [actionError, setActionError] = useState<string | null>(null);

  // Determine display values
  const displayName = extension.displayName || extension.name;
  const publisher = extension.namespace;
  const description = extension.description || 'No description available';
  const version = installedInfo?.version || extension.version;
  const iconUrl = extension.files.icon;
  const extensionId = `${extension.namespace}.${extension.name}`;

  // Loading state
  const isLoading = isInstalling || isUninstalling;

  // Handle install click
  const handleInstall = useCallback(() => {
    if (isIncompatible || isLoading) return;
    setActionError(null);
    onInstall(extension.namespace, extension.name);
  }, [extension.namespace, extension.name, isIncompatible, isLoading, onInstall]);

  // Handle uninstall click
  const handleUninstall = useCallback(() => {
    if (isLoading) return;
    setActionError(null);
    onUninstall(extensionId);
  }, [extensionId, isLoading, onUninstall]);

  // Build incompatibility tooltip content
  const incompatibilityTooltip = useMemo(() => {
    if (!isIncompatible) return null;
    if (incompatibilityReasons.length === 0) {
      return 'This extension requires code execution and cannot be installed.';
    }
    return incompatibilityReasons.join('\n');
  }, [isIncompatible, incompatibilityReasons]);

  // Handle card click (opens extension details)
  const handleCardClick = useCallback(() => {
    if (onClick) {
      onClick(extension);
    }
  }, [onClick, extension]);

  return (
    <div
      className={`
        flex gap-3 p-3 border-b border-[var(--color-border)] last:border-b-0
        ${isIncompatible ? 'opacity-60' : ''}
        hover:bg-[var(--color-surface-hover)] transition-colors
      `}
      data-testid={`extension-card-${extensionId}`}
    >
      {/* Clickable area (icon + content) */}
      <button
        type="button"
        onClick={handleCardClick}
        className="flex gap-3 flex-1 min-w-0 text-left cursor-pointer"
        disabled={!onClick}
      >
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-md bg-[var(--color-surface)] flex items-center justify-center overflow-hidden">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={`${displayName} icon`}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                // Fallback to default icon on error
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <Package
            className={`w-5 h-5 text-[var(--color-text-muted)] ${iconUrl ? 'hidden' : ''}`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-[var(--color-text)] truncate">
              {displayName}
            </span>
            {/* Version badge */}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-text-muted)] flex-shrink-0">
              v{version}
            </span>
            {/* Incompatible warning */}
            {isIncompatible && (
              <Tooltip content={incompatibilityTooltip || 'Incompatible extension'}>
                <span className="flex-shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                </span>
              </Tooltip>
            )}
          </div>

          {/* Publisher and downloads */}
          <div className="text-xs text-[var(--color-text-muted)] mb-1 flex items-center gap-2">
            <span>{publisher}</span>
            {extension.downloadCount !== undefined && (
              <span className="flex items-center gap-0.5">
                <Download className="w-3 h-3" />
                {formatDownloadCount(extension.downloadCount)}
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">
            {description}
          </p>
        {/* Error message */}
          {actionError && (
            <p className="text-xs text-[var(--color-danger)] mt-1">
              {actionError}
            </p>
          )}
        </div>
      </button>

      {/* Action button */}
      <div className="flex-shrink-0 flex items-center">
        {isInstalled ? (
          <Tooltip content="Uninstall extension">
            <button
              onClick={handleUninstall}
              disabled={isLoading}
              className={`
                flex items-center justify-center w-8 h-8 rounded
                ${isLoading
                  ? 'bg-[var(--color-surface)] cursor-not-allowed'
                  : 'bg-[var(--color-danger)]/10 hover:bg-[var(--color-danger)]/20 text-[var(--color-danger)]'
                }
                transition-colors
              `}
              data-testid={`extension-uninstall-${extensionId}`}
            >
              {isUninstalling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </Tooltip>
        ) : (
          <Tooltip
            content={
              isIncompatible
                ? incompatibilityTooltip || 'Cannot install - incompatible extension'
                : 'Install extension'
            }
          >
            <button
              onClick={handleInstall}
              disabled={isLoading || isIncompatible}
              className={`
                flex items-center justify-center w-8 h-8 rounded
                ${isIncompatible
                  ? 'bg-[var(--color-surface)] cursor-not-allowed text-[var(--color-text-muted)]'
                  : isLoading
                    ? 'bg-[var(--color-surface)] cursor-not-allowed'
                    : 'bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                }
                transition-colors
              `}
              data-testid={`extension-install-${extensionId}`}
            >
              {isInstalling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export default ExtensionCard;
