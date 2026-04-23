import { test, expect } from '@playwright/test';

/**
 * TB122: Workflows Must Have Task Children
 *
 * Tests that:
 * 1. Creating a workflow directly requires at least one task (initialTask or initialTaskId)
 * 2. Creating a workflow from a playbook requires at least one step
 * 3. Cannot delete the last task from a workflow
 * 4. UI shows appropriate warnings and disabled states
 */
test.describe('TB122: Workflows Must Have Task Children', () => {
  // ============================================================================
  // API Tests - POST /api/workflows Validation
  // ============================================================================

  test.describe('API - Create Workflow Validation', () => {
    test('POST /api/workflows without initial task returns validation error', async ({ page }) => {
      const response = await page.request.post('/api/workflows', {
        data: {
          title: 'Test Workflow Without Tasks',
          createdBy: 'system',
        },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('at least one task');
    });

    test('POST /api/workflows with initialTask creates workflow and task atomically', async ({ page }) => {
      const workflowTitle = `Test Workflow ${Date.now()}`;
      const taskTitle = `Initial Task ${Date.now()}`;

      const response = await page.request.post('/api/workflows', {
        data: {
          title: workflowTitle,
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
      expect(created.title).toBe(workflowTitle);
      expect(created.initialTask).toBeDefined();
      expect(created.initialTask.id).toBeDefined();

      // Verify task was created and added to workflow
      const tasksResponse = await page.request.get(`/api/workflows/${created.id}/tasks`);
      expect(tasksResponse.ok()).toBe(true);
      const tasks = await tasksResponse.json();
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe(taskTitle);

      // Cleanup - use delete with force
      await page.request.delete(`/api/workflows/${created.id}?force=true`);
    });

    test('POST /api/workflows with initialTaskId adds existing task to workflow', async ({ page }) => {
      // Create a task first
      const taskResponse = await page.request.post('/api/tasks', {
        data: {
          title: `Existing Task ${Date.now()}`,
          createdBy: 'system',
        },
      });
      const task = await taskResponse.json();

      // Create workflow with existing task
      const workflowTitle = `Test Workflow ${Date.now()}`;
      const response = await page.request.post('/api/workflows', {
        data: {
          title: workflowTitle,
          createdBy: 'system',
          initialTaskId: task.id,
        },
      });

      expect(response.ok()).toBe(true);
      const created = await response.json();

      expect(created.id).toBeDefined();
      expect(created.title).toBe(workflowTitle);
      expect(created.initialTask.id).toBe(task.id);

      // Verify task was added to workflow
      const tasksResponse = await page.request.get(`/api/workflows/${created.id}/tasks`);
      const tasks = await tasksResponse.json();
      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe(task.id);

      // Cleanup - delete workflow with force (will clean up task too)
      await page.request.delete(`/api/workflows/${created.id}?force=true`);
    });

    test('POST /api/workflows with invalid initialTaskId returns error', async ({ page }) => {
      const response = await page.request.post('/api/workflows', {
        data: {
          title: 'Test Workflow',
          createdBy: 'system',
          initialTaskId: 'el-nonexistent123',
        },
      });

      expect(response.status()).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ============================================================================
  // API Tests - POST /api/workflows/instantiate Validation
  // ============================================================================

  test.describe('API - Create Workflow Validation', () => {
    test('POST /api/workflows/instantiate with empty steps returns validation error', async ({ page }) => {
      const response = await page.request.post('/api/workflows/instantiate', {
        data: {
          playbook: {
            name: 'empty-playbook',
            version: '1.0.0',
            variables: [],
            steps: [], // Empty steps
          },
          createdBy: 'system',
          title: 'Workflow from Empty Playbook',
        },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('no steps defined');
    });

    test('POST /api/workflows/instantiate with valid playbook creates workflow with tasks', async ({ page }) => {
      const workflowTitle = `Create Test ${Date.now()}`;

      const response = await page.request.post('/api/workflows/instantiate', {
        data: {
          playbook: {
            name: 'test-playbook',
            version: '1.0.0',
            variables: [],
            steps: [
              { id: 'step-1', title: 'Step 1' },
              { id: 'step-2', title: 'Step 2' },
            ],
          },
          createdBy: 'system',
          title: workflowTitle,
        },
      });

      expect(response.ok()).toBe(true);
      const result = await response.json();

      expect(result.workflow).toBeDefined();
      expect(result.workflow.title).toBe(workflowTitle);
      expect(result.tasks).toBeDefined();
      expect(result.tasks.length).toBe(2);

      // Cleanup
      await page.request.delete(`/api/workflows/${result.workflow.id}?force=true`);
    });
  });

  // ============================================================================
  // API Tests - Delete Last Task Prevention
  // ============================================================================

  test.describe('API - Delete Last Task Prevention', () => {
    let workflowId: string;
    let taskId: string;

    test.beforeEach(async ({ page }) => {
      // Create a workflow with one task
      const response = await page.request.post('/api/workflows', {
        data: {
          title: `Test Workflow ${Date.now()}`,
          createdBy: 'system',
          initialTask: { title: `Task ${Date.now()}` },
        },
      });
      const created = await response.json();
      workflowId = created.id;
      taskId = created.initialTask.id;
    });

    test.afterEach(async ({ page }) => {
      // Cleanup - delete the workflow
      await page.request.delete(`/api/workflows/${workflowId}?force=true`);
    });

    test('DELETE /api/tasks/:id returns error when deleting last task in workflow', async ({ page }) => {
      // Try to delete the only task
      const response = await page.request.delete(`/api/tasks/${taskId}`);

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('LAST_TASK');
      expect(body.error.message).toContain('last task in a workflow');
    });

    test('GET /api/workflows/:id/can-delete-task/:taskId returns canDelete=false for last task', async ({ page }) => {
      const response = await page.request.get(`/api/workflows/${workflowId}/can-delete-task/${taskId}`);

      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.canDelete).toBe(false);
      expect(body.reason).toContain('last task');
      expect(body.isLastTask).toBe(true);
    });

    test('can delete task when workflow has multiple tasks', async ({ page }) => {
      // Create workflow with two tasks via create
      const response = await page.request.post('/api/workflows/instantiate', {
        data: {
          playbook: {
            name: 'two-step-playbook',
            version: '1.0.0',
            variables: [],
            steps: [
              { id: 'step-1', title: 'Step 1' },
              { id: 'step-2', title: 'Step 2' },
            ],
          },
          createdBy: 'system',
          title: `Multi-Task Workflow ${Date.now()}`,
        },
      });
      const result = await response.json();
      const multiWorkflowId = result.workflow.id;
      const firstTaskId = result.tasks[0].id;
      const secondTaskId = result.tasks[1].id;

      // Check canDelete for first task
      const canDeleteResponse = await page.request.get(`/api/workflows/${multiWorkflowId}/can-delete-task/${firstTaskId}`);
      const canDeleteBody = await canDeleteResponse.json();
      expect(canDeleteBody.canDelete).toBe(true);

      // Now we can delete the first task
      const deleteResponse = await page.request.delete(`/api/tasks/${firstTaskId}`);
      expect(deleteResponse.ok()).toBe(true);

      // Verify workflow still has one task
      const tasksResponse = await page.request.get(`/api/workflows/${multiWorkflowId}/tasks`);
      const tasks = await tasksResponse.json();
      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe(secondTaskId);

      // Now the remaining task cannot be deleted
      const canDeleteSecondResponse = await page.request.get(`/api/workflows/${multiWorkflowId}/can-delete-task/${secondTaskId}`);
      const canDeleteSecondBody = await canDeleteSecondResponse.json();
      expect(canDeleteSecondBody.canDelete).toBe(false);

      // Cleanup
      await page.request.delete(`/api/workflows/${multiWorkflowId}?force=true`);
    });
  });

  // ============================================================================
  // UI Tests
  // ============================================================================

  test.describe('UI - Create Workflow Modal', () => {
    test('Create Workflow button is visible on workflows page', async ({ page }) => {
      await page.goto('/workflows');
      await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId('create-workflow-button')).toBeVisible();
    });

    test('clicking Create button opens modal', async ({ page }) => {
      await page.goto('/workflows');
      await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

      await page.getByTestId('create-workflow-button').click();
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });
    });

    test('Quick Create mode allows creating workflow with 3 default tasks', async ({ page }) => {
      await page.goto('/workflows');
      await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

      await page.getByTestId('create-workflow-button').click();
      await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

      const workflowTitle = `UI Quick Workflow ${Date.now()}`;
      await page.getByTestId('create-title-input').fill(workflowTitle);

      // Quick mode should be default and have submit enabled
      await expect(page.getByTestId('mode-quick')).toHaveClass(/bg-white/);
      await expect(page.getByTestId('create-submit-button')).toBeEnabled();

      // Submit
      await page.getByTestId('create-submit-button').click();

      // Modal should close
      await expect(page.getByTestId('create-workflow-modal')).not.toBeVisible({ timeout: 5000 });

      // Workflow should appear in list
      await expect(page.getByText(workflowTitle)).toBeVisible({ timeout: 5000 });

      // Cleanup
      const workflowsResponse = await page.request.get('/api/workflows');
      const workflows = await workflowsResponse.json();
      const createdWorkflow = workflows.find((w: { title: string }) => w.title === workflowTitle);
      if (createdWorkflow) {
        await page.request.delete(`/api/workflows/${createdWorkflow.id}?force=true`);
      }
    });
  });

  test.describe('UI - Workflow Detail Panel', () => {
    let workflowId: string;
    let workflowTitle: string;

    test.beforeEach(async ({ page }) => {
      // Create a workflow with one task via API
      workflowTitle = `Test Workflow ${Date.now()}`;
      const response = await page.request.post('/api/workflows', {
        data: {
          title: workflowTitle,
          createdBy: 'system',
          initialTask: { title: 'Only Task' },
        },
      });
      const created = await response.json();
      workflowId = created.id;
    });

    test.afterEach(async ({ page }) => {
      // Cleanup
      await page.request.delete(`/api/workflows/${workflowId}?force=true`);
    });

    test('shows last-task warning when workflow has only one task', async ({ page }) => {
      await page.goto('/workflows');
      await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

      // Click on the workflow to open detail panel
      await page.getByText(workflowTitle).first().click();

      // Wait for detail panel
      await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

      // Should show the last task warning
      await expect(page.getByTestId('last-task-warning')).toBeVisible();
      await expect(page.getByText('Only one task remaining')).toBeVisible();
    });

    test('does not show warning when workflow has multiple tasks', async ({ page }) => {
      // Create a workflow with two tasks
      const multiResponse = await page.request.post('/api/workflows/instantiate', {
        data: {
          playbook: {
            name: 'two-step-playbook',
            version: '1.0.0',
            variables: [],
            steps: [
              { id: 'step-1', title: 'First Step' },
              { id: 'step-2', title: 'Second Step' },
            ],
          },
          createdBy: 'system',
          title: `Multi-Task Workflow ${Date.now()}`,
        },
      });
      const result = await multiResponse.json();
      const multiWorkflowId = result.workflow.id;
      const multiWorkflowTitle = result.workflow.title;

      await page.goto('/workflows');
      await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

      // Click on the multi-task workflow
      await page.getByText(multiWorkflowTitle).first().click();
      await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

      // Should NOT show the last task warning
      await expect(page.getByTestId('last-task-warning')).not.toBeVisible();

      // Cleanup
      await page.request.delete(`/api/workflows/${multiWorkflowId}?force=true`);
    });
  });
});
