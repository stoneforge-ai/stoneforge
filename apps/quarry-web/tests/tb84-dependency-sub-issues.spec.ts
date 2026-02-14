import { test, expect } from '@playwright/test';

test.describe('TB84: Dependencies as Sub-Issues Display', () => {
  // Helper to create a task via API
  async function createTask(
    page: import('@playwright/test').Page,
    options: {
      title: string;
      priority?: number;
      status?: string;
    }
  ): Promise<{ id: string; title: string }> {
    const response = await page.request.post('/api/tasks', {
      data: {
        title: options.title,
        createdBy: 'el-0000',
        priority: options.priority || 3,
        taskType: 'task',
      },
    });
    const task = await response.json();

    // If a custom status was requested, update the task after creation
    if (options.status && options.status !== 'open') {
      await page.request.patch(`/api/tasks/${task.id}`, {
        data: { status: options.status },
      });
      task.status = options.status;
    }

    return task;
  }

  // Helper to create a dependency between two tasks
  async function createDependency(
    page: import('@playwright/test').Page,
    blockerId: string,
    blockedId: string,
    type: string = 'blocks'
  ) {
    await page.request.post('/api/dependencies', {
      data: {
        blockedId,
        blockerId,
        type,
        actor: 'el-0000',
      },
    });
  }

  test.describe('API: /api/tasks/:id/dependency-tasks', () => {
    test('returns empty arrays for task with no dependencies', async ({ page }) => {
      const task = await createTask(page, { title: 'TB84 API: No deps task' });

      const response = await page.request.get(`/api/tasks/${task.id}/dependency-tasks`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.blockedBy).toEqual([]);
      expect(data.blocks).toEqual([]);
      expect(data.progress).toEqual({ resolved: 0, total: 0 });
    });

    test('returns hydrated blockedBy tasks', async ({ page }) => {
      const blocker = await createTask(page, { title: 'TB84 API: Blocker task', priority: 1 });
      const blocked = await createTask(page, { title: 'TB84 API: Blocked task' });

      await createDependency(page, blocker.id, blocked.id, 'blocks');

      const response = await page.request.get(`/api/tasks/${blocked.id}/dependency-tasks`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.blockedBy.length).toBe(1);
      expect(data.blockedBy[0].task.id).toBe(blocker.id);
      expect(data.blockedBy[0].task.title).toBe('TB84 API: Blocker task');
      expect(data.blockedBy[0].task.status).toBe('open');
      expect(data.blockedBy[0].task.priority).toBe(1);
      expect(data.blockedBy[0].dependencyType).toBe('blocks');
    });

    test('returns hydrated blocks tasks', async ({ page }) => {
      const blocker = await createTask(page, { title: 'TB84 API: Blocker', priority: 2 });
      const blocked = await createTask(page, { title: 'TB84 API: Blocked' });

      await createDependency(page, blocker.id, blocked.id, 'blocks');

      const response = await page.request.get(`/api/tasks/${blocker.id}/dependency-tasks`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.blocks.length).toBe(1);
      expect(data.blocks[0].task.id).toBe(blocked.id);
      expect(data.blocks[0].task.title).toBe('TB84 API: Blocked');
    });

    test('calculates progress correctly', async ({ page }) => {
      // Create 3 blockers for one task
      const blocker1 = await createTask(page, { title: 'TB84 API: Blocker 1', status: 'closed' });
      const blocker2 = await createTask(page, { title: 'TB84 API: Blocker 2', status: 'open' });
      const blocker3 = await createTask(page, { title: 'TB84 API: Blocker 3', status: 'deferred' });
      const blocked = await createTask(page, { title: 'TB84 API: Blocked task' });

      await createDependency(page, blocker1.id, blocked.id, 'blocks');
      await createDependency(page, blocker2.id, blocked.id, 'blocks');
      await createDependency(page, blocker3.id, blocked.id, 'blocks');

      const response = await page.request.get(`/api/tasks/${blocked.id}/dependency-tasks`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.blockedBy.length).toBe(3);
      expect(data.progress.resolved).toBe(1); // closed blocker
      expect(data.progress.total).toBe(3);
    });

    test('returns 404 for non-existent task', async ({ page }) => {
      const response = await page.request.get('/api/tasks/el-nonexistent/dependency-tasks');
      expect(response.status()).toBe(404);
    });
  });

  test.describe('TaskDetailPanel - Blocked By Section', () => {
    test('shows "Blocked By" section with progress for task with blockers', async ({ page }) => {
      const blocker1 = await createTask(page, { title: 'TB84 UI: Blocker 1', status: 'closed', priority: 1 });
      const blocker2 = await createTask(page, { title: 'TB84 UI: Blocker 2', status: 'open', priority: 2 });
      const blocked = await createTask(page, { title: 'TB84 UI: Blocked Task' });

      await createDependency(page, blocker1.id, blocked.id, 'blocks');
      await createDependency(page, blocker2.id, blocked.id, 'blocks');

      await page.goto(`/tasks?page=1&limit=25&selected=${blocked.id}`);
      await page.waitForLoadState('networkidle');

      // Wait for dependency sub-issues section to load
      const section = page.getByTestId('dependency-sub-issues-section');
      await expect(section).toBeVisible({ timeout: 10000 });

      // Check for blocked by toggle with progress
      const blockedByToggle = page.getByTestId('blocked-by-toggle');
      await expect(blockedByToggle).toBeVisible();
      await expect(blockedByToggle).toContainText('1 of 2 resolved');

      // Check for sub-issue cards
      const blockedByList = page.getByTestId('blocked-by-list');
      await expect(blockedByList).toBeVisible();

      const blocker1Card = page.getByTestId(`sub-issue-${blocker1.id}`);
      await expect(blocker1Card).toBeVisible();
      await expect(blocker1Card).toContainText('TB84 UI: Blocker 1');

      const blocker2Card = page.getByTestId(`sub-issue-${blocker2.id}`);
      await expect(blocker2Card).toBeVisible();
      await expect(blocker2Card).toContainText('TB84 UI: Blocker 2');
    });

    test('blockedBy section is collapsible', async ({ page }) => {
      const blocker = await createTask(page, { title: 'TB84 UI: Collapsible Blocker' });
      const blocked = await createTask(page, { title: 'TB84 UI: Collapsible Blocked' });

      await createDependency(page, blocker.id, blocked.id, 'blocks');

      await page.goto(`/tasks?page=1&limit=25&selected=${blocked.id}`);
      await page.waitForLoadState('networkidle');

      const blockedByToggle = page.getByTestId('blocked-by-toggle');
      await expect(blockedByToggle).toBeVisible({ timeout: 10000 });

      // List should be visible initially (expanded)
      const blockedByList = page.getByTestId('blocked-by-list');
      await expect(blockedByList).toBeVisible();

      // Click to collapse
      await blockedByToggle.click();
      await expect(blockedByList).not.toBeVisible();

      // Click to expand
      await blockedByToggle.click();
      await expect(blockedByList).toBeVisible();
    });
  });

  test.describe('TaskDetailPanel - Blocks Section', () => {
    test('shows "Blocks" section for task that blocks others', async ({ page }) => {
      const blocker = await createTask(page, { title: 'TB84 UI: Blocker' });
      const blocked1 = await createTask(page, { title: 'TB84 UI: Blocked 1' });
      const blocked2 = await createTask(page, { title: 'TB84 UI: Blocked 2' });

      await createDependency(page, blocker.id, blocked1.id, 'blocks');
      await createDependency(page, blocker.id, blocked2.id, 'blocks');

      await page.goto(`/tasks?page=1&limit=25&selected=${blocker.id}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('dependency-sub-issues-section');
      await expect(section).toBeVisible({ timeout: 10000 });

      // Check for blocks toggle
      const blocksToggle = page.getByTestId('blocks-toggle');
      await expect(blocksToggle).toBeVisible();
      await expect(blocksToggle).toContainText('Blocks (2)');

      // Check for sub-issue cards
      const blocksList = page.getByTestId('blocks-list');
      await expect(blocksList).toBeVisible();

      const blocked1Card = page.getByTestId(`sub-issue-${blocked1.id}`);
      await expect(blocked1Card).toBeVisible();

      const blocked2Card = page.getByTestId(`sub-issue-${blocked2.id}`);
      await expect(blocked2Card).toBeVisible();
    });
  });

  test.describe('Sub-Issue Cards', () => {
    test('sub-issue card shows status icon, title, and priority', async ({ page }) => {
      const blocker = await createTask(page, { title: 'TB84 Card: Blocker Task', priority: 1, status: 'in_progress' });
      const blocked = await createTask(page, { title: 'TB84 Card: Blocked Task' });

      await createDependency(page, blocker.id, blocked.id, 'blocks');

      await page.goto(`/tasks?page=1&limit=25&selected=${blocked.id}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('dependency-sub-issues-section');
      await expect(section).toBeVisible({ timeout: 10000 });

      const blockerCard = page.getByTestId(`sub-issue-${blocker.id}`);
      await expect(blockerCard).toBeVisible();
      await expect(blockerCard).toContainText('TB84 Card: Blocker Task');
      await expect(blockerCard).toContainText('P1'); // Priority badge
    });

    test('closed blockers are shown with strikethrough style', async ({ page }) => {
      const blocker = await createTask(page, { title: 'TB84 Strikethrough: Closed Blocker', status: 'closed' });
      const blocked = await createTask(page, { title: 'TB84 Strikethrough: Blocked' });

      await createDependency(page, blocker.id, blocked.id, 'blocks');

      await page.goto(`/tasks?page=1&limit=25&selected=${blocked.id}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('dependency-sub-issues-section');
      await expect(section).toBeVisible({ timeout: 10000 });

      const blockerCard = page.getByTestId(`sub-issue-${blocker.id}`);
      await expect(blockerCard).toBeVisible();

      // Check for reduced opacity and line-through style
      await expect(blockerCard).toHaveClass(/opacity-70/);
    });

    test('clicking sub-issue card navigates to that task', async ({ page }) => {
      const blocker = await createTask(page, { title: 'TB84 Navigate: Blocker' });
      const blocked = await createTask(page, { title: 'TB84 Navigate: Blocked' });

      await createDependency(page, blocker.id, blocked.id, 'blocks');

      await page.goto(`/tasks?page=1&limit=25&selected=${blocked.id}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('dependency-sub-issues-section');
      await expect(section).toBeVisible({ timeout: 10000 });

      const blockerCard = page.getByTestId(`sub-issue-${blocker.id}`);
      await blockerCard.click();

      // URL should update to show the blocker task
      await expect(page).toHaveURL(new RegExp(`selected=${blocker.id}`));

      // Task detail panel should now show the blocker
      const taskTitle = page.getByTestId('task-detail-title');
      await expect(taskTitle).toContainText('TB84 Navigate: Blocker');
    });
  });

  test.describe('Create Blocker', () => {
    test('shows "Create Blocker Task" button', async ({ page }) => {
      const task = await createTask(page, { title: 'TB84 Create: Task' });

      await page.goto(`/tasks?page=1&limit=25&selected=${task.id}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('dependency-sub-issues-section');
      await expect(section).toBeVisible({ timeout: 10000 });

      const createBlockerBtn = page.getByTestId('create-blocker-btn');
      await expect(createBlockerBtn).toBeVisible();
      await expect(createBlockerBtn).toContainText('Create Blocker Task');
    });

    test('clicking Create Blocker opens modal', async ({ page }) => {
      const task = await createTask(page, { title: 'TB84 CreateModal: Task' });

      await page.goto(`/tasks?page=1&limit=25&selected=${task.id}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('dependency-sub-issues-section');
      await expect(section).toBeVisible({ timeout: 10000 });

      const createBlockerBtn = page.getByTestId('create-blocker-btn');
      await createBlockerBtn.click();

      const modal = page.getByTestId('create-blocker-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Create Blocker Task');
      await expect(modal).toContainText('TB84 CreateModal: Task'); // Shows blocked task name
    });

    test('can create a blocker task that blocks the current task', async ({ page }) => {
      const task = await createTask(page, { title: 'TB84 CreateBlocker: Target Task' });

      await page.goto(`/tasks?page=1&limit=25&selected=${task.id}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('dependency-sub-issues-section');
      await expect(section).toBeVisible({ timeout: 10000 });

      // Open create blocker modal
      const createBlockerBtn = page.getByTestId('create-blocker-btn');
      await createBlockerBtn.click();

      const modal = page.getByTestId('create-blocker-modal');
      await expect(modal).toBeVisible();

      // Fill in the form
      const titleInput = page.getByTestId('blocker-title-input');
      await titleInput.fill('New Blocker Task');

      // Select priority 1 (Critical)
      await page.getByTestId('blocker-priority-1').click();

      // Submit
      await page.getByTestId('create-blocker-submit').click();

      // Wait for modal to close
      await expect(modal).not.toBeVisible({ timeout: 10000 });

      // Verify the blocker appears in the blocked-by section
      const blockedByToggle = page.getByTestId('blocked-by-toggle');
      await expect(blockedByToggle).toBeVisible({ timeout: 10000 });
      await expect(blockedByToggle).toContainText('0 of 1 resolved');

      // Verify the new blocker is in the list
      const blockedByList = page.getByTestId('blocked-by-list');
      await expect(blockedByList).toContainText('New Blocker Task');
    });

    test('modal can be cancelled with Cancel button', async ({ page }) => {
      const task = await createTask(page, { title: 'TB84 CancelModal: Task' });

      await page.goto(`/tasks?page=1&limit=25&selected=${task.id}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('dependency-sub-issues-section');
      await expect(section).toBeVisible({ timeout: 10000 });

      const createBlockerBtn = page.getByTestId('create-blocker-btn');
      await createBlockerBtn.click();

      const modal = page.getByTestId('create-blocker-modal');
      await expect(modal).toBeVisible();

      // Type something
      const titleInput = page.getByTestId('blocker-title-input');
      await titleInput.fill('Should be cancelled');

      // Click cancel
      await modal.getByRole('button', { name: 'Cancel' }).click();

      // Modal should close
      await expect(modal).not.toBeVisible();

      // No new blocker should appear
      await expect(page.getByTestId('blocked-by-toggle')).not.toBeVisible();
    });
  });

  test.describe('Task with Both Blockers and Blocking', () => {
    test('shows both sections when task has dependencies in both directions', async ({ page }) => {
      // A blocks B blocks C
      // When viewing B: blockedBy=[A], blocks=[C]
      const taskA = await createTask(page, { title: 'TB84 Both: A' });
      const taskB = await createTask(page, { title: 'TB84 Both: B' });
      const taskC = await createTask(page, { title: 'TB84 Both: C' });

      await createDependency(page, taskA.id, taskB.id, 'blocks');
      await createDependency(page, taskB.id, taskC.id, 'blocks');

      await page.goto(`/tasks?page=1&limit=25&selected=${taskB.id}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('dependency-sub-issues-section');
      await expect(section).toBeVisible({ timeout: 10000 });

      // Should show both sections
      const blockedByToggle = page.getByTestId('blocked-by-toggle');
      await expect(blockedByToggle).toBeVisible();
      await expect(blockedByToggle).toContainText('0 of 1 resolved');

      const blocksToggle = page.getByTestId('blocks-toggle');
      await expect(blocksToggle).toBeVisible();
      await expect(blocksToggle).toContainText('Blocks (1)');

      // Verify correct tasks in each section
      await expect(page.getByTestId(`sub-issue-${taskA.id}`)).toBeVisible();
      await expect(page.getByTestId(`sub-issue-${taskC.id}`)).toBeVisible();
    });
  });
});
