import { test, expect } from '@playwright/test';

test.describe('TB81: Task Ordering and Sorting', () => {
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
      localStorage.removeItem('tasks.sortBy');
      localStorage.removeItem('tasks.sortDir');
      localStorage.removeItem('tasks.secondarySort');
    });
    await page.reload();
  });

  test('Sort by dropdown is visible in list view', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Ensure we're in list view
    await page.getByTestId('view-toggle-list').click();

    // Sort by dropdown should be visible
    await expect(page.getByTestId('sort-by-dropdown')).toBeVisible();
  });

  test('Sort by dropdown is hidden in kanban view', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Switch to kanban view
    await page.getByTestId('view-toggle-kanban').click();

    // Sort by dropdown should not be visible in kanban view
    await expect(page.getByTestId('sort-by-dropdown')).not.toBeVisible();
  });

  test('Sort by dropdown shows all options', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Open the dropdown
    await page.getByTestId('sort-by-dropdown').click();
    await expect(page.getByTestId('sort-by-options')).toBeVisible();

    // Check all options are present
    await expect(page.getByTestId('sort-by-option-priority')).toBeVisible();
    await expect(page.getByTestId('sort-by-option-created_at')).toBeVisible();
    await expect(page.getByTestId('sort-by-option-updated_at')).toBeVisible();
    await expect(page.getByTestId('sort-by-option-deadline')).toBeVisible();
    await expect(page.getByTestId('sort-by-option-title')).toBeVisible();
    await expect(page.getByTestId('sort-by-option-complexity')).toBeVisible();
  });

  test('default sort is by Updated (descending)', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Check the dropdown displays "Updated"
    await expect(page.getByTestId('sort-by-dropdown')).toContainText('Updated');
  });

  test('selecting Priority sort updates dropdown', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Priority sorting
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-by-option-priority').click();

    // Dropdown should close and show "Priority"
    await expect(page.getByTestId('sort-by-options')).not.toBeVisible();
    await expect(page.getByTestId('sort-by-dropdown')).toContainText('Priority');
  });

  test('ascending/descending toggle is visible and functional', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Direction toggle should be visible
    await expect(page.getByTestId('sort-direction-toggle')).toBeVisible();

    // Click to toggle direction
    await page.getByTestId('sort-direction-toggle').click();

    // Toggle should still be visible (clicking doesn't hide it)
    await expect(page.getByTestId('sort-direction-toggle')).toBeVisible();
  });

  test('sort direction persists in localStorage', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Click to toggle to ascending
    await page.getByTestId('sort-direction-toggle').click();

    // Check localStorage
    const storedDir = await page.evaluate(() => localStorage.getItem('tasks.sortDir'));
    expect(storedDir).toBe('asc');

    // Click again to toggle back to descending
    await page.getByTestId('sort-direction-toggle').click();

    const storedDir2 = await page.evaluate(() => localStorage.getItem('tasks.sortDir'));
    expect(storedDir2).toBe('desc');
  });

  test('sort field persists in localStorage', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Select Priority sorting
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-by-option-priority').click();

    // Check localStorage
    const storedSort = await page.evaluate(() => localStorage.getItem('tasks.sortBy'));
    expect(storedSort).toBe('priority');

    // Reload the page
    await page.reload();
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Sort should still be Priority
    await expect(page.getByTestId('sort-by-dropdown')).toContainText('Priority');
  });

  test('secondary sort option is accessible', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Open the dropdown
    await page.getByTestId('sort-by-dropdown').click();
    await expect(page.getByTestId('sort-by-options')).toBeVisible();

    // Click secondary sort button
    await page.getByTestId('sort-secondary-button').click();
    await expect(page.getByTestId('sort-secondary-options')).toBeVisible();
  });

  test('secondary sort can be set to a different field', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // First set primary sort to Priority
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-by-option-priority').click();

    // Open dropdown again and go to secondary sort
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-secondary-button').click();

    // Select Created as secondary sort
    await page.getByTestId('sort-secondary-option-created_at').click();

    // Dropdown should show both sorts
    await expect(page.getByTestId('sort-by-dropdown')).toContainText('Priority');
    await expect(page.getByTestId('sort-by-dropdown')).toContainText('Created');
  });

  test('secondary sort persists in localStorage', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Open dropdown and go to secondary sort
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-secondary-button').click();

    // Select Title as secondary sort
    await page.getByTestId('sort-secondary-option-title').click();

    // Check localStorage
    const storedSecondary = await page.evaluate(() => localStorage.getItem('tasks.secondarySort'));
    expect(storedSecondary).toBe('title');

    // Reload the page
    await page.reload();
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Secondary sort should be preserved in dropdown display
    await expect(page.getByTestId('sort-by-dropdown')).toContainText('Title');
  });

  test('secondary sort can be cleared', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // First set a secondary sort
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-secondary-button').click();
    await page.getByTestId('sort-secondary-option-title').click();

    // Verify it's set
    await expect(page.getByTestId('sort-by-dropdown')).toContainText('Title');

    // Now clear it
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-secondary-button').click();
    await page.getByTestId('sort-secondary-option-none').click();

    // Should not contain the secondary sort anymore
    const dropdownText = await page.getByTestId('sort-by-dropdown').textContent();
    expect(dropdownText).not.toContain('Title');

    // localStorage should be cleared
    const storedSecondary = await page.evaluate(() => localStorage.getItem('tasks.secondarySort'));
    expect(storedSecondary).toBeNull();
  });

  test('primary sort field is not shown in secondary options', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Set primary sort to Priority
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-by-option-priority').click();

    // Open secondary sort
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-secondary-button').click();

    // Priority should NOT be in secondary options
    await expect(page.getByTestId('sort-secondary-option-priority')).not.toBeVisible();

    // But other options should be present
    await expect(page.getByTestId('sort-secondary-option-created_at')).toBeVisible();
    await expect(page.getByTestId('sort-secondary-option-updated_at')).toBeVisible();
  });

  test('clicking header column sorts by that field', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Click on Priority header
    await page.getByTestId('sort-header-priority').click();

    // Sort dropdown should now show Priority
    await expect(page.getByTestId('sort-by-dropdown')).toContainText('Priority');

    // localStorage should be updated
    const storedSort = await page.evaluate(() => localStorage.getItem('tasks.sortBy'));
    expect(storedSort).toBe('priority');
  });

  test('clicking same header column toggles direction', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Set initial sort to Priority (descending)
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-by-option-priority').click();

    // Click Priority header
    await page.getByTestId('sort-header-priority').click();

    // Should toggle to ascending
    const storedDir = await page.evaluate(() => localStorage.getItem('tasks.sortDir'));
    expect(storedDir).toBe('asc');

    // Click again
    await page.getByTestId('sort-header-priority').click();

    // Should toggle back to descending
    const storedDir2 = await page.evaluate(() => localStorage.getItem('tasks.sortDir'));
    expect(storedDir2).toBe('desc');
  });

  test('sorting works with grouping enabled', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Enable grouping by Status
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-status').click();
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();

    // Set sort to Priority
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-by-option-priority').click();

    // View should still be grouped
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();
    await expect(page.getByTestId('sort-by-dropdown')).toContainText('Priority');
  });

  test('sorting resets to page 1', async ({ page }) => {
    const hasTasks = await ensureTestTasks(page);
    if (!hasTasks) {
      test.skip();
      return;
    }

    // Start on page 2 if possible
    await page.goto('/tasks?page=2');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('view-toggle-list').click();

    // Change sort
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-by-option-priority').click();

    // URL should now be page 1
    await expect(page).toHaveURL(/page=1/);
  });
});
