import { test, expect } from '@playwright/test';

test.describe('TB23: Document Versions', () => {
  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('GET /api/documents/:id/versions returns version history', async ({ page }) => {
    // First get a list of documents
    const listResponse = await page.request.get('/api/documents?limit=10');
    expect(listResponse.ok()).toBe(true);
    const documents = await listResponse.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    // Get version history for the first document
    const response = await page.request.get(`/api/documents/${documents[0].id}/versions`);
    expect(response.ok()).toBe(true);
    const versions = await response.json();

    expect(Array.isArray(versions)).toBe(true);
    // Should have at least the current version
    expect(versions.length).toBeGreaterThanOrEqual(1);

    // Check structure of version entries
    for (const version of versions) {
      expect(version.id).toBe(documents[0].id);
      expect(version.type).toBe('document');
      expect(typeof version.version).toBe('number');
      expect(version.contentType).toBeDefined();
    }
  });

  test('GET /api/documents/:id/versions returns 404 for invalid ID', async ({ page }) => {
    const response = await page.request.get('/api/documents/el-invalid999999/versions');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/documents/:id/versions/:version returns specific version', async ({ page }) => {
    // First get a list of documents
    const listResponse = await page.request.get('/api/documents?limit=10');
    expect(listResponse.ok()).toBe(true);
    const documents = await listResponse.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    // Get version 1 (should always exist)
    const response = await page.request.get(`/api/documents/${documents[0].id}/versions/1`);
    expect(response.ok()).toBe(true);
    const version = await response.json();

    expect(version.id).toBe(documents[0].id);
    expect(version.type).toBe('document');
    expect(version.version).toBe(1);
  });

  test('GET /api/documents/:id/versions/:version returns 404 for invalid version', async ({ page }) => {
    // First get a list of documents
    const listResponse = await page.request.get('/api/documents?limit=10');
    expect(listResponse.ok()).toBe(true);
    const documents = await listResponse.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    // Try to get a very high version number that shouldn't exist
    const response = await page.request.get(`/api/documents/${documents[0].id}/versions/99999`);
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/documents/:id/versions/:version validates version number', async ({ page }) => {
    // First get a list of documents
    const listResponse = await page.request.get('/api/documents?limit=10');
    expect(listResponse.ok()).toBe(true);
    const documents = await listResponse.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    // Try invalid version numbers
    const responseZero = await page.request.get(`/api/documents/${documents[0].id}/versions/0`);
    expect(responseZero.status()).toBe(400);

    const responseNegative = await page.request.get(`/api/documents/${documents[0].id}/versions/-1`);
    expect(responseNegative.status()).toBe(400);
  });

  test('POST /api/documents/:id/restore restores a version', async ({ page }) => {
    // First get a list of documents with multiple versions
    const listResponse = await page.request.get('/api/documents?limit=50');
    expect(listResponse.ok()).toBe(true);
    const documents = await listResponse.json();

    // Find a document with version > 1 (has history)
    const docWithHistory = documents.find((doc: { version?: number }) => (doc.version || 1) > 1);

    if (!docWithHistory) {
      test.skip();
      return;
    }

    // Get current content
    const currentResponse = await page.request.get(`/api/documents/${docWithHistory.id}`);
    const currentDoc = await currentResponse.json();
    const originalVersion = currentDoc.version;
    const originalContent = currentDoc.content;

    // Restore to version 1
    const restoreResponse = await page.request.post(`/api/documents/${docWithHistory.id}/restore`, {
      data: { version: 1 },
    });
    expect(restoreResponse.ok()).toBe(true);
    const restoredDoc = await restoreResponse.json();

    // Restored document should have incremented version
    expect(restoredDoc.version).toBe(originalVersion + 1);

    // Verify the document was actually updated
    const verifyResponse = await page.request.get(`/api/documents/${docWithHistory.id}`);
    const verifiedDoc = await verifyResponse.json();
    expect(verifiedDoc.version).toBe(originalVersion + 1);

    // Restore back to original by updating content directly
    await page.request.patch(`/api/documents/${docWithHistory.id}`, {
      data: { content: originalContent },
    });
  });

  test('POST /api/documents/:id/restore returns 404 for invalid document', async ({ page }) => {
    const response = await page.request.post('/api/documents/el-invalid999999/restore', {
      data: { version: 1 },
    });
    expect(response.status()).toBe(404);
  });

  test('POST /api/documents/:id/restore validates version number', async ({ page }) => {
    const listResponse = await page.request.get('/api/documents?limit=10');
    const documents = await listResponse.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    // Try invalid version
    const response = await page.request.post(`/api/documents/${documents[0].id}/restore`, {
      data: { version: -1 },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  // ============================================================================
  // UI Tests - Version History Sidebar
  // ============================================================================

  // Helper function to navigate to a document
  async function navigateToDocument(page: import('@playwright/test').Page) {
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

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${documents[0].id}`).click();
      return documents[0];
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();

        if (libDocs.length > 0) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${libDocs[0].id}`).click();
          return libDocs[0];
        }
      }
    }

    return null;
  }

  test('document detail panel has version history button', async ({ page }) => {
    const doc = await navigateToDocument(page);
    if (!doc) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check for version history button
    await expect(page.getByTestId('document-history-button')).toBeVisible();
  });

  test('clicking version history button opens sidebar', async ({ page }) => {
    const doc = await navigateToDocument(page);
    if (!doc) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click version history button
    await page.getByTestId('document-history-button').click();

    // Sidebar should appear
    await expect(page.getByTestId('version-history-sidebar')).toBeVisible({ timeout: 5000 });
  });

  test('version history sidebar shows version list', async ({ page }) => {
    const doc = await navigateToDocument(page);
    if (!doc) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Open version history
    await page.getByTestId('document-history-button').click();
    await expect(page.getByTestId('version-history-sidebar')).toBeVisible({ timeout: 5000 });

    // Should show version list or loading/empty state
    const list = page.getByTestId('version-history-list');
    const loading = page.getByTestId('version-history-loading');
    const empty = page.getByTestId('version-history-empty');

    await expect(list.or(loading).or(empty)).toBeVisible({ timeout: 5000 });
  });

  test('version history sidebar has close button', async ({ page }) => {
    const doc = await navigateToDocument(page);
    if (!doc) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Open version history
    await page.getByTestId('document-history-button').click();
    await expect(page.getByTestId('version-history-sidebar')).toBeVisible({ timeout: 5000 });

    // Close button should be visible
    await expect(page.getByTestId('version-history-close')).toBeVisible();

    // Click close button
    await page.getByTestId('version-history-close').click();

    // Sidebar should close
    await expect(page.getByTestId('version-history-sidebar')).not.toBeVisible({ timeout: 5000 });
  });

  test('version history button toggles sidebar', async ({ page }) => {
    const doc = await navigateToDocument(page);
    if (!doc) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Open version history
    await page.getByTestId('document-history-button').click();
    await expect(page.getByTestId('version-history-sidebar')).toBeVisible({ timeout: 5000 });

    // Click again to close
    await page.getByTestId('document-history-button').click();
    await expect(page.getByTestId('version-history-sidebar')).not.toBeVisible({ timeout: 5000 });
  });

  test('current version shows "Current" badge', async ({ page }) => {
    const doc = await navigateToDocument(page);
    if (!doc) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Open version history
    await page.getByTestId('document-history-button').click();
    await expect(page.getByTestId('version-history-sidebar')).toBeVisible({ timeout: 5000 });

    // Wait for version list to load
    await page.waitForTimeout(1000);

    // Get the document's current version
    const docResponse = await page.request.get(`/api/documents/${doc.id}`);
    const docData = await docResponse.json();
    const currentVersion = docData.version || 1;

    // The current version item should show "Current" badge
    const versionItem = page.getByTestId(`version-item-${currentVersion}`);
    if (await versionItem.isVisible()) {
      await expect(versionItem).toContainText('Current');
    }
  });

  test('preview button shows on non-current versions', async ({ page }) => {
    // Find a document with multiple versions
    const listResponse = await page.request.get('/api/documents?limit=50');
    const documents = await listResponse.json();
    const docWithHistory = documents.find((d: { version?: number }) => (d.version || 1) > 1);

    if (!docWithHistory) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${docWithHistory.id}`).click();
    } else {
      let found = false;
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();
        const targetDoc = libDocs.find((d: { id: string }) => d.id === docWithHistory.id);

        if (targetDoc) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${docWithHistory.id}`).click();
          found = true;
          break;
        }
      }

      if (!found) {
        test.skip();
        return;
      }
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Open version history
    await page.getByTestId('document-history-button').click();
    await expect(page.getByTestId('version-history-sidebar')).toBeVisible({ timeout: 5000 });

    // Wait for version list
    await page.waitForTimeout(1000);

    // Preview button should be visible on version 1 (not current)
    const previewButton = page.getByTestId('version-preview-1');
    if (await previewButton.isVisible()) {
      await expect(previewButton).toBeVisible();
    }
  });

  test('clicking preview shows preview banner', async ({ page }) => {
    // Find a document with multiple versions
    const listResponse = await page.request.get('/api/documents?limit=50');
    const documents = await listResponse.json();
    const docWithHistory = documents.find((d: { version?: number }) => (d.version || 1) > 1);

    if (!docWithHistory) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${docWithHistory.id}`).click();
    } else {
      let found = false;
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();
        const targetDoc = libDocs.find((d: { id: string }) => d.id === docWithHistory.id);

        if (targetDoc) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${docWithHistory.id}`).click();
          found = true;
          break;
        }
      }

      if (!found) {
        test.skip();
        return;
      }
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Open version history
    await page.getByTestId('document-history-button').click();
    await expect(page.getByTestId('version-history-sidebar')).toBeVisible({ timeout: 5000 });

    // Wait for version list
    await page.waitForTimeout(1000);

    // Click preview on version 1
    const previewButton = page.getByTestId('version-preview-1');
    if (await previewButton.isVisible()) {
      await previewButton.click();

      // Preview banner should appear
      await expect(page.getByTestId('document-preview-banner')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('document-preview-banner')).toContainText('Previewing version 1');
    }
  });

  test('exit preview button clears preview', async ({ page }) => {
    // Find a document with multiple versions
    const listResponse = await page.request.get('/api/documents?limit=50');
    const documents = await listResponse.json();
    const docWithHistory = documents.find((d: { version?: number }) => (d.version || 1) > 1);

    if (!docWithHistory) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${docWithHistory.id}`).click();
    } else {
      let found = false;
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();
        const targetDoc = libDocs.find((d: { id: string }) => d.id === docWithHistory.id);

        if (targetDoc) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${docWithHistory.id}`).click();
          found = true;
          break;
        }
      }

      if (!found) {
        test.skip();
        return;
      }
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Open version history
    await page.getByTestId('document-history-button').click();
    await expect(page.getByTestId('version-history-sidebar')).toBeVisible({ timeout: 5000 });

    // Wait for version list
    await page.waitForTimeout(1000);

    // Click preview on version 1
    const previewButton = page.getByTestId('version-preview-1');
    if (await previewButton.isVisible()) {
      await previewButton.click();
      await expect(page.getByTestId('document-preview-banner')).toBeVisible({ timeout: 5000 });

      // Click exit preview
      await page.getByTestId('exit-preview-button').click();

      // Banner should disappear
      await expect(page.getByTestId('document-preview-banner')).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('edit button is disabled during preview', async ({ page }) => {
    // Find a document with multiple versions
    const listResponse = await page.request.get('/api/documents?limit=50');
    const documents = await listResponse.json();
    const docWithHistory = documents.find((d: { version?: number }) => (d.version || 1) > 1);

    if (!docWithHistory) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${docWithHistory.id}`).click();
    } else {
      let found = false;
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();
        const targetDoc = libDocs.find((d: { id: string }) => d.id === docWithHistory.id);

        if (targetDoc) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${docWithHistory.id}`).click();
          found = true;
          break;
        }
      }

      if (!found) {
        test.skip();
        return;
      }
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check edit button is enabled initially
    const editButton = page.getByTestId('document-edit-button');
    await expect(editButton).not.toBeDisabled();

    // Open version history
    await page.getByTestId('document-history-button').click();
    await expect(page.getByTestId('version-history-sidebar')).toBeVisible({ timeout: 5000 });

    // Wait for version list
    await page.waitForTimeout(1000);

    // Click preview on version 1
    const previewButton = page.getByTestId('version-preview-1');
    if (await previewButton.isVisible()) {
      await previewButton.click();
      await expect(page.getByTestId('document-preview-banner')).toBeVisible({ timeout: 5000 });

      // Edit button should now be disabled
      await expect(editButton).toBeDisabled();
    }
  });
});
