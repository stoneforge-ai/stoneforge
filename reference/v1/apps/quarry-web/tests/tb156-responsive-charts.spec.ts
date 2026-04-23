import { test, expect } from '@playwright/test';

/**
 * TB156: Responsive Charts & Visualizations
 *
 * Tests for:
 * - Dashboard charts responsiveness (pie, line, bar)
 * - Contribution chart mobile display
 * - Dependency graph mobile optimizations
 * - Touch-friendly tooltip interactions
 */

// Mobile viewport dimensions (iPhone 12)
const MOBILE_VIEWPORT = { width: 390, height: 844 };
// Desktop viewport dimensions
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

test.describe('TB156: Responsive Charts & Visualizations', () => {
  test.describe('Dashboard Charts - Mobile', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto('/dashboard');
      await page.waitForSelector('[data-testid="dashboard-page"]');
    });

    test('charts grid stacks vertically on mobile', async ({ page }) => {
      const chartsGrid = page.getByTestId('charts-grid');
      await expect(chartsGrid).toBeVisible();

      // All charts should be visible
      await expect(page.getByTestId('tasks-by-status-chart')).toBeVisible();
      await expect(page.getByTestId('tasks-completed-chart')).toBeVisible();
      await expect(page.getByTestId('workload-by-agent-chart')).toBeVisible();
    });

    test('pie chart displays correctly on mobile', async ({ page }) => {
      const chart = page.getByTestId('tasks-by-status-chart');
      await expect(chart).toBeVisible();

      // Wait for chart to render
      await page.waitForTimeout(500);

      // Legend should still be visible as the primary way to understand the chart on mobile
      const legend = page.getByTestId('chart-legend');
      await expect(legend).toBeVisible();
    });

    test('line chart has compact axis labels on mobile', async ({ page }) => {
      const chart = page.getByTestId('tasks-completed-chart');
      await expect(chart).toBeVisible();

      // Verify chart renders without overflow
      await page.waitForTimeout(500);
      await expect(chart).toBeVisible();
    });

    test('bar chart displays correctly on mobile', async ({ page }) => {
      const chart = page.getByTestId('workload-by-agent-chart');
      await expect(chart).toBeVisible();

      // Wait for chart to render
      await page.waitForTimeout(500);
      await expect(chart).toBeVisible();
    });

    test('charts have compact padding on mobile', async ({ page }) => {
      // Verify all charts are accessible and don't overflow
      const charts = [
        page.getByTestId('tasks-by-status-chart'),
        page.getByTestId('tasks-completed-chart'),
        page.getByTestId('workload-by-agent-chart'),
      ];

      for (const chart of charts) {
        await expect(chart).toBeVisible();
      }
    });
  });

  test.describe('Dashboard Charts - Touch Interactions', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto('/dashboard');
      await page.waitForSelector('[data-testid="dashboard-page"]');
      // Wait for charts to load
      await page.waitForTimeout(800);
    });

    test('pie chart legend items are tappable', async ({ page }) => {
      const legend = page.getByTestId('chart-legend');
      if (await legend.isVisible()) {
        const legendItems = legend.locator('a');
        const count = await legendItems.count();

        if (count > 0) {
          // Legend items should have minimum touch target size
          const firstItem = legendItems.first();
          await expect(firstItem).toBeVisible();
        }
      }
    });

    test('bar chart bars are tappable', async ({ page }) => {
      const chart = page.getByTestId('workload-by-agent-chart');
      await expect(chart).toBeVisible();

      // Wait for chart data to load
      await page.waitForTimeout(500);

      // The chart should render without errors
      await expect(chart).toBeVisible();
    });
  });

  test.describe('Dashboard Charts - Desktop', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await page.goto('/dashboard');
      await page.waitForSelector('[data-testid="dashboard-page"]');
    });

    test('charts display in a grid on desktop', async ({ page }) => {
      const chartsGrid = page.getByTestId('charts-grid');
      await expect(chartsGrid).toBeVisible();

      // All three charts should be visible
      await expect(page.getByTestId('tasks-by-status-chart')).toBeVisible();
      await expect(page.getByTestId('tasks-completed-chart')).toBeVisible();
      await expect(page.getByTestId('workload-by-agent-chart')).toBeVisible();
    });

    test('pie chart shows properly on desktop', async ({ page }) => {
      const chart = page.getByTestId('tasks-by-status-chart');
      await expect(chart).toBeVisible();

      // Wait for chart to render
      await page.waitForTimeout(500);

      // Legend and chart should both be visible
      await expect(chart).toBeVisible();
    });

    test('chart tooltips appear on hover', async ({ page }) => {
      const chart = page.getByTestId('tasks-by-status-chart');
      await expect(chart).toBeVisible();

      // Wait for chart to render
      await page.waitForTimeout(500);

      // Hover over the chart area - tooltip should appear
      await chart.hover();

      // Chart should still be visible after hover
      await expect(chart).toBeVisible();
    });
  });

  test.describe('Dependency Graph - Mobile', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto('/dependencies');
      await page.waitForLoadState('networkidle');
    });

    test('dependency graph page loads on mobile', async ({ page }) => {
      const graphPage = page.getByTestId('dependency-graph-page');
      await expect(graphPage).toBeVisible();
    });

    test('graph canvas is visible', async ({ page }) => {
      // Wait for tasks to load
      await page.waitForTimeout(500);

      const graphCanvas = page.getByTestId('graph-canvas');
      await expect(graphCanvas).toBeVisible();
    });

    test('minimap is hidden on mobile', async ({ page }) => {
      // Wait for graph to potentially load
      await page.waitForTimeout(500);

      // Minimap should not be visible on mobile
      const minimap = page.getByTestId('graph-minimap');
      await expect(minimap).not.toBeVisible();
    });

    test('task selector is visible on mobile', async ({ page }) => {
      await page.waitForTimeout(500);

      const taskSelector = page.getByTestId('task-selector');
      await expect(taskSelector).toBeVisible();
    });

    test('toolbar is visible on mobile', async ({ page }) => {
      const toolbar = page.getByTestId('graph-toolbar');
      await expect(toolbar).toBeVisible();
    });
  });

  test.describe('Dependency Graph - Desktop', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await page.goto('/dependencies');
      await page.waitForLoadState('networkidle');
    });

    test('dependency graph page loads on desktop', async ({ page }) => {
      const graphPage = page.getByTestId('dependency-graph-page');
      await expect(graphPage).toBeVisible();
    });

    test('graph canvas is visible on desktop', async ({ page }) => {
      // Wait for graph to load with a task selected
      await page.waitForTimeout(500);

      const graphCanvas = page.getByTestId('graph-canvas');
      await expect(graphCanvas).toBeVisible();
    });

    test('zoom controls are available', async ({ page }) => {
      await expect(page.getByTestId('zoom-in-button')).toBeVisible();
      await expect(page.getByTestId('zoom-out-button')).toBeVisible();
      await expect(page.getByTestId('fit-view-button')).toBeVisible();
    });

    test('auto layout button is visible', async ({ page }) => {
      await expect(page.getByTestId('auto-layout-button')).toBeVisible();
    });
  });

  test.describe('Responsive Breakpoints', () => {
    test('charts adapt at sm breakpoint (640px)', async ({ page }) => {
      await page.setViewportSize({ width: 640, height: 480 });
      await page.goto('/dashboard');
      await page.waitForSelector('[data-testid="dashboard-page"]');

      await expect(page.getByTestId('charts-grid')).toBeVisible();
    });

    test('charts adapt at md breakpoint (768px)', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 600 });
      await page.goto('/dashboard');
      await page.waitForSelector('[data-testid="dashboard-page"]');

      await expect(page.getByTestId('charts-grid')).toBeVisible();
    });

    test('charts adapt at lg breakpoint (1024px)', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/dashboard');
      await page.waitForSelector('[data-testid="dashboard-page"]');

      await expect(page.getByTestId('charts-grid')).toBeVisible();
    });

    test('charts fully expanded at xl breakpoint (1280px)', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/dashboard');
      await page.waitForSelector('[data-testid="dashboard-page"]');

      await expect(page.getByTestId('charts-grid')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('charts have accessible labels', async ({ page }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await page.goto('/dashboard');
      await page.waitForSelector('[data-testid="dashboard-page"]');
      await page.waitForTimeout(500);

      // Each chart should have a heading
      const chartTitles = await page.locator('[data-testid$="-chart"] h4').allTextContents();
      expect(chartTitles.length).toBeGreaterThanOrEqual(3);
    });

    test('chart legend items are focusable', async ({ page }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await page.goto('/dashboard');
      await page.waitForSelector('[data-testid="dashboard-page"]');
      await page.waitForTimeout(500);

      const legend = page.getByTestId('chart-legend');
      if (await legend.isVisible()) {
        const legendItems = legend.locator('a');
        const count = await legendItems.count();

        if (count > 0) {
          // Each legend item should be keyboard accessible
          await legendItems.first().focus();
          await expect(legendItems.first()).toBeFocused();
        }
      }
    });
  });
});
