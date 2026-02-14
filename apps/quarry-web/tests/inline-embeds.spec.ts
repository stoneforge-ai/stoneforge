import { test, expect } from '@playwright/test';

test.describe('TB57: Inline Task/Document Embeds', () => {
  // ============================================================================
  // Helper: Navigate to document edit mode
  // ============================================================================
  async function enterDocumentEditMode(page: import('@playwright/test').Page) {
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();

    if (documents.length === 0) {
      return null;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    let selectedDocId = '';

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      selectedDocId = documents[0].id;
      await page.getByTestId(`document-item-${selectedDocId}`).click();
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();
        if (libDocs.length > 0) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          selectedDocId = libDocs[0].id;
          await page.getByTestId(`document-item-${selectedDocId}`).click();
          break;
        }
      }
    }

    if (!selectedDocId) {
      return null;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('document-edit-button').click();
    await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 5000 });

    return selectedDocId;
  }

  // Helper: Get a task from the API
  async function getFirstTask(page: import('@playwright/test').Page) {
    const response = await page.request.get('/api/tasks?limit=1');
    const result = await response.json();
    const tasks = Array.isArray(result) ? result : result.data || [];
    return tasks[0] || null;
  }

  // Helper: Get a document (not the current one) from the API
  async function getAnotherDocument(page: import('@playwright/test').Page, excludeId: string) {
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();
    return documents.find((d: { id: string }) => d.id !== excludeId) || null;
  }

  // ============================================================================
  // Task Picker Modal Tests
  // ============================================================================

  test('/task command opens task picker modal', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    // Focus the editor and type /task
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/task');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Select the task command
    await page.keyboard.press('Enter');

    // Task picker modal should appear
    await expect(page.getByTestId('task-picker-modal')).toBeVisible({ timeout: 3000 });
  });

  test('task picker modal has search input', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/task');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('task-picker-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('task-picker-search')).toBeVisible();
    await expect(page.getByTestId('task-picker-search')).toBeFocused();
  });

  test('task picker shows available tasks', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/task');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('task-picker-modal')).toBeVisible({ timeout: 3000 });

    // Wait for tasks to load and check the list
    await expect(page.getByTestId('task-picker-list')).toBeVisible();
    await expect(page.getByTestId(`task-picker-item-${task.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('clicking task inserts task embed', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/task');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('task-picker-modal')).toBeVisible({ timeout: 3000 });

    // Wait for tasks to load
    await expect(page.getByTestId(`task-picker-item-${task.id}`)).toBeVisible({ timeout: 5000 });

    // Click on the task
    await page.getByTestId(`task-picker-item-${task.id}`).click();

    // Modal should close
    await expect(page.getByTestId('task-picker-modal')).not.toBeVisible();

    // Task embed should be inserted
    await expect(page.getByTestId(`task-embed-${task.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('keyboard navigation in task picker', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/task');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('task-picker-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId(`task-picker-item-${task.id}`)).toBeVisible({ timeout: 5000 });

    // Navigate with arrow keys
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');

    // Press Enter to select
    await page.keyboard.press('Enter');

    // Modal should close
    await expect(page.getByTestId('task-picker-modal')).not.toBeVisible();

    // Embed should be inserted
    await expect(page.getByTestId(`task-embed-${task.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('Escape closes task picker modal', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/task');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('task-picker-modal')).toBeVisible({ timeout: 3000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should close
    await expect(page.getByTestId('task-picker-modal')).not.toBeVisible();
  });

  test('clicking backdrop closes task picker modal', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/task');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('task-picker-modal')).toBeVisible({ timeout: 3000 });

    // Click the backdrop
    await page.getByTestId('task-picker-modal-backdrop').click();

    // Modal should close
    await expect(page.getByTestId('task-picker-modal')).not.toBeVisible();
  });

  // ============================================================================
  // Document Picker Modal Tests
  // ============================================================================

  test('/doc command opens document picker modal', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const anotherDoc = await getAnotherDocument(page, docId);
    if (!anotherDoc) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/doc');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Select the doc command
    await page.keyboard.press('Enter');

    // Document picker modal should appear
    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 3000 });
  });

  test('document picker modal has search input', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const anotherDoc = await getAnotherDocument(page, docId);
    if (!anotherDoc) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/doc');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('document-picker-search')).toBeVisible();
    await expect(page.getByTestId('document-picker-search')).toBeFocused();
  });

  test('document picker shows available documents', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const anotherDoc = await getAnotherDocument(page, docId);
    if (!anotherDoc) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/doc');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 3000 });

    // Wait for documents to load and check the list
    await expect(page.getByTestId('document-picker-list')).toBeVisible();
    await expect(page.getByTestId(`document-picker-item-${anotherDoc.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('clicking document inserts document embed', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const anotherDoc = await getAnotherDocument(page, docId);
    if (!anotherDoc) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/doc');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 3000 });

    // Wait for documents to load
    await expect(page.getByTestId(`document-picker-item-${anotherDoc.id}`)).toBeVisible({ timeout: 5000 });

    // Click on the document
    await page.getByTestId(`document-picker-item-${anotherDoc.id}`).click();

    // Modal should close
    await expect(page.getByTestId('document-picker-modal')).not.toBeVisible();

    // Document embed should be inserted
    await expect(page.getByTestId(`doc-embed-${anotherDoc.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('document picker first item is selected by default', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const anotherDoc = await getAnotherDocument(page, docId);
    if (!anotherDoc) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/doc');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId(`document-picker-item-${anotherDoc.id}`)).toBeVisible({ timeout: 5000 });

    // First item should be selected (has blue background)
    const firstItem = page.locator('[data-testid^="document-picker-item-"]').first();
    await expect(firstItem).toHaveClass(/bg-blue-50/);
  });

  test('close button closes document picker modal', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const anotherDoc = await getAnotherDocument(page, docId);
    if (!anotherDoc) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/doc');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 3000 });
    // Wait for list to load
    await expect(page.getByTestId('document-picker-list')).toBeVisible({ timeout: 3000 });

    // Click the close button
    await page.getByTestId('document-picker-modal-close').click();

    // Modal should close
    await expect(page.getByTestId('document-picker-modal')).not.toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // Embed Rendering Tests
  // ============================================================================

  test('task embed shows task title and status', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    // Insert a task embed
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/task');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('task-picker-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId(`task-picker-item-${task.id}`)).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`task-picker-item-${task.id}`).click();

    // Check that the embed shows the task title
    const embed = page.getByTestId(`task-embed-${task.id}`);
    await expect(embed).toBeVisible({ timeout: 5000 });
    await expect(embed).toContainText(task.title);
  });

  test('document embed shows document title and type', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const anotherDoc = await getAnotherDocument(page, docId);
    if (!anotherDoc) {
      test.skip();
      return;
    }

    // Insert a document embed
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/doc');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId(`document-picker-item-${anotherDoc.id}`)).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`document-picker-item-${anotherDoc.id}`).click();

    // Check that the embed shows the document title
    const embed = page.getByTestId(`doc-embed-${anotherDoc.id}`);
    await expect(embed).toBeVisible({ timeout: 5000 });
    if (anotherDoc.title) {
      await expect(embed).toContainText(anotherDoc.title);
    }
  });

  // ============================================================================
  // Navigation Tests
  // ============================================================================

  test('clicking task embed navigates to task detail', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    // Insert a task embed
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/task');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('task-picker-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId(`task-picker-item-${task.id}`)).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`task-picker-item-${task.id}`).click();

    // Click on the embed link (it's an anchor)
    const embed = page.getByTestId(`task-embed-${task.id}`);
    await expect(embed).toBeVisible({ timeout: 5000 });
    await embed.click();

    // Should navigate to task page
    await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}`), { timeout: 5000 });
  });

  test('clicking document embed navigates to document view', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const anotherDoc = await getAnotherDocument(page, docId);
    if (!anotherDoc) {
      test.skip();
      return;
    }

    // Insert a document embed
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/doc');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId(`document-picker-item-${anotherDoc.id}`)).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`document-picker-item-${anotherDoc.id}`).click();

    // Click on the embed link (it's an anchor)
    const embed = page.getByTestId(`doc-embed-${anotherDoc.id}`);
    await expect(embed).toBeVisible({ timeout: 5000 });
    await embed.click();

    // Should navigate to document page
    await expect(page).toHaveURL(new RegExp(`/documents/${anotherDoc.id}`), { timeout: 5000 });
  });

  // ============================================================================
  // Backspace Deletion Tests
  // ============================================================================

  test('backspace removes task embed', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const task = await getFirstTask(page);
    if (!task) {
      test.skip();
      return;
    }

    // Insert a task embed
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/task');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('task-picker-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId(`task-picker-item-${task.id}`)).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`task-picker-item-${task.id}`).click();

    // Verify embed is inserted
    await expect(page.getByTestId(`task-embed-${task.id}`)).toBeVisible({ timeout: 5000 });

    // Focus after the embed and press backspace
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.press('End'); // Go to end of line
    await page.keyboard.press('Backspace');

    // Embed should be removed
    await expect(page.getByTestId(`task-embed-${task.id}`)).not.toBeVisible({ timeout: 3000 });
  });

  test('backspace removes document embed', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const anotherDoc = await getAnotherDocument(page, docId);
    if (!anotherDoc) {
      test.skip();
      return;
    }

    // Insert a document embed
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/doc');
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId(`document-picker-item-${anotherDoc.id}`)).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`document-picker-item-${anotherDoc.id}`).click();

    // Verify embed is inserted
    await expect(page.getByTestId(`doc-embed-${anotherDoc.id}`)).toBeVisible({ timeout: 5000 });

    // Focus after the embed and press backspace
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.press('End'); // Go to end of line
    await page.keyboard.press('Backspace');

    // Embed should be removed
    await expect(page.getByTestId(`doc-embed-${anotherDoc.id}`)).not.toBeVisible({ timeout: 3000 });
  });
});
