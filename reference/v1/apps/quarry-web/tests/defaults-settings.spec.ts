import { test, expect } from '@playwright/test';

test.describe('TB61: Settings Page - Default Views', () => {
  test.beforeEach(async ({ page }) => {
    // Clear defaults before each test
    await page.goto('/settings');
    await page.evaluate(() => {
      localStorage.removeItem('settings.defaults');
      localStorage.removeItem('tasks.viewMode');
    });
  });

  test('defaults section is visible when clicking defaults nav', async ({ page }) => {
    await page.goto('/settings');

    // Click defaults section
    await page.getByTestId('settings-nav-defaults').click();

    // Defaults section should be visible
    await expect(page.getByTestId('settings-defaults-section')).toBeVisible();
  });

  test('defaults section shows tasks view options', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // Both view options should be visible
    await expect(page.getByTestId('default-tasks-view-list')).toBeVisible();
    await expect(page.getByTestId('default-tasks-view-kanban')).toBeVisible();
  });

  test('defaults section shows dashboard lens options', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // All lens options should be visible
    await expect(page.getByTestId('default-dashboard-lens-overview')).toBeVisible();
    await expect(page.getByTestId('default-dashboard-lens-task-flow')).toBeVisible();
    await expect(page.getByTestId('default-dashboard-lens-agents')).toBeVisible();
    await expect(page.getByTestId('default-dashboard-lens-dependencies')).toBeVisible();
    await expect(page.getByTestId('default-dashboard-lens-timeline')).toBeVisible();
  });

  test('defaults section shows sort order options', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // All sort options should be visible
    await expect(page.getByTestId('default-sort-updated')).toBeVisible();
    await expect(page.getByTestId('default-sort-created')).toBeVisible();
    await expect(page.getByTestId('default-sort-priority')).toBeVisible();
    await expect(page.getByTestId('default-sort-title')).toBeVisible();
  });

  test('can select kanban as default tasks view', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // Click kanban option
    await page.getByTestId('default-tasks-view-kanban').click();

    // Should show checkmark (active state)
    const kanbanOption = page.getByTestId('default-tasks-view-kanban');
    await expect(kanbanOption.locator('svg.text-blue-500')).toBeVisible();
  });

  test('can select list as default tasks view', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // First select kanban
    await page.getByTestId('default-tasks-view-kanban').click();

    // Then select list
    await page.getByTestId('default-tasks-view-list').click();

    // List should have checkmark
    const listOption = page.getByTestId('default-tasks-view-list');
    await expect(listOption.locator('svg.text-blue-500')).toBeVisible();
  });

  test('tasks view preference is stored in localStorage', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // Select kanban
    await page.getByTestId('default-tasks-view-kanban').click();

    // Check localStorage for settings.defaults
    const stored = await page.evaluate(() => localStorage.getItem('settings.defaults'));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.tasksView).toBe('kanban');

    // Also check tasks.viewMode is synced
    const viewMode = await page.evaluate(() => localStorage.getItem('tasks.viewMode'));
    expect(viewMode).toBe('kanban');
  });

  test('can select dashboard lens preference', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // Select task-flow lens
    await page.getByTestId('default-dashboard-lens-task-flow').click();

    // Should show checkmark
    const taskFlowOption = page.getByTestId('default-dashboard-lens-task-flow');
    await expect(taskFlowOption.locator('svg.text-blue-500')).toBeVisible();

    // Check localStorage
    const stored = await page.evaluate(() => localStorage.getItem('settings.defaults'));
    const parsed = JSON.parse(stored!);
    expect(parsed.dashboardLens).toBe('task-flow');
  });

  test('can select sort order preference', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // Select priority sort
    await page.getByTestId('default-sort-priority').click();

    // Should show checkmark
    const priorityOption = page.getByTestId('default-sort-priority');
    await expect(priorityOption.locator('svg.text-blue-500')).toBeVisible();

    // Check localStorage
    const stored = await page.evaluate(() => localStorage.getItem('settings.defaults'));
    const parsed = JSON.parse(stored!);
    expect(parsed.sortOrder).toBe('priority');
  });

  test('settings persist after page refresh', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // Make selections
    await page.getByTestId('default-tasks-view-kanban').click();
    await page.getByTestId('default-dashboard-lens-agents').click();
    await page.getByTestId('default-sort-created').click();

    // Refresh page
    await page.reload();
    await page.getByTestId('settings-nav-defaults').click();

    // Selections should persist
    await expect(page.getByTestId('default-tasks-view-kanban').locator('svg.text-blue-500')).toBeVisible();
    await expect(page.getByTestId('default-dashboard-lens-agents').locator('svg.text-blue-500')).toBeVisible();
    await expect(page.getByTestId('default-sort-created').locator('svg.text-blue-500')).toBeVisible();
  });

  test('tasks page respects default tasks view setting', async ({ page }) => {
    // Set default to kanban via settings
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();
    await page.getByTestId('default-tasks-view-kanban').click();

    // Navigate to tasks page
    await page.getByTestId('nav-tasks').click();
    await expect(page).toHaveURL(/\/tasks/);

    // Kanban view should be active
    await expect(page.getByTestId('kanban-board')).toBeVisible();
  });

  test('tasks page respects default list view setting', async ({ page }) => {
    // Set default to list via settings
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();
    await page.getByTestId('default-tasks-view-list').click();

    // Navigate to tasks page
    await page.getByTestId('nav-tasks').click();
    await expect(page).toHaveURL(/\/tasks/);

    // List view should be active (tasks-list-view visible, kanban not)
    await expect(page.getByTestId('tasks-list-view')).toBeVisible();
  });

  test('navigating to root respects dashboard lens preference', async ({ page }) => {
    // Set default lens to task-flow
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();
    await page.getByTestId('default-dashboard-lens-task-flow').click();

    // Navigate to root
    await page.goto('/');

    // Should redirect to task-flow lens
    await expect(page).toHaveURL(/\/dashboard\/task-flow/);
  });

  test('navigating to root with agents lens preference', async ({ page }) => {
    // Set default lens to agents
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();
    await page.getByTestId('default-dashboard-lens-agents').click();

    // Navigate to root
    await page.goto('/');

    // Should redirect to agents lens
    await expect(page).toHaveURL(/\/dashboard\/agents/);
  });

  test('navigating to root with overview lens preference', async ({ page }) => {
    // Set default lens to overview
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();
    await page.getByTestId('default-dashboard-lens-overview').click();

    // Navigate to root
    await page.goto('/');

    // Should redirect to dashboard (overview)
    await expect(page).toHaveURL('/dashboard');
  });

  test('defaults nav item no longer shows Soon badge', async ({ page }) => {
    await page.goto('/settings');

    // Defaults nav should not have "Soon" text since it's implemented
    const defaultsNav = page.getByTestId('settings-nav-defaults');
    await expect(defaultsNav).not.toContainText('Soon');
  });

  test('sync still shows coming soon', async ({ page }) => {
    await page.goto('/settings');

    // Click sync section - still coming soon
    await page.getByTestId('settings-nav-sync').click();
    await expect(page.getByTestId('settings-sync-section')).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();
  });

  test('notifications section is now implemented', async ({ page }) => {
    await page.goto('/settings');

    // Click notifications section - now implemented
    await page.getByTestId('settings-nav-notifications').click();
    await expect(page.getByTestId('settings-notifications-section')).toBeVisible();
    // Should have notification settings, not "coming soon"
    await expect(page.getByTestId('notification-task-assigned')).toBeVisible();
  });

  test('all options have descriptive text', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // Check tasks view descriptions
    await expect(page.getByTestId('default-tasks-view-list')).toContainText('Traditional list layout');
    await expect(page.getByTestId('default-tasks-view-kanban')).toContainText('Drag-and-drop board');

    // Check dashboard lens descriptions
    await expect(page.getByTestId('default-dashboard-lens-overview')).toContainText('Key metrics');
    await expect(page.getByTestId('default-dashboard-lens-task-flow')).toContainText('Ready, blocked');
    await expect(page.getByTestId('default-dashboard-lens-agents')).toContainText('Agent workload');
    await expect(page.getByTestId('default-dashboard-lens-dependencies')).toContainText('Visual dependency');
    await expect(page.getByTestId('default-dashboard-lens-timeline')).toContainText('Chronological event');

    // Check sort order descriptions
    await expect(page.getByTestId('default-sort-updated')).toContainText('Most recently modified');
    await expect(page.getByTestId('default-sort-created')).toContainText('Newest items');
    await expect(page.getByTestId('default-sort-priority')).toContainText('Highest priority');
    await expect(page.getByTestId('default-sort-title')).toContainText('Alphabetical');
  });

  test('changing settings updates immediately without needing refresh', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // Select kanban
    await page.getByTestId('default-tasks-view-kanban').click();

    // Immediately verify kanban is selected (has checkmark)
    await expect(page.getByTestId('default-tasks-view-kanban').locator('svg.text-blue-500')).toBeVisible();

    // List should not have checkmark
    await expect(page.getByTestId('default-tasks-view-list').locator('svg.text-blue-500')).not.toBeVisible();
  });

  test('multiple settings can be changed in sequence', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-nav-defaults').click();

    // Change all settings
    await page.getByTestId('default-tasks-view-kanban').click();
    await page.getByTestId('default-dashboard-lens-timeline').click();
    await page.getByTestId('default-sort-title').click();

    // All should be stored correctly
    const stored = await page.evaluate(() => localStorage.getItem('settings.defaults'));
    const parsed = JSON.parse(stored!);

    expect(parsed.tasksView).toBe('kanban');
    expect(parsed.dashboardLens).toBe('timeline');
    expect(parsed.sortOrder).toBe('title');
  });
});
