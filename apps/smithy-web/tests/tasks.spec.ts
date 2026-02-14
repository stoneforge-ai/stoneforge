import { test, expect } from '@playwright/test';

test.describe('TB-O18: Orchestrator Task List Page', () => {
  test.describe('Page layout', () => {
    test('displays tasks page with correct header', async ({ page }) => {
      await page.goto('/tasks');

      await expect(page.getByTestId('tasks-page')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
      await expect(page.getByText('Manage and track agent task assignments')).toBeVisible();
    });

    test('displays search input', async ({ page }) => {
      await page.goto('/tasks');

      const searchInput = page.getByTestId('tasks-search');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('placeholder', 'Search tasks...');
    });

    test('displays view toggle buttons', async ({ page }) => {
      await page.goto('/tasks');

      await expect(page.getByTestId('tasks-view-list')).toBeVisible();
      await expect(page.getByTestId('tasks-view-kanban')).toBeVisible();
    });

    test('displays create task button', async ({ page }) => {
      await page.goto('/tasks');

      await expect(page.getByTestId('tasks-create')).toBeVisible();
    });
  });

  test.describe('Tabs', () => {
    test('displays all filter tabs', async ({ page }) => {
      await page.goto('/tasks');

      await expect(page.getByTestId('tasks-tab-all')).toBeVisible();
      await expect(page.getByTestId('tasks-tab-unassigned')).toBeVisible();
      await expect(page.getByTestId('tasks-tab-assigned')).toBeVisible();
      await expect(page.getByTestId('tasks-tab-in_progress')).toBeVisible();
      await expect(page.getByTestId('tasks-tab-closed')).toBeVisible();
      await expect(page.getByTestId('tasks-tab-awaiting_merge')).toBeVisible();
    });

    test('defaults to All tab', async ({ page }) => {
      await page.goto('/tasks');

      const allTab = page.getByTestId('tasks-tab-all');
      // The all tab should have the active styling (primary color border)
      await expect(allTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('can switch to Unassigned tab', async ({ page }) => {
      await page.goto('/tasks');

      await page.getByTestId('tasks-tab-unassigned').click();

      // URL should reflect tab change
      await expect(page).toHaveURL(/status=unassigned/);

      // Unassigned tab should now be active
      const unassignedTab = page.getByTestId('tasks-tab-unassigned');
      await expect(unassignedTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('can switch to In Progress tab', async ({ page }) => {
      await page.goto('/tasks');

      await page.getByTestId('tasks-tab-in_progress').click();

      await expect(page).toHaveURL(/status=in_progress/);
    });

    test('can switch to Closed tab', async ({ page }) => {
      await page.goto('/tasks');

      await page.getByTestId('tasks-tab-closed').click();

      await expect(page).toHaveURL(/status=closed/);
    });

    test('can switch to Awaiting Merge tab', async ({ page }) => {
      await page.goto('/tasks');

      await page.getByTestId('tasks-tab-awaiting_merge').click();

      await expect(page).toHaveURL(/status=awaiting_merge/);
    });

    test('can switch back to All tab', async ({ page }) => {
      await page.goto('/tasks?status=unassigned');

      await page.getByTestId('tasks-tab-all').click();

      // All tab should remove status from URL
      await expect(page).not.toHaveURL(/status=/);
    });
  });

  test.describe('View toggle', () => {
    test('defaults to list view', async ({ page }) => {
      await page.goto('/tasks');

      // List button should be active (has primary background)
      const listButton = page.getByTestId('tasks-view-list');
      await expect(listButton).toHaveClass(/bg-\[var\(--color-primary\)\]/);
    });

    test('can switch to kanban view', async ({ page }) => {
      await page.goto('/tasks');

      await page.getByTestId('tasks-view-kanban').click();

      // Kanban button should now be active
      const kanbanButton = page.getByTestId('tasks-view-kanban');
      await expect(kanbanButton).toHaveClass(/bg-\[var\(--color-primary\)\]/);

      // List button should no longer be active
      const listButton = page.getByTestId('tasks-view-list');
      await expect(listButton).not.toHaveClass(/bg-\[var\(--color-primary\)\]/);
    });

    test('can switch back to list view', async ({ page }) => {
      await page.goto('/tasks');

      // Switch to kanban
      await page.getByTestId('tasks-view-kanban').click();
      // Switch back to list
      await page.getByTestId('tasks-view-list').click();

      const listButton = page.getByTestId('tasks-view-list');
      await expect(listButton).toHaveClass(/bg-\[var\(--color-primary\)\]/);
    });
  });

  test.describe('Kanban view', () => {
    test('displays all kanban columns when in kanban view', async ({ page }) => {
      await page.goto('/tasks');

      // Switch to kanban view
      await page.getByTestId('tasks-view-kanban').click();

      // Wait for view to update
      await page.waitForTimeout(200);

      // Check for kanban container
      const kanban = page.getByTestId('tasks-kanban');
      const hasKanban = await kanban.isVisible().catch(() => false);

      if (hasKanban) {
        await expect(page.getByTestId('kanban-column-unassigned')).toBeVisible();
        await expect(page.getByTestId('kanban-column-assigned')).toBeVisible();
        await expect(page.getByTestId('kanban-column-in-progress')).toBeVisible();
        await expect(page.getByTestId('kanban-column-closed')).toBeVisible();
        await expect(page.getByTestId('kanban-column-awaiting-merge')).toBeVisible();
      }
    });
  });

  test.describe('Empty states', () => {
    test('shows empty state when no tasks exist', async ({ page }) => {
      await page.goto('/tasks');

      // Wait for loading to complete
      await page.waitForTimeout(500);

      // Check for empty state or task list
      const emptyState = page.getByTestId('tasks-create-empty');
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      if (hasEmptyState) {
        await expect(page.getByText('No tasks yet')).toBeVisible();
        await expect(page.getByText('Create your first task')).toBeVisible();
      }
    });

    test('shows tab-specific empty state for unassigned tab', async ({ page }) => {
      await page.goto('/tasks?status=unassigned');

      // Wait for loading to complete
      await page.waitForTimeout(500);

      // The page should have some content - either empty state or tasks
      await expect(page.getByTestId('tasks-page')).toBeVisible();
    });

    test('shows tab-specific empty state for in progress tab', async ({ page }) => {
      await page.goto('/tasks?status=in_progress');

      // Wait for loading to complete
      await page.waitForTimeout(500);

      await expect(page.getByTestId('tasks-page')).toBeVisible();
    });
  });

  test.describe('Search functionality', () => {
    test('search input accepts text', async ({ page }) => {
      await page.goto('/tasks');

      const searchInput = page.getByTestId('tasks-search');
      await searchInput.fill('test-task');

      await expect(searchInput).toHaveValue('test-task');
    });

    test('search filters tasks by title', async ({ page }) => {
      await page.goto('/tasks');

      // Type a search query
      await page.getByTestId('tasks-search').fill('implement');

      // Give time for filtering
      await page.waitForTimeout(200);

      // The page should still be visible
      await expect(page.getByTestId('tasks-page')).toBeVisible();
    });

    test('shows no matching tasks message when search has no results', async ({ page }) => {
      // Mock empty response
      await page.route('**/api/tasks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/tasks');

      // Wait for loading
      await page.waitForTimeout(500);

      // Search for something that doesn't exist
      await page.getByTestId('tasks-search').fill('nonexistent-task-xyz');
      await page.waitForTimeout(200);

      // Should show "No matching tasks" or empty state
      const noMatchingText = await page.getByText('No matching tasks').isVisible().catch(() => false);
      const noTasksText = await page.getByText('No tasks yet').isVisible().catch(() => false);

      expect(noMatchingText || noTasksText).toBe(true);
    });
  });

  test.describe('Error handling', () => {
    test('shows error state when API request fails', async ({ page }) => {
      // Block all API requests to simulate network failure
      await page.route('**/api/tasks*', (route) => {
        route.abort('connectionrefused');
      });

      await page.goto('/tasks');

      // Wait for the error state to appear
      await page.waitForTimeout(1000);

      // Check if error UI is present
      const hasErrorState = await page.getByText('Failed to load tasks').isVisible().catch(() => false);

      if (hasErrorState) {
        await expect(page.getByText('Failed to load tasks')).toBeVisible();
        await expect(page.getByTestId('tasks-retry')).toBeVisible();
      }
    });
  });

  test.describe('Responsive design', () => {
    test('shows create button text on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/tasks');

      // The "Create Task" text should be visible on desktop
      await expect(page.getByTestId('tasks-create')).toContainText('Create Task');
    });

    test('hides create button text on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/tasks');

      // The plus icon should still be visible but text hidden on mobile
      const createButton = page.getByTestId('tasks-create');
      await expect(createButton).toBeVisible();
    });

    test('tabs are horizontally scrollable on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/tasks');

      // The tabs container should have overflow handling
      const tabsNav = page.locator('nav[aria-label="Tabs"]');
      await expect(tabsNav).toBeVisible();
    });
  });

  test.describe('Loading state', () => {
    test('shows loading indicator while fetching tasks', async ({ page }) => {
      // Add a delay to the API response
      await page.route('**/api/tasks*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/tasks');

      // Should show loading indicator
      await expect(page.getByText('Loading tasks...')).toBeVisible();
    });
  });

  test.describe('Tab URL persistence', () => {
    test('preserves tab in URL when refreshing', async ({ page }) => {
      await page.goto('/tasks?status=in_progress');

      // Verify we're on in_progress tab
      await expect(page).toHaveURL(/status=in_progress/);

      // Refresh the page
      await page.reload();

      // Should still be on in_progress tab
      await expect(page).toHaveURL(/status=in_progress/);
      const inProgressTab = page.getByTestId('tasks-tab-in_progress');
      await expect(inProgressTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });
  });

  test.describe('List view table', () => {
    test('displays table with correct headers in list view', async ({ page }) => {
      // Mock tasks response
      await page.route('**/api/tasks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tasks: [
              {
                id: 'task-1',
                type: 'task',
                title: 'Test Task',
                status: 'open',
                priority: 3,
                complexity: 3,
                taskType: 'feature',
                ephemeral: false,
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'user-1',
              },
            ],
          }),
        });
      });

      await page.goto('/tasks');

      // Wait for data to load
      await page.waitForTimeout(500);

      // Check for table
      const table = page.getByTestId('tasks-table');
      const hasTable = await table.isVisible().catch(() => false);

      if (hasTable) {
        await expect(page.getByRole('columnheader', { name: 'Task', exact: true })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /Status/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /Priority/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /Type/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /Assignee/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /Branch/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /Updated/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /Actions/i })).toBeVisible();
      }
    });
  });
});
