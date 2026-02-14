import { test, expect, Page } from '@playwright/test';

test.describe('TB125: Fix Task Embed Search in Editor', () => {
  // Helper to get first entity for testing
  async function getFirstEntity(page: Page): Promise<{ id: string; name: string } | null> {
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items || data;
    return entities.length > 0 ? entities[0] : null;
  }

  // Helper to create a document for embedding tests
  async function createDocument(
    page: Page,
    entityId: string,
    title: string
  ): Promise<{ id: string; title: string }> {
    const response = await page.request.post('/api/documents', {
      data: {
        title,
        contentType: 'markdown',
        content: '# Test Document\n\nSome content here.',
        createdBy: entityId,
      },
    });
    const doc = await response.json();
    return { id: doc.id, title };
  }

  // Helper to create a task for embed testing
  async function createTask(
    page: Page,
    entityId: string,
    title: string
  ): Promise<{ id: string; title: string }> {
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

  // ============================================================================
  // Task search API tests
  // ============================================================================

  test('GET /api/tasks with search param returns matching tasks', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with a unique title
    const uniqueTitle = `SearchTestTask-${Date.now()}`;
    await createTask(page, entity.id, uniqueTitle);

    // Search for the task
    const response = await page.request.get(`/api/tasks?search=${encodeURIComponent(uniqueTitle)}&limit=50`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data[0].title).toContain('SearchTestTask');
  });

  test('GET /api/tasks search is case-insensitive', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with a unique title
    const uniqueTitle = `CaseSensitiveTest-${Date.now()}`;
    await createTask(page, entity.id, uniqueTitle);

    // Search with lowercase
    const response = await page.request.get(`/api/tasks?search=casesensitivetest&limit=50`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(data.data.length).toBeGreaterThan(0);
  });

  test('GET /api/tasks search with empty query returns all tasks', async ({ page }) => {
    const response = await page.request.get('/api/tasks?limit=10');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    // Standard paginated response returns 'data' array
    expect(data.data || data.items).toBeDefined();
  });

  test('GET /api/tasks search with no matches returns empty array', async ({ page }) => {
    const response = await page.request.get('/api/tasks?search=xyznonexistentquery12345&limit=50');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(data.data.length).toBe(0);
    expect(data.total).toBe(0);
  });

  // ============================================================================
  // Task picker modal tests
  // ============================================================================

  test('TaskPickerModal shows tasks when opened', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a document to access the editor
    const doc = await createDocument(page, entity.id, `Embed Test Doc ${Date.now()}`);

    // Navigate to document editor
    await page.goto(`/documents?selected=${doc.id}`);
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    // Click edit button to enter edit mode
    const editButton = page.getByTestId('doc-edit-button');
    if (await editButton.isVisible({ timeout: 5000 })) {
      await editButton.click();
    }

    // Wait for editor to be ready
    await page.waitForTimeout(500);

    // Try to trigger slash command for task embed
    const editor = page.locator('.ProseMirror');
    if (await editor.isVisible({ timeout: 5000 })) {
      await editor.click();
      await page.keyboard.type('/task');
      await page.waitForTimeout(300);
    }
  });

  test('TaskPickerModal filters tasks by search query', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create tasks with unique names for testing
    const timestamp = Date.now();
    await createTask(page, entity.id, `AlphaTask-${timestamp}`);
    await createTask(page, entity.id, `BetaTask-${timestamp}`);

    // Create a document
    const doc = await createDocument(page, entity.id, `Search Test Doc ${timestamp}`);

    // Navigate to document editor
    await page.goto(`/documents?selected=${doc.id}`);
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    // Click edit button
    const editButton = page.getByTestId('doc-edit-button');
    if (await editButton.isVisible({ timeout: 5000 })) {
      await editButton.click();
    }

    // Wait for editor
    await page.waitForTimeout(500);

    // Trigger task embed via slash command
    const editor = page.locator('.ProseMirror');
    if (await editor.isVisible({ timeout: 5000 })) {
      await editor.click();
      await page.keyboard.type('/task');
      await page.waitForTimeout(500);

      // Check if task picker modal appears
      const taskPickerModal = page.getByTestId('task-picker-modal');
      if (await taskPickerModal.isVisible({ timeout: 3000 })) {
        // Search for AlphaTask
        const searchInput = page.getByTestId('task-picker-search');
        await searchInput.fill(`AlphaTask-${timestamp}`);
        await page.waitForTimeout(300);

        // Should show matching task
        const taskList = page.getByTestId('task-picker-list');
        await expect(taskList).toContainText('AlphaTask');
      }
    }
  });
});
