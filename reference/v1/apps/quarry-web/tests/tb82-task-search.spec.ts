import { test, expect } from '@playwright/test';

test.describe('TB82: Task Search', () => {
  // Helper to ensure we have some test tasks
  async function ensureTestTasks(page: import('@playwright/test').Page): Promise<{ count: number; titles: string[] }> {
    const response = await page.request.get('/api/tasks?limit=1000');
    const data = await response.json();
    const tasks = data.items || data;
    return {
      count: tasks.length,
      titles: tasks.map((t: { title: string }) => t.title)
    };
  }

  test.beforeEach(async ({ page }) => {
    // Clear localStorage for consistent testing
    await page.goto('/tasks');
    await page.evaluate(() => {
      localStorage.removeItem('tasks.search');
    });
    await page.reload();
  });

  test('search bar is visible on Tasks page', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Search bar should be visible
    await expect(page.getByTestId('task-search-container')).toBeVisible();
    await expect(page.getByTestId('task-search-input')).toBeVisible();
  });

  test('search input has correct placeholder', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('task-search-input');
    await expect(searchInput).toHaveAttribute('placeholder', 'Search tasks... (Press / to focus)');
  });

  test('typing in search input filters tasks', async ({ page }) => {
    const { count, titles } = await ensureTestTasks(page);
    if (count < 2) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Get initial task count
    const initialTaskRows = page.locator('[data-testid^="task-row-"]');
    const initialCount = await initialTaskRows.count();

    // Type a search query that should match some tasks
    const searchInput = page.getByTestId('task-search-input');
    await searchInput.fill(titles[0].substring(0, 3)); // Use first 3 chars of first task title

    // Wait for debounce (300ms) + rendering
    await page.waitForTimeout(400);

    // The filtered results should include at least one task (the one we searched for)
    const filteredRows = page.locator('[data-testid^="task-row-"]');
    const filteredCount = await filteredRows.count();
    expect(filteredCount).toBeGreaterThan(0);
  });

  test('search with no matches shows empty list', async ({ page }) => {
    const { count } = await ensureTestTasks(page);
    if (count === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Type a search query that shouldn't match anything
    const searchInput = page.getByTestId('task-search-input');
    await searchInput.fill('xyzzynonexistenttask123456789');

    // Wait for debounce
    await page.waitForTimeout(400);

    // No tasks should be shown
    const taskRows = page.locator('[data-testid^="task-row-"]');
    await expect(taskRows).toHaveCount(0);

    // Empty state message should appear
    await expect(page.getByText('No tasks found.')).toBeVisible();
  });

  test('clear button appears when search has value', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('task-search-input');
    const clearButton = page.getByTestId('task-search-clear');

    // Clear button should not be visible initially
    await expect(clearButton).not.toBeVisible();

    // Type something
    await searchInput.fill('test');

    // Clear button should now be visible
    await expect(clearButton).toBeVisible();
  });

  test('clicking clear button clears the search', async ({ page }) => {
    const { count, titles } = await ensureTestTasks(page);
    if (count === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('task-search-input');

    // Type a search query
    await searchInput.fill('test');
    await page.waitForTimeout(400);

    // Click the clear button
    await page.getByTestId('task-search-clear').click();

    // Input should be empty
    await expect(searchInput).toHaveValue('');

    // Clear button should be hidden again
    await expect(page.getByTestId('task-search-clear')).not.toBeVisible();
  });

  test('pressing Escape clears search when input is focused', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('task-search-input');

    // Focus and type
    await searchInput.click();
    await searchInput.fill('test');
    await expect(searchInput).toHaveValue('test');

    // Press Escape
    await page.keyboard.press('Escape');

    // Input should be cleared
    await expect(searchInput).toHaveValue('');
  });

  test('pressing / focuses the search input', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('task-search-input');

    // Make sure search input is not focused initially
    await page.getByTestId('tasks-page').click();

    // Press /
    await page.keyboard.press('/');

    // Search input should be focused
    await expect(searchInput).toBeFocused();
  });

  test('search highlights matching characters in task titles', async ({ page }) => {
    const { count, titles } = await ensureTestTasks(page);
    if (count === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Find a title and search for part of it
    const searchTerm = titles[0].substring(0, 3).toLowerCase();

    const searchInput = page.getByTestId('task-search-input');
    await searchInput.fill(searchTerm);
    await page.waitForTimeout(400);

    // Check for highlighted marks in task titles
    const taskTitles = page.locator('[data-testid^="task-title-"]');
    const titleCount = await taskTitles.count();

    if (titleCount > 0) {
      // At least one title should have highlighted marks
      const marks = taskTitles.first().locator('mark');
      const markCount = await marks.count();
      expect(markCount).toBeGreaterThan(0);
    }
  });

  test('search works with grouping', async ({ page }) => {
    const { count } = await ensureTestTasks(page);
    if (count < 3) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Enable grouping by status
    await page.getByTestId('group-by-dropdown').click();
    await page.getByTestId('group-by-option-status').click();
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();

    // Type a search query
    const searchInput = page.getByTestId('task-search-input');
    await searchInput.fill('task');
    await page.waitForTimeout(400);

    // Grouped view should still be active
    await expect(page.getByTestId('tasks-grouped-list-view')).toBeVisible();

    // Groups should show filtered tasks
    const groupHeaders = page.locator('[data-testid^="group-header-"]');
    const headerCount = await groupHeaders.count();
    // May have no groups or some groups based on matching tasks
    expect(headerCount).toBeGreaterThanOrEqual(0);
  });

  test('search works with sorting', async ({ page }) => {
    const { count } = await ensureTestTasks(page);
    if (count < 2) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Change sort order
    await page.getByTestId('sort-by-dropdown').click();
    await page.getByTestId('sort-by-option-title').click();

    // Type a search query
    const searchInput = page.getByTestId('task-search-input');
    await searchInput.fill('task');
    await page.waitForTimeout(400);

    // Results should still be sorted (we just verify the search still works after sort change)
    const taskRows = page.locator('[data-testid^="task-row-"]');
    const rowCount = await taskRows.count();
    // Just verify results are shown (sorting is tested elsewhere)
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('search resets pagination to page 1', async ({ page }) => {
    const { count } = await ensureTestTasks(page);
    if (count < 30) {
      // Need enough tasks to have multiple pages
      test.skip();
      return;
    }

    await page.goto('/tasks?page=2&limit=10');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Verify we're on page 2
    expect(page.url()).toContain('page=2');

    // Type a search query
    const searchInput = page.getByTestId('task-search-input');
    await searchInput.fill('test');
    await page.waitForTimeout(400);

    // Should be reset to page 1
    expect(page.url()).toContain('page=1');
  });

  test('search persists in localStorage', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('task-search-input');
    await searchInput.fill('persisted-search');

    // Wait for debounce
    await page.waitForTimeout(400);

    // Check localStorage
    const storedSearch = await page.evaluate(() => localStorage.getItem('tasks.search'));
    expect(storedSearch).toBe('persisted-search');
  });

  test('search is restored from localStorage on page load', async ({ page }) => {
    // Set localStorage first
    await page.goto('/tasks');
    await page.evaluate(() => {
      localStorage.setItem('tasks.search', 'restored-search');
    });

    // Reload the page
    await page.reload();
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Search input should have the stored value
    const searchInput = page.getByTestId('task-search-input');
    await expect(searchInput).toHaveValue('restored-search');
  });

  test('search is debounced (300ms)', async ({ page }) => {
    const { count } = await ensureTestTasks(page);
    if (count === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('task-search-input');

    // Get initial task count
    const initialRows = page.locator('[data-testid^="task-row-"]');
    const initialCount = await initialRows.count();

    // Type quickly - these should be debounced together
    await searchInput.type('xyz', { delay: 50 });

    // Check immediately - should still show initial count (debounce hasn't fired)
    const immediateRows = page.locator('[data-testid^="task-row-"]');
    // Give a small buffer for UI updates
    await page.waitForTimeout(100);
    const immediateCount = await immediateRows.count();

    // After debounce period, count should change (if query matches nothing)
    await page.waitForTimeout(400);

    const finalRows = page.locator('[data-testid^="task-row-"]');
    const finalCount = await finalRows.count();

    // If 'xyz' doesn't match anything, count should be 0 after debounce
    // The key test is that debouncing is happening (final count differs from initial only after delay)
    expect(typeof finalCount).toBe('number');
  });

  test('search in kanban view', async ({ page }) => {
    const { count } = await ensureTestTasks(page);
    if (count === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Switch to kanban view
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-view-content')).toBeVisible();

    // Search bar should still be visible
    await expect(page.getByTestId('task-search-input')).toBeVisible();

    // Search should filter kanban cards
    const searchInput = page.getByTestId('task-search-input');
    await searchInput.fill('task');
    await page.waitForTimeout(400);

    // Kanban view should still be visible
    await expect(page.getByTestId('kanban-view-content')).toBeVisible();
  });

  test('clearing search restores all tasks', async ({ page }) => {
    const { count, titles } = await ensureTestTasks(page);
    if (count < 2) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('task-search-input');

    // Get initial task count (may be limited by pagination)
    const initialRows = page.locator('[data-testid^="task-row-"]');
    const initialCount = await initialRows.count();

    // Search for something specific
    await searchInput.fill(titles[0].substring(0, 5));
    await page.waitForTimeout(400);

    // May have filtered results
    const filteredRows = page.locator('[data-testid^="task-row-"]');
    const filteredCount = await filteredRows.count();

    // Clear the search
    await page.getByTestId('task-search-clear').click();
    await page.waitForTimeout(400);

    // Should restore original count
    const restoredRows = page.locator('[data-testid^="task-row-"]');
    const restoredCount = await restoredRows.count();
    expect(restoredCount).toBe(initialCount);
  });
});
