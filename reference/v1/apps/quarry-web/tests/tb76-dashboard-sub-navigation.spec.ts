import { test, expect } from '@playwright/test';

test.describe('TB76: Dashboard Sub-Section Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test for clean state
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test('dashboard lenses are displayed as sub-items in sidebar', async ({ page }) => {
    await page.goto('/dashboard/overview');

    // All dashboard lenses should be visible in sidebar
    await expect(page.getByTestId('nav-dashboard')).toBeVisible(); // Overview
    await expect(page.getByTestId('nav-task-flow')).toBeVisible();
    await expect(page.getByTestId('nav-timeline')).toBeVisible();
  });

  test('dashboard section is collapsible', async ({ page }) => {
    await page.goto('/dashboard/overview');

    // Dashboard section should exist
    const dashboardSection = page.getByTestId('nav-section-dashboard');
    await expect(dashboardSection).toBeVisible();

    // Dashboard items should be visible initially (defaultExpanded: true)
    await expect(page.getByTestId('nav-dashboard')).toBeVisible();
    await expect(page.getByTestId('nav-task-flow')).toBeVisible();

    // Click section toggle to collapse
    const toggleButton = page.getByTestId('section-toggle-dashboard');
    await toggleButton.click();

    // Wait for animation to complete
    await page.waitForTimeout(300);

    // The container should have max-h-0 class when collapsed
    // We check if the CSS class is present
    const itemsContainer = dashboardSection.locator('div').filter({ has: page.getByTestId('nav-dashboard') });
    await expect(itemsContainer).toHaveClass(/max-h-0/);

    // Click again to expand
    await toggleButton.click();

    // Wait for animation
    await page.waitForTimeout(300);

    // Container should have max-h-96 class when expanded
    await expect(itemsContainer).toHaveClass(/max-h-96/);
  });

  test('each dashboard lens is a full-height view (routes work)', async ({ page }) => {
    // Test Overview
    await page.goto('/dashboard/overview');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    // Test Task Flow
    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible();

    // Test Timeline
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible();
  });

  test('/dashboard redirects to last visited section when pre-set', async ({ page }) => {
    // Pre-set last visited in localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem('dashboard.lastVisited', 'task-flow');
    });

    // Navigate to /dashboard - should go to last visited (task-flow)
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/task-flow/);
    await expect(page.getByTestId('task-flow-page')).toBeVisible();
  });

  test('/dashboard redirects to overview when no last visited set', async ({ page }) => {
    // First visit - should go to user's default dashboard lens (overview if not set)
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/overview/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('root URL redirects to dashboard section', async ({ page }) => {
    // With clean localStorage, should redirect to default (overview)
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('last visited dashboard section is persisted in localStorage', async ({ page }) => {
    // Visit task-flow
    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible();
    await page.waitForTimeout(500);

    // Check localStorage
    const lastVisited = await page.evaluate(() => {
      return localStorage.getItem('dashboard.lastVisited');
    });
    expect(lastVisited).toBe('task-flow');

    // Visit timeline
    await page.goto('/dashboard/timeline?page=1&limit=100');
    await expect(page.getByTestId('timeline-page')).toBeVisible();
    await page.waitForTimeout(500);

    // Check localStorage updated
    const newLastVisited = await page.evaluate(() => {
      return localStorage.getItem('dashboard.lastVisited');
    });
    expect(newLastVisited).toBe('timeline');
  });

  test('navigating between dashboard sections via sidebar works', async ({ page }) => {
    await page.goto('/dashboard/overview');

    // Click Task Flow in sidebar
    await page.getByTestId('nav-task-flow').click();
    await expect(page).toHaveURL(/\/dashboard\/task-flow/);
    await expect(page.getByTestId('task-flow-page')).toBeVisible();

    // Active indicator should be on Task Flow
    const taskFlowLink = page.getByTestId('nav-task-flow');
    await expect(taskFlowLink).toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);

    // Click Timeline
    await page.getByTestId('nav-timeline').click();
    await expect(page).toHaveURL(/\/dashboard\/timeline/);
    await expect(page.getByTestId('timeline-page')).toBeVisible();

    // Click Overview
    await page.getByTestId('nav-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard\/overview/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('G H keyboard shortcut navigates to dashboard overview', async ({ page }) => {
    await page.goto('/tasks'); // Start from non-dashboard page
    await expect(page.getByTestId('tasks-page')).toBeVisible();

    // G H should go to dashboard overview
    await page.keyboard.press('g');
    await page.keyboard.press('h');
    await expect(page).toHaveURL(/\/dashboard\/overview/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('active indicator shows correctly for each dashboard section', async ({ page }) => {
    // Test Overview active
    await page.goto('/dashboard/overview');
    await expect(page.getByTestId('nav-dashboard')).toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);
    await expect(page.getByTestId('nav-task-flow')).not.toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);

    // Test Task Flow active
    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('nav-task-flow')).toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);
    await expect(page.getByTestId('nav-dashboard')).not.toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);

    // Test Timeline active
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('nav-timeline')).toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);
  });

  test('browser back/forward navigation works with dashboard sections', async ({ page }) => {
    await page.goto('/dashboard/overview');

    // Navigate to task-flow via sidebar
    await page.getByTestId('nav-task-flow').click();
    await expect(page).toHaveURL(/\/dashboard\/task-flow/);

    // Navigate to timeline
    await page.getByTestId('nav-timeline').click();
    await expect(page).toHaveURL(/\/dashboard\/timeline/);

    // Go back to task-flow
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/task-flow/);
    await expect(page.getByTestId('task-flow-page')).toBeVisible();

    // Go back to overview
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/overview/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    // Go forward to task-flow
    await page.goForward();
    await expect(page).toHaveURL(/\/dashboard\/task-flow/);
    await expect(page.getByTestId('task-flow-page')).toBeVisible();
  });

  test('settings default dashboard lens is respected', async ({ page }) => {
    // Set default dashboard lens to 'timeline' in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('settings.defaults', JSON.stringify({
        tasksView: 'list',
        dashboardLens: 'timeline',
        sortOrder: 'created_at'
      }));
    });

    // Navigate to root - should go to timeline (the default)
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard\/timeline/);
    await expect(page.getByTestId('timeline-page')).toBeVisible();
  });

  test('last visited section takes precedence over default lens', async ({ page }) => {
    // Set default dashboard lens to 'overview' and last visited to 'timeline'
    await page.addInitScript(() => {
      localStorage.setItem('settings.defaults', JSON.stringify({
        tasksView: 'list',
        dashboardLens: 'overview',
        sortOrder: 'created_at'
      }));
      localStorage.setItem('dashboard.lastVisited', 'timeline');
    });

    // Navigate to /dashboard - should go to timeline (last visited)
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/timeline/);
    await expect(page.getByTestId('timeline-page')).toBeVisible();
  });
});
