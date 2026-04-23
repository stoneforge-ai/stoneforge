import { test, expect, Page } from '@playwright/test';

test.describe('TB111: @Mention Parsing in Documents', () => {
  // Helper to get first entity for createdBy field
  async function getFirstEntity(page: Page): Promise<{ id: string; name: string } | null> {
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    // Handle paginated response
    const entities = data.items || data;
    return entities.length > 0 ? entities[0] : null;
  }

  // Helper to get all entities
  async function getAllEntities(page: Page): Promise<Array<{ id: string; name: string; entityType: string }>> {
    const response = await page.request.get('/api/entities?limit=100');
    const data = await response.json();
    return data.items || data;
  }

  // Helper to get first library
  async function getFirstLibrary(page: Page): Promise<{ id: string; name: string; parentId?: string | null } | null> {
    const response = await page.request.get('/api/libraries');
    const data = await response.json();
    const libraries = data.items || data;
    // Prefer root library (no parent)
    const rootLib = libraries.find((l: { parentId?: string | null }) => !l.parentId);
    return rootLib || (libraries.length > 0 ? libraries[0] : null);
  }

  // Helper to create a test document
  async function createTestDocument(page: Page, entityId: string, libraryId: string): Promise<{ id: string; title: string }> {
    const title = `Mention Test Doc ${Date.now()}`;
    const response = await page.request.post('/api/documents', {
      data: {
        title,
        content: '',
        contentType: 'markdown',
        createdBy: entityId,
        libraryId,
      },
    });
    const doc = await response.json();
    return doc;
  }

  // Helper to navigate to a document in edit mode
  async function navigateToDocumentEdit(page: Page, docId: string, libraryId: string) {
    // Navigate to documents page with library and document selected
    await page.goto(`/documents?library=${libraryId}&selected=${docId}`);

    // Wait for documents page to load
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    // Wait for document detail panel to appear
    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 10000 });

    // Enter edit mode
    const editBtn = page.getByTestId('document-edit-button');
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();

    // Wait for editor to be visible
    await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 5000 });
  }

  // ============================================================================
  // UI Tests
  // ============================================================================

  test('typing @ shows mention autocomplete menu', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    if (!entity || !library) {
      test.skip();
      return;
    }

    // Create a test document and navigate to edit mode
    const doc = await createTestDocument(page, entity.id, library.id);
    await navigateToDocumentEdit(page, doc.id, library.id);

    // Click into the editor and type @
    const editor = page.getByTestId('block-editor-content');
    await editor.click();
    await page.keyboard.type('@');

    // Wait for the mention autocomplete menu to appear
    await expect(page.getByTestId('mention-autocomplete-menu')).toBeVisible({ timeout: 5000 });
  });

  test('mention autocomplete filters entities by query', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    const allEntities = await getAllEntities(page);
    if (!entity || !library || allEntities.length === 0) {
      test.skip();
      return;
    }

    // Create a test document and navigate to edit mode
    const doc = await createTestDocument(page, entity.id, library.id);
    await navigateToDocumentEdit(page, doc.id, library.id);

    // Click into the editor and type @ followed by part of the first entity's name
    const editor = page.getByTestId('block-editor-content');
    await editor.click();

    // Get first 2 characters of the entity name to search
    const searchQuery = allEntities[0].name.substring(0, 2).toLowerCase();
    await page.keyboard.type(`@${searchQuery}`);

    // Wait for the mention autocomplete menu to appear
    const menu = page.getByTestId('mention-autocomplete-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Verify that at least one entity item is shown
    const items = menu.locator('[data-testid^="mention-item-"]');
    await expect(items.first()).toBeVisible();
  });

  test('selecting mention from autocomplete inserts it', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    const allEntities = await getAllEntities(page);
    if (!entity || !library || allEntities.length === 0) {
      test.skip();
      return;
    }

    // Create a test document and navigate to edit mode
    const doc = await createTestDocument(page, entity.id, library.id);
    await navigateToDocumentEdit(page, doc.id, library.id);

    // Click into the editor and type @
    const editor = page.getByTestId('block-editor-content');
    await editor.click();
    await page.keyboard.type('@');

    // Wait for the mention autocomplete menu to appear
    const menu = page.getByTestId('mention-autocomplete-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Press Enter to select the first item
    await page.keyboard.press('Enter');

    // Wait for the menu to close
    await expect(menu).not.toBeVisible({ timeout: 3000 });

    // Verify that a mention chip is inserted in the editor
    const mentionChip = page.locator('.mention-chip');
    await expect(mentionChip.first()).toBeVisible();
  });

  test('mention chip links to entity page', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    const allEntities = await getAllEntities(page);
    if (!entity || !library || allEntities.length === 0) {
      test.skip();
      return;
    }

    // Create a test document and navigate to edit mode
    const doc = await createTestDocument(page, entity.id, library.id);
    await navigateToDocumentEdit(page, doc.id, library.id);

    // Click into the editor and type @
    const editor = page.getByTestId('block-editor-content');
    await editor.click();
    await page.keyboard.type('@');

    // Wait for the mention autocomplete menu to appear
    const menu = page.getByTestId('mention-autocomplete-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Press Enter to select the first item
    await page.keyboard.press('Enter');
    await expect(menu).not.toBeVisible({ timeout: 3000 });

    // Verify mention chip is inserted and has href pointing to entities page
    const mentionChip = page.locator('.mention-chip').first();
    await expect(mentionChip).toBeVisible();
    const href = await mentionChip.getAttribute('href');
    expect(href).toContain('/entities?selected=');
  });

  test('keyboard navigation works in mention autocomplete', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    const allEntities = await getAllEntities(page);
    if (!entity || !library || allEntities.length < 2) {
      test.skip();
      return;
    }

    // Create a test document and navigate to edit mode
    const doc = await createTestDocument(page, entity.id, library.id);
    await navigateToDocumentEdit(page, doc.id, library.id);

    // Click into the editor and type @
    const editor = page.getByTestId('block-editor-content');
    await editor.click();
    await page.keyboard.type('@');

    // Wait for the mention autocomplete menu to appear
    const menu = page.getByTestId('mention-autocomplete-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Press ArrowDown to move to second item
    await page.keyboard.press('ArrowDown');

    // Get the items and check the second one has the selected style
    const items = menu.locator('[data-testid^="mention-item-"]');
    const secondItem = items.nth(1);
    await expect(secondItem).toHaveClass(/bg-blue-50/);

    // Press Escape to close the menu
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible({ timeout: 3000 });
  });

  test('mention is saved to document content', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    const allEntities = await getAllEntities(page);
    if (!entity || !library || allEntities.length === 0) {
      test.skip();
      return;
    }

    // Create a test document and navigate to edit mode
    const doc = await createTestDocument(page, entity.id, library.id);
    await navigateToDocumentEdit(page, doc.id, library.id);

    // Click into the editor, type some text and @mention
    const editor = page.getByTestId('block-editor-content');
    await editor.click();
    await page.keyboard.type('Hello ');
    await page.keyboard.type('@');

    // Wait for the mention autocomplete menu to appear
    const menu = page.getByTestId('mention-autocomplete-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Press Enter to select the first item
    await page.keyboard.press('Enter');
    await expect(menu).not.toBeVisible({ timeout: 3000 });

    // Add more text after the mention
    await page.keyboard.type('nice to meet you!');

    // Save the document
    await page.getByTestId('document-save-button').click();

    // Wait for save to complete (edit mode should exit)
    await expect(page.getByTestId('document-edit-button')).toBeVisible({ timeout: 5000 });

    // Verify the document was saved by checking the API
    const response = await page.request.get(`/api/documents/${doc.id}`);
    const savedDoc = await response.json();

    // The content should contain an @mention in markdown format
    expect(savedDoc.content).toContain('@');
  });

  test('no results message shown when no entities match', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    if (!entity || !library) {
      test.skip();
      return;
    }

    // Create a test document and navigate to edit mode
    const doc = await createTestDocument(page, entity.id, library.id);
    await navigateToDocumentEdit(page, doc.id, library.id);

    // Click into the editor and type @ followed by gibberish
    const editor = page.getByTestId('block-editor-content');
    await editor.click();
    await page.keyboard.type('@zzzznonexistent12345');

    // Wait for the mention autocomplete menu to appear
    const menu = page.getByTestId('mention-autocomplete-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Verify "No matching entities" message is shown
    await expect(menu).toContainText('No matching entities');
  });
});
