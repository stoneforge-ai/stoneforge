/**
 * Extension Management System
 *
 * Provides a complete solution for managing VS Code extensions in the browser:
 *
 * - Extension Manager: Install/uninstall workflows with full lifecycle management
 * - Extension Registry: Bridge between storage and Monaco's extension system
 *
 * @example
 * ```tsx
 * import { useExtensionManager, loadInstalledExtensions } from './lib/extensions';
 *
 * // On startup, after Monaco is initialized:
 * await loadInstalledExtensions();
 *
 * // In React components:
 * function ExtensionsList() {
 *   const { installed, installing, install, uninstall } = useExtensionManager();
 *   // ...
 * }
 * ```
 */

// Extension Manager - High-level install/uninstall API
export {
  // Core functions
  installExtension,
  uninstallExtension,
  isInstalled,
  getInstalled,
  isInstalling,
  getInstalling,
  initExtensionManager,
  // React hook
  useExtensionManager,
  // Error types
  ExtensionInstallError,
  ExtensionCompatibilityError,
  // Types
  type InstalledExtension,
  type RegisteredExtension,
  type ExtensionManifest,
} from './manager';

// Extension Registry - Low-level Monaco integration
export {
  // Core functions
  registerExtension,
  unregisterExtension,
  loadInstalledExtensions,
  getRegisteredExtensions,
  getRegisteredExtension,
  isExtensionRegistered,
  isInitialLoadComplete,
  // For testing
  resetRegistryState,
} from './registry';
