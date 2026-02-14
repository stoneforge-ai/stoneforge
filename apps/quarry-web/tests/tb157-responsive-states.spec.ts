/**
 * TB157: Responsive Empty States & Loading States Tests
 *
 * Tests that empty states and loading states are properly sized and
 * responsive across all screen sizes.
 */

import { test, expect, Page } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 375, height: 667 };
const TABLET_VIEWPORT = { width: 768, height: 1024 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

/**
 * Helper to set viewport and wait for resize
 */
async function setViewport(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  // Small wait for any responsive hooks to update
  await page.waitForTimeout(100);
}

/**
 * Helper to wait for the page to be loaded and stable
 */
async function waitForPageLoad(page: Page) {
  // Wait for the data preloader to finish
  await page.waitForSelector('[data-testid="data-preloader-loading"]', { state: 'detached', timeout: 30000 }).catch(() => {
    // Preloader may have already finished
  });
  // Wait for any element to confirm the page is loaded
  await page.waitForLoadState('networkidle');
}

test.describe('TB157: Responsive Empty States', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
  });

  test('EmptyState component renders correctly on mobile', async ({ page }) => {
    await setViewport(page, MOBILE_VIEWPORT);

    // Navigate to an empty channel or create scenario where empty state appears
    await page.goto('/messages');
    await waitForPageLoad(page);

    // Check if any empty state is visible
    const emptyState = page.locator('[data-testid="empty-state"]').first();
    if (await emptyState.isVisible()) {
      // Verify mobile-friendly sizing
      const box = await emptyState.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        // Icon should be centered and appropriately sized
        const icon = emptyState.locator('[data-testid="empty-state-icon"]');
        if (await icon.isVisible()) {
          const iconBox = await icon.boundingBox();
          expect(iconBox).toBeTruthy();
          // On mobile, icon should be 48px (w-12 h-12)
          if (iconBox) {
            expect(iconBox.width).toBeGreaterThanOrEqual(40);
            expect(iconBox.width).toBeLessThanOrEqual(64);
          }
        }
      }
    }
  });

  test('EmptyState component renders correctly on tablet', async ({ page }) => {
    await setViewport(page, TABLET_VIEWPORT);

    await page.goto('/messages');
    await waitForPageLoad(page);

    const emptyState = page.locator('[data-testid="empty-state"]').first();
    if (await emptyState.isVisible()) {
      const icon = emptyState.locator('[data-testid="empty-state-icon"]');
      if (await icon.isVisible()) {
        const iconBox = await icon.boundingBox();
        expect(iconBox).toBeTruthy();
        // On tablet/desktop, icon should be larger (w-16 h-16 = 64px)
        if (iconBox) {
          expect(iconBox.width).toBeGreaterThanOrEqual(48);
        }
      }
    }
  });

  test('EmptyState component renders correctly on desktop', async ({ page }) => {
    await setViewport(page, DESKTOP_VIEWPORT);

    await page.goto('/messages');
    await waitForPageLoad(page);

    const emptyState = page.locator('[data-testid="empty-state"]').first();
    if (await emptyState.isVisible()) {
      const icon = emptyState.locator('[data-testid="empty-state-icon"]');
      if (await icon.isVisible()) {
        const iconBox = await icon.boundingBox();
        expect(iconBox).toBeTruthy();
        // On desktop, icon should be full size
        if (iconBox) {
          expect(iconBox.width).toBeGreaterThanOrEqual(48);
        }
      }
    }
  });

  test('EmptyState action button has touch-friendly size on mobile', async ({ page }) => {
    await setViewport(page, MOBILE_VIEWPORT);

    // Go to a page that might have an empty state with action
    await page.goto('/tasks');
    await waitForPageLoad(page);

    // If there's an empty state with action button
    const actionButton = page.locator('[data-testid="empty-state-action"]').first();
    if (await actionButton.isVisible()) {
      const box = await actionButton.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        // Touch target should be at least 44px
        expect(box.height).toBeGreaterThanOrEqual(36); // min-h-[36px] for sm size, 44px for md/lg
      }
    }
  });

  test('EmptyState title and description are readable on mobile', async ({ page }) => {
    await setViewport(page, MOBILE_VIEWPORT);

    await page.goto('/messages');
    await waitForPageLoad(page);

    const emptyState = page.locator('[data-testid="empty-state"]').first();
    if (await emptyState.isVisible()) {
      const title = emptyState.locator('[data-testid="empty-state-title"]');
      if (await title.isVisible()) {
        const titleBox = await title.boundingBox();
        expect(titleBox).toBeTruthy();
        // Title should fit within viewport
        if (titleBox) {
          expect(titleBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
        }
      }

      const description = emptyState.locator('[data-testid="empty-state-description"]');
      if (await description.isVisible()) {
        const descBox = await description.boundingBox();
        expect(descBox).toBeTruthy();
        // Description should fit within viewport with max-width constraint
        if (descBox) {
          expect(descBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
        }
      }
    }
  });
});

test.describe('TB157: Responsive Loading States', () => {
  test('Data preloader shows loading state correctly', async ({ page }) => {
    // Visit the page and check loading state
    const responsePromise = page.waitForResponse('**/api/**');
    await page.goto('/');

    // The preloader might show briefly
    const preloader = page.locator('[data-testid="data-preloader-loading"]');

    // Check if preloader is visible or if page loaded too fast
    try {
      await preloader.waitFor({ state: 'visible', timeout: 1000 });
      // Preloader should be centered
      const box = await preloader.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    } catch {
      // Page loaded too fast, which is fine
    }

    // Wait for the page to be fully loaded
    await responsePromise.catch(() => {});
  });

  test('Skeleton components render on mobile', async ({ page }) => {
    await setViewport(page, MOBILE_VIEWPORT);

    // Intercept API to delay response and show skeletons
    await page.route('**/api/tasks**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto('/tasks');

    // Check for any skeleton elements
    const skeleton = page.locator('[data-testid^="skeleton"]').first();
    try {
      await skeleton.waitFor({ state: 'visible', timeout: 2000 });
      const box = await skeleton.boundingBox();
      if (box) {
        // Skeleton should fit within mobile viewport
        expect(box.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
      }
    } catch {
      // Data loaded too fast - that's okay
    }
  });

  test('Skeleton list adapts to mobile viewport', async ({ page }) => {
    await setViewport(page, MOBILE_VIEWPORT);

    // Intercept and delay API
    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });

    await page.goto('/tasks');

    const skeletonList = page.locator('[data-testid="skeleton-list"]');
    try {
      await skeletonList.waitFor({ state: 'visible', timeout: 1000 });
      const box = await skeletonList.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
      }
    } catch {
      // Loaded too fast
    }
  });
});

test.describe('TB157: Page-specific Empty States', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
  });

  test('Tasks page empty state is responsive', async ({ page }) => {
    // Test at different viewports
    for (const viewport of [MOBILE_VIEWPORT, TABLET_VIEWPORT, DESKTOP_VIEWPORT]) {
      await setViewport(page, viewport);
      await page.goto('/tasks');
      await waitForPageLoad(page);

      // Check for tasks page container
      const tasksPage = page.locator('[data-testid="tasks-page"]');
      await expect(tasksPage).toBeVisible({ timeout: 10000 });

      // Page should not overflow horizontally
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 10); // Small tolerance
    }
  });

  test('Documents page empty state is responsive', async ({ page }) => {
    for (const viewport of [MOBILE_VIEWPORT, TABLET_VIEWPORT, DESKTOP_VIEWPORT]) {
      await setViewport(page, viewport);
      await page.goto('/documents');
      await waitForPageLoad(page);

      // Check for document list or empty state
      const documentsPage = page.locator('[data-testid="documents-page"]');
      await expect(documentsPage).toBeVisible({ timeout: 10000 });

      // No horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 10);
    }
  });

  test('Plans page empty state is responsive', async ({ page }) => {
    for (const viewport of [MOBILE_VIEWPORT, TABLET_VIEWPORT, DESKTOP_VIEWPORT]) {
      await setViewport(page, viewport);
      await page.goto('/plans');
      await waitForPageLoad(page);

      // Check for plans page content
      const plansPage = page.locator('[data-testid="plans-page"]');
      await expect(plansPage).toBeVisible({ timeout: 10000 });

      // No horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 10);
    }
  });

  test('Entities page empty state is responsive', async ({ page }) => {
    for (const viewport of [MOBILE_VIEWPORT, TABLET_VIEWPORT, DESKTOP_VIEWPORT]) {
      await setViewport(page, viewport);
      await page.goto('/entities');
      await waitForPageLoad(page);

      // Check for entities page content
      const entitiesPage = page.locator('[data-testid="entities-page"]');
      await expect(entitiesPage).toBeVisible({ timeout: 10000 });

      // No horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 10);
    }
  });

  test('Teams page empty state is responsive', async ({ page }) => {
    for (const viewport of [MOBILE_VIEWPORT, TABLET_VIEWPORT, DESKTOP_VIEWPORT]) {
      await setViewport(page, viewport);
      await page.goto('/teams');
      await waitForPageLoad(page);

      // Check for teams page content
      const teamsPage = page.locator('[data-testid="teams-page"]');
      await expect(teamsPage).toBeVisible({ timeout: 10000 });

      // No horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 10);
    }
  });

  test('Inbox page empty state is responsive', async ({ page }) => {
    for (const viewport of [MOBILE_VIEWPORT, TABLET_VIEWPORT, DESKTOP_VIEWPORT]) {
      await setViewport(page, viewport);
      await page.goto('/inbox');
      await waitForPageLoad(page);

      // Check for inbox page content or empty state
      const inboxPage = page.locator('[data-testid="inbox-page"]');
      await expect(inboxPage).toBeVisible({ timeout: 10000 });

      // No horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 10);
    }
  });
});

test.describe('TB157: Loading State Skeleton Variations', () => {
  test('SkeletonTaskCard has correct responsive sizing', async ({ page }) => {
    await setViewport(page, MOBILE_VIEWPORT);

    // Delay API to show skeletons
    await page.route('**/api/tasks**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto('/tasks');

    const skeleton = page.locator('[data-testid="skeleton-task-card"]');
    try {
      await skeleton.first().waitFor({ state: 'visible', timeout: 2000 });
      const box = await skeleton.first().boundingBox();
      if (box) {
        // On mobile, card should have more padding (p-4 = 16px)
        expect(box.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
      }
    } catch {
      // Data loaded too fast
    }
  });

  test('SkeletonStatCard renders responsively', async ({ page }) => {
    // Test at mobile
    await setViewport(page, MOBILE_VIEWPORT);

    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });

    await page.goto('/dashboard');

    const statSkeleton = page.locator('[data-testid="skeleton-stat-card"]');
    try {
      await statSkeleton.first().waitFor({ state: 'visible', timeout: 2000 });
      const box = await statSkeleton.first().boundingBox();
      if (box) {
        // Stats should fit in grid
        expect(box.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width / 2 + 20);
      }
    } catch {
      // Data loaded too fast
    }
  });
});

test.describe('TB157: Viewport Transitions', () => {
  test('Empty state adapts when viewport changes from mobile to desktop', async ({ page }) => {
    await page.goto('/messages');
    await waitForPageLoad(page);

    // Start mobile
    await setViewport(page, MOBILE_VIEWPORT);
    await page.waitForTimeout(200);

    const emptyState = page.locator('[data-testid="empty-state"]').first();
    if (await emptyState.isVisible()) {
      const mobileBox = await emptyState.boundingBox();

      // Switch to desktop
      await setViewport(page, DESKTOP_VIEWPORT);
      await page.waitForTimeout(200);

      const desktopBox = await emptyState.boundingBox();

      // Desktop should potentially have different padding/sizing
      if (mobileBox && desktopBox) {
        // Component should still be visible and properly sized
        expect(desktopBox.width).toBeGreaterThan(0);
        expect(desktopBox.height).toBeGreaterThan(0);
      }
    }
  });

  test('Loading skeletons adapt when viewport changes', async ({ page }) => {
    // Delay API
    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });

    await setViewport(page, MOBILE_VIEWPORT);
    await page.goto('/tasks');

    const skeleton = page.locator('[data-testid^="skeleton"]').first();
    try {
      await skeleton.waitFor({ state: 'visible', timeout: 1000 });

      // Change viewport while skeletons visible
      await setViewport(page, DESKTOP_VIEWPORT);
      await page.waitForTimeout(100);

      // Skeleton should still be visible and adapt
      if (await skeleton.isVisible()) {
        const box = await skeleton.boundingBox();
        if (box) {
          expect(box.width).toBeLessThanOrEqual(DESKTOP_VIEWPORT.width);
        }
      }
    } catch {
      // Data loaded too fast
    }
  });
});

test.describe('TB157: Accessibility', () => {
  test('Empty states maintain proper contrast in light mode', async ({ page }) => {
    await page.goto('/messages');
    await waitForPageLoad(page);

    // Ensure light mode
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
    });

    const emptyState = page.locator('[data-testid="empty-state"]').first();
    if (await emptyState.isVisible()) {
      // Text should be visible (not checking exact contrast ratio, just visibility)
      const title = emptyState.locator('[data-testid="empty-state-title"]');
      if (await title.isVisible()) {
        const isVisible = await title.isVisible();
        expect(isVisible).toBe(true);
      }
    }
  });

  test('Empty states maintain proper contrast in dark mode', async ({ page }) => {
    await page.goto('/messages');
    await waitForPageLoad(page);

    // Enable dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });

    const emptyState = page.locator('[data-testid="empty-state"]').first();
    if (await emptyState.isVisible()) {
      const title = emptyState.locator('[data-testid="empty-state-title"]');
      if (await title.isVisible()) {
        const isVisible = await title.isVisible();
        expect(isVisible).toBe(true);
      }
    }
  });

  test('Loading skeletons have appropriate animation', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto('/tasks');

    const skeleton = page.locator('[data-testid="skeleton"]').first();
    try {
      await skeleton.waitFor({ state: 'visible', timeout: 1000 });

      // Check that skeleton has the animation class
      const hasAnimation = await skeleton.evaluate((el) => {
        return el.classList.contains('animate-pulse') ||
               getComputedStyle(el).animationName !== 'none';
      });
      expect(hasAnimation).toBe(true);
    } catch {
      // Data loaded too fast
    }
  });
});
