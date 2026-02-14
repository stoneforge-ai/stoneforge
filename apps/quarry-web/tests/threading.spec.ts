import { test, expect } from '@playwright/test';

test.describe('TB19: Threading', () => {
  // Helper to get channels
  async function getChannels(page: import('@playwright/test').Page) {
    const response = await page.request.get('/api/channels');
    return response.json();
  }

  // Helper to get first entity
  async function getFirstEntity(page: import('@playwright/test').Page) {
    const response = await page.request.get('/api/entities');
    const entities = await response.json();
    return entities.length > 0 ? entities[0] : null;
  }

  test('GET /api/messages/:id/replies endpoint returns replies', async ({ page }) => {
    const channels = await getChannels(page);
    const entity = await getFirstEntity(page);

    if (channels.length === 0 || !entity) {
      test.skip();
      return;
    }

    // First create a message to get its replies
    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    // Create a parent message
    const parentContent = `Parent message ${Date.now()}`;
    const parentResponse = await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender: channel.members[0],
        content: parentContent,
      },
    });

    if (!parentResponse.ok()) {
      test.skip();
      return;
    }

    const parentMessage = await parentResponse.json();

    // Get replies for the message
    const response = await page.request.get(`/api/messages/${parentMessage.id}/replies`);
    expect(response.ok()).toBe(true);
    const replies = await response.json();
    expect(Array.isArray(replies)).toBe(true);
    expect(replies.length).toBe(0); // Should be empty initially
  });

  test('GET /api/messages/:id/replies returns 404 for invalid message', async ({ page }) => {
    const response = await page.request.get('/api/messages/el-invalid999/replies');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('threaded reply appears in replies endpoint', async ({ page }) => {
    const channels = await getChannels(page);
    const entity = await getFirstEntity(page);

    if (channels.length === 0 || !entity) {
      test.skip();
      return;
    }

    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    // Create a parent message
    const parentContent = `Thread Parent ${Date.now()}`;
    const parentResponse = await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender: channel.members[0],
        content: parentContent,
      },
    });

    if (!parentResponse.ok()) {
      test.skip();
      return;
    }

    const parentMessage = await parentResponse.json();

    // Create a reply
    const replyContent = `Thread Reply ${Date.now()}`;
    const replyResponse = await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender: channel.members[0],
        content: replyContent,
        threadId: parentMessage.id,
      },
    });

    expect(replyResponse.ok()).toBe(true);
    const reply = await replyResponse.json();
    expect(reply.threadId).toBe(parentMessage.id);

    // Get replies - should include the reply
    const repliesResponse = await page.request.get(
      `/api/messages/${parentMessage.id}/replies?hydrate.content=true`
    );
    expect(repliesResponse.ok()).toBe(true);
    const replies = await repliesResponse.json();
    expect(replies.length).toBeGreaterThanOrEqual(1);
    expect(replies.some((r: { _content: string }) => r._content === replyContent)).toBe(true);
  });

  test('message reply button appears on hover', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    // Get messages for the channel
    const messagesResponse = await page.request.get(`/api/channels/${channel.id}/messages`);
    const messages = await messagesResponse.json();

    if (messages.length === 0) {
      // Create a message first
      await page.request.post('/api/messages', {
        data: {
          channelId: channel.id,
          sender: channel.members[0],
          content: `Test for reply button ${Date.now()}`,
        },
      });
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Wait for messages to load
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });

    // Get the first message and hover over it
    const firstMessage = page.getByTestId(/message-/).first();
    await firstMessage.hover();

    // Reply button should appear on hover
    const replyButton = page.getByTestId(/message-reply-button-/).first();
    await expect(replyButton).toBeVisible();
  });

  test('clicking reply button opens thread panel', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    // Create a message to reply to
    const messageContent = `Thread test ${Date.now()}`;
    const messageResponse = await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender: channel.members[0],
        content: messageContent,
      },
    });

    if (!messageResponse.ok()) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Wait for messages to load
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });

    // Wait for the specific message and hover over it
    const message = page.locator(`[data-testid^="message-"]`).filter({ hasText: messageContent }).first();
    await expect(message).toBeVisible({ timeout: 5000 });
    await message.hover();

    // Click reply button
    const replyButton = page.getByTestId(/message-reply-button-/).first();
    await expect(replyButton).toBeVisible();
    await replyButton.click();

    // Thread panel should appear
    await expect(page.getByTestId('thread-panel')).toBeVisible();
    await expect(page.getByTestId('thread-header')).toBeVisible();
  });

  test('thread panel has composer', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    // Create a message to reply to
    await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender: channel.members[0],
        content: `Thread composer test ${Date.now()}`,
      },
    });

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Wait for messages and open thread
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });
    const message = page.getByTestId(/message-/).first();
    await message.hover();
    await page.getByTestId(/message-reply-button-/).first().click();

    await expect(page.getByTestId('thread-panel')).toBeVisible();
    await expect(page.getByTestId('thread-composer')).toBeVisible();
    await expect(page.getByTestId('thread-input')).toBeVisible();
    await expect(page.getByTestId('thread-send-button')).toBeVisible();
  });

  test('thread panel can be closed', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender: channel.members[0],
        content: `Thread close test ${Date.now()}`,
      },
    });

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open thread
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });
    const message = page.getByTestId(/message-/).first();
    await message.hover();
    await page.getByTestId(/message-reply-button-/).first().click();

    await expect(page.getByTestId('thread-panel')).toBeVisible();

    // Close thread
    await page.getByTestId('thread-close-button').click();
    await expect(page.getByTestId('thread-panel')).not.toBeVisible();
  });

  test('sending reply in thread adds it to replies', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    // Create a message to reply to
    const messageContent = `Thread reply test ${Date.now()}`;
    const messageResponse = await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender: channel.members[0],
        content: messageContent,
      },
    });

    if (!messageResponse.ok()) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open thread
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });
    const message = page.locator(`[data-testid^="message-"]`).filter({ hasText: messageContent }).first();
    await expect(message).toBeVisible({ timeout: 5000 });
    await message.hover();
    await page.getByTestId(/message-reply-button-/).first().click();

    await expect(page.getByTestId('thread-panel')).toBeVisible();

    // Send a reply
    const replyContent = `Reply content ${Date.now()}`;
    await page.getByTestId('thread-input').fill(replyContent);
    await page.getByTestId('thread-send-button').click();

    // Wait for input to clear
    await expect(page.getByTestId('thread-input')).toHaveValue('', { timeout: 5000 });

    // Reply should appear in thread
    await expect(page.getByText(replyContent)).toBeVisible({ timeout: 10000 });
  });

  test('thread shows parent message', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    const messageContent = `Parent in thread ${Date.now()}`;
    await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender: channel.members[0],
        content: messageContent,
      },
    });

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open thread for the message
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });
    const message = page.locator(`[data-testid^="message-"]`).filter({ hasText: messageContent }).first();
    await expect(message).toBeVisible({ timeout: 5000 });
    await message.hover();
    await page.getByTestId(/message-reply-button-/).first().click();

    await expect(page.getByTestId('thread-panel')).toBeVisible();

    // Parent message should be shown
    await expect(page.getByTestId('thread-parent-message')).toBeVisible();
    await expect(page.getByTestId('thread-parent-message')).toContainText(messageContent);
  });
});
