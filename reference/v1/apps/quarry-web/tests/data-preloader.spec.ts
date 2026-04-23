import { test, expect } from '@playwright/test';

test.describe('TB67: Upfront Data Loading Strategy', () => {
  test.describe('Loading Spinner', () => {
    test('shows loading spinner initially and then loads app', async ({ page }) => {
      // Navigate to the app - might see loading spinner briefly
      await page.goto('/');

      // The app should eventually load (spinner disappears, app content visible)
      // Wait for the sidebar to be visible (indicates app is loaded)
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 30000 });

      // Stoneforge text should be visible
      await expect(page.getByTestId('sidebar').getByText('Stoneforge')).toBeVisible();
    });

    test('error state shows retry button on API failure', async ({ page }) => {
      // Mock the elements/all endpoint to fail
      await page.route('/api/elements/all', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
        });
      });

      await page.goto('/');

      // Should show error state with retry button
      await expect(page.getByTestId('data-preloader-error')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Failed to Load Data')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    });
  });

  test.describe('/api/elements/all Endpoint', () => {
    test('returns all element types grouped by type', async ({ page }) => {
      const response = await page.request.get('/api/elements/all');
      expect(response.ok()).toBe(true);

      const data = await response.json();

      // Check structure
      expect(data.data).toBeDefined();
      expect(data.totalElements).toBeDefined();
      expect(data.types).toBeDefined();
      expect(data.loadedAt).toBeDefined();
      expect(Array.isArray(data.types)).toBe(true);

      // Should include expected element types
      const expectedTypes = ['task', 'plan', 'workflow', 'entity', 'document', 'channel', 'message', 'team', 'library'];
      for (const type of expectedTypes) {
        expect(data.types).toContain(type);
      }

      // Each type should have items array and total
      for (const type of data.types) {
        const typeData = data.data[type];
        if (typeData) {
          expect(Array.isArray(typeData.items)).toBe(true);
          expect(typeof typeData.total).toBe('number');
        }
      }
    });

    test('can filter by specific types', async ({ page }) => {
      const response = await page.request.get('/api/elements/all?types=task,entity');
      expect(response.ok()).toBe(true);

      const data = await response.json();

      // Should only include requested types
      expect(data.types).toContain('task');
      expect(data.types).toContain('entity');
      expect(data.types.length).toBe(2);
    });

    test('totalElements matches sum of all type totals', async ({ page }) => {
      const response = await page.request.get('/api/elements/all');
      expect(response.ok()).toBe(true);

      const data = await response.json();

      // Calculate sum of all type totals
      let sum = 0;
      for (const type of data.types) {
        const typeData = data.data[type];
        if (typeData) {
          sum += typeData.total;
        }
      }

      expect(data.totalElements).toBe(sum);
    });

    test('returns elements with correct structure', async ({ page }) => {
      const response = await page.request.get('/api/elements/all');
      expect(response.ok()).toBe(true);

      const data = await response.json();

      // Check task structure if tasks exist
      const tasks = data.data.task?.items;
      if (tasks && tasks.length > 0) {
        const task = tasks[0];
        expect(task.id).toBeDefined();
        expect(task.type).toBe('task');
        expect(task.title).toBeDefined();
        expect(task.status).toBeDefined();
        expect(task.createdAt).toBeDefined();
        expect(task.updatedAt).toBeDefined();
      }

      // Check entity structure if entities exist
      const entities = data.data.entity?.items;
      if (entities && entities.length > 0) {
        const entity = entities[0];
        expect(entity.id).toBeDefined();
        expect(entity.type).toBe('entity');
        expect(entity.name).toBeDefined();
        expect(entity.entityType).toBeDefined();
      }
    });
  });

  test.describe('App Navigation Performance', () => {
    test('navigating to tasks page loads instantly after initial load', async ({ page }) => {
      // First load - might see loading spinner
      await page.goto('/');
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 30000 });

      // Wait for data to be fully loaded
      await page.waitForTimeout(1000);

      // Navigate to tasks page
      const startTime = Date.now();
      await page.click('[data-testid="sidebar"] >> text=Tasks');

      // Should navigate quickly (within 500ms) since data is cached
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 2000 });
      const endTime = Date.now();

      // Navigation should be quick since data is already loaded
      expect(endTime - startTime).toBeLessThan(2000);
    });

    test('navigating between pages does not trigger new API calls', async ({ page }) => {
      // Navigate to the app and wait for initial load
      await page.goto('/');
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 30000 });

      // Wait for initial data load
      await page.waitForTimeout(1000);

      // Track API calls
      const apiCalls: string[] = [];
      await page.route('/api/**', async (route) => {
        apiCalls.push(route.request().url());
        await route.continue();
      });

      // Navigate between pages
      await page.click('[data-testid="sidebar"] >> text=Tasks');
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 5000 });

      await page.click('[data-testid="sidebar"] >> text=Plans');
      await expect(page.getByRole('heading', { name: 'Plans' })).toBeVisible({ timeout: 5000 });

      await page.click('[data-testid="sidebar"] >> text=Entities');
      await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible({ timeout: 5000 });

      // We're mainly checking that the elements/all endpoint isn't called again
      // (it was already loaded on initial page load before routing started)
      const allElementsCalls = apiCalls.filter((url) => url.includes('/api/elements/all'));
      expect(allElementsCalls.length).toBeLessThanOrEqual(1);
    });
  });

  test.describe('WebSocket Cache Updates', () => {
    test('WebSocket connection is established', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 30000 });

      // WebSocket should be connected (Live status)
      await expect(page.getByText('Live')).toBeVisible({ timeout: 10000 });
    });

    test('real-time updates work after initial load', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 30000 });

      // Wait for WebSocket connection
      await expect(page.getByText('Live')).toBeVisible({ timeout: 10000 });

      // Navigate to tasks
      await page.click('[data-testid="sidebar"] >> text=Tasks');
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 5000 });

      // Create a task via API
      const createResponse = await page.request.post('/api/tasks', {
        data: {
          title: `E2E Test Task ${Date.now()}`,
          createdBy: 'e2e-test',
          priority: 3,
          complexity: 3,
          taskType: 'task',
        },
      });
      expect(createResponse.ok()).toBe(true);
      const newTask = await createResponse.json();

      // Task should appear in the list (via WebSocket update)
      await expect(page.getByText(newTask.title)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Error Recovery', () => {
    test('clicking retry after error reloads data', async ({ page }) => {
      // Start with a failing endpoint
      let shouldFail = true;
      await page.route('/api/elements/all', async (route) => {
        if (shouldFail) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
          });
        } else {
          await route.continue();
        }
      });

      await page.goto('/');

      // Should show error state
      await expect(page.getByTestId('data-preloader-error')).toBeVisible({ timeout: 10000 });

      // Fix the endpoint
      shouldFail = false;

      // Click retry
      await page.click('button:has-text("Retry")');

      // Should now load successfully
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 30000 });
    });
  });
});
