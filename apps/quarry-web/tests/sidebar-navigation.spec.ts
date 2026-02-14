import { test, expect } from '@playwright/test';

test.describe('TB5: Basic Sidebar Navigation', () => {
  test('sidebar is visible on page load', async ({ page }) => {
    await page.goto('/');

    // Should redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Sidebar should be visible
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();
  });

  test('sidebar shows all navigation items', async ({ page }) => {
    await page.goto('/dashboard');

    // Check all expected navigation items are visible (using testIds since items are in sections)
    await expect(page.getByTestId('nav-dashboard')).toBeVisible();
    await expect(page.getByTestId('nav-tasks')).toBeVisible();
    await expect(page.getByTestId('nav-plans')).toBeVisible();
    await expect(page.getByTestId('nav-workflows')).toBeVisible();
    await expect(page.getByTestId('nav-messages')).toBeVisible();
    await expect(page.getByTestId('nav-documents')).toBeVisible();
    await expect(page.getByTestId('nav-entities')).toBeVisible();
    await expect(page.getByTestId('nav-teams')).toBeVisible();
    await expect(page.getByTestId('nav-settings')).toBeVisible();
  });

  test('navigation between dashboard and tasks works', async ({ page }) => {
    await page.goto('/dashboard');

    // Verify we're on dashboard
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    // Click on Tasks link using testId
    await page.getByTestId('nav-tasks').click();

    // Should navigate to /tasks
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByTestId('tasks-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: /tasks/i })).toBeVisible();

    // Click back to Dashboard using testId
    await page.getByTestId('nav-dashboard').click();

    // Should navigate back to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('active navigation item is highlighted', async ({ page }) => {
    await page.goto('/dashboard');

    // Dashboard link should have active styling (using CSS variable class)
    const dashboardLink = page.getByTestId('nav-dashboard');
    await expect(dashboardLink).toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);

    // Tasks link should not have active styling
    const tasksLink = page.getByTestId('nav-tasks');
    await expect(tasksLink).not.toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);

    // Navigate to tasks
    await tasksLink.click();
    await expect(page).toHaveURL(/\/tasks/);

    // Now tasks should be active
    await expect(page.getByTestId('nav-tasks')).toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);
    await expect(page.getByTestId('nav-dashboard')).not.toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);
  });

  test('sidebar can be collapsed and expanded', async ({ page }) => {
    await page.goto('/dashboard');

    const sidebar = page.getByTestId('sidebar');

    // Sidebar should start expanded (w-60 = 240px)
    await expect(sidebar).toHaveClass(/w-60/);

    // Find and click the collapse button using testId
    const collapseButton = page.getByTestId('sidebar-toggle');
    await collapseButton.click();

    // Sidebar should be collapsed (w-16)
    await expect(sidebar).toHaveClass(/w-16/);

    // Click again to expand
    await collapseButton.click();

    // Sidebar should be expanded again
    await expect(sidebar).toHaveClass(/w-60/);
  });

  test('root URL redirects to dashboard', async ({ page }) => {
    await page.goto('/');

    // Should redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('connection status is visible in header', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for WebSocket connection
    await expect(page.getByText('Live')).toBeVisible({ timeout: 10000 });
  });

  test('settings page is accessible', async ({ page }) => {
    // Navigate to settings - the page is fully implemented now
    await page.goto('/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible();

    // Theme settings should be visible (use heading role to be specific)
    await expect(page.getByRole('heading', { name: 'Theme' })).toBeVisible();
  });

  test('app shell layout is properly structured', async ({ page }) => {
    await page.goto('/dashboard');

    // App shell should be visible
    await expect(page.getByTestId('app-shell')).toBeVisible();

    // Sidebar should be present
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Main content area should contain the dashboard
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('browser back/forward navigation works', async ({ page }) => {
    await page.goto('/dashboard');

    // Navigate to tasks using testId
    await page.getByTestId('nav-tasks').click();
    await expect(page).toHaveURL(/\/tasks/);

    // Navigate to plans using testId
    await page.getByTestId('nav-plans').click();
    await expect(page).toHaveURL(/\/plans/);

    // Go back to tasks
    await page.goBack();
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByTestId('tasks-page')).toBeVisible();

    // Go back to dashboard
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    // Go forward to tasks
    await page.goForward();
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByTestId('tasks-page')).toBeVisible();
  });
});
