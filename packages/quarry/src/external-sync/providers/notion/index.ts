/**
 * Notion Provider — exports for the Notion external sync provider
 *
 * Provides:
 * - NotionApiClient: REST API client for Notion pages and blocks
 * - NotionDocumentAdapter: DocumentSyncAdapter implementation for Notion pages
 * - NotionProvider: ExternalProvider implementation (via factory functions)
 * - Block/markdown conversion utilities
 * - Notion API types
 */

// Provider factory functions
export {
  createNotionProvider,
  createNotionPlaceholderProvider,
} from './notion-provider.js';
export type { CreateNotionProviderOptions } from './notion-provider.js';

// Document adapter
export {
  NotionDocumentAdapter,
  createNotionDocumentAdapter,
  extractTitleFromProperties,
  buildPageProperties,
} from './notion-document-adapter.js';

// Block/markdown conversion
export {
  markdownToNotionBlocks,
  notionBlocksToMarkdown,
  parseInlineMarkdown,
  richTextToMarkdown,
  chunkRichText,
  NOTION_MAX_TEXT_LENGTH,
} from './notion-blocks.js';

// API client
export {
  NotionApiClient,
  NotionApiError,
  isNotionApiError,
} from './notion-api.js';
export type {
  NotionApiClientOptions,
  RateLimitState,
} from './notion-api.js';

// Types
export type {
  NotionPage,
  NotionBlock,
  NotionBlockInput,
  NotionRichText,
  NotionAnnotations,
  NotionProperty,
  NotionCreatePageInput,
  NotionUpdatePageInput,
  NotionDatabase,
  NotionDatabaseProperty,
  NotionDatabaseSchema,
  NotionUpdateDatabaseInput,
  NotionDatabaseQueryResponse,
  NotionBlockChildrenResponse,
  NotionErrorResponse,
} from './notion-types.js';
export {
  DEFAULT_ANNOTATIONS,
  SUPPORTED_BLOCK_TYPES,
  isSupportedBlockType,
} from './notion-types.js';
