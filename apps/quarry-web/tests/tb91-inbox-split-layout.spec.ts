import { test, expect } from '@playwright/test';

interface Entity {
  id: string;
  name: string;
  entityType: string;
}

interface InboxItem {
  id: string;
  status: 'unread' | 'read' | 'archived';
  channelId: string;
  messageId: string;
  sourceType: 'direct' | 'mention';
  message?: {
    contentPreview?: string;
    sender?: string;
  } | null;
  sender?: Entity | null;
}

test.describe('TB91: Inbox Message Summary Sidebar', () => {
  test.describe('Split Layout Structure', () => {
    test('shows split layout with message list and content panel', async ({ page }) => {
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

      // Verify split layout panels exist
      await expect(page.getByTestId('inbox-message-list')).toBeVisible();
      await expect(page.getByTestId('inbox-message-content-panel')).toBeVisible();
    });

    test('shows empty state in content panel when no message selected', async ({ page }) => {
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

      // Content panel should show empty state initially
      const emptyState = page.getByTestId('inbox-content-empty');
      await expect(emptyState).toBeVisible();
      await expect(emptyState).toContainText('Select a message');
      await expect(emptyState).toContainText('J/K keys to navigate');
    });
  });

  test.describe('Message List Items', () => {
    test('clicking message in list shows its content', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with inbox items
      let entityWithInbox: Entity | null = null;
      let firstItem: InboxItem | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length > 0) {
          entityWithInbox = entity;
          firstItem = inbox.items[0];
          break;
        }
      }

      if (!entityWithInbox || !firstItem) {
        test.skip(); // No inbox items
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Wait for list to load
      await page.waitForTimeout(500);

      // Click the first message in the list
      await page.getByTestId(`inbox-list-item-${firstItem.id}`).click();

      // Verify content panel now shows the message
      const contentPanel = page.getByTestId(`inbox-message-content-${firstItem.id}`);
      await expect(contentPanel).toBeVisible();
    });

    test('selected message is highlighted in the list', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with inbox items
      let entityWithInbox: Entity | null = null;
      let firstItem: InboxItem | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length > 0) {
          entityWithInbox = entity;
          firstItem = inbox.items[0];
          break;
        }
      }

      if (!entityWithInbox || !firstItem) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Wait for list to load
      await page.waitForTimeout(500);

      // Click the first message
      const listItem = page.getByTestId(`inbox-list-item-${firstItem.id}`);
      await listItem.click();

      // Verify the item has selected styling (blue background)
      await expect(listItem).toHaveClass(/bg-blue-50/);
    });

    test('unread indicator shows on unread messages', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with unread inbox items
      let entityWithUnread: Entity | null = null;
      let unreadItem: InboxItem | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length > 0) {
          entityWithUnread = entity;
          unreadItem = inbox.items[0];
          break;
        }
      }

      if (!entityWithUnread || !unreadItem) {
        test.skip(); // No unread items
        return;
      }

      await page.goto(`/entities?selected=${entityWithUnread.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Switch to unread view to ensure we see the unread item
      await page.getByTestId('inbox-view-unread').click();
      await page.waitForTimeout(500);

      // Check for unread indicator
      const unreadIndicator = page.getByTestId(`inbox-list-item-unread-${unreadItem.id}`);
      await expect(unreadIndicator).toBeVisible();
    });
  });

  test.describe('Message Content Panel', () => {
    test('shows sender name and avatar in content panel', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with inbox items
      let entityWithInbox: Entity | null = null;
      let firstItem: InboxItem | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length > 0) {
          entityWithInbox = entity;
          firstItem = inbox.items[0];
          break;
        }
      }

      if (!entityWithInbox || !firstItem) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${firstItem.id}`).click();

      // Verify sender info is shown
      await expect(page.getByTestId(`inbox-content-avatar-${firstItem.id}`)).toBeVisible();
      await expect(page.getByTestId(`inbox-content-sender-${firstItem.id}`)).toBeVisible();
    });

    test('shows channel name and timestamp in content panel', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with inbox items
      let entityWithInbox: Entity | null = null;
      let firstItem: InboxItem | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length > 0) {
          entityWithInbox = entity;
          firstItem = inbox.items[0];
          break;
        }
      }

      if (!entityWithInbox || !firstItem) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${firstItem.id}`).click();

      // Verify channel and timestamp are shown
      await expect(page.getByTestId(`inbox-content-channel-${firstItem.id}`)).toBeVisible();
      await expect(page.getByTestId(`inbox-content-time-${firstItem.id}`)).toBeVisible();
    });

    test('shows message content body', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with inbox items
      let entityWithInbox: Entity | null = null;
      let firstItem: InboxItem | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length > 0) {
          entityWithInbox = entity;
          firstItem = inbox.items[0];
          break;
        }
      }

      if (!entityWithInbox || !firstItem) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${firstItem.id}`).click();

      // Verify message body is shown
      await expect(page.getByTestId(`inbox-content-body-${firstItem.id}`)).toBeVisible();
    });

    test('shows View in channel link', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with inbox items
      let entityWithInbox: Entity | null = null;
      let firstItem: InboxItem | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length > 0) {
          entityWithInbox = entity;
          firstItem = inbox.items[0];
          break;
        }
      }

      if (!entityWithInbox || !firstItem) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${firstItem.id}`).click();

      // Verify View in channel link is shown
      await expect(page.getByTestId(`inbox-content-view-in-channel-${firstItem.id}`)).toBeVisible();
    });
  });

  test.describe('Content Panel Actions', () => {
    test('can mark message as read from content panel', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with unread inbox items
      let entityWithUnread: Entity | null = null;
      let unreadItem: InboxItem | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length > 0) {
          entityWithUnread = entity;
          unreadItem = inbox.items[0];
          break;
        }
      }

      if (!entityWithUnread || !unreadItem) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithUnread.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Switch to unread view
      await page.getByTestId('inbox-view-unread').click();
      await page.waitForTimeout(500);

      // Select the unread message
      await page.getByTestId(`inbox-list-item-${unreadItem.id}`).click();

      // Mark as read button should be visible
      const markReadButton = page.getByTestId(`inbox-content-mark-read-${unreadItem.id}`);
      await expect(markReadButton).toBeVisible();

      // Click mark as read
      await markReadButton.click();
      await page.waitForTimeout(500);

      // Verify via API that item is now read
      const itemResponse = await page.request.get(`/api/inbox/${unreadItem.id}`);
      if (itemResponse.ok()) {
        const updatedItem = await itemResponse.json();
        expect(updatedItem.status).toBe('read');

        // Restore to unread for cleanup
        await page.request.patch(`/api/inbox/${unreadItem.id}`, {
          data: { status: 'unread' },
        });
      }
    });

    test('can archive message from content panel', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with inbox items
      let entityWithInbox: Entity | null = null;
      let firstItem: InboxItem | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length > 0) {
          entityWithInbox = entity;
          firstItem = inbox.items[0];
          break;
        }
      }

      if (!entityWithInbox || !firstItem) {
        test.skip();
        return;
      }

      const originalStatus = firstItem.status;

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${firstItem.id}`).click();

      // Archive button should be visible
      const archiveButton = page.getByTestId(`inbox-content-archive-${firstItem.id}`);
      await expect(archiveButton).toBeVisible();

      // Click archive
      await archiveButton.click();
      await page.waitForTimeout(500);

      // Verify via API that item is now archived
      const itemResponse = await page.request.get(`/api/inbox/${firstItem.id}`);
      if (itemResponse.ok()) {
        const updatedItem = await itemResponse.json();
        expect(updatedItem.status).toBe('archived');

        // Restore to original status for cleanup
        await page.request.patch(`/api/inbox/${firstItem.id}`, {
          data: { status: originalStatus },
        });
      }
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('J key selects next message in list', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with at least 2 inbox items
      let entityWithInbox: Entity | null = null;
      let items: InboxItem[] = [];
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length >= 2) {
          entityWithInbox = entity;
          items = inbox.items;
          break;
        }
      }

      if (!entityWithInbox || items.length < 2) {
        test.skip(); // Need at least 2 messages
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);

      // Press J to select first message
      await page.keyboard.press('j');
      await page.waitForTimeout(100);

      // First message should be selected
      await expect(page.getByTestId(`inbox-list-item-${items[0].id}`)).toHaveClass(/bg-blue-50/);

      // Press J again to select second message
      await page.keyboard.press('j');
      await page.waitForTimeout(100);

      // Second message should now be selected
      await expect(page.getByTestId(`inbox-list-item-${items[1].id}`)).toHaveClass(/bg-blue-50/);
    });

    test('K key selects previous message in list', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with at least 2 inbox items
      let entityWithInbox: Entity | null = null;
      let items: InboxItem[] = [];
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length >= 2) {
          entityWithInbox = entity;
          items = inbox.items;
          break;
        }
      }

      if (!entityWithInbox || items.length < 2) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);

      // First select the second message using J twice
      await page.keyboard.press('j');
      await page.keyboard.press('j');
      await page.waitForTimeout(100);

      // Second message should be selected
      await expect(page.getByTestId(`inbox-list-item-${items[1].id}`)).toHaveClass(/bg-blue-50/);

      // Press K to go back to first message
      await page.keyboard.press('k');
      await page.waitForTimeout(100);

      // First message should now be selected
      await expect(page.getByTestId(`inbox-list-item-${items[0].id}`)).toHaveClass(/bg-blue-50/);
    });
  });

  test.describe('Virtualized List', () => {
    test('uses virtualized list for message rendering', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Find an entity with inbox items
      let entityWithInbox: Entity | null = null;
      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read`);
        const inbox = await inboxResponse.json();
        if (inbox.items?.length > 0) {
          entityWithInbox = entity;
          break;
        }
      }

      if (!entityWithInbox) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      // Verify virtualized list is present (it has the inbox-items-list testid)
      await expect(page.getByTestId('inbox-items-list')).toBeVisible();
    });
  });
});
