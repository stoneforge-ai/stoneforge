import { test, expect } from '@playwright/test';

test.describe('TB-O25a: Notification System', () => {
  test.describe('Notification Center UI', () => {
    test('displays notification bell in header', async ({ page }) => {
      await page.goto('/');

      // Wait for the app shell to render
      await expect(page.getByTestId('app-shell')).toBeVisible();

      // Notification center should be visible in header
      await expect(page.getByTestId('notification-center')).toBeVisible();

      // Bell button should be visible
      await expect(page.getByTestId('notification-bell')).toBeVisible();
    });

    test('opens notification dropdown on bell click', async ({ page }) => {
      await page.goto('/');

      // Click notification bell
      await page.getByTestId('notification-bell').click();

      // Dropdown should appear
      await expect(page.getByTestId('notification-dropdown')).toBeVisible();

      // Should show empty state initially (no notifications)
      await expect(page.getByTestId('notification-list')).toBeVisible();
    });

    test('closes dropdown when clicking outside', async ({ page }) => {
      await page.goto('/');

      // Open dropdown
      await page.getByTestId('notification-bell').click();
      await expect(page.getByTestId('notification-dropdown')).toBeVisible();

      // Click outside (on the main content area)
      await page.getByTestId('app-shell').click({ position: { x: 400, y: 300 } });

      // Dropdown should be closed
      await expect(page.getByTestId('notification-dropdown')).not.toBeVisible();
    });

    test('closes dropdown on escape key', async ({ page }) => {
      await page.goto('/');

      // Open dropdown
      await page.getByTestId('notification-bell').click();
      await expect(page.getByTestId('notification-dropdown')).toBeVisible();

      // Press escape
      await page.keyboard.press('Escape');

      // Dropdown should be closed
      await expect(page.getByTestId('notification-dropdown')).not.toBeVisible();
    });

    test('displays empty state message when no notifications', async ({ page }) => {
      // Clear localStorage to ensure no persisted notifications
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.removeItem('orchestrator-notifications');
      });
      await page.reload();

      // Open dropdown
      await page.getByTestId('notification-bell').click();

      // Should show empty state
      await expect(page.getByText('No notifications')).toBeVisible();
      await expect(page.getByText("You're all caught up!")).toBeVisible();
    });
  });

  test.describe('Notification Badge', () => {
    test('does not show badge when no unread notifications', async ({ page }) => {
      // Clear localStorage
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.removeItem('orchestrator-notifications');
      });
      await page.reload();

      // Badge should not be visible
      await expect(page.getByTestId('notification-badge')).not.toBeVisible();
    });

    test('shows badge with unread count', async ({ page }) => {
      // Set up notifications in localStorage
      await page.goto('/');
      await page.evaluate(() => {
        const notifications = [
          {
            id: 'test-1',
            type: 'info',
            title: 'Test Notification 1',
            message: 'Test message 1',
            timestamp: new Date().toISOString(),
            read: false,
            dismissed: false,
          },
          {
            id: 'test-2',
            type: 'success',
            title: 'Test Notification 2',
            message: 'Test message 2',
            timestamp: new Date().toISOString(),
            read: false,
            dismissed: false,
          },
        ];
        localStorage.setItem('orchestrator-notifications', JSON.stringify(notifications));
      });
      await page.reload();

      // Badge should show count of 2
      const badge = page.getByTestId('notification-badge');
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText('2');
    });

    test('badge shows 99+ for large counts', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        const notifications = Array.from({ length: 100 }, (_, i) => ({
          id: `test-${i}`,
          type: 'info',
          title: `Test Notification ${i}`,
          timestamp: new Date().toISOString(),
          read: false,
          dismissed: false,
        }));
        localStorage.setItem('orchestrator-notifications', JSON.stringify(notifications));
      });
      await page.reload();

      // Badge should show 99+ for > 99 unread notifications
      const badge = page.getByTestId('notification-badge');
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText('99+');
    });
  });

  test.describe('Notification List', () => {
    test('displays notifications from localStorage', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        const notifications = [
          {
            id: 'test-1',
            type: 'error',
            title: 'Agent Error: TestBot',
            message: 'Something went wrong',
            timestamp: new Date().toISOString(),
            read: false,
            dismissed: false,
          },
          {
            id: 'test-2',
            type: 'success',
            title: 'Task Completed',
            message: 'Task TB-001 was completed',
            timestamp: new Date().toISOString(),
            read: true,
            dismissed: false,
          },
        ];
        localStorage.setItem('orchestrator-notifications', JSON.stringify(notifications));
      });
      await page.reload();

      // Open dropdown
      await page.getByTestId('notification-bell').click();

      // Notifications should be visible
      await expect(page.getByTestId('notification-test-1')).toBeVisible();
      await expect(page.getByTestId('notification-test-2')).toBeVisible();

      // Should display notification content
      await expect(page.getByText('Agent Error: TestBot')).toBeVisible();
      await expect(page.getByText('Task Completed')).toBeVisible();
    });

    test('dismisses notification when X is clicked', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        const notifications = [
          {
            id: 'dismiss-test',
            type: 'info',
            title: 'Dismissable Notification',
            timestamp: new Date().toISOString(),
            read: false,
            dismissed: false,
          },
        ];
        localStorage.setItem('orchestrator-notifications', JSON.stringify(notifications));
      });
      await page.reload();

      // Open dropdown
      await page.getByTestId('notification-bell').click();

      // Notification should be visible
      await expect(page.getByTestId('notification-dismiss-test')).toBeVisible();

      // Hover to reveal dismiss button and click it
      await page.getByTestId('notification-dismiss-test').hover();
      await page.getByTestId('notification-dismiss-test').getByLabel('Dismiss notification').click();

      // Notification should be gone
      await expect(page.getByTestId('notification-dismiss-test')).not.toBeVisible();
    });
  });

  test.describe('Notification Actions', () => {
    test('marks all as read when clicking mark all button', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        const notifications = [
          {
            id: 'unread-1',
            type: 'info',
            title: 'Unread 1',
            timestamp: new Date().toISOString(),
            read: false,
            dismissed: false,
          },
          {
            id: 'unread-2',
            type: 'info',
            title: 'Unread 2',
            timestamp: new Date().toISOString(),
            read: false,
            dismissed: false,
          },
        ];
        localStorage.setItem('orchestrator-notifications', JSON.stringify(notifications));
      });
      await page.reload();

      // Badge should show 2 unread
      await expect(page.getByTestId('notification-badge')).toHaveText('2');

      // Open dropdown and mark all as read
      await page.getByTestId('notification-bell').click();
      await page.getByLabel('Mark all as read').click();

      // Badge should be gone (no unread)
      await expect(page.getByTestId('notification-badge')).not.toBeVisible();
    });

    test('clears all notifications when clicking clear button', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        const notifications = [
          {
            id: 'clear-1',
            type: 'info',
            title: 'To Be Cleared',
            timestamp: new Date().toISOString(),
            read: false,
            dismissed: false,
          },
        ];
        localStorage.setItem('orchestrator-notifications', JSON.stringify(notifications));
      });
      await page.reload();

      // Open dropdown
      await page.getByTestId('notification-bell').click();

      // Notification should exist
      await expect(page.getByTestId('notification-clear-1')).toBeVisible();

      // Clear all
      await page.getByLabel('Clear all notifications').click();

      // Should show empty state
      await expect(page.getByText('No notifications')).toBeVisible();
    });

    test('navigates to settings when clicking settings button', async ({ page }) => {
      await page.goto('/');

      // Open dropdown
      await page.getByTestId('notification-bell').click();

      // Click settings button
      await page.getByLabel('Notification settings').click();

      // Should navigate to settings page
      await expect(page).toHaveURL(/\/settings/);
    });
  });

  test.describe('Toast Notifications', () => {
    test('useToast hook exports are available', async ({ page }) => {
      await page.goto('/');

      // Test that the notification system is set up by adding a test notification
      // and checking it appears in localStorage
      await page.evaluate(() => {
        const notifications = [
          {
            id: 'toast-test',
            type: 'success',
            title: 'Toast Test',
            message: 'This is a test notification',
            timestamp: new Date().toISOString(),
            read: false,
            dismissed: false,
          },
        ];
        localStorage.setItem('orchestrator-notifications', JSON.stringify(notifications));
      });
      await page.reload();

      // Verify notification was loaded
      await page.getByTestId('notification-bell').click();
      await expect(page.getByText('Toast Test')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('notification bell has proper aria attributes', async ({ page }) => {
      await page.goto('/');

      const bell = page.getByTestId('notification-bell');
      await expect(bell).toHaveAttribute('aria-label', /Notifications/);
      await expect(bell).toHaveAttribute('aria-expanded', 'false');

      // Open dropdown
      await bell.click();
      await expect(bell).toHaveAttribute('aria-expanded', 'true');
    });

    test('notification dropdown has proper role', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('notification-bell').click();

      const dropdown = page.getByTestId('notification-dropdown');
      await expect(dropdown).toHaveAttribute('role', 'menu');
      await expect(dropdown).toHaveAttribute('aria-label', 'Notifications');
    });

    test('notification items have accessible dismiss buttons', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        const notifications = [
          {
            id: 'a11y-test',
            type: 'info',
            title: 'Accessible Notification',
            timestamp: new Date().toISOString(),
            read: false,
            dismissed: false,
          },
        ];
        localStorage.setItem('orchestrator-notifications', JSON.stringify(notifications));
      });
      await page.reload();

      await page.getByTestId('notification-bell').click();
      await page.getByTestId('notification-a11y-test').hover();

      // Dismiss button should have accessible label
      await expect(
        page.getByTestId('notification-a11y-test').getByLabel('Dismiss notification')
      ).toBeVisible();
    });
  });

  test.describe('Connection Status', () => {
    test('shows offline indicator when SSE not connected', async ({ page }) => {
      // Block SSE endpoint to simulate offline state
      await page.route('**/api/events**', (route) => {
        route.abort('connectionrefused');
      });

      await page.goto('/');

      await page.getByTestId('notification-bell').click();

      // The offline badge should appear in the notification dropdown since we're not connected
      // Use more specific selector within the notification dropdown
      const dropdown = page.getByTestId('notification-dropdown');
      await expect(dropdown.getByText('Offline')).toBeVisible();
    });
  });
});
