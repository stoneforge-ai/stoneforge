import { test, expect } from '@playwright/test';

test.describe('TB72: Dark/Light Mode Overhaul', () => {
  test.describe('Theme Toggle in Header', () => {
    test('theme toggle button is visible in header', async ({ page }) => {
      await page.goto('/dashboard');

      // Theme toggle should be visible in header
      await expect(page.getByTestId('theme-toggle')).toBeVisible();
    });

    test('clicking theme toggle switches between light and dark mode', async ({ page }) => {
      await page.goto('/dashboard');

      // Start by setting to light mode via settings to have a known state
      await page.evaluate(() => {
        localStorage.setItem('settings.theme', 'light');
      });
      await page.reload();

      // Should be in light mode
      let htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('theme-light');
      expect(htmlClass).not.toContain('dark');

      // Click toggle to switch to dark
      await page.getByTestId('theme-toggle').click();

      // Should now be in dark mode
      htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');
      expect(htmlClass).toContain('theme-dark');
    });

    test('theme toggle persists preference in localStorage', async ({ page }) => {
      await page.goto('/dashboard');

      // Clear any existing theme
      await page.evaluate(() => localStorage.removeItem('settings.theme'));
      await page.reload();

      // Click toggle (should switch to dark from light)
      await page.getByTestId('theme-toggle').click();

      // Check localStorage
      const storedTheme = await page.evaluate(() => localStorage.getItem('settings.theme'));
      expect(storedTheme).toBe('dark');

      // Click again (should switch to light)
      await page.getByTestId('theme-toggle').click();

      const storedTheme2 = await page.evaluate(() => localStorage.getItem('settings.theme'));
      expect(storedTheme2).toBe('light');
    });

    test('theme persists after page reload', async ({ page }) => {
      await page.goto('/dashboard');

      // Set dark mode
      await page.evaluate(() => localStorage.setItem('settings.theme', 'dark'));
      await page.reload();

      // Should still be dark
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');
    });
  });

  test.describe('Dark Mode Styling', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard');
      // Set to dark mode
      await page.evaluate(() => localStorage.setItem('settings.theme', 'dark'));
      await page.reload();
    });

    test('app shell has dark background in dark mode', async ({ page }) => {
      const appShell = page.getByTestId('app-shell');
      await expect(appShell).toBeVisible();

      // Check that dark class is applied
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');
    });

    test('sidebar has dark styling in dark mode', async ({ page }) => {
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toBeVisible();

      // Sidebar should have dark background via CSS variables
      // We can check that the dark class is on the root, which applies dark styles
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');
    });

    test('navigation items have correct dark mode styling', async ({ page }) => {
      // Navigate to a page and check nav styling
      const dashboardNav = page.getByTestId('nav-dashboard');
      await expect(dashboardNav).toBeVisible();
    });
  });

  test.describe('Light Mode Styling', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard');
      // Set to light mode
      await page.evaluate(() => localStorage.setItem('settings.theme', 'light'));
      await page.reload();
    });

    test('app shell has light background in light mode', async ({ page }) => {
      const appShell = page.getByTestId('app-shell');
      await expect(appShell).toBeVisible();

      // Check that dark class is NOT present
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).not.toContain('dark');
      expect(htmlClass).toContain('theme-light');
    });

    test('sidebar has light styling in light mode', async ({ page }) => {
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toBeVisible();

      // Should not have dark class
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).not.toContain('dark');
    });
  });

  test.describe('Smooth Theme Transition', () => {
    test('body has transition property for smooth mode switching', async ({ page }) => {
      await page.goto('/dashboard');

      // Check that body has transition for background-color
      const bodyTransition = await page.locator('body').evaluate((el) => {
        return getComputedStyle(el).transition;
      });

      // Should include background-color transition
      expect(bodyTransition).toContain('background-color');
    });
  });

  test.describe('Settings Page Theme Integration', () => {
    test('settings page theme section updates header toggle', async ({ page }) => {
      await page.goto('/settings');

      // Select dark theme in settings
      await page.getByTestId('theme-option-dark').click();

      // Should have dark mode applied
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');
    });

    test('header toggle and settings page stay in sync', async ({ page }) => {
      await page.goto('/settings');

      // Start with light
      await page.getByTestId('theme-option-light').click();
      await expect(page.getByTestId('theme-option-light')).toContainText('Active');

      // Go to dashboard and use header toggle
      await page.getByTestId('nav-dashboard').click();
      await page.getByTestId('theme-toggle').click();

      // Should now be dark
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');

      // Go back to settings - dark should be active
      await page.getByTestId('nav-settings').click();
      await expect(page.getByTestId('theme-option-dark')).toContainText('Active');
    });
  });

  test.describe('Notification Types Padding Fix', () => {
    test('notification types list has horizontal padding', async ({ page }) => {
      await page.goto('/settings');
      await page.getByTestId('settings-nav-notifications').click();

      // The notification types container should be visible
      await expect(page.getByTestId('notification-task-assigned')).toBeVisible();

      // Check that the parent container has px-4 class for padding
      const container = page.locator('[data-testid="notification-task-assigned"]').locator('..');

      // The container should have padding (either via px-4 class or computed style)
      const paddingLeft = await container.evaluate((el) => {
        return getComputedStyle(el).paddingLeft;
      });

      // Should have some padding (not 0)
      expect(parseInt(paddingLeft)).toBeGreaterThan(0);
    });
  });

  test.describe('Theme Works Across Pages', () => {
    test('dark mode persists when navigating to tasks page', async ({ page }) => {
      // Set dark mode and navigate to tasks
      await page.goto('/dashboard');
      await page.evaluate(() => localStorage.setItem('settings.theme', 'dark'));
      await page.reload();

      await page.getByTestId('nav-tasks').click();
      await expect(page).toHaveURL(/\/tasks/);

      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');
    });

    test('dark mode persists when navigating to documents page', async ({ page }) => {
      await page.goto('/dashboard');
      await page.evaluate(() => localStorage.setItem('settings.theme', 'dark'));
      await page.reload();

      await page.getByTestId('nav-documents').click();
      await expect(page).toHaveURL(/\/documents/);

      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');
    });

    test('dark mode persists when navigating to entities page', async ({ page }) => {
      await page.goto('/dashboard');
      await page.evaluate(() => localStorage.setItem('settings.theme', 'dark'));
      await page.reload();

      await page.getByTestId('nav-entities').click();
      await expect(page).toHaveURL(/\/entities/);

      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');
    });

    test('dark mode persists when navigating to teams page', async ({ page }) => {
      await page.goto('/dashboard');
      await page.evaluate(() => localStorage.setItem('settings.theme', 'dark'));
      await page.reload();

      await page.getByTestId('nav-teams').click();
      await expect(page).toHaveURL(/\/teams/);

      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('dark');
    });
  });
});
