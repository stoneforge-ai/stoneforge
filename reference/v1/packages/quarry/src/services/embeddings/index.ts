/**
 * Embeddings Module
 *
 * Public API for document embedding services: semantic search,
 * hybrid search (RRF fusion), and local embedding providers.
 */

export { EmbeddingService } from './service.js';
export { LocalEmbeddingProvider } from './local-provider.js';
export { reciprocalRankFusion } from './fusion.js';
export type { RankedResult, FusedResult } from './fusion.js';
export type {
  EmbeddingProvider,
  StoredEmbedding,
  SemanticSearchResult,
  EmbeddingServiceConfig,
} from './types.js';
