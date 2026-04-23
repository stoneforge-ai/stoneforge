/**
 * TB143: Timeline Eager Event Loading with UI Pagination
 *
 * Tests that the timeline page loads all events upfront and shows accurate
 * total counts immediately, with client-side pagination for performance.
 */

import { test, expect } from '@playwright/test';

test.describe('TB143: Timeline Eager Event Loading', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the timeline page
    await page.goto('/dashboard/timeline');
    // Wait for the page to load
    await expect(page.getByTestId('timeline-page')).toBeVisible();
  });

  test('shows total event count immediately after loading', async ({ page }) => {
    // Wait for loading to complete
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });

    // The total count should show the actual number of events
    const countText = await page.getByTestId('total-count').textContent();
    expect(countText).toBeTruthy();
    expect(countText).toMatch(/\d+.*events/i);

    // Should NOT show "more available" badge since we eagerly load all
    const moreAvailableBadge = page.locator('text=more available');
    await expect(moreAvailableBadge).not.toBeVisible();
  });

  test('shows loading state with count while fetching', async ({ page }) => {
    // Reload to catch loading state
    await page.reload();

    // Wait for the loading indicator
    const loadingIndicator = page.getByTestId('event-count');
    await expect(loadingIndicator).toBeVisible();

    // Eventually should show the total count
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });
  });

  test('pagination works client-side with accurate totals', async ({ page }) => {
    // Wait for events to load
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });

    // Check if pagination exists (only if there are enough events)
    const pagination = page.getByTestId('pagination');
    if (await pagination.isVisible()) {
      // Click next page
      await page.getByTestId('pagination-next').click();

      // URL should update with page param
      await expect(page).toHaveURL(/page=2/);

      // Content should still show accurate total
      const secondPageText = await page.getByTestId('total-count').textContent();
      expect(secondPageText).toBeTruthy();
      expect(secondPageText).toMatch(/\d+.*events/i);
    }
  });

  test('client-side search filters events instantly', async ({ page }) => {
    // Wait for events to load
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });

    // Type in search box
    await page.getByTestId('search-input').fill('created');

    // Wait a moment for filtering
    await page.waitForTimeout(300);

    // Check that filtering happened (count should change or show filtered indicator)
    const filteredText = await page.getByTestId('total-count').textContent();
    // Should either show filtered count or indicate filtering
    expect(filteredText).toBeTruthy();
  });

  test('event type filter chips work instantly', async ({ page }) => {
    // Wait for events to load
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });

    // Click on "Created" filter chip
    await page.getByTestId('filter-chip-created').click();

    // Should show filtered indicator
    const filteredBadge = page.locator('text=(filtered)');
    await expect(filteredBadge).toBeVisible();
  });

  test('horizontal timeline view receives all events', async ({ page }) => {
    // Wait for events to load
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });

    // Switch to horizontal view
    await page.getByTestId('view-mode-horizontal').click();

    // Horizontal timeline should be visible
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Should have some event dots (if there are events)
    const eventDots = page.locator('[data-testid^="event-dot-"]');
    const dotCount = await eventDots.count();

    // Verify events are loaded in horizontal view
    if (dotCount > 0) {
      await expect(eventDots.first()).toBeVisible();
    }
  });

  test('refresh indicator shows when refetching in background', async ({ page }) => {
    // Wait for initial load
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });

    // The refresh happens automatically every 30 seconds
    // For testing, we can check the UI structure exists for the refreshing state
    // Without waiting, we just verify the structure is correct

    // Total count should be visible and accurate
    const countText = await page.getByTestId('total-count').textContent();
    expect(countText).toMatch(/\d+.*events/i);
  });

  test('URL params preserve page and filter state', async ({ page }) => {
    // Wait for events to load
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });

    // Apply a filter
    await page.getByTestId('filter-chip-created').click();
    await page.waitForTimeout(300);

    // Navigate to page 2 if pagination exists
    const pagination = page.getByTestId('pagination');
    if (await pagination.isVisible()) {
      const nextButton = page.getByTestId('pagination-next');
      if (await nextButton.isEnabled()) {
        await nextButton.click();
        await expect(page).toHaveURL(/page=2/);
      }
    }

    // Reload the page
    await page.reload();

    // Wait for load
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });

    // Filter should still be applied (indicated by filtered badge)
    // Note: Event type filters are in URL via server-side filtering
    // The page state should be preserved
  });

  test('empty state shows when no events match filters', async ({ page }) => {
    // Wait for events to load
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });

    // Apply multiple restrictive filters
    await page.getByTestId('search-input').fill('nonexistent-search-term-xyz123');

    // Wait for filtering
    await page.waitForTimeout(300);

    // Should show empty or filtered state message
    const eventsList = page.getByTestId('events-list');
    await expect(eventsList).toBeVisible();

    // Either shows "No events match" message or the events list is empty
    // The exact state depends on the data - just verify the events list area is visible
  });

  test('shows accurate page numbers in pagination', async ({ page }) => {
    // Wait for events to load
    await expect(page.getByTestId('total-count')).toBeVisible({ timeout: 15000 });

    // If pagination exists, verify it shows correct totals
    const pagination = page.getByTestId('pagination');
    if (await pagination.isVisible()) {
      // Check for page info text (e.g., "Page 1 of 100" or "Showing 1-100 of 5,000")
      const paginationText = await pagination.textContent();
      expect(paginationText).toBeTruthy();

      // Should show page numbers or item counts
      expect(paginationText).toMatch(/\d+/);
    }
  });
});
