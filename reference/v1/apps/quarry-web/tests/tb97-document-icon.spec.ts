import { test, expect, Page } from '@playwright/test';

/**
 * TB97: Document Icon/Emoji in Library Tree Tests
 *
 * These tests verify that:
 * 1. Documents can have an emoji icon stored in metadata
 * 2. The document icon appears in the library tree / document list
 * 3. Users can set/change document icons via the document detail panel
 * 4. Users can remove document icons
 * 5. Document icons persist across page reloads
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
      title: title || `Doc Icon Test ${Date.now()}`,
      content: content || 'Test content',
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

// Navigate to a document
async function navigateToDocument(page: Page, doc: DocumentData) {
  await page.goto(`/documents?library=${doc.libraryId}&selected=${doc.id}`);
  await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 15000 });
  await page.waitForTimeout(500);
}

// Fetch document data directly from API
async function getDocument(page: Page, docId: string): Promise<Record<string, unknown>> {
  const response = await page.request.get(`/api/documents/${docId}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test.describe('TB97: Document Icon/Emoji', () => {
  test.describe('Document Icon Button', () => {
    test('should show document icon button in document detail panel', async ({ page }) => {
      const doc = await createTestDocument(page, 'Icon Button Test');
      await navigateToDocument(page, doc);

      // Should see the icon button
      const iconButton = page.getByTestId('document-icon-button');
      await expect(iconButton).toBeVisible();
    });

    test('should show Smile icon when no document icon is set', async ({ page }) => {
      const doc = await createTestDocument(page, 'No Icon Test');
      await navigateToDocument(page, doc);

      // The icon button should be visible
      const iconButton = page.getByTestId('document-icon-button');
      await expect(iconButton).toBeVisible();

      // Should NOT have a document-detail-icon (since no icon is set)
      await expect(page.getByTestId('document-detail-icon')).not.toBeVisible();
    });

    test('should open emoji picker when clicking icon button', async ({ page }) => {
      const doc = await createTestDocument(page, 'Emoji Picker Open Test');
      await navigateToDocument(page, doc);

      // Click the icon button
      const iconButton = page.getByTestId('document-icon-button');
      await iconButton.click();

      // Emoji picker modal should open
      await expect(page.getByTestId('emoji-picker-modal')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Setting Document Icon', () => {
    test('should set document icon when selecting an emoji', async ({ page }) => {
      const doc = await createTestDocument(page, 'Set Icon Test');
      await navigateToDocument(page, doc);

      // Open emoji picker
      await page.getByTestId('document-icon-button').click();
      await expect(page.getByTestId('emoji-picker-modal')).toBeVisible({ timeout: 5000 });

      // Wait for emoji picker to load
      await page.waitForTimeout(1000);

      // Click on any emoji button in the picker (use data-unified attribute from emoji-picker-react)
      const emojiButton = page.locator('button.epr-emoji').first();
      await emojiButton.click({ timeout: 5000 });
      await page.waitForTimeout(500);

      // Modal should close
      await expect(page.getByTestId('emoji-picker-modal')).not.toBeVisible();

      // Document icon should now be visible
      const docIcon = page.getByTestId('document-detail-icon');
      await expect(docIcon).toBeVisible();
    });

    test('should persist document icon after setting', async ({ page }) => {
      const doc = await createTestDocument(page, 'Icon Persist Test');
      await navigateToDocument(page, doc);

      // Open emoji picker and select emoji
      await page.getByTestId('document-icon-button').click();
      await expect(page.getByTestId('emoji-picker-modal')).toBeVisible({ timeout: 5000 });

      // Wait for emoji picker to fully load
      await page.waitForTimeout(1000);

      // Click first available emoji
      const emojiButton = page.locator('button.epr-emoji').first();
      await emojiButton.click({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // Check API to confirm metadata.icon was set
      const docData = await getDocument(page, doc.id);
      expect(docData.metadata).toBeDefined();
      expect((docData.metadata as Record<string, unknown>).icon).toBeDefined();
    });

    test('should display document icon in document list', async ({ page }) => {
      // Create document with icon already set via API to skip flaky emoji picker interaction
      const library = await getOrCreateLibrary(page);
      const response = await page.request.post('/api/documents', {
        data: {
          title: `Icon List Display Test ${Date.now()}`,
          content: 'Test content',
          contentType: 'markdown',
          createdBy: 'test-user',
          libraryId: library.id,
          metadata: { icon: '🔥' },
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      // Verify the document was created with the correct metadata
      const verifyResponse = await page.request.get(`/api/documents/${doc.id}`);
      expect(verifyResponse.ok()).toBe(true);
      const verifiedDoc = await verifyResponse.json();
      expect(verifiedDoc.metadata?.icon).toBe('🔥');

      // Go to the All Documents view (not library-specific view)
      await page.goto('/documents');
      await page.waitForSelector('[data-testid="all-documents-view"]', { timeout: 15000 });

      // Wait for all-documents list to load
      await page.waitForSelector('[data-testid="all-documents-list"]', { timeout: 10000 });

      // Wait for the specific document item to appear
      const docItem = page.getByTestId(`document-item-${doc.id}`);
      await expect(docItem).toBeVisible({ timeout: 10000 });

      // The document item should show the icon
      const docIcon = page.getByTestId(`document-icon-${doc.id}`);
      await expect(docIcon).toBeVisible({ timeout: 5000 });
      await expect(docIcon).toHaveText('🔥');
    });
  });

  test.describe('Removing Document Icon', () => {
    test('should show remove icon button when icon is set', async ({ page }) => {
      // Create document with pre-set icon via API
      const library = await getOrCreateLibrary(page);
      const response = await page.request.post('/api/documents', {
        data: {
          title: 'Remove Icon Test',
          content: 'Test content',
          contentType: 'markdown',
          createdBy: 'test-user',
          libraryId: library.id,
          metadata: { icon: '📄' },
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      await page.goto(`/documents?library=${library.id}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 15000 });
      await page.waitForTimeout(500);

      // Remove icon button should be visible
      await expect(page.getByTestId('document-remove-icon-button')).toBeVisible();
    });

    test('should remove document icon when clicking remove button', async ({ page }) => {
      // Create document with pre-set icon via API
      const library = await getOrCreateLibrary(page);
      const response = await page.request.post('/api/documents', {
        data: {
          title: 'Remove Icon Click Test',
          content: 'Test content',
          contentType: 'markdown',
          createdBy: 'test-user',
          libraryId: library.id,
          metadata: { icon: '🎯' },
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      await page.goto(`/documents?library=${library.id}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 15000 });
      await page.waitForTimeout(500);

      // Verify icon is displayed
      await expect(page.getByTestId('document-detail-icon')).toBeVisible();
      await expect(page.getByTestId('document-detail-icon')).toHaveText('🎯');

      // Click remove button
      await page.getByTestId('document-remove-icon-button').click();
      await page.waitForTimeout(1000);

      // Icon should be removed
      await expect(page.getByTestId('document-detail-icon')).not.toBeVisible();

      // Verify API has no icon
      const docData = await getDocument(page, doc.id);
      expect(docData.metadata).toBeDefined();
      expect((docData.metadata as Record<string, unknown>).icon).toBeUndefined();
    });

    test('should not show remove button when no icon is set', async ({ page }) => {
      const doc = await createTestDocument(page, 'No Remove Button Test');
      await navigateToDocument(page, doc);

      // Remove icon button should NOT be visible
      await expect(page.getByTestId('document-remove-icon-button')).not.toBeVisible();
    });
  });

  test.describe('Document Icon Persistence', () => {
    test('should persist document icon across page reload', async ({ page }) => {
      // Create document with icon via API
      const library = await getOrCreateLibrary(page);
      const response = await page.request.post('/api/documents', {
        data: {
          title: 'Persistence Test',
          content: 'Test content',
          contentType: 'markdown',
          createdBy: 'test-user',
          libraryId: library.id,
          metadata: { icon: '🚀' },
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      // Navigate to document
      await page.goto(`/documents?library=${library.id}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 15000 });
      await page.waitForTimeout(500);

      // Verify icon is displayed
      await expect(page.getByTestId('document-detail-icon')).toBeVisible();
      await expect(page.getByTestId('document-detail-icon')).toHaveText('🚀');

      // Reload page
      await page.reload();
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 15000 });
      await page.waitForTimeout(500);

      // Icon should still be there
      await expect(page.getByTestId('document-detail-icon')).toBeVisible();
      await expect(page.getByTestId('document-detail-icon')).toHaveText('🚀');
    });

    test('should change existing document icon to a different one', async ({ page }) => {
      // Create document with initial icon
      const library = await getOrCreateLibrary(page);
      const response = await page.request.post('/api/documents', {
        data: {
          title: 'Change Icon Test',
          content: 'Test content',
          contentType: 'markdown',
          createdBy: 'test-user',
          libraryId: library.id,
          metadata: { icon: '📝' },
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();

      await page.goto(`/documents?library=${library.id}&selected=${doc.id}`);
      await page.waitForSelector('[data-testid="document-detail-panel"]', { timeout: 15000 });
      await page.waitForTimeout(500);

      // Initial icon should be displayed
      await expect(page.getByTestId('document-detail-icon')).toHaveText('📝');

      // Click icon button to change it
      await page.getByTestId('document-icon-button').click();
      await expect(page.getByTestId('emoji-picker-modal')).toBeVisible({ timeout: 5000 });

      // Wait for emoji picker to fully load
      await page.waitForTimeout(1000);

      // Select a different emoji from the picker
      const emojiButton = page.locator('button.epr-emoji').nth(5); // Pick a different one
      await emojiButton.click({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // Verify icon has changed
      const docData = await getDocument(page, doc.id);
      expect((docData.metadata as Record<string, unknown>).icon).not.toBe('📝');
    });
  });
});
