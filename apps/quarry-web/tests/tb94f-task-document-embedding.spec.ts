import { test, expect, Page } from '@playwright/test';

/**
 * TB94f: Task and Document Embedding Tests
 *
 * These tests verify that:
 * 1. Slash commands /task and /doc open picker modals
 * 2. Task embeds stored as ![[task:id]] render correctly in editor
 * 3. Document embeds stored as ![[doc:id]] render correctly in editor
 * 4. Embeds persist on save/reload (round-trip)
 * 5. Embeds have correct navigation hrefs
 * 6. Error states show for non-existent elements
 */

test.use({ viewport: { width: 1400, height: 900 } });

interface DocumentData {
  id: string;
  libraryId?: string;
}

interface TaskData {
  id: string;
  title: string;
  status: string;
}

// Helper to get or create a library for testing
async function getOrCreateLibrary(page: Page) {
  const librariesResponse = await page.request.get('/api/libraries');
  const libraries = await librariesResponse.json();

  if (libraries.length > 0) {
    return libraries[0];
  }

  const response = await page.request.post('/api/libraries', {
    data: {
      name: `Test Library ${Date.now()}`,
      createdBy: 'test-user',
    },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

// Helper to create a document for testing
async function createTestDocument(
  page: Page,
  title?: string,
  content?: string,
  contentType: string = 'markdown'
): Promise<DocumentData> {
  const library = await getOrCreateLibrary(page);
  const response = await page.request.post('/api/documents', {
    data: {
      title: title || `Embed Test ${Date.now()}`,
      content: content || '',
      contentType,
      createdBy: 'test-user',
      libraryId: library.id,
    },
  });
  expect(response.ok()).toBe(true);
  const doc = await response.json();
  expect(doc.id).toBeDefined();
  return { id: doc.id, libraryId: library.id };
}

// Helper to create a task for testing
async function createTestTask(page: Page, title?: string): Promise<TaskData> {
  const response = await page.request.post('/api/tasks', {
    data: {
      title: title || `Test Task ${Date.now()}`,
      createdBy: 'test-user',
      status: 'open',
      priority: 3,
    },
  });
  expect(response.ok()).toBe(true);
  const task = await response.json();
  expect(task.id).toBeDefined();
  return task;
}

// Navigate to a document and enter edit mode
async function navigateToDocumentEditMode(page: Page, doc: DocumentData) {
  await page.goto(`/documents?library=${doc.libraryId}&selected=${doc.id}`);
  await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 15000 });
  await page.waitForTimeout(500);

  const editButton = page.getByTestId('document-edit-button');
  await expect(editButton).toBeVisible({ timeout: 5000 });
  await editButton.click();

  await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10000 });
  await page.waitForSelector('[data-testid="block-editor-toolbar"]', { timeout: 5000 });
  await page.waitForTimeout(300);
}

// Save the document
async function saveDocument(page: Page) {
  await page.getByTestId('document-save-button').click();
  await page.waitForTimeout(1000);
}

// Fetch document content directly from API
async function getDocumentContent(page: Page, docId: string): Promise<string> {
  const response = await page.request.get(`/api/documents/${docId}`);
  expect(response.ok()).toBe(true);
  const doc = await response.json();
  return doc.content || '';
}

test.describe('TB94f: Task and Document Embedding', () => {
  test.describe('Slash Commands', () => {
    test('/task slash command opens task picker modal', async ({ page }) => {
      const doc = await createTestDocument(page, 'Task Embed Slash Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/task');

      // Wait for slash command menu
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });

      // Find task option in Embeds category
      const taskOption = page.getByTestId('slash-command-item-task');
      await expect(taskOption).toBeVisible({ timeout: 3000 });

      // Select it
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Verify task picker modal opens
      const modal = page.getByTestId('task-picker-modal');
      await expect(modal).toBeVisible({ timeout: 5000 });
    });

    test('/doc slash command opens document picker modal', async ({ page }) => {
      const doc = await createTestDocument(page, 'Doc Embed Slash Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/doc');

      // Wait for slash command menu
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });

      // Find document option in Embeds category
      const docOption = page.getByTestId('slash-command-item-doc');
      await expect(docOption).toBeVisible({ timeout: 3000 });

      // Select it
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Verify document picker modal opens
      const modal = page.getByTestId('document-picker-modal');
      await expect(modal).toBeVisible({ timeout: 5000 });
    });

    test('/task appears in Embeds category', async ({ page }) => {
      const doc = await createTestDocument(page, 'Task Category Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/task');

      // Wait for slash command menu
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });

      // Check for Embeds category
      const embedsCategory = page.getByTestId('slash-command-category-embeds');
      await expect(embedsCategory).toBeVisible({ timeout: 3000 });
    });

    test('/doc appears in Embeds category', async ({ page }) => {
      const doc = await createTestDocument(page, 'Doc Category Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/doc');

      // Wait for slash command menu
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });

      // Check for Embeds category
      const embedsCategory = page.getByTestId('slash-command-category-embeds');
      await expect(embedsCategory).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Embed Persistence (Round-trip)', () => {
    test('Task embed ![[task:id]] renders in editor from Markdown', async ({ page }) => {
      // Create a task first
      const task = await createTestTask(page, 'Task for Persistence Test');

      // Create a document with task embed content already in Markdown
      const embedMarkdown = `![[task:${task.id}]]`;
      const doc = await createTestDocument(page, 'Task Persistence Test', embedMarkdown);

      // Navigate to the document and enter edit mode
      await navigateToDocumentEditMode(page, doc);

      // Task embed should be visible (Markdown was parsed and rendered)
      const taskEmbed = page.getByTestId(`task-embed-${task.id}`);
      await expect(taskEmbed).toBeVisible({ timeout: 5000 });
    });

    test('Document embed ![[doc:id]] renders in editor from Markdown', async ({ page }) => {
      // Create a document to embed
      const targetDoc = await createTestDocument(page, 'Target for Persistence Test');

      // Create a document with document embed content already in Markdown
      const embedMarkdown = `![[doc:${targetDoc.id}]]`;
      const doc = await createTestDocument(page, 'Doc Persistence Test', embedMarkdown);

      // Navigate to the document and enter edit mode
      await navigateToDocumentEditMode(page, doc);

      // Document embed should be visible (Markdown was parsed and rendered)
      const docEmbed = page.getByTestId(`doc-embed-${targetDoc.id}`);
      await expect(docEmbed).toBeVisible({ timeout: 5000 });
    });

    test('Task embed survives save and reload', async ({ page }) => {
      // Create a task first
      const task = await createTestTask(page, 'Task for Round-trip Test');

      // Create a document with task embed
      const embedMarkdown = `![[task:${task.id}]]`;
      const doc = await createTestDocument(page, 'Task Round-trip Test', embedMarkdown);

      // Navigate to the document and enter edit mode
      await navigateToDocumentEditMode(page, doc);

      // Verify task embed is visible
      const taskEmbed = page.getByTestId(`task-embed-${task.id}`);
      await expect(taskEmbed).toBeVisible({ timeout: 5000 });

      // Save the document (should preserve embed in Markdown)
      await saveDocument(page);

      // Verify content still has embed syntax
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain(`![[task:${task.id}]]`);

      // Reload the page
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 15000 });

      // Enter edit mode again
      const editButton = page.getByTestId('document-edit-button');
      await expect(editButton).toBeVisible({ timeout: 5000 });
      await editButton.click();
      await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10000 });

      // Embed should still be visible
      await expect(page.getByTestId(`task-embed-${task.id}`)).toBeVisible({ timeout: 5000 });
    });

    test('Document embed survives save and reload', async ({ page }) => {
      // Create a document to embed
      const targetDoc = await createTestDocument(page, 'Target for Round-trip Test');

      // Create a document with document embed
      const embedMarkdown = `![[doc:${targetDoc.id}]]`;
      const doc = await createTestDocument(page, 'Doc Round-trip Test', embedMarkdown);

      // Navigate to the document and enter edit mode
      await navigateToDocumentEditMode(page, doc);

      // Verify document embed is visible
      const docEmbed = page.getByTestId(`doc-embed-${targetDoc.id}`);
      await expect(docEmbed).toBeVisible({ timeout: 5000 });

      // Save the document (should preserve embed in Markdown)
      await saveDocument(page);

      // Verify content still has embed syntax
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain(`![[doc:${targetDoc.id}]]`);

      // Reload the page
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 15000 });

      // Enter edit mode again
      const editButton = page.getByTestId('document-edit-button');
      await expect(editButton).toBeVisible({ timeout: 5000 });
      await editButton.click();
      await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10000 });

      // Embed should still be visible
      await expect(page.getByTestId(`doc-embed-${targetDoc.id}`)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Embed Rendering', () => {
    test('Task embed shows task title', async ({ page }) => {
      // Create a task with known title
      const task = await createTestTask(page, 'Known Task Title for Display');

      // Create a document with the task embed
      const embedMarkdown = `![[task:${task.id}]]`;
      const doc = await createTestDocument(page, 'Task Display Test', embedMarkdown);

      await navigateToDocumentEditMode(page, doc);

      // Task embed should be visible and contain the title
      const taskEmbed = page.getByTestId(`task-embed-${task.id}`);
      await expect(taskEmbed).toBeVisible({ timeout: 5000 });
      await expect(taskEmbed).toContainText('Known Task Title for Display');
    });

    test('Document embed shows document title', async ({ page }) => {
      // Create a document with known title
      const targetDoc = await createTestDocument(page, 'Known Document Title for Display');

      // Create a document with the document embed
      const embedMarkdown = `![[doc:${targetDoc.id}]]`;
      const doc = await createTestDocument(page, 'Doc Display Test', embedMarkdown);

      await navigateToDocumentEditMode(page, doc);

      // Document embed should be visible and contain the title
      const docEmbed = page.getByTestId(`doc-embed-${targetDoc.id}`);
      await expect(docEmbed).toBeVisible({ timeout: 5000 });
      await expect(docEmbed).toContainText('Known Document Title for Display');
    });
  });

  test.describe('Embed Navigation', () => {
    test('Task embed has correct href', async ({ page }) => {
      // Create a task
      const task = await createTestTask(page, 'Task for Navigation Test');

      // Create a document with the task embed
      const embedMarkdown = `![[task:${task.id}]]`;
      const doc = await createTestDocument(page, 'Task Navigation Test', embedMarkdown);

      await navigateToDocumentEditMode(page, doc);

      // Task embed should have correct href
      const taskEmbed = page.getByTestId(`task-embed-${task.id}`);
      await expect(taskEmbed).toBeVisible({ timeout: 5000 });
      await expect(taskEmbed).toHaveAttribute('href', `/tasks/${task.id}`);
    });

    test('Document embed has correct href', async ({ page }) => {
      // Create a document
      const targetDoc = await createTestDocument(page, 'Doc for Navigation Test');

      // Create a document with the document embed
      const embedMarkdown = `![[doc:${targetDoc.id}]]`;
      const doc = await createTestDocument(page, 'Doc Navigation Test', embedMarkdown);

      await navigateToDocumentEditMode(page, doc);

      // Document embed should have correct href
      const docEmbed = page.getByTestId(`doc-embed-${targetDoc.id}`);
      await expect(docEmbed).toBeVisible({ timeout: 5000 });
      await expect(docEmbed).toHaveAttribute('href', `/documents/${targetDoc.id}`);
    });
  });

  test.describe('Embed Error Handling', () => {
    test('Task embed shows error for non-existent task', async ({ page }) => {
      // Create a document with an embed pointing to a non-existent task
      const fakeTaskId = 'el-nonexistent-task-123';
      const embedMarkdown = `![[task:${fakeTaskId}]]`;
      const doc = await createTestDocument(page, 'Task Error Test', embedMarkdown);

      // Navigate to the document in edit mode
      await navigateToDocumentEditMode(page, doc);

      // Wait for embed error to show (the API call will fail)
      await page.waitForTimeout(2000);

      const taskEmbedError = page.getByTestId(`task-embed-error-${fakeTaskId}`);
      await expect(taskEmbedError).toBeVisible({ timeout: 10000 });
      await expect(taskEmbedError).toContainText('not found');
    });

    test('Document embed shows error for non-existent document', async ({ page }) => {
      // Create a document with an embed pointing to a non-existent document
      const fakeDocId = 'el-nonexistent-doc-456';
      const embedMarkdown = `![[doc:${fakeDocId}]]`;
      const doc = await createTestDocument(page, 'Doc Error Test', embedMarkdown);

      // Navigate to the document in edit mode
      await navigateToDocumentEditMode(page, doc);

      // Wait for embed error to show (the API call will fail)
      await page.waitForTimeout(2000);

      const docEmbedError = page.getByTestId(`doc-embed-error-${fakeDocId}`);
      await expect(docEmbedError).toBeVisible({ timeout: 10000 });
      await expect(docEmbedError).toContainText('not found');
    });
  });

  test.describe('Picker Functionality', () => {
    test('Task picker can be closed with close button', async ({ page }) => {
      const doc = await createTestDocument(page, 'Task Close Button Test');
      await navigateToDocumentEditMode(page, doc);

      // Open task picker
      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/task');
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="task-picker-modal"]', { timeout: 5000 });

      // Click close button
      const closeButton = page.getByTestId('task-picker-modal-close');
      await closeButton.click();
      await expect(page.getByTestId('task-picker-modal')).not.toBeVisible({ timeout: 5000 });
    });

    test('Document picker can be closed with close button', async ({ page }) => {
      const doc = await createTestDocument(page, 'Doc Close Button Test');
      await navigateToDocumentEditMode(page, doc);

      // Open document picker
      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/doc');
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="document-picker-modal"]', { timeout: 5000 });

      // Click close button
      const closeButton = page.getByTestId('document-picker-modal-close');
      await closeButton.click();
      await expect(page.getByTestId('document-picker-modal')).not.toBeVisible({ timeout: 5000 });
    });

    test('Task picker has search input', async ({ page }) => {
      const doc = await createTestDocument(page, 'Task Search Test');
      await navigateToDocumentEditMode(page, doc);

      // Open task picker
      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/task');
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="task-picker-modal"]', { timeout: 5000 });

      // Search input should be visible
      const searchInput = page.getByTestId('task-picker-search');
      await expect(searchInput).toBeVisible({ timeout: 5000 });
    });

    test('Document picker has search input', async ({ page }) => {
      const doc = await createTestDocument(page, 'Doc Search Test');
      await navigateToDocumentEditMode(page, doc);

      // Open document picker
      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/doc');
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="document-picker-modal"]', { timeout: 5000 });

      // Search input should be visible
      const searchInput = page.getByTestId('document-picker-search');
      await expect(searchInput).toBeVisible({ timeout: 5000 });
    });
  });
});
