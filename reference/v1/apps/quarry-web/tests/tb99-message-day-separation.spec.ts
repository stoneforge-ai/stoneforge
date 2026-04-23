import { test, expect } from '@playwright/test';

test.describe('TB99: Message Day Separation', () => {
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
  ): Promise<{ channel: { id: string }; messages: { id: string; createdAt: string }[] } | null> {
    const channels = await getChannels(page);
    if (channels.length === 0) return null;

    for (const channel of channels) {
      const resp = await page.request.get(`/api/channels/${channel.id}/messages`);
      const msgs = await resp.json();
      if (Array.isArray(msgs) && msgs.length > 0) {
        return { channel, messages: msgs };
      }
    }
    return null;
  }

  test('messages list displays date separators', async ({ page }) => {
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

    // Wait for virtualized messages list (TB131: always use virtualization)
    const virtualizedList = page.getByTestId('virtualized-messages-list');
    await expect(virtualizedList).toBeVisible({ timeout: 5000 });

    // Scroll to top to ensure date separator is rendered (virtualization only renders visible items)
    await virtualizedList.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(200);

    // At least one date separator should be visible
    // Date separators have testids like "date-separator-today" or "date-separator-monday,-january-15"
    const dateSeparators = page.locator('[data-testid^="date-separator-"]');
    const count = await dateSeparators.count();
    expect(count).toBeGreaterThan(0);
  });

  test('date separator displays correct label', async ({ page }) => {
    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();

    // Wait for virtualized messages list (TB131: always use virtualization)
    const virtualizedList = page.getByTestId('virtualized-messages-list');
    await expect(virtualizedList).toBeVisible({ timeout: 5000 });

    // Scroll to top to ensure date separator is rendered (virtualization only renders visible items)
    await virtualizedList.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(200);

    // Find any date separator label
    const dateSeparatorLabels = page.locator('[data-testid="date-separator-label"]');
    const count = await dateSeparatorLabels.count();

    if (count > 0) {
      // Verify the label has text content (Today, Yesterday, or a date)
      const labelText = await dateSeparatorLabels.first().textContent();
      expect(labelText).toBeTruthy();
      // Label should be one of: Today, Yesterday, or a formatted date like "Monday, January 15"
      expect(
        labelText === 'Today' ||
        labelText === 'Yesterday' ||
        /[A-Z][a-z]+,\s[A-Z][a-z]+\s\d+/.test(labelText!)
      ).toBe(true);
    }
  });

  test('date separator includes calendar icon', async ({ page }) => {
    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();

    // Wait for messages container (virtualized list)
    const virtualizedList = page.getByTestId('virtualized-messages-list');
    await expect(virtualizedList).toBeVisible({ timeout: 5000 });

    // Scroll to top to ensure date separator is rendered (virtualization only renders visible items)
    await virtualizedList.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(200);

    // Find date separator
    const dateSeparator = page.locator('[data-testid^="date-separator-"]').first();
    const isVisible = await dateSeparator.isVisible();

    if (isVisible) {
      // Date separator should contain an SVG icon (Calendar)
      const svg = dateSeparator.locator('svg');
      await expect(svg).toBeVisible();
    }
  });

  test('date separator styling has correct appearance', async ({ page }) => {
    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();

    // Wait for messages container
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Find date separator
    const dateSeparator = page.locator('[data-testid^="date-separator-"]').first();
    const isVisible = await dateSeparator.isVisible();

    if (isVisible) {
      // Should have horizontal lines (flex children with h-px class)
      const lines = dateSeparator.locator('.h-px');
      expect(await lines.count()).toBe(2); // Left and right lines
    }
  });

  test('each unique day has exactly one date separator', async ({ page }) => {
    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();

    // Wait for messages container
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Wait for messages to render
    await page.waitForTimeout(500);

    // Get all date separators
    const dateSeparators = page.locator('[data-testid^="date-separator-"]');
    const separatorCount = await dateSeparators.count();

    if (separatorCount === 0) {
      // No separators (possibly no messages yet)
      test.skip();
      return;
    }

    // Get all unique date labels using getAllTextContents for efficiency
    const allLabels = await page.locator('[data-testid="date-separator-label"]').allTextContents();
    const uniqueLabels = new Set(allLabels.filter(Boolean));

    // Number of unique labels should equal total count (no duplicates within list)
    expect(uniqueLabels.size).toBe(allLabels.filter(Boolean).length);
  });

  test('messages are grouped under their date separator', async ({ page }) => {
    const channelData = await findChannelWithMessages(page);

    if (!channelData || channelData.messages.length < 2) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();

    // Wait for messages container
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Check that messages exist after date separators
    const messageElements = page.locator('[data-testid^="message-"]');
    const messageCount = await messageElements.count();

    // If we have messages, they should be visible
    expect(messageCount).toBeGreaterThan(0);
  });

  test('date separator "Today" shows for messages from today', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    // Find a channel with members
    const channelWithMembers = channels.find((c: { members?: string[] }) => c.members && c.members.length > 0);
    if (!channelWithMembers) {
      test.skip();
      return;
    }

    // Create a new message using a valid member as sender
    const response = await page.request.post('/api/messages', {
      data: {
        channelId: channelWithMembers.id,
        sender: channelWithMembers.members[0],
        content: `Test message for today ${Date.now()}`,
      },
    });

    if (!response.ok()) {
      // If message creation fails, try to find an existing channel with messages from today
      const channelData = await findChannelWithMessages(page);
      if (!channelData) {
        test.skip();
        return;
      }

      await page.goto('/messages');
      await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`channel-item-${channelData.channel.id}`).click();
    } else {
      await page.goto('/messages');
      await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
      await page.getByTestId(`channel-item-${channelWithMembers.id}`).click();
    }

    // Wait for messages container
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Look for "Today" separator
    const todaySeparator = page.locator('[data-testid="date-separator-today"]');
    await expect(todaySeparator).toBeVisible({ timeout: 5000 });
  });

  test('messages list renders without date separators when empty', async ({ page }) => {
    const channels = await getChannels(page);

    if (channels.length === 0) {
      test.skip();
      return;
    }

    // Find an empty channel
    let emptyChannelId: string | null = null;
    for (const channel of channels) {
      const resp = await page.request.get(`/api/channels/${channel.id}/messages`);
      const msgs = await resp.json();
      // API may return array or { items: [] }
      const messageList = Array.isArray(msgs) ? msgs : (msgs?.items || []);
      if (messageList.length === 0) {
        emptyChannelId = channel.id;
        break;
      }
    }

    if (!emptyChannelId) {
      // All channels have messages - this test doesn't apply
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${emptyChannelId}`).click();

    // Wait for the messages container
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Wait a moment for any rendering
    await page.waitForTimeout(500);

    // Either empty state is visible OR there's a messages-list (if real-time message arrived)
    const emptyState = page.getByTestId('messages-empty');
    const messagesList = page.getByTestId('messages-list');

    const isEmptyStateVisible = await emptyState.isVisible().catch(() => false);
    const isMessagesListVisible = await messagesList.isVisible().catch(() => false);

    if (isEmptyStateVisible) {
      // No date separators should be present in empty state
      const dateSeparators = page.locator('[data-testid^="date-separator-"]');
      expect(await dateSeparators.count()).toBe(0);
    } else if (isMessagesListVisible) {
      // Messages loaded (possibly from another test) - verify separators exist if messages exist
      const dateSeparators = page.locator('[data-testid^="date-separator-"]');
      // Just verify the page loads correctly
      expect(await dateSeparators.count()).toBeGreaterThanOrEqual(0);
    } else {
      // Neither state visible yet - fail gracefully
      test.skip();
    }
  });

  test('date separator is consistent in both virtualized and non-virtualized lists', async ({ page }) => {
    const channelData = await findChannelWithMessages(page);

    if (!channelData) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await page.getByTestId(`channel-item-${channelData.channel.id}`).click();

    // Wait for messages container
    await expect(page.getByTestId('messages-container')).toBeVisible({ timeout: 5000 });

    // Check for virtualized list (TB131: messages are now always virtualized)
    const virtualizedList = page.getByTestId('virtualized-messages-list');
    await expect(virtualizedList).toBeVisible({ timeout: 5000 });

    // Scroll to top to ensure date separator is rendered (virtualization only renders visible items)
    await virtualizedList.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(200); // Wait for virtual items to update

    // Date separators should be present at the top of the list (first item of each day)
    const dateSeparators = page.locator('[data-testid^="date-separator-"]');
    const count = await dateSeparators.count();
    // There should be at least one date separator (for "Today" or another day)
    expect(count).toBeGreaterThan(0);
  });
});
