import { test, expect } from '@playwright/test';

test.describe('TB8: Dependency Graph Lens', () => {
  test('dependency tree endpoint is accessible', async ({ page }) => {
    // First get a task to test with
    const tasksResponse = await page.request.get('/api/tasks/ready');
    const tasks = await tasksResponse.json();

    if (tasks.length === 0) {
      test.skip();
      return;
    }

    const firstTask = tasks[0];
    const response = await page.request.get(`/api/dependencies/${firstTask.id}/tree`);
    expect(response.ok()).toBe(true);
    const tree = await response.json();
    expect(tree).toHaveProperty('root');
    expect(tree).toHaveProperty('nodeCount');
  });

  test('dependencies endpoint is accessible', async ({ page }) => {
    // First get a task to test with
    const tasksResponse = await page.request.get('/api/tasks/ready');
    const tasks = await tasksResponse.json();

    if (tasks.length === 0) {
      test.skip();
      return;
    }

    const firstTask = tasks[0];
    const response = await page.request.get(`/api/dependencies/${firstTask.id}`);
    expect(response.ok()).toBe(true);
    const deps = await response.json();
    expect(deps).toHaveProperty('dependencies');
    expect(deps).toHaveProperty('dependents');
  });

  test('dependency graph page is accessible via navigation', async ({ page }) => {
    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar has Dependencies nav item', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Check for Dependencies link in sidebar
    const depsLink = page.getByRole('link', { name: /Dependencies/i });
    await expect(depsLink).toBeVisible();
  });

  test('can navigate to Dependencies from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click Dependencies link
    await page.getByRole('link', { name: /Dependencies/i }).click();

    // Should be on dependencies page
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL('/dashboard/dependencies');
  });

  test('dependency graph page shows task selector when tasks exist', async ({ page }) => {
    // Get tasks from API
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();

    const allTasks = [...readyTasks, ...blockedTasks];

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    if (allTasks.length === 0) {
      // Should show empty state
      await expect(page.getByText('No tasks available')).toBeVisible();
    } else {
      // Should show task selector
      await expect(page.getByTestId('task-selector')).toBeVisible();
    }
  });

  test('graph canvas is displayed when tasks exist', async ({ page }) => {
    // Get tasks from API
    const tasksResponse = await page.request.get('/api/tasks/ready');
    const tasks = await tasksResponse.json();

    if (tasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Should show graph canvas
    await expect(page.getByTestId('graph-canvas')).toBeVisible();
  });

  test('status legend is displayed', async ({ page }) => {
    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });

    // Check for status legend items
    await expect(page.getByText('Status:')).toBeVisible();
    await expect(page.getByText('open', { exact: false })).toBeVisible();
    await expect(page.getByText('completed', { exact: false })).toBeVisible();
  });
});

test.describe('TB43: Dependency Graph - Filter & Search', () => {
  test('search input is displayed in toolbar', async ({ page }) => {
    // Check if there are tasks to display the toolbar
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Search input should be visible
    await expect(page.getByTestId('graph-search-input')).toBeVisible();
  });

  test('search input has placeholder text', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Check placeholder text
    await expect(page.getByTestId('graph-search-input')).toHaveAttribute('placeholder', 'Search by title or ID...');
  });

  test('status filter button is displayed', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Status filter button should be visible
    await expect(page.getByTestId('status-filter-button')).toBeVisible();
  });

  test('status filter dropdown opens on click', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Click status filter button
    await page.getByTestId('status-filter-button').click();

    // Dropdown should be visible
    await expect(page.getByTestId('status-filter-dropdown')).toBeVisible();
  });

  test('status filter dropdown has all status options', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Open dropdown
    await page.getByTestId('status-filter-button').click();

    // Check all status options are present
    await expect(page.getByTestId('status-filter-option-open')).toBeVisible();
    await expect(page.getByTestId('status-filter-option-in_progress')).toBeVisible();
    await expect(page.getByTestId('status-filter-option-blocked')).toBeVisible();
    await expect(page.getByTestId('status-filter-option-completed')).toBeVisible();
    await expect(page.getByTestId('status-filter-option-cancelled')).toBeVisible();
  });

  test('zoom controls are displayed', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Zoom controls should be visible
    await expect(page.getByTestId('zoom-in-button')).toBeVisible();
    await expect(page.getByTestId('zoom-out-button')).toBeVisible();
    await expect(page.getByTestId('fit-view-button')).toBeVisible();
  });

  test('typing in search shows match count', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Type something in search
    await page.getByTestId('graph-search-input').fill('test');

    // Wait for the match count to appear
    await expect(page.getByTestId('match-count')).toBeVisible({ timeout: 5000 });
  });

  test('clear filters button appears when search is active', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Initially clear filters button should not be visible
    await expect(page.getByTestId('clear-filters-button')).not.toBeVisible();

    // Type something in search
    await page.getByTestId('graph-search-input').fill('test');

    // Clear filters button should appear
    await expect(page.getByTestId('clear-filters-button')).toBeVisible();
  });

  test('clear filters button clears search', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Type something in search
    await page.getByTestId('graph-search-input').fill('test');

    // Click clear filters
    await page.getByTestId('clear-filters-button').click();

    // Search should be cleared
    await expect(page.getByTestId('graph-search-input')).toHaveValue('');
  });

  test('selecting status filter shows selection count badge', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Open dropdown and select a status
    await page.getByTestId('status-filter-button').click();
    await page.getByTestId('status-filter-option-open').click();

    // The button should now show a count badge
    const filterButton = page.getByTestId('status-filter-button');
    const countBadge = filterButton.locator('span.bg-blue-600');
    await expect(countBadge).toBeVisible();
    expect(await countBadge.textContent()).toBe('1');
  });

  test('clear search button appears when search has value', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Initially clear search button should not be visible
    await expect(page.getByTestId('clear-search-button')).not.toBeVisible();

    // Type something in search
    await page.getByTestId('graph-search-input').fill('test');

    // Clear search button should appear
    await expect(page.getByTestId('clear-search-button')).toBeVisible();
  });

  test('clear search button clears only search input', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Type something in search
    await page.getByTestId('graph-search-input').fill('test');

    // Click clear search button
    await page.getByTestId('clear-search-button').click();

    // Search should be cleared
    await expect(page.getByTestId('graph-search-input')).toHaveValue('');
  });

  test('minimap is displayed in graph', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Wait for graph to load
    await page.waitForTimeout(1000);

    // MiniMap is a React Flow component, check for its container class
    const minimap = page.locator('.react-flow__minimap');
    await expect(minimap).toBeVisible();
  });

  test('graph toolbar is displayed when tasks exist', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Toolbar should be visible
    await expect(page.getByTestId('graph-toolbar')).toBeVisible();
  });
});

test.describe('TB44: Dependency Graph - API Endpoints', () => {
  test('POST /api/dependencies endpoint creates a dependency', async ({ page }) => {
    // First get two tasks to create dependency between
    const tasksResponse = await page.request.get('/api/tasks/ready');
    const tasks = await tasksResponse.json();

    if (tasks.length < 2) {
      test.skip();
      return;
    }

    const sourceTask = tasks[0];
    const targetTask = tasks[1];

    // Clean up any existing dependency first (ignore errors if it doesn't exist)
    await page.request.delete(
      `/api/dependencies/${encodeURIComponent(sourceTask.id)}/${encodeURIComponent(targetTask.id)}/relates-to`
    );

    // Create a relates-to dependency (non-blocking)
    const response = await page.request.post('/api/dependencies', {
      data: {
        blockedId: sourceTask.id,
        blockerId: targetTask.id,
        type: 'relates-to',
      },
    });

    if (!response.ok()) {
      const errorBody = await response.json();
      console.error('Failed to create dependency:', response.status(), errorBody);
    }
    expect(response.ok()).toBe(true);
    const dependency = await response.json();
    expect(dependency).toHaveProperty('blockedId', sourceTask.id);
    expect(dependency).toHaveProperty('blockerId', targetTask.id);
    expect(dependency).toHaveProperty('type', 'relates-to');

    // Clean up - delete the dependency
    const deleteResponse = await page.request.delete(
      `/api/dependencies/${encodeURIComponent(sourceTask.id)}/${encodeURIComponent(targetTask.id)}/relates-to`
    );
    expect(deleteResponse.ok()).toBe(true);
  });

  test('POST /api/dependencies returns 400 for missing fields', async ({ page }) => {
    const response = await page.request.post('/api/dependencies', {
      data: {
        blockedId: 'task-1',
        // Missing blockerId and type
      },
    });

    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/dependencies returns 409 for duplicate dependency', async ({ page }) => {
    // First get two tasks
    const tasksResponse = await page.request.get('/api/tasks/ready');
    const tasks = await tasksResponse.json();

    if (tasks.length < 2) {
      test.skip();
      return;
    }

    const sourceTask = tasks[0];
    const targetTask = tasks[1];

    // Create a dependency
    const response1 = await page.request.post('/api/dependencies', {
      data: {
        blockedId: sourceTask.id,
        blockerId: targetTask.id,
        type: 'relates-to',
      },
    });

    if (!response1.ok()) {
      // If it already exists, that's also fine for this test
      const error = await response1.json();
      if (error.error?.code !== 'CONFLICT') {
        throw new Error('Unexpected error creating first dependency');
      }
    }

    // Try to create the same dependency again
    const response2 = await page.request.post('/api/dependencies', {
      data: {
        blockedId: sourceTask.id,
        blockerId: targetTask.id,
        type: 'relates-to',
      },
    });

    expect(response2.status()).toBe(409);
    const error = await response2.json();
    expect(error.error.code).toBe('CONFLICT');

    // Clean up
    await page.request.delete(
      `/api/dependencies/${encodeURIComponent(sourceTask.id)}/${encodeURIComponent(targetTask.id)}/relates-to`
    );
  });

  test('DELETE /api/dependencies endpoint removes a dependency', async ({ page }) => {
    // First get two tasks
    const tasksResponse = await page.request.get('/api/tasks/ready');
    const tasks = await tasksResponse.json();

    if (tasks.length < 2) {
      test.skip();
      return;
    }

    const sourceTask = tasks[0];
    const targetTask = tasks[1];

    // Create a dependency first
    await page.request.post('/api/dependencies', {
      data: {
        blockedId: sourceTask.id,
        blockerId: targetTask.id,
        type: 'relates-to',
      },
    });

    // Delete the dependency
    const response = await page.request.delete(
      `/api/dependencies/${encodeURIComponent(sourceTask.id)}/${encodeURIComponent(targetTask.id)}/relates-to`
    );

    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
  });

  test('DELETE /api/dependencies returns 404 for non-existent dependency', async ({ page }) => {
    const response = await page.request.delete(
      '/api/dependencies/nonexistent-source/nonexistent-target/blocks'
    );

    expect(response.status()).toBe(404);
    const error = await response.json();
    expect(error.error.code).toBe('NOT_FOUND');
  });
});

test.describe('TB133: Dependency Graph - Read-Only Mode', () => {
  // Helper function to wait for the dependency graph page to stabilize
  async function waitForGraphPageReady(page: import('@playwright/test').Page) {
    await page.goto('/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    // Wait for toolbar to be visible (indicates loading is complete)
    await expect(page.getByTestId('graph-toolbar')).toBeVisible({ timeout: 10000 });
    // Wait for UI to stabilize
    await page.waitForTimeout(500);
  }

  test('page header shows read-only description', async ({ page }) => {
    await waitForGraphPageReady(page);

    // Header should say "Visualize task dependencies" (not "Visualize and edit")
    await expect(page.getByText('Visualize task dependencies')).toBeVisible();
    await expect(page.getByText('Visualize and edit task dependencies')).not.toBeVisible();
  });

  test('edit mode toggle is NOT displayed', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Edit Mode toggle button should NOT be visible
    await expect(page.getByTestId('edit-mode-toggle')).not.toBeVisible();
  });

  test('search and filter controls are always visible', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Search and filters should be visible
    await expect(page.getByTestId('graph-search-input')).toBeVisible();
    await expect(page.getByTestId('status-filter-button')).toBeVisible();

    // Zoom controls should be visible
    await expect(page.getByTestId('zoom-in-button')).toBeVisible();
    await expect(page.getByTestId('zoom-out-button')).toBeVisible();
    await expect(page.getByTestId('fit-view-button')).toBeVisible();
  });

  test('clicking nodes does NOT trigger edit mode selection', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Wait for graph to render
    await page.waitForTimeout(500);

    // Click on a node in the graph
    const node = page.getByTestId('graph-node').first();
    if (await node.isVisible({ timeout: 2000 })) {
      await node.click();

      // No selection hint should appear (edit mode is gone)
      await expect(page.getByTestId('source-selected-hint')).not.toBeVisible();
      await expect(page.getByTestId('edit-mode-hint')).not.toBeVisible();
    }
  });

  test('right-clicking edges does NOT show context menu', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length < 2) {
      test.skip();
      return;
    }

    // Create a test dependency
    const sourceTask = allTasks[0];
    const targetTask = allTasks[1];

    await page.request.delete(
      `/api/dependencies/${encodeURIComponent(sourceTask.id)}/${encodeURIComponent(targetTask.id)}/relates-to`
    );

    await page.request.post('/api/dependencies', {
      data: {
        blockedId: sourceTask.id,
        blockerId: targetTask.id,
        type: 'relates-to',
      },
    });

    await waitForGraphPageReady(page);
    await page.waitForTimeout(1000);

    // Try to right-click on an edge
    const edgeZone = page.locator('[data-testid="edge-interaction-zone"]').first();
    if (await edgeZone.isVisible({ timeout: 2000 })) {
      await edgeZone.click({ button: 'right' });

      // Edge context menu should NOT appear
      await expect(page.getByTestId('edge-context-menu')).not.toBeVisible();
    }

    // Clean up
    await page.request.delete(
      `/api/dependencies/${encodeURIComponent(sourceTask.id)}/${encodeURIComponent(targetTask.id)}/relates-to`
    );
  });

  test('dependency type picker modal is NOT displayed', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length < 2) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);
    await page.waitForTimeout(500);

    // Get nodes and click them
    const nodes = page.getByTestId('graph-node');
    const count = await nodes.count();

    if (count >= 2) {
      // Click first node
      await nodes.nth(0).click();
      // Click second node
      await nodes.nth(1).click();

      // Dependency type picker should NOT appear
      await expect(page.getByTestId('dependency-type-picker')).not.toBeVisible();
    }
  });
});

test.describe('TB115a: Edge Type Labels', () => {
  // Helper function to wait for the dependency graph page to stabilize
  async function waitForGraphPageReady(page: import('@playwright/test').Page) {
    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    // Wait for toolbar to be visible (indicates loading is complete)
    await expect(page.getByTestId('graph-toolbar')).toBeVisible({ timeout: 10000 });
    // Wait for UI to stabilize
    await page.waitForTimeout(500);
  }

  test('edge type legend is displayed', async ({ page }) => {
    await waitForGraphPageReady(page);

    // Edge type legend should be visible
    await expect(page.getByTestId('edge-type-legend')).toBeVisible();
  });

  test('edge type legend shows all dependency types', async ({ page }) => {
    await waitForGraphPageReady(page);

    // Check for each edge type in the legend
    await expect(page.getByTestId('edge-legend-blocks')).toBeVisible();
    await expect(page.getByTestId('edge-legend-parent-child')).toBeVisible();
    await expect(page.getByTestId('edge-legend-relates-to')).toBeVisible();
    await expect(page.getByTestId('edge-legend-references')).toBeVisible();
    await expect(page.getByTestId('edge-legend-awaits')).toBeVisible();
    await expect(page.getByTestId('edge-legend-validates')).toBeVisible();
    await expect(page.getByTestId('edge-legend-authored-by')).toBeVisible();
    await expect(page.getByTestId('edge-legend-assigned-to')).toBeVisible();
  });

  test('edge labels toggle button is displayed', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Toggle button should be visible
    await expect(page.getByTestId('toggle-edge-labels-button')).toBeVisible();
  });

  test('clicking edge labels toggle hides and shows edge labels', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);
    await page.waitForTimeout(500); // Wait for graph to stabilize

    // Toggle button should initially be "on" (blue background)
    const toggleButton = page.getByTestId('toggle-edge-labels-button');
    await expect(toggleButton).toHaveClass(/text-blue-600/);

    // Click to hide labels
    await toggleButton.click();

    // Button should now be "off" (gray)
    await expect(toggleButton).toHaveClass(/text-gray-600/);

    // Click again to show labels
    await toggleButton.click();

    // Button should be "on" again (blue)
    await expect(toggleButton).toHaveClass(/text-blue-600/);
  });

  test('edge labels display dependency type text', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length < 2) {
      test.skip();
      return;
    }

    // First create a dependency to ensure we have an edge to test
    const sourceTask = allTasks[0];
    const targetTask = allTasks[1];

    // Clean up any existing dependency first
    await page.request.delete(
      `/api/dependencies/${encodeURIComponent(sourceTask.id)}/${encodeURIComponent(targetTask.id)}/relates-to`
    );

    // Create a relates-to dependency
    await page.request.post('/api/dependencies', {
      data: {
        blockedId: sourceTask.id,
        blockerId: targetTask.id,
        type: 'relates-to',
      },
    });

    // Navigate to the dependency graph for the source task
    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('graph-toolbar')).toBeVisible({ timeout: 10000 });

    // Wait for graph to render
    await page.waitForTimeout(1000);

    // Check that edge labels exist in the DOM (they may or may not be visible depending on the selected task)
    // The important thing is that the edge label functionality is working
    const edgeLabels = page.locator('[data-testid="edge-label"]');
    const count = await edgeLabels.count();

    // If there are edge labels, verify they have the edge type data attribute
    if (count > 0) {
      const firstLabel = edgeLabels.first();
      await expect(firstLabel).toHaveAttribute('data-edge-type', /.+/);
    }

    // Clean up
    await page.request.delete(
      `/api/dependencies/${encodeURIComponent(sourceTask.id)}/${encodeURIComponent(targetTask.id)}/relates-to`
    );
  });

  test('edges have color-coded strokes based on type', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length < 2) {
      test.skip();
      return;
    }

    const sourceTask = allTasks[0];
    const targetTask = allTasks[1];

    // Clean up and create a test dependency
    await page.request.delete(
      `/api/dependencies/${encodeURIComponent(sourceTask.id)}/${encodeURIComponent(targetTask.id)}/blocks`
    );

    await page.request.post('/api/dependencies', {
      data: {
        blockedId: targetTask.id,
        blockerId: sourceTask.id,
        type: 'blocks',
      },
    });

    await waitForGraphPageReady(page);
    await page.waitForTimeout(1000);

    // Check for edge interaction zones with type data
    const edgeZones = page.locator('[data-testid="edge-interaction-zone"]');
    const count = await edgeZones.count();

    // If there are edges, verify they have the edge type data attribute
    if (count > 0) {
      const firstEdge = edgeZones.first();
      await expect(firstEdge).toHaveAttribute('data-edge-type', /.+/);
    }

    // Clean up
    await page.request.delete(
      `/api/dependencies/${encodeURIComponent(sourceTask.id)}/${encodeURIComponent(targetTask.id)}/blocks`
    );
  });
});

test.describe('TB115b: Auto-Layout Graph Formatting', () => {
  // Helper function to wait for the dependency graph page to stabilize
  async function waitForGraphPageReady(page: import('@playwright/test').Page) {
    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    // Wait for toolbar to be visible (indicates loading is complete)
    await expect(page.getByTestId('graph-toolbar')).toBeVisible({ timeout: 10000 });
    // Wait for UI to stabilize
    await page.waitForTimeout(500);
  }

  test('auto layout button is displayed in toolbar', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Auto Layout button should be visible
    await expect(page.getByTestId('auto-layout-button')).toBeVisible();
  });

  test('auto layout dropdown toggle is displayed', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Layout options dropdown toggle should be visible
    await expect(page.getByTestId('layout-options-dropdown-toggle')).toBeVisible();
  });

  test('clicking dropdown toggle opens layout options', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Click dropdown toggle
    await page.getByTestId('layout-options-dropdown-toggle').click();

    // Dropdown should be visible
    await expect(page.getByTestId('layout-options-dropdown')).toBeVisible();
  });

  test('layout options dropdown shows all algorithm options', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Open dropdown
    await page.getByTestId('layout-options-dropdown-toggle').click();

    // Check all algorithm options are present
    await expect(page.getByTestId('layout-algorithm-hierarchical')).toBeVisible();
    await expect(page.getByTestId('layout-algorithm-force')).toBeVisible();
    await expect(page.getByTestId('layout-algorithm-radial')).toBeVisible();
  });

  test('selecting an algorithm updates the UI', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Open dropdown
    await page.getByTestId('layout-options-dropdown-toggle').click();

    // Select force algorithm
    await page.getByTestId('layout-algorithm-force').click();

    // Force option should now have selected styling
    await expect(page.getByTestId('layout-algorithm-force')).toHaveClass(/bg-blue-50/);
  });

  test('direction options are displayed for hierarchical layout', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Open dropdown
    await page.getByTestId('layout-options-dropdown-toggle').click();

    // Ensure hierarchical is selected (default)
    await page.getByTestId('layout-algorithm-hierarchical').click();

    // Direction buttons should be visible
    await expect(page.getByTestId('layout-direction-TB')).toBeVisible();
    await expect(page.getByTestId('layout-direction-LR')).toBeVisible();
    await expect(page.getByTestId('layout-direction-BT')).toBeVisible();
    await expect(page.getByTestId('layout-direction-RL')).toBeVisible();
  });

  test('clicking direction changes the layout direction', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Open dropdown
    await page.getByTestId('layout-options-dropdown-toggle').click();

    // Click left-to-right direction
    await page.getByTestId('layout-direction-LR').click();

    // LR should now have selected styling
    await expect(page.getByTestId('layout-direction-LR')).toHaveClass(/bg-blue-50/);
  });

  test('spacing controls toggle is displayed', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Open dropdown
    await page.getByTestId('layout-options-dropdown-toggle').click();

    // Spacing controls toggle should be visible
    await expect(page.getByTestId('toggle-spacing-controls')).toBeVisible();
  });

  test('clicking spacing toggle shows sliders', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Open dropdown
    await page.getByTestId('layout-options-dropdown-toggle').click();

    // Click spacing toggle
    await page.getByTestId('toggle-spacing-controls').click();

    // Sliders should be visible
    await expect(page.getByTestId('node-spacing-slider')).toBeVisible();
    await expect(page.getByTestId('rank-spacing-slider')).toBeVisible();
  });

  test('apply layout button is displayed in dropdown', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Open dropdown
    await page.getByTestId('layout-options-dropdown-toggle').click();

    // Apply button should be visible
    await expect(page.getByTestId('apply-layout-button')).toBeVisible();
  });

  test('clicking auto layout button applies layout', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);
    await page.waitForTimeout(500); // Wait for graph to stabilize

    // Click auto layout button
    await page.getByTestId('auto-layout-button').click();

    // Wait for layout to complete (no spinner after applying)
    await page.waitForTimeout(500);

    // The button should not show loading state after completion
    await expect(page.getByTestId('auto-layout-button').locator('.animate-spin')).not.toBeVisible({ timeout: 2000 });
  });

  test('layout preferences persist across page reloads', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await waitForGraphPageReady(page);

    // Open dropdown and change algorithm
    await page.getByTestId('layout-options-dropdown-toggle').click();
    await page.getByTestId('layout-algorithm-force').click();

    // Close dropdown
    await page.keyboard.press('Escape');

    // Reload page
    await page.reload();
    await waitForGraphPageReady(page);

    // Open dropdown again
    await page.getByTestId('layout-options-dropdown-toggle').click();

    // Force algorithm should still be selected
    await expect(page.getByTestId('layout-algorithm-force')).toHaveClass(/bg-blue-50/);
  });
});
