/**
 * useContainerBreakpoint - Container-aware responsive hooks
 *
 * These hooks mirror the viewport-based hooks in useBreakpoint.ts but use
 * the main content container's width instead of the viewport width. This is
 * critical for components rendered inside <main> when the director panel is
 * open, as the container is narrower than the viewport.
 *
 * The container width is provided via React context from AppShell, which
 * attaches a ResizeObserver to the <main> element.
 *
 * Breakpoints (aligned with Tailwind CSS v4 defaults, same as tokens.css and useBreakpoint.ts):
 * - xs: 0 - 639px
 * - sm: 640 - 767px
 * - md: 768 - 1023px
 * - lg: 1024 - 1279px
 * - xl: 1280 - 1535px
 * - 2xl: 1536px+
 */

import { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { BREAKPOINTS, BREAKPOINT_ORDER } from './useBreakpoint';
import type { Breakpoint } from './useBreakpoint';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ContainerWidthContextValue {
  /** Current width of the main content container in pixels */
  width: number;
}

/**
 * React context that holds the main container's current width.
 * Default value assumes a desktop-sized container for SSR / outside-provider usage.
 */
export const ContainerWidthContext = createContext<ContainerWidthContextValue>({
  width: 1024,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ContainerWidthProviderProps {
  /** Current width of the main content container in pixels */
  width: number;
  children: ReactNode;
}

/**
 * Stable provider component defined at module level so its identity never
 * changes across renders. This prevents React from unmounting/remounting the
 * entire child tree when the container width changes.
 *
 * Usage in AppShell:
 * ```tsx
 * const { containerRef, width: containerWidth } = useContainerWidthObserver();
 * <main ref={containerRef} ...>
 *   <ContainerWidthProvider width={containerWidth}>
 *     <Outlet />
 *   </ContainerWidthProvider>
 * </main>
 * ```
 */
export function ContainerWidthProvider({ width, children }: ContainerWidthProviderProps) {
  const value = useMemo(() => ({ width }), [width]);
  return (
    <ContainerWidthContext.Provider value={value}>
      {children}
    </ContainerWidthContext.Provider>
  );
}

/**
 * Hook that attaches a ResizeObserver to a container element and tracks its width.
 * Returns a ref to attach to the container and the current width in pixels.
 */
export function useContainerWidthObserver() {
  const containerRef = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState<number>(1024); // Updated on mount

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Set initial width
    setWidth(element.clientWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use contentBoxSize when available for accuracy, fall back to clientWidth
        if (entry.contentBoxSize) {
          const boxSize = Array.isArray(entry.contentBoxSize)
            ? entry.contentBoxSize[0]
            : entry.contentBoxSize;
          setWidth(boxSize.inlineSize);
        } else {
          setWidth(entry.target.clientWidth);
        }
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { containerRef, width };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Returns the current width of the main content container in pixels.
 *
 * @example
 * const width = useContainerWidth();
 */
export function useContainerWidth(): number {
  return useContext(ContainerWidthContext).width;
}

/**
 * Returns the current container breakpoint.
 *
 * @example
 * const bp = useContainerBreakpoint(); // 'md'
 */
export function useContainerBreakpoint(): Breakpoint {
  const width = useContainerWidth();
  return getBreakpointFromWidth(width);
}

/**
 * Returns true when the container width is below 768px (the @md breakpoint),
 * mirroring viewport-based `useIsMobile` semantics.
 */
export function useContainerIsMobile(): boolean {
  const width = useContainerWidth();
  return width < BREAKPOINTS.md;
}

/**
 * Returns true when the container width is between 768px and 1279px
 * (the @md–@xl range), mirroring `useIsTablet`.
 */
export function useContainerIsTablet(): boolean {
  const width = useContainerWidth();
  return width >= BREAKPOINTS.md && width < BREAKPOINTS.xl;
}

/**
 * Returns true when the container width is 1280px or wider,
 * mirroring `useIsDesktop`.
 */
export function useContainerIsDesktop(): boolean {
  const width = useContainerWidth();
  return width >= BREAKPOINTS.xl;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBreakpointFromWidth(width: number): Breakpoint {
  // Walk from largest to smallest
  for (let i = BREAKPOINT_ORDER.length - 1; i >= 0; i--) {
    if (width >= BREAKPOINTS[BREAKPOINT_ORDER[i]]) {
      return BREAKPOINT_ORDER[i];
    }
  }
  return 'xs';
}
