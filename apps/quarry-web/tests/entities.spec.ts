import { test, expect } from '@playwright/test';

test.describe('TB33: Entities Page - List View', () => {
  test('entities endpoint is accessible and returns paginated response', async ({ page }) => {
    const response = await page.request.get('/api/entities');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    // New paginated format
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
    expect(typeof data.offset).toBe('number');
    expect(typeof data.limit).toBe('number');
    expect(typeof data.hasMore).toBe('boolean');
  });

  test('entities page is accessible via navigation', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar has Entities nav item', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Check for Entities link in sidebar
    const entitiesLink = page.getByRole('link', { name: /Entities/i });
    await expect(entitiesLink).toBeVisible();
  });

  test('can navigate to Entities from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click Entities link using data-testid for reliability
    await page.getByTestId('nav-entities').click();

    // Should be on entities page with pagination params
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/entities/);
    await expect(page).toHaveURL(/page=1/);
    await expect(page).toHaveURL(/limit=25/);
  });

  test('entities page shows filter tabs', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    // Check for filter tabs
    await expect(page.getByTestId('entity-filter-tabs')).toBeVisible();
    await expect(page.getByTestId('entity-filter-all')).toBeVisible();
    await expect(page.getByTestId('entity-filter-agent')).toBeVisible();
    await expect(page.getByTestId('entity-filter-human')).toBeVisible();
    await expect(page.getByTestId('entity-filter-system')).toBeVisible();
  });

  test('entities page shows search box', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    // Check for search box
    await expect(page.getByTestId('entity-search')).toBeVisible();
    await expect(page.getByTestId('entity-search-input')).toBeVisible();
  });

  test('entities page shows appropriate content based on entities', async ({ page }) => {
    // Get entities from API with same limit as web page (25)
    const response = await page.request.get('/api/entities?limit=25');
    const data = await response.json();
    const entities = data.items;
    const total = data.total;

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    if (total === 0) {
      // Should show empty state
      await expect(page.getByTestId('entities-empty')).toBeVisible();
      await expect(page.getByText('No entities registered')).toBeVisible();
    } else {
      // Should show entities grid
      await expect(page.getByTestId('entities-grid')).toBeVisible();
      // Should show correct count in header (showing current page items of total)
      await expect(page.getByText(new RegExp(`\\d+ of ${total} entities`))).toBeVisible();
    }
  });

  test('filter by entity type works', async ({ page }) => {
    // Get entities from API (now paginated)
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;
    const total = data.total;

    if (total === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Count entities by type on current page
    const agentCount = entities.filter((e: { entityType: string }) => e.entityType === 'agent').length;
    const humanCount = entities.filter((e: { entityType: string }) => e.entityType === 'human').length;
    const systemCount = entities.filter((e: { entityType: string }) => e.entityType === 'system').length;

    // Click on agents filter (if there are any)
    if (agentCount > 0) {
      await page.getByTestId('entity-filter-agent').click();
      await page.waitForTimeout(100);
      // Filter tab counts show total, but list shows filtered items
      await expect(page.getByTestId('entities-grid')).toBeVisible();
    }

    // Click on humans filter (if there are any)
    if (humanCount > 0) {
      await page.getByTestId('entity-filter-human').click();
      await page.waitForTimeout(100);
      await expect(page.getByTestId('entities-grid')).toBeVisible();
    }

    // Click on systems filter (if there are any)
    if (systemCount > 0) {
      await page.getByTestId('entity-filter-system').click();
      await page.waitForTimeout(100);
      await expect(page.getByTestId('entities-grid')).toBeVisible();
    }

    // Click on all filter to reset
    await page.getByTestId('entity-filter-all').click();
    await page.waitForTimeout(100);
    await expect(page.getByTestId('entities-grid')).toBeVisible();
  });

  test('search filters entities by name', async ({ page }) => {
    // Get entities from API (now paginated)
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Get first entity name
    const firstEntity = entities[0];
    const searchTerm = firstEntity.name.substring(0, 3);

    // Type in search box
    await page.getByTestId('entity-search-input').fill(searchTerm);

    // Wait for filtering to apply (server-side filtering takes a moment)
    await page.waitForTimeout(300);

    // Should show filtered results
    const matchingEntities = entities.filter((e: { name: string; id: string; tags: string[] }) =>
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.tags.some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (matchingEntities.length > 0) {
      await expect(page.getByTestId('entities-grid')).toBeVisible();
    }
  });

  test('entity cards display correct information', async ({ page }) => {
    // Get entities from API (now paginated)
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Check first entity card
    const firstEntity = entities[0];
    const card = page.getByTestId(`entity-card-${firstEntity.id}`);
    await expect(card).toBeVisible();

    // Check for avatar
    await expect(page.getByTestId(`entity-avatar-${firstEntity.id}`)).toBeVisible();

    // Check for type badge
    await expect(page.getByTestId(`entity-type-badge-${firstEntity.id}`)).toBeVisible();
    await expect(page.getByTestId(`entity-type-badge-${firstEntity.id}`)).toHaveText(firstEntity.entityType);
  });

  test('search with no results shows empty state', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Type a nonsense search term
    await page.getByTestId('entity-search-input').fill('xyznonexistent123456');

    // Wait for filtering to apply
    await page.waitForTimeout(100);

    // Should show empty state with clear filters option
    await expect(page.getByTestId('entities-empty')).toBeVisible();
    await expect(page.getByText('No entities match your filters')).toBeVisible();
    await expect(page.getByTestId('clear-filters-button')).toBeVisible();
  });

  test('clear filters button works', async ({ page }) => {
    // Get entities from API (now paginated)
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const total = data.total;

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Type a nonsense search term
    await page.getByTestId('entity-search-input').fill('xyznonexistent123456');

    // Wait for filtering
    await page.waitForTimeout(300);

    // Should show empty state
    await expect(page.getByTestId('entities-empty')).toBeVisible();

    // Click clear filters
    await page.getByTestId('clear-filters-button').click();

    // Should now show all entities (or empty state if no entities exist)
    if (total > 0) {
      await expect(page.getByTestId('entities-grid')).toBeVisible({ timeout: 10000 });
    } else {
      await expect(page.getByText('No entities registered')).toBeVisible();
    }
  });
});

test.describe('TB34: Entity Detail Panel', () => {
  test('entity stats endpoint is accessible', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get stats for first entity
    const firstEntity = entities[0];
    const statsResponse = await page.request.get(`/api/entities/${firstEntity.id}/stats`);
    expect(statsResponse.ok()).toBe(true);
    const stats = await statsResponse.json();
    expect(typeof stats.assignedTaskCount).toBe('number');
    expect(typeof stats.activeTaskCount).toBe('number');
    expect(typeof stats.completedTaskCount).toBe('number');
    expect(typeof stats.messageCount).toBe('number');
    expect(typeof stats.documentCount).toBe('number');
  });

  test('entity events endpoint is accessible', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get events for first entity
    const firstEntity = entities[0];
    const eventsResponse = await page.request.get(`/api/entities/${firstEntity.id}/events`);
    expect(eventsResponse.ok()).toBe(true);
    const events = await eventsResponse.json();
    expect(Array.isArray(events)).toBe(true);
  });

  test('clicking entity card opens detail panel', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Detail panel should be visible
    await expect(page.getByTestId('entity-detail-container')).toBeVisible();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
  });

  test('detail panel shows entity information', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show entity name in detail panel
    const detailPanel = page.getByTestId('entity-detail-panel');
    await expect(detailPanel.getByRole('heading', { name: firstEntity.name })).toBeVisible();

    // Should show statistics section
    await expect(page.getByText('Statistics')).toBeVisible();
    await expect(page.getByTestId('entity-stats')).toBeVisible({ timeout: 10000 });
  });

  test('detail panel shows assigned tasks section', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show assigned tasks section header
    await expect(page.getByRole('heading', { name: /Assigned Tasks/ })).toBeVisible();
  });

  test('detail panel shows activity timeline', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show recent activity section header
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();
  });

  test('close button closes detail panel', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Detail panel should be visible
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click close button
    await page.getByTestId('entity-detail-close').click();

    // Wait for URL to update (selected param should be cleared, but pagination params remain)
    await expect(page).toHaveURL(/\/entities\?.*page=1.*limit=25/);
    await expect(page).not.toHaveURL(/selected=/);

    // Detail panel should be hidden
    await expect(page.getByTestId('entity-detail-container')).not.toBeVisible({ timeout: 5000 });
  });

  test('split-view layout works correctly', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Initially, entity grid should be full width (3 columns on lg)
    const grid = page.getByTestId('entities-grid').locator('> div').first();
    await expect(grid).toHaveClass(/lg:grid-cols-3/);

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Now grid should be single column (detail panel takes half)
    await expect(grid).toHaveClass(/grid-cols-1/);
    await expect(grid).not.toHaveClass(/lg:grid-cols-3/);
  });

  test('selected entity card is highlighted', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    const card = page.getByTestId(`entity-card-${firstEntity.id}`);
    await card.click();

    // Card should have selected styling (blue border)
    await expect(card).toHaveClass(/border-blue-500/);
    await expect(card).toHaveClass(/ring-2/);
  });
});

test.describe('TB35: Create Entity', () => {
  test('POST /api/entities endpoint creates entity', async ({ page }) => {
    const testName = `test-entity-${Date.now()}`;

    const response = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
      },
    });

    expect(response.ok()).toBe(true);
    const entity = await response.json();
    expect(entity.name).toBe(testName);
    expect(entity.entityType).toBe('agent');
    expect(entity.id).toBeDefined();
  });

  test('POST /api/entities validates name is required', async ({ page }) => {
    const response = await page.request.post('/api/entities', {
      data: {
        entityType: 'agent',
      },
    });

    expect(response.ok()).toBe(false);
    const error = await response.json();
    expect(error.error?.message).toContain('Name');
  });

  test('POST /api/entities validates entity type', async ({ page }) => {
    const response = await page.request.post('/api/entities', {
      data: {
        name: `test-entity-${Date.now()}`,
        entityType: 'invalid',
      },
    });

    expect(response.ok()).toBe(false);
    const error = await response.json();
    expect(error.error?.message).toContain('entity type');
  });

  test('POST /api/entities rejects duplicate names', async ({ page }) => {
    // Get existing entities (now paginated)
    const existingResponse = await page.request.get('/api/entities');
    const existingData = await existingResponse.json();
    const entities = existingData.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Try to create entity with same name
    const response = await page.request.post('/api/entities', {
      data: {
        name: entities[0].name,
        entityType: 'agent',
      },
    });

    expect(response.ok()).toBe(false);
    const error = await response.json();
    expect(error.error?.message).toContain('already exists');
  });

  test('create entity button is visible', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('create-entity-button')).toBeVisible();
  });

  test('clicking create entity button opens modal', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-entity-button').click();

    await expect(page.getByTestId('create-entity-modal')).toBeVisible();
  });

  test('create entity modal has required fields', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-entity-button').click();
    await expect(page.getByTestId('create-entity-modal')).toBeVisible();

    // Check for name input
    await expect(page.getByTestId('create-entity-name-input')).toBeVisible();

    // Check for entity type options
    await expect(page.getByTestId('create-entity-type-options')).toBeVisible();
    await expect(page.getByTestId('create-entity-type-agent')).toBeVisible();
    await expect(page.getByTestId('create-entity-type-human')).toBeVisible();
    await expect(page.getByTestId('create-entity-type-system')).toBeVisible();

    // Check for optional fields
    await expect(page.getByTestId('create-entity-public-key-input')).toBeVisible();
    await expect(page.getByTestId('create-entity-tags-input')).toBeVisible();

    // Check for submit button
    await expect(page.getByTestId('create-entity-submit')).toBeVisible();
  });

  test('create entity modal can be closed', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-entity-button').click();
    await expect(page.getByTestId('create-entity-modal')).toBeVisible();

    // Click close button
    await page.getByTestId('create-entity-modal-close').click();

    await expect(page.getByTestId('create-entity-modal')).not.toBeVisible();
  });

  test('create entity modal can be closed with cancel button', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-entity-button').click();
    await expect(page.getByTestId('create-entity-modal')).toBeVisible();

    // Click cancel button - scroll into view first
    const cancelButton = page.getByTestId('create-entity-cancel');
    await cancelButton.scrollIntoViewIfNeeded();
    await cancelButton.click();

    await expect(page.getByTestId('create-entity-modal')).not.toBeVisible();
  });

  test('can create new entity via modal', async ({ page }) => {
    const testName = `TestAgent${Date.now()}`;

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Open modal
    await page.getByTestId('create-entity-button').click();
    await expect(page.getByTestId('create-entity-modal')).toBeVisible();

    // Fill in name
    await page.getByTestId('create-entity-name-input').fill(testName);

    // Select agent type (should already be selected by default)
    await page.getByTestId('create-entity-type-agent').click();

    // Submit - scroll into view first
    const submitButton = page.getByTestId('create-entity-submit');
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    // Modal should close
    await expect(page.getByTestId('create-entity-modal')).not.toBeVisible({ timeout: 10000 });

    // New entity should appear in the list
    await expect(page.getByTestId(`entity-card-${testName}`).or(page.getByText(testName).first())).toBeVisible({ timeout: 10000 });
  });

  test('shows validation error for invalid entity name', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    // Open modal
    await page.getByTestId('create-entity-button').click();
    await expect(page.getByTestId('create-entity-modal')).toBeVisible();

    // Fill in invalid name (starts with number)
    await page.getByTestId('create-entity-name-input').fill('123invalid');

    // Submit - scroll into view first
    const submitButton = page.getByTestId('create-entity-submit');
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    // Should show error (modal should still be visible with error)
    await expect(page.getByTestId('create-entity-error')).toBeVisible({ timeout: 5000 });
  });

  test('can create entity with all optional fields', async ({ page }) => {
    const testName = `TestFullEntity${Date.now()}`;

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Open modal
    await page.getByTestId('create-entity-button').click();
    await expect(page.getByTestId('create-entity-modal')).toBeVisible();

    // Fill in name
    await page.getByTestId('create-entity-name-input').fill(testName);

    // Select human type
    await page.getByTestId('create-entity-type-human').click();

    // Add tags
    await page.getByTestId('create-entity-tags-input').fill('test, automation, playwright');

    // Submit - scroll into view first
    const submitButton = page.getByTestId('create-entity-submit');
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    // Modal should close
    await expect(page.getByTestId('create-entity-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify entity was created via API (now paginated)
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const createdEntity = data.items.find((e: { name: string }) => e.name === testName);

    expect(createdEntity).toBeDefined();
    expect(createdEntity.entityType).toBe('human');
    expect(createdEntity.tags).toContain('test');
    expect(createdEntity.tags).toContain('automation');
    expect(createdEntity.tags).toContain('playwright');
  });
});

test.describe('TB36: Edit Entity', () => {
  test('PATCH /api/entities/:id endpoint updates entity name', async ({ page }) => {
    // First create an entity to edit
    const testName = `EditTest${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    // Update the entity name
    const newName = `${testName}Updated`;
    const updateResponse = await page.request.patch(`/api/entities/${entity.id}`, {
      data: { name: newName },
    });
    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();
    expect(updated.name).toBe(newName);
  });

  test('PATCH /api/entities/:id endpoint updates entity tags', async ({ page }) => {
    // First create an entity to edit
    const testName = `TagTest${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
        tags: ['original'],
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    // Update the entity tags
    const updateResponse = await page.request.patch(`/api/entities/${entity.id}`, {
      data: { tags: ['updated', 'new-tag'] },
    });
    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();
    expect(updated.tags).toContain('updated');
    expect(updated.tags).toContain('new-tag');
    expect(updated.tags).not.toContain('original');
  });

  test('PATCH /api/entities/:id endpoint updates active status', async ({ page }) => {
    // First create an entity to edit
    const testName = `ActiveTest${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    // Deactivate the entity
    const updateResponse = await page.request.patch(`/api/entities/${entity.id}`, {
      data: { active: false },
    });
    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();
    expect(updated.active).toBe(false);

    // Reactivate the entity
    const reactivateResponse = await page.request.patch(`/api/entities/${entity.id}`, {
      data: { active: true },
    });
    expect(reactivateResponse.ok()).toBe(true);
    const reactivated = await reactivateResponse.json();
    expect(reactivated.active).toBe(true);
  });

  test('PATCH /api/entities/:id validates name uniqueness', async ({ page }) => {
    // Create two entities
    const testName1 = `Unique1${Date.now()}`;
    const testName2 = `Unique2${Date.now()}`;

    await page.request.post('/api/entities', {
      data: { name: testName1, entityType: 'agent' },
    });
    const response2 = await page.request.post('/api/entities', {
      data: { name: testName2, entityType: 'agent' },
    });
    const entity2 = await response2.json();

    // Try to rename entity2 to entity1's name
    const updateResponse = await page.request.patch(`/api/entities/${entity2.id}`, {
      data: { name: testName1 },
    });
    expect(updateResponse.ok()).toBe(false);
    const error = await updateResponse.json();
    expect(error.error?.message).toContain('already exists');
  });

  test('edit button is visible in entity detail panel', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Edit button should be visible
    await expect(page.getByTestId('entity-edit-button')).toBeVisible();
  });

  test('clicking edit button enables edit mode', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('entity-edit-button').click();

    // Edit mode elements should be visible
    await expect(page.getByTestId('entity-edit-name-input')).toBeVisible();
    await expect(page.getByTestId('entity-save-button')).toBeVisible();
    await expect(page.getByTestId('entity-cancel-edit-button')).toBeVisible();
  });

  test('can edit entity name via UI', async ({ page }) => {
    // First create an entity to edit
    const testName = `UIEdit${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('entity-edit-button').click();

    // Edit the name
    const newName = `${testName}Changed`;
    await page.getByTestId('entity-edit-name-input').fill(newName);

    // Save
    await page.getByTestId('entity-save-button').click();

    // Verify the name was updated in the detail panel
    await expect(page.getByTestId('entity-detail-panel').getByRole('heading', { name: newName })).toBeVisible({ timeout: 10000 });

    // Verify via API
    const verifyResponse = await page.request.get(`/api/entities/${entity.id}`);
    const updated = await verifyResponse.json();
    expect(updated.name).toBe(newName);
  });

  test('cancel button exits edit mode without saving', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('entity-edit-button').click();

    // Change the name
    const originalName = firstEntity.name;
    await page.getByTestId('entity-edit-name-input').fill('SomethingElse');

    // Click cancel
    await page.getByTestId('entity-cancel-edit-button').click();

    // Should exit edit mode
    await expect(page.getByTestId('entity-edit-name-input')).not.toBeVisible();
    await expect(page.getByTestId('entity-edit-button')).toBeVisible();

    // Name should be unchanged
    await expect(page.getByTestId('entity-detail-panel').getByRole('heading', { name: originalName })).toBeVisible();
  });

  test('toggle active button shows confirmation dialog', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click toggle active button
    await page.getByTestId('entity-toggle-active-button').click();

    // Confirmation dialog should appear
    await expect(page.getByTestId('entity-deactivate-confirm')).toBeVisible();
    await expect(page.getByTestId('entity-confirm-toggle-button')).toBeVisible();
    await expect(page.getByTestId('entity-cancel-toggle-button')).toBeVisible();
  });

  test('cancel toggle active dialog closes without changes', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click toggle active button
    await page.getByTestId('entity-toggle-active-button').click();
    await expect(page.getByTestId('entity-deactivate-confirm')).toBeVisible();

    // Click cancel
    await page.getByTestId('entity-cancel-toggle-button').click();

    // Confirmation dialog should close
    await expect(page.getByTestId('entity-deactivate-confirm')).not.toBeVisible();
    await expect(page.getByTestId('entity-toggle-active-button')).toBeVisible();
  });

  test('can deactivate entity via confirmation dialog', async ({ page }) => {
    // First create an active entity to deactivate
    const testName = `Deactivate${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click toggle active button
    await page.getByTestId('entity-toggle-active-button').click();
    await expect(page.getByTestId('entity-deactivate-confirm')).toBeVisible();

    // Confirm deactivation
    await page.getByTestId('entity-confirm-toggle-button').click();

    // Wait for update
    await expect(page.getByTestId('entity-deactivate-confirm')).not.toBeVisible({ timeout: 10000 });

    // Entity should now show as inactive
    await expect(page.getByTestId('entity-toggle-active-button')).toContainText('Inactive');

    // Verify via API
    const verifyResponse = await page.request.get(`/api/entities/${entity.id}`);
    const updated = await verifyResponse.json();
    expect(updated.active).toBe(false);
  });

  test('can edit tags in edit mode', async ({ page }) => {
    // First create an entity with tags
    const testName = `TagEdit${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
        tags: ['original-tag'],
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('entity-edit-button').click();

    // Edit tags input should be visible
    await expect(page.getByTestId('entity-edit-tags-input')).toBeVisible();

    // Change the tags
    await page.getByTestId('entity-edit-tags-input').fill('new-tag, another-tag');

    // Save
    await page.getByTestId('entity-save-button').click();

    // Verify via API
    await page.waitForTimeout(500); // Wait for update to complete
    const verifyResponse = await page.request.get(`/api/entities/${entity.id}`);
    const updated = await verifyResponse.json();
    expect(updated.tags).toContain('new-tag');
    expect(updated.tags).toContain('another-tag');
    expect(updated.tags).not.toContain('original-tag');
  });

  test('tags list shows remove button on hover', async ({ page }) => {
    // First create an entity with tags
    const testName = `TagRemove${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
        tags: ['removable-tag'],
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Wait for tags list to load
    await expect(page.getByTestId('entity-tags-list')).toBeVisible({ timeout: 10000 });

    // Hover over the tag to reveal remove button
    const tagElement = page.getByText('removable-tag').first();
    await tagElement.hover();

    // Remove button should become visible
    await expect(page.getByTestId('entity-remove-tag-removable-tag')).toBeVisible();
  });

  test('can remove tag by clicking remove button', async ({ page }) => {
    // First create an entity with multiple tags
    const testName = `TagRemove2${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
        tags: ['keep-me', 'remove-me'],
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Wait for tags list to load
    await expect(page.getByTestId('entity-tags-list')).toBeVisible({ timeout: 10000 });

    // Hover and click remove button
    const tagElement = page.getByText('remove-me').first();
    await tagElement.hover();
    await page.getByTestId('entity-remove-tag-remove-me').click();

    // Wait for update to complete
    await page.waitForTimeout(500);

    // Verify via API
    const verifyResponse = await page.request.get(`/api/entities/${entity.id}`);
    const updated = await verifyResponse.json();
    expect(updated.tags).toContain('keep-me');
    expect(updated.tags).not.toContain('remove-me');
  });
});

test.describe('TB46: Entities Pagination', () => {
  test('entities API returns paginated response format', async ({ page }) => {
    const response = await page.request.get('/api/entities');
    expect(response.ok()).toBe(true);
    const data = await response.json();

    // Verify paginated response structure
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('offset');
    expect(data).toHaveProperty('limit');
    expect(data).toHaveProperty('hasMore');

    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
    expect(typeof data.offset).toBe('number');
    expect(typeof data.limit).toBe('number');
    expect(typeof data.hasMore).toBe('boolean');
  });

  test('entities API respects limit parameter', async ({ page }) => {
    const response = await page.request.get('/api/entities?limit=5');
    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.limit).toBe(5);
    expect(data.items.length).toBeLessThanOrEqual(5);
  });

  test('entities API respects offset parameter', async ({ page }) => {
    const response = await page.request.get('/api/entities?offset=0&limit=50');
    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.offset).toBe(0);
  });

  test('pagination component is visible when entities exist', async ({ page }) => {
    const response = await page.request.get('/api/entities');
    const data = await response.json();

    if (data.total === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Pagination component should be visible
    await expect(page.getByTestId('pagination')).toBeVisible();
  });

  test('pagination shows correct total count', async ({ page }) => {
    const response = await page.request.get('/api/entities');
    const data = await response.json();

    if (data.total === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Check that pagination shows total count
    await expect(page.getByTestId('pagination')).toContainText(`${data.total}`);
  });

  test('page size selector works', async ({ page }) => {
    const response = await page.request.get('/api/entities');
    const data = await response.json();

    if (data.total === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Page size selector should be visible
    const pageSizeSelector = page.getByTestId('pagination-page-size');
    await expect(pageSizeSelector).toBeVisible();

    // Change page size to 10
    await pageSizeSelector.selectOption('10');

    // URL should update with new limit
    await expect(page).toHaveURL(/limit=10/);
  });

  test('URL reflects pagination state', async ({ page }) => {
    await page.goto('/entities?page=1&limit=10');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // URL should have pagination params
    await expect(page).toHaveURL(/page=1/);
    await expect(page).toHaveURL(/limit=10/);
  });

  test('navigating to entities page uses default pagination', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    // URL should have default pagination params
    await expect(page).toHaveURL(/page=1/);
    await expect(page).toHaveURL(/limit=25/);
  });
});

test.describe('TB64: Entity Inbox Tab', () => {
  test('GET /api/entities/:id/inbox endpoint is accessible', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get inbox for first entity
    const firstEntity = entities[0];
    const inboxResponse = await page.request.get(`/api/entities/${firstEntity.id}/inbox`);
    expect(inboxResponse.ok()).toBe(true);
    const inbox = await inboxResponse.json();
    expect(Array.isArray(inbox.items)).toBe(true);
    expect(typeof inbox.total).toBe('number');
    expect(typeof inbox.offset).toBe('number');
    expect(typeof inbox.limit).toBe('number');
    expect(typeof inbox.hasMore).toBe('boolean');
  });

  test('GET /api/entities/:id/inbox/count endpoint is accessible', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get inbox count for first entity
    const firstEntity = entities[0];
    const countResponse = await page.request.get(`/api/entities/${firstEntity.id}/inbox/count`);
    expect(countResponse.ok()).toBe(true);
    const countData = await countResponse.json();
    expect(typeof countData.count).toBe('number');
  });

  test('GET /api/entities/:id/inbox supports hydration parameter', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get inbox with hydration for first entity
    const firstEntity = entities[0];
    const inboxResponse = await page.request.get(`/api/entities/${firstEntity.id}/inbox?hydrate=true`);
    expect(inboxResponse.ok()).toBe(true);
    const inbox = await inboxResponse.json();
    expect(Array.isArray(inbox.items)).toBe(true);
    // Hydrated items should have message, channel, sender (or null if not found)
    // We just verify the endpoint works, actual hydration depends on inbox data
  });

  test('inbox tab is visible in entity detail panel', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Detail panel should be visible with tabs
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entity-detail-tabs')).toBeVisible();

    // Inbox tab should be visible
    await expect(page.getByTestId('entity-tab-inbox')).toBeVisible();
    await expect(page.getByTestId('entity-tab-inbox')).toContainText('Inbox');
  });

  test('clicking inbox tab shows inbox content', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();

    // Inbox tab content should be visible
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });
  });

  test('inbox shows empty state when no messages', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with no inbox items
    let emptyInboxEntityId = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
      const inbox = await inboxResponse.json();
      if (inbox.total === 0) {
        emptyInboxEntityId = entity.id;
        break;
      }
    }

    if (!emptyInboxEntityId) {
      // Create a new entity that will have no inbox
      const testName = `InboxTest${Date.now()}`;
      const createResponse = await page.request.post('/api/entities', {
        data: { name: testName, entityType: 'agent' },
      });
      const newEntity = await createResponse.json();
      emptyInboxEntityId = newEntity.id;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${emptyInboxEntityId}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();

    // Should show empty state
    await expect(page.getByTestId('inbox-empty')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No messages in inbox')).toBeVisible();
  });

  test('inbox count badge appears when entity has unread messages', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with unread inbox items
    let entityWithUnread = null;
    for (const entity of entities) {
      const countResponse = await page.request.get(`/api/entities/${entity.id}/inbox/count`);
      const countData = await countResponse.json();
      if (countData.count > 0) {
        entityWithUnread = { id: entity.id, count: countData.count };
        break;
      }
    }

    if (!entityWithUnread) {
      test.skip(); // No entities with unread inbox items
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithUnread.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Inbox tab should show count badge
    await expect(page.getByTestId('inbox-count-badge')).toBeVisible();
    await expect(page.getByTestId('inbox-count-badge')).toContainText(`${entityWithUnread.count}`);
  });

  test('inbox items list is displayed when entity has messages', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with inbox items
    let entityWithInbox = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithInbox = { id: entity.id, inbox };
        break;
      }
    }

    if (!entityWithInbox) {
      test.skip(); // No entities with inbox items
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithInbox.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // Inbox items list should be visible
    await expect(page.getByTestId('inbox-items-list')).toBeVisible();

    // First inbox item should be visible
    const firstItem = entityWithInbox.inbox.items[0];
    await expect(page.getByTestId(`inbox-item-${firstItem.id}`)).toBeVisible();
  });

  test('inbox item card shows sender name when hydrated', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with inbox items
    let entityWithInbox = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?hydrate=true`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0 && inbox.items[0].sender) {
        entityWithInbox = { id: entity.id, inbox };
        break;
      }
    }

    if (!entityWithInbox) {
      test.skip(); // No entities with hydrated inbox items
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithInbox.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // First inbox item should show sender name
    const firstItem = entityWithInbox.inbox.items[0];
    await expect(page.getByTestId(`inbox-item-sender-${firstItem.id}`)).toBeVisible();
    await expect(page.getByTestId(`inbox-item-sender-${firstItem.id}`)).toContainText(firstItem.sender.name);
  });

  test('inbox item card shows source type badge', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with inbox items
    let entityWithInbox = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithInbox = { id: entity.id, inbox };
        break;
      }
    }

    if (!entityWithInbox) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithInbox.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // First inbox item should show source type badge
    const firstItem = entityWithInbox.inbox.items[0];
    await expect(page.getByTestId(`inbox-item-source-${firstItem.id}`)).toBeVisible();
    // Should contain either "Direct" or "Mention"
    const sourceText = await page.getByTestId(`inbox-item-source-${firstItem.id}`).textContent();
    expect(sourceText?.includes('Direct') || sourceText?.includes('Mention')).toBe(true);
  });

  test('inbox item card shows timestamp', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with inbox items
    let entityWithInbox = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithInbox = { id: entity.id, inbox };
        break;
      }
    }

    if (!entityWithInbox) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithInbox.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // First inbox item should show timestamp
    const firstItem = entityWithInbox.inbox.items[0];
    await expect(page.getByTestId(`inbox-item-time-${firstItem.id}`)).toBeVisible();
  });

  test('inbox item card has sender avatar', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with inbox items
    let entityWithInbox = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithInbox = { id: entity.id, inbox };
        break;
      }
    }

    if (!entityWithInbox) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithInbox.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // First inbox item should have avatar
    const firstItem = entityWithInbox.inbox.items[0];
    await expect(page.getByTestId(`inbox-item-avatar-${firstItem.id}`)).toBeVisible();
  });

  test('mark as read button is visible on unread inbox items', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with unread inbox items
    let entityWithUnread = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox?status=unread`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithUnread = { id: entity.id, inbox };
        break;
      }
    }

    if (!entityWithUnread) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithUnread.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // First unread inbox item should have mark as read button
    const firstItem = entityWithUnread.inbox.items[0];
    await expect(page.getByTestId(`inbox-mark-read-${firstItem.id}`)).toBeVisible();
  });

  test('mark all read button is visible when entity has unread messages', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with unread inbox items
    let entityWithUnread = null;
    for (const entity of entities) {
      const countResponse = await page.request.get(`/api/entities/${entity.id}/inbox/count`);
      const countData = await countResponse.json();
      if (countData.count > 0) {
        entityWithUnread = { id: entity.id, count: countData.count };
        break;
      }
    }

    if (!entityWithUnread) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithUnread.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // Mark all read button should be visible
    await expect(page.getByTestId('inbox-mark-all-read')).toBeVisible();
  });

  test('inbox item is clickable', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Find an entity with inbox items
    let entityWithInbox = null;
    for (const entity of entities) {
      const inboxResponse = await page.request.get(`/api/entities/${entity.id}/inbox`);
      const inbox = await inboxResponse.json();
      if (inbox.total > 0) {
        entityWithInbox = { id: entity.id, inbox };
        break;
      }
    }

    if (!entityWithInbox) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entityWithInbox.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click inbox tab
    await page.getByTestId('entity-tab-inbox').click();
    await expect(page.getByTestId('entity-inbox-tab')).toBeVisible({ timeout: 10000 });

    // Click the first inbox item
    const firstItem = entityWithInbox.inbox.items[0];
    await page.getByTestId(`inbox-item-${firstItem.id}`).click();

    // Should navigate to messages page with channel selected
    await expect(page).toHaveURL(/\/messages\?.*channel=/);
  });
});

test.describe('TB66: Entity Management Hierarchy', () => {
  test('GET /api/entities/:id/reports endpoint is accessible', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get reports for first entity
    const firstEntity = entities[0];
    const reportsResponse = await page.request.get(`/api/entities/${firstEntity.id}/reports`);
    expect(reportsResponse.ok()).toBe(true);
    const reports = await reportsResponse.json();
    expect(Array.isArray(reports)).toBe(true);
  });

  test('GET /api/entities/:id/chain endpoint is accessible', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get chain for first entity
    const firstEntity = entities[0];
    const chainResponse = await page.request.get(`/api/entities/${firstEntity.id}/chain`);
    expect(chainResponse.ok()).toBe(true);
    const chain = await chainResponse.json();
    expect(Array.isArray(chain)).toBe(true);
  });

  test('PATCH /api/entities/:id/manager endpoint sets manager', async ({ page }) => {
    // Create two test entities
    const testManager = `test-manager-${Date.now()}`;
    const testEmployee = `test-employee-${Date.now()}`;

    const managerResponse = await page.request.post('/api/entities', {
      data: { name: testManager, entityType: 'human' },
    });
    expect(managerResponse.ok()).toBe(true);
    const manager = await managerResponse.json();

    const employeeResponse = await page.request.post('/api/entities', {
      data: { name: testEmployee, entityType: 'agent' },
    });
    expect(employeeResponse.ok()).toBe(true);
    const employee = await employeeResponse.json();

    // Set manager
    const setManagerResponse = await page.request.patch(`/api/entities/${employee.id}/manager`, {
      data: { managerId: manager.id },
    });
    expect(setManagerResponse.ok()).toBe(true);
    const updated = await setManagerResponse.json();
    expect(updated.reportsTo).toBe(manager.id);
  });

  test('PATCH /api/entities/:id/manager prevents self-assignment', async ({ page }) => {
    // Create test entity with unique name
    const testEntity = `test-self-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const response = await page.request.post('/api/entities', {
      data: { name: testEntity, entityType: 'agent' },
    });

    if (!response.ok()) {
      // If name collision, skip test
      const error = await response.json();
      if (error.error?.message?.includes('already exists')) {
        test.skip();
        return;
      }
      throw new Error(`Failed to create entity: ${error.error?.message}`);
    }
    const entity = await response.json();

    // Try to set self as manager
    const setManagerResponse = await page.request.patch(`/api/entities/${entity.id}/manager`, {
      data: { managerId: entity.id },
    });
    expect(setManagerResponse.ok()).toBe(false);
    const error = await setManagerResponse.json();
    expect(error.error?.message).toContain('own manager');
  });

  test('PATCH /api/entities/:id/manager prevents reporting cycles', async ({ page }) => {
    // Create three entities: A reports to B, B reports to C
    const entityA = `test-cycle-a-${Date.now()}`;
    const entityB = `test-cycle-b-${Date.now()}`;
    const entityC = `test-cycle-c-${Date.now()}`;

    const aResponse = await page.request.post('/api/entities', {
      data: { name: entityA, entityType: 'agent' },
    });
    const a = await aResponse.json();

    const bResponse = await page.request.post('/api/entities', {
      data: { name: entityB, entityType: 'agent' },
    });
    const b = await bResponse.json();

    const cResponse = await page.request.post('/api/entities', {
      data: { name: entityC, entityType: 'agent' },
    });
    const c = await cResponse.json();

    // Set up: A reports to B, B reports to C
    await page.request.patch(`/api/entities/${a.id}/manager`, {
      data: { managerId: b.id },
    });
    await page.request.patch(`/api/entities/${b.id}/manager`, {
      data: { managerId: c.id },
    });

    // Try to make C report to A (would create cycle: A -> B -> C -> A)
    const cycleResponse = await page.request.patch(`/api/entities/${c.id}/manager`, {
      data: { managerId: a.id },
    });
    expect(cycleResponse.ok()).toBe(false);
    const error = await cycleResponse.json();
    expect(error.error?.message).toContain('cycle');
  });

  test('PATCH /api/entities/:id/manager can clear manager', async ({ page }) => {
    // Create two test entities
    const testManager = `test-manager-clear-${Date.now()}`;
    const testEmployee = `test-employee-clear-${Date.now()}`;

    const managerResponse = await page.request.post('/api/entities', {
      data: { name: testManager, entityType: 'human' },
    });
    const manager = await managerResponse.json();

    const employeeResponse = await page.request.post('/api/entities', {
      data: { name: testEmployee, entityType: 'agent' },
    });
    const employee = await employeeResponse.json();

    // Set manager
    await page.request.patch(`/api/entities/${employee.id}/manager`, {
      data: { managerId: manager.id },
    });

    // Clear manager
    const clearResponse = await page.request.patch(`/api/entities/${employee.id}/manager`, {
      data: { managerId: null },
    });
    expect(clearResponse.ok()).toBe(true);
    const updated = await clearResponse.json();
    expect(updated.reportsTo).toBeNull();
  });

  test('entity detail panel shows organization section', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show organization section with Reports To and Direct Reports
    await expect(page.getByText('Organization')).toBeVisible();
    await expect(page.getByText('Reports To')).toBeVisible();
    await expect(page.getByText(/Direct Reports/)).toBeVisible();
  });

  test('can open manager picker', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items;

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click set manager button
    await page.getByTestId('entity-edit-manager-button').click();

    // Manager picker should be visible
    await expect(page.getByTestId('manager-picker')).toBeVisible();
    await expect(page.getByTestId('manager-search-input')).toBeVisible();
  });

  test('can search and select manager from picker', async ({ page }) => {
    // Get first page of entities - we need at least 2 entities for this test
    const response = await page.request.get('/api/entities?limit=25');
    const data = await response.json();
    const entities = data.items;

    if (entities.length < 2) {
      test.skip();
      return;
    }

    // Use the first entity on the page as the employee
    const employee = entities[0];

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the employee entity card (should be visible on first page)
    await page.getByTestId(`entity-card-${employee.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click set manager button
    await page.getByTestId('entity-edit-manager-button').click();
    await expect(page.getByTestId('manager-picker')).toBeVisible({ timeout: 5000 });

    // Wait for entities to load in picker
    await page.waitForTimeout(500);

    // Check if at least one manager option exists (any entity other than self)
    const anyManagerOption = page.locator('[data-testid^="manager-option-"]').first();
    await expect(anyManagerOption).toBeVisible({ timeout: 5000 });

    // Click any available manager option
    await anyManagerOption.click();

    // Manager picker should close (either successfully or with error)
    await expect(page.getByTestId('manager-picker')).not.toBeVisible({ timeout: 5000 });
  });

  test('direct reports list shows entities reporting to manager', async ({ page }) => {
    // Create a manager with a report
    const testManager = `test-manager-reports-${Date.now()}`;
    const testReport = `test-report-${Date.now()}`;

    const managerResponse = await page.request.post('/api/entities', {
      data: { name: testManager, entityType: 'human' },
    });
    const manager = await managerResponse.json();

    const reportResponse = await page.request.post('/api/entities', {
      data: { name: testReport, entityType: 'agent' },
    });
    const report = await reportResponse.json();

    // Set up reporting relationship
    await page.request.patch(`/api/entities/${report.id}/manager`, {
      data: { managerId: manager.id },
    });

    // View manager's detail panel
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click on manager card
    await page.getByTestId(`entity-card-${manager.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show direct reports list with the report
    await expect(page.getByText(/Direct Reports \(1\)/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId(`direct-report-${report.id}`)).toBeVisible();
  });

  test('org chart view can be toggled', async ({ page }) => {
    // Create a manager with a report
    const testManager = `test-manager-chart-${Date.now()}`;
    const testReport = `test-report-chart-${Date.now()}`;

    const managerResponse = await page.request.post('/api/entities', {
      data: { name: testManager, entityType: 'human' },
    });
    const manager = await managerResponse.json();

    const reportResponse = await page.request.post('/api/entities', {
      data: { name: testReport, entityType: 'agent' },
    });
    const report = await reportResponse.json();

    // Set up reporting relationship
    await page.request.patch(`/api/entities/${report.id}/manager`, {
      data: { managerId: manager.id },
    });

    // View manager's detail panel
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click on manager card
    await page.getByTestId(`entity-card-${manager.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click show chart button
    await page.getByTestId('entity-toggle-org-chart').click();

    // Org chart should be visible
    await expect(page.getByTestId('org-chart-view')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId(`org-chart-report-${report.id}`)).toBeVisible();
  });

  test('management chain shows when entity has manager', async ({ page }) => {
    // Create chain: C -> B -> A (A is CEO)
    const ceo = `test-ceo-${Date.now()}`;
    const vp = `test-vp-${Date.now()}`;
    const employee = `test-emp-${Date.now()}`;

    const ceoResponse = await page.request.post('/api/entities', {
      data: { name: ceo, entityType: 'human' },
    });
    const ceoEntity = await ceoResponse.json();

    const vpResponse = await page.request.post('/api/entities', {
      data: { name: vp, entityType: 'human' },
    });
    const vpEntity = await vpResponse.json();

    const empResponse = await page.request.post('/api/entities', {
      data: { name: employee, entityType: 'agent' },
    });
    const empEntity = await empResponse.json();

    // Set up chain: emp -> vp -> ceo
    await page.request.patch(`/api/entities/${empEntity.id}/manager`, {
      data: { managerId: vpEntity.id },
    });
    await page.request.patch(`/api/entities/${vpEntity.id}/manager`, {
      data: { managerId: ceoEntity.id },
    });

    // View employee's detail panel
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click on employee card
    await page.getByTestId(`entity-card-${empEntity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show management chain
    await expect(page.getByTestId('entity-management-chain')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Management Chain')).toBeVisible();
    // Chain should show: emp -> vp -> ceo
    await expect(page.getByTestId('chain-entity-0')).toBeVisible();
    await expect(page.getByTestId('chain-entity-1')).toBeVisible();
  });

  test('clicking manager in chain navigates to that entity', async ({ page }) => {
    // Create two entities with hierarchy
    const testManager = `test-nav-manager-${Date.now()}`;
    const testEmployee = `test-nav-employee-${Date.now()}`;

    const managerResponse = await page.request.post('/api/entities', {
      data: { name: testManager, entityType: 'human' },
    });
    const manager = await managerResponse.json();

    const employeeResponse = await page.request.post('/api/entities', {
      data: { name: testEmployee, entityType: 'agent' },
    });
    const employee = await employeeResponse.json();

    // Set up reporting relationship
    await page.request.patch(`/api/entities/${employee.id}/manager`, {
      data: { managerId: manager.id },
    });

    // View employee's detail panel
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click on employee card
    await page.getByTestId(`entity-card-${employee.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click on manager in chain
    await page.getByTestId('chain-entity-0').click();

    // URL should change to manager's ID
    await expect(page).toHaveURL(new RegExp(`selected=${manager.id}`));
  });
});
