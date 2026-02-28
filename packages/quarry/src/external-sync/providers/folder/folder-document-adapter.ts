/**
 * Folder Document Sync Adapter
 *
 * Implements the DocumentSyncAdapter interface for local folder-based
 * document synchronization. Maps between Stoneforge documents and
 * markdown files with YAML frontmatter in a local directory tree.
 *
 * Uses folder-fs.ts for all filesystem operations (read, write, list).
 *
 * Conventions:
 * - project = absolute folder path (base directory)
 * - externalId = relative file path within the folder (e.g., 'notes/meeting.md')
 * - URL format: file:///absolute/path/to/file.md
 * - Filenames are generated from titles using slugification
 */

import * as path from 'node:path';
import type {
  DocumentSyncAdapter,
  ExternalDocument,
  ExternalDocumentInput,
  Timestamp,
} from '@stoneforge/core';

import {
  readFile,
  writeFile,
  listFiles,
  parseFrontmatter,
  type FolderFrontmatter,
} from './folder-fs.js';

// ============================================================================
// Slugify Utility
// ============================================================================

/**
 * Converts a title string into a filename-safe slug.
 *
 * - Lowercases the string
 * - Replaces non-alphanumeric characters (except hyphens) with hyphens
 * - Collapses consecutive hyphens
 * - Trims leading/trailing hyphens
 * - Falls back to 'untitled' for empty results
 *
 * @param title - The document title to slugify
 * @returns A filename-safe slug string (without extension)
 */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'untitled';
}

// ============================================================================
// URL Helpers
// ============================================================================

/**
 * Builds a file:// URL from a base path and relative file path.
 *
 * @param basePath - Absolute base directory path
 * @param relativePath - Relative file path within the base directory
 * @returns A file:// URL string
 */
function buildFileUrl(basePath: string, relativePath: string): string {
  const absolutePath = path.resolve(basePath, relativePath);
  return `file://${absolutePath}`;
}

// ============================================================================
// Folder Document Adapter
// ============================================================================

/**
 * DocumentSyncAdapter implementation for local folder-based sync.
 *
 * Maps between Stoneforge ExternalDocument and markdown files with YAML
 * frontmatter on the local filesystem.
 *
 * Usage:
 * ```typescript
 * const adapter = new FolderDocumentAdapter();
 * const doc = await adapter.getPage('/path/to/docs', 'notes/meeting.md');
 * ```
 */
export class FolderDocumentAdapter implements DocumentSyncAdapter {
  /**
   * Fetch a single document by its relative file path.
   *
   * @param project - Absolute path to the base directory
   * @param externalId - Relative file path (e.g., 'notes/meeting.md')
   * @returns The document as an ExternalDocument, or null if not found
   */
  async getPage(
    project: string,
    externalId: string
  ): Promise<ExternalDocument | null> {
    try {
      const result = await readFile(project, externalId);

      return {
        externalId,
        url: buildFileUrl(project, externalId),
        provider: 'folder',
        project,
        title: extractTitle(externalId, result.content, result.frontmatter),
        content: result.content,
        contentType: 'markdown',
        updatedAt: new Date(result.mtime).toISOString(),
        raw: { frontmatter: result.frontmatter },
      };
    } catch (err: unknown) {
      // Return null for missing files (ENOENT)
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'ENOENT'
      ) {
        return null;
      }
      // Re-throw other errors (permission issues, etc.)
      throw err;
    }
  }

  /**
   * List documents modified since a given timestamp.
   *
   * Reads each file to extract title and content, returning full
   * ExternalDocument objects.
   *
   * @param project - Absolute path to the base directory
   * @param since - ISO 8601 timestamp; only files modified after this are returned
   * @returns Array of ExternalDocument objects for modified files
   */
  async listPagesSince(
    project: string,
    since: Timestamp
  ): Promise<ExternalDocument[]> {
    const sinceMs = new Date(since).getTime();
    const entries = await listFiles(project, { since: sinceMs });

    const documents: ExternalDocument[] = [];
    for (const entry of entries) {
      const result = await readFile(project, entry.path);
      documents.push({
        externalId: entry.path,
        url: buildFileUrl(project, entry.path),
        provider: 'folder',
        project,
        title: extractTitle(entry.path, result.content, result.frontmatter),
        content: result.content,
        contentType: 'markdown',
        updatedAt: new Date(entry.mtime).toISOString(),
        raw: { frontmatter: result.frontmatter },
      });
    }

    return documents;
  }

  /**
   * Create a new document file in the folder.
   *
   * Generates a filename from the title using slugification, writes
   * the content with frontmatter, and returns the created document.
   *
   * @param project - Absolute path to the base directory
   * @param page - Document input with title, content, and optional contentType
   * @returns The created ExternalDocument
   */
  async createPage(
    project: string,
    page: ExternalDocumentInput
  ): Promise<ExternalDocument> {
    const slug = slugify(page.title);
    const relativePath = `${slug}.md`;

    const frontmatter: FolderFrontmatter = {
      'synced-at': new Date().toISOString(),
    };

    await writeFile(project, relativePath, page.content, frontmatter);

    // Read back to get the actual mtime
    const result = await readFile(project, relativePath);

    return {
      externalId: relativePath,
      url: buildFileUrl(project, relativePath),
      provider: 'folder',
      project,
      title: page.title,
      content: page.content,
      contentType: 'markdown',
      updatedAt: new Date(result.mtime).toISOString(),
      raw: { frontmatter: result.frontmatter },
    };
  }

  /**
   * Update an existing document file in the folder.
   *
   * Reads the existing file, merges the updates (preserving existing
   * frontmatter), and writes back. Returns the updated document.
   *
   * @param project - Absolute path to the base directory
   * @param externalId - Relative file path of the existing document
   * @param updates - Partial document input with fields to update
   * @returns The updated ExternalDocument
   */
  async updatePage(
    project: string,
    externalId: string,
    updates: Partial<ExternalDocumentInput>
  ): Promise<ExternalDocument> {
    // Read the existing file to preserve frontmatter and content
    const existing = await readFile(project, externalId);

    // Merge content: use update if provided, otherwise keep existing
    const mergedContent =
      updates.content !== undefined ? updates.content : existing.content;

    // Merge frontmatter: preserve existing, update synced-at
    const mergedFrontmatter: FolderFrontmatter = {
      ...existing.frontmatter,
      'synced-at': new Date().toISOString(),
    };

    // If title is being updated, store it in frontmatter
    if (updates.title !== undefined) {
      mergedFrontmatter.title = updates.title;
    }

    await writeFile(project, externalId, mergedContent, mergedFrontmatter);

    // Read back to get accurate mtime
    const result = await readFile(project, externalId);

    const title = updates.title ?? extractTitle(externalId, mergedContent, mergedFrontmatter);

    return {
      externalId,
      url: buildFileUrl(project, externalId),
      provider: 'folder',
      project,
      title,
      content: mergedContent,
      contentType: 'markdown',
      updatedAt: new Date(result.mtime).toISOString(),
      raw: { frontmatter: result.frontmatter },
    };
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Extracts a document title from available sources, in priority order:
 * 1. Frontmatter `title` field
 * 2. First markdown heading (# Title)
 * 3. Filename without extension
 *
 * @param relativePath - Relative file path for fallback
 * @param content - Markdown content for heading extraction
 * @param frontmatter - Parsed frontmatter for title field
 * @returns The best available title
 */
function extractTitle(
  relativePath: string,
  content: string,
  frontmatter: FolderFrontmatter
): string {
  // 1. Check frontmatter title
  if (
    typeof frontmatter.title === 'string' &&
    frontmatter.title.trim().length > 0
  ) {
    return frontmatter.title.trim();
  }

  // 2. Check first markdown heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  // 3. Fall back to filename without extension
  const basename = path.basename(relativePath, path.extname(relativePath));
  return basename;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new FolderDocumentAdapter instance.
 *
 * @returns A configured FolderDocumentAdapter
 */
export function createFolderDocumentAdapter(): FolderDocumentAdapter {
  return new FolderDocumentAdapter();
}
