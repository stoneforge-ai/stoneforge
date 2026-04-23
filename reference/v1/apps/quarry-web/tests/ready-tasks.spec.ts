import { test, expect } from '@playwright/test';

test.describe('TB3: Ready Tasks List', () => {
  test('ready tasks endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/tasks/ready');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('ready tasks section is displayed', async ({ page }) => {
    await page.goto('/');
    // Wait for the ready tasks section heading to appear (the list heading, not the stats card)
    await expect(page.getByRole('heading', { name: 'Ready Tasks' }).nth(1)).toBeVisible({ timeout: 10000 });
  });

  test('ready tasks list shows empty state when no tasks', async ({ page }) => {
    // First, get tasks from the API to check if we should expect tasks or empty state
    const response = await page.request.get('/api/tasks/ready');
    const tasks = await response.json();

    await page.goto('/');
    // Wait for the page to load
    await expect(page.getByText('System Overview')).toBeVisible();

    // Wait for ready tasks to load (no more loading text)
    await expect(page.getByText('Loading ready tasks...')).not.toBeVisible({ timeout: 10000 });

    if (tasks.length === 0) {
      // Should show empty state message
      await expect(page.getByText('No ready tasks available')).toBeVisible();
    } else {
      // Should not show empty state message when tasks exist
      await expect(page.getByText('No ready tasks available')).not.toBeVisible();
    }
  });

  test('task cards display correct information when tasks exist', async ({ page }) => {
    // First, get tasks from the API
    const response = await page.request.get('/api/tasks/ready');
    const tasks = await response.json();

    if (tasks.length === 0) {
      // Skip this test if there are no tasks
      test.skip();
      return;
    }

    await page.goto('/');
    // Wait for the ready tasks section
    await expect(page.getByRole('heading', { name: 'Ready Tasks' }).nth(1)).toBeVisible({ timeout: 10000 });

    // Wait for tasks to load
    await expect(page.getByText('Loading ready tasks...')).not.toBeVisible({ timeout: 10000 });

    // Check that the first task's title is displayed
    const firstTask = tasks[0];
    // Use first() to handle cases where title might match multiple elements
    await expect(page.getByText(firstTask.title).first()).toBeVisible();

    // Check that the task ID is displayed (IDs are unique so no need for first())
    await expect(page.getByText(firstTask.id)).toBeVisible();
  });
});
