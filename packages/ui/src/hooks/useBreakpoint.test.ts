/**
 * Tests for useBreakpoint hooks
 */

import { describe, it, expect } from 'bun:test';
import {
  BREAKPOINTS,
  type Breakpoint,
  useBreakpoint,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useCurrentBreakpoint,
  useMediaQuery,
  useResponsiveValue,
  useWindowSize,
} from './useBreakpoint';

describe('BREAKPOINTS constant', () => {
  it('defines standard Tailwind breakpoints', () => {
    expect(BREAKPOINTS.sm).toBe(640);
    expect(BREAKPOINTS.md).toBe(768);
    expect(BREAKPOINTS.lg).toBe(1024);
    expect(BREAKPOINTS.xl).toBe(1280);
    expect(BREAKPOINTS['2xl']).toBe(1536);
  });

  it('has correct number of breakpoints', () => {
    expect(Object.keys(BREAKPOINTS).length).toBe(5);
  });
});

describe('Breakpoint type', () => {
  it('allows valid breakpoint names', () => {
    const validBreakpoints: Breakpoint[] = ['sm', 'md', 'lg', 'xl', '2xl'];
    expect(validBreakpoints.length).toBe(5);
  });
});

describe('Hook exports', () => {
  it('exports useBreakpoint', () => {
    expect(useBreakpoint).toBeDefined();
    expect(typeof useBreakpoint).toBe('function');
  });

  it('exports useIsMobile', () => {
    expect(useIsMobile).toBeDefined();
    expect(typeof useIsMobile).toBe('function');
  });

  it('exports useIsTablet', () => {
    expect(useIsTablet).toBeDefined();
    expect(typeof useIsTablet).toBe('function');
  });

  it('exports useIsDesktop', () => {
    expect(useIsDesktop).toBeDefined();
    expect(typeof useIsDesktop).toBe('function');
  });

  it('exports useCurrentBreakpoint', () => {
    expect(useCurrentBreakpoint).toBeDefined();
    expect(typeof useCurrentBreakpoint).toBe('function');
  });

  it('exports useMediaQuery', () => {
    expect(useMediaQuery).toBeDefined();
    expect(typeof useMediaQuery).toBe('function');
  });

  it('exports useResponsiveValue', () => {
    expect(useResponsiveValue).toBeDefined();
    expect(typeof useResponsiveValue).toBe('function');
  });

  it('exports useWindowSize', () => {
    expect(useWindowSize).toBeDefined();
    expect(typeof useWindowSize).toBe('function');
  });
});

describe('Breakpoint calculations', () => {
  it('mobile breakpoint is at 768px', () => {
    expect(BREAKPOINTS.md).toBe(768);
  });

  it('tablet ends at 1024px', () => {
    expect(BREAKPOINTS.lg).toBe(1024);
  });

  it('breakpoints are in ascending order', () => {
    expect(BREAKPOINTS.sm).toBeLessThan(BREAKPOINTS.md);
    expect(BREAKPOINTS.md).toBeLessThan(BREAKPOINTS.lg);
    expect(BREAKPOINTS.lg).toBeLessThan(BREAKPOINTS.xl);
    expect(BREAKPOINTS.xl).toBeLessThan(BREAKPOINTS['2xl']);
  });
});
