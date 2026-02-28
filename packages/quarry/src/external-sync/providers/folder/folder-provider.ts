/**
 * Folder Provider
 *
 * ExternalProvider implementation for local folder-based document sync.
 * No authentication needed — the project path (folder path) is the
 * only configuration required.
 *
 * Provides a DocumentSyncAdapter for bidirectional synchronization
 * between Stoneforge documents and markdown files on the local filesystem.
 *
 * Usage:
 * ```typescript
 * const provider = createFolderProvider();
 * const connected = await provider.testConnection({ provider: 'folder', defaultProject: '/path/to/docs' });
 * const adapter = provider.getDocumentAdapter();
 * ```
 */

import * as fs from 'node:fs';
import type {
  ExternalProvider,
  DocumentSyncAdapter,
  ProviderConfig,
  SyncAdapterType,
} from '@stoneforge/core';

import { FolderDocumentAdapter } from './folder-document-adapter.js';

// ============================================================================
// Folder Provider
// ============================================================================

/**
 * Folder ExternalProvider implementation.
 *
 * Provides connection testing (checks if path exists and is a directory)
 * and a DocumentSyncAdapter for local folder sync.
 *
 * No token is needed — the `defaultProject` field in ProviderConfig
 * specifies the folder path to sync with.
 */
class FolderProvider implements ExternalProvider {
  readonly name = 'folder';
  readonly displayName = 'Folder';
  readonly supportedAdapters: readonly SyncAdapterType[] = ['document'];

  private readonly documentAdapter: FolderDocumentAdapter;

  constructor() {
    this.documentAdapter = new FolderDocumentAdapter();
  }

  /**
   * Test whether the configured folder path exists and is a directory.
   *
   * Uses `defaultProject` from the config as the folder path.
   * Returns false if no path is configured or the path doesn't exist
   * or isn't a directory.
   *
   * @param config - Provider configuration with defaultProject as folder path
   * @returns true if the path exists and is a directory, false otherwise
   */
  async testConnection(config: ProviderConfig): Promise<boolean> {
    const folderPath = config.defaultProject;
    if (!folderPath) {
      return false;
    }

    try {
      const stat = await fs.promises.stat(folderPath);
      return stat.isDirectory();
    } catch {
      // Path doesn't exist or can't be accessed
      return false;
    }
  }

  /**
   * Returns the FolderDocumentAdapter instance for document sync.
   *
   * @returns DocumentSyncAdapter for folder-based document sync
   */
  getDocumentAdapter(): DocumentSyncAdapter {
    return this.documentAdapter;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a folder provider for local filesystem document sync.
 *
 * The provider is always ready — no authentication or configuration
 * beyond the folder path is needed.
 *
 * @returns A configured Folder ExternalProvider
 */
export function createFolderProvider(): ExternalProvider {
  return new FolderProvider();
}
