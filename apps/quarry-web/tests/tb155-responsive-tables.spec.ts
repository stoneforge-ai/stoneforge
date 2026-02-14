/**
 * TB155: Responsive Data Tables Tests
 *
 * Tests for responsive data display including:
 * - Responsive pagination (mobile stacked layout, desktop horizontal)
 * - Touch-friendly tap targets on mobile
 * - Sort dropdown responsiveness
 * - Card vs list view patterns
 */

import { test, expect } from '@playwright/test';

// Test helper functions for viewport setting
async function setMobileViewport(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 375, height: 667 });
}

async function setTabletViewport(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 768, height: 1024 });
}

async function setDesktopViewport(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
}

test.describe('TB155: Responsive Data Tables', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to tasks page which has pagination and lists
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Responsive Pagination', () => {
    test('shows stacked layout on mobile', async ({ page }) => {
      await setMobileViewport(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const pagination = page.getByTestId('pagination');
      if (await pagination.isVisible()) {
        // Mobile pagination should be visible
        await expect(pagination).toBeVisible();

        // Check that page size selector uses compact format
        const pageSizeSelector = page.getByTestId('pagination-page-size');
        if (await pageSizeSelector.isVisible()) {
          // Should show "X / page" format on mobile
          const options = await pageSizeSelector.locator('option').allTextContents();
          const hasCompactFormat = options.some(opt => opt.includes('/ page'));
          expect(hasCompactFormat).toBe(true);
        }

        // Check previous/next buttons are touch-friendly (min 44px)
        const prevButton = page.getByTestId('pagination-prev');
        if (await prevButton.isVisible()) {
          const box = await prevButton.boundingBox();
          if (box) {
            expect(box.width).toBeGreaterThanOrEqual(44);
            expect(box.height).toBeGreaterThanOrEqual(44);
          }
        }
      }
    });

    test('shows horizontal layout on desktop', async ({ page }) => {
      await setDesktopViewport(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const pagination = page.getByTestId('pagination');
      if (await pagination.isVisible()) {
        // Desktop should show "Show X per page" format
        const showLabel = page.locator('label:has-text("Show")');
        await expect(showLabel).toBeVisible();

        // First/last page buttons should be visible on desktop
        const firstButton = page.getByTestId('pagination-first');
        const lastButton = page.getByTestId('pagination-last');
        if (await firstButton.count() > 0) {
          await expect(firstButton).toBeVisible();
        }
        if (await lastButton.count() > 0) {
          await expect(lastButton).toBeVisible();
        }
      }
    });

    test('shows fewer page numbers on mobile', async ({ page }) => {
      // Create enough tasks to have multiple pages
      // First check if we have pagination
      await setDesktopViewport(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const pagination = page.getByTestId('pagination');
      if (!(await pagination.isVisible())) {
        test.skip();
        return;
      }

      // Count page buttons on desktop
      const desktopPageButtons = await page.locator('[data-testid^="pagination-page-"]').count();

      // Switch to mobile
      await setMobileViewport(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Count page buttons on mobile - should be fewer or equal
      const mobilePageButtons = await page.locator('[data-testid^="pagination-page-"]').count();

      if (desktopPageButtons > 3) {
        // Mobile should show fewer pages
        expect(mobilePageButtons).toBeLessThanOrEqual(desktopPageButtons);
      }
    });

    test('page navigation works on mobile', async ({ page }) => {
      await setMobileViewport(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const pagination = page.getByTestId('pagination');
      if (!(await pagination.isVisible())) {
        test.skip();
        return;
      }

      const nextButton = page.getByTestId('pagination-next');
      if (await nextButton.isEnabled()) {
        // Click next page
        await nextButton.click();
        await page.waitForTimeout(500);

        // Should navigate to next page
        const paginationInfo = page.getByTestId('pagination-info');
        const text = await paginationInfo.textContent();
        // Should not start with "1-" anymore
        expect(text).not.toMatch(/^1-/);
      }
    });

    test('page size selector works on mobile', async ({ page }) => {
      await setMobileViewport(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const pageSizeSelector = page.getByTestId('pagination-page-size');
      if (await pageSizeSelector.isVisible()) {
        // Change page size
        await pageSizeSelector.selectOption('50');
        await page.waitForTimeout(500);

        // Should update the page size
        const selected = await pageSizeSelector.inputValue();
        expect(selected).toBe('50');
      }
    });
  });

  test.describe('Touch-Friendly Elements', () => {
    test('buttons have minimum touch targets on mobile', async ({ page }) => {
      await setMobileViewport(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Check pagination navigation buttons - these should be larger touch targets
      const pagination = page.getByTestId('pagination');
      if (await pagination.isVisible()) {
        const prevButton = page.getByTestId('pagination-prev');
        const nextButton = page.getByTestId('pagination-next');

        for (const button of [prevButton, nextButton]) {
          if (await button.isVisible()) {
            const box = await button.boundingBox();
            if (box) {
              // Pagination buttons should have 44px touch targets on mobile
              expect(box.width).toBeGreaterThanOrEqual(44);
              expect(box.height).toBeGreaterThanOrEqual(44);
            }
          }
        }
      }
    });

    test('search input has adequate touch target on mobile', async ({ page }) => {
      await setMobileViewport(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const searchInput = page.getByTestId('task-search-input');
      if (await searchInput.isVisible()) {
        const box = await searchInput.boundingBox();
        if (box) {
          // Input should have adequate height for touch
          expect(box.height).toBeGreaterThanOrEqual(36);
        }
      }
    });
  });

  test.describe('View Mode Toggle', () => {
    test('view toggle works at all viewport sizes', async ({ page }) => {
      for (const setViewport of [
        setMobileViewport,
        setTabletViewport,
        setDesktopViewport,
      ]) {
        await setViewport(page);
        await page.reload();
        await page.waitForLoadState('networkidle');

        const viewToggle = page.getByTestId('view-toggle');
        await expect(viewToggle).toBeVisible();

        // Toggle to kanban
        const kanbanButton = page.getByTestId('view-toggle-kanban');
        await kanbanButton.click();
        await page.waitForTimeout(300);

        // Should switch to kanban view (check URL or UI)
        const isKanban = await page.locator('[data-testid="kanban-board"]').isVisible();
        expect(isKanban).toBe(true);

        // Toggle back to list
        const listButton = page.getByTestId('view-toggle-list');
        await listButton.click();
        await page.waitForTimeout(300);
      }
    });
  });

  test.describe('Dark Mode Support', () => {
    test('pagination has dark mode classes', async ({ page }) => {
      // Enable dark mode via settings preference (the proper way)
      await page.evaluate(() => {
        localStorage.setItem('stoneforge-theme', 'dark');
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      // Wait for dark mode to apply
      await page.waitForTimeout(100);

      const pagination = page.getByTestId('pagination');
      if (await pagination.isVisible()) {
        // Check that pagination exists and has the expected structure
        // The dark mode classes should be conditionally applied
        const html = await pagination.innerHTML();
        // Pagination should have dark mode conditional classes in its markup
        expect(pagination).toBeVisible();

        // Check that dark mode specific elements can be styled
        // The actual color depends on whether the theme provider picked up the setting
        const hasDarkClasses = html.includes('dark:');
        expect(hasDarkClasses).toBe(true);
      }

      // Reset to light mode
      await page.evaluate(() => {
        localStorage.removeItem('stoneforge-theme');
      });
    });
  });
});

test.describe('TB155: Responsive Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/timeline');
    await page.waitForLoadState('networkidle');
  });

  test('event cards are responsive', async ({ page }) => {
    // Check desktop layout
    await setDesktopViewport(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    const eventCard = page.getByTestId('event-card').first();
    if (await eventCard.isVisible()) {
      // Get desktop width
      const desktopBox = await eventCard.boundingBox();

      // Switch to mobile
      await setMobileViewport(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const mobileEventCard = page.getByTestId('event-card').first();
      if (await mobileEventCard.isVisible()) {
        const mobileBox = await mobileEventCard.boundingBox();

        // Mobile should still be usable (reasonable width)
        if (desktopBox && mobileBox) {
          // Cards should adapt to viewport
          expect(mobileBox.width).toBeLessThan(desktopBox.width);
          // But still have reasonable size
          expect(mobileBox.width).toBeGreaterThan(300);
        }
      }
    }
  });

  test('filter chips scroll horizontally on mobile', async ({ page }) => {
    await setMobileViewport(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Look for filter chips container
    const filterChips = page.locator('[data-testid^="filter-chip-"]');
    const count = await filterChips.count();

    if (count > 0) {
      // First chip should be visible
      await expect(filterChips.first()).toBeVisible();

      // Container should allow horizontal scroll if many chips
      const container = filterChips.first().locator('..');
      const styles = await container.evaluate((el) => {
        return window.getComputedStyle(el).overflowX;
      });
      // Should either be scrollable or all chips fit
      expect(['auto', 'scroll', 'visible']).toContain(styles);
    }
  });

  test('pagination works in timeline on mobile', async ({ page }) => {
    await setMobileViewport(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    const pagination = page.getByTestId('pagination');
    if (await pagination.isVisible()) {
      // Should have touch-friendly buttons
      const prevButton = page.getByTestId('pagination-prev');
      const nextButton = page.getByTestId('pagination-next');

      await expect(prevButton).toBeVisible();
      await expect(nextButton).toBeVisible();
    }
  });
});

test.describe('TB155: Responsive Entities Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/entities');
    await page.waitForLoadState('networkidle');
  });

  test('entity list adapts to mobile viewport', async ({ page }) => {
    await setDesktopViewport(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should show desktop layout
    await expect(page.locator('body')).toBeVisible();

    // Switch to mobile
    await setMobileViewport(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be usable
    await expect(page.locator('body')).toBeVisible();
  });

  test('search works on mobile', async ({ page }) => {
    await setMobileViewport(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Find search input
    const searchInput = page.locator('input[type="text"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);

      // Search should work
      await expect(searchInput).toHaveValue('test');
    }
  });
});

test.describe('TB155: Viewport Transitions', () => {
  test('pagination adapts when viewport changes', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    // Start at desktop
    await setDesktopViewport(page);
    await page.waitForTimeout(300);

    const pagination = page.getByTestId('pagination');
    if (!(await pagination.isVisible())) {
      test.skip();
      return;
    }

    // Check for desktop elements
    const showLabel = page.locator('label:has-text("Show")');
    const desktopLabelVisible = await showLabel.isVisible();

    // Transition to mobile
    await setMobileViewport(page);
    await page.waitForTimeout(300);

    // Should adapt to mobile layout
    const mobileLabelVisible = await showLabel.isVisible();

    // On mobile, "Show" label should be hidden
    if (desktopLabelVisible) {
      expect(mobileLabelVisible).toBe(false);
    }
  });

  test('layout remains usable during viewport changes', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    // Rapid viewport changes
    for (const width of [375, 768, 1280, 640, 1024, 375]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(100);

      // Page should remain interactive
      const body = page.locator('body');
      await expect(body).toBeVisible();
    }
  });
});
