/**
 * TB142: Move Dependencies to Work Section in Sidebar
 *
 * Tests that Dependencies navigation has been moved from Dashboard section
 * to Work section, and the route has been updated from /dashboard/dependencies
 * to /dependencies.
 */

import { test, expect } from '@playwright/test';

test.describe('TB142: Dependencies Navigation Location', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });

  test('Dependencies appears in Work section', async ({ page }) => {
    // Work section should exist and contain Dependencies
    const workSection = page.getByTestId('nav-section-work');
    await expect(workSection).toBeVisible();

    // Dependencies link should be within Work section
    const dependenciesLink = workSection.getByTestId('nav-dependencies');
    await expect(dependenciesLink).toBeVisible();
    await expect(dependenciesLink).toContainText('Dependencies');
  });

  test('Dependencies is NOT in Dashboard section', async ({ page }) => {
    // Dashboard section should exist
    const dashboardSection = page.getByTestId('nav-section-dashboard');
    await expect(dashboardSection).toBeVisible();

    // Dependencies link should NOT be in Dashboard section
    const dependenciesInDashboard = dashboardSection.getByTestId('nav-dependencies');
    await expect(dependenciesInDashboard).not.toBeVisible();
  });

  test('Dependencies route is /dependencies (not /dashboard/dependencies)', async ({ page }) => {
    // Click on Dependencies
    await page.getByTestId('nav-dependencies').click();

    // Should navigate to /dependencies
    await page.waitForURL(/\/dependencies$/);
    expect(page.url()).toMatch(/\/dependencies$/);
    expect(page.url()).not.toContain('/dashboard/dependencies');
  });

  test('keyboard shortcut G G navigates to /dependencies', async ({ page }) => {
    // Use keyboard shortcut
    await page.keyboard.press('g');
    await page.keyboard.press('g');

    // Should navigate to /dependencies
    await page.waitForURL(/\/dependencies$/);
    expect(page.url()).toMatch(/\/dependencies$/);
  });

  test('command palette shows Dependencies in Work group', async ({ page }) => {
    // Open command palette
    await page.keyboard.press('Meta+k');

    // Wait for palette to open
    await expect(page.getByTestId('command-palette')).toBeVisible();

    // Search for dependencies
    await page.getByTestId('command-palette-input').fill('dependencies');

    // Find the dependencies command item
    const depCommand = page.getByTestId('command-item-nav-dependencies');
    await expect(depCommand).toBeVisible();

    // Click it and verify navigation
    await depCommand.click();
    await page.waitForURL(/\/dependencies$/);
    expect(page.url()).toMatch(/\/dependencies$/);
  });

  test('Dependencies page loads correctly at /dependencies', async ({ page }) => {
    // Navigate directly to /dependencies
    await page.goto('/dependencies');

    // Page should load (verify by checking for some expected content)
    // The dependency graph page has a page container
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
  });

  test('Work section contains correct order: Tasks, Plans, Workflows, Dependencies', async ({ page }) => {
    const workSection = page.getByTestId('nav-section-work');
    await expect(workSection).toBeVisible();

    // Get all nav links within Work section
    const navLinks = workSection.locator('a[data-testid]');
    const count = await navLinks.count();

    // Should have 4 items
    expect(count).toBe(4);

    // Verify order
    await expect(navLinks.nth(0)).toHaveAttribute('data-testid', 'nav-tasks');
    await expect(navLinks.nth(1)).toHaveAttribute('data-testid', 'nav-plans');
    await expect(navLinks.nth(2)).toHaveAttribute('data-testid', 'nav-workflows');
    await expect(navLinks.nth(3)).toHaveAttribute('data-testid', 'nav-dependencies');
  });
});
