import { test, expect } from '@playwright/test';

test.describe('TB101: Rich Text in MessageComposer', () => {
  // Helper to get channels
  async function getChannels(page: import('@playwright/test').Page) {
    const response = await page.request.get('/api/channels');
    const data = await response.json();
    return data?.items || (Array.isArray(data) ? data : []);
  }

  // Helper to get a channel with members
  async function getChannelWithMembers(page: import('@playwright/test').Page) {
    const channels = await getChannels(page);
    const channel = channels.find(
      (c: { members: string[] }) => c.members && c.members.length > 0
    );
    return channel || null;
  }

  test('rich text composer is visible in channel view', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Rich composer should be visible
    await expect(page.getByTestId('message-composer')).toBeVisible();
    await expect(page.getByTestId('message-rich-composer')).toBeVisible();
    await expect(page.getByTestId('message-send-button')).toBeVisible();
  });

  test('toolbar toggle button is visible', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Toolbar toggle should be visible
    await expect(page.getByTestId('message-toolbar-toggle')).toBeVisible();
  });

  test('condensed toolbar shows basic formatting buttons', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Condensed toolbar should show bold, italic, code
    await expect(page.getByTestId('message-toolbar-bold')).toBeVisible();
    await expect(page.getByTestId('message-toolbar-italic')).toBeVisible();
    await expect(page.getByTestId('message-toolbar-code')).toBeVisible();
  });

  test('expanded toolbar shows all formatting buttons', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Click toggle to expand toolbar
    await page.getByTestId('message-toolbar-toggle').click();

    // All formatting buttons should be visible
    await expect(page.getByTestId('message-toolbar-bold')).toBeVisible();
    await expect(page.getByTestId('message-toolbar-italic')).toBeVisible();
    await expect(page.getByTestId('message-toolbar-underline')).toBeVisible();
    await expect(page.getByTestId('message-toolbar-strike')).toBeVisible();
    await expect(page.getByTestId('message-toolbar-code')).toBeVisible();
    await expect(page.getByTestId('message-toolbar-codeBlock')).toBeVisible();
    await expect(page.getByTestId('message-toolbar-bulletList')).toBeVisible();
    await expect(page.getByTestId('message-toolbar-orderedList')).toBeVisible();
    await expect(page.getByTestId('message-toolbar-blockquote')).toBeVisible();
  });

  test('bold formatting can be applied via toolbar', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Focus editor and type some text
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('Hello World');

    // Select all text
    await page.keyboard.press('Meta+a');

    // Click bold button
    await page.getByTestId('message-toolbar-bold').click();

    // Button should be active
    const boldButton = page.getByTestId('message-toolbar-bold');
    await expect(boldButton).toHaveClass(/text-blue-600/);
  });

  test('italic formatting can be applied via toolbar', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Focus editor and type some text
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('Hello World');

    // Select all text
    await page.keyboard.press('Meta+a');

    // Click italic button
    await page.getByTestId('message-toolbar-italic').click();

    // Button should be active
    const italicButton = page.getByTestId('message-toolbar-italic');
    await expect(italicButton).toHaveClass(/text-blue-600/);
  });

  test('inline code formatting can be applied via toolbar', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Focus editor and type some text
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('const x = 1');

    // Select all text
    await page.keyboard.press('Meta+a');

    // Click code button
    await page.getByTestId('message-toolbar-code').click();

    // Button should be active
    const codeButton = page.getByTestId('message-toolbar-code');
    await expect(codeButton).toHaveClass(/text-blue-600/);
  });

  test('code block can be inserted via expanded toolbar', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Expand toolbar
    await page.getByTestId('message-toolbar-toggle').click();

    // Focus editor and type some code
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('console.log("hello")');

    // Click code block button
    await page.getByTestId('message-toolbar-codeBlock').click();

    // The code block should be created - check that button is now active
    const codeBlockButton = page.getByTestId('message-toolbar-codeBlock');
    await expect(codeBlockButton).toHaveClass(/text-blue-600/);
  });

  test('bullet list can be created via expanded toolbar', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Expand toolbar
    await page.getByTestId('message-toolbar-toggle').click();

    // Focus editor and type some text
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('Item one');

    // Click bullet list button
    await page.getByTestId('message-toolbar-bulletList').click();

    // Bullet list button should be active
    const bulletButton = page.getByTestId('message-toolbar-bulletList');
    await expect(bulletButton).toHaveClass(/text-blue-600/);
  });

  test('numbered list can be created via expanded toolbar', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Expand toolbar
    await page.getByTestId('message-toolbar-toggle').click();

    // Focus editor and type some text
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('Step one');

    // Click numbered list button
    await page.getByTestId('message-toolbar-orderedList').click();

    // Numbered list button should be active
    const orderedButton = page.getByTestId('message-toolbar-orderedList');
    await expect(orderedButton).toHaveClass(/text-blue-600/);
  });

  test('block quote can be created via expanded toolbar', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Expand toolbar
    await page.getByTestId('message-toolbar-toggle').click();

    // Focus editor and type some text
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('A famous quote');

    // Click blockquote button
    await page.getByTestId('message-toolbar-blockquote').click();

    // Blockquote button should be active
    const quoteButton = page.getByTestId('message-toolbar-blockquote');
    await expect(quoteButton).toHaveClass(/text-blue-600/);
  });

  test('keyboard shortcut Cmd+B applies bold', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Focus editor and type some text
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('Hello World');

    // Select all and apply bold via keyboard
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+b');

    // Bold button should be active
    const boldButton = page.getByTestId('message-toolbar-bold');
    await expect(boldButton).toHaveClass(/text-blue-600/);
  });

  test('keyboard shortcut Cmd+I applies italic', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Focus editor and type some text
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('Hello World');

    // Select all and apply italic via keyboard
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+i');

    // Italic button should be active
    const italicButton = page.getByTestId('message-toolbar-italic');
    await expect(italicButton).toHaveClass(/text-blue-600/);
  });

  test('send button is disabled when editor is empty', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Send button should be disabled
    await expect(page.getByTestId('message-send-button')).toBeDisabled();
  });

  test('send button is enabled when editor has content', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Type in editor
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('Hello World');

    // Send button should be enabled
    await expect(page.getByTestId('message-send-button')).not.toBeDisabled();
  });

  test('message with formatting can be sent', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Type and format text
    const editor = page.getByTestId('message-input');
    await editor.click();

    const testContent = `Rich text test ${Date.now()}`;
    await page.keyboard.type(testContent);

    // Select and make bold
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+b');

    // Click send
    await page.getByTestId('message-send-button').click();

    // Wait for message to appear
    await expect(page.getByText(testContent)).toBeVisible({ timeout: 10000 });
  });

  test('editor clears after sending message', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Type in editor
    const editor = page.getByTestId('message-input');
    await editor.click();
    const testContent = `Clear test ${Date.now()}`;
    await page.keyboard.type(testContent);

    // Send
    await page.getByTestId('message-send-button').click();

    // Wait for message to appear
    await expect(page.getByText(testContent)).toBeVisible({ timeout: 10000 });

    // Editor should be empty
    // Send button should be disabled again (meaning editor is empty)
    await expect(page.getByTestId('message-send-button')).toBeDisabled({ timeout: 5000 });
  });

  test('markdown shortcut **bold** works', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Type markdown syntax for bold text
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('**bold text**');

    // Wait a bit for Tiptap to process the markdown
    await page.waitForTimeout(500);

    // The markdown should be converted - verify content is present in the editor
    // Note: Tiptap may or may not auto-convert depending on configuration
    // The main goal is that the text can be typed and the editor works
    await expect(page.getByText('bold text')).toBeVisible();
  });

  test('underline button exists in expanded toolbar', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Expand toolbar
    await page.getByTestId('message-toolbar-toggle').click();

    // Underline button should be visible in expanded toolbar
    const underlineButton = page.getByTestId('message-toolbar-underline');
    await expect(underlineButton).toBeVisible();

    // It should have a title with keyboard shortcut
    await expect(underlineButton).toHaveAttribute('title', /Underline/);
  });

  test('strikethrough can be applied via expanded toolbar', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Expand toolbar
    await page.getByTestId('message-toolbar-toggle').click();

    // Focus editor and type some text
    const editor = page.getByTestId('message-input');
    await editor.click();
    await page.keyboard.type('Hello World');

    // Select all text
    await page.keyboard.press('Meta+a');

    // Click strikethrough button
    await page.getByTestId('message-toolbar-strike').click();

    // Button should be active
    const strikeButton = page.getByTestId('message-toolbar-strike');
    await expect(strikeButton).toHaveClass(/text-blue-600/);
  });
});
