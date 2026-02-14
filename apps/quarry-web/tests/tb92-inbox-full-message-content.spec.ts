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
    fullContent?: string;
    contentType?: string;
    threadId?: string | null;
    sender?: string;
  } | null;
  sender?: Entity | null;
  attachments?: {
    id: string;
    title: string;
    content?: string;
    contentType?: string;
  }[];
  threadParent?: {
    id: string;
    sender?: Entity | null;
    contentPreview: string;
    createdAt: string;
  } | null;
}

/**
 * Helper to find an entity with inbox items
 */
async function findEntityWithInbox(page: any): Promise<{ entity: Entity; item: InboxItem } | null> {
  const response = await page.request.get('/api/entities');
  const data = await response.json();
  const entities = data.items as Entity[];

  for (const entity of entities) {
    const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
    const inbox = await inboxResponse.json();
    if (inbox.items?.length > 0) {
      return { entity, item: inbox.items[0] };
    }
  }
  return null;
}

test.describe('TB92: Inbox Full Message Content', () => {
  test.describe('Full Message Content Rendering', () => {
    test('shows full message content instead of preview', async ({ page }) => {
      const result = await findEntityWithInbox(page);
      if (!result) {
        test.skip();
        return;
      }

      const { entity, item } = result;
      await page.goto(`/entities?selected=${entity.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${item.id}`).click();

      // Verify message body is visible
      const messageBody = page.getByTestId(`inbox-content-body-${item.id}`);
      await expect(messageBody).toBeVisible();
    });

    test('message content uses prose styling for markdown', async ({ page }) => {
      const result = await findEntityWithInbox(page);
      if (!result) {
        test.skip();
        return;
      }

      const { entity, item } = result;
      await page.goto(`/entities?selected=${entity.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${item.id}`).click();

      // Verify prose styling is applied
      const messageBody = page.getByTestId(`inbox-content-body-${item.id}`);
      await expect(messageBody).toHaveClass(/prose/);
    });
  });

  test.describe('Timestamp Display', () => {
    test('shows full timestamp with relative time', async ({ page }) => {
      const result = await findEntityWithInbox(page);
      if (!result) {
        test.skip();
        return;
      }

      const { entity, item } = result;
      await page.goto(`/entities?selected=${entity.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${item.id}`).click();

      // Verify timestamp is visible
      const timestamp = page.getByTestId(`inbox-content-time-${item.id}`);
      await expect(timestamp).toBeVisible();

      // Should have title attribute with absolute time (for hover)
      await expect(timestamp).toHaveAttribute('title', /.+/);
    });

    test('timestamp has cursor-help for hover tooltip', async ({ page }) => {
      const result = await findEntityWithInbox(page);
      if (!result) {
        test.skip();
        return;
      }

      const { entity, item } = result;
      await page.goto(`/entities?selected=${entity.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${item.id}`).click();

      // Verify timestamp has cursor-help class for hover
      const timestamp = page.getByTestId(`inbox-content-time-${item.id}`);
      await expect(timestamp).toHaveClass(/cursor-help/);
    });
  });

  test.describe('Reply Action Button', () => {
    test('shows reply button for non-archived messages', async ({ page }) => {
      const result = await findEntityWithInbox(page);
      if (!result) {
        test.skip();
        return;
      }

      const { entity, item } = result;
      // Skip if message is archived
      if (item.status === 'archived') {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entity.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${item.id}`).click();

      // Verify reply button is visible
      const replyButton = page.getByTestId(`inbox-content-reply-${item.id}`);
      await expect(replyButton).toBeVisible();
    });

    test('reply button navigates to channel', async ({ page }) => {
      const result = await findEntityWithInbox(page);
      if (!result) {
        test.skip();
        return;
      }

      const { entity, item } = result;
      if (item.status === 'archived') {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entity.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${item.id}`).click();

      // Click reply button
      await page.getByTestId(`inbox-content-reply-${item.id}`).click();

      // Should navigate to messages page
      await expect(page).toHaveURL(/\/messages/);
    });
  });

  test.describe('Attachments Section', () => {
    test('attachments section not visible when no attachments', async ({ page }) => {
      // Find an entity with inbox items that have no attachments
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      let entityWithInbox: Entity | null = null;
      let itemWithoutAttachments: InboxItem | null = null;

      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        const item = inbox.items?.find((i: InboxItem) => !i.attachments || i.attachments.length === 0);
        if (item) {
          entityWithInbox = entity;
          itemWithoutAttachments = item;
          break;
        }
      }

      if (!entityWithInbox || !itemWithoutAttachments) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${itemWithoutAttachments.id}`).click();

      // Attachments section should not be visible
      const attachmentsSection = page.getByTestId(`inbox-content-attachments-${itemWithoutAttachments.id}`);
      await expect(attachmentsSection).not.toBeVisible();
    });

    test('shows attachments section when message has attachments', async ({ page }) => {
      // Find an entity with inbox items that have attachments
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      let entityWithInbox: Entity | null = null;
      let itemWithAttachments: InboxItem | null = null;

      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        const item = inbox.items?.find((i: InboxItem) => i.attachments && i.attachments.length > 0);
        if (item) {
          entityWithInbox = entity;
          itemWithAttachments = item;
          break;
        }
      }

      if (!entityWithInbox || !itemWithAttachments) {
        test.skip(); // No messages with attachments
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${itemWithAttachments.id}`).click();

      // Attachments section should be visible
      const attachmentsSection = page.getByTestId(`inbox-content-attachments-${itemWithAttachments.id}`);
      await expect(attachmentsSection).toBeVisible();
    });

    test('attachment card shows title and content type', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      let entityWithInbox: Entity | null = null;
      let itemWithAttachments: InboxItem | null = null;

      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        const item = inbox.items?.find((i: InboxItem) => i.attachments && i.attachments.length > 0);
        if (item) {
          entityWithInbox = entity;
          itemWithAttachments = item;
          break;
        }
      }

      if (!entityWithInbox || !itemWithAttachments || !itemWithAttachments.attachments?.[0]) {
        test.skip();
        return;
      }

      const attachment = itemWithAttachments.attachments[0];

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${itemWithAttachments.id}`).click();

      // Verify attachment card elements
      await expect(page.getByTestId(`inbox-content-attachment-${attachment.id}`)).toBeVisible();
      await expect(page.getByTestId(`inbox-content-attachment-title-${attachment.id}`)).toBeVisible();
      await expect(page.getByTestId(`inbox-content-attachment-type-${attachment.id}`)).toBeVisible();
    });
  });

  test.describe('Thread Context', () => {
    test('thread context not visible when message is not a reply', async ({ page }) => {
      // Find an entity with inbox items that are not replies
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      let entityWithInbox: Entity | null = null;
      let nonReplyItem: InboxItem | null = null;

      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        const item = inbox.items?.find((i: InboxItem) => !i.threadParent);
        if (item) {
          entityWithInbox = entity;
          nonReplyItem = item;
          break;
        }
      }

      if (!entityWithInbox || !nonReplyItem) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${nonReplyItem.id}`).click();

      // Thread context should not be visible
      const threadContext = page.getByTestId(`inbox-content-thread-context-${nonReplyItem.id}`);
      await expect(threadContext).not.toBeVisible();
    });

    test('shows thread context when message is a reply', async ({ page }) => {
      // Find an entity with inbox items that are replies
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      let entityWithInbox: Entity | null = null;
      let replyItem: InboxItem | null = null;

      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        const item = inbox.items?.find((i: InboxItem) => i.threadParent);
        if (item) {
          entityWithInbox = entity;
          replyItem = item;
          break;
        }
      }

      if (!entityWithInbox || !replyItem) {
        test.skip(); // No reply messages found
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${replyItem.id}`).click();

      // Thread context should be visible
      const threadContext = page.getByTestId(`inbox-content-thread-context-${replyItem.id}`);
      await expect(threadContext).toBeVisible();
    });

    test('thread context shows parent sender and preview', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      let entityWithInbox: Entity | null = null;
      let replyItem: InboxItem | null = null;

      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        const item = inbox.items?.find((i: InboxItem) => i.threadParent);
        if (item) {
          entityWithInbox = entity;
          replyItem = item;
          break;
        }
      }

      if (!entityWithInbox || !replyItem) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${replyItem.id}`).click();

      // Verify thread context elements
      await expect(page.getByTestId(`inbox-content-thread-parent-avatar-${replyItem.id}`)).toBeVisible();
      await expect(page.getByTestId(`inbox-content-thread-parent-sender-${replyItem.id}`)).toBeVisible();
      await expect(page.getByTestId(`inbox-content-thread-parent-preview-${replyItem.id}`)).toBeVisible();
    });

    test('clicking thread parent sender navigates to entity', async ({ page }) => {
      const response = await page.request.get('/api/entities');
      const data = await response.json();
      const entities = data.items as Entity[];

      let entityWithInbox: Entity | null = null;
      let replyItem: InboxItem | null = null;

      for (const entity of entities) {
        const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread,read&hydrate=true`);
        const inbox = await inboxResponse.json();
        const item = inbox.items?.find((i: InboxItem) => i.threadParent?.sender?.id);
        if (item) {
          entityWithInbox = entity;
          replyItem = item;
          break;
        }
      }

      if (!entityWithInbox || !replyItem || !replyItem.threadParent?.sender?.id) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entityWithInbox.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${replyItem.id}`).click();

      // Click on thread parent sender
      await page.getByTestId(`inbox-content-thread-parent-sender-${replyItem.id}`).click();

      // Should navigate to entities page with selected entity
      await expect(page).toHaveURL(new RegExp(`/entities.*selected=${replyItem.threadParent.sender.id}`));
    });
  });

  test.describe('Clickable Navigation', () => {
    test('clicking sender name navigates to entity detail', async ({ page }) => {
      const result = await findEntityWithInbox(page);
      if (!result) {
        test.skip();
        return;
      }

      const { entity, item } = result;
      const senderId = item.sender?.id ?? item.message?.sender;
      if (!senderId) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entity.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${item.id}`).click();

      // Click on sender name
      await page.getByTestId(`inbox-content-sender-${item.id}`).click();

      // Should navigate to entities page with selected entity
      await expect(page).toHaveURL(new RegExp(`/entities.*selected=${senderId}`));
    });

    test('clicking channel name navigates to messages', async ({ page }) => {
      const result = await findEntityWithInbox(page);
      if (!result) {
        test.skip();
        return;
      }

      const { entity, item } = result;
      await page.goto(`/entities?selected=${entity.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${item.id}`).click();

      // Click on channel name
      await page.getByTestId(`inbox-content-channel-${item.id}`).click();

      // Should navigate to messages page
      await expect(page).toHaveURL(/\/messages/);
    });

    test('clicking avatar navigates to entity detail', async ({ page }) => {
      const result = await findEntityWithInbox(page);
      if (!result) {
        test.skip();
        return;
      }

      const { entity, item } = result;
      const senderId = item.sender?.id ?? item.message?.sender;
      if (!senderId) {
        test.skip();
        return;
      }

      await page.goto(`/entities?selected=${entity.id}`);
      await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
      await page.getByTestId('entity-tab-inbox').click();
      await expect(page.getByTestId('entity-inbox-tab')).toBeVisible();

      await page.waitForTimeout(500);
      await page.getByTestId(`inbox-list-item-${item.id}`).click();

      // Click on avatar
      await page.getByTestId(`inbox-content-avatar-${item.id}`).click();

      // Should navigate to entities page with selected entity
      await expect(page).toHaveURL(new RegExp(`/entities.*selected=${senderId}`));
    });
  });
});
