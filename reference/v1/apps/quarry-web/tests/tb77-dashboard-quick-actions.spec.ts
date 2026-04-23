import { test, expect } from '@playwright/test';

test.describe('TB77: Dashboard Quick Actions with Modals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });
  });

  test.describe('Create Task Button', () => {
    test('create task button opens modal instead of navigating', async ({ page }) => {
      await page.getByTestId('quick-action-create-task').click();

      // Should stay on dashboard
      await expect(page).toHaveURL(/\/dashboard/);

      // Modal should be visible
      await expect(page.getByTestId('create-task-modal')).toBeVisible();
    });

    test('create task button shows keyboard shortcut hint (C T)', async ({ page }) => {
      const button = page.getByTestId('quick-action-create-task');
      await expect(button).toContainText('C T');
    });

    test('create task modal can be closed via close button', async ({ page }) => {
      await page.getByTestId('quick-action-create-task').click();
      await expect(page.getByTestId('create-task-modal')).toBeVisible();

      await page.getByTestId('create-task-modal-close').click();
      await expect(page.getByTestId('create-task-modal')).not.toBeVisible();
    });

    test('create task modal can be closed via backdrop click', async ({ page }) => {
      await page.getByTestId('quick-action-create-task').click();
      await expect(page.getByTestId('create-task-modal')).toBeVisible();

      // Click the backdrop - use force:true since modal content may be overlapping
      // The backdrop spans the full viewport, so we click at the top-left corner
      await page.getByTestId('create-task-modal-backdrop').click({ position: { x: 5, y: 5 }, force: true });
      await expect(page.getByTestId('create-task-modal')).not.toBeVisible();
    });

    test('create task modal can be closed via Escape key', async ({ page }) => {
      await page.getByTestId('quick-action-create-task').click();
      await expect(page.getByTestId('create-task-modal')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('create-task-modal')).not.toBeVisible();
    });

    test('task can be created from dashboard modal', async ({ page }) => {
      // First, get an entity to use as createdBy
      const entitiesResponse = await page.request.get('/api/entities');
      const entitiesData = await entitiesResponse.json();
      const entities = entitiesData.items || entitiesData;

      if (entities.length === 0) {
        test.skip(true, 'No entities available for test');
        return;
      }

      await page.getByTestId('quick-action-create-task').click();
      await expect(page.getByTestId('create-task-modal')).toBeVisible();

      // Fill in task details
      const taskTitle = `TB77 Test Task ${Date.now()}`;
      await page.getByTestId('create-task-title-input').fill(taskTitle);

      // Submit
      await page.getByTestId('create-task-submit-button').click();

      // Modal should close
      await expect(page.getByTestId('create-task-modal')).not.toBeVisible();

      // Toast should appear
      await expect(page.getByText('Task created successfully')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Create Workflow Button', () => {
    test('create workflow button opens modal instead of navigating', async ({ page }) => {
      await page.getByTestId('quick-action-create-workflow').click();

      // Should stay on dashboard
      await expect(page).toHaveURL(/\/dashboard/);

      // Modal should be visible
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible();
    });

    test('create workflow button shows keyboard shortcut hint (C W)', async ({ page }) => {
      const button = page.getByTestId('quick-action-create-workflow');
      await expect(button).toContainText('C W');
    });

    test('create workflow modal can be closed via close button', async ({ page }) => {
      await page.getByTestId('quick-action-create-workflow').click();
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible();

      await page.getByTestId('create-workflow-modal-close').click();
      await expect(page.getByTestId('create-workflow-modal')).not.toBeVisible();
    });

    test('create workflow modal can be closed via backdrop click', async ({ page }) => {
      await page.getByTestId('quick-action-create-workflow').click();
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible();

      // Click outside the modal content (on the backdrop)
      await page.locator('[data-testid="create-workflow-modal"]').click({ position: { x: 10, y: 10 } });
      await expect(page.getByTestId('create-workflow-modal')).not.toBeVisible();
    });

    test('workflow can be created from dashboard modal (quick mode)', async ({ page }) => {
      await page.getByTestId('quick-action-create-workflow').click();
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible();

      // Fill in workflow details (quick mode is default)
      const workflowTitle = `TB77 Test Workflow ${Date.now()}`;
      await page.getByTestId('create-title-input').fill(workflowTitle);

      // Submit
      await page.getByTestId('create-submit-button').click();

      // Modal should close
      await expect(page.getByTestId('create-workflow-modal')).not.toBeVisible();

      // Toast should appear
      await expect(page.getByText('Workflow created successfully')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('View Ready Tasks Button', () => {
    test('view ready tasks button still navigates to tasks page', async ({ page }) => {
      await page.getByTestId('quick-action-view-tasks').click();

      // Should navigate to tasks
      await expect(page).toHaveURL(/\/tasks/);
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('C T keyboard shortcut opens create task modal', async ({ page }) => {
      // Type C then T (sequential shortcut)
      await page.keyboard.press('c');
      await page.keyboard.press('t');

      // Modal should open
      await expect(page.getByTestId('create-task-modal')).toBeVisible({ timeout: 2000 });
    });

    test('C W keyboard shortcut opens create workflow modal', async ({ page }) => {
      // Type C then W (sequential shortcut)
      await page.keyboard.press('c');
      await page.keyboard.press('w');

      // Modal should open
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 2000 });
    });

    test('keyboard shortcuts are disabled when create task modal is open', async ({ page }) => {
      // Open create task modal
      await page.getByTestId('quick-action-create-task').click();
      await expect(page.getByTestId('create-task-modal')).toBeVisible();

      // Try to open create workflow with shortcut - should not work
      await page.keyboard.press('c');
      await page.keyboard.press('w');

      // Create workflow modal should NOT be visible (shortcuts disabled)
      await expect(page.getByTestId('create-workflow-modal')).not.toBeVisible();

      // Create task modal should still be open
      await expect(page.getByTestId('create-task-modal')).toBeVisible();
    });

    test('keyboard shortcuts are disabled when create workflow modal is open', async ({ page }) => {
      // Open create workflow modal
      await page.getByTestId('quick-action-create-workflow').click();
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible();

      // Try to open create task with shortcut - should not work
      await page.keyboard.press('c');
      await page.keyboard.press('t');

      // Create task modal should NOT be visible (shortcuts disabled)
      await expect(page.getByTestId('create-task-modal')).not.toBeVisible();

      // Create workflow modal should still be open
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible();
    });
  });

  test.describe('Toast Notifications', () => {
    test('toast appears after successful task creation', async ({ page }) => {
      // Get an entity for createdBy
      const entitiesResponse = await page.request.get('/api/entities');
      const entitiesData = await entitiesResponse.json();
      const entities = entitiesData.items || entitiesData;

      if (entities.length === 0) {
        test.skip(true, 'No entities available for test');
        return;
      }

      await page.getByTestId('quick-action-create-task').click();
      await page.getByTestId('create-task-title-input').fill('Toast Test Task');
      await page.getByTestId('create-task-submit-button').click();

      // Toast should be visible with success message
      await expect(page.getByText('Task created successfully')).toBeVisible({ timeout: 5000 });
    });

    test('toast has View Task action button after task creation', async ({ page }) => {
      const entitiesResponse = await page.request.get('/api/entities');
      const entitiesData = await entitiesResponse.json();
      const entities = entitiesData.items || entitiesData;

      if (entities.length === 0) {
        test.skip(true, 'No entities available for test');
        return;
      }

      await page.getByTestId('quick-action-create-task').click();
      await page.getByTestId('create-task-title-input').fill('Toast Action Test Task');
      await page.getByTestId('create-task-submit-button').click();

      // Wait for toast to appear
      await expect(page.getByText('Task created successfully')).toBeVisible({ timeout: 5000 });

      // Toast should have View Task action
      await expect(page.getByRole('button', { name: 'View Task' })).toBeVisible();
    });

    test('toast appears after successful workflow creation', async ({ page }) => {
      await page.getByTestId('quick-action-create-workflow').click();
      await page.getByTestId('create-title-input').fill('Toast Test Workflow');
      await page.getByTestId('create-submit-button').click();

      // Toast should be visible with success message
      await expect(page.getByText('Workflow created successfully')).toBeVisible({ timeout: 5000 });
    });

    test('toast has View Workflow action button after workflow creation', async ({ page }) => {
      await page.getByTestId('quick-action-create-workflow').click();
      await page.getByTestId('create-title-input').fill('Toast Action Test Workflow');
      await page.getByTestId('create-submit-button').click();

      // Wait for toast to appear
      await expect(page.getByText('Workflow created successfully')).toBeVisible({ timeout: 5000 });

      // Toast should have View Workflow action
      await expect(page.getByRole('button', { name: 'View Workflow' })).toBeVisible();
    });
  });

  test.describe('Global Keyboard Shortcuts', () => {
    test('C T keyboard shortcut works on Tasks page', async ({ page }) => {
      // Navigate to Tasks page
      await page.goto('/tasks');
      await expect(page.getByTestId('tasks-page')).toBeVisible();

      // Press C T to open create task modal
      await page.keyboard.press('c');
      await page.keyboard.press('t');

      // Modal should open
      await expect(page.getByTestId('create-task-modal')).toBeVisible({ timeout: 2000 });
    });

    test('C W keyboard shortcut works on Tasks page', async ({ page }) => {
      // Navigate to Tasks page
      await page.goto('/tasks');
      await expect(page.getByTestId('tasks-page')).toBeVisible();

      // Press C W to open create workflow modal
      await page.keyboard.press('c');
      await page.keyboard.press('w');

      // Modal should open
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 2000 });
    });

    test('C T keyboard shortcut works on Workflows page', async ({ page }) => {
      // Navigate to Workflows page
      await page.goto('/workflows');
      await expect(page.getByTestId('workflows-page')).toBeVisible();

      // Press C T to open create task modal
      await page.keyboard.press('c');
      await page.keyboard.press('t');

      // Modal should open
      await expect(page.getByTestId('create-task-modal')).toBeVisible({ timeout: 2000 });
    });

    test('C W keyboard shortcut works on Workflows page', async ({ page }) => {
      // Navigate to Workflows page
      await page.goto('/workflows');
      await expect(page.getByTestId('workflows-page')).toBeVisible();

      // Press C W to open create workflow modal
      await page.keyboard.press('c');
      await page.keyboard.press('w');

      // Modal should open
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 2000 });
    });

    test('Tasks page Create Task button shows keyboard hint', async ({ page }) => {
      await page.goto('/tasks');
      await expect(page.getByTestId('tasks-page')).toBeVisible();

      // Button should show C T keyboard hint
      const button = page.getByTestId('create-task-button');
      await expect(button).toContainText('C T');
    });

    test('Workflows page Create Workflow button shows keyboard hint', async ({ page }) => {
      await page.goto('/workflows');
      await expect(page.getByTestId('workflows-page')).toBeVisible();

      // Button should show C W keyboard hint
      const button = page.getByTestId('create-workflow-button');
      await expect(button).toContainText('C W');
    });
  });
});
