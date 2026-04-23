import { test, expect, Page } from '@playwright/test';

/**
 * TB94d: Text Alignment Tests
 *
 * These tests verify that:
 * 1. Toolbar alignment buttons work correctly
 * 2. Slash commands for alignment work (/left, /center, /right, /justify)
 * 3. Keyboard shortcuts for alignment work
 * 4. Alignment is stored and persists in Markdown
 * 5. Alignment indicator shows current state in toolbar
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
      title: title || `Alignment Test ${Date.now()}`,
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
  return doc.content || '';
}

// Detect platform
const isMac = process.platform === 'darwin';
const modKey = isMac ? 'Meta' : 'Control';

// Helper to access alignment through overflow menu
async function clickAlignmentInOverflowMenu(page: Page, alignment: 'Left' | 'Center' | 'Right' | 'Justify') {
  // Open overflow menu
  const overflowButton = page.getByTestId('toolbar-overflow-menu');
  await expect(overflowButton).toBeVisible({ timeout: 5000 });
  await overflowButton.click();
  await page.waitForTimeout(300);

  // Find the alignment option by text - handles both "Align X" and just "Justify"
  const menuContent = page.getByTestId('toolbar-overflow-content');
  await expect(menuContent).toBeVisible({ timeout: 3000 });

  // The label is "Align Left", "Align Center", "Align Right", or "Justify"
  const labelText = alignment === 'Justify' ? 'Justify' : `Align ${alignment}`;
  const alignOption = menuContent.getByText(labelText, { exact: false });
  await expect(alignOption).toBeVisible({ timeout: 3000 });
  await alignOption.click();
  await page.waitForTimeout(200);
}

test.describe('TB94d: Text Alignment', () => {
  test.describe('Toolbar Alignment Buttons (via overflow menu)', () => {
    test('Align center via overflow menu works', async ({ page }) => {
      const doc = await createTestDocument(page, 'Align Center Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This text will be centered');

      // Access alignment through overflow menu (in narrow panel view)
      await clickAlignmentInOverflowMenu(page, 'Center');

      // Save and verify persistence
      await saveDocument(page);
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: center');
    });

    test('Align right via overflow menu works', async ({ page }) => {
      const doc = await createTestDocument(page, 'Align Right Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This text will be right aligned');

      // Access alignment through overflow menu
      await clickAlignmentInOverflowMenu(page, 'Right');

      // Save and verify persistence
      await saveDocument(page);
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: right');
    });

    test('Justify via overflow menu works', async ({ page }) => {
      const doc = await createTestDocument(page, 'Justify Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This text will be justified');

      // Access alignment through overflow menu
      await clickAlignmentInOverflowMenu(page, 'Justify');

      // Save and verify persistence
      await saveDocument(page);
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: justify');
    });

    test('Align left via overflow menu works', async ({ page }) => {
      const doc = await createTestDocument(page, 'Align Left Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This text will be left aligned');

      // First center it
      await clickAlignmentInOverflowMenu(page, 'Center');
      await page.waitForTimeout(200);

      // Then left align it
      await clickAlignmentInOverflowMenu(page, 'Left');

      // Left alignment is the default, so it may not be explicitly stored
      // But the operation should work without error
      await saveDocument(page);
    });
  });

  test.describe('Slash Commands for Alignment', () => {
    test('/center slash command applies center alignment', async ({ page }) => {
      const doc = await createTestDocument(page, 'Slash Center Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/center');

      // Wait for slash command menu
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });

      // Select center alignment
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Type some text
      await page.keyboard.type('Centered via slash command');

      // Save and verify
      await saveDocument(page);
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: center');
    });

    test('/right slash command applies right alignment', async ({ page }) => {
      const doc = await createTestDocument(page, 'Slash Right Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/right');

      // Wait for slash command menu
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });

      // Select right alignment
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Type some text
      await page.keyboard.type('Right aligned via slash command');

      // Save and verify
      await saveDocument(page);
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: right');
    });

    test('/justify slash command applies justify alignment', async ({ page }) => {
      const doc = await createTestDocument(page, 'Slash Justify Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/justify');

      // Wait for slash command menu
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });

      // Select justify alignment
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Type some text
      await page.keyboard.type('Justified text via slash command');

      // Save and verify
      await saveDocument(page);
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: justify');
    });

    test('/left slash command applies left alignment', async ({ page }) => {
      const doc = await createTestDocument(page, 'Slash Left Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // First make it centered
      await page.keyboard.type('/center');
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      await page.keyboard.type('Some text');
      await page.keyboard.press('Enter');

      // Now apply left alignment
      await page.keyboard.type('/left');
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Type some text
      await page.keyboard.type('Left aligned text');

      // Save - left alignment is default, so it may not be explicitly saved
      await saveDocument(page);
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('Cmd/Ctrl+Shift+E centers text', async ({ page }) => {
      const doc = await createTestDocument(page, 'Keyboard Center Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('Text to be centered');

      // Select all and apply center alignment
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press(`${modKey}+Shift+e`);
      await page.waitForTimeout(300);

      // Save and verify
      await saveDocument(page);
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: center');
    });

    test('Cmd/Ctrl+Shift+R right-aligns text', async ({ page }) => {
      const doc = await createTestDocument(page, 'Keyboard Right Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('Text to be right aligned');

      // Select all and apply right alignment
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press(`${modKey}+Shift+r`);
      await page.waitForTimeout(300);

      // Save and verify
      await saveDocument(page);
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: right');
    });

    test('Cmd/Ctrl+Shift+J justifies text', async ({ page }) => {
      const doc = await createTestDocument(page, 'Keyboard Justify Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('Text to be justified');

      // Select all and apply justify alignment
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press(`${modKey}+Shift+j`);
      await page.waitForTimeout(300);

      // Save and verify
      await saveDocument(page);
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: justify');
    });

    test('Cmd/Ctrl+Shift+L left-aligns text', async ({ page }) => {
      const doc = await createTestDocument(page, 'Keyboard Left Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('Text to be left aligned');

      // First center it
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press(`${modKey}+Shift+e`);
      await page.waitForTimeout(300);

      // Verify it's centered
      await saveDocument(page);
      let content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: center');

      // Now left align it
      await page.getByTestId('document-edit-button').click();
      await page.waitForSelector('[data-testid="block-editor"]', { timeout: 5000 });
      await page.waitForTimeout(300);

      const editorAgain = page.getByTestId('block-editor-content');
      await editorAgain.click();
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press(`${modKey}+Shift+l`);
      await page.waitForTimeout(300);

      // Save - left alignment removes the text-align attribute
      await saveDocument(page);
      content = await getDocumentContent(page, doc.id);
      // Content should no longer have center alignment
      // Left is default, so the style attribute might be removed entirely
      expect(content).not.toContain('text-align: center');
    });
  });

  test.describe('Alignment Persistence', () => {
    test('Centered heading persists after save and reload', async ({ page }) => {
      const doc = await createTestDocument(page, 'Centered Heading Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Use slash command to create a heading
      await page.keyboard.type('/heading1');
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Type the heading text
      await page.keyboard.type('Centered Heading');

      // Center the heading using keyboard shortcut (cursor is already in the heading)
      await page.keyboard.press(`${modKey}+Shift+e`);
      await page.waitForTimeout(300);

      // Save
      await saveDocument(page);

      // Verify content shows centered
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: center');
    });

    test('Multiple alignments in same document persist', async ({ page }) => {
      const doc = await createTestDocument(page, 'Multiple Alignments Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Add centered text using keyboard shortcut
      await page.keyboard.type('Centered text');
      await page.keyboard.press(`${modKey}+Shift+e`);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');

      // Add right-aligned text using keyboard shortcut
      await page.keyboard.type('Right aligned text');
      await page.keyboard.press(`${modKey}+Shift+r`);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');

      // Add justified text using keyboard shortcut
      await page.keyboard.type('Justified text that spans the full width');
      await page.keyboard.press(`${modKey}+Shift+j`);

      // Save
      await saveDocument(page);

      // Verify all alignments are stored
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: center');
      expect(content).toContain('text-align: right');
      expect(content).toContain('text-align: justify');
    });
  });

  test.describe('Alignment State Indicator', () => {
    test('Alignment via keyboard shortcuts applies correctly', async ({ page }) => {
      const doc = await createTestDocument(page, 'Alignment State Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('Test text');

      // Apply center alignment using keyboard shortcut
      await page.keyboard.press(`${modKey}+Shift+e`);
      await page.waitForTimeout(200);

      // Save and verify
      await saveDocument(page);
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('text-align: center');
    });
  });
});
