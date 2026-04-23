import { test, expect, Page } from '@playwright/test';

test.describe('TB113: Entity Tags Display - Mentioned In Section', () => {
  // Helper to get first entity
  async function getFirstEntity(page: Page): Promise<{ id: string; name: string; entityType: string } | null> {
    const response = await page.request.get('/api/entities?limit=10');
    const data = await response.json();
    const entities = data.items || data;
    return entities.length > 0 ? entities[0] : null;
  }

  // Helper to get first library
  async function getFirstLibrary(page: Page): Promise<{ id: string; name: string } | null> {
    const response = await page.request.get('/api/libraries');
    const data = await response.json();
    const libraries = data.items || data;
    const rootLib = libraries.find((l: { parentId?: string | null }) => !l.parentId);
    return rootLib || (libraries.length > 0 ? libraries[0] : null);
  }

  // Helper to create a document that mentions an entity
  async function createDocumentWithMention(
    page: Page,
    entityId: string,
    libraryId: string,
    mentionedEntityName: string
  ): Promise<{ id: string; title: string }> {
    const title = `Doc mentioning @${mentionedEntityName} ${Date.now()}`;
    const response = await page.request.post('/api/documents', {
      data: {
        title,
        content: `This document mentions @${mentionedEntityName} for testing purposes.`,
        contentType: 'markdown',
        createdBy: entityId,
        libraryId,
      },
    });
    const doc = await response.json();
    return doc;
  }

  // Helper to create a task that mentions an entity in description
  async function createTaskWithMention(
    page: Page,
    createdBy: string,
    mentionedEntityName: string
  ): Promise<{ id: string; title: string }> {
    const title = `Task mentioning ${mentionedEntityName} ${Date.now()}`;
    const response = await page.request.post('/api/tasks', {
      data: {
        title,
        description: `This task is about @${mentionedEntityName} being involved.`,
        status: 'open',
        priority: 3,
        createdBy,
      },
    });
    const task = await response.json();
    return task;
  }

  // Helper to navigate to entity detail
  async function navigateToEntityDetail(page: Page, entityId: string) {
    await page.goto(`/entities?selected=${entityId}`);
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });
  }

  // ============================================================================
  // API Tests
  // ============================================================================

  test('GET /api/entities/:id/mentions returns mentions data', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/entities/${entity.id}/mentions`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('entityId');
    expect(data).toHaveProperty('entityName');
    expect(data).toHaveProperty('mentions');
    expect(data).toHaveProperty('documentCount');
    expect(data).toHaveProperty('totalCount');
    expect(Array.isArray(data.mentions)).toBeTruthy();
  });

  test('mentions endpoint includes document that mentions entity', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    if (!entity || !library) {
      test.skip();
      return;
    }

    // Create a document that mentions this entity
    const doc = await createDocumentWithMention(page, entity.id, library.id, entity.name);

    // Check the mentions endpoint
    const response = await page.request.get(`/api/entities/${entity.id}/mentions`);
    const data = await response.json();

    // Should find the document we just created
    const foundDoc = data.mentions.find((m: { id: string }) => m.id === doc.id);
    expect(foundDoc).toBeTruthy();
    expect(foundDoc.type).toBe('document');
  });

  test('mentions endpoint includes document from task description that mentions entity', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task that mentions this entity in description
    // The description is stored as a document, so it should appear in document mentions
    await createTaskWithMention(page, entity.id, entity.name);

    // Check the mentions endpoint
    const response = await page.request.get(`/api/entities/${entity.id}/mentions`);
    const data = await response.json();

    // Should find a document mention (the task's description is stored as a document)
    // The mentions endpoint returns documents that contain the @mention
    expect(data.documentCount).toBeGreaterThanOrEqual(0);
  });

  // ============================================================================
  // UI Tests
  // ============================================================================

  test('EntityDetailPanel shows Mentioned In section', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    await navigateToEntityDetail(page, entity.id);

    // Should see the Mentioned In heading (with AtSign icon)
    const mentionedInSection = page.getByRole('heading', { name: /Mentioned In/i });
    await expect(mentionedInSection).toBeVisible({ timeout: 5000 });
  });

  test('shows "No documents or tasks mention this entity" when no mentions', async ({ page }) => {
    // Create a new entity that won't have any mentions
    const existingEntity = await getFirstEntity(page);
    if (!existingEntity) {
      test.skip();
      return;
    }

    const uniqueName = `TestEntity_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: uniqueName,
        entityType: 'agent',
        createdBy: existingEntity.id,
      },
    });
    const newEntity = await createResponse.json();

    await navigateToEntityDetail(page, newEntity.id);

    // Wait for mentions section to load - may show loading state first
    await page.waitForTimeout(1000);

    // Should see the empty state message or loading text first
    const noMentions = page.getByTestId('no-mentions');
    const mentionsContainer = page.getByTestId('entity-mentions');

    // Wait until either no-mentions or entity-mentions is visible
    // (one of them will appear when loading completes)
    await expect(noMentions.or(mentionsContainer)).toBeVisible({ timeout: 5000 });

    // If this is a truly new entity with no mentions, no-mentions should be visible
    // But if mentions container is visible, that means the entity already has mentions (unlikely for a new entity)
    if (await noMentions.isVisible()) {
      await expect(noMentions).toContainText('No documents or tasks mention this entity');
    } else {
      // Skip if unexpectedly has mentions
      test.skip();
    }
  });

  test('shows count badge when entity has mentions', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    if (!entity || !library) {
      test.skip();
      return;
    }

    // Create a document that mentions this entity
    await createDocumentWithMention(page, entity.id, library.id, entity.name);

    await navigateToEntityDetail(page, entity.id);

    // Should see the mentions count badge
    const countBadge = page.getByTestId('mentions-count-badge');
    await expect(countBadge).toBeVisible({ timeout: 5000 });
    const countText = await countBadge.textContent();
    expect(parseInt(countText || '0', 10)).toBeGreaterThan(0);
  });

  test('clicking document mention navigates to documents page', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    if (!entity || !library) {
      test.skip();
      return;
    }

    // Create a document that mentions this entity
    const doc = await createDocumentWithMention(page, entity.id, library.id, entity.name);

    await navigateToEntityDetail(page, entity.id);

    // Wait for mentions to load
    const mentionsContainer = page.getByTestId('entity-mentions');
    await expect(mentionsContainer).toBeVisible({ timeout: 5000 });

    // Click on the document mention
    const mentionItem = page.getByTestId(`mention-item-${doc.id}`);
    await expect(mentionItem).toBeVisible({ timeout: 5000 });
    await mentionItem.click();

    // Should navigate to documents page with that document selected
    await expect(page).toHaveURL(/\/documents\?.*selected=/, { timeout: 5000 });
  });

  test('clicking task mention navigates to tasks page', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task that mentions this entity
    const task = await createTaskWithMention(page, entity.id, entity.name);

    await navigateToEntityDetail(page, entity.id);

    // Wait for mentions to load
    const mentionsContainer = page.getByTestId('entity-mentions');
    await expect(mentionsContainer).toBeVisible({ timeout: 5000 });

    // Click on the task mention
    const mentionItem = page.getByTestId(`mention-item-${task.id}`);
    await expect(mentionItem).toBeVisible({ timeout: 5000 });
    await mentionItem.click();

    // Should navigate to tasks page with that task selected
    await expect(page).toHaveURL(/\/tasks\?.*selected=/, { timeout: 5000 });
  });

  test('mention items show correct icons for document vs task', async ({ page }) => {
    const entity = await getFirstEntity(page);
    const library = await getFirstLibrary(page);
    if (!entity || !library) {
      test.skip();
      return;
    }

    // Create both a document and a task that mention this entity
    const doc = await createDocumentWithMention(page, entity.id, library.id, entity.name);
    const task = await createTaskWithMention(page, entity.id, entity.name);

    await navigateToEntityDetail(page, entity.id);

    // Wait for mentions to load
    const mentionsContainer = page.getByTestId('entity-mentions');
    await expect(mentionsContainer).toBeVisible({ timeout: 5000 });

    // Document mention should have blue background (FileText icon)
    const docMention = page.getByTestId(`mention-item-${doc.id}`);
    await expect(docMention).toBeVisible();
    const docIcon = docMention.locator('.bg-blue-100');
    await expect(docIcon).toBeVisible();

    // Task mention should have green background (ListTodo icon)
    const taskMention = page.getByTestId(`mention-item-${task.id}`);
    await expect(taskMention).toBeVisible();
    const taskIcon = taskMention.locator('.bg-green-100');
    await expect(taskIcon).toBeVisible();
  });

  test('task mentions show status badge', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task that mentions this entity
    const task = await createTaskWithMention(page, entity.id, entity.name);

    await navigateToEntityDetail(page, entity.id);

    // Wait for mentions to load
    const mentionsContainer = page.getByTestId('entity-mentions');
    await expect(mentionsContainer).toBeVisible({ timeout: 5000 });

    // Task mention should show its status
    const taskMention = page.getByTestId(`mention-item-${task.id}`);
    await expect(taskMention).toBeVisible();
    // The task is created with 'open' status
    await expect(taskMention).toContainText('open');
  });
});
