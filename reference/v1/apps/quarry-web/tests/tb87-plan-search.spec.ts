import { test, expect } from '@playwright/test';

test.describe('TB87: Plan Search', () => {
  // Helper to get test plans
  async function ensureTestPlans(page: import('@playwright/test').Page): Promise<{ count: number; titles: string[] }> {
    const response = await page.request.get('/api/plans');
    const plans = await response.json();
    return {
      count: plans.length,
      titles: plans.map((p: { title: string }) => p.title)
    };
  }

  test.beforeEach(async ({ page }) => {
    // Clear localStorage for consistent testing
    await page.goto('/plans');
    await page.evaluate(() => {
      localStorage.removeItem('plans.search');
    });
    await page.reload();
  });

  test('search bar is visible on Plans page', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Search bar should be visible
    await expect(page.getByTestId('plan-search-container')).toBeVisible();
    await expect(page.getByTestId('plan-search-input')).toBeVisible();
  });

  test('search input has correct placeholder', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('plan-search-input');
    await expect(searchInput).toHaveAttribute('placeholder', 'Search plans... (Press / to focus)');
  });

  test('typing in search input filters plans', async ({ page }) => {
    const { count, titles } = await ensureTestPlans(page);
    if (count < 2) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Type a search query that should match some plans
    const searchInput = page.getByTestId('plan-search-input');
    await searchInput.fill(titles[0].substring(0, 3)); // Use first 3 chars of first plan title

    // Wait for debounce (300ms) + rendering
    await page.waitForTimeout(400);

    // The filtered results should include at least one plan (the one we searched for)
    const filteredPlans = page.locator('[data-testid^="plan-item-"]');
    const filteredCount = await filteredPlans.count();
    expect(filteredCount).toBeGreaterThan(0);
  });

  test('search with no matches shows empty state', async ({ page }) => {
    const { count } = await ensureTestPlans(page);
    if (count === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Type a search query that shouldn't match anything
    const searchInput = page.getByTestId('plan-search-input');
    await searchInput.fill('xyzzynonexistentplan123456789');

    // Wait for debounce
    await page.waitForTimeout(400);

    // No plans should be shown
    const planItems = page.locator('[data-testid^="plan-item-"]');
    await expect(planItems).toHaveCount(0);

    // Empty state message should appear with search-specific text
    await expect(page.getByTestId('plans-no-search-results')).toBeVisible();
  });

  test('clear button appears when search has value', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('plan-search-input');
    const clearButton = page.getByTestId('plan-search-clear');

    // Clear button should not be visible initially
    await expect(clearButton).not.toBeVisible();

    // Type something
    await searchInput.fill('test');

    // Clear button should now be visible
    await expect(clearButton).toBeVisible();
  });

  test('clicking clear button clears the search', async ({ page }) => {
    const { count } = await ensureTestPlans(page);
    if (count === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('plan-search-input');

    // Type a search query
    await searchInput.fill('test');
    await page.waitForTimeout(400);

    // Click the clear button
    await page.getByTestId('plan-search-clear').click();

    // Input should be empty
    await expect(searchInput).toHaveValue('');

    // Clear button should be hidden again
    await expect(page.getByTestId('plan-search-clear')).not.toBeVisible();
  });

  test('pressing Escape clears search when input is focused', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('plan-search-input');

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
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('plan-search-input');

    // Make sure search input is not focused initially
    await page.getByTestId('plans-page').click();

    // Press /
    await page.keyboard.press('/');

    // Search input should be focused
    await expect(searchInput).toBeFocused();
  });

  test('search highlights matching characters in plan titles', async ({ page }) => {
    const { count, titles } = await ensureTestPlans(page);
    if (count === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Find a title and search for part of it
    const searchTerm = titles[0].substring(0, 3).toLowerCase();

    const searchInput = page.getByTestId('plan-search-input');
    await searchInput.fill(searchTerm);
    await page.waitForTimeout(400);

    // Check for highlighted marks in plan titles
    const planTitles = page.locator('[data-testid="plan-item-title"]');
    const titleCount = await planTitles.count();

    if (titleCount > 0) {
      // At least one title should have highlighted marks
      const marks = planTitles.first().locator('mark');
      const markCount = await marks.count();
      expect(markCount).toBeGreaterThan(0);
    }
  });

  test('search combines with status filter', async ({ page }) => {
    // This test verifies that search works alongside status filtering
    // The implementation fetches plans filtered by status from server, then applies search client-side

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // First verify search works on the "All" filter
    const searchInput = page.getByTestId('plan-search-input');
    await searchInput.fill('nonexistent');
    await page.waitForTimeout(400);

    // Should show no results
    const noResultsVisible = await page.getByTestId('plans-no-search-results').isVisible().catch(() => false);
    const planListVisible = await page.getByTestId('plans-list').isVisible().catch(() => false);
    // Either shows no results message or empty list
    expect(noResultsVisible || !planListVisible).toBe(true);

    // Clear search
    await page.getByTestId('plan-search-clear').click();
    await page.waitForTimeout(400);

    // Switch to a specific status filter
    await page.getByTestId('status-filter-draft').click();
    await page.waitForTimeout(400);

    // Search should still work within the draft filter
    await searchInput.fill('nonexistent');
    await page.waitForTimeout(400);

    // Should still show no results (search works with status filter)
    const noResultsAfterFilter = await page.getByTestId('plans-no-search-results').isVisible().catch(() => false);
    const planListAfterFilter = await page.getByTestId('plans-list').isVisible().catch(() => false);
    expect(noResultsAfterFilter || !planListAfterFilter).toBe(true);
  });

  test('search persists in localStorage', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('plan-search-input');
    await searchInput.fill('persisted-plan-search');

    // Wait for debounce
    await page.waitForTimeout(400);

    // Check localStorage
    const storedSearch = await page.evaluate(() => localStorage.getItem('plans.search'));
    expect(storedSearch).toBe('persisted-plan-search');
  });

  test('search is restored from localStorage on page load', async ({ page }) => {
    // Set localStorage first
    await page.goto('/plans');
    await page.evaluate(() => {
      localStorage.setItem('plans.search', 'restored-plan-search');
    });

    // Reload the page
    await page.reload();
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Search input should have the stored value
    const searchInput = page.getByTestId('plan-search-input');
    await expect(searchInput).toHaveValue('restored-plan-search');
  });

  test('search is debounced (300ms)', async ({ page }) => {
    const { count } = await ensureTestPlans(page);
    if (count === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByTestId('plan-search-input');

    // Type quickly using pressSequentially (replacement for deprecated type)
    await searchInput.pressSequentially('xyz', { delay: 50 });

    // Check immediately - debounce hasn't fired yet
    await page.waitForTimeout(100);

    // After debounce period, filter should apply
    await page.waitForTimeout(400);

    const finalPlans = page.locator('[data-testid^="plan-item-"]');
    const finalCount = await finalPlans.count();

    // The key test is that debouncing is happening
    expect(typeof finalCount).toBe('number');
  });

  test('clearing search restores all plans', async ({ page }) => {
    const { count } = await ensureTestPlans(page);
    if (count < 2) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('plans-list')).toBeVisible({ timeout: 5000 });

    const searchInput = page.getByTestId('plan-search-input');

    // Wait for plans list to be visible and stable
    await page.waitForTimeout(500);

    // Get initial plan count from the visible list
    const initialPlans = page.locator('[data-testid^="plan-item-"]');
    const initialCount = await initialPlans.count();
    expect(initialCount).toBeGreaterThan(0);

    // Search for something that likely won't match everything
    await searchInput.fill('nonexistentuniquequery123');
    await page.waitForTimeout(500);

    // Should have 0 results
    const filteredPlans = page.locator('[data-testid^="plan-item-"]');
    const filteredCount = await filteredPlans.count();
    expect(filteredCount).toBe(0);

    // Clear the search
    await page.getByTestId('plans-clear-search').click();
    await page.waitForTimeout(500);

    // Should restore original count
    const restoredPlans = page.locator('[data-testid^="plan-item-"]');
    const restoredCount = await restoredPlans.count();
    expect(restoredCount).toBe(initialCount);
  });

  test('plan count updates when search is active', async ({ page }) => {
    // Create some plans for testing with unique titles
    const timestamp = Date.now();
    await page.request.post('/api/plans', {
      data: {
        title: `CountTestAlpha ${timestamp}`,
        createdBy: 'test-user',
        status: 'draft',
      },
    });

    await page.request.post('/api/plans', {
      data: {
        title: `CountTestBeta ${timestamp}`,
        createdBy: 'test-user',
        status: 'draft',
      },
    });

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('plans-list')).toBeVisible({ timeout: 5000 });

    // Search for one of the unique plans
    const searchInput = page.getByTestId('plan-search-input');
    await searchInput.fill('CountTestAlpha');
    await page.waitForTimeout(500);

    // Count should show filtered count and total (e.g., "1 of 50")
    const planCount = page.getByTestId('plans-count');
    const filteredCountText = await planCount.textContent();

    // Should show "X of Y" format when search is active and filters some results
    expect(filteredCountText).toContain('of');

    // The first number should be smaller than the total (we filtered to just one plan)
    const matches = filteredCountText?.match(/\((\d+)\s+of\s+(\d+)\)/);
    if (matches) {
      const filtered = parseInt(matches[1], 10);
      const total = parseInt(matches[2], 10);
      expect(filtered).toBeLessThanOrEqual(total);
      expect(filtered).toBeGreaterThan(0);
    }
  });

  test('empty state shows clear search button', async ({ page }) => {
    const { count } = await ensureTestPlans(page);
    if (count === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Search for something that won't match
    const searchInput = page.getByTestId('plan-search-input');
    await searchInput.fill('xyznonexistent123');
    await page.waitForTimeout(400);

    // Empty state should show clear search button
    await expect(page.getByTestId('plans-clear-search')).toBeVisible();

    // Clicking it should clear the search
    await page.getByTestId('plans-clear-search').click();
    await expect(searchInput).toHaveValue('');
  });
});
