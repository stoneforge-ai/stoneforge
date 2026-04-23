/**
 * Embedding Provider Types
 *
 * Defines the interface for embedding providers used in semantic search.
 * Providers generate vector representations of text for similarity matching.
 */

/**
 * An embedding provider generates vector representations of text.
 *
 * Implementations can use local models (ONNX) or remote APIs (OpenAI, Voyage).
 */
export interface EmbeddingProvider {
  /** Human-readable provider name */
  readonly name: string;
  /** Dimensionality of output vectors */
  readonly dimensions: number;
  /** Whether the provider runs locally (no network required) */
  readonly isLocal: boolean;

  /**
   * Generate an embedding for a single text.
   *
   * @param text - Input text to embed
   * @returns Float32Array of embedding values
   */
  embed(text: string): Promise<Float32Array>;

  /**
   * Generate embeddings for multiple texts in a single batch.
   *
   * @param texts - Array of input texts to embed
   * @returns Array of Float32Array embeddings (same order as input)
   */
  embedBatch(texts: string[]): Promise<Float32Array[]>;

  /**
   * Check if the provider is available and ready to use.
   *
   * For local providers, this checks if the model is installed.
   * For remote providers, this checks if API keys are configured.
   *
   * @returns True if the provider can generate embeddings
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Stored embedding record from the database.
 */
export interface StoredEmbedding {
  documentId: string;
  embedding: Float32Array;
  dimensions: number;
  provider: string;
  model: string;
  createdAt: string;
}

/**
 * A semantic search result with similarity score.
 */
export interface SemanticSearchResult {
  documentId: string;
  similarity: number;
}

/**
 * Configuration for the embedding service.
 */
export interface EmbeddingServiceConfig {
  /** The embedding provider to use */
  provider: EmbeddingProvider;
  /** Batch size for bulk operations. Default: 32 */
  batchSize?: number;
}
