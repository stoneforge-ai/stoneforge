import { test, expect } from '@playwright/test';

// ============================================================================
// TB140: Render Task Attachments as Markdown Tests
// ============================================================================

test.describe('TB140: Render Task Attachments as Markdown', () => {
  // Helper to create a task for testing
  async function createTestTask(page: import('@playwright/test').Page) {
    const response = await page.request.post('/api/tasks', {
      data: {
        title: `Markdown Attachment Test Task ${Date.now()}`,
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

  // Helper to create a markdown document with various formatting
  async function createMarkdownDocument(
    page: import('@playwright/test').Page,
    content: string,
    title?: string
  ) {
    const response = await page.request.post('/api/documents', {
      data: {
        title: title || `Markdown Doc ${Date.now()}`,
        content,
        contentType: 'markdown',
        createdBy: 'test-user',
      },
    });
    expect(response.ok()).toBe(true);
    const doc = await response.json();
    expect(doc.id).toBeDefined();
    return doc;
  }

  test('markdown attachment renders headings properly', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createMarkdownDocument(
      page,
      '# Heading 1\n## Heading 2\n### Heading 3'
    );

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the attachment
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // Check that headings are rendered as actual HTML heading elements
    await expect(content.locator('h1')).toContainText('Heading 1');
    await expect(content.locator('h2')).toContainText('Heading 2');
    await expect(content.locator('h3')).toContainText('Heading 3');
  });

  test('markdown attachment renders lists properly', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createMarkdownDocument(
      page,
      '- Item 1\n- Item 2\n- Item 3\n\n1. First\n2. Second\n3. Third'
    );

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the attachment
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // Check that unordered list items are rendered
    await expect(content.locator('ul li')).toHaveCount(3);
    await expect(content.locator('ul li').first()).toContainText('Item 1');

    // Check that ordered list items are rendered
    await expect(content.locator('ol li')).toHaveCount(3);
    await expect(content.locator('ol li').first()).toContainText('First');
  });

  test('markdown attachment renders bold and italic text', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createMarkdownDocument(
      page,
      'This is **bold text** and this is _italic text_ and this is ***bold italic***.'
    );

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the attachment
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // Check that bold and italic elements are rendered
    await expect(content.locator('strong').first()).toContainText('bold text');
    await expect(content.locator('em').first()).toContainText('italic text');
  });

  test('markdown attachment renders code blocks', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createMarkdownDocument(
      page,
      'Here is some code:\n\n```javascript\nconst x = 42;\nconsole.log(x);\n```\n\nAnd inline `code` too.'
    );

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the attachment
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // Check that code block is rendered
    await expect(content.locator('pre code')).toContainText('const x = 42');
    // Check that inline code is rendered
    await expect(content.locator('p code')).toContainText('code');
  });

  test('markdown attachment renders blockquotes', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createMarkdownDocument(
      page,
      '> This is a blockquote\n> with multiple lines'
    );

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the attachment
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // Check that blockquote is rendered
    await expect(content.locator('blockquote')).toContainText('This is a blockquote');
  });

  test('markdown attachment renders links', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createMarkdownDocument(
      page,
      'Check out [this link](https://example.com) for more info.'
    );

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the attachment
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // Check that link is rendered with correct href
    const link = content.locator('a[href="https://example.com"]');
    await expect(link).toContainText('this link');
  });

  test('markdown attachment uses prose styling for proper typography', async ({ page }) => {
    const task = await createTestTask(page);
    const doc = await createMarkdownDocument(page, '# Title\n\nSome paragraph text here.');

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the attachment
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // Check that markdown content uses the MarkdownRenderer (has prose class)
    const markdownContent = page.getByTestId('attachment-markdown-content');
    await expect(markdownContent).toBeVisible();
    // Check that it has the prose class for proper typography
    await expect(markdownContent).toHaveClass(/prose/);
  });

  test('plain text attachment still renders as plain text', async ({ page }) => {
    const task = await createTestTask(page);

    // Create a plain text document
    const response = await page.request.post('/api/documents', {
      data: {
        title: `Plain Text Doc ${Date.now()}`,
        content: 'This is plain text.\nNo formatting here.',
        contentType: 'text',
        createdBy: 'test-user',
      },
    });
    const doc = await response.json();

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the attachment
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // Plain text should render as preformatted text
    await expect(content.locator('pre')).toContainText('This is plain text');
    // Should NOT have the markdown content test id
    await expect(page.getByTestId('attachment-markdown-content')).not.toBeVisible();
  });

  test('json attachment still renders as formatted JSON', async ({ page }) => {
    const task = await createTestTask(page);

    // Create a JSON document
    const response = await page.request.post('/api/documents', {
      data: {
        title: `JSON Doc ${Date.now()}`,
        content: JSON.stringify({ key: 'value', nested: { a: 1 } }),
        contentType: 'json',
        createdBy: 'test-user',
      },
    });
    const doc = await response.json();

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the attachment
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // JSON should be formatted in a pre/code block
    await expect(content.locator('pre')).toContainText('key');
    await expect(content.locator('pre')).toContainText('value');
    // Should NOT have the markdown content test id
    await expect(page.getByTestId('attachment-markdown-content')).not.toBeVisible();
  });

  test('markdown attachment with @mentions renders mention links', async ({ page }) => {
    // First create an entity so we have something to mention
    const entityResponse = await page.request.post('/api/entities', {
      data: {
        name: `TestUser${Date.now()}`,
        entityType: 'human',
        createdBy: 'system',
      },
    });
    const entity = await entityResponse.json();

    const task = await createTestTask(page);
    const doc = await createMarkdownDocument(
      page,
      `This document mentions @${entity.name} in the text.`
    );

    // Attach document via API
    await page.request.post(`/api/tasks/${task.id}/attachments`, {
      data: { documentId: doc.id },
    });

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`task-row-${task.id}`).click();
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 5000 });

    // Expand the attachment
    await page.getByTestId(`attachment-expand-${doc.id}`).click();
    const content = page.getByTestId(`attachment-content-${doc.id}`);
    await expect(content).toBeVisible({ timeout: 5000 });

    // Check that the @mention is rendered as a link
    const mentionLink = content.locator('.mention-chip');
    await expect(mentionLink).toContainText(`@${entity.name}`);
    await expect(mentionLink).toHaveAttribute('href', `/entities?search=${entity.name}`);
  });
});
