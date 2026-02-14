import { test, expect, Page } from '@playwright/test';

interface DocumentData {
  id: string;
  libraryId?: string;
}

// Helper to get or create a library for testing
async function getOrCreateLibrary(page: Page) {
  const librariesResponse = await page.request.get('/api/libraries');
  const libraries = await librariesResponse.json();

  if (libraries.length > 0) {
    return libraries[0];
  }

  // Create a library if none exist
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
async function createTestDocument(page: Page, title?: string, libraryId?: string): Promise<DocumentData> {
  const response = await page.request.post('/api/documents', {
    data: {
      title: title || `Test Document ${Date.now()}`,
      content: 'Test document content for expand testing',
      contentType: 'text',
      createdBy: 'test-user',
      libraryId,
    },
  });
  expect(response.ok()).toBe(true);
  const doc = await response.json();
  expect(doc.id).toBeDefined();
  return { id: doc.id, libraryId };
}

// Helper to get or create a document for testing
async function getOrCreateDocument(page: Page): Promise<DocumentData> {
  // First try to get an existing library with documents
  const librariesResponse = await page.request.get('/api/libraries');
  const libraries = await librariesResponse.json();

  for (const library of libraries) {
    const docsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
    const docs = await docsResponse.json();
    if (docs.length > 0) {
      return { id: docs[0].id, libraryId: library.id };
    }
  }

  // If no libraries with documents, create one
  const library = await getOrCreateLibrary(page);
  return createTestDocument(page, 'Test Doc for Expand', library.id);
}

// Helper to open a document in the detail panel
async function openDocument(page: Page, docData: DocumentData): Promise<boolean> {
  await page.goto('/documents');
  await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);

  const librariesResponse = await page.request.get('/api/libraries');
  const libraries = await librariesResponse.json();

  if (libraries.length === 0) {
    // No libraries - documents show in all-documents view
    await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
    const docItem = page.getByTestId(`document-item-${docData.id}`);
    if (await docItem.isVisible()) {
      await docItem.click();
      return true;
    }
    return false;
  } else {
    // Use the document's library or first library
    const targetLibraryId = docData.libraryId || libraries[0].id;
    await page.getByTestId(`library-tree-item-${targetLibraryId}`).click();
    await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });

    const docItem = page.getByTestId(`document-item-${docData.id}`);
    if (await docItem.isVisible()) {
      await docItem.click();
      return true;
    }
    return false;
  }
}

test.describe('TB94a: Editor Expand in Edit Mode', () => {
  // ============================================================================
  // Core Functionality Tests
  // ============================================================================

  test('expand button is visible when viewing a document', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('document-expand-button')).toBeVisible();
  });

  test('expand button works in view mode (not editing)', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Verify document list is visible (not expanded)
    const documentList = page.getByTestId('library-view').or(page.getByTestId('all-documents-view'));
    await expect(documentList).toBeVisible();

    // Click expand button
    await page.getByTestId('document-expand-button').click();
    await page.waitForTimeout(300);

    // Document list should be hidden when expanded
    await expect(documentList).not.toBeVisible();

    // Panel should still be visible
    await expect(page.getByTestId('document-detail-panel')).toBeVisible();

    // Click collapse button to restore
    await page.getByTestId('document-expand-button').click();
    await page.waitForTimeout(300);

    // Document list should be visible again
    await expect(documentList).toBeVisible();
  });

  test('expand button is visible in edit mode', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Enter edit mode
    await page.getByTestId('document-edit-button').click();
    await expect(page.getByTestId('document-save-button')).toBeVisible({ timeout: 3000 });

    // Expand button should still be visible in edit mode
    await expect(page.getByTestId('document-expand-button')).toBeVisible();
  });

  test('expand button works in edit mode', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Enter edit mode
    await page.getByTestId('document-edit-button').click();
    await expect(page.getByTestId('document-save-button')).toBeVisible({ timeout: 3000 });

    // Verify document list is visible (not expanded)
    const documentList = page.getByTestId('library-view').or(page.getByTestId('all-documents-view'));
    await expect(documentList).toBeVisible();

    // Click expand button while in edit mode
    await page.getByTestId('document-expand-button').click();
    await page.waitForTimeout(300);

    // Document list should be hidden when expanded
    await expect(documentList).not.toBeVisible();

    // Panel should still be visible and in edit mode
    await expect(page.getByTestId('document-detail-panel')).toBeVisible();
    await expect(page.getByTestId('document-save-button')).toBeVisible();

    // The block editor should be visible
    await expect(page.getByTestId('block-editor')).toBeVisible();
  });

  test('expand state persists while editing', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // First expand, then enter edit mode
    await page.getByTestId('document-expand-button').click();
    await page.waitForTimeout(300);

    const documentList = page.getByTestId('library-view').or(page.getByTestId('all-documents-view'));
    await expect(documentList).not.toBeVisible();

    // Enter edit mode while expanded
    await page.getByTestId('document-edit-button').click();
    await expect(page.getByTestId('document-save-button')).toBeVisible({ timeout: 3000 });

    // Should still be expanded
    await expect(documentList).not.toBeVisible();

    // Type some content in the editor
    const editor = page.getByTestId('block-editor');
    await expect(editor).toBeVisible();
    await editor.locator('.tiptap').click();
    await page.keyboard.type('Test content');

    // Should still be expanded after typing
    await expect(documentList).not.toBeVisible();
  });

  test('can collapse while in edit mode without losing edits', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Get original content for later comparison
    const originalResponse = await page.request.get(`/api/documents/${docData.id}`);
    const originalDoc = await originalResponse.json();
    const originalContent = originalDoc.content || '';

    // Enter edit mode
    await page.getByTestId('document-edit-button').click();
    await expect(page.getByTestId('document-save-button')).toBeVisible({ timeout: 3000 });

    // Expand
    await page.getByTestId('document-expand-button').click();
    await page.waitForTimeout(300);

    // Type some content
    const editor = page.getByTestId('block-editor');
    await editor.locator('.tiptap').click();
    // Clear and type new content
    await page.keyboard.press('Meta+a');
    const testContent = `Test edit ${Date.now()}`;
    await page.keyboard.type(testContent);

    // Collapse back
    await page.getByTestId('document-expand-button').click();
    await page.waitForTimeout(300);

    const documentList = page.getByTestId('library-view').or(page.getByTestId('all-documents-view'));
    await expect(documentList).toBeVisible();

    // Edits should still be there (save button still visible)
    await expect(page.getByTestId('document-save-button')).toBeVisible();

    // Cancel to avoid persisting test changes
    await page.getByTestId('document-cancel-button').click();
    await page.waitForTimeout(300);

    // Restore original content
    if (originalContent !== testContent) {
      await page.request.patch(`/api/documents/${docData.id}`, {
        data: { content: originalContent },
      });
    }
  });

  // ============================================================================
  // Fullscreen / Focus Mode Tests (New Feature - TB94a)
  // ============================================================================

  test('fullscreen button is visible in document detail panel', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check for fullscreen/focus mode button
    const fullscreenButton = page.getByTestId('document-fullscreen-button');
    await expect(fullscreenButton).toBeVisible();
  });

  test('clicking fullscreen button enters fullscreen mode', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click fullscreen button
    await page.getByTestId('document-fullscreen-button').click();
    await page.waitForTimeout(300);

    // Should hide sidebar and show fullscreen panel
    await expect(page.getByTestId('library-tree-sidebar')).not.toBeVisible();
    await expect(page.getByTestId('document-fullscreen-panel')).toBeVisible();
  });

  test('pressing Escape exits fullscreen mode', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Enter fullscreen
    await page.getByTestId('document-fullscreen-button').click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId('document-fullscreen-panel')).toBeVisible();

    // Press Escape to exit
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Should be back to normal view
    await expect(page.getByTestId('document-fullscreen-panel')).not.toBeVisible();
    await expect(page.getByTestId('library-tree-sidebar')).toBeVisible();
  });

  test('fullscreen mode works in edit mode', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Enter fullscreen first
    await page.getByTestId('document-fullscreen-button').click();
    await page.waitForTimeout(300);

    // Should be in fullscreen mode
    await expect(page.getByTestId('document-fullscreen-panel')).toBeVisible();

    // Now enter edit mode while in fullscreen
    await page.getByTestId('document-edit-button').click();
    await expect(page.getByTestId('document-save-button')).toBeVisible({ timeout: 3000 });

    // Should be in fullscreen edit mode
    await expect(page.getByTestId('document-fullscreen-panel')).toBeVisible();
    await expect(page.getByTestId('block-editor')).toBeVisible();
    await expect(page.getByTestId('document-save-button')).toBeVisible();
  });

  // ============================================================================
  // Editor Size Persistence Tests (New Feature - TB94a)
  // ============================================================================

  test('expand state persists in localStorage', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand
    await page.getByTestId('document-expand-button').click();
    await page.waitForTimeout(300);

    // Check localStorage
    const expandedState = await page.evaluate(() => {
      return localStorage.getItem('document.expanded');
    });
    expect(expandedState).toBe('true');

    // Collapse
    await page.getByTestId('document-expand-button').click();
    await page.waitForTimeout(300);

    const collapsedState = await page.evaluate(() => {
      return localStorage.getItem('document.expanded');
    });
    expect(collapsedState).toBe('false');
  });

  test('expand state is restored on page reload', async ({ page }) => {
    const docData = await getOrCreateDocument(page);

    // First, open the document and expand it
    const opened = await openDocument(page, docData);
    expect(opened).toBe(true);

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the panel
    await page.getByTestId('document-expand-button').click();
    await page.waitForTimeout(300);

    // Verify it's expanded and localStorage is set
    const documentList = page.getByTestId('library-view').or(page.getByTestId('all-documents-view'));
    await expect(documentList).not.toBeVisible();

    const expandedState = await page.evaluate(() => localStorage.getItem('document.expanded'));
    expect(expandedState).toBe('true');

    // Now reload the page - note: URL still has ?selected=...&library=...
    // so the document panel should still be visible after reload
    await page.reload();
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    // Verify localStorage was preserved
    const expandedStateAfterReload = await page.evaluate(() => localStorage.getItem('document.expanded'));
    expect(expandedStateAfterReload).toBe('true');

    // Wait for React to initialize state from localStorage
    await page.waitForTimeout(500);

    // The document panel should still be visible (URL preserves selected=...)
    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check if the expand button shows expanded state (blue color)
    const expandButton = page.getByTestId('document-expand-button');
    await expect(expandButton).toBeVisible();

    // Verify the expand button has the "expanded" style (blue text)
    const expandButtonClass = await expandButton.getAttribute('class');
    expect(expandButtonClass).toContain('text-blue-600');

    // Should still be expanded based on localStorage
    const documentListAfterReload = page.getByTestId('library-view').or(page.getByTestId('all-documents-view'));
    await expect(documentListAfterReload).not.toBeVisible();

    // Clean up
    await page.evaluate(() => {
      localStorage.removeItem('document.expanded');
    });
  });
});
