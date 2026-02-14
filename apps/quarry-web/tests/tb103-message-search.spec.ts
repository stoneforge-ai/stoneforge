import { test, expect } from '@playwright/test';

test.describe('TB103: Message Search', () => {
  // Helper to get channels
  async function getChannels(page: import('@playwright/test').Page) {
    const response = await page.request.get('/api/channels');
    const data = await response.json();
    return data.items || data;
  }

  // Helper to get first entity
  async function getFirstEntity(page: import('@playwright/test').Page) {
    const response = await page.request.get('/api/entities');
    const entities = await response.json();
    const items = entities.items || entities;
    return items.length > 0 ? items[0] : null;
  }

  // Helper to create a test message with unique content
  async function createTestMessage(
    page: import('@playwright/test').Page,
    channelId: string,
    sender: string,
    content: string
  ): Promise<{ id: string; _content: string }> {
    const response = await page.request.post('/api/messages', {
      data: {
        channelId,
        sender,
        content,
      },
    });
    return response.json();
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
  });

  test('search input is visible in channel header when channel selected', async ({ page }) => {
    const channels = await getChannels(page);
    if (channels.length === 0) {
      test.skip();
      return;
    }

    // Select first channel
    await page.getByTestId(`channel-item-${channels[0].id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    // Search container should be visible
    await expect(page.getByTestId('message-search-container')).toBeVisible();
    await expect(page.getByTestId('message-search-input')).toBeVisible();
  });

  test('search input has correct placeholder', async ({ page }) => {
    const channels = await getChannels(page);
    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.getByTestId(`channel-item-${channels[0].id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    const searchInput = page.getByTestId('message-search-input');
    await expect(searchInput).toHaveAttribute('placeholder', 'Search messages...');
  });

  test('typing in search shows dropdown with results', async ({ page }) => {
    const channels = await getChannels(page);
    const entity = await getFirstEntity(page);
    if (channels.length === 0 || !entity) {
      test.skip();
      return;
    }

    // Find a channel where entity is a member
    const channel = channels.find((c: { members: string[] }) => c.members.includes(entity.id));
    if (!channel) {
      test.skip();
      return;
    }

    // Create a message with unique content
    const uniqueContent = `unique-search-test-${Date.now()}`;
    await createTestMessage(page, channel.id, entity.id, uniqueContent);

    // Select the channel
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    // Search for the unique content
    const searchInput = page.getByTestId('message-search-input');
    await searchInput.fill(uniqueContent.substring(0, 15));

    // Dropdown should appear
    await expect(page.getByTestId('message-search-dropdown')).toBeVisible({ timeout: 5000 });
  });

  test('search shows results with matching content', async ({ page }) => {
    const channels = await getChannels(page);
    const entity = await getFirstEntity(page);
    if (channels.length === 0 || !entity) {
      test.skip();
      return;
    }

    const channel = channels.find((c: { members: string[] }) => c.members.includes(entity.id));
    if (!channel) {
      test.skip();
      return;
    }

    // Create a message with unique content
    const uniqueContent = `searchable-message-content-${Date.now()}`;
    const message = await createTestMessage(page, channel.id, entity.id, uniqueContent);

    // Select the channel
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    // Reload to ensure message is visible
    await page.reload();
    await expect(page.getByTestId('channel-view')).toBeVisible({ timeout: 10000 });

    // Search for the unique content
    const searchInput = page.getByTestId('message-search-input');
    await searchInput.fill('searchable-message');

    // Wait for results
    await expect(page.getByTestId('message-search-results')).toBeVisible({ timeout: 5000 });

    // Should show the message in results
    await expect(page.getByTestId(`message-search-result-${message.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('search with no matches shows empty message', async ({ page }) => {
    const channels = await getChannels(page);
    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.getByTestId(`channel-item-${channels[0].id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    // Search for something that shouldn't match
    const searchInput = page.getByTestId('message-search-input');
    await searchInput.fill('xyzzynonexistentmessage123456789');

    // Wait for dropdown
    await expect(page.getByTestId('message-search-dropdown')).toBeVisible({ timeout: 5000 });

    // Wait for loading state to disappear
    await expect(page.getByTestId('message-search-loading')).not.toBeVisible({ timeout: 5000 });

    // Should show empty state
    await expect(page.getByTestId('message-search-empty')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('No messages found')).toBeVisible();
  });

  test('clear button appears when search has value', async ({ page }) => {
    const channels = await getChannels(page);
    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.getByTestId(`channel-item-${channels[0].id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    const searchInput = page.getByTestId('message-search-input');
    const clearButton = page.getByTestId('message-search-clear');

    // Clear button should not be visible initially
    await expect(clearButton).not.toBeVisible();

    // Type something
    await searchInput.fill('test');

    // Clear button should now be visible
    await expect(clearButton).toBeVisible();
  });

  test('clicking clear button clears the search', async ({ page }) => {
    const channels = await getChannels(page);
    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.getByTestId(`channel-item-${channels[0].id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    const searchInput = page.getByTestId('message-search-input');

    // Type a search query
    await searchInput.fill('test');
    await expect(page.getByTestId('message-search-clear')).toBeVisible();

    // Click the clear button
    await page.getByTestId('message-search-clear').click();

    // Input should be empty
    await expect(searchInput).toHaveValue('');

    // Clear button should be hidden again
    await expect(page.getByTestId('message-search-clear')).not.toBeVisible();
  });

  test('pressing Escape clears search', async ({ page }) => {
    const channels = await getChannels(page);
    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.getByTestId(`channel-item-${channels[0].id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    const searchInput = page.getByTestId('message-search-input');

    // Focus and type
    await searchInput.click();
    await searchInput.fill('test');
    await expect(searchInput).toHaveValue('test');

    // Press Escape
    await page.keyboard.press('Escape');

    // Input should be cleared
    await expect(searchInput).toHaveValue('');
  });

  test('clicking a search result scrolls to and highlights message', async ({ page }) => {
    const channels = await getChannels(page);
    const entity = await getFirstEntity(page);
    if (channels.length === 0 || !entity) {
      test.skip();
      return;
    }

    const channel = channels.find((c: { members: string[] }) => c.members.includes(entity.id));
    if (!channel) {
      test.skip();
      return;
    }

    // Create a unique message
    const uniqueContent = `scroll-to-test-${Date.now()}`;
    const message = await createTestMessage(page, channel.id, entity.id, uniqueContent);

    // Select the channel
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    // Reload to ensure message is visible
    await page.reload();
    await expect(page.getByTestId('channel-view')).toBeVisible({ timeout: 10000 });

    // Search for the message
    const searchInput = page.getByTestId('message-search-input');
    await searchInput.fill('scroll-to-test');

    // Wait for results
    await expect(page.getByTestId('message-search-results')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId(`message-search-result-${message.id}`)).toBeVisible({ timeout: 5000 });

    // Click the result
    await page.getByTestId(`message-search-result-${message.id}`).click();

    // Search should be cleared
    await expect(searchInput).toHaveValue('');

    // Message should be highlighted (yellow background)
    const messageElement = page.getByTestId(`message-${message.id}`);
    await expect(messageElement).toBeVisible();
    await expect(messageElement).toHaveClass(/bg-yellow-100/);
  });

  test('Cmd/Ctrl+F focuses search input', async ({ page }) => {
    const channels = await getChannels(page);
    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.getByTestId(`channel-item-${channels[0].id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    const searchInput = page.getByTestId('message-search-input');

    // Make sure search input is not focused initially
    await page.getByTestId('channel-header').click();
    await page.waitForTimeout(100);

    // Press Cmd+F (Mac) or Ctrl+F (Windows/Linux)
    await page.keyboard.press('Meta+f');

    // Search input should be focused
    await expect(searchInput).toBeFocused();
  });

  test('search API endpoint returns correct data structure', async ({ page }) => {
    const channels = await getChannels(page);
    const entity = await getFirstEntity(page);
    if (channels.length === 0 || !entity) {
      test.skip();
      return;
    }

    const channel = channels.find((c: { members: string[] }) => c.members.includes(entity.id));
    if (!channel) {
      test.skip();
      return;
    }

    // Create a test message
    const uniqueContent = `api-test-message-${Date.now()}`;
    const message = await createTestMessage(page, channel.id, entity.id, uniqueContent);

    // Call the search API directly
    const response = await page.request.get(`/api/messages/search?q=api-test-message&channelId=${channel.id}`);
    const data = await response.json();

    // Verify response structure
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('query');
    expect(Array.isArray(data.results)).toBe(true);

    // Should find our test message
    const found = data.results.find((r: { id: string }) => r.id === message.id);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('channelId');
    expect(found).toHaveProperty('sender');
    expect(found).toHaveProperty('snippet');
    expect(found).toHaveProperty('createdAt');
  });

  test('search API includes snippet with match context', async ({ page }) => {
    const channels = await getChannels(page);
    const entity = await getFirstEntity(page);
    if (channels.length === 0 || !entity) {
      test.skip();
      return;
    }

    const channel = channels.find((c: { members: string[] }) => c.members.includes(entity.id));
    if (!channel) {
      test.skip();
      return;
    }

    // Create a message with unique content
    const uniquePhrase = `snippettestphrase${Date.now()}`;
    const fullContent = `This message contains ${uniquePhrase} in its content.`;
    const message = await createTestMessage(page, channel.id, entity.id, fullContent);

    // Search by the unique phrase
    const response = await page.request.get(`/api/messages/search?q=${uniquePhrase}&channelId=${channel.id}`);
    const data = await response.json();

    // Should find the message
    const found = data.results.find((r: { id: string }) => r.id === message.id);
    expect(found).toBeDefined();

    // Should include a snippet
    expect(found.snippet).toBeDefined();
    expect(found.snippet).toContain(uniquePhrase);
  });

  test('global search is available in command palette', async ({ page }) => {
    // Open command palette
    await page.keyboard.press('Meta+k');
    await expect(page.getByTestId('command-palette')).toBeVisible({ timeout: 5000 });

    // Search for "Search Messages" command
    const input = page.getByTestId('command-palette-input');
    await input.fill('Search Messages');

    // Should show the search messages command
    await expect(page.getByTestId('command-item-search-messages')).toBeVisible();
  });

  test('search debounces rapid input changes', async ({ page }) => {
    const channels = await getChannels(page);
    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.getByTestId(`channel-item-${channels[0].id}`).click();
    await expect(page.getByTestId('channel-view')).toBeVisible();

    const searchInput = page.getByTestId('message-search-input');

    // Type rapidly
    await searchInput.type('t');
    await searchInput.type('e');
    await searchInput.type('s');
    await searchInput.type('t');

    // After full debounce delay + network, dropdown should appear
    await expect(page.getByTestId('message-search-dropdown')).toBeVisible({ timeout: 5000 });
  });

  test('keyboard navigation in search results works', async ({ page }) => {
    const channels = await getChannels(page);
    const entity = await getFirstEntity(page);
    if (channels.length === 0 || !entity) {
      test.skip();
      return;
    }

    const channel = channels.find((c: { members: string[] }) => c.members.includes(entity.id));
    if (!channel) {
      test.skip();
      return;
    }

    // Create multiple test messages
    const baseContent = `keyboard-nav-test-${Date.now()}`;
    await createTestMessage(page, channel.id, entity.id, `${baseContent}-message-1`);
    await createTestMessage(page, channel.id, entity.id, `${baseContent}-message-2`);

    // Select the channel and reload
    await page.getByTestId(`channel-item-${channel.id}`).click();
    await page.reload();
    await expect(page.getByTestId('channel-view')).toBeVisible({ timeout: 10000 });

    // Search for the messages
    const searchInput = page.getByTestId('message-search-input');
    await searchInput.fill('keyboard-nav-test');

    // Wait for results
    await expect(page.getByTestId('message-search-results')).toBeVisible({ timeout: 5000 });

    // First item should be selected by default (indicated by bg-blue-50)
    const results = page.locator('[data-testid^="message-search-result-"]');
    await expect(results.first()).toHaveClass(/bg-blue-50/);

    // Press down arrow to move selection
    await page.keyboard.press('ArrowDown');

    // Second item should now be selected
    await expect(results.nth(1)).toHaveClass(/bg-blue-50/);

    // Press up arrow to move back
    await page.keyboard.press('ArrowUp');

    // First item should be selected again
    await expect(results.first()).toHaveClass(/bg-blue-50/);
  });
});
