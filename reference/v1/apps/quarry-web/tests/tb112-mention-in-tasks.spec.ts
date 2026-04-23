import { test, expect, Page } from '@playwright/test';

test.describe('TB112: @Mention in Tasks', () => {
  // Helper to get first entity for testing
  async function getFirstEntity(page: Page): Promise<{ id: string; name: string } | null> {
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items || data;
    return entities.length > 0 ? entities[0] : null;
  }

  // Helper to create a test task with @mention in description
  async function createTaskWithMentionInDescription(
    page: Page,
    entityId: string,
    entityName: string
  ): Promise<{ id: string; title: string }> {
    const title = `Mention Test Task ${Date.now()}`;
    const description = `This task mentions @${entityName} for testing purposes.`;

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

  // Helper to create a test task without description
  async function createTaskWithoutDescription(
    page: Page,
    entityId: string
  ): Promise<{ id: string; title: string }> {
    const title = `Description Test Task ${Date.now()}`;

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
    const descriptionSection = page.getByTestId('task-description-section');
    await expect(descriptionSection).toBeVisible();

    // Should show "Add Description" button
    const addDescriptionBtn = page.getByTestId('add-description-btn');
    await expect(addDescriptionBtn).toBeVisible();
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
    const addDescriptionBtn = page.getByTestId('add-description-btn');
    await addDescriptionBtn.click();

    // Editor should be visible
    const editor = page.getByTestId('block-editor');
    await expect(editor).toBeVisible();

    // Save and Cancel buttons should be visible
    await expect(page.getByTestId('description-save-btn')).toBeVisible();
    await expect(page.getByTestId('description-cancel-btn')).toBeVisible();
  });

  test('typing @ in description editor shows mention autocomplete', async ({ page }) => {
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
    await page.getByTestId('add-description-btn').click();

    // Type @ in the editor
    const editorContent = page.getByTestId('block-editor-content');
    await editorContent.click();
    await page.keyboard.type('@');

    // Mention autocomplete menu should appear
    await expect(page.getByTestId('mention-autocomplete-menu')).toBeVisible({ timeout: 5000 });
  });

  test('can save description with @mention', async ({ page }) => {
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
    await page.getByTestId('add-description-btn').click();

    // Type some text with @mention
    const editorContent = page.getByTestId('block-editor-content');
    await editorContent.click();
    await page.keyboard.type('Need to discuss with @');

    // Wait for mention autocomplete
    const menu = page.getByTestId('mention-autocomplete-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Select first entity
    await page.keyboard.press('Enter');
    await expect(menu).not.toBeVisible({ timeout: 3000 });

    // Add more text
    await page.keyboard.type(' about the implementation.');

    // Save
    await page.getByTestId('description-save-btn').click();

    // Wait for save to complete (editor should close)
    await expect(page.getByTestId('block-editor')).not.toBeVisible({ timeout: 5000 });

    // Description content should be visible
    await expect(page.getByTestId('task-description-content')).toBeVisible();
  });

  // ============================================================================
  // Description @mention rendering tests
  // ============================================================================

  test('description with @mention renders as clickable link', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with @mention in description
    const task = await createTaskWithMentionInDescription(page, entity.id, entity.name);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Find the description section
    const descriptionContent = page.getByTestId('task-description-content');
    await expect(descriptionContent).toBeVisible();

    // Look for the mention chip with the entity name
    const mentionChip = descriptionContent.locator('.mention-chip').first();
    await expect(mentionChip).toBeVisible();
    await expect(mentionChip).toContainText(`@${entity.name}`);
  });

  test('@mention in description links to entity search', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with @mention in description
    const task = await createTaskWithMentionInDescription(page, entity.id, entity.name);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Find the mention chip
    const descriptionContent = page.getByTestId('task-description-content');
    const mentionChip = descriptionContent.locator('.mention-chip').first();
    await expect(mentionChip).toBeVisible();

    // Check the href attribute
    const href = await mentionChip.getAttribute('href');
    expect(href).toContain('/entities?search=');
    expect(href).toContain(encodeURIComponent(entity.name));
  });

  // ============================================================================
  // Mentioned Entities section tests
  // ============================================================================

  test('mentioned entities section shows entities from description', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with @mention in description
    const task = await createTaskWithMentionInDescription(page, entity.id, entity.name);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Mentioned entities section should be visible
    const mentionedSection = page.getByTestId('mentioned-entities-section');
    await expect(mentionedSection).toBeVisible();

    // The entity should be listed
    const entityLink = mentionedSection.locator(`[data-testid*="${entity.id}"], [href*="${entity.id}"]`).first();
    await expect(entityLink).toBeVisible();
  });

  test('mentioned entities section can be collapsed and expanded', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with @mention in description
    const task = await createTaskWithMentionInDescription(page, entity.id, entity.name);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Find the toggle button
    const toggle = page.getByTestId('mentioned-entities-toggle');
    await expect(toggle).toBeVisible();

    // List should be visible
    const list = page.getByTestId('mentioned-entities-list');
    await expect(list).toBeVisible();

    // Click to collapse
    await toggle.click();

    // List should be hidden
    await expect(list).not.toBeVisible();

    // Click to expand
    await toggle.click();

    // List should be visible again
    await expect(list).toBeVisible();
  });

  test('description section can be collapsed', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with description
    const task = await createTaskWithMentionInDescription(page, entity.id, entity.name);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Find the description toggle button
    const toggle = page.getByTestId('description-toggle');
    await expect(toggle).toBeVisible();

    // Description content should be visible
    const descriptionContent = page.getByTestId('task-description-content');
    await expect(descriptionContent).toBeVisible();

    // Click to collapse
    await toggle.click();

    // Description content should be hidden
    await expect(descriptionContent).not.toBeVisible();

    // Click to expand
    await toggle.click();

    // Description content should be visible again
    await expect(descriptionContent).toBeVisible();
  });
});
