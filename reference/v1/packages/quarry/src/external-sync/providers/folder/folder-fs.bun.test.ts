/**
 * Folder Filesystem Client Tests
 *
 * Tests for the folder sync provider's filesystem layer.
 * Uses temporary directories for isolation — no mocks needed.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  readFile,
  writeFile,
  listFiles,
  parseFrontmatter,
  serializeFrontmatter,
  FolderFsError,
  isFolderFsError,
  type FolderFrontmatter,
} from './folder-fs.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stoneforge-folder-fs-test-'));
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
// parseFrontmatter Tests
// ============================================================================

describe('parseFrontmatter', () => {
  test('parses valid YAML frontmatter', () => {
    const raw = `---
stoneforge-id: el-abc1
category: reference
tags:
  - api
  - docs
synced-at: "2024-06-15T10:30:00Z"
---
# Hello World

Body content here.`;

    const result = parseFrontmatter(raw);

    expect(result.frontmatter['stoneforge-id']).toBe('el-abc1');
    expect(result.frontmatter.category).toBe('reference');
    expect(result.frontmatter.tags).toEqual(['api', 'docs']);
    expect(result.frontmatter['synced-at']).toBe('2024-06-15T10:30:00Z');
    expect(result.content).toBe('# Hello World\n\nBody content here.');
  });

  test('returns empty frontmatter when no frontmatter block', () => {
    const raw = '# Just a heading\n\nNo frontmatter here.';
    const result = parseFrontmatter(raw);

    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe(raw);
  });

  test('handles empty frontmatter block', () => {
    const raw = '---\n---\n# Content';
    const result = parseFrontmatter(raw);

    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe('# Content');
  });

  test('handles malformed YAML gracefully', () => {
    const raw = '---\n: invalid: yaml: [\n---\nContent';
    const result = parseFrontmatter(raw);

    // Should treat as no frontmatter
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe(raw);
  });

  test('handles file with only frontmatter (no body)', () => {
    const raw = '---\ntitle: Only frontmatter\n---';
    const result = parseFrontmatter(raw);

    expect(result.frontmatter).toEqual({ title: 'Only frontmatter' });
    expect(result.content).toBe('');
  });

  test('handles frontmatter with no closing delimiter', () => {
    const raw = '---\ntitle: Unclosed\nThis is not frontmatter';
    const result = parseFrontmatter(raw);

    // No closing delimiter — treat whole file as content
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe(raw);
  });

  test('preserves extra frontmatter fields', () => {
    const raw = '---\ncustom-field: value\nanother: 42\n---\nBody';
    const result = parseFrontmatter(raw);

    expect(result.frontmatter['custom-field']).toBe('value');
    expect(result.frontmatter.another).toBe(42);
  });

  test('handles leading whitespace before frontmatter', () => {
    const raw = '\n---\ntitle: With whitespace\n---\nBody';
    const result = parseFrontmatter(raw);

    expect(result.frontmatter).toEqual({ title: 'With whitespace' });
    expect(result.content).toBe('Body');
  });
});

// ============================================================================
// serializeFrontmatter Tests
// ============================================================================

describe('serializeFrontmatter', () => {
  test('serializes frontmatter with content', () => {
    const content = '# Hello\n\nWorld';
    const frontmatter: FolderFrontmatter = {
      'stoneforge-id': 'el-xyz',
      category: 'spec',
    };

    const result = serializeFrontmatter(content, frontmatter);

    expect(result).toContain('---\n');
    expect(result).toContain('stoneforge-id: el-xyz\n');
    expect(result).toContain('category: spec\n');
    expect(result).toEndWith('# Hello\n\nWorld');
  });

  test('returns content only when frontmatter is empty', () => {
    const content = '# No frontmatter';
    const result = serializeFrontmatter(content, {});

    expect(result).toBe('# No frontmatter');
  });

  test('serializes tags as YAML list', () => {
    const result = serializeFrontmatter('Body', { tags: ['a', 'b', 'c'] });

    expect(result).toContain('tags:');
    expect(result).toContain('  - a');
    expect(result).toContain('  - b');
    expect(result).toContain('  - c');
  });
});

// ============================================================================
// Read/Write Round-Trip Tests
// ============================================================================

describe('readFile / writeFile round-trip', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  test('round-trips content and frontmatter', async () => {
    const content = '# My Document\n\nSome content here.\n';
    const frontmatter: FolderFrontmatter = {
      'stoneforge-id': 'el-test1',
      category: 'reference',
      tags: ['sync', 'test'],
      'synced-at': '2024-06-15T10:00:00Z',
    };

    await writeFile(tempDir, 'docs/test.md', content, frontmatter);
    const result = await readFile(tempDir, 'docs/test.md');

    expect(result.content).toBe(content);
    expect(result.frontmatter['stoneforge-id']).toBe('el-test1');
    expect(result.frontmatter.category).toBe('reference');
    expect(result.frontmatter.tags).toEqual(['sync', 'test']);
    expect(result.frontmatter['synced-at']).toBe('2024-06-15T10:00:00Z');
    expect(result.mtime).toBeGreaterThan(0);
  });

  test('round-trips empty frontmatter', async () => {
    const content = '# Plain markdown\n\nNo metadata.\n';

    await writeFile(tempDir, 'plain.md', content, {});
    const result = await readFile(tempDir, 'plain.md');

    expect(result.content).toBe(content);
    expect(result.frontmatter).toEqual({});
  });

  test('creates nested directories automatically', async () => {
    await writeFile(tempDir, 'a/b/c/deep.md', 'Deep file', {
      category: 'nested',
    });

    const result = await readFile(tempDir, 'a/b/c/deep.md');
    expect(result.content).toBe('Deep file');
    expect(result.frontmatter.category).toBe('nested');
  });

  test('overwrites existing file', async () => {
    await writeFile(tempDir, 'file.md', 'Version 1', { version: 1 });
    await writeFile(tempDir, 'file.md', 'Version 2', { version: 2 });

    const result = await readFile(tempDir, 'file.md');
    expect(result.content).toBe('Version 2');
    expect(result.frontmatter.version).toBe(2);
  });

  test('preserves extra frontmatter fields through round-trip', async () => {
    const frontmatter: FolderFrontmatter = {
      'stoneforge-id': 'el-rt1',
      'custom-field': 'preserved',
      'numeric-field': 42,
    };

    await writeFile(tempDir, 'custom.md', 'Body', frontmatter);
    const result = await readFile(tempDir, 'custom.md');

    expect(result.frontmatter['custom-field']).toBe('preserved');
    expect(result.frontmatter['numeric-field']).toBe(42);
  });
});

// ============================================================================
// readFile Tests
// ============================================================================

describe('readFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  test('reads file with frontmatter', async () => {
    writeRawFile(
      tempDir,
      'with-fm.md',
      '---\nstoneforge-id: el-read1\ncategory: spec\n---\n# Title\n\nBody text.'
    );

    const result = await readFile(tempDir, 'with-fm.md');

    expect(result.frontmatter['stoneforge-id']).toBe('el-read1');
    expect(result.frontmatter.category).toBe('spec');
    expect(result.content).toBe('# Title\n\nBody text.');
    expect(typeof result.mtime).toBe('number');
    expect(result.mtime).toBeGreaterThan(0);
  });

  test('reads file without frontmatter', async () => {
    writeRawFile(tempDir, 'no-fm.md', '# Just Content\n\nPlain text.');

    const result = await readFile(tempDir, 'no-fm.md');

    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe('# Just Content\n\nPlain text.');
  });

  test('reads empty file', async () => {
    writeRawFile(tempDir, 'empty.md', '');

    const result = await readFile(tempDir, 'empty.md');

    expect(result.content).toBe('');
    expect(result.frontmatter).toEqual({});
  });

  test('throws FolderFsError for missing file', async () => {
    try {
      await readFile(tempDir, 'nonexistent.md');
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(isFolderFsError(err)).toBe(true);
      const fsErr = err as FolderFsError;
      expect(fsErr.operation).toBe('read');
      expect(fsErr.filePath).toBe('nonexistent.md');
      expect(fsErr.isNotFound).toBe(true);
      expect(fsErr.code).toBe('ENOENT');
    }
  });

  test('throws FolderFsError for path traversal', async () => {
    try {
      await readFile(tempDir, '../../../etc/passwd');
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(isFolderFsError(err)).toBe(true);
      const fsErr = err as FolderFsError;
      expect(fsErr.operation).toBe('read');
      expect(fsErr.code).toBe('EACCES');
    }
  });

  test('returns correct mtime', async () => {
    const knownDate = new Date('2024-03-15T12:00:00Z');
    writeRawFile(tempDir, 'dated.md', '# Dated');
    setMtime(tempDir, 'dated.md', knownDate);

    const result = await readFile(tempDir, 'dated.md');
    expect(result.mtime).toBe(knownDate.getTime());
  });
});

// ============================================================================
// writeFile Tests
// ============================================================================

describe('writeFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  test('writes file with frontmatter', async () => {
    await writeFile(tempDir, 'output.md', '# Written', {
      'stoneforge-id': 'el-w1',
    });

    const raw = fs.readFileSync(path.join(tempDir, 'output.md'), 'utf-8');
    expect(raw).toContain('---');
    expect(raw).toContain('stoneforge-id: el-w1');
    expect(raw).toContain('# Written');
  });

  test('writes file without frontmatter', async () => {
    await writeFile(tempDir, 'plain.md', '# Plain', {});

    const raw = fs.readFileSync(path.join(tempDir, 'plain.md'), 'utf-8');
    expect(raw).toBe('# Plain');
    expect(raw).not.toContain('---');
  });

  test('creates intermediate directories', async () => {
    await writeFile(tempDir, 'a/b/c/nested.md', 'Nested', {});

    expect(fs.existsSync(path.join(tempDir, 'a/b/c/nested.md'))).toBe(true);
  });

  test('writes atomically (temp file is cleaned up)', async () => {
    await writeFile(tempDir, 'atomic.md', 'Content', { key: 'value' });

    // Check that no .tmp files remain
    const files = fs.readdirSync(tempDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
  });

  test('throws FolderFsError for path traversal on write', async () => {
    try {
      await writeFile(tempDir, '../escape.md', 'Bad', {});
      expect(true).toBe(false);
    } catch (err) {
      expect(isFolderFsError(err)).toBe(true);
      const fsErr = err as FolderFsError;
      expect(fsErr.operation).toBe('write');
      expect(fsErr.code).toBe('EACCES');
    }
  });
});

// ============================================================================
// listFiles Tests
// ============================================================================

describe('listFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  test('lists .md files recursively', async () => {
    writeRawFile(tempDir, 'root.md', '# Root');
    writeRawFile(tempDir, 'sub/nested.md', '# Nested');
    writeRawFile(tempDir, 'sub/deep/deep.md', '# Deep');

    const entries = await listFiles(tempDir);

    const paths = entries.map((e) => e.path);
    expect(paths).toContain('root.md');
    expect(paths).toContain('sub/nested.md');
    expect(paths).toContain('sub/deep/deep.md');
    expect(entries).toHaveLength(3);
  });

  test('excludes non-.md files', async () => {
    writeRawFile(tempDir, 'doc.md', '# Doc');
    writeRawFile(tempDir, 'config.yaml', 'key: value');
    writeRawFile(tempDir, 'script.ts', 'export {};');
    writeRawFile(tempDir, 'readme.txt', 'Hello');

    const entries = await listFiles(tempDir);

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('doc.md');
  });

  test('excludes dotfiles', async () => {
    writeRawFile(tempDir, 'visible.md', '# Visible');
    writeRawFile(tempDir, '.hidden.md', '# Hidden');
    writeRawFile(tempDir, '.dotfile', 'hidden');

    const entries = await listFiles(tempDir);

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('visible.md');
  });

  test('excludes files inside dot-directories', async () => {
    writeRawFile(tempDir, 'visible.md', '# Visible');
    writeRawFile(tempDir, '.git/HEAD', 'ref: refs/heads/main');
    writeRawFile(tempDir, '.obsidian/config.md', '# Config');
    writeRawFile(tempDir, '.stoneforge/data.md', '# Data');

    const entries = await listFiles(tempDir);

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('visible.md');
  });

  test('includes mtime for each entry', async () => {
    writeRawFile(tempDir, 'file.md', '# File');

    const entries = await listFiles(tempDir);

    expect(entries).toHaveLength(1);
    expect(typeof entries[0].mtime).toBe('number');
    expect(entries[0].mtime).toBeGreaterThan(0);
  });

  test('filters by since timestamp', async () => {
    const oldDate = new Date('2023-01-01T00:00:00Z');
    const newDate = new Date('2025-06-15T00:00:00Z');
    const cutoff = new Date('2024-06-01T00:00:00Z');

    writeRawFile(tempDir, 'old.md', '# Old');
    setMtime(tempDir, 'old.md', oldDate);

    writeRawFile(tempDir, 'new.md', '# New');
    setMtime(tempDir, 'new.md', newDate);

    const entries = await listFiles(tempDir, { since: cutoff.getTime() });

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('new.md');
  });

  test('since filter excludes files with exact matching timestamp', async () => {
    const exactTime = new Date('2024-06-01T00:00:00Z');

    writeRawFile(tempDir, 'exact.md', '# Exact');
    setMtime(tempDir, 'exact.md', exactTime);

    const entries = await listFiles(tempDir, { since: exactTime.getTime() });

    // since filter uses <=, so exact match should be excluded
    expect(entries).toHaveLength(0);
  });

  test('returns empty array for empty directory', async () => {
    const entries = await listFiles(tempDir);
    expect(entries).toEqual([]);
  });

  test('returns paths sorted alphabetically', async () => {
    writeRawFile(tempDir, 'c.md', '# C');
    writeRawFile(tempDir, 'a.md', '# A');
    writeRawFile(tempDir, 'b.md', '# B');
    writeRawFile(tempDir, 'sub/d.md', '# D');

    const entries = await listFiles(tempDir);
    const paths = entries.map((e) => e.path);

    expect(paths).toEqual(['a.md', 'b.md', 'c.md', 'sub/d.md']);
  });

  test('throws FolderFsError for nonexistent directory', async () => {
    try {
      await listFiles(path.join(tempDir, 'nonexistent'));
      expect(true).toBe(false);
    } catch (err) {
      expect(isFolderFsError(err)).toBe(true);
      const fsErr = err as FolderFsError;
      expect(fsErr.operation).toBe('list');
      expect(fsErr.isNotFound).toBe(true);
    }
  });

  test('uses forward slashes in paths on all platforms', async () => {
    writeRawFile(tempDir, path.join('sub', 'nested', 'file.md'), '# File');

    const entries = await listFiles(tempDir);

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('sub/nested/file.md');
    expect(entries[0].path).not.toContain('\\');
  });
});

// ============================================================================
// Error Type Tests
// ============================================================================

describe('FolderFsError', () => {
  test('isNotFound returns true for ENOENT', () => {
    const err = new FolderFsError('Not found', 'read', 'file.md', 'ENOENT');
    expect(err.isNotFound).toBe(true);
    expect(err.isPermissionError).toBe(false);
  });

  test('isPermissionError returns true for EACCES', () => {
    const err = new FolderFsError('Denied', 'write', 'file.md', 'EACCES');
    expect(err.isPermissionError).toBe(true);
    expect(err.isNotFound).toBe(false);
  });

  test('isPermissionError returns true for EPERM', () => {
    const err = new FolderFsError('Denied', 'write', 'file.md', 'EPERM');
    expect(err.isPermissionError).toBe(true);
  });

  test('isFolderFsError type guard works', () => {
    const folderErr = new FolderFsError('Test', 'read', null, null);
    const genericErr = new Error('Test');

    expect(isFolderFsError(folderErr)).toBe(true);
    expect(isFolderFsError(genericErr)).toBe(false);
    expect(isFolderFsError(null)).toBe(false);
    expect(isFolderFsError(undefined)).toBe(false);
  });

  test('preserves cause chain', () => {
    const cause = new Error('Root cause');
    const err = new FolderFsError('Wrapper', 'read', 'file.md', 'ENOENT', cause);

    expect(err.cause).toBe(cause);
  });

  test('has correct name property', () => {
    const err = new FolderFsError('Test', 'list', null, null);
    expect(err.name).toBe('FolderFsError');
  });
});
