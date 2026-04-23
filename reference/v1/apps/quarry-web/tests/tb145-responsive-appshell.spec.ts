/**
 * TB145: Responsive AppShell & Sidebar Tests
 *
 * Tests for the responsive behavior of the AppShell layout and sidebar navigation.
 * The sidebar transforms from always-visible (desktop) to overlay drawer (mobile).
 *
 * Behaviors tested:
 * - Mobile: sidebar hidden, hamburger menu opens drawer overlay
 * - Tablet: sidebar starts collapsed (icons only)
 * - Desktop: sidebar always visible, can toggle collapsed state
 * - Navigation closes drawer on mobile
 * - Sidebar state persisted in localStorage (desktop only)
 */

import { test, expect } from '@playwright/test';
import {
  setViewport,
  testResponsive,
  waitForResponsiveUpdate,
} from './helpers/responsive';

test.describe('TB145: Responsive AppShell & Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard/overview directly to avoid redirect
    await page.goto('/dashboard/overview');
  });

  test.describe('Mobile Viewport (< 768px)', () => {
    test('should hide sidebar and show hamburger menu on mobile', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Sidebar should not be visible (it's in a drawer)
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).not.toBeVisible();

      // Hamburger menu button should be visible
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await expect(hamburgerButton).toBeVisible();
    });

    test('should open mobile drawer when hamburger menu is clicked', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Click hamburger menu
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await hamburgerButton.click();

      // Mobile drawer should be visible
      const mobileDrawer = page.getByTestId('mobile-drawer');
      await expect(mobileDrawer).toBeVisible();

      // Sidebar inside drawer should be visible
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toBeVisible();
    });

    test('should close mobile drawer when backdrop is clicked', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Open drawer
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await hamburgerButton.click();

      // Wait for drawer to be visible
      const mobileDrawer = page.getByTestId('mobile-drawer');
      await expect(mobileDrawer).toBeVisible();

      // Click on the right side of the screen (past the drawer) to hit the backdrop
      // The drawer is 280px or 85% of viewport width, so clicking at x=350 should hit backdrop on 375px screen
      const viewport = page.viewportSize();
      if (viewport) {
        // Click in the middle-right area of the backdrop (past the drawer content)
        await page.mouse.click(viewport.width - 30, viewport.height / 2);
      }

      // Drawer should be closed
      await expect(mobileDrawer).not.toBeVisible();
    });

    test('should close mobile drawer when close button is clicked', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Open drawer
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await hamburgerButton.click();

      // Click close button
      const closeButton = page.getByTestId('mobile-drawer-close');
      await closeButton.click();

      // Drawer should be closed
      const mobileDrawer = page.getByTestId('mobile-drawer');
      await expect(mobileDrawer).not.toBeVisible();
    });

    test('should close mobile drawer when navigating to a new page', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Open drawer
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await hamburgerButton.click();

      // Click Tasks nav item
      const tasksNavItem = page.getByTestId('nav-tasks');
      await tasksNavItem.click();

      // Wait for navigation
      await page.waitForURL(/\/tasks/);

      // Drawer should be closed
      const mobileDrawer = page.getByTestId('mobile-drawer');
      await expect(mobileDrawer).not.toBeVisible();
    });

    test('should close mobile drawer with Escape key', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Open drawer
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await hamburgerButton.click();

      // Press Escape
      await page.keyboard.press('Escape');

      // Drawer should be closed
      const mobileDrawer = page.getByTestId('mobile-drawer');
      await expect(mobileDrawer).not.toBeVisible();
    });

    test('should show simplified breadcrumbs (current page only) on mobile', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Mobile breadcrumbs should show current page title
      const mobileBreadcrumbs = page.getByTestId('breadcrumbs-mobile');
      await expect(mobileBreadcrumbs).toBeVisible();
      await expect(mobileBreadcrumbs).toContainText('Overview');

      // Full breadcrumbs should not be visible
      const fullBreadcrumbs = page.getByTestId('breadcrumbs');
      await expect(fullBreadcrumbs).not.toBeVisible();
    });

    test('should hide connection status on mobile header', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // The "Live" or connection status should not be visible on mobile
      // We check for the absence of the text that appears on desktop
      const header = page.getByTestId('header');
      const liveText = header.locator('text=Live');

      // Should not be visible on mobile
      await expect(liveText).not.toBeVisible();
    });

    test('should not show keyboard shortcut hints in mobile drawer', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Open drawer
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await hamburgerButton.click();

      // Keyboard hint should not be visible
      const keyboardHint = page.locator('kbd:has-text("⌘K")');
      await expect(keyboardHint).not.toBeVisible();
    });

    test('should have proper touch target sizes for nav items in drawer', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Open drawer
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await hamburgerButton.click();

      // Check that nav items have adequate touch target size (at least 32px height)
      const tasksNavItem = page.getByTestId('nav-tasks');
      const box = await tasksNavItem.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(32);
    });
  });

  test.describe('Tablet Viewport (768px - 1023px)', () => {
    test('should show collapsed sidebar on tablet', async ({ page }) => {
      await setViewport(page, 'lg');
      await waitForResponsiveUpdate(page);

      // Sidebar should be visible and collapsed (narrow width)
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toBeVisible();

      const box = await sidebar.boundingBox();
      // Collapsed sidebar is 64px (w-16)
      expect(box?.width).toBeLessThanOrEqual(80);
    });

    test('should hide hamburger menu on tablet', async ({ page }) => {
      await setViewport(page, 'lg');
      await waitForResponsiveUpdate(page);

      // Hamburger menu should not be visible
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await expect(hamburgerButton).not.toBeVisible();
    });

    test('should show full breadcrumbs on tablet', async ({ page }) => {
      await setViewport(page, 'lg');
      await waitForResponsiveUpdate(page);

      // Full breadcrumbs should be visible
      const fullBreadcrumbs = page.getByTestId('breadcrumbs');
      await expect(fullBreadcrumbs).toBeVisible();
    });

    test('should show expand button when sidebar is collapsed on tablet', async ({ page }) => {
      await setViewport(page, 'lg');
      await waitForResponsiveUpdate(page);

      // Expand button should be visible
      const expandButton = page.getByTestId('sidebar-expand-button');
      await expect(expandButton).toBeVisible();
    });
  });

  test.describe('Desktop Viewport (>= 1024px)', () => {
    test('should show expanded sidebar by default on desktop', async ({ page }) => {
      // Clear any persisted state first
      await page.evaluate(() => localStorage.removeItem('stoneforge-sidebar-collapsed'));

      await setViewport(page, '2xl');
      await page.reload();
      await waitForResponsiveUpdate(page);

      // Sidebar should be visible and expanded
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toBeVisible();

      const box = await sidebar.boundingBox();
      // Expanded sidebar is 240px (w-60)
      expect(box?.width).toBeGreaterThanOrEqual(200);
    });

    test('should toggle sidebar collapsed state with Cmd+B', async ({ page }) => {
      // Clear any persisted state first
      await page.evaluate(() => localStorage.removeItem('stoneforge-sidebar-collapsed'));

      await setViewport(page, '2xl');
      await page.reload();
      await waitForResponsiveUpdate(page);

      // Get initial width
      const sidebar = page.getByTestId('sidebar');
      const initialBox = await sidebar.boundingBox();
      expect(initialBox?.width).toBeGreaterThanOrEqual(200);

      // Press Cmd+B to collapse
      await page.keyboard.press('Meta+b');
      await waitForResponsiveUpdate(page);

      // Sidebar should be collapsed
      const collapsedBox = await sidebar.boundingBox();
      expect(collapsedBox?.width).toBeLessThanOrEqual(80);

      // Press Cmd+B again to expand
      await page.keyboard.press('Meta+b');
      await waitForResponsiveUpdate(page);

      // Sidebar should be expanded again
      const expandedBox = await sidebar.boundingBox();
      expect(expandedBox?.width).toBeGreaterThanOrEqual(200);
    });

    test('should show collapse button in sidebar header when expanded', async ({ page }) => {
      await page.evaluate(() => localStorage.removeItem('stoneforge-sidebar-collapsed'));
      await setViewport(page, '2xl');
      await page.reload();
      await waitForResponsiveUpdate(page);

      // Collapse button should be visible in sidebar
      const collapseButton = page.getByTestId('sidebar-toggle');
      await expect(collapseButton).toBeVisible();
    });

    test('should show keyboard shortcut hints on desktop', async ({ page }) => {
      await page.evaluate(() => localStorage.removeItem('stoneforge-sidebar-collapsed'));
      await setViewport(page, '2xl');
      await page.reload();
      await waitForResponsiveUpdate(page);

      // Keyboard hint should be visible
      const keyboardHint = page.locator('kbd:has-text("⌘K")');
      await expect(keyboardHint).toBeVisible();
    });
  });

  test.describe('Sidebar State Persistence', () => {
    test('should persist desktop sidebar collapsed state in localStorage', async ({ page }) => {
      // Clear state and set to expanded
      await page.evaluate(() => localStorage.removeItem('stoneforge-sidebar-collapsed'));
      await setViewport(page, '2xl');
      await page.reload();
      await waitForResponsiveUpdate(page);

      // Verify sidebar is expanded initially
      const sidebar = page.getByTestId('sidebar');
      const initialBox = await sidebar.boundingBox();
      expect(initialBox?.width).toBeGreaterThanOrEqual(200);

      // Collapse sidebar using the toggle button (more reliable than keyboard)
      const collapseButton = page.getByTestId('sidebar-toggle');
      await collapseButton.click();
      await waitForResponsiveUpdate(page);

      // Verify sidebar is collapsed
      const collapsedBox = await sidebar.boundingBox();
      expect(collapsedBox?.width).toBeLessThanOrEqual(80);

      // Wait a bit for React state and localStorage update
      await page.waitForTimeout(200);

      // Verify localStorage was updated
      const storedValue = await page.evaluate(() => localStorage.getItem('stoneforge-sidebar-collapsed'));
      expect(storedValue).toBe('true');

      // Reload and verify state persisted
      await page.reload();
      await waitForResponsiveUpdate(page);

      const afterReloadBox = await sidebar.boundingBox();
      expect(afterReloadBox?.width).toBeLessThanOrEqual(80);
    });

    test('should not affect mobile drawer state from localStorage', async ({ page }) => {
      // Set collapsed state in localStorage
      await page.evaluate(() => localStorage.setItem('stoneforge-sidebar-collapsed', 'true'));

      await setViewport(page, 'xs');
      await page.reload();
      await waitForResponsiveUpdate(page);

      // Open drawer
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await hamburgerButton.click();

      // Sidebar in drawer should be expanded (not collapsed), regardless of localStorage
      const sidebar = page.getByTestId('sidebar');
      const box = await sidebar.boundingBox();
      // In mobile drawer, sidebar takes full width
      expect(box?.width).toBeGreaterThanOrEqual(200);
    });
  });

  test.describe('Responsive Transitions', () => {
    test('should close mobile drawer when viewport grows to tablet size', async ({ page }) => {
      // Start at mobile
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Open drawer
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await hamburgerButton.click();

      // Verify drawer is open
      const mobileDrawer = page.getByTestId('mobile-drawer');
      await expect(mobileDrawer).toBeVisible();

      // Resize to tablet
      await setViewport(page, 'lg');
      await waitForResponsiveUpdate(page);

      // Drawer should be closed (mobile drawer component not rendered at tablet+)
      await expect(mobileDrawer).not.toBeVisible();
    });

    test('should maintain sidebar expanded state when resizing desktop viewport', async ({ page }) => {
      // Clear state
      await page.evaluate(() => localStorage.removeItem('stoneforge-sidebar-collapsed'));

      // Start at desktop, sidebar should be expanded
      await setViewport(page, '2xl');
      await page.reload();
      await waitForResponsiveUpdate(page);

      const sidebar = page.getByTestId('sidebar');
      const initialBox = await sidebar.boundingBox();
      expect(initialBox?.width).toBeGreaterThanOrEqual(200);

      // Resize to a slightly smaller desktop
      await setViewport(page, 'xl');
      await waitForResponsiveUpdate(page);

      // Sidebar should still be expanded
      const afterBox = await sidebar.boundingBox();
      expect(afterBox?.width).toBeGreaterThanOrEqual(200);
    });
  });

  test.describe('Header Responsiveness', () => {
    test('should show proper header layout at each breakpoint', async ({ page }) => {
      await testResponsive(page, {
        mobile: async () => {
          // Mobile: hamburger + centered breadcrumbs
          await expect(page.getByTestId('mobile-menu-button')).toBeVisible();
          await expect(page.getByTestId('breadcrumbs-mobile')).toBeVisible();
          await expect(page.getByTestId('breadcrumbs')).not.toBeVisible();
        },
        tablet: async () => {
          // Tablet: full breadcrumbs, no hamburger
          await expect(page.getByTestId('mobile-menu-button')).not.toBeVisible();
          await expect(page.getByTestId('breadcrumbs')).toBeVisible();
        },
        desktop: async () => {
          // Desktop: full breadcrumbs, no hamburger
          await expect(page.getByTestId('mobile-menu-button')).not.toBeVisible();
          await expect(page.getByTestId('breadcrumbs')).toBeVisible();
        },
      });
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA attributes on mobile drawer', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Open drawer
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await expect(hamburgerButton).toHaveAttribute('aria-label', 'Open navigation menu');
      await hamburgerButton.click();

      // Drawer should have proper role and aria-modal
      const mobileDrawer = page.getByTestId('mobile-drawer');
      await expect(mobileDrawer).toHaveAttribute('role', 'dialog');
      await expect(mobileDrawer).toHaveAttribute('aria-modal', 'true');
    });

    test('should have proper ARIA attributes on hamburger button', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await expect(hamburgerButton).toHaveAttribute('aria-expanded', 'false');

      await hamburgerButton.click();
      await expect(hamburgerButton).toHaveAttribute('aria-expanded', 'true');
    });

    test('should trap focus in mobile drawer when open', async ({ page }) => {
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page);

      // Open drawer
      const hamburgerButton = page.getByTestId('mobile-menu-button');
      await hamburgerButton.click();

      // First focusable element in drawer should receive focus
      const closeButton = page.getByTestId('mobile-drawer-close');
      await expect(closeButton).toBeFocused();
    });
  });

  test.describe('No Horizontal Overflow', () => {
    test('should not have horizontal overflow at any breakpoint', async ({ page }) => {
      await testResponsive(page, {
        mobile: async () => {
          const hasOverflow = await page.evaluate(() => {
            return document.body.scrollWidth > document.body.clientWidth;
          });
          expect(hasOverflow).toBe(false);
        },
        tablet: async () => {
          const hasOverflow = await page.evaluate(() => {
            return document.body.scrollWidth > document.body.clientWidth;
          });
          expect(hasOverflow).toBe(false);
        },
        desktop: async () => {
          const hasOverflow = await page.evaluate(() => {
            return document.body.scrollWidth > document.body.clientWidth;
          });
          expect(hasOverflow).toBe(false);
        },
      });
    });
  });
});
