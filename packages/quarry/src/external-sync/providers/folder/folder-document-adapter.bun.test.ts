/**
 * Folder Document Adapter + Provider Tests
 *
 * Tests for the folder sync provider's document adapter and provider.
 * Uses temporary directories for isolation — no mocks needed.
 *
 * Covers:
 * - getPage: fetch a single document by relative path
 * - listPagesSince: list documents modified since a timestamp
 * - createPage: generate filename from title (slugify), write with frontmatter
 * - updatePage: read existing, merge updates, write back
 * - slugify: title-to-filename conversion
 * - provider testConnection: check if path exists and is a directory
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  FolderDocumentAdapter,
  createFolderDocumentAdapter,
  slugify,
} from './folder-document-adapter.js';
import { createFolderProvider } from './folder-provider.js';
import { writeFile } from './folder-fs.js';
import type { FolderFrontmatter } from './folder-fs.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stoneforge-folder-adapter-test-'));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/** Writes a raw file (no frontmatter processing) for test setup */
function writeRawFile(dir: string, relativePath: string, content: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

/** Sets the mtime of a file for since-filtering tests */
function setMtime(dir: string, relativePath: string, mtime: Date): void {
  const fullPath = path.join(dir, relativePath);
  fs.utimesSync(fullPath, mtime, mtime);
}

// ============================================================================
// slugify Tests
// ============================================================================

describe('slugify', () => {
  test('converts simple title to slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  test('handles special characters', () => {
    expect(slugify('My Document: A (Great) Test!')).toBe('my-document-a-great-test');
  });

  test('collapses consecutive hyphens', () => {
    expect(slugify('foo---bar')).toBe('foo-bar');
  });

  test('trims leading/trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  test('returns untitled for empty string', () => {
    expect(slugify('')).toBe('untitled');
  });

  test('returns untitled for string with only special chars', () => {
    expect(slugify('!@#$%')).toBe('untitled');
  });

  test('preserves numbers', () => {
    expect(slugify('Chapter 1: Introduction')).toBe('chapter-1-introduction');
  });

  test('handles unicode characters', () => {
    expect(slugify('café résumé')).toBe('caf-r-sum');
  });

  test('preserves existing hyphens', () => {
    expect(slugify('already-slugified')).toBe('already-slugified');
  });
});

// ============================================================================
// getPage Tests
// ============================================================================

describe('FolderDocumentAdapter.getPage', () => {
  let tempDir: string;
  let adapter: FolderDocumentAdapter;

  beforeEach(() => {
    tempDir = createTempDir();
    adapter = new FolderDocumentAdapter();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  test('returns document for existing file', async () => {
    writeRawFile(
      tempDir,
      'docs/readme.md',
      '---\ntitle: My Doc\ncategory: reference\n---\n# My Doc\n\nContent here.'
    );

    const doc = await adapter.getPage(tempDir, 'docs/readme.md');

    expect(doc).not.toBeNull();
    expect(doc!.externalId).toBe('docs/readme.md');
    expect(doc!.provider).toBe('folder');
    expect(doc!.project).toBe(tempDir);
    expect(doc!.title).toBe('My Doc');
    expect(doc!.content).toBe('# My Doc\n\nContent here.');
    expect(doc!.contentType).toBe('markdown');
    expect(doc!.url).toStartWith('file://');
    expect(doc!.url).toContain('docs/readme.md');
    expect(doc!.updatedAt).toBeTruthy();
    expect(doc!.raw).toBeDefined();
  });

  test('extracts title from first heading when no frontmatter title', async () => {
    writeRawFile(tempDir, 'heading.md', '# My Heading\n\nBody content.');

    const doc = await adapter.getPage(tempDir, 'heading.md');

    expect(doc).not.toBeNull();
    expect(doc!.title).toBe('My Heading');
  });

  test('falls back to filename when no title or heading', async () => {
    writeRawFile(tempDir, 'no-title.md', 'Just some plain text.');

    const doc = await adapter.getPage(tempDir, 'no-title.md');

    expect(doc).not.toBeNull();
    expect(doc!.title).toBe('no-title');
  });

  test('returns null for nonexistent file', async () => {
    const doc = await adapter.getPage(tempDir, 'nonexistent.md');

    expect(doc).toBeNull();
  });

  test('returns correct URL format', async () => {
    writeRawFile(tempDir, 'file.md', '# Test');

    const doc = await adapter.getPage(tempDir, 'file.md');

    expect(doc).not.toBeNull();
    const expectedPath = path.resolve(tempDir, 'file.md');
    expect(doc!.url).toBe(`file://${expectedPath}`);
  });

  test('includes frontmatter in raw field', async () => {
    writeRawFile(
      tempDir,
      'with-fm.md',
      '---\nstoneforge-id: el-abc1\ncategory: spec\n---\nBody'
    );

    const doc = await adapter.getPage(tempDir, 'with-fm.md');

    expect(doc).not.toBeNull();
    expect(doc!.raw).toBeDefined();
    expect((doc!.raw as { frontmatter: FolderFrontmatter }).frontmatter['stoneforge-id']).toBe('el-abc1');
  });
});

// ============================================================================
// listPagesSince Tests
// ============================================================================

describe('FolderDocumentAdapter.listPagesSince', () => {
  let tempDir: string;
  let adapter: FolderDocumentAdapter;

  beforeEach(() => {
    tempDir = createTempDir();
    adapter = new FolderDocumentAdapter();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  test('lists files modified after since timestamp', async () => {
    const oldDate = new Date('2023-01-01T00:00:00Z');
    const newDate = new Date('2025-06-15T00:00:00Z');
    const sinceDate = '2024-06-01T00:00:00Z';

    writeRawFile(tempDir, 'old.md', '# Old');
    setMtime(tempDir, 'old.md', oldDate);

    writeRawFile(tempDir, 'new.md', '# New Document');
    setMtime(tempDir, 'new.md', newDate);

    const docs = await adapter.listPagesSince(tempDir, sinceDate);

    expect(docs).toHaveLength(1);
    expect(docs[0].externalId).toBe('new.md');
    expect(docs[0].title).toBe('New Document');
    expect(docs[0].content).toBe('# New Document');
    expect(docs[0].provider).toBe('folder');
  });

  test('returns empty array when no files modified since', async () => {
    const oldDate = new Date('2023-01-01T00:00:00Z');
    writeRawFile(tempDir, 'old.md', '# Old');
    setMtime(tempDir, 'old.md', oldDate);

    const docs = await adapter.listPagesSince(tempDir, '2024-01-01T00:00:00Z');

    expect(docs).toHaveLength(0);
  });

  test('reads full document content for each entry', async () => {
    const recentDate = new Date('2025-06-15T00:00:00Z');

    writeRawFile(
      tempDir,
      'doc.md',
      '---\ntitle: Frontmatter Title\n---\n# Heading\n\nBody content.'
    );
    setMtime(tempDir, 'doc.md', recentDate);

    const docs = await adapter.listPagesSince(tempDir, '2024-01-01T00:00:00Z');

    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe('Frontmatter Title');
    expect(docs[0].content).toBe('# Heading\n\nBody content.');
    expect(docs[0].contentType).toBe('markdown');
  });

  test('returns multiple modified documents', async () => {
    const recentDate = new Date('2025-06-15T00:00:00Z');

    writeRawFile(tempDir, 'a.md', '# A');
    setMtime(tempDir, 'a.md', recentDate);

    writeRawFile(tempDir, 'b.md', '# B');
    setMtime(tempDir, 'b.md', recentDate);

    const docs = await adapter.listPagesSince(tempDir, '2024-01-01T00:00:00Z');

    expect(docs).toHaveLength(2);
    const ids = docs.map((d) => d.externalId).sort();
    expect(ids).toEqual(['a.md', 'b.md']);
  });
});

// ============================================================================
// createPage Tests
// ============================================================================

describe('FolderDocumentAdapter.createPage', () => {
  let tempDir: string;
  let adapter: FolderDocumentAdapter;

  beforeEach(() => {
    tempDir = createTempDir();
    adapter = new FolderDocumentAdapter();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  test('creates file with slugified filename', async () => {
    const doc = await adapter.createPage(tempDir, {
      title: 'My New Document',
      content: '# My New Document\n\nContent here.',
    });

    expect(doc.externalId).toBe('my-new-document.md');
    expect(doc.provider).toBe('folder');
    expect(doc.project).toBe(tempDir);
    expect(doc.title).toBe('My New Document');
    expect(doc.content).toBe('# My New Document\n\nContent here.');
    expect(doc.contentType).toBe('markdown');

    // Verify file exists on disk
    expect(fs.existsSync(path.join(tempDir, 'my-new-document.md'))).toBe(true);
  });

  test('writes synced-at frontmatter', async () => {
    await adapter.createPage(tempDir, {
      title: 'Synced Doc',
      content: 'Body',
    });

    const raw = fs.readFileSync(path.join(tempDir, 'synced-doc.md'), 'utf-8');
    expect(raw).toContain('synced-at:');
    expect(raw).toContain('---');
  });

  test('returns valid URL', async () => {
    const doc = await adapter.createPage(tempDir, {
      title: 'URL Test',
      content: 'Body',
    });

    expect(doc.url).toStartWith('file://');
    expect(doc.url).toContain('url-test.md');
  });

  test('handles special characters in title', async () => {
    const doc = await adapter.createPage(tempDir, {
      title: 'Hello: World! (Test) #1',
      content: 'Body',
    });

    expect(doc.externalId).toBe('hello-world-test-1.md');
    expect(fs.existsSync(path.join(tempDir, 'hello-world-test-1.md'))).toBe(true);
  });

  test('handles empty title gracefully', async () => {
    const doc = await adapter.createPage(tempDir, {
      title: '',
      content: 'Body',
    });

    expect(doc.externalId).toBe('untitled.md');
    expect(fs.existsSync(path.join(tempDir, 'untitled.md'))).toBe(true);
  });

  test('returns updatedAt timestamp', async () => {
    const doc = await adapter.createPage(tempDir, {
      title: 'Timestamped',
      content: 'Body',
    });

    expect(doc.updatedAt).toBeTruthy();
    // Should be a valid ISO date
    const parsed = new Date(doc.updatedAt);
    expect(parsed.getTime()).toBeGreaterThan(0);
  });
});

// ============================================================================
// updatePage Tests
// ============================================================================

describe('FolderDocumentAdapter.updatePage', () => {
  let tempDir: string;
  let adapter: FolderDocumentAdapter;

  beforeEach(() => {
    tempDir = createTempDir();
    adapter = new FolderDocumentAdapter();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  test('updates content while preserving frontmatter', async () => {
    // Create initial file with frontmatter
    await writeFile(tempDir, 'doc.md', 'Original content', {
      'stoneforge-id': 'el-test1',
      category: 'reference',
    });

    const updated = await adapter.updatePage(tempDir, 'doc.md', {
      content: 'Updated content',
    });

    expect(updated.content).toBe('Updated content');
    expect(updated.externalId).toBe('doc.md');

    // Verify frontmatter is preserved
    const raw = fs.readFileSync(path.join(tempDir, 'doc.md'), 'utf-8');
    expect(raw).toContain('stoneforge-id: el-test1');
    expect(raw).toContain('category: reference');
    expect(raw).toContain('synced-at:');
  });

  test('updates title by storing in frontmatter', async () => {
    await writeFile(tempDir, 'doc.md', 'Content', {});

    const updated = await adapter.updatePage(tempDir, 'doc.md', {
      title: 'New Title',
    });

    expect(updated.title).toBe('New Title');

    // Verify title is in frontmatter
    const raw = fs.readFileSync(path.join(tempDir, 'doc.md'), 'utf-8');
    expect(raw).toContain('title: New Title');
  });

  test('preserves existing content when only title is updated', async () => {
    await writeFile(tempDir, 'doc.md', 'Original body', {});

    const updated = await adapter.updatePage(tempDir, 'doc.md', {
      title: 'New Title',
    });

    expect(updated.content).toBe('Original body');
  });

  test('updates synced-at timestamp', async () => {
    await writeFile(tempDir, 'doc.md', 'Content', {
      'synced-at': '2020-01-01T00:00:00Z',
    });

    await adapter.updatePage(tempDir, 'doc.md', {
      content: 'Updated',
    });

    const raw = fs.readFileSync(path.join(tempDir, 'doc.md'), 'utf-8');
    // synced-at should be a recent timestamp, not the old one
    expect(raw).toContain('synced-at:');
    expect(raw).not.toContain('2020-01-01T00:00:00Z');
  });

  test('merges both title and content updates', async () => {
    await writeFile(tempDir, 'doc.md', 'Old content', {
      category: 'spec',
    });

    const updated = await adapter.updatePage(tempDir, 'doc.md', {
      title: 'Updated Title',
      content: 'New content',
    });

    expect(updated.title).toBe('Updated Title');
    expect(updated.content).toBe('New content');

    // Verify preserved frontmatter
    const raw = fs.readFileSync(path.join(tempDir, 'doc.md'), 'utf-8');
    expect(raw).toContain('category: spec');
    expect(raw).toContain('title: Updated Title');
  });

  test('returns valid ExternalDocument structure', async () => {
    await writeFile(tempDir, 'doc.md', 'Content', {});

    const updated = await adapter.updatePage(tempDir, 'doc.md', {
      content: 'Updated',
    });

    expect(updated.externalId).toBe('doc.md');
    expect(updated.provider).toBe('folder');
    expect(updated.project).toBe(tempDir);
    expect(updated.contentType).toBe('markdown');
    expect(updated.url).toStartWith('file://');
    expect(updated.updatedAt).toBeTruthy();
    expect(updated.raw).toBeDefined();
  });
});

// ============================================================================
// Provider Tests
// ============================================================================

describe('FolderProvider', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  test('has correct provider metadata', () => {
    const provider = createFolderProvider();

    expect(provider.name).toBe('folder');
    expect(provider.displayName).toBe('Folder');
    expect(provider.supportedAdapters).toEqual(['document']);
  });

  test('testConnection returns true for existing directory', async () => {
    const provider = createFolderProvider();

    const result = await provider.testConnection({
      provider: 'folder',
      defaultProject: tempDir,
    });

    expect(result).toBe(true);
  });

  test('testConnection returns false for nonexistent path', async () => {
    const provider = createFolderProvider();

    const result = await provider.testConnection({
      provider: 'folder',
      defaultProject: path.join(tempDir, 'nonexistent'),
    });

    expect(result).toBe(false);
  });

  test('testConnection returns false for file path (not directory)', async () => {
    const provider = createFolderProvider();
    const filePath = path.join(tempDir, 'file.txt');
    fs.writeFileSync(filePath, 'content');

    const result = await provider.testConnection({
      provider: 'folder',
      defaultProject: filePath,
    });

    expect(result).toBe(false);
  });

  test('testConnection returns false when no defaultProject', async () => {
    const provider = createFolderProvider();

    const result = await provider.testConnection({
      provider: 'folder',
    });

    expect(result).toBe(false);
  });

  test('getDocumentAdapter returns a DocumentSyncAdapter', () => {
    const provider = createFolderProvider();

    const adapter = provider.getDocumentAdapter!();

    expect(adapter).toBeDefined();
    expect(typeof adapter.getPage).toBe('function');
    expect(typeof adapter.listPagesSince).toBe('function');
    expect(typeof adapter.createPage).toBe('function');
    expect(typeof adapter.updatePage).toBe('function');
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createFolderDocumentAdapter', () => {
  test('creates a FolderDocumentAdapter instance', () => {
    const adapter = createFolderDocumentAdapter();

    expect(adapter).toBeInstanceOf(FolderDocumentAdapter);
    expect(typeof adapter.getPage).toBe('function');
    expect(typeof adapter.listPagesSince).toBe('function');
    expect(typeof adapter.createPage).toBe('function');
    expect(typeof adapter.updatePage).toBe('function');
  });
});
