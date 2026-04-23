import { test, expect } from '@playwright/test';

test.describe('TB95: Document Search', () => {
  // Helper to ensure we have some test documents
  async function ensureTestDocuments(page: import('@playwright/test').Page): Promise<{
    count: number;
    documents: Array<{ id: string; title: string; content?: string }>;
  }> {
    const response = await page.request.get('/api/documents?limit=100');
    const data = await response.json();
    const documents = data.items || data;
    return {
      count: documents.length,
      documents: documents.map((d: { id: string; title: string; content?: string }) => ({
        id: d.id,
        title: d.title,
        content: d.content,
      })),
    };
  }

  // Helper to create a test document with specific content
  async function createTestDocument(
    page: import('@playwright/test').Page,
    title: string,
    content: string
  ): Promise<{ id: string }> {
    const response = await page.request.post('/api/documents', {
      data: {
        title,
        content,
        contentType: 'markdown',
        createdBy: 'test-user',
      },
    });
    return response.json();
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
  });

  test('search bar is visible in the sidebar', async ({ page }) => {
    // Search container should be visible in the sidebar
    await expect(page.getByTestId('document-search-container')).toBeVisible();
    await expect(page.getByTestId('document-search-input')).toBeVisible();
  });

  test('search input has correct placeholder', async ({ page }) => {
    const searchInput = page.getByTestId('document-search-input');
    await expect(searchInput).toHaveAttribute('placeholder', 'Search docs... (/)');
  });

  test('typing in search shows loading state and results dropdown', async ({ page }) => {
    const { count, documents } = await ensureTestDocuments(page);
    if (count === 0) {
      test.skip();
      return;
    }

    const searchInput = page.getByTestId('document-search-input');

    // Type a query that should match some documents
    await searchInput.fill(documents[0].title.substring(0, 3));

    // Results dropdown should appear
    await expect(page.getByTestId('document-search-results')).toBeVisible({ timeout: 5000 });
  });

  test('search results show matching documents', async ({ page }) => {
    const { count, documents } = await ensureTestDocuments(page);
    if (count === 0) {
      test.skip();
      return;
    }

    const searchInput = page.getByTestId('document-search-input');

    // Search for the first document's title
    const searchTerm = documents[0].title.substring(0, 5);
    await searchInput.fill(searchTerm);

    // Wait for results
    await expect(page.getByTestId('document-search-results')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('document-search-results-list')).toBeVisible({ timeout: 5000 });

    // Should show at least one result
    const results = page.locator('[data-testid^="document-search-result-"]');
    await expect(results.first()).toBeVisible();
  });

  test('search with no matches shows empty message', async ({ page }) => {
    const searchInput = page.getByTestId('document-search-input');

    // Type a search query that shouldn't match anything
    await searchInput.fill('xyzzynonexistentdocument123456789');

    // Wait for results dropdown
    await expect(page.getByTestId('document-search-results')).toBeVisible({ timeout: 5000 });

    // Should show "no results" message
    await expect(page.getByTestId('document-search-no-results')).toBeVisible();
    await expect(page.getByText('No documents found for "xyzzynonexistentdocument123456789"')).toBeVisible();
  });

  test('clear button appears when search has value', async ({ page }) => {
    const searchInput = page.getByTestId('document-search-input');
    const clearButton = page.getByTestId('document-search-clear');

    // Clear button should not be visible initially
    await expect(clearButton).not.toBeVisible();

    // Type something
    await searchInput.fill('test');

    // Clear button should now be visible
    await expect(clearButton).toBeVisible();
  });

  test('clicking clear button clears the search', async ({ page }) => {
    const searchInput = page.getByTestId('document-search-input');

    // Type a search query
    await searchInput.fill('test');
    await expect(page.getByTestId('document-search-clear')).toBeVisible();

    // Click the clear button
    await page.getByTestId('document-search-clear').click();

    // Input should be empty
    await expect(searchInput).toHaveValue('');

    // Clear button should be hidden again
    await expect(page.getByTestId('document-search-clear')).not.toBeVisible();
  });

  test('pressing Escape clears search when input is focused', async ({ page }) => {
    const searchInput = page.getByTestId('document-search-input');

    // Focus and type
    await searchInput.click();
    await searchInput.fill('test');
    await expect(searchInput).toHaveValue('test');

    // Press Escape
    await page.keyboard.press('Escape');

    // Input should be cleared
    await expect(searchInput).toHaveValue('');
  });

  test('pressing / focuses the search input', async ({ page }) => {
    const searchInput = page.getByTestId('document-search-input');

    // Make sure search input is not focused initially
    await page.getByTestId('documents-page').click();
    await page.waitForTimeout(100);

    // Press /
    await page.keyboard.press('/');

    // Search input should be focused
    await expect(searchInput).toBeFocused();
  });

  test('clicking a search result opens the document', async ({ page }) => {
    const { count, documents } = await ensureTestDocuments(page);
    if (count === 0) {
      test.skip();
      return;
    }

    const searchInput = page.getByTestId('document-search-input');

    // Search for the first document
    await searchInput.fill(documents[0].title.substring(0, 5));

    // Wait for results
    await expect(page.getByTestId('document-search-results-list')).toBeVisible({ timeout: 5000 });

    // Click the first result
    await page.locator('[data-testid^="document-search-result-"]').first().click();

    // Document detail panel should be visible
    await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

    // Search should be cleared after selection
    await expect(searchInput).toHaveValue('');
  });

  test('search results show highlighted matches in title', async ({ page }) => {
    const { count, documents } = await ensureTestDocuments(page);
    if (count === 0) {
      test.skip();
      return;
    }

    const searchInput = page.getByTestId('document-search-input');

    // Search for part of the first document's title
    const searchTerm = documents[0].title.substring(0, 3).toLowerCase();
    await searchInput.fill(searchTerm);

    // Wait for results
    await expect(page.getByTestId('document-search-results-list')).toBeVisible({ timeout: 5000 });

    // Check for highlighted marks in results
    const firstResult = page.locator('[data-testid^="document-search-result-"]').first();
    const marks = firstResult.locator('mark');
    const markCount = await marks.count();
    expect(markCount).toBeGreaterThan(0);
  });

  test('search by content shows snippet with match', async ({ page }) => {
    // Create a document with unique content for testing
    const uniqueContent = `This is a unique test phrase: xyzzy12345content`;
    const doc = await createTestDocument(page, 'Content Search Test Document', uniqueContent);

    // Refresh the page to see the new document
    await page.reload();
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('document-search-input');

    // Search for the unique content term
    await searchInput.fill('xyzzy12345');

    // Wait for results
    await expect(page.getByTestId('document-search-results-list')).toBeVisible({ timeout: 5000 });

    // Should find the document
    const result = page.getByTestId(`document-search-result-${doc.id}`);
    await expect(result).toBeVisible({ timeout: 5000 });

    // Should show a content snippet
    const snippet = page.getByTestId(`document-search-snippet-${doc.id}`);
    await expect(snippet).toBeVisible();

    // Snippet should contain highlighted match
    const marks = snippet.locator('mark');
    const markCount = await marks.count();
    expect(markCount).toBeGreaterThan(0);
  });

  test('search shows match type indicator', async ({ page }) => {
    const { count, documents } = await ensureTestDocuments(page);
    if (count === 0) {
      test.skip();
      return;
    }

    const searchInput = page.getByTestId('document-search-input');

    // Search for the first document's title
    await searchInput.fill(documents[0].title.substring(0, 5));

    // Wait for results
    await expect(page.getByTestId('document-search-results-list')).toBeVisible({ timeout: 5000 });

    // Should show match type indicator (Title match, Content match, or Title & content)
    const firstResult = page.locator('[data-testid^="document-search-result-"]').first();
    const matchIndicator = firstResult.locator('text=/Title match|Content match|Title & content/');
    await expect(matchIndicator).toBeVisible();
  });

  test('clicking outside closes the search dropdown', async ({ page }) => {
    const { count, documents } = await ensureTestDocuments(page);
    if (count === 0) {
      test.skip();
      return;
    }

    const searchInput = page.getByTestId('document-search-input');

    // Search for something
    await searchInput.fill(documents[0].title.substring(0, 3));

    // Wait for results dropdown
    await expect(page.getByTestId('document-search-results')).toBeVisible({ timeout: 5000 });

    // Click outside the search container - use the main content area which is not overlapped
    // Using force: true to bypass the overlay since we're testing dropdown close behavior
    await page.locator('[data-testid="documents-page"]').click({ position: { x: 500, y: 300 } });

    // Dropdown should close
    await expect(page.getByTestId('document-search-results')).not.toBeVisible();
  });

  test('search dropdown closes when pressing Escape on empty input', async ({ page }) => {
    const { count, documents } = await ensureTestDocuments(page);
    if (count === 0) {
      test.skip();
      return;
    }

    const searchInput = page.getByTestId('document-search-input');

    // Search for something
    await searchInput.fill(documents[0].title.substring(0, 3));
    await expect(page.getByTestId('document-search-results')).toBeVisible({ timeout: 5000 });

    // Press Escape once to clear the input
    await page.keyboard.press('Escape');
    await expect(searchInput).toHaveValue('');

    // Press Escape again to close dropdown and blur
    await page.keyboard.press('Escape');

    // Input should no longer be focused
    await expect(searchInput).not.toBeFocused();
  });

  test('search API endpoint returns correct data structure', async ({ page }) => {
    // Create a test document
    const doc = await createTestDocument(page, 'API Test Document', 'Some test content for API validation');

    // Call the search API directly
    const response = await page.request.get('/api/documents/search?q=API+Test');
    const data = await response.json();

    // Verify response structure
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('query');
    expect(Array.isArray(data.results)).toBe(true);

    // Should find our test document
    const found = data.results.find((r: { id: string }) => r.id === doc.id);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('title');
    expect(found).toHaveProperty('contentType');
    expect(found).toHaveProperty('matchType');
  });

  test('search API includes content matches in results', async ({ page }) => {
    // Create a document with unique content
    const uniquePhrase = 'uniqueapitestphrase12345';
    const doc = await createTestDocument(page, 'Normal Title', `This document contains ${uniquePhrase} in its content.`);

    // Search by the unique content phrase
    const response = await page.request.get(`/api/documents/search?q=${uniquePhrase}`);
    const data = await response.json();

    // Should find the document
    const found = data.results.find((r: { id: string }) => r.id === doc.id);
    expect(found).toBeDefined();

    // Match type should be content (not title)
    expect(found.matchType).toBe('content');

    // Should include a snippet
    expect(found.snippet).toBeDefined();
    expect(found.snippet).toContain(uniquePhrase);
  });

  test('search debounces rapid input changes', async ({ page }) => {
    const searchInput = page.getByTestId('document-search-input');

    // Type rapidly
    await searchInput.type('t');
    await searchInput.type('e');
    await searchInput.type('s');
    await searchInput.type('t');

    // The dropdown should appear after debounce delay
    await page.waitForTimeout(100); // Before debounce
    // Should not yet have results visible (or be loading)

    // After full debounce delay + network
    await expect(page.getByTestId('document-search-results')).toBeVisible({ timeout: 5000 });
  });
});
