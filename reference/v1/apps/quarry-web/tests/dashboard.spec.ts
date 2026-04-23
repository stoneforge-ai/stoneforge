import { test, expect } from '@playwright/test';

test.describe('TB41: Dashboard Overview Panel', () => {
  test('dashboard page is accessible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });
  });

  test('dashboard shows metrics overview', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('metrics-overview')).toBeVisible();
  });

  test('metrics overview shows total tasks card', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('metric-total-tasks')).toBeVisible();
    await expect(page.getByText('Total Tasks')).toBeVisible();
  });

  test('metrics overview shows ready vs blocked ratio', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('metric-ready-ratio')).toBeVisible();
    await expect(page.getByText('Ready vs Blocked')).toBeVisible();
  });

  test('metrics overview shows active agents count', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('metric-active-agents')).toBeVisible();
    await expect(page.getByText('Active Agents')).toBeVisible();
  });

  test('metrics overview shows completed today count', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('metric-completed-today')).toBeVisible();
    await expect(page.getByText('Completed Today')).toBeVisible();
  });

  test('dashboard shows quick actions section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('quick-actions')).toBeVisible();
  });

  test('quick actions has create task button', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('quick-action-create-task')).toBeVisible();
    await expect(page.getByTestId('quick-action-create-task')).toHaveText(/Create Task/);
  });

  test('quick actions has create workflow button', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('quick-action-create-workflow')).toBeVisible();
    await expect(page.getByTestId('quick-action-create-workflow')).toHaveText(/Create Workflow/);
  });

  test('quick actions has view ready tasks button', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('quick-action-view-tasks')).toBeVisible();
    await expect(page.getByTestId('quick-action-view-tasks')).toHaveText(/View Ready Tasks/);
  });

  test('create task quick action opens modal (TB77)', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('quick-action-create-task').click();

    // Should stay on dashboard and show modal
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('create-task-modal')).toBeVisible();
  });

  test('create workflow quick action opens modal (TB77)', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('quick-action-create-workflow').click();

    // Should stay on dashboard and show modal
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible();
  });

  test('dashboard shows recent activity section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('recent-activity')).toBeVisible();
    await expect(page.getByText('Recent Activity')).toBeVisible();
  });

  test('recent activity shows activity list when events exist', async ({ page }) => {
    // First check if there are any events
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    if (events.length > 0) {
      await expect(page.getByTestId('activity-list')).toBeVisible({ timeout: 10000 });
    } else {
      await expect(page.getByText('No recent activity')).toBeVisible();
    }
  });

  test('activity items show event type and element type', async ({ page }) => {
    // First check if there are any events
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('activity-list')).toBeVisible({ timeout: 10000 });

    // Check first activity item
    const firstEvent = events[0];
    await expect(page.getByTestId(`activity-item-${firstEvent.id}`)).toBeVisible();
  });

  test('view all link in recent activity navigates to timeline', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('recent-activity')).toBeVisible();

    // Click view all link
    await page.getByTestId('recent-activity').getByText('View all').click();
    await expect(page).toHaveURL(/\/dashboard\/timeline/);
  });

  test('stats API endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/stats');
    expect(response.ok()).toBe(true);
    const stats = await response.json();
    expect(typeof stats.totalElements).toBe('number');
    expect(typeof stats.readyTasks).toBe('number');
    expect(typeof stats.blockedTasks).toBe('number');
  });

  test('events API endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    expect(response.ok()).toBe(true);
    const events = await response.json();
    expect(Array.isArray(events)).toBe(true);
  });

  test('metrics cards show numeric values', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('metrics-overview')).toBeVisible();

    // Wait for metrics to load (values should not be "...")
    await page.waitForTimeout(1000);

    // Check that at least one metric has loaded (shows a number or percentage)
    const metricsOverview = page.getByTestId('metrics-overview');
    await expect(metricsOverview).toContainText(/\d+/);
  });
});
