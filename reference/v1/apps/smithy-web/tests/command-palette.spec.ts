/**
 * Command Palette Tests (TB-O25b)
 *
 * Tests for the Cmd+K command palette functionality:
 * - Opening/closing the palette
 * - Navigation commands
 * - Search and filtering
 * - Keyboard navigation
 * - Actions
 */

import { test, expect, Page } from '@playwright/test';

/**
 * Helper to open the command palette via keyboard shortcut.
 * Waits for the page to be fully loaded (trigger button visible) before pressing the shortcut.
 * Uses Control+k which works cross-platform (the hook handles both metaKey and ctrlKey).
 */
async function openCommandPaletteWithKeyboard(page: Page) {
  // Wait for the trigger button to be visible, indicating the component is mounted
  // and the keyboard event listener is registered
  await page.waitForSelector('[data-testid="command-palette-trigger"]', { state: 'attached' });
  await page.keyboard.press('Control+k');
}

test.describe('TB-O25b: Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/activity');
  });

  test.describe('Opening and Closing', () => {
    test('opens with Cmd+K (or Ctrl+K on non-Mac)', async ({ page }) => {
      // Open with keyboard shortcut
      await openCommandPaletteWithKeyboard(page);
      await expect(page.getByTestId('command-palette')).toBeVisible();
    });

    test('opens with search button in header', async ({ page }) => {
      // Click the search button in header
      await page.getByTestId('command-palette-trigger').click();
      await expect(page.getByTestId('command-palette')).toBeVisible();
    });

    test('closes with Escape key', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      await expect(page.getByTestId('command-palette')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('command-palette')).not.toBeVisible();
    });

    test('closes when clicking backdrop', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      await expect(page.getByTestId('command-palette')).toBeVisible();

      await page.getByTestId('command-palette-backdrop').click({ force: true });
      await expect(page.getByTestId('command-palette')).not.toBeVisible();
    });

    test('toggles open/close with Cmd+K', async ({ page }) => {
      // Open
      await openCommandPaletteWithKeyboard(page);
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Close
      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('command-palette')).not.toBeVisible();

      // Open again
      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();
    });
  });

  test.describe('Search Input', () => {
    test('has a search input that is focused when opened', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      const input = page.getByTestId('command-palette-input');
      await expect(input).toBeVisible();
      await expect(input).toBeFocused();
    });

    test('shows placeholder text', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      const input = page.getByTestId('command-palette-input');
      await expect(input).toHaveAttribute('placeholder', 'Type a command or search...');
    });

    test('clears search when closing and reopening', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      const input = page.getByTestId('command-palette-input');

      // Type something
      await input.fill('tasks');
      await expect(input).toHaveValue('tasks');

      // Close
      await page.keyboard.press('Escape');

      // Reopen - should be cleared
      await page.keyboard.press('Control+k');
      await expect(input).toHaveValue('');
    });
  });

  test.describe('Command Groups', () => {
    test('displays navigation group', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      await expect(page.getByTestId('command-group-navigation')).toBeVisible();
    });

    test('displays tasks group', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      await expect(page.getByTestId('command-group-tasks')).toBeVisible();
    });

    test('displays agents group', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      await expect(page.getByTestId('command-group-agents')).toBeVisible();
    });

    test('displays workflows group', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      await expect(page.getByTestId('command-group-workflows')).toBeVisible();
    });

    test('displays actions group', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      await expect(page.getByTestId('command-group-actions')).toBeVisible();
    });

    test('displays settings group', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      await expect(page.getByTestId('command-group-settings')).toBeVisible();
    });
  });

  test.describe('Navigation Commands', () => {
    test('navigates to Activity page', async ({ page }) => {
      await page.goto('/settings');
      await openCommandPaletteWithKeyboard(page);

      await page.getByTestId('command-item-nav-activity').click();

      await expect(page).toHaveURL(/\/activity/);
      await expect(page.getByTestId('command-palette')).not.toBeVisible();
    });

    test('navigates to Tasks page', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      await page.getByTestId('command-item-nav-tasks').click();

      await expect(page).toHaveURL(/\/tasks/);
    });

    test('navigates to Agents page', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      await page.getByTestId('command-item-nav-agents').click();

      await expect(page).toHaveURL(/\/agents/);
    });

    test('navigates to Stewards tab', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      await page.getByTestId('command-item-nav-stewards').click();

      await expect(page).toHaveURL(/\/agents\?tab=stewards/);
    });

    test('navigates to Workspaces page', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      await page.getByTestId('command-item-nav-workspaces').click();

      await expect(page).toHaveURL(/\/workspaces/);
    });

    test('navigates to Workflows page', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      await page.getByTestId('command-item-nav-workflows').click();

      await expect(page).toHaveURL(/\/workflows/);
    });

    test('navigates to Metrics page', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      await page.getByTestId('command-item-nav-metrics').click();

      await expect(page).toHaveURL(/\/metrics/);
    });

    test('navigates to Settings page', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      await page.getByTestId('command-item-nav-settings').click();

      await expect(page).toHaveURL(/\/settings/);
    });
  });

  test.describe('Fuzzy Search', () => {
    test('filters commands when typing', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      const input = page.getByTestId('command-palette-input');

      // Type "task" - should show task-related commands
      await input.fill('task');

      // Task commands should be visible
      await expect(page.getByTestId('command-item-nav-tasks')).toBeVisible();
      await expect(page.getByTestId('command-item-task-create')).toBeVisible();

      // Non-matching commands should be hidden
      await expect(page.getByTestId('command-item-nav-metrics')).not.toBeVisible();
    });

    test('searches by keywords', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      const input = page.getByTestId('command-palette-input');

      // Type "home" - should match Activity (which has "home" as keyword)
      await input.fill('home');

      await expect(page.getByTestId('command-item-nav-activity')).toBeVisible();
    });

    test('searches by description', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      const input = page.getByTestId('command-palette-input');

      // Type "terminal" - should match workspaces description
      await input.fill('terminal');

      await expect(page.getByTestId('command-item-nav-workspaces')).toBeVisible();
      await expect(page.getByTestId('command-item-action-open-terminal')).toBeVisible();
    });

    test('shows "No results found" for non-matching search', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      const input = page.getByTestId('command-palette-input');

      await input.fill('xyznonexistent123');

      await expect(page.getByText('No results found.')).toBeVisible();
    });

    test('clears filter when search is cleared', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      const input = page.getByTestId('command-palette-input');

      // Filter
      await input.fill('task');
      await expect(page.getByTestId('command-item-nav-metrics')).not.toBeVisible();

      // Clear
      await input.fill('');

      // All commands visible again
      await expect(page.getByTestId('command-item-nav-metrics')).toBeVisible();
      await expect(page.getByTestId('command-item-nav-tasks')).toBeVisible();
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('can navigate with arrow keys', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      // First item should be selected by default
      const firstItem = page.getByTestId('command-item-nav-activity');
      await expect(firstItem).toHaveAttribute('data-selected', 'true');

      // Press down
      await page.keyboard.press('ArrowDown');

      // Second item should now be selected
      const secondItem = page.getByTestId('command-item-nav-tasks');
      await expect(secondItem).toHaveAttribute('data-selected', 'true');
    });

    test('can select with Enter key', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      // Navigate to tasks
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      await expect(page).toHaveURL(/\/tasks/);
    });

    test('maintains selection at top when pressing up', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      // First item should be selected
      const firstItem = page.getByTestId('command-item-nav-activity');
      await expect(firstItem).toHaveAttribute('data-selected', 'true');

      // Press up - cmdk keeps selection at top (doesn't wrap)
      await page.keyboard.press('ArrowUp');

      // First item should still be selected
      await expect(firstItem).toHaveAttribute('data-selected', 'true');
    });
  });

  test.describe('Theme Commands', () => {
    test('switches to light theme', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      const input = page.getByTestId('command-palette-input');

      await input.fill('light theme');
      await page.getByTestId('command-item-theme-light').click();

      // Verify theme changed
      const html = page.locator('html');
      await expect(html).not.toHaveClass(/dark/);
    });

    test('switches to dark theme', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);
      const input = page.getByTestId('command-palette-input');

      await input.fill('dark theme');
      await page.getByTestId('command-item-theme-dark').click();

      // Verify theme changed
      const html = page.locator('html');
      await expect(html).toHaveClass(/dark/);
    });
  });

  test.describe('UI Elements', () => {
    test('displays ESC hint in header', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      // Should show ESC keyboard hint
      const dialog = page.getByTestId('command-palette-dialog');
      await expect(dialog.getByText('ESC')).toBeVisible();
    });

    test('displays keyboard hints in footer', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      const dialog = page.getByTestId('command-palette-dialog');

      // Navigation hints
      await expect(dialog.getByText('Navigate')).toBeVisible();
      await expect(dialog.getByText('Select')).toBeVisible();
    });

    test('displays shortcuts for commands', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      // Activity has shortcut G A
      const activityItem = page.getByTestId('command-item-nav-activity');
      await expect(activityItem.getByText('G A')).toBeVisible();

      // Tasks has shortcut G T
      const tasksItem = page.getByTestId('command-item-nav-tasks');
      await expect(tasksItem.getByText('G T')).toBeVisible();
    });

    test('displays icons for commands', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      // Wait for the activity item to be visible first (ensures command palette is fully rendered)
      const activityItem = page.getByTestId('command-item-nav-activity');
      await expect(activityItem).toBeVisible();

      // Each command item should have an icon container (the first div child contains the icon)
      const iconContainer = activityItem.locator('div').first();
      await expect(iconContainer).toBeVisible();
    });

    test('displays descriptions for commands', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      const activityItem = page.getByTestId('command-item-nav-activity');
      await expect(activityItem.getByText('View real-time activity feed')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('has proper role and structure', async ({ page }) => {
      await openCommandPaletteWithKeyboard(page);

      // Command palette root should be visible
      const palette = page.getByTestId('command-palette');
      await expect(palette).toBeVisible();

      // Should have a search input
      const input = page.getByTestId('command-palette-input');
      await expect(input).toBeVisible();

      // Should have a command list
      const list = page.getByTestId('command-palette-list');
      await expect(list).toBeVisible();
    });

    test('trigger button has aria-label', async ({ page }) => {
      const trigger = page.getByTestId('command-palette-trigger');
      await expect(trigger).toHaveAttribute('aria-label', 'Open command palette');
    });
  });

  test.describe('Mobile Behavior', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('command palette trigger is hidden on mobile', async ({ page }) => {
      // On mobile, the trigger button should not be visible
      await expect(page.getByTestId('command-palette-trigger')).not.toBeVisible();
    });

    test('can still open with keyboard shortcut on mobile', async ({ page }) => {
      // On mobile, the trigger button is not visible, but we still need to wait
      // for the component to be mounted before pressing the keyboard shortcut.
      // Wait for any element in the AppShell to be visible.
      await page.waitForSelector('[data-testid="sidebar"]', { state: 'attached', timeout: 5000 }).catch(() => {
        // Sidebar might not be visible on mobile, so wait for any stable element
      });
      // Give the React app time to fully mount the event listeners
      await page.waitForTimeout(100);
      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();
    });
  });
});
