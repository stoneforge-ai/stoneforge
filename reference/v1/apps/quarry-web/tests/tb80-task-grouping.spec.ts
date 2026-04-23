import { test, expect } from '@playwright/test';

test.describe('TB80: Task Grouping', () => {
  // Helper to ensure we have some test tasks with different properties
  async function ensureTestTasks(page: import('@playwright/test').Page): Promise<boolean> {
    const response = await page.request.get('/api/tasks?limit=1000');
    const data = await response.json();
    const tasks = data.items || data;
    return tasks.length >= 3;
  }

  test.beforeEach(async ({ page }) => {
    // Clear localStorage for consistent testing
    await page.goto('/tasks');
    await page.evaluate(() => {
      localStorage.removeItem('tasks.groupBy');
    });
    await page.reload();
  });

  test('Group by dropdown is visible in list view', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Ensure we're in list view
    await page.getByTestId('view-toggle-list').click();

    // Group by dropdown should be visible
    await expect(page.getByTestId('group-by-dropdown')).toBeVisible();
  });

  test('Group by dropdown is hidden in kanban view', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Switch to kanban view
    await page.getByTestId('view-toggle-kanban').click();

    // Group by dropdown should not be visible in kanban view
    await expect(page.getByTestId('group-by-dropdown')).not.toBeVisible();
  });

  test('Group by dropdown shows all options', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Open the dropdown
    await page.getByTestId('group-by-dropdown').click();
    await expect(page.getByTestId('group-by-options')).toBeVisible();

    // Check all options are present
    await expect(page.getByTestId('group-by-option-none')).toBeVisible();
    await expect(page.getByTestId('group-by-option-status')).toBeVisible();
    await expect(page.getByTestId('group-by-option-priority')).toBeVisible();
    await expect(page.getByTestId('group-by-option-assignee')).toBeVisible();
    await expect(page.getByTestId('group-by-option-taskType')).toBeVisible();
    await expect(page.getByTestId('group-by-option-tags')).toBeVisible();
  });

  test('default grouping is None', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Check the dropdown displays "None"
    await expect(page.getByTestId('group-by-dropdown')).toContainText('None');

    // And the regular list view should be shown (not grouped view)
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();
  });

  test('selecting Status grouping shows grouped view', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Status grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-status').click();

    // Dropdown should close and show "Status"
    await expect(page.getByTestId('group-by-options')).not.toBeVisible();
    await expect(page.getByTestId('group-by-dropdown')).toContainText('Status');

    // Grouped view should be shown
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();
  });

  test('selecting Priority grouping shows grouped view', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Priority grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-priority').click();

    // Dropdown should show "Priority"
    await expect(page.getByTestId('group-by-dropdown')).toContainText('Priority');

    // Grouped view should be shown
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();
  });

  test('group headers show correct count', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Status grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-status').click();

    // Wait for grouped view
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();

    // At least one group header should have a count
    const groupHeaders = page.locator('[data-testid^="group-header-"]');
    const count = await groupHeaders.count();
    expect(count).toBeGreaterThan(0);

    // Each group header should have a count badge
    for (let i = 0; i < Math.min(count, 3); i++) {
      const header = groupHeaders.nth(i);
      const countBadge = header.locator('[data-testid^="group-count-"]');
      await expect(countBadge).toBeVisible();
      const countText = await countBadge.textContent();
      expect(parseInt(countText || '0')).toBeGreaterThanOrEqual(0);
    }
  });

  test('clicking group header collapses/expands group', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Status grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-status').click();

    // Wait for grouped view
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();

    // Find a group header with tasks
    const groupHeaders = page.locator('[data-testid^="group-header-"]');
    const count = await groupHeaders.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstHeader = groupHeaders.first();
    const groupKey = await firstHeader.getAttribute('data-testid');
    const groupName = groupKey?.replace('group-header-', '');

    // Get the group container
    const groupContainer = page.getByTestId(`task-group-${groupName}`);

    // Initially, tasks should be visible (not collapsed)
    const taskRows = groupContainer.locator('[data-testid^="task-row-"]');
    const initialTaskCount = await taskRows.count();

    // Click header to collapse
    await firstHeader.click();

    // If there were tasks, they should now be hidden
    if (initialTaskCount > 0) {
      await expect(taskRows).toHaveCount(0);
    }

    // Click header again to expand
    await firstHeader.click();

    // Tasks should be visible again
    if (initialTaskCount > 0) {
      await expect(taskRows).toHaveCount(initialTaskCount);
    }
  });

  test('grouping preference persists in localStorage', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Priority grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-priority').click();

    // Check localStorage
    const storedGroupBy = await page.evaluate(() => localStorage.getItem('tasks.groupBy'));
    expect(storedGroupBy).toBe('priority');

    // Reload the page
    await page.reload();
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Grouping should still be Priority
    await expect(page.getByTestId('group-by-dropdown')).toContainText('Priority');
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();
  });

  test('switching back to None removes grouping', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Status grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-status').click();
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();

    // Switch back to None
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-none').click();

    // Regular list view should be shown
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();
    await expect(page.getByTestId('tasks-grouped-list-view')).not.toBeVisible();
  });

  test('grouping by Assignee works correctly', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Assignee grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-assignee').click();

    // Grouped view should be shown
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();
    await expect(page.getByTestId('group-by-dropdown')).toContainText('Assignee');
  });

  test('grouping by Type works correctly', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Type grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-taskType').click();

    // Grouped view should be shown
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();
    await expect(page.getByTestId('group-by-dropdown')).toContainText('Type');
  });

  test('grouping by Tags works correctly', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Tags grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-tags').click();

    // Grouped view should be shown
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();
    await expect(page.getByTestId('group-by-dropdown')).toContainText('Tags');
  });

  test('clicking task in grouped view opens detail panel', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Status grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-status').click();
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();

    // Find and click on a task row
    const taskRows = page.locator('[data-testid^="task-row-"]');
    const count = await taskRows.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await taskRows.first().click();

    // Task detail panel should open
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });
  });

  test('sorting works within grouped view', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Status grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-status').click();
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();

    // Click on a sortable header
    const sortHeader = page.getByTestId('sort-header-priority');
    await expect(sortHeader).toBeVisible();
    await sortHeader.click();

    // The grouped view should still be visible (not crash or switch views)
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();
  });

  test('pagination works with grouped view', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Status grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-status').click();

    // Pagination component should be visible
    await expect(page.locator('[data-testid="pagination"]')).toBeVisible();
  });

  test('filter bar works with grouped view', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Priority grouping
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-priority').click();
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();

    // Filter bar should still be visible
    await expect(page.getByTestId('filter-bar')).toBeVisible();

    // Toggle filter bar expansion
    await page.getByTestId('filter-toggle').click();

    // Filter options should be visible
    await expect(page.getByTestId('filter-status-open')).toBeVisible();
  });
});
