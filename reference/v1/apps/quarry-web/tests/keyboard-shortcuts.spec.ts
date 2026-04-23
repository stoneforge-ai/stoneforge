import { test, expect } from '@playwright/test';

test.describe('Keyboard Shortcuts', () => {
  test.describe('Sequential Navigation Shortcuts', () => {
    test('G T navigates to Tasks page', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Press G then T in sequence
      await page.keyboard.press('g');
      await page.keyboard.press('t');

      // Should navigate to tasks page
      await expect(page).toHaveURL(/\/tasks/);
      await expect(page.getByTestId('tasks-page')).toBeVisible();
    });

    test('G P navigates to Plans page', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Press G then P in sequence
      await page.keyboard.press('g');
      await page.keyboard.press('p');

      // Should navigate to plans page
      await expect(page).toHaveURL(/\/plans/);
      await expect(page.getByTestId('plans-page')).toBeVisible();
    });

    test('G W navigates to Workflows page', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Press G then W in sequence
      await page.keyboard.press('g');
      await page.keyboard.press('w');

      // Should navigate to workflows page
      await expect(page).toHaveURL(/\/workflows/);
      await expect(page.getByTestId('workflows-page')).toBeVisible();
    });

    test('G M navigates to Messages page', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Press G then M in sequence
      await page.keyboard.press('g');
      await page.keyboard.press('m');

      // Should navigate to messages page
      await expect(page).toHaveURL(/\/messages/);
      await expect(page.getByTestId('messages-page')).toBeVisible();
    });

    test('G D navigates to Documents page', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Press G then D in sequence
      await page.keyboard.press('g');
      await page.keyboard.press('d');

      // Should navigate to documents page
      await expect(page).toHaveURL(/\/documents/);
      await expect(page.getByTestId('documents-page')).toBeVisible();
    });

    test('G H navigates to Dashboard Overview page', async ({ page }) => {
      await page.goto('/tasks');
      await expect(page.getByTestId('tasks-page')).toBeVisible();

      // Press G then H in sequence
      await page.keyboard.press('g');
      await page.keyboard.press('h');

      // Should navigate to dashboard overview page
      await expect(page).toHaveURL(/\/dashboard\/overview/);
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('G F navigates to Task Flow page', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Press G then F in sequence
      await page.keyboard.press('g');
      await page.keyboard.press('f');

      // Should navigate to task flow page
      await expect(page).toHaveURL(/\/dashboard\/task-flow/);
      await expect(page.getByTestId('task-flow-page')).toBeVisible();
    });

    test('G L navigates to Timeline page', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Press G then L in sequence
      await page.keyboard.press('g');
      await page.keyboard.press('l');

      // Should navigate to timeline page
      await expect(page).toHaveURL(/\/dashboard\/timeline/);
      await expect(page.getByTestId('timeline-page')).toBeVisible();
    });

    test('G G navigates to Dependencies page', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Press G then G in sequence
      await page.keyboard.press('g');
      await page.keyboard.press('g');

      // Should navigate to dependencies page
      await expect(page).toHaveURL(/\/dependencies/);
      await expect(page.getByTestId('dependency-graph-page')).toBeVisible();
    });
  });

  test.describe('Shortcut Edge Cases', () => {
    test('shortcuts do not trigger when typing in input fields', async ({ page }) => {
      await page.goto('/tasks');
      await expect(page.getByTestId('tasks-page')).toBeVisible();

      // Open create task modal
      await page.getByTestId('create-task-button').click();
      await expect(page.getByTestId('create-task-modal')).toBeVisible();

      // Type "gt" in the title input - should NOT navigate
      const titleInput = page.getByTestId('create-task-title-input');
      await titleInput.fill('gt');

      // Should still be on tasks page with modal open
      await expect(page).toHaveURL(/\/tasks/);
      await expect(page.getByTestId('create-task-modal')).toBeVisible();
    });

    test('sequence times out after delay', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Press G
      await page.keyboard.press('g');

      // Wait for more than the timeout (1 second)
      await page.waitForTimeout(1100);

      // Now press T - should not navigate because sequence timed out
      await page.keyboard.press('t');

      // Should still be on dashboard
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('invalid sequence is ignored', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Press G then X (invalid sequence)
      await page.keyboard.press('g');
      await page.keyboard.press('x');

      // Should still be on dashboard
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Now press G T - should work
      await page.keyboard.press('g');
      await page.keyboard.press('t');

      // Should navigate to tasks
      await expect(page).toHaveURL(/\/tasks/);
    });
  });

  test.describe('Modifier Shortcuts', () => {
    test('Cmd+B toggles sidebar', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Sidebar should be expanded by default (width ~240px = w-60)
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toBeVisible();

      // Get initial width (should be around 240px, allow for small variations)
      const initialWidth = await sidebar.evaluate(el => el.clientWidth);
      expect(initialWidth).toBeGreaterThan(200);
      expect(initialWidth).toBeLessThan(260);

      // Press Cmd+B to collapse
      await page.keyboard.press('Meta+b');

      // Wait for transition
      await page.waitForTimeout(250);

      // Sidebar should be collapsed (width ~64px = w-16)
      const collapsedWidth = await sidebar.evaluate(el => el.clientWidth);
      expect(collapsedWidth).toBeGreaterThan(50);
      expect(collapsedWidth).toBeLessThan(80);

      // Press Cmd+B again to expand
      await page.keyboard.press('Meta+b');

      // Wait for transition
      await page.waitForTimeout(250);

      // Sidebar should be expanded again
      const expandedWidth = await sidebar.evaluate(el => el.clientWidth);
      expect(expandedWidth).toBeGreaterThan(200);
      expect(expandedWidth).toBeLessThan(260);
    });
  });
});
