/**
 * TB144: Responsive Foundation & CSS Infrastructure Tests
 *
 * Tests for the responsive breakpoints, spacing utilities, typography scale,
 * and responsive hooks that form the foundation for all responsive design work.
 */

import { test, expect } from '@playwright/test';
import {
  VIEWPORTS,
  DEVICE_PRESETS,
  setViewport,
  testResponsive,
  testAtAllBreakpoints,
  getCSSVariable,
  hasHorizontalOverflow,
  getCurrentBreakpoint,
  getCurrentDeviceType,
  waitForResponsiveUpdate,
} from './helpers/responsive';

test.describe('TB144: Responsive Foundation & CSS Infrastructure', () => {
  test.describe('Viewport Meta Tag', () => {
    test('should have correct viewport meta tag for mobile scaling', async ({ page }) => {
      await page.goto('/');

      const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
      expect(viewportMeta).toBeTruthy();

      // Should have width=device-width
      expect(viewportMeta).toContain('width=device-width');

      // Should have initial-scale=1
      expect(viewportMeta).toContain('initial-scale=1');

      // Should NOT have user-scalable=no (accessibility requirement)
      expect(viewportMeta).not.toContain('user-scalable=no');
      expect(viewportMeta).not.toContain('user-scalable=0');
    });
  });

  test.describe('CSS Breakpoint Tokens', () => {
    test('should define all breakpoint CSS variables', async ({ page }) => {
      await page.goto('/');

      const breakpointXs = await getCSSVariable(page, '--breakpoint-xs');
      const breakpointSm = await getCSSVariable(page, '--breakpoint-sm');
      const breakpointMd = await getCSSVariable(page, '--breakpoint-md');
      const breakpointLg = await getCSSVariable(page, '--breakpoint-lg');
      const breakpointXl = await getCSSVariable(page, '--breakpoint-xl');
      const breakpoint2xl = await getCSSVariable(page, '--breakpoint-2xl');

      expect(breakpointXs).toBe('0');
      expect(breakpointSm).toBe('480px');
      expect(breakpointMd).toBe('640px');
      expect(breakpointLg).toBe('768px');
      expect(breakpointXl).toBe('1024px');
      expect(breakpoint2xl).toBe('1280px');
    });
  });

  test.describe('Responsive Spacing Tokens', () => {
    test('should have responsive gap token that changes at breakpoints', async ({ page }) => {
      await page.goto('/');

      // Test at mobile (xs) - should be 1rem (16px)
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);
      const mobileGap = await getCSSVariable(page, '--gap-responsive');
      // CSS variables return computed values, which is 1rem (16px) at mobile
      expect(mobileGap).toBe('1rem');

      // Test at tablet (lg) - should be 1.5rem (24px)
      await setViewport(page, 'lg');
      await waitForResponsiveUpdate(page);
      const tabletGap = await getCSSVariable(page, '--gap-responsive');
      expect(tabletGap).toBe('1.5rem');

      // Test at desktop (2xl) - should be 2rem (32px)
      await setViewport(page, '2xl');
      await waitForResponsiveUpdate(page);
      const desktopGap = await getCSSVariable(page, '--gap-responsive');
      expect(desktopGap).toBe('2rem');
    });

    test('should define touch target minimum size', async ({ page }) => {
      await page.goto('/');

      const touchTargetMin = await getCSSVariable(page, '--touch-target-min');
      // 2.75rem = 44px (minimum touch target for accessibility)
      expect(touchTargetMin).toBe('2.75rem');
    });
  });

  test.describe('Responsive Typography Tokens', () => {
    test('should have responsive font sizes that scale with breakpoints', async ({ page }) => {
      await page.goto('/');

      // Test at mobile (xs)
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);
      const mobileFontSize = await getCSSVariable(page, '--font-size-responsive-base');
      expect(mobileFontSize).toBe('0.875rem'); // 14px

      // Test at tablet (lg)
      await setViewport(page, 'lg');
      await waitForResponsiveUpdate(page);
      const tabletFontSize = await getCSSVariable(page, '--font-size-responsive-base');
      expect(tabletFontSize).toBe('0.9375rem'); // 15px

      // Test at desktop (2xl)
      await setViewport(page, '2xl');
      await waitForResponsiveUpdate(page);
      const desktopFontSize = await getCSSVariable(page, '--font-size-responsive-base');
      expect(desktopFontSize).toBe('1rem'); // 16px
    });

    test('should have responsive heading sizes', async ({ page }) => {
      await page.goto('/');

      // Test H1 at mobile
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);
      const mobileH1 = await getCSSVariable(page, '--font-size-responsive-h1');
      expect(mobileH1).toBe('1.5rem'); // 24px

      // Test H1 at desktop
      await setViewport(page, '2xl');
      await waitForResponsiveUpdate(page);
      const desktopH1 = await getCSSVariable(page, '--font-size-responsive-h1');
      expect(desktopH1).toBe('2rem'); // 32px
    });
  });

  test.describe('Responsive Layout Tokens', () => {
    test('should have sidebar width tokens', async ({ page }) => {
      await page.goto('/');

      const sidebarCollapsed = await getCSSVariable(page, '--sidebar-width-collapsed');
      const sidebarExpanded = await getCSSVariable(page, '--sidebar-width-expanded');

      expect(sidebarCollapsed).toBe('3.5rem'); // 56px
      expect(sidebarExpanded).toBe('15rem'); // 240px
    });

    test('should have detail panel width that adapts to screen size', async ({ page }) => {
      await page.goto('/');

      // Test at mobile
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);
      const mobilePanelWidth = await getCSSVariable(page, '--detail-panel-width');
      expect(mobilePanelWidth).toBe('100%');

      // Test at tablet
      await setViewport(page, 'lg');
      await waitForResponsiveUpdate(page);
      const tabletPanelWidth = await getCSSVariable(page, '--detail-panel-width');
      expect(tabletPanelWidth).toBe('20rem'); // 320px

      // Test at desktop
      await setViewport(page, 'xl');
      await waitForResponsiveUpdate(page);
      const desktopPanelWidth = await getCSSVariable(page, '--detail-panel-width');
      expect(desktopPanelWidth).toBe('25rem'); // 400px
    });
  });

  test.describe('Test Helpers', () => {
    test('setViewport should correctly set viewport dimensions', async ({ page }) => {
      await page.goto('/');

      // Test with breakpoint name
      await setViewport(page, 'xs');
      expect(page.viewportSize()).toEqual({ width: 375, height: 667 });

      // Test with device type
      await setViewport(page, 'tablet');
      expect(page.viewportSize()).toEqual({ width: 768, height: 1024 });

      // Test with custom dimensions
      await setViewport(page, { width: 500, height: 800 });
      expect(page.viewportSize()).toEqual({ width: 500, height: 800 });
    });

    test('getCurrentBreakpoint should return correct breakpoint', async ({ page }) => {
      await page.goto('/');

      await setViewport(page, { width: 300, height: 600 });
      expect(getCurrentBreakpoint(page)).toBe('xs');

      await setViewport(page, { width: 500, height: 800 });
      expect(getCurrentBreakpoint(page)).toBe('sm');

      await setViewport(page, { width: 700, height: 900 });
      expect(getCurrentBreakpoint(page)).toBe('md');

      await setViewport(page, { width: 800, height: 1000 });
      expect(getCurrentBreakpoint(page)).toBe('lg');

      await setViewport(page, { width: 1100, height: 800 });
      expect(getCurrentBreakpoint(page)).toBe('xl');

      await setViewport(page, { width: 1400, height: 900 });
      expect(getCurrentBreakpoint(page)).toBe('2xl');
    });

    test('getCurrentDeviceType should return correct device type', async ({ page }) => {
      await page.goto('/');

      await setViewport(page, 'xs');
      expect(getCurrentDeviceType(page)).toBe('mobile');

      await setViewport(page, 'sm');
      expect(getCurrentDeviceType(page)).toBe('mobile');

      await setViewport(page, 'md');
      expect(getCurrentDeviceType(page)).toBe('tablet');

      await setViewport(page, 'lg');
      expect(getCurrentDeviceType(page)).toBe('tablet');

      await setViewport(page, 'xl');
      expect(getCurrentDeviceType(page)).toBe('desktop');

      await setViewport(page, '2xl');
      expect(getCurrentDeviceType(page)).toBe('desktop');
    });

    test('testAtAllBreakpoints should test at each breakpoint', async ({ page }) => {
      await page.goto('/');

      const testedBreakpoints: string[] = [];

      await testAtAllBreakpoints(page, async (breakpoint, viewport) => {
        testedBreakpoints.push(breakpoint);
        expect(page.viewportSize()?.width).toBe(viewport.width);
      });

      expect(testedBreakpoints).toEqual(['xs', 'sm', 'md', 'lg', 'xl', '2xl']);
    });
  });

  test.describe('No Horizontal Overflow', () => {
    // Note: These tests verify the foundation is in place.
    // Mobile horizontal overflow will be fixed as we implement TB145-TB158 (responsive components).

    test('should not have horizontal overflow at tablet viewport', async ({ page }) => {
      await page.goto('/');
      await setViewport(page, 'lg');
      await waitForResponsiveUpdate(page);

      const hasOverflow = await hasHorizontalOverflow(page);
      expect(hasOverflow).toBe(false);
    });

    test('should not have horizontal overflow at desktop viewport', async ({ page }) => {
      await page.goto('/');
      await setViewport(page, '2xl');
      await waitForResponsiveUpdate(page);

      const hasOverflow = await hasHorizontalOverflow(page);
      expect(hasOverflow).toBe(false);
    });

    // TB145 implemented - mobile overflow should now be fixed
    test('should not have horizontal overflow at mobile viewport', async ({ page }) => {
      await page.goto('/');
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      const hasOverflow = await hasHorizontalOverflow(page);
      expect(hasOverflow).toBe(false);
    });
  });

  test.describe('VIEWPORTS constant', () => {
    test('should have correct viewport definitions', () => {
      // Verify VIEWPORTS constant is correctly defined
      expect(VIEWPORTS.xs.width).toBe(375);
      expect(VIEWPORTS.xs.deviceType).toBe('mobile');
      expect(VIEWPORTS.xs.hasTouch).toBe(true);

      expect(VIEWPORTS.lg.width).toBe(768);
      expect(VIEWPORTS.lg.deviceType).toBe('tablet');
      expect(VIEWPORTS.lg.hasTouch).toBe(true);

      expect(VIEWPORTS['2xl'].width).toBe(1280);
      expect(VIEWPORTS['2xl'].deviceType).toBe('desktop');
      expect(VIEWPORTS['2xl'].hasTouch).toBe(false);
    });

    test('should have correct device presets', () => {
      expect(DEVICE_PRESETS.mobile).toEqual(VIEWPORTS.xs);
      expect(DEVICE_PRESETS.tablet).toEqual(VIEWPORTS.lg);
      expect(DEVICE_PRESETS.desktop).toEqual(VIEWPORTS['2xl']);
    });
  });

  test.describe('Responsive CSS Utility Classes', () => {
    test('should apply gap-responsive utility', async ({ page }) => {
      // Create a test page with the utility class
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            :root {
              --spacing-4: 1rem;
              --spacing-6: 1.5rem;
              --spacing-8: 2rem;
              --gap-responsive: var(--spacing-4);
            }
            @media (min-width: 768px) {
              :root { --gap-responsive: var(--spacing-6); }
            }
            @media (min-width: 1280px) {
              :root { --gap-responsive: var(--spacing-8); }
            }
            .gap-responsive { gap: var(--gap-responsive); }
            .test-container { display: flex; }
          </style>
        </head>
        <body>
          <div class="test-container gap-responsive" data-testid="test">
            <div>Item 1</div>
            <div>Item 2</div>
          </div>
        </body>
        </html>
      `);

      // Verify the gap changes at different breakpoints
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);
      const mobileGap = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="test"]');
        return window.getComputedStyle(el!).gap;
      });
      expect(mobileGap).toBe('16px'); // 1rem = 16px

      await setViewport(page, 'lg');
      await waitForResponsiveUpdate(page);
      const tabletGap = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="test"]');
        return window.getComputedStyle(el!).gap;
      });
      expect(tabletGap).toBe('24px'); // 1.5rem = 24px

      await setViewport(page, '2xl');
      await waitForResponsiveUpdate(page);
      const desktopGap = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="test"]');
        return window.getComputedStyle(el!).gap;
      });
      expect(desktopGap).toBe('32px'); // 2rem = 32px
    });
  });

  test.describe('testResponsive helper', () => {
    test('should run tests at mobile, tablet, and desktop viewports', async ({ page }) => {
      await page.goto('/');

      const viewportsSeen: string[] = [];

      await testResponsive(page, {
        mobile: async () => {
          viewportsSeen.push(`mobile:${page.viewportSize()?.width}`);
        },
        tablet: async () => {
          viewportsSeen.push(`tablet:${page.viewportSize()?.width}`);
        },
        desktop: async () => {
          viewportsSeen.push(`desktop:${page.viewportSize()?.width}`);
        },
      });

      expect(viewportsSeen).toContain('mobile:375');
      expect(viewportsSeen).toContain('tablet:768');
      expect(viewportsSeen).toContain('desktop:1280');
    });
  });
});
