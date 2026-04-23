import { test, expect, Page } from '@playwright/test';

test.describe('TB124: Task Description Field with Rich Editor', () => {
  // Helper to get first entity for testing
  async function getFirstEntity(page: Page): Promise<{ id: string; name: string } | null> {
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items || data;
    return entities.length > 0 ? entities[0] : null;
  }

  // Helper to create a task with description
  async function createTaskWithDescription(
    page: Page,
    entityId: string,
    description: string
  ): Promise<{ id: string; title: string }> {
    const title = `Description Test Task ${Date.now()}`;

    const response = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: entityId,
        description,
        priority: 3,
        taskType: 'task',
      },
    });
    const task = await response.json();
    return { id: task.id, title };
  }

  // Helper to create a task without description
  async function createTaskWithoutDescription(
    page: Page,
    entityId: string
  ): Promise<{ id: string; title: string }> {
    const title = `No Desc Test Task ${Date.now()}`;

    const response = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: entityId,
        priority: 3,
        taskType: 'task',
      },
    });
    const task = await response.json();
    return { id: task.id, title };
  }

  // Helper to navigate to task detail
  async function navigateToTaskDetail(page: Page, taskId: string) {
    await page.goto(`/tasks?selected=${taskId}`);
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });
  }

  // ============================================================================
  // Description section tests
  // ============================================================================

  test('description section shows "Add Description" button when no description', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task without description
    const task = await createTaskWithoutDescription(page, entity.id);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Description section should be visible
    const descSection = page.getByTestId('task-description-section');
    await expect(descSection).toBeVisible();

    // Should show "Add Description" button
    const addDescBtn = page.getByTestId('add-description-btn');
    await expect(addDescBtn).toBeVisible();
  });

  test('clicking Add Description opens editor', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task without description
    const task = await createTaskWithoutDescription(page, entity.id);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Click Add Description button
    const addDescBtn = page.getByTestId('add-description-btn');
    await addDescBtn.click();

    // Save and Cancel buttons should appear
    await expect(page.getByTestId('description-save-btn')).toBeVisible();
    await expect(page.getByTestId('description-cancel-btn')).toBeVisible();

    // Editor should be present (BlockEditor component)
    await expect(page.getByTestId('block-editor')).toBeVisible();
  });

  test('cancel button closes editor without saving', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task without description
    const task = await createTaskWithoutDescription(page, entity.id);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Open editor
    await page.getByTestId('add-description-btn').click();

    // Wait for editor to appear
    await expect(page.getByTestId('block-editor')).toBeVisible();

    // Type something in the editor - use the testid on the ProseMirror element
    const editor = page.getByTestId('block-editor-content');
    await editor.click();
    await page.keyboard.type('Test description that should not be saved');

    // Click Cancel
    await page.getByTestId('description-cancel-btn').click();

    // Editor should close, Add Description button should reappear
    await expect(page.getByTestId('add-description-btn')).toBeVisible();
    await expect(page.getByTestId('description-save-btn')).not.toBeVisible();
  });

  test('description renders as markdown when viewing', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with markdown description
    const description = '# Test Heading\n\nThis is a **bold** test with a [link](https://example.com).';
    const task = await createTaskWithDescription(page, entity.id, description);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Description content should be visible
    const descContent = page.getByTestId('task-description-content');
    await expect(descContent).toBeVisible();

    // Should render markdown (check for heading element)
    const markdown = page.getByTestId('task-description-markdown');
    await expect(markdown).toBeVisible();
    await expect(markdown.locator('h1')).toHaveText('Test Heading');
    await expect(markdown.locator('strong')).toHaveText('bold');
  });

  test('clicking description content opens editor', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with description
    const task = await createTaskWithDescription(page, entity.id, 'Existing description');

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Click on description content
    await page.getByTestId('task-description-content').click();

    // Editor should open
    await expect(page.getByTestId('description-save-btn')).toBeVisible();
    await expect(page.getByTestId('block-editor')).toBeVisible();
  });

  test('saving description updates task', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task without description
    const task = await createTaskWithoutDescription(page, entity.id);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Open editor
    await page.getByTestId('add-description-btn').click();

    // Wait for editor to load
    await expect(page.getByTestId('block-editor')).toBeVisible();

    // Type description in the ProseMirror editor - use the testid on the editor element
    const newDescription = 'This is a new description';
    const editor = page.getByTestId('block-editor-content');
    await editor.click();
    await page.keyboard.type(newDescription);

    // Click Save
    await page.getByTestId('description-save-btn').click();

    // Wait for save to complete
    await expect(page.getByTestId('description-save-btn')).not.toBeVisible({ timeout: 5000 });

    // Description should now be visible
    await expect(page.getByTestId('task-description-content')).toBeVisible();
    await expect(page.getByTestId('task-description-markdown')).toContainText(newDescription);
  });

  test('description section is collapsible', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with description
    const task = await createTaskWithDescription(page, entity.id, 'Test description');

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Description content should be visible initially
    await expect(page.getByTestId('task-description-content')).toBeVisible();

    // Click toggle to collapse
    await page.getByTestId('description-toggle').click();

    // Description content should be hidden
    await expect(page.getByTestId('task-description-content')).not.toBeVisible();

    // Click toggle to expand
    await page.getByTestId('description-toggle').click();

    // Description content should be visible again
    await expect(page.getByTestId('task-description-content')).toBeVisible();
  });

  // ============================================================================
  // CreateTaskModal tests
  // ============================================================================

  test('create task modal has optional description field', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Click create task button
    const createBtn = page.getByTestId('create-task-button');
    await createBtn.click();

    // Modal should be visible
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    // Description input should be visible
    await expect(page.getByTestId('create-task-description-input')).toBeVisible();
  });

  test('creating task with description works', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Click create task button
    await page.getByTestId('create-task-button').click();

    // Wait for modal to be visible
    await expect(page.getByTestId('create-task-modal')).toBeVisible();

    // Fill in required fields
    await page.getByTestId('create-task-title-input').fill(`Task with Desc ${Date.now()}`);

    // Select created by
    await page.getByTestId('create-task-created-by-select').selectOption(entity.id);

    // Description field - use keyboard to scroll modal and fill it
    const descInput = page.getByTestId('create-task-description-input');
    await descInput.scrollIntoViewIfNeeded();
    await descInput.fill('This is a test description from the create modal');

    // Scroll to and click the submit button
    const submitBtn = page.getByTestId('create-task-submit-button');
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click({ force: true });

    // Modal should close
    await expect(page.getByTestId('create-task-modal')).not.toBeVisible({ timeout: 5000 });

    // The task should be created (check by searching for it)
    // This is a basic verification that submission succeeded
  });
});
