import { test, expect, Page } from '@playwright/test';

// ============================================================================
// TB53: Attach Documents to Documents (Links) Tests
// ============================================================================

// Helper type for library with parentId
interface LibraryWithParent {
  id: string;
  name: string;
  parentId: string | null;
}

// Helper to click on a library in the tree, expanding parents if needed
async function clickLibraryInTree(page: Page, libraries: LibraryWithParent[], libraryId: string) {
  const library = libraries.find(l => l.id === libraryId);
  if (!library) return;

  // Build the ancestor chain (parents first)
  const ancestors: LibraryWithParent[] = [];
  let current = library;
  while (current.parentId) {
    const parent = libraries.find(l => l.id === current.parentId);
    if (parent) {
      ancestors.unshift(parent);
      current = parent;
    } else {
      break;
    }
  }

  // Click on each ancestor's toggle button to expand it (without selecting)
  for (const ancestor of ancestors) {
    const toggleButton = page.getByTestId(`library-toggle-${ancestor.id}`);
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      await page.waitForTimeout(100);
    }
  }

  // Now click on the target library (to select it)
  await page.getByTestId(`library-tree-item-${libraryId}`).click();
}

test.describe('TB53: Document Links', () => {
  // Helper to create a document for testing
  async function createTestDocument(page: Page, title?: string, libraryId?: string) {
    const response = await page.request.post('/api/documents', {
      data: {
        title: title || `Test Document ${Date.now()}`,
        content: 'Test document content',
        contentType: 'text',
        createdBy: 'test-user',
        libraryId,
      },
    });
    expect(response.ok()).toBe(true);
    const doc = await response.json();
    expect(doc.id).toBeDefined();
    return doc;
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

  // Helper to navigate to a document in the UI
  async function navigateToDocument(page: Page, doc: { id: string }, libraryId?: string) {
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    if (libraries.length === 0) {
      // No libraries, documents show in all-documents view
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${doc.id}`).click();
    } else {
      // Libraries exist, need to select one
      const targetLibraryId = libraryId || libraries[0].id;
      await clickLibraryInTree(page, libraries, targetLibraryId);
      await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(300);
      await page.getByTestId(`document-item-${doc.id}`).click();
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });
  }

  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('GET /api/documents/:id/links returns empty arrays for document with no links', async ({ page }) => {
    const doc = await createTestDocument(page);

    const response = await page.request.get(`/api/documents/${doc.id}/links`);
    expect(response.ok()).toBe(true);
    const links = await response.json();
    expect(links.outgoing).toEqual([]);
    expect(links.incoming).toEqual([]);
  });

  test('POST /api/documents/:id/links creates a link between documents', async ({ page }) => {
    const sourceDoc = await createTestDocument(page, 'Source Document');
    const targetDoc = await createTestDocument(page, 'Target Document');

    const response = await page.request.post(`/api/documents/${sourceDoc.id}/links`, {
      data: { targetDocumentId: targetDoc.id },
    });
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.blockedId).toBe(sourceDoc.id);
    expect(result.blockerId).toBe(targetDoc.id);
    expect(result.targetDocument.id).toBe(targetDoc.id);
  });

  test('GET /api/documents/:id/links returns outgoing link after creation', async ({ page }) => {
    const sourceDoc = await createTestDocument(page, 'Source Doc');
    const targetDoc = await createTestDocument(page, 'Target Doc');

    // Create link
    const createResponse = await page.request.post(`/api/documents/${sourceDoc.id}/links`, {
      data: { targetDocumentId: targetDoc.id },
    });
    expect(createResponse.status()).toBe(201);

    // Check source document has outgoing link
    const sourceLinksResponse = await page.request.get(`/api/documents/${sourceDoc.id}/links`);
    const sourceLinks = await sourceLinksResponse.json();
    expect(sourceLinks.outgoing).toHaveLength(1);
    expect(sourceLinks.outgoing[0].id).toBe(targetDoc.id);
    expect(sourceLinks.incoming).toHaveLength(0);
  });

  test('GET /api/documents/:id/links returns incoming link on target document', async ({ page }) => {
    const sourceDoc = await createTestDocument(page, 'Source Doc');
    const targetDoc = await createTestDocument(page, 'Target Doc');

    // Create link
    const createResponse = await page.request.post(`/api/documents/${sourceDoc.id}/links`, {
      data: { targetDocumentId: targetDoc.id },
    });
    expect(createResponse.status()).toBe(201);

    // Check target document has incoming link
    const targetLinksResponse = await page.request.get(`/api/documents/${targetDoc.id}/links`);
    const targetLinks = await targetLinksResponse.json();
    expect(targetLinks.incoming).toHaveLength(1);
    expect(targetLinks.incoming[0].id).toBe(sourceDoc.id);
    expect(targetLinks.outgoing).toHaveLength(0);
  });

  test('POST /api/documents/:id/links validates targetDocumentId is required', async ({ page }) => {
    const doc = await createTestDocument(page);

    const response = await page.request.post(`/api/documents/${doc.id}/links`, {
      data: {},
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/documents/:id/links returns 404 for non-existent source document', async ({ page }) => {
    const targetDoc = await createTestDocument(page);

    const response = await page.request.post('/api/documents/el-invalid999/links', {
      data: { targetDocumentId: targetDoc.id },
    });
    expect(response.status()).toBe(404);
  });

  test('POST /api/documents/:id/links returns 404 for non-existent target document', async ({ page }) => {
    const sourceDoc = await createTestDocument(page);

    const response = await page.request.post(`/api/documents/${sourceDoc.id}/links`, {
      data: { targetDocumentId: 'el-invalid999' },
    });
    expect(response.status()).toBe(404);
  });

  test('POST /api/documents/:id/links returns 400 for self-reference', async ({ page }) => {
    const doc = await createTestDocument(page);

    const response = await page.request.post(`/api/documents/${doc.id}/links`, {
      data: { targetDocumentId: doc.id },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain('Cannot link a document to itself');
  });

  test('POST /api/documents/:id/links returns 400 for duplicate link', async ({ page }) => {
    const sourceDoc = await createTestDocument(page);
    const targetDoc = await createTestDocument(page);

    // Create link first time
    const firstResponse = await page.request.post(`/api/documents/${sourceDoc.id}/links`, {
      data: { targetDocumentId: targetDoc.id },
    });
    expect(firstResponse.status()).toBe(201);

    // Try to create duplicate link
    const secondResponse = await page.request.post(`/api/documents/${sourceDoc.id}/links`, {
      data: { targetDocumentId: targetDoc.id },
    });
    expect(secondResponse.status()).toBe(400);
    const body = await secondResponse.json();
    expect(body.error.message).toContain('already exists');
  });

  test('DELETE /api/documents/:blockedId/links/:blockerId removes a link', async ({ page }) => {
    const sourceDoc = await createTestDocument(page);
    const targetDoc = await createTestDocument(page);

    // Create link
    const createResponse = await page.request.post(`/api/documents/${sourceDoc.id}/links`, {
      data: { targetDocumentId: targetDoc.id },
    });
    expect(createResponse.status()).toBe(201);

    // Delete link
    const deleteResponse = await page.request.delete(`/api/documents/${sourceDoc.id}/links/${targetDoc.id}`);
    expect(deleteResponse.ok()).toBe(true);
    const result = await deleteResponse.json();
    expect(result.success).toBe(true);

    // Verify link is removed
    const linksResponse = await page.request.get(`/api/documents/${sourceDoc.id}/links`);
    const links = await linksResponse.json();
    expect(links.outgoing).toHaveLength(0);
  });

  test('DELETE /api/documents/:blockedId/links/:blockerId returns 404 for non-existent link', async ({ page }) => {
    const doc1 = await createTestDocument(page);
    const doc2 = await createTestDocument(page);

    const response = await page.request.delete(`/api/documents/${doc1.id}/links/${doc2.id}`);
    expect(response.status()).toBe(404);
  });

  test('GET /api/documents/:id/links with direction=outgoing only returns outgoing', async ({ page }) => {
    const doc1 = await createTestDocument(page);
    const doc2 = await createTestDocument(page);
    const doc3 = await createTestDocument(page);

    // doc1 links to doc2
    await page.request.post(`/api/documents/${doc1.id}/links`, {
      data: { targetDocumentId: doc2.id },
    });

    // doc3 links to doc1 (doc1 has incoming from doc3)
    await page.request.post(`/api/documents/${doc3.id}/links`, {
      data: { targetDocumentId: doc1.id },
    });

    // Get only outgoing links for doc1
    const response = await page.request.get(`/api/documents/${doc1.id}/links?direction=outgoing`);
    const links = await response.json();
    expect(links.outgoing).toHaveLength(1);
    expect(links.outgoing[0].id).toBe(doc2.id);
    // incoming should be empty when direction=outgoing
    expect(links.incoming).toHaveLength(0);
  });

  test('GET /api/documents/:id/links with direction=incoming only returns incoming', async ({ page }) => {
    const doc1 = await createTestDocument(page);
    const doc2 = await createTestDocument(page);

    // doc1 links to doc2 (doc2 has incoming from doc1)
    await page.request.post(`/api/documents/${doc1.id}/links`, {
      data: { targetDocumentId: doc2.id },
    });

    // Get only incoming links for doc2
    const response = await page.request.get(`/api/documents/${doc2.id}/links?direction=incoming`);
    const links = await response.json();
    expect(links.incoming).toHaveLength(1);
    expect(links.incoming[0].id).toBe(doc1.id);
    // outgoing should be empty when direction=incoming
    expect(links.outgoing).toHaveLength(0);
  });

  // ============================================================================
  // UI Tests - Linked Documents Section
  // ============================================================================

  test('LinkedDocumentsSection is displayed in document detail panel', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc = await createTestDocument(page, 'Test Doc for UI', library.id);

    await navigateToDocument(page, doc, library.id);

    // Check that LinkedDocumentsSection is visible
    await expect(page.locator('[data-testid="linked-documents-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="linked-documents-toggle"]')).toBeVisible();
  });

  test('LinkedDocumentsSection shows "No linked documents" when empty', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc = await createTestDocument(page, 'Doc with no links', library.id);

    await navigateToDocument(page, doc, library.id);

    // Check the empty state message
    await expect(page.locator('[data-testid="no-links-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="no-links-message"]')).toContainText('No linked documents');
  });

  test('Click "Link Document" opens the document picker modal', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc = await createTestDocument(page, 'Doc for modal test', library.id);

    await navigateToDocument(page, doc, library.id);

    // Click "Link Document" button
    await page.click('[data-testid="add-document-link-button"]');

    // Check modal is visible
    await expect(page.locator('[data-testid="document-link-picker-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="document-link-search"]')).toBeVisible();
  });

  test('Document picker modal excludes current document from list', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc1 = await createTestDocument(page, 'Current Document', library.id);
    const doc2 = await createTestDocument(page, 'Other Document', library.id);

    await navigateToDocument(page, doc1, library.id);

    // Open picker
    await page.click('[data-testid="add-document-link-button"]');
    await page.waitForSelector('[data-testid="document-link-picker-modal"]');

    // Current document should NOT be in the list
    await expect(page.locator(`[data-testid="document-link-option-${doc1.id}"]`)).not.toBeVisible();
    // Other document should be in the list
    await expect(page.locator(`[data-testid="document-link-option-${doc2.id}"]`)).toBeVisible();
  });

  test('Selecting document in picker creates link and shows it in section', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const sourceDoc = await createTestDocument(page, 'Source Doc UI Test', library.id);
    const targetDoc = await createTestDocument(page, 'Target Doc UI Test', library.id);

    await navigateToDocument(page, sourceDoc, library.id);

    // Open picker
    await page.click('[data-testid="add-document-link-button"]');
    await page.waitForSelector('[data-testid="document-link-picker-modal"]');

    // Select the target document
    await page.click(`[data-testid="document-link-option-${targetDoc.id}"]`);

    // Modal should close
    await expect(page.locator('[data-testid="document-link-picker-modal"]')).not.toBeVisible();

    // Linked document should appear in the section
    await page.waitForSelector(`[data-testid="linked-document-${targetDoc.id}"]`);
    await expect(page.locator(`[data-testid="linked-document-${targetDoc.id}"]`)).toBeVisible();
  });

  test('Document picker excludes already linked documents', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc1 = await createTestDocument(page, 'Doc 1', library.id);
    const doc2 = await createTestDocument(page, 'Doc 2', library.id);
    const doc3 = await createTestDocument(page, 'Doc 3', library.id);

    // Create link from doc1 to doc2 via API
    await page.request.post(`/api/documents/${doc1.id}/links`, {
      data: { targetDocumentId: doc2.id },
    });

    await navigateToDocument(page, doc1, library.id);

    // Open picker
    await page.click('[data-testid="add-document-link-button"]');
    await page.waitForSelector('[data-testid="document-link-picker-modal"]');

    // Already linked doc2 should NOT be in the list
    await expect(page.locator(`[data-testid="document-link-option-${doc2.id}"]`)).not.toBeVisible();
    // Not-yet-linked doc3 should be in the list
    await expect(page.locator(`[data-testid="document-link-option-${doc3.id}"]`)).toBeVisible();
  });

  test('Remove link button removes outgoing link', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const sourceDoc = await createTestDocument(page, 'Source for remove test', library.id);
    const targetDoc = await createTestDocument(page, 'Target for remove test', library.id);

    // Create link via API
    await page.request.post(`/api/documents/${sourceDoc.id}/links`, {
      data: { targetDocumentId: targetDoc.id },
    });

    await navigateToDocument(page, sourceDoc, library.id);

    // Verify the link is shown
    await expect(page.locator(`[data-testid="linked-document-${targetDoc.id}"]`)).toBeVisible();

    // Click remove button
    await page.hover(`[data-testid="linked-document-${targetDoc.id}"]`);
    await page.click(`[data-testid="linked-document-remove-${targetDoc.id}"]`);

    // Link should be removed
    await expect(page.locator(`[data-testid="linked-document-${targetDoc.id}"]`)).not.toBeVisible();
  });

  test('Click linked document title navigates to that document', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc1 = await createTestDocument(page, 'First Document', library.id);
    const doc2 = await createTestDocument(page, 'Second Document', library.id);

    // Create link
    await page.request.post(`/api/documents/${doc1.id}/links`, {
      data: { targetDocumentId: doc2.id },
    });

    await navigateToDocument(page, doc1, library.id);

    // Wait for link to appear
    await page.waitForSelector(`[data-testid="linked-document-${doc2.id}"]`);

    // Click the title to navigate
    await page.click(`[data-testid="linked-document-title-${doc2.id}"]`);

    // Verify we're now viewing doc2
    await expect(page.locator('[data-testid="document-detail-title"]')).toContainText('Second Document');
  });

  test('Outgoing and incoming links displayed in different sections', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc1 = await createTestDocument(page, 'Doc 1', library.id);
    const doc2 = await createTestDocument(page, 'Doc 2', library.id);
    const doc3 = await createTestDocument(page, 'Doc 3', library.id);

    // doc1 links to doc2 (doc1 has outgoing to doc2)
    await page.request.post(`/api/documents/${doc1.id}/links`, {
      data: { targetDocumentId: doc2.id },
    });

    // doc3 links to doc1 (doc1 has incoming from doc3)
    await page.request.post(`/api/documents/${doc3.id}/links`, {
      data: { targetDocumentId: doc1.id },
    });

    await navigateToDocument(page, doc1, library.id);

    // Wait for both sections to load
    await page.waitForSelector('[data-testid="outgoing-links-section"]');
    await page.waitForSelector('[data-testid="incoming-links-section"]');

    // Verify outgoing section has doc2
    await expect(page.locator('[data-testid="outgoing-links-section"]')).toContainText('Links to');
    await expect(page.locator(`[data-testid="outgoing-links-section"] [data-testid="linked-document-${doc2.id}"]`)).toBeVisible();

    // Verify incoming section has doc3
    await expect(page.locator('[data-testid="incoming-links-section"]')).toContainText('Linked from');
    await expect(page.locator(`[data-testid="incoming-links-section"] [data-testid="linked-document-${doc3.id}"]`)).toBeVisible();
  });

  test('Document picker search filters documents by title', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc1 = await createTestDocument(page, 'Current Doc', library.id);
    const doc2 = await createTestDocument(page, 'Apple Document', library.id);
    const doc3 = await createTestDocument(page, 'Banana Document', library.id);

    await navigateToDocument(page, doc1, library.id);

    // Open picker
    await page.click('[data-testid="add-document-link-button"]');
    await page.waitForSelector('[data-testid="document-link-picker-modal"]');

    // Initially both Apple and Banana should be visible
    await expect(page.locator(`[data-testid="document-link-option-${doc2.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="document-link-option-${doc3.id}"]`)).toBeVisible();

    // Search for "apple"
    await page.fill('[data-testid="document-link-search"]', 'apple');

    // Wait for filtering
    await page.waitForTimeout(100);

    // Only Apple should be visible now
    await expect(page.locator(`[data-testid="document-link-option-${doc2.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="document-link-option-${doc3.id}"]`)).not.toBeVisible();
  });

  test('Close picker modal with Escape key', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc = await createTestDocument(page, undefined, library.id);

    await navigateToDocument(page, doc, library.id);

    // Open picker
    await page.click('[data-testid="add-document-link-button"]');
    await page.waitForSelector('[data-testid="document-link-picker-modal"]');

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should close
    await expect(page.locator('[data-testid="document-link-picker-modal"]')).not.toBeVisible();
  });

  test('Close picker modal with X button', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc = await createTestDocument(page, undefined, library.id);

    await navigateToDocument(page, doc, library.id);

    // Open picker
    await page.click('[data-testid="add-document-link-button"]');
    await page.waitForSelector('[data-testid="document-link-picker-modal"]');

    // Click close button
    await page.click('[data-testid="document-link-picker-close"]');

    // Modal should close
    await expect(page.locator('[data-testid="document-link-picker-modal"]')).not.toBeVisible();
  });

  test('Collapse and expand linked documents section', async ({ page }) => {
    const library = await getOrCreateLibrary(page);
    const doc = await createTestDocument(page, undefined, library.id);

    await navigateToDocument(page, doc, library.id);

    // Section should be expanded by default
    await expect(page.locator('[data-testid="add-document-link-button"]')).toBeVisible();

    // Click toggle to collapse
    await page.click('[data-testid="linked-documents-toggle"]');

    // Link button should be hidden when collapsed
    await expect(page.locator('[data-testid="add-document-link-button"]')).not.toBeVisible();

    // Click toggle to expand again
    await page.click('[data-testid="linked-documents-toggle"]');

    // Link button should be visible again
    await expect(page.locator('[data-testid="add-document-link-button"]')).toBeVisible();
  });
});
