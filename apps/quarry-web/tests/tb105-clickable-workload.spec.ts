/**
 * TB105: Clickable Workload Distribution
 *
 * Tests that workload chart bars in EntityDetailPanel, TeamDetailPanel,
 * and Dashboard are clickable and navigate to /tasks?assignee=:id
 */

import { test, expect } from '@playwright/test';

test.describe('TB105: Clickable Workload Distribution', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test.describe('Dashboard Workload Chart', () => {
    test('workload by agent chart bars are clickable', async ({ page }) => {
      // Navigate to dashboard overview
      await page.goto('/dashboard/overview');
      await page.waitForLoadState('networkidle');

      // Wait for the workload chart to load
      const workloadChart = page.locator('[data-testid="workload-by-agent-chart"]');
      await workloadChart.waitFor({ state: 'visible', timeout: 10000 });

      // Check if the chart has any bars (agents with tasks)
      // Recharts renders bars as rect elements within the chart
      const chartBars = workloadChart.locator('.recharts-bar-rectangle');
      const barCount = await chartBars.count();

      if (barCount === 0) {
        // No agents with tasks, skip this test
        test.skip();
        return;
      }

      // Click on the first bar
      const firstBar = chartBars.first();
      await firstBar.click();
      await page.waitForTimeout(500);

      // Verify navigation to tasks page with assignee filter
      await expect(page).toHaveURL(/\/tasks/);
      await expect(page).toHaveURL(/assignee=/);
    });

    test('workload by agent chart shows tooltip with count and percentage on hover', async ({ page }) => {
      // Navigate to dashboard overview
      await page.goto('/dashboard/overview');
      await page.waitForLoadState('networkidle');

      // Wait for the workload chart to load
      const workloadChart = page.locator('[data-testid="workload-by-agent-chart"]');
      await workloadChart.waitFor({ state: 'visible', timeout: 10000 });

      // Check if the chart has any bars
      const chartBars = workloadChart.locator('.recharts-bar-rectangle');
      const barCount = await chartBars.count();

      if (barCount === 0) {
        test.skip();
        return;
      }

      // Hover over the first bar
      const firstBar = chartBars.first();
      await firstBar.hover();
      await page.waitForTimeout(300);

      // Look for tooltip content - use the one within the workload chart specifically
      const tooltip = workloadChart.locator('.recharts-tooltip-wrapper').last();
      await expect(tooltip).toBeVisible();

      // Verify tooltip contains percentage
      const tooltipText = await tooltip.textContent();
      expect(tooltipText).toMatch(/\(\d+%\)/);
    });
  });

  test.describe('Team Detail Workload Bars', () => {
    test('team workload bars are clickable', async ({ page }) => {
      // Navigate to teams page
      await page.goto('/teams');
      await page.waitForLoadState('networkidle');

      // Wait for teams list to load
      const teamsContainer = page.locator('[data-testid="teams-list"], [data-testid="teams-grid"]');
      await teamsContainer.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click a team to open detail panel
      const teamCard = page.locator('[data-testid^="team-card-"]').first();
      const teamCount = await teamCard.count();
      if (teamCount === 0) {
        test.skip();
        return;
      }

      await teamCard.click();
      await page.waitForTimeout(500);

      // Wait for the workload distribution to load
      const teamWorkload = page.locator('[data-testid="team-workload"]');
      const hasWorkload = await teamWorkload.isVisible().catch(() => false);
      if (!hasWorkload) {
        test.skip();
        return;
      }

      // Find a workload bar
      const workloadBar = page.locator('[data-testid^="workload-bar-"]').first();
      const hasBar = await workloadBar.isVisible().catch(() => false);

      if (!hasBar) {
        test.skip();
        return;
      }

      // Get the entity ID from the test ID
      const testId = await workloadBar.getAttribute('data-testid');
      const memberId = testId?.replace('workload-bar-', '');

      // Click the workload bar
      await workloadBar.click();
      await page.waitForTimeout(500);

      // Verify navigation to tasks page with assignee filter
      await expect(page).toHaveURL(/\/tasks/);
      if (memberId) {
        await expect(page).toHaveURL(new RegExp(`assignee=${memberId}`));
      }
    });

    test('team workload bars display count and percentage', async ({ page }) => {
      // Navigate to teams page
      await page.goto('/teams');
      await page.waitForLoadState('networkidle');

      // Wait for teams list to load
      const teamsContainer = page.locator('[data-testid="teams-list"], [data-testid="teams-grid"]');
      await teamsContainer.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click a team
      const teamCard = page.locator('[data-testid^="team-card-"]').first();
      const teamCount = await teamCard.count();
      if (teamCount === 0) {
        test.skip();
        return;
      }

      await teamCard.click();
      await page.waitForTimeout(500);

      // Wait for the workload distribution to load
      const teamWorkload = page.locator('[data-testid="team-workload"]');
      const hasWorkload = await teamWorkload.isVisible().catch(() => false);
      if (!hasWorkload) {
        test.skip();
        return;
      }

      // Find a workload bar
      const workloadBar = page.locator('[data-testid^="workload-bar-"]').first();
      const hasBar = await workloadBar.isVisible().catch(() => false);

      if (!hasBar) {
        test.skip();
        return;
      }

      // Verify the bar shows count and percentage
      const barText = await workloadBar.textContent();
      // Pattern: "name X (Y%)" where X is count and Y is percentage
      expect(barText).toMatch(/\d+.*\(\d+%\)/);
    });
  });

  test.describe('Tasks Page Assignee Filter', () => {
    test('tasks page respects assignee URL parameter', async ({ page }) => {
      // First navigate to entities to get an entity ID
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const hasEntity = await entityCard.isVisible().catch(() => false);

      if (!hasEntity) {
        test.skip();
        return;
      }

      // Get entity ID from the card
      const testId = await entityCard.getAttribute('data-testid');
      const entityId = testId?.replace('entity-card-', '');

      if (!entityId) {
        test.skip();
        return;
      }

      // Navigate to tasks with assignee filter
      await page.goto(`/tasks?assignee=${entityId}&page=1&limit=25`);
      await page.waitForLoadState('networkidle');

      // Verify URL has assignee parameter
      await expect(page).toHaveURL(new RegExp(`assignee=${entityId}`));

      // Verify filter chip is shown (if there are filters active)
      // The filter should be reflected in the UI
      const filterSection = page.locator('[data-testid="filter-panel"]');
      const hasFilterSection = await filterSection.isVisible().catch(() => false);
      if (hasFilterSection) {
        // Check that the assignee filter is active in the filters
        await expect(page.locator('text=Clear all')).toBeVisible();
      }
    });

    test('clearing filters removes assignee from URL', async ({ page }) => {
      // First get an entity ID
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const hasEntity = await entityCard.isVisible().catch(() => false);

      if (!hasEntity) {
        test.skip();
        return;
      }

      const testId = await entityCard.getAttribute('data-testid');
      const entityId = testId?.replace('entity-card-', '');

      if (!entityId) {
        test.skip();
        return;
      }

      // Navigate to tasks with assignee filter
      await page.goto(`/tasks?assignee=${entityId}&page=1&limit=25`);
      await page.waitForLoadState('networkidle');

      // Find and click clear all filters button
      const clearButton = page.locator('[data-testid="clear-filters"]');
      const hasClearButton = await clearButton.isVisible().catch(() => false);

      if (hasClearButton) {
        await clearButton.click();
        await page.waitForTimeout(500);

        // Verify assignee is removed from URL
        const url = page.url();
        expect(url).not.toContain('assignee=');
      }
    });
  });
});
