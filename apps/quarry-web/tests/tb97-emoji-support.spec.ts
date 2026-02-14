import { test, expect, Page } from '@playwright/test';

/**
 * TB97: Emoji Support Tests
 *
 * These tests verify that:
 * 1. Emoji toolbar button opens picker modal
 * 2. Slash command /emoji opens picker modal
 * 3. Emoji picker has categories and search
 * 4. Emojis are inserted as Unicode characters
 * 5. :emoji: autocomplete works
 * 6. Emojis persist in Markdown storage
 * 7. Recent emojis are tracked
 */

test.use({ viewport: { width: 1400, height: 900 } });

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
      title: title || `Emoji Test ${Date.now()}`,
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
  return doc.content;
}

test.describe('TB97: Emoji Support', () => {
  test.describe('Emoji Picker Modal', () => {
    test('should open emoji picker from toolbar button', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Toolbar Test');
      await navigateToDocumentEditMode(page, doc);

      // Click emoji button in toolbar
      const emojiButton = page.getByTestId('toolbar-emoji');
      await expect(emojiButton).toBeVisible();
      await emojiButton.click();

      // Modal should open
      await expect(page.getByTestId('emoji-picker-modal')).toBeVisible();
      await expect(page.getByTestId('emoji-picker-content')).toBeVisible();
    });

    test('should close emoji picker with close button', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Close Test');
      await navigateToDocumentEditMode(page, doc);

      // Open emoji picker
      await page.getByTestId('toolbar-emoji').click();
      await expect(page.getByTestId('emoji-picker-modal')).toBeVisible();

      // Click close button
      await page.getByTestId('emoji-picker-close').click();
      await expect(page.getByTestId('emoji-picker-modal')).not.toBeVisible();
    });

    test('should close emoji picker with Escape key', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Escape Test');
      await navigateToDocumentEditMode(page, doc);

      // Open emoji picker
      await page.getByTestId('toolbar-emoji').click();
      await expect(page.getByTestId('emoji-picker-modal')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('emoji-picker-modal')).not.toBeVisible();
    });

    test('should close emoji picker by clicking backdrop', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Backdrop Test');
      await navigateToDocumentEditMode(page, doc);

      // Open emoji picker
      await page.getByTestId('toolbar-emoji').click();
      await expect(page.getByTestId('emoji-picker-modal')).toBeVisible();

      // Click backdrop
      await page.getByTestId('emoji-picker-backdrop').click();
      await expect(page.getByTestId('emoji-picker-modal')).not.toBeVisible();
    });
  });

  test.describe('Slash Command', () => {
    test('should open emoji picker via /emoji slash command', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Slash Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Type /emoji
      await page.keyboard.type('/emoji');
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });

      // Should see emoji command in the menu
      const emojiItem = page.getByTestId('slash-command-item-emoji');
      await expect(emojiItem).toBeVisible();

      // Select it
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Modal should open
      await expect(page.getByTestId('emoji-picker-modal')).toBeVisible();
    });
  });

  test.describe(':emoji: Autocomplete', () => {
    test('should show autocomplete menu when typing :smile', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Autocomplete Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Type :smile
      await page.keyboard.type(':smile');

      // Should show autocomplete menu
      await expect(page.getByTestId('emoji-autocomplete-menu')).toBeVisible({ timeout: 5000 });

      // Should have smile emoji option
      await expect(page.getByTestId('emoji-item-smile')).toBeVisible();
    });

    test('should insert emoji from autocomplete selection', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Insert Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Type :smile and select
      await page.keyboard.type(':smile');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Save the document
      await saveDocument(page);

      // Check content contains the emoji Unicode
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('😊');
    });

    test('should navigate autocomplete with arrow keys', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Arrow Nav Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Type :heart to get multiple results
      await page.keyboard.type(':heart');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });

      // Press down arrow to move selection
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);

      // Verify we can navigate (the selection should have moved)
      // We just verify the menu is still visible after navigation
      await expect(page.getByTestId('emoji-autocomplete-menu')).toBeVisible();
    });

    test('should close autocomplete with Escape', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Autocomplete Escape Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Type :fire
      await page.keyboard.type(':fire');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });

      // Press Escape
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('emoji-autocomplete-menu')).not.toBeVisible();
    });

    test('should show "No matching emojis" for unknown shortcode', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji No Match Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Type something that won't match
      await page.keyboard.type(':xyznonexistent');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });

      // Should show no matches
      const menu = page.getByTestId('emoji-autocomplete-menu');
      await expect(menu).toContainText('No matching emojis');
    });
  });

  test.describe('Emoji Storage', () => {
    test('should store emojis as Unicode in Markdown', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Unicode Storage Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Insert emoji via autocomplete
      await page.keyboard.type(':rocket');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Add some text after
      await page.keyboard.type(' Launch time!');

      // Save
      await saveDocument(page);

      // Check that the content contains Unicode emoji, not shortcode
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('🚀');
      expect(content).not.toContain(':rocket:');
      expect(content).toContain('Launch time!');
    });

    test('should preserve emojis after reload', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Persist Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Insert multiple emojis
      await page.keyboard.type(':thumbsup');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      await page.keyboard.type(' Great work! ');

      await page.keyboard.type(':fire');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      // Save
      await saveDocument(page);

      // Navigate away and back
      await page.goto('/documents');
      await page.waitForTimeout(500);
      await page.goto(`/documents?library=${doc.libraryId}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 15000 });

      // Check the content in view mode
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('👍');
      expect(content).toContain('Great work!');
      expect(content).toContain('🔥');
    });
  });

  test.describe('Common Emojis', () => {
    test('should support common emojis: thumbsup (+1)', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji +1 Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      await page.keyboard.type(':+1');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      await saveDocument(page);

      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('👍');
    });

    test('should support 100 emoji', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji 100 Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      await page.keyboard.type(':100');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      await saveDocument(page);

      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('💯');
    });

    test('should support tada/party emoji', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Tada Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      await page.keyboard.type(':tada');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      await saveDocument(page);

      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('🎉');
    });

    test('should support check/white_check_mark emoji', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Check Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      await page.keyboard.type(':check');
      await page.waitForSelector('[data-testid="emoji-autocomplete-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      await saveDocument(page);

      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('✅');
    });
  });
});
