import { test, expect } from '@playwright/test';

test.describe('TB62: Settings Page - Notifications', () => {
  test.beforeEach(async ({ page }) => {
    // Clear notification settings before each test
    await page.goto('/settings');
    await page.evaluate(() => {
      localStorage.removeItem('settings.notifications');
    });
  });

  test('notifications section is visible when clicking notifications nav', async ({ page }) => {
    await page.goto('/settings');

    // Click notifications section
    await page.getByTestId('settings-nav-notifications').click();

    // Notifications section should be visible
    await expect(page.getByTestId('settings-notifications-section')).toBeVisible();
  });

  test('notifications nav item no longer shows Soon badge', async ({ page }) => {
    await page.goto('/settings');

    // Notifications nav should not have "Soon" text since it's implemented
    const notificationsNav = page.getByTestId('settings-nav-notifications');
    await expect(notificationsNav).not.toContainText('Soon');
  });

  test('notifications section shows notification types toggles', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // All notification type toggles should be visible
    await expect(page.getByTestId('notification-task-assigned')).toBeVisible();
    await expect(page.getByTestId('notification-task-completed')).toBeVisible();
    await expect(page.getByTestId('notification-new-message')).toBeVisible();
    await expect(page.getByTestId('notification-workflow-completed')).toBeVisible();
  });

  test('notification types have descriptive labels', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Check descriptions
    await expect(page.getByTestId('notification-task-assigned')).toContainText('Task assigned to me');
    await expect(page.getByTestId('notification-task-completed')).toContainText('Task completed');
    await expect(page.getByTestId('notification-new-message')).toContainText('New message');
    await expect(page.getByTestId('notification-workflow-completed')).toContainText('Workflow completed');
  });

  test('notification toggles default to enabled', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // All toggles should be enabled (on) by default
    const taskAssignedToggle = page.getByTestId('notification-task-assigned-toggle');
    await expect(taskAssignedToggle).toHaveAttribute('aria-checked', 'true');

    const taskCompletedToggle = page.getByTestId('notification-task-completed-toggle');
    await expect(taskCompletedToggle).toHaveAttribute('aria-checked', 'true');

    const newMessageToggle = page.getByTestId('notification-new-message-toggle');
    await expect(newMessageToggle).toHaveAttribute('aria-checked', 'true');

    const workflowToggle = page.getByTestId('notification-workflow-completed-toggle');
    await expect(workflowToggle).toHaveAttribute('aria-checked', 'true');
  });

  test('can toggle notification preference off', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Click to toggle off task assigned
    await page.getByTestId('notification-task-assigned-toggle').click();

    // Toggle should now be off
    await expect(page.getByTestId('notification-task-assigned-toggle')).toHaveAttribute('aria-checked', 'false');
  });

  test('can toggle notification preference back on', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Toggle off then on
    await page.getByTestId('notification-task-completed-toggle').click();
    await expect(page.getByTestId('notification-task-completed-toggle')).toHaveAttribute('aria-checked', 'false');

    await page.getByTestId('notification-task-completed-toggle').click();
    await expect(page.getByTestId('notification-task-completed-toggle')).toHaveAttribute('aria-checked', 'true');
  });

  test('notification preferences are stored in localStorage', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Toggle off task assigned
    await page.getByTestId('notification-task-assigned-toggle').click();

    // Check localStorage
    const stored = await page.evaluate(() => localStorage.getItem('settings.notifications'));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.preferences.taskAssigned).toBe(false);
    expect(parsed.preferences.taskCompleted).toBe(true);
  });

  test('notification preferences persist after page refresh', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Toggle off two preferences
    await page.getByTestId('notification-task-assigned-toggle').click();
    await page.getByTestId('notification-new-message-toggle').click();

    // Refresh page
    await page.reload();
    await page.getByTestId('settings-nav-notifications').click();

    // Preferences should persist
    await expect(page.getByTestId('notification-task-assigned-toggle')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('notification-new-message-toggle')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('notification-task-completed-toggle')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('notification-workflow-completed-toggle')).toHaveAttribute('aria-checked', 'true');
  });

  test('toast settings section shows duration options', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Duration options should be visible
    await expect(page.getByTestId('toast-duration-3000')).toBeVisible();
    await expect(page.getByTestId('toast-duration-5000')).toBeVisible();
    await expect(page.getByTestId('toast-duration-10000')).toBeVisible();
  });

  test('toast duration default is 5 seconds', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // 5 seconds should be selected by default (has active styling)
    const durationOption = page.getByTestId('toast-duration-5000');
    await expect(durationOption).toHaveClass(/border-blue-500/);
  });

  test('can change toast duration', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Select 10 seconds
    await page.getByTestId('toast-duration-10000').click();

    // 10 seconds should now be selected
    const durationOption = page.getByTestId('toast-duration-10000');
    await expect(durationOption).toHaveClass(/border-blue-500/);

    // 5 seconds should not be selected
    const fiveSecOption = page.getByTestId('toast-duration-5000');
    await expect(fiveSecOption).not.toHaveClass(/border-blue-500/);
  });

  test('toast duration is stored in localStorage', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Select 3 seconds
    await page.getByTestId('toast-duration-3000').click();

    // Check localStorage
    const stored = await page.evaluate(() => localStorage.getItem('settings.notifications'));
    const parsed = JSON.parse(stored!);
    expect(parsed.toastDuration).toBe(3000);
  });

  test('toast settings section shows position options', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Position options should be visible
    await expect(page.getByTestId('toast-position-top-right')).toBeVisible();
    await expect(page.getByTestId('toast-position-top-left')).toBeVisible();
    await expect(page.getByTestId('toast-position-bottom-right')).toBeVisible();
    await expect(page.getByTestId('toast-position-bottom-left')).toBeVisible();
  });

  test('toast position default is top-right', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Top-right should be selected by default
    const positionOption = page.getByTestId('toast-position-top-right');
    await expect(positionOption).toHaveClass(/border-blue-500/);
  });

  test('can change toast position', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Select bottom-left
    await page.getByTestId('toast-position-bottom-left').click();

    // Bottom-left should now be selected
    const positionOption = page.getByTestId('toast-position-bottom-left');
    await expect(positionOption).toHaveClass(/border-blue-500/);

    // Top-right should not be selected
    const topRightOption = page.getByTestId('toast-position-top-right');
    await expect(topRightOption).not.toHaveClass(/border-blue-500/);
  });

  test('toast position is stored in localStorage', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Select bottom-right
    await page.getByTestId('toast-position-bottom-right').click();

    // Check localStorage
    const stored = await page.evaluate(() => localStorage.getItem('settings.notifications'));
    const parsed = JSON.parse(stored!);
    expect(parsed.toastPosition).toBe('bottom-right');
  });

  test('toast settings persist after page refresh', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Set custom duration and position
    await page.getByTestId('toast-duration-10000').click();
    await page.getByTestId('toast-position-bottom-left').click();

    // Refresh page
    await page.reload();
    await page.getByTestId('settings-nav-notifications').click();

    // Settings should persist
    await expect(page.getByTestId('toast-duration-10000')).toHaveClass(/border-blue-500/);
    await expect(page.getByTestId('toast-position-bottom-left')).toHaveClass(/border-blue-500/);
  });

  test('multiple settings can be changed in sequence', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Change multiple settings
    await page.getByTestId('notification-task-assigned-toggle').click();
    await page.getByTestId('notification-new-message-toggle').click();
    await page.getByTestId('toast-duration-3000').click();
    await page.getByTestId('toast-position-top-left').click();

    // All should be stored correctly
    const stored = await page.evaluate(() => localStorage.getItem('settings.notifications'));
    const parsed = JSON.parse(stored!);

    expect(parsed.preferences.taskAssigned).toBe(false);
    expect(parsed.preferences.taskCompleted).toBe(true);
    expect(parsed.preferences.newMessage).toBe(false);
    expect(parsed.preferences.workflowCompleted).toBe(true);
    expect(parsed.toastDuration).toBe(3000);
    expect(parsed.toastPosition).toBe('top-left');
  });

  test('browser notifications section is visible', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Browser Notifications heading should be visible (use role to be specific)
    await expect(page.getByRole('heading', { name: 'Browser Notifications' })).toBeVisible();
  });

  // Note: Browser notification permission tests are tricky to test in Playwright
  // since we can't easily simulate permission states. We test the UI elements exist.

  test('browser notifications section renders without error', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // The section should render without error
    const section = page.getByTestId('settings-notifications-section');
    await expect(section).toBeVisible();

    // Browser notifications heading should be visible
    await expect(page.getByRole('heading', { name: 'Browser Notifications' })).toBeVisible();
  });
});

// TB118: Settings Notifications Padding Fix
test.describe('TB118: Notification Types Padding Consistency', () => {
  test('notification toggle rows have horizontal padding', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Check that notification toggle rows have horizontal padding (px-4 = 16px)
    const taskAssignedRow = page.getByTestId('notification-task-assigned');
    await expect(taskAssignedRow).toBeVisible();

    // Get computed styles
    const paddingLeft = await taskAssignedRow.evaluate((el) => {
      return window.getComputedStyle(el).paddingLeft;
    });
    const paddingRight = await taskAssignedRow.evaluate((el) => {
      return window.getComputedStyle(el).paddingRight;
    });

    // px-4 in Tailwind = 1rem = 16px
    expect(paddingLeft).toBe('16px');
    expect(paddingRight).toBe('16px');
  });

  test('all notification toggle rows have consistent padding', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // Get all notification toggle rows
    const rows = [
      'notification-task-assigned',
      'notification-task-completed',
      'notification-new-message',
      'notification-workflow-completed',
    ];

    for (const rowId of rows) {
      const row = page.getByTestId(rowId);
      await expect(row).toBeVisible();

      const paddingLeft = await row.evaluate((el) => {
        return window.getComputedStyle(el).paddingLeft;
      });
      const paddingRight = await row.evaluate((el) => {
        return window.getComputedStyle(el).paddingRight;
      });

      expect(paddingLeft).toBe('16px');
      expect(paddingRight).toBe('16px');
    }
  });

  test('notification types container does not have extra padding', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-notifications').click();

    // The container wrapping notification rows should NOT have its own horizontal padding
    // (padding is on individual rows to match shortcuts pattern)
    const taskAssignedRow = page.getByTestId('notification-task-assigned');
    const container = await taskAssignedRow.evaluateHandle((el) => el.parentElement);

    const containerPaddingLeft = await container.evaluate((el) => {
      return window.getComputedStyle(el as Element).paddingLeft;
    });
    const containerPaddingRight = await container.evaluate((el) => {
      return window.getComputedStyle(el as Element).paddingRight;
    });

    // Container should have 0px padding (padding is on rows now)
    expect(containerPaddingLeft).toBe('0px');
    expect(containerPaddingRight).toBe('0px');
  });
});
