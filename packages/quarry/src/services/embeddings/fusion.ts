/**
 * Reciprocal Rank Fusion (RRF)
 *
 * Combines multiple ranked result sets into a single fused ranking.
 * Used to merge FTS5 (keyword) and vector (semantic) search results.
 *
 * Algorithm: score(d) = Σ 1/(k + rank_i(d)) for each ranking i
 * where k is a smoothing constant (default: 60)
 */

/**
 * A ranked result set identified by document ID.
 */
export interface RankedResult {
  documentId: string;
  rank: number;
}

/**
 * Fused result with combined RRF score.
 */
export interface FusedResult {
  documentId: string;
  score: number;
}

/**
 * Combine multiple ranked result sets using Reciprocal Rank Fusion.
 *
 * @param rankings - Array of ranked result sets (each sorted by relevance)
 * @param k - Smoothing constant (default: 60, standard value from literature)
 * @param limit - Maximum results to return
 * @returns Fused results sorted by combined score (descending)
 */
export function reciprocalRankFusion(
  rankings: RankedResult[][],
  k: number = 60,
  limit?: number
): FusedResult[] {
  // Accumulate RRF scores per document
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    for (const result of ranking) {
      const rrfScore = 1 / (k + result.rank);
      const current = scores.get(result.documentId) ?? 0;
      scores.set(result.documentId, current + rrfScore);
    }
  }

  // Sort by score descending
  const fused: FusedResult[] = Array.from(scores.entries())
    .map(([documentId, score]) => ({ documentId, score }))
    .sort((a, b) => b.score - a.score);

  return limit ? fused.slice(0, limit) : fused;
}
