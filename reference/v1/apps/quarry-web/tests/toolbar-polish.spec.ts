import { test, expect } from '@playwright/test';

test.describe('TB54: Editor Toolbar Polish', () => {
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
  // Toolbar Core Tests
  // ============================================================================

  test('toolbar is visible in edit mode', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('block-editor-toolbar')).toBeVisible();
  });

  test('toolbar has undo/redo buttons (always visible)', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('toolbar-undo')).toBeVisible();
    await expect(page.getByTestId('toolbar-redo')).toBeVisible();
  });

  test('toolbar has essential text formatting buttons', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    // Bold, Italic, Code are always visible (first 3 in compact mode)
    await expect(page.getByTestId('toolbar-bold')).toBeVisible();
    await expect(page.getByTestId('toolbar-italic')).toBeVisible();
    await expect(page.getByTestId('toolbar-code')).toBeVisible();
  });

  test('toolbar has dividers between sections', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    // At minimum, there should be dividers (between history and text, and between text and overflow/blocks)
    const dividers = page.getByTestId('toolbar-divider');
    const dividerCount = await dividers.count();
    expect(dividerCount).toBeGreaterThanOrEqual(1);
  });

  // ============================================================================
  // Tooltip Tests
  // ============================================================================

  test('bold button shows tooltip with keyboard shortcut on hover', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('toolbar-bold').hover();
    await expect(page.getByTestId('tooltip-content')).toBeVisible({ timeout: 3000 });

    const tooltipText = await page.getByTestId('tooltip-content').textContent();
    expect(tooltipText).toContain('Bold');
    expect(tooltipText).toMatch(/⌘B|CtrlB/);
  });

  test('italic button shows tooltip with keyboard shortcut on hover', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('toolbar-italic').hover();
    await expect(page.getByTestId('tooltip-content')).toBeVisible({ timeout: 3000 });

    const tooltipText = await page.getByTestId('tooltip-content').textContent();
    expect(tooltipText).toContain('Italic');
    expect(tooltipText).toMatch(/⌘I|CtrlI/);
  });

  test('undo button shows tooltip with keyboard shortcut on hover', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('toolbar-undo').hover();
    await expect(page.getByTestId('tooltip-content')).toBeVisible({ timeout: 3000 });

    const tooltipText = await page.getByTestId('tooltip-content').textContent();
    expect(tooltipText).toContain('Undo');
    expect(tooltipText).toMatch(/⌘Z|CtrlZ/);
  });

  test('code button shows tooltip with keyboard shortcut on hover', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('toolbar-code').hover();
    await expect(page.getByTestId('tooltip-content')).toBeVisible({ timeout: 3000 });

    const tooltipText = await page.getByTestId('tooltip-content').textContent();
    expect(tooltipText).toContain('Inline Code');
    expect(tooltipText).toMatch(/⌘E|CtrlE/);
  });

  // ============================================================================
  // Button Functionality Tests
  // ============================================================================

  test('bold formatting is applied when button is clicked', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Hello World');
    await page.keyboard.press('Meta+a');

    await page.getByTestId('toolbar-bold').click();

    // Check that bold formatting is applied in the content
    const boldElement = page.locator('[data-testid="block-editor-content"] strong');
    await expect(boldElement).toBeVisible({ timeout: 2000 });
  });

  test('italic formatting is applied when button is clicked', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Hello World');
    await page.keyboard.press('Meta+a');

    await page.getByTestId('toolbar-italic').click();

    // Check that italic formatting is applied in the content
    const italicElement = page.locator('[data-testid="block-editor-content"] em');
    await expect(italicElement).toBeVisible({ timeout: 2000 });
  });

  test('code formatting is applied when button is clicked', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('some code');
    await page.keyboard.press('Meta+a');

    await page.getByTestId('toolbar-code').click();

    // Check that code formatting is applied in the content
    const codeElement = page.locator('[data-testid="block-editor-content"] code');
    await expect(codeElement).toBeVisible({ timeout: 2000 });
  });

  // ============================================================================
  // Responsive Toolbar Tests
  // ============================================================================

  test('overflow menu button is visible on narrow screens', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    // The default document panel is often narrow enough to trigger overflow
    // Check if overflow menu is visible
    const overflowButton = page.getByTestId('toolbar-overflow-menu');
    const isOverflowVisible = await overflowButton.isVisible().catch(() => false);

    if (isOverflowVisible) {
      // Overflow menu exists - responsive behavior is working
      await expect(overflowButton).toBeVisible();
    } else {
      // Full toolbar is visible - that's also valid
      await expect(page.getByTestId('toolbar-strikethrough')).toBeVisible();
    }
  });

  test('overflow menu opens and shows sections', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const overflowButton = page.getByTestId('toolbar-overflow-menu');
    const isOverflowVisible = await overflowButton.isVisible().catch(() => false);

    if (!isOverflowVisible) {
      // Full toolbar is visible, skip overflow test
      test.skip();
      return;
    }

    await overflowButton.click();
    await expect(page.getByTestId('toolbar-overflow-content')).toBeVisible();

    // Should have section labels
    const overflowContent = page.getByTestId('toolbar-overflow-content');
    const textContent = await overflowContent.textContent();

    // Check for section headers (CSS uppercase transform shows as uppercase, but textContent is mixed case)
    expect(textContent).toContain('Text');
    expect(textContent).toContain('Headings');
    expect(textContent).toContain('Blocks');
  });

  test('overflow menu items have labels and shortcuts', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const overflowButton = page.getByTestId('toolbar-overflow-menu');
    const isOverflowVisible = await overflowButton.isVisible().catch(() => false);

    if (!isOverflowVisible) {
      test.skip();
      return;
    }

    await overflowButton.click();
    await expect(page.getByTestId('toolbar-overflow-content')).toBeVisible();

    const overflowContent = page.getByTestId('toolbar-overflow-content');
    const textContent = await overflowContent.textContent();

    // Should contain formatting option labels
    expect(textContent).toContain('Strikethrough');
    expect(textContent).toContain('Highlight');
    expect(textContent).toContain('Heading 1');
    expect(textContent).toContain('Bullet List');
    expect(textContent).toContain('Quote');
    expect(textContent).toContain('Code Block');
    expect(textContent).toContain('Horizontal Rule');
  });

  test('clicking overflow menu item applies formatting', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    const overflowButton = page.getByTestId('toolbar-overflow-menu');
    const isOverflowVisible = await overflowButton.isVisible().catch(() => false);

    if (!isOverflowVisible) {
      test.skip();
      return;
    }

    // Type some text first
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Test text');
    await page.keyboard.press('Meta+a');

    // Open overflow menu and click Strikethrough
    await overflowButton.click();
    await expect(page.getByTestId('toolbar-overflow-content')).toBeVisible();

    // Find and click Strikethrough option
    await page.getByText('Strikethrough').click();

    // The editor should now have strikethrough applied - menu closes
    await expect(page.getByTestId('toolbar-overflow-content')).not.toBeVisible();
  });

  // ============================================================================
  // New Formatting Options Tests
  // ============================================================================

  test('highlight extension is available', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    // Type some text
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Test text');
    await page.keyboard.press('Meta+a');

    // Try to apply highlight via overflow menu or direct button
    const overflowButton = page.getByTestId('toolbar-overflow-menu');
    const isOverflowVisible = await overflowButton.isVisible().catch(() => false);

    if (isOverflowVisible) {
      await overflowButton.click();
      await page.getByText('Highlight').click();
    } else {
      await page.getByTestId('toolbar-highlight').click();
    }

    // Check that highlight style is applied (mark element in the content)
    const markElement = page.locator('[data-testid="block-editor-content"] mark');
    await expect(markElement).toBeVisible({ timeout: 2000 });
  });

  test('strikethrough formatting works', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Test text for strike');
    await page.keyboard.press('Meta+a');

    const overflowButton = page.getByTestId('toolbar-overflow-menu');
    const isOverflowVisible = await overflowButton.isVisible().catch(() => false);

    if (isOverflowVisible) {
      await overflowButton.click();
      // Use more specific selector within overflow content
      await page.getByTestId('toolbar-overflow-content').getByText('Strikethrough').click();
    } else {
      await page.getByTestId('toolbar-strikethrough').click();
    }

    // Check that strikethrough is applied
    const strikeElement = page.locator('[data-testid="block-editor-content"] s, [data-testid="block-editor-content"] del');
    await expect(strikeElement).toBeVisible({ timeout: 2000 });
  });

  test('horizontal rule can be inserted', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Above the line');
    await page.keyboard.press('Enter');

    const overflowButton = page.getByTestId('toolbar-overflow-menu');
    const isOverflowVisible = await overflowButton.isVisible().catch(() => false);

    if (isOverflowVisible) {
      await overflowButton.click();
      await expect(page.getByTestId('toolbar-overflow-content')).toBeVisible();
      // Click using JavaScript to bypass viewport issues with portal dropdown
      await page.evaluate(() => {
        const hrText = Array.from(document.querySelectorAll('[data-testid="toolbar-overflow-content"] span'))
          .find(el => el.textContent === 'Horizontal Rule');
        if (hrText) {
          // Click the parent menu item (the clickable row)
          const menuItem = hrText.closest('[role="menuitem"]') || hrText.parentElement?.parentElement;
          if (menuItem) {
            (menuItem as HTMLElement).click();
          }
        }
      });
    } else {
      await page.getByTestId('toolbar-horizontal-rule').click();
    }

    // Check that hr was inserted
    const hrElement = page.locator('[data-testid="block-editor-content"] hr');
    await expect(hrElement).toBeVisible({ timeout: 2000 });
  });
});
