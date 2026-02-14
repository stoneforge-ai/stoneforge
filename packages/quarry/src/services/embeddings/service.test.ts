import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { EmbeddingService } from './service.js';
import type { EmbeddingProvider, EmbeddingServiceConfig } from './types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';

/**
 * Mock 4-dimensional embedding provider for testing.
 * Produces deterministic, normalized embeddings from text hash.
 */
class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock-4d';
  readonly dimensions = 4;
  readonly isLocal = true;

  async embed(text: string): Promise<Float32Array> {
    const arr = new Float32Array(4);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < 4; i++) {
      hash = (hash * 1103515245 + 12345) & 0x7fffffff;
      arr[i] = (hash / 0x7fffffff) * 2 - 1;
    }
    // Normalize
    let norm = 0;
    for (let i = 0; i < 4; i++) norm += arr[i] * arr[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < 4; i++) arr[i] /= norm;
    return arr;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

describe('EmbeddingService', () => {
  let backend: StorageBackend;
  let service: EmbeddingService;
  let provider: MockEmbeddingProvider;

  beforeEach(() => {
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);

    // Disable FK enforcement for unit tests — the production table has a
    // FK to elements(id), but these tests exercise the embedding service
    // in isolation without creating parent element rows.
    backend.run('PRAGMA foreign_keys = OFF', []);

    // Ensure document_embeddings table exists (migration 8 may not be in the
    // built dist yet).
    backend.run(`
      CREATE TABLE IF NOT EXISTS document_embeddings (
        document_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `, []);

    provider = new MockEmbeddingProvider();
    service = new EmbeddingService(backend, { provider });
  });

  afterEach(() => {
    if (backend.isOpen) backend.close();
  });

  test('indexDocument stores embedding', async () => {
    await service.indexDocument('doc-1', 'hello world');
    const row = backend.queryOne<{ document_id: string }>('SELECT document_id FROM document_embeddings WHERE document_id = ?', ['doc-1']);
    expect(row).toBeDefined();
    expect(row!.document_id).toBe('doc-1');
  });

  test('removeDocument deletes embedding', async () => {
    await service.indexDocument('doc-1', 'hello world');
    service.removeDocument('doc-1');
    const row = backend.queryOne<{ document_id: string }>('SELECT document_id FROM document_embeddings WHERE document_id = ?', ['doc-1']);
    expect(row).toBeNull();
  });

  test('searchSemantic returns results sorted by similarity', async () => {
    await service.indexDocument('doc-1', 'hello world');
    await service.indexDocument('doc-2', 'goodbye world');
    await service.indexDocument('doc-3', 'hello world again');

    const results = await service.searchSemantic('hello world');
    expect(results.length).toBe(3);
    // Results should be sorted by similarity descending
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
    }
    // Exact match should be first
    expect(results[0].documentId).toBe('doc-1');
  });

  test('searchHybrid combines FTS + vector results', async () => {
    await service.indexDocument('doc-1', 'alpha content');
    await service.indexDocument('doc-2', 'beta content');
    await service.indexDocument('doc-3', 'gamma content');

    const ftsDocIds = ['doc-2', 'doc-1'];
    const results = await service.searchHybrid('alpha content', ftsDocIds);
    expect(results.length).toBeGreaterThan(0);
    // All docs should appear
    const ids = results.map(r => r.documentId);
    expect(ids).toContain('doc-1');
    expect(ids).toContain('doc-2');
  });

  test('reindexAll processes all documents with progress callback', async () => {
    const docs = [
      { id: 'doc-1', content: 'first document' },
      { id: 'doc-2', content: 'second document' },
      { id: 'doc-3', content: 'third document' },
    ];

    const progressCalls: Array<[number, number]> = [];
    const result = await service.reindexAll(docs, (indexed, total) => {
      progressCalls.push([indexed, total]);
    });

    expect(result.indexed).toBe(3);
    expect(result.errors).toBe(0);
    expect(progressCalls.length).toBeGreaterThan(0);

    // Verify all docs were indexed
    const rows = backend.query<{ document_id: string }>('SELECT document_id FROM document_embeddings');
    expect(rows.length).toBe(3);
  });

  test('isAvailable delegates to provider', async () => {
    const available = await service.isAvailable();
    expect(available).toBe(true);
  });

  test('getProviderInfo returns provider details', () => {
    const info = service.getProviderInfo();
    expect(info.name).toBe('mock-4d');
    expect(info.dimensions).toBe(4);
    expect(info.isLocal).toBe(true);
  });
});
