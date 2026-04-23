/**
 * TB127: Slash Commands in Message Composer
 *
 * Tests for slash command functionality in the message composer:
 * - Triggered by typing `/` in the composer
 * - Fuzzy search filtering as user types
 * - Keyboard navigation (up/down, Enter, Escape)
 * - Commands: formatting (/bold, /italic, /code), blocks (/codeblock, /quote, /bullet, /numbered)
 * - Embed commands (/task, /doc, /emoji) open picker modals
 */

import { test, expect } from '@playwright/test';

test.describe('TB127: Message Slash Commands', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to messages page
    await page.goto('/messages');
    await page.waitForSelector('[data-testid="channel-list"]', { timeout: 10000 });
  });

  test('slash menu appears when typing "/" in message composer', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" in the message composer
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/');

    // Wait for the slash command menu to appear
    const menu = page.locator('[data-testid="message-slash-command-menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });
  });

  test('slash menu shows all command categories', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" in the message composer
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/');

    // Wait for the slash command menu
    const menu = page.locator('[data-testid="message-slash-command-menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Verify all categories are present
    await expect(page.locator('[data-testid="message-slash-category-formatting"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-slash-category-blocks"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-slash-category-media"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-slash-category-embeds"]')).toBeVisible();
  });

  test('slash menu filters commands with fuzzy search', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/bo" to filter for "bold"
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/bo');

    // Wait for the filtered menu
    const menu = page.locator('[data-testid="message-slash-command-menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Bold should be visible
    await expect(page.locator('[data-testid="message-slash-item-bold"]')).toBeVisible();

    // Other commands should not be visible due to filtering
    await expect(page.locator('[data-testid="message-slash-item-italic"]')).not.toBeVisible();
  });

  test('escape key closes the slash menu', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" in the message composer
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/');

    // Wait for the menu
    const menu = page.locator('[data-testid="message-slash-command-menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Menu should close
    await expect(menu).not.toBeVisible({ timeout: 2000 });
  });

  test('arrow keys navigate the slash menu', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" in the message composer
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/');

    // Wait for the menu
    const menu = page.locator('[data-testid="message-slash-command-menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // First item should be selected (blue background)
    const firstItem = page.locator('[data-testid="message-slash-item-bold"]');
    await expect(firstItem).toHaveClass(/bg-blue-50/);

    // Press down arrow
    await page.keyboard.press('ArrowDown');

    // Second item should now be selected
    const secondItem = page.locator('[data-testid="message-slash-item-italic"]');
    await expect(secondItem).toHaveClass(/bg-blue-50/);

    // First item should no longer be selected
    await expect(firstItem).not.toHaveClass(/bg-blue-50/);
  });

  test('/bold command applies bold formatting', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" and select bold
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/bold');
    await page.keyboard.press('Enter');

    // Wait for command execution
    await page.waitForTimeout(300);

    // The slash command should be removed and bold formatting applied
    // Type some text
    await page.keyboard.type('test text');

    // Wait for text input
    await page.waitForTimeout(200);

    // Verify the text was typed with bold formatting - check for <strong> tag
    const strongTag = page.locator('[data-testid="message-input"] strong');
    await expect(strongTag).toContainText('test text');
  });

  test('/code command applies inline code formatting', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" and select code
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/code');
    await page.keyboard.press('Enter');

    // Wait for command execution
    await page.waitForTimeout(300);

    // Type some text
    await page.keyboard.type('inline code');

    // Wait for text input
    await page.waitForTimeout(200);

    // Verify the text was typed with inline code formatting - check for <code> tag (not inside pre)
    const codeTag = page.locator('[data-testid="message-input"] code:not(pre code)');
    await expect(codeTag).toContainText('inline code');
  });

  test('/codeblock command inserts code block', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" and select codeblock
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/codeblock');
    await page.keyboard.press('Enter');

    // Wait a moment for the command to execute
    await page.waitForTimeout(300);

    // A code block should be inserted in the editor (check DOM presence)
    // The code block might not be scrolled into view, so use toBeAttached instead of toBeVisible
    const codeBlock = page.locator('[data-testid="message-input"] pre');
    await expect(codeBlock).toBeAttached({ timeout: 2000 });
  });

  test('/quote command inserts blockquote', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" and select quote
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/quote');
    await page.keyboard.press('Enter');

    // Wait a moment for the command to execute
    await page.waitForTimeout(300);

    // A blockquote should be inserted in the editor
    const blockquote = page.locator('[data-testid="message-input"] blockquote');
    await expect(blockquote).toBeAttached({ timeout: 2000 });
  });

  test('/task command opens task picker modal', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" and select task
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/task');
    await page.keyboard.press('Enter');

    // Wait for task picker modal to open
    const taskPicker = page.locator('[data-testid="task-picker-modal"]');
    await expect(taskPicker).toBeVisible({ timeout: 5000 });
  });

  test('/doc command opens document picker modal', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" and select doc
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/doc');
    await page.keyboard.press('Enter');

    // Wait for document picker modal to open
    const docPicker = page.locator('[data-testid="document-picker-modal"]');
    await expect(docPicker).toBeVisible({ timeout: 5000 });
  });

  test('/emoji command opens emoji picker modal', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" and select emoji
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/emoji');
    await page.keyboard.press('Enter');

    // Wait for emoji picker modal to open
    const emojiPicker = page.locator('[data-testid="emoji-picker-modal"]');
    await expect(emojiPicker).toBeVisible({ timeout: 5000 });
  });

  test('clicking a slash command item executes it', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/" in the message composer
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/');

    // Wait for the menu
    const menu = page.locator('[data-testid="message-slash-command-menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Click the italic command
    await page.locator('[data-testid="message-slash-item-italic"]').click();

    // Type some text
    await page.keyboard.type('italic text');

    // The toolbar italic button should be active
    const italicButton = page.locator('[data-testid="message-toolbar-italic"]');
    await expect(italicButton).toHaveClass(/bg-gray-200.*text-blue-600|text-blue-600.*bg-gray-200/);
  });

  test('shows "No matching commands" when search has no results', async ({ page }) => {
    // Select a channel first
    const channelItem = page.locator('[data-testid^="channel-item-"]').first();
    await channelItem.click();
    await page.waitForSelector('[data-testid="message-rich-composer"]');

    // Type "/xyz" which should match nothing
    const editor = page.locator('[data-testid="message-input"]');
    await editor.focus();
    await page.keyboard.type('/xyznonexistent');

    // Wait for the menu
    const menu = page.locator('[data-testid="message-slash-command-menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Should show "No matching commands"
    await expect(menu).toContainText('No matching commands');
  });
});
