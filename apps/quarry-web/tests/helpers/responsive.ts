/**
 * Playwright Responsive Testing Helpers
 *
 * Utilities for testing responsive behavior at different viewport sizes.
 *
 * Usage:
 * ```typescript
 * import { VIEWPORTS, testAtViewport, testResponsive } from './helpers/responsive';
 *
 * test('my responsive test', async ({ page }) => {
 *   await testResponsive(page, {
 *     mobile: async () => {
 *       // Test mobile behavior
 *     },
 *     tablet: async () => {
 *       // Test tablet behavior
 *     },
 *     desktop: async () => {
 *       // Test desktop behavior
 *     },
 *   });
 * });
 * ```
 */

import type { Page } from '@playwright/test';

/**
 * Breakpoint identifiers matching the app's breakpoint system
 */
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Device type for simplified testing
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * Viewport configuration
 */
export interface Viewport {
  width: number;
  height: number;
  name: string;
  breakpoint: Breakpoint;
  deviceType: DeviceType;
  hasTouch: boolean;
}

/**
 * Standard viewport sizes for testing
 *
 * These match common device sizes and our breakpoint system:
 * - xs: 0-479px (small phones)
 * - sm: 480-639px (large phones)
 * - md: 640-767px (small tablets)
 * - lg: 768-1023px (tablets)
 * - xl: 1024-1279px (small laptops)
 * - 2xl: 1280px+ (desktops)
 */
export const VIEWPORTS: Record<Breakpoint, Viewport> = {
  xs: {
    width: 375,
    height: 667,
    name: 'iPhone SE',
    breakpoint: 'xs',
    deviceType: 'mobile',
    hasTouch: true,
  },
  sm: {
    width: 480,
    height: 896,
    name: 'iPhone 11 Pro Max',
    breakpoint: 'sm',
    deviceType: 'mobile',
    hasTouch: true,
  },
  md: {
    width: 640,
    height: 960,
    name: 'Small Tablet',
    breakpoint: 'md',
    deviceType: 'tablet',
    hasTouch: true,
  },
  lg: {
    width: 768,
    height: 1024,
    name: 'iPad Mini',
    breakpoint: 'lg',
    deviceType: 'tablet',
    hasTouch: true,
  },
  xl: {
    width: 1024,
    height: 768,
    name: 'iPad Pro Landscape',
    breakpoint: 'xl',
    deviceType: 'desktop',
    hasTouch: false,
  },
  '2xl': {
    width: 1280,
    height: 800,
    name: 'Desktop',
    breakpoint: '2xl',
    deviceType: 'desktop',
    hasTouch: false,
  },
} as const;

/**
 * Device presets for common testing scenarios
 */
export const DEVICE_PRESETS: Record<DeviceType, Viewport> = {
  mobile: VIEWPORTS.xs,
  tablet: VIEWPORTS.lg,
  desktop: VIEWPORTS['2xl'],
} as const;

/**
 * Additional device viewports for comprehensive testing
 */
export const EXTRA_VIEWPORTS = {
  // Mobile devices
  iPhoneSE: { width: 375, height: 667 },
  iPhone12: { width: 390, height: 844 },
  iPhone14ProMax: { width: 430, height: 932 },
  pixel5: { width: 393, height: 851 },
  galaxyS21: { width: 360, height: 800 },

  // Tablets
  iPadMini: { width: 768, height: 1024 },
  iPadAir: { width: 820, height: 1180 },
  iPadPro11: { width: 834, height: 1194 },
  iPadPro12: { width: 1024, height: 1366 },

  // Laptops and Desktops
  macbookAir13: { width: 1280, height: 800 },
  macbookPro14: { width: 1512, height: 982 },
  macbookPro16: { width: 1728, height: 1117 },
  desktop1080p: { width: 1920, height: 1080 },
  desktop1440p: { width: 2560, height: 1440 },
} as const;

/**
 * Set the viewport size for a page
 *
 * @param page - Playwright page object
 * @param viewport - Viewport configuration or breakpoint name
 *
 * @example
 * await setViewport(page, 'mobile');
 * await setViewport(page, { width: 375, height: 667 });
 * await setViewport(page, VIEWPORTS.lg);
 */
export async function setViewport(
  page: Page,
  viewport: Viewport | Breakpoint | DeviceType | { width: number; height: number }
): Promise<void> {
  let config: { width: number; height: number };

  if (typeof viewport === 'string') {
    if (viewport in VIEWPORTS) {
      config = VIEWPORTS[viewport as Breakpoint];
    } else if (viewport in DEVICE_PRESETS) {
      config = DEVICE_PRESETS[viewport as DeviceType];
    } else {
      throw new Error(`Unknown viewport: ${viewport}`);
    }
  } else {
    config = viewport;
  }

  await page.setViewportSize({ width: config.width, height: config.height });
}

/**
 * Test at a specific viewport size
 *
 * @param page - Playwright page object
 * @param viewport - Viewport configuration or breakpoint name
 * @param testFn - Test function to run at this viewport
 *
 * @example
 * await testAtViewport(page, 'mobile', async () => {
 *   await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
 * });
 */
export async function testAtViewport(
  page: Page,
  viewport: Viewport | Breakpoint | DeviceType | { width: number; height: number },
  testFn: () => Promise<void>
): Promise<void> {
  await setViewport(page, viewport);
  await testFn();
}

/**
 * Configuration for responsive tests
 */
export interface ResponsiveTestConfig {
  mobile?: () => Promise<void>;
  tablet?: () => Promise<void>;
  desktop?: () => Promise<void>;
  all?: () => Promise<void>;
}

/**
 * Run tests at multiple viewport sizes
 *
 * @param page - Playwright page object
 * @param config - Test functions for each device type
 *
 * @example
 * await testResponsive(page, {
 *   mobile: async () => {
 *     await expect(sidebar).not.toBeVisible();
 *   },
 *   tablet: async () => {
 *     await expect(sidebar).toBeVisible();
 *     await expect(sidebar).toHaveClass(/collapsed/);
 *   },
 *   desktop: async () => {
 *     await expect(sidebar).toBeVisible();
 *     await expect(sidebar).not.toHaveClass(/collapsed/);
 *   },
 * });
 */
export async function testResponsive(
  page: Page,
  config: ResponsiveTestConfig
): Promise<void> {
  if (config.mobile) {
    await setViewport(page, 'mobile');
    await config.mobile();
    if (config.all) await config.all();
  }

  if (config.tablet) {
    await setViewport(page, 'tablet');
    await config.tablet();
    if (config.all) await config.all();
  }

  if (config.desktop) {
    await setViewport(page, 'desktop');
    await config.desktop();
    if (config.all) await config.all();
  }
}

/**
 * Run the same test at all breakpoints
 *
 * @param page - Playwright page object
 * @param testFn - Test function to run at each breakpoint
 *
 * @example
 * await testAtAllBreakpoints(page, async (breakpoint) => {
 *   await page.goto('/dashboard');
 *   await expect(page.getByTestId('dashboard')).toBeVisible();
 *   console.log(`Tested at ${breakpoint}`);
 * });
 */
export async function testAtAllBreakpoints(
  page: Page,
  testFn: (breakpoint: Breakpoint, viewport: Viewport) => Promise<void>
): Promise<void> {
  for (const [breakpoint, viewport] of Object.entries(VIEWPORTS)) {
    await setViewport(page, viewport);
    await testFn(breakpoint as Breakpoint, viewport);
  }
}

/**
 * Get computed CSS property value
 *
 * @param page - Playwright page object
 * @param selector - CSS selector
 * @param property - CSS property name
 *
 * @example
 * const padding = await getCSSProperty(page, '.container', 'padding');
 */
export async function getCSSProperty(
  page: Page,
  selector: string,
  property: string
): Promise<string> {
  return page.evaluate(
    ([sel, prop]) => {
      const element = document.querySelector(sel);
      if (!element) return '';
      return window.getComputedStyle(element).getPropertyValue(prop);
    },
    [selector, property] as const
  );
}

/**
 * Get CSS custom property value (CSS variable)
 *
 * @param page - Playwright page object
 * @param variableName - CSS variable name (e.g., '--gap-responsive')
 *
 * @example
 * const gap = await getCSSVariable(page, '--gap-responsive');
 */
export async function getCSSVariable(
  page: Page,
  variableName: string
): Promise<string> {
  return page.evaluate((varName) => {
    return window.getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }, variableName);
}

/**
 * Check if an element has a minimum touch target size (44x44px)
 *
 * @param page - Playwright page object
 * @param selector - CSS selector or locator
 *
 * @example
 * const hasMinSize = await hasTouchTargetSize(page, 'button.nav-item');
 */
export async function hasTouchTargetSize(
  page: Page,
  selector: string
): Promise<boolean> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 44 && rect.height >= 44;
  }, selector);
}

/**
 * Get the bounding box of an element
 *
 * @param page - Playwright page object
 * @param selector - CSS selector
 */
export async function getBoundingBox(
  page: Page,
  selector: string
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, selector);
}

/**
 * Check if element is within viewport bounds
 *
 * @param page - Playwright page object
 * @param selector - CSS selector
 */
export async function isElementInViewport(
  page: Page,
  selector: string
): Promise<boolean> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  }, selector);
}

/**
 * Check if there's horizontal overflow (scrollbar)
 *
 * @param page - Playwright page object
 * @param selector - CSS selector (defaults to body)
 */
export async function hasHorizontalOverflow(
  page: Page,
  selector: string = 'body'
): Promise<boolean> {
  return page.evaluate((sel) => {
    const element = sel === 'body' ? document.body : document.querySelector(sel);
    if (!element) return false;
    return element.scrollWidth > element.clientWidth;
  }, selector);
}

/**
 * Simulate a touch tap event
 *
 * @param page - Playwright page object
 * @param selector - CSS selector or coordinates
 */
export async function touchTap(
  page: Page,
  selector: string | { x: number; y: number }
): Promise<void> {
  if (typeof selector === 'string') {
    const box = await getBoundingBox(page, selector);
    if (!box) throw new Error(`Element not found: ${selector}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
  } else {
    await page.touchscreen.tap(selector.x, selector.y);
  }
}

/**
 * Simulate a swipe gesture
 *
 * @param page - Playwright page object
 * @param direction - Swipe direction
 * @param options - Swipe options
 */
export async function swipe(
  page: Page,
  direction: 'left' | 'right' | 'up' | 'down',
  options: { start?: { x: number; y: number }; distance?: number; duration?: number } = {}
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport set');

  const distance = options.distance ?? 200;
  const start = options.start ?? {
    x: viewport.width / 2,
    y: viewport.height / 2,
  };

  let end: { x: number; y: number };
  switch (direction) {
    case 'left':
      end = { x: start.x - distance, y: start.y };
      break;
    case 'right':
      end = { x: start.x + distance, y: start.y };
      break;
    case 'up':
      end = { x: start.x, y: start.y - distance };
      break;
    case 'down':
      end = { x: start.x, y: start.y + distance };
      break;
  }

  // Playwright's touchscreen doesn't support swipe directly,
  // so we simulate it with a sequence of events
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
}

/**
 * Wait for responsive CSS to apply after viewport change
 *
 * @param page - Playwright page object
 * @param ms - Milliseconds to wait (default: 100ms)
 */
export async function waitForResponsiveUpdate(page: Page, ms: number = 100): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Get current breakpoint based on page viewport
 *
 * @param page - Playwright page object
 */
export function getCurrentBreakpoint(page: Page): Breakpoint {
  const viewport = page.viewportSize();
  if (!viewport) return 'lg'; // Default

  const width = viewport.width;
  if (width >= 1280) return '2xl';
  if (width >= 1024) return 'xl';
  if (width >= 768) return 'lg';
  if (width >= 640) return 'md';
  if (width >= 480) return 'sm';
  return 'xs';
}

/**
 * Get current device type based on page viewport
 *
 * @param page - Playwright page object
 */
export function getCurrentDeviceType(page: Page): DeviceType {
  const breakpoint = getCurrentBreakpoint(page);
  if (breakpoint === 'xs' || breakpoint === 'sm') return 'mobile';
  if (breakpoint === 'md' || breakpoint === 'lg') return 'tablet';
  return 'desktop';
}
