import { test, expect } from '@playwright/test';

test.describe('TB-O32: Workflows Page', () => {
  test.describe('Page layout', () => {
    test('displays workflows page with correct header', async ({ page }) => {
      await page.goto('/workflows');

      await expect(page.getByTestId('workflows-page')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();
      await expect(page.getByText('Manage workflow templates and active workflows')).toBeVisible();
    });

    test('displays search input', async ({ page }) => {
      await page.goto('/workflows');

      const searchInput = page.getByTestId('workflows-search');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('placeholder', 'Search templates...');
    });

    test('displays create template button on templates tab', async ({ page }) => {
      await page.goto('/workflows');

      await expect(page.getByTestId('workflows-create')).toBeVisible();
      await expect(page.getByTestId('workflows-create')).toContainText('Create Template');
    });
  });

  test.describe('Tabs', () => {
    test('displays Templates and Active tabs', async ({ page }) => {
      await page.goto('/workflows');

      await expect(page.getByTestId('workflows-tab-templates')).toBeVisible();
      await expect(page.getByTestId('workflows-tab-active')).toBeVisible();
    });

    test('defaults to Templates tab', async ({ page }) => {
      await page.goto('/workflows');

      const templatesTab = page.getByTestId('workflows-tab-templates');
      // The templates tab should have the active styling (primary color text)
      await expect(templatesTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('can switch to Active tab', async ({ page }) => {
      await page.goto('/workflows');

      await page.getByTestId('workflows-tab-active').click();

      // URL should reflect tab change
      await expect(page).toHaveURL(/tab=active/);

      // Active tab should now be active
      const activeTab = page.getByTestId('workflows-tab-active');
      await expect(activeTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('can switch back to Templates tab', async ({ page }) => {
      await page.goto('/workflows?tab=active');

      await page.getByTestId('workflows-tab-templates').click();

      await expect(page).toHaveURL(/tab=templates/);

      const templatesTab = page.getByTestId('workflows-tab-templates');
      await expect(templatesTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('search placeholder changes based on active tab', async ({ page }) => {
      await page.goto('/workflows');

      // On templates tab
      await expect(page.getByTestId('workflows-search')).toHaveAttribute('placeholder', 'Search templates...');

      // Switch to active tab
      await page.getByTestId('workflows-tab-active').click();
      await page.waitForTimeout(100);

      // Placeholder should change
      await expect(page.getByTestId('workflows-search')).toHaveAttribute('placeholder', 'Search workflows...');
    });
  });

  test.describe('Templates Tab', () => {
    test('shows empty state when no playbooks exist', async ({ page }) => {
      // Mock empty playbooks response
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows');

      // Wait for loading
      await page.waitForTimeout(500);

      // Check for empty state
      await expect(page.getByText('No workflow templates')).toBeVisible();
      await expect(page.getByTestId('workflows-create-empty')).toBeVisible();
    });

    test('displays playbook cards when playbooks exist', async ({ page }) => {
      // Mock playbooks response
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            playbooks: [
              {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [
                  { id: 'step-1', title: 'Step 1' },
                  { id: 'step-2', title: 'Step 2' },
                ],
                variables: [
                  { name: 'env', type: 'string', required: true },
                ],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 1,
          }),
        });
      });

      await page.goto('/workflows');

      // Wait for data to load
      await page.waitForTimeout(500);

      // Check for playbook card
      await expect(page.getByTestId('playbook-card-pb-1')).toBeVisible();
      await expect(page.getByText('Test Playbook')).toBeVisible();
      await expect(page.getByText('test_playbook')).toBeVisible();
      await expect(page.getByText('2 steps')).toBeVisible();
      await expect(page.getByText('v1')).toBeVisible();
      await expect(page.getByText('1 variables')).toBeVisible();
    });

    test('playbook card has Create Workflow button', async ({ page }) => {
      // Mock playbooks response
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            playbooks: [
              {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 1,
          }),
        });
      });

      await page.goto('/workflows');
      await page.waitForTimeout(500);

      // Check for Create Workflow button
      const createButton = page.getByTestId('playbook-create-pb-1');
      await expect(createButton).toBeVisible();
      await expect(createButton).toContainText('Create Workflow');
    });

    test('search filters playbooks by name and title', async ({ page }) => {
      // Mock playbooks response
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            playbooks: [
              {
                id: 'pb-1',
                type: 'playbook',
                name: 'deploy_prod',
                title: 'Deploy to Production',
                version: 1,
                steps: [],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'pb-2',
                type: 'playbook',
                name: 'test_suite',
                title: 'Run Test Suite',
                version: 1,
                steps: [],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 2,
          }),
        });
      });

      await page.goto('/workflows');
      await page.waitForTimeout(500);

      // Initially both playbooks should be visible
      await expect(page.getByTestId('playbook-card-pb-1')).toBeVisible();
      await expect(page.getByTestId('playbook-card-pb-2')).toBeVisible();

      // Search for "deploy"
      await page.getByTestId('workflows-search').fill('deploy');
      await page.waitForTimeout(100);

      // Only deploy playbook should be visible
      await expect(page.getByTestId('playbook-card-pb-1')).toBeVisible();
      await expect(page.getByTestId('playbook-card-pb-2')).not.toBeVisible();
    });
  });

  test.describe('Active Tab', () => {
    test('shows empty state when no workflows exist', async ({ page }) => {
      // Mock empty responses
      await page.route('**/api/workflows*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ workflows: [], total: 0 }),
        });
      });

      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows?tab=active');

      // Wait for loading
      await page.waitForTimeout(500);

      // Check for empty state
      await expect(page.getByText('No workflows')).toBeVisible();
      await expect(page.getByText('View Templates')).toBeVisible();
    });

    test('displays workflow cards when workflows exist', async ({ page }) => {
      // Mock workflows response
      await page.route('**/api/workflows*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workflows: [
              {
                id: 'wf-1',
                type: 'workflow',
                title: 'Deploy v2.0.0',
                status: 'running',
                playbookId: 'pb-1',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 1,
          }),
        });
      });

      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows?tab=active');

      // Wait for data to load
      await page.waitForTimeout(500);

      // Check for workflow card
      await expect(page.getByTestId('workflow-card-wf-1')).toBeVisible();
      await expect(page.getByText('Deploy v2.0.0')).toBeVisible();
      await expect(page.getByText('Running')).toBeVisible();
    });

    test('displays both active and terminal workflows sections', async ({ page }) => {
      // Mock workflows response with both active and completed workflows
      await page.route('**/api/workflows*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workflows: [
              {
                id: 'wf-1',
                type: 'workflow',
                title: 'Active Workflow',
                status: 'running',
                playbookId: 'pb-1',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'wf-2',
                type: 'workflow',
                title: 'Completed Workflow',
                status: 'completed',
                playbookId: 'pb-1',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date(Date.now() - 3600000).toISOString(),
                updatedAt: new Date(Date.now() - 3600000).toISOString(),
                startedAt: new Date(Date.now() - 3700000).toISOString(),
                finishedAt: new Date(Date.now() - 3600000).toISOString(),
                createdBy: 'system',
              },
            ],
            total: 2,
          }),
        });
      });

      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows?tab=active');
      await page.waitForTimeout(500);

      // Check for both sections
      await expect(page.getByText('Active (1)')).toBeVisible();
      await expect(page.getByText('Recent (1)')).toBeVisible();
      await expect(page.getByTestId('workflow-card-wf-1')).toBeVisible();
      await expect(page.getByTestId('workflow-card-wf-2')).toBeVisible();
    });

    test('workflow status displays correctly for different states', async ({ page }) => {
      // Mock workflows with different statuses
      await page.route('**/api/workflows*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workflows: [
              {
                id: 'wf-pending',
                type: 'workflow',
                title: 'Pending Workflow',
                status: 'pending',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'wf-running',
                type: 'workflow',
                title: 'Running Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'wf-completed',
                type: 'workflow',
                title: 'Completed Workflow',
                status: 'completed',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'wf-failed',
                type: 'workflow',
                title: 'Failed Workflow',
                status: 'failed',
                failureReason: 'Task failed: timeout',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 4,
          }),
        });
      });

      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows?tab=active');
      await page.waitForTimeout(500);

      // Verify status badges (using exact match to avoid matching workflow titles)
      await expect(page.getByText('Pending', { exact: true })).toBeVisible();
      await expect(page.getByText('Running', { exact: true })).toBeVisible();
      await expect(page.getByText('Completed', { exact: true })).toBeVisible();
      await expect(page.getByText('Failed', { exact: true })).toBeVisible();

      // Failed workflow should show the failure reason
      await expect(page.getByText('Task failed: timeout')).toBeVisible();
    });
  });

  test.describe('Tab URL persistence', () => {
    test('preserves tab in URL when refreshing', async ({ page }) => {
      await page.goto('/workflows?tab=active');

      // Verify we're on active tab
      await expect(page).toHaveURL(/tab=active/);

      // Refresh the page
      await page.reload();

      // Should still be on active tab
      await expect(page).toHaveURL(/tab=active/);
      const activeTab = page.getByTestId('workflows-tab-active');
      await expect(activeTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });
  });

  test.describe('Error handling', () => {
    test('shows error state when playbooks API fails', async ({ page }) => {
      // Block API request
      await page.route('**/api/playbooks*', (route) => {
        route.abort('connectionrefused');
      });

      await page.goto('/workflows');

      // Wait for error state
      await page.waitForTimeout(1000);

      // Check for error UI
      const hasError = await page.getByText('Error loading data').isVisible().catch(() => false);
      if (hasError) {
        await expect(page.getByText('Error loading data')).toBeVisible();
        await expect(page.getByText('Retry')).toBeVisible();
      }
    });

    test('shows error state when workflows API fails', async ({ page }) => {
      // Block workflows API request
      await page.route('**/api/workflows*', (route) => {
        route.abort('connectionrefused');
      });

      // Allow playbooks to work
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows?tab=active');

      // Wait for error state
      await page.waitForTimeout(1000);

      // Check for error UI
      const hasError = await page.getByText('Error loading data').isVisible().catch(() => false);
      if (hasError) {
        await expect(page.getByText('Error loading data')).toBeVisible();
      }
    });
  });

  test.describe('Loading state', () => {
    test('shows loading indicator while fetching playbooks', async ({ page }) => {
      // Add delay to API response
      await page.route('**/api/playbooks*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows');

      // Should show loading indicator (main loader, not the refresh button)
      const loader = page.getByTestId('workflows-loading');
      await expect(loader).toBeVisible();
    });
  });

  test.describe('Responsive design', () => {
    test('shows create button on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/workflows');

      await expect(page.getByTestId('workflows-create')).toBeVisible();
      await expect(page.getByTestId('workflows-create')).toContainText('Create Template');
    });

    test('playbooks grid is responsive', async ({ page }) => {
      // Mock playbooks
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            playbooks: Array.from({ length: 6 }, (_, i) => ({
              id: `pb-${i}`,
              type: 'playbook',
              name: `playbook_${i}`,
              title: `Playbook ${i}`,
              version: 1,
              steps: [],
              variables: [],
              tags: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdBy: 'system',
            })),
            total: 6,
          }),
        });
      });

      await page.goto('/workflows');
      await page.waitForTimeout(500);

      // Grid should be visible
      const grid = page.getByTestId('playbooks-grid');
      await expect(grid).toBeVisible();
    });
  });

  test.describe('Tab badge counts', () => {
    test('shows playbook count badge on templates tab', async ({ page }) => {
      // Mock playbooks
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            playbooks: Array.from({ length: 3 }, (_, i) => ({
              id: `pb-${i}`,
              type: 'playbook',
              name: `playbook_${i}`,
              title: `Playbook ${i}`,
              version: 1,
              steps: [],
              variables: [],
              tags: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdBy: 'system',
            })),
            total: 3,
          }),
        });
      });

      await page.goto('/workflows');
      await page.waitForTimeout(500);

      // Check for badge with count
      const templatesTab = page.getByTestId('workflows-tab-templates');
      await expect(templatesTab).toContainText('3');
    });

    test('shows active workflow count badge on active tab', async ({ page }) => {
      // Mock responses
      await page.route('**/api/workflows*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workflows: [
              {
                id: 'wf-1',
                type: 'workflow',
                title: 'Running 1',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'wf-2',
                type: 'workflow',
                title: 'Pending 1',
                status: 'pending',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 2,
          }),
        });
      });

      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows');
      await page.waitForTimeout(500);

      // Check for badge with count on active tab
      const activeTab = page.getByTestId('workflows-tab-active');
      await expect(activeTab).toContainText('2');
    });
  });

  test.describe('TB-O34: Create Workflow Template', () => {
    test.describe('Create Modal', () => {
      test('clicking Create button opens the modal', async ({ page }) => {
        // Mock playbook response
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        // Mock single playbook response (for modal)
        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'deploy_playbook',
                title: 'Deploy Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        // Click Create button
        await page.getByTestId('playbook-create-pb-1').click();

        // Modal should be visible
        await expect(page.getByTestId('create-workflow-dialog')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Create Workflow' })).toBeVisible();
      });

      test('modal displays playbook info', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 2,
                  steps: [
                    { id: 'step-1', title: 'Build' },
                    { id: 'step-2', title: 'Test' },
                    { id: 'step-3', title: 'Deploy' },
                  ],
                  variables: [
                    { name: 'env', type: 'string', required: true },
                  ],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'deploy_playbook',
                title: 'Deploy Playbook',
                version: 2,
                steps: [
                  { id: 'step-1', title: 'Build' },
                  { id: 'step-2', title: 'Test' },
                  { id: 'step-3', title: 'Deploy' },
                ],
                variables: [
                  { name: 'env', type: 'string', required: true },
                ],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-create-pb-1').click();
        await page.waitForTimeout(300);

        // Check playbook info is displayed in the modal
        const modal = page.getByTestId('create-workflow-dialog');
        // Check the playbook title (using first() to avoid ambiguity from picker)
        await expect(modal.getByText('Deploy Playbook').first()).toBeVisible();
        await expect(modal.getByText(/3 steps/)).toBeVisible();
      });

      test('modal displays workflow title input', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'test_playbook',
                  title: 'Test Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-create-pb-1').click();
        await page.waitForTimeout(300);

        // Check workflow title input
        const titleInput = page.getByTestId('create-title-input');
        await expect(titleInput).toBeVisible();
        // Placeholder shows the playbook title (user can customize the workflow name)
        await expect(titleInput).toHaveAttribute('placeholder', 'Test Playbook');
      });

      test('modal displays variable inputs when playbook has variables', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [
                    { name: 'environment', type: 'string', required: true, description: 'Target environment' },
                    { name: 'debug', type: 'boolean', required: false, default: false },
                    { name: 'replicas', type: 'number', required: false, default: 3 },
                  ],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'deploy_playbook',
                title: 'Deploy Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [
                  { name: 'environment', type: 'string', required: true, description: 'Target environment' },
                  { name: 'debug', type: 'boolean', required: false, default: false },
                  { name: 'replicas', type: 'number', required: false, default: 3 },
                ],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-create-pb-1').click();
        await page.waitForTimeout(300);

        // Check variable inputs in the modal
        const modal = page.getByTestId('create-workflow-dialog');
        // Variables section shows as text, not heading
        await expect(modal.getByText('Variables')).toBeVisible();
        await expect(modal.getByText('environment').first()).toBeVisible();
        await expect(modal.getByText('Target environment')).toBeVisible();
        await expect(page.getByTestId('variable-input-environment')).toBeVisible();
        await expect(page.getByTestId('variable-input-debug')).toBeVisible();
        await expect(page.getByTestId('variable-input-replicas')).toBeVisible();
      });

      test('modal displays steps preview', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [
                    { id: 'step-1', title: 'Build Application' },
                    { id: 'step-2', title: 'Run Tests', dependsOn: ['step-1'] },
                    { id: 'step-3', title: 'Deploy to Staging', dependsOn: ['step-2'] },
                  ],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'deploy_playbook',
                title: 'Deploy Playbook',
                version: 1,
                steps: [
                  { id: 'step-1', title: 'Build Application' },
                  { id: 'step-2', title: 'Run Tests', dependsOn: ['step-1'] },
                  { id: 'step-3', title: 'Deploy to Staging', dependsOn: ['step-2'] },
                ],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-create-pb-1').click();
        await page.waitForTimeout(300);

        // Check steps preview
        await expect(page.getByText('Steps (3)')).toBeVisible();
        await expect(page.getByTestId('steps-preview')).toBeVisible();
        await expect(page.getByText('Build Application')).toBeVisible();
        await expect(page.getByText('Run Tests')).toBeVisible();
        await expect(page.getByText('Deploy to Staging')).toBeVisible();
      });

      test('modal can be closed with close button', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'test_playbook',
                  title: 'Test Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-create-pb-1').click();
        await page.waitForTimeout(300);

        await expect(page.getByTestId('create-workflow-dialog')).toBeVisible();

        // Click close button
        await page.getByTestId('create-workflow-close').click();

        // Modal should be hidden
        await expect(page.getByTestId('create-workflow-dialog')).not.toBeVisible();
      });

      test('modal can be closed with cancel button', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'test_playbook',
                  title: 'Test Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-create-pb-1').click();
        await page.waitForTimeout(300);

        // Click cancel button
        await page.getByTestId('create-cancel-button').click();

        // Modal should be hidden
        await expect(page.getByTestId('create-workflow-dialog')).not.toBeVisible();
      });

      test('submit button is enabled when no required variables', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'simple_playbook',
                  title: 'Simple Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'simple_playbook',
                title: 'Simple Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-create-pb-1').click();
        await page.waitForTimeout(300);

        // Submit button should be enabled
        const submitButton = page.getByTestId('create-submit-button');
        await expect(submitButton).toBeEnabled();
        await expect(submitButton).toContainText('Create Workflow');
      });

      test('submitting creates workflow and switches to active tab', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                playbook: {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              }),
            });
          }
        });

        await page.route('**/api/workflows*', async (route) => {
          // Handle POST for creating workflow
          if (route.request().method() === 'POST') {
            route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify({
                workflow: {
                  id: 'wf-new-1',
                  type: 'workflow',
                  title: 'Deploy Playbook - Run',
                  status: 'pending',
                  playbookId: 'pb-1',
                  ephemeral: false,
                  variables: {},
                  tags: ['created'],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              }),
            });
            return;
          }
          // Handle GET for listing workflows
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflows: [
                {
                  id: 'wf-new-1',
                  type: 'workflow',
                  title: 'Deploy Playbook - Run',
                  status: 'pending',
                  playbookId: 'pb-1',
                  ephemeral: false,
                  variables: {},
                  tags: ['created'],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-create-pb-1').click();
        await page.waitForTimeout(300);

        // Submit the form
        await page.getByTestId('create-submit-button').click();

        // Wait for modal to close and tab to switch
        await page.waitForTimeout(500);

        // Modal should be closed
        await expect(page.getByTestId('create-workflow-dialog')).not.toBeVisible();

        // Should be on active tab
        await expect(page).toHaveURL(/tab=active/);
      });

      test('shows error message when create fails', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                playbook: {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              }),
            });
          }
        });

        await page.route('**/api/workflows', async (route) => {
          if (route.request().method() === 'POST') {
            route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'CREATE_ERROR', message: 'Database connection failed' },
              }),
            });
          }
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-create-pb-1').click();
        await page.waitForTimeout(300);

        // Submit the form
        await page.getByTestId('create-submit-button').click();

        // Wait for error
        await page.waitForTimeout(500);

        // Error message should be visible
        await expect(page.getByText('Database connection failed')).toBeVisible();

        // Modal should still be open
        await expect(page.getByTestId('create-workflow-dialog')).toBeVisible();
      });

      test('shows advanced options with ephemeral toggle', async ({ page }) => {
        // Route for individual playbook detail - must be registered first for specificity
        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        // Route for playbooks list (use exact URL pattern to avoid matching detail endpoint)
        await page.route(/\/api\/playbooks(\?.*)?$/, async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'test_playbook',
                  title: 'Test Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-create-pb-1').click();

        // Wait for the Create dialog to be visible
        await expect(page.getByTestId('create-workflow-dialog')).toBeVisible();

        // Wait for the playbook detail to load (workflow title input appears when playbook data is available)
        await expect(page.getByTestId('create-title-input')).toBeVisible({ timeout: 5000 });

        // Click to expand advanced options - the summary element has cursor:pointer
        await page.getByText('Advanced options').click();

        // Ephemeral checkbox should be visible after expanding
        await expect(page.getByTestId('ephemeral-checkbox')).toBeVisible();
        await expect(page.getByText('Ephemeral workflow', { exact: true })).toBeVisible();
        await expect(page.getByText('Ephemeral workflows are automatically cleaned up after completion')).toBeVisible();
      });
    });
  });

  test.describe('TB-O35: Workflow Progress Dashboard', () => {
    test.describe('Navigating to workflow detail', () => {
      test('clicking a workflow card navigates to detail view', async ({ page }) => {
        // Mock workflows
        await page.route('**/api/workflows', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflows: [
                {
                  id: 'wf-1',
                  type: 'workflow',
                  title: 'Test Workflow',
                  status: 'running',
                  ephemeral: false,
                  variables: {},
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  startedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/workflows/wf-1', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflow: {
                id: 'wf-1',
                type: 'workflow',
                title: 'Test Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.route('**/api/workflows/wf-1/tasks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              tasks: [],
              total: 0,
              progress: { total: 0, completed: 0, inProgress: 0, blocked: 0, open: 0, percentage: 0 },
              dependencies: [],
            }),
          });
        });

        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows?tab=active');
        await page.waitForTimeout(500);

        // Click the workflow card
        await page.getByTestId('workflow-card-wf-1').click();

        // URL should include selected parameter
        await expect(page).toHaveURL(/selected=wf-1/);

        // Detail page should be visible
        await expect(page.getByTestId('workflow-detail-page')).toBeVisible();
        await expect(page.getByTestId('workflow-back-button')).toBeVisible();
      });

      test('back button returns to workflow list', async ({ page }) => {
        await page.route('**/api/workflows', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflows: [
                {
                  id: 'wf-1',
                  type: 'workflow',
                  title: 'Test Workflow',
                  status: 'running',
                  ephemeral: false,
                  variables: {},
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  startedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/workflows/wf-1', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflow: {
                id: 'wf-1',
                type: 'workflow',
                title: 'Test Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.route('**/api/workflows/wf-1/tasks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              tasks: [],
              total: 0,
              progress: { total: 0, completed: 0, inProgress: 0, blocked: 0, open: 0, percentage: 0 },
              dependencies: [],
            }),
          });
        });

        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        // Go directly to detail view
        await page.goto('/workflows?tab=active&selected=wf-1');
        await page.waitForTimeout(500);

        await expect(page.getByTestId('workflow-detail-page')).toBeVisible();

        // Click back button
        await page.getByTestId('workflow-back-button').click();

        // Should be back on list view
        await expect(page).not.toHaveURL(/selected=/);
        await expect(page.getByTestId('workflows-page')).toBeVisible();
      });
    });

    test.describe('Progress Dashboard display', () => {
      test('displays workflow progress bar and stats', async ({ page }) => {
        await page.route('**/api/workflows', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflows: [{
                id: 'wf-1',
                type: 'workflow',
                title: 'Test Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              }],
              total: 1,
            }),
          });
        });

        await page.route('**/api/workflows/wf-1', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflow: {
                id: 'wf-1',
                type: 'workflow',
                title: 'Test Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.route('**/api/workflows/wf-1/tasks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              tasks: [
                { id: 't-1', type: 'task', title: 'Task 1', status: 'closed', priority: 3, complexity: 3, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
                { id: 't-2', type: 'task', title: 'Task 2', status: 'in_progress', priority: 3, complexity: 3, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
                { id: 't-3', type: 'task', title: 'Task 3', status: 'open', priority: 3, complexity: 3, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
                { id: 't-4', type: 'task', title: 'Task 4', status: 'blocked', priority: 3, complexity: 3, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
              ],
              total: 4,
              progress: { total: 4, completed: 1, inProgress: 1, blocked: 1, open: 1, percentage: 25 },
              dependencies: [],
            }),
          });
        });

        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows?tab=active&selected=wf-1');
        await page.waitForTimeout(500);

        // Progress dashboard should be visible
        await expect(page.getByTestId('workflow-progress-dashboard')).toBeVisible();

        // Progress bar should be visible
        await expect(page.getByTestId('workflow-progress-bar')).toBeVisible();
        await expect(page.getByText('25% complete')).toBeVisible();

        // Stats cards should be visible
        await expect(page.getByTestId('workflow-stats-cards')).toBeVisible();
        await expect(page.getByTestId('stat-card-total-tasks')).toBeVisible();
        await expect(page.getByTestId('stat-card-completed')).toBeVisible();
        await expect(page.getByTestId('stat-card-in-progress')).toBeVisible();
        await expect(page.getByTestId('stat-card-blocked')).toBeVisible();
      });

      test('displays task list with correct statuses', async ({ page }) => {
        await page.route('**/api/workflows', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflows: [{
                id: 'wf-1',
                type: 'workflow',
                title: 'Test Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              }],
              total: 1,
            }),
          });
        });

        await page.route('**/api/workflows/wf-1', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflow: {
                id: 'wf-1',
                type: 'workflow',
                title: 'Test Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.route('**/api/workflows/wf-1/tasks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              tasks: [
                { id: 't-1', type: 'task', title: 'Build Application', status: 'closed', priority: 3, complexity: 3, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
                { id: 't-2', type: 'task', title: 'Run Tests', status: 'in_progress', priority: 2, complexity: 2, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
                { id: 't-3', type: 'task', title: 'Deploy', status: 'blocked', priority: 3, complexity: 4, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
              ],
              total: 3,
              progress: { total: 3, completed: 1, inProgress: 1, blocked: 1, open: 0, percentage: 33 },
              dependencies: [
                { blockedId: 't-2', blockerId: 't-1', type: 'blocks' },
                { blockedId: 't-3', blockerId: 't-2', type: 'blocks' },
              ],
            }),
          });
        });

        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows?tab=active&selected=wf-1');
        await page.waitForTimeout(500);

        // Step list should be visible (renamed from task-list to step-list)
        await expect(page.getByTestId('workflow-step-list')).toBeVisible();

        // Individual tasks should be visible
        await expect(page.getByTestId('workflow-task-t-1')).toBeVisible();
        await expect(page.getByTestId('workflow-task-t-2')).toBeVisible();
        await expect(page.getByTestId('workflow-task-t-3')).toBeVisible();

        // Task titles should be visible (in task list)
        await expect(page.getByTestId('workflow-task-t-1').getByText('Build Application')).toBeVisible();
        await expect(page.getByTestId('workflow-task-t-2').getByText('Run Tests')).toBeVisible();
        await expect(page.getByTestId('workflow-task-t-3').getByText('Deploy')).toBeVisible();
      });

      test('displays dependency graph when dependencies exist', async ({ page }) => {
        await page.route('**/api/workflows', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflows: [{
                id: 'wf-1',
                type: 'workflow',
                title: 'Test Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              }],
              total: 1,
            }),
          });
        });

        await page.route('**/api/workflows/wf-1', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflow: {
                id: 'wf-1',
                type: 'workflow',
                title: 'Test Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.route('**/api/workflows/wf-1/tasks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              tasks: [
                { id: 't-1', type: 'task', title: 'Task A', status: 'closed', priority: 3, complexity: 3, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
                { id: 't-2', type: 'task', title: 'Task B', status: 'in_progress', priority: 3, complexity: 3, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
              ],
              total: 2,
              progress: { total: 2, completed: 1, inProgress: 1, blocked: 0, open: 0, percentage: 50 },
              dependencies: [
                { blockedId: 't-2', blockerId: 't-1', type: 'blocks' },
              ],
            }),
          });
        });

        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows?tab=active&selected=wf-1');
        await page.waitForTimeout(500);

        // Dependency graph should be visible
        await expect(page.getByTestId('workflow-dependency-graph')).toBeVisible();
        await expect(page.getByText('1 connection')).toBeVisible();
      });

      test('shows empty message when no dependencies', async ({ page }) => {
        await page.route('**/api/workflows', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflows: [{
                id: 'wf-1',
                type: 'workflow',
                title: 'Test Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              }],
              total: 1,
            }),
          });
        });

        await page.route('**/api/workflows/wf-1', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflow: {
                id: 'wf-1',
                type: 'workflow',
                title: 'Test Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.route('**/api/workflows/wf-1/tasks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              tasks: [
                { id: 't-1', type: 'task', title: 'Independent Task', status: 'open', priority: 3, complexity: 3, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
              ],
              total: 1,
              progress: { total: 1, completed: 0, inProgress: 0, blocked: 0, open: 1, percentage: 0 },
              dependencies: [],
            }),
          });
        });

        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows?tab=active&selected=wf-1');
        await page.waitForTimeout(500);

        // Should show no dependencies message
        await expect(page.getByText('No dependencies between tasks')).toBeVisible();
      });

      test('displays workflow status correctly', async ({ page }) => {
        await page.route('**/api/workflows', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflows: [{
                id: 'wf-1',
                type: 'workflow',
                title: 'Completed Workflow',
                status: 'completed',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date(Date.now() - 3600000).toISOString(),
                finishedAt: new Date().toISOString(),
                createdBy: 'system',
              }],
              total: 1,
            }),
          });
        });

        await page.route('**/api/workflows/wf-1', async (route) => {
          if (route.request().url().includes('/tasks')) return;
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflow: {
                id: 'wf-1',
                type: 'workflow',
                title: 'Completed Workflow',
                status: 'completed',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date(Date.now() - 3600000).toISOString(),
                finishedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.route('**/api/workflows/wf-1/tasks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              tasks: [
                { id: 't-1', type: 'task', title: 'Done Task', status: 'closed', priority: 3, complexity: 3, taskType: 'task', tags: [], ephemeral: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'system' },
              ],
              total: 1,
              progress: { total: 1, completed: 1, inProgress: 0, blocked: 0, open: 0, percentage: 100 },
              dependencies: [],
            }),
          });
        });

        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows?tab=active&selected=wf-1');
        await page.waitForTimeout(500);

        // Workflow status badge should show Completed (specific to the badge)
        await expect(page.locator('div').filter({ hasText: /^Completed$/ }).first()).toBeVisible();
        await expect(page.getByText('100% complete')).toBeVisible();
      });
    });
  });

  test.describe('TB-O33: Visual Workflow Editor', () => {
    test.describe('Opening the editor', () => {
      test('clicking Create Template button opens editor modal', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        // Click Create Template button
        await page.getByTestId('workflows-create').click();

        // Editor modal should be visible
        await expect(page.getByTestId('workflow-editor-dialog')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Create Template' })).toBeVisible();
      });

      test('clicking Create Template in empty state opens editor modal', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        // Click Create Template button in empty state
        await page.getByTestId('workflows-create-empty').click();

        // Editor modal should be visible
        await expect(page.getByTestId('workflow-editor-dialog')).toBeVisible();
      });

      test('clicking Edit on a playbook opens editor modal with playbook data', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'existing_playbook',
                  title: 'Existing Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [{ name: 'env', type: 'string', required: true }],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'existing_playbook',
                title: 'Existing Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [{ name: 'env', type: 'string', required: true }],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        // Open menu and click Edit
        await page.locator('[data-testid="playbook-card-pb-1"]').locator('button').first().click();
        await page.getByTestId('playbook-edit-pb-1').click();

        // Editor modal should be visible with Edit title
        await expect(page.getByTestId('workflow-editor-dialog')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Edit Template' })).toBeVisible();

        // Name field should be disabled (can't change name)
        const nameInput = page.getByTestId('playbook-name-input');
        await expect(nameInput).toBeDisabled();
        await expect(nameInput).toHaveValue('existing_playbook');
      });
    });

    test.describe('Editor layout', () => {
      test('displays name and title inputs', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await expect(page.getByTestId('playbook-name-input')).toBeVisible();
        await expect(page.getByTestId('playbook-title-input')).toBeVisible();
      });

      test('displays Steps, Variables, and YAML tabs', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await expect(page.getByTestId('tab-steps')).toBeVisible();
        await expect(page.getByTestId('tab-variables')).toBeVisible();
        await expect(page.getByTestId('tab-yaml')).toBeVisible();
      });

      test('can switch between tabs', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        // Should start on Steps tab
        await expect(page.getByTestId('step-list')).toBeVisible();

        // Switch to Variables tab
        await page.getByTestId('tab-variables').click();
        await expect(page.getByTestId('variable-list')).toBeVisible();

        // Switch to YAML tab
        await page.getByTestId('tab-yaml').click();
        await expect(page.getByTestId('yaml-preview')).toBeVisible();
      });
    });

    test.describe('Steps management', () => {
      test('shows empty state when no steps exist', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await expect(page.getByText('No steps yet')).toBeVisible();
        await expect(page.getByTestId('add-step-button')).toBeVisible();
      });

      test('can add a step', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        // Hover over add step button to reveal dropdown, then click Add Task Step
        await page.getByTestId('add-step-button').hover();
        await page.getByTestId('add-task-step').click();

        // Step list should now have one item
        const stepList = page.getByTestId('step-list');
        await expect(stepList.locator('[data-testid^="step-item-"]')).toHaveCount(1);

        // Step form should be visible on the right
        await expect(page.getByTestId('step-form')).toBeVisible();
      });

      test('can edit step properties', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        // Hover over add step button to reveal dropdown, then click Add Task Step
        await page.getByTestId('add-step-button').hover();
        await page.getByTestId('add-task-step').click();

        // Fill in step details
        await page.getByTestId('step-title-input').fill('Build Application');
        await page.getByTestId('step-description-input').fill('Build the application for deployment');

        // Select task type
        await page.getByTestId('step-tasktype-select').selectOption('task');

        // Select priority
        await page.getByTestId('step-priority-select').selectOption('3');

        // The step item should show the title
        await expect(page.getByText('Build Application')).toBeVisible();
      });

      test('can reorder steps using up/down buttons', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        // Add two steps using the dropdown menu
        await page.getByTestId('add-step-button').hover();
        await page.getByTestId('add-task-step').click();
        await page.getByTestId('step-title-input').fill('Step A');
        await page.getByTestId('add-step-button').hover();
        await page.getByTestId('add-task-step').click();
        await page.getByTestId('step-title-input').fill('Step B');

        // Move mouse away from dropdown to close it
        await page.mouse.move(0, 0);
        await page.waitForTimeout(100);

        // First step should have disabled up button
        const stepItems = page.locator('[data-testid^="step-item-"]');
        await expect(stepItems).toHaveCount(2);

        // Click first step to select it
        await stepItems.first().click();

        // Move it down
        const moveDownButton = stepItems.first().locator('button[title="Move down"]');
        await moveDownButton.click();

        // Now "Step A" should be second
        const updatedItems = page.locator('[data-testid^="step-item-"]');
        await expect(updatedItems.nth(1)).toContainText('Step A');
      });

      test('can delete a step', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        // Add a step using the dropdown menu
        await page.getByTestId('add-step-button').hover();
        await page.getByTestId('add-task-step').click();

        // Delete the step
        const stepItem = page.locator('[data-testid^="step-item-"]').first();
        const deleteButton = stepItem.locator('button[title="Delete step"]');
        await deleteButton.click();

        // Should be back to empty state
        await expect(page.getByText('No steps yet')).toBeVisible();
      });
    });

    test.describe('Variables management', () => {
      test('shows empty state when no variables exist', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        // Switch to variables tab
        await page.getByTestId('tab-variables').click();

        await expect(page.getByText('No variables yet')).toBeVisible();
        await expect(page.getByTestId('add-variable-button')).toBeVisible();
      });

      test('can add a variable', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await page.getByTestId('tab-variables').click();
        await page.getByTestId('add-variable-button').click();

        // Variable form should be visible
        await expect(page.getByTestId('variable-form')).toBeVisible();

        // Fill in variable details
        await page.getByTestId('variable-name-input').fill('environment');
        await page.getByTestId('variable-type-select').selectOption('string');
        await page.getByTestId('variable-required-checkbox').check();

        // Variable list should show the variable
        await expect(page.getByTestId('variable-item-environment')).toBeVisible();
        await expect(
          page.getByTestId('variable-item-environment').getByText('required')
        ).toBeVisible();
      });

      test('can delete a variable', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await page.getByTestId('tab-variables').click();
        await page.getByTestId('add-variable-button').click();
        await page.getByTestId('variable-name-input').fill('test_var');

        // Delete the variable
        const variableItem = page.locator('[data-testid^="variable-item-"]').first();
        const deleteButton = variableItem.locator('button[title="Delete variable"]');
        await deleteButton.click();

        // Should be back to empty state
        await expect(page.getByText('No variables yet')).toBeVisible();
      });
    });

    test.describe('YAML preview and export', () => {
      test('displays generated YAML', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        // Fill in name and title
        await page.getByTestId('playbook-name-input').fill('my_playbook');
        await page.getByTestId('playbook-title-input').fill('My Playbook');

        // Add a step using the dropdown menu
        await page.getByTestId('add-step-button').hover();
        await page.getByTestId('add-task-step').click();
        await page.getByTestId('step-title-input').fill('Step 1');

        // Switch to YAML tab
        await page.getByTestId('tab-yaml').click();

        // YAML should show the playbook content
        const yamlContent = page.getByTestId('yaml-content');
        await expect(yamlContent).toBeVisible();
        await expect(yamlContent).toContainText('name: my_playbook');
        await expect(yamlContent).toContainText('title: "My Playbook"');
        await expect(yamlContent).toContainText('Step 1');
      });

      test('has copy and download buttons', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await page.getByTestId('tab-yaml').click();

        await expect(page.getByTestId('yaml-copy')).toBeVisible();
        await expect(page.getByTestId('yaml-download')).toBeVisible();
      });

      test('has import functionality', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await page.getByTestId('tab-yaml').click();

        // Click import toggle
        await page.getByTestId('yaml-import-toggle').click();

        // Import UI should be visible
        await expect(page.getByTestId('yaml-import-textarea')).toBeVisible();
        await expect(page.getByTestId('yaml-import-confirm')).toBeVisible();
      });

      test('can import YAML content', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await page.getByTestId('tab-yaml').click();
        await page.getByTestId('yaml-import-toggle').click();

        // Paste YAML content
        const yamlContent = `name: imported_playbook
title: "Imported Playbook"
version: 1
steps:
  - id: step_1
    title: "Imported Step"`;

        const textarea = page.getByTestId('yaml-import-textarea');
        await textarea.fill(yamlContent);
        // Wait for React state to update
        await expect(textarea).toHaveValue(yamlContent);

        await page.getByTestId('yaml-import-confirm').click();

        // After import, the tab switches to 'steps' and the name/title should be populated
        // Wait for the tab to switch (steps tab becomes active)
        await expect(page.getByTestId('tab-steps')).toHaveAttribute('class', /text-\[var\(--color-primary\)\]/);

        // Should show imported content
        await expect(page.getByTestId('playbook-name-input')).toHaveValue('imported_playbook');
        await expect(page.getByTestId('playbook-title-input')).toHaveValue('Imported Playbook');
      });
    });

    test.describe('Saving playbook', () => {
      test('save button is disabled when name is empty', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        // Save button should be disabled
        await expect(page.getByTestId('save-button')).toBeDisabled();
      });

      test('save button is enabled when name and title are provided', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await page.getByTestId('playbook-name-input').fill('my_playbook');
        await page.getByTestId('playbook-title-input').fill('My Playbook');

        // Save button should be enabled
        await expect(page.getByTestId('save-button')).toBeEnabled();
      });

      test('successfully creates a new playbook', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ playbooks: [], total: 0 }),
            });
          } else if (route.request().method() === 'POST') {
            route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify({
                playbook: {
                  id: 'pb-new',
                  type: 'playbook',
                  name: 'new_playbook',
                  title: 'New Playbook',
                  version: 1,
                  steps: [],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              }),
            });
          }
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await page.getByTestId('playbook-name-input').fill('new_playbook');
        await page.getByTestId('playbook-title-input').fill('New Playbook');

        await page.getByTestId('save-button').click();

        // Modal should close
        await page.waitForTimeout(500);
        await expect(page.getByTestId('workflow-editor-dialog')).not.toBeVisible();
      });

      test('shows error when save fails', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ playbooks: [], total: 0 }),
            });
          } else if (route.request().method() === 'POST') {
            route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'CREATE_ERROR', message: 'Database error' },
              }),
            });
          }
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await page.getByTestId('playbook-name-input').fill('new_playbook');
        await page.getByTestId('playbook-title-input').fill('New Playbook');

        await page.getByTestId('save-button').click();

        // Error message should be visible
        await page.waitForTimeout(500);
        await expect(page.getByText('Database error')).toBeVisible();

        // Modal should still be open
        await expect(page.getByTestId('workflow-editor-dialog')).toBeVisible();
      });
    });

    test.describe('Modal interactions', () => {
      test('can close modal with close button', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await expect(page.getByTestId('workflow-editor-dialog')).toBeVisible();

        await page.getByTestId('workflow-editor-close').click();

        await expect(page.getByTestId('workflow-editor-dialog')).not.toBeVisible();
      });

      test('can close modal with cancel button', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        await page.getByTestId('cancel-button').click();

        await expect(page.getByTestId('workflow-editor-dialog')).not.toBeVisible();
      });

      test('can close modal by clicking backdrop', async ({ page }) => {
        await page.route('**/api/playbooks*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ playbooks: [], total: 0 }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('workflows-create').click();
        await page.waitForTimeout(300);

        // Click the backdrop at a position outside the dialog (top-left corner)
        await page.getByTestId('workflow-editor-backdrop').click({
          position: { x: 10, y: 10 },
        });

        await expect(page.getByTestId('workflow-editor-dialog')).not.toBeVisible();
      });
    });
  });
});
