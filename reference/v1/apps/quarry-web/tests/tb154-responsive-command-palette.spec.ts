import { test, expect } from '@playwright/test';
import { setViewport, DEVICE_PRESETS } from './helpers/responsive';

test.describe('TB154: Responsive Command Palette', () => {
  test.describe('Mobile Viewport (375px)', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, DEVICE_PRESETS.mobile);
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('opens full-screen command palette on mobile', async ({ page }) => {
      // Open using the mobile search button
      await page.getByTestId('mobile-search-button').click();

      // Command palette should be visible
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Should be full screen (no backdrop visible - full screen layout)
      const palette = page.getByTestId('command-palette');
      const boundingBox = await palette.boundingBox();
      expect(boundingBox).not.toBeNull();
      // Full screen should fill the viewport
      expect(boundingBox!.width).toBeGreaterThanOrEqual(370);
      expect(boundingBox!.height).toBeGreaterThanOrEqual(600);
    });

    test('mobile search button in header opens command palette', async ({ page }) => {
      // Mobile search button should be visible
      const searchButton = page.getByTestId('mobile-search-button');
      await expect(searchButton).toBeVisible();

      // Click search button
      await searchButton.click();

      // Command palette should open
      await expect(page.getByTestId('command-palette')).toBeVisible();
    });

    test('mobile command palette has back button to close', async ({ page }) => {
      // Open command palette
      await page.getByTestId('mobile-search-button').click();
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Should have a close button (ChevronLeft)
      const closeButton = page.getByTestId('command-palette-close-mobile');
      await expect(closeButton).toBeVisible();

      // Click to close
      await closeButton.click();
      await expect(page.getByTestId('command-palette')).not.toBeVisible();
    });

    test('mobile command palette shows navigation items', async ({ page }) => {
      // Open command palette
      await page.getByTestId('mobile-search-button').click();
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Check navigation items are visible
      await expect(page.getByTestId('command-item-nav-dashboard')).toBeVisible();
      await expect(page.getByTestId('command-item-nav-tasks')).toBeVisible();
      await expect(page.getByTestId('command-item-nav-plans')).toBeVisible();
    });

    test('mobile command items have large touch targets', async ({ page }) => {
      // Open command palette
      await page.getByTestId('mobile-search-button').click();
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Check that command items have adequate height for touch
      const taskItem = page.getByTestId('command-item-nav-tasks');
      const boundingBox = await taskItem.boundingBox();
      expect(boundingBox).not.toBeNull();
      // Min touch target should be >= 44px
      expect(boundingBox!.height).toBeGreaterThanOrEqual(44);
    });

    test('mobile command palette hides keyboard shortcuts', async ({ page }) => {
      // Open command palette
      await page.getByTestId('mobile-search-button').click();
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Keyboard shortcuts (kbd elements) should not be visible on mobile
      // Check that there are no visible kbd elements within command items
      const kbdElements = page.locator('[data-testid^="command-item-"] kbd');
      const count = await kbdElements.count();
      // Should have 0 visible kbd elements on mobile
      for (let i = 0; i < count; i++) {
        await expect(kbdElements.nth(i)).not.toBeVisible();
      }
    });

    test('mobile command palette navigates to tasks page', async ({ page }) => {
      // Open command palette
      await page.getByTestId('mobile-search-button').click();
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Click on Tasks navigation item
      await page.getByTestId('command-item-nav-tasks').click();

      // Should navigate to tasks page
      await expect(page).toHaveURL(/\/tasks/);
      await expect(page.getByTestId('tasks-page')).toBeVisible();

      // Command palette should be closed after navigation
      await expect(page.getByTestId('command-palette')).not.toBeVisible();
    });

    test('mobile command palette search works', async ({ page }) => {
      // Open command palette
      await page.getByTestId('mobile-search-button').click();
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Type in search
      await page.getByTestId('command-palette-input').fill('task');

      // Should show filtered results
      await expect(page.getByTestId('command-item-nav-tasks')).toBeVisible();
      await expect(page.getByTestId('command-item-nav-task-flow')).toBeVisible();

      // Should not show unrelated items
      await expect(page.getByTestId('command-item-nav-messages')).not.toBeVisible();
    });

    test('mobile command palette Escape key closes', async ({ page }) => {
      // Open command palette
      await page.getByTestId('mobile-search-button').click();
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Should close
      await expect(page.getByTestId('command-palette')).not.toBeVisible();
    });
  });

  test.describe('Desktop Viewport (1280px)', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, DEVICE_PRESETS.desktop);
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('desktop shows centered modal command palette', async ({ page }) => {
      // Open with Cmd+K
      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Should have backdrop
      const backdrop = page.getByTestId('command-palette-backdrop');
      await expect(backdrop).toBeVisible();
    });

    test('desktop command palette has keyboard shortcut hints', async ({ page }) => {
      // Open with Cmd+K
      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Should show keyboard shortcuts - look for any kbd element
      const kbdElements = page.locator('[data-testid^="command-item-"] kbd');
      const count = await kbdElements.count();
      expect(count).toBeGreaterThan(0);
    });

    test('desktop mobile search button is hidden', async ({ page }) => {
      // Mobile search button should not be visible on desktop
      await expect(page.getByTestId('mobile-search-button')).not.toBeVisible();
    });

    test('desktop command palette closes on backdrop click', async ({ page }) => {
      // Open with Cmd+K
      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Click backdrop
      await page.getByTestId('command-palette-backdrop').click({ position: { x: 50, y: 500 } });

      // Should close
      await expect(page.getByTestId('command-palette')).not.toBeVisible();
    });
  });

  test.describe('Tablet Viewport (768px)', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, DEVICE_PRESETS.tablet);
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('tablet shows centered modal command palette', async ({ page }) => {
      // Open with Cmd+K
      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Should have backdrop (not full-screen mobile layout)
      const backdrop = page.getByTestId('command-palette-backdrop');
      await expect(backdrop).toBeVisible();
    });
  });

  test.describe('Viewport Transitions', () => {
    test('command palette adapts when resizing from mobile to desktop', async ({ page }) => {
      // Start at mobile
      await setViewport(page, DEVICE_PRESETS.mobile);
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Open command palette
      await page.getByTestId('mobile-search-button').click();
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Should be full-screen (no backdrop)
      await expect(page.getByTestId('command-palette-backdrop')).not.toBeVisible();

      // Close
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('command-palette')).not.toBeVisible();

      // Resize to desktop
      await setViewport(page, DEVICE_PRESETS.desktop);
      await page.waitForTimeout(100); // Allow React to re-render

      // Open command palette
      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Should have backdrop (desktop modal style)
      await expect(page.getByTestId('command-palette-backdrop')).toBeVisible();
    });
  });
});
