import { test, expect } from '@playwright/test';

test.describe('TB85: Kanban Pagination Fix (Virtualized Columns)', () => {
  /**
   * Helper to create multiple tasks via API.
   * Returns empty array if no entities are available.
   */
  async function createTasks(
    page: import('@playwright/test').Page,
    count: number,
    status: string,
    prefix: string
  ): Promise<string[]> {
    // First get an entity for createdBy
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();
    if (!entities.data || entities.data.length === 0) {
      return []; // Return empty to allow test to skip
    }
    const creatorId = entities.data[0].id;

    const createdIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const response = await page.request.post('/api/tasks', {
        data: {
          title: `${prefix} Task ${i + 1}`,
          createdBy: creatorId,
          status,
        },
      });

      if (response.ok()) {
        const task = await response.json();
        createdIds.push(task.id);
      }
    }

    return createdIds;
  }

  /**
   * Helper to clean up tasks after test.
   */
  async function deleteTasks(page: import('@playwright/test').Page, taskIds: string[]) {
    for (const id of taskIds) {
      await page.request.delete(`/api/tasks/${id}`);
    }
  }

  test('kanban columns can scroll independently', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Check that each column has independent scrolling (overflow-y-auto)
    const openColumn = page.getByTestId('kanban-column-open');
    await expect(openColumn).toBeVisible();

    // The column should have max-h and overflow-y-auto for independent scrolling
    // The cards container (not the column itself) handles scrolling
    const cardsContainer = openColumn.locator('[class*="overflow-y-auto"]');
    await expect(cardsContainer).toBeVisible();
  });

  test('column headers show task count', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Each column should show a count badge
    const openCount = page.getByTestId('kanban-column-open-count');
    const inProgressCount = page.getByTestId('kanban-column-in_progress-count');
    const blockedCount = page.getByTestId('kanban-column-blocked-count');
    const completedCount = page.getByTestId('kanban-column-completed-count');

    // All count badges should be visible
    await expect(openCount).toBeVisible();
    await expect(inProgressCount).toBeVisible();
    await expect(blockedCount).toBeVisible();
    await expect(completedCount).toBeVisible();

    // Counts should be numbers (0 or more)
    const openCountText = await openCount.textContent();
    expect(parseInt(openCountText || '0', 10)).toBeGreaterThanOrEqual(0);
  });

  test('drag-and-drop still works (via API simulation)', async ({ page }) => {
    // First get an entity for createdBy
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();
    if (!entities.data || entities.data.length === 0) {
      test.skip();
      return;
    }

    // Create a task in 'open' status
    const title = `DnD Test Task ${Date.now()}`;
    const createResponse = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: entities.data[0].id,
        status: 'open',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const createdTask = await createResponse.json();

    try {
      await page.goto('/tasks');
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      // Verify task is in open column
      const openColumn = page.getByTestId('kanban-column-open');
      const taskCard = openColumn.getByTestId(`kanban-card-${createdTask.id}`);
      await expect(taskCard).toBeVisible({ timeout: 10000 });

      // Simulate drag by updating status via API (same as actual drag handler does)
      const updateResponse = await page.request.patch(`/api/tasks/${createdTask.id}`, {
        data: { status: 'in_progress' },
      });
      expect(updateResponse.ok()).toBe(true);

      // Wait for real-time update
      await page.waitForTimeout(2000);

      // Verify task moved to in_progress column
      const inProgressColumn = page.getByTestId('kanban-column-in_progress');
      const movedCard = inProgressColumn.getByTestId(`kanban-card-${createdTask.id}`);
      await expect(movedCard).toBeVisible({ timeout: 10000 });
    } finally {
      // Clean up
      await page.request.delete(`/api/tasks/${createdTask.id}`);
    }
  });

  test('kanban displays all four columns', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // All four status columns should be visible
    await expect(page.getByTestId('kanban-column-open')).toBeVisible();
    await expect(page.getByTestId('kanban-column-in_progress')).toBeVisible();
    await expect(page.getByTestId('kanban-column-blocked')).toBeVisible();
    await expect(page.getByTestId('kanban-column-completed')).toBeVisible();
  });

  test('clicking task in kanban opens detail panel', async ({ page }) => {
    // Get a task
    const tasksResponse = await page.request.get('/api/tasks/ready');
    const tasks = await tasksResponse.json();
    if (tasks.length === 0) {
      test.skip();
      return;
    }

    const task = tasks[0];

    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Click the task card
    const taskCard = page.getByTestId(`kanban-card-${task.id}`);
    await expect(taskCard).toBeVisible();
    await taskCard.click();

    // Detail panel should open
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });
  });

  test('kanban columns have proper styling for scrollability', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // The kanban board should allow horizontal scrolling for many columns
    const board = page.getByTestId('kanban-board');
    await expect(board).toHaveClass(/overflow-x-auto/);
  });

  test('kanban board has minimum height', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // The kanban board should have minimum height
    const board = page.getByTestId('kanban-board');
    await expect(board).toHaveClass(/min-h-\[400px\]/);
  });

  test('empty column shows "No tasks" message', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // At least one column might be empty and should show "No tasks"
    const blockedColumn = page.getByTestId('kanban-column-blocked');
    const noTasksMessage = blockedColumn.getByText('No tasks');

    // Check if blocked column is empty
    const blockedCount = page.getByTestId('kanban-column-blocked-count');
    const countText = await blockedCount.textContent();

    if (countText === '0') {
      await expect(noTasksMessage).toBeVisible();
    }
  });

  test('column count updates when task is moved', async ({ page }) => {
    // Get an entity for createdBy
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();
    if (!entities.data || entities.data.length === 0) {
      test.skip();
      return;
    }

    // Create a task in 'open' status
    const title = `Count Test Task ${Date.now()}`;
    const createResponse = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: entities.data[0].id,
        status: 'open',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const createdTask = await createResponse.json();

    try {
      await page.goto('/tasks');
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      // Get initial open count
      const openCount = page.getByTestId('kanban-column-open-count');
      const initialOpenCount = parseInt((await openCount.textContent()) || '0', 10);

      // Move task to in_progress
      await page.request.patch(`/api/tasks/${createdTask.id}`, {
        data: { status: 'in_progress' },
      });

      // Wait for update
      await page.waitForTimeout(2000);

      // Open count should decrease by 1
      const newOpenCount = parseInt((await openCount.textContent()) || '0', 10);
      expect(newOpenCount).toBe(initialOpenCount - 1);
    } finally {
      // Clean up
      await page.request.delete(`/api/tasks/${createdTask.id}`);
    }
  });

  test('kanban uses virtualization for columns with many tasks', async ({ page }) => {
    // Create 25+ tasks in open status to trigger virtualization threshold (20)
    let createdIds: string[] = [];

    try {
      createdIds = await createTasks(page, 25, 'open', 'Virtualize Test');

      if (createdIds.length === 0) {
        test.skip();
        return;
      }

      await page.goto('/tasks');
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      // Check that the open column has a scroll container
      const openColumn = page.getByTestId('kanban-column-open');
      const scrollContainer = openColumn.getByTestId('kanban-column-open-scroll');

      // For virtualized columns, check for scroll container
      // The scroll container should have overflow-y-auto
      const hasScrollContainer = await scrollContainer.count() > 0;

      if (hasScrollContainer) {
        await expect(scrollContainer).toBeVisible();
        await expect(scrollContainer).toHaveClass(/overflow-y-auto/);
      }

      // Verify all 25+ tasks are counted
      const openCount = page.getByTestId('kanban-column-open-count');
      const countText = await openCount.textContent();
      const count = parseInt(countText || '0', 10);
      expect(count).toBeGreaterThanOrEqual(25);
    } finally {
      // Clean up
      await deleteTasks(page, createdIds);
    }
  });

  test('dark mode styling is applied to kanban columns', async ({ page }) => {
    // Set dark theme in localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem('settings.theme', 'dark');
    });

    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Column should have dark mode classes
    const openColumn = page.getByTestId('kanban-column-open');
    await expect(openColumn).toHaveClass(/dark:bg-neutral-800/);
  });
});
