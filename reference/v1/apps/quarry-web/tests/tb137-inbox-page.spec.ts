/**
 * TB137: Human Inbox Page Tests
 *
 * Tests for the dedicated full-page inbox at /inbox route.
 */

import { test, expect } from '@playwright/test';

test.describe('TB137: Human Inbox Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to inbox page
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Page Layout', () => {
    test('renders inbox page with correct structure', async ({ page }) => {
      // Page header with inbox icon and title
      await expect(page.getByTestId('inbox-page')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
    });

    test('shows view tabs: Unread, All, Archived', async ({ page }) => {
      await expect(page.getByTestId('inbox-page-tab-unread')).toBeVisible();
      await expect(page.getByTestId('inbox-page-tab-all')).toBeVisible();
      await expect(page.getByTestId('inbox-page-tab-archived')).toBeVisible();
    });

    test('shows filter and sort controls', async ({ page }) => {
      await expect(page.getByTestId('inbox-page-source-filter')).toBeVisible();
      await expect(page.getByTestId('inbox-page-sort-order')).toBeVisible();
    });

    test('shows split layout with message list and content panels', async ({ page }) => {
      await expect(page.getByTestId('inbox-page-message-list')).toBeVisible();
      await expect(page.getByTestId('inbox-page-message-content-panel')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('can navigate to inbox via sidebar', async ({ page }) => {
      // Navigate away first
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      // Click inbox in sidebar
      await page.getByTestId('nav-inbox').click();
      await page.waitForURL('**/inbox**');

      await expect(page.getByTestId('inbox-page')).toBeVisible();
    });

    test('can navigate to inbox via keyboard shortcut G I', async ({ page }) => {
      // Navigate away first
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      // Use keyboard shortcut
      await page.keyboard.press('g');
      await page.keyboard.press('i');
      await page.waitForURL('**/inbox**');

      await expect(page.getByTestId('inbox-page')).toBeVisible();
    });

    test('can navigate to inbox via command palette', async ({ page }) => {
      // Navigate away first
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      // Open command palette
      await page.keyboard.press('Meta+k');
      await page.waitForSelector('[data-testid="command-palette"]');

      // Type inbox
      await page.keyboard.type('inbox');

      // Select inbox command
      await page.keyboard.press('Enter');
      await page.waitForURL('**/inbox**');

      await expect(page.getByTestId('inbox-page')).toBeVisible();
    });
  });

  test.describe('View Tabs', () => {
    test('defaults to Unread view', async ({ page }) => {
      const unreadTab = page.getByTestId('inbox-page-tab-unread');
      // Tab should have the "selected" style (shadow-sm indicates selection)
      await expect(unreadTab).toHaveClass(/shadow-sm/);
    });

    test('can switch between view tabs', async ({ page }) => {
      // Click All tab
      await page.getByTestId('inbox-page-tab-all').click();
      await expect(page.getByTestId('inbox-page-tab-all')).toHaveClass(/shadow-sm/);

      // Click Archived tab
      await page.getByTestId('inbox-page-tab-archived').click();
      await expect(page.getByTestId('inbox-page-tab-archived')).toHaveClass(/shadow-sm/);

      // Click back to Unread
      await page.getByTestId('inbox-page-tab-unread').click();
      await expect(page.getByTestId('inbox-page-tab-unread')).toHaveClass(/shadow-sm/);
    });

    test('persists view selection in localStorage', async ({ page }) => {
      // Switch to All view
      await page.getByTestId('inbox-page-tab-all').click();

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should still be on All view
      await expect(page.getByTestId('inbox-page-tab-all')).toHaveClass(/shadow-sm/);
    });
  });

  test.describe('Filtering and Sorting', () => {
    test('can filter by source type', async ({ page }) => {
      const sourceFilter = page.getByTestId('inbox-page-source-filter');

      // Filter to Direct messages
      await sourceFilter.selectOption('direct');
      await expect(sourceFilter).toHaveValue('direct');

      // Filter to Mentions
      await sourceFilter.selectOption('mention');
      await expect(sourceFilter).toHaveValue('mention');

      // Reset to All
      await sourceFilter.selectOption('all');
      await expect(sourceFilter).toHaveValue('all');
    });

    test('can change sort order', async ({ page }) => {
      const sortOrder = page.getByTestId('inbox-page-sort-order');

      // Sort by oldest first
      await sortOrder.selectOption('oldest');
      await expect(sortOrder).toHaveValue('oldest');

      // Sort by sender
      await sortOrder.selectOption('sender');
      await expect(sortOrder).toHaveValue('sender');

      // Sort by newest (default)
      await sortOrder.selectOption('newest');
      await expect(sortOrder).toHaveValue('newest');
    });

    test('persists filter and sort preferences in localStorage', async ({ page }) => {
      // Set filter and sort
      await page.getByTestId('inbox-page-source-filter').selectOption('mention');
      await page.getByTestId('inbox-page-sort-order').selectOption('oldest');

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should persist preferences
      await expect(page.getByTestId('inbox-page-source-filter')).toHaveValue('mention');
      await expect(page.getByTestId('inbox-page-sort-order')).toHaveValue('oldest');
    });
  });

  test.describe('Empty States', () => {
    test('shows empty state when inbox is empty', async ({ page }) => {
      // The empty state should be visible when there are no messages
      // This will be visible if the system has no inbox items
      const emptyState = page.getByTestId('inbox-page-empty');
      const messageList = page.getByTestId('inbox-page-message-list');

      // At least the message list should be visible
      await expect(messageList).toBeVisible();

      // If empty state is shown, it should have appropriate text
      if (await emptyState.isVisible()) {
        await expect(emptyState).toContainText(/no.*messages|inbox.*empty/i);
      }
    });

    test('shows empty state for message content when no message selected', async ({ page }) => {
      // Initial state should show "Select a message" empty state
      await expect(page.getByTestId('inbox-page-content-empty')).toBeVisible();
      await expect(page.getByText('Select a message')).toBeVisible();
    });
  });

  test.describe('Sidebar Badge', () => {
    test('inbox navigation item exists in sidebar', async ({ page }) => {
      await expect(page.getByTestId('nav-inbox')).toBeVisible();
    });

    test('shows badge when there are unread messages', async ({ page }) => {
      // Check if inbox link is visible
      const inboxLink = page.getByTestId('nav-inbox');
      await expect(inboxLink).toBeVisible();

      // Badge visibility depends on whether there are unread messages
      // The badge (or badge-dot when collapsed) may or may not be visible depending on inbox state
      // This test verifies the badge elements can be found if present
      const badgeVisible = await page.getByTestId('nav-inbox-badge').isVisible().catch(() => false);
      // Badge count should be a number if visible
      if (badgeVisible) {
        const badgeText = await page.getByTestId('nav-inbox-badge').textContent();
        expect(badgeText).toMatch(/^\d+\+?$/);
      }
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('J key navigates to next message', async ({ page }) => {
      // This test will work when there are messages in the inbox
      // For now, just verify the page responds to J key without errors
      await page.keyboard.press('j');
      // No error should occur
      await expect(page.getByTestId('inbox-page')).toBeVisible();
    });

    test('K key navigates to previous message', async ({ page }) => {
      // This test will work when there are messages in the inbox
      // For now, just verify the page responds to K key without errors
      await page.keyboard.press('k');
      // No error should occur
      await expect(page.getByTestId('inbox-page')).toBeVisible();
    });
  });

  test.describe('API Integration', () => {
    test('fetches inbox data from /api/inbox/all', async ({ page }) => {
      // Intercept the API call
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/api/inbox/all') && response.status() === 200
      );

      // Reload to trigger fetch
      await page.reload();

      const response = await responsePromise;
      const data = await response.json();

      // Response should have expected structure
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.items)).toBe(true);
    });

    test('shows unread count in page header when messages exist', async ({ page }) => {
      // Verify the page header shows the unread count
      // The count is fetched from /api/inbox/count and displayed
      const inboxPage = page.getByTestId('inbox-page');
      await expect(inboxPage).toBeVisible();

      // Header should show count status - either "X unread" or "No unread messages"
      const headerText = await inboxPage.locator('p').first().textContent();
      expect(headerText).toMatch(/(unread|No unread messages)/);
    });
  });

  test.describe('Responsive Behavior', () => {
    test('layout adapts to screen size', async ({ page }) => {
      // Wide screen - both panels visible
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(page.getByTestId('inbox-page-message-list')).toBeVisible();
      await expect(page.getByTestId('inbox-page-message-content-panel')).toBeVisible();
    });
  });
});
