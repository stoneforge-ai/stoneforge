/**
 * Document Sync Adapter Utilities — Unit Tests
 *
 * Tests the shared field mapping logic for converting between
 * Stoneforge documents and external document representations.
 */

import { describe, expect, test } from 'bun:test';
import type {
  Document,
  ContentType,
  DocumentCategory,
  ElementId,
  EntityId,
  DocumentId,
} from '@stoneforge/core';
import { ElementType, createTimestamp } from '@stoneforge/core';
import type { ExternalDocument } from '@stoneforge/core';
import {
  documentToExternalDocumentInput,
  externalDocumentToDocumentUpdates,
  diffDocumentUpdates,
  computeExternalDocumentHash,
  SYSTEM_CATEGORIES,
  isSystemCategory,
  mapContentTypeToExternal,
  mapContentTypeFromExternal,
} from './document-sync-adapter.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a minimal Document object for testing.
 */
function createTestDocument(overrides: Partial<Document> = {}): Document {
  const now = createTimestamp();
  return {
    id: 'el-test01' as ElementId,
    type: ElementType.DOCUMENT,
    createdAt: now,
    updatedAt: now,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    title: 'Test Document',
    contentType: 'markdown' as ContentType,
    content: '# Hello World\n\nThis is a test document.',
    version: 1,
    previousVersionId: null,
    category: 'reference' as DocumentCategory,
    status: 'active' as const,
    immutable: false,
    ...overrides,
  } as Document;
}

/**
 * Creates a minimal ExternalDocument object for testing.
 */
function createTestExternalDocument(
  overrides: Partial<ExternalDocument> = {}
): ExternalDocument {
  return {
    externalId: 'page-42',
    url: 'https://notion.so/page-42',
    provider: 'notion',
    project: 'workspace-1',
    title: 'External Page',
    content: '# External Content\n\nFrom an external system.',
    contentType: 'markdown' as const,
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// SYSTEM_CATEGORIES
// ============================================================================

describe('SYSTEM_CATEGORIES', () => {
  test('contains task-description', () => {
    expect(SYSTEM_CATEGORIES.has('task-description')).toBe(true);
  });

  test('contains message-content', () => {
    expect(SYSTEM_CATEGORIES.has('message-content')).toBe(true);
  });

  test('does not contain user-facing categories', () => {
    expect(SYSTEM_CATEGORIES.has('reference' as DocumentCategory)).toBe(false);
    expect(SYSTEM_CATEGORIES.has('spec' as DocumentCategory)).toBe(false);
    expect(SYSTEM_CATEGORIES.has('how-to' as DocumentCategory)).toBe(false);
    expect(SYSTEM_CATEGORIES.has('other' as DocumentCategory)).toBe(false);
  });

  test('has exactly 2 system categories', () => {
    expect(SYSTEM_CATEGORIES.size).toBe(2);
  });
});

describe('isSystemCategory', () => {
  test('returns true for task-description', () => {
    expect(isSystemCategory('task-description')).toBe(true);
  });

  test('returns true for message-content', () => {
    expect(isSystemCategory('message-content')).toBe(true);
  });

  test('returns false for reference', () => {
    expect(isSystemCategory('reference')).toBe(false);
  });

  test('returns false for spec', () => {
    expect(isSystemCategory('spec')).toBe(false);
  });
});

// ============================================================================
// Content Type Mapping
// ============================================================================

describe('mapContentTypeToExternal', () => {
  test('maps markdown to markdown', () => {
    expect(mapContentTypeToExternal('markdown')).toBe('markdown');
  });

  test('maps text to text', () => {
    expect(mapContentTypeToExternal('text')).toBe('text');
  });

  test('maps json to text', () => {
    expect(mapContentTypeToExternal('json')).toBe('text');
  });
});

describe('mapContentTypeFromExternal', () => {
  test('maps markdown to markdown', () => {
    expect(mapContentTypeFromExternal('markdown')).toBe('markdown');
  });

  test('maps text to text', () => {
    expect(mapContentTypeFromExternal('text')).toBe('text');
  });

  test('maps html to text', () => {
    expect(mapContentTypeFromExternal('html')).toBe('text');
  });
});

// ============================================================================
// documentToExternalDocumentInput
// ============================================================================

describe('documentToExternalDocumentInput', () => {
  test('maps basic document fields correctly', () => {
    const doc = createTestDocument({
      title: 'API Reference',
      content: '# API\n\nEndpoints documentation.',
      contentType: 'markdown' as ContentType,
    });

    const result = documentToExternalDocumentInput(doc);

    expect(result.title).toBe('API Reference');
    expect(result.content).toBe('# API\n\nEndpoints documentation.');
    expect(result.contentType).toBe('markdown');
  });

  test('maps text content type correctly', () => {
    const doc = createTestDocument({
      contentType: 'text' as ContentType,
      content: 'Plain text content.',
    });

    const result = documentToExternalDocumentInput(doc);

    expect(result.contentType).toBe('text');
    expect(result.content).toBe('Plain text content.');
  });

  test('maps json content type to text', () => {
    const doc = createTestDocument({
      contentType: 'json' as ContentType,
      content: '{"key": "value"}',
    });

    const result = documentToExternalDocumentInput(doc);

    expect(result.contentType).toBe('text');
    expect(result.content).toBe('{"key": "value"}');
  });

  test('uses empty string for undefined title', () => {
    const doc = createTestDocument();
    // Remove the title
    delete (doc as any).title;

    const result = documentToExternalDocumentInput(doc);

    expect(result.title).toBe('');
  });

  test('handles empty content', () => {
    const doc = createTestDocument({ content: '' });

    const result = documentToExternalDocumentInput(doc);

    expect(result.content).toBe('');
  });

  test('preserves large content without truncation', () => {
    const largeContent = 'x'.repeat(100000);
    const doc = createTestDocument({ content: largeContent });

    const result = documentToExternalDocumentInput(doc);

    expect(result.content).toBe(largeContent);
    expect(result.content.length).toBe(100000);
  });
});

// ============================================================================
// externalDocumentToDocumentUpdates
// ============================================================================

describe('externalDocumentToDocumentUpdates', () => {
  test('returns all fields when no existing document (create mode)', () => {
    const externalDoc = createTestExternalDocument({
      title: 'New Page',
      content: 'New content here.',
      contentType: 'markdown',
    });

    const result = externalDocumentToDocumentUpdates(externalDoc);

    expect(result.title).toBe('New Page');
    expect(result.content).toBe('New content here.');
    expect(result.contentType).toBe('markdown');
  });

  test('returns only changed fields when existing document provided (diff mode)', () => {
    const externalDoc = createTestExternalDocument({
      title: 'Updated Title',
      content: '# Hello World\n\nThis is a test document.',
      contentType: 'markdown',
    });

    const existingDoc = createTestDocument({
      title: 'Test Document',
      content: '# Hello World\n\nThis is a test document.',
      contentType: 'markdown' as ContentType,
    });

    const result = externalDocumentToDocumentUpdates(externalDoc, existingDoc);

    // Only title changed
    expect(result.title).toBe('Updated Title');
    // Content and contentType are unchanged — should not be in diff
    expect(result.content).toBeUndefined();
    expect(result.contentType).toBeUndefined();
  });

  test('returns empty object when nothing changed', () => {
    const existingDoc = createTestDocument({
      title: 'Same Title',
      content: 'Same content.',
      contentType: 'text' as ContentType,
    });

    const externalDoc = createTestExternalDocument({
      title: 'Same Title',
      content: 'Same content.',
      contentType: 'text',
    });

    const result = externalDocumentToDocumentUpdates(externalDoc, existingDoc);

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('maps external html contentType to text', () => {
    const externalDoc = createTestExternalDocument({
      title: 'HTML Page',
      content: '<p>Hello</p>',
      contentType: 'html',
    });

    const result = externalDocumentToDocumentUpdates(externalDoc);

    expect(result.contentType).toBe('text');
    expect(result.content).toBe('<p>Hello</p>');
  });

  test('detects content change in diff mode', () => {
    const existingDoc = createTestDocument({
      title: 'Same Title',
      content: 'Old content.',
      contentType: 'text' as ContentType,
    });

    const externalDoc = createTestExternalDocument({
      title: 'Same Title',
      content: 'New content.',
      contentType: 'text',
    });

    const result = externalDocumentToDocumentUpdates(externalDoc, existingDoc);

    expect(result.content).toBe('New content.');
    expect(result.title).toBeUndefined();
  });

  test('detects content type change in diff mode', () => {
    const existingDoc = createTestDocument({
      title: 'Same Title',
      content: 'Some content.',
      contentType: 'text' as ContentType,
    });

    const externalDoc = createTestExternalDocument({
      title: 'Same Title',
      content: 'Some content.',
      contentType: 'markdown',
    });

    const result = externalDocumentToDocumentUpdates(externalDoc, existingDoc);

    expect(result.contentType).toBe('markdown');
    expect(result.title).toBeUndefined();
    expect(result.content).toBeUndefined();
  });

  test('detects multiple changes in diff mode', () => {
    const existingDoc = createTestDocument({
      title: 'Old Title',
      content: 'Old content.',
      contentType: 'text' as ContentType,
    });

    const externalDoc = createTestExternalDocument({
      title: 'New Title',
      content: 'New content.',
      contentType: 'markdown',
    });

    const result = externalDocumentToDocumentUpdates(externalDoc, existingDoc);

    expect(result.title).toBe('New Title');
    expect(result.content).toBe('New content.');
    expect(result.contentType).toBe('markdown');
  });
});

// ============================================================================
// diffDocumentUpdates
// ============================================================================

describe('diffDocumentUpdates', () => {
  test('returns empty object when no fields changed', () => {
    const existing = createTestDocument({
      title: 'My Doc',
      content: 'Content here.',
      contentType: 'markdown' as ContentType,
      category: 'reference' as DocumentCategory,
      tags: ['api', 'docs'],
    });

    const updates: Partial<Document> = {
      title: 'My Doc',
      content: 'Content here.',
      contentType: 'markdown' as ContentType,
      category: 'reference' as DocumentCategory,
      tags: ['api', 'docs'],
    };

    const result = diffDocumentUpdates(existing, updates);

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('detects title change', () => {
    const existing = createTestDocument({ title: 'Old Title' });
    const updates: Partial<Document> = { title: 'New Title' };

    const result = diffDocumentUpdates(existing, updates);

    expect(result.title).toBe('New Title');
  });

  test('detects content change', () => {
    const existing = createTestDocument({ content: 'Old content.' });
    const updates: Partial<Document> = { content: 'New content.' };

    const result = diffDocumentUpdates(existing, updates);

    expect(result.content).toBe('New content.');
  });

  test('detects contentType change', () => {
    const existing = createTestDocument({
      contentType: 'text' as ContentType,
    });
    const updates: Partial<Document> = {
      contentType: 'markdown' as ContentType,
    };

    const result = diffDocumentUpdates(existing, updates);

    expect(result.contentType).toBe('markdown');
  });

  test('detects category change', () => {
    const existing = createTestDocument({
      category: 'reference' as DocumentCategory,
    });
    const updates: Partial<Document> = {
      category: 'spec' as DocumentCategory,
    };

    const result = diffDocumentUpdates(existing, updates);

    expect(result.category).toBe('spec');
  });

  test('detects tags change', () => {
    const existing = createTestDocument({ tags: ['old-tag'] });
    const updates: Partial<Document> = { tags: ['new-tag'] };

    const result = diffDocumentUpdates(existing, updates);

    expect(result.tags).toEqual(['new-tag']);
  });

  test('ignores tags with same values in different order', () => {
    const existing = createTestDocument({ tags: ['b', 'a'] });
    const updates: Partial<Document> = { tags: ['a', 'b'] };

    const result = diffDocumentUpdates(existing, updates);

    // Same tags, different order — should not appear in diff
    expect(result.tags).toBeUndefined();
  });

  test('detects tags added', () => {
    const existing = createTestDocument({ tags: ['a'] });
    const updates: Partial<Document> = { tags: ['a', 'b'] };

    const result = diffDocumentUpdates(existing, updates);

    expect(result.tags).toEqual(['a', 'b']);
  });

  test('detects tags removed', () => {
    const existing = createTestDocument({ tags: ['a', 'b'] });
    const updates: Partial<Document> = { tags: ['a'] };

    const result = diffDocumentUpdates(existing, updates);

    expect(result.tags).toEqual(['a']);
  });

  test('skips undefined fields in updates', () => {
    const existing = createTestDocument({
      title: 'Title',
      content: 'Content.',
    });
    const updates: Partial<Document> = {};

    const result = diffDocumentUpdates(existing, updates);

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('handles all fields changed at once', () => {
    const existing = createTestDocument({
      title: 'Old',
      content: 'Old.',
      contentType: 'text' as ContentType,
      category: 'reference' as DocumentCategory,
      tags: ['old'],
    });

    const updates: Partial<Document> = {
      title: 'New',
      content: 'New.',
      contentType: 'markdown' as ContentType,
      category: 'spec' as DocumentCategory,
      tags: ['new'],
    };

    const result = diffDocumentUpdates(existing, updates);

    expect(result.title).toBe('New');
    expect(result.content).toBe('New.');
    expect(result.contentType).toBe('markdown');
    expect(result.category).toBe('spec');
    expect(result.tags).toEqual(['new']);
  });
});

// ============================================================================
// computeExternalDocumentHash
// ============================================================================

describe('computeExternalDocumentHash', () => {
  test('returns a hex string', () => {
    const doc = createTestExternalDocument();

    const hash = computeExternalDocumentHash(doc);

    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('is deterministic — same input produces same hash', () => {
    const doc = createTestExternalDocument();

    const hash1 = computeExternalDocumentHash(doc);
    const hash2 = computeExternalDocumentHash(doc);

    expect(hash1).toBe(hash2);
  });

  test('different title produces different hash', () => {
    const doc1 = createTestExternalDocument({ title: 'Title A' });
    const doc2 = createTestExternalDocument({ title: 'Title B' });

    const hash1 = computeExternalDocumentHash(doc1);
    const hash2 = computeExternalDocumentHash(doc2);

    expect(hash1).not.toBe(hash2);
  });

  test('different content produces different hash', () => {
    const doc1 = createTestExternalDocument({ content: 'Content A' });
    const doc2 = createTestExternalDocument({ content: 'Content B' });

    const hash1 = computeExternalDocumentHash(doc1);
    const hash2 = computeExternalDocumentHash(doc2);

    expect(hash1).not.toBe(hash2);
  });

  test('different contentType produces different hash', () => {
    const doc1 = createTestExternalDocument({ contentType: 'markdown' });
    const doc2 = createTestExternalDocument({ contentType: 'text' });

    const hash1 = computeExternalDocumentHash(doc1);
    const hash2 = computeExternalDocumentHash(doc2);

    expect(hash1).not.toBe(hash2);
  });

  test('ignores non-hashed fields (url, provider, etc.)', () => {
    const doc1 = createTestExternalDocument({
      url: 'https://example.com/1',
      provider: 'notion',
    });
    const doc2 = createTestExternalDocument({
      url: 'https://example.com/2',
      provider: 'obsidian',
    });

    const hash1 = computeExternalDocumentHash(doc1);
    const hash2 = computeExternalDocumentHash(doc2);

    expect(hash1).toBe(hash2);
  });

  test('handles empty title', () => {
    const doc = createTestExternalDocument({ title: '' });

    const hash = computeExternalDocumentHash(doc);

    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('handles empty content', () => {
    const doc = createTestExternalDocument({ content: '' });

    const hash = computeExternalDocumentHash(doc);

    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('avoids collisions from field concatenation', () => {
    // Without null byte separator, "titlecontent" and "titleconte" + "nt" would collide
    const doc1 = createTestExternalDocument({
      title: 'ab',
      content: 'cd',
    });
    const doc2 = createTestExternalDocument({
      title: 'abc',
      content: 'd',
    });

    const hash1 = computeExternalDocumentHash(doc1);
    const hash2 = computeExternalDocumentHash(doc2);

    expect(hash1).not.toBe(hash2);
  });
});
