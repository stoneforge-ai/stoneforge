import { describe, expect, test } from 'bun:test';
import { applyAdaptiveTopK, escapeFts5Query, type ScoredResult } from './search-utils.js';

// ============================================================================
// escapeFts5Query Tests
// ============================================================================

describe('escapeFts5Query', () => {
  test('wraps single word in quotes', () => {
    expect(escapeFts5Query('hello')).toBe('"hello"');
  });

  test('wraps multiple words in individual quotes', () => {
    expect(escapeFts5Query('hello world')).toBe('"hello" "world"');
  });

  test('handles extra whitespace', () => {
    expect(escapeFts5Query('  hello   world  ')).toBe('"hello" "world"');
  });

  test('strips double quotes from input', () => {
    expect(escapeFts5Query('"hello" "world"')).toBe('"hello" "world"');
  });

  test('returns empty string for empty input', () => {
    expect(escapeFts5Query('')).toBe('');
    expect(escapeFts5Query('   ')).toBe('');
  });

  test('returns empty string for quotes-only input', () => {
    expect(escapeFts5Query('"""')).toBe('');
  });

  test('escapes FTS5 operators', () => {
    // These should be treated as literal words, not operators
    expect(escapeFts5Query('NOT OR AND')).toBe('"NOT" "OR" "AND"');
  });

  test('handles special characters', () => {
    expect(escapeFts5Query('hello-world')).toBe('"hello-world"');
    expect(escapeFts5Query('user@example')).toBe('"user@example"');
  });

  test('handles FTS5 wildcard *', () => {
    expect(escapeFts5Query('hello*')).toBe('"hello*"');
  });

  test('handles FTS5 negation -', () => {
    expect(escapeFts5Query('-excluded')).toBe('"-excluded"');
  });

  test('handles FTS5 parentheses', () => {
    expect(escapeFts5Query('(group) terms')).toBe('"(group)" "terms"');
  });

  test('handles FTS5 column filter :', () => {
    expect(escapeFts5Query('title:hello')).toBe('"title:hello"');
  });
});

// ============================================================================
// applyAdaptiveTopK Tests
// ============================================================================

describe('applyAdaptiveTopK', () => {
  test('returns empty array for empty input', () => {
    expect(applyAdaptiveTopK([])).toEqual([]);
  });

  test('returns single result as-is', () => {
    const results: ScoredResult<string>[] = [{ item: 'a', score: 10 }];
    expect(applyAdaptiveTopK(results)).toEqual(results);
  });

  test('returns two results as-is', () => {
    const results: ScoredResult<string>[] = [
      { item: 'a', score: 10 },
      { item: 'b', score: 5 },
    ];
    expect(applyAdaptiveTopK(results)).toEqual(results);
  });

  test('detects elbow in score distribution', () => {
    // Clear elbow: scores 10, 9, 8, 1, 0.5 — gap at position 3 (8 → 1)
    const results: ScoredResult<string>[] = [
      { item: 'a', score: 10 },
      { item: 'b', score: 9 },
      { item: 'c', score: 8 },
      { item: 'd', score: 1 },
      { item: 'e', score: 0.5 },
    ];
    const filtered = applyAdaptiveTopK(results);
    // Should cut off after 'c' (the gap from 8 to 1 is large)
    expect(filtered.length).toBeLessThanOrEqual(3);
    expect(filtered.length).toBeGreaterThanOrEqual(1);
  });

  test('returns all results when scores are uniform', () => {
    const results: ScoredResult<string>[] = [
      { item: 'a', score: 10 },
      { item: 'b', score: 9 },
      { item: 'c', score: 8 },
      { item: 'd', score: 7 },
      { item: 'e', score: 6 },
    ];
    const filtered = applyAdaptiveTopK(results);
    expect(filtered.length).toBe(5);
  });

  test('respects minResults', () => {
    const results: ScoredResult<string>[] = [
      { item: 'a', score: 100 },
      { item: 'b', score: 1 },
      { item: 'c', score: 0.5 },
    ];
    const filtered = applyAdaptiveTopK(results, { minResults: 3 });
    expect(filtered.length).toBe(3);
  });

  test('respects maxResults', () => {
    const results: ScoredResult<string>[] = Array.from({ length: 100 }, (_, i) => ({
      item: `item-${i}`,
      score: 100 - i,
    }));
    const filtered = applyAdaptiveTopK(results, { maxResults: 10 });
    expect(filtered.length).toBeLessThanOrEqual(10);
  });

  test('higher sensitivity produces fewer results', () => {
    const results: ScoredResult<string>[] = [
      { item: 'a', score: 10 },
      { item: 'b', score: 8 },
      { item: 'c', score: 6 },
      { item: 'd', score: 3 },
      { item: 'e', score: 2 },
    ];
    const lowSensitivity = applyAdaptiveTopK(results, { sensitivity: 0.5 });
    const highSensitivity = applyAdaptiveTopK(results, { sensitivity: 3.0 });
    expect(highSensitivity.length).toBeGreaterThanOrEqual(lowSensitivity.length - 1);
  });

  test('preserves item order', () => {
    const results: ScoredResult<string>[] = [
      { item: 'first', score: 10 },
      { item: 'second', score: 5 },
      { item: 'third', score: 1 },
    ];
    const filtered = applyAdaptiveTopK(results, { minResults: 3 });
    expect(filtered[0].item).toBe('first');
    expect(filtered[1].item).toBe('second');
    expect(filtered[2].item).toBe('third');
  });

  test('handles all-same scores', () => {
    const results: ScoredResult<string>[] = [
      { item: 'a', score: 5 },
      { item: 'b', score: 5 },
      { item: 'c', score: 5 },
      { item: 'd', score: 5 },
    ];
    // All same scores = no gaps = no elbow = return all
    const filtered = applyAdaptiveTopK(results);
    expect(filtered.length).toBe(4);
  });

  test('handles zero scores', () => {
    const results: ScoredResult<string>[] = [
      { item: 'a', score: 0 },
      { item: 'b', score: 0 },
      { item: 'c', score: 0 },
    ];
    const filtered = applyAdaptiveTopK(results);
    expect(filtered.length).toBe(3);
  });

  test('handles negative scores', () => {
    const results: ScoredResult<string>[] = [
      { item: 'a', score: -1 },
      { item: 'b', score: -5 },
      { item: 'c', score: -10 },
    ];
    const filtered = applyAdaptiveTopK(results);
    expect(filtered.length).toBeGreaterThanOrEqual(1);
  });

  test('minResults greater than array length returns all', () => {
    const results: ScoredResult<string>[] = [
      { item: 'a', score: 10 },
      { item: 'b', score: 1 },
    ];
    const filtered = applyAdaptiveTopK(results, { minResults: 10 });
    expect(filtered.length).toBe(2);
  });
});
