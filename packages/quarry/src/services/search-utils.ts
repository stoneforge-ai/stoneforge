/**
 * Search Utilities
 *
 * Provides adaptive top-K result filtering and FTS5 query sanitization
 * for the document full-text search system.
 */

// ============================================================================
// Types
// ============================================================================

export interface ScoredResult<T> {
  item: T;
  score: number;
}

export interface AdaptiveTopKConfig {
  /** Sensitivity for elbow detection (higher = more aggressive cutoff). Default: 1.5 */
  sensitivity?: number;
  /** Minimum number of results to return regardless of elbow. Default: 1 */
  minResults?: number;
  /** Hard cap on maximum results. Default: 50 */
  maxResults?: number;
}

// ============================================================================
// Adaptive Top-K
// ============================================================================

/**
 * Apply adaptive top-K filtering using elbow detection on score distribution.
 *
 * Analyzes gaps between consecutive BM25 scores to find a natural cutoff point
 * where result quality drops significantly. Returns results up to that cutoff.
 *
 * Algorithm:
 * 1. Compute gaps between consecutive scores (already sorted descending by BM25)
 * 2. Calculate mean and stddev of gaps
 * 3. Find first gap exceeding mean + (sensitivity * stddev)
 * 4. Return results up to that cutoff
 *
 * @param results - Scored results sorted by score descending
 * @param config - Configuration for elbow detection
 * @returns Filtered results with natural cutoff applied
 */
export function applyAdaptiveTopK<T>(
  results: ScoredResult<T>[],
  config: AdaptiveTopKConfig = {}
): ScoredResult<T>[] {
  const {
    sensitivity = 1.5,
    minResults = 1,
    maxResults = 50,
  } = config;

  if (results.length === 0) return [];

  // Apply hard cap first
  const capped = results.slice(0, maxResults);

  // Need at least 3 results to detect an elbow
  if (capped.length <= 2) return capped;

  // Compute gaps between consecutive scores
  const gaps: number[] = [];
  for (let i = 0; i < capped.length - 1; i++) {
    gaps.push(capped[i].score - capped[i + 1].score);
  }

  // Calculate mean and standard deviation of gaps
  const mean = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  const variance = gaps.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gaps.length;
  const stddev = Math.sqrt(variance);

  // Find the elbow: first gap exceeding mean + sensitivity * stddev
  const threshold = mean + sensitivity * stddev;
  let cutoffIndex = capped.length; // Default: keep all

  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] > threshold) {
      cutoffIndex = i + 1; // Include the result before the gap
      break;
    }
  }

  // Ensure minimum results
  cutoffIndex = Math.max(cutoffIndex, Math.min(minResults, capped.length));

  return capped.slice(0, cutoffIndex);
}

// ============================================================================
// FTS5 Query Sanitization
// ============================================================================

/**
 * Escape user input for safe use in FTS5 MATCH queries.
 *
 * FTS5 has special syntax characters that can cause query parse errors.
 * This function wraps each token in quotes to prevent interpretation
 * as FTS5 operators.
 *
 * @param input - Raw user search query
 * @returns Sanitized query safe for FTS5 MATCH
 */
export function escapeFts5Query(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return '';

  // Split into tokens and wrap each in double quotes to escape operators
  // Remove any existing quotes from user input to prevent injection
  const sanitized = trimmed.replace(/"/g, '');
  if (sanitized.length === 0) return '';

  // Wrap each word in quotes to prevent FTS5 operator interpretation
  const tokens = sanitized.split(/\s+/).filter(Boolean);
  return tokens.map((token) => `"${token}"`).join(' ');
}
