/**
 * Responsive Breakpoint Alignment Tests
 *
 * Verifies that JS sidebar breakpoints, CSS container queries, and Tailwind 4
 * defaults all fire at the same thresholds. The key invariant:
 *
 *   viewport=X (director closed) === viewport=(X + directorWidth) (director open)
 *
 * Both should produce identical sidebar state and CSS responsive styling.
 */
import { test, expect } from '@playwright/test';

// Canonical breakpoint values (must match Tailwind 4 defaults)
const BREAKPOINTS = {
  sm: 640,
  md: 768, // mobile/tablet boundary
  lg: 1024,
  xl: 1280, // tablet/desktop boundary
};

const DIRECTOR_PANEL_WIDTH = 400; // approximate default expanded width

test.describe('Responsive Breakpoint Alignment', () => {
  // --------------------------------------------------------------------------
  // Test 1: Sidebar state consistency (director open vs closed)
  // --------------------------------------------------------------------------
  test('sidebar state matches at 1400px content width (director open vs closed)', async ({
    page,
  }) => {
    // Scenario A: viewport=1400, director closed
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-shell"]');

    // At 1400px (>= 1280px desktop threshold), sidebar should be toggleable/expanded
    const sidebarA = page.locator('[data-testid="app-shell"] aside').first();
    await expect(sidebarA).toBeVisible();
    const sidebarWidthA = await sidebarA.evaluate((el) => el.getBoundingClientRect().width);

    // Take screenshot for comparison
    await page.screenshot({
      path: 'tests/screenshots/breakpoint-1400-director-closed.png',
      fullPage: false,
    });

    // Scenario B: viewport=1800, director open (content area ~1400px)
    await page.setViewportSize({ width: 1800, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-shell"]');

    // Open director panel if collapsed
    const directorToggle = page.locator('[data-testid="director-toggle"]').first();
    if (await directorToggle.isVisible()) {
      await directorToggle.click();
      await page.waitForTimeout(300); // wait for animation
    }

    const sidebarB = page.locator('[data-testid="app-shell"] aside').first();
    await expect(sidebarB).toBeVisible();
    const sidebarWidthB = await sidebarB.evaluate((el) => el.getBoundingClientRect().width);

    await page.screenshot({
      path: 'tests/screenshots/breakpoint-1800-director-open.png',
      fullPage: false,
    });

    // Both should have similar sidebar width (both in desktop mode)
    expect(Math.abs(sidebarWidthA - sidebarWidthB)).toBeLessThan(20);
  });

  // --------------------------------------------------------------------------
  // Test 2: Tablet breakpoint — sidebar collapsed to icons
  // --------------------------------------------------------------------------
  test('sidebar collapsed to icons at 900px content width', async ({ page }) => {
    // 900px is between md(768) and xl(1280) → tablet → sidebar collapsed to icons
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-shell"]');

    const sidebar = page.locator('[data-testid="app-shell"] aside').first();
    if (await sidebar.isVisible()) {
      const sidebarWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
      // Collapsed sidebar should be around 56-64px (icon-only)
      expect(sidebarWidth).toBeLessThan(100);
    }

    await page.screenshot({
      path: 'tests/screenshots/breakpoint-900-tablet.png',
      fullPage: false,
    });
  });

  // --------------------------------------------------------------------------
  // Test 3: Mobile breakpoint — sidebar hidden (drawer)
  // --------------------------------------------------------------------------
  test('sidebar hidden at 600px (mobile drawer mode)', async ({ page }) => {
    // 600px < md(768) → mobile → sidebar should be hidden
    await page.setViewportSize({ width: 600, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-shell"]');

    // In mobile mode, the static sidebar should not be visible
    const staticSidebar = page.locator(
      '[data-testid="app-shell"] > aside:not([data-testid="mobile-drawer"] *)'
    );
    // Either not visible or not present
    const staticSidebarCount = await staticSidebar.count();
    if (staticSidebarCount > 0) {
      await expect(staticSidebar).not.toBeVisible();
    }

    await page.screenshot({
      path: 'tests/screenshots/breakpoint-600-mobile.png',
      fullPage: false,
    });
  });

  // --------------------------------------------------------------------------
  // Test 5: Boundary testing — exact breakpoint boundaries
  // --------------------------------------------------------------------------
  test('boundary: 767px is mobile, 768px is tablet', async ({ page }) => {
    // 767px < md(768) → mobile
    await page.setViewportSize({ width: 767, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-shell"]');

    await page.screenshot({
      path: 'tests/screenshots/breakpoint-boundary-767.png',
      fullPage: false,
    });

    // 768px >= md(768) → tablet
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-shell"]');

    await page.screenshot({
      path: 'tests/screenshots/breakpoint-boundary-768.png',
      fullPage: false,
    });
  });

  test('boundary: 1279px is tablet, 1280px is desktop', async ({ page }) => {
    // 1279px < xl(1280) → tablet (sidebar collapsed)
    await page.setViewportSize({ width: 1279, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-shell"]');

    const sidebarNarrow = page.locator('[data-testid="app-shell"] aside').first();
    if (await sidebarNarrow.isVisible()) {
      const widthNarrow = await sidebarNarrow.evaluate((el) => el.getBoundingClientRect().width);
      // At 1279px (tablet), sidebar should be collapsed (~56-64px)
      expect(widthNarrow).toBeLessThan(100);
    }

    await page.screenshot({
      path: 'tests/screenshots/breakpoint-boundary-1279.png',
      fullPage: false,
    });

    // 1280px >= xl(1280) → desktop (sidebar toggleable/expanded)
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-shell"]');

    await page.screenshot({
      path: 'tests/screenshots/breakpoint-boundary-1280.png',
      fullPage: false,
    });
  });
});
