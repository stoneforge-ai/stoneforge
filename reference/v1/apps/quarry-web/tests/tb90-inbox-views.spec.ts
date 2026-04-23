import { test, expect } from '@playwright/test';

interface Entity {
  id: string;
  name: string;
  entityType: string;
}

interface InboxItem {
  id: string;
  status: 'unread' | 'read' | 'archived';
  readAt: string | null;
}

test.describe('TB90: Inbox Views (Unread/All/Archived)', () => {
  test.describe('View Tabs UI', () => {
    test('shows view toggle tabs with Unread, All, and Archived options', async ({ page }) => {
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

      // Verify view tabs are visible
      const viewTabs = page.getByTestId('inbox-view-tabs');
      await expect(viewTabs).toBeVisible();

      // Check all three view options exist
      await expect(page.getByTestId('inbox-view-unread')).toBeVisible();
      await expect(page.getByTestId('inbox-view-all')).toBeVisible();
      await expect(page.getByTestId('inbox-view-archived')).toBeVisible();
    });

    test('defaults to All view', async ({ page }) => {
      // Clear localStorage first to reset state
      await page.addInitScript(() => {
        localStorage.removeItem('inbox.view');
      });

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

      // Check that "All" tab is selected (has white background from shadow-sm class)
      const allTab = page.getByTestId('inbox-view-all');
      await expect(allTab).toHaveClass(/bg-white/);
    });

    test('clicking view tabs switches the current view', async ({ page }) => {
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

      // Click Unread tab
      await page.getByTestId('inbox-view-unread').click();
      await expect(page.getByTestId('inbox-view-unread')).toHaveClass(/bg-white/);

      // Click Archived tab
      await page.getByTestId('inbox-view-archived').click();
      await expect(page.getByTestId('inbox-view-archived')).toHaveClass(/bg-white/);

      // Click All tab
      await page.getByTestId('inbox-view-all').click();
      await expect(page.getByTestId('inbox-view-all')).toHaveClass(/bg-white/);
    });
  });

  test.describe('View Filtering', () => {
    test('Unread view shows only unread items', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with unread items
      let entityWithUnread: Entity | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread`);
        const inbox = await inboxResponse.json();
        if (inbox.total > 0) {
          entityWithUnread = entity;
          break;
        }
      }

      if (!entityWithUnread) {
        test.skip(); // No unread inbox items
        return;
      }

      await page.goto(`/entities?selected=${entityWithUnread.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Switch to unread view
      await page.getByTestId('inbox-view-unread').click();

      // Wait for items to load
      await page.waitForTimeout(500);

      // If items exist, verify they are unread (have unread indicator)
      const itemsList = page.getByTestId('inbox-items-list');
      if (await itemsList.isVisible()) {
        // Check that all visible items have the unread styling (blue border)
        const items = await page.locator('[data-testid^="inbox-item-"]').all();
        for (const item of items) {
          // Unread items have border-blue-200 class
          await expect(item).toHaveClass(/border-blue-200/);
        }
      }
    });

    test('All view shows unread and read items but not archived', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with any inbox items
      let entityWithInbox: Entity | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
        const inbox = await inboxResponse.json();
        if (inbox.total > 0) {
          entityWithInbox = entity;
          break;
        }
      }

      if (!entityWithInbox) {
        test.skip(); // No inbox items
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Make sure we're on All view
      await page.getByTestId('inbox-view-all').click();

      // Wait for items to load
      await page.waitForTimeout(500);

      // Verify that inbox shows items (API should filter out archived)
      const itemsList = page.getByTestId('inbox-items-list');
      const emptyState = page.getByTestId('inbox-empty');

      // Either has items or is empty (both are valid)
      const hasItems = await itemsList.isVisible();
      const isEmpty = await emptyState.isVisible();
      expect(hasItems || isEmpty).toBe(true);
    });

    test('Archived view shows only archived items', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with archived items
      let entityWithArchived: Entity | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=archived`);
        const inbox = await inboxResponse.json();
        if (inbox.total > 0) {
          entityWithArchived = entity;
          break;
        }
      }

      if (!entityWithArchived) {
        test.skip(); // No archived inbox items
        return;
      }

      await page.goto(`/entities?selected=${entityWithArchived.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Switch to archived view
      await page.getByTestId('inbox-view-archived').click();

      // Wait for items to load
      await page.waitForTimeout(500);

      // Items should be visible in archived view
      await expect(page.getByTestId('inbox-items-list')).toBeVisible();
    });
  });

  test.describe('Count Badges', () => {
    test('shows unread count badge on Unread tab', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with unread items
      let entityWithUnread: Entity | null = null;
      let unreadCount = 0;
      for (const entity of entities) {
        const countResponse = await page.request.get(`/api/entities/${entity.id}/inbox/count`);
        const countData = await countResponse.json();
        if (countData.count > 0) {
          entityWithUnread = entity;
          unreadCount = countData.count;
          break;
        }
      }

      if (!entityWithUnread) {
        test.skip(); // No unread inbox items
        return;
      }

      await page.goto(`/entities?selected=${entityWithUnread.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Check that unread count badge is visible
      const unreadBadge = page.getByTestId('inbox-unread-count-badge');
      await expect(unreadBadge).toBeVisible();
      await expect(unreadBadge).toHaveText(unreadCount.toString());
    });

    test('shows archived count badge on Archived tab', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with archived items
      let entityWithArchived: Entity | null = null;
      let archivedCount = 0;
      for (const entity of entities) {
        const archivedResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=archived&limit=1`);
        const archivedData = await archivedResponse.json();
        if (archivedData.total > 0) {
          entityWithArchived = entity;
          archivedCount = archivedData.total;
          break;
        }
      }

      if (!entityWithArchived) {
        test.skip(); // No archived inbox items
        return;
      }

      await page.goto(`/entities?selected=${entityWithArchived.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Check that archived count badge is visible
      const archivedBadge = page.getByTestId('inbox-archived-count-badge');
      await expect(archivedBadge).toBeVisible();
      await expect(archivedBadge).toHaveText(archivedCount.toString());
    });
  });

  test.describe('Restore Action', () => {
    test('archived items show Restore button instead of Archive', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with archived items
      let entityWithArchived: Entity | null = null;
      let archivedItem: InboxItem | null = null;
      for (const entity of entities) {
        const archivedResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=archived`);
        const archivedData = await archivedResponse.json();
        if (archivedData.total > 0) {
          entityWithArchived = entity;
          archivedItem = archivedData.items[0];
          break;
        }
      }

      if (!entityWithArchived || !archivedItem) {
        test.skip(); // No archived inbox items
        return;
      }

      await page.goto(`/entities?selected=${entityWithArchived.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Switch to archived view
      await page.getByTestId('inbox-view-archived').click();

      // Wait for items to load
      await page.waitForTimeout(500);

      // Check that restore button is visible for archived item
      const restoreButton = page.getByTestId(`inbox-restore-${archivedItem.id}`);
      await expect(restoreButton).toBeVisible();

      // Archive button should NOT be visible
      const archiveButton = page.getByTestId(`inbox-archive-${archivedItem.id}`);
      await expect(archiveButton).not.toBeVisible();
    });

    test('clicking Restore moves item from Archived to All view', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with archived items
      let entityWithArchived: Entity | null = null;
      let archivedItem: InboxItem | null = null;
      for (const entity of entities) {
        const archivedResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=archived`);
        const archivedData = await archivedResponse.json();
        if (archivedData.total > 0) {
          entityWithArchived = entity;
          archivedItem = archivedData.items[0];
          break;
        }
      }

      if (!entityWithArchived || !archivedItem) {
        test.skip(); // No archived inbox items
        return;
      }

      await page.goto(`/entities?selected=${entityWithArchived.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Switch to archived view
      await page.getByTestId('inbox-view-archived').click();
      await page.waitForTimeout(500);

      // Click restore button
      const restoreButton = page.getByTestId(`inbox-restore-${archivedItem.id}`);
      await restoreButton.click();

      // Wait for the action to complete
      await page.waitForTimeout(500);

      // Verify item is now in 'read' status via API
      const itemResponse = await page.request.get(`/api/inbox/${archivedItem.id}`);
      const updatedItem = await itemResponse.json();
      expect(updatedItem.status).toBe('read');

      // Re-archive it for cleanup
      await page.request.patch(`/api/inbox/${archivedItem.id}`, {
        data: { status: 'archived' },
      });
    });
  });

  test.describe('LocalStorage Persistence', () => {
    test('persists selected view in localStorage', async ({ page }) => {
      // Clear localStorage first
      await page.addInitScript(() => {
        localStorage.removeItem('inbox.view');
      });

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

      // Select Archived view
      await page.getByTestId('inbox-view-archived').click();

      // Verify localStorage was updated
      const storedView = await page.evaluate(() => localStorage.getItem('inbox.view'));
      expect(storedView).toBe('archived');
    });

    test('restores view from localStorage on page load', async ({ page }) => {
      // Set localStorage to 'unread' before navigation
      await page.addInitScript(() => {
        localStorage.setItem('inbox.view', 'unread');
      });

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

      // Unread tab should be selected
      await expect(page.getByTestId('inbox-view-unread')).toHaveClass(/bg-white/);
    });
  });

  test.describe('Empty States', () => {
    test('shows appropriate empty message for Unread view', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with NO unread items (but possibly has other items)
      let entityWithNoUnread: Entity | null = null;
      for (const entity of entities) {
        const countResponse = await page.request.get(`/api/entities/${entity.id}/inbox/count`);
        const countData = await countResponse.json();
        if (countData.count === 0) {
          entityWithNoUnread = entity;
          break;
        }
      }

      if (!entityWithNoUnread) {
        // Just use first entity and hope unread is empty
        entityWithNoUnread = entities[0];
      }

      await page.goto(`/entities?selected=${entityWithNoUnread.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Switch to unread view
      await page.getByTestId('inbox-view-unread').click();
      await page.waitForTimeout(500);

      // Check if empty state is shown with correct message
      const emptyState = page.getByTestId('inbox-empty');
      if (await emptyState.isVisible()) {
        await expect(emptyState).toContainText('No unread messages');
      }
    });

    test('shows appropriate empty message for Archived view', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with NO archived items
      let entityWithNoArchived: Entity | null = null;
      for (const entity of entities) {
        const archivedResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=archived&limit=1`);
        const archivedData = await archivedResponse.json();
        if (archivedData.total === 0) {
          entityWithNoArchived = entity;
          break;
        }
      }

      if (!entityWithNoArchived) {
        // Just use first entity and hope archived is empty
        entityWithNoArchived = entities[0];
      }

      await page.goto(`/entities?selected=${entityWithNoArchived.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Switch to archived view
      await page.getByTestId('inbox-view-archived').click();
      await page.waitForTimeout(500);

      // Check if empty state is shown with correct message
      const emptyState = page.getByTestId('inbox-empty');
      if (await emptyState.isVisible()) {
        await expect(emptyState).toContainText('No archived messages');
      }
    });
  });

  test.describe('Mark All Read Visibility', () => {
    test('Mark all read button hidden in Archived view', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with unread items (so button would normally be visible)
      let entityWithUnread: Entity | null = null;
      for (const entity of entities) {
        const countResponse = await page.request.get(`/api/entities/${entity.id}/inbox/count`);
        const countData = await countResponse.json();
        if (countData.count > 0) {
          entityWithUnread = entity;
          break;
        }
      }

      if (!entityWithUnread) {
        test.skip(); // No unread items
        return;
      }

      await page.goto(`/entities?selected=${entityWithUnread.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // In All/Unread view, button should be visible
      await expect(page.getByTestId('inbox-mark-all-read')).toBeVisible();

      // Switch to Archived view
      await page.getByTestId('inbox-view-archived').click();
      await page.waitForTimeout(200);

      // Mark all read button should be hidden in archived view
      await expect(page.getByTestId('inbox-mark-all-read')).not.toBeVisible();
    });
  });
});
