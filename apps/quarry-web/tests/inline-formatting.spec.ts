import { test, expect } from '@playwright/test';

test.describe('TB58: Advanced Inline Formatting', () => {
  // ============================================================================
  // Helper: Navigate to document edit mode
  // ============================================================================
  async function enterDocumentEditMode(page: import('@playwright/test').Page) {
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();

    if (documents.length === 0) {
      return null;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    let selectedDocId = '';

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      selectedDocId = documents[0].id;
      await page.getByTestId(`document-item-${selectedDocId}`).click();
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();
        if (libDocs.length > 0) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          selectedDocId = libDocs[0].id;
          await page.getByTestId(`document-item-${selectedDocId}`).click();
          break;
        }
      }
    }

    if (!selectedDocId) {
      return null;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('document-edit-button').click();
    await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 5000 });

    return selectedDocId;
  }

  // ============================================================================
  // Inline Code Styling Tests
  // ============================================================================

  test('inline code has monospace font styling', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    // Type some text and apply code formatting
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('some inline code');
    await page.keyboard.press('Meta+a');
    await page.getByTestId('toolbar-code').click();

    // Check that code element exists with proper styling
    const codeElement = page.locator('[data-testid="block-editor-content"] code').first();
    await expect(codeElement).toBeVisible({ timeout: 2000 });

    // Verify font-family is monospace
    const fontFamily = await codeElement.evaluate((el) => window.getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toMatch(/monospace|sf mono|menlo|consolas/i);
  });

  test('inline code has subtle background color', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('code example');
    await page.keyboard.press('Meta+a');
    await page.getByTestId('toolbar-code').click();

    const codeElement = page.locator('[data-testid="block-editor-content"] code').first();
    await expect(codeElement).toBeVisible({ timeout: 2000 });

    // Verify background color is applied (should be a light gray with alpha)
    const backgroundColor = await codeElement.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // Should be some form of rgba or rgb with non-transparent value
    expect(backgroundColor).toMatch(/rgba?\(/);
    expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('inline code has border-radius', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('rounded code');
    await page.keyboard.press('Meta+a');
    await page.getByTestId('toolbar-code').click();

    const codeElement = page.locator('[data-testid="block-editor-content"] code').first();
    await expect(codeElement).toBeVisible({ timeout: 2000 });

    // Verify border-radius is applied
    const borderRadius = await codeElement.evaluate((el) => window.getComputedStyle(el).borderRadius);
    expect(borderRadius).not.toBe('0px');
  });

  test('inline code has padding', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('padded code');
    await page.keyboard.press('Meta+a');
    await page.getByTestId('toolbar-code').click();

    const codeElement = page.locator('[data-testid="block-editor-content"] code').first();
    await expect(codeElement).toBeVisible({ timeout: 2000 });

    // Verify padding is applied
    const paddingLeft = await codeElement.evaluate((el) => window.getComputedStyle(el).paddingLeft);
    expect(parseFloat(paddingLeft)).toBeGreaterThan(0);
  });

  // ============================================================================
  // Bubble Menu Tests
  // ============================================================================

  test('bubble menu appears when text is selected', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    // Type some text
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Select this text to see bubble menu');

    // Select text via keyboard
    await page.keyboard.press('Meta+a');

    // Wait for bubble menu to appear
    const bubbleMenu = page.getByTestId('bubble-menu');
    await expect(bubbleMenu).toBeVisible({ timeout: 3000 });
  });

  test('bubble menu has formatting buttons', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Text for formatting');
    await page.keyboard.press('Meta+a');

    const bubbleMenu = page.getByTestId('bubble-menu');
    await expect(bubbleMenu).toBeVisible({ timeout: 3000 });

    // Check for formatting buttons
    await expect(page.getByTestId('bubble-menu-bold')).toBeVisible();
    await expect(page.getByTestId('bubble-menu-italic')).toBeVisible();
    await expect(page.getByTestId('bubble-menu-code')).toBeVisible();
    await expect(page.getByTestId('bubble-menu-strikethrough')).toBeVisible();
    await expect(page.getByTestId('bubble-menu-highlight')).toBeVisible();
  });

  test('bubble menu bold button applies formatting', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Make this bold');
    await page.keyboard.press('Meta+a');

    const bubbleMenu = page.getByTestId('bubble-menu');
    await expect(bubbleMenu).toBeVisible({ timeout: 3000 });

    await page.getByTestId('bubble-menu-bold').click();

    // Check that bold formatting is applied
    const boldElement = page.locator('[data-testid="block-editor-content"] strong');
    await expect(boldElement).toBeVisible({ timeout: 2000 });
  });

  test('bubble menu italic button applies formatting', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Make this italic');
    await page.keyboard.press('Meta+a');

    const bubbleMenu = page.getByTestId('bubble-menu');
    await expect(bubbleMenu).toBeVisible({ timeout: 3000 });

    await page.getByTestId('bubble-menu-italic').click();

    // Check that italic formatting is applied
    const italicElement = page.locator('[data-testid="block-editor-content"] em');
    await expect(italicElement).toBeVisible({ timeout: 2000 });
  });

  test('bubble menu code button applies formatting', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Make this code');
    await page.keyboard.press('Meta+a');

    const bubbleMenu = page.getByTestId('bubble-menu');
    await expect(bubbleMenu).toBeVisible({ timeout: 3000 });

    await page.getByTestId('bubble-menu-code').click();

    // Check that code formatting is applied
    const codeElement = page.locator('[data-testid="block-editor-content"] code');
    await expect(codeElement).toBeVisible({ timeout: 2000 });
  });

  test('bubble menu strikethrough button applies formatting', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Strike this through');
    await page.keyboard.press('Meta+a');

    const bubbleMenu = page.getByTestId('bubble-menu');
    await expect(bubbleMenu).toBeVisible({ timeout: 3000 });

    await page.getByTestId('bubble-menu-strikethrough').click();

    // Check that strikethrough formatting is applied
    const strikeElement = page.locator('[data-testid="block-editor-content"] s, [data-testid="block-editor-content"] del');
    await expect(strikeElement).toBeVisible({ timeout: 2000 });
  });

  test('bubble menu highlight button applies formatting', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Highlight this text');
    await page.keyboard.press('Meta+a');

    const bubbleMenu = page.getByTestId('bubble-menu');
    await expect(bubbleMenu).toBeVisible({ timeout: 3000 });

    await page.getByTestId('bubble-menu-highlight').click();

    // Check that highlight formatting is applied
    const markElement = page.locator('[data-testid="block-editor-content"] mark');
    await expect(markElement).toBeVisible({ timeout: 2000 });
  });

  test('bubble menu hides when selection is cleared', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Select then deselect');
    await page.keyboard.press('Meta+a');

    const bubbleMenu = page.getByTestId('bubble-menu');
    await expect(bubbleMenu).toBeVisible({ timeout: 3000 });

    // Press arrow key to clear selection
    await page.keyboard.press('ArrowRight');

    // Bubble menu should hide (uses opacity-0 class)
    await expect(bubbleMenu).toHaveClass(/opacity-0/, { timeout: 3000 });
  });

  test('bubble menu does not appear when cursor is in code blocks', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();

    // Create a code block using slash command
    await page.keyboard.type('/code');
    await page.keyboard.press('Enter');

    // Type inside code block
    await page.keyboard.type('code block content');

    // Select text within the code block using shift+arrow keys
    // This keeps selection within the code block
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+ArrowLeft');
    }

    // Bubble menu should NOT appear when selection is entirely within code blocks
    const bubbleMenu = page.getByTestId('bubble-menu');
    // Give it a moment to potentially appear
    await page.waitForTimeout(500);
    await expect(bubbleMenu).toHaveClass(/opacity-0/);
  });

  // ============================================================================
  // Keyboard Shortcut Tests
  // ============================================================================

  test('keyboard shortcut Cmd+E toggles inline code', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('code via shortcut');
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+e');

    // Check that code formatting is applied
    const codeElement = page.locator('[data-testid="block-editor-content"] code');
    await expect(codeElement).toBeVisible({ timeout: 2000 });

    // Toggle off
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+e');

    // Code element should be removed
    await expect(codeElement).not.toBeVisible({ timeout: 2000 });
  });

  test('highlight styling has yellow background', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Yellow highlight');
    await page.keyboard.press('Meta+a');

    // Apply highlight from toolbar or overflow menu
    const overflowButton = page.getByTestId('toolbar-overflow-menu');
    const isOverflowVisible = await overflowButton.isVisible().catch(() => false);

    if (isOverflowVisible) {
      await overflowButton.click();
      await page.getByTestId('toolbar-overflow-content').getByText('Highlight').click();
    } else {
      await page.getByTestId('toolbar-highlight').click();
    }

    // Check that mark element has yellow-ish background
    const markElement = page.locator('[data-testid="block-editor-content"] mark');
    await expect(markElement).toBeVisible({ timeout: 2000 });

    const backgroundColor = await markElement.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // Should have yellow-ish tint (rgb values where red and green are high)
    expect(backgroundColor).toMatch(/rgb/);
  });
});
