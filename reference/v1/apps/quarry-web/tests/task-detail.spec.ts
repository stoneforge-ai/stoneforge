import { test, expect } from '@playwright/test';

test.describe('TB11: Task Detail Panel', () => {
  // Helper to check if there are tasks available
  async function hasTasks(page: import('@playwright/test').Page): Promise<{ hasTasks: boolean; firstTaskId?: string }> {
    const response = await page.request.get('/api/tasks/ready');
    const tasks = await response.json();
    return {
      hasTasks: tasks.length > 0,
      firstTaskId: tasks.length > 0 ? tasks[0].id : undefined,
    };
  }

  test('task detail endpoint returns task with dependencies', async ({ page }) => {
    const { hasTasks: hasReadyTasks, firstTaskId } = await hasTasks(page);
    if (!hasReadyTasks || !firstTaskId) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/tasks/${firstTaskId}`);
    expect(response.ok()).toBe(true);
    const task = await response.json();

    // Verify task structure
    expect(task.id).toBe(firstTaskId);
    expect(task.type).toBe('task');
    expect(task.title).toBeDefined();
    expect(task.status).toBeDefined();
    expect(task.priority).toBeDefined();

    // Verify dependencies are included
    expect(Array.isArray(task._dependencies)).toBe(true);
    expect(Array.isArray(task._dependents)).toBe(true);
  });

  test('task detail endpoint supports hydration options', async ({ page }) => {
    const { hasTasks: hasReadyTasks, firstTaskId } = await hasTasks(page);
    if (!hasReadyTasks || !firstTaskId) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/tasks/${firstTaskId}?hydrate.description=true&hydrate.design=true`);
    expect(response.ok()).toBe(true);
    const task = await response.json();

    // Even if task has no description/design refs, endpoint should work
    expect(task.id).toBe(firstTaskId);
  });

  test('task detail endpoint returns 404 for non-existent task', async ({ page }) => {
    const response = await page.request.get('/api/tasks/non-existent-task-id');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('clicking a task row opens detail panel', async ({ page }) => {
    const { hasTasks: hasReadyTasks, firstTaskId } = await hasTasks(page);
    if (!hasReadyTasks || !firstTaskId) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Wait for tasks to load
    await expect(page.getByTestId(`task-row-${firstTaskId}`)).toBeVisible({ timeout: 10000 });

    // Click the task row
    await page.getByTestId(`task-row-${firstTaskId}`).click();

    // Verify detail panel opens
    await expect(page.getByTestId('task-detail-container')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('task-detail-panel')).toBeVisible();
  });

  test('task detail panel shows task information', async ({ page }) => {
    const { hasTasks: hasReadyTasks, firstTaskId } = await hasTasks(page);
    if (!hasReadyTasks || !firstTaskId) {
      test.skip();
      return;
    }

    // Get task data from API for comparison
    const apiResponse = await page.request.get(`/api/tasks/${firstTaskId}`);
    const task = await apiResponse.json();

    await page.goto('/tasks');
    await expect(page.getByTestId(`task-row-${firstTaskId}`)).toBeVisible({ timeout: 10000 });

    // Click the task row
    await page.getByTestId(`task-row-${firstTaskId}`).click();

    // Verify detail panel shows correct information
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('task-detail-title')).toHaveText(task.title);
    await expect(page.getByTestId('task-detail-id')).toHaveText(task.id);
  });

  test('task detail panel can be closed with X button', async ({ page }) => {
    const { hasTasks: hasReadyTasks, firstTaskId } = await hasTasks(page);
    if (!hasReadyTasks || !firstTaskId) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId(`task-row-${firstTaskId}`)).toBeVisible({ timeout: 10000 });

    // Open detail panel
    await page.getByTestId(`task-row-${firstTaskId}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });

    // Close panel
    await page.getByTestId('task-detail-close').click();

    // Panel should be closed
    await expect(page.getByTestId('task-detail-container')).not.toBeVisible();
  });

  test('split view layout adjusts when detail panel is open', async ({ page }) => {
    const { hasTasks: hasReadyTasks, firstTaskId } = await hasTasks(page);
    if (!hasReadyTasks || !firstTaskId) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId(`task-row-${firstTaskId}`)).toBeVisible({ timeout: 10000 });

    // Initially, task list should be full width (no detail panel)
    await expect(page.getByTestId('task-detail-container')).not.toBeVisible();

    // Open detail panel
    await page.getByTestId(`task-row-${firstTaskId}`).click();

    // Both list and panel should be visible (split view)
    await expect(page.getByTestId('tasks-page')).toBeVisible();
    await expect(page.getByTestId('task-detail-container')).toBeVisible();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible();
  });

  test('selecting a different task updates the detail panel', async ({ page }) => {
    // Get all ready tasks
    const response = await page.request.get('/api/tasks/ready');
    const tasks = await response.json();

    if (tasks.length < 2) {
      test.skip();
      return;
    }

    const firstTask = tasks[0];
    const secondTask = tasks[1];

    await page.goto('/tasks');
    await expect(page.getByTestId(`task-row-${firstTask.id}`)).toBeVisible({ timeout: 10000 });

    // Open first task
    await page.getByTestId(`task-row-${firstTask.id}`).click();
    await expect(page.getByTestId('task-detail-title')).toHaveText(firstTask.title);

    // Click second task
    await page.getByTestId(`task-row-${secondTask.id}`).click();

    // Detail panel should now show second task
    await expect(page.getByTestId('task-detail-title')).toHaveText(secondTask.title);
    await expect(page.getByTestId('task-detail-id')).toHaveText(secondTask.id);
  });

  test('selected task row is highlighted', async ({ page }) => {
    const { hasTasks: hasReadyTasks, firstTaskId } = await hasTasks(page);
    if (!hasReadyTasks || !firstTaskId) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId(`task-row-${firstTaskId}`)).toBeVisible({ timeout: 10000 });

    // Click the task row
    await page.getByTestId(`task-row-${firstTaskId}`).click();

    // Check that the row has a highlight class (bg-blue-50)
    const row = page.getByTestId(`task-row-${firstTaskId}`);
    await expect(row).toHaveClass(/bg-blue-50/);
  });

  test('task detail shows status and priority badges', async ({ page }) => {
    const { hasTasks: hasReadyTasks, firstTaskId } = await hasTasks(page);
    if (!hasReadyTasks || !firstTaskId) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId(`task-row-${firstTaskId}`)).toBeVisible({ timeout: 10000 });

    // Open detail panel
    await page.getByTestId(`task-row-${firstTaskId}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });

    // Check for status dropdown (clickable status badge)
    await expect(page.getByTestId('task-status-dropdown')).toBeVisible();

    // Check for priority dropdown (clickable priority badge)
    await expect(page.getByTestId('task-priority-dropdown')).toBeVisible();
  });

  test('task detail shows metadata grid', async ({ page }) => {
    const { hasTasks: hasReadyTasks, firstTaskId } = await hasTasks(page);
    if (!hasReadyTasks || !firstTaskId) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId(`task-row-${firstTaskId}`)).toBeVisible({ timeout: 10000 });

    // Open detail panel
    await page.getByTestId(`task-row-${firstTaskId}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });

    // Check for Type label and complexity
    await expect(page.getByText('Type', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('task-detail-panel').getByText('Complexity', { exact: true })).toBeVisible();
  });

  test('task detail shows created/updated timestamps', async ({ page }) => {
    const { hasTasks: hasReadyTasks, firstTaskId } = await hasTasks(page);
    if (!hasReadyTasks || !firstTaskId) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId(`task-row-${firstTaskId}`)).toBeVisible({ timeout: 10000 });

    // Open detail panel
    await page.getByTestId(`task-row-${firstTaskId}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });

    // Check for timestamp labels
    await expect(page.getByText('Created:')).toBeVisible();
    await expect(page.getByText('Updated:')).toBeVisible();
    await expect(page.getByText('Created by:')).toBeVisible();
  });
});
