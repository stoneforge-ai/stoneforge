import { test, expect } from '@playwright/test';

test.describe('TB-O25: Activity Feed', () => {
  test.describe('Page layout', () => {
    test('displays activity page with correct header', async ({ page }) => {
      await page.goto('/activity');

      await expect(page.getByTestId('activity-page')).toBeVisible();
      // Use exact match for the main h1 heading to avoid matching subheadings
      await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
      await expect(page.getByText('Command center for agent orchestration')).toBeVisible();
    });

    test('displays refresh button', async ({ page }) => {
      await page.goto('/activity');

      const refreshButton = page.getByTestId('activity-refresh');
      await expect(refreshButton).toBeVisible();
      await expect(refreshButton).toContainText('Refresh');
    });

    test('displays connection status indicator', async ({ page }) => {
      await page.goto('/activity');

      const statusIndicator = page.getByTestId('activity-connection-status');
      await expect(statusIndicator).toBeVisible();
      // Should show either Live or Offline
      await expect(statusIndicator).toContainText(/Live|Offline/);
    });
  });

  test.describe('Filter tabs', () => {
    test('displays all filter categories', async ({ page }) => {
      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      await expect(page.getByTestId('activity-filter-all')).toBeVisible();
      await expect(page.getByTestId('activity-filter-tasks')).toBeVisible();
      await expect(page.getByTestId('activity-filter-agents')).toBeVisible();
      await expect(page.getByTestId('activity-filter-workflows')).toBeVisible();
    });

    test('defaults to All filter', async ({ page }) => {
      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      const allFilter = page.getByTestId('activity-filter-all');
      // Should have active styling (primary background)
      await expect(allFilter).toHaveClass(/bg-\[var\(--color-primary\)\]/);
    });

    test('can switch to Tasks filter', async ({ page }) => {
      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      const tasksFilter = page.getByTestId('activity-filter-tasks');
      await tasksFilter.click();

      // Tasks filter should now be active
      await expect(tasksFilter).toHaveClass(/bg-\[var\(--color-primary\)\]/);
      // All filter should be inactive
      await expect(page.getByTestId('activity-filter-all')).not.toHaveClass(/bg-\[var\(--color-primary\)\]/);
    });

    test('can switch to Agents filter', async ({ page }) => {
      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      const agentsFilter = page.getByTestId('activity-filter-agents');
      await agentsFilter.click();

      await expect(agentsFilter).toHaveClass(/bg-\[var\(--color-primary\)\]/);
    });

    test('can switch to Workflows filter', async ({ page }) => {
      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      const workflowsFilter = page.getByTestId('activity-filter-workflows');
      await workflowsFilter.click();

      await expect(workflowsFilter).toHaveClass(/bg-\[var\(--color-primary\)\]/);
    });
  });

  test.describe('Activity feed section', () => {
    test('displays activity feed section', async ({ page }) => {
      await page.goto('/activity');

      await expect(page.getByTestId('activity-feed-section')).toBeVisible();
    });

    test('displays activity list or loading state', async ({ page }) => {
      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      // Should show activity list or empty state (loading happens quickly)
      // Use first() to avoid strict mode issues when both list and loading are present
      const activityList = page.getByTestId('activity-list');
      const activityEmpty = page.getByTestId('activity-empty');

      // Wait for either list or empty state
      await expect(activityList.or(activityEmpty).first()).toBeVisible({ timeout: 10000 });
    });

    test('shows empty message when no activity', async ({ page }) => {
      await page.goto('/activity');

      // Wait for content to load
      const activityEmpty = page.getByTestId('activity-empty');

      // If empty state is visible, should show appropriate message
      if (await activityEmpty.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(activityEmpty).toContainText(/No activity|No .* activity/);
      }
    });
  });

  test.describe('Empty state messages', () => {
    test('displays appropriate empty message for All filter', async ({ page }) => {
      // Mock empty response
      await page.route('**/api/events*', async (route) => {
        await route.fulfill({
          json: { events: [], hasMore: false, total: 0 },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      const emptyState = page.getByTestId('activity-empty');
      await expect(emptyState).toBeVisible({ timeout: 10000 });
      await expect(emptyState).toContainText('No activity yet');
    });

    test('displays appropriate empty message for Tasks filter', async ({ page }) => {
      // Mock empty response
      await page.route('**/api/events*', async (route) => {
        await route.fulfill({
          json: { events: [], hasMore: false, total: 0 },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      await page.getByTestId('activity-filter-tasks').click();

      const emptyState = page.getByTestId('activity-empty');
      await expect(emptyState).toBeVisible({ timeout: 10000 });
      await expect(emptyState).toContainText('tasks');
    });
  });

  test.describe('Activity cards', () => {
    test('displays activity cards with events', async ({ page }) => {
      // Mock response with events
      await page.route('**/api/events*', async (route) => {
        await route.fulfill({
          json: {
            events: [
              {
                id: 1,
                elementId: 'task_123',
                elementType: 'task',
                elementTitle: 'Test Task',
                eventType: 'created',
                actor: 'entity_456',
                actorName: 'Test Agent',
                oldValue: null,
                newValue: { title: 'Test Task' },
                createdAt: new Date().toISOString(),
                summary: 'Created task "Test Task"',
              },
              {
                id: 2,
                elementId: 'task_123',
                elementType: 'task',
                elementTitle: 'Test Task',
                eventType: 'updated',
                actor: 'entity_456',
                actorName: 'Test Agent',
                oldValue: { status: 'open' },
                newValue: { status: 'in_progress' },
                createdAt: new Date().toISOString(),
                summary: 'Updated task "Test Task"',
              },
            ],
            hasMore: false,
            total: 2,
          },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      // Wait for activity cards to appear
      const activityCards = page.getByTestId('activity-card');
      await expect(activityCards.first()).toBeVisible({ timeout: 10000 });

      // Should have at least one card
      await expect(activityCards).toHaveCount(2);
    });

    test('activity card displays summary', async ({ page }) => {
      // Mock response with event
      await page.route('**/api/events*', async (route) => {
        await route.fulfill({
          json: {
            events: [
              {
                id: 1,
                elementId: 'task_123',
                elementType: 'task',
                elementTitle: 'Test Task',
                eventType: 'created',
                actor: 'entity_456',
                actorName: 'Test Agent',
                oldValue: null,
                newValue: { title: 'Test Task' },
                createdAt: new Date().toISOString(),
                summary: 'Created task "Test Task"',
              },
            ],
            hasMore: false,
            total: 1,
          },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      const activitySummary = page.getByTestId('activity-summary');
      await expect(activitySummary.first()).toBeVisible({ timeout: 10000 });
      await expect(activitySummary.first()).toContainText('Created task');
    });

    test('activity card displays actor name', async ({ page }) => {
      // Mock response with event
      await page.route('**/api/events*', async (route) => {
        await route.fulfill({
          json: {
            events: [
              {
                id: 1,
                elementId: 'task_123',
                elementType: 'task',
                elementTitle: 'Test Task',
                eventType: 'created',
                actor: 'entity_456',
                actorName: 'Test Agent',
                oldValue: null,
                newValue: { title: 'Test Task' },
                createdAt: new Date().toISOString(),
                summary: 'Created task "Test Task"',
              },
            ],
            hasMore: false,
            total: 1,
          },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      const activityActor = page.getByTestId('activity-actor');
      await expect(activityActor.first()).toBeVisible({ timeout: 10000 });
      await expect(activityActor.first()).toContainText('Test Agent');
    });

    test('activity card displays relative time', async ({ page }) => {
      // Mock response with event
      await page.route('**/api/events*', async (route) => {
        await route.fulfill({
          json: {
            events: [
              {
                id: 1,
                elementId: 'task_123',
                elementType: 'task',
                elementTitle: 'Test Task',
                eventType: 'created',
                actor: 'entity_456',
                actorName: 'Test Agent',
                oldValue: null,
                newValue: { title: 'Test Task' },
                createdAt: new Date().toISOString(),
                summary: 'Created task "Test Task"',
              },
            ],
            hasMore: false,
            total: 1,
          },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      const activityTime = page.getByTestId('activity-time');
      await expect(activityTime.first()).toBeVisible({ timeout: 10000 });
      // Should show relative time
      await expect(activityTime.first()).toContainText(/just now|\dm ago|\dh ago|\dd ago/);
    });

    test('activity card displays element type badge', async ({ page }) => {
      // Mock response with event
      await page.route('**/api/events*', async (route) => {
        await route.fulfill({
          json: {
            events: [
              {
                id: 1,
                elementId: 'task_123',
                elementType: 'task',
                elementTitle: 'Test Task',
                eventType: 'created',
                actor: 'entity_456',
                actorName: 'Test Agent',
                oldValue: null,
                newValue: { title: 'Test Task' },
                createdAt: new Date().toISOString(),
                summary: 'Created task "Test Task"',
              },
            ],
            hasMore: false,
            total: 1,
          },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      const elementType = page.getByTestId('activity-element-type');
      await expect(elementType.first()).toBeVisible({ timeout: 10000 });
      await expect(elementType.first()).toContainText('Task');
    });

    test('activity card displays element title', async ({ page }) => {
      // Mock response with event
      await page.route('**/api/events*', async (route) => {
        await route.fulfill({
          json: {
            events: [
              {
                id: 1,
                elementId: 'task_123',
                elementType: 'task',
                elementTitle: 'Test Task Title',
                eventType: 'created',
                actor: 'entity_456',
                actorName: 'Test Agent',
                oldValue: null,
                newValue: { title: 'Test Task Title' },
                createdAt: new Date().toISOString(),
                summary: 'Created task "Test Task Title"',
              },
            ],
            hasMore: false,
            total: 1,
          },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      const elementTitle = page.getByTestId('activity-element-title');
      await expect(elementTitle.first()).toBeVisible({ timeout: 10000 });
      await expect(elementTitle.first()).toContainText('Test Task Title');
    });
  });

  test.describe('Expandable details', () => {
    test('can expand activity card to show details', async ({ page }) => {
      // Mock response with event that has values
      await page.route('**/api/events*', async (route) => {
        await route.fulfill({
          json: {
            events: [
              {
                id: 1,
                elementId: 'task_123',
                elementType: 'task',
                elementTitle: 'Test Task',
                eventType: 'updated',
                actor: 'entity_456',
                actorName: 'Test Agent',
                oldValue: { status: 'open' },
                newValue: { status: 'in_progress' },
                createdAt: new Date().toISOString(),
                summary: 'Updated task "Test Task"',
              },
            ],
            hasMore: false,
            total: 1,
          },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      // Wait for card to appear
      const card = page.getByTestId('activity-card').first();
      await expect(card).toBeVisible({ timeout: 10000 });

      // Hover to reveal expand button
      await card.hover();

      // Click expand button
      const expandButton = page.getByTestId('activity-expand').first();
      await expandButton.click();

      // Details should be visible
      const details = page.getByTestId('activity-details');
      await expect(details.first()).toBeVisible();
    });
  });

  test.describe('Infinite scroll', () => {
    test('displays load more trigger when hasMore is true', async ({ page }) => {
      // Mock response with hasMore=true
      await page.route('**/api/events*', async (route) => {
        await route.fulfill({
          json: {
            events: Array(20)
              .fill(null)
              .map((_, i) => ({
                id: i + 1,
                elementId: `task_${i}`,
                elementType: 'task',
                elementTitle: `Task ${i}`,
                eventType: 'created',
                actor: 'entity_456',
                actorName: 'Test Agent',
                oldValue: null,
                newValue: { title: `Task ${i}` },
                createdAt: new Date().toISOString(),
                summary: `Created task "Task ${i}"`,
              })),
            hasMore: true,
            total: 100,
          },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      // Wait for initial load
      const activityCards = page.getByTestId('activity-card');
      await expect(activityCards.first()).toBeVisible({ timeout: 10000 });

      // Load more trigger should be visible
      const loadMoreTrigger = page.getByTestId('activity-load-more');
      await expect(loadMoreTrigger).toBeVisible();
    });
  });

  test.describe('Refresh functionality', () => {
    test('refresh button triggers data reload', async ({ page }) => {
      let requestCount = 0;

      await page.route('**/api/events*', async (route) => {
        requestCount++;
        await route.fulfill({
          json: { events: [], hasMore: false, total: 0 },
        });
      });

      await page.goto('/activity');

      // Expand the activity feed section first
      await page.getByTestId('activity-feed-toggle').click();

      // Wait for initial load
      await page.getByTestId('activity-empty').waitFor({ timeout: 10000 });

      // Initial request
      expect(requestCount).toBeGreaterThanOrEqual(1);
      const initialCount = requestCount;

      // Click refresh - this triggers window.location.reload()
      await page.getByTestId('activity-refresh').click();

      // Wait for page reload and new activity-page to appear
      await page.getByTestId('activity-page').waitFor({ timeout: 10000 });

      // After reload, there should be at least one new request
      expect(requestCount).toBeGreaterThan(initialCount);
    });
  });

  test.describe('Navigation', () => {
    test('activity page is accessible from home route', async ({ page }) => {
      await page.goto('/');

      // Should either redirect to activity or show it
      await expect(page.getByTestId('activity-page')).toBeVisible();
    });

    test('activity page is accessible via direct URL', async ({ page }) => {
      await page.goto('/activity');

      await expect(page.getByTestId('activity-page')).toBeVisible();
    });
  });
});
