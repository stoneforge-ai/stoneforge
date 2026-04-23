/**
 * IndexedDB storage layer for installed VS Code extensions.
 *
 * This module provides persistent storage for extension manifests and their
 * extracted files (themes, grammars, etc.) using IndexedDB.
 *
 * Two object stores:
 * 1. installed_extensions - stores extension manifests + metadata
 * 2. extension_files - stores extracted files from the VSIX
 */

import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

// Database constants
const DB_NAME = 'stoneforge-extensions';
const DB_VERSION = 1;

// Store names
const EXTENSIONS_STORE = 'installed_extensions';
const FILES_STORE = 'extension_files';

/**
 * VS Code extension manifest (package.json from the VSIX).
 * This is a simplified version - the full manifest has many more fields.
 */
export interface ExtensionManifest {
  name: string;
  publisher: string;
  version: string;
  displayName?: string;
  description?: string;
  categories?: string[];
  contributes?: {
    themes?: Array<{
      label: string;
      uiTheme: string;
      path: string;
    }>;
    grammars?: Array<{
      language: string;
      scopeName: string;
      path: string;
    }>;
    languages?: Array<{
      id: string;
      aliases?: string[];
      extensions?: string[];
      configuration?: string;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Stored extension record with metadata.
 */
export interface InstalledExtension {
  id: string; // publisher.name format
  manifest: ExtensionManifest;
  installedAt: number; // Unix timestamp
  version: string;
}

/**
 * Stored file record.
 */
interface StoredFile {
  key: string; // extensionId/filePath format
  extensionId: string;
  filePath: string;
  content: Uint8Array;
}

/**
 * IndexedDB schema definition for type safety.
 */
interface ExtensionDBSchema extends DBSchema {
  [EXTENSIONS_STORE]: {
    key: string;
    value: InstalledExtension;
  };
  [FILES_STORE]: {
    key: string;
    value: StoredFile;
    indexes: {
      byExtension: string;
    };
  };
}

// Singleton database instance
let db: IDBPDatabase<ExtensionDBSchema> | null = null;
let initPromise: Promise<void> | null = null;
let isIndexedDBAvailable = true;

/**
 * Check if IndexedDB is available in the current environment.
 */
function checkIndexedDBAvailable(): boolean {
  try {
    // Check for IndexedDB availability
    if (typeof indexedDB === 'undefined') {
      return false;
    }
    // Some browsers block IndexedDB in private browsing
    // We'll detect this during actual initialization
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize the extension storage database.
 * Must be called before any other storage operations.
 *
 * @throws Error if IndexedDB is unavailable (private browsing, etc.)
 */
export async function initExtensionStorage(): Promise<void> {
  // Return existing promise if initialization is in progress
  if (initPromise) {
    return initPromise;
  }

  // Return immediately if already initialized
  if (db) {
    return;
  }

  initPromise = (async () => {
    if (!checkIndexedDBAvailable()) {
      isIndexedDBAvailable = false;
      console.warn(
        '[ExtensionStorage] IndexedDB is not available. Extensions will not persist across sessions.'
      );
      return;
    }

    try {
      db = await openDB<ExtensionDBSchema>(DB_NAME, DB_VERSION, {
        upgrade(database) {
          // Create extensions store
          if (!database.objectStoreNames.contains(EXTENSIONS_STORE)) {
            database.createObjectStore(EXTENSIONS_STORE, { keyPath: 'id' });
          }

          // Create files store with index for efficient lookup by extension
          if (!database.objectStoreNames.contains(FILES_STORE)) {
            const filesStore = database.createObjectStore(FILES_STORE, {
              keyPath: 'key',
            });
            filesStore.createIndex('byExtension', 'extensionId');
          }
        },
        blocked() {
          console.warn(
            '[ExtensionStorage] Database upgrade blocked. Please close other tabs using this application.'
          );
        },
        blocking() {
          // Close our connection if we're blocking another tab's upgrade
          db?.close();
          db = null;
        },
        terminated() {
          console.warn('[ExtensionStorage] Database connection terminated unexpectedly.');
          db = null;
          initPromise = null;
        },
      });
    } catch (error) {
      isIndexedDBAvailable = false;
      console.warn(
        '[ExtensionStorage] Failed to initialize IndexedDB. Extensions will not persist across sessions.',
        error
      );
    }
  })();

  return initPromise;
}

/**
 * Ensure the database is initialized before performing operations.
 */
async function ensureInitialized(): Promise<IDBPDatabase<ExtensionDBSchema> | null> {
  await initExtensionStorage();
  return db;
}

/**
 * Generate a compound key for file storage.
 */
function makeFileKey(extensionId: string, filePath: string): string {
  return `${extensionId}/${filePath}`;
}

/**
 * Save an extension with its files to storage.
 * This operation is transactional - either all data is saved or none.
 *
 * @param id - Extension ID (publisher.name format)
 * @param manifest - The extension manifest (package.json)
 * @param files - Map of file paths to their content
 */
export async function saveExtension(
  id: string,
  manifest: ExtensionManifest,
  files: Map<string, Uint8Array>
): Promise<void> {
  const database = await ensureInitialized();
  if (!database) {
    console.warn('[ExtensionStorage] Cannot save extension - IndexedDB unavailable');
    return;
  }

  const extension: InstalledExtension = {
    id,
    manifest,
    installedAt: Date.now(),
    version: manifest.version,
  };

  // Use a transaction to ensure atomicity
  const tx = database.transaction([EXTENSIONS_STORE, FILES_STORE], 'readwrite');

  try {
    // Save extension metadata
    await tx.objectStore(EXTENSIONS_STORE).put(extension);

    // Save all files
    const filesStore = tx.objectStore(FILES_STORE);
    const filePromises: Promise<string>[] = [];

    for (const [filePath, content] of files) {
      const storedFile: StoredFile = {
        key: makeFileKey(id, filePath),
        extensionId: id,
        filePath,
        content,
      };
      filePromises.push(filesStore.put(storedFile));
    }

    await Promise.all(filePromises);
    await tx.done;
  } catch (error) {
    // Transaction will automatically abort on error
    // Re-throw to let caller handle it
    throw new Error(`Failed to save extension ${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Remove an extension and all its files from storage.
 * This operation is transactional - either all data is removed or none.
 *
 * @param id - Extension ID (publisher.name format)
 */
export async function removeExtension(id: string): Promise<void> {
  const database = await ensureInitialized();
  if (!database) {
    console.warn('[ExtensionStorage] Cannot remove extension - IndexedDB unavailable');
    return;
  }

  const tx = database.transaction([EXTENSIONS_STORE, FILES_STORE], 'readwrite');

  try {
    // Remove extension metadata
    await tx.objectStore(EXTENSIONS_STORE).delete(id);

    // Remove all files for this extension using the index
    const filesStore = tx.objectStore(FILES_STORE);
    const index = filesStore.index('byExtension');
    const keys = await index.getAllKeys(id);

    const deletePromises = keys.map((key) => filesStore.delete(key));
    await Promise.all(deletePromises);

    await tx.done;
  } catch (error) {
    throw new Error(`Failed to remove extension ${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get all installed extensions.
 *
 * @returns Array of installed extensions, sorted by installation date (newest first)
 */
export async function getInstalledExtensions(): Promise<InstalledExtension[]> {
  const database = await ensureInitialized();
  if (!database) {
    return [];
  }

  const extensions = await database.getAll(EXTENSIONS_STORE);
  // Sort by installation date, newest first
  return extensions.sort((a, b) => b.installedAt - a.installedAt);
}

/**
 * Get a specific extension by ID.
 *
 * @param id - Extension ID (publisher.name format)
 * @returns The extension or null if not found
 */
export async function getExtension(id: string): Promise<InstalledExtension | null> {
  const database = await ensureInitialized();
  if (!database) {
    return null;
  }

  const extension = await database.get(EXTENSIONS_STORE, id);
  return extension ?? null;
}

/**
 * Get a specific file from an extension.
 *
 * @param extensionId - Extension ID (publisher.name format)
 * @param filePath - Path to the file within the extension
 * @returns File content or null if not found
 */
export async function getExtensionFile(
  extensionId: string,
  filePath: string
): Promise<Uint8Array | null> {
  const database = await ensureInitialized();
  if (!database) {
    return null;
  }

  const key = makeFileKey(extensionId, filePath);
  const file = await database.get(FILES_STORE, key);
  return file?.content ?? null;
}

/**
 * Get all files for an extension.
 *
 * @param extensionId - Extension ID (publisher.name format)
 * @returns Map of file paths to their content
 */
export async function getExtensionFiles(
  extensionId: string
): Promise<Map<string, Uint8Array>> {
  const database = await ensureInitialized();
  if (!database) {
    return new Map();
  }

  const index = database.transaction(FILES_STORE).store.index('byExtension');
  const files = await index.getAll(extensionId);

  const result = new Map<string, Uint8Array>();
  for (const file of files) {
    result.set(file.filePath, file.content);
  }

  return result;
}

/**
 * Check if IndexedDB storage is available.
 * Useful for UI to show appropriate messaging.
 */
export function isStorageAvailable(): boolean {
  return isIndexedDBAvailable && db !== null;
}

/**
 * Clear all extension data. Useful for testing or reset functionality.
 */
export async function clearAllExtensions(): Promise<void> {
  const database = await ensureInitialized();
  if (!database) {
    return;
  }

  const tx = database.transaction([EXTENSIONS_STORE, FILES_STORE], 'readwrite');
  await tx.objectStore(EXTENSIONS_STORE).clear();
  await tx.objectStore(FILES_STORE).clear();
  await tx.done;
}

/**
 * Close the database connection. Useful for cleanup in tests.
 */
export function closeStorage(): void {
  if (db) {
    db.close();
    db = null;
    initPromise = null;
  }
}
