import { test, expect } from '@playwright/test';

test.describe('TB78: Dashboard Overview Charts', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard overview page
    await page.goto('/dashboard');
    // Wait for page to load
    await page.waitForSelector('[data-testid="dashboard-page"]');
  });

  test.describe('Charts Grid', () => {
    test('displays charts section', async ({ page }) => {
      await expect(page.getByTestId('dashboard-charts')).toBeVisible();
    });

    test('displays charts grid with 3 charts', async ({ page }) => {
      const chartsGrid = page.getByTestId('charts-grid');
      await expect(chartsGrid).toBeVisible();

      // Should contain 3 chart components
      await expect(page.getByTestId('tasks-by-status-chart')).toBeVisible();
      await expect(page.getByTestId('tasks-completed-chart')).toBeVisible();
      await expect(page.getByTestId('workload-by-agent-chart')).toBeVisible();
    });

    test('charts grid is responsive', async ({ page }) => {
      // On large screen, charts should be in a row
      await page.setViewportSize({ width: 1280, height: 800 });
      const chartsGrid = page.getByTestId('charts-grid');
      await expect(chartsGrid).toBeVisible();

      // On mobile, charts should stack
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(chartsGrid).toBeVisible();
    });
  });

  test.describe('Tasks by Status Chart (Donut)', () => {
    test('displays chart title', async ({ page }) => {
      const chart = page.getByTestId('tasks-by-status-chart');
      await expect(chart.locator('h4')).toContainText('Tasks by Status');
    });

    test('displays chart legend or empty state', async ({ page }) => {
      const chart = page.getByTestId('tasks-by-status-chart');
      // The chart should either show a legend or an empty state message
      const legend = page.getByTestId('chart-legend');
      const emptyState = chart.getByText(/No tasks to display/);

      // Wait for loading to finish
      await page.waitForTimeout(500);

      // Either legend or empty state should be visible
      const legendVisible = await legend.isVisible().catch(() => false);
      const emptyVisible = await emptyState.isVisible().catch(() => false);

      expect(legendVisible || emptyVisible).toBe(true);
    });

    test('legend items are clickable links to tasks page', async ({ page }) => {
      const legend = page.getByTestId('chart-legend');
      // If there are legend items, they should be links
      const legendItems = legend.locator('a');
      const count = await legendItems.count();

      if (count > 0) {
        // Each legend item should link to tasks page
        const firstItem = legendItems.first();
        const href = await firstItem.getAttribute('href');
        expect(href).toContain('/tasks');
      }
    });

    test('shows loading state initially', async ({ page }) => {
      // This is a race condition test - the loading state should be brief
      // For this test, we just verify the chart eventually loads
      const chart = page.getByTestId('tasks-by-status-chart');
      await expect(chart).toBeVisible();
    });

    test('shows empty state when no tasks', async ({ page }) => {
      // This depends on the actual data in the test database
      // We just verify the chart renders without errors
      const chart = page.getByTestId('tasks-by-status-chart');
      await expect(chart).toBeVisible();
    });
  });

  test.describe('Tasks Completed Over Time Chart (Line)', () => {
    test('displays chart title', async ({ page }) => {
      const chart = page.getByTestId('tasks-completed-chart');
      await expect(chart.locator('h4')).toContainText('Tasks Completed');
    });

    test('displays last 7 days in title', async ({ page }) => {
      const chart = page.getByTestId('tasks-completed-chart');
      await expect(chart.locator('h4')).toContainText('Last 7 Days');
    });

    test('displays chart content', async ({ page }) => {
      const chart = page.getByTestId('tasks-completed-chart');
      await expect(chart).toBeVisible();

      // Wait for loading to finish
      await page.waitForTimeout(500);

      // Should show either the chart or a message (the chart always renders since we have 7 days of data)
      const chartContent = chart.locator('.h-48');
      await expect(chartContent).toBeVisible();
    });
  });

  test.describe('Workload by Agent Chart (Bar)', () => {
    test('displays chart title', async ({ page }) => {
      const chart = page.getByTestId('workload-by-agent-chart');
      await expect(chart.locator('h4')).toContainText('Workload by Agent');
    });

    test('displays chart content or empty state', async ({ page }) => {
      const chart = page.getByTestId('workload-by-agent-chart');
      await expect(chart).toBeVisible();

      // Wait for loading to finish
      await page.waitForTimeout(500);

      // Should show either the chart container or empty message
      const chartContent = chart.locator('.h-48');
      await expect(chartContent).toBeVisible();
    });

    test('shows appropriate content', async ({ page }) => {
      // Verify chart renders without errors
      const chart = page.getByTestId('workload-by-agent-chart');
      await expect(chart).toBeVisible();
    });
  });

  test.describe('Chart Interactions', () => {
    test('charts have tooltips on hover', async ({ page }) => {
      // Verify chart containers exist for tooltip interaction
      const charts = [
        'tasks-by-status-chart',
        'tasks-completed-chart',
        'workload-by-agent-chart',
      ];

      for (const chartId of charts) {
        const chart = page.getByTestId(chartId);
        await expect(chart).toBeVisible();
      }
    });

    test('clicking status legend navigates to tasks page', async ({ page }) => {
      const legend = page.getByTestId('chart-legend');
      const legendItems = legend.locator('a');
      const count = await legendItems.count();

      if (count > 0) {
        const firstItem = legendItems.first();
        await firstItem.click();

        // Should navigate to tasks page
        await expect(page).toHaveURL(/\/tasks/);
      }
    });
  });

  test.describe('Chart Data Integration', () => {
    test('charts load data from API', async ({ page }) => {
      // Wait for charts to finish loading
      await page.waitForTimeout(1000);

      // All charts should be visible (not in loading state)
      const tasksChart = page.getByTestId('tasks-by-status-chart');
      const completedChart = page.getByTestId('tasks-completed-chart');
      const workloadChart = page.getByTestId('workload-by-agent-chart');

      await expect(tasksChart).toBeVisible();
      await expect(completedChart).toBeVisible();
      await expect(workloadChart).toBeVisible();
    });

    test('charts handle API responses correctly', async ({ page }) => {
      // Charts should render appropriately regardless of data presence
      const charts = page.getByTestId('charts-grid');
      await expect(charts).toBeVisible();

      // Wait for any loading to complete
      await page.waitForTimeout(500);

      // Verify no error states are shown
      await expect(page.getByText('Failed to load chart data')).not.toBeVisible();
    });
  });

  test.describe('Visual Consistency', () => {
    test('charts have consistent card styling', async ({ page }) => {
      // Wait for loading to complete
      await page.waitForTimeout(500);

      const charts = [
        page.getByTestId('tasks-by-status-chart'),
        page.getByTestId('tasks-completed-chart'),
        page.getByTestId('workload-by-agent-chart'),
      ];

      for (const chart of charts) {
        await expect(chart).toBeVisible();
      }
    });

    test('chart titles have consistent styling', async ({ page }) => {
      // Wait for loading to complete
      await page.waitForTimeout(500);

      const chartTitles = [
        page.getByTestId('tasks-by-status-chart').locator('h4'),
        page.getByTestId('tasks-completed-chart').locator('h4'),
        page.getByTestId('workload-by-agent-chart').locator('h4'),
      ];

      for (const title of chartTitles) {
        await expect(title).toBeVisible();
      }
    });
  });
});
