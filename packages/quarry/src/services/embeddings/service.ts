/**
 * Embedding Service
 *
 * Manages document embeddings for semantic search.
 * Handles indexing, removal, and similarity search using a configurable provider.
 */

import type { StorageBackend } from '@stoneforge/storage';
import type { EmbeddingProvider, EmbeddingServiceConfig, SemanticSearchResult, StoredEmbedding } from './types.js';
import { reciprocalRankFusion, type RankedResult } from './fusion.js';

/**
 * Cosine similarity between two vectors.
 * Assumes both are unit-normalized for efficiency.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Service for managing document embeddings and performing semantic search.
 */
export class EmbeddingService {
  private provider: EmbeddingProvider;
  private backend: StorageBackend;
  private batchSize: number;

  constructor(backend: StorageBackend, config: EmbeddingServiceConfig) {
    this.backend = backend;
    this.provider = config.provider;
    this.batchSize = config.batchSize ?? 32;
  }

  /**
   * Check if the embedding service is available.
   */
  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  /**
   * Get provider info.
   */
  getProviderInfo(): { name: string; dimensions: number; isLocal: boolean } {
    return {
      name: this.provider.name,
      dimensions: this.provider.dimensions,
      isLocal: this.provider.isLocal,
    };
  }

  /**
   * Generate and store an embedding for a document.
   *
   * @param docId - Document ID
   * @param content - Document content to embed (typically title + content)
   */
  async indexDocument(docId: string, content: string): Promise<void> {
    const embedding = await this.provider.embed(content);
    const blob = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);

    this.backend.run(
      `INSERT OR REPLACE INTO document_embeddings (document_id, embedding, dimensions, provider, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        docId,
        blob,
        this.provider.dimensions,
        this.provider.name,
        this.provider.name,
        new Date().toISOString(),
      ]
    );
  }

  /**
   * Remove the embedding for a document.
   */
  removeDocument(docId: string): void {
    this.backend.run(
      `DELETE FROM document_embeddings WHERE document_id = ?`,
      [docId]
    );
  }

  /**
   * Perform semantic search using cosine similarity.
   * Uses brute-force comparison (no ANN index yet).
   *
   * @param query - Search query text
   * @param limit - Maximum results to return
   * @returns Ranked results by similarity (descending)
   */
  async searchSemantic(query: string, limit: number = 20): Promise<SemanticSearchResult[]> {
    const queryEmbedding = await this.provider.embed(query);

    // Load all embeddings (brute-force for now)
    const rows = this.backend.query<{
      document_id: string;
      embedding: Buffer;
      dimensions: number;
    }>('SELECT document_id, embedding, dimensions FROM document_embeddings');

    const results: SemanticSearchResult[] = [];

    for (const row of rows) {
      const stored = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.dimensions
      );
      const similarity = cosineSimilarity(queryEmbedding, stored);
      results.push({ documentId: row.document_id, similarity });
    }

    // Sort by similarity descending and return top results
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Hybrid search combining FTS5 results with semantic results via RRF.
   *
   * @param query - Search query text
   * @param ftsDocIds - Document IDs from FTS5 search (in rank order)
   * @param limit - Maximum results to return
   * @param k - RRF smoothing constant (default: 60)
   * @returns Fused document IDs ranked by combined score
   */
  async searchHybrid(
    query: string,
    ftsDocIds: string[],
    limit: number = 20,
    k: number = 60
  ): Promise<{ documentId: string; score: number }[]> {
    // Get semantic results
    const semanticResults = await this.searchSemantic(query, limit * 2);

    // Build ranked result sets
    const ftsRanking: RankedResult[] = ftsDocIds.map((documentId, index) => ({
      documentId,
      rank: index + 1,
    }));

    const semanticRanking: RankedResult[] = semanticResults.map((result, index) => ({
      documentId: result.documentId,
      rank: index + 1,
    }));

    return reciprocalRankFusion([ftsRanking, semanticRanking], k, limit);
  }

  /**
   * Re-embed all documents. Used for bulk reindexing.
   *
   * @param documents - Array of { id, content } to embed
   * @param onProgress - Optional callback for progress reporting
   */
  async reindexAll(
    documents: Array<{ id: string; content: string }>,
    onProgress?: (indexed: number, total: number) => void
  ): Promise<{ indexed: number; errors: number }> {
    let indexed = 0;
    let errors = 0;

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const texts = batch.map((d) => d.content);

      try {
        const embeddings = await this.provider.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          const blob = Buffer.from(
            embeddings[j].buffer,
            embeddings[j].byteOffset,
            embeddings[j].byteLength
          );

          this.backend.run(
            `INSERT OR REPLACE INTO document_embeddings (document_id, embedding, dimensions, provider, model, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              batch[j].id,
              blob,
              this.provider.dimensions,
              this.provider.name,
              this.provider.name,
              new Date().toISOString(),
            ]
          );
          indexed++;
        }
      } catch {
        errors += batch.length;
      }

      onProgress?.(indexed + errors, documents.length);
    }

    return { indexed, errors };
  }
}
