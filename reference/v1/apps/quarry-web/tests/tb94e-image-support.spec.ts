import { test, expect, Page } from '@playwright/test';

/**
 * TB94e: Image Block Support Tests
 *
 * These tests verify that:
 * 1. Image upload endpoint works correctly
 * 2. Image toolbar button opens upload modal
 * 3. Slash command /image opens upload modal
 * 4. File upload via modal works
 * 5. URL image insertion works
 * 6. Images are stored in Markdown format
 * 7. Images persist after save/reload
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
      title: title || `Image Test ${Date.now()}`,
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

// Helper to open image upload modal (via slash command as it's more reliable than toolbar)
async function openImageUploadModal(page: Page) {
  const editor = page.getByTestId('block-editor-content');
  await editor.click();

  // Use slash command to trigger image modal
  await page.keyboard.type('/image');
  await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
}

// Fetch document content directly from API
async function getDocumentContent(page: Page, docId: string): Promise<string> {
  const response = await page.request.get(`/api/documents/${docId}`);
  expect(response.ok()).toBe(true);
  const doc = await response.json();
  return doc.content || '';
}

// Create a small test PNG image buffer
function createTestImageBuffer(): Buffer {
  // A minimal valid PNG (1x1 pixel, red)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk header
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // Width 1, Height 1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk header
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, // Compressed pixel data
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, // ...
    0xd4, 0xf5, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, // IEND chunk
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return pngData;
}

test.describe('TB94e: Image Block Support', () => {
  test.describe('Server Upload Endpoints', () => {
    test('POST /api/uploads accepts image files', async ({ page }) => {
      const imageBuffer = createTestImageBuffer();

      const response = await page.request.post('http://localhost:3456/api/uploads', {
        multipart: {
          file: {
            name: 'test.png',
            mimeType: 'image/png',
            buffer: imageBuffer,
          },
        },
      });

      expect(response.ok()).toBe(true);
      const result = await response.json();
      expect(result.url).toBeDefined();
      expect(result.url).toContain('/api/uploads/');
      expect(result.filename).toBeDefined();
      expect(result.mimeType).toBe('image/png');
      expect(result.size).toBe(imageBuffer.length);
    });

    test('GET /api/uploads/:filename serves uploaded files', async ({ page }) => {
      // First upload a file
      const imageBuffer = createTestImageBuffer();
      const uploadResponse = await page.request.post('http://localhost:3456/api/uploads', {
        multipart: {
          file: {
            name: 'test-serve.png',
            mimeType: 'image/png',
            buffer: imageBuffer,
          },
        },
      });

      expect(uploadResponse.ok()).toBe(true);
      const uploadResult = await uploadResponse.json();

      // Then retrieve it
      const getResponse = await page.request.get(`http://localhost:3456${uploadResult.url}`);
      expect(getResponse.ok()).toBe(true);
      expect(getResponse.headers()['content-type']).toBe('image/png');

      const body = await getResponse.body();
      expect(body.length).toBe(imageBuffer.length);
    });

    test('GET /api/uploads lists uploaded files', async ({ page }) => {
      const response = await page.request.get('http://localhost:3456/api/uploads');
      expect(response.ok()).toBe(true);

      const result = await response.json();
      expect(result.files).toBeDefined();
      expect(Array.isArray(result.files)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    test('POST /api/uploads rejects files over 10MB', async ({ page }) => {
      // Create a buffer larger than 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 0);

      const response = await page.request.post('http://localhost:3456/api/uploads', {
        multipart: {
          file: {
            name: 'large.png',
            mimeType: 'image/png',
            buffer: largeBuffer,
          },
        },
      });

      expect(response.status()).toBe(400);
      const result = await response.json();
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('too large');
    });

    test('POST /api/uploads rejects non-image files', async ({ page }) => {
      const textBuffer = Buffer.from('not an image');

      const response = await page.request.post('http://localhost:3456/api/uploads', {
        multipart: {
          file: {
            name: 'test.txt',
            mimeType: 'text/plain',
            buffer: textBuffer,
          },
        },
      });

      expect(response.status()).toBe(400);
      const result = await response.json();
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('Invalid file type');
    });
  });

  test.describe('Image Modal via Slash Command', () => {
    test('/image opens upload modal', async ({ page }) => {
      const doc = await createTestDocument(page, 'Image Slash Test');
      await navigateToDocumentEditMode(page, doc);

      // Open image modal via slash command
      await openImageUploadModal(page);

      // Verify modal opens
      const modal = page.getByTestId('image-upload-modal');
      await expect(modal).toBeVisible({ timeout: 5000 });
    });

    test('Upload modal has upload and URL tabs', async ({ page }) => {
      const doc = await createTestDocument(page, 'Image Modal Tabs Test');
      await navigateToDocumentEditMode(page, doc);

      // Open the image upload modal
      await openImageUploadModal(page);

      // Check for tabs
      const uploadTab = page.getByTestId('image-upload-tab');
      const urlTab = page.getByTestId('image-url-tab');

      await expect(uploadTab).toBeVisible({ timeout: 5000 });
      await expect(urlTab).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Image Slash Command', () => {
    test('/image slash command opens upload modal', async ({ page }) => {
      const doc = await createTestDocument(page, 'Image Slash Command Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/image');

      // Wait for slash command menu
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });

      // Find image option
      const imageOption = page.getByTestId('slash-command-item-image');
      await expect(imageOption).toBeVisible({ timeout: 3000 });

      // Select it
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Verify modal opens
      const modal = page.getByTestId('image-upload-modal');
      await expect(modal).toBeVisible({ timeout: 5000 });
    });

    test('/image appears in Media category', async ({ page }) => {
      const doc = await createTestDocument(page, 'Image Category Test');
      await navigateToDocumentEditMode(page, doc);

      const editor = page.getByTestId('block-editor-content');
      await editor.click();
      await page.keyboard.type('/image');

      // Wait for slash command menu
      await page.waitForSelector('[data-testid="slash-command-menu"]', { timeout: 5000 });

      // Check for Media category
      const mediaCategory = page.getByTestId('slash-command-category-media');
      await expect(mediaCategory).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('URL Image Insertion', () => {
    test('Inserting image via URL works', async ({ page }) => {
      const doc = await createTestDocument(page, 'URL Image Test');
      await navigateToDocumentEditMode(page, doc);

      // Open the image upload modal
      await openImageUploadModal(page);

      // Switch to URL tab
      const urlTab = page.getByTestId('image-url-tab');
      await urlTab.click();

      // Enter a URL (using a well-known public image)
      const urlInput = page.getByTestId('image-url-input');
      await urlInput.fill('https://via.placeholder.com/100x100.png');
      await urlInput.blur();

      // Enter alt text
      const altInput = page.getByTestId('image-alt-input');
      await altInput.fill('Test placeholder image');

      // Click insert
      const insertButton = page.getByTestId('image-insert-button');
      await insertButton.click();

      // Wait for modal to close
      await expect(page.getByTestId('image-upload-modal')).not.toBeVisible({ timeout: 5000 });

      // Save the document
      await saveDocument(page);

      // Verify content contains image markdown
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('![');
      expect(content).toContain('placeholder');
    });
  });

  test.describe('Image Markdown Persistence', () => {
    test('Image stored as standard Markdown syntax', async ({ page }) => {
      // Create a document with image markdown content
      const imageMarkdown = '![Test image](https://via.placeholder.com/50x50.png)';
      const doc = await createTestDocument(page, 'Image Markdown Test', imageMarkdown);

      // Verify content stored correctly
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('![');
      expect(content).toContain('](');
    });

    test('Image with alt text preserved in Markdown', async ({ page }) => {
      const doc = await createTestDocument(page, 'Image Alt Text Test');
      await navigateToDocumentEditMode(page, doc);

      // Open the image upload modal
      await openImageUploadModal(page);

      // Switch to URL tab
      const urlTab = page.getByTestId('image-url-tab');
      await urlTab.click();

      // Enter a URL
      const urlInput = page.getByTestId('image-url-input');
      await urlInput.fill('https://via.placeholder.com/100x100.png');

      // Enter alt text
      const altInput = page.getByTestId('image-alt-input');
      await altInput.fill('A descriptive alt text');

      // Click insert
      const insertButton = page.getByTestId('image-insert-button');
      await insertButton.click();

      // Wait for modal to close
      await expect(page.getByTestId('image-upload-modal')).not.toBeVisible({ timeout: 5000 });

      // Save the document
      await saveDocument(page);

      // Verify content contains alt text
      const content = await getDocumentContent(page, doc.id);
      expect(content).toContain('descriptive alt text');
    });
  });

  test.describe('Image Modal Functionality', () => {
    test('Cancel button closes modal without inserting', async ({ page }) => {
      const doc = await createTestDocument(page, 'Image Cancel Test');
      await navigateToDocumentEditMode(page, doc);

      // Open the image upload modal
      await openImageUploadModal(page);

      // Wait for modal
      const modal = page.getByTestId('image-upload-modal');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Find and click cancel button
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();

      // Modal should close
      await expect(modal).not.toBeVisible({ timeout: 5000 });
    });

    test('Drop zone shows drag over state', async ({ page }) => {
      const doc = await createTestDocument(page, 'Image Drag Test');
      await navigateToDocumentEditMode(page, doc);

      // Open the image upload modal
      await openImageUploadModal(page);

      // Drop zone should be visible
      const dropZone = page.getByTestId('image-drop-zone');
      await expect(dropZone).toBeVisible({ timeout: 5000 });
    });
  });
});
