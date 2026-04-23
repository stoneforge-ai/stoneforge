/**
 * TB141: Sidebar Expand Button When Collapsed
 *
 * Tests the sidebar expand button that appears when the sidebar is collapsed.
 * Users without keyboard access (or those who don't know Cmd+B) need a visible
 * button to expand the sidebar.
 */

import { test, expect } from '@playwright/test';

test.describe('TB141: Sidebar Expand Button', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });

  test('sidebar starts expanded by default', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar');
    // Expanded sidebar has width of 240px (w-60)
    const box = await sidebar.boundingBox();
    expect(box?.width).toBeGreaterThan(200);

    // Collapse toggle should be visible
    await expect(page.getByTestId('sidebar-toggle')).toBeVisible();

    // Expand button should NOT be visible when expanded
    await expect(page.getByTestId('sidebar-expand-button')).not.toBeVisible();
  });

  test('collapse sidebar hides collapse button and shows expand button', async ({ page }) => {
    // Click the collapse button
    await page.getByTestId('sidebar-toggle').click();

    // Wait for animation
    await page.waitForTimeout(250);

    // Sidebar should be collapsed (width 64px = w-16)
    const sidebar = page.getByTestId('sidebar');
    const box = await sidebar.boundingBox();
    expect(box?.width).toBeLessThan(100);

    // Collapse button should be hidden
    await expect(page.getByTestId('sidebar-toggle')).not.toBeVisible();

    // Expand button should be visible
    await expect(page.getByTestId('sidebar-expand-button')).toBeVisible();
  });

  test('clicking expand button expands the sidebar', async ({ page }) => {
    // Collapse the sidebar first
    await page.getByTestId('sidebar-toggle').click();
    await page.waitForTimeout(250);

    // Verify collapsed
    await expect(page.getByTestId('sidebar-expand-button')).toBeVisible();

    // Click the expand button
    await page.getByTestId('sidebar-expand-button').click();
    await page.waitForTimeout(250);

    // Sidebar should be expanded again
    const sidebar = page.getByTestId('sidebar');
    const box = await sidebar.boundingBox();
    expect(box?.width).toBeGreaterThan(200);

    // Expand button should be hidden
    await expect(page.getByTestId('sidebar-expand-button')).not.toBeVisible();

    // Collapse button should be visible
    await expect(page.getByTestId('sidebar-toggle')).toBeVisible();
  });

  test('expand button has correct accessibility attributes', async ({ page }) => {
    // Collapse the sidebar
    await page.getByTestId('sidebar-toggle').click();
    await page.waitForTimeout(250);

    const expandButton = page.getByTestId('sidebar-expand-button');

    // Check accessibility attributes
    await expect(expandButton).toHaveAttribute('aria-label', 'Expand sidebar');
    await expect(expandButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('collapse button has correct accessibility attributes', async ({ page }) => {
    const collapseButton = page.getByTestId('sidebar-toggle');

    // Check accessibility attributes
    await expect(collapseButton).toHaveAttribute('aria-label', 'Collapse sidebar');
    await expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
  });

  test('expand button shows tooltip on hover', async ({ page }) => {
    // Collapse the sidebar
    await page.getByTestId('sidebar-toggle').click();
    await page.waitForTimeout(250);

    const expandButton = page.getByTestId('sidebar-expand-button');

    // Hover over the expand button
    await expandButton.hover();

    // Wait for tooltip to appear (200ms delay + animation)
    await page.waitForTimeout(400);

    // Check for tooltip content
    const tooltip = page.getByTestId('tooltip-content');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Expand sidebar');
    await expect(tooltip).toContainText('⌘B');
  });

  test('expand button is keyboard accessible', async ({ page }) => {
    // Collapse the sidebar
    await page.getByTestId('sidebar-toggle').click();
    await page.waitForTimeout(250);

    // Tab to the expand button (it should be focusable)
    const expandButton = page.getByTestId('sidebar-expand-button');

    // Focus the button
    await expandButton.focus();

    // Verify it has focus
    await expect(expandButton).toBeFocused();

    // Press Enter to activate
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);

    // Sidebar should be expanded
    const sidebar = page.getByTestId('sidebar');
    const box = await sidebar.boundingBox();
    expect(box?.width).toBeGreaterThan(200);
  });

  test('Cmd+B keyboard shortcut still works for expanding', async ({ page }) => {
    // Collapse the sidebar
    await page.getByTestId('sidebar-toggle').click();
    await page.waitForTimeout(250);

    // Verify collapsed
    await expect(page.getByTestId('sidebar-expand-button')).toBeVisible();

    // Use keyboard shortcut to expand
    await page.keyboard.press('Meta+b');
    await page.waitForTimeout(250);

    // Sidebar should be expanded
    const sidebar = page.getByTestId('sidebar');
    const box = await sidebar.boundingBox();
    expect(box?.width).toBeGreaterThan(200);
  });

  test('navigation still works after expanding via button', async ({ page }) => {
    // Collapse the sidebar
    await page.getByTestId('sidebar-toggle').click();
    await page.waitForTimeout(250);

    // Expand via button
    await page.getByTestId('sidebar-expand-button').click();
    await page.waitForTimeout(250);

    // Navigate to Tasks
    await page.getByTestId('nav-tasks').click();
    await page.waitForURL(/\/tasks/);

    // Verify navigation worked
    await expect(page.getByTestId('breadcrumb-tasks')).toBeVisible();
  });
});
