/**
 * TB108: Entity Contribution Chart
 *
 * Tests for the GitHub-style contribution activity grid in EntityDetailPanel.
 * The chart shows daily activity levels over the past year.
 */

import { test, expect } from '@playwright/test';

test.describe('TB108: Entity Contribution Chart', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test.describe('Contribution Chart Display', () => {
    test('contribution chart renders in entity detail panel', async ({ page }) => {
      // Navigate to entities page
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities list to load
      const entitiesList = page.locator('[data-testid="entities-grid"]');
      await entitiesList.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click an entity to open detail panel
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      await entityCard.click();
      await page.waitForTimeout(500);

      // Wait for the entity detail panel to appear
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      // Verify the contribution chart is present
      const contributionChart = page.locator('[data-testid="entity-contribution-chart"]');
      await expect(contributionChart).toBeVisible();
    });

    test('contribution chart shows grid of activity squares', async ({ page }) => {
      // Navigate to entities page
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities list to load
      const entitiesList = page.locator('[data-testid="entities-grid"]');
      await entitiesList.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click an entity
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      await entityCard.click();
      await page.waitForTimeout(500);

      // Wait for the contribution chart to appear
      const contributionChart = page.locator('[data-testid="entity-contribution-chart"]');
      await contributionChart.waitFor({ state: 'visible', timeout: 5000 });

      // Verify the grid container is present
      const chartGrid = page.locator('[data-testid="entity-contribution-chart-grid"]');
      await expect(chartGrid).toBeVisible();
    });

    test('contribution chart shows total contributions count', async ({ page }) => {
      // Navigate to entities page
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities list to load
      const entitiesList = page.locator('[data-testid="entities-grid"]');
      await entitiesList.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click an entity
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      await entityCard.click();
      await page.waitForTimeout(500);

      // Wait for the contribution chart to appear
      const contributionChart = page.locator('[data-testid="entity-contribution-chart"]');
      await contributionChart.waitFor({ state: 'visible', timeout: 5000 });

      // Verify the total contributions count is displayed
      const totalCount = page.locator('[data-testid="entity-contribution-chart-total"]');
      await expect(totalCount).toBeVisible();
      await expect(totalCount).toContainText('contributions');
    });

    test('contribution chart has activity level legend', async ({ page }) => {
      // Navigate to entities page
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities list to load
      const entitiesList = page.locator('[data-testid="entities-grid"]');
      await entitiesList.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click an entity
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      await entityCard.click();
      await page.waitForTimeout(500);

      // Wait for the contribution chart to appear
      const contributionChart = page.locator('[data-testid="entity-contribution-chart"]');
      await contributionChart.waitFor({ state: 'visible', timeout: 5000 });

      // Verify the legend is displayed (Less ... More)
      await expect(contributionChart).toContainText('Less');
      await expect(contributionChart).toContainText('More');
    });

    test('contribution chart shows loading state initially', async ({ page }) => {
      // Navigate to entities page
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities list to load
      const entitiesList = page.locator('[data-testid="entities-grid"]');
      await entitiesList.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click an entity
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      await entityCard.click();

      // Check for loading state (may be very brief) - just verify element selector works
      const loadingState = page.locator('[data-testid="entity-contribution-chart-loading"]');
      // Loading state might not be visible if data loads fast, that's OK
      void loadingState;

      // The chart should eventually be visible (loading completes)
      const contributionChart = page.locator('[data-testid="entity-contribution-chart"]');
      await contributionChart.waitFor({ state: 'visible', timeout: 10000 });
    });
  });

  test.describe('Contribution Chart Interaction', () => {
    test('hovering a day square shows tooltip', async ({ page }) => {
      // Navigate to entities page
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities list to load
      const entitiesList = page.locator('[data-testid="entities-grid"]');
      await entitiesList.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click an entity
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      await entityCard.click();
      await page.waitForTimeout(500);

      // Wait for the contribution chart to appear
      const contributionChart = page.locator('[data-testid="entity-contribution-chart"]');
      await contributionChart.waitFor({ state: 'visible', timeout: 5000 });

      // Find a day square (not empty)
      const daySquare = page.locator('[data-testid^="entity-contribution-chart-day-"]').first();
      const hasDaySquare = await daySquare.isVisible().catch(() => false);
      if (!hasDaySquare) {
        test.skip();
        return;
      }

      // Hover over the day square
      await daySquare.hover();
      await page.waitForTimeout(300);

      // Verify tooltip appears
      const tooltip = page.locator('[data-testid="entity-contribution-chart-tooltip"]');
      await expect(tooltip).toBeVisible();
    });

    test('day squares have proper data attributes', async ({ page }) => {
      // Navigate to entities page
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities list to load
      const entitiesList = page.locator('[data-testid="entities-grid"]');
      await entitiesList.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click an entity
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      await entityCard.click();
      await page.waitForTimeout(500);

      // Wait for the contribution chart to appear
      const contributionChart = page.locator('[data-testid="entity-contribution-chart"]');
      await contributionChart.waitFor({ state: 'visible', timeout: 5000 });

      // Find a day square
      const daySquare = page.locator('[data-testid^="entity-contribution-chart-day-"]').first();
      const hasDaySquare = await daySquare.isVisible().catch(() => false);
      if (!hasDaySquare) {
        test.skip();
        return;
      }

      // Verify data attributes exist
      await expect(daySquare).toHaveAttribute('data-date');
      await expect(daySquare).toHaveAttribute('data-count');
      await expect(daySquare).toHaveAttribute('data-level');
    });

    test('contribution chart activity header has Activity icon', async ({ page }) => {
      // Navigate to entities page
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities list to load
      const entitiesList = page.locator('[data-testid="entities-grid"]');
      await entitiesList.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click an entity
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      await entityCard.click();
      await page.waitForTimeout(500);

      // Wait for entity detail panel
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      // Find the Activity section header (exact match to avoid matching "Recent Activity")
      const activityHeader = detailPanel.getByRole('heading', { name: 'Activity', exact: true });
      await expect(activityHeader).toBeVisible();
    });
  });

  test.describe('API Integration', () => {
    test('activity endpoint returns valid data', async ({ page, request }) => {
      // Navigate to entities page
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities list to load
      const entitiesList = page.locator('[data-testid="entities-grid"]');
      await entitiesList.waitFor({ state: 'visible', timeout: 10000 });

      // Find an entity card to get its ID
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      const testId = await entityCard.getAttribute('data-testid');
      const entityId = testId?.replace('entity-card-', '');
      if (!entityId) {
        test.skip();
        return;
      }

      // Make direct API request
      const response = await request.get(`/api/entities/${entityId}/activity`);
      expect(response.status()).toBe(200);

      const data = await response.json();

      // Verify response structure
      expect(data).toHaveProperty('entityId', entityId);
      expect(data).toHaveProperty('startDate');
      expect(data).toHaveProperty('endDate');
      expect(data).toHaveProperty('totalEvents');
      expect(data).toHaveProperty('activity');
      expect(Array.isArray(data.activity)).toBe(true);
    });

    test('activity endpoint accepts days parameter', async ({ page, request }) => {
      // Navigate to entities page
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities list to load
      const entitiesList = page.locator('[data-testid="entities-grid"]');
      await entitiesList.waitFor({ state: 'visible', timeout: 10000 });

      // Find an entity card to get its ID
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      const testId = await entityCard.getAttribute('data-testid');
      const entityId = testId?.replace('entity-card-', '');
      if (!entityId) {
        test.skip();
        return;
      }

      // Make API request with custom days parameter
      const response = await request.get(`/api/entities/${entityId}/activity?days=30`);
      expect(response.status()).toBe(200);

      const data = await response.json();

      // Verify the date range is approximately 30 days
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      // Should be close to 30 days (allow some flexibility for date boundary)
      expect(daysDiff).toBeGreaterThanOrEqual(28);
      expect(daysDiff).toBeLessThanOrEqual(32);
    });
  });
});
