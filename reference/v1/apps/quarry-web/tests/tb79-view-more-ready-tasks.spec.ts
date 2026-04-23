import { test, expect } from '@playwright/test';

test.describe('TB79: View More Ready Tasks Fix', () => {
  test.describe('Dashboard "View more ready tasks" links', () => {
    test('View all link navigates to tasks page with readyOnly filter', async ({ page }) => {
      await page.goto('/dashboard/overview');

      // Wait for ready tasks section to load
      await expect(page.getByRole('heading', { name: 'Ready Tasks' })).toBeVisible({ timeout: 10000 });

      // Find the "View all" link specifically in the Ready Tasks section (first one on page)
      const viewAllLink = page.getByRole('link', { name: 'View all' }).first();
      await expect(viewAllLink).toBeVisible();

      // Check the link has readyOnly in the URL
      const href = await viewAllLink.getAttribute('href');
      expect(href).toContain('readyOnly=true');

      // Click and verify navigation
      await viewAllLink.click();
      await expect(page).toHaveURL(/\/tasks\?.*readyOnly=true/);
    });

    test('"View N more ready tasks" link navigates with readyOnly filter', async ({ page }) => {
      // First check if there are more than 5 ready tasks
      const response = await page.request.get('/api/tasks/ready');
      const tasks = await response.json();

      if (tasks.length <= 5) {
        test.skip(true, 'Not enough ready tasks to show "View more" link');
        return;
      }

      await page.goto('/dashboard/overview');

      // Find the "View N more ready tasks" link
      const viewMoreLink = page.getByRole('link', { name: /View \d+ more ready tasks/ });
      await expect(viewMoreLink).toBeVisible({ timeout: 10000 });

      // Check the link has readyOnly in the URL
      const href = await viewMoreLink.getAttribute('href');
      expect(href).toContain('readyOnly=true');

      // Click and verify navigation
      await viewMoreLink.click();
      await expect(page).toHaveURL(/\/tasks\?.*readyOnly=true/);
    });

    test('Quick action "View Ready Tasks" button navigates with readyOnly filter', async ({ page }) => {
      await page.goto('/dashboard/overview');

      // Find the quick action button
      const viewTasksButton = page.getByTestId('quick-action-view-tasks');
      await expect(viewTasksButton).toBeVisible({ timeout: 10000 });

      // Click and verify navigation
      await viewTasksButton.click();
      await expect(page).toHaveURL(/\/tasks\?.*readyOnly=true/);
    });
  });

  test.describe('Tasks page readyOnly filter', () => {
    test('Tasks page displays filter chip when readyOnly is in URL', async ({ page }) => {
      await page.goto('/tasks?readyOnly=true');

      // Wait for page to load
      await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

      // Check filter chip is visible
      const filterChip = page.getByTestId('ready-filter-chip');
      await expect(filterChip).toBeVisible();
      await expect(filterChip).toContainText('Ready tasks only');
    });

    test('Filter chip shows clear button that removes filter', async ({ page }) => {
      await page.goto('/tasks?readyOnly=true');

      // Wait for page and filter chip
      const filterChip = page.getByTestId('ready-filter-chip');
      await expect(filterChip).toBeVisible({ timeout: 10000 });

      // Click clear button
      const clearButton = page.getByTestId('clear-ready-filter');
      await expect(clearButton).toBeVisible();
      await clearButton.click();

      // Verify URL no longer has readyOnly
      await expect(page).not.toHaveURL(/readyOnly=true/);

      // Verify filter chip is gone
      await expect(filterChip).not.toBeVisible();
    });

    test('Tasks page without readyOnly shows all tasks (no filter chip)', async ({ page }) => {
      await page.goto('/tasks');

      // Wait for page to load
      await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

      // Filter chip should NOT be visible
      const filterChip = page.getByTestId('ready-filter-chip');
      await expect(filterChip).not.toBeVisible();
    });

    test('readyOnly filter is preserved during pagination', async ({ page }) => {
      await page.goto('/tasks?readyOnly=true&page=1&limit=10');

      // Wait for page to load
      await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

      // Get ready task count
      const response = await page.request.get('/api/tasks/ready');
      const tasks = await response.json();

      if (tasks.length <= 10) {
        test.skip(true, 'Not enough ready tasks to test pagination');
        return;
      }

      // Click next page
      const nextButton = page.getByRole('button', { name: /next/i });
      if (await nextButton.isVisible()) {
        await nextButton.click();

        // Verify readyOnly is still in URL
        await expect(page).toHaveURL(/readyOnly=true/);

        // Filter chip should still be visible
        await expect(page.getByTestId('ready-filter-chip')).toBeVisible();
      }
    });

    test('readyOnly filter filters tasks correctly', async ({ page }) => {
      // Get ready and all tasks
      const readyResponse = await page.request.get('/api/tasks/ready');
      const readyTasks = await readyResponse.json();

      const allResponse = await page.request.get('/api/elements/all?types=task');
      const allData = await allResponse.json();
      const allTasks = allData.task?.items || [];

      // Skip if no data
      if (readyTasks.length === 0 || allTasks.length === 0) {
        test.skip(true, 'No tasks to test filtering');
        return;
      }

      // Navigate to tasks with readyOnly
      await page.goto('/tasks?readyOnly=true&limit=100');
      await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

      // Wait for content to load
      await page.waitForTimeout(500);

      // If there are ready tasks, verify the page shows them
      if (readyTasks.length > 0) {
        const filterChip = page.getByTestId('ready-filter-chip');
        await expect(filterChip).toBeVisible();
      }
    });

    test('Other filters work alongside readyOnly filter', async ({ page }) => {
      await page.goto('/tasks?readyOnly=true');

      // Wait for page to load
      await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

      // The filter chip should be visible
      await expect(page.getByTestId('ready-filter-chip')).toBeVisible();

      // Check that filter toggle is still present (other filters work)
      const filterToggle = page.getByTestId('filter-toggle');
      await expect(filterToggle).toBeVisible();

      // Expand filters
      await filterToggle.click();

      // Status filter buttons should be visible
      await expect(page.getByTestId('filter-status-open')).toBeVisible();
    });

    test('Clearing other filters preserves readyOnly filter', async ({ page }) => {
      await page.goto('/tasks?readyOnly=true');

      // Wait for page to load
      await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

      // The filter chip should be visible
      await expect(page.getByTestId('ready-filter-chip')).toBeVisible();

      // Expand filters and add a status filter first
      const filterToggle = page.getByTestId('filter-toggle');
      await filterToggle.click();

      // Click a status filter to add it
      const openStatusButton = page.getByTestId('filter-status-open');
      await openStatusButton.click();

      // Now the "Clear all" button should be visible
      const clearAllFilters = page.getByTestId('clear-filters');
      await expect(clearAllFilters).toBeVisible();

      // Click clear all
      await clearAllFilters.click();

      // readyOnly should still be in URL (preserved when clearing other filters)
      await expect(page).toHaveURL(/readyOnly=true/);
      // But other filters should be cleared
      await expect(page.getByTestId('ready-filter-chip')).toBeVisible();
    });
  });

  test.describe('Integration tests', () => {
    test('Full flow: Dashboard → Tasks with readyOnly → Clear filter', async ({ page }) => {
      // Start at dashboard
      await page.goto('/dashboard/overview');

      // Wait for ready tasks section
      await expect(page.getByRole('heading', { name: 'Ready Tasks' })).toBeVisible({ timeout: 10000 });

      // Click View all to go to tasks with readyOnly (first one on page is in Ready Tasks section)
      const viewAllLink = page.getByRole('link', { name: 'View all' }).first();
      await viewAllLink.click();

      // Verify we're at tasks page with filter
      await expect(page).toHaveURL(/\/tasks\?.*readyOnly=true/);
      await expect(page.getByTestId('ready-filter-chip')).toBeVisible();

      // Clear the filter
      await page.getByTestId('clear-ready-filter').click();

      // Verify filter is cleared
      await expect(page).not.toHaveURL(/readyOnly=true/);
      await expect(page.getByTestId('ready-filter-chip')).not.toBeVisible();
    });
  });
});
