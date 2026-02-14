/**
 * Runtime Detection and Unified Storage Factory
 *
 * Automatically detects the runtime environment (Bun, Node.js, or Browser)
 * and returns the appropriate storage backend.
 */

import { createRequire } from 'node:module';
import type { StorageBackend, StorageFactory, AsyncStorageFactory } from './backend.js';
import type { StorageConfig } from './types.js';

// Create a require function for use in ESM
const require = createRequire(import.meta.url);

// ============================================================================
// Runtime Detection
// ============================================================================

/**
 * Check if running in Bun runtime
 */
export function isBunRuntime(): boolean {
  return typeof globalThis.Bun !== 'undefined';
}

/**
 * Check if running in Node.js runtime
 */
export function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' &&
         process.versions !== undefined &&
         process.versions.node !== undefined &&
         !isBunRuntime();
}

/**
 * Check if running in a browser environment
 */
export function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' &&
         typeof window.document !== 'undefined' &&
         !isBunRuntime() &&
         !isNodeRuntime();
}

/**
 * Get the current runtime name
 */
export function getRuntimeName(): 'bun' | 'node' | 'browser' | 'unknown' {
  if (isBunRuntime()) return 'bun';
  if (isNodeRuntime()) return 'node';
  if (isBrowserRuntime()) return 'browser';
  return 'unknown';
}

// ============================================================================
// Lazy Backend Loading
// ============================================================================

// Cache for loaded factories to avoid repeated dynamic imports
let bunFactory: StorageFactory | null = null;
let nodeFactory: StorageFactory | null = null;
let browserFactory: AsyncStorageFactory | null = null;

/**
 * Get the Bun storage factory
 * Uses dynamic import to avoid loading bun:sqlite in Node.js
 */
async function getBunFactory(): Promise<StorageFactory> {
  if (bunFactory) return bunFactory;
  const { createBunStorage } = await import('./bun-backend.js');
  bunFactory = createBunStorage;
  return bunFactory;
}

/**
 * Get the Node.js storage factory
 * Uses dynamic import to avoid loading better-sqlite3 in Bun
 */
async function getNodeFactory(): Promise<StorageFactory> {
  if (nodeFactory) return nodeFactory;
  const { createNodeStorage } = await import('./node-backend.js');
  nodeFactory = createNodeStorage;
  return nodeFactory;
}

/**
 * Get the Browser storage factory
 * Uses dynamic import to avoid loading sql.js in Node/Bun
 */
async function getBrowserFactory(): Promise<AsyncStorageFactory> {
  if (browserFactory) return browserFactory;
  const { createBrowserStorage } = await import('./browser-backend.js');
  browserFactory = createBrowserStorage;
  return browserFactory;
}

// ============================================================================
// Synchronous Factory (for backwards compatibility)
// ============================================================================

/**
 * Get the Bun storage factory synchronously
 * Only works in Bun runtime
 */
function getBunFactorySync(): StorageFactory {
  if (bunFactory) return bunFactory;
  // In Bun, we can do a synchronous require-style import
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createBunStorage } = require('./bun-backend.js') as { createBunStorage: StorageFactory };
  bunFactory = createBunStorage;
  return createBunStorage;
}

/**
 * Get the Node.js storage factory synchronously
 * Only works in Node.js runtime
 */
function getNodeFactorySync(): StorageFactory {
  if (nodeFactory) return nodeFactory;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createNodeStorage } = require('./node-backend.js') as { createNodeStorage: StorageFactory };
  nodeFactory = createNodeStorage;
  return createNodeStorage;
}

// ============================================================================
// Unified Factory Functions
// ============================================================================

/**
 * Create a storage backend using the appropriate implementation for the current runtime.
 *
 * This function automatically detects whether you're running in Bun or Node.js
 * and uses the corresponding storage backend:
 * - Bun: Uses bun:sqlite (native, fastest)
 * - Node.js: Uses better-sqlite3 (native addon)
 *
 * @param config - Storage configuration
 * @returns A storage backend instance
 * @throws Error if running in an unsupported runtime
 *
 * @example
 * ```typescript
 * import { createStorage } from '@stoneforge/storage';
 *
 * const storage = createStorage({ path: './data.db' });
 * ```
 */
export function createStorage(config: StorageConfig): StorageBackend {
  const runtime = getRuntimeName();

  switch (runtime) {
    case 'bun':
      return getBunFactorySync()(config);
    case 'node':
      return getNodeFactorySync()(config);
    case 'browser':
      throw new Error(
        'Browser storage requires async initialization. Use createStorageAsync() instead.'
      );
    default:
      throw new Error(
        `Unsupported runtime: ${runtime}. Stoneforge requires Bun, Node.js, or a modern browser.`
      );
  }
}

/**
 * Create a storage backend asynchronously.
 *
 * Use this when you need to ensure the backend module is loaded
 * before creating the storage instance (e.g., in environments
 * where synchronous require might not work).
 *
 * This is also required for browser environments since WASM loading
 * is inherently asynchronous.
 *
 * @param config - Storage configuration
 * @returns A promise resolving to a storage backend instance
 * @throws Error if running in an unsupported runtime
 */
export async function createStorageAsync(config: StorageConfig): Promise<StorageBackend> {
  const runtime = getRuntimeName();

  switch (runtime) {
    case 'bun': {
      const factory = await getBunFactory();
      return factory(config);
    }
    case 'node': {
      const factory = await getNodeFactory();
      return factory(config);
    }
    case 'browser': {
      const factory = await getBrowserFactory();
      return factory(config);
    }
    default:
      throw new Error(
        `Unsupported runtime: ${runtime}. Stoneforge requires Bun, Node.js, or a modern browser.`
      );
  }
}

// ============================================================================
// Explicit Runtime Factories
// ============================================================================

/**
 * Create a Bun storage backend explicitly.
 *
 * Use this when you know you're in Bun and want to skip runtime detection,
 * or for testing purposes.
 *
 * @param config - Storage configuration
 * @returns A storage backend using bun:sqlite
 */
export function createBunStorageExplicit(config: StorageConfig): StorageBackend {
  return getBunFactorySync()(config);
}

/**
 * Create a Node.js storage backend explicitly.
 *
 * Use this when you know you're in Node.js and want to skip runtime detection,
 * or for testing purposes.
 *
 * @param config - Storage configuration
 * @returns A storage backend using better-sqlite3
 */
export function createNodeStorageExplicit(config: StorageConfig): StorageBackend {
  return getNodeFactorySync()(config);
}
