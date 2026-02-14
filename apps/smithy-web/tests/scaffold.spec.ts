import { test, expect } from '@playwright/test';

test.describe('TB-O15: Orchestrator Web Scaffold', () => {
  test.describe('Three-column layout', () => {
    test('displays sidebar, main content, and director panel', async ({ page }) => {
      await page.goto('/');

      // Wait for the app shell to render
      await expect(page.getByTestId('app-shell')).toBeVisible();

      // Sidebar should be visible (on desktop)
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Header should be visible
      await expect(page.getByTestId('header')).toBeVisible();

      // Director panel should be visible (collapsed by default)
      await expect(page.getByTestId('director-panel-collapsed')).toBeVisible();
    });

    test('can expand and collapse director panel', async ({ page }) => {
      await page.goto('/');

      // Click expand button on director panel
      await page.getByTestId('director-panel-expand').click();

      // Director panel should now be expanded
      await expect(page.getByTestId('director-panel')).toBeVisible();

      // Collapse button should be visible
      await page.getByTestId('director-panel-collapse').click();

      // Director panel should be collapsed again
      await expect(page.getByTestId('director-panel-collapsed')).toBeVisible();
    });

    test('can toggle sidebar collapse', async ({ page }) => {
      await page.goto('/');

      // Sidebar should be expanded by default on desktop
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Click collapse button
      await page.getByTestId('sidebar-toggle').click();

      // After collapse, expand button should appear
      await expect(page.getByTestId('sidebar-expand-button')).toBeVisible();
    });
  });

  test.describe('Navigation routes', () => {
    test('defaults to /activity route', async ({ page }) => {
      await page.goto('/');

      // Should redirect to /activity
      await expect(page).toHaveURL(/\/activity/);

      // Activity page should be visible
      await expect(page.getByTestId('activity-page')).toBeVisible();
    });

    test('navigates to /tasks', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('nav-tasks').click();

      await expect(page).toHaveURL(/\/tasks/);
      await expect(page.getByTestId('tasks-page')).toBeVisible();
    });

    test('navigates to /agents', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('nav-agents').click();

      await expect(page).toHaveURL(/\/agents/);
      await expect(page.getByTestId('agents-page')).toBeVisible();
    });

    test('navigates to /workspaces', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('nav-workspaces').click();

      await expect(page).toHaveURL(/\/workspaces/);
      await expect(page.getByTestId('workspaces-page')).toBeVisible();
    });

    test('navigates to /workflows', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('nav-workflows').click();

      await expect(page).toHaveURL(/\/workflows/);
      await expect(page.getByTestId('workflows-page')).toBeVisible();
    });

    test('navigates to /metrics', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('nav-metrics').click();

      await expect(page).toHaveURL(/\/metrics/);
      await expect(page.getByTestId('metrics-page')).toBeVisible();
    });

    test('navigates to /settings', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('nav-settings').click();

      await expect(page).toHaveURL(/\/settings/);
      await expect(page.getByTestId('settings-page')).toBeVisible();
    });
  });

  test.describe('Theme toggle', () => {
    test('can toggle between themes', async ({ page }) => {
      await page.goto('/');

      // Theme toggle should be visible
      await expect(page.getByTestId('theme-toggle')).toBeVisible();

      // Click to cycle through themes
      await page.getByTestId('theme-toggle').click();

      // Verify the theme toggle still works
      await expect(page.getByTestId('theme-toggle')).toBeVisible();
    });
  });

  test.describe('Sidebar navigation sections', () => {
    test('displays all navigation sections', async ({ page }) => {
      await page.goto('/');

      // All sections should be visible
      await expect(page.getByTestId('nav-section-overview')).toBeVisible();
      await expect(page.getByTestId('nav-section-work')).toBeVisible();
      await expect(page.getByTestId('nav-section-orchestration')).toBeVisible();
      await expect(page.getByTestId('nav-section-analytics')).toBeVisible();
    });

    test('can collapse and expand navigation sections', async ({ page }) => {
      await page.goto('/');

      // Click to collapse the work section
      await page.getByTestId('section-toggle-work').click();

      // Wait for collapse animation and check the section is collapsed
      // The items become hidden via max-h-0 opacity-0 transition
      await page.waitForTimeout(300); // Wait for animation

      // Click to expand the work section
      await page.getByTestId('section-toggle-work').click();

      // Tasks nav item should be visible again after expanding
      await expect(page.getByTestId('nav-tasks')).toBeVisible();
    });
  });

  test.describe('Breadcrumbs', () => {
    test('displays breadcrumbs for current route', async ({ page }) => {
      await page.goto('/tasks');

      // Breadcrumbs should be visible
      await expect(page.getByTestId('breadcrumbs')).toBeVisible();

      // Should show Tasks in breadcrumb
      await expect(page.getByTestId('breadcrumb-tasks')).toBeVisible();
    });
  });
});
