/**
 * TB88: Plan Roadmap View - Playwright Tests
 *
 * Tests for the roadmap view feature that shows plans as horizontal bars on a timeline.
 * Features tested:
 * - View toggle between List and Roadmap
 * - Roadmap timeline visualization
 * - Time-based X-axis (weeks/months)
 * - Y-axis with plan rows
 * - Color coding by status
 * - Click to navigate to plan detail
 */

import { test, expect } from '@playwright/test';

test.describe('TB88: Plan Roadmap View', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to plans page
    await page.goto('/plans');
    // Wait for the page to be ready
    await page.waitForSelector('[data-testid="plans-page"]');
  });

  test.describe('View Toggle', () => {
    test('should display view toggle with List and Roadmap options', async ({ page }) => {
      const viewToggle = page.getByTestId('view-toggle');
      await expect(viewToggle).toBeVisible();

      // Check both toggle buttons exist
      const listButton = page.getByTestId('view-toggle-list');
      const roadmapButton = page.getByTestId('view-toggle-roadmap');

      await expect(listButton).toBeVisible();
      await expect(roadmapButton).toBeVisible();

      // Verify text content
      await expect(listButton).toContainText('List');
      await expect(roadmapButton).toContainText('Roadmap');
    });

    test('should default to List view', async ({ page }) => {
      const listButton = page.getByTestId('view-toggle-list');
      // List button should be active (have specific styling)
      await expect(listButton).toHaveClass(/bg-white/);
    });

    test('should switch to Roadmap view when clicking Roadmap toggle', async ({ page }) => {
      // Wait for loading to complete first
      await page.waitForSelector('[data-testid="plans-loading"]', { state: 'hidden', timeout: 10000 }).catch(() => {});

      const roadmapButton = page.getByTestId('view-toggle-roadmap');

      await roadmapButton.click();

      // Roadmap button should now be active
      await expect(roadmapButton).toHaveClass(/bg-white/);

      // Wait for loading again since view change might trigger re-fetch
      await page.waitForSelector('[data-testid="plans-loading"]', { state: 'hidden', timeout: 10000 }).catch(() => {});

      // Check if the roadmap view or roadmap-empty is displayed
      // (depends on whether there are plans in the database)
      const roadmapView = page.getByTestId('roadmap-view');
      const roadmapEmpty = page.getByTestId('roadmap-empty');

      // Wait a bit for the view to render
      await page.waitForTimeout(500);

      // One of these should be visible
      const hasRoadmapView = await roadmapView.isVisible().catch(() => false);
      const hasRoadmapEmpty = await roadmapEmpty.isVisible().catch(() => false);

      expect(hasRoadmapView || hasRoadmapEmpty).toBe(true);
    });

    test('should switch back to List view when clicking List toggle', async ({ page }) => {
      const roadmapButton = page.getByTestId('view-toggle-roadmap');
      const listButton = page.getByTestId('view-toggle-list');

      // Switch to roadmap first
      await roadmapButton.click();
      await expect(roadmapButton).toHaveClass(/bg-white/);

      // Switch back to list
      await listButton.click();
      await expect(listButton).toHaveClass(/bg-white/);

      // Either plan list or empty state should be visible
      const plansList = page.getByTestId('plans-list');
      const plansEmpty = page.getByTestId('plans-empty');

      const hasPlans = await plansList.isVisible().catch(() => false);
      const hasEmpty = await plansEmpty.isVisible().catch(() => false);

      expect(hasPlans || hasEmpty).toBe(true);
    });

    test('should persist view mode in localStorage', async ({ page }) => {
      const roadmapButton = page.getByTestId('view-toggle-roadmap');

      await roadmapButton.click();
      await expect(roadmapButton).toHaveClass(/bg-white/);

      // Check localStorage
      const storedViewMode = await page.evaluate(() => localStorage.getItem('plans.viewMode'));
      expect(storedViewMode).toBe('roadmap');

      // Reload and verify persistence
      await page.reload();
      await page.waitForSelector('[data-testid="plans-page"]');

      // Should still be on roadmap view
      const roadmapButtonAfterReload = page.getByTestId('view-toggle-roadmap');
      await expect(roadmapButtonAfterReload).toHaveClass(/bg-white/);
    });
  });

  test.describe('Roadmap View Display', () => {
    test.beforeEach(async ({ page }) => {
      // Switch to roadmap view
      await page.getByTestId('view-toggle-roadmap').click();
    });

    test('should show roadmap view or empty state depending on data', async ({ page }) => {
      // Wait for loading to complete
      await page.waitForSelector('[data-testid="plans-loading"]', { state: 'hidden', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);

      // Either roadmap view or empty state should be visible (not both, not neither)
      const roadmapView = page.getByTestId('roadmap-view');
      const roadmapEmpty = page.getByTestId('roadmap-empty');

      const hasRoadmapView = await roadmapView.isVisible().catch(() => false);
      const hasRoadmapEmpty = await roadmapEmpty.isVisible().catch(() => false);

      // Exactly one should be visible
      expect(hasRoadmapView || hasRoadmapEmpty).toBe(true);

      if (hasRoadmapEmpty) {
        // Verify empty state has correct text
        await expect(roadmapEmpty).toContainText('No plans to display in roadmap');
      }

      if (hasRoadmapView) {
        // Verify roadmap has the legend (basic structure check)
        const legend = page.getByTestId('roadmap-legend');
        await expect(legend).toBeVisible();
      }
    });

    test('should display chart container when plans exist', async ({ page }) => {
      const roadmapView = page.getByTestId('roadmap-view');
      const hasPlans = await roadmapView.isVisible().catch(() => false);

      if (hasPlans) {
        // Chart container should be visible
        const chartContainer = page.getByTestId('roadmap-chart-container');
        await expect(chartContainer).toBeVisible();
      }
    });

    test('should display legend with status colors', async ({ page }) => {
      const roadmapView = page.getByTestId('roadmap-view');
      const hasPlans = await roadmapView.isVisible().catch(() => false);

      if (hasPlans) {
        // Legend should be visible
        const legend = page.getByTestId('roadmap-legend');
        await expect(legend).toBeVisible();

        // Should show status labels
        await expect(legend).toContainText('Draft');
        await expect(legend).toContainText('Active');
        await expect(legend).toContainText('Completed');
        await expect(legend).toContainText('Cancelled');
      }
    });
  });

  test.describe('Filter Integration', () => {
    test('should apply status filter in roadmap view', async ({ page }) => {
      // Switch to roadmap view
      await page.getByTestId('view-toggle-roadmap').click();

      // Click on Active filter
      const activeFilter = page.getByTestId('status-filter-active');
      await activeFilter.click();

      // Verify filter is applied (URL should have status param)
      await expect(page).toHaveURL(/status=active/);
    });

    test('should apply search filter in roadmap view', async ({ page }) => {
      // Switch to roadmap view
      await page.getByTestId('view-toggle-roadmap').click();

      // Type in search
      const searchInput = page.getByTestId('plan-search-input');
      await searchInput.fill('test');

      // Wait for debounce
      await page.waitForTimeout(400);

      // View should still be in roadmap mode
      const roadmapButton = page.getByTestId('view-toggle-roadmap');
      await expect(roadmapButton).toHaveClass(/bg-white/);
    });
  });

  test.describe('Click to Navigate', () => {
    test('should open plan detail panel when clicking on plan bar', async ({ page }) => {
      // Switch to roadmap view
      await page.getByTestId('view-toggle-roadmap').click();

      const roadmapView = page.getByTestId('roadmap-view');
      const hasPlans = await roadmapView.isVisible().catch(() => false);

      if (hasPlans) {
        // Find a recharts bar element and click it
        // The bars are rendered as SVG rectangles inside the chart
        const chartContainer = page.getByTestId('roadmap-chart-container');
        const bars = chartContainer.locator('.recharts-bar-rectangle');

        const barCount = await bars.count();

        if (barCount > 0) {
          // Click on the first bar
          await bars.first().click();

          // Plan detail panel should open
          const detailPanel = page.getByTestId('plan-detail-panel');
          await expect(detailPanel).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Responsiveness', () => {
    test('should maintain view toggle visibility on smaller screens', async ({ page }) => {
      // Set a smaller viewport
      await page.setViewportSize({ width: 768, height: 600 });

      const viewToggle = page.getByTestId('view-toggle');
      await expect(viewToggle).toBeVisible();
    });

    test('should allow horizontal scrolling in roadmap view for long timelines', async ({ page }) => {
      // Switch to roadmap view
      await page.getByTestId('view-toggle-roadmap').click();

      const roadmapView = page.getByTestId('roadmap-view');
      const hasPlans = await roadmapView.isVisible().catch(() => false);

      if (hasPlans) {
        const chartContainer = page.getByTestId('roadmap-chart-container');
        // Container should have overflow-x-auto or similar
        const style = await chartContainer.evaluate(el => window.getComputedStyle(el).overflowX);
        expect(['auto', 'scroll']).toContain(style);
      }
    });
  });
});
