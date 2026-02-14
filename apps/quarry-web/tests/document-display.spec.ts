import { test, expect, Page } from '@playwright/test';

// Helper type for library with parentId
interface LibraryWithParent {
  id: string;
  name: string;
  parentId: string | null;
}

// Helper to click on a library in the tree, expanding parents if needed
async function clickLibraryInTree(page: Page, libraries: LibraryWithParent[], libraryId: string) {
  const library = libraries.find(l => l.id === libraryId);
  if (!library) return;

  // Build the ancestor chain (parents first)
  const ancestors: LibraryWithParent[] = [];
  let current = library;
  while (current.parentId) {
    const parent = libraries.find(l => l.id === current.parentId);
    if (parent) {
      ancestors.unshift(parent);
      current = parent;
    } else {
      break;
    }
  }

  // Click on each ancestor's toggle button to expand it (without selecting)
  for (const ancestor of ancestors) {
    const toggleButton = page.getByTestId(`library-toggle-${ancestor.id}`);
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      // Small wait for expansion
      await page.waitForTimeout(100);
    }
  }

  // Now click on the target library (to select it)
  await page.getByTestId(`library-tree-item-${libraryId}`).click();
}

test.describe('TB21: Document Display', () => {
  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('GET /api/documents/:id endpoint returns a document', async ({ page }) => {
    // First get a list of documents
    const listResponse = await page.request.get('/api/documents?limit=10');
    expect(listResponse.ok()).toBe(true);
    const documents = await listResponse.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    // Get a single document
    const response = await page.request.get(`/api/documents/${documents[0].id}`);
    expect(response.ok()).toBe(true);
    const document = await response.json();

    expect(document.id).toBe(documents[0].id);
    expect(document.type).toBe('document');
    expect(document.contentType).toBeDefined();
    expect(document.createdAt).toBeDefined();
    expect(document.updatedAt).toBeDefined();
  });

  test('GET /api/documents/:id returns 404 for invalid ID', async ({ page }) => {
    const response = await page.request.get('/api/documents/el-invalid999999');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/documents returns documents with required fields', async ({ page }) => {
    const response = await page.request.get('/api/documents?limit=10');
    expect(response.ok()).toBe(true);
    const documents = await response.json();
    expect(Array.isArray(documents)).toBe(true);

    // Check each document has required fields
    for (const doc of documents) {
      expect(doc.type).toBe('document');
      expect(doc.contentType).toBeDefined();
      expect(['text', 'markdown', 'json']).toContain(doc.contentType);
      expect(doc.createdAt).toBeDefined();
      expect(doc.updatedAt).toBeDefined();
      expect(doc.createdBy).toBeDefined();
    }
  });

  // ============================================================================
  // UI Tests - Document Selection
  // ============================================================================

  test('clicking a document opens the detail panel', async ({ page }) => {
    // First check if there are any documents
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    // Wait for the page to load
    await page.waitForTimeout(1000);

    // Check if we have libraries (then we need to handle that flow)
    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    if (libraries.length === 0) {
      // No libraries, documents should show in all-documents-view
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });

      // Click on a document
      await page.getByTestId(`document-item-${documents[0].id}`).click();

      // Detail panel should appear
      await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });
    } else {
      // Libraries exist, we need to select one first to see documents
      // Try to find a library with documents (prefer root libraries for simpler test)
      const rootLibraries = libraries.filter((lib: LibraryWithParent) => !lib.parentId);
      const sortedLibraries = [...rootLibraries, ...libraries.filter((lib: LibraryWithParent) => lib.parentId)];

      for (const library of sortedLibraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();

        if (libDocs.length > 0) {
          // Select this library (using helper to expand parents if needed)
          await clickLibraryInTree(page, libraries, library.id);
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });

          // Click on a document
          await page.getByTestId(`document-item-${libDocs[0].id}`).click();

          // Detail panel should appear
          await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });
          return;
        }
      }

      // No library has documents, skip
      test.skip();
    }
  });

  test('document detail panel shows document title', async ({ page }) => {
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    if (libraries.length === 0) {
      // No libraries, documents show in all-documents view
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${documents[0].id}`).click();
      await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

      // Check title is displayed
      await expect(page.getByTestId('document-detail-title')).toBeVisible();
      const title = documents[0].title || `Document ${documents[0].id}`;
      await expect(page.getByTestId('document-detail-title')).toContainText(title);
    } else {
      // Need to find a library with documents
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();

        if (libDocs.length > 0) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${libDocs[0].id}`).click();
          await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

          // Check title is displayed
          await expect(page.getByTestId('document-detail-title')).toBeVisible();
          const title = libDocs[0].title || `Document ${libDocs[0].id}`;
          await expect(page.getByTestId('document-detail-title')).toContainText(title);
          return;
        }
      }

      test.skip();
    }
  });

  test('document detail panel shows content type badge', async ({ page }) => {
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    let targetDoc = documents[0];

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${documents[0].id}`).click();
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();

        if (libDocs.length > 0) {
          targetDoc = libDocs[0];
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${libDocs[0].id}`).click();
          break;
        }
      }
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check content type badge is displayed
    await expect(page.getByTestId('document-detail-type')).toBeVisible();
    const contentTypeMap: Record<string, string> = {
      text: 'Plain Text',
      markdown: 'Markdown',
      json: 'JSON',
    };
    await expect(page.getByTestId('document-detail-type')).toContainText(
      contentTypeMap[targetDoc.contentType] || 'Plain Text'
    );
  });

  test('document detail panel shows document ID', async ({ page }) => {
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    let targetDoc = documents[0];

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${documents[0].id}`).click();
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();

        if (libDocs.length > 0) {
          targetDoc = libDocs[0];
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${libDocs[0].id}`).click();
          break;
        }
      }
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check document ID is displayed
    await expect(page.getByTestId('document-detail-id')).toBeVisible();
    await expect(page.getByTestId('document-detail-id')).toContainText(targetDoc.id);
  });

  test('document detail panel close button works', async ({ page }) => {
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();

    if (documents.length === 0) {
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
      await page.getByTestId(`document-item-${documents[0].id}`).click();
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();

        if (libDocs.length > 0) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${libDocs[0].id}`).click();
          break;
        }
      }
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click close button
    await page.getByTestId('document-detail-close').click();

    // Panel should close
    await expect(page.getByTestId('document-detail-panel')).not.toBeVisible({ timeout: 5000 });
  });

  test('document content is displayed', async ({ page }) => {
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();

    if (documents.length === 0) {
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
      await page.getByTestId(`document-item-${documents[0].id}`).click();
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();

        if (libDocs.length > 0) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${libDocs[0].id}`).click();
          break;
        }
      }
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check that content area exists
    await expect(page.getByTestId('document-content')).toBeVisible();
  });

  test('selected document shows selection state in list', async ({ page }) => {
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();

    if (documents.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    let targetDocId = documents[0].id;

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();

        if (libDocs.length > 0) {
          targetDocId = libDocs[0].id;
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          break;
        }
      }
    }

    // Click on document
    await page.getByTestId(`document-item-${targetDocId}`).click();
    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check that the selected item has the selected style (blue background)
    const docItem = page.getByTestId(`document-item-${targetDocId}`);
    await expect(docItem).toHaveClass(/bg-blue-50/);
  });

  // ============================================================================
  // Content Type Rendering Tests
  // ============================================================================

  test('text content renders correctly', async ({ page }) => {
    // Find a text document
    const response = await page.request.get('/api/documents?limit=50');
    const documents = await response.json();
    const textDoc = documents.find((doc: { contentType: string }) => doc.contentType === 'text');

    if (!textDoc) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    let foundInLibrary = false;

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${textDoc.id}`).click();
      foundInLibrary = true;
    } else {
      // Navigate to find the text document
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();
        const found = libDocs.find((d: { id: string }) => d.id === textDoc.id);

        if (found) {
          // Use helper to expand parents if this is a nested library
          await clickLibraryInTree(page, libraries, library.id);
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${textDoc.id}`).click();
          foundInLibrary = true;
          break;
        }
      }
    }

    // Skip if document isn't in any library (orphan document)
    if (!foundInLibrary) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('document-content-text')).toBeVisible();
  });

  test('markdown content renders correctly', async ({ page }) => {
    // Find a markdown document
    const response = await page.request.get('/api/documents?limit=50');
    const documents = await response.json();
    const markdownDoc = documents.find((doc: { contentType: string }) => doc.contentType === 'markdown');

    if (!markdownDoc) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    let foundInLibrary = false;

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${markdownDoc.id}`).click();
      foundInLibrary = true;
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();
        const found = libDocs.find((d: { id: string }) => d.id === markdownDoc.id);

        if (found) {
          // Use helper to expand parents if this is a nested library
          await clickLibraryInTree(page, libraries, library.id);
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${markdownDoc.id}`).click();
          foundInLibrary = true;
          break;
        }
      }
    }

    // Skip if document isn't in any library (orphan document)
    if (!foundInLibrary) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('document-content-markdown')).toBeVisible();
  });

  test('json content renders correctly', async ({ page }) => {
    // Find a JSON document
    const response = await page.request.get('/api/documents?limit=50');
    const documents = await response.json();
    const jsonDoc = documents.find((doc: { contentType: string }) => doc.contentType === 'json');

    if (!jsonDoc) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    let foundInLibrary = false;

    if (libraries.length === 0) {
      await expect(page.getByTestId('all-documents-view')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`document-item-${jsonDoc.id}`).click();
      foundInLibrary = true;
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();
        const found = libDocs.find((d: { id: string }) => d.id === jsonDoc.id);

        if (found) {
          // Use helper to expand parents if this is a nested library
          await clickLibraryInTree(page, libraries, library.id);
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${jsonDoc.id}`).click();
          foundInLibrary = true;
          break;
        }
      }
    }

    // Skip if document isn't in any library (orphan document)
    if (!foundInLibrary) {
      test.skip();
      return;
    }

    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('document-content-json')).toBeVisible();
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  test('document detail panel handles loading state', async ({ page }) => {
    const response = await page.request.get('/api/documents?limit=10');
    const documents = await response.json();

    if (documents.length === 0) {
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
      await page.getByTestId(`document-item-${documents[0].id}`).click();
    } else {
      for (const library of libraries) {
        const libDocsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
        const libDocs = await libDocsResponse.json();

        if (libDocs.length > 0) {
          await page.getByTestId(`library-tree-item-${library.id}`).click();
          await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
          await page.getByTestId(`document-item-${libDocs[0].id}`).click();
          break;
        }
      }
    }

    // Either loading or panel should be visible
    const loading = page.getByTestId('document-detail-loading');
    const panel = page.getByTestId('document-detail-panel');
    await expect(loading.or(panel)).toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  test('changing library clears document selection', async ({ page }) => {
    const librariesResponse = await page.request.get('/api/libraries');
    const libraries = await librariesResponse.json();

    if (libraries.length < 2) {
      test.skip();
      return;
    }

    // Find two libraries with documents
    const librariesWithDocs: { id: string; docs: { id: string }[] }[] = [];
    for (const library of libraries) {
      const docsResponse = await page.request.get(`/api/libraries/${library.id}/documents`);
      const docs = await docsResponse.json();
      if (docs.length > 0) {
        librariesWithDocs.push({ id: library.id, docs });
      }
      if (librariesWithDocs.length >= 2) break;
    }

    if (librariesWithDocs.length < 2) {
      test.skip();
      return;
    }

    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('library-tree')).toBeVisible({ timeout: 5000 });

    // Select first library and document
    await page.getByTestId(`library-tree-item-${librariesWithDocs[0].id}`).click();
    await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`document-item-${librariesWithDocs[0].docs[0].id}`).click();
    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Select second library
    await page.getByTestId(`library-tree-item-${librariesWithDocs[1].id}`).click();

    // Document panel should close (selection cleared)
    await expect(page.getByTestId('document-detail-panel')).not.toBeVisible({ timeout: 5000 });
  });

  test('documents page is navigable via sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    // Click on Documents in sidebar
    await page.getByTestId('nav-documents').click();

    // Should navigate to documents page
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('/documents');
  });
});
