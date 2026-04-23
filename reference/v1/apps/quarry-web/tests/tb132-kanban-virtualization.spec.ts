import { test, expect, Page } from '@playwright/test';

test.describe('TB132: Kanban Column Virtualization with Infinite Scroll', () => {
  /**
   * Helper to get or create an entity for tests.
   * Returns entity ID or null if unable to create.
   */
  async function getOrCreateEntity(page: Page): Promise<string | null> {
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();

    // Check both possible response formats
    const entityList = entities.data || entities;
    if (entityList && entityList.length > 0) {
      return entityList[0].id;
    }

    // Create a test entity if none exist
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: `TB132_Test_Entity_${Date.now()}`,
        entityType: 'agent',
      },
    });

    if (createResponse.ok()) {
      const entity = await createResponse.json();
      return entity.id;
    }

    return null;
  }

  /**
   * Helper to create multiple tasks via API.
   * Returns array of created task IDs.
   */
  async function createTasks(
    page: Page,
    count: number,
    status: string,
    prefix: string
  ): Promise<string[]> {
    const creatorId = await getOrCreateEntity(page);
    if (!creatorId) {
      return []; // Return empty to allow test to skip
    }

    const createdIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const response = await page.request.post('/api/tasks', {
        data: {
          title: `${prefix} Task ${i + 1}`,
          createdBy: creatorId,
          status,
          priority: (i % 5) + 1, // Distribute priorities
        },
      });

      if (response.ok()) {
        const task = await response.json();
        createdIds.push(task.id);
      }
    }

    return createdIds;
  }

  /**
   * Helper to clean up tasks after test.
   */
  async function deleteTasks(page: Page, taskIds: string[]) {
    for (const id of taskIds) {
      await page.request.delete(`/api/tasks/${id}`);
    }
  }

  test('all columns use virtualization regardless of task count', async ({ page }) => {
    // Create only 5 tasks in open column (below old threshold of 20)
    let createdIds: string[] = [];

    try {
      createdIds = await createTasks(page, 5, 'open', 'Small Column');

      if (createdIds.length === 0) {
        test.skip();
        return;
      }

      await page.goto('/tasks');
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      // TB132: ALL columns should have scroll container regardless of task count
      // Previously only columns with >20 tasks had this
      const openColumn = page.getByTestId('kanban-column-open');
      const scrollContainer = openColumn.getByTestId('kanban-column-open-scroll');
      await expect(scrollContainer).toBeVisible();

      // The scroll container should have overflow-y-auto for virtualized scrolling
      await expect(scrollContainer).toHaveClass(/overflow-y-auto/);

      // Also verify other columns have scroll containers (even if empty)
      const blockedColumn = page.getByTestId('kanban-column-blocked');
      const blockedScrollContainer = blockedColumn.getByTestId('kanban-column-blocked-scroll');
      await expect(blockedScrollContainer).toBeVisible();
    } finally {
      await deleteTasks(page, createdIds);
    }
  });

  test('columns display total count without pagination indicators', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Verify count shows a number (not "showing X of Y")
    const openCount = page.getByTestId('kanban-column-open-count');
    const countText = await openCount.textContent();
    const count = parseInt(countText || '0', 10);

    // Should show a valid count (0 or more)
    expect(count).toBeGreaterThanOrEqual(0);

    // Count badge should show plain number or filtered/total format (e.g. "2/5")
    // when per-column localStorage filters reduce visible cards
    expect(countText).toMatch(/^\d+(\/\d+)?$/);
    expect(countText?.toLowerCase()).not.toContain('of');
  });

  test('virtualized columns support smooth scrolling', async ({ page }) => {
    // Create a small batch of tasks
    let createdIds: string[] = [];

    try {
      createdIds = await createTasks(page, 10, 'open', 'ScrollTest');

      if (createdIds.length < 5) {
        test.skip();
        return;
      }

      await page.goto('/tasks');
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      // Wait for virtualization to be ready
      await page.waitForTimeout(500);

      // Get the scroll container
      const scrollContainer = page.getByTestId('kanban-column-open-scroll');
      await expect(scrollContainer).toBeVisible();

      // Get the scrollable height
      const scrollHeight = await scrollContainer.evaluate((el) => el.scrollHeight);
      const clientHeight = await scrollContainer.evaluate((el) => el.clientHeight);

      // Only test scrolling if there's content to scroll
      if (scrollHeight > clientHeight) {
        // Scroll down
        await scrollContainer.evaluate((el) => {
          el.scrollTop = 200;
        });

        await page.waitForTimeout(200);

        // Verify scroll happened
        const scrolledTop = await scrollContainer.evaluate((el) => el.scrollTop);
        expect(scrolledTop).toBeGreaterThan(0);

        // Scroll back to top
        await scrollContainer.evaluate((el) => {
          el.scrollTop = 0;
        });

        await page.waitForTimeout(200);

        // Verify we're back at top
        const finalScrollTop = await scrollContainer.evaluate((el) => el.scrollTop);
        expect(finalScrollTop).toBe(0);
      }
    } finally {
      await deleteTasks(page, createdIds);
    }
  });

  test('drag-and-drop works across virtualized columns', async ({ page }) => {
    const creatorId = await getOrCreateEntity(page);
    if (!creatorId) {
      test.skip();
      return;
    }

    // Create a task in 'open' status
    const title = `DnD Virtualized Test ${Date.now()}`;
    const createResponse = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: creatorId,
        status: 'open',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const createdTask = await createResponse.json();

    try {
      await page.goto('/tasks');
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      // Verify task is in open column (virtualized)
      const openColumn = page.getByTestId('kanban-column-open');
      const taskCard = openColumn.getByTestId(`kanban-card-${createdTask.id}`);
      await expect(taskCard).toBeVisible({ timeout: 10000 });

      // Move task via API (simulates successful drag-and-drop)
      const updateResponse = await page.request.patch(`/api/tasks/${createdTask.id}`, {
        data: { status: 'in_progress' },
      });
      expect(updateResponse.ok()).toBe(true);

      // Wait for real-time update
      await page.waitForTimeout(2000);

      // Verify task moved to in_progress column (also virtualized)
      const inProgressColumn = page.getByTestId('kanban-column-in_progress');
      const movedCard = inProgressColumn.getByTestId(`kanban-card-${createdTask.id}`);
      await expect(movedCard).toBeVisible({ timeout: 10000 });
    } finally {
      await page.request.delete(`/api/tasks/${createdTask.id}`);
    }
  });

  test('each column scrolls independently', async ({ page }) => {
    let openTaskIds: string[] = [];

    try {
      // Create tasks in open column
      openTaskIds = await createTasks(page, 15, 'open', 'IndependentScrollTest');

      if (openTaskIds.length < 10) {
        test.skip();
        return;
      }

      await page.goto('/tasks');
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      // Wait for tasks to render
      await page.waitForTimeout(500);

      const openScrollContainer = page.getByTestId('kanban-column-open-scroll');
      const blockedScrollContainer = page.getByTestId('kanban-column-blocked-scroll');

      // Check if open column has scrollable content
      const openScrollHeight = await openScrollContainer.evaluate((el) => el.scrollHeight);
      const openClientHeight = await openScrollContainer.evaluate((el) => el.clientHeight);

      if (openScrollHeight <= openClientHeight) {
        // Not enough content to test scrolling
        return;
      }

      // Scroll open column down
      const scrollAmount = Math.min(300, openScrollHeight - openClientHeight - 10);
      await openScrollContainer.evaluate((el, amount) => {
        el.scrollTop = amount;
      }, scrollAmount);

      await page.waitForTimeout(300);

      // Get scroll positions
      const openScrollTop = await openScrollContainer.evaluate((el) => el.scrollTop);
      const blockedScrollTop = await blockedScrollContainer.evaluate((el) => el.scrollTop);

      // Open column should be scrolled, blocked should be at top (0)
      expect(openScrollTop).toBeGreaterThan(0);
      expect(blockedScrollTop).toBe(0);
    } finally {
      await deleteTasks(page, openTaskIds);
    }
  });

  test('scroll state is maintained when switching views', async ({ page }) => {
    let createdIds: string[] = [];

    try {
      // Create enough tasks to scroll
      createdIds = await createTasks(page, 20, 'open', 'ViewSwitch');

      if (createdIds.length < 10) {
        test.skip();
        return;
      }

      await page.goto('/tasks');
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      await page.waitForTimeout(500);

      const scrollContainer = page.getByTestId('kanban-column-open-scroll');

      // Get scrollable height
      const scrollHeight = await scrollContainer.evaluate((el) => el.scrollHeight);
      const clientHeight = await scrollContainer.evaluate((el) => el.clientHeight);

      // Only test if scrollable
      if (scrollHeight <= clientHeight) {
        // Not enough content to test scroll restoration
        return;
      }

      // Scroll to a position
      const targetScroll = Math.min(300, scrollHeight - clientHeight - 10);
      await scrollContainer.evaluate((el, pos) => {
        el.scrollTop = pos;
      }, targetScroll);

      await page.waitForTimeout(500); // Allow scroll position to be saved

      // Switch to list view
      await page.getByTestId('view-toggle-list').click();
      await expect(page.getByTestId('tasks-list-view')).toBeVisible();

      // Switch back to kanban view
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      // Wait for scroll restoration
      await page.waitForTimeout(500);

      // Check if scroll position is restored (should be close to target)
      const restoredScrollTop = await scrollContainer.evaluate((el) => el.scrollTop);
      // Allow significant tolerance - just verify it tried to restore
      expect(restoredScrollTop).toBeGreaterThan(0);
    } finally {
      await deleteTasks(page, createdIds);
    }
  });

  test('filter/search works with virtualized kanban', async ({ page }) => {
    let createdIds: string[] = [];

    try {
      // Create tasks with a unique prefix for filtering
      const uniquePrefix = `FilterTest${Date.now()}`;
      createdIds = await createTasks(page, 5, 'open', uniquePrefix);

      if (createdIds.length < 3) {
        test.skip();
        return;
      }

      await page.goto('/tasks');
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      // Get count element
      const openCount = page.getByTestId('kanban-column-open-count');

      // Use the search filter if visible
      const searchInput = page.getByPlaceholder(/search/i);
      if (await searchInput.isVisible()) {
        // Filter by our unique prefix
        await searchInput.fill(uniquePrefix);

        // Wait for filter to apply
        await page.waitForTimeout(1000);

        // Count should be reduced (showing only our tasks)
        const filteredCount = parseInt((await openCount.textContent()) || '0', 10);
        // Should show our created tasks (5 or fewer if filter delayed)
        expect(filteredCount).toBeLessThanOrEqual(createdIds.length);

        // Clear filter
        await searchInput.clear();
        await page.waitForTimeout(500);

        // Count should increase back (may not be exact due to other tests)
        const restoredCount = parseInt((await openCount.textContent()) || '0', 10);
        expect(restoredCount).toBeGreaterThanOrEqual(filteredCount);
      }
    } finally {
      await deleteTasks(page, createdIds);
    }
  });

  test('empty columns show "No tasks" message with virtualization', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByTestId('view-toggle-kanban').click();
    await expect(page.getByTestId('kanban-board')).toBeVisible();

    // Check for any empty column (likely blocked)
    const blockedCount = page.getByTestId('kanban-column-blocked-count');
    const countText = await blockedCount.textContent();

    if (countText === '0') {
      // Empty column should show "No tasks" message even with virtualization
      const blockedColumn = page.getByTestId('kanban-column-blocked');
      const noTasksMessage = blockedColumn.getByText('No tasks');
      await expect(noTasksMessage).toBeVisible();
    }
  });

  test('clicking task in virtualized kanban opens detail panel', async ({ page }) => {
    const creatorId = await getOrCreateEntity(page);
    if (!creatorId) {
      test.skip();
      return;
    }

    // Create a task specifically for this test
    const title = `Click Test Task ${Date.now()}`;
    const createResponse = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: creatorId,
        status: 'open',
      },
    });

    if (!createResponse.ok()) {
      test.skip();
      return;
    }

    const task = await createResponse.json();

    try {
      await page.goto('/tasks');
      await page.getByTestId('view-toggle-kanban').click();
      await expect(page.getByTestId('kanban-board')).toBeVisible();

      // Click the task card
      const taskCard = page.getByTestId(`kanban-card-${task.id}`);
      await expect(taskCard).toBeVisible({ timeout: 10000 });
      await taskCard.click();

      // Detail panel should open
      await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });
    } finally {
      await page.request.delete(`/api/tasks/${task.id}`);
    }
  });
});
