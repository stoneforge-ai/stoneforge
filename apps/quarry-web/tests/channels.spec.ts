import { test, expect } from '@playwright/test';

test.describe('TB16: Channel List', () => {
  test('GET /api/channels endpoint returns channels', async ({ page }) => {
    const response = await page.request.get('/api/channels');
    expect(response.ok()).toBe(true);
    const channels = await response.json();
    expect(Array.isArray(channels)).toBe(true);
  });

  test('GET /api/channels/:id endpoint returns channel', async ({ page }) => {
    // First get list of channels
    const listResponse = await page.request.get('/api/channels');
    const channels = await listResponse.json();

    if (channels.length === 0) {
      test.skip();
      return;
    }

    // Get individual channel
    const response = await page.request.get(`/api/channels/${channels[0].id}`);
    expect(response.ok()).toBe(true);
    const channel = await response.json();
    expect(channel.id).toBe(channels[0].id);
    expect(channel.type).toBe('channel');
  });

  test('GET /api/channels/:id returns 404 for invalid ID', async ({ page }) => {
    const response = await page.request.get('/api/channels/el-invalid999');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('messages page is accessible', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
  });

  test('channel list is visible on messages page', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await page.waitForTimeout(500);

    // Either channel list or loading should be visible
    const channelList = page.getByTestId('channel-list');
    const loading = page.getByTestId('channels-loading');

    // Wait for channel list to appear (loading should be done)
    await expect(channelList.or(loading)).toBeVisible({ timeout: 5000 });
  });

  test('channel list shows channel count', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Channel count should be visible
    await expect(page.getByTestId('channel-count')).toBeVisible();
    const countText = await page.getByTestId('channel-count').textContent();
    expect(countText).toMatch(/\d+ channels?/);
  });

  test('channel placeholder is shown when no channel selected', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('channel-placeholder')).toBeVisible();
  });

  test('clicking channel shows channel view', async ({ page }) => {
    // First check if there are any channels
    const response = await page.request.get('/api/channels');
    const channels = await response.json();

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the first channel
    await page.getByTestId(`channel-item-${channels[0].id}`).click();

    // Channel view should appear
    await expect(page.getByTestId('channel-view')).toBeVisible();
    await expect(page.getByTestId('channel-header')).toBeVisible();
  });

  test('channel item shows correct info', async ({ page }) => {
    const response = await page.request.get('/api/channels');
    const channels = await response.json();

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // First channel item should be visible with name
    const channelItem = page.getByTestId(`channel-item-${channels[0].id}`);
    await expect(channelItem).toBeVisible();
    await expect(channelItem).toContainText(channels[0].name);
  });

  test('group channels are separated from direct messages', async ({ page }) => {
    const response = await page.request.get('/api/channels');
    const channels = await response.json();

    const hasGroup = channels.some((c: { channelType: string }) => c.channelType === 'group');
    const hasDirect = channels.some((c: { channelType: string }) => c.channelType === 'direct');

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Check for section labels if applicable
    if (hasGroup) {
      await expect(page.getByTestId('channel-group-label')).toBeVisible();
    }
    if (hasDirect) {
      await expect(page.getByTestId('channel-direct-label')).toBeVisible();
    }
  });

  test('empty state is shown when no channels', async ({ page }) => {
    // This test is more of a UI verification - if no channels exist
    const response = await page.request.get('/api/channels');
    const channels = await response.json();

    if (channels.length > 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('channel-empty-state')).toBeVisible();
  });

  test('selected channel is highlighted', async ({ page }) => {
    const response = await page.request.get('/api/channels');
    const channels = await response.json();

    if (channels.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click on the first channel
    const channelItem = page.getByTestId(`channel-item-${channels[0].id}`);
    await channelItem.click();

    // Check that the item has the selected style (bg-blue-50)
    await expect(channelItem).toHaveClass(/bg-blue-50/);
  });

  test('sidebar Messages link navigates to messages page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    // Click on Messages in sidebar
    await page.getByTestId('nav-messages').click();

    // Should navigate to messages page
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('/messages');
  });
});
