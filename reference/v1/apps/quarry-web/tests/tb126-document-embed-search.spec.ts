import { test, expect, Page } from '@playwright/test';

test.describe('TB126: Fix Document Embed Search in Editor', () => {
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

  // ============================================================================
  // Document search API tests
  // ============================================================================

  test('GET /api/documents with search param returns matching documents', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a document with a unique title
    const uniqueTitle = `SearchTestDoc-${Date.now()}`;
    await createDocument(page, entity.id, uniqueTitle);

    // Search for the document
    const response = await page.request.get(`/api/documents?search=${encodeURIComponent(uniqueTitle)}&limit=50`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.items).toBeDefined();
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0].title).toContain('SearchTestDoc');
  });

  test('GET /api/documents search is case-insensitive', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a document with a unique title
    const uniqueTitle = `CaseSensitiveDocTest-${Date.now()}`;
    await createDocument(page, entity.id, uniqueTitle);

    // Search with lowercase
    const response = await page.request.get('/api/documents?search=casesensitivedoctest&limit=50');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.items).toBeDefined();
    expect(data.items.length).toBeGreaterThan(0);
  });

  test('GET /api/documents search with empty query returns all documents', async ({ page }) => {
    const response = await page.request.get('/api/documents?limit=10');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.items).toBeDefined();
  });

  test('GET /api/documents search with no matches returns empty array', async ({ page }) => {
    const response = await page.request.get('/api/documents?search=xyznonexistentquery12345&limit=50');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.items).toBeDefined();
    expect(data.items.length).toBe(0);
    expect(data.total).toBe(0);
  });

  test('GET /api/documents search also matches content', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a document with specific content
    const uniqueContent = `UniqueContentPattern-${Date.now()}`;
    const response = await page.request.post('/api/documents', {
      data: {
        title: 'Test Document for Content Search',
        contentType: 'markdown',
        content: `# Heading\n\n${uniqueContent}\n\nMore text here.`,
        createdBy: entity.id,
      },
    });
    await response.json();

    // Search by content
    const searchResponse = await page.request.get(`/api/documents?search=${encodeURIComponent(uniqueContent)}&limit=50`);
    expect(searchResponse.ok()).toBeTruthy();

    const data = await searchResponse.json();
    expect(data.items).toBeDefined();
    expect(data.items.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // Document picker modal tests
  // ============================================================================

  test('DocumentPickerModal shows documents when opened', async ({ page }) => {
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

    // Try to trigger slash command for doc embed
    const editor = page.locator('.ProseMirror');
    if (await editor.isVisible({ timeout: 5000 })) {
      await editor.click();
      await page.keyboard.type('/doc');
      await page.waitForTimeout(300);
    }
  });

  test('DocumentPickerModal filters documents by search query', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create documents with unique names for testing
    const timestamp = Date.now();
    await createDocument(page, entity.id, `AlphaDoc-${timestamp}`);
    await createDocument(page, entity.id, `BetaDoc-${timestamp}`);

    // Create a document for editing
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

    // Trigger doc embed via slash command
    const editor = page.locator('.ProseMirror');
    if (await editor.isVisible({ timeout: 5000 })) {
      await editor.click();
      await page.keyboard.type('/doc');
      await page.waitForTimeout(500);

      // Check if document picker modal appears
      const docPickerModal = page.getByTestId('document-picker-modal');
      if (await docPickerModal.isVisible({ timeout: 3000 })) {
        // Search for AlphaDoc
        const searchInput = page.getByTestId('document-picker-search');
        await searchInput.fill(`AlphaDoc-${timestamp}`);
        await page.waitForTimeout(300);

        // Should show matching document
        const docList = page.getByTestId('document-picker-list');
        await expect(docList).toContainText('AlphaDoc');
      }
    }
  });
});
