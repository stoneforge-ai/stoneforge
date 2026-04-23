import { test, expect } from '@playwright/test';

test.describe('TB100: Copy Message Action', () => {
  // Helper to get channels (API returns { items: [], total, ... })
  async function getChannels(page: import('@playwright/test').Page) {
    const response = await page.request.get('/api/channels');
    const data = await response.json();
    // API returns { items: [...] } format
    return data?.items || (Array.isArray(data) ? data : []);
  }

  // Helper to find a channel with messages
  async function findChannelWithMessages(
    page: import('@playwright/test').Page
  ): Promise<{ channel: { id: string; members: string[] }; messages: { id: string; _content?: string }[] } | null> {
    const channels = await getChannels(page);
    if (channels.length === 0) return null;

    for (const channel of channels) {
      const resp = await page.request.get(`/api/channels/${channel.id}/messages?hydrate.content=true`);
      const msgs = await resp.json();
      if (Array.isArray(msgs) && msgs.length > 0) {
        return { channel, messages: msgs };
      }
    }
    return null;
  }

  test('message displays copy button on hover', async ({ page }) => {
    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the channel with messages
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();

    // Wait for messages container to be visible
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Find a message
    const firstMessage = page.locator('[data-testid^="message-"]').first();
    await expect(firstMessage).toBeVisible();

    // Get the message id from the test id
    const messageTestId = await firstMessage.getAttribute('data-testid');
    const messageId = messageTestId?.replace('message-', '');

    // Initially, action menu should be hidden
    const actionMenu = page.getByTestId(`message-actions-${messageId}`);

    // Hover over message to reveal actions
    await firstMessage.hover();

    // Action menu should be visible on hover
    await expect(actionMenu).toBeVisible({ timeout: 2000 });

    // Copy button should be visible in action menu
    const copyButton = page.getByTestId(`message-copy-button-${messageId}`);
    await expect(copyButton).toBeVisible();
  });

  test('clicking copy button copies message content', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the channel with messages
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Find a message with content
    const messageWithContent = channelData.messages.find(m => m._content);
    if (!messageWithContent) {
      test.skip();
      return;
    }

    const messageElement = page.getByTestId(`message-${messageWithContent.id}`);
    await expect(messageElement).toBeVisible({ timeout: 5000 });

    // Hover to reveal copy button
    await messageElement.hover();

    // Click copy button
    const copyButton = page.getByTestId(`message-copy-button-${messageWithContent.id}`);
    await expect(copyButton).toBeVisible({ timeout: 2000 });
    await copyButton.click();

    // Verify clipboard content
    const clipboardContent = await page.evaluate(async () => {
      return await navigator.clipboard.readText();
    });

    expect(clipboardContent).toBe(messageWithContent._content);
  });

  test('copy button shows success indicator after click', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the channel with messages
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Find a message
    const firstMessage = page.locator('[data-testid^="message-"]').first();
    await expect(firstMessage).toBeVisible();

    const messageTestId = await firstMessage.getAttribute('data-testid');
    const messageId = messageTestId?.replace('message-', '');

    // Hover to reveal copy button
    await firstMessage.hover();

    const copyButton = page.getByTestId(`message-copy-button-${messageId}`);
    await expect(copyButton).toBeVisible({ timeout: 2000 });

    // Click copy - the button icon should change to a check mark
    await copyButton.click();

    // Check icon should appear (the Check icon from lucide-react has text-green-500 class)
    const checkIcon = copyButton.locator('svg.text-green-500');
    await expect(checkIcon).toBeVisible({ timeout: 2000 });
  });

  test('toast notification appears after copying message', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the channel with messages
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Find a message
    const firstMessage = page.locator('[data-testid^="message-"]').first();
    await expect(firstMessage).toBeVisible();

    const messageTestId = await firstMessage.getAttribute('data-testid');
    const messageId = messageTestId?.replace('message-', '');

    // Hover and click copy
    await firstMessage.hover();
    const copyButton = page.getByTestId(`message-copy-button-${messageId}`);
    await copyButton.click();

    // Look for toast notification (sonner creates toasts with role="status")
    // or with specific text content
    const toast = page.locator('text=Message copied');
    await expect(toast).toBeVisible({ timeout: 3000 });
  });

  test('pressing C key when message is focused copies content', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the channel with messages
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Find a message with content
    const messageWithContent = channelData.messages.find(m => m._content);
    if (!messageWithContent) {
      test.skip();
      return;
    }

    const messageElement = page.getByTestId(`message-${messageWithContent.id}`);
    await expect(messageElement).toBeVisible({ timeout: 5000 });

    // Focus the message
    await messageElement.focus();

    // Verify it's focused (should have focus ring)
    await expect(messageElement).toBeFocused();

    // Press C key to copy
    await page.keyboard.press('c');

    // Toast should appear
    const toast = page.locator('text=Message copied');
    await expect(toast).toBeVisible({ timeout: 3000 });

    // Verify clipboard content
    const clipboardContent = await page.evaluate(async () => {
      return await navigator.clipboard.readText();
    });

    expect(clipboardContent).toBe(messageWithContent._content);
  });

  test('focused message has visual highlight', async ({ page }) => {
    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the channel with messages
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Find a message
    const firstMessage = page.locator('[data-testid^="message-"]').first();
    await expect(firstMessage).toBeVisible();

    // Focus the message
    await firstMessage.focus();
    await expect(firstMessage).toBeFocused();

    // Check that the element has focus styling classes
    // The class contains 'focus:bg-blue-50 focus:ring-2' which are Tailwind focus variants
    await expect(firstMessage).toHaveClass(/focus:bg-blue-50/);
    await expect(firstMessage).toHaveClass(/focus:ring-2/);
  });

  test('action menu includes reply button for non-threaded messages', async ({ page }) => {
    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the channel with messages
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Find a message
    const firstMessage = page.locator('[data-testid^="message-"]').first();
    await expect(firstMessage).toBeVisible();

    const messageTestId = await firstMessage.getAttribute('data-testid');
    const messageId = messageTestId?.replace('message-', '');

    // Hover to reveal actions
    await firstMessage.hover();

    // Both copy and reply buttons should be visible in action menu
    const copyButton = page.getByTestId(`message-copy-button-${messageId}`);
    const replyAction = page.getByTestId(`message-reply-action-${messageId}`);

    await expect(copyButton).toBeVisible({ timeout: 2000 });
    await expect(replyAction).toBeVisible({ timeout: 2000 });
  });

  test('copy button title shows keyboard shortcut hint', async ({ page }) => {
    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the channel with messages
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Find a message
    const firstMessage = page.locator('[data-testid^="message-"]').first();
    await expect(firstMessage).toBeVisible();

    const messageTestId = await firstMessage.getAttribute('data-testid');
    const messageId = messageTestId?.replace('message-', '');

    // Hover to reveal copy button
    await firstMessage.hover();

    const copyButton = page.getByTestId(`message-copy-button-${messageId}`);
    await expect(copyButton).toBeVisible({ timeout: 2000 });

    // Check title attribute for keyboard shortcut hint
    const title = await copyButton.getAttribute('title');
    expect(title).toContain('C');
    expect(title).toContain('focused');
  });
});
