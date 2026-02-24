/**
 * External Sync Providers — barrel exports for all provider implementations
 *
 * Re-exports provider factory functions and key types from each provider module.
 */

// GitHub provider
export { createGitHubPlaceholderProvider } from './github/index.js';

// Linear provider
export {
  createLinearProvider,
  createLinearPlaceholderProvider,
} from './linear/index.js';
export type { CreateLinearProviderOptions } from './linear/index.js';
