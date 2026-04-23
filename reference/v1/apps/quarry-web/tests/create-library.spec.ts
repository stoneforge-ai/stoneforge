import { test, expect } from '@playwright/test';

test.describe('TB29: Create Library', () => {
  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('POST /api/libraries endpoint creates a library', async ({ page }) => {
    // Get an entity to use as createdBy
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    const uniqueName = `Test Library ${Date.now()}`;
    const response = await page.request.post('/api/libraries', {
      data: {
        name: uniqueName,
        createdBy: entities[0].id,
        tags: ['test', 'playwright'],
      },
    });

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(201);

    const library = await response.json();
    expect(library.id).toBeDefined();
    expect(library.type).toBe('library');
    expect(library.name).toBe(uniqueName);
    expect(library.tags).toContain('test');
    expect(library.tags).toContain('playwright');
  });

  test('POST /api/libraries endpoint validates required fields', async ({ page }) => {
    // Missing name
    const response1 = await page.request.post('/api/libraries', {
      data: {
        createdBy: 'el-test',
      },
    });
    expect(response1.status()).toBe(400);
    const error1 = await response1.json();
    expect(error1.error.code).toBe('VALIDATION_ERROR');

    // Missing createdBy
    const response2 = await page.request.post('/api/libraries', {
      data: {
        name: 'Test Library',
      },
    });
    expect(response2.status()).toBe(400);
    const error2 = await response2.json();
    expect(error2.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/libraries endpoint creates library with parent', async ({ page }) => {
    // Get an entity to use as createdBy
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get existing libraries to use as parent
    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    if (libraries.length === 0) {
      test.skip();
      return;
    }

    const parentId = libraries[0].id;
    const uniqueName = `Nested Library ${Date.now()}`;
    const response = await page.request.post('/api/libraries', {
      data: {
        name: uniqueName,
        createdBy: entities[0].id,
        parentId: parentId,
      },
    });

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(201);

    const library = await response.json();
    expect(library.id).toBeDefined();
    expect(library.type).toBe('library');
    expect(library.name).toBe(uniqueName);

    // Verify the parent-child relationship was created
    const parentResponse = await page.request.get(`/api/libraries/${parentId}`);
    const parent = await parentResponse.json();
    expect(parent._subLibraries.some((sub: { id: string }) => sub.id === library.id)).toBe(true);
  });

  test('POST /api/libraries endpoint rejects invalid parent', async ({ page }) => {
    // Get an entity to use as createdBy
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.post('/api/libraries', {
      data: {
        name: `Test Library ${Date.now()}`,
        createdBy: entities[0].id,
        parentId: 'el-invalid999',
      },
    });

    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error.error.code).toBe('VALIDATION_ERROR');
    expect(error.error.message).toContain('Parent library not found');
  });

  // ============================================================================
  // UI Tests
  // ============================================================================

  test('new library button is visible in sidebar', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // New Library button should be visible
    await expect(page.getByTestId('new-library-button-sidebar')).toBeVisible();
  });

  test('clicking new library button opens modal', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Click the New Library button
    await page.getByTestId('new-library-button-sidebar').click();

    // Modal should open
    await expect(page.getByTestId('create-library-modal')).toBeVisible({ timeout: 5000 });
  });

  test('create library modal has required fields', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-library-button-sidebar').click();
    await expect(page.getByTestId('create-library-modal')).toBeVisible({ timeout: 5000 });

    // Check for required fields
    await expect(page.getByTestId('create-library-name-input')).toBeVisible();
    await expect(page.getByTestId('create-library-created-by-select')).toBeVisible();
    await expect(page.getByTestId('create-library-parent-select')).toBeVisible();
    await expect(page.getByTestId('create-library-tags-input')).toBeVisible();
    await expect(page.getByTestId('create-library-submit-button')).toBeVisible();
    await expect(page.getByTestId('create-library-cancel-button')).toBeVisible();
  });

  test('create library modal closes on cancel', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-library-button-sidebar').click();
    await expect(page.getByTestId('create-library-modal')).toBeVisible({ timeout: 5000 });

    // Click cancel
    await page.getByTestId('create-library-cancel-button').click();

    // Modal should close
    await expect(page.getByTestId('create-library-modal')).not.toBeVisible();
  });

  test('create library modal closes on backdrop click', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-library-button-sidebar').click();
    await expect(page.getByTestId('create-library-modal')).toBeVisible({ timeout: 5000 });

    // Click backdrop at a position away from the dialog
    await page.getByTestId('create-library-modal-backdrop').click({ position: { x: 10, y: 10 } });

    // Modal should close
    await expect(page.getByTestId('create-library-modal')).not.toBeVisible();
  });

  test('create library modal closes on escape key', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-library-button-sidebar').click();
    await expect(page.getByTestId('create-library-modal')).toBeVisible({ timeout: 5000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should close
    await expect(page.getByTestId('create-library-modal')).not.toBeVisible();
  });

  test('can create a library from modal', async ({ page }) => {
    // Get initial library count
    const initialResponse = await page.request.get('/api/libraries');
    const initialLibraries = await initialResponse.json();
    const initialCount = initialLibraries.length;

    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-library-button-sidebar').click();
    await expect(page.getByTestId('create-library-modal')).toBeVisible({ timeout: 5000 });

    // Fill in the form
    const uniqueName = `UI Created Library ${Date.now()}`;
    await page.getByTestId('create-library-name-input').fill(uniqueName);

    // Wait for entities to load and select one if available
    await page.waitForTimeout(500);
    const createdBySelect = page.getByTestId('create-library-created-by-select');
    const options = await createdBySelect.locator('option').count();
    if (options > 1) {
      await createdBySelect.selectOption({ index: 1 });
    }

    // Submit the form
    await page.getByTestId('create-library-submit-button').click();

    // Modal should close
    await expect(page.getByTestId('create-library-modal')).not.toBeVisible({ timeout: 5000 });

    // Check that the library was created by fetching the API
    const finalResponse = await page.request.get('/api/libraries');
    const finalLibraries = await finalResponse.json();
    expect(finalLibraries.length).toBe(initialCount + 1);
    expect(finalLibraries.some((lib: { name: string }) => lib.name === uniqueName)).toBe(true);
  });

  test('submit button is disabled without required fields', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-library-button-sidebar').click();
    await expect(page.getByTestId('create-library-modal')).toBeVisible({ timeout: 5000 });

    // Submit button should be disabled without name
    await expect(page.getByTestId('create-library-submit-button')).toBeDisabled();

    // Fill in name only
    await page.getByTestId('create-library-name-input').fill('Test Library');

    // Wait for entities to load
    await page.waitForTimeout(500);

    // If an entity is automatically selected, button might be enabled now
    // Otherwise it should still be disabled
    const createdBySelect = page.getByTestId('create-library-created-by-select');
    const selectedValue = await createdBySelect.inputValue();

    if (selectedValue) {
      // An entity is selected, button should be enabled
      await expect(page.getByTestId('create-library-submit-button')).toBeEnabled();
    } else {
      // No entity selected, button should be disabled
      await expect(page.getByTestId('create-library-submit-button')).toBeDisabled();
    }
  });

  test('parent library dropdown shows available libraries', async ({ page }) => {
    // Get existing libraries
    const response = await page.request.get('/api/libraries');
    const libraries = await response.json();

    if (libraries.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-library-button-sidebar').click();
    await expect(page.getByTestId('create-library-modal')).toBeVisible({ timeout: 5000 });

    // Check parent library dropdown has options
    const parentSelect = page.getByTestId('create-library-parent-select');
    const options = await parentSelect.locator('option').count();

    // Should have at least "No parent" + existing libraries
    expect(options).toBeGreaterThanOrEqual(libraries.length + 1);
  });

  test('empty state in sidebar shows create library link', async ({ page }) => {
    // This test checks the empty state when no libraries exist
    // We'll check for the button, but can't guarantee the empty state is shown
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    // Check if empty state exists (may not if libraries exist)
    const emptyState = page.getByTestId('library-empty-state');
    const isEmptyStateVisible = await emptyState.isVisible().catch(() => false);

    if (isEmptyStateVisible) {
      // If empty state is visible, the create button should be there
      await expect(page.getByTestId('new-library-button-empty')).toBeVisible();

      // Click the create button
      await page.getByTestId('new-library-button-empty').click();

      // Modal should open
      await expect(page.getByTestId('create-library-modal')).toBeVisible({ timeout: 5000 });
    } else {
      // Skip if libraries exist
      test.skip();
    }
  });

  test('library appears in tree after creation', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-library-button-sidebar').click();
    await expect(page.getByTestId('create-library-modal')).toBeVisible({ timeout: 5000 });

    // Create a unique library name
    const uniqueName = `Visible Library ${Date.now()}`;
    await page.getByTestId('create-library-name-input').fill(uniqueName);

    // Select an entity
    await page.waitForTimeout(500);
    const createdBySelect = page.getByTestId('create-library-created-by-select');
    const options = await createdBySelect.locator('option').count();
    if (options > 1) {
      await createdBySelect.selectOption({ index: 1 });
    }

    // Submit
    await page.getByTestId('create-library-submit-button').click();

    // Wait for modal to close
    await expect(page.getByTestId('create-library-modal')).not.toBeVisible({ timeout: 5000 });

    // Library should appear in tree (need to wait for query invalidation)
    await page.waitForTimeout(1000);

    // Reload to ensure fresh data
    await page.reload();
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // The library name should be visible in the tree
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5000 });
  });
});
