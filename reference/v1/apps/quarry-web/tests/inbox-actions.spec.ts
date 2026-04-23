import { test, expect } from '@playwright/test';

interface Entity {
  id: string;
  name: string;
  entityType: string;
}

interface InboxItem {
  id: string;
  status: string;
  readAt: string | null;
}

test.describe('TB65: Inbox Actions', () => {
  test('PATCH /api/inbox/:itemId endpoint marks item as read', async ({ page }) => {
    // Get entities from API
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
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithUnread = entity;
        unreadItem = inbox.items[0] as InboxItem;
        break;
      }
    }

    if (!entityWithUnread || !unreadItem) {
      test.skip(); // No unread inbox items
      return;
    }

    // Mark item as read
    const patchResponse = await page.request.patch(`/api/inbox/${unreadItem.id}`, {
      data: { status: 'read' },
    });
    expect(patchResponse.ok()).toBe(true);

    const updated = await patchResponse.json();
    expect(updated.status).toBe('read');
    expect(updated.readAt).not.toBeNull();
  });

  test('PATCH /api/inbox/:itemId endpoint marks item as unread', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items as Entity[];

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with read inbox items
    let readItem: InboxItem | null = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=read`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        readItem = inbox.items[0] as InboxItem;
        break;
      }
    }

    if (!readItem) {
      test.skip(); // No read inbox items
      return;
    }

    // Mark item as unread
    const patchResponse = await page.request.patch(`/api/inbox/${readItem.id}`, {
      data: { status: 'unread' },
    });
    expect(patchResponse.ok()).toBe(true);

    const updated = await patchResponse.json();
    expect(updated.status).toBe('unread');
    expect(updated.readAt).toBeNull();
  });

  test('PATCH /api/inbox/:itemId endpoint archives item', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items as Entity[];

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with non-archived inbox items
    let inboxItem: InboxItem | null = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        inboxItem = inbox.items[0] as InboxItem;
        break;
      }
    }

    if (!inboxItem) {
      test.skip(); // No inbox items
      return;
    }

    // Archive item
    const patchResponse = await page.request.patch(`/api/inbox/${inboxItem.id}`, {
      data: { status: 'archived' },
    });
    expect(patchResponse.ok()).toBe(true);

    const updated = await patchResponse.json();
    expect(updated.status).toBe('archived');
  });

  test('PATCH /api/inbox/:itemId returns 404 for non-existent item', async ({ page }) => {
    const patchResponse = await page.request.patch('/api/inbox/nonexistent-item-id', {
      data: { status: 'read' },
    });
    expect(patchResponse.ok()).toBe(false);
    expect(patchResponse.status()).toBe(404);
  });

  test('PATCH /api/inbox/:itemId returns 400 for invalid status', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items as Entity[];

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find any inbox item
    let inboxItem: InboxItem | null = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        inboxItem = inbox.items[0] as InboxItem;
        break;
      }
    }

    if (!inboxItem) {
      test.skip(); // No inbox items
      return;
    }

    const patchResponse = await page.request.patch(`/api/inbox/${inboxItem.id}`, {
      data: { status: 'invalid' },
    });
    expect(patchResponse.ok()).toBe(false);
    expect(patchResponse.status()).toBe(400);
  });

  test('POST /api/entities/:id/inbox/mark-all-read endpoint works', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items as Entity[];

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with unread inbox items
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
      test.skip(); // No entities with unread items
      return;
    }

    // Mark all as read
    const postResponse = await page.request.post(`/api/entities/${entityWithUnread.id}/inbox/mark-all-read`);
    expect(postResponse.ok()).toBe(true);

    const result = await postResponse.json();
    expect(typeof result.markedCount).toBe('number');

    // Verify all items are now read
    const countResponse = await page.request.get(`/api/entities/${entityWithUnread.id}/inbox/count`);
    const countData = await countResponse.json();
    expect(countData.count).toBe(0);
  });

  test('clicking mark as read button marks inbox item as read', async ({ page }) => {
    // Get entities from API
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
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithUnread = entity;
        unreadItem = inbox.items[0] as InboxItem;
        break;
      }
    }

    if (!entityWithUnread || !unreadItem) {
      test.skip(); // No unread inbox items
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithUnread.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // Click mark as read button
    await page.getByTestId(`inbox-mark-read-${unreadItem.id}`).click();

    // Wait for update
    await page.waitForTimeout(500);

    // Verify via API that item is now read
    const getResponse = await page.request.get(`/api/inbox/${unreadItem.id}`);
    const updated = await getResponse.json();
    expect(updated.status).toBe('read');
  });

  test('clicking mark as unread button marks inbox item as unread', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items as Entity[];

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with read inbox items
    let entityWithRead: Entity | null = null;
    let readItem: InboxItem | null = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=read`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithRead = entity;
        readItem = inbox.items[0] as InboxItem;
        break;
      }
    }

    if (!entityWithRead || !readItem) {
      test.skip(); // No read inbox items
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithRead.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // Click mark as unread button
    await page.getByTestId(`inbox-mark-unread-${readItem.id}`).click();

    // Wait for update
    await page.waitForTimeout(500);

    // Verify via API that item is now unread
    const getResponse = await page.request.get(`/api/inbox/${readItem.id}`);
    const updated = await getResponse.json();
    expect(updated.status).toBe('unread');
  });

  test('clicking archive button archives inbox item', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items as Entity[];

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with non-archived inbox items
    let entityWithItems: Entity | null = null;
    let inboxItem: InboxItem | null = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithItems = entity;
        inboxItem = inbox.items[0] as InboxItem;
        break;
      }
    }

    if (!entityWithItems || !inboxItem) {
      test.skip(); // No inbox items
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithItems.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // Click archive button
    await page.getByTestId(`inbox-archive-${inboxItem.id}`).click();

    // Wait for update
    await page.waitForTimeout(500);

    // Verify via API that item is now archived
    const getResponse = await page.request.get(`/api/inbox/${inboxItem.id}`);
    const updated = await getResponse.json();
    expect(updated.status).toBe('archived');
  });

  test('clicking mark all read button marks all items as read', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items as Entity[];

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with unread inbox items
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
      test.skip(); // No entities with unread items
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithUnread.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // Click mark all read button
    await page.getByTestId('inbox-mark-all-read').click();

    // Wait for update
    await page.waitForTimeout(500);

    // Verify via API that count is now 0
    const countResponse = await page.request.get(`/api/entities/${entityWithUnread.id}/inbox/count`);
    const countData = await countResponse.json();
    expect(countData.count).toBe(0);
  });

  test('inbox count badge updates after marking items as read', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items as Entity[];

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with unread inbox items
    let entityWithUnread: Entity | null = null;
    let initialCount = 0;
    for (const entity of entities) {
      const countResponse = await page.request.get(`/api/entities/${entity.id}/inbox/count`);
      const countData = await countResponse.json();
      if (countData.count > 0) {
        entityWithUnread = entity;
        initialCount = countData.count;
        break;
      }
    }

    if (!entityWithUnread) {
      test.skip(); // No entities with unread items
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithUnread.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Initial badge count should show
    await expect(page.getByTestId('inbox-count-badge')).toContainText(`${initialCount}`);

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // Click mark all read button
    await page.getByTestId('inbox-mark-all-read').click();

    // Wait for update and query invalidation
    await page.waitForTimeout(1000);

    // Badge should be removed or show 0
    const badge = page.getByTestId('inbox-count-badge');
    const badgeExists = await badge.isVisible().catch(() => false);
    if (badgeExists) {
      // If badge still exists, it should show 0
      await expect(badge).toContainText('0');
    }
    // Badge might be completely hidden when count is 0, which is also acceptable
  });

  test('archive button tooltip says Archive', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items as Entity[];

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with inbox items
    let entityWithItems: Entity | null = null;
    let inboxItem: InboxItem | null = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithItems = entity;
        inboxItem = inbox.items[0] as InboxItem;
        break;
      }
    }

    if (!entityWithItems || !inboxItem) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithItems.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // Check archive button title attribute
    const archiveButton = page.getByTestId(`inbox-archive-${inboxItem.id}`);
    await expect(archiveButton).toHaveAttribute('title', 'Archive');
  });
});
