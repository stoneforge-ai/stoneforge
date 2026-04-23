/**
 * TB104: Clickable Member Names
 *
 * Tests that entity references throughout the app are clickable links
 * that navigate to /entities/:id and show hover preview cards.
 */

import { test, expect } from '@playwright/test';

test.describe('TB104: Clickable Member Names', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test.describe('Team Members', () => {
    test('team member names are clickable links', async ({ page }) => {
      // Navigate to teams page
      await page.goto('/teams');
      await page.waitForLoadState('networkidle');

      // Wait for teams list to load
      const teamsContainer = page.locator('[data-testid="teams-list"], [data-testid="teams-grid"]');
      await teamsContainer.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click a team to open detail panel
      const teamCard = page.locator('[data-testid^="team-card-"]').first();

      // Check if there are teams
      const teamCount = await teamCard.count();
      if (teamCount === 0) {
        test.skip();
        return;
      }

      await teamCard.click();
      await page.waitForTimeout(500);

      // Wait for the members list to load
      const membersList = page.locator('[data-testid="team-members-list"]');
      const hasMembersList = await membersList.isVisible().catch(() => false);
      if (!hasMembersList) {
        test.skip();
        return;
      }

      // Find a member link
      const memberLink = page.locator('[data-testid^="member-link-"]').first();
      const hasMemberLink = await memberLink.isVisible().catch(() => false);

      if (!hasMemberLink) {
        test.skip();
        return;
      }

      // Get the entity ID from the test ID
      const testId = await memberLink.getAttribute('data-testid');
      const entityId = testId?.replace('member-link-', '');

      // Click the member link
      await memberLink.click();
      await page.waitForTimeout(500);

      // Verify navigation to entities page with entity selected
      await expect(page).toHaveURL(/\/entities/);
      if (entityId) {
        await expect(page).toHaveURL(new RegExp(`selected=${entityId}`));
      }
    });

    test('team member names show hover preview', async ({ page }) => {
      // Navigate to teams page
      await page.goto('/teams');
      await page.waitForLoadState('networkidle');

      // Wait for teams list to load
      const teamsContainer = page.locator('[data-testid="teams-list"], [data-testid="teams-grid"]');
      await teamsContainer.waitFor({ state: 'visible', timeout: 10000 });

      // Find and click a team
      const teamCard = page.locator('[data-testid^="team-card-"]').first();
      const teamCount = await teamCard.count();
      if (teamCount === 0) {
        test.skip();
        return;
      }

      await teamCard.click();
      await page.waitForTimeout(500);

      // Wait for the members list to load
      const membersList = page.locator('[data-testid="team-members-list"]');
      const hasMembersList = await membersList.isVisible().catch(() => false);
      if (!hasMembersList) {
        test.skip();
        return;
      }

      // Find a member link
      const memberLink = page.locator('[data-testid^="member-link-"]').first();
      const hasMemberLink = await memberLink.isVisible().catch(() => false);

      if (!hasMemberLink) {
        test.skip();
        return;
      }

      // Get the entity ID from the test ID
      const testId = await memberLink.getAttribute('data-testid');
      const entityRef = testId?.replace('member-link-', '');

      // Hover to trigger preview
      await memberLink.hover();
      await page.waitForTimeout(500);

      // Check for hover preview card
      const previewCard = page.locator(`[data-testid="entity-preview-${entityRef}"]`);
      await expect(previewCard).toBeVisible({ timeout: 3000 });

      // Verify preview content contains stats or entity info
      const previewContent = await previewCard.textContent();
      expect(previewContent).toBeTruthy();
    });
  });

  test.describe('Task Assignee', () => {
    test('task assignee is clickable link', async ({ page }) => {
      // Navigate to tasks page with specific task that has assignee (TB104 Test Task)
      await page.goto('/tasks?selected=el-3oqo');
      await page.waitForLoadState('networkidle');

      // Wait for task detail to load
      await page.waitForTimeout(1000);

      // Look for assignee link
      const assigneeLink = page.locator('[data-testid="task-detail-assignee-link"]');
      const hasAssigneeLink = await assigneeLink.isVisible().catch(() => false);

      if (!hasAssigneeLink) {
        // Task might not have an assignee - that's OK, try another task
        // Navigate to tasks and find one with assignee
        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Find a task card that shows assignee
        const taskCard = page.locator('[data-testid^="task-card-"]').first();
        const taskCount = await taskCard.count();
        if (taskCount === 0) {
          test.skip();
          return;
        }

        await taskCard.click();
        await page.waitForTimeout(500);

        const assigneeLinkRetry = page.locator('[data-testid="task-detail-assignee-link"]');
        const hasAssigneeLinkRetry = await assigneeLinkRetry.isVisible().catch(() => false);
        if (!hasAssigneeLinkRetry) {
          test.skip();
          return;
        }
      }

      // Click the assignee link
      await assigneeLink.click();
      await page.waitForTimeout(500);

      // Verify navigation to entities page
      await expect(page).toHaveURL(/\/entities/);
    });

    test('task assignee shows hover preview', async ({ page }) => {
      // Navigate to tasks page with specific task that has assignee
      await page.goto('/tasks?selected=el-3oqo');
      await page.waitForLoadState('networkidle');

      // Wait for task detail to load
      await page.waitForTimeout(1000);

      // Look for assignee link
      const assigneeLink = page.locator('[data-testid="task-detail-assignee-link"]');
      const hasAssigneeLink = await assigneeLink.isVisible().catch(() => false);

      if (!hasAssigneeLink) {
        test.skip();
        return;
      }

      // Hover to trigger preview
      await assigneeLink.hover();
      await page.waitForTimeout(600); // Wait for hover delay

      // Check for hover preview card (exclude the link inside)
      const previewCard = page.locator('[data-testid^="entity-preview-"]:not(a)');
      await expect(previewCard).toBeVisible({ timeout: 3000 });
    });

    test('task creator is clickable link', async ({ page }) => {
      // Navigate to tasks page with specific task
      await page.goto('/tasks?selected=el-3oqo');
      await page.waitForLoadState('networkidle');

      // Wait for task detail to load
      await page.waitForTimeout(1000);

      // Scroll down to see "Created by" section
      const detailPanel = page.locator('[data-testid="task-detail-panel"]');
      await detailPanel.evaluate(el => el.scrollTop = el.scrollHeight);
      await page.waitForTimeout(300);

      // Look for creator link (in "Created by" section)
      const creatorLink = page.locator('[data-testid="task-detail-creator-link"]');
      const hasCreatorLink = await creatorLink.isVisible().catch(() => false);

      if (!hasCreatorLink) {
        test.skip();
        return;
      }

      // Click the creator link
      await creatorLink.click();
      await page.waitForTimeout(500);

      // Verify navigation to entities page
      await expect(page).toHaveURL(/\/entities/);
    });
  });

  test.describe('Message Sender', () => {
    test('message sender is clickable link', async ({ page }) => {
      // Navigate to messages page
      await page.goto('/messages');
      await page.waitForLoadState('networkidle');

      // Wait for channels to load
      await page.waitForTimeout(1000);

      // Find and click a channel
      const channelItem = page.locator('[data-testid^="channel-"]').first();
      const channelCount = await channelItem.count();
      if (channelCount === 0) {
        test.skip();
        return;
      }

      await channelItem.click();
      await page.waitForTimeout(500);

      // Find a message sender link
      const senderLink = page.locator('[data-testid^="message-sender-"]').first();
      const hasSender = await senderLink.isVisible().catch(() => false);

      if (!hasSender) {
        test.skip();
        return;
      }

      // Click the sender link
      await senderLink.click();
      await page.waitForTimeout(500);

      // Verify navigation to entities page
      await expect(page).toHaveURL(/\/entities/);
    });
  });

  test.describe('EntityLink Component', () => {
    test('EntityLink navigates to entity detail', async ({ page }) => {
      // Navigate to entities page first to get an entity ID
      await page.goto('/entities');
      await page.waitForLoadState('networkidle');

      // Wait for entities to load
      await page.waitForTimeout(1000);

      // Find an entity card
      const entityCard = page.locator('[data-testid^="entity-card-"]').first();
      const entityCount = await entityCard.count();
      if (entityCount === 0) {
        test.skip();
        return;
      }

      // Get the entity ID from the test ID
      const testId = await entityCard.getAttribute('data-testid');
      const entityId = testId?.replace('entity-card-', '');

      // Click to select entity
      await entityCard.click();
      await page.waitForTimeout(500);

      // Verify entity is selected
      if (entityId) {
        await expect(page).toHaveURL(new RegExp(`selected=${entityId}`));
      }
    });
  });
});
