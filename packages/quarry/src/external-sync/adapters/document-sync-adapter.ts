/**
 * Document Sync Adapter Utilities
 *
 * Shared field mapping logic for converting between Stoneforge documents and
 * external document representations (e.g., Notion pages, Obsidian notes).
 *
 * These utilities are provider-agnostic — they handle the common conversion
 * logic that all document sync providers need.
 *
 * Key functions:
 * - documentToExternalDocumentInput: Convert a Stoneforge Document → ExternalDocumentInput for push
 * - externalDocumentToDocumentUpdates: Convert an ExternalDocument → Partial<Document> for pull
 * - diffDocumentUpdates: Return only changed fields between existing and updated document
 * - computeExternalDocumentHash: Deterministic hash for change detection
 */

import { createHash } from 'crypto';
import type {
  Document,
  ContentType,
  DocumentCategory,
  Element,
  ElementId,
  Dependency,
  DependencyType,
} from '@stoneforge/core';
import type { ExternalDocument, ExternalDocumentInput } from '@stoneforge/core';

// ============================================================================
// System Categories
// ============================================================================

/**
 * Document categories that are system-managed and should be excluded from
 * external sync. These documents are structural (task descriptions, message
 * content) and are synced through their parent element's sync adapter.
 */
export const SYSTEM_CATEGORIES: ReadonlySet<DocumentCategory> = new Set<DocumentCategory>([
  'task-description',
  'message-content',
]);

/**
 * Checks whether a document category is a system category that should
 * be excluded from document sync.
 */
export function isSystemCategory(category: DocumentCategory): boolean {
  return SYSTEM_CATEGORIES.has(category);
}

/**
 * Checks whether a document should be included in external sync operations
 * (link-all, push, pull). A document is syncable if:
 * - It does not have a system category (task-description, message-content)
 * - It has a non-empty title (null, undefined, or whitespace-only titles are excluded)
 *
 * Documents without titles are typically system-generated (messages, task descriptions)
 * that happen to not have the system category set, or scratch documents. They all
 * slugify to "untitled.md" and overwrite each other, so they must be excluded.
 */
export function isSyncableDocument(doc: Document): boolean {
  if (isSystemCategory(doc.category)) return false;
  if (!doc.title || doc.title.trim().length === 0) return false;
  return true;
}

// ============================================================================
// Content Type Mapping
// ============================================================================

/**
 * Maps Stoneforge ContentType to external document content type.
 *
 * Stoneforge uses 'markdown', 'text', and 'json'.
 * External systems use 'markdown', 'text', and 'html'.
 * JSON content is mapped to 'text' for external systems since most
 * document providers don't have a native JSON content type.
 */
export function mapContentTypeToExternal(
  contentType: ContentType
): 'markdown' | 'html' | 'text' {
  switch (contentType) {
    case 'markdown':
      return 'markdown';
    case 'text':
      return 'text';
    case 'json':
      // JSON doesn't have a direct external equivalent; map to text
      return 'text';
    default:
      return 'text';
  }
}

/**
 * Maps external document content type to Stoneforge ContentType.
 *
 * External systems use 'markdown', 'text', and 'html'.
 * HTML content is mapped to 'text' since Stoneforge doesn't have an HTML
 * content type — the content is stored as-is, just categorized as text.
 */
export function mapContentTypeFromExternal(
  contentType: 'markdown' | 'html' | 'text'
): ContentType {
  switch (contentType) {
    case 'markdown':
      return 'markdown';
    case 'text':
      return 'text';
    case 'html':
      // HTML doesn't have a direct Stoneforge equivalent; map to text
      return 'text';
    default:
      return 'text';
  }
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Mutable version of Partial<Document> that allows setting readonly fields
 * like contentType. Used internally for building update/diff objects.
 */
type MutablePartialDocument = {
  -readonly [K in keyof Document]?: Document[K];
};

// ============================================================================
// Library Path Resolution
// ============================================================================

/**
 * Minimal API interface for resolving library paths.
 * This avoids coupling to the full QuarryAPI type while providing
 * the dependency and element lookup methods needed for path resolution.
 */
export interface LibraryPathAPI {
  /** Get all dependencies for an element, optionally filtered by type */
  getDependencies(id: ElementId, types?: DependencyType[]): Promise<Dependency[]>;
  /** Get a single element by ID */
  get<T extends Element>(id: ElementId): Promise<T | null>;
}

/**
 * Slugifies a library name for use as a directory name.
 * Uses the same algorithm as the folder adapter's slugify function:
 * lowercase, replace non-alphanumeric chars with hyphens, collapse
 * consecutive hyphens, trim leading/trailing hyphens.
 *
 * @param name - Library name to slugify
 * @returns Slugified directory name
 */
function slugifyLibraryName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'untitled';
}

/**
 * Resolves the library path for a document by querying its parent-child
 * dependencies. Builds a hierarchical path from the root library down
 * to the document's immediate parent library.
 *
 * For example, if a document belongs to library "API Reference" which
 * is a child of library "Documentation", the returned path would be
 * "documentation/api-reference".
 *
 * Design decisions:
 * - If a document belongs to multiple libraries, the first one found is used
 * - Library names are slugified for directory names
 * - If the document has no library parent, returns undefined
 *
 * @param api - API for querying dependencies and elements
 * @param documentId - The document's element ID
 * @returns The slugified library path (e.g., 'documentation/api-reference'), or undefined if not in a library
 */
export async function resolveDocumentLibraryPath(
  api: LibraryPathAPI,
  documentId: ElementId
): Promise<string | undefined> {
  // Find parent-child dependencies where document is the child (blockedId)
  const deps = await api.getDependencies(documentId, ['parent-child' as DependencyType]);

  if (deps.length === 0) {
    return undefined;
  }

  // Find the first library parent
  let libraryId: ElementId | undefined;
  for (const dep of deps) {
    const parent = await api.get<Element>(dep.blockerId);
    if (parent && parent.type === 'library') {
      libraryId = dep.blockerId;
      break;
    }
  }

  if (!libraryId) {
    return undefined;
  }

  // Walk up the library hierarchy to build the full path
  const pathSegments: string[] = [];
  let currentId: ElementId | undefined = libraryId;
  const visited = new Set<string>(); // Prevent infinite loops from cycles

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    const library = await api.get<Element & { name: string }>(currentId);
    if (!library || library.type !== 'library') {
      break;
    }

    pathSegments.unshift(slugifyLibraryName(library.name));

    // Find the parent library of this library
    const parentDeps = await api.getDependencies(currentId, ['parent-child' as DependencyType]);
    let foundParentLibrary = false;
    for (const dep of parentDeps) {
      const parent = await api.get<Element>(dep.blockerId);
      if (parent && parent.type === 'library') {
        currentId = dep.blockerId;
        foundParentLibrary = true;
        break;
      }
    }

    if (!foundParentLibrary) {
      break;
    }
  }

  return pathSegments.length > 0 ? pathSegments.join('/') : undefined;
}

/**
 * Batch-resolves library paths for multiple documents.
 * More efficient than calling resolveDocumentLibraryPath individually
 * since it can reuse cached library lookups.
 *
 * @param api - API for querying dependencies and elements
 * @param documentIds - Array of document element IDs
 * @returns Map from document ID to library path (undefined entries omitted)
 */
export async function resolveDocumentLibraryPaths(
  api: LibraryPathAPI,
  documentIds: ElementId[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  for (const docId of documentIds) {
    const libraryPath = await resolveDocumentLibraryPath(api, docId);
    if (libraryPath) {
      result.set(docId, libraryPath);
    }
  }

  return result;
}

// ============================================================================
// Push: Stoneforge Document → External Document
// ============================================================================

/**
 * Converts a Stoneforge Document into an ExternalDocumentInput for
 * creating/updating a page in an external system.
 *
 * Handles:
 * - Title mapping (1:1, falls back to empty string if undefined)
 * - Content mapping (1:1)
 * - ContentType mapping (markdown/text → markdown/text, json → text)
 * - Optional library path for directory-based organization
 *
 * @param doc - The Stoneforge document to convert
 * @param libraryPath - Optional pre-computed library path for the document
 * @returns ExternalDocumentInput ready for the provider adapter
 */
export function documentToExternalDocumentInput(
  doc: Document,
  libraryPath?: string
): ExternalDocumentInput {
  return {
    title: doc.title ?? '',
    content: doc.content,
    contentType: mapContentTypeToExternal(doc.contentType),
    ...(libraryPath !== undefined && { libraryPath }),
  };
}

// ============================================================================
// Pull: External Document → Stoneforge Document Updates
// ============================================================================

/**
 * Converts an ExternalDocument into a partial Document update object for
 * applying external changes to a local Stoneforge document.
 *
 * Handles:
 * - Title mapping (1:1)
 * - Content mapping (1:1)
 * - ContentType mapping (markdown/text/html → markdown/text/text)
 *
 * If existingDoc is provided, only changed fields are returned (diff mode).
 * If existingDoc is undefined, all mappable fields are returned (create mode).
 *
 * @param externalDoc - The external document to convert
 * @param existingDoc - The existing local document (undefined for new documents)
 * @returns Partial<Document> with only the changed fields (or all fields if no existingDoc)
 */
export function externalDocumentToDocumentUpdates(
  externalDoc: ExternalDocument,
  existingDoc?: Document
): Partial<Document> {
  const contentType = mapContentTypeFromExternal(externalDoc.contentType);

  const fullUpdate: MutablePartialDocument = {
    title: externalDoc.title,
    content: externalDoc.content,
    contentType,
  };

  // If no existing document, return full create input
  if (!existingDoc) {
    return fullUpdate;
  }

  // Diff mode: only return changed fields
  return diffDocumentUpdates(existingDoc, fullUpdate);
}

// ============================================================================
// Diff Utilities
// ============================================================================

/**
 * Compares a full update against an existing document and returns only
 * the fields that actually changed.
 *
 * This prevents unnecessary updates when pulling changes from external
 * systems where the data hasn't actually changed.
 *
 * Compared fields: title, content, contentType, category, tags
 */
export function diffDocumentUpdates(
  existing: Document,
  updates: Partial<Document>
): Partial<Document> {
  const diff: MutablePartialDocument = {};

  if (updates.title !== undefined && updates.title !== existing.title) {
    diff.title = updates.title;
  }

  if (updates.content !== undefined && updates.content !== existing.content) {
    diff.content = updates.content;
  }

  if (
    updates.contentType !== undefined &&
    updates.contentType !== existing.contentType
  ) {
    diff.contentType = updates.contentType;
  }

  if (
    updates.category !== undefined &&
    updates.category !== existing.category
  ) {
    diff.category = updates.category;
  }

  if (updates.tags !== undefined && !arraysEqual(updates.tags, existing.tags)) {
    diff.tags = updates.tags;
  }

  return diff;
}

// ============================================================================
// Hash Computation
// ============================================================================

/**
 * Computes a deterministic hash of an ExternalDocument for change detection.
 *
 * The hash is based on the document's title, content, and contentType.
 * Used by the sync engine to detect whether an external document has
 * changed since the last sync, avoiding unnecessary pull operations.
 *
 * @param doc - The external document to hash
 * @returns A hex-encoded SHA-256 hash string
 */
export function computeExternalDocumentHash(doc: ExternalDocument): string {
  const hash = createHash('sha256');
  hash.update(doc.title);
  hash.update('\0'); // null byte separator to avoid collisions
  hash.update(doc.content);
  hash.update('\0');
  hash.update(doc.contentType);
  return hash.digest('hex');
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Compares two arrays for equality (order-independent).
 */
function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}
