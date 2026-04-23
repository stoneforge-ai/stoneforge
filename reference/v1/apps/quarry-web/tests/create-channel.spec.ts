import { test, expect } from '@playwright/test';

test.describe('TB31: Create Channel', () => {
  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('POST /api/channels endpoint creates a group channel', async ({ page }) => {
    // Get an entity to use as createdBy and member
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();

    if (entities.length < 2) {
      test.skip();
      return;
    }

    const uniqueName = `test-channel-${Date.now()}`;
    const response = await page.request.post('/api/channels', {
      data: {
        channelType: 'group',
        name: uniqueName,
        createdBy: entities[0].id,
        members: [entities[1].id],
        visibility: 'private',
        joinPolicy: 'invite-only',
        tags: ['test', 'playwright'],
      },
    });

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(201);

    const channel = await response.json();
    expect(channel.id).toBeDefined();
    expect(channel.type).toBe('channel');
    expect(channel.name).toBe(uniqueName);
    expect(channel.channelType).toBe('group');
    expect(channel.members).toContain(entities[0].id);
    expect(channel.members).toContain(entities[1].id);
    expect(channel.permissions.visibility).toBe('private');
    expect(channel.permissions.joinPolicy).toBe('invite-only');
    expect(channel.tags).toContain('test');
    expect(channel.tags).toContain('playwright');
  });

  test('POST /api/channels endpoint creates a direct channel', async ({ page }) => {
    // Get entities to use for direct channel
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();

    if (entities.length < 2) {
      test.skip();
      return;
    }

    const response = await page.request.post('/api/channels', {
      data: {
        channelType: 'direct',
        entityA: entities[0].id,
        entityB: entities[1].id,
        createdBy: entities[0].id,
        tags: ['direct-test'],
      },
    });

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(201);

    const channel = await response.json();
    expect(channel.id).toBeDefined();
    expect(channel.type).toBe('channel');
    expect(channel.channelType).toBe('direct');
    expect(channel.members).toHaveLength(2);
    expect(channel.members).toContain(entities[0].id);
    expect(channel.members).toContain(entities[1].id);
    expect(channel.permissions.visibility).toBe('private');
    expect(channel.tags).toContain('direct-test');
  });

  test('POST /api/channels endpoint validates required fields', async ({ page }) => {
    // Missing channelType
    const response1 = await page.request.post('/api/channels', {
      data: {
        name: 'test',
        createdBy: 'el-test',
      },
    });
    expect(response1.status()).toBe(400);
    const error1 = await response1.json();
    expect(error1.error.code).toBe('VALIDATION_ERROR');

    // Missing createdBy
    const response2 = await page.request.post('/api/channels', {
      data: {
        channelType: 'group',
        name: 'test',
      },
    });
    expect(response2.status()).toBe(400);
    const error2 = await response2.json();
    expect(error2.error.code).toBe('VALIDATION_ERROR');

    // Missing name for group channel
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();
    if (entities.length > 0) {
      const response3 = await page.request.post('/api/channels', {
        data: {
          channelType: 'group',
          createdBy: entities[0].id,
        },
      });
      expect(response3.status()).toBe(400);
    }
  });

  test('POST /api/channels endpoint validates direct channel entities', async ({ page }) => {
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();

    if (entities.length < 1) {
      test.skip();
      return;
    }

    // Missing entityA
    const response1 = await page.request.post('/api/channels', {
      data: {
        channelType: 'direct',
        entityB: entities[0].id,
        createdBy: entities[0].id,
      },
    });
    expect(response1.status()).toBe(400);
    const error1 = await response1.json();
    expect(error1.error.code).toBe('VALIDATION_ERROR');

    // Missing entityB
    const response2 = await page.request.post('/api/channels', {
      data: {
        channelType: 'direct',
        entityA: entities[0].id,
        createdBy: entities[0].id,
      },
    });
    expect(response2.status()).toBe(400);
    const error2 = await response2.json();
    expect(error2.error.code).toBe('VALIDATION_ERROR');
  });

  // ============================================================================
  // UI Tests
  // ============================================================================

  test('new channel button is visible in sidebar', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // New Channel button should be visible
    await expect(page.getByTestId('new-channel-button-sidebar')).toBeVisible();
  });

  test('clicking new channel button opens modal', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Click the New Channel button
    await page.getByTestId('new-channel-button-sidebar').click();

    // Modal should open
    await expect(page.getByTestId('create-channel-modal')).toBeVisible({ timeout: 5000 });
  });

  test('create channel modal has required fields for group channel', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-channel-button-sidebar').click();
    await expect(page.getByTestId('create-channel-modal')).toBeVisible({ timeout: 5000 });

    // Should default to group type
    await expect(page.getByTestId('create-channel-type-group')).toHaveClass(/bg-blue-50/);

    // Check for required fields for group channel
    await expect(page.getByTestId('create-channel-name-input')).toBeVisible();
    await expect(page.getByTestId('create-channel-visibility-select')).toBeVisible();
    await expect(page.getByTestId('create-channel-join-policy-select')).toBeVisible();
    await expect(page.getByTestId('create-channel-members-list')).toBeVisible();
    await expect(page.getByTestId('create-channel-created-by-select')).toBeVisible();
    await expect(page.getByTestId('create-channel-submit-button')).toBeVisible();
    await expect(page.getByTestId('create-channel-cancel-button')).toBeVisible();
  });

  test('switching to direct channel shows different fields', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-channel-button-sidebar').click();
    await expect(page.getByTestId('create-channel-modal')).toBeVisible({ timeout: 5000 });

    // Switch to direct channel
    await page.getByTestId('create-channel-type-direct').click();

    // Direct channel fields should be visible
    await expect(page.getByTestId('create-channel-entity-a-select')).toBeVisible();
    await expect(page.getByTestId('create-channel-entity-b-select')).toBeVisible();

    // Group channel fields should not be visible
    await expect(page.getByTestId('create-channel-name-input')).not.toBeVisible();
    await expect(page.getByTestId('create-channel-visibility-select')).not.toBeVisible();
  });

  test('create channel modal closes on cancel', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-channel-button-sidebar').click();
    await expect(page.getByTestId('create-channel-modal')).toBeVisible({ timeout: 5000 });

    // Click cancel
    await page.getByTestId('create-channel-cancel-button').click();

    // Modal should close
    await expect(page.getByTestId('create-channel-modal')).not.toBeVisible();
  });

  test('create channel modal closes on backdrop click', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-channel-button-sidebar').click();
    await expect(page.getByTestId('create-channel-modal')).toBeVisible({ timeout: 5000 });

    // Click backdrop at a position away from the dialog
    await page.getByTestId('create-channel-modal-backdrop').click({ position: { x: 10, y: 10 } });

    // Modal should close
    await expect(page.getByTestId('create-channel-modal')).not.toBeVisible();
  });

  test('create channel modal closes on escape key', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-channel-button-sidebar').click();
    await expect(page.getByTestId('create-channel-modal')).toBeVisible({ timeout: 5000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should close
    await expect(page.getByTestId('create-channel-modal')).not.toBeVisible();
  });

  test('can create a group channel from modal', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-channel-button-sidebar').click();
    await expect(page.getByTestId('create-channel-modal')).toBeVisible({ timeout: 5000 });

    // Fill in the form with a unique name
    const uniqueName = `ui-modal-channel-${Date.now()}`;
    await page.getByTestId('create-channel-name-input').fill(uniqueName);

    // Wait for entities to load and select one if available
    await page.waitForTimeout(500);
    const createdBySelect = page.getByTestId('create-channel-created-by-select');
    const options = await createdBySelect.locator('option').count();
    if (options > 1) {
      await createdBySelect.selectOption({ index: 1 });
    }

    // Group channels need at least 2 members - select an additional member
    const membersList = page.getByTestId('create-channel-members-list');
    const firstCheckbox = membersList.locator('input[type="checkbox"]').first();
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.check();
    }

    // Submit the form
    await page.getByTestId('create-channel-submit-button').click();

    // Modal should close
    await expect(page.getByTestId('create-channel-modal')).not.toBeVisible({ timeout: 5000 });

    // Check that the channel was created by fetching the API and looking for our unique name
    const finalResponse = await page.request.get('/api/channels');
    const finalChannels = await finalResponse.json();
    const expectedName = uniqueName.toLowerCase();
    expect(finalChannels.some((ch: { name: string }) => ch.name === expectedName)).toBe(true);
  });

  test('submit button is disabled without required fields', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-channel-button-sidebar').click();
    await expect(page.getByTestId('create-channel-modal')).toBeVisible({ timeout: 5000 });

    // Submit button should be disabled without name
    await expect(page.getByTestId('create-channel-submit-button')).toBeDisabled();

    // Fill in name only
    await page.getByTestId('create-channel-name-input').fill('Test Channel');

    // Wait for entities to load
    await page.waitForTimeout(500);

    // If an entity is automatically selected, button might be enabled now
    const createdBySelect = page.getByTestId('create-channel-created-by-select');
    const selectedValue = await createdBySelect.inputValue();

    if (selectedValue) {
      // An entity is selected, button should be enabled
      await expect(page.getByTestId('create-channel-submit-button')).toBeEnabled();
    } else {
      // No entity selected, button should be disabled
      await expect(page.getByTestId('create-channel-submit-button')).toBeDisabled();
    }
  });

  test('empty state in sidebar shows create channel link', async ({ page }) => {
    // This test checks the empty state when no channels exist
    await page.goto('/messages');
    await expect(page.getByTestId('messages-page')).toBeVisible({ timeout: 10000 });

    // Check if empty state exists (may not if channels exist)
    const emptyState = page.getByTestId('channel-empty-state');
    const isEmptyStateVisible = await emptyState.isVisible().catch(() => false);

    if (isEmptyStateVisible) {
      // If empty state is visible, the create button should be there
      await expect(page.getByTestId('new-channel-button-empty')).toBeVisible();

      // Click the create button
      await page.getByTestId('new-channel-button-empty').click();

      // Modal should open
      await expect(page.getByTestId('create-channel-modal')).toBeVisible({ timeout: 5000 });
    } else {
      // Skip if channels exist
      test.skip();
    }
  });

  test('channel appears in list after creation', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // Open modal
    await page.getByTestId('new-channel-button-sidebar').click();
    await expect(page.getByTestId('create-channel-modal')).toBeVisible({ timeout: 5000 });

    // Create a unique channel name
    const uniqueName = `visible-channel-${Date.now()}`;
    await page.getByTestId('create-channel-name-input').fill(uniqueName);

    // Select an entity
    await page.waitForTimeout(500);
    const createdBySelect = page.getByTestId('create-channel-created-by-select');
    const options = await createdBySelect.locator('option').count();
    if (options > 1) {
      await createdBySelect.selectOption({ index: 1 });
    }

    // Group channels need at least 2 members - select an additional member
    const membersList = page.getByTestId('create-channel-members-list');
    const firstCheckbox = membersList.locator('input[type="checkbox"]').first();
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.check();
    }

    // Submit
    await page.getByTestId('create-channel-submit-button').click();

    // Wait for modal to close
    await expect(page.getByTestId('create-channel-modal')).not.toBeVisible({ timeout: 5000 });

    // Channel should appear in list (need to wait for query invalidation)
    await page.waitForTimeout(1000);

    // Reload to ensure fresh data
    await page.reload();
    await expect(page.getByTestId('channel-list')).toBeVisible({ timeout: 5000 });

    // The channel name should be visible in the list (converted to kebab-case)
    const expectedName = uniqueName.toLowerCase();
    await expect(page.getByText(expectedName)).toBeVisible({ timeout: 5000 });
  });
});
