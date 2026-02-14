/**
 * Local Embedding Provider
 *
 * Uses a local ONNX-based model for embedding generation.
 * Model is downloaded on first use via `sf embeddings install`.
 *
 * Default model: bge-base-en-v1.5 (768 dimensions)
 *
 * This is a placeholder implementation. The actual ONNX runtime integration
 * will be added when the model download infrastructure is in place.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { EmbeddingProvider } from './types.js';

/** Default model directory relative to workspace root */
const DEFAULT_MODEL_DIR = '.stoneforge/models';
const DEFAULT_MODEL_NAME = 'bge-base-en-v1.5';
const DEFAULT_DIMENSIONS = 768;

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local-bge-base';
  readonly dimensions = DEFAULT_DIMENSIONS;
  readonly isLocal = true;

  private modelDir: string;
  private initialized = false;

  constructor(modelDir?: string) {
    this.modelDir = modelDir ?? join(process.cwd(), DEFAULT_MODEL_DIR, DEFAULT_MODEL_NAME);
  }

  async embed(text: string): Promise<Float32Array> {
    await this.ensureInitialized();
    // Placeholder: generate a deterministic pseudo-embedding from text hash
    // Real implementation will use ONNX runtime
    return this.pseudoEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    await this.ensureInitialized();
    return texts.map((text) => this.pseudoEmbed(text));
  }

  async isAvailable(): Promise<boolean> {
    return existsSync(this.modelDir);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        `Local embedding model not installed. Run 'sf embeddings install' to download the model.`
      );
    }

    // TODO: Initialize ONNX runtime session
    this.initialized = true;
  }

  /**
   * Generate a deterministic pseudo-embedding from text content.
   * This is a placeholder until ONNX runtime integration is complete.
   * Uses a simple hash-based approach to produce consistent vectors.
   */
  private pseudoEmbed(text: string): Float32Array {
    const embedding = new Float32Array(this.dimensions);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < this.dimensions; i++) {
      // Use simple PRNG seeded from hash
      hash = (hash * 1103515245 + 12345) & 0x7fffffff;
      embedding[i] = (hash / 0x7fffffff) * 2 - 1;
    }
    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        embedding[i] /= norm;
      }
    }
    return embedding;
  }
}
