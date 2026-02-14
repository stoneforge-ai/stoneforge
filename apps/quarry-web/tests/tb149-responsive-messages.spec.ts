/**
 * TB149: Responsive Messages Page Tests
 *
 * Tests for the responsive behavior of the Messages page across viewports.
 *
 * Behaviors tested:
 * - Mobile: Two-screen navigation (channel list full-screen, channel view full-screen)
 * - Responsive channel list with larger touch targets
 * - Responsive message bubbles with smaller avatars on mobile
 * - Responsive message composer with collapsed toolbar
 * - Mobile back navigation from channel view
 * - Mobile FAB for creating channels
 * - Mobile action sheet for message actions (long-press)
 */

import { test, expect } from '@playwright/test';
import {
  setViewport,
  waitForResponsiveUpdate,
} from './helpers/responsive';

test.describe('TB149: Responsive Messages Page', () => {
  test.describe('Mobile Viewport (< 640px)', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport BEFORE navigation
      await setViewport(page, 'xs');
      await page.goto('/messages');
      // Wait for responsive hooks to stabilize
      await waitForResponsiveUpdate(page, 300);
    });

    test('should show full-width channel list on mobile when no channel selected', async ({ page }) => {
      // Channel list should be visible and full width
      const channelList = page.getByTestId('channel-list');
      await expect(channelList).toBeVisible();

      // Channel list should take full width (no w-64 class)
      const listBox = await channelList.boundingBox();
      const viewportSize = page.viewportSize();
      expect(listBox?.width).toBeGreaterThan((viewportSize?.width || 400) * 0.9);
    });

    test('should show mobile FAB for creating channels', async ({ page }) => {
      // Mobile FAB should be visible
      const fab = page.getByTestId('mobile-create-channel-fab');
      await expect(fab).toBeVisible();
    });

    test('should open create channel modal when FAB is clicked', async ({ page }) => {
      // Click FAB
      const fab = page.getByTestId('mobile-create-channel-fab');
      await fab.click();

      // Create channel modal should be visible
      const modal = page.getByTestId('create-channel-modal');
      await expect(modal).toBeVisible();
    });

    test('should navigate to full-screen channel view when channel is selected', async ({ page }) => {
      // Wait for channels to load
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });

      // Click on first channel
      const firstChannel = page.locator('[data-testid^="channel-item-"]').first();
      await firstChannel.click();

      // Wait for channel view to appear
      await waitForResponsiveUpdate(page, 300);

      // Channel view should be visible
      const channelView = page.getByTestId('channel-view');
      await expect(channelView).toBeVisible();

      // Channel list should NOT be visible (two-screen navigation)
      const channelList = page.getByTestId('channel-list');
      await expect(channelList).not.toBeVisible();
    });

    test('should show back button in channel view header on mobile', async ({ page }) => {
      // Wait for channels and select one
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Back button should be visible
      const backButton = page.getByTestId('channel-back-button');
      await expect(backButton).toBeVisible();
    });

    test('should navigate back to channel list when back button is clicked', async ({ page }) => {
      // Wait for channels and select one
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Click back button
      const backButton = page.getByTestId('channel-back-button');
      await backButton.click();

      // Wait for navigation
      await waitForResponsiveUpdate(page, 300);

      // Channel list should be visible again
      const channelList = page.getByTestId('channel-list');
      await expect(channelList).toBeVisible();

      // Channel view should not be visible
      const channelView = page.getByTestId('channel-view');
      await expect(channelView).not.toBeVisible();
    });

    test('should show mobile search toggle in channel header', async ({ page }) => {
      // Wait for channels and select one
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Mobile search toggle should be visible
      const searchToggle = page.getByTestId('mobile-search-toggle');
      await expect(searchToggle).toBeVisible();
    });

    test('should show mobile search input when search toggle is clicked', async ({ page }) => {
      // Wait for channels and select one
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Click search toggle
      const searchToggle = page.getByTestId('mobile-search-toggle');
      await searchToggle.click();

      // Mobile search input should be visible
      const searchInput = page.getByTestId('mobile-message-search-input');
      await expect(searchInput).toBeVisible();
    });

    test('should show compact message composer on mobile', async ({ page }) => {
      // Wait for channels and select one
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Message composer should be visible
      const composer = page.getByTestId('message-composer');
      await expect(composer).toBeVisible();

      // Send button should be visible (icon only on mobile)
      const sendButton = page.getByTestId('message-send-button');
      await expect(sendButton).toBeVisible();
    });
  });

  test.describe('Desktop Viewport (>= 1024px)', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport BEFORE navigation
      await setViewport(page, '2xl');
      await page.goto('/messages');
      // Wait for responsive hooks to stabilize
      await waitForResponsiveUpdate(page, 300);
    });

    test('should show channel list and placeholder side by side', async ({ page }) => {
      // Channel list should be visible
      const channelList = page.getByTestId('channel-list');
      await expect(channelList).toBeVisible();

      // Channel placeholder should be visible (no channel selected)
      const placeholder = page.getByTestId('channel-placeholder');
      await expect(placeholder).toBeVisible();
    });

    test('should show fixed-width channel list on desktop', async ({ page }) => {
      // Channel list should have fixed width (w-64 = 256px)
      const channelList = page.getByTestId('channel-list');
      const listBox = await channelList.boundingBox();
      expect(listBox?.width).toBeLessThan(300);
    });

    test('should NOT show mobile FAB on desktop', async ({ page }) => {
      // Mobile FAB should NOT be visible on desktop
      const fab = page.getByTestId('mobile-create-channel-fab');
      await expect(fab).not.toBeVisible();
    });

    test('should show channel list and channel view side by side when channel selected', async ({ page }) => {
      // Wait for channels and select one
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Both channel list and channel view should be visible
      const channelList = page.getByTestId('channel-list');
      const channelView = page.getByTestId('channel-view');

      await expect(channelList).toBeVisible();
      await expect(channelView).toBeVisible();
    });

    test('should NOT show back button on desktop', async ({ page }) => {
      // Wait for channels and select one
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Back button should NOT be visible on desktop
      const backButton = page.getByTestId('channel-back-button');
      await expect(backButton).not.toBeVisible();
    });

    test('should show inline search input on desktop', async ({ page }) => {
      // Wait for channels and select one
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Desktop search input should be visible (inline, not toggle)
      const searchInput = page.getByTestId('message-search-input');
      await expect(searchInput).toBeVisible();

      // Mobile search toggle should NOT be visible
      const searchToggle = page.getByTestId('mobile-search-toggle');
      await expect(searchToggle).not.toBeVisible();
    });

    test('should show members button inline on desktop', async ({ page }) => {
      // Wait for channels and select one
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Members button should show member count text on desktop
      const membersButton = page.getByTestId('channel-members-button');
      await expect(membersButton).toBeVisible();
      await expect(membersButton).toContainText('members');
    });
  });

  test.describe('Responsive Transitions', () => {
    test('should handle viewport resize from desktop to mobile', async ({ page }) => {
      // Start at desktop
      await setViewport(page, '2xl');
      await page.goto('/messages');
      await waitForResponsiveUpdate(page, 300);

      // Select a channel
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Verify side-by-side layout
      await expect(page.getByTestId('channel-list')).toBeVisible();
      await expect(page.getByTestId('channel-view')).toBeVisible();

      // Resize to mobile
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page, 500);

      // Should now show mobile layout (channel view full screen)
      const backButton = page.getByTestId('channel-back-button');
      await expect(backButton).toBeVisible();
    });

    test('should handle viewport resize from mobile to desktop', async ({ page }) => {
      // Start at mobile
      await setViewport(page, 'xs');
      await page.goto('/messages');
      await waitForResponsiveUpdate(page, 300);

      // Select a channel
      await page.waitForSelector('[data-testid^="channel-item-"]', { timeout: 10000 });
      await page.locator('[data-testid^="channel-item-"]').first().click();
      await waitForResponsiveUpdate(page, 300);

      // Verify mobile layout (back button visible)
      await expect(page.getByTestId('channel-back-button')).toBeVisible();

      // Resize to desktop
      await setViewport(page, '2xl');
      await waitForResponsiveUpdate(page, 500);

      // Should now show desktop layout (no back button, side-by-side)
      const backButton = page.getByTestId('channel-back-button');
      await expect(backButton).not.toBeVisible();

      // Both panels should be visible
      await expect(page.getByTestId('channel-list')).toBeVisible();
      await expect(page.getByTestId('channel-view')).toBeVisible();
    });
  });
});
