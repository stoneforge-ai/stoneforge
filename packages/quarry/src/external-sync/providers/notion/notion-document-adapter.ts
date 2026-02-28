/**
 * Notion Document Sync Adapter
 *
 * Implements the DocumentSyncAdapter interface for Notion pages.
 * Converts between Stoneforge documents and Notion pages using the
 * Notion API client and the blocks ↔ markdown converter.
 *
 * Key operations:
 * - getPage: Fetch a page's properties and blocks, convert to ExternalDocument
 * - listPagesSince: Query a database for recently edited pages
 * - createPage: Convert markdown to Notion blocks, create page with properties
 * - updatePage: Update page properties and/or replace content blocks
 *
 * The adapter expects:
 * - `project` = Notion database ID
 * - `externalId` = Notion page ID
 *
 * Schema discovery:
 * The adapter discovers the database schema on first use via GET /databases/{id}.
 * Every Notion database has exactly one property of type "title", but its name
 * varies (common names: "Name", "Title"). The adapter discovers and caches this
 * name rather than hardcoding it.
 *
 * Optional properties (Category as select, Tags as multi_select) are only
 * included in page properties when the database schema confirms they exist.
 * If they don't exist, the adapter attempts to auto-create them via
 * PATCH /databases/{id}. If that fails (e.g., insufficient permissions),
 * they are silently skipped.
 */

import type {
  DocumentSyncAdapter,
  ExternalDocument,
  ExternalDocumentInput,
} from '@stoneforge/core';
import type { Timestamp } from '@stoneforge/core';
import type { NotionPage, NotionBlockInput, NotionProperty, NotionRichText, NotionDatabaseSchema } from './notion-types.js';
import { NotionApiClient } from './notion-api.js';
import { notionBlocksToMarkdown, markdownToNotionBlocks } from './notion-blocks.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts the title from a Notion page's properties.
 *
 * Searches through all properties for one of type 'title', then
 * concatenates the plain_text of all rich text elements within it.
 *
 * @param properties - The page's properties record
 * @returns The page title, or empty string if no title property is found
 */
export function extractTitleFromProperties(
  properties: Record<string, NotionProperty>
): string {
  for (const prop of Object.values(properties)) {
    if (prop.type === 'title' && prop.title) {
      return prop.title.map((rt: NotionRichText) => rt.plain_text).join('');
    }
  }
  return '';
}

/**
 * Builds Notion page properties for creating or updating a page.
 *
 * Uses the discovered database schema to:
 * - Set the title on the correct property (discovered name, not hardcoded)
 * - Only include Category and Tags if the database schema confirms they exist
 *
 * @param title - The page title
 * @param schema - The discovered database schema with property availability info
 * @param category - Optional category for the Category select property
 * @param tags - Optional tags for the Tags multi_select property
 * @returns A properties record suitable for the Notion API
 */
export function buildPageProperties(
  title: string,
  schema: NotionDatabaseSchema,
  category?: string,
  tags?: readonly string[]
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    [schema.titlePropertyName]: {
      title: [
        {
          text: { content: title },
        },
      ],
    },
  };

  if (category && schema.hasCategoryProperty) {
    properties.Category = {
      select: { name: category },
    };
  }

  if (tags && tags.length > 0 && schema.hasTagsProperty) {
    properties.Tags = {
      multi_select: tags.map((tag) => ({ name: tag })),
    };
  }

  return properties;
}

/**
 * Converts a Notion page and its blocks into an ExternalDocument.
 *
 * @param page - The Notion page object
 * @param markdown - The markdown content converted from page blocks
 * @param databaseId - The database ID (project)
 * @returns An ExternalDocument representation
 */
function pageToExternalDocument(
  page: NotionPage,
  markdown: string,
  databaseId: string
): ExternalDocument {
  return {
    externalId: page.id,
    url: page.url,
    provider: 'notion',
    project: databaseId,
    title: extractTitleFromProperties(page.properties),
    content: markdown,
    contentType: 'markdown',
    updatedAt: page.last_edited_time,
    raw: page as unknown as Record<string, unknown>,
  };
}

// ============================================================================
// NotionDocumentAdapter
// ============================================================================

/**
 * DocumentSyncAdapter implementation for Notion.
 *
 * Uses the NotionApiClient for all API interactions and the
 * blocks ↔ markdown converter for content transformation.
 *
 * On first use of createPage() or updatePage(), the adapter discovers the
 * database schema to find the title property name and check which optional
 * properties exist. The schema is cached per database ID, so only one
 * getDatabase() call is made per adapter instance per database.
 *
 * @example
 * ```typescript
 * const api = new NotionApiClient({ token: 'ntn_...' });
 * const adapter = new NotionDocumentAdapter(api);
 *
 * // Fetch a page
 * const doc = await adapter.getPage('database-id', 'page-id');
 *
 * // List recently edited pages
 * const docs = await adapter.listPagesSince('database-id', '2024-01-01T00:00:00Z');
 *
 * // Create a new page (schema is discovered automatically)
 * const newDoc = await adapter.createPage('database-id', {
 *   title: 'New Page',
 *   content: '# Hello\n\nWorld',
 *   contentType: 'markdown',
 * });
 * ```
 */
export class NotionDocumentAdapter implements DocumentSyncAdapter {
  private readonly api: NotionApiClient;

  /** Cached database schemas keyed by database ID */
  private readonly schemaCache = new Map<string, NotionDatabaseSchema>();

  constructor(api: NotionApiClient) {
    this.api = api;
  }

  /**
   * Discover and cache the database schema for a given database ID.
   *
   * Fetches the database schema from the Notion API, discovers the title
   * property name (every database has exactly one property of type 'title'),
   * and checks for the existence of Category (select) and Tags (multi_select)
   * properties.
   *
   * If Category or Tags properties don't exist, attempts to auto-create them
   * via PATCH /databases/{id}. If the integration lacks permission, the
   * properties are simply skipped — no error is thrown.
   *
   * Results are cached per database ID so only one API call is made per
   * adapter instance per database.
   *
   * @param databaseId - The Notion database ID to discover
   * @returns The discovered database schema
   * @throws Error if the database has no title property
   */
  async getDatabaseSchema(databaseId: string): Promise<NotionDatabaseSchema> {
    const cached = this.schemaCache.get(databaseId);
    if (cached) return cached;

    const db = await this.api.getDatabase(databaseId);

    // Discover the title property name
    let titlePropertyName: string | null = null;
    for (const [name, prop] of Object.entries(db.properties)) {
      if (prop.type === 'title') {
        titlePropertyName = name;
        break;
      }
    }

    if (!titlePropertyName) {
      throw new Error(
        `Notion database ${databaseId} has no title property. ` +
        'Every Notion database should have exactly one property of type "title".'
      );
    }

    // Check if Category and Tags properties exist with the expected types
    let hasCategoryProperty = db.properties['Category']?.type === 'select';
    let hasTagsProperty = db.properties['Tags']?.type === 'multi_select';

    // Auto-create missing properties if needed
    if (!hasCategoryProperty || !hasTagsProperty) {
      const propertiesToCreate: Record<string, unknown> = {};

      if (!hasCategoryProperty) {
        propertiesToCreate['Category'] = { select: { options: [] } };
      }
      if (!hasTagsProperty) {
        propertiesToCreate['Tags'] = { multi_select: { options: [] } };
      }

      try {
        const updatedDb = await this.api.updateDatabase(databaseId, {
          properties: propertiesToCreate,
        });

        // Re-check after creation attempt
        hasCategoryProperty = updatedDb.properties['Category']?.type === 'select';
        hasTagsProperty = updatedDb.properties['Tags']?.type === 'multi_select';
      } catch {
        // If we lack permission to update the database schema, just skip.
        // The adapter will omit Category/Tags from page properties.
      }
    }

    const schema: NotionDatabaseSchema = {
      titlePropertyName,
      hasCategoryProperty,
      hasTagsProperty,
    };

    this.schemaCache.set(databaseId, schema);
    return schema;
  }

  /**
   * Fetch a single page by its ID.
   *
   * Retrieves the page properties and block children, converts the blocks
   * to markdown, and returns a normalized ExternalDocument.
   *
   * @param project - The Notion database ID
   * @param externalId - The Notion page ID
   * @returns The page as an ExternalDocument, or null if not found
   */
  async getPage(project: string, externalId: string): Promise<ExternalDocument | null> {
    try {
      const [page, blocks] = await Promise.all([
        this.api.getPage(externalId),
        this.api.getBlocks(externalId),
      ]);

      const markdown = notionBlocksToMarkdown(blocks);
      return pageToExternalDocument(page, markdown, project);
    } catch (error: unknown) {
      // Return null for not-found errors (matching adapter contract)
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List pages in a database that have been edited since a given timestamp.
   *
   * Queries the database with a `last_edited_time > since` filter and
   * returns all matching pages as ExternalDocuments. Block content is
   * fetched for each page to build the full document.
   *
   * @param project - The Notion database ID
   * @param since - ISO 8601 timestamp to filter by last_edited_time
   * @returns Array of ExternalDocuments edited since the given time
   */
  async listPagesSince(project: string, since: Timestamp): Promise<ExternalDocument[]> {
    const filter = {
      timestamp: 'last_edited_time',
      last_edited_time: {
        after: since,
      },
    };

    const pages = await this.api.queryDatabaseAll(project, filter);

    // Fetch blocks for each page and convert to ExternalDocument
    const documents = await Promise.all(
      pages.map(async (page) => {
        const blocks = await this.api.getBlocks(page.id);
        const markdown = notionBlocksToMarkdown(blocks);
        return pageToExternalDocument(page, markdown, project);
      })
    );

    return documents;
  }

  /**
   * Create a new page in a Notion database.
   *
   * Discovers the database schema (if not cached), then converts the markdown
   * content to Notion blocks and creates a page with the discovered title
   * property name. Category (select) and Tags (multi_select) properties are
   * only set if they exist in the database schema.
   *
   * Notion limits POST /pages to 100 children blocks. If the content exceeds
   * this limit, the page is created with the first 100 blocks, and the
   * remaining blocks are appended in batches of 100 via PATCH /blocks/{id}/children.
   *
   * @param project - The Notion database ID
   * @param page - The document input with title and content
   * @returns The created page as an ExternalDocument
   */
  async createPage(
    project: string,
    page: ExternalDocumentInput
  ): Promise<ExternalDocument> {
    // Discover the database schema to get the correct title property name
    // and check which optional properties exist
    const schema = await this.getDatabaseSchema(project);

    // markdownToNotionBlocks returns NotionBlock[] which is structurally
    // compatible with NotionBlockInput[] but needs a cast due to index signature
    const blocks = markdownToNotionBlocks(page.content) as unknown as NotionBlockInput[];
    const properties = buildPageProperties(page.title, schema);

    // Notion limits POST /pages to 100 children blocks
    const BLOCK_LIMIT = 100;
    const firstBatch = blocks.slice(0, BLOCK_LIMIT);
    const remaining = blocks.slice(BLOCK_LIMIT);

    // Create page with up to 100 blocks
    const createdPage = await this.api.createPage(project, properties, firstBatch);

    // Append remaining blocks in batches of 100
    if (remaining.length > 0) {
      await this.api.appendBlocks(createdPage.id, remaining);
    }

    // Return the created page as an ExternalDocument
    // The content is the original markdown (we just sent it as blocks)
    return pageToExternalDocument(createdPage, page.content, project);
  }

  /**
   * Update an existing page's properties and/or content.
   *
   * If the updates include a title, the title property is updated using the
   * discovered property name from the database schema.
   * If the updates include content, all existing blocks are replaced
   * with new blocks converted from the updated markdown.
   *
   * @param project - The Notion database ID
   * @param externalId - The Notion page ID to update
   * @param updates - Partial updates to apply
   * @returns The updated page as an ExternalDocument
   */
  async updatePage(
    project: string,
    externalId: string,
    updates: Partial<ExternalDocumentInput>
  ): Promise<ExternalDocument> {
    // Update properties if title changed
    if (updates.title !== undefined) {
      const schema = await this.getDatabaseSchema(project);
      const properties = buildPageProperties(updates.title, schema);
      await this.api.updatePage(externalId, properties);
    }

    // Update content blocks if content changed
    if (updates.content !== undefined) {
      const contentBlocks = markdownToNotionBlocks(updates.content) as unknown as NotionBlockInput[];
      await this.api.updatePageContent(externalId, contentBlocks);
    }

    // Fetch the updated page to return a complete ExternalDocument
    const [updatedPage, blocks] = await Promise.all([
      this.api.getPage(externalId),
      this.api.getBlocks(externalId),
    ]);

    const markdown = notionBlocksToMarkdown(blocks);
    return pageToExternalDocument(updatedPage, markdown, project);
  }
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Checks if an error represents a "not found" response from the Notion API.
 */
function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'isNotFound' in error) {
    return (error as { isNotFound: boolean }).isNotFound;
  }
  return false;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a NotionDocumentAdapter from a NotionApiClient.
 *
 * @param api - A configured NotionApiClient
 * @returns A DocumentSyncAdapter for Notion
 */
export function createNotionDocumentAdapter(
  api: NotionApiClient
): NotionDocumentAdapter {
  return new NotionDocumentAdapter(api);
}
