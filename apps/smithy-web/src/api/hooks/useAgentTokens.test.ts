import { describe, expect, test } from 'bun:test';
import { formatTokenCount } from './useAgentTokens';

describe('formatTokenCount', () => {
  test('formats small numbers as-is', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(999)).toBe('999');
  });

  test('formats thousands with k suffix', () => {
    expect(formatTokenCount(1000)).toBe('1.0k');
    expect(formatTokenCount(1200)).toBe('1.2k');
    expect(formatTokenCount(5200)).toBe('5.2k');
    expect(formatTokenCount(9999)).toBe('10.0k');
  });

  test('formats tens of thousands without decimal', () => {
    expect(formatTokenCount(10000)).toBe('10k');
    expect(formatTokenCount(15000)).toBe('15k');
    expect(formatTokenCount(99999)).toBe('100k');
  });

  test('formats hundreds of thousands', () => {
    expect(formatTokenCount(100000)).toBe('100k');
    expect(formatTokenCount(500000)).toBe('500k');
  });

  test('formats millions with M suffix', () => {
    expect(formatTokenCount(1000000)).toBe('1.0M');
    expect(formatTokenCount(1500000)).toBe('1.5M');
    expect(formatTokenCount(10000000)).toBe('10M');
  });
});
