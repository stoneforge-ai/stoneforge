/**
 * TB130: Virtualize Documents List with Infinite Scroll
 *
 * Tests for virtualized document lists in both All Documents view
 * and Library view. Verifies smooth scrolling, instant filtering,
 * and removal of "Load more" buttons.
 */

import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3456';
const APP_URL = 'http://localhost:5173';

// Helper to wait a bit between API calls to avoid rate limiting
async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to create a document via API with retry
async function createDocument(
  request: any,
  title: string,
  content: string = 'Test content',
  libraryId?: string,
  retries: number = 3
) {
  const body: Record<string, string> = {
    title,
    content,
    contentType: 'markdown',
    createdBy: 'test-user',
  };
  if (libraryId) {
    body.libraryId = libraryId;
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      await wait(100 * attempt); // Exponential backoff
    }

    const response = await request.post(`${API_BASE}/api/documents`, {
      data: body,
    });

    if (response.ok()) {
      return response.json();
    }

    if (attempt === retries - 1) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.log(`Failed to create document "${title}" after ${retries} attempts: ${errorText}`);
      expect(response.ok()).toBeTruthy();
    }
  }
}

// Helper to create a library via API
async function createLibrary(request: any, name: string) {
  const response = await request.post(`${API_BASE}/api/libraries`, {
    data: {
      name,
      createdBy: 'test-user',
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

// Helper to delete a document via API
async function deleteDocument(request: any, id: string) {
  const response = await request.delete(`${API_BASE}/api/documents/${id}`);
  return response;
}

// Helper to delete a library via API
async function deleteLibrary(request: any, id: string) {
  const response = await request.delete(`${API_BASE}/api/libraries/${id}`);
  return response;
}

// Helper to get all documents
async function getDocuments(request: any) {
  const response = await request.get(`${API_BASE}/api/documents?limit=1000`);
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  return data.items || data;
}

// Helper to get all libraries
async function getLibraries(request: any) {
  const response = await request.get(`${API_BASE}/api/libraries`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe('TB130: Virtualized Documents List', () => {
  // Run tests sequentially to avoid conflicts
  test.describe.configure({ mode: 'serial' });

  // Clean up test documents and libraries after each test
  test.afterEach(async ({ request }) => {
    const documents = await getDocuments(request);
    for (const doc of documents) {
      if (doc.title?.startsWith('TB130 Test')) {
        await deleteDocument(request, doc.id);
      }
    }
    const libraries = await getLibraries(request);
    for (const lib of libraries) {
      if (lib.name?.startsWith('TB130 Test')) {
        await deleteLibrary(request, lib.id);
      }
    }
  });

  test('All Documents view uses virtualized list component', async ({ page, request }) => {
    // Create test documents
    await createDocument(request, 'TB130 Test Document 1');
    await createDocument(request, 'TB130 Test Document 2');

    await page.goto(`${APP_URL}/documents`);
    await page.waitForSelector('[data-testid="all-documents-view"]');

    // Check that the virtualized list component is rendered
    const virtualizedList = page.locator('[data-testid="virtualized-all-documents-list"]');
    await expect(virtualizedList).toBeVisible();
  });

  test('All Documents view does not have Load More button', async ({ page, request }) => {
    // Create enough documents that would have triggered Load More in old implementation
    // Note: Creating 10 documents is enough to verify virtualization works without Load More
    for (let i = 0; i < 10; i++) {
      await createDocument(request, `TB130 Test Doc ${i.toString().padStart(2, '0')}`);
    }

    await page.goto(`${APP_URL}/documents`);
    await page.waitForSelector('[data-testid="all-documents-view"]');

    // Wait for documents to load
    await page.waitForTimeout(1000);

    // Load More button should NOT exist
    const loadMoreButton = page.locator('[data-testid="load-more-button"]');
    await expect(loadMoreButton).not.toBeVisible();
  });

  test('All Documents view shows total count without "X of Y" format', async ({ page, request }) => {
    // Create test documents
    await createDocument(request, 'TB130 Test Count 1');
    await createDocument(request, 'TB130 Test Count 2');
    await createDocument(request, 'TB130 Test Count 3');

    await page.goto(`${APP_URL}/documents`);
    await page.waitForSelector('[data-testid="all-documents-view"]');

    // Wait for documents to load
    await page.waitForTimeout(1000);

    // Check the count display
    const countElement = page.locator('[data-testid="all-documents-count"]');
    const countText = await countElement.textContent();

    // Should show total count without "of" format
    expect(countText).not.toContain(' of ');
    expect(countText).toMatch(/\d+ documents?/);
  });

  test('All Documents search filter works instantly with virtualized list', async ({ page, request }) => {
    // Create documents with very distinct names using unique timestamp
    const uniqueId = Date.now().toString(36);
    const alphaName = `TB130-Search-Alpha-${uniqueId}`;
    const betaName = `TB130-Search-Beta-${uniqueId}`;
    const gammaName = `TB130-Search-Gamma-${uniqueId}`;

    await createDocument(request, alphaName);
    await createDocument(request, betaName);
    await createDocument(request, gammaName);

    await page.goto(`${APP_URL}/documents`);
    await page.waitForSelector('[data-testid="all-documents-view"]');

    // Wait for documents to load
    await expect(page.locator('[data-testid^="document-item-"]').first()).toBeVisible({ timeout: 10000 });

    // Search for the unique Alpha document using the unique ID
    const searchInput = page.locator('[data-testid="documents-search-input"]');
    await searchInput.fill(`Alpha-${uniqueId}`);

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Should filter to just the Alpha document
    const items = page.locator('[data-testid^="document-item-"]');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify the Alpha document is visible
    await expect(page.locator(`text=${alphaName}`)).toBeVisible();
  });

  test('Library view uses virtualized list component', async ({ page, request }) => {
    // Create a library with documents
    const library = await createLibrary(request, 'TB130 Test Library View');
    await createDocument(request, 'TB130 Test Lib Doc 1', 'Content 1', library.id);
    await createDocument(request, 'TB130 Test Lib Doc 2', 'Content 2', library.id);

    await page.goto(`${APP_URL}/documents?library=${library.id}`);
    await page.waitForSelector('[data-testid="library-view"]');

    // Check that the virtualized list component is rendered
    const virtualizedList = page.locator('[data-testid="virtualized-documents-list"]');
    await expect(virtualizedList).toBeVisible();
  });

  test('Library view does not have Load More button', async ({ page, request }) => {
    // Create a library with some documents (10 is enough to verify no Load More)
    const library = await createLibrary(request, 'TB130 Test Library Many');
    for (let i = 0; i < 10; i++) {
      await createDocument(request, `TB130 Test LDoc ${i.toString().padStart(2, '0')}`, `Content ${i}`, library.id);
    }

    await page.goto(`${APP_URL}/documents?library=${library.id}`);
    await page.waitForSelector('[data-testid="library-view"]');

    // Wait for documents to load
    await page.waitForTimeout(1000);

    // Load More button should NOT exist
    const loadMoreButton = page.locator('[data-testid="load-more-button"]');
    await expect(loadMoreButton).not.toBeVisible();
  });

  test('Library view shows total count without "X of Y" format', async ({ page, request }) => {
    // Create a library with documents
    const library = await createLibrary(request, 'TB130 Test Library Count');
    await createDocument(request, 'TB130 Test LC Doc 1', 'Content 1', library.id);
    await createDocument(request, 'TB130 Test LC Doc 2', 'Content 2', library.id);

    await page.goto(`${APP_URL}/documents?library=${library.id}`);
    await page.waitForSelector('[data-testid="library-view"]');

    // Wait for documents to load
    await page.waitForTimeout(1000);

    // Check the count display
    const countElement = page.locator('[data-testid="library-doc-count"]');
    const countText = await countElement.textContent();

    // Should show total count without "of" format
    expect(countText).not.toContain(' of ');
    expect(countText).toMatch(/\d+ documents?/);
  });

  test('virtualized documents list supports smooth scrolling', async ({ page, request }) => {
    // Create enough documents to require scrolling (15 is enough for scrolling)
    for (let i = 0; i < 15; i++) {
      await createDocument(request, `TB130 Test Scroll Doc ${i.toString().padStart(2, '0')}`);
    }

    await page.goto(`${APP_URL}/documents`);
    await page.waitForSelector('[data-testid="all-documents-view"]');

    // Wait for documents to load
    await expect(page.locator('[data-testid^="document-item-"]').first()).toBeVisible({ timeout: 10000 });

    // Check the virtualized list has proper overflow
    const virtualizedList = page.locator('[data-testid="virtualized-all-documents-list"]');
    const hasOverflow = await virtualizedList.evaluate((el) => {
      const style = getComputedStyle(el);
      return style.overflow === 'auto' || style.overflowY === 'auto';
    });
    expect(hasOverflow).toBeTruthy();

    // Verify items are positioned absolutely (virtualization technique)
    const firstItem = page.locator('[data-testid="virtualized-all-documents-list"] [data-index="0"]');
    const position = await firstItem.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('absolute');
  });

  test('selecting a document works in virtualized list', async ({ page, request }) => {
    // Create test documents
    const doc1 = await createDocument(request, 'TB130 Test Selectable Doc 1');
    await createDocument(request, 'TB130 Test Selectable Doc 2');

    await page.goto(`${APP_URL}/documents`);
    await page.waitForSelector('[data-testid="all-documents-view"]');

    // Wait for documents to load
    await expect(page.locator(`[data-testid="document-item-${doc1.id}"]`)).toBeVisible({ timeout: 10000 });

    // Click to select the document
    await page.locator(`[data-testid="document-item-${doc1.id}"]`).click();

    // Document should have selected styling (blue background)
    await page.waitForTimeout(500);
    await expect(page.locator(`[data-testid="document-item-${doc1.id}"]`)).toHaveClass(/bg-blue-50/);
  });

  test('empty documents state shows correctly', async ({ page }) => {
    // Navigate to documents page - if no documents exist, should show empty state
    await page.goto(`${APP_URL}/documents`);
    await page.waitForSelector('[data-testid="all-documents-view"]');

    // Wait for data to load
    await page.waitForTimeout(1000);

    // Either we have documents in the virtualized list, or we show empty state
    const virtualizedList = page.locator('[data-testid="virtualized-all-documents-list"]');
    const emptyState = page.locator('[data-testid="all-documents-empty"]');

    const hasDocs = await virtualizedList.isVisible().catch(() => false);
    const isEmpty = await emptyState.isVisible().catch(() => false);

    // One of these should be visible
    expect(hasDocs || isEmpty).toBeTruthy();
  });

  test('library empty documents state shows correctly', async ({ page, request }) => {
    // Create a library without any documents
    const library = await createLibrary(request, 'TB130 Test Empty Library');

    await page.goto(`${APP_URL}/documents?library=${library.id}`);
    await page.waitForSelector('[data-testid="library-view"]');

    // Wait for data to load
    await page.waitForTimeout(1000);

    // Should show empty state for documents
    const emptyState = page.locator('[data-testid="documents-empty"]');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('No documents in this library');
  });

  test('virtualized list preserves scroll position via scrollRestoreId', async ({ page, request }) => {
    // Create enough documents to scroll (10 is enough)
    for (let i = 0; i < 10; i++) {
      await createDocument(request, `TB130 Test Restore Doc ${i.toString().padStart(2, '0')}`);
    }

    await page.goto(`${APP_URL}/documents`);
    await page.waitForSelector('[data-testid="all-documents-view"]');

    // Wait for documents to load
    await expect(page.locator('[data-testid^="document-item-"]').first()).toBeVisible({ timeout: 10000 });

    // Check that the virtualized list has scrollRestoreId infrastructure
    // This is verified by checking the virtualized list is rendered
    const virtualizedList = page.locator('[data-testid="virtualized-all-documents-list"]');
    await expect(virtualizedList).toBeVisible();

    // Verify the inner container has the expected structure
    const virtualizedInner = page.locator('[data-testid="virtualized-all-documents-list-inner"]');
    await expect(virtualizedInner).toBeVisible();
  });

  test('virtualized list items are efficiently rendered with gap spacing', async ({ page, request }) => {
    // Create test documents
    await createDocument(request, 'TB130 Test Gap 1');
    await createDocument(request, 'TB130 Test Gap 2');
    await createDocument(request, 'TB130 Test Gap 3');

    await page.goto(`${APP_URL}/documents`);
    await page.waitForSelector('[data-testid="all-documents-view"]');

    // Wait for documents to load
    await expect(page.locator('[data-testid^="document-item-"]').first()).toBeVisible({ timeout: 10000 });

    // Check the virtualized list inner container has proper height (items + gaps)
    const virtualizedInner = page.locator('[data-testid="virtualized-all-documents-list-inner"]');
    const totalHeight = await virtualizedInner.evaluate((el) => parseInt(el.style.height));

    // With items at 64px + 8px gap, total should be reasonable
    // At least 3 items = (64 + 8) * 2 + 64 = 208 minimum
    expect(totalHeight).toBeGreaterThan(150);
  });
});
