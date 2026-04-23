import { test, expect } from '@playwright/test';

interface Entity {
  id: string;
  name: string;
  entityType: string;
}

test.describe('TB93: Inbox Filtering and Sorting', () => {
  test.describe('Filter and Sort UI Controls', () => {
    test('shows filter and sort buttons in inbox header', async ({ page }) => {
      // Get entities from API
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Navigate to entities page and select an entity
      await page.goto(`/entities?selected=${entities[0].id}`);

      // Wait for entity detail to load
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();

      // Click inbox tab
      await page.getByTestId('entity-tab-inbox').click();

      // Wait for inbox tab content
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Verify filter and sort controls are visible
      await expect(page.getByTestId('inbox-filter-sort-controls')).toBeVisible();
      await expect(page.getByTestId('inbox-filter-button')).toBeVisible();
      await expect(page.getByTestId('inbox-sort-button')).toBeVisible();
    });

    test('filter button opens dropdown with source options', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Click filter button
      await page.getByTestId('inbox-filter-button').click();

      // Check dropdown is visible
      await expect(page.getByTestId('inbox-filter-dropdown')).toBeVisible();

      // Check all filter options exist
      await expect(page.getByTestId('inbox-filter-all')).toBeVisible();
      await expect(page.getByTestId('inbox-filter-direct')).toBeVisible();
      await expect(page.getByTestId('inbox-filter-mention')).toBeVisible();
    });

    test('sort button opens dropdown with sort options', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Click sort button
      await page.getByTestId('inbox-sort-button').click();

      // Check dropdown is visible
      await expect(page.getByTestId('inbox-sort-dropdown')).toBeVisible();

      // Check all sort options exist
      await expect(page.getByTestId('inbox-sort-newest')).toBeVisible();
      await expect(page.getByTestId('inbox-sort-oldest')).toBeVisible();
      await expect(page.getByTestId('inbox-sort-sender')).toBeVisible();
    });
  });

  test.describe('Filter Functionality', () => {
    test('selecting Direct Messages filter shows filter chip', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Click filter button and select Direct Messages
      await page.getByTestId('inbox-filter-button').click();
      await page.getByTestId('inbox-filter-direct').click();

      // Check filter chip appears
      await expect(page.getByTestId('inbox-filter-chip-direct')).toBeVisible();
      await expect(page.getByTestId('inbox-filter-chip-direct')).toContainText('Direct Messages');
    });

    test('selecting Mentions filter shows filter chip', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Click filter button and select Mentions
      await page.getByTestId('inbox-filter-button').click();
      await page.getByTestId('inbox-filter-mention').click();

      // Check filter chip appears
      await expect(page.getByTestId('inbox-filter-chip-mention')).toBeVisible();
      await expect(page.getByTestId('inbox-filter-chip-mention')).toContainText('Mentions');
    });

    test('clicking X on filter chip clears the filter', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Apply filter
      await page.getByTestId('inbox-filter-button').click();
      await page.getByTestId('inbox-filter-direct').click();

      // Verify filter chip is shown
      await expect(page.getByTestId('inbox-filter-chip-direct')).toBeVisible();

      // Click clear button on the filter chip
      await page.getByTestId('inbox-clear-source-filter').click();

      // Verify filter chip is removed
      await expect(page.getByTestId('inbox-filter-chip-direct')).not.toBeVisible();
    });
  });

  test.describe('Sort Functionality', () => {
    test('selecting Oldest First shows sort chip', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Click sort button and select Oldest First
      await page.getByTestId('inbox-sort-button').click();
      await page.getByTestId('inbox-sort-oldest').click();

      // Check sort chip appears
      await expect(page.getByTestId('inbox-sort-chip-oldest')).toBeVisible();
      await expect(page.getByTestId('inbox-sort-chip-oldest')).toContainText('Oldest First');
    });

    test('selecting By Sender shows sort chip', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Click sort button and select By Sender
      await page.getByTestId('inbox-sort-button').click();
      await page.getByTestId('inbox-sort-sender').click();

      // Check sort chip appears
      await expect(page.getByTestId('inbox-sort-chip-sender')).toBeVisible();
      await expect(page.getByTestId('inbox-sort-chip-sender')).toContainText('By Sender');
    });

    test('clicking X on sort chip resets to Newest First', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Apply sort
      await page.getByTestId('inbox-sort-button').click();
      await page.getByTestId('inbox-sort-oldest').click();

      // Verify sort chip is shown
      await expect(page.getByTestId('inbox-sort-chip-oldest')).toBeVisible();

      // Click clear button on the sort chip
      await page.getByTestId('inbox-clear-sort').click();

      // Verify sort chip is removed
      await expect(page.getByTestId('inbox-sort-chip-oldest')).not.toBeVisible();
    });
  });

  test.describe('Combined Filters and Sort', () => {
    test('can apply both filter and sort simultaneously', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Apply filter
      await page.getByTestId('inbox-filter-button').click();
      await page.getByTestId('inbox-filter-direct').click();

      // Apply sort
      await page.getByTestId('inbox-sort-button').click();
      await page.getByTestId('inbox-sort-sender').click();

      // Verify both chips are shown
      await expect(page.getByTestId('inbox-filter-chip-direct')).toBeVisible();
      await expect(page.getByTestId('inbox-sort-chip-sender')).toBeVisible();

      // Verify Clear All button appears
      await expect(page.getByTestId('inbox-clear-all-filters')).toBeVisible();
    });

    test('Clear All button resets both filter and sort', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Apply filter and sort
      await page.getByTestId('inbox-filter-button').click();
      await page.getByTestId('inbox-filter-mention').click();

      await page.getByTestId('inbox-sort-button').click();
      await page.getByTestId('inbox-sort-oldest').click();

      // Verify chips shown
      await expect(page.getByTestId('inbox-filter-chip-mention')).toBeVisible();
      await expect(page.getByTestId('inbox-sort-chip-oldest')).toBeVisible();

      // Click Clear All
      await page.getByTestId('inbox-clear-all-filters').click();

      // Verify both chips are gone
      await expect(page.getByTestId('inbox-filter-chip-mention')).not.toBeVisible();
      await expect(page.getByTestId('inbox-sort-chip-oldest')).not.toBeVisible();
      await expect(page.getByTestId('inbox-active-filters')).not.toBeVisible();
    });
  });

  test.describe('LocalStorage Persistence', () => {
    test('filter preference persists in localStorage', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Apply filter
      await page.getByTestId('inbox-filter-button').click();
      await page.getByTestId('inbox-filter-direct').click();

      // Check localStorage
      const filterValue = await page.evaluate(() => localStorage.getItem('inbox.sourceFilter'));
      expect(filterValue).toBe('direct');
    });

    test('sort preference persists in localStorage', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Apply sort
      await page.getByTestId('inbox-sort-button').click();
      await page.getByTestId('inbox-sort-sender').click();

      // Check localStorage
      const sortValue = await page.evaluate(() => localStorage.getItem('inbox.sortOrder'));
      expect(sortValue).toBe('sender');
    });

    test('filter preference is restored on page reload', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Set filter in localStorage before navigation
      await page.addInitScript(() => {
        localStorage.setItem('inbox.sourceFilter', 'mention');
      });

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Check filter chip is shown (preference restored)
      await expect(page.getByTestId('inbox-filter-chip-mention')).toBeVisible();
    });

    test('sort preference is restored on page reload', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Set sort in localStorage before navigation
      await page.addInitScript(() => {
        localStorage.setItem('inbox.sortOrder', 'oldest');
      });

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Check sort chip is shown (preference restored)
      await expect(page.getByTestId('inbox-sort-chip-oldest')).toBeVisible();
    });
  });

  test.describe('Filter Button Styling', () => {
    test('filter button is highlighted when filter is active', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Initially, filter button should not have blue background
      const filterButton = page.getByTestId('inbox-filter-button');
      await expect(filterButton).not.toHaveClass(/bg-blue-50/);

      // Apply filter
      await filterButton.click();
      await page.getByTestId('inbox-filter-direct').click();

      // Now filter button should have blue background
      await expect(filterButton).toHaveClass(/bg-blue-50/);
    });

    test('sort button is highlighted when sort is not default', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entities[0].id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Initially, sort button should not have blue background (newest is default)
      const sortButton = page.getByTestId('inbox-sort-button');
      await expect(sortButton).not.toHaveClass(/bg-blue-50/);

      // Apply non-default sort
      await sortButton.click();
      await page.getByTestId('inbox-sort-oldest').click();

      // Now sort button should have blue background
      await expect(sortButton).toHaveClass(/bg-blue-50/);
    });
  });
});
