/**
 * useBreakpoint - Responsive breakpoint detection hooks for React
 *
 * Provides hooks to detect the current viewport breakpoint and responsive helpers.
 *
 * Breakpoints:
 * - xs: 0 - 479px (small phones)
 * - sm: 480 - 639px (large phones)
 * - md: 640 - 767px (small tablets)
 * - lg: 768 - 1023px (tablets)
 * - xl: 1024 - 1279px (small laptops)
 * - 2xl: 1280px+ (desktops)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Breakpoint identifiers
 */
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Breakpoint values in pixels
 */
export const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0,
  sm: 480,
  md: 640,
  lg: 768,
  xl: 1024,
  '2xl': 1280,
} as const;

/**
 * Ordered list of breakpoints from smallest to largest
 */
export const BREAKPOINT_ORDER: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

/**
 * Device type based on breakpoint
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * Get the current breakpoint based on window width
 */
function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS['xl']) return 'xl';
  if (width >= BREAKPOINTS['lg']) return 'lg';
  if (width >= BREAKPOINTS['md']) return 'md';
  if (width >= BREAKPOINTS['sm']) return 'sm';
  return 'xs';
}

/**
 * Get device type based on breakpoint
 */
function getDeviceType(breakpoint: Breakpoint): DeviceType {
  if (breakpoint === 'xs' || breakpoint === 'sm') return 'mobile';
  if (breakpoint === 'md' || breakpoint === 'lg') return 'tablet';
  return 'desktop';
}

/**
 * Check if current breakpoint is at least the specified breakpoint
 */
function isAtLeast(current: Breakpoint, target: Breakpoint): boolean {
  return BREAKPOINT_ORDER.indexOf(current) >= BREAKPOINT_ORDER.indexOf(target);
}

/**
 * Check if current breakpoint is at most the specified breakpoint
 */
function isAtMost(current: Breakpoint, target: Breakpoint): boolean {
  return BREAKPOINT_ORDER.indexOf(current) <= BREAKPOINT_ORDER.indexOf(target);
}

/**
 * Hook to get the current breakpoint
 *
 * @returns The current breakpoint ('xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl')
 *
 * @example
 * const breakpoint = useBreakpoint();
 * // breakpoint === 'md' on a tablet
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => {
    if (typeof window === 'undefined') return 'lg'; // SSR default
    return getBreakpoint(window.innerWidth);
  });

  useEffect(() => {
    const handleResize = () => {
      const newBreakpoint = getBreakpoint(window.innerWidth);
      setBreakpoint((prev) => {
        if (prev !== newBreakpoint) {
          return newBreakpoint;
        }
        return prev;
      });
    };

    // Initial check
    handleResize();

    // Listen for resize events
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return breakpoint;
}

/**
 * Hook to get the current window dimensions
 *
 * @returns { width, height } of the current window
 *
 * @example
 * const { width, height } = useWindowSize();
 */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => {
    if (typeof window === 'undefined') {
      return { width: 1024, height: 768 }; // SSR default
    }
    return { width: window.innerWidth, height: window.innerHeight };
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}

// useIsMobile and useIsTablet are re-exported from @stoneforge/ui
// to ensure consistent breakpoint behavior across the platform.
// @stoneforge/ui uses standard Tailwind breakpoints:
//   - useIsMobile: width < 768px (md breakpoint)
//   - useIsTablet: 768px <= width < 1024px (md to lg)
export { useIsMobile, useIsTablet } from '@stoneforge/ui';

/**
 * Hook to check if the current device is desktop (xl or 2xl)
 *
 * @returns true if viewport is desktop-sized
 *
 * @example
 * const isDesktop = useIsDesktop();
 */
export function useIsDesktop(): boolean {
  const breakpoint = useBreakpoint();
  return breakpoint === 'xl' || breakpoint === '2xl';
}

/**
 * Hook to get the device type (mobile, tablet, desktop)
 *
 * @returns 'mobile' | 'tablet' | 'desktop'
 *
 * @example
 * const deviceType = useDeviceType();
 * // deviceType === 'mobile' on phones
 */
export function useDeviceType(): DeviceType {
  const breakpoint = useBreakpoint();
  return getDeviceType(breakpoint);
}

/**
 * Hook to check if viewport matches a media query
 *
 * @param query - CSS media query string
 * @returns true if the media query matches
 *
 * @example
 * const isWide = useMediaQuery('(min-width: 1024px)');
 * const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    // Set initial value
    setMatches(mediaQuery.matches);

    // Listen for changes
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * Hook to check if viewport is at least the specified breakpoint
 *
 * @param target - The minimum breakpoint
 * @returns true if current breakpoint is >= target
 *
 * @example
 * const isTabletOrLarger = useBreakpointAtLeast('lg');
 */
export function useBreakpointAtLeast(target: Breakpoint): boolean {
  const breakpoint = useBreakpoint();
  return isAtLeast(breakpoint, target);
}

/**
 * Hook to check if viewport is at most the specified breakpoint
 *
 * @param target - The maximum breakpoint
 * @returns true if current breakpoint is <= target
 *
 * @example
 * const isMobileOrSmaller = useBreakpointAtMost('sm');
 */
export function useBreakpointAtMost(target: Breakpoint): boolean {
  const breakpoint = useBreakpoint();
  return isAtMost(breakpoint, target);
}

/**
 * Hook to check if viewport is within a breakpoint range
 *
 * @param min - Minimum breakpoint (inclusive)
 * @param max - Maximum breakpoint (inclusive)
 * @returns true if current breakpoint is within range
 *
 * @example
 * const isTabletRange = useBreakpointBetween('md', 'lg');
 */
export function useBreakpointBetween(min: Breakpoint, max: Breakpoint): boolean {
  const breakpoint = useBreakpoint();
  return isAtLeast(breakpoint, min) && isAtMost(breakpoint, max);
}

/**
 * Hook to detect touch device capability
 *
 * @returns true if device supports touch
 *
 * @example
 * const isTouch = useTouchDevice();
 * if (isTouch) {
 *   // Use touch-friendly interactions
 * }
 */
export function useTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  });

  useEffect(() => {
    // Re-check on mount (handles SSR hydration)
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  return isTouch;
}

/**
 * Hook to detect reduced motion preference
 *
 * @returns true if user prefers reduced motion
 *
 * @example
 * const prefersReducedMotion = usePrefersReducedMotion();
 * const animationDuration = prefersReducedMotion ? 0 : 200;
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Hook to get comprehensive responsive information
 *
 * @returns Object with breakpoint, device type, dimensions, and utility functions
 *
 * @example
 * const { breakpoint, isMobile, isDesktop, width } = useResponsive();
 */
export function useResponsive() {
  const breakpoint = useBreakpoint();
  const { width, height } = useWindowSize();
  const isTouch = useTouchDevice();
  const prefersReducedMotion = usePrefersReducedMotion();

  const deviceType = useMemo(() => getDeviceType(breakpoint), [breakpoint]);

  const isAtLeastBreakpoint = useCallback(
    (target: Breakpoint) => isAtLeast(breakpoint, target),
    [breakpoint]
  );

  const isAtMostBreakpoint = useCallback(
    (target: Breakpoint) => isAtMost(breakpoint, target),
    [breakpoint]
  );

  return {
    // Current state
    breakpoint,
    deviceType,
    width,
    height,
    isTouch,
    prefersReducedMotion,

    // Convenience booleans
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',

    // Comparison helpers
    isAtLeast: isAtLeastBreakpoint,
    isAtMost: isAtMostBreakpoint,
  };
}
