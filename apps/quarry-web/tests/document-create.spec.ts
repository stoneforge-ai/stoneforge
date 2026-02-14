import { test, expect } from '@playwright/test';

test.describe('TB27: Create Document', () => {
  // Helper to get first entity for createdBy field
  async function getFirstEntity(page: import('@playwright/test').Page): Promise<{ id: string; name: string } | null> {
    const response = await page.request.get('/api/entities');
    const entities = await response.json();
    return entities.length > 0 ? entities[0] : null;
  }

  // Helper to get first root-level library (no parent) for visibility in tree
  async function getFirstLibrary(page: import('@playwright/test').Page): Promise<{ id: string; name: string; parentId: string | null } | null> {
    const response = await page.request.get('/api/libraries');
    const libraries = await response.json();
    // Find a root library (parentId is null) since only root libraries are visible at top level of tree
    const rootLibrary = libraries.find((lib: { parentId: string | null }) => !lib.parentId);
    return rootLibrary || (libraries.length > 0 ? libraries[0] : null);
  }

  // ============================================================================
  // API Tests
  // ============================================================================

  test('POST /api/documents endpoint creates document with defaults', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const response = await page.request.post('/api/documents', {
      data: {
        title: `Test Document ${Date.now()}`,
        createdBy: entity.id,
      },
    });

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(201);
    const doc = await response.json();
    expect(doc.contentType).toBe('text'); // default content type
    expect(doc.content).toBe(''); // default empty content
    expect(doc.createdBy).toBe(entity.id);
    expect(doc.id).toBeDefined();
  });

  test('POST /api/documents endpoint creates document with content', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const title = `Content Doc ${Date.now()}`;
    const content = '# Hello World\n\nThis is a test document.';
    const response = await page.request.post('/api/documents', {
      data: {
        title,
        content,
        contentType: 'markdown',
        createdBy: entity.id,
      },
    });

    expect(response.ok()).toBe(true);
    const doc = await response.json();
    expect(doc.title).toBe(title);
    expect(doc.content).toBe(content);
    expect(doc.contentType).toBe('markdown');
  });

  test('POST /api/documents endpoint creates JSON document with valid JSON', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const content = JSON.stringify({ key: 'value', nested: { data: true } });
    const response = await page.request.post('/api/documents', {
      data: {
        title: `JSON Doc ${Date.now()}`,
        content,
        contentType: 'json',
        createdBy: entity.id,
      },
    });

    expect(response.ok()).toBe(true);
    const doc = await response.json();
    expect(doc.contentType).toBe('json');
    expect(doc.content).toBe(content);
  });

  test('POST /api/documents endpoint rejects invalid JSON content', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const response = await page.request.post('/api/documents', {
      data: {
        title: 'Invalid JSON Doc',
        content: '{ invalid json }',
        contentType: 'json',
        createdBy: entity.id,
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('JSON');
  });

  test('POST /api/documents endpoint requires createdBy', async ({ page }) => {
    const response = await page.request.post('/api/documents', {
      data: {
        title: 'Test Document',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('createdBy');
  });

  test('POST /api/documents endpoint rejects invalid contentType', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const response = await page.request.post('/api/documents', {
      data: {
        title: 'Test Document',
        contentType: 'invalid',
        createdBy: entity.id,
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('contentType');
  });

  test('POST /api/documents endpoint creates document with tags', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const tags = ['spec', 'draft', 'api'];
    const response = await page.request.post('/api/documents', {
      data: {
        title: `Tagged Doc ${Date.now()}`,
        createdBy: entity.id,
        tags,
      },
    });

    expect(response.ok()).toBe(true);
    const doc = await response.json();
    expect(doc.tags).toEqual(tags);
  });

  test('POST /api/documents endpoint adds document to library', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    if (!entity || !library) {
      test.skip();
      return;
    }

    const title = `Library Doc ${Date.now()}`;
    const response = await page.request.post('/api/documents', {
      data: {
        title,
        createdBy: entity.id,
        libraryId: library.id,
      },
    });

    expect(response.ok()).toBe(true);
    const doc = await response.json();

    // Verify document is in library
    const libraryResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
    const libraryDocs = await libraryResponse.json();
    const foundDoc = libraryDocs.find((d: { id: string }) => d.id === doc.id);
    expect(foundDoc).toBeDefined();
  });

  // ============================================================================
  // UI Tests
  // ============================================================================

  test('Create Document button is visible in sidebar', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('new-document-button-sidebar')).toBeVisible();
  });

  test('clicking Create Document button opens modal', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-document-button-sidebar').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();
  });

  test('Create Document modal has all form fields', async ({ page }) => {
    await page.goto('/documents');
    await page.getByTestId('new-document-button-sidebar').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();

    // Check all form fields are present
    await expect(page.getByTestId('create-document-title-input')).toBeVisible();
    await expect(page.getByTestId('create-document-content-type-select')).toBeVisible();
    await expect(page.getByTestId('create-document-created-by-select')).toBeVisible();
    await expect(page.getByTestId('create-document-library-select')).toBeVisible();
    await expect(page.getByTestId('create-document-content-textarea')).toBeVisible();
    await expect(page.getByTestId('create-document-tags-input')).toBeVisible();
  });

  test('Create Document modal closes on backdrop click', async ({ page }) => {
    await page.goto('/documents');
    await page.getByTestId('new-document-button-sidebar').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();

    // Click on the backdrop outside the dialog area
    await page.getByTestId('create-document-modal-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId('create-document-modal')).not.toBeVisible();
  });

  test('Create Document modal closes on X button click', async ({ page }) => {
    await page.goto('/documents');
    await page.getByTestId('new-document-button-sidebar').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();

    await page.getByTestId('create-document-modal-close').click();
    await expect(page.getByTestId('create-document-modal')).not.toBeVisible();
  });

  test('Create Document modal closes on Cancel button click', async ({ page }) => {
    await page.goto('/documents');
    await page.getByTestId('new-document-button-sidebar').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();

    await page.getByTestId('create-document-cancel-button').click();
    await expect(page.getByTestId('create-document-modal')).not.toBeVisible();
  });

  test('Create Document modal closes on Escape key', async ({ page }) => {
    await page.goto('/documents');
    await page.getByTestId('new-document-button-sidebar').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('create-document-modal')).not.toBeVisible();
  });

  test('submitting Create Document form creates document and closes modal', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await page.getByTestId('new-document-button-sidebar').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();

    // Fill in the form
    const title = `UI Created Doc ${Date.now()}`;
    await page.getByTestId('create-document-title-input').fill(title);
    await page.getByTestId('create-document-created-by-select').selectOption(entity.id);
    await page.getByTestId('create-document-content-type-select').selectOption('markdown');
    await page.getByTestId('create-document-content-textarea').fill('# Test Content');

    // Submit
    await page.getByTestId('create-document-submit-button').click();

    // Modal should close
    await expect(page.getByTestId('create-document-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify document was created via API
    const response = await page.request.get('/api/documents');
    const docs = await response.json();
    const createdDoc = docs.find((d: { title: string }) => d.title === title);
    expect(createdDoc).toBeDefined();
    expect(createdDoc.contentType).toBe('markdown');
  });

  test('Create Document form validates required fields', async ({ page }) => {
    await page.goto('/documents');
    await page.getByTestId('new-document-button-sidebar').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();

    // The submit button should be disabled when title is empty
    const submitButton = page.getByTestId('create-document-submit-button');
    await expect(submitButton).toBeDisabled();

    // Fill title
    await page.getByTestId('create-document-title-input').fill('Test Document');

    // If default createdBy is selected, button should be enabled
    const createdBySelect = page.getByTestId('create-document-created-by-select');
    const selectedValue = await createdBySelect.inputValue();

    if (selectedValue) {
      await expect(submitButton).not.toBeDisabled();
    }
  });

  test('Create Document with tags creates document with correct tags', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await page.getByTestId('new-document-button-sidebar').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();

    // Fill in the form with tags
    const title = `Tagged UI Doc ${Date.now()}`;
    await page.getByTestId('create-document-title-input').fill(title);
    await page.getByTestId('create-document-created-by-select').selectOption(entity.id);
    await page.getByTestId('create-document-tags-input').fill('spec, draft, api');

    // Submit
    await page.getByTestId('create-document-submit-button').click();
    await expect(page.getByTestId('create-document-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify document was created with tags via API
    const response = await page.request.get('/api/documents');
    const docs = await response.json();
    const createdDoc = docs.find((d: { title: string }) => d.title === title);
    expect(createdDoc).toBeDefined();
    expect(createdDoc.tags).toEqual(['spec', 'draft', 'api']);
  });

  test('newly created document detail panel opens after creation', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    // Create a new document
    await page.getByTestId('new-document-button-sidebar').click();
    const title = `Selected Doc ${Date.now()}`;
    await page.getByTestId('create-document-title-input').fill(title);
    await page.getByTestId('create-document-created-by-select').selectOption(entity.id);
    await page.getByTestId('create-document-submit-button').click();

    // Wait for modal to close
    await expect(page.getByTestId('create-document-modal')).not.toBeVisible({ timeout: 10000 });

    // The document detail panel should open with the new document
    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('document-detail-title')).toHaveText(title, { timeout: 10000 });
  });

  test('Create Document button in library view includes library by default', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    if (!entity || !library) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    // Select the library
    await page.getByTestId(`library-tree-item-${library.id}`).click();
    await expect(page.getByTestId('library-view')).toBeVisible();

    // Click Create Document in library view
    await page.getByTestId('new-document-button-library').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();

    // The library should be pre-selected
    const librarySelect = page.getByTestId('create-document-library-select');
    const selectedLibrary = await librarySelect.inputValue();
    expect(selectedLibrary).toBe(library.id);
  });

  test('content textarea placeholder changes based on content type', async ({ page }) => {
    await page.goto('/documents');
    await page.getByTestId('new-document-button-sidebar').click();
    await expect(page.getByTestId('create-document-modal')).toBeVisible();

    const textarea = page.getByTestId('create-document-content-textarea');

    // Default is markdown
    await expect(textarea).toHaveAttribute('placeholder', /Heading/i);

    // Switch to JSON
    await page.getByTestId('create-document-content-type-select').selectOption('json');
    await expect(textarea).toHaveAttribute('placeholder', /key/i);

    // Switch to text
    await page.getByTestId('create-document-content-type-select').selectOption('text');
    await expect(textarea).toHaveAttribute('placeholder', /writing/i);
  });
});
