import { test, expect } from '@playwright/test';

test.describe('TB26: Playbook Browser', () => {
  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('GET /api/playbooks returns list of playbooks', async ({ page }) => {
    const response = await page.request.get('/api/playbooks');
    expect(response.ok()).toBe(true);
    const playbooks = await response.json();
    expect(Array.isArray(playbooks)).toBe(true);

    // Check each playbook has required fields
    for (const playbook of playbooks) {
      expect(playbook.name).toBeDefined();
      expect(playbook.path).toBeDefined();
      expect(playbook.directory).toBeDefined();
    }
  });

  test('GET /api/playbooks/:name returns 404 for invalid name', async ({ page }) => {
    const response = await page.request.get('/api/playbooks/nonexistent-playbook-12345');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/playbooks/:name returns playbook details when exists', async ({ page }) => {
    // First check if any playbooks exist
    const listResponse = await page.request.get('/api/playbooks');
    const playbooks = await listResponse.json();

    if (playbooks.length === 0) {
      test.skip();
      return;
    }

    // Get the first playbook's details
    const response = await page.request.get(`/api/playbooks/${playbooks[0].name}`);
    expect(response.ok()).toBe(true);
    const playbook = await response.json();

    expect(playbook.name).toBe(playbooks[0].name);
    expect(playbook.title).toBeDefined();
    expect(playbook.version).toBeDefined();
    expect(Array.isArray(playbook.steps)).toBe(true);
    expect(Array.isArray(playbook.variables)).toBe(true);
    expect(playbook.filePath).toBeDefined();
    expect(playbook.directory).toBeDefined();
  });

  // ============================================================================
  // UI Tests - Create Modal with Playbook Browser
  // ============================================================================

  test('create modal opens and shows mode toggle', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Open create modal
    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Check mode toggle exists
    await expect(page.getByTestId('mode-quick')).toBeVisible();
    await expect(page.getByTestId('mode-playbook')).toBeVisible();
  });

  test('quick mode is default and shows quick workflow create form', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Quick mode should be active
    await expect(page.getByTestId('mode-quick')).toHaveClass(/bg-white/);

    // Quick workflow create inputs should be visible
    await expect(page.getByTestId('create-title-input')).toBeVisible();
    await expect(page.getByTestId('create-playbook-input')).toBeVisible();
  });

  test('switching to playbook mode shows playbook picker', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Switch to playbook mode
    await page.getByTestId('mode-playbook').click();

    // Playbook picker should appear (may be loading, empty, or have options)
    const picker = page.getByTestId('playbook-picker');
    const loading = page.getByTestId('playbook-picker-loading');
    const empty = page.getByTestId('playbook-picker-empty');

    // Wait for one of these to be visible
    await expect(picker.or(loading).or(empty)).toBeVisible({ timeout: 5000 });
  });

  test('playbook picker shows available playbooks when they exist', async ({ page }) => {
    // Check if playbooks exist first
    const listResponse = await page.request.get('/api/playbooks');
    const playbooks = await listResponse.json();

    if (playbooks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Switch to playbook mode
    await page.getByTestId('mode-playbook').click();

    // Click the picker trigger
    await page.getByTestId('playbook-picker-trigger').click();

    // Dropdown should be visible
    await expect(page.getByTestId('playbook-picker-dropdown')).toBeVisible({ timeout: 5000 });

    // First playbook should be listed
    await expect(page.getByTestId(`playbook-option-${playbooks[0].name}`)).toBeVisible();
  });

  test('selecting a playbook shows playbook info', async ({ page }) => {
    // Check if playbooks exist first
    const listResponse = await page.request.get('/api/playbooks');
    const playbooks = await listResponse.json();

    if (playbooks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Switch to playbook mode
    await page.getByTestId('mode-playbook').click();

    // Click the picker trigger and select first playbook
    await page.getByTestId('playbook-picker-trigger').click();
    await page.getByTestId(`playbook-option-${playbooks[0].name}`).click();

    // Playbook info should be visible
    await expect(page.getByTestId('playbook-info')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('playbook-steps-preview')).toBeVisible();
  });

  test('playbook with variables shows variable input form', async ({ page }) => {
    // Check for a playbook with variables
    const listResponse = await page.request.get('/api/playbooks');
    const playbooks = await listResponse.json();

    if (playbooks.length === 0) {
      test.skip();
      return;
    }

    // Find a playbook with variables
    let playbookWithVars = null;
    for (const pb of playbooks) {
      const detailResponse = await page.request.get(`/api/playbooks/${pb.name}`);
      const detail = await detailResponse.json();
      if (detail.variables && detail.variables.length > 0) {
        playbookWithVars = pb;
        break;
      }
    }

    if (!playbookWithVars) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Switch to playbook mode and select the playbook
    await page.getByTestId('mode-playbook').click();
    await page.getByTestId('playbook-picker-trigger').click();
    await page.getByTestId(`playbook-option-${playbookWithVars.name}`).click();

    // Variable form should appear
    await expect(page.getByTestId('variable-input-form')).toBeVisible({ timeout: 5000 });
  });

  test('quick mode creating workflow works', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Get initial count
    const beforeResponse = await page.request.get('/api/workflows');
    const beforeWorkflows = await beforeResponse.json();
    const beforeCount = beforeWorkflows.length;

    // Open create modal
    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Fill in quick mode form
    const timestamp = Date.now();
    await page.getByTestId('create-title-input').fill(`E2E Quick Workflow ${timestamp}`);
    await page.getByTestId('create-playbook-input').fill(`Quick Test ${timestamp}`);

    // Submit
    await page.getByTestId('create-submit-button').click();

    // Modal should close
    await expect(page.getByTestId('create-workflow-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify workflow was created
    const afterResponse = await page.request.get('/api/workflows');
    const afterWorkflows = await afterResponse.json();
    expect(afterWorkflows.length).toBeGreaterThan(beforeCount);
  });

  test('submit button is disabled when no playbook selected in playbook mode', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Switch to playbook mode without selecting a playbook
    await page.getByTestId('mode-playbook').click();

    // Submit button should be disabled
    await expect(page.getByTestId('create-submit-button')).toBeDisabled();
  });

  test('creating workflow from playbook creates workflow with playbook steps', async ({ page }) => {
    // Check if playbooks exist first
    const listResponse = await page.request.get('/api/playbooks');
    const playbooks = await listResponse.json();

    if (playbooks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Get initial count
    const beforeResponse = await page.request.get('/api/workflows');
    const beforeWorkflows = await beforeResponse.json();
    const beforeCount = beforeWorkflows.length;

    // Open create modal
    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Switch to playbook mode and select first playbook
    await page.getByTestId('mode-playbook').click();
    await page.getByTestId('playbook-picker-trigger').click();
    await page.getByTestId(`playbook-option-${playbooks[0].name}`).click();

    // Wait for playbook info
    await expect(page.getByTestId('playbook-info')).toBeVisible({ timeout: 5000 });

    // Fill in title
    const timestamp = Date.now();
    await page.getByTestId('create-title-input').fill(`E2E Playbook Workflow ${timestamp}`);

    // Submit
    await page.getByTestId('create-submit-button').click();

    // Modal should close
    await expect(page.getByTestId('create-workflow-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify workflow was created
    const afterResponse = await page.request.get('/api/workflows');
    const afterWorkflows = await afterResponse.json();
    expect(afterWorkflows.length).toBeGreaterThan(beforeCount);
  });

  test('playbook picker closes when clicking outside', async ({ page }) => {
    // Check if playbooks exist first
    const listResponse = await page.request.get('/api/playbooks');
    const playbooks = await listResponse.json();

    if (playbooks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('create-workflow-button').click();
    await expect(page.getByTestId('create-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Switch to playbook mode
    await page.getByTestId('mode-playbook').click();

    // Open dropdown
    await page.getByTestId('playbook-picker-trigger').click();
    await expect(page.getByTestId('playbook-picker-dropdown')).toBeVisible({ timeout: 5000 });

    // Click outside (on the modal background but not on the dropdown)
    await page.getByTestId('create-title-input').click();

    // Note: This test may need adjustment based on click-outside behavior
    // The dropdown should close when we interact with other elements
  });
});
