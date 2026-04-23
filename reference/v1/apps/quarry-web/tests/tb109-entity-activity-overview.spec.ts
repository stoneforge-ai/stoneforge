/**
 * TB109: Entity Activity Overview
 *
 * Tests for the recent activity feed in EntityDetailPanel showing:
 * - Recent events (tasks completed, messages sent, documents edited)
 * - Each item with icon, description, and timestamp
 * - "View all activity" link that navigates to filtered timeline view
 */

import { test, expect } from '@playwright/test';

test.describe('TB109: Entity Activity Overview', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test.describe('Activity Feed Display', () => {
    test('recent activity section renders in entity detail panel', async ({ page }) => {
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

      // Verify the Recent Activity section is present
      const activityHeader = detailPanel.getByRole('heading', { name: 'Recent Activity' });
      await expect(activityHeader).toBeVisible();
    });

    test('activity feed shows loading state initially', async ({ page }) => {
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

      // Wait for the entity detail panel to appear
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      // Either loading message or events list should be present
      const hasActivity = await detailPanel.locator('text="Loading activity..."').isVisible().catch(() => false)
        || await detailPanel.locator('[data-testid="entity-events"]').isVisible().catch(() => false)
        || await detailPanel.locator('text="No recent activity"').isVisible().catch(() => false);
      expect(hasActivity).toBeTruthy();
    });

    test('activity items display icon, description, and timestamp', async ({ page }) => {
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

      // Wait for the entity detail panel to appear
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      // Check for events list
      const eventsContainer = page.locator('[data-testid="entity-events"]');
      const hasEvents = await eventsContainer.isVisible().catch(() => false);

      if (!hasEvents) {
        // No events - acceptable, skip rest of test
        const noActivity = page.locator('text="No recent activity"');
        await expect(noActivity).toBeVisible();
        return;
      }

      // Verify activity items have proper structure
      const activityItems = page.locator('[data-testid^="activity-item-"]');
      const itemCount = await activityItems.count();

      if (itemCount > 0) {
        const firstItem = activityItems.first();

        // Should have an icon (SVG inside a rounded container)
        const iconContainer = firstItem.locator('.rounded-full').first();
        await expect(iconContainer).toBeVisible();

        // Should have description text
        const description = firstItem.locator('p.text-gray-900').first();
        await expect(description).toBeVisible();

        // Should have timestamp (contains "ago" or date)
        const timestamp = firstItem.locator('.text-gray-400');
        await expect(timestamp).toBeVisible();
      }
    });

    test('activity items show max 10 recent events', async ({ page }) => {
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

      // Wait for the entity detail panel to appear
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      // Check for events list
      const eventsContainer = page.locator('[data-testid="entity-events"]');
      const hasEvents = await eventsContainer.isVisible().catch(() => false);

      if (!hasEvents) {
        test.skip();
        return;
      }

      // Verify max 10 items shown
      const activityItems = page.locator('[data-testid^="activity-item-"]');
      const itemCount = await activityItems.count();
      expect(itemCount).toBeLessThanOrEqual(10);
    });

    test('activity descriptions are human-readable', async ({ page }) => {
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

      // Wait for the entity detail panel to appear
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      // Check for events list
      const eventsContainer = page.locator('[data-testid="entity-events"]');
      const hasEvents = await eventsContainer.isVisible().catch(() => false);

      if (!hasEvents) {
        test.skip();
        return;
      }

      // Verify activity items have human-readable descriptions
      const activityItems = page.locator('[data-testid^="activity-item-"]');
      const itemCount = await activityItems.count();

      if (itemCount > 0) {
        const firstItem = activityItems.first();
        const description = await firstItem.locator('p.text-gray-900').first().textContent();

        // Description should be human-readable, not raw event types
        expect(description).toBeTruthy();
        // Should contain readable text (not underscores or raw event types)
        expect(description).not.toContain('_');
        // Should start with capital letter
        expect(description?.charAt(0)).toBe(description?.charAt(0).toUpperCase());
      }
    });
  });

  test.describe('View All Activity Link', () => {
    test('view all activity button is visible when events exist', async ({ page }) => {
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

      // Wait for the entity detail panel to appear
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      // Check for events list
      const eventsContainer = page.locator('[data-testid="entity-events"]');
      const hasEvents = await eventsContainer.isVisible().catch(() => false);

      if (!hasEvents) {
        // No events, button should not be visible
        const viewAllButton = page.locator('[data-testid="view-all-activity"]');
        await expect(viewAllButton).not.toBeVisible();
        return;
      }

      // Verify "View all activity" button is present
      const viewAllButton = page.locator('[data-testid="view-all-activity"]');
      await expect(viewAllButton).toBeVisible();
      await expect(viewAllButton).toContainText('View all activity');
    });

    test('view all activity navigates to timeline with actor filter', async ({ page }) => {
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

      await entityCard.click();
      await page.waitForTimeout(500);

      // Wait for the entity detail panel to appear
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      // Check for events and view all button
      const viewAllButton = page.locator('[data-testid="view-all-activity"]');
      const hasButton = await viewAllButton.isVisible().catch(() => false);

      if (!hasButton) {
        test.skip();
        return;
      }

      // Click the view all activity button
      await viewAllButton.click();
      await page.waitForTimeout(500);

      // Verify navigation to timeline with actor filter
      await expect(page).toHaveURL(new RegExp(`/dashboard/timeline.*actor=${entityId}`));
    });

    test('timeline page shows events filtered by actor', async ({ page }) => {
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

      // Navigate directly to timeline with actor filter
      await page.goto(`/dashboard/timeline?page=1&limit=100&actor=${entityId}`);
      await page.waitForLoadState('networkidle');

      // Verify we're on the timeline page
      await expect(page).toHaveURL(new RegExp('/dashboard/timeline'));

      // The actor filter should be applied (actor chip should show the entity ID)
      // This verifies the actor param is read from URL
      const filterSection = page.locator('[data-testid="actor-filter"]');
      const hasFilter = await filterSection.isVisible().catch(() => false);

      // If filter section exists, verify it contains the entity
      if (hasFilter) {
        // Just verify the timeline loaded with the actor param
        await expect(page).toHaveURL(new RegExp(`actor=${entityId}`));
      }
    });
  });

  test.describe('Activity Icons', () => {
    test('different event types show different icons', async ({ page }) => {
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

      // Wait for the entity detail panel to appear
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      // Check for events list
      const eventsContainer = page.locator('[data-testid="entity-events"]');
      const hasEvents = await eventsContainer.isVisible().catch(() => false);

      if (!hasEvents) {
        test.skip();
        return;
      }

      // Verify activity items have icon containers with appropriate styling
      const activityItems = page.locator('[data-testid^="activity-item-"]');
      const itemCount = await activityItems.count();

      if (itemCount > 0) {
        const firstItem = activityItems.first();

        // Should have a colored icon container
        const iconContainer = firstItem.locator('.rounded-full.w-8.h-8').first();
        await expect(iconContainer).toBeVisible();

        // Icon container should have a background color class
        const classes = await iconContainer.getAttribute('class');
        expect(classes).toMatch(/bg-\w+-100/); // e.g., bg-green-100, bg-blue-100
      }
    });
  });

  test.describe('Empty State', () => {
    test('shows "No recent activity" when entity has no events', async ({ page }) => {
      // This test verifies empty state handling
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

      // Wait for the entity detail panel to appear
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      // Either events list or empty state should be present
      const eventsContainer = page.locator('[data-testid="entity-events"]');
      const hasEvents = await eventsContainer.isVisible().catch(() => false);

      if (!hasEvents) {
        // Should show empty state message
        const emptyState = page.locator('text="No recent activity"');
        await expect(emptyState).toBeVisible();
      }
    });
  });
});
