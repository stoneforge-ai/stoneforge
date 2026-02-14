import { test, expect } from '@playwright/test';

test.describe('TB55: Slash Commands', () => {
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
  // Basic Slash Command Menu Tests
  // ============================================================================

  test('typing "/" opens slash command menu', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    // Focus the editor and type /
    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/');

    // Slash command menu should appear
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
  });

  test('slash command menu shows categories', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Check for category sections
    await expect(page.getByTestId('slash-command-category-headings')).toBeVisible();
    await expect(page.getByTestId('slash-command-category-lists')).toBeVisible();
    await expect(page.getByTestId('slash-command-category-blocks')).toBeVisible();
  });

  test('slash command menu shows command items', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Check for specific command items
    await expect(page.getByTestId('slash-command-item-heading1')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-heading2')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-heading3')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-bullet')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-numbered')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-quote')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-code')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-divider')).toBeVisible();
  });

  // ============================================================================
  // Fuzzy Search Tests
  // ============================================================================

  test('typing after "/" filters commands', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/head');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Should show heading commands
    await expect(page.getByTestId('slash-command-item-heading1')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-heading2')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-heading3')).toBeVisible();

    // Should NOT show bullet list
    await expect(page.getByTestId('slash-command-item-bullet')).not.toBeVisible();
  });

  test('typing "/bul" shows only bullet list', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/bul');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Should show bullet list
    await expect(page.getByTestId('slash-command-item-bullet')).toBeVisible();

    // Should NOT show headings
    await expect(page.getByTestId('slash-command-item-heading1')).not.toBeVisible();
  });

  test('typing non-matching text shows "No matching commands"', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/xyznonexistent');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Should show no matching commands message
    const menuText = await page.getByTestId('slash-command-menu').textContent();
    expect(menuText).toContain('No matching commands');
  });

  // ============================================================================
  // Keyboard Navigation Tests
  // ============================================================================

  test('arrow down moves selection to next item', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // First item should be selected (has blue background)
    const firstItem = page.getByTestId('slash-command-item-heading1');
    await expect(firstItem).toHaveClass(/bg-blue-50/);

    // Press down arrow
    await page.keyboard.press('ArrowDown');

    // Second item should now be selected
    const secondItem = page.getByTestId('slash-command-item-heading2');
    await expect(secondItem).toHaveClass(/bg-blue-50/);
    await expect(firstItem).not.toHaveClass(/bg-blue-50/);
  });

  test('arrow up moves selection to previous item', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Move down first
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    // Third item should be selected
    const thirdItem = page.getByTestId('slash-command-item-heading3');
    await expect(thirdItem).toHaveClass(/bg-blue-50/);

    // Press up arrow
    await page.keyboard.press('ArrowUp');

    // Second item should now be selected
    const secondItem = page.getByTestId('slash-command-item-heading2');
    await expect(secondItem).toHaveClass(/bg-blue-50/);
  });

  test('pressing Escape closes menu', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Press escape
    await page.keyboard.press('Escape');

    // Menu should be hidden
    await expect(page.getByTestId('slash-command-menu')).not.toBeVisible();
  });

  // ============================================================================
  // Command Execution Tests
  // ============================================================================

  test('pressing Enter executes selected command', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Press Enter to select Heading 1 (first item)
    await page.keyboard.press('Enter');

    // Menu should close
    await expect(page.getByTestId('slash-command-menu')).not.toBeVisible();

    // Check that heading 1 was inserted (h1 element in content)
    const h1Element = page.locator('[data-testid="block-editor-content"] h1');
    await expect(h1Element).toBeVisible({ timeout: 2000 });
  });

  test('clicking command item executes command', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Navigate to Heading 2 with hover first (to ensure correct selection), then click
    const heading2Item = page.getByTestId('slash-command-item-heading2');
    await heading2Item.hover();
    await page.waitForTimeout(100); // Small delay to ensure hover state updates
    await heading2Item.click();

    // Menu should close
    await expect(page.getByTestId('slash-command-menu')).not.toBeVisible({ timeout: 3000 });

    // Check that heading 2 was inserted
    const h2Element = page.locator('[data-testid="block-editor-content"] h2');
    await expect(h2Element).toBeVisible({ timeout: 3000 });
  });

  test('/bullet inserts bullet list', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/bul');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Select bullet list
    await page.keyboard.press('Enter');

    // Check that ul was inserted
    const ulElement = page.locator('[data-testid="block-editor-content"] ul');
    await expect(ulElement).toBeVisible({ timeout: 2000 });
  });

  test('/numbered inserts ordered list', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/num');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Select numbered list
    await page.keyboard.press('Enter');

    // Check that ol was inserted
    const olElement = page.locator('[data-testid="block-editor-content"] ol');
    await expect(olElement).toBeVisible({ timeout: 2000 });
  });

  test('/quote inserts blockquote', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/quo');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Select quote
    await page.keyboard.press('Enter');

    // Check that blockquote was inserted
    const blockquoteElement = page.locator('[data-testid="block-editor-content"] blockquote');
    await expect(blockquoteElement).toBeVisible({ timeout: 2000 });
  });

  test('/code inserts code block', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/code');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Select code block
    await page.keyboard.press('Enter');

    // Check that pre/code was inserted
    const codeBlockElement = page.locator('[data-testid="block-editor-content"] pre');
    await expect(codeBlockElement).toBeVisible({ timeout: 2000 });
  });

  test('/divider inserts horizontal rule', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/div');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Select divider
    await page.keyboard.press('Enter');

    // Check that hr was inserted
    const hrElement = page.locator('[data-testid="block-editor-content"] hr');
    await expect(hrElement).toBeVisible({ timeout: 2000 });
  });

  // ============================================================================
  // Mouse Hover Selection Tests
  // ============================================================================

  test('hovering over item changes selection', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // First item is selected
    const firstItem = page.getByTestId('slash-command-item-heading1');
    await expect(firstItem).toHaveClass(/bg-blue-50/);

    // Hover over another item
    const quoteItem = page.getByTestId('slash-command-item-quote');
    await quoteItem.hover();

    // Quote item should now be selected
    await expect(quoteItem).toHaveClass(/bg-blue-50/);
    await expect(firstItem).not.toHaveClass(/bg-blue-50/);
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  test('slash command works after text', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('Some text ');
    await page.keyboard.type('/');

    // Menu should still appear
    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });
  });

  test('embeds category shows task and document options', async ({ page }) => {
    const docId = await enterDocumentEditMode(page);
    if (!docId) {
      test.skip();
      return;
    }

    await page.getByTestId('block-editor-content').click();
    await page.keyboard.type('/');

    await expect(page.getByTestId('slash-command-menu')).toBeVisible({ timeout: 3000 });

    // Check for embeds category
    await expect(page.getByTestId('slash-command-category-embeds')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-task')).toBeVisible();
    await expect(page.getByTestId('slash-command-item-doc')).toBeVisible();
  });
});
