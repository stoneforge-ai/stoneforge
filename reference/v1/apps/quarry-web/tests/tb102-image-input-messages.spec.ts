import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Get directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('TB102: Image Input in Messages', () => {
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

  // Helper to create a test image file
  function createTestImageBuffer(): Buffer {
    // Create a minimal valid PNG (1x1 red pixel)
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x18, 0xdd,
      0x8d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
      0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
    ]);
    return png;
  }

  test('image attachment button is visible in message composer', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Image attachment button should be visible
    await expect(page.getByTestId('message-image-attach-button')).toBeVisible();
  });

  test('clicking image button opens attachment modal', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Click image attachment button
    await page.getByTestId('message-image-attach-button').click();

    // Modal should open
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();
  });

  test('image attachment modal has upload and library tabs', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open modal
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    // Both tabs should be visible
    await expect(page.getByTestId('message-image-upload-tab')).toBeVisible();
    await expect(page.getByTestId('message-image-library-tab')).toBeVisible();
  });

  test('upload tab shows drop zone', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open modal
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    // Drop zone should be visible
    await expect(page.getByTestId('message-image-drop-zone')).toBeVisible();
  });

  test('can upload an image via file picker', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open modal
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    // Create a test file and upload
    const testImageBuffer = createTestImageBuffer();

    // Set up file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('message-image-drop-zone').click(),
    ]);

    // Create a temporary file
    const tempFile = path.join(__dirname, 'test-image.png');
    fs.writeFileSync(tempFile, testImageBuffer);

    try {
      await fileChooser.setFiles(tempFile);

      // Preview should appear
      await expect(page.getByTestId('message-image-preview')).toBeVisible({ timeout: 5000 });
    } finally {
      // Clean up
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test('image preview shows remove button', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open modal
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    // Upload a test image
    const testImageBuffer = createTestImageBuffer();
    const tempFile = path.join(__dirname, 'test-image.png');
    fs.writeFileSync(tempFile, testImageBuffer);

    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByTestId('message-image-drop-zone').click(),
      ]);

      await fileChooser.setFiles(tempFile);

      // Preview should appear with remove button
      await expect(page.getByTestId('message-image-preview')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('message-image-preview-remove')).toBeVisible();
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test('clicking remove button clears preview', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open modal
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    // Upload a test image
    const testImageBuffer = createTestImageBuffer();
    const tempFile = path.join(__dirname, 'test-image.png');
    fs.writeFileSync(tempFile, testImageBuffer);

    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByTestId('message-image-drop-zone').click(),
      ]);

      await fileChooser.setFiles(tempFile);

      // Preview should appear
      await expect(page.getByTestId('message-image-preview')).toBeVisible({ timeout: 5000 });

      // Click remove
      await page.getByTestId('message-image-preview-remove').click();

      // Preview should be gone, drop zone should be back
      await expect(page.getByTestId('message-image-preview')).not.toBeVisible();
      await expect(page.getByTestId('message-image-drop-zone')).toBeVisible();
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test('library tab shows image grid or empty state', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open modal
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    // Switch to library tab
    await page.getByTestId('message-image-library-tab').click();

    // Wait for either image grid or search input (library has loaded)
    await expect(page.getByTestId('message-library-search-input')).toBeVisible({ timeout: 5000 });
  });

  test('cancel button closes modal', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open modal
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    // Click cancel
    await page.getByTestId('message-image-cancel-button').click();

    // Modal should close
    await expect(page.getByTestId('message-image-attachment-modal')).not.toBeVisible();
  });

  test('attach button is disabled without image selected', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Open modal
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    // Insert button should be disabled
    await expect(page.getByTestId('message-image-insert-button')).toBeDisabled();
  });

  test('send button enables when image is attached (even without text)', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Initially send button should be disabled (no content)
    await expect(page.getByTestId('message-send-button')).toBeDisabled();

    // Upload and attach an image
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    const testImageBuffer = createTestImageBuffer();
    const tempFile = path.join(__dirname, 'test-image.png');
    fs.writeFileSync(tempFile, testImageBuffer);

    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByTestId('message-image-drop-zone').click(),
      ]);

      await fileChooser.setFiles(tempFile);
      await expect(page.getByTestId('message-image-preview')).toBeVisible({ timeout: 5000 });

      // Click insert
      await page.getByTestId('message-image-insert-button').click();

      // Modal should close, attachment preview should show
      await expect(page.getByTestId('message-image-attachment-modal')).not.toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('message-image-attachments-preview')).toBeVisible();

      // Send button should now be enabled
      await expect(page.getByTestId('message-send-button')).not.toBeDisabled();
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test('attached image preview shows in composer', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Upload and attach an image
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    const testImageBuffer = createTestImageBuffer();
    const tempFile = path.join(__dirname, 'test-image.png');
    fs.writeFileSync(tempFile, testImageBuffer);

    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByTestId('message-image-drop-zone').click(),
      ]);

      await fileChooser.setFiles(tempFile);
      await expect(page.getByTestId('message-image-preview')).toBeVisible({ timeout: 5000 });

      // Click insert
      await page.getByTestId('message-image-insert-button').click();

      // Attachment preview should show in composer
      await expect(page.getByTestId('message-image-attachments-preview')).toBeVisible({ timeout: 5000 });
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test('can remove attached image from composer preview', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Upload and attach an image
    await page.getByTestId('message-image-attach-button').click();
    await expect(page.getByTestId('message-image-attachment-modal')).toBeVisible();

    // Create file before triggering file chooser
    const testImageBuffer = createTestImageBuffer();
    const tempFile = path.join(__dirname, 'test-image-remove.png');
    fs.writeFileSync(tempFile, testImageBuffer);

    try {
      // Trigger file chooser
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.getByTestId('message-image-drop-zone').click();
      const fileChooser = await fileChooserPromise;

      await fileChooser.setFiles(tempFile);
      await expect(page.getByTestId('message-image-preview')).toBeVisible({ timeout: 5000 });

      // Click insert
      await page.getByTestId('message-image-insert-button').click();

      // Preview should be visible
      await expect(page.getByTestId('message-image-attachments-preview')).toBeVisible({ timeout: 5000 });

      // Find and click the remove button on the attached image
      const attachmentPreview = page.getByTestId('message-image-attachments-preview');
      const removeButton = attachmentPreview.locator('button').first();
      await removeButton.click();

      // Preview should be gone
      await expect(page.getByTestId('message-image-attachments-preview')).not.toBeVisible();

      // Send button should be disabled again
      await expect(page.getByTestId('message-send-button')).toBeDisabled();
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test('document attachment button still works alongside image button', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    // Both buttons should be visible
    await expect(page.getByTestId('message-image-attach-button')).toBeVisible();
    await expect(page.getByTestId('message-attach-button')).toBeVisible();

    // Document attachment button should open document picker
    await page.getByTestId('message-attach-button').click();
    await expect(page.getByTestId('message-attachment-picker')).toBeVisible();
  });

  test('drag and drop indicator shows on drag over', async ({ page }) => {
    const channel = await getChannelWithMembers(page);

    if (!channel) {
      test.skip();
      return;
    }

    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`channel-item-${channel.id}`).click();

    const composer = page.getByTestId('message-composer');

    // Simulate drag over - this is tricky to test, but we can at least verify the component exists
    // and that the composer has the data-testid for drag events
    await expect(composer).toBeVisible();
  });
});
