import { test, expect } from '@playwright/test';

test.describe('TB25: Workflow List + Create', () => {
  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('GET /api/workflows returns list of workflows', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    expect(response.ok()).toBe(true);
    const workflows = await response.json();
    expect(Array.isArray(workflows)).toBe(true);

    // Check each workflow has required fields
    for (const workflow of workflows) {
      expect(workflow.type).toBe('workflow');
      expect(workflow.title).toBeDefined();
      expect(['pending', 'running', 'completed', 'failed', 'cancelled']).toContain(workflow.status);
      expect(workflow.createdAt).toBeDefined();
      expect(workflow.updatedAt).toBeDefined();
      expect(workflow.createdBy).toBeDefined();
    }
  });

  test('GET /api/workflows supports status filter parameter', async ({ page }) => {
    // Test that the status parameter is accepted
    const response = await page.request.get('/api/workflows?status=pending');
    expect(response.ok()).toBe(true);
    const workflows = await response.json();
    expect(Array.isArray(workflows)).toBe(true);
  });

  test('GET /api/workflows/:id returns a workflow', async ({ page }) => {
    // First get list of workflows
    const listResponse = await page.request.get('/api/workflows');
    const workflows = await listResponse.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    // Get single workflow
    const response = await page.request.get(`/api/workflows/${workflows[0].id}`);
    expect(response.ok()).toBe(true);
    const workflow = await response.json();

    expect(workflow.id).toBe(workflows[0].id);
    expect(workflow.type).toBe('workflow');
    expect(workflow.title).toBeDefined();
  });

  test('GET /api/workflows/:id returns 404 for invalid ID', async ({ page }) => {
    const response = await page.request.get('/api/workflows/el-invalid999999');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/workflows/:id with hydrate.progress includes progress', async ({ page }) => {
    const listResponse = await page.request.get('/api/workflows');
    const workflows = await listResponse.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/workflows/${workflows[0].id}?hydrate.progress=true`);
    expect(response.ok()).toBe(true);
    const workflow = await response.json();

    expect(workflow._progress).toBeDefined();
    expect(typeof workflow._progress.totalTasks).toBe('number');
    expect(typeof workflow._progress.completionPercentage).toBe('number');
  });

  test('GET /api/workflows/:id/progress returns progress metrics', async ({ page }) => {
    const listResponse = await page.request.get('/api/workflows');
    const workflows = await listResponse.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/workflows/${workflows[0].id}/progress`);
    expect(response.ok()).toBe(true);
    const progress = await response.json();

    expect(typeof progress.totalTasks).toBe('number');
    expect(typeof progress.completionPercentage).toBe('number');
    expect(typeof progress.readyTasks).toBe('number');
    expect(typeof progress.blockedTasks).toBe('number');

    // Validate percentage is between 0 and 100
    expect(progress.completionPercentage).toBeGreaterThanOrEqual(0);
    expect(progress.completionPercentage).toBeLessThanOrEqual(100);
  });

  test('GET /api/workflows/:id/tasks returns tasks in workflow', async ({ page }) => {
    const listResponse = await page.request.get('/api/workflows');
    const workflows = await listResponse.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/workflows/${workflows[0].id}/tasks`);
    expect(response.ok()).toBe(true);
    const tasks = await response.json();

    expect(Array.isArray(tasks)).toBe(true);

    // Each task should be a valid task
    for (const task of tasks) {
      expect(task.type).toBe('task');
      expect(task.title).toBeDefined();
      expect(task.status).toBeDefined();
    }
  });

  test('POST /api/workflows creates a new workflow with initial task', async ({ page }) => {
    // TB122: Workflows must have at least one task
    const newWorkflow = {
      title: `Test Workflow ${Date.now()}`,
      createdBy: 'test-user',
      status: 'pending',
      ephemeral: false,
      tags: ['test'],
      initialTask: {
        title: `Initial Task ${Date.now()}`,
        priority: 3,
      },
    };

    const response = await page.request.post('/api/workflows', {
      data: newWorkflow,
    });

    expect(response.status()).toBe(201);
    const created = await response.json();

    expect(created.type).toBe('workflow');
    expect(created.title).toBe(newWorkflow.title);
    expect(created.status).toBe('pending');
    expect(created.createdBy).toBe(newWorkflow.createdBy);
    expect(created.id).toBeDefined();
    expect(created.initialTask).toBeDefined();
    expect(created.initialTask.id).toBeDefined();

    // Cleanup
    await page.request.delete(`/api/workflows/${created.id}?force=true`);
  });

  test('POST /api/workflows validates required fields', async ({ page }) => {
    // Missing title
    const response1 = await page.request.post('/api/workflows', {
      data: { createdBy: 'test-user' },
    });
    expect(response1.status()).toBe(400);

    // Missing createdBy
    const response2 = await page.request.post('/api/workflows', {
      data: { title: 'Test Workflow' },
    });
    expect(response2.status()).toBe(400);
  });

  test('POST /api/workflows/instantiate creates workflow from playbook', async ({ page }) => {
    const playbook = {
      name: 'Test Playbook',
      version: '1.0.0',
      variables: [],
      steps: [
        { id: 'step-1', title: 'First Step', priority: 3 },
        { id: 'step-2', title: 'Second Step', priority: 2 },
      ],
    };

    const response = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook,
        createdBy: 'test-user',
        title: `Created Workflow ${Date.now()}`,
      },
    });

    expect(response.status()).toBe(201);
    const result = await response.json();

    expect(result.workflow).toBeDefined();
    expect(result.workflow.type).toBe('workflow');
    expect(result.tasks).toBeDefined();
    expect(Array.isArray(result.tasks)).toBe(true);
    expect(result.tasks.length).toBe(2);
  });

  test('POST /api/workflows/instantiate validates required fields', async ({ page }) => {
    // Missing playbook
    const response1 = await page.request.post('/api/workflows/instantiate', {
      data: { createdBy: 'test-user' },
    });
    expect(response1.status()).toBe(400);

    // Missing createdBy
    const response2 = await page.request.post('/api/workflows/instantiate', {
      data: { playbook: { name: 'Test', version: '1.0.0', variables: [], steps: [] } },
    });
    expect(response2.status()).toBe(400);
  });

  test('PATCH /api/workflows/:id updates a workflow', async ({ page }) => {
    // Create a workflow to update (TB122: must have initial task)
    const createResponse = await page.request.post('/api/workflows', {
      data: {
        title: `Update Test Workflow ${Date.now()}`,
        createdBy: 'test-user',
        status: 'pending',
        initialTask: { title: `Task ${Date.now()}` },
      },
    });
    const workflow = await createResponse.json();

    // Update the workflow
    const newTitle = `Updated Workflow Title ${Date.now()}`;
    const updateResponse = await page.request.patch(`/api/workflows/${workflow.id}`, {
      data: { title: newTitle, status: 'running' },
    });

    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();

    expect(updated.title).toBe(newTitle);
    expect(updated.status).toBe('running');

    // Cleanup
    await page.request.delete(`/api/workflows/${workflow.id}?force=true`);
  });

  test('PATCH /api/workflows/:id validates status values', async ({ page }) => {
    const listResponse = await page.request.get('/api/workflows');
    const workflows = await listResponse.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.patch(`/api/workflows/${workflows[0].id}`, {
      data: { status: 'invalid_status' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  // ============================================================================
  // UI Tests - Workflows Page
  // ============================================================================

  test('workflows page is accessible', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });
  });

  test('workflows page shows header with title', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });
    // Use role-based selector to get the h1 specifically
    await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();
  });

  test('workflows page shows status filter tabs', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('workflow-status-filter')).toBeVisible();

    // Check all status filters are present
    await expect(page.getByTestId('workflow-status-filter-all')).toBeVisible();
    await expect(page.getByTestId('workflow-status-filter-running')).toBeVisible();
    await expect(page.getByTestId('workflow-status-filter-pending')).toBeVisible();
    await expect(page.getByTestId('workflow-status-filter-completed')).toBeVisible();
  });

  test('workflows page shows create workflow button', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('create-workflow-button')).toBeVisible();
  });

  test('clicking create workflow button opens modal', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });
  });

  test('create workflow modal has input fields', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId('create-title-input')).toBeVisible();
    await expect(page.getByTestId('create-playbook-input')).toBeVisible();
    await expect(page.getByTestId('create-submit-button')).toBeVisible();
  });

  test('create workflow modal can be closed', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('create-modal-close').click();
    await expect(page.getByTestId('create-workflow-modal')).not.toBeVisible({ timeout: 5000 });
  });

  test('clicking status filter changes filter', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on running filter
    await page.getByTestId('workflow-status-filter-running').click();

    // The running filter should be selected (has different styling)
    await expect(page.getByTestId('workflow-status-filter-running')).toHaveClass(/bg-white/);
  });

  test('workflows list shows workflows when available', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    if (workflows.length === 0) {
      // Should show empty state
      await expect(page.getByTestId('workflows-empty')).toBeVisible();
    } else {
      // Should show workflows list
      await expect(page.getByTestId('workflows-list')).toBeVisible();
      // At least one workflow item should be visible
      await expect(page.getByTestId(`workflow-item-${workflows[0].id}`)).toBeVisible();
    }
  });

  test('clicking workflow opens detail panel', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on first workflow
    await page.getByTestId(`workflow-item-${workflows[0].id}`).click();

    // Detail panel should appear
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });
  });

  test('workflow detail panel shows workflow title', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on first workflow
    await page.getByTestId(`workflow-item-${workflows[0].id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check title is displayed
    await expect(page.getByTestId('workflow-detail-title')).toContainText(workflows[0].title);
  });

  test('workflow detail panel shows status badge', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on first workflow
    await page.getByTestId(`workflow-item-${workflows[0].id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check status badge is displayed in the detail panel
    await expect(
      page.getByTestId('workflow-detail-panel').getByTestId(`workflow-status-badge-${workflows[0].status}`)
    ).toBeVisible();
  });

  test('workflow detail panel close button works', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on first workflow
    await page.getByTestId(`workflow-item-${workflows[0].id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click close button
    await page.getByTestId('workflow-detail-close').click();

    // Panel should close
    await expect(page.getByTestId('workflow-detail-panel')).not.toBeVisible({ timeout: 5000 });
  });

  test('workflows page is navigable via sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    // Click on Workflows in sidebar
    await page.getByTestId('nav-workflows').click();

    // Should navigate to workflows page
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('/workflows');
  });

  test('creating a workflow shows it in list', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Get initial count
    const beforeResponse = await page.request.get('/api/workflows');
    const beforeWorkflows = await beforeResponse.json();
    const beforeCount = beforeWorkflows.length;

    // Open create modal
    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Fill in the form
    const timestamp = Date.now();
    const workflowTitle = `E2E Test Workflow ${timestamp}`;
    await page.getByTestId('create-title-input').fill(workflowTitle);
    await page.getByTestId('create-playbook-input').fill(`Test Playbook ${timestamp}`);

    // Submit
    await page.getByTestId('create-submit-button').click();

    // Modal should close
    await expect(page.getByTestId('create-workflow-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify via API that workflow was created
    const afterResponse = await page.request.get('/api/workflows');
    const afterWorkflows = await afterResponse.json();
    expect(afterWorkflows.length).toBeGreaterThanOrEqual(beforeCount);

    // Find the created workflow and verify
    const created = afterWorkflows.find((w: { title: string }) => w.title === workflowTitle);
    expect(created).toBeDefined();

    // Cleanup
    if (created) {
      await page.request.delete(`/api/workflows/${created.id}?force=true`);
    }
  });
});

// ============================================================================
// TB48: Edit Workflow Tests
// ============================================================================

test.describe('TB48: Edit Workflow', () => {
  // ============================================================================
  // API Endpoint Tests - Delete
  // ============================================================================

  test('DELETE /api/workflows/:id deletes ephemeral workflow', async ({ page }) => {
    // First create an ephemeral workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Delete Playbook',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Delete Test Workflow ${Date.now()}`,
        ephemeral: true,
      },
    });
    expect(createResponse.status()).toBe(201);
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    // Delete the workflow
    const deleteResponse = await page.request.delete(`/api/workflows/${workflow.id}`);
    expect(deleteResponse.ok()).toBe(true);
    const result = await deleteResponse.json();
    expect(result.workflowId).toBe(workflow.id);

    // Verify workflow no longer exists
    const getResponse = await page.request.get(`/api/workflows/${workflow.id}`);
    expect(getResponse.status()).toBe(404);
  });

  test('DELETE /api/workflows/:id returns 400 for durable workflow without force', async ({ page }) => {
    // First create a durable workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Durable Playbook',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Durable Test Workflow ${Date.now()}`,
        ephemeral: false,
      },
    });
    expect(createResponse.status()).toBe(201);
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    // Try to delete without force - should fail
    const deleteResponse = await page.request.delete(`/api/workflows/${workflow.id}`);
    expect(deleteResponse.status()).toBe(400);
    const body = await deleteResponse.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('DELETE /api/workflows/:id with force=true works for durable workflow', async ({ page }) => {
    // First create a durable workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Force Delete Playbook',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Force Delete Test Workflow ${Date.now()}`,
        ephemeral: false,
      },
    });
    expect(createResponse.status()).toBe(201);
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    // Delete with force flag
    const deleteResponse = await page.request.delete(`/api/workflows/${workflow.id}?force=true`);
    expect(deleteResponse.ok()).toBe(true);
  });

  test('DELETE /api/workflows/:id returns 404 for non-existent workflow', async ({ page }) => {
    const response = await page.request.delete('/api/workflows/el-invalid999');
    expect(response.status()).toBe(404);
  });

  // ============================================================================
  // API Endpoint Tests - Promote
  // ============================================================================

  test('POST /api/workflows/:id/promote promotes ephemeral to durable', async ({ page }) => {
    // First create an ephemeral workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Promote Playbook',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Promote Test Workflow ${Date.now()}`,
        ephemeral: true,
      },
    });
    expect(createResponse.status()).toBe(201);
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;
    expect(workflow.ephemeral).toBe(true);

    // Promote the workflow
    const promoteResponse = await page.request.post(`/api/workflows/${workflow.id}/promote`);
    expect(promoteResponse.ok()).toBe(true);
    const updated = await promoteResponse.json();
    expect(updated.ephemeral).toBe(false);
  });

  test('POST /api/workflows/:id/promote returns 400 for already durable workflow', async ({ page }) => {
    // First create a durable workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Already Durable Playbook',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Already Durable Workflow ${Date.now()}`,
        ephemeral: false,
      },
    });
    expect(createResponse.status()).toBe(201);
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    // Try to promote - should fail
    const promoteResponse = await page.request.post(`/api/workflows/${workflow.id}/promote`);
    expect(promoteResponse.status()).toBe(400);
    const body = await promoteResponse.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/workflows/:id/promote returns 404 for non-existent workflow', async ({ page }) => {
    const response = await page.request.post('/api/workflows/el-invalid999/promote');
    expect(response.status()).toBe(404);
  });

  // ============================================================================
  // UI Tests - Edit Title
  // ============================================================================

  test('workflow detail panel shows edit button on hover', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on first workflow
    await page.getByTestId(`workflow-item-${workflows[0].id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Hover over title area to reveal edit button
    await page.getByTestId('workflow-detail-title').hover();
    await expect(page.getByTestId('edit-title-btn')).toBeVisible();
  });

  test('clicking edit button shows title input', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on first workflow
    await page.getByTestId(`workflow-item-${workflows[0].id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click edit button
    await page.getByTestId('workflow-detail-title').hover();
    await page.getByTestId('edit-title-btn').click();

    // Input should be visible
    await expect(page.getByTestId('workflow-title-input')).toBeVisible();
    await expect(page.getByTestId('save-title-btn')).toBeVisible();
    await expect(page.getByTestId('cancel-edit-btn')).toBeVisible();
  });

  test('editing title and saving updates the workflow', async ({ page }) => {
    // Create a workflow to edit
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Edit Title Playbook',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Original Title ${Date.now()}`,
        ephemeral: false,
      },
    });
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on the workflow
    await page.getByTestId(`workflow-item-${workflow.id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Enter edit mode
    await page.getByTestId('workflow-detail-title').hover();
    await page.getByTestId('edit-title-btn').click();

    // Change the title
    const newTitle = `Updated Title ${Date.now()}`;
    await page.getByTestId('workflow-title-input').fill(newTitle);
    await page.getByTestId('save-title-btn').click();

    // Wait for update and verify
    await expect(page.getByTestId('workflow-detail-title')).toContainText(newTitle, { timeout: 5000 });
  });

  // ============================================================================
  // UI Tests - Status Transitions
  // ============================================================================

  test('pending workflow shows Start and Cancel buttons', async ({ page }) => {
    // Create a pending workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Status Workflow',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Pending Workflow ${Date.now()}`,
        ephemeral: false,
      },
    });
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on the workflow
    await page.getByTestId(`workflow-item-${workflow.id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Should show Start and Cancel buttons
    await expect(page.getByTestId('status-action-running')).toBeVisible();
    await expect(page.getByTestId('status-action-cancelled')).toBeVisible();
  });

  test('clicking Start changes workflow status to running', async ({ page }) => {
    // Create a pending workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Start Workflow',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Start Test Workflow ${Date.now()}`,
        ephemeral: false,
      },
    });
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on the workflow
    await page.getByTestId(`workflow-item-${workflow.id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click Start button
    await page.getByTestId('status-action-running').click();

    // Status badge should update
    const detailPanel = page.getByTestId('workflow-detail-panel');
    await expect(detailPanel.getByTestId('workflow-status-badge-running')).toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // UI Tests - Ephemeral Workflow Actions
  // ============================================================================

  test('ephemeral workflow shows Promote and Delete buttons', async ({ page }) => {
    // Create an ephemeral workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Ephemeral Buttons',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Ephemeral Workflow ${Date.now()}`,
        ephemeral: true,
      },
    });
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on the workflow
    await page.getByTestId(`workflow-item-${workflow.id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Should show ephemeral badge
    await expect(page.getByTestId('ephemeral-badge')).toBeVisible();

    // Should show Promote and Delete buttons
    await expect(page.getByTestId('promote-btn')).toBeVisible();
    await expect(page.getByTestId('delete-btn')).toBeVisible();
  });

  test('clicking Promote button makes workflow durable', async ({ page }) => {
    // Create an ephemeral workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Promote UI',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Promote UI Workflow ${Date.now()}`,
        ephemeral: true,
      },
    });
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on the workflow
    await page.getByTestId(`workflow-item-${workflow.id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click Promote button
    await page.getByTestId('promote-btn').click();

    // Ephemeral badge should disappear and buttons should be hidden
    await expect(page.getByTestId('ephemeral-badge')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('promote-btn')).not.toBeVisible({ timeout: 5000 });
  });

  test('clicking Delete button shows confirmation', async ({ page }) => {
    // Create an ephemeral workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Delete Confirm',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Delete Confirm Workflow ${Date.now()}`,
        ephemeral: true,
      },
    });
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on the workflow
    await page.getByTestId(`workflow-item-${workflow.id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click Delete button
    await page.getByTestId('delete-btn').click();

    // Should show confirmation
    await expect(page.getByTestId('delete-confirm-btn')).toBeVisible();
    await expect(page.getByTestId('delete-cancel-btn')).toBeVisible();
  });

  test('confirming Delete deletes the workflow', async ({ page }) => {
    // Create an ephemeral workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Delete Workflow',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Delete Workflow ${Date.now()}`,
        ephemeral: true,
      },
    });
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on the workflow
    await page.getByTestId(`workflow-item-${workflow.id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click Delete button then confirm
    await page.getByTestId('delete-btn').click();
    await page.getByTestId('delete-confirm-btn').click();

    // Panel should close (workflow deleted)
    await expect(page.getByTestId('workflow-detail-panel')).not.toBeVisible({ timeout: 5000 });

    // Verify workflow no longer exists via API
    const getResponse = await page.request.get(`/api/workflows/${workflow.id}`);
    expect(getResponse.status()).toBe(404);
  });

  test('durable workflow does not show Promote/Delete buttons', async ({ page }) => {
    // Create a durable workflow
    const createResponse = await page.request.post('/api/workflows/instantiate', {
      data: {
        playbook: {
          name: 'Test Durable No Buttons',
          version: '1.0.0',
          variables: [],
          steps: [{ id: 'step-1', title: 'Step 1', priority: 3 }],
        },
        createdBy: 'test-user',
        title: `Durable No Buttons Workflow ${Date.now()}`,
        ephemeral: false,
      },
    });
    const createResult = await createResponse.json();
    const workflow = createResult.workflow;

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on the workflow
    await page.getByTestId(`workflow-item-${workflow.id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Should NOT show ephemeral badge or buttons
    await expect(page.getByTestId('ephemeral-badge')).not.toBeVisible();
    await expect(page.getByTestId('promote-btn')).not.toBeVisible();
    await expect(page.getByTestId('delete-btn')).not.toBeVisible();
  });
});
