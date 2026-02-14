import { test, expect } from '@playwright/test';

test.describe('TB46: Universal Pagination', () => {
  // ============================================================================
  // TASKS PAGE PAGINATION
  // ============================================================================
  test('tasks page loads with default pagination params in URL', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page).toHaveURL(/\/tasks\?page=1&limit=25/);
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
  });

  test('pagination component is visible on tasks page', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Wait for tasks to load
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Pagination should be visible
    await expect(page.getByTestId('pagination')).toBeVisible();
  });

  test('pagination info shows correct range', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Should show pagination info
    const paginationInfo = page.getByTestId('pagination-info');
    await expect(paginationInfo).toBeVisible();
    // Info should contain "of" (e.g., "Showing 1-25 of 100" or "No items")
    await expect(paginationInfo).toHaveText(/of|No items/);
  });

  test('page size selector is visible', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Page size selector should be visible
    await expect(page.getByTestId('pagination-page-size')).toBeVisible();
  });

  test('changing page size updates URL', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Change page size to 50
    await page.getByTestId('pagination-page-size').selectOption('50');

    // URL should update
    await expect(page).toHaveURL(/limit=50/);
  });

  test('clicking next page updates URL', async ({ page }) => {
    // First, get tasks to check if there are enough for pagination
    const response = await page.request.get('/api/tasks?limit=10');
    const data = await response.json();

    if (!data.items || data.total <= 10) {
      test.skip();
      return;
    }

    await page.goto('/tasks?page=1&limit=10');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Click next page
    await page.getByTestId('pagination-next').click();

    // URL should update to page 2
    await expect(page).toHaveURL(/page=2/);
  });

  test('clicking page number updates URL', async ({ page }) => {
    // First, get tasks to check if there are enough for pagination
    const response = await page.request.get('/api/tasks?limit=10');
    const data = await response.json();

    if (!data.items || data.total <= 20) {
      test.skip();
      return;
    }

    await page.goto('/tasks?page=1&limit=10');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Click page 2
    await page.getByTestId('pagination-page-2').click();

    // URL should update to page 2
    await expect(page).toHaveURL(/page=2/);
  });

  test('sidebar navigation to tasks uses default pagination', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click tasks in sidebar
    await page.getByTestId('nav-tasks').click();

    // Should navigate to tasks with pagination params
    await expect(page).toHaveURL(/\/tasks\?page=1&limit=25/);
  });

  test('direct URL navigation with custom pagination works', async ({ page }) => {
    await page.goto('/tasks?page=2&limit=50');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Page size selector should show 50
    await expect(page.getByTestId('pagination-page-size')).toHaveValue('50');
  });

  test('pagination buttons are disabled at boundaries', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // On first page, prev and first buttons should be disabled
    await expect(page.getByTestId('pagination-first')).toBeDisabled();
    await expect(page.getByTestId('pagination-prev')).toBeDisabled();
  });

  test('filter changes reset to page 1', async ({ page }) => {
    // First, get tasks to check if there are enough for pagination
    const response = await page.request.get('/api/tasks?limit=10');
    const data = await response.json();

    if (!data.items || data.total <= 10) {
      test.skip();
      return;
    }

    // Start on page 2
    await page.goto('/tasks?page=2&limit=10');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Open filter bar
    await page.getByTestId('filter-toggle').click();

    // Click a status filter
    await page.getByTestId('filter-status-open').click();

    // URL should reset to page 1
    await expect(page).toHaveURL(/page=1/);
  });

  test('sort changes reset to page 1', async ({ page }) => {
    // First, get tasks to check if there are enough for pagination
    const response = await page.request.get('/api/tasks?limit=10');
    const data = await response.json();

    if (!data.items || data.total <= 10) {
      test.skip();
      return;
    }

    // Start on page 2
    await page.goto('/tasks?page=2&limit=10');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Click a sortable header
    await page.getByTestId('sort-header-title').click();

    // URL should reset to page 1
    await expect(page).toHaveURL(/page=1/);
  });

  // ============================================================================
  // TEAMS PAGE PAGINATION
  // ============================================================================

  test('teams page loads with pagination params in URL', async ({ page }) => {
    await page.goto('/teams');
    await expect(page).toHaveURL(/\/teams\?.*page=1/);
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
  });

  test('teams page shows pagination when items exist', async ({ page }) => {
    await page.goto('/teams?page=1&limit=25');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading teams...')).not.toBeVisible({ timeout: 10000 });

    // Check for pagination info or grid
    const teamsGrid = page.getByTestId('teams-grid');
    const teamsEmpty = page.getByTestId('teams-empty');

    // Either grid with pagination or empty state should be visible
    const gridVisible = await teamsGrid.isVisible().catch(() => false);
    const emptyVisible = await teamsEmpty.isVisible().catch(() => false);
    expect(gridVisible || emptyVisible).toBe(true);
  });

  test('sidebar navigation to teams uses default pagination', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('nav-teams').click();
    await expect(page).toHaveURL(/\/teams\?.*page=1/);
  });

  // ============================================================================
  // DOCUMENTS PAGE (no pagination - uses virtualization)
  // ============================================================================

  test('documents page loads without pagination params', async ({ page }) => {
    await page.goto('/documents');
    // Documents page no longer uses pagination, so no page/limit params expected
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar navigation to documents does not include pagination', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('nav-documents').click();
    // Documents page no longer uses pagination params
    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
  });

  // ============================================================================
  // MESSAGES PAGE (no pagination - uses virtualization)
  // ============================================================================

  test('messages page loads without pagination params', async ({ page }) => {
    await page.goto('/messages');
    // Messages page no longer uses pagination, so no page/limit params expected
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
  });

  test('messages page shows channel list with virtualization', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading channels...')).not.toBeVisible({ timeout: 10000 });

    // Channel list or placeholder should be visible
    const channelList = page.getByTestId('channel-list');
    const channelPlaceholder = page.getByTestId('channel-placeholder');

    const listVisible = await channelList.isVisible().catch(() => false);
    const placeholderVisible = await channelPlaceholder.isVisible().catch(() => false);
    expect(listVisible || placeholderVisible).toBe(true);
  });

  test('sidebar navigation to messages does not include pagination', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('nav-messages').click();
    // Messages page no longer uses pagination params
    await expect(page).toHaveURL(/\/messages$/);
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
  });

  // ============================================================================
  // TIMELINE PAGE PAGINATION
  // ============================================================================

  test('timeline page loads with pagination params in URL', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page).toHaveURL(/\/dashboard\/timeline\?page=1/);
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
  });

  test('timeline page shows events list', async ({ page }) => {
    await page.goto('/dashboard/timeline?page=1&limit=100');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.locator('text=Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Events list should be visible
    await expect(page.getByTestId('events-list')).toBeVisible();
  });

  test('sidebar navigation to timeline uses default pagination', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('nav-timeline').click();
    await expect(page).toHaveURL(/\/dashboard\/timeline\?page=1/);
  });

  // ============================================================================
  // ENTITIES PAGE PAGINATION
  // ============================================================================

  test('entities page loads with pagination params in URL', async ({ page }) => {
    await page.goto('/entities');
    await expect(page).toHaveURL(/\/entities\?.*page=1/);
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar navigation to entities uses default pagination', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('nav-entities').click();
    await expect(page).toHaveURL(/\/entities\?.*page=1/);
  });
});
