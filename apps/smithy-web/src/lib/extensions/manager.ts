/**
 * Extension Lifecycle Manager
 *
 * Orchestrates the complete extension install/uninstall workflow by coordinating
 * the OpenVSX client, VSIX parser, IndexedDB storage, and Monaco registry.
 *
 * Install flow:
 * 1. Download VSIX via OpenVSX client
 * 2. Parse VSIX to extract manifest and files
 * 3. Run compatibility filter (reject non-declarative extensions)
 * 4. Save to IndexedDB
 * 5. Register with Monaco via registry bridge
 *
 * Uninstall flow:
 * 1. Unregister from Monaco (dispose + revoke blob URLs)
 * 2. Remove from IndexedDB
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { downloadVsix } from '../openvsx/client';
import {
  parseVsix,
  isDeclarativeExtension,
  getExtensionId,
  type ExtensionManifest as VsixManifest,
} from '../openvsx/vsix-parser';
import {
  saveExtension,
  removeExtension,
  getInstalledExtensions,
  getExtension,
  initExtensionStorage,
  type InstalledExtension,
  type ExtensionManifest,
} from '../openvsx/storage';
import {
  registerExtension,
  unregisterExtension,
  isExtensionRegistered,
} from './registry';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when an extension fails compatibility checks.
 */
export class ExtensionCompatibilityError extends Error {
  constructor(
    message: string,
    public readonly reasons: string[]
  ) {
    super(message);
    this.name = 'ExtensionCompatibilityError';
  }
}

/**
 * Error thrown during extension installation.
 */
export class ExtensionInstallError extends Error {
  constructor(
    message: string,
    public readonly phase: 'download' | 'parse' | 'compatibility' | 'storage' | 'registration',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ExtensionInstallError';
  }
}

// ============================================================================
// State Management
// ============================================================================

/** Set of extension IDs currently being installed (namespace.name or publisher.name format) */
const installingSet = new Set<string>();

/** Subscribers for state changes */
const subscribers = new Set<() => void>();

/** Cached installed extensions list */
let installedExtensionsCache: InstalledExtension[] = [];

/** Flag to track if the cache has been initialized */
let cacheInitialized = false;

/**
 * Notify all subscribers of state changes.
 */
function notifySubscribers(): void {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

/**
 * Subscribe to state changes.
 * Returns an unsubscribe function.
 */
function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Get the current snapshot of installed extensions.
 */
function getInstalledSnapshot(): InstalledExtension[] {
  return installedExtensionsCache;
}

/**
 * Refresh the installed extensions cache from storage.
 */
async function refreshInstalledCache(): Promise<void> {
  try {
    installedExtensionsCache = await getInstalledExtensions();
    cacheInitialized = true;
    notifySubscribers();
  } catch (error) {
    console.error('[ExtensionManager] Failed to refresh installed extensions cache:', error);
  }
}

// ============================================================================
// Core API
// ============================================================================

/**
 * Install an extension from OpenVSX.
 *
 * Downloads the VSIX, parses it, validates compatibility, saves to storage,
 * and registers with Monaco. If any step fails, partial state is cleaned up.
 *
 * @param namespace - Extension namespace (e.g., "dracula-theme")
 * @param name - Extension name (e.g., "theme-dracula")
 * @param version - Extension version (e.g., "2.25.1" or "latest")
 * @returns The installed extension info
 * @throws ExtensionInstallError if installation fails
 * @throws ExtensionCompatibilityError if extension is not declarative
 */
export async function installExtension(
  namespace: string,
  name: string,
  version: string
): Promise<InstalledExtension> {
  // Create a unique ID for tracking the installation
  const installId = `${namespace}.${name}`;

  // Check if already installing
  if (installingSet.has(installId)) {
    throw new ExtensionInstallError(
      `Extension ${installId} is already being installed`,
      'download',
      undefined
    );
  }

  // Mark as installing
  installingSet.add(installId);
  notifySubscribers();

  // Track what needs cleanup on failure
  let savedToStorage = false;
  let extensionId: string | null = null;

  try {
    // Step 1: Download VSIX
    let vsixBuffer: ArrayBuffer;
    try {
      vsixBuffer = await downloadVsix(namespace, name, version);
    } catch (error) {
      throw new ExtensionInstallError(
        `Failed to download extension: ${error instanceof Error ? error.message : String(error)}`,
        'download',
        error instanceof Error ? error : undefined
      );
    }

    // Step 2: Parse VSIX
    let vsixManifest: VsixManifest;
    let contributedFiles: Map<string, Uint8Array>;
    try {
      const parsed = await parseVsix(vsixBuffer);
      vsixManifest = parsed.manifest;
      contributedFiles = parsed.contributedFiles;
    } catch (error) {
      throw new ExtensionInstallError(
        `Failed to parse VSIX: ${error instanceof Error ? error.message : String(error)}`,
        'parse',
        error instanceof Error ? error : undefined
      );
    }

    // Cast the vsix manifest to storage manifest type
    // The vsix-parser manifest is more specific, but compatible with storage
    const manifest = vsixManifest as unknown as ExtensionManifest;

    // Get the canonical extension ID from the manifest
    extensionId = getExtensionId(vsixManifest);

    // Check if already installed
    const existing = await getExtension(extensionId);
    if (existing) {
      throw new ExtensionInstallError(
        `Extension ${extensionId} is already installed`,
        'storage',
        undefined
      );
    }

    // Check if already registered (edge case: registered but not in storage)
    if (isExtensionRegistered(extensionId)) {
      throw new ExtensionInstallError(
        `Extension ${extensionId} is already registered`,
        'registration',
        undefined
      );
    }

    // Step 3: Run compatibility filter
    const compatibility = isDeclarativeExtension(vsixManifest);
    if (!compatibility.compatible) {
      throw new ExtensionCompatibilityError(
        `Extension ${extensionId} is not compatible: ${compatibility.reasons.join('; ')}`,
        compatibility.reasons
      );
    }

    // Log warnings if any
    if (compatibility.warnings.length > 0) {
      console.warn(
        `[ExtensionManager] Extension ${extensionId} has warnings:`,
        compatibility.warnings
      );
    }

    // Step 4: Save to IndexedDB
    try {
      await saveExtension(extensionId, manifest, contributedFiles);
      savedToStorage = true;
    } catch (error) {
      throw new ExtensionInstallError(
        `Failed to save extension: ${error instanceof Error ? error.message : String(error)}`,
        'storage',
        error instanceof Error ? error : undefined
      );
    }

    // Step 5: Register with Monaco
    const result = registerExtension(manifest, contributedFiles);
    if (!result.success) {
      throw new ExtensionInstallError(
        `Failed to register extension: ${result.error}`,
        'registration',
        undefined
      );
    }

    // Wait for the extension to be fully ready
    if (result.extension) {
      try {
        await result.extension.whenReady();
      } catch (error) {
        console.warn(
          `[ExtensionManager] Extension ${extensionId} whenReady failed, but registration succeeded:`,
          error
        );
      }
    }

    console.log(`[ExtensionManager] Successfully installed extension: ${extensionId}`);

    // Refresh the cache and get the installed extension
    await refreshInstalledCache();
    const installed = await getExtension(extensionId);
    if (!installed) {
      // This shouldn't happen, but handle it gracefully
      throw new ExtensionInstallError(
        'Extension was saved but could not be retrieved',
        'storage',
        undefined
      );
    }

    return installed;
  } catch (error) {
    // Clean up partial state on failure
    if (savedToStorage && extensionId) {
      try {
        await removeExtension(extensionId);
        console.log(`[ExtensionManager] Cleaned up partial storage for ${extensionId}`);
      } catch (cleanupError) {
        console.error(
          `[ExtensionManager] Failed to clean up partial storage for ${extensionId}:`,
          cleanupError
        );
      }
    }

    throw error;
  } finally {
    // Always remove from installing set
    installingSet.delete(installId);
    notifySubscribers();
  }
}

/**
 * Uninstall an extension.
 *
 * Unregisters from Monaco (disposes resources, revokes blob URLs) and
 * removes from IndexedDB storage.
 *
 * @param extensionId - The extension ID (publisher.name format)
 */
export async function uninstallExtension(extensionId: string): Promise<void> {
  console.log(`[ExtensionManager] Uninstalling extension: ${extensionId}`);

  // Step 1: Unregister from Monaco (this revokes blob URLs and disposes resources)
  try {
    await unregisterExtension(extensionId);
  } catch (error) {
    console.error(
      `[ExtensionManager] Failed to unregister extension ${extensionId}:`,
      error
    );
    // Continue with storage removal even if unregistration fails
  }

  // Step 2: Remove from IndexedDB
  try {
    await removeExtension(extensionId);
  } catch (error) {
    console.error(
      `[ExtensionManager] Failed to remove extension ${extensionId} from storage:`,
      error
    );
    throw error;
  }

  console.log(`[ExtensionManager] Successfully uninstalled extension: ${extensionId}`);

  // Refresh the cache
  await refreshInstalledCache();
}

/**
 * Check if an extension is installed.
 *
 * @param extensionId - The extension ID (publisher.name format)
 * @returns True if the extension is installed
 */
export function isInstalled(extensionId: string): boolean {
  return installedExtensionsCache.some((ext) => ext.id === extensionId);
}

/**
 * Get all installed extensions.
 *
 * Returns the cached list for synchronous access.
 * The cache is automatically refreshed after install/uninstall operations.
 *
 * @returns Array of installed extensions
 */
export function getInstalled(): InstalledExtension[] {
  return installedExtensionsCache;
}

/**
 * Check if an extension is currently being installed.
 *
 * @param installId - The install ID (namespace.name format during download, or extensionId)
 * @returns True if the extension is being installed
 */
export function isInstalling(installId: string): boolean {
  return installingSet.has(installId);
}

/**
 * Get the set of extension IDs currently being installed.
 *
 * @returns Set of extension IDs being installed
 */
export function getInstalling(): Set<string> {
  return new Set(installingSet);
}

/**
 * Initialize the extension manager.
 *
 * Loads installed extensions from storage into the cache.
 * This should be called on app startup after storage is initialized.
 */
export async function initExtensionManager(): Promise<void> {
  await initExtensionStorage();
  await refreshInstalledCache();
  console.log(
    `[ExtensionManager] Initialized with ${installedExtensionsCache.length} installed extension(s)`
  );
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * React hook for managing extensions.
 *
 * Provides reactive state for installed extensions and installing status,
 * along with install/uninstall methods.
 *
 * @example
 * ```tsx
 * function ExtensionsList() {
 *   const { installed, installing, install, uninstall } = useExtensionManager();
 *
 *   const handleInstall = async (namespace: string, name: string) => {
 *     try {
 *       await install(namespace, name, 'latest');
 *     } catch (error) {
 *       console.error('Install failed:', error);
 *     }
 *   };
 *
 *   return (
 *     <ul>
 *       {installed.map((ext) => (
 *         <li key={ext.id}>
 *           {ext.manifest.displayName || ext.manifest.name}
 *           <button onClick={() => uninstall(ext.id)}>Uninstall</button>
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useExtensionManager(): {
  installed: InstalledExtension[];
  installing: Set<string>;
  install: (namespace: string, name: string, version: string) => Promise<void>;
  uninstall: (id: string) => Promise<void>;
} {
  // Initialize the cache on first render
  useEffect(() => {
    if (!cacheInitialized) {
      refreshInstalledCache();
    }
  }, []);

  // Subscribe to state changes using useSyncExternalStore
  const installed = useSyncExternalStore(
    subscribe,
    getInstalledSnapshot,
    getInstalledSnapshot // Server snapshot (same as client for this use case)
  );

  // For installing, we need to create a new Set reference when it changes
  // useSyncExternalStore doesn't work well with Set directly, so we track changes
  const [installingSnapshot, setInstallingSnapshot] = useState<Set<string>>(
    () => new Set(installingSet)
  );

  useEffect(() => {
    const handleChange = () => {
      setInstallingSnapshot(new Set(installingSet));
    };
    return subscribe(handleChange);
  }, []);

  // Memoized install function
  const install = useCallback(
    async (namespace: string, name: string, version: string): Promise<void> => {
      await installExtension(namespace, name, version);
    },
    []
  );

  // Memoized uninstall function
  const uninstall = useCallback(async (id: string): Promise<void> => {
    await uninstallExtension(id);
  }, []);

  return useMemo(
    () => ({
      installed,
      installing: installingSnapshot,
      install,
      uninstall,
    }),
    [installed, installingSnapshot, install, uninstall]
  );
}

// ============================================================================
// Re-exports
// ============================================================================

// Re-export types that consumers might need
export type { InstalledExtension, ExtensionManifest } from '../openvsx/storage';
export type { RegisteredExtension } from './registry';
