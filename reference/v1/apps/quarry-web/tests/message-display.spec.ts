import { test, expect } from '@playwright/test';

test.describe('TB17: Message Display', () => {
  // Helper to get channels
  async function getChannels(page: import('@playwright/test').Page) {
    const response = await page.request.get('/api/channels');
    return response.json();
  }

  test('GET /api/channels/:id/messages endpoint returns messages', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/channels/${channels[0].id}/messages`);
    expect(response.ok()).toBe(true);
    const messages = await response.json();
    expect(Array.isArray(messages)).toBe(true);
  });

  test('GET /api/channels/:id/messages returns 404 for invalid channel', async ({ page }) => {
    const response = await page.request.get('/api/channels/el-invalid999/messages');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/channels/:id/messages supports hydration', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(
      `/api/channels/${channels[0].id}/messages?hydrate.content=true`
    );
    expect(response.ok()).toBe(true);
    const messages = await response.json();
    expect(Array.isArray(messages)).toBe(true);
  });

  test('channel view shows channel header', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the first channel
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    // Channel header should be visible
    await expect(page.getByTestId('channel-header')).toBeVisible();
    await expect(page.getByTestId('channel-name')).toBeVisible();
    await expect(page.getByTestId('channel-member-count')).toBeVisible();
  });

  test('channel view shows messages container', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the first channel
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    // Messages container should be visible
    await expect(page.getByTestId('messages-container')).toBeVisible();
  });

  test('channel view shows empty state when no messages', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    // Check if this channel has no messages
    const messagesResponse = await page.request.get(`/api/channels/${channels[0].id}/messages`);
    const messages = await messagesResponse.json();

    if (messages.length > 0) {
      // Find a channel with no messages
      let emptyChannelId = null;
      for (const channel of channels) {
        const resp = await page.request.get(`/api/channels/${channel.id}/messages`);
        const msgs = await resp.json();
        if (msgs.length === 0) {
          emptyChannelId = channel.id;
          break;
        }
      }
      if (!emptyChannelId) {
        test.skip();
        return;
      }

      await page.goto('/messages');
      await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`channel-item-${emptyChannelId}`).click();
    } else {
      await page.goto('/messages');
      await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`channel-item-${channels[0].id}`).click();
    }

    await expect(page.getByTestId('messages-empty')).toBeVisible({ timeout: 5000 });
  });

  test('channel view shows messages when they exist', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    // Find a channel with messages
    let channelWithMessages: { channel: { id: string }; messages: { id: string }[] } | null = null;
    for (const channel of channels) {
      const resp = await page.request.get(`/api/channels/${channel.id}/messages`);
      const msgs = await resp.json();
      if (msgs.length > 0) {
        channelWithMessages = { channel, messages: msgs };
        break;
      }
    }

    if (!channelWithMessages) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channelWithMessages.channel.id}`).click();

    // Messages list should be visible
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 5000 });

    // First message should be visible
    const firstMessage = channelWithMessages.messages[0];
    await expect(page.getByTestId(`message-${firstMessage.id}`)).toBeVisible();
  });

  test('message displays sender and time', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    // Find a channel with messages
    let channelWithMessages: { channel: { id: string }; messages: { id: string }[] } | null = null;
    for (const channel of channels) {
      const resp = await page.request.get(`/api/channels/${channel.id}/messages`);
      const msgs = await resp.json();
      if (msgs.length > 0) {
        channelWithMessages = { channel, messages: msgs };
        break;
      }
    }

    if (!channelWithMessages) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channelWithMessages.channel.id}`).click();

    const firstMessage = channelWithMessages.messages[0];

    // Sender and time should be visible
    await expect(page.getByTestId(`message-sender-${firstMessage.id}`)).toBeVisible();
    await expect(page.getByTestId(`message-time-${firstMessage.id}`)).toBeVisible();
    await expect(page.getByTestId(`message-content-${firstMessage.id}`)).toBeVisible();
    await expect(page.getByTestId(`message-avatar-${firstMessage.id}`)).toBeVisible();
  });

  test('message composer placeholder is visible', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    // Composer placeholder should be visible
    await expect(page.getByTestId('message-composer-placeholder')).toBeVisible();
  });

  test('channel name is displayed in header', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    // Channel name in header should match
    await expect(page.getByTestId('channel-name')).toHaveText(channels[0].name);
  });

  test('member count is displayed correctly', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    // Member count should be visible
    const memberCountText = await page.getByTestId('channel-member-count').textContent();
    expect(memberCountText).toMatch(/\d+ members?/);
  });
});
