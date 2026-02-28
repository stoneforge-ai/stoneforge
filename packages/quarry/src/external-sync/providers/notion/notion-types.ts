/**
 * Notion API Type Definitions
 *
 * Type definitions for Notion's REST API responses and block/rich-text objects.
 * These types represent the subset of Notion's schema used by the document sync
 * provider and the blocks ↔ markdown converter.
 *
 * Only fields needed for document synchronization are included — this is not a
 * comprehensive representation of the full Notion API.
 *
 * @see https://developers.notion.com/reference
 */

// ============================================================================
// Rich Text Types
// ============================================================================

/**
 * Rich text annotations (formatting) applied to a text span.
 */
export interface NotionAnnotations {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly strikethrough: boolean;
  readonly underline: boolean;
  readonly code: boolean;
  readonly color: string;
}

/**
 * Default annotations — no formatting applied.
 */
export const DEFAULT_ANNOTATIONS: NotionAnnotations = {
  bold: false,
  italic: false,
  strikethrough: false,
  underline: false,
  code: false,
  color: 'default',
};

/**
 * Notion rich text object — the atomic unit of formatted text.
 *
 * Rich text can be of type "text", "mention", or "equation".
 * We only model "text" in detail since that's what we produce during sync.
 */
export interface NotionRichText {
  /** The type of rich text object */
  readonly type: 'text' | 'mention' | 'equation';
  /** Plain text content without formatting */
  readonly plain_text: string;
  /** Text-specific content (present when type === 'text') */
  readonly text?: {
    /** The text content */
    readonly content: string;
    /** Optional link */
    readonly link: { readonly url: string } | null;
  };
  /** Inline formatting annotations */
  readonly annotations: NotionAnnotations;
  /** Optional URL for the rich text (e.g. links) */
  readonly href: string | null;
}

// ============================================================================
// Property Types
// ============================================================================

/**
 * Notion page property value.
 *
 * Properties are typed fields on a page. Each property has a type discriminator
 * and corresponding value field. We model the subset needed for document sync.
 */
export interface NotionProperty {
  /** Unique property ID */
  readonly id: string;
  /** Property type discriminator */
  readonly type: string;
  /** Title property value (array of rich text) */
  readonly title?: readonly NotionRichText[];
  /** Rich text property value */
  readonly rich_text?: readonly NotionRichText[];
  /** Select property value */
  readonly select?: { readonly id: string; readonly name: string; readonly color: string } | null;
  /** Multi-select property value */
  readonly multi_select?: readonly { readonly id: string; readonly name: string; readonly color: string }[];
  /** Checkbox property value */
  readonly checkbox?: boolean;
  /** URL property value */
  readonly url?: string | null;
  /** Date property value */
  readonly date?: { readonly start: string; readonly end: string | null } | null;
  /** Number property value */
  readonly number?: number | null;
  /** Last edited time property value (ISO 8601) */
  readonly last_edited_time?: string;
  /** Created time property value (ISO 8601) */
  readonly created_time?: string;
}

// ============================================================================
// Block Types
// ============================================================================

/**
 * Notion block object — the content building block of a page.
 *
 * Every block has a type discriminator and a corresponding type-specific object.
 * We model the most common block types used in document content.
 *
 * Metadata fields (id, has_children, etc.) are optional because they are present
 * on blocks read from the API but absent on blocks created locally (e.g. by the
 * markdown → Notion converter).
 */
export interface NotionBlock {
  /** Unique block ID (UUID) — present on API responses */
  readonly id?: string;
  /** Block type discriminator */
  readonly type: string;
  /** Whether this block has nested children — present on API responses */
  readonly has_children?: boolean;
  /** Creation timestamp (ISO 8601) — present on API responses */
  readonly created_time?: string;
  /** Last edit timestamp (ISO 8601) — present on API responses */
  readonly last_edited_time?: string;
  /** Whether this block has been archived (deleted) — present on API responses */
  readonly archived?: boolean;

  // Block type-specific content — only the type matching `type` field will be present
  readonly paragraph?: { readonly rich_text: readonly NotionRichText[]; readonly color?: string };
  readonly heading_1?: { readonly rich_text: readonly NotionRichText[]; readonly color?: string; readonly is_toggleable?: boolean };
  readonly heading_2?: { readonly rich_text: readonly NotionRichText[]; readonly color?: string; readonly is_toggleable?: boolean };
  readonly heading_3?: { readonly rich_text: readonly NotionRichText[]; readonly color?: string; readonly is_toggleable?: boolean };
  readonly bulleted_list_item?: { readonly rich_text: readonly NotionRichText[]; readonly color?: string };
  readonly numbered_list_item?: { readonly rich_text: readonly NotionRichText[]; readonly color?: string };
  readonly to_do?: { readonly rich_text: readonly NotionRichText[]; readonly checked: boolean; readonly color?: string };
  readonly toggle?: { readonly rich_text: readonly NotionRichText[] };
  readonly code?: { readonly rich_text: readonly NotionRichText[]; readonly caption?: readonly NotionRichText[]; readonly language: string };
  readonly quote?: { readonly rich_text: readonly NotionRichText[]; readonly color?: string };
  readonly callout?: { readonly rich_text: readonly NotionRichText[]; readonly icon?: unknown };
  readonly divider?: Record<string, never>;
  readonly table_of_contents?: Record<string, never>;
  readonly child_page?: { readonly title: string };
  readonly child_database?: { readonly title: string };
}

// ============================================================================
// Supported Block Type Constants
// ============================================================================

/**
 * Block types that we support for markdown ↔ Notion conversion.
 */
export const SUPPORTED_BLOCK_TYPES = [
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'code',
  'quote',
  'to_do',
] as const;

export type SupportedBlockType = (typeof SUPPORTED_BLOCK_TYPES)[number];

/**
 * Check if a block type is supported for conversion.
 */
export function isSupportedBlockType(type: string): type is SupportedBlockType {
  return (SUPPORTED_BLOCK_TYPES as readonly string[]).includes(type);
}

// ============================================================================
// Page Types
// ============================================================================

/**
 * Notion page object.
 *
 * Pages are the primary content container in Notion. Each page has properties
 * (metadata fields) and block children (the page content).
 */
export interface NotionPage {
  /** Unique page ID (UUID) */
  readonly id: string;
  /** Object type (always "page") */
  readonly object: 'page';
  /** Creation timestamp (ISO 8601) */
  readonly created_time: string;
  /** Last edit timestamp (ISO 8601) */
  readonly last_edited_time: string;
  /** Whether the page has been archived (moved to trash) */
  readonly archived: boolean;
  /** URL to view the page in Notion */
  readonly url: string;
  /** Public URL if the page is published (null otherwise) */
  readonly public_url: string | null;
  /** Page properties keyed by property name */
  readonly properties: Record<string, NotionProperty>;
  /** Parent reference */
  readonly parent:
    | { readonly type: 'database_id'; readonly database_id: string }
    | { readonly type: 'page_id'; readonly page_id: string }
    | { readonly type: 'workspace'; readonly workspace: true };
}

// ============================================================================
// Database Query Types
// ============================================================================

/**
 * Response from querying a Notion database (POST /databases/{id}/query).
 *
 * Uses cursor-based pagination with `has_more` / `next_cursor`.
 */
export interface NotionDatabaseQueryResponse {
  /** Object type (always "list") */
  readonly object: 'list';
  /** Array of page objects matching the query */
  readonly results: readonly NotionPage[];
  /** Whether there are more results beyond this page */
  readonly has_more: boolean;
  /** Cursor for the next page of results (null if no more) */
  readonly next_cursor: string | null;
  /** Type of items in the results */
  readonly type: 'page_or_database';
}

/**
 * Paginated response for block children (GET /blocks/{id}/children).
 */
export interface NotionBlockChildrenResponse {
  /** Object type (always "list") */
  readonly object: 'list';
  /** Array of block objects */
  readonly results: readonly NotionBlock[];
  /** Whether there are more results beyond this page */
  readonly has_more: boolean;
  /** Cursor for the next page of results (null if no more) */
  readonly next_cursor: string | null;
  /** Type of items in the results */
  readonly type: 'block';
}

// ============================================================================
// Input Types (for creating/updating)
// ============================================================================

/**
 * Input for creating a new block.
 *
 * When creating blocks, we provide the type and corresponding content object.
 * This is a simplified version — only the block types we produce are included.
 */
export interface NotionBlockInput {
  /** Block type */
  readonly type: string;
  /** Object key matching the type (e.g., 'paragraph', 'heading_1', etc.) */
  readonly [key: string]: unknown;
}

/**
 * Input for creating a page in a database.
 */
export interface NotionCreatePageInput {
  /** Parent database or page reference */
  readonly parent:
    | { readonly database_id: string }
    | { readonly page_id: string };
  /** Page properties */
  readonly properties: Record<string, unknown>;
  /** Optional block children (page content) */
  readonly children?: readonly NotionBlockInput[];
}

/**
 * Input for updating page properties.
 */
export interface NotionUpdatePageInput {
  /** Properties to update */
  readonly properties?: Record<string, unknown>;
  /** Whether to archive (trash) the page */
  readonly archived?: boolean;
}

// ============================================================================
// Database Types
// ============================================================================

/**
 * Schema definition for a database property.
 *
 * This represents the database-level schema (from GET /databases/{id}),
 * not the page-level property values. Each property has a type and
 * type-specific configuration (e.g., select options, formula expression).
 */
export interface NotionDatabaseProperty {
  /** Unique property ID */
  readonly id: string;
  /** Property type (e.g., 'title', 'select', 'multi_select', 'rich_text') */
  readonly type: string;
  /** Property name */
  readonly name: string;
  /** Select options (present when type === 'select') */
  readonly select?: { readonly options: readonly { readonly id: string; readonly name: string; readonly color: string }[] };
  /** Multi-select options (present when type === 'multi_select') */
  readonly multi_select?: { readonly options: readonly { readonly id: string; readonly name: string; readonly color: string }[] };
}

/**
 * Notion database object.
 *
 * Represents a database schema retrieved via GET /databases/{id}.
 * Contains the database properties (schema definitions) which describe
 * the structure of pages within the database.
 *
 * @see https://developers.notion.com/reference/retrieve-a-database
 */
export interface NotionDatabase {
  /** Unique database ID (UUID) */
  readonly id: string;
  /** Object type (always "database") */
  readonly object: 'database';
  /** Creation timestamp (ISO 8601) */
  readonly created_time: string;
  /** Last edit timestamp (ISO 8601) */
  readonly last_edited_time: string;
  /** Database title */
  readonly title: readonly NotionRichText[];
  /** Database properties schema, keyed by property name */
  readonly properties: Record<string, NotionDatabaseProperty>;
  /** Whether the database has been archived */
  readonly archived: boolean;
  /** URL to view the database in Notion */
  readonly url: string;
}

/**
 * Input for updating a database schema.
 *
 * Used with PATCH /databases/{id} to add or modify properties.
 *
 * @see https://developers.notion.com/reference/update-a-database
 */
export interface NotionUpdateDatabaseInput {
  /** Properties to add or update in the database schema */
  readonly properties?: Record<string, unknown>;
}

/**
 * Cached database schema information used by the document adapter.
 *
 * Contains the discovered property names for title, category, and tags,
 * so the adapter doesn't need to query the database schema on every operation.
 */
export interface NotionDatabaseSchema {
  /** The name of the title property (every database has exactly one) */
  readonly titlePropertyName: string;
  /** Whether a 'Category' select property exists in the database */
  readonly hasCategoryProperty: boolean;
  /** Whether a 'Tags' multi_select property exists in the database */
  readonly hasTagsProperty: boolean;
}

// ============================================================================
// Error Response Types
// ============================================================================

/**
 * Notion API error response body.
 *
 * @see https://developers.notion.com/reference/errors
 */
export interface NotionErrorResponse {
  /** Object type (always "error") */
  readonly object: 'error';
  /** HTTP status code */
  readonly status: number;
  /** Notion-specific error code (e.g., "validation_error", "object_not_found") */
  readonly code: string;
  /** Human-readable error message */
  readonly message: string;
}
