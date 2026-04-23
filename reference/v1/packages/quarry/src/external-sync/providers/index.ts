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

// Notion provider
export {
  createNotionProvider,
  createNotionPlaceholderProvider,
  NotionDocumentAdapter,
  createNotionDocumentAdapter,
  extractTitleFromProperties,
  buildPageProperties,
  markdownToNotionBlocks,
  notionBlocksToMarkdown,
  NotionApiClient,
  NotionApiError,
  isNotionApiError,
} from './notion/index.js';
export type {
  CreateNotionProviderOptions,
  NotionApiClientOptions,
  RateLimitState as NotionRateLimitState,
  NotionPage,
  NotionBlock,
  NotionBlockInput,
  NotionRichText,
  NotionAnnotations,
  NotionProperty,
} from './notion/index.js';

// Folder provider
export { createFolderProvider } from './folder/index.js';
export {
  FolderDocumentAdapter,
  createFolderDocumentAdapter,
  slugify,
} from './folder/index.js';
