/**
 * TB148: Responsive Plans & Workflows Pages Tests
 *
 * Tests for the responsive behavior of the Plans and Workflows pages across viewports.
 *
 * Behaviors tested:
 * - Mobile: Card-based list view, full-screen detail sheet, FAB for create
 * - Tablet/Desktop: Card list view, side panel for detail, button for create
 * - Responsive status filter
 * - Responsive create modals
 */

import { test, expect } from '@playwright/test';
import {
  setViewport,
  waitForResponsiveUpdate,
} from './helpers/responsive';

test.describe('TB148: Responsive Plans Page', () => {
  test.describe('Mobile Viewport (< 640px)', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport BEFORE navigation
      await setViewport(page, 'xs');
      await page.goto('/plans');
      // Wait for responsive hooks to stabilize
      await waitForResponsiveUpdate(page, 300);
    });

    test('should show search bar on mobile', async ({ page }) => {
      // Search bar should be visible
      const searchInput = page.getByTestId('plan-search-input');
      await expect(searchInput).toBeVisible();
    });

    test('should show scrollable status filter on mobile', async ({ page }) => {
      // Status filter should be visible (plans use 'status-filter')
      const statusFilter = page.getByTestId('status-filter');
      await expect(statusFilter).toBeVisible();
    });

    test('should show card-based list view on mobile', async ({ page }) => {
      // Wait for plans to load
      await page.waitForSelector('[data-testid="mobile-plans-list"]', { timeout: 10000 });

      // Mobile list view should be visible
      const mobileListView = page.getByTestId('mobile-plans-list');
      await expect(mobileListView).toBeVisible();

      // Desktop list view should not be visible
      const desktopListView = page.getByTestId('plans-list');
      await expect(desktopListView).not.toBeVisible();
    });

    test('should show floating action button for create plan on mobile', async ({ page }) => {
      // FAB should be visible
      const fab = page.getByTestId('mobile-create-plan-fab');
      await expect(fab).toBeVisible();

      // Regular create button should not be visible
      const createButton = page.getByTestId('create-plan-btn');
      await expect(createButton).not.toBeVisible();
    });

    test('should open full-screen create modal when FAB is clicked', async ({ page }) => {
      // Click FAB
      const fab = page.getByTestId('mobile-create-plan-fab');
      await fab.click();

      // Create modal should be visible
      const createModal = page.getByTestId('create-plan-modal');
      await expect(createModal).toBeVisible();

      // Title input should be visible
      await expect(page.getByTestId('plan-title-input')).toBeVisible();
    });
  });

  test.describe('Tablet Viewport (768px)', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, 'lg');
      await page.goto('/plans');
      await waitForResponsiveUpdate(page);
    });

    test('should show desktop list view on tablet', async ({ page }) => {
      // Wait for list view content
      const listViewContent = page.getByTestId('plans-list');
      await expect(listViewContent).toBeVisible();

      // Mobile list view should not be present
      const mobileListView = page.getByTestId('mobile-plans-list');
      await expect(mobileListView).not.toBeVisible();
    });

    test('should show create plan button on tablet', async ({ page }) => {
      // Create button should be visible
      const createButton = page.getByTestId('create-plan-btn');
      await expect(createButton).toBeVisible();

      // FAB should not be visible
      const fab = page.getByTestId('mobile-create-plan-fab');
      await expect(fab).not.toBeVisible();
    });

    test('should show view toggle on tablet', async ({ page }) => {
      // View toggle should be visible
      const viewToggle = page.getByTestId('view-toggle');
      await expect(viewToggle).toBeVisible();
    });

    test('should show side panel when plan is selected on tablet', async ({ page }) => {
      // Wait for plans to load
      await page.waitForSelector('[data-testid="plans-list"]', { timeout: 10000 });

      // Click on first plan item
      const firstPlanItem = page.locator('[data-testid^="plan-item-"]').first();
      await firstPlanItem.click();

      // Side panel should be visible
      const detailContainer = page.getByTestId('plan-detail-container');
      await expect(detailContainer).toBeVisible();

      // Mobile detail sheet should not be visible
      const mobileDetailSheet = page.getByTestId('mobile-plan-detail-sheet');
      await expect(mobileDetailSheet).not.toBeVisible();
    });
  });

  test.describe('Desktop Viewport (1280px)', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, '2xl');
      await page.goto('/plans');
      await waitForResponsiveUpdate(page);
    });

    test('should show search bar on desktop', async ({ page }) => {
      // Search bar should be visible
      const searchInput = page.getByTestId('plan-search-input');
      await expect(searchInput).toBeVisible();
    });

    test('should show status filter on desktop', async ({ page }) => {
      // Status filter should be visible (plans use 'status-filter')
      const statusFilter = page.getByTestId('status-filter');
      await expect(statusFilter).toBeVisible();
    });

    test('should show view toggle on desktop', async ({ page }) => {
      // View toggle should be visible
      const viewToggle = page.getByTestId('view-toggle');
      await expect(viewToggle).toBeVisible();
    });

    test('should show desktop list view on desktop', async ({ page }) => {
      // Wait for list view content
      const listViewContent = page.getByTestId('plans-list');
      await expect(listViewContent).toBeVisible();

      // Mobile list view should not be present
      const mobileListView = page.getByTestId('mobile-plans-list');
      await expect(mobileListView).not.toBeVisible();
    });

    test('should show create plan button on desktop', async ({ page }) => {
      // Create button should be visible
      const createButton = page.getByTestId('create-plan-btn');
      await expect(createButton).toBeVisible();

      // FAB should not be visible
      const fab = page.getByTestId('mobile-create-plan-fab');
      await expect(fab).not.toBeVisible();
    });

    test('should show side panel when plan is selected on desktop', async ({ page }) => {
      // Wait for plans to load
      await page.waitForSelector('[data-testid="plans-list"]', { timeout: 10000 });

      // Click on first plan item
      const firstPlanItem = page.locator('[data-testid^="plan-item-"]').first();
      await firstPlanItem.click();

      // Side panel should be visible
      const detailContainer = page.getByTestId('plan-detail-container');
      await expect(detailContainer).toBeVisible();
    });
  });

  test.describe('Viewport Transitions', () => {
    test('should adapt layout when viewport changes from desktop to mobile', async ({ page }) => {
      // Start at desktop
      await setViewport(page, '2xl');
      await page.goto('/plans');
      await waitForResponsiveUpdate(page);

      // Verify desktop layout
      await expect(page.getByTestId('create-plan-btn')).toBeVisible();

      // Resize to mobile
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page, 300);

      // Verify mobile layout
      await expect(page.getByTestId('mobile-create-plan-fab')).toBeVisible();
      await expect(page.getByTestId('create-plan-btn')).not.toBeVisible();
    });
  });
});

test.describe('TB148: Responsive Workflows Page', () => {
  test.describe('Mobile Viewport (< 640px)', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport BEFORE navigation
      await setViewport(page, 'xs');
      await page.goto('/workflows');
      // Wait for responsive hooks to stabilize
      await waitForResponsiveUpdate(page, 300);
    });

    test('should show scrollable status filter on mobile', async ({ page }) => {
      // Status filter should be visible (workflows use 'workflow-status-filter')
      const statusFilter = page.getByTestId('workflow-status-filter');
      await expect(statusFilter).toBeVisible();
    });

    test('should show card-based list view on mobile', async ({ page }) => {
      // Wait for workflows to load
      await page.waitForSelector('[data-testid="mobile-workflows-list"], [data-testid="workflows-empty"]', { timeout: 10000 });

      // Either mobile list view or empty state should be visible
      const mobileListView = page.getByTestId('mobile-workflows-list');
      const emptyState = page.getByTestId('workflows-empty');

      const isMobileListVisible = await mobileListView.isVisible();
      const isEmptyVisible = await emptyState.isVisible();

      expect(isMobileListVisible || isEmptyVisible).toBe(true);

      // Desktop list view should not be visible
      const desktopListView = page.getByTestId('workflows-list');
      await expect(desktopListView).not.toBeVisible();
    });

    test('should show floating action button for create workflow on mobile', async ({ page }) => {
      // FAB should be visible
      const fab = page.getByTestId('mobile-create-workflow-fab');
      await expect(fab).toBeVisible();

      // Regular create button should not be visible
      const createButton = page.getByTestId('create-workflow-button');
      await expect(createButton).not.toBeVisible();
    });

    test('should open full-screen create modal when FAB is clicked', async ({ page }) => {
      // Click FAB
      const fab = page.getByTestId('mobile-create-workflow-fab');
      await fab.click();

      // Create modal should be visible
      const createModal = page.getByTestId('create-workflow-modal');
      await expect(createModal).toBeVisible();

      // Title input should be visible
      await expect(page.getByTestId('create-title-input')).toBeVisible();
    });
  });

  test.describe('Tablet Viewport (768px)', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, 'lg');
      await page.goto('/workflows');
      await waitForResponsiveUpdate(page);
    });

    test('should show desktop list view on tablet', async ({ page }) => {
      // Wait for list view content or empty state
      await page.waitForSelector('[data-testid="workflows-list"], [data-testid="workflows-empty"]', { timeout: 10000 });

      // Mobile list view should not be present
      const mobileListView = page.getByTestId('mobile-workflows-list');
      await expect(mobileListView).not.toBeVisible();
    });

    test('should show create workflow button on tablet', async ({ page }) => {
      // Create button should be visible
      const createButton = page.getByTestId('create-workflow-button');
      await expect(createButton).toBeVisible();

      // FAB should not be visible
      const fab = page.getByTestId('mobile-create-workflow-fab');
      await expect(fab).not.toBeVisible();
    });
  });

  test.describe('Desktop Viewport (1280px)', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, '2xl');
      await page.goto('/workflows');
      await waitForResponsiveUpdate(page);
    });

    test('should show status filter on desktop', async ({ page }) => {
      // Status filter should be visible (workflows use 'workflow-status-filter')
      const statusFilter = page.getByTestId('workflow-status-filter');
      await expect(statusFilter).toBeVisible();
    });

    test('should show desktop list view on desktop', async ({ page }) => {
      // Wait for list view content or empty state
      await page.waitForSelector('[data-testid="workflows-list"], [data-testid="workflows-empty"]', { timeout: 10000 });

      // Mobile list view should not be present
      const mobileListView = page.getByTestId('mobile-workflows-list');
      await expect(mobileListView).not.toBeVisible();
    });

    test('should show create workflow button on desktop', async ({ page }) => {
      // Create button should be visible
      const createButton = page.getByTestId('create-workflow-button');
      await expect(createButton).toBeVisible();

      // FAB should not be visible
      const fab = page.getByTestId('mobile-create-workflow-fab');
      await expect(fab).not.toBeVisible();
    });
  });

  test.describe('Viewport Transitions', () => {
    test('should adapt layout when viewport changes from desktop to mobile', async ({ page }) => {
      // Start at desktop
      await setViewport(page, '2xl');
      await page.goto('/workflows');
      await waitForResponsiveUpdate(page);

      // Verify desktop layout
      await expect(page.getByTestId('create-workflow-button')).toBeVisible();

      // Resize to mobile
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page, 300);

      // Verify mobile layout
      await expect(page.getByTestId('mobile-create-workflow-fab')).toBeVisible();
      await expect(page.getByTestId('create-workflow-button')).not.toBeVisible();
    });
  });
});
