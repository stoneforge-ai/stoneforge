import { test, expect, Page } from '@playwright/test';

/**
 * TB94c: Markdown-First Editor Architecture Tests
 *
 * These tests verify that:
 * 1. Content is stored as Markdown in the database (not HTML)
 * 2. Markdown → HTML conversion works for rendering
 * 3. HTML → Markdown conversion works for saving
 * 4. Round-trip fidelity is maintained
 * 5. Legacy HTML content is still supported
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
      title: title || `Markdown Test ${Date.now()}`,
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

test.describe('TB94c: Markdown-First Editor Architecture', () => {
  test.describe('Markdown Storage Format', () => {
    test('Content is stored as Markdown, not HTML', async ({ page }) => {
      const doc = await createTestDocument(page, 'Markdown Storage Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Type a heading
      await page.keyboard.type('My Heading');
      await page.waitForTimeout(200);
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Alt+Meta+1');
      await page.waitForTimeout(200);

      // Add a paragraph
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('This is a paragraph.');
      await page.waitForTimeout(200);

      // Save
      await saveDocument(page);

      // Fetch raw content from API
      const content = await getDocumentContent(page, doc.id);

      // Verify content is Markdown, not HTML
      expect(content).not.toContain('<h1>');
      expect(content).not.toContain('<p>');
      expect(content).toContain('# My Heading');
      expect(content).toContain('This is a paragraph.');
    });

    test('Bold text is stored as Markdown **bold**', async ({ page }) => {
      const doc = await createTestDocument(page, 'Bold Storage Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This is bold text');
      await page.waitForTimeout(200);

      // Select all and make bold
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Meta+b');
      await page.waitForTimeout(200);

      // Save
      await saveDocument(page);

      // Verify Markdown format
      const content = await getDocumentContent(page, doc.id);
      expect(content).not.toContain('<strong>');
      expect(content).toContain('**This is bold text**');
    });

    test('Italic text is stored as Markdown _italic_', async ({ page }) => {
      const doc = await createTestDocument(page, 'Italic Storage Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This is italic text');
      await page.waitForTimeout(200);

      // Select all and make italic
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Meta+i');
      await page.waitForTimeout(200);

      // Save
      await saveDocument(page);

      // Verify Markdown format
      const content = await getDocumentContent(page, doc.id);
      expect(content).not.toContain('<em>');
      expect(content).toContain('_This is italic text_');
    });

    test('Bullet list is stored as Markdown list', async ({ page }) => {
      const doc = await createTestDocument(page, 'List Storage Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Create bullet list via slash command
      await page.keyboard.type('/bullet');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      await page.keyboard.type('Item 1');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Item 2');
      await page.waitForTimeout(200);

      // Save
      await saveDocument(page);

      // Verify Markdown format (turndown uses `-   ` with extra spaces)
      const content = await getDocumentContent(page, doc.id);
      expect(content).not.toContain('<ul>');
      expect(content).not.toContain('<li>');
      expect(content).toMatch(/-\s+Item 1/);
      expect(content).toMatch(/-\s+Item 2/);
    });

    test('Code block is stored as Markdown fenced code block', async ({ page }) => {
      const doc = await createTestDocument(page, 'Code Block Storage Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();

      // Create code block via slash command
      await page.keyboard.type('/code');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      await page.keyboard.type('const x = 1;');
      await page.waitForTimeout(200);

      // Save
      await saveDocument(page);

      // Verify Markdown format
      const content = await getDocumentContent(page, doc.id);
      expect(content).not.toContain('<pre>');
      expect(content).toContain('```');
      expect(content).toContain('const x = 1;');
    });
  });

  test.describe('Markdown Rendering', () => {
    test('Markdown content is rendered as HTML in view mode', async ({ page }) => {
      // Create document with Markdown content directly
      const library = await getOrCreateLibrary(page);
      const markdownContent = `# My Title

This is a paragraph with **bold** and _italic_ text.

- List item 1
- List item 2

\`\`\`javascript
const x = 1;
\`\`\`
`;
      const response = await page.request.post('/api/documents', {
        data: {
          title: 'Markdown Render Test',
          content: markdownContent,
          contentType: 'markdown',
          createdBy: 'test-user',
          libraryId: library.id,
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      // Navigate to view the document
      await page.goto(`/documents?library=${library.id}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Verify HTML rendering
      const content = page.getByTestId('document-content-markdown');
      await expect(content).toBeVisible({ timeout: 5000 });
      await expect(content.locator('h1')).toHaveText('My Title');
      await expect(content.locator('strong')).toHaveText('bold');
      await expect(content.locator('em')).toHaveText('italic');
      await expect(content.locator('ul li')).toHaveCount(2);
      await expect(content.locator('pre code')).toContainText('const x = 1');
    });
  });

  test.describe('Markdown Round-Trip Fidelity', () => {
    test('Markdown → Editor → Save preserves formatting structure', async ({ page }) => {
      // Create document with specific Markdown content
      const library = await getOrCreateLibrary(page);
      const originalMarkdown = `# Heading 1

## Heading 2

This is a paragraph.

- Bullet 1
- Bullet 2

1. Numbered 1
2. Numbered 2

> A blockquote

\`\`\`
code block
\`\`\``;

      const response = await page.request.post('/api/documents', {
        data: {
          title: 'Round Trip Test',
          content: originalMarkdown,
          contentType: 'markdown',
          createdBy: 'test-user',
          libraryId: library.id,
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      // Navigate to edit mode
      await page.goto(`/documents?library=${library.id}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });
      await page.waitForTimeout(500);

      // Enter edit mode
      await page.getByTestId('document-edit-button').click();
      await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10000 });
      await page.waitForTimeout(500);

      // Verify editor loaded the content correctly
      const editor = page.getByTestId('block-editor-content');
      await expect(editor.locator('h1')).toHaveText('Heading 1');
      await expect(editor.locator('h2')).toHaveText('Heading 2');
      await expect(editor.locator('ul li')).toHaveCount(2);
      await expect(editor.locator('ol li')).toHaveCount(2);
      await expect(editor.locator('blockquote')).toContainText('A blockquote');
      await expect(editor.locator('pre')).toContainText('code block');

      // Make a small edit
      await editor.click();
      await page.keyboard.press('End');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Added text');
      await page.waitForTimeout(200);

      // Save
      await saveDocument(page);

      // Verify Markdown is still Markdown (not HTML)
      // Note: turndown uses `-   ` (3 spaces) and `1.  ` (2 spaces) for lists
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('# Heading 1');
      expect(content).toContain('## Heading 2');
      expect(content).toMatch(/-\s+Bullet 1/);
      expect(content).toMatch(/\d+\.\s+Numbered 1/);
      expect(content).toMatch(/>\s*A blockquote/);
      expect(content).toContain('```');
      expect(content).toContain('Added text');
    });
  });

  test.describe('Legacy HTML Compatibility', () => {
    test('Legacy HTML content loads and displays correctly', async ({ page }) => {
      // Create document with legacy HTML content
      const library = await getOrCreateLibrary(page);
      const htmlContent = '<h1>HTML Heading</h1><p>A <strong>bold</strong> paragraph.</p>';

      const response = await page.request.post('/api/documents', {
        data: {
          title: 'Legacy HTML Test',
          content: htmlContent,
          contentType: 'text',
          createdBy: 'test-user',
          libraryId: library.id,
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      // Navigate to view
      await page.goto(`/documents?library=${library.id}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Verify HTML content is rendered correctly (backwards compatibility)
      const content = page.getByTestId('document-content-html');
      await expect(content).toBeVisible({ timeout: 5000 });
      await expect(content.locator('h1')).toHaveText('HTML Heading');
      await expect(content.locator('strong')).toHaveText('bold');
    });

    test('Legacy HTML content is editable and saves as Markdown', async ({ page }) => {
      // Create document with legacy HTML content
      const library = await getOrCreateLibrary(page);
      const htmlContent = '<h1>Legacy HTML</h1><p>Some text</p>';

      const response = await page.request.post('/api/documents', {
        data: {
          title: 'Legacy Edit Test',
          content: htmlContent,
          contentType: 'text',
          createdBy: 'test-user',
          libraryId: library.id,
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      // Navigate to edit mode
      await page.goto(`/documents?library=${library.id}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });
      await page.waitForTimeout(500);

      // Enter edit mode
      await page.getByTestId('document-edit-button').click();
      await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10000 });
      await page.waitForTimeout(500);

      // Verify editor loaded the HTML content
      const editor = page.getByTestId('block-editor-content');
      await expect(editor.locator('h1')).toHaveText('Legacy HTML');

      // Make an edit
      await editor.click();
      await page.keyboard.press('End');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('New paragraph');
      await page.waitForTimeout(200);

      // Save
      await saveDocument(page);

      // After saving, content should now be Markdown
      const content = await getDocumentContent(page, doc.id);
      // It should now be Markdown format, not HTML
      expect(content).not.toContain('<h1>');
      expect(content).toContain('# Legacy HTML');
      expect(content).toContain('New paragraph');
    });
  });

  test.describe('Highlight Formatting', () => {
    test('Highlight is stored as ==text== in Markdown', async ({ page }) => {
      const doc = await createTestDocument(page, 'Highlight Storage Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('This is highlighted');
      await page.waitForTimeout(200);

      // Select all and apply highlight
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Meta+Shift+h');
      await page.waitForTimeout(200);

      // Save
      await saveDocument(page);

      // Verify Markdown format
      const content = await getDocumentContent(page, doc.id);
      expect(content).not.toContain('<mark>');
      expect(content).toContain('==This is highlighted==');
    });

    test('Highlight ==text== in Markdown renders correctly', async ({ page }) => {
      // Create document with highlight syntax
      const library = await getOrCreateLibrary(page);
      const markdownContent = 'This has ==highlighted== text.';

      const response = await page.request.post('/api/documents', {
        data: {
          title: 'Highlight Render Test',
          content: markdownContent,
          contentType: 'markdown',
          createdBy: 'test-user',
          libraryId: library.id,
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      // Navigate to view
      await page.goto(`/documents?library=${library.id}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 10000 });

      // Verify highlight is rendered
      const content = page.getByTestId('document-content-markdown');
      await expect(content).toBeVisible({ timeout: 5000 });
      await expect(content.locator('mark')).toHaveText('highlighted');
    });
  });
});
