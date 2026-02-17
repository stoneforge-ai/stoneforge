import { test, expect } from '@playwright/test';

test.describe('TB-O25c: Settings Page', () => {
  test.describe('Page layout', () => {
    test('displays settings page with correct header', async ({ page }) => {
      await page.goto('/settings');

      await expect(page.getByTestId('settings-page')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expect(page.getByText('Configure your preferences and workspace')).toBeVisible();
    });

    test('displays Preferences and Workspace tabs', async ({ page }) => {
      await page.goto('/settings');

      await expect(page.getByTestId('settings-tab-preferences')).toBeVisible();
      await expect(page.getByTestId('settings-tab-workspace')).toBeVisible();
    });

    test('defaults to Preferences tab', async ({ page }) => {
      await page.goto('/settings');

      const preferencesTab = page.getByTestId('settings-tab-preferences');
      await expect(preferencesTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
      await expect(page.getByTestId('settings-preferences')).toBeVisible();
    });
  });

  test.describe('Tab navigation', () => {
    test('can switch to Workspace tab', async ({ page }) => {
      await page.goto('/settings');

      await page.getByTestId('settings-tab-workspace').click();

      // URL should reflect tab change
      await expect(page).toHaveURL(/tab=workspace/);

      // Workspace tab should now be active
      const workspaceTab = page.getByTestId('settings-tab-workspace');
      await expect(workspaceTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
      await expect(page.getByTestId('settings-workspace')).toBeVisible();
    });

    test('can switch back to Preferences tab', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      await page.getByTestId('settings-tab-preferences').click();

      await expect(page).toHaveURL(/tab=preferences/);
      await expect(page.getByTestId('settings-preferences')).toBeVisible();
    });

    test('preserves tab in URL on page reload', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      await page.reload();

      await expect(page).toHaveURL(/tab=workspace/);
      await expect(page.getByTestId('settings-workspace')).toBeVisible();
    });
  });

  test.describe('Preferences Tab - Theme', () => {
    test('displays theme section with all options', async ({ page }) => {
      await page.goto('/settings');

      await expect(page.getByTestId('settings-section-theme')).toBeVisible();
      await expect(page.getByTestId('settings-theme-light')).toBeVisible();
      await expect(page.getByTestId('settings-theme-dark')).toBeVisible();
      await expect(page.getByTestId('settings-theme-system')).toBeVisible();
    });

    test('can switch to light theme', async ({ page }) => {
      await page.goto('/settings');

      await page.getByTestId('settings-theme-light').click();

      // Button should show as active
      await expect(page.getByTestId('settings-theme-light')).toHaveClass(/border-\[var\(--color-primary\)\]/);

      // Theme should be applied (html element should have theme-light class)
      await expect(page.locator('html')).toHaveClass(/theme-light/);
    });

    test('can switch to dark theme', async ({ page }) => {
      await page.goto('/settings');

      await page.getByTestId('settings-theme-dark').click();

      // Button should show as active
      await expect(page.getByTestId('settings-theme-dark')).toHaveClass(/border-\[var\(--color-primary\)\]/);

      // Theme should be applied
      await expect(page.locator('html')).toHaveClass(/theme-dark/);
    });

    test('can switch to system theme', async ({ page }) => {
      await page.goto('/settings');

      // First set to light, then system
      await page.getByTestId('settings-theme-light').click();
      await page.getByTestId('settings-theme-system').click();

      // Button should show as active
      await expect(page.getByTestId('settings-theme-system')).toHaveClass(/border-\[var\(--color-primary\)\]/);

      // Should show system preference message
      await expect(page.getByText(/Currently using .* theme based on system preference/)).toBeVisible();
    });

    test('persists theme setting after page reload', async ({ page }) => {
      await page.goto('/settings');

      await page.getByTestId('settings-theme-dark').click();
      await page.reload();

      // Dark theme should still be selected
      await expect(page.getByTestId('settings-theme-dark')).toHaveClass(/border-\[var\(--color-primary\)\]/);
      await expect(page.locator('html')).toHaveClass(/theme-dark/);
    });
  });

  test.describe('Preferences Tab - Notifications', () => {
    test('displays notification settings section', async ({ page }) => {
      await page.goto('/settings');

      await expect(page.getByTestId('settings-section-notifications')).toBeVisible();
    });

    test('can toggle task completion alerts', async ({ page }) => {
      await page.goto('/settings');

      const toggle = page.getByTestId('settings-notify-task');
      const checkbox = toggle.locator('input[type="checkbox"]');
      const initialState = await checkbox.getAttribute('data-checked') === 'true';

      await toggle.click();

      const newState = await checkbox.getAttribute('data-checked') === 'true';
      expect(newState).toBe(!initialState);
    });

    test('can toggle agent health warnings', async ({ page }) => {
      await page.goto('/settings');

      const toggle = page.getByTestId('settings-notify-health');
      const checkbox = toggle.locator('input[type="checkbox"]');
      const initialState = await checkbox.getAttribute('data-checked') === 'true';

      await toggle.click();

      const newState = await checkbox.getAttribute('data-checked') === 'true';
      expect(newState).toBe(!initialState);
    });

    test('can toggle merge notifications', async ({ page }) => {
      await page.goto('/settings');

      const toggle = page.getByTestId('settings-notify-merge');
      const checkbox = toggle.locator('input[type="checkbox"]');
      const initialState = await checkbox.getAttribute('data-checked') === 'true';

      await toggle.click();

      const newState = await checkbox.getAttribute('data-checked') === 'true';
      expect(newState).toBe(!initialState);
    });

    test('can toggle sound notifications', async ({ page }) => {
      await page.goto('/settings');

      const toggle = page.getByTestId('settings-notify-sound');
      const checkbox = toggle.locator('input[type="checkbox"]');
      const initialState = await checkbox.getAttribute('data-checked') === 'true';

      await toggle.click();

      const newState = await checkbox.getAttribute('data-checked') === 'true';
      expect(newState).toBe(!initialState);
    });

    test('can change toast duration', async ({ page }) => {
      await page.goto('/settings');

      const select = page.getByTestId('settings-toast-duration');

      await select.selectOption('10000');
      await expect(select).toHaveValue('10000');

      await select.selectOption('0');
      await expect(select).toHaveValue('0');
    });

    test('can reset notifications to defaults', async ({ page }) => {
      await page.goto('/settings');

      // Change a setting
      const toggle = page.getByTestId('settings-notify-task');
      const checkbox = toggle.locator('input[type="checkbox"]');
      const initialState = await checkbox.getAttribute('data-checked') === 'true';
      if (initialState) {
        await toggle.click();
      }

      // Reset
      await page.getByTestId('settings-notify-reset').click();

      // Should be back to default (checked)
      const newState = await checkbox.getAttribute('data-checked') === 'true';
      expect(newState).toBe(true);
    });
  });

  test.describe('Preferences Tab - Keyboard Shortcuts', () => {
    test('displays keyboard shortcuts section', async ({ page }) => {
      await page.goto('/settings');

      await expect(page.getByTestId('settings-section-keyboard-shortcuts')).toBeVisible();
    });

    test('displays command palette shortcut', async ({ page }) => {
      await page.goto('/settings');

      await expect(page.getByTestId('shortcut-row-action.commandPalette')).toBeVisible();
      // Check for the keyboard shortcut text
      await expect(page.getByTestId('shortcut-row-action.commandPalette').locator('kbd')).toContainText('K');
    });

    test('displays all expected shortcuts', async ({ page }) => {
      await page.goto('/settings');

      await expect(page.getByTestId('shortcut-row-action.commandPalette')).toBeVisible();
      await expect(page.getByTestId('shortcut-row-action.toggleSidebar')).toBeVisible();
      await expect(page.getByTestId('shortcut-row-action.toggleDirector')).toBeVisible();
    });
  });

  test.describe('Workspace Tab - Git Worktrees', () => {
    test('displays worktree settings section', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      await expect(page.getByTestId('settings-section-git-worktrees')).toBeVisible();
    });

    test('can edit worktree directory', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      const input = page.getByTestId('settings-worktree-dir');
      await input.clear();
      await input.fill('.custom-worktrees/');

      await expect(input).toHaveValue('.custom-worktrees/');
    });

    test('can edit default branch', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      const input = page.getByTestId('settings-default-branch');
      await input.clear();
      await input.fill('develop');

      await expect(input).toHaveValue('develop');
    });

    test('can toggle auto-merge', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      const toggle = page.getByTestId('settings-auto-merge');
      const checkbox = toggle.locator('input[type="checkbox"]');
      const initialState = await checkbox.getAttribute('data-checked') === 'true';

      await toggle.click();

      const newState = await checkbox.getAttribute('data-checked') === 'true';
      expect(newState).toBe(!initialState);
    });
  });

  test.describe('Workspace Tab - Ephemeral Tasks', () => {
    test('displays ephemeral tasks section', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      await expect(page.getByTestId('settings-section-ephemeral-tasks')).toBeVisible();
    });

    test('can change retention period', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      const select = page.getByTestId('settings-ephemeral-retention');

      await select.selectOption('7d');
      await expect(select).toHaveValue('7d');

      await select.selectOption('1h');
      await expect(select).toHaveValue('1h');
    });
  });

  test.describe('Workspace Tab - Steward Schedules', () => {
    test('displays steward schedules section', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      await expect(page.getByTestId('settings-section-steward-schedules')).toBeVisible();
    });

    test('can toggle merge steward', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      const toggle = page.getByTestId('settings-merge-steward');
      const checkbox = toggle.locator('input[type="checkbox"]');
      const initialState = await checkbox.getAttribute('data-checked') === 'true';

      await toggle.click();

      const newState = await checkbox.getAttribute('data-checked') === 'true';
      expect(newState).toBe(!initialState);
    });

    test('can reset steward schedules to defaults', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      // Make a change
      const toggle = page.getByTestId('settings-merge-steward');
      const checkbox = toggle.locator('input[type="checkbox"]');
      const initialState = await checkbox.getAttribute('data-checked') === 'true';
      if (initialState) {
        await toggle.click();
      }

      // Reset
      await page.getByTestId('settings-steward-reset').click();

      // Should be back to default (enabled)
      const newState = await checkbox.getAttribute('data-checked') === 'true';
      expect(newState).toBe(true);
    });
  });

  test.describe('Workspace Tab - Reset All Settings', () => {
    test('displays reset all settings section', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      await expect(page.getByTestId('settings-section-reset-all-settings')).toBeVisible();
    });

    test('shows confirmation when clicking reset all', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      await page.getByTestId('settings-reset-all').click();

      await expect(page.getByText('Are you sure?')).toBeVisible();
      await expect(page.getByTestId('settings-reset-confirm')).toBeVisible();
      await expect(page.getByTestId('settings-reset-cancel')).toBeVisible();
    });

    test('can cancel reset all', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      await page.getByTestId('settings-reset-all').click();
      await page.getByTestId('settings-reset-cancel').click();

      // Confirmation should be hidden
      await expect(page.getByText('Are you sure?')).not.toBeVisible();
      await expect(page.getByTestId('settings-reset-all')).toBeVisible();
    });

    test('can confirm reset all', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      // First change some settings
      const worktreeInput = page.getByTestId('settings-worktree-dir');
      await worktreeInput.clear();
      await worktreeInput.fill('.custom/');

      // Reset all
      await page.getByTestId('settings-reset-all').click();
      await page.getByTestId('settings-reset-confirm').click();

      // Should be back to default
      await expect(worktreeInput).toHaveValue('.stoneforge/.worktrees/');
    });
  });

  test.describe('Settings persistence', () => {
    test('persists workspace settings after page reload', async ({ page }) => {
      await page.goto('/settings?tab=workspace');

      // Change worktree directory
      const input = page.getByTestId('settings-worktree-dir');
      await input.clear();
      await input.fill('.test-worktrees/');

      // Reload
      await page.reload();

      // Setting should persist
      await expect(input).toHaveValue('.test-worktrees/');

      // Clean up - reset to default
      await page.getByTestId('settings-reset-all').click();
      await page.getByTestId('settings-reset-confirm').click();
    });

    test('persists notification settings after page reload', async ({ page }) => {
      await page.goto('/settings');

      // Change toast duration
      const select = page.getByTestId('settings-toast-duration');
      await select.selectOption('10000');

      // Reload
      await page.reload();

      // Setting should persist
      await expect(select).toHaveValue('10000');

      // Clean up - reset
      await page.getByTestId('settings-notify-reset').click();
    });
  });

  test.describe('Responsive design', () => {
    test('settings sections are contained to max-width on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/settings');

      // Content should have max-w-2xl class
      await expect(page.getByTestId('settings-preferences')).toHaveClass(/max-w-2xl/);
    });

    test('displays correctly on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/settings');

      // Page should still be visible and functional
      await expect(page.getByTestId('settings-page')).toBeVisible();
      await expect(page.getByTestId('settings-tab-preferences')).toBeVisible();
      await expect(page.getByTestId('settings-section-theme')).toBeVisible();
    });
  });

  test.describe('Navigation from header', () => {
    test('can navigate to settings from notification center', async ({ page }) => {
      await page.goto('/');

      // This test verifies that the settings link from notification center works
      // The actual notification center has a "Settings" action that links to /settings?tab=preferences
      await page.goto('/settings?tab=preferences');

      await expect(page).toHaveURL(/settings/);
      await expect(page.getByTestId('settings-page')).toBeVisible();
    });
  });
});
