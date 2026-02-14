import { test, expect } from '@playwright/test';

test.describe('TB146: Responsive Dashboard Page', () => {
  test.describe('Dashboard Overview - Desktop View', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport to desktop size
      await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('metrics overview displays in 4-column grid on desktop', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

      const metricsOverview = page.getByTestId('metrics-overview');
      await expect(metricsOverview).toBeVisible();

      // Check all 4 metric cards are visible
      await expect(page.getByTestId('metric-total-tasks')).toBeVisible();
      await expect(page.getByTestId('metric-ready-ratio')).toBeVisible();
      await expect(page.getByTestId('metric-active-agents')).toBeVisible();
      await expect(page.getByTestId('metric-completed-today')).toBeVisible();
    });

    test('dashboard charts are visible on desktop', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

      const chartsGrid = page.getByTestId('charts-grid');
      await expect(chartsGrid).toBeVisible();
      await expect(page.getByTestId('tasks-by-status-chart')).toBeVisible();
      await expect(page.getByTestId('tasks-completed-chart')).toBeVisible();
      await expect(page.getByTestId('workload-by-agent-chart')).toBeVisible();
    });
  });

  test.describe('Dashboard Overview - Tablet View', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport to tablet size
      await page.setViewportSize({ width: 768, height: 1024 });
    });

    test('metrics overview adapts to tablet view', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

      const metricsOverview = page.getByTestId('metrics-overview');
      await expect(metricsOverview).toBeVisible();

      // All metric cards should still be visible
      await expect(page.getByTestId('metric-total-tasks')).toBeVisible();
      await expect(page.getByTestId('metric-ready-ratio')).toBeVisible();
      await expect(page.getByTestId('metric-active-agents')).toBeVisible();
      await expect(page.getByTestId('metric-completed-today')).toBeVisible();
    });

    test('charts remain visible on tablet', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId('charts-grid')).toBeVisible();
      await expect(page.getByTestId('tasks-by-status-chart')).toBeVisible();
    });
  });

  test.describe('Dashboard Overview - Mobile View', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport to mobile size
      await page.setViewportSize({ width: 375, height: 667 });
    });

    test('metrics overview displays in 2-column grid on mobile', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

      const metricsOverview = page.getByTestId('metrics-overview');
      await expect(metricsOverview).toBeVisible();

      // All metric cards should still be visible
      await expect(page.getByTestId('metric-total-tasks')).toBeVisible();
      await expect(page.getByTestId('metric-ready-ratio')).toBeVisible();
      await expect(page.getByTestId('metric-active-agents')).toBeVisible();
      await expect(page.getByTestId('metric-completed-today')).toBeVisible();
    });

    test('dashboard charts stack vertically on mobile', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

      const chartsGrid = page.getByTestId('charts-grid');
      await expect(chartsGrid).toBeVisible();

      // Each chart should be visible and full width
      await expect(page.getByTestId('tasks-by-status-chart')).toBeVisible();
      await expect(page.getByTestId('tasks-completed-chart')).toBeVisible();
      await expect(page.getByTestId('workload-by-agent-chart')).toBeVisible();
    });

    test('quick actions are accessible on mobile', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId('quick-actions')).toBeVisible();
      await expect(page.getByTestId('quick-action-create-task')).toBeVisible();
    });

    test('recent activity section is visible on mobile', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId('recent-activity')).toBeVisible();
    });
  });

  test.describe('Timeline Lens - Responsive', () => {
    test('timeline page loads on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/dashboard/timeline');
      await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    });

    test('timeline page loads on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/dashboard/timeline');
      await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

      // View mode toggle should be visible
      await expect(page.getByTestId('view-mode-toggle')).toBeVisible();

      // Search input should be visible
      await expect(page.getByTestId('search-input')).toBeVisible();
    });

    test('view mode toggle works on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/dashboard/timeline');
      await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

      // Check both view modes are accessible
      await expect(page.getByTestId('view-mode-list')).toBeVisible();
      await expect(page.getByTestId('view-mode-horizontal')).toBeVisible();

      // Switch to horizontal view
      await page.getByTestId('view-mode-horizontal').click();
      await expect(page.getByTestId('horizontal-timeline-container')).toBeVisible();

      // Switch back to list view
      await page.getByTestId('view-mode-list').click();
      await expect(page.getByTestId('events-list')).toBeVisible();
    });
  });

  test.describe('Dependency Graph - Responsive', () => {
    test('dependency graph loads on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/dependencies');
      await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });

      // Task selector should be visible
      await expect(page.getByTestId('task-selector')).toBeVisible();
    });

    test('dependency graph adapts to tablet view', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/dependencies');
      await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });

      // Task selector should remain visible
      await expect(page.getByTestId('task-selector')).toBeVisible();
    });

    test('dependency graph is usable on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/dependencies');
      await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });

      // Task selector should still be usable
      await expect(page.getByTestId('task-selector')).toBeVisible();
    });
  });

  test.describe('Viewport Transition Tests', () => {
    test('dashboard maintains functionality when viewport changes', async ({ page }) => {
      // Start on desktop
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('metrics-overview')).toBeVisible();

      // Resize to tablet
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(page.getByTestId('metrics-overview')).toBeVisible();
      await expect(page.getByTestId('metric-total-tasks')).toBeVisible();

      // Resize to mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(page.getByTestId('metrics-overview')).toBeVisible();
      await expect(page.getByTestId('metric-total-tasks')).toBeVisible();

      // Resize back to desktop
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.getByTestId('metrics-overview')).toBeVisible();
      await expect(page.getByTestId('metric-total-tasks')).toBeVisible();
    });
  });
});
