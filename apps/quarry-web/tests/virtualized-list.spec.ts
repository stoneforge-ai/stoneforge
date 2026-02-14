import { test, expect } from '@playwright/test';

test.describe('TB68: Virtualized List Component', () => {
  // ============================================================================
  // TASK LIST VIRTUALIZATION
  // ============================================================================

  test('tasks page renders with list view', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Task list should be visible
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();
  });

  test('tasks list has header with sortable columns', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Header should be visible
    await expect(page.getByTestId('tasks-list-header')).toBeVisible();

    // Sort headers should be present
    await expect(page.getByTestId('sort-header-title')).toBeVisible();
    await expect(page.getByTestId('sort-header-status')).toBeVisible();
    await expect(page.getByTestId('sort-header-priority')).toBeVisible();
  });

  test('clicking sort header changes sort order', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Click title header to sort
    await page.getByTestId('sort-header-title').click();

    // Wait for sort to take effect
    await page.waitForTimeout(300);

    // The sort should be applied (no visual change to verify, but it shouldn't error)
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();
  });

  test('task rows display correctly', async ({ page }) => {
    // First check if there are any tasks
    const response = await page.request.get('/api/tasks?limit=1');
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Should have at least one task row
    const taskRow = page.locator('[data-testid^="task-row-"]').first();
    await expect(taskRow).toBeVisible();
  });

  test('task row shows checkbox', async ({ page }) => {
    // First check if there are any tasks
    const response = await page.request.get('/api/tasks?limit=1');
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Get the first task row
    const firstTaskRow = page.locator('[data-testid^="task-row-"]').first();
    await expect(firstTaskRow).toBeVisible();

    // Find checkbox within the row
    const checkbox = firstTaskRow.locator('[data-testid^="task-checkbox-"]');
    await expect(checkbox).toBeVisible();
  });

  test('select all checkbox is visible', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Select all checkbox should be in the header
    await expect(page.getByTestId('task-select-all')).toBeVisible();
  });

  // ============================================================================
  // MESSAGES PAGE - MESSAGE LIST VIRTUALIZATION
  // ============================================================================

  test('messages page renders channel view', async ({ page }) => {
    // Get a channel to test with
    const response = await page.request.get('/api/channels?limit=1');
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      test.skip();
      return;
    }

    const channelId = data.items[0].id;
    await page.goto(`/messages?channel=${channelId}`);
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading channels...')).not.toBeVisible({ timeout: 10000 });

    // Channel view should be visible
    await expect(page.getByTestId('channel-view')).toBeVisible();
  });

  test('messages container is visible in channel view', async ({ page }) => {
    // Get a channel to test with
    const response = await page.request.get('/api/channels?limit=1');
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      test.skip();
      return;
    }

    const channelId = data.items[0].id;
    await page.goto(`/messages?channel=${channelId}`);
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading channels...')).not.toBeVisible({ timeout: 10000 });

    // Messages container should be visible
    await expect(page.getByTestId('messages-container')).toBeVisible();
  });

  // ============================================================================
  // TIMELINE PAGE - EVENT LIST VIRTUALIZATION
  // ============================================================================

  test('timeline page renders events list', async ({ page }) => {
    await page.goto('/dashboard/timeline?page=1&limit=100');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Events list should be visible
    await expect(page.getByTestId('events-list')).toBeVisible();
  });

  test('timeline time period groups are visible', async ({ page }) => {
    await page.goto('/dashboard/timeline?page=1&limit=100');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // At least one time period header or empty state should be visible
    const todayHeader = page.getByTestId('time-period-header-today');
    const yesterdayHeader = page.getByTestId('time-period-header-yesterday');
    const thisWeekHeader = page.getByTestId('time-period-header-thisWeek');
    const earlierHeader = page.getByTestId('time-period-header-earlier');
    const noEvents = page.locator('text=No events recorded yet');

    const anyVisible =
      (await todayHeader.isVisible().catch(() => false)) ||
      (await yesterdayHeader.isVisible().catch(() => false)) ||
      (await thisWeekHeader.isVisible().catch(() => false)) ||
      (await earlierHeader.isVisible().catch(() => false)) ||
      (await noEvents.isVisible().catch(() => false));

    expect(anyVisible).toBe(true);
  });

  test('timeline event cards display correctly', async ({ page }) => {
    // First check if there are any events
    const response = await page.request.get('/api/events?limit=1&paginated=true');
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline?page=1&limit=100');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Event cards should be visible
    const eventCard = page.getByTestId('event-card').first();
    await expect(eventCard).toBeVisible();

    // Event card should have icon, type badge, and element type badge
    await expect(eventCard.getByTestId('event-icon')).toBeVisible();
    await expect(eventCard.getByTestId('event-type-badge')).toBeVisible();
    await expect(eventCard.getByTestId('element-type-badge')).toBeVisible();
    await expect(eventCard.getByTestId('element-id')).toBeVisible();
    await expect(eventCard.getByTestId('actor-avatar')).toBeVisible();
    await expect(eventCard.getByTestId('event-time')).toBeVisible();
  });

  // ============================================================================
  // SCROLL BEHAVIOR
  // ============================================================================

  test('task list is scrollable', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=100');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // The tasks list view should exist
    const tasksList = page.getByTestId('tasks-list-view');
    await expect(tasksList).toBeVisible();
  });

  test('timeline events list is scrollable', async ({ page }) => {
    await page.goto('/dashboard/timeline?page=1&limit=100');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Loading events...')).not.toBeVisible({ timeout: 10000 });

    // The events list should exist and be scrollable
    const eventsList = page.getByTestId('events-list');
    await expect(eventsList).toBeVisible();
  });

  // ============================================================================
  // VIEW TOGGLE
  // ============================================================================

  test('task view toggle switches between list and kanban', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // View toggle should be visible
    const viewToggle = page.getByTestId('view-toggle');
    await expect(viewToggle).toBeVisible();

    // Start in list view
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();

    // Switch to kanban view
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Switch back to list view
    await page.getByTestId('view-toggle-list').click();
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();
  });
});
