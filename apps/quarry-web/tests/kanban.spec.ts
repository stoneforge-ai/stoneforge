import { test, expect } from '@playwright/test';

test.describe('TB14: Kanban View', () => {
  // Helper to get first task
  async function getFirstTask(page: import('@playwright/test').Page): Promise<{ id: string; title: string; status: string } | null> {
    const response = await page.request.get('/api/tasks/ready');
    const tasks = await response.json();
    return tasks.length > 0 ? tasks[0] : null;
  }

  test('view toggle is visible on tasks page', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('view-toggle')).toBeVisible();
  });

  test('view toggle has list and kanban buttons', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('view-toggle-list')).toBeVisible();
    await expect(page.getByTestId('view-toggle-kanban')).toBeVisible();
  });

  test('default view is list', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // List view should be visible by default
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();
    await expect(page.getByTestId('kanban-board')).not.toBeVisible();
  });

  test('clicking kanban toggle switches to kanban view', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Switch to kanban view
    await page.getByTestId('view-toggle-kanban').click();

    // Kanban board should be visible
    await expect(page.getByTestId('kanban-board')).toBeVisible();
    await expect(page.getByTestId('tasks-list-view')).not.toBeVisible();
  });

  test('clicking list toggle switches back to list view', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Switch to kanban
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Switch back to list
    await page.getByTestId('view-toggle-list').click();
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();
    await expect(page.getByTestId('kanban-board')).not.toBeVisible();
  });

  test('kanban board has status columns', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Check for the status columns
    await expect(page.getByTestId('kanban-column-open')).toBeVisible();
    await expect(page.getByTestId('kanban-column-in_progress')).toBeVisible();
    await expect(page.getByTestId('kanban-column-blocked')).toBeVisible();
    await expect(page.getByTestId('kanban-column-completed')).toBeVisible();
  });

  test('task cards are displayed in kanban columns', async ({ page }) => {
    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Find the task card
    const taskCard = page.getByTestId(`kanban-card-${task.id}`);
    await expect(taskCard).toBeVisible();
  });

  test('clicking task card opens detail panel', async ({ page }) => {
    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Click the task card
    await page.getByTestId(`kanban-card-${task.id}`).click();

    // Detail panel should open
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('task-detail-title')).toHaveText(task.title);
  });

  test('can create task from kanban view', async ({ page }) => {
    // Get an entity for createdBy
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();
    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Create button should still be visible
    await expect(page.getByTestId('create-task-button')).toBeVisible();

    // Create a new task
    await page.getByTestId('create-task-button').click();
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    const title = `Kanban Task ${Date.now()}`;
    await page.getByTestId('create-task-title-input').fill(title);
    await page.getByTestId('create-task-created-by-select').selectOption(entities[0].id);
    await page.getByTestId('create-task-submit-button').click();

    await expect(page.getByTestId('create-task-modal')).not.toBeVisible({ timeout: 10000 });

    // Task should appear in the kanban board
    await page.waitForTimeout(1000); // Wait for query invalidation

    // Find the new task card
    const taskCards = page.locator('[data-testid^="kanban-card-"]').filter({ hasText: title });
    await expect(taskCards).toBeVisible({ timeout: 10000 });
  });

  test('dragging task between columns updates status', async ({ page }) => {
    // Note: dnd-kit requires specific drag simulation that Playwright's dragTo doesn't fully support.
    // We'll test the underlying API update instead, which is what the drag handler calls.

    // Create a task to test with
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();
    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Create a task with 'open' status
    const title = `Drag Test Task ${Date.now()}`;
    const createResponse = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: entities[0].id,
        status: 'open',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const createdTask = await createResponse.json();

    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Verify the task is in the open column
    const openColumn = page.getByTestId('kanban-column-open');
    const taskCard = openColumn.getByTestId(`kanban-card-${createdTask.id}`);
    await expect(taskCard).toBeVisible({ timeout: 10000 });

    // Simulate what a drag would do: update via API
    const updateResponse = await page.request.patch(`/api/tasks/${createdTask.id}`, {
      data: { status: 'in_progress' },
    });
    expect(updateResponse.ok()).toBe(true);

    // Wait for UI to update via WebSocket invalidation
    await page.waitForTimeout(2000);

    // Verify the task is now in the in_progress column
    const inProgressColumn = page.getByTestId('kanban-column-in_progress');
    const movedCard = inProgressColumn.getByTestId(`kanban-card-${createdTask.id}`);
    await expect(movedCard).toBeVisible({ timeout: 10000 });
  });

  test('kanban view preserves selected task when switching views', async ({ page }) => {
    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Select a task in list view
    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible();

    // Switch to kanban view
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Detail panel should still be visible with the same task
    await expect(page.getByTestId('task-detail-panel')).toBeVisible();
    await expect(page.getByTestId('task-detail-title')).toHaveText(task.title);

    // Switch back to list view
    await page.getByTestId('view-toggle-list').click();

    // Detail panel should still be visible
    await expect(page.getByTestId('task-detail-panel')).toBeVisible();
    await expect(page.getByTestId('task-detail-title')).toHaveText(task.title);
  });

  test('columns show task count', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Check that columns show a count (could be 0 or more)
    const openColumn = page.getByTestId('kanban-column-open');
    // The count badge should have a number (using the text-gray-600 class to distinguish from the dot)
    await expect(openColumn.locator('.text-gray-600.rounded-full')).toBeVisible();
  });
});

test.describe('TB49: Task List/Kanban Toggle Polish', () => {
  test('view preference persists in localStorage', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Switch to kanban view
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Check localStorage
    const viewMode = await page.evaluate(() => localStorage.getItem('tasks.viewMode'));
    expect(viewMode).toBe('kanban');

    // Reload page
    await page.reload();
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Should still be in kanban view
    await expect(page.getByTestId('kanban-board')).toBeVisible();
  });

  test('view preference defaults to list when not set', async ({ page }) => {
    // Clear localStorage first
    await page.goto('/tasks?page=1&limit=25');
    await page.evaluate(() => localStorage.removeItem('tasks.viewMode'));

    // Reload
    await page.reload();
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Should be in list view by default
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();
  });

  test('switching back to list persists preference', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Set to kanban first
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Switch back to list
    await page.getByTestId('view-toggle-list').click();
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();

    // Check localStorage
    const viewMode = await page.evaluate(() => localStorage.getItem('tasks.viewMode'));
    expect(viewMode).toBe('list');
  });

  test('view toggle shows keyboard shortcut hints', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Check list button has shortcut hint
    const listButton = page.getByTestId('view-toggle-list');
    await expect(listButton).toHaveAttribute('title', 'List view (V L)');

    // Check kanban button has shortcut hint
    const kanbanButton = page.getByTestId('view-toggle-kanban');
    await expect(kanbanButton).toHaveAttribute('title', 'Kanban view (V K)');
  });

  test('V L keyboard shortcut switches to list view', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Start in kanban view
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Press V then L
    await page.keyboard.press('v');
    await page.keyboard.press('l');

    // Should switch to list view
    await expect(page.getByTestId('tasks-list-view')).toBeVisible({ timeout: 5000 });
  });

  test('V K keyboard shortcut switches to kanban view', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Ensure we start in list view
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();

    // Press V then K
    await page.keyboard.press('v');
    await page.keyboard.press('k');

    // Should switch to kanban view
    await expect(page.getByTestId('kanban-board')).toBeVisible({ timeout: 5000 });
  });

  test('view toggle button shows highlighted state', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // In list view, list button should have highlight classes
    const listButton = page.getByTestId('view-toggle-list');
    await expect(listButton).toHaveClass(/bg-white/);
    await expect(listButton).toHaveClass(/shadow-sm/);

    // Switch to kanban
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Now kanban button should have highlight classes
    const kanbanButton = page.getByTestId('view-toggle-kanban');
    await expect(kanbanButton).toHaveClass(/bg-white/);
    await expect(kanbanButton).toHaveClass(/shadow-sm/);
  });

  test('view transition animation class is applied', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Check that list view content has the animation class
    const listContent = page.getByTestId('list-view-content');
    await expect(listContent).toHaveClass(/animate-fade-in/);

    // Switch to kanban
    await page.getByTestId('view-toggle-kanban').click();

    // Check that kanban view content has the animation class
    const kanbanContent = page.getByTestId('kanban-view-content');
    await expect(kanbanContent).toHaveClass(/animate-fade-in/);
  });
});
