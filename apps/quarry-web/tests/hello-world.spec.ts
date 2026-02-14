import { test, expect } from '@playwright/test';

test.describe('TB1: Hello World Full Stack', () => {
  test('page loads and shows Stoneforge title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Stoneforge');
    // Stoneforge text is in the sidebar
    await expect(page.getByTestId('sidebar').getByText('Stoneforge')).toBeVisible();
  });

  test('connection status shows Live', async ({ page }) => {
    await page.goto('/');
    // Wait for the WebSocket connection to establish
    await expect(page.getByText('Live')).toBeVisible({ timeout: 10000 });
  });

  test('health endpoint is accessible via proxy', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
    expect(data.database).toBeDefined();
  });

  test('stats endpoint is accessible via proxy', async ({ page }) => {
    const response = await page.request.get('/api/stats');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(typeof data.totalElements).toBe('number');
    expect(typeof data.readyTasks).toBe('number');
    expect(typeof data.blockedTasks).toBe('number');
    expect(data.computedAt).toBeDefined();
  });

  test('stats cards display on the page', async ({ page }) => {
    await page.goto('/');
    // Wait for stats to load
    await expect(page.getByText('System Overview')).toBeVisible();
    await expect(page.getByText('Total Elements')).toBeVisible({ timeout: 10000 });
    // Use the stats card "Ready Tasks" heading (uppercase) - the first one
    await expect(page.getByRole('heading', { name: 'Ready Tasks' }).first()).toBeVisible();
    await expect(page.getByText('Blocked Tasks')).toBeVisible();
    await expect(page.getByText('Total Events')).toBeVisible();
  });

  test('server info section displays database path', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Server Info')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Database')).toBeVisible();
    await expect(page.getByText(/\.stoneforge\/stoneforge\.db/)).toBeVisible();
  });
});
