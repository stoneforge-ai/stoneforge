import { test, expect } from '@playwright/test';

test.describe('TB15: Bulk Operations', () => {
  // Helper to get multiple tasks
  async function getTasks(page: import('@playwright/test').Page, count: number = 2): Promise<{ id: string; title: string; status: string }[]> {
    const response = await page.request.get('/api/tasks/ready');
    const tasks = await response.json();
    return tasks.slice(0, count);
  }

  // Helper to get first entity
  async function getFirstEntity(page: import('@playwright/test').Page): Promise<{ id: string } | null> {
    const response = await page.request.get('/api/entities');
    const entities = await response.json();
    return entities.length > 0 ? entities[0] : null;
  }

  test('PATCH /api/tasks/bulk endpoint updates multiple tasks', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create some tasks to bulk update
    const task1 = await page.request.post('/api/tasks', {
      data: { title: `Bulk Test 1 ${Date.now()}`, createdBy: entity.id },
    });
    const task2 = await page.request.post('/api/tasks', {
      data: { title: `Bulk Test 2 ${Date.now()}`, createdBy: entity.id },
    });

    const task1Data = await task1.json();
    const task2Data = await task2.json();

    // Bulk update
    const response = await page.request.patch('/api/tasks/bulk', {
      data: {
        ids: [task1Data.id, task2Data.id],
        updates: { status: 'in_progress' },
      },
    });

    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);

    // Verify tasks were updated
    const verify1 = await page.request.get(`/api/tasks/${task1Data.id}`);
    const verify2 = await page.request.get(`/api/tasks/${task2Data.id}`);
    expect((await verify1.json()).status).toBe('in_progress');
    expect((await verify2.json()).status).toBe('in_progress');
  });

  test('PATCH /api/tasks/bulk endpoint requires ids array', async ({ page }) => {
    const response = await page.request.patch('/api/tasks/bulk', {
      data: { updates: { status: 'open' } },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('PATCH /api/tasks/bulk endpoint requires updates object', async ({ page }) => {
    const response = await page.request.patch('/api/tasks/bulk', {
      data: { ids: ['task-1', 'task-2'] },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('checkboxes are visible in list view', async ({ page }) => {
    const tasks = await getTasks(page, 1);
    if (tasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`task-checkbox-${tasks[0].id}`)).toBeVisible();
  });

  test('select all checkbox is visible', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('task-select-all')).toBeVisible();
  });

  test('clicking checkbox selects task', async ({ page }) => {
    const tasks = await getTasks(page, 1);
    if (tasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Click checkbox
    await page.getByTestId(`task-checkbox-${tasks[0].id}`).click();

    // Bulk action menu should appear
    await expect(page.getByTestId('bulk-action-menu')).toBeVisible();
    await expect(page.getByTestId('bulk-selected-count')).toHaveText('1 selected');
  });

  test('selecting multiple tasks shows correct count', async ({ page }) => {
    const tasks = await getTasks(page, 3);
    if (tasks.length < 2) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Select first two tasks
    await page.getByTestId(`task-checkbox-${tasks[0].id}`).click();
    await page.getByTestId(`task-checkbox-${tasks[1].id}`).click();

    // Check count
    await expect(page.getByTestId('bulk-selected-count')).toHaveText('2 selected');
  });

  test('select all selects all tasks', async ({ page }) => {
    const tasks = await getTasks(page, 3);
    if (tasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Click select all
    await page.getByTestId('task-select-all').click();

    // Bulk action menu should show total count
    await expect(page.getByTestId('bulk-action-menu')).toBeVisible();
    const countText = await page.getByTestId('bulk-selected-count').textContent();
    const count = parseInt(countText?.match(/\d+/)?.[0] || '0');
    expect(count).toBeGreaterThan(0);
  });

  test('bulk status change updates all selected tasks', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create test tasks
    const task1 = await (await page.request.post('/api/tasks', {
      data: { title: `Bulk Status 1 ${Date.now()}`, createdBy: entity.id, status: 'open' },
    })).json();
    const task2 = await (await page.request.post('/api/tasks', {
      data: { title: `Bulk Status 2 ${Date.now()}`, createdBy: entity.id, status: 'open' },
    })).json();

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Select both tasks
    await page.getByTestId(`task-checkbox-${task1.id}`).click();
    await page.getByTestId(`task-checkbox-${task2.id}`).click();
    await expect(page.getByTestId('bulk-action-menu')).toBeVisible();

    // Open status dropdown and select "In Progress"
    await page.getByTestId('bulk-status-button').click();
    await expect(page.getByTestId('bulk-status-options')).toBeVisible();
    await page.getByTestId('bulk-status-option-in_progress').click();

    // Wait for update to complete
    await expect(page.getByTestId('bulk-action-menu')).not.toBeVisible({ timeout: 10000 });

    // Verify tasks were updated
    const verify1 = await page.request.get(`/api/tasks/${task1.id}`);
    const verify2 = await page.request.get(`/api/tasks/${task2.id}`);
    expect((await verify1.json()).status).toBe('in_progress');
    expect((await verify2.json()).status).toBe('in_progress');
  });

  test('bulk priority change updates all selected tasks', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create test tasks
    const task1 = await (await page.request.post('/api/tasks', {
      data: { title: `Bulk Priority 1 ${Date.now()}`, createdBy: entity.id, priority: 3 },
    })).json();
    const task2 = await (await page.request.post('/api/tasks', {
      data: { title: `Bulk Priority 2 ${Date.now()}`, createdBy: entity.id, priority: 3 },
    })).json();

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Select both tasks
    await page.getByTestId(`task-checkbox-${task1.id}`).click();
    await page.getByTestId(`task-checkbox-${task2.id}`).click();
    await expect(page.getByTestId('bulk-action-menu')).toBeVisible();

    // Open priority dropdown and select "Critical"
    await page.getByTestId('bulk-priority-button').click();
    await expect(page.getByTestId('bulk-priority-options')).toBeVisible();
    await page.getByTestId('bulk-priority-option-1').click();

    // Wait for update to complete
    await expect(page.getByTestId('bulk-action-menu')).not.toBeVisible({ timeout: 10000 });

    // Verify tasks were updated
    const verify1 = await page.request.get(`/api/tasks/${task1.id}`);
    const verify2 = await page.request.get(`/api/tasks/${task2.id}`);
    expect((await verify1.json()).priority).toBe(1);
    expect((await verify2.json()).priority).toBe(1);
  });

  test('clearing selection hides bulk action menu', async ({ page }) => {
    const tasks = await getTasks(page, 1);
    if (tasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Select a task
    await page.getByTestId(`task-checkbox-${tasks[0].id}`).click();
    await expect(page.getByTestId('bulk-action-menu')).toBeVisible();

    // Clear selection
    await page.getByTestId('bulk-clear-selection').click();
    await expect(page.getByTestId('bulk-action-menu')).not.toBeVisible();
  });

  test('unchecking all tasks hides bulk action menu', async ({ page }) => {
    const tasks = await getTasks(page, 1);
    if (tasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Select and then unselect
    await page.getByTestId(`task-checkbox-${tasks[0].id}`).click();
    await expect(page.getByTestId('bulk-action-menu')).toBeVisible();

    await page.getByTestId(`task-checkbox-${tasks[0].id}`).click();
    await expect(page.getByTestId('bulk-action-menu')).not.toBeVisible();
  });

  test('bulk action menu not visible in kanban view', async ({ page }) => {
    const tasks = await getTasks(page, 1);
    if (tasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Select a task
    await page.getByTestId(`task-checkbox-${tasks[0].id}`).click();
    await expect(page.getByTestId('bulk-action-menu')).toBeVisible();

    // Switch to kanban
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Bulk menu should not be visible in kanban
    await expect(page.getByTestId('bulk-action-menu')).not.toBeVisible();
  });

  test('clicking row still opens detail panel while selected', async ({ page }) => {
    const tasks = await getTasks(page, 1);
    if (tasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Select a task
    await page.getByTestId(`task-checkbox-${tasks[0].id}`).click();
    await expect(page.getByTestId('bulk-action-menu')).toBeVisible();

    // Click on the row (not checkbox)
    await page.getByTestId(`task-row-${tasks[0].id}`).click();

    // Detail panel should open
    await expect(page.getByTestId('task-detail-panel')).toBeVisible();
  });
});
