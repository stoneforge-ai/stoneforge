import { test, expect } from '@playwright/test';

/**
 * TB121: Plans Must Have Task Children
 *
 * Tests that:
 * 1. Creating a plan requires at least one task (initialTask or initialTaskId)
 * 2. Cannot remove the last task from a plan
 * 3. UI shows appropriate warnings and disabled states
 */
test.describe('TB121: Plans Must Have Task Children', () => {
  // ============================================================================
  // API Tests - Server Validation
  // ============================================================================

  test.describe('API - Create Plan Validation', () => {
    test('POST /api/plans without initial task returns validation error', async ({ page }) => {
      const response = await page.request.post('/api/plans', {
        data: {
          title: 'Test Plan Without Tasks',
          createdBy: 'system',
        },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('at least one task');
    });

    test('POST /api/plans with initialTask creates plan and task atomically', async ({ page }) => {
      const planTitle = `Test Plan ${Date.now()}`;
      const taskTitle = `Initial Task ${Date.now()}`;

      const response = await page.request.post('/api/plans', {
        data: {
          title: planTitle,
          createdBy: 'system',
          initialTask: {
            title: taskTitle,
            priority: 3,
          },
        },
      });

      expect(response.ok()).toBe(true);
      const created = await response.json();

      expect(created.id).toBeDefined();
      expect(created.title).toBe(planTitle);
      expect(created.initialTask).toBeDefined();
      expect(created.initialTask.id).toBeDefined();

      // Verify task was created and added to plan
      const tasksResponse = await page.request.get(`/api/plans/${created.id}/tasks`);
      expect(tasksResponse.ok()).toBe(true);
      const tasks = await tasksResponse.json();
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe(taskTitle);

      // Cleanup
      await page.request.delete(`/api/tasks/${created.initialTask.id}?force=true`);
      await page.request.delete(`/api/plans/${created.id}?force=true`);
    });

    test('POST /api/plans with initialTaskId adds existing task to plan', async ({ page }) => {
      // Create a task first
      const taskResponse = await page.request.post('/api/tasks', {
        data: {
          title: `Existing Task ${Date.now()}`,
          createdBy: 'system',
        },
      });
      const task = await taskResponse.json();

      // Create plan with existing task
      const planTitle = `Test Plan ${Date.now()}`;
      const response = await page.request.post('/api/plans', {
        data: {
          title: planTitle,
          createdBy: 'system',
          initialTaskId: task.id,
        },
      });

      expect(response.ok()).toBe(true);
      const created = await response.json();

      expect(created.id).toBeDefined();
      expect(created.title).toBe(planTitle);
      expect(created.initialTask.id).toBe(task.id);

      // Verify task was added to plan
      const tasksResponse = await page.request.get(`/api/plans/${created.id}/tasks`);
      const tasks = await tasksResponse.json();
      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe(task.id);

      // Cleanup
      await page.request.delete(`/api/tasks/${task.id}?force=true`);
      await page.request.delete(`/api/plans/${created.id}?force=true`);
    });

    test('POST /api/plans with invalid initialTaskId returns error', async ({ page }) => {
      const response = await page.request.post('/api/plans', {
        data: {
          title: 'Test Plan',
          createdBy: 'system',
          initialTaskId: 'el-nonexistent123',
        },
      });

      expect(response.status()).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  test.describe('API - Remove Last Task Prevention', () => {
    let planId: string;
    let taskId: string;

    test.beforeEach(async ({ page }) => {
      // Create a plan with one task
      const response = await page.request.post('/api/plans', {
        data: {
          title: `Test Plan ${Date.now()}`,
          createdBy: 'system',
          initialTask: { title: `Task ${Date.now()}` },
        },
      });
      const created = await response.json();
      planId = created.id;
      taskId = created.initialTask.id;
    });

    test.afterEach(async ({ page }) => {
      // Cleanup - add a second task first so we can delete the plan
      const taskResponse = await page.request.post('/api/tasks', {
        data: {
          title: 'Cleanup Task',
          createdBy: 'system',
        },
      });
      const cleanupTask = await taskResponse.json();

      // Add the cleanup task to the plan
      await page.request.post(`/api/plans/${planId}/tasks`, {
        data: { taskId: cleanupTask.id },
      });

      // Now we can delete the original task
      await page.request.delete(`/api/plans/${planId}/tasks/${taskId}`);

      // Delete cleanup task
      await page.request.delete(`/api/tasks/${cleanupTask.id}?force=true`);
      await page.request.delete(`/api/tasks/${taskId}?force=true`);
      await page.request.delete(`/api/plans/${planId}?force=true`);
    });

    test('DELETE /api/plans/:id/tasks/:taskId returns error when removing last task', async ({ page }) => {
      // Try to remove the only task
      const response = await page.request.delete(`/api/plans/${planId}/tasks/${taskId}`);

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('LAST_TASK');
      expect(body.error.message).toContain('last task');
    });

    test('GET /api/plans/:id/can-delete-task/:taskId returns canDelete=false for last task', async ({ page }) => {
      const response = await page.request.get(`/api/plans/${planId}/can-delete-task/${taskId}`);

      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.canDelete).toBe(false);
      expect(body.reason).toContain('last task');
    });

    test('can remove task when plan has multiple tasks', async ({ page }) => {
      // Add a second task
      const taskResponse = await page.request.post('/api/tasks', {
        data: {
          title: `Second Task ${Date.now()}`,
          createdBy: 'system',
        },
      });
      const secondTask = await taskResponse.json();

      await page.request.post(`/api/plans/${planId}/tasks`, {
        data: { taskId: secondTask.id },
      });

      // Now we can remove the first task
      const deleteResponse = await page.request.delete(`/api/plans/${planId}/tasks/${taskId}`);
      expect(deleteResponse.ok()).toBe(true);

      // Verify plan still has one task
      const tasksResponse = await page.request.get(`/api/plans/${planId}/tasks`);
      const tasks = await tasksResponse.json();
      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe(secondTask.id);

      // Update cleanup variables
      taskId = secondTask.id;
    });
  });

  // ============================================================================
  // UI Tests
  // ============================================================================

  test.describe('UI - Create Plan Modal', () => {
    test('Create Plan button is visible on plans page', async ({ page }) => {
      await page.goto('/plans');
      await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId('create-plan-btn')).toBeVisible();
    });

    test('clicking Create Plan button opens modal', async ({ page }) => {
      await page.goto('/plans');
      await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

      await page.getByTestId('create-plan-btn').click();
      await expect(page.getByTestId('create-plan-modal')).toBeVisible({ timeout: 5000 });
    });

    test('Create Plan modal shows required task notice', async ({ page }) => {
      await page.goto('/plans');
      await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

      await page.getByTestId('create-plan-btn').click();
      await expect(page.getByTestId('create-plan-modal')).toBeVisible({ timeout: 5000 });

      // Should show "Initial Task Required" notice
      await expect(page.getByText('Initial Task Required')).toBeVisible();
    });

    test('Create button is disabled without task', async ({ page }) => {
      await page.goto('/plans');
      await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

      await page.getByTestId('create-plan-btn').click();
      await expect(page.getByTestId('create-plan-modal')).toBeVisible({ timeout: 5000 });

      // Enter only plan title
      await page.getByTestId('plan-title-input').fill('My New Plan');

      // Submit button should be disabled
      await expect(page.getByTestId('create-plan-submit')).toBeDisabled();
    });

    test('can create plan with new task', async ({ page }) => {
      await page.goto('/plans');
      await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

      await page.getByTestId('create-plan-btn').click();
      await expect(page.getByTestId('create-plan-modal')).toBeVisible({ timeout: 5000 });

      const planTitle = `UI Test Plan ${Date.now()}`;
      const taskTitle = `UI Test Task ${Date.now()}`;

      // Enter plan title
      await page.getByTestId('plan-title-input').fill(planTitle);

      // Mode should default to "Create New Task"
      await expect(page.getByTestId('mode-new-task')).toHaveClass(/bg-blue-500/);

      // Enter task title
      await page.getByTestId('task-title-input').fill(taskTitle);

      // Submit should now be enabled
      await expect(page.getByTestId('create-plan-submit')).toBeEnabled();

      // Submit
      await page.getByTestId('create-plan-submit').click();

      // Modal should close
      await expect(page.getByTestId('create-plan-modal')).not.toBeVisible({ timeout: 5000 });

      // Plan should be visible in list (use testid to avoid matching detail panel too)
      await expect(page.getByTestId('plans-list').getByText(planTitle)).toBeVisible({ timeout: 5000 });

      // Cleanup: get the plan ID and delete it
      const plansResponse = await page.request.get('/api/plans');
      const plans = await plansResponse.json();
      const createdPlan = plans.find((p: { title: string }) => p.title === planTitle);
      if (createdPlan) {
        // Get tasks and delete
        const tasksResponse = await page.request.get(`/api/plans/${createdPlan.id}/tasks`);
        const tasks = await tasksResponse.json();
        for (const task of tasks) {
          await page.request.delete(`/api/tasks/${task.id}?force=true`);
        }
        await page.request.delete(`/api/plans/${createdPlan.id}?force=true`);
      }
    });

    test('can switch between new task and existing task mode', async ({ page }) => {
      await page.goto('/plans');
      await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

      await page.getByTestId('create-plan-btn').click();
      await expect(page.getByTestId('create-plan-modal')).toBeVisible({ timeout: 5000 });

      // Default is new task mode
      await expect(page.getByTestId('task-title-input')).toBeVisible();

      // Switch to existing task mode
      await page.getByTestId('mode-existing-task').click();

      // Should show search input instead of task title input
      await expect(page.getByTestId('existing-task-search')).toBeVisible();
      await expect(page.getByTestId('task-title-input')).not.toBeVisible();

      // Switch back to new task mode
      await page.getByTestId('mode-new-task').click();
      await expect(page.getByTestId('task-title-input')).toBeVisible();
    });

    test('can close modal with cancel button', async ({ page }) => {
      await page.goto('/plans');
      await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

      await page.getByTestId('create-plan-btn').click();
      await expect(page.getByTestId('create-plan-modal')).toBeVisible({ timeout: 5000 });

      await page.getByTestId('create-plan-cancel').click();
      await expect(page.getByTestId('create-plan-modal')).not.toBeVisible({ timeout: 2000 });
    });
  });

  test.describe('UI - Last Task Warning', () => {
    let planId: string;
    let taskId: string;

    test.beforeAll(async ({ request }) => {
      // Create a plan with one task for UI tests
      const response = await request.post('/api/plans', {
        data: {
          title: `UI Test Plan ${Date.now()}`,
          createdBy: 'system',
          initialTask: { title: `UI Test Task ${Date.now()}` },
        },
      });
      const created = await response.json();
      planId = created.id;
      taskId = created.initialTask.id;
    });

    test.afterAll(async ({ request }) => {
      // Cleanup
      await request.delete(`/api/tasks/${taskId}?force=true`);
      await request.delete(`/api/plans/${planId}?force=true`);
    });

    test('last task warning is shown when plan has one task', async ({ page }) => {
      await page.goto(`/plans?selected=${planId}`);
      await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 10000 });

      // Should show the last task warning
      await expect(page.getByTestId('last-task-warning')).toBeVisible();
      await expect(page.getByText('only task')).toBeVisible();
    });

    test('remove button is disabled for last task', async ({ page }) => {
      await page.goto(`/plans?selected=${planId}`);
      await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 10000 });

      // Find the remove button for the task
      const removeButton = page.getByTestId(`remove-task-${taskId}`);

      // Button should be disabled
      await expect(removeButton).toBeDisabled();
    });

    test('remove button has correct tooltip for last task', async ({ page }) => {
      await page.goto(`/plans?selected=${planId}`);
      await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 10000 });

      // Find the remove button for the task
      const removeButton = page.getByTestId(`remove-task-${taskId}`);

      // Check the title attribute
      const title = await removeButton.getAttribute('title');
      expect(title).toContain('Cannot remove');
    });
  });

  test.describe('UI - Multiple Tasks Allow Removal', () => {
    let planId: string;
    let task1Id: string;
    let task2Id: string;

    test.beforeAll(async ({ request }) => {
      // Create a plan with initial task
      const response = await request.post('/api/plans', {
        data: {
          title: `Multi Task Plan ${Date.now()}`,
          createdBy: 'system',
          initialTask: { title: `Task 1 ${Date.now()}` },
        },
      });
      const created = await response.json();
      planId = created.id;
      task1Id = created.initialTask.id;

      // Add a second task
      const task2Response = await request.post('/api/tasks', {
        data: {
          title: `Task 2 ${Date.now()}`,
          createdBy: 'system',
        },
      });
      const task2 = await task2Response.json();
      task2Id = task2.id;

      await request.post(`/api/plans/${planId}/tasks`, {
        data: { taskId: task2Id },
      });
    });

    test.afterAll(async ({ request }) => {
      // Cleanup
      await request.delete(`/api/tasks/${task1Id}?force=true`);
      await request.delete(`/api/tasks/${task2Id}?force=true`);
      await request.delete(`/api/plans/${planId}?force=true`);
    });

    test('no warning shown when plan has multiple tasks', async ({ page }) => {
      await page.goto(`/plans?selected=${planId}`);
      await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 10000 });

      // Should NOT show the last task warning
      await expect(page.getByTestId('last-task-warning')).not.toBeVisible();
    });

    test('remove buttons are enabled when plan has multiple tasks', async ({ page }) => {
      await page.goto(`/plans?selected=${planId}`);
      await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 10000 });

      // Find the remove buttons - they should be enabled
      const removeButton1 = page.getByTestId(`remove-task-${task1Id}`);
      const removeButton2 = page.getByTestId(`remove-task-${task2Id}`);

      // Buttons should be visible on hover (they have opacity-0 by default)
      // Just check they're not disabled
      await expect(removeButton1).toBeEnabled();
      await expect(removeButton2).toBeEnabled();
    });
  });
});
