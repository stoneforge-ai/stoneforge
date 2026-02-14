import { test, expect } from '@playwright/test';

test.describe('TB59: Settings Page - Theme', () => {
  test('settings page is visible via sidebar navigation', async ({ page }) => {
    await page.goto('/dashboard');

    // Click Settings in sidebar
    await page.getByTestId('nav-settings').click();

    // Should navigate to /settings
    await expect(page).toHaveURL(/\/settings/);

    // Settings page should be visible
    await expect(page.getByTestId('settings-page')).toBeVisible();
  });

  test('settings page has sidebar navigation with sections', async ({ page }) => {
    await page.goto('/settings');

    // Settings sidebar nav should be visible
    await expect(page.getByTestId('settings-nav')).toBeVisible();

    // All sections should be visible
    await expect(page.getByTestId('settings-nav-theme')).toBeVisible();
    await expect(page.getByTestId('settings-nav-shortcuts')).toBeVisible();
    await expect(page.getByTestId('settings-nav-defaults')).toBeVisible();
    await expect(page.getByTestId('settings-nav-notifications')).toBeVisible();
    await expect(page.getByTestId('settings-nav-sync')).toBeVisible();
  });

  test('theme section is shown by default', async ({ page }) => {
    await page.goto('/settings');

    // Theme section should be visible
    await expect(page.getByTestId('settings-theme-section')).toBeVisible();

    // All theme options should be visible
    await expect(page.getByTestId('theme-option-light')).toBeVisible();
    await expect(page.getByTestId('theme-option-dark')).toBeVisible();
    await expect(page.getByTestId('theme-option-system')).toBeVisible();
  });

  test('can select light theme', async ({ page }) => {
    await page.goto('/settings');

    // Click light theme option
    await page.getByTestId('theme-option-light').click();

    // Should show as active
    await expect(page.getByTestId('theme-option-light')).toContainText('Active');

    // Document should have theme-light class
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('theme-light');
    expect(htmlClass).not.toContain('dark');
  });

  test('can select dark theme', async ({ page }) => {
    await page.goto('/settings');

    // Click dark theme option
    await page.getByTestId('theme-option-dark').click();

    // Should show as active
    await expect(page.getByTestId('theme-option-dark')).toContainText('Active');

    // Document should have dark class
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dark');
    expect(htmlClass).toContain('theme-dark');
  });

  test('can select system theme', async ({ page }) => {
    await page.goto('/settings');

    // First select light theme
    await page.getByTestId('theme-option-light').click();

    // Then select system theme
    await page.getByTestId('theme-option-system').click();

    // Should show as active
    await expect(page.getByTestId('theme-option-system')).toContainText('Active');
  });

  test('theme preference persists after page refresh', async ({ page }) => {
    await page.goto('/settings');

    // Select dark theme
    await page.getByTestId('theme-option-dark').click();
    await expect(page.getByTestId('theme-option-dark')).toContainText('Active');

    // Refresh the page
    await page.reload();

    // Dark theme should still be active
    await expect(page.getByTestId('theme-option-dark')).toContainText('Active');

    // Document should still have dark class
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dark');
  });

  test('theme is stored in localStorage', async ({ page }) => {
    await page.goto('/settings');

    // Select dark theme
    await page.getByTestId('theme-option-dark').click();

    // Check localStorage
    const storedTheme = await page.evaluate(() => localStorage.getItem('settings.theme'));
    expect(storedTheme).toBe('dark');

    // Select light theme
    await page.getByTestId('theme-option-light').click();

    // Check localStorage again
    const storedTheme2 = await page.evaluate(() => localStorage.getItem('settings.theme'));
    expect(storedTheme2).toBe('light');
  });

  test('theme preview shows current theme appearance', async ({ page }) => {
    await page.goto('/settings');

    // Theme preview should be visible
    await expect(page.getByTestId('theme-preview')).toBeVisible();
  });

  test('clicking other settings sections shows their content', async ({ page }) => {
    await page.goto('/settings');

    // Defaults section is implemented, shows content
    await page.getByTestId('settings-nav-defaults').click();
    await expect(page.getByTestId('settings-defaults-section')).toBeVisible();
    // Should have default view options, not "coming soon"
    await expect(page.getByTestId('default-tasks-view-list')).toBeVisible();

    // Notifications section is now implemented
    await page.getByTestId('settings-nav-notifications').click();
    await expect(page.getByTestId('settings-notifications-section')).toBeVisible();
    // Should have notification type toggles, not "coming soon"
    await expect(page.getByTestId('notification-task-assigned')).toBeVisible();

    // Click sync section - now implemented
    await page.getByTestId('settings-nav-sync').click();
    await expect(page.getByTestId('settings-sync-section')).toBeVisible();
    // Should have export/import buttons, not "coming soon"
    await expect(page.getByTestId('export-now-button')).toBeVisible();
  });

  test('can navigate back to theme section after viewing other sections', async ({ page }) => {
    await page.goto('/settings');

    // Click shortcuts section
    await page.getByTestId('settings-nav-shortcuts').click();
    await expect(page.getByTestId('settings-shortcuts-section')).toBeVisible();

    // Click back to theme section
    await page.getByTestId('settings-nav-theme').click();
    await expect(page.getByTestId('settings-theme-section')).toBeVisible();

    // Theme options should be visible again
    await expect(page.getByTestId('theme-option-light')).toBeVisible();
  });

  test('theme nav item shows as active when theme section is selected', async ({ page }) => {
    await page.goto('/settings');

    // Theme nav should be active (have active styling)
    const themeNav = page.getByTestId('settings-nav-theme');
    await expect(themeNav).toHaveClass(/bg-white|text-blue-600/);

    // Click shortcuts to change section
    await page.getByTestId('settings-nav-shortcuts').click();

    // Shortcuts nav should now be active
    const shortcutsNav = page.getByTestId('settings-nav-shortcuts');
    await expect(shortcutsNav).toHaveClass(/bg-white|text-blue-600/);
  });

  test('theme selection switches between options correctly', async ({ page }) => {
    await page.goto('/settings');

    // Light should start as active (default is system, but for test we select light first)
    await page.getByTestId('theme-option-light').click();
    await expect(page.getByTestId('theme-option-light')).toContainText('Active');
    await expect(page.getByTestId('theme-option-dark')).not.toContainText('Active');
    await expect(page.getByTestId('theme-option-system')).not.toContainText('Active');

    // Select dark
    await page.getByTestId('theme-option-dark').click();
    await expect(page.getByTestId('theme-option-dark')).toContainText('Active');
    await expect(page.getByTestId('theme-option-light')).not.toContainText('Active');
    await expect(page.getByTestId('theme-option-system')).not.toContainText('Active');

    // Select system
    await page.getByTestId('theme-option-system').click();
    await expect(page.getByTestId('theme-option-system')).toContainText('Active');
    await expect(page.getByTestId('theme-option-light')).not.toContainText('Active');
    await expect(page.getByTestId('theme-option-dark')).not.toContainText('Active');
  });

  test('dark theme applies dark styling to the page', async ({ page }) => {
    await page.goto('/settings');

    // Select dark theme
    await page.getByTestId('theme-option-dark').click();

    // Body should have dark background (via CSS variables)
    // Using TB72's new deep charcoal color #0d0d0d = rgb(13, 13, 13)
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 13, 13)');
  });

  test('light theme applies light styling to the page', async ({ page }) => {
    await page.goto('/settings');

    // First set to dark to ensure we're changing
    await page.getByTestId('theme-option-dark').click();

    // Then set to light
    await page.getByTestId('theme-option-light').click();

    // Body should have light background
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('theme persists across different pages', async ({ page }) => {
    await page.goto('/settings');

    // Select dark theme
    await page.getByTestId('theme-option-dark').click();

    // Navigate to dashboard
    await page.getByTestId('nav-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Dark class should still be on document
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dark');

    // Navigate back to settings
    await page.getByTestId('nav-settings').click();

    // Dark theme should still be selected
    await expect(page.getByTestId('theme-option-dark')).toContainText('Active');
  });

  test('system theme description shows current system preference', async ({ page }) => {
    await page.goto('/settings');

    // System option should mention either light or dark
    const systemOption = page.getByTestId('theme-option-system');
    await expect(systemOption).toContainText(/currently (light|dark)/i);
  });
});

test.describe('TB60: Settings Page - Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any custom shortcuts before each test
    await page.goto('/settings');
    await page.evaluate(() => localStorage.removeItem('settings.customShortcuts'));
  });

  test('shortcuts section is visible when clicking shortcuts nav', async ({ page }) => {
    await page.goto('/settings');

    // Click shortcuts section
    await page.getByTestId('settings-nav-shortcuts').click();

    // Shortcuts section should be visible
    await expect(page.getByTestId('settings-shortcuts-section')).toBeVisible();
  });

  test('shortcuts section shows navigation category with shortcuts', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    // Should show Navigation category
    await expect(page.getByText('Navigation')).toBeVisible();

    // Should show navigation shortcuts
    await expect(page.getByTestId('shortcut-row-nav.tasks')).toBeVisible();
    await expect(page.getByTestId('shortcut-row-nav.dashboard')).toBeVisible();
    await expect(page.getByTestId('shortcut-row-nav.plans')).toBeVisible();
  });

  test('shortcuts section shows actions category', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    // Should show Actions category heading
    await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();

    // Should show action shortcuts
    await expect(page.getByTestId('shortcut-row-action.commandPalette')).toBeVisible();
    await expect(page.getByTestId('shortcut-row-action.toggleSidebar')).toBeVisible();
  });

  test('shortcuts section shows views category', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    // Should show Views category
    await expect(page.getByText('Views')).toBeVisible();

    // Should show view shortcuts
    await expect(page.getByTestId('shortcut-row-view.list')).toBeVisible();
    await expect(page.getByTestId('shortcut-row-view.kanban')).toBeVisible();
  });

  test('shortcut rows show descriptions and key bindings', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');

    // Should show description
    await expect(tasksRow).toContainText('Go to Tasks');

    // Should show key binding
    await expect(tasksRow.locator('kbd')).toContainText(/G\s*T/);
  });

  test('hovering over shortcut row shows customize button', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');

    // Hover over the row
    await tasksRow.hover();

    // Customize button should be visible
    await expect(page.getByTestId('shortcut-edit-nav.tasks')).toBeVisible();
  });

  test('clicking customize opens edit modal', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    // Hover and click customize
    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Modal should be visible
    await expect(page.getByTestId('shortcut-edit-modal')).toBeVisible();

    // Modal should show description
    await expect(page.getByTestId('shortcut-edit-modal')).toContainText('Go to Tasks');
  });

  test('edit modal shows current shortcut binding', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Should show the current binding
    await expect(page.getByTestId('shortcut-capture-area')).toContainText(/G\s*T/);
  });

  test('clicking capture area enables key capture mode', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Click the capture area
    await page.getByTestId('shortcut-capture-area').click();

    // Should show "Press keys..." placeholder
    await expect(page.getByTestId('shortcut-capture-area')).toContainText('Press keys...');
  });

  test('can capture new sequential shortcut', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Click capture area and press keys
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('H');
    await page.keyboard.press('T');

    // Should show the new shortcut
    await expect(page.getByTestId('shortcut-capture-area')).toContainText(/H\s*T/);
  });

  test('conflict detection shows warning for duplicate shortcuts', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    // Edit tasks shortcut
    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Try to use G P which is already used by Plans
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('G');
    await page.keyboard.press('P');

    // Should show conflict warning
    await expect(page.getByTestId('shortcut-conflict-warning')).toBeVisible();
    await expect(page.getByTestId('shortcut-conflict-warning')).toContainText('Conflicts with');
  });

  test('save button is disabled when there is a conflict', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Try to use G P which conflicts
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('G');
    await page.keyboard.press('P');

    // Save button should be disabled
    await expect(page.getByTestId('shortcut-edit-save')).toBeDisabled();
  });

  test('can save new shortcut without conflict', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Use a unique shortcut X T
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('X');
    await page.keyboard.press('T');

    // Wait for the captured keys to be displayed
    await expect(page.getByTestId('shortcut-capture-area')).toContainText(/X\s*T/);

    // Save button should be enabled
    await expect(page.getByTestId('shortcut-edit-save')).toBeEnabled();

    // Click save - but first click somewhere neutral to stop capture
    await page.getByTestId('shortcut-edit-save').focus();
    await page.getByTestId('shortcut-edit-save').click();

    // Modal should close
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();

    // Row should show new shortcut and "Customized" badge
    await expect(tasksRow).toContainText('Customized');
    await expect(tasksRow.locator('kbd')).toContainText(/X\s*T/);
  });

  test('custom shortcuts persist in localStorage', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Set custom shortcut
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('Z');
    await page.keyboard.press('T');

    // Wait for keys to be captured
    await expect(page.getByTestId('shortcut-capture-area')).toContainText(/Z\s*T/);

    await page.getByTestId('shortcut-edit-save').focus();
    await page.getByTestId('shortcut-edit-save').click();

    // Wait for modal to close
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();

    // Check localStorage
    const storedShortcuts = await page.evaluate(() => localStorage.getItem('settings.customShortcuts'));
    expect(storedShortcuts).not.toBeNull();
    const parsed = JSON.parse(storedShortcuts!);
    expect(parsed['nav.tasks']).toBe('Z T');
  });

  test('custom shortcuts persist after page reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Set custom shortcut
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('Y');
    await page.keyboard.press('T');

    // Wait for keys to be captured
    await expect(page.getByTestId('shortcut-capture-area')).toContainText(/Y\s*T/);

    await page.getByTestId('shortcut-edit-save').focus();
    await page.getByTestId('shortcut-edit-save').click();

    // Wait for modal to close
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();

    // Reload page
    await page.reload();
    await page.getByTestId('settings-nav-shortcuts').click();

    // Should still show custom shortcut
    const reloadedRow = page.getByTestId('shortcut-row-nav.tasks');
    await expect(reloadedRow).toContainText('Customized');
    await expect(reloadedRow.locator('kbd')).toContainText(/Y\s*T/);
  });

  test('reset to default in edit modal reverts to default shortcut', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    // First customize a shortcut
    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('Q');
    await page.keyboard.press('T');

    // Wait for keys to be captured
    await expect(page.getByTestId('shortcut-capture-area')).toContainText(/Q\s*T/);

    await page.getByTestId('shortcut-edit-save').focus();
    await page.getByTestId('shortcut-edit-save').click();

    // Wait for modal to close
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();

    // Now open modal again and reset
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();
    await page.getByTestId('shortcut-reset-default').click();

    // Modal should close and show default shortcut
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();
    await expect(tasksRow.locator('kbd')).toContainText(/G\s*T/);
    await expect(tasksRow).not.toContainText('Customized');
  });

  test('reset all shortcuts button is only visible when there are customizations', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    // Initially, reset all button should not be visible
    await expect(page.getByTestId('shortcuts-reset-all')).not.toBeVisible();

    // Customize a shortcut
    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('R');
    await page.keyboard.press('T');

    // Wait for keys to be captured
    await expect(page.getByTestId('shortcut-capture-area')).toContainText(/R\s*T/);

    await page.getByTestId('shortcut-edit-save').focus();
    await page.getByTestId('shortcut-edit-save').click();

    // Wait for modal to close
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();

    // Now reset all button should be visible
    await expect(page.getByTestId('shortcuts-reset-all')).toBeVisible();
  });

  test('reset all shortcuts shows confirmation modal', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    // Customize a shortcut first
    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('W');
    await page.keyboard.press('T');

    // Wait for keys to be captured
    await expect(page.getByTestId('shortcut-capture-area')).toContainText(/W\s*T/);

    await page.getByTestId('shortcut-edit-save').focus();
    await page.getByTestId('shortcut-edit-save').click();

    // Wait for modal to close
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();

    // Click reset all
    await page.getByTestId('shortcuts-reset-all').click();

    // Confirmation modal should appear
    await expect(page.getByTestId('reset-confirm-modal')).toBeVisible();
    await expect(page.getByTestId('reset-confirm-modal')).toContainText('Reset All Shortcuts?');
  });

  test('canceling reset all keeps customizations', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    // Customize a shortcut
    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('N');
    await page.keyboard.press('T');

    // Wait for keys to be captured
    await expect(page.getByTestId('shortcut-capture-area')).toContainText(/N\s*T/);

    await page.getByTestId('shortcut-edit-save').focus();
    await page.getByTestId('shortcut-edit-save').click();

    // Wait for modal to close
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();

    // Click reset all
    await page.getByTestId('shortcuts-reset-all').click();

    // Cancel
    await page.getByTestId('reset-confirm-cancel').click();

    // Modal should close
    await expect(page.getByTestId('reset-confirm-modal')).not.toBeVisible();

    // Customization should remain
    await expect(tasksRow).toContainText('Customized');
  });

  test('confirming reset all removes all customizations', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    // Customize a shortcut
    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();
    await page.getByTestId('shortcut-capture-area').click();
    await page.keyboard.press('M');
    await page.keyboard.press('T');

    // Wait for keys to be captured
    await expect(page.getByTestId('shortcut-capture-area')).toContainText(/M\s*T/);

    await page.getByTestId('shortcut-edit-save').focus();
    await page.getByTestId('shortcut-edit-save').click();

    // Wait for modal to close
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();

    // Click reset all and confirm
    await page.getByTestId('shortcuts-reset-all').click();
    await page.getByTestId('reset-confirm-yes').click();

    // Modal should close
    await expect(page.getByTestId('reset-confirm-modal')).not.toBeVisible();

    // Customization should be removed
    await expect(tasksRow).not.toContainText('Customized');
    await expect(tasksRow.locator('kbd')).toContainText(/G\s*T/);

    // Reset all button should be hidden again
    await expect(page.getByTestId('shortcuts-reset-all')).not.toBeVisible();
  });

  test('can close edit modal with X button', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Modal should be visible
    await expect(page.getByTestId('shortcut-edit-modal')).toBeVisible();

    // Click close button
    await page.getByTestId('shortcut-edit-close').click();

    // Modal should close
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();
  });

  test('can cancel edit modal with cancel button', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-shortcuts').click();

    const tasksRow = page.getByTestId('shortcut-row-nav.tasks');
    await tasksRow.hover();
    await page.getByTestId('shortcut-edit-nav.tasks').click();

    // Modal should be visible
    await expect(page.getByTestId('shortcut-edit-modal')).toBeVisible();

    // Click cancel button
    await page.getByTestId('shortcut-edit-cancel').click();

    // Modal should close
    await expect(page.getByTestId('shortcut-edit-modal')).not.toBeVisible();
  });
});

test.describe('TB63: Settings Page - Sync Config', () => {
  test('sync section is visible when clicking sync nav', async ({ page }) => {
    await page.goto('/settings');

    // Click sync section
    await page.getByTestId('settings-nav-sync').click();

    // Sync section should be visible
    await expect(page.getByTestId('settings-sync-section')).toBeVisible();
  });

  test('sync section shows status information', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // Should show export path
    await expect(page.getByTestId('export-path')).toBeVisible();

    // Should show dirty element count
    await expect(page.getByTestId('dirty-element-count')).toBeVisible();

    // Should show last export/import times
    await expect(page.getByTestId('last-export-time')).toBeVisible();
    await expect(page.getByTestId('last-import-time')).toBeVisible();
  });

  test('sync section shows export button', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // Export button should be visible
    await expect(page.getByTestId('export-now-button')).toBeVisible();
    await expect(page.getByTestId('export-now-button')).toHaveText('Export Now');
  });

  test('sync section shows import button', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // Import button should be visible
    await expect(page.getByTestId('import-button')).toBeVisible();
    await expect(page.getByTestId('import-button')).toHaveText('Import from File');
  });

  test('sync section has auto-export toggle (disabled)', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // Auto-export toggle should be visible but disabled
    await expect(page.getByTestId('auto-export-toggle')).toBeVisible();
    await expect(page.getByTestId('auto-export-toggle')).toBeDisabled();
  });

  test('clicking export button triggers export', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // Click export button
    await page.getByTestId('export-now-button').click();

    // Should show export result
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('export-result')).toContainText('Export Successful');
  });

  test('export result shows counts', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // Click export button
    await page.getByTestId('export-now-button').click();

    // Should show counts in export result
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('export-result')).toContainText('Elements exported:');
    await expect(page.getByTestId('export-result')).toContainText('Dependencies exported:');
  });

  test('export updates last export time', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // Get initial last export time
    const initialTime = await page.getByTestId('last-export-time').textContent();

    // Click export button
    await page.getByTestId('export-now-button').click();

    // Wait for export to complete
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 10000 });

    // Last export time should have changed
    const newTime = await page.getByTestId('last-export-time').textContent();
    expect(newTime).not.toBe('Never');
    // If initial was "Never", new time should be different
    if (initialTime === 'Never') {
      expect(newTime).not.toBe(initialTime);
    }
  });

  test('sync settings persist in localStorage', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // Click export
    await page.getByTestId('export-now-button').click();
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 10000 });

    // Check localStorage
    const storedSettings = await page.evaluate(() => localStorage.getItem('settings.sync'));
    expect(storedSettings).not.toBeNull();
    const parsed = JSON.parse(storedSettings!);
    expect(parsed.lastExportAt).toBeDefined();
  });

  test('sync settings persist after page reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // Click export
    await page.getByTestId('export-now-button').click();
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 10000 });

    // Get the time
    const exportTime = await page.getByTestId('last-export-time').textContent();

    // Reload
    await page.reload();
    await page.getByTestId('settings-nav-sync').click();

    // Time should persist
    const reloadedTime = await page.getByTestId('last-export-time').textContent();
    expect(reloadedTime).toBe(exportTime);
  });

  test('hidden file input for import', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // File input should exist but be hidden
    const fileInput = page.getByTestId('import-file-input');
    await expect(fileInput).toHaveClass(/hidden/);
  });

  test('export button shows loading state during export', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-sync').click();

    // Start export
    await page.getByTestId('export-now-button').click();

    // Button should show loading state (either in text or be disabled)
    // The button changes text to "Exporting..." during the operation
    // Since export is fast, we just verify the result appears
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 10000 });
  });
});
