import { test, expect } from '@playwright/test';

// ============================================================================
// TB52: Attach Documents to Messages Tests
// ============================================================================

test.describe('TB52: Attach Documents to Messages', () => {
  // Helper to get or create a channel for testing
  async function getOrCreateTestChannel(page: import('@playwright/test').Page): Promise<{ id: string; members: string[] }> {
    const response = await page.request.get('/api/channels');
    const channels = await response.json();

    if (channels.length > 0) {
      return channels[0];
    }

    // Get an entity to use as createdBy
    const entitiesResp = await page.request.get('/api/entities');
    const entities = await entitiesResp.json();
    const createdBy = entities.length > 0 ? entities[0].id : 'test-user';

    // Create a channel if none exists
    const createResponse = await page.request.post('/api/channels', {
      data: {
        name: `Test Channel ${Date.now()}`,
        channelType: 'group',
        createdBy,
        members: [createdBy],
        permissions: {
          visibility: 'public',
          joinPolicy: 'open',
          modifyMembers: [createdBy],
        },
      },
    });
    expect(createResponse.ok()).toBe(true);
    return createResponse.json();
  }

  // Helper to create a document for testing
  async function createTestDocument(page: import('@playwright/test').Page, options: { title?: string } = {}) {
    // Get an entity to use as createdBy
    const entitiesResp = await page.request.get('/api/entities');
    const entities = await entitiesResp.json();
    const createdBy = entities.length > 0 ? entities[0].id : 'test-user';

    const response = await page.request.post('/api/documents', {
      data: {
        title: options.title || `Test Document ${Date.now()}`,
        content: 'Test document content for attachment testing',
        contentType: 'text',
        createdBy,
      },
    });
    expect(response.ok()).toBe(true);
    const doc = await response.json();
    expect(doc.id).toBeDefined();
    return doc;
  }

  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('POST /api/messages accepts attachmentIds array', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc = await createTestDocument(page);
    const sender = channel.members[0];

    const response = await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender,
        content: 'Message with attachment',
        attachmentIds: [doc.id],
      },
    });

    expect(response.ok()).toBe(true);
    const message = await response.json();
    expect(message.id).toBeDefined();
    expect(message._attachments).toBeDefined();
    expect(message._attachments.length).toBe(1);
    expect(message._attachments[0].id).toBe(doc.id);
  });

  test('POST /api/messages works without attachments', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const sender = channel.members[0];

    const response = await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender,
        content: 'Message without attachment',
      },
    });

    expect(response.ok()).toBe(true);
    const message = await response.json();
    expect(message.id).toBeDefined();
    expect(message._attachments).toEqual([]);
  });

  test('POST /api/messages with multiple attachments', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc1 = await createTestDocument(page);
    const doc2 = await createTestDocument(page);
    const sender = channel.members[0];

    const response = await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender,
        content: 'Message with multiple attachments',
        attachmentIds: [doc1.id, doc2.id],
      },
    });

    expect(response.ok()).toBe(true);
    const message = await response.json();
    expect(message._attachments.length).toBe(2);
    expect(message._attachments.map((a: { id: string }) => a.id)).toContain(doc1.id);
    expect(message._attachments.map((a: { id: string }) => a.id)).toContain(doc2.id);
  });

  test('POST /api/messages returns 404 for non-existent document', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const sender = channel.members[0];

    const response = await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender,
        content: 'Message with invalid attachment',
        attachmentIds: ['el-invalid999'],
      },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.message).toContain('not found');
  });

  test('GET /api/channels/:id/messages hydrates attachments', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc = await createTestDocument(page);
    const sender = channel.members[0];

    // Create a message with attachment
    await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender,
        content: 'Hydration test message',
        attachmentIds: [doc.id],
      },
    });

    // Fetch messages
    const response = await page.request.get(`/api/channels/${channel.id}/messages?hydrate.content=true`);
    expect(response.ok()).toBe(true);
    const messages = await response.json();

    // Find our message
    const msg = messages.find((m: { _content: string }) => m._content === 'Hydration test message');
    expect(msg).toBeDefined();
    expect(msg._attachments).toBeDefined();
    expect(msg._attachments.length).toBe(1);
    expect(msg._attachments[0].id).toBe(doc.id);
  });

  // ============================================================================
  // UI Tests - Message Composer
  // ============================================================================

  test('message composer shows attach button', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Select a channel
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    // Attach button should be visible
    await expect(page.getByTestId('message-attach-button')).toBeVisible();
  });

  test('clicking attach button opens document picker', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    // Click attach button
    await page.getByTestId('message-attach-button').click();

    // Picker should open
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });
  });

  test('document picker shows available documents', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc = await createTestDocument(page);

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });

    // Document should be in the list
    await expect(page.getByTestId(`attachment-option-${doc.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('selecting document in picker adds attachment preview', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc = await createTestDocument(page);

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });

    // Click on document
    await page.getByTestId(`attachment-option-${doc.id}`).click();

    // Picker should close, preview should appear
    await expect(page.getByTestId('message-attachment-picker')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('message-attachments-preview')).toBeVisible();
    await expect(page.getByTestId(`attachment-preview-${doc.id}`)).toBeVisible();
  });

  test('attachment preview shows remove button', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc = await createTestDocument(page);

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });

    await page.getByTestId(`attachment-option-${doc.id}`).click();
    await expect(page.getByTestId(`attachment-preview-${doc.id}`)).toBeVisible({ timeout: 5000 });

    // Remove button should be visible
    await expect(page.getByTestId(`remove-attachment-${doc.id}`)).toBeVisible();
  });

  test('clicking remove button removes attachment from preview', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc = await createTestDocument(page);

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });

    await page.getByTestId(`attachment-option-${doc.id}`).click();
    await expect(page.getByTestId(`attachment-preview-${doc.id}`)).toBeVisible({ timeout: 5000 });

    // Click remove
    await page.getByTestId(`remove-attachment-${doc.id}`).click();

    // Preview should be gone
    await expect(page.getByTestId(`attachment-preview-${doc.id}`)).not.toBeVisible();
    await expect(page.getByTestId('message-attachments-preview')).not.toBeVisible();
  });

  test('document picker search filters documents', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const uniqueTitle = `UniqueAttachDoc${Date.now()}`;
    const doc = await createTestDocument(page, { title: uniqueTitle });

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });

    // Type in search
    await page.getByTestId('attachment-search').fill(uniqueTitle);

    // Should find our document
    await expect(page.getByTestId(`attachment-option-${doc.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('document picker can be closed with X button', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });

    // Close via X button
    await page.getByTestId('attachment-picker-close').click();
    await expect(page.getByTestId('message-attachment-picker')).not.toBeVisible({ timeout: 5000 });
  });

  test('document picker excludes already selected documents', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc1 = await createTestDocument(page);
    const doc2 = await createTestDocument(page);

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    // Add first document
    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`attachment-option-${doc1.id}`).click();
    await expect(page.getByTestId(`attachment-preview-${doc1.id}`)).toBeVisible({ timeout: 5000 });

    // Open picker again
    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });

    // doc1 should NOT be in the list anymore
    await expect(page.getByTestId(`attachment-option-${doc1.id}`)).not.toBeVisible({ timeout: 3000 });

    // doc2 SHOULD still be in the list
    await expect(page.getByTestId(`attachment-option-${doc2.id}`)).toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // UI Tests - Message Display
  // ============================================================================

  test('sent message with attachment displays the attachment', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc = await createTestDocument(page);

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    // Attach document
    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`attachment-option-${doc.id}`).click();

    // Type message and send
    await page.getByTestId('message-input').fill('Message with document attachment');
    await page.getByTestId('message-send-button').click();

    // Wait for message to appear
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });

    // Find the message attachment
    await expect(page.getByTestId(`message-attachment-${doc.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('message attachment is clickable link to document', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc = await createTestDocument(page);
    const sender = channel.members[0];

    // Create message with attachment via API
    await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender,
        content: 'API message with attachment',
        attachmentIds: [doc.id],
      },
    });

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });

    // Find the attachment link
    const attachmentLink = page.getByTestId(`message-attachment-${doc.id}`);
    await expect(attachmentLink).toBeVisible({ timeout: 5000 });
    await expect(attachmentLink).toHaveAttribute('href', `/documents?doc=${doc.id}`);
  });

  test('message shows multiple attachments', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc1 = await createTestDocument(page);
    const doc2 = await createTestDocument(page);
    const sender = channel.members[0];

    // Create message with multiple attachments via API
    await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender,
        content: 'Message with multiple attachments',
        attachmentIds: [doc1.id, doc2.id],
      },
    });

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });

    // Both attachments should be visible
    await expect(page.getByTestId(`message-attachment-${doc1.id}`)).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId(`message-attachment-${doc2.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('message attachment shows document title', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const uniqueTitle = `Document Title ${Date.now()}`;
    const doc = await createTestDocument(page, { title: uniqueTitle });
    const sender = channel.members[0];

    // Create message with attachment via API
    await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender,
        content: 'Message with titled document',
        attachmentIds: [doc.id],
      },
    });

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });

    // Attachment should show title
    const attachment = page.getByTestId(`message-attachment-${doc.id}`);
    await expect(attachment).toBeVisible({ timeout: 5000 });
    await expect(attachment).toContainText(uniqueTitle);
  });

  test('message attachment shows content type badge', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc = await createTestDocument(page);
    const sender = channel.members[0];

    // Create message with attachment via API
    await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender,
        content: 'Message with typed document',
        attachmentIds: [doc.id],
      },
    });

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });

    // Attachment should show content type
    const attachment = page.getByTestId(`message-attachment-${doc.id}`);
    await expect(attachment).toBeVisible({ timeout: 5000 });
    await expect(attachment).toContainText('text');
  });

  test('attachments cleared after sending message', async ({ page }) => {
    const channel = await getOrCreateTestChannel(page);
    const doc = await createTestDocument(page);

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 5000 });

    // Add attachment
    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`attachment-option-${doc.id}`).click();
    await expect(page.getByTestId(`attachment-preview-${doc.id}`)).toBeVisible({ timeout: 5000 });

    // Send message
    await page.getByTestId('message-input').fill('Message to clear attachments');
    await page.getByTestId('message-send-button').click();

    // Preview should be cleared
    await expect(page.getByTestId('message-attachments-preview')).not.toBeVisible({ timeout: 5000 });
  });
});
