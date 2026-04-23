import { describe, test, expect } from 'bun:test';
import { LocalEmbeddingProvider } from './local-provider.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TEST_MODEL_DIR = join(import.meta.dir, '__test_model_dir__');

describe('LocalEmbeddingProvider', () => {

  test('same text produces same embedding (deterministic)', async () => {
    // Create temp model dir so isAvailable returns true
    mkdirSync(TEST_MODEL_DIR, { recursive: true });
    try {
      const provider = new LocalEmbeddingProvider(TEST_MODEL_DIR);
      const a = await provider.embed('test content');
      const b = await provider.embed('test content');
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i++) {
        expect(a[i]).toBe(b[i]);
      }
    } finally {
      rmSync(TEST_MODEL_DIR, { recursive: true });
    }
  });

  test('embeddings are normalized (unit length ≈ 1.0)', async () => {
    mkdirSync(TEST_MODEL_DIR, { recursive: true });
    try {
      const provider = new LocalEmbeddingProvider(TEST_MODEL_DIR);
      const embedding = await provider.embed('normalize me');
      let norm = 0;
      for (let i = 0; i < embedding.length; i++) {
        norm += embedding[i] * embedding[i];
      }
      norm = Math.sqrt(norm);
      expect(norm).toBeCloseTo(1.0, 3);
    } finally {
      rmSync(TEST_MODEL_DIR, { recursive: true });
    }
  });

  test('embeddings have correct dimensions (768)', async () => {
    mkdirSync(TEST_MODEL_DIR, { recursive: true });
    try {
      const provider = new LocalEmbeddingProvider(TEST_MODEL_DIR);
      const embedding = await provider.embed('dimension check');
      expect(embedding.length).toBe(768);
    } finally {
      rmSync(TEST_MODEL_DIR, { recursive: true });
    }
  });

  test('embedBatch consistent with individual embed calls', async () => {
    mkdirSync(TEST_MODEL_DIR, { recursive: true });
    try {
      const provider = new LocalEmbeddingProvider(TEST_MODEL_DIR);
      const texts = ['hello', 'world', 'test'];
      const batch = await provider.embedBatch(texts);
      for (let t = 0; t < texts.length; t++) {
        const individual = await provider.embed(texts[t]);
        expect(batch[t].length).toBe(individual.length);
        for (let i = 0; i < individual.length; i++) {
          expect(batch[t][i]).toBe(individual[i]);
        }
      }
    } finally {
      rmSync(TEST_MODEL_DIR, { recursive: true });
    }
  });

  test('isAvailable returns false for nonexistent model directory', async () => {
    const provider = new LocalEmbeddingProvider('/nonexistent/path/model');
    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });

  test('isAvailable returns true when directory exists', async () => {
    mkdirSync(TEST_MODEL_DIR, { recursive: true });
    try {
      const provider = new LocalEmbeddingProvider(TEST_MODEL_DIR);
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    } finally {
      rmSync(TEST_MODEL_DIR, { recursive: true });
    }
  });
});
