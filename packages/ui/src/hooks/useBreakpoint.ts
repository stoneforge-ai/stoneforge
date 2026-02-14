/**
 * useBreakpoint - Responsive breakpoint hooks
 *
 * Provides hooks for responsive design based on window width.
 * Uses the standard Tailwind CSS breakpoints:
 * - sm: 640px
 * - md: 768px (mobile/tablet boundary)
 * - lg: 1024px (tablet/desktop boundary)
 * - xl: 1280px
 * - 2xl: 1536px
 */

import { useState, useEffect, useMemo } from 'react';

// Standard Tailwind breakpoints
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Returns true when window width is below the specified breakpoint
 */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const [isBelow, setIsBelow] = useState(false);

  useEffect(() => {
    const checkBreakpoint = () => {
      setIsBelow(window.innerWidth < BREAKPOINTS[breakpoint]);
    };

    // Check immediately
    checkBreakpoint();

    window.addEventListener('resize', checkBreakpoint);
    return () => window.removeEventListener('resize', checkBreakpoint);
  }, [breakpoint]);

  return isBelow;
}

/**
 * Returns true when window width is below 768px (md breakpoint)
 * Mobile-first: use for showing/hiding mobile-specific UI
 */
export function useIsMobile(): boolean {
  return useBreakpoint('md');
}

/**
 * Returns true when window width is between 768px and 1024px
 * Tablet range: use for tablet-specific layouts
 */
export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const checkTablet = () => {
      const width = window.innerWidth;
      setIsTablet(width >= BREAKPOINTS.md && width < BREAKPOINTS.lg);
    };

    checkTablet();
    window.addEventListener('resize', checkTablet);
    return () => window.removeEventListener('resize', checkTablet);
  }, []);

  return isTablet;
}

/**
 * Returns true when window width is 1024px or above
 * Desktop: use for desktop-specific features
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= BREAKPOINTS.lg);
    };

    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  return isDesktop;
}

/**
 * Returns the current breakpoint name based on window width
 */
export function useCurrentBreakpoint(): Breakpoint | 'xs' {
  const [breakpoint, setBreakpoint] = useState<Breakpoint | 'xs'>('xs');

  useEffect(() => {
    const getBreakpoint = (): Breakpoint | 'xs' => {
      const width = window.innerWidth;
      if (width >= BREAKPOINTS['2xl']) return '2xl';
      if (width >= BREAKPOINTS.xl) return 'xl';
      if (width >= BREAKPOINTS.lg) return 'lg';
      if (width >= BREAKPOINTS.md) return 'md';
      if (width >= BREAKPOINTS.sm) return 'sm';
      return 'xs';
    };

    const updateBreakpoint = () => {
      setBreakpoint(getBreakpoint());
    };

    updateBreakpoint();
    window.addEventListener('resize', updateBreakpoint);
    return () => window.removeEventListener('resize', updateBreakpoint);
  }, []);

  return breakpoint;
}

/**
 * Media query hook for custom breakpoint queries
 * @param query - CSS media query string (e.g., "(min-width: 768px)")
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Set initial value
    setMatches(mediaQuery.matches);

    // Listen for changes
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * Returns responsive values based on current breakpoint
 * @param values - Object mapping breakpoints to values
 * @param defaultValue - Default value if no breakpoint matches
 */
export function useResponsiveValue<T>(
  values: Partial<Record<Breakpoint | 'xs', T>>,
  defaultValue: T
): T {
  const breakpoint = useCurrentBreakpoint();

  return useMemo(() => {
    // Find the value for current breakpoint, or fall back to smaller breakpoints
    const breakpointOrder: (Breakpoint | 'xs')[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
    const currentIndex = breakpointOrder.indexOf(breakpoint);

    // Look for value at current breakpoint, then fall back to smaller ones
    for (let i = currentIndex; i >= 0; i--) {
      const bp = breakpointOrder[i];
      if (values[bp] !== undefined) {
        return values[bp] as T;
      }
    }

    return defaultValue;
  }, [breakpoint, values, defaultValue]);
}

/**
 * Hook to get window dimensions
 */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateSize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return size;
}
