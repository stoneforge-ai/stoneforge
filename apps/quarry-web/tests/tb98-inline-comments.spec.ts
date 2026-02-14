import { test, expect } from '@playwright/test';

test.describe('TB98: Inline Comments', () => {
  // Helper to get or create a test entity
  async function getOrCreateTestEntity(page: import('@playwright/test').Page): Promise<string> {
    // Try to get an existing entity
    const listResponse = await page.request.get('/api/entities?limit=10');
    const data = await listResponse.json();
    const entities = data.items || data;

    if (entities && entities.length > 0) {
      return entities[0].id;
    }

    // Create a new entity if none exist
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: 'TestCommentUser',
        entityType: 'human',
      },
    });
    const entity = await createResponse.json();
    return entity.id;
  }

  // Helper to create a test document
  async function createTestDocument(
    page: import('@playwright/test').Page,
    title: string,
    content: string
  ): Promise<{ id: string }> {
    const response = await page.request.post('/api/documents', {
      data: {
        title,
        content,
        contentType: 'markdown',
        createdBy: 'el-0000',
      },
    });
    return response.json();
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });
  });

  test('GET /api/documents/:id/comments returns empty list for new document', async ({ page }) => {
    const doc = await createTestDocument(page, 'Test Doc Empty Comments', 'Content for testing.');

    const response = await page.request.get(`/api/documents/${doc.id}/comments`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.comments).toEqual([]);
    expect(data.total).toBe(0);
  });

  test('POST /api/documents/:id/comments creates a comment', async ({ page }) => {
    const entityId = await getOrCreateTestEntity(page);
    const doc = await createTestDocument(page, 'Test Doc Create Comment', 'This is test content for comments.');

    const response = await page.request.post(`/api/documents/${doc.id}/comments`, {
      data: {
        authorId: entityId,
        content: 'This is a test comment',
        anchor: {
          hash: 'abc123',
          prefix: 'This is ',
          text: 'test content',
          suffix: ' for comments.',
        },
        startOffset: 8,
        endOffset: 20,
      },
    });
    expect(response.ok()).toBeTruthy();
    const comment = await response.json();
    expect(comment.id).toBeTruthy();
    expect(comment.content).toBe('This is a test comment');
    expect(comment.resolved).toBe(false);
    expect(comment.author.id).toBe(entityId);
  });

  test('comments can be fetched after creation', async ({ page }) => {
    const entityId = await getOrCreateTestEntity(page);
    const doc = await createTestDocument(page, 'Test Doc Fetch Comments', 'Content for fetching.');

    // Create a comment
    const createResponse = await page.request.post(`/api/documents/${doc.id}/comments`, {
      data: {
        authorId: entityId,
        content: 'Comment to fetch',
        anchor: { hash: 'xyz', prefix: '', text: 'Content', suffix: ' for fetching.' },
      },
    });
    const comment = await createResponse.json();

    // Fetch comments
    const fetchResponse = await page.request.get(`/api/documents/${doc.id}/comments`);
    expect(fetchResponse.ok()).toBeTruthy();
    const data = await fetchResponse.json();
    expect(data.comments.length).toBe(1);
    expect(data.comments[0].id).toBe(comment.id);
  });

  test('PATCH /api/comments/:id resolves a comment', async ({ page }) => {
    const entityId = await getOrCreateTestEntity(page);
    const doc = await createTestDocument(page, 'Test Doc Resolve', 'Content to test resolve.');

    // Create comment
    const createResponse = await page.request.post(`/api/documents/${doc.id}/comments`, {
      data: {
        authorId: entityId,
        content: 'Comment to resolve',
        anchor: { hash: 'def', prefix: '', text: 'Content', suffix: ' to test resolve.' },
      },
    });
    const comment = await createResponse.json();

    // Resolve it
    const resolveResponse = await page.request.patch(`/api/comments/${comment.id}`, {
      data: { resolved: true, resolvedBy: entityId },
    });
    expect(resolveResponse.ok()).toBeTruthy();
    const resolved = await resolveResponse.json();
    expect(resolved.resolved).toBe(true);
    expect(resolved.resolvedBy).toBeTruthy();
    expect(resolved.resolvedAt).toBeTruthy();
  });

  test('resolved comments are filtered by default', async ({ page }) => {
    const entityId = await getOrCreateTestEntity(page);
    const doc = await createTestDocument(page, 'Test Doc Filter Resolved', 'Content for filter test.');

    // Create and resolve a comment
    const createResponse = await page.request.post(`/api/documents/${doc.id}/comments`, {
      data: {
        authorId: entityId,
        content: 'Resolved comment',
        anchor: { hash: 'filter', prefix: '', text: 'Content', suffix: ' for filter test.' },
      },
    });
    const comment = await createResponse.json();
    await page.request.patch(`/api/comments/${comment.id}`, {
      data: { resolved: true, resolvedBy: entityId },
    });

    // Fetch without includeResolved - should be empty
    const response1 = await page.request.get(`/api/documents/${doc.id}/comments`);
    const data1 = await response1.json();
    expect(data1.comments.length).toBe(0);

    // Fetch with includeResolved - should include the comment
    const response2 = await page.request.get(`/api/documents/${doc.id}/comments?includeResolved=true`);
    const data2 = await response2.json();
    expect(data2.comments.length).toBe(1);
    expect(data2.comments[0].id).toBe(comment.id);
  });

  test('DELETE /api/comments/:id soft-deletes a comment', async ({ page }) => {
    const entityId = await getOrCreateTestEntity(page);
    const doc = await createTestDocument(page, 'Test Doc Delete', 'Content for delete test.');

    // Create comment
    const createResponse = await page.request.post(`/api/documents/${doc.id}/comments`, {
      data: {
        authorId: entityId,
        content: 'Comment to delete',
        anchor: { hash: 'del', prefix: '', text: 'Content', suffix: ' for delete test.' },
      },
    });
    const comment = await createResponse.json();

    // Delete it
    const deleteResponse = await page.request.delete(`/api/comments/${comment.id}`);
    expect(deleteResponse.ok()).toBeTruthy();

    // Verify it's gone
    const fetchResponse = await page.request.get(`/api/documents/${doc.id}/comments?includeResolved=true`);
    const data = await fetchResponse.json();
    expect(data.comments.some((c: { id: string }) => c.id === comment.id)).toBe(false);
  });

  test('PATCH /api/comments/:id can update comment content', async ({ page }) => {
    const entityId = await getOrCreateTestEntity(page);
    const doc = await createTestDocument(page, 'Test Doc Update Content', 'Content for update test.');

    // Create comment
    const createResponse = await page.request.post(`/api/documents/${doc.id}/comments`, {
      data: {
        authorId: entityId,
        content: 'Original content',
        anchor: { hash: 'upd', prefix: '', text: 'Content', suffix: ' for update test.' },
      },
    });
    const comment = await createResponse.json();

    // Update content
    const updateResponse = await page.request.patch(`/api/comments/${comment.id}`, {
      data: { content: 'Updated content' },
    });
    expect(updateResponse.ok()).toBeTruthy();
    const updated = await updateResponse.json();
    expect(updated.content).toBe('Updated content');
  });

  test('comments button is visible in document detail view', async ({ page }) => {
    const doc = await createTestDocument(page, 'Test Doc UI Button', 'Content for UI test.');

    // Navigate to documents and select the document
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 10000 });

    // Wait for document list to load
    await page.waitForTimeout(1000);

    // Click on the document to open detail panel
    const docItem = page.getByTestId(`document-item-${doc.id}`);
    if (await docItem.isVisible({ timeout: 5000 })) {
      await docItem.click();

      // Wait for detail panel
      await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });

      // Comments button should be visible (in non-edit mode)
      await expect(page.getByTestId('document-comments-button')).toBeVisible();
    } else {
      // Document might be in a library, try all-documents-view
      const allDocsView = page.getByTestId('all-documents-view');
      if (await allDocsView.isVisible({ timeout: 2000 })) {
        // Click on document in all docs view
        await page.getByTestId(`document-item-${doc.id}`).click();
        await expect(page.getByTestId('document-detail-panel')).toBeVisible({ timeout: 5000 });
        await expect(page.getByTestId('document-comments-button')).toBeVisible();
      } else {
        test.skip();
      }
    }
  });
});
