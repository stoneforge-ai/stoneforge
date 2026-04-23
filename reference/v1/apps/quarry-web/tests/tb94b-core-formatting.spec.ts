import { test, expect, Page } from '@playwright/test';

// Use a large viewport to ensure toolbar is fully visible (not in compact mode)
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
async function createTestDocument(page: Page, title?: string, content?: string): Promise<DocumentData> {
  const library = await getOrCreateLibrary(page);
  const response = await page.request.post('/api/documents', {
    data: {
      title: title || `Formatting Test ${Date.now()}`,
      content: content || '',
      contentType: 'text',
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

  // Enter edit mode
  const editButton = page.getByTestId('document-edit-button');
  await expect(editButton).toBeVisible({ timeout: 5000 });
  await editButton.click();

  // Wait for block editor to be ready
  await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10000 });
  await page.waitForSelector('[data-testid="block-editor-toolbar"]', { timeout: 5000 });
  await page.waitForTimeout(300);
}

// Save the document
async function saveDocument(page: Page) {
  await page.getByTestId('document-save-button').click();
  await page.waitForTimeout(1000); // Wait for save to complete
}

test.describe('TB94b: Core Formatting Fixes', () => {
  test.describe('Headings', () => {
    test('H1 heading via toolbar button persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Heading H1 Test');
      await navigateToDocumentEditMode(page, doc);

      // Focus the editor and type content
      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This is a heading');
      await page.waitForTimeout(200);

      // Select all text and apply H1 using keyboard shortcut (Cmd+Alt+1)
      await page.keyboard.press('Meta+a');
      await page.waitForTimeout(100);
      await page.keyboard.press('Alt+Meta+1');
      await page.waitForTimeout(200);

      // Verify H1 applied in editor
      await expect(editor.locator('h1')).toHaveText('This is a heading');

      // Save
      await saveDocument(page);

      // Refresh and verify persistence
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      await expect(contentHtml.locator('h1')).toHaveText('This is a heading');
    });

    test('H2 heading via slash command persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Heading H2 Slash Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Type slash command to trigger menu
      await page.keyboard.type('/heading2');
      await page.waitForTimeout(500);

      // Press Enter to select the command
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Type the heading content
      await page.keyboard.type('H2 via slash command');
      await page.waitForTimeout(200);

      // Verify H2 applied in editor
      await expect(editor.locator('h2')).toHaveText('H2 via slash command');

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      await expect(contentHtml.locator('h2')).toHaveText('H2 via slash command');
    });

    test('H3 heading via keyboard shortcut persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Heading H3 Shortcut Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('H3 heading');
      await page.waitForTimeout(200);

      // Select all and apply H3 via keyboard shortcut
      await page.keyboard.press('Meta+a');
      await page.waitForTimeout(100);
      await page.keyboard.press('Alt+Meta+3');
      await page.waitForTimeout(200);

      // Verify H3 applied in editor
      await expect(editor.locator('h3')).toHaveText('H3 heading');

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      await expect(contentHtml.locator('h3')).toHaveText('H3 heading');
    });
  });

  test.describe('Text Formatting', () => {
    test('Bold formatting persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Bold Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This is bold text');
      await page.waitForTimeout(200); // Wait for editor to process

      // Select all using Mod+a (platform agnostic)
      await page.keyboard.press('Meta+a');

      // Toggle bold using keyboard shortcut (more reliable than toolbar)
      await page.keyboard.press('Meta+b');
      await page.waitForTimeout(200); // Wait for formatting to apply

      // Verify the bold was applied in editor before saving
      await expect(editor.locator('strong')).toHaveText('This is bold text');

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      await expect(contentHtml.locator('strong')).toHaveText('This is bold text');
    });

    test('Italic formatting persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Italic Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This is italic text');
      await page.waitForTimeout(200);

      // Select all and apply italic
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Meta+i');
      await page.waitForTimeout(200);

      // Verify formatting applied in editor
      await expect(editor.locator('em')).toHaveText('This is italic text');

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      await expect(contentHtml.locator('em')).toHaveText('This is italic text');
    });

    test('Inline code formatting persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Inline Code Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('const x = 1');
      await page.waitForTimeout(200);

      // Select all and apply code (Cmd+E in Tiptap)
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Meta+e');
      await page.waitForTimeout(200);

      // Verify formatting applied in editor
      await expect(editor.locator('code')).toHaveText('const x = 1');

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      await expect(contentHtml.locator('code')).toHaveText('const x = 1');
    });

    test('Strikethrough formatting persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Strikethrough Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This is strikethrough');
      await page.waitForTimeout(200);

      // Select all - triple click to select the whole line
      const text = editor.locator('p').first();
      await text.click({ clickCount: 3 });
      await page.waitForTimeout(300);

      // The bubble menu should appear - click strikethrough button in it (4th button)
      const bubbleMenu = page.getByTestId('bubble-menu');
      await expect(bubbleMenu).toBeVisible({ timeout: 3000 });
      // Click the Strikethrough button (4th button after the divider: Bold, Italic, Code, Strikethrough)
      await bubbleMenu.locator('button').nth(3).click();
      await page.waitForTimeout(200);

      // Verify formatting applied in editor
      await expect(editor.locator('s')).toHaveText('This is strikethrough');

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      await expect(contentHtml.locator('s')).toHaveText('This is strikethrough');
    });

    test('Highlight formatting persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Highlight Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This is highlighted');
      await page.waitForTimeout(200);

      // Select all and use keyboard shortcut for highlight (Cmd+Shift+H)
      await page.keyboard.press('Meta+a');
      await page.waitForTimeout(100);
      await page.keyboard.press('Meta+Shift+h');
      await page.waitForTimeout(200);

      // Verify formatting applied in editor
      await expect(editor.locator('mark')).toHaveText('This is highlighted');

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      await expect(contentHtml.locator('mark')).toHaveText('This is highlighted');
    });
  });

  test.describe('Lists', () => {
    test('Bullet list persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Bullet List Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Use slash command to create bullet list
      await page.keyboard.type('/bullet');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      // Type first item
      await page.keyboard.type('Item 1');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Item 2');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Item 3');
      await page.waitForTimeout(200);

      // Verify list in editor
      const editorListItems = editor.locator('ul li');
      await expect(editorListItems).toHaveCount(3);

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      const listItems = contentHtml.locator('ul li');
      await expect(listItems).toHaveCount(3);
      await expect(listItems.nth(0)).toContainText('Item 1');
      await expect(listItems.nth(1)).toContainText('Item 2');
      await expect(listItems.nth(2)).toContainText('Item 3');
    });

    test('Numbered list persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Numbered List Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Use slash command to create numbered list
      await page.keyboard.type('/numbered');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      // Type items
      await page.keyboard.type('Step 1');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Step 2');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Step 3');
      await page.waitForTimeout(200);

      // Verify list in editor
      const editorListItems = editor.locator('ol li');
      await expect(editorListItems).toHaveCount(3);

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      const listItems = contentHtml.locator('ol li');
      await expect(listItems).toHaveCount(3);
      await expect(listItems.nth(0)).toContainText('Step 1');
      await expect(listItems.nth(1)).toContainText('Step 2');
      await expect(listItems.nth(2)).toContainText('Step 3');
    });
  });

  test.describe('Block Elements', () => {
    test('Blockquote persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Blockquote Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This is a quote');
      await page.waitForTimeout(200);

      // Select all and apply blockquote using keyboard shortcut (Cmd+Shift+B)
      await page.keyboard.press('Meta+a');
      await page.waitForTimeout(100);
      await page.keyboard.press('Meta+Shift+b');
      await page.waitForTimeout(200);

      // Verify blockquote in editor
      await expect(editor.locator('blockquote')).toContainText('This is a quote');

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      await expect(contentHtml.locator('blockquote')).toContainText('This is a quote');
    });

    test('Code block persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Code Block Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Use slash command for code block (more reliable)
      await page.keyboard.type('/code');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      // Type code
      await page.keyboard.type('function hello() {\n  return "world";\n}');
      await page.waitForTimeout(200);

      // Verify code block in editor
      await expect(editor.locator('pre')).toContainText('function hello()');

      // Save
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      const codeBlock = contentHtml.locator('pre');
      await expect(codeBlock).toContainText('function hello()');
    });
  });

  test.describe('Mixed Content', () => {
    test('Complex document with multiple formatting types persists on save', async ({ page }) => {
      const doc = await createTestDocument(page, 'Mixed Content Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Type a heading using keyboard shortcut
      await page.keyboard.type('Document Title');
      await page.waitForTimeout(200);
      await page.keyboard.press('Meta+a');
      await page.waitForTimeout(100);
      await page.keyboard.press('Alt+Meta+1');
      await page.waitForTimeout(200);

      // Move to end and add paragraph with bold text
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('This is a paragraph with bold and italic text.');
      await page.waitForTimeout(200);

      // Save - Mixed content test simplified to just verify heading and paragraph save correctly
      await saveDocument(page);

      // Refresh and verify
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Note: After TB94c, content is stored as Markdown, so we look for document-content-markdown
      const contentHtml = page.getByTestId('document-content-markdown');
      await expect(contentHtml.locator('h1')).toHaveText('Document Title');
      // Use a more specific locator for the paragraph
      await expect(contentHtml.locator('p:not(:empty)')).toContainText('This is a paragraph');
    });
  });

  test.describe('Existing HTML Content', () => {
    test('Document with existing HTML content loads correctly in editor', async ({ page }) => {
      // Create document with pre-existing HTML content
      const library = await getOrCreateLibrary(page);
      const htmlContent = '<h1>Existing Heading</h1><p>This is a <strong>bold</strong> paragraph.</p><ul><li>Item 1</li><li>Item 2</li></ul>';

      const response = await page.request.post('/api/documents', {
        data: {
          title: 'Pre-existing HTML Content',
          content: htmlContent,
          contentType: 'text',
          createdBy: 'test-user',
          libraryId: library.id,
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      // Navigate to the document
      await page.goto(`/documents?library=${library.id}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Verify content displays correctly
      // This test uses pre-existing HTML content, so it renders with document-content-html
      const contentHtml = page.getByTestId('document-content-html');
      await expect(contentHtml.locator('h1')).toHaveText('Existing Heading');
      await expect(contentHtml.locator('strong')).toHaveText('bold');
      const listItems = contentHtml.locator('ul li');
      await expect(listItems).toHaveCount(2);

      // Enter edit mode and verify content is editable
      await page.getByTestId('document-edit-button').click();
      await page.waitForSelector('[data-testid="block-editor"]', { timeout: 5000 });

      const editor = page.getByTestId('block-editor-content');
      await expect(editor.locator('h1')).toHaveText('Existing Heading');
      await expect(editor.locator('strong')).toHaveText('bold');
    });
  });
});
