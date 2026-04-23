import { test, expect } from '@playwright/test';

test.describe('TB13: Create Task', () => {
  // Helper to get first entity for createdBy field
  async function getFirstEntity(page: import('@playwright/test').Page): Promise<{ id: string; name: string } | null> {
    const response = await page.request.get('/api/entities');
    const entities = await response.json();
    return entities.length > 0 ? entities[0] : null;
  }

  test('POST /api/tasks endpoint creates task', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const title = `Test Task ${Date.now()}`;
    const response = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: entity.id,
        priority: 2,
        complexity: 3,
        taskType: 'task',
      },
    });

    expect(response.ok()).toBe(true);
    const task = await response.json();
    expect(task.title).toBe(title);
    expect(task.createdBy).toBe(entity.id);
    expect(task.priority).toBe(2);
    expect(task.complexity).toBe(3);
    expect(task.status).toBe('open'); // default status
    expect(task.id).toBeDefined();
  });

  test('POST /api/tasks endpoint requires title', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const response = await page.request.post('/api/tasks', {
      data: {
        createdBy: entity.id,
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('title');
  });

  test('POST /api/tasks endpoint requires createdBy', async ({ page }) => {
    const response = await page.request.post('/api/tasks', {
      data: {
        title: 'Test Task',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('createdBy');
  });

  test('POST /api/tasks endpoint creates task with tags', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const title = `Tagged Task ${Date.now()}`;
    const tags = ['frontend', 'urgent'];
    const response = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: entity.id,
        tags,
      },
    });

    expect(response.ok()).toBe(true);
    const task = await response.json();
    expect(task.tags).toEqual(tags);
  });

  test('Create Task button is visible on tasks page', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('create-task-button')).toBeVisible();
  });

  test('clicking Create Task button opens modal', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('create-task-button')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-task-button').click();
    await expect(page.getByTestId('create-task-modal')).toBeVisible();
  });

  test('Create Task modal has all form fields', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('create-task-button').click();
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    // Check all form fields are present
    await expect(page.getByTestId('create-task-title-input')).toBeVisible();
    await expect(page.getByTestId('create-task-created-by-select')).toBeVisible();
    await expect(page.getByTestId('create-task-priority-select')).toBeVisible();
    await expect(page.getByTestId('create-task-complexity-select')).toBeVisible();
    await expect(page.getByTestId('create-task-type-select')).toBeVisible();
    await expect(page.getByTestId('create-task-assignee-select')).toBeVisible();
    await expect(page.getByTestId('create-task-tags-input')).toBeVisible();
  });

  test('Create Task modal closes on backdrop click', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('create-task-button').click();
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    // Click on the backdrop outside the dialog area (bottom of screen)
    await page.getByTestId('create-task-modal-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId('create-task-modal')).not.toBeVisible();
  });

  test('Create Task modal closes on X button click', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('create-task-button').click();
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    await page.getByTestId('create-task-modal-close').click();
    await expect(page.getByTestId('create-task-modal')).not.toBeVisible();
  });

  test('Create Task modal closes on Cancel button click', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('create-task-button').click();
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    await page.getByTestId('create-task-cancel-button').click();
    await expect(page.getByTestId('create-task-modal')).not.toBeVisible();
  });

  test('Create Task modal closes on Escape key', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('create-task-button').click();
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('create-task-modal')).not.toBeVisible();
  });

  test('submitting Create Task form creates task and closes modal', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await page.getByTestId('create-task-button').click();
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    // Fill in the form
    const title = `UI Created Task ${Date.now()}`;
    await page.getByTestId('create-task-title-input').fill(title);
    await page.getByTestId('create-task-created-by-select').selectOption(entity.id);
    await page.getByTestId('create-task-priority-select').selectOption('2');
    await page.getByTestId('create-task-complexity-select').selectOption('4');
    await page.getByTestId('create-task-type-select').selectOption('feature');

    // Submit
    await page.getByTestId('create-task-submit-button').click();

    // Modal should close
    await expect(page.getByTestId('create-task-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify task was created via API
    const response = await page.request.get('/api/tasks/ready');
    const tasks = await response.json();
    const createdTask = tasks.find((t: { title: string }) => t.title === title);
    expect(createdTask).toBeDefined();
    expect(createdTask.priority).toBe(2);
    expect(createdTask.complexity).toBe(4);
    expect(createdTask.taskType).toBe('feature');
  });

  test('Create Task form validates required fields', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('create-task-button').click();
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    // Try to submit without filling required fields
    // The submit button should be disabled when title is empty
    const submitButton = page.getByTestId('create-task-submit-button');
    await expect(submitButton).toBeDisabled();

    // Fill title but no createdBy
    await page.getByTestId('create-task-title-input').fill('Test Task');

    // If no entity is selected, button should still be disabled
    const createdBySelect = page.getByTestId('create-task-created-by-select');
    const selectedValue = await createdBySelect.inputValue();

    // If default is selected, button should be enabled
    if (selectedValue) {
      await expect(submitButton).not.toBeDisabled();
    }
  });

  test('Create Task with tags creates task with correct tags', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await page.getByTestId('create-task-button').click();
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    // Fill in the form with tags
    const title = `Tagged UI Task ${Date.now()}`;
    await page.getByTestId('create-task-title-input').fill(title);
    await page.getByTestId('create-task-created-by-select').selectOption(entity.id);
    await page.getByTestId('create-task-tags-input').fill('ui, test, automation');

    // Submit
    await page.getByTestId('create-task-submit-button').click();
    await expect(page.getByTestId('create-task-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify task was created with tags via API
    const response = await page.request.get('/api/tasks/ready');
    const tasks = await response.json();
    const createdTask = tasks.find((t: { title: string }) => t.title === title);
    expect(createdTask).toBeDefined();
    expect(createdTask.tags).toEqual(['ui', 'test', 'automation']);
  });

  test('newly created task appears in task list', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Create a new task
    await page.getByTestId('create-task-button').click();
    const title = `List Update Task ${Date.now()}`;
    await page.getByTestId('create-task-title-input').fill(title);
    await page.getByTestId('create-task-created-by-select').selectOption(entity.id);
    await page.getByTestId('create-task-submit-button').click();

    // Wait for modal to close
    await expect(page.getByTestId('create-task-modal')).not.toBeVisible({ timeout: 10000 });

    // Wait for the task list to refresh (via query invalidation)
    await page.waitForTimeout(1000);

    // Check if the task appears in the list
    // Note: The task list uses ready tasks, so the new task should appear
    const taskRow = page.locator(`[data-testid^="task-row-"]`).filter({ hasText: title });
    await expect(taskRow).toBeVisible({ timeout: 10000 });
  });

  test('newly created task is selected after creation', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Create a new task
    await page.getByTestId('create-task-button').click();
    const title = `Selected Task ${Date.now()}`;
    await page.getByTestId('create-task-title-input').fill(title);
    await page.getByTestId('create-task-created-by-select').selectOption(entity.id);
    await page.getByTestId('create-task-submit-button').click();

    // Wait for modal to close
    await expect(page.getByTestId('create-task-modal')).not.toBeVisible({ timeout: 10000 });

    // The task detail panel should open with the new task
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('task-detail-title')).toHaveText(title, { timeout: 10000 });
  });
});
