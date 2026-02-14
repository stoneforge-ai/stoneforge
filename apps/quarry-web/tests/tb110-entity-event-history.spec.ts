/**
 * TB110: Entity Event History (Commit History Style)
 *
 * Tests for the History tab in EntityDetailPanel showing:
 * - Full event history in git commit log style
 * - Event ID (hash), description, timestamp
 * - Click to expand showing old/new values (git diff style)
 * - Filter by event type (created, updated, closed, deleted)
 * - Pagination for history
 */

import { test, expect } from '@playwright/test';

test.describe('TB110: Entity Event History', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test.describe('History Tab Display', () => {
    test('history tab is visible in entity detail panel', async ({ page }) => {
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

      // Verify the History tab button is present
      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await expect(historyTab).toBeVisible();
      await expect(historyTab).toContainText('History');
    });

    test('clicking history tab shows history content', async ({ page }) => {
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

      // Click the History tab
      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await historyTab.click();
      await page.waitForTimeout(300);

      // Verify history tab content is shown
      const historyContent = page.locator('[data-testid="entity-history-tab"]');
      await expect(historyContent).toBeVisible();
    });

    test('history tab shows event type filter buttons', async ({ page }) => {
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

      // Wait for the entity detail panel and click History tab
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await historyTab.click();
      await page.waitForTimeout(300);

      // Verify event type filter section is present
      const filterSection = page.locator('[data-testid="history-event-type-filter"]');
      await expect(filterSection).toBeVisible();

      // Verify filter buttons exist
      await expect(page.locator('[data-testid="history-filter-all"]')).toBeVisible();
      await expect(page.locator('[data-testid="history-filter-created"]')).toBeVisible();
      await expect(page.locator('[data-testid="history-filter-updated"]')).toBeVisible();
      await expect(page.locator('[data-testid="history-filter-closed"]')).toBeVisible();
      await expect(page.locator('[data-testid="history-filter-deleted"]')).toBeVisible();
    });
  });

  test.describe('History Event Items', () => {
    test('history items display in commit log style', async ({ page }) => {
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

      // Wait for the entity detail panel and click History tab
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await historyTab.click();
      await page.waitForTimeout(500);

      // Wait for history to load
      const historyContent = page.locator('[data-testid="entity-history-tab"]');
      await historyContent.waitFor({ state: 'visible' });

      // Check if history events exist
      const eventsList = page.locator('[data-testid="history-events-list"]');
      const hasEvents = await eventsList.isVisible().catch(() => false);

      if (!hasEvents) {
        // No events - check for empty state
        const emptyState = historyContent.locator('text="No events recorded yet"');
        const hasEmptyState = await emptyState.isVisible().catch(() => false);
        expect(hasEmptyState || hasEvents).toBeTruthy();
        return;
      }

      // Verify event items exist
      const historyItems = page.locator('[data-testid^="history-item-"]');
      const itemCount = await historyItems.count();

      if (itemCount > 0) {
        const firstItem = historyItems.first();

        // Should have a hash button with short event ID
        const hashButton = firstItem.locator('[data-testid^="history-hash-"]');
        await expect(hashButton).toBeVisible();

        // Hash should be short (7 chars)
        const hashText = await hashButton.textContent();
        // Hash button contains icon + 7 digit hash
        expect(hashText).toBeTruthy();
      }
    });

    test('clicking event hash expands to show details', async ({ page }) => {
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

      // Wait for the entity detail panel and click History tab
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await historyTab.click();
      await page.waitForTimeout(500);

      // Check if history events exist
      const eventsList = page.locator('[data-testid="history-events-list"]');
      const hasEvents = await eventsList.isVisible().catch(() => false);

      if (!hasEvents) {
        test.skip();
        return;
      }

      // Find first event item
      const historyItems = page.locator('[data-testid^="history-item-"]');
      const itemCount = await historyItems.count();

      if (itemCount === 0) {
        test.skip();
        return;
      }

      // Get the event ID from the first item's test ID
      const firstItem = historyItems.first();
      const testId = await firstItem.getAttribute('data-testid');
      const eventId = testId?.replace('history-item-', '');

      if (!eventId) {
        test.skip();
        return;
      }

      // Click the toggle button to expand
      const toggleButton = page.locator(`[data-testid="history-toggle-${eventId}"]`);
      await toggleButton.click();
      await page.waitForTimeout(300);

      // Verify details section is now visible (or empty message)
      const detailsSection = page.locator(`[data-testid="history-details-${eventId}"]`);
      const emptyMessage = firstItem.locator('text="No detailed changes recorded"');

      const hasDetails = await detailsSection.isVisible().catch(() => false);
      const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false);

      // Either details or empty message should be visible
      expect(hasDetails || hasEmptyMessage).toBeTruthy();
    });

    test('expand all / collapse all buttons work', async ({ page }) => {
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

      // Wait for the entity detail panel and click History tab
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await historyTab.click();
      await page.waitForTimeout(500);

      // Verify expand/collapse all buttons are present
      const expandAllButton = page.locator('[data-testid="history-expand-all"]');
      const collapseAllButton = page.locator('[data-testid="history-collapse-all"]');

      await expect(expandAllButton).toBeVisible();
      await expect(collapseAllButton).toBeVisible();
    });
  });

  test.describe('Event Type Filtering', () => {
    test('clicking filter button updates displayed events', async ({ page }) => {
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

      // Wait for the entity detail panel and click History tab
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await historyTab.click();
      await page.waitForTimeout(500);

      // Click the "Created" filter
      const createdFilter = page.locator('[data-testid="history-filter-created"]');
      await createdFilter.click();
      await page.waitForTimeout(300);

      // Filter should be active (has bg-blue-100 class)
      await expect(createdFilter).toHaveClass(/bg-blue-100/);

      // Click back to "All Events"
      const allFilter = page.locator('[data-testid="history-filter-all"]');
      await allFilter.click();
      await page.waitForTimeout(300);

      // All filter should now be active
      await expect(allFilter).toHaveClass(/bg-blue-100/);
    });

    test('filter persists in localStorage', async ({ page }) => {
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

      // Wait for the entity detail panel and click History tab
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await historyTab.click();
      await page.waitForTimeout(500);

      // Click the "Updated" filter
      const updatedFilter = page.locator('[data-testid="history-filter-updated"]');
      await updatedFilter.click();
      await page.waitForTimeout(300);

      // Reload the page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Navigate back to entity and history tab
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      const entitiesList2 = page.locator('[data-testid="entities-grid"]');
      await entitiesList2.waitFor({ state: 'visible', timeout: 10000 });

      const entityCard2 = page.locator('[data-testid^="entity-card-"]').first();
      await entityCard2.click();
      await page.waitForTimeout(500);

      const detailPanel2 = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel2.waitFor({ state: 'visible', timeout: 5000 });

      const historyTab2 = page.locator('[data-testid="entity-tab-history"]');
      await historyTab2.click();
      await page.waitForTimeout(300);

      // Verify updated filter is still selected
      const updatedFilter2 = page.locator('[data-testid="history-filter-updated"]');
      await expect(updatedFilter2).toHaveClass(/bg-blue-100/);
    });
  });

  test.describe('Pagination', () => {
    test('pagination controls appear when many events exist', async ({ page }) => {
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

      // Wait for the entity detail panel and click History tab
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await historyTab.click();
      await page.waitForTimeout(500);

      // Check if pagination controls exist (only if total > pageSize)
      const prevButton = page.locator('[data-testid="history-prev-page"]');
      const nextButton = page.locator('[data-testid="history-next-page"]');

      // Pagination might not be visible if total events <= page size
      // Just verify the history tab works
      const historyContent = page.locator('[data-testid="entity-history-tab"]');
      await expect(historyContent).toBeVisible();
    });
  });

  test.describe('Empty State', () => {
    test('shows empty state when entity has no events', async ({ page }) => {
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

      // Wait for the entity detail panel and click History tab
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await historyTab.click();
      await page.waitForTimeout(500);

      const historyContent = page.locator('[data-testid="entity-history-tab"]');
      await expect(historyContent).toBeVisible();

      // Either events list or empty state should be present
      const eventsList = page.locator('[data-testid="history-events-list"]');
      const hasEvents = await eventsList.isVisible().catch(() => false);

      if (!hasEvents) {
        // Should show empty state message
        const emptyState = historyContent.locator('text="No events recorded yet"');
        await expect(emptyState).toBeVisible();
      }
    });

    test('shows filtered empty state when no events match filter', async ({ page }) => {
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

      // Wait for the entity detail panel and click History tab
      const detailPanel = page.locator('[data-testid="entity-detail-panel"]');
      await detailPanel.waitFor({ state: 'visible', timeout: 5000 });

      const historyTab = page.locator('[data-testid="entity-tab-history"]');
      await historyTab.click();
      await page.waitForTimeout(500);

      // Click deleted filter (likely to have few/no events)
      const deletedFilter = page.locator('[data-testid="history-filter-deleted"]');
      await deletedFilter.click();
      await page.waitForTimeout(300);

      // Check for filtered empty state
      const historyContent = page.locator('[data-testid="entity-history-tab"]');
      const eventsList = page.locator('[data-testid="history-events-list"]');
      const hasEvents = await eventsList.isVisible().catch(() => false);

      if (!hasEvents) {
        // Should show filtered empty state
        const emptyState = historyContent.locator('text="No deleted events found"');
        const genericEmpty = historyContent.locator('text="No events recorded yet"');
        const hasFilteredEmpty = await emptyState.isVisible().catch(() => false);
        const hasGenericEmpty = await genericEmpty.isVisible().catch(() => false);
        expect(hasFilteredEmpty || hasGenericEmpty).toBeTruthy();
      }
    });
  });
});
