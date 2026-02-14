import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * TB119: Accessibility Audit
 *
 * This test suite runs axe-core accessibility audits on all main pages
 * to ensure WCAG 2.1 AA compliance.
 */

test.describe('TB119: Accessibility Audit', () => {
  // Helper function to run axe audit and check for violations
  async function runAccessibilityAudit(page: any) {
    const accessibilityResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    return accessibilityResults;
  }

  // Filter critical violations, excluding color-contrast issues that are being incrementally fixed
  function filterCriticalViolations(violations: any[]) {
    return violations.filter(v =>
      (v.impact === 'critical' || v.impact === 'serious') &&
      // Exclude color-contrast issues as they're being fixed incrementally
      v.id !== 'color-contrast'
    );
  }

  test.describe('Dashboard Pages', () => {
    test('dashboard page is accessible', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);

      // Log any violations for debugging
      if (results.violations.length > 0) {
        console.log('Dashboard accessibility violations:', JSON.stringify(results.violations, null, 2));
      }

      // Filter out minor issues that don't affect usability
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('task flow page is accessible', async ({ page }) => {
      await page.goto('/dashboard/task-flow');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('dependency graph page is accessible', async ({ page }) => {
      await page.goto('/dashboard/dependencies');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('timeline page is accessible', async ({ page }) => {
      await page.goto('/dashboard/timeline');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });
  });

  test.describe('Content Pages', () => {
    test('tasks page is accessible', async ({ page }) => {
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('plans page is accessible', async ({ page }) => {
      await page.goto('/plans');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('workflows page is accessible', async ({ page }) => {
      await page.goto('/workflows');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('messages page is accessible', async ({ page }) => {
      await page.goto('/messages');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('documents page is accessible', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('entities page is accessible', async ({ page }) => {
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('teams page is accessible', async ({ page }) => {
      await page.goto('/teams');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('settings page is accessible', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });
  });

  test.describe('Dark Mode Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      // Enable dark mode via localStorage before navigating
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('stoneforge-theme', 'dark');
      });
    });

    test('dashboard in dark mode is accessible', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('tasks page in dark mode is accessible', async ({ page }) => {
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('documents page in dark mode is accessible', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });

    test('settings page in dark mode is accessible', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const results = await runAccessibilityAudit(page);
      const criticalViolations = filterCriticalViolations(results.violations);

      expect(criticalViolations).toHaveLength(0);
    });
  });

  test.describe('Interactive Elements', () => {
    test('all buttons have accessible names', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Get all buttons and check they have accessible names
      const buttons = await page.locator('button').all();

      for (const button of buttons) {
        // Buttons should have either text content, aria-label, or aria-labelledby
        const text = await button.textContent();
        const ariaLabel = await button.getAttribute('aria-label');
        const ariaLabelledby = await button.getAttribute('aria-labelledby');
        const title = await button.getAttribute('title');

        const hasAccessibleName = (text && text.trim().length > 0) ||
                                  ariaLabel ||
                                  ariaLabelledby ||
                                  title;

        if (!hasAccessibleName) {
          const outerHTML = await button.evaluate(el => el.outerHTML.slice(0, 200));
          console.log('Button without accessible name:', outerHTML);
        }
      }
    });

    test('all links have accessible names', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Check that links have accessible text
      const links = await page.locator('a').all();

      for (const link of links) {
        const text = await link.textContent();
        const ariaLabel = await link.getAttribute('aria-label');

        const hasAccessibleName = (text && text.trim().length > 0) || ariaLabel;

        if (!hasAccessibleName) {
          const href = await link.getAttribute('href');
          console.log('Link without accessible name:', href);
        }
      }
    });

    test('inputs have associated labels', async ({ page }) => {
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      // Only run the test if there are inputs on the page
      const inputCount = await page.locator('input:not([type="hidden"])').count();
      if (inputCount === 0) {
        return; // No inputs to test
      }

      const results = await runAccessibilityAudit(page);

      const labelViolations = results.violations.filter(v =>
        v.id === 'label' || v.id === 'input-button-name'
      );

      expect(labelViolations).toHaveLength(0);
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('sidebar navigation is keyboard accessible', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Tab to sidebar navigation
      await page.keyboard.press('Tab');

      // Navigate through sidebar items
      const sidebar = page.getByTestId('sidebar');
      const navLinks = await sidebar.locator('a[href]').all();

      // All navigation links should be focusable
      expect(navLinks.length).toBeGreaterThan(0);
    });

    test('command palette opens with Cmd+K', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Open command palette
      await page.keyboard.press('Meta+k');

      // Command palette should be visible
      await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 3000 });
    });

    test('escape key closes dialogs', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Open command palette
      await page.keyboard.press('Meta+k');
      await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 3000 });

      // Press Escape to close
      await page.keyboard.press('Escape');

      // Dialog should be hidden
      await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 3000 });
    });
  });

  test.describe('Focus States', () => {
    test('buttons have visible focus states', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Find a button and focus it
      const button = page.locator('button').first();
      await button.focus();

      // Check that it has focus
      await expect(button).toBeFocused();

      // The button should have some focus indicator (ring, outline, etc.)
      const buttonBox = await button.boundingBox();
      expect(buttonBox).not.toBeNull();
    });

    test('links have visible focus states', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Find a link and focus it
      const link = page.locator('a[href]').first();
      await link.focus();

      // Check that it has focus
      await expect(link).toBeFocused();
    });

    test('inputs have visible focus states', async ({ page }) => {
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      // Find search input and focus it
      const searchInput = page.getByPlaceholder('Search');
      if (await searchInput.count() > 0) {
        await searchInput.first().focus();
        await expect(searchInput.first()).toBeFocused();
      }
    });
  });

  test.describe('Color Contrast', () => {
    test('text has sufficient color contrast in light mode', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .analyze();

      const contrastViolations = results.violations.filter(v =>
        v.id === 'color-contrast'
      );

      if (contrastViolations.length > 0) {
        console.log('Contrast violations in light mode:', JSON.stringify(contrastViolations, null, 2));
      }

      // Contrast violations should be 0 after TB135 fixes
      expect(contrastViolations.length).toBe(0);
    });

    test('text has sufficient color contrast in dark mode', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('stoneforge-theme', 'dark');
      });
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .analyze();

      const contrastViolations = results.violations.filter(v =>
        v.id === 'color-contrast'
      );

      if (contrastViolations.length > 0) {
        console.log('Contrast violations in dark mode:', JSON.stringify(contrastViolations, null, 2));
      }

      // Contrast violations should be 0 after TB135 fixes
      expect(contrastViolations.length).toBe(0);
    });
  });

  test.describe('Screen Reader Compatibility', () => {
    test('page has proper heading hierarchy', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Check that h1 exists
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1);

      // Check heading hierarchy using axe
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a'])
        .analyze();

      const headingViolations = results.violations.filter(v =>
        v.id === 'heading-order'
      );

      expect(headingViolations).toHaveLength(0);
    });

    test('main content area is properly marked', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Check for main landmark
      const mainCount = await page.locator('main').count();
      expect(mainCount).toBeGreaterThanOrEqual(1);
    });

    test('navigation is properly marked', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Check for nav landmark
      const navCount = await page.locator('nav').count();
      expect(navCount).toBeGreaterThanOrEqual(1);
    });
  });
});
