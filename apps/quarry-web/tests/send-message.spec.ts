import { test, expect } from '@playwright/test';

test.describe('TB18: Send Message', () => {
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

  test('POST /api/messages endpoint creates message', async ({ page }) => {
    const channels = await getChannels(page);
    const entity = await getFirstEntity(page);

    if (channels.length === 0 || !entity) {
      test.skip();
      return;
    }

    // Check if entity is a member of the channel
    const channel = channels[0];
    if (!channel.members.includes(entity.id)) {
      test.skip();
      return;
    }

    const content = `Test message ${Date.now()}`;
    const response = await page.request.post('/api/messages', {
      data: {
        channelId: channel.id,
        sender: entity.id,
        content,
      },
    });

    expect(response.ok()).toBe(true);
    const message = await response.json();
    expect(message.channelId).toBe(channel.id);
    expect(message.sender).toBe(entity.id);
    expect(message._content).toBe(content);
  });

  test('POST /api/messages requires channelId', async ({ page }) => {
    const response = await page.request.post('/api/messages', {
      data: {
        sender: 'el-test',
        content: 'test',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('channelId');
  });

  test('POST /api/messages requires sender', async ({ page }) => {
    const response = await page.request.post('/api/messages', {
      data: {
        channelId: 'el-test',
        content: 'test',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('sender');
  });

  test('POST /api/messages requires content', async ({ page }) => {
    const response = await page.request.post('/api/messages', {
      data: {
        channelId: 'el-test',
        sender: 'el-test',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('content');
  });

  test('POST /api/messages returns 404 for invalid channel', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const response = await page.request.post('/api/messages', {
      data: {
        channelId: 'el-invalid999',
        sender: entity.id,
        content: 'test',
      },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('message composer is visible in channel view', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    await expect(page.getByTestId('message-composer')).toBeVisible();
    await expect(page.getByTestId('message-input')).toBeVisible();
    await expect(page.getByTestId('message-send-button')).toBeVisible();
  });

  test('message input has placeholder with channel name', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    const input = page.getByTestId('message-input');
    await expect(input).toBeVisible();
    const placeholder = await input.getAttribute('placeholder');
    expect(placeholder).toContain(channels[0].name);
  });

  test('send button is disabled when input is empty', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    await expect(page.getByTestId('message-send-button')).toBeDisabled();
  });

  test('send button is enabled when input has content', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    await page.getByTestId('message-input').fill('Hello world');
    await expect(page.getByTestId('message-send-button')).not.toBeDisabled();
  });

  test('typing in input enables send button', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    const input = page.getByTestId('message-input');
    const sendButton = page.getByTestId('message-send-button');

    await expect(sendButton).toBeDisabled();
    await input.fill('Test message');
    await expect(sendButton).not.toBeDisabled();
  });

  test('sending message clears input', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    // Check if the channel has members
    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    const input = page.getByTestId('message-input');
    await input.fill('Test message to send');
    await page.getByTestId('message-send-button').click();

    // Input should be cleared after sending
    await expect(input).toHaveValue('', { timeout: 5000 });
  });

  test('sent message appears in message list', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    // Check if the channel has members
    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    const testContent = `UI Test Message ${Date.now()}`;
    await page.getByTestId('message-input').fill(testContent);
    await page.getByTestId('message-send-button').click();

    // Wait for input to clear (message sent)
    await expect(page.getByTestId('message-input')).toHaveValue('', { timeout: 5000 });

    // Message should appear in the list
    await expect(page.getByText(testContent)).toBeVisible({ timeout: 10000 });
  });

  test('Enter key sends message', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    // Check if the channel has members
    const channel = channels[0];
    if (!channel.members || channel.members.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    const testContent = `Enter Key Test ${Date.now()}`;
    const input = page.getByTestId('message-input');
    await input.fill(testContent);
    await input.press('Enter');

    // Input should be cleared after sending
    await expect(input).toHaveValue('', { timeout: 5000 });
  });

  test('Shift+Enter does not send message', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    const input = page.getByTestId('message-input');
    await input.fill('Line 1');
    await input.press('Shift+Enter');

    // Input should still have content (not sent)
    const value = await input.inputValue();
    expect(value).toContain('Line 1');
  });
});
