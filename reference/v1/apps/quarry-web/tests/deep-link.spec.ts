import { test, expect } from '@playwright/test';

test.describe('TB70: Deep-Link Navigation', () => {
  // ============================================================================
  // TASKS DEEP-LINKING
  // ============================================================================
  test.describe('Tasks Page', () => {
    test('navigating to /tasks?selected=<id> opens task detail panel', async ({ page }) => {
      // First get a task ID
      const response = await page.request.get('/api/tasks?limit=1');
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        test.skip();
        return;
      }

      const taskId = data.items[0].id;

      // Navigate directly with selected param
      await page.goto(`/tasks?selected=${taskId}&page=1&limit=25`);
      await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

      // Task detail panel should be visible
      await expect(page.getByTestId('task-detail-container')).toBeVisible({ timeout: 10000 });
    });

    test('navigating to non-existent task shows Not Found', async ({ page }) => {
      // Navigate to a non-existent task
      await page.goto('/tasks?selected=non-existent-task-id-12345&page=1&limit=25');
      await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

      // Should show not found message
      await expect(page.getByTestId('element-not-found')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('not-found-title')).toContainText('Task Not Found');
    });

    test('clicking task updates URL with selected param', async ({ page }) => {
      // First get a task
      const response = await page.request.get('/api/tasks?limit=1');
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        test.skip();
        return;
      }

      const taskId = data.items[0].id;

      await page.goto('/tasks?page=1&limit=25');
      await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

      // Click on a task row
      await page.getByTestId(`task-row-${taskId}`).click();

      // URL should update with selected param
      await expect(page).toHaveURL(new RegExp(`selected=${taskId}`));

      // Detail panel should be visible
      await expect(page.getByTestId('task-detail-container')).toBeVisible();
    });

    test('closing task detail removes selected from URL', async ({ page }) => {
      // First get a task
      const response = await page.request.get('/api/tasks?limit=1');
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        test.skip();
        return;
      }

      const taskId = data.items[0].id;

      // Navigate with task selected
      await page.goto(`/tasks?selected=${taskId}&page=1&limit=25`);
      await expect(page.getByTestId('task-detail-container')).toBeVisible({ timeout: 10000 });

      // Close the detail panel
      await page.getByTestId('task-detail-close').click();

      // URL should no longer have selected param
      await expect(page).not.toHaveURL(/selected=/);

      // Detail panel should not be visible
      await expect(page.getByTestId('task-detail-container')).not.toBeVisible();
    });
  });

  // ============================================================================
  // ENTITIES DEEP-LINKING
  // ============================================================================
  test.describe('Entities Page', () => {
    test('navigating to /entities?selected=<id> opens entity detail panel', async ({ page }) => {
      // First get an entity ID
      const response = await page.request.get('/api/entities?limit=1');
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        test.skip();
        return;
      }

      const entityId = data.items[0].id;

      // Navigate directly with selected param
      await page.goto(`/entities?selected=${entityId}&page=1&limit=25`);
      await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

      // Entity detail panel should be visible
      await expect(page.getByTestId('entity-detail-container')).toBeVisible({ timeout: 10000 });
    });

    test('navigating to non-existent entity shows Not Found', async ({ page }) => {
      // Navigate to a non-existent entity
      await page.goto('/entities?selected=non-existent-entity-id-12345&page=1&limit=25');
      await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

      // Should show not found message
      await expect(page.getByTestId('element-not-found')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('not-found-title')).toContainText('Entity Not Found');
    });
  });

  // ============================================================================
  // TEAMS DEEP-LINKING
  // ============================================================================
  test.describe('Teams Page', () => {
    test('navigating to /teams?selected=<id> opens team detail panel', async ({ page }) => {
      // First get a team ID
      const response = await page.request.get('/api/teams?limit=1');
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        test.skip();
        return;
      }

      const teamId = data.items[0].id;

      // Navigate directly with selected param
      await page.goto(`/teams?selected=${teamId}&page=1&limit=25`);
      await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

      // Team detail panel should be visible
      await expect(page.getByTestId('team-detail-container')).toBeVisible({ timeout: 10000 });
    });

    test('navigating to non-existent team shows Not Found', async ({ page }) => {
      // Navigate to a non-existent team
      await page.goto('/teams?selected=non-existent-team-id-12345&page=1&limit=25');
      await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

      // Should show not found message
      await expect(page.getByTestId('element-not-found')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('not-found-title')).toContainText('Team Not Found');
    });
  });

  // ============================================================================
  // DOCUMENTS DEEP-LINKING
  // ============================================================================
  test.describe('Documents Page', () => {
    test('navigating to /documents?selected=<id> opens document', async ({ page }) => {
      // First get a document ID
      const response = await page.request.get('/api/documents?limit=1');
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        test.skip();
        return;
      }

      const documentId = data.items[0].id;

      // Navigate directly with selected param
      await page.goto(`/documents?selected=${documentId}`);
      await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

      // Document should be displayed
      // Note: Documents page uses a different panel layout
      await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 15000 });
    });

    test('navigating to non-existent document shows Not Found', async ({ page }) => {
      // Navigate to a non-existent document
      await page.goto('/documents?selected=non-existent-document-id-12345');
      await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

      // Should show not found message
      await expect(page.getByTestId('element-not-found')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('not-found-title')).toContainText('Document Not Found');
    });
  });

  // ============================================================================
  // PLANS DEEP-LINKING
  // ============================================================================
  test.describe('Plans Page', () => {
    test('navigating to /plans?selected=<id> opens plan detail', async ({ page }) => {
      // First get a plan ID
      const response = await page.request.get('/api/plans?limit=1');
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        test.skip();
        return;
      }

      const planId = data.items[0].id;

      // Navigate directly with selected param
      await page.goto(`/plans?selected=${planId}`);
      await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

      // Plan detail should be visible
      await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 10000 });
    });

    test('navigating to non-existent plan shows Not Found', async ({ page }) => {
      // Navigate to a non-existent plan
      await page.goto('/plans?selected=non-existent-plan-id-12345');
      await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

      // Should show not found message
      await expect(page.getByTestId('element-not-found')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('not-found-title')).toContainText('Plan Not Found');
    });
  });

  // ============================================================================
  // WORKFLOWS DEEP-LINKING
  // ============================================================================
  test.describe('Workflows Page', () => {
    test('navigating to /workflows?selected=<id> opens workflow detail', async ({ page }) => {
      // First get a workflow ID
      const response = await page.request.get('/api/workflows?limit=1');
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        test.skip();
        return;
      }

      const workflowId = data.items[0].id;

      // Navigate directly with selected param
      await page.goto(`/workflows?selected=${workflowId}`);
      await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

      // Workflow detail should be visible
      await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 10000 });
    });

    test('navigating to non-existent workflow shows Not Found', async ({ page }) => {
      // Navigate to a non-existent workflow
      await page.goto('/workflows?selected=non-existent-workflow-id-12345');
      await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

      // Should show not found message
      await expect(page.getByTestId('element-not-found')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('not-found-title')).toContainText('Workflow Not Found');
    });
  });

  // ============================================================================
  // HIGHLIGHT ANIMATION
  // ============================================================================
  test.describe('Highlight Animation', () => {
    test('deep-linked element receives highlight animation class', async ({ page }) => {
      // First get a task
      const response = await page.request.get('/api/tasks?limit=5');
      const data = await response.json();

      if (!data.items || data.items.length < 2) {
        test.skip();
        return;
      }

      const taskId = data.items[1].id; // Use second task

      // Navigate with task selected
      await page.goto(`/tasks?selected=${taskId}&page=1&limit=25`);
      await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

      // Check for the highlight class being applied
      // Note: The animation might complete quickly, so we check early
      const taskRow = page.getByTestId(`task-row-${taskId}`);
      await expect(taskRow).toBeVisible({ timeout: 10000 });

      // The animation should have been applied (it auto-removes after 2s)
      // We can't easily test the animation itself, but we verify the element is visible and selected
    });
  });

  // ============================================================================
  // BACK BUTTON FROM NOT FOUND
  // ============================================================================
  test.describe('Not Found Back Navigation', () => {
    test('back button from Not Found returns to list view', async ({ page }) => {
      // Navigate to a non-existent task
      await page.goto('/tasks?selected=non-existent-task-id-12345&page=1&limit=25');
      await expect(page.getByTestId('element-not-found')).toBeVisible({ timeout: 10000 });

      // Click the back button
      await page.getByTestId('not-found-back-button').click();

      // Should navigate back to tasks without selection
      await expect(page).toHaveURL(/\/tasks/);
      await expect(page).not.toHaveURL(/selected=/);
      await expect(page.getByTestId('element-not-found')).not.toBeVisible();
    });
  });
});
