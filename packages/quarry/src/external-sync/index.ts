/**
 * External Sync — public exports
 *
 * Central module for external service synchronization (GitHub, Linear, etc.).
 * Re-exports the provider registry, provider implementations, and future
 * sync engine / conflict resolver modules.
 */

// Provider registry
export {
  ProviderRegistry,
  createProviderRegistry,
  createDefaultProviderRegistry,
} from './provider-registry.js';
export type { ProviderAdapterEntry } from './provider-registry.js';

// GitHub provider
export { createGitHubPlaceholderProvider } from './providers/github/index.js';
