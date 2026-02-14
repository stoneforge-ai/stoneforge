import { test, expect } from '@playwright/test';

// ============================================================================
// TB50: Attach Documents to Tasks Tests
// ============================================================================

test.describe('TB50: Attach Documents to Tasks', () => {
  // Helper to create a task for testing
  async function createTestTask(page: import('@playwright/test').Page) {
    const response = await page.request.post('/api/tasks', {
      data: {
        title: `Attachment Test Task ${Date.now()}`,
        createdBy: 'test-user',
        status: 'open',
        priority: 3,
        complexity: 2,
        taskType: 'feature',
      },
    });
    expect(response.ok()).toBe(true);
    const task = await response.json();
    expect(task.id).toBeDefined();
    return task;
  }

  // Helper to create a document for testing
  async function createTestDocument(page: import('@playwright/test').Page) {
    const response = await page.request.post('/api/documents', {
      data: {
        title: `Test Document ${Date.now()}`,
        content: 'Test document content',
        contentType: 'text',
        createdBy: 'test-user',
      },
    });
    expect(response.ok()).toBe(true);
    const doc = await response.json();
    expect(doc.id).toBeDefined();
    return doc;
  }

  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('GET /api/tasks/:id/attachments returns empty array for task with no attachments', async ({ page }) => {
    const task = await createTestTask(page);

    const response = await page.request.get(`/api/tasks/${task.id}/attachments`);
    expect(response.ok()).toBe(true);
    const attachments = await response.json();
    expect(attachments).toEqual([]);
  });

  test('POST /api/tasks/:id/attachments attaches a document', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocument(page);

    const response = await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });
    expect(response.status()).toBe(201);
    const attached = await response.json();
    expect(attached.id).toBe(doc.id);
    expect(attached.type).toBe('document');
  });

  test('POST /api/tasks/:id/attachments validates documentId is required', async ({ page }) => {
    const task = await createTestTask(page);

    const response = await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: {},
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/tasks/:id/attachments returns 404 for non-existent task', async ({ page }) => {
    const doc = await createTestDocument(page);

    const response = await page.request.post('/api/tasks/el-invalid999/attachments', {
      data: { documentId: doc.id },
    });
    expect(response.status()).toBe(404);
  });

  test('POST /api/tasks/:id/attachments returns 404 for non-existent document', async ({ page }) => {
    const task = await createTestTask(page);

    const response = await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: 'el-invalid999' },
    });
    expect(response.status()).toBe(404);
  });

  test('POST /api/tasks/:id/attachments returns 400 for duplicate attachment', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocument(page);

    // First attachment succeeds
    const response1 = await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });
    expect(response1.status()).toBe(201);

    // Second attachment of same document fails
    const response2 = await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });
    expect(response2.status()).toBe(400);
    const body = await response2.json();
    expect(body.error.message).toContain('already attached');
  });

  test('GET /api/tasks/:id/attachments returns attached documents', async ({ page }) => {
    const task = await createTestTask(page);
    const doc1 = await createTestDocument(page);
    const doc2 = await createTestDocument(page);

    // Attach both documents
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc1.id },
    });
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc2.id },
    });

    // Get attachments
    const response = await page.request.get(`/api/tasks/${task.id}/attachments`);
    expect(response.ok()).toBe(true);
    const attachments = await response.json();
    expect(attachments.length).toBe(2);
    expect(attachments.map((a: { id: string }) => a.id)).toContain(doc1.id);
    expect(attachments.map((a: { id: string }) => a.id)).toContain(doc2.id);
  });

  test('DELETE /api/tasks/:id/attachments/:docId removes an attachment', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocument(page);

    // Attach document
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    // Remove attachment
    const response = await page.request.delete(`/api/tasks/${task.id}/attachments/${doc.id}`);
    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.taskId).toBe(task.id);
    expect(result.documentId).toBe(doc.id);

    // Verify attachment is removed
    const getResponse = await page.request.get(`/api/tasks/${task.id}/attachments`);
    const attachments = await getResponse.json();
    expect(attachments).toEqual([]);
  });

  test('DELETE /api/tasks/:id/attachments/:docId returns 404 for non-attached document', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocument(page);

    const response = await page.request.delete(`/api/tasks/${task.id}/attachments/${doc.id}`);
    expect(response.status()).toBe(404);
  });

  test('DELETE /api/tasks/:id/attachments/:docId returns 404 for non-existent task', async ({ page }) => {
    const doc = await createTestDocument(page);

    const response = await page.request.delete(`/api/tasks/el-invalid999/attachments/${doc.id}`);
    expect(response.status()).toBe(404);
  });

  // ============================================================================
  // UI Tests - Attachments Section
  // ============================================================================

  test('task detail panel shows attachments section', async ({ page }) => {
    const task = await createTestTask(page);

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Click on the task
    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Attachments section should be visible
    await expect(page.getByTestId('attachments-section')).toBeVisible();
    await expect(page.getByTestId('attachments-toggle')).toBeVisible();
  });

  test('attachments section shows empty state when no attachments', async ({ page }) => {
    const task = await createTestTask(page);

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Should show "No documents attached"
    await expect(page.getByTestId('attachments-empty')).toBeVisible();
  });

  test('attachments section can be collapsed and expanded', async ({ page }) => {
    const task = await createTestTask(page);

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Initially expanded
    await expect(page.getByTestId('attachments-empty')).toBeVisible();

    // Collapse
    await page.getByTestId('attachments-toggle').click();
    await expect(page.getByTestId('attachments-empty')).not.toBeVisible();

    // Expand
    await page.getByTestId('attachments-toggle').click();
    await expect(page.getByTestId('attachments-empty')).toBeVisible();
  });

  test('clicking Attach Document button opens document picker modal', async ({ page }) => {
    const task = await createTestTask(page);

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click Attach Document button
    await page.getByTestId('attach-document-btn').click();

    // Modal should open
    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('document-picker-search')).toBeVisible();
  });

  test('document picker modal shows available documents', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocument(page);

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('attach-document-btn').click();
    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 5000 });

    // Document should be in the list
    await expect(page.getByTestId(`document-picker-item-${doc.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('selecting a document in picker attaches it', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocument(page);

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('attach-document-btn').click();
    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 5000 });

    // Click on the document
    await page.getByTestId(`document-picker-item-${doc.id}`).click();

    // Modal should close and attachment should appear
    await expect(page.getByTestId('document-picker-modal')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId(`attachment-item-${doc.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('attached document shows in attachments list', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocument(page);

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Attachment should be visible
    await expect(page.getByTestId(`attachment-item-${doc.id}`)).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId(`attachment-link-${doc.id}`)).toBeVisible();
  });

  test('clicking remove button removes attachment', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocument(page);

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Attachment should be visible
    await expect(page.getByTestId(`attachment-item-${doc.id}`)).toBeVisible({ timeout: 5000 });

    // Hover to reveal remove button and click it
    await page.getByTestId(`attachment-item-${doc.id}`).hover();
    await page.getByTestId(`attachment-remove-${doc.id}`).click();

    // Attachment should be removed
    await expect(page.getByTestId(`attachment-item-${doc.id}`)).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('attachments-empty')).toBeVisible();
  });

  test('document picker excludes already attached documents', async ({ page }) => {
    const task = await createTestTask(page);
    const doc1 = await createTestDocument(page);
    const doc2 = await createTestDocument(page);

    // Attach doc1 via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc1.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('attach-document-btn').click();
    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 5000 });

    // doc1 should NOT be in the list (already attached)
    await expect(page.getByTestId(`document-picker-item-${doc1.id}`)).not.toBeVisible({ timeout: 3000 });

    // doc2 SHOULD be in the list
    await expect(page.getByTestId(`document-picker-item-${doc2.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('document picker search filters documents', async ({ page }) => {
    const task = await createTestTask(page);

    // Create documents with specific titles
    const uniqueTitle = `UniqueSearchable${Date.now()}`;
    const doc1Response = await page.request.post('/api/documents', {
      data: {
        title: uniqueTitle,
        content: 'Content 1',
        contentType: 'text',
        createdBy: 'test-user',
      },
    });
    const doc1 = await doc1Response.json();

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('attach-document-btn').click();
    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 5000 });

    // Type in search
    await page.getByTestId('document-picker-search').fill(uniqueTitle);

    // Wait for search to filter
    await expect(page.getByTestId(`document-picker-item-${doc1.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('document picker can be closed', async ({ page }) => {
    const task = await createTestTask(page);

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('attach-document-btn').click();
    await expect(page.getByTestId('document-picker-modal')).toBeVisible({ timeout: 5000 });

    // Close via X button
    await page.getByTestId('document-picker-close').click();
    await expect(page.getByTestId('document-picker-modal')).not.toBeVisible({ timeout: 5000 });
  });
});

// ============================================================================
// TB51: Embedded Document Rendering in Tasks Tests
// ============================================================================

test.describe('TB51: Embedded Document Rendering in Tasks', () => {
  // Helper to create a task for testing
  async function createTestTask(page: import('@playwright/test').Page) {
    const response = await page.request.post('/api/tasks', {
      data: {
        title: `Embed Test Task ${Date.now()}`,
        createdBy: 'test-user',
        status: 'open',
        priority: 3,
        complexity: 2,
        taskType: 'feature',
      },
    });
    expect(response.ok()).toBe(true);
    const task = await response.json();
    expect(task.id).toBeDefined();
    return task;
  }

  // Helper to create a document with content for testing
  async function createTestDocumentWithContent(
    page: import('@playwright/test').Page,
    options: { content?: string; contentType?: string } = {}
  ) {
    const response = await page.request.post('/api/documents', {
      data: {
        title: `Test Document ${Date.now()}`,
        content: options.content || 'This is the first line.\nThis is the second line.',
        contentType: options.contentType || 'text',
        createdBy: 'test-user',
      },
    });
    expect(response.ok()).toBe(true);
    const doc = await response.json();
    expect(doc.id).toBeDefined();
    return doc;
  }

  test('attached document shows expand/collapse button', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocumentWithContent(page);

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Attachment should have expand button
    await expect(page.getByTestId(`attachment-expand-${doc.id}`)).toBeVisible({ timeout: 5000 });
  });

  test('collapsed attachment shows content preview', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocumentWithContent(page, { content: 'Preview line for testing\nMore content here' });

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Preview should be visible (first line of content)
    const preview = page.getByTestId(`attachment-preview-${doc.id}`);
    await expect(preview).toBeVisible({ timeout: 5000 });
    await expect(preview).toContainText('Preview line');
  });

  test('clicking expand button shows full document content', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocumentWithContent(page, { content: 'Full content line 1\nFull content line 2\nFull content line 3' });

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Content should not be visible initially
    await expect(page.getByTestId(`attachment-content-${doc.id}`)).not.toBeVisible();

    // Click expand
    await page.getByTestId(`attachment-expand-${doc.id}`).click();

    // Full content should now be visible
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });
    await expect(content).toContainText('Full content line 1');
    await expect(content).toContainText('Full content line 2');
    await expect(content).toContainText('Full content line 3');
  });

  test('clicking collapse button hides document content', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocumentWithContent(page);

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    await expect(page.getByTestId(`attachment-content-${doc.id}`)).toBeVisible({ timeout: 5000 });

    // Collapse
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    await expect(page.getByTestId(`attachment-content-${doc.id}`)).not.toBeVisible();

    // Preview should reappear
    await expect(page.getByTestId(`attachment-preview-${doc.id}`)).toBeVisible();
  });

  test('attached document title is clickable link to document', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocumentWithContent(page);

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Link should have correct href
    const link = page.getByTestId(`attachment-link-${doc.id}`);
    await expect(link).toBeVisible({ timeout: 5000 });
    await expect(link).toHaveAttribute('href', `/documents?doc=${doc.id}`);
  });

  test('attached document shows content type badge', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createTestDocumentWithContent(page, { contentType: 'markdown' });

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Content type badge should be visible
    const attachment = page.getByTestId(`attachment-item-${doc.id}`);
    await expect(attachment).toContainText('markdown');
  });

  test('json document content is formatted when expanded', async ({ page }) => {
    const task = await createTestTask(page);
    const jsonContent = JSON.stringify({ key: 'value', number: 42 });
    const doc = await createTestDocumentWithContent(page, { content: jsonContent, contentType: 'json' });

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand to see content
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // Should contain the JSON keys
    await expect(content).toContainText('key');
    await expect(content).toContainText('value');
  });

  test('document without content shows appropriate message when expanded', async ({ page }) => {
    const task = await createTestTask(page);

    // Create document without content (empty string)
    const response = await page.request.post('/api/documents', {
      data: {
        title: `Empty Document ${Date.now()}`,
        content: '',
        contentType: 'text',
        createdBy: 'test-user',
      },
    });
    expect(response.ok()).toBe(true);
    const doc = await response.json();

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });
    await expect(content).toContainText('No content available');
  });

  test('multiple documents can be expanded independently', async ({ page }) => {
    const task = await createTestTask(page);
    const doc1 = await createTestDocumentWithContent(page, { content: 'Document 1 content' });
    const doc2 = await createTestDocumentWithContent(page, { content: 'Document 2 content' });

    // Attach both documents via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc1.id },
    });
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc2.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand first document
    await page.getByTestId(`attachment-expand-${doc1.id}`).click();
    await expect(page.getByTestId(`attachment-content-${doc1.id}`)).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId(`attachment-content-${doc2.id}`)).not.toBeVisible();

    // Expand second document (first stays expanded)
    await page.getByTestId(`attachment-expand-${doc2.id}`).click();
    await expect(page.getByTestId(`attachment-content-${doc1.id}`)).toBeVisible();
    await expect(page.getByTestId(`attachment-content-${doc2.id}`)).toBeVisible({ timeout: 5000 });
  });
});
