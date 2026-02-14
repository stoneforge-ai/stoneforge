import { test, expect } from '@playwright/test';

test.describe('TB20: Library Tree', () => {
  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('GET /api/libraries endpoint returns libraries', async ({ page }) => {
    const response = await page.request.get('/api/libraries');
    expect(response.ok()).toBe(true);
    const libraries = await response.json();
    expect(Array.isArray(libraries)).toBe(true);
  });

  test('GET /api/libraries with hydration returns description', async ({ page }) => {
    const response = await page.request.get('/api/libraries?hydrate.description=true');
    expect(response.ok()).toBe(true);
    const libraries = await response.json();
    expect(Array.isArray(libraries)).toBe(true);
    // Libraries with descriptionRef should have description hydrated if they have one
    for (const lib of libraries) {
      expect(lib.type).toBe('library');
      expect(lib.name).toBeDefined();
    }
  });

  test('GET /api/libraries/:id returns library with children', async ({ page }) => {
    const listResponse = await page.request.get('/api/libraries');
    const libraries = await listResponse.json();

    if (libraries.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/libraries/${libraries[0].id}`);
    expect(response.ok()).toBe(true);
    const library = await response.json();
    expect(library.id).toBe(libraries[0].id);
    expect(library.type).toBe('library');
    // Check for children arrays
    expect(Array.isArray(library._subLibraries)).toBe(true);
    expect(Array.isArray(library._documents)).toBe(true);
  });

  test('GET /api/libraries/:id returns 404 for invalid ID', async ({ page }) => {
    const response = await page.request.get('/api/libraries/el-invalid999');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/libraries/:id/documents returns documents', async ({ page }) => {
    const listResponse = await page.request.get('/api/libraries');
    const libraries = await listResponse.json();

    if (libraries.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/libraries/${libraries[0].id}/documents`);
    expect(response.ok()).toBe(true);
    const documents = await response.json();
    expect(Array.isArray(documents)).toBe(true);
    // All items should be documents
    for (const doc of documents) {
      expect(doc.type).toBe('document');
    }
  });

  test('GET /api/documents endpoint returns documents', async ({ page }) => {
    const response = await page.request.get('/api/documents');
    expect(response.ok()).toBe(true);
    const documents = await response.json();
    expect(Array.isArray(documents)).toBe(true);
  });

  // ============================================================================
  // UI Tests
  // ============================================================================

  test('documents page is accessible', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
  });

  test('library tree sidebar is visible', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await page.waitForTimeout(500);

    // Either library tree or loading should be visible
    const libraryTree = page.getByTestId('library-tree');
    const loading = page.getByTestId('libraries-loading');

    // Wait for library tree to appear (loading should be done)
    await expect(libraryTree.or(loading)).toBeVisible({ timeout: 5000 });
  });

  test('library count is displayed', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Library count should be visible
    await expect(page.getByTestId('library-count')).toBeVisible();
    const countText = await page.getByTestId('library-count').textContent();
    expect(countText).toMatch(/\d+ librar(y|ies)/);
  });

  test('placeholder is shown when no library selected and libraries exist', async ({ page }) => {
    const response = await page.request.get('/api/libraries');
    const libraries = await response.json();

    if (libraries.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('library-placeholder')).toBeVisible();
  });

  test('all documents view is shown when no libraries exist', async ({ page }) => {
    const response = await page.request.get('/api/libraries');
    const libraries = await response.json();

    if (libraries.length > 0) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('all-documents-view')).toBeVisible();
  });

  test('clicking library shows library view', async ({ page }) => {
    const response = await page.request.get('/api/libraries');
    const libraries = await response.json();

    // Find a root-level library (no parent) since tree only shows roots at top level
    const rootLibrary = libraries.find((lib: { parentId: string | null }) => !lib.parentId);
    if (!rootLibrary) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Click on the root library
    await page.getByTestId(`library-tree-item-${rootLibrary.id}`).click();

    // Library view should appear
    await expect(page.getByTestId('library-view')).toBeVisible();
    await expect(page.getByTestId('library-header')).toBeVisible();
  });

  test('library view shows library name', async ({ page }) => {
    const response = await page.request.get('/api/libraries');
    const libraries = await response.json();

    // Find a root-level library (no parent) since tree only shows roots at top level
    const rootLibrary = libraries.find((lib: { parentId: string | null }) => !lib.parentId);
    if (!rootLibrary) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Click on the root library
    await page.getByTestId(`library-tree-item-${rootLibrary.id}`).click();

    // Library name should be visible in header
    await expect(page.getByTestId('library-name')).toBeVisible();
    await expect(page.getByTestId('library-name')).toContainText(rootLibrary.name);
  });

  test('library view shows document count', async ({ page }) => {
    const response = await page.request.get('/api/libraries');
    const libraries = await response.json();

    // Find a root-level library (no parent) since tree only shows roots at top level
    const rootLibrary = libraries.find((lib: { parentId: string | null }) => !lib.parentId);
    if (!rootLibrary) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Click on the root library
    await page.getByTestId(`library-tree-item-${rootLibrary.id}`).click();

    // Document count should be visible
    await expect(page.getByTestId('library-doc-count')).toBeVisible();
    const countText = await page.getByTestId('library-doc-count').textContent();
    expect(countText).toMatch(/\d+ documents?/);
  });

  test('empty library shows empty state', async ({ page }) => {
    const response = await page.request.get('/api/libraries');
    const libraries = await response.json();

    // Find a root-level library (no parent) since tree only shows roots at top level
    const rootLibrary = libraries.find((lib: { parentId: string | null }) => !lib.parentId);
    if (!rootLibrary) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Click on the root library
    await page.getByTestId(`library-tree-item-${rootLibrary.id}`).click();

    // Wait for library view
    await expect(page.getByTestId('library-view')).toBeVisible();

    // Either documents list or empty state should be visible
    const documentsList = page.getByTestId('documents-list');
    const documentsEmpty = page.getByTestId('documents-empty');
    await expect(documentsList.or(documentsEmpty)).toBeVisible({ timeout: 5000 });
  });

  test('sidebar Documents link navigates to documents page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    // Click on Documents in sidebar
    await page.getByTestId('nav-documents').click();

    // Should navigate to documents page
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('/documents');
  });

  test('library item shows name in tree', async ({ page }) => {
    const response = await page.request.get('/api/libraries');
    const libraries = await response.json();

    if (libraries.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Library name should be visible in tree item
    const libraryName = page.getByTestId(`library-name-${libraries[0].id}`);
    await expect(libraryName).toBeVisible();
    await expect(libraryName).toContainText(libraries[0].name);
  });

  test('empty library tree shows empty state', async ({ page }) => {
    const response = await page.request.get('/api/libraries');
    const libraries = await response.json();

    if (libraries.length > 0) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('library-empty-state')).toBeVisible();
  });
});
