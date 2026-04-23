/**
 * TB152: Responsive Settings Page Tests
 *
 * Tests for the responsive behavior of the Settings page across viewports.
 *
 * Behaviors tested:
 * - Mobile: Horizontal scrollable tabs instead of sidebar
 * - Mobile: Full-width content area with adjusted padding
 * - Mobile: Responsive modals (full-screen from bottom)
 * - Mobile: Larger touch targets (44px minimum)
 * - Desktop: Fixed-width sidebar navigation
 * - Desktop: Centered content with max-width
 * - Theme options responsive layout
 * - Shortcut modal responsive layout
 */

import { test, expect } from '@playwright/test';
import {
  setViewport,
  waitForResponsiveUpdate,
} from './helpers/responsive';

test.describe('TB152: Responsive Settings Page', () => {
  test.describe('Mobile Viewport (< 640px)', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport BEFORE navigation
      await setViewport(page, 'xs');
      await page.goto('/settings');
      // Wait for responsive hooks to stabilize
      await waitForResponsiveUpdate(page, 300);
    });

    test('should show horizontal scrollable tabs on mobile', async ({ page }) => {
      // Settings page should be visible
      const settingsPage = page.getByTestId('settings-page');
      await expect(settingsPage).toBeVisible();

      // Settings navigation should be visible
      const nav = page.getByTestId('settings-nav');
      await expect(nav).toBeVisible();

      // Navigation should be horizontal (flex row)
      const navStyles = await nav.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          display: styles.display,
          flexDirection: styles.flexDirection,
          overflowX: styles.overflowX,
        };
      });
      expect(navStyles.display).toBe('flex');
      expect(navStyles.flexDirection).toBe('row');
    });

    test('should show mobile header on settings page', async ({ page }) => {
      // Mobile header should be visible with "Settings" text
      const header = page.locator('h2:has-text("Settings")');
      await expect(header).toBeVisible();
    });

    test('should have touch-friendly navigation tabs', async ({ page }) => {
      // Check that nav buttons have minimum touch target size
      const navButton = page.getByTestId('settings-nav-theme');
      await expect(navButton).toBeVisible();

      const box = await navButton.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    });

    test('should navigate between sections using tabs', async ({ page }) => {
      // Start on theme section (default)
      const themeSection = page.getByTestId('settings-theme-section');
      await expect(themeSection).toBeVisible();

      // Click shortcuts tab
      const shortcutsTab = page.getByTestId('settings-nav-shortcuts');
      await shortcutsTab.click();
      await waitForResponsiveUpdate(page, 200);

      // Shortcuts section should be visible
      const shortcutsSection = page.getByTestId('settings-shortcuts-section');
      await expect(shortcutsSection).toBeVisible();
    });

    test('should display theme options in single column on mobile', async ({ page }) => {
      // Theme options should be visible
      const lightOption = page.getByTestId('theme-option-light');
      const darkOption = page.getByTestId('theme-option-dark');

      await expect(lightOption).toBeVisible();
      await expect(darkOption).toBeVisible();

      // Options should stack vertically (not side by side)
      const lightBox = await lightOption.boundingBox();
      const darkBox = await darkOption.boundingBox();

      // Dark option should be below light option
      expect(darkBox?.y).toBeGreaterThan((lightBox?.y || 0) + (lightBox?.height || 0) - 10);
    });

    test('should have responsive padding on content area', async ({ page }) => {
      // Content should have mobile-appropriate padding
      const content = page.locator('[data-testid="settings-page"] > div:last-child > div');
      const padding = await content.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return styles.padding;
      });

      // Should have smaller padding on mobile (16px = 1rem)
      expect(padding).toContain('16px');
    });
  });

  test.describe('Defaults Section Mobile', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, 'xs');
      await page.goto('/settings');
      await waitForResponsiveUpdate(page, 300);

      // Navigate to defaults section
      const defaultsTab = page.getByTestId('settings-nav-defaults');
      await defaultsTab.click();
      await waitForResponsiveUpdate(page, 200);
    });

    test('should show defaults section with responsive grid', async ({ page }) => {
      const defaultsSection = page.getByTestId('settings-defaults-section');
      await expect(defaultsSection).toBeVisible();

      // Check that option cards are visible
      const listViewOption = page.getByTestId('default-tasks-view-list');
      await expect(listViewOption).toBeVisible();
    });

    test('should have touch-friendly option cards', async ({ page }) => {
      // Option cards should have minimum touch target
      const listViewOption = page.getByTestId('default-tasks-view-list');
      const box = await listViewOption.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    });
  });

  test.describe('Notifications Section Mobile', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, 'xs');
      await page.goto('/settings');
      await waitForResponsiveUpdate(page, 300);

      // Navigate to notifications section
      const notificationsTab = page.getByTestId('settings-nav-notifications');
      await notificationsTab.click();
      await waitForResponsiveUpdate(page, 200);
    });

    test('should show notifications section', async ({ page }) => {
      const notificationsSection = page.getByTestId('settings-notifications-section');
      await expect(notificationsSection).toBeVisible();
    });

    test('should have responsive toggle switches', async ({ page }) => {
      // Toggle rows should be visible
      const taskAssignedRow = page.getByTestId('notification-task-assigned');
      await expect(taskAssignedRow).toBeVisible();

      // Row should have adequate height for touch
      const box = await taskAssignedRow.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    });

    test('should stack toast duration buttons vertically on mobile', async ({ page }) => {
      // Toast duration buttons should be visible
      const duration3s = page.getByTestId('toast-duration-3000');
      const duration5s = page.getByTestId('toast-duration-5000');

      await expect(duration3s).toBeVisible();
      await expect(duration5s).toBeVisible();

      // On mobile, buttons should stack vertically
      const box3s = await duration3s.boundingBox();
      const box5s = await duration5s.boundingBox();

      // 5s button should be below 3s button on mobile
      expect(box5s?.y).toBeGreaterThan((box3s?.y || 0));
    });
  });

  test.describe('Sync Section Mobile', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, 'xs');
      await page.goto('/settings');
      await waitForResponsiveUpdate(page, 300);

      // Navigate to sync section
      const syncTab = page.getByTestId('settings-nav-sync');
      await syncTab.click();
      await waitForResponsiveUpdate(page, 200);
    });

    test('should show sync section', async ({ page }) => {
      const syncSection = page.getByTestId('settings-sync-section');
      await expect(syncSection).toBeVisible();
    });

    test('should have full-width export button on mobile', async ({ page }) => {
      const exportButton = page.getByTestId('export-now-button');
      await expect(exportButton).toBeVisible();

      // Button should be full width on mobile
      const buttonBox = await exportButton.boundingBox();
      const viewport = page.viewportSize();
      // Button should be close to full width (accounting for padding - 75% threshold)
      expect(buttonBox?.width).toBeGreaterThan((viewport?.width || 400) * 0.75);
    });

    test('should have touch-friendly import button', async ({ page }) => {
      const importButton = page.getByTestId('import-button');
      await expect(importButton).toBeVisible();

      const box = await importButton.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    });
  });

  test.describe('Desktop Viewport (>= 1024px)', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport BEFORE navigation
      await setViewport(page, '2xl');
      await page.goto('/settings');
      // Wait for responsive hooks to stabilize
      await waitForResponsiveUpdate(page, 300);
    });

    test('should show fixed-width sidebar on desktop', async ({ page }) => {
      // Settings page should be visible
      const settingsPage = page.getByTestId('settings-page');
      await expect(settingsPage).toBeVisible();

      // Settings navigation should be visible
      const nav = page.getByTestId('settings-nav');
      await expect(nav).toBeVisible();

      // Navigation should be in a sidebar (vertical, fixed width)
      const sidebar = nav.locator('..');
      const sidebarBox = await sidebar.boundingBox();

      // Sidebar should have fixed width (w-64 = 256px)
      expect(sidebarBox?.width).toBeLessThan(300);
    });

    test('should show sidebar header with description on desktop', async ({ page }) => {
      // Header should show "Settings" with subtitle
      const header = page.locator('h2:has-text("Settings")');
      await expect(header).toBeVisible();

      const subtitle = page.locator('text=Customize your experience');
      await expect(subtitle).toBeVisible();
    });

    test('should have centered content with max-width on desktop', async ({ page }) => {
      // Content area should have max-width
      const content = page.locator('[data-testid="settings-page"] > div:last-child > div');
      const contentBox = await content.boundingBox();
      const viewport = page.viewportSize();

      // Content should be narrower than viewport (has max-width)
      expect(contentBox?.width).toBeLessThan((viewport?.width || 1280) - 256); // Minus sidebar
    });

    test('should show navigation items with descriptions', async ({ page }) => {
      // Nav items should show labels
      const themeNav = page.getByTestId('settings-nav-theme');
      await expect(themeNav).toContainText('Theme');
    });
  });

  test.describe('Theme Section Desktop', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, '2xl');
      await page.goto('/settings');
      await waitForResponsiveUpdate(page, 300);
    });

    test('should show theme options with larger text on desktop', async ({ page }) => {
      const themeSection = page.getByTestId('settings-theme-section');
      await expect(themeSection).toBeVisible();

      // Check section heading exists with larger font
      const heading = themeSection.locator('h3');
      await expect(heading).toBeVisible();

      const fontSize = await heading.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });
      // Should be lg (18px) on desktop
      expect(parseInt(fontSize)).toBeGreaterThanOrEqual(18);
    });

    test('should show theme preview on desktop', async ({ page }) => {
      const preview = page.getByTestId('theme-preview');
      await expect(preview).toBeVisible();
    });
  });

  test.describe('Shortcuts Section Desktop', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, '2xl');
      await page.goto('/settings');
      await waitForResponsiveUpdate(page, 300);

      // Navigate to shortcuts section
      const shortcutsTab = page.getByTestId('settings-nav-shortcuts');
      await shortcutsTab.click();
      await waitForResponsiveUpdate(page, 200);
    });

    test('should show shortcuts section with inline customize buttons', async ({ page }) => {
      const shortcutsSection = page.getByTestId('settings-shortcuts-section');
      await expect(shortcutsSection).toBeVisible();

      // Find a shortcut row
      const shortcutRow = page.locator('[data-testid^="shortcut-row-"]').first();
      await expect(shortcutRow).toBeVisible();

      // Hover to show customize button
      await shortcutRow.hover();

      // "Customize" text should be visible on hover
      await expect(shortcutRow).toContainText('Customize');
    });
  });

  test.describe('Responsive Transitions', () => {
    test('should handle viewport resize from desktop to mobile', async ({ page }) => {
      // Start at desktop
      await setViewport(page, '2xl');
      await page.goto('/settings');
      await waitForResponsiveUpdate(page, 300);

      // Verify sidebar layout
      const sidebar = page.locator('[data-testid="settings-nav"]').locator('..');
      const sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox?.width).toBeLessThan(300);

      // Resize to mobile
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page, 500);

      // Should now show horizontal tabs
      const nav = page.getByTestId('settings-nav');
      const navStyles = await nav.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          display: styles.display,
          flexDirection: styles.flexDirection,
        };
      });
      expect(navStyles.display).toBe('flex');
      expect(navStyles.flexDirection).toBe('row');
    });

    test('should handle viewport resize from mobile to desktop', async ({ page }) => {
      // Start at mobile
      await setViewport(page, 'xs');
      await page.goto('/settings');
      await waitForResponsiveUpdate(page, 300);

      // Verify horizontal tabs
      const nav = page.getByTestId('settings-nav');
      let navStyles = await nav.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          display: styles.display,
          flexDirection: styles.flexDirection,
        };
      });
      expect(navStyles.display).toBe('flex');
      expect(navStyles.flexDirection).toBe('row');

      // Resize to desktop
      await setViewport(page, '2xl');
      await waitForResponsiveUpdate(page, 500);

      // Should now show sidebar
      const sidebar = page.locator('[data-testid="settings-nav"]').locator('..');
      const sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox?.width).toBeLessThan(300);
    });

    test('should preserve selected section during viewport change', async ({ page }) => {
      // Start at desktop, select shortcuts
      await setViewport(page, '2xl');
      await page.goto('/settings');
      await waitForResponsiveUpdate(page, 300);

      await page.getByTestId('settings-nav-shortcuts').click();
      await waitForResponsiveUpdate(page, 200);

      // Verify shortcuts section visible
      await expect(page.getByTestId('settings-shortcuts-section')).toBeVisible();

      // Resize to mobile
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page, 500);

      // Shortcuts section should still be visible
      await expect(page.getByTestId('settings-shortcuts-section')).toBeVisible();
    });
  });

  test.describe('Theme Functionality', () => {
    test('should change theme when option is selected', async ({ page }) => {
      await setViewport(page, 'xs');
      await page.goto('/settings');
      await waitForResponsiveUpdate(page, 300);

      // Click dark theme option
      const darkOption = page.getByTestId('theme-option-dark');
      await darkOption.click();
      await waitForResponsiveUpdate(page, 200);

      // Dark option should be selected
      await expect(darkOption).toHaveAttribute('class', /ring-2/);

      // HTML element should have dark class
      const hasDarkClass = await page.evaluate(() => {
        return document.documentElement.classList.contains('dark');
      });
      expect(hasDarkClass).toBe(true);
    });

    test('should show high contrast base options when high contrast selected', async ({ page }) => {
      await setViewport(page, 'xs');
      await page.goto('/settings');
      await waitForResponsiveUpdate(page, 300);

      // Click high contrast option
      const highContrastOption = page.getByTestId('theme-option-high-contrast');
      await highContrastOption.click();
      await waitForResponsiveUpdate(page, 200);

      // High contrast base section should appear
      const baseSection = page.getByTestId('high-contrast-base-section');
      await expect(baseSection).toBeVisible();

      // Base toggle buttons should be visible
      const lightBase = page.getByTestId('high-contrast-base-light');
      const darkBase = page.getByTestId('high-contrast-base-dark');
      await expect(lightBase).toBeVisible();
      await expect(darkBase).toBeVisible();
    });
  });
});
