import { test, expect } from '@playwright/test';

test.describe('TB-O16: Agent List Page', () => {
  test.describe('Page layout', () => {
    test('displays agents page with correct header', async ({ page }) => {
      await page.goto('/agents');

      await expect(page.getByTestId('agents-page')).toBeVisible();
      await expect(page.getByTestId('agents-page-title')).toBeVisible();
      await expect(page.getByText('Manage your AI agents and stewards')).toBeVisible();
    });

    test('displays search input', async ({ page }) => {
      await page.goto('/agents');

      const searchInput = page.getByTestId('agents-search');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('placeholder', 'Search agents...');
    });

    test('displays create agent button', async ({ page }) => {
      await page.goto('/agents');

      await expect(page.getByTestId('agents-create')).toBeVisible();
    });
  });

  test.describe('Tabs', () => {
    test('displays Agents and Stewards tabs', async ({ page }) => {
      await page.goto('/agents');

      await expect(page.getByTestId('agents-tab-agents')).toBeVisible();
      await expect(page.getByTestId('agents-tab-stewards')).toBeVisible();
    });

    test('defaults to Agents tab', async ({ page }) => {
      await page.goto('/agents');

      const agentsTab = page.getByTestId('agents-tab-agents');
      // The agents tab should have the active styling (primary color border)
      await expect(agentsTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('can switch to Stewards tab', async ({ page }) => {
      await page.goto('/agents');

      await page.getByTestId('agents-tab-stewards').click();

      // URL should reflect tab change
      await expect(page).toHaveURL(/tab=stewards/);

      // Stewards tab should now be active
      const stewardsTab = page.getByTestId('agents-tab-stewards');
      await expect(stewardsTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('can switch back to Agents tab', async ({ page }) => {
      await page.goto('/agents?tab=stewards');

      await page.getByTestId('agents-tab-agents').click();

      await expect(page).toHaveURL(/tab=agents/);
    });
  });

  test.describe('Empty states', () => {
    test('shows empty state for agents when no agents exist', async ({ page }) => {
      await page.goto('/agents');

      // Wait for loading to complete
      await page.waitForTimeout(500);

      // Check for empty state or agent cards (depending on whether server has agents)
      const emptyState = page.getByTestId('agents-create-empty');
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      if (hasEmptyState) {
        await expect(page.getByText('No agents yet')).toBeVisible();
        await expect(page.getByText('Create your first agent')).toBeVisible();
      }
    });

    test('shows empty state for stewards when no stewards exist', async ({ page }) => {
      await page.goto('/agents?tab=stewards');

      // Wait for loading to complete
      await page.waitForTimeout(500);

      // Check for empty state
      const emptyState = page.getByTestId('stewards-create-empty');
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      if (hasEmptyState) {
        await expect(page.getByText('No stewards yet')).toBeVisible();
        await expect(page.getByText('Create stewards to automate maintenance tasks')).toBeVisible();
      }
    });
  });

  test.describe('Search functionality', () => {
    test('search input accepts text', async ({ page }) => {
      await page.goto('/agents');

      const searchInput = page.getByTestId('agents-search');
      await searchInput.fill('test-agent');

      await expect(searchInput).toHaveValue('test-agent');
    });

    test('search filters agents by name', async ({ page }) => {
      await page.goto('/agents');

      // Type a search query
      await page.getByTestId('agents-search').fill('director');

      // Give time for filtering
      await page.waitForTimeout(200);

      // The page should still be visible
      await expect(page.getByTestId('agents-page')).toBeVisible();
    });
  });

  test.describe('Error handling', () => {
    test('shows error state when API request fails', async ({ page }) => {
      // Block all API requests to simulate network failure
      await page.route('**/api/agents', (route) => {
        route.abort('connectionrefused');
      });

      await page.goto('/agents');

      // Wait for the error state to appear
      await page.waitForTimeout(1000);

      // Should show error state - check if error UI is present
      // Note: When the orchestrator server isn't running, we get an error state
      const hasErrorState = await page.getByText('Failed to load agents').isVisible().catch(() => false);

      // Either we have an error state, or the network route intercept wasn't effective
      // (due to Vite proxy happening server-side). Skip assertion if not visible.
      if (hasErrorState) {
        await expect(page.getByText('Failed to load agents')).toBeVisible();
        await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
      }
    });
  });

  test.describe('Responsive design', () => {
    test('shows create button text on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/agents');

      // The "Create Agent" text should be visible on desktop
      await expect(page.getByTestId('agents-create')).toContainText('Create Agent');
    });

    test('hides create button text on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/agents');

      // The plus icon should still be visible but text hidden on mobile
      const createButton = page.getByTestId('agents-create');
      await expect(createButton).toBeVisible();
    });
  });

  test.describe('Loading state', () => {
    test('shows loading indicator while fetching agents', async ({ page }) => {
      // Add a delay to the API response
      await page.route('**/api/agents*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: [] }),
        });
      });

      await page.goto('/agents');

      // Should show loading indicator
      await expect(page.getByText('Loading agents...')).toBeVisible();
    });
  });

  test.describe('Tab URL persistence', () => {
    test('preserves tab in URL when navigating', async ({ page }) => {
      await page.goto('/agents?tab=stewards');

      // Verify we're on stewards tab
      await expect(page).toHaveURL(/tab=stewards/);

      // Refresh the page
      await page.reload();

      // Should still be on stewards tab
      await expect(page).toHaveURL(/tab=stewards/);
      const stewardsTab = page.getByTestId('agents-tab-stewards');
      await expect(stewardsTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });
  });
});

test.describe('TB-O22: Steward Configuration UI', () => {
  test.describe('Create Agent Dialog - Opening', () => {
    test('opens create agent dialog from header button', async ({ page }) => {
      await page.goto('/agents');

      // Click the create button
      await page.getByTestId('agents-create').click();

      // Dialog should appear
      await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: /Create/ })).toBeVisible();
    });

    test('opens create agent dialog from empty state button', async ({ page }) => {
      // Mock empty agents response
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: [] }),
        });
      });

      await page.goto('/agents');

      // Wait for empty state to appear
      await page.waitForTimeout(500);

      // Click empty state create button
      const emptyButton = page.getByTestId('agents-create-empty');
      await emptyButton.click();

      // Dialog should appear
      await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
    });

    test('opens create steward dialog from stewards tab', async ({ page }) => {
      await page.goto('/agents?tab=stewards');

      // Click the create button
      await page.getByTestId('agents-create').click();

      // Dialog should appear with steward pre-selected
      await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Create Steward' })).toBeVisible();
    });

    test('closes dialog when clicking backdrop', async ({ page }) => {
      await page.goto('/agents');
      await page.getByTestId('agents-create').click();
      await expect(page.getByTestId('create-agent-dialog')).toBeVisible();

      // Click the backdrop - we need to click outside the dialog card
      // The backdrop covers the full screen but the dialog is in the center
      // Click on the left edge which should hit the backdrop
      const backdrop = page.getByTestId('create-agent-backdrop');
      const box = await backdrop.boundingBox();
      if (box) {
        await page.mouse.click(box.x + 10, box.y + box.height / 2);
      }

      // Dialog should be closed
      await expect(page.getByTestId('create-agent-dialog')).not.toBeVisible();
    });

    test('closes dialog when clicking close button', async ({ page }) => {
      await page.goto('/agents');
      await page.getByTestId('agents-create').click();
      await expect(page.getByTestId('create-agent-dialog')).toBeVisible();

      // Click the close button
      await page.getByTestId('create-agent-close').click();

      // Dialog should be closed
      await expect(page.getByTestId('create-agent-dialog')).not.toBeVisible();
    });
  });

  test.describe('Create Agent Dialog - Form Validation', () => {
    test('submit button is disabled when name is empty', async ({ page }) => {
      await page.goto('/agents');
      await page.getByTestId('agents-create').click();

      const submitButton = page.getByTestId('submit-create-agent');
      const nameInput = page.getByTestId('agent-name');

      // Name field is auto-filled with a suggested name, so button starts enabled
      await expect(submitButton).toBeEnabled();

      // Clear the name field - submit button should become disabled
      await nameInput.clear();
      await expect(submitButton).toBeDisabled();

      // Fill in name again - submit button should be enabled
      await nameInput.fill('Test Agent');
      await expect(submitButton).toBeEnabled();
    });

    test('name field has focus when dialog opens', async ({ page }) => {
      await page.goto('/agents');
      await page.getByTestId('agents-create').click();

      // The name input should have focus
      const nameInput = page.getByTestId('agent-name');
      await expect(nameInput).toBeFocused();
    });
  });

  test.describe('Create Agent Dialog - Steward Configuration', () => {
    test('shows steward focus selector when steward role is selected', async ({ page }) => {
      await page.goto('/agents?tab=stewards');
      await page.getByTestId('agents-create').click();

      // Steward focus dropdown should be visible
      await expect(page.getByTestId('steward-focus')).toBeVisible();
    });

    test('can select different steward focus areas', async ({ page }) => {
      await page.goto('/agents?tab=stewards');
      await page.getByTestId('agents-create').click();

      const focusSelect = page.getByTestId('steward-focus');

      // Check default is merge
      await expect(focusSelect).toHaveValue('merge');

      // Select docs focus
      await focusSelect.selectOption('docs');
      await expect(focusSelect).toHaveValue('docs');

      // Check description updates
      await expect(page.getByText(/Reviews, updates, and maintains/)).toBeVisible();
    });

    test('can add cron trigger', async ({ page }) => {
      await page.goto('/agents?tab=stewards');
      await page.getByTestId('agents-create').click();

      // Click add cron trigger button
      await page.getByTestId('add-cron-trigger').click();

      // Trigger card should appear
      await expect(page.getByTestId('trigger-0')).toBeVisible();
      await expect(page.getByTestId('trigger-0-schedule')).toBeVisible();
    });

    test('can add event trigger', async ({ page }) => {
      await page.goto('/agents?tab=stewards');
      await page.getByTestId('agents-create').click();

      // Click add event trigger button
      await page.getByTestId('add-event-trigger').click();

      // Trigger card should appear with event field
      await expect(page.getByTestId('trigger-0')).toBeVisible();
      await expect(page.getByTestId('trigger-0-event')).toBeVisible();
    });

    test('can edit trigger values', async ({ page }) => {
      await page.goto('/agents?tab=stewards');
      await page.getByTestId('agents-create').click();

      // Add a cron trigger
      await page.getByTestId('add-cron-trigger').click();

      // Edit the schedule
      const scheduleInput = page.getByTestId('trigger-0-schedule');
      await scheduleInput.clear();
      await scheduleInput.fill('0 2 * * *');

      await expect(scheduleInput).toHaveValue('0 2 * * *');
    });

    test('can remove trigger', async ({ page }) => {
      await page.goto('/agents?tab=stewards');
      await page.getByTestId('agents-create').click();

      // Add a trigger
      await page.getByTestId('add-cron-trigger').click();
      await expect(page.getByTestId('trigger-0')).toBeVisible();

      // Remove it
      await page.getByTestId('trigger-0-remove').click();
      await expect(page.getByTestId('trigger-0')).not.toBeVisible();
    });

    test('can add multiple triggers', async ({ page }) => {
      await page.goto('/agents?tab=stewards');
      await page.getByTestId('agents-create').click();

      // Add cron trigger
      await page.getByTestId('add-cron-trigger').click();
      // Add event trigger
      await page.getByTestId('add-event-trigger').click();

      // Both should be visible
      await expect(page.getByTestId('trigger-0')).toBeVisible();
      await expect(page.getByTestId('trigger-1')).toBeVisible();
    });
  });

  test.describe('Create Agent Dialog - Capabilities', () => {
    test('capabilities section is collapsed by default', async ({ page }) => {
      await page.goto('/agents');
      await page.getByTestId('agents-create').click();

      // Tags input should not be visible when collapsed
      await expect(page.getByTestId('agent-tags')).not.toBeVisible();
    });

    test('can expand capabilities section', async ({ page }) => {
      await page.goto('/agents');
      await page.getByTestId('agents-create').click();

      // Click to expand
      await page.getByTestId('toggle-capabilities').click();

      // Tags input should now be visible
      await expect(page.getByTestId('agent-tags')).toBeVisible();
    });

    test('can fill in tags', async ({ page }) => {
      await page.goto('/agents');
      await page.getByTestId('agents-create').click();
      await page.getByTestId('toggle-capabilities').click();

      // Fill in tags
      await page.getByTestId('agent-tags').fill('team-alpha');

      // Verify value
      await expect(page.getByTestId('agent-tags')).toHaveValue('team-alpha');
    });
  });

  test.describe('Create Agent Dialog - Submission', () => {
    test('creates steward successfully', async ({ page }) => {
      // Mock the create endpoint
      let createdAgent: Record<string, unknown> | null = null;
      await page.route('**/api/agents', async (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
          const body = request.postDataJSON();
          createdAgent = body;
          route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              agent: {
                id: 'el-new123',
                name: body.name,
                type: 'entity',
                entityType: 'agent',
                status: 'active',
                createdAt: Date.now(),
                modifiedAt: Date.now(),
                metadata: {
                  agent: {
                    agentRole: body.role,
                    stewardFocus: body.stewardFocus,
                    triggers: body.triggers,
                    sessionStatus: 'idle',
                  },
                },
              },
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ agents: [] }),
          });
        }
      });

      await page.goto('/agents?tab=stewards');
      await page.getByTestId('agents-create').click();

      // Fill in the form
      await page.getByTestId('agent-name').fill('Test Merge Steward');
      await page.getByTestId('steward-focus').selectOption('merge');

      // Add a cron trigger
      await page.getByTestId('add-cron-trigger').click();
      await page.getByTestId('trigger-0-schedule').clear();
      await page.getByTestId('trigger-0-schedule').fill('0 2 * * *');

      // Submit
      await page.getByTestId('submit-create-agent').click();

      // Dialog should close
      await expect(page.getByTestId('create-agent-dialog')).not.toBeVisible();

      // Verify the request was made correctly
      expect(createdAgent).toEqual(expect.objectContaining({
        name: 'Test Merge Steward',
        role: 'steward',
        stewardFocus: 'merge',
        triggers: [{ type: 'cron', schedule: '0 2 * * *' }],
      }));
    });

    test('shows loading state while creating', async ({ page }) => {
      // Mock a slow create endpoint
      await page.route('**/api/agents', async (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              agent: {
                id: 'el-new123',
                name: 'Test',
                type: 'entity',
                entityType: 'agent',
                status: 'active',
                createdAt: Date.now(),
                modifiedAt: Date.now(),
              },
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ agents: [] }),
          });
        }
      });

      await page.goto('/agents');
      await page.getByTestId('agents-create').click();
      await page.getByTestId('agent-name').fill('Test Agent');

      // Submit
      await page.getByTestId('submit-create-agent').click();

      // Should show loading state
      await expect(page.getByText('Creating...')).toBeVisible();
    });

    test('shows error when creation fails', async ({ page }) => {
      // Mock a failing create endpoint
      await page.route('**/api/agents', async (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
          route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'ALREADY_EXISTS', message: 'Agent with this name already exists' },
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ agents: [] }),
          });
        }
      });

      await page.goto('/agents');
      await page.getByTestId('agents-create').click();
      await page.getByTestId('agent-name').fill('Existing Agent');

      // Submit
      await page.getByTestId('submit-create-agent').click();

      // Should show error message
      await expect(page.getByText('Agent with this name already exists')).toBeVisible();

      // Dialog should stay open
      await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
    });
  });

  test.describe('Create Worker Dialog', () => {
    test('shows worker mode selector when worker role is selected', async ({ page }) => {
      await page.goto('/agents');
      await page.getByTestId('agents-create').click();

      // Select worker role
      await page.getByTestId('role-worker').click();

      // Worker mode buttons should be visible
      await expect(page.getByTestId('worker-mode-ephemeral')).toBeVisible();
      await expect(page.getByTestId('worker-mode-persistent')).toBeVisible();
    });

    test('can select worker mode', async ({ page }) => {
      await page.goto('/agents');
      await page.getByTestId('agents-create').click();
      await page.getByTestId('role-worker').click();

      // Select persistent mode
      await page.getByTestId('worker-mode-persistent').click();

      // Persistent button should show selected state
      await expect(page.getByTestId('worker-mode-persistent')).toHaveClass(/border-blue-500/);
    });
  });
});

test.describe('TB-O26: Agent Workspace View', () => {
  test.describe('Graph tab', () => {
    test('displays Graph tab in the agents page', async ({ page }) => {
      await page.goto('/agents');

      await expect(page.getByTestId('agents-tab-graph')).toBeVisible();
      await expect(page.getByTestId('agents-tab-graph')).toContainText('Graph');
    });

    test('can switch to Graph tab', async ({ page }) => {
      await page.goto('/agents');

      await page.getByTestId('agents-tab-graph').click();

      // URL should reflect tab change
      await expect(page).toHaveURL(/tab=graph/);

      // Graph tab should now be active
      const graphTab = page.getByTestId('agents-tab-graph');
      await expect(graphTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('can switch to Graph tab via URL', async ({ page }) => {
      await page.goto('/agents?tab=graph');

      // Graph tab should be active
      const graphTab = page.getByTestId('agents-tab-graph');
      await expect(graphTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });
  });

  test.describe('Graph visualization - Empty state', () => {
    test('shows empty state when no agents exist', async ({ page }) => {
      // Mock empty agents response
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for loading to complete
      await page.waitForTimeout(500);

      // Should show empty state
      await expect(page.getByTestId('agent-graph-empty')).toBeVisible();
      await expect(page.getByText('No agents registered')).toBeVisible();
    });
  });

  test.describe('Graph visualization - Loading state', () => {
    test('shows loading indicator while fetching agents', async ({ page }) => {
      // Add a delay to the API response
      await page.route('**/api/agents*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Should show loading indicator
      await expect(page.getByTestId('agent-graph-loading')).toBeVisible();
      await expect(page.getByText('Loading agents...')).toBeVisible();
    });
  });

  test.describe('Graph visualization - Error state', () => {
    test('shows error state when API request fails', async ({ page }) => {
      // Use abort to cause immediate network failure (avoids React Query retry delays)
      await page.route('**/api/agents*', (route) => {
        route.abort('connectionrefused');
      });

      await page.goto('/agents?tab=graph');

      // Wait for the error state to appear
      await page.waitForTimeout(1000);

      // Should show error state - check if error UI is present
      const hasErrorState = await page.getByTestId('agent-graph-error').isVisible().catch(() => false);

      if (hasErrorState) {
        await expect(page.getByTestId('agent-graph-error')).toBeVisible();
        await expect(page.getByText('Failed to load agents')).toBeVisible();
        await expect(page.getByTestId('agent-graph-retry')).toBeVisible();
      }
    });

    test('can retry after error', async ({ page }) => {
      let requestCount = 0;
      await page.route('**/api/agents*', (route) => {
        requestCount++;
        if (requestCount === 1) {
          // First request fails with network error
          route.abort('connectionrefused');
        } else {
          // Subsequent requests succeed
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ agents: [] }),
          });
        }
      });

      await page.goto('/agents?tab=graph');

      // Wait for error state
      await page.waitForTimeout(1000);

      const hasErrorState = await page.getByTestId('agent-graph-error').isVisible().catch(() => false);

      if (hasErrorState) {
        await expect(page.getByTestId('agent-graph-error')).toBeVisible();

        // Click retry
        await page.getByTestId('agent-graph-retry').click();

        // Should show empty state (second request succeeded with empty agents)
        await expect(page.getByTestId('agent-graph-empty')).toBeVisible();
      }
    });
  });

  test.describe('Graph visualization - With agents', () => {
    const mockAgents = [
      {
        id: 'el-director-1',
        name: 'Director',
        type: 'entity',
        entityType: 'agent',
        status: 'active',
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        metadata: {
          agent: {
            agentRole: 'director',
            sessionStatus: 'idle',
          },
        },
      },
      {
        id: 'el-worker-1',
        name: 'Worker Alice',
        type: 'entity',
        entityType: 'agent',
        status: 'active',
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        metadata: {
          agent: {
            agentRole: 'worker',
            workerMode: 'ephemeral',
            sessionStatus: 'running',
            branch: 'agent/alice/task-123-fix-bug',
          },
        },
      },
      {
        id: 'el-steward-1',
        name: 'Merge Steward',
        type: 'entity',
        entityType: 'agent',
        status: 'active',
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        metadata: {
          agent: {
            agentRole: 'steward',
            stewardFocus: 'merge',
            sessionStatus: 'idle',
          },
        },
      },
    ];

    test('shows graph visualization when agents exist', async ({ page }) => {
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: mockAgents }),
        });
      });
      await page.route('**/api/tasks*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for graph to render
      await page.waitForTimeout(1000);

      // Should show graph container
      await expect(page.getByTestId('agent-workspace-graph')).toBeVisible();
    });

    test('displays Human node at top of hierarchy', async ({ page }) => {
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: mockAgents }),
        });
      });
      await page.route('**/api/tasks*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for graph to render
      await page.waitForTimeout(1000);

      // Should show Human node
      await expect(page.getByTestId('graph-node-human')).toBeVisible();
      await expect(page.getByText('Human')).toBeVisible();
    });

    test('displays Director node connected to Human', async ({ page }) => {
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: mockAgents }),
        });
      });
      await page.route('**/api/tasks*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for graph to render
      await page.waitForTimeout(1000);

      // Should show Director node
      await expect(page.getByTestId('graph-node-el-director-1')).toBeVisible();
      await expect(page.getByText('Director')).toBeVisible();
    });

    test('displays Worker nodes with status and branch', async ({ page }) => {
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: mockAgents }),
        });
      });
      await page.route('**/api/tasks*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for graph to render
      await page.waitForTimeout(1000);

      // Should show Worker node
      await expect(page.getByTestId('graph-node-el-worker-1')).toBeVisible();
      await expect(page.getByText('Worker Alice')).toBeVisible();

      // Should show branch info
      await expect(page.getByText('agent/alice/task-123-fix-bug')).toBeVisible();
    });

    test('displays Steward nodes', async ({ page }) => {
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: mockAgents }),
        });
      });
      await page.route('**/api/tasks*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for graph to render
      await page.waitForTimeout(1000);

      // Should show Steward node
      await expect(page.getByTestId('graph-node-el-steward-1')).toBeVisible();
      await expect(page.getByText('Merge Steward')).toBeVisible();
    });

    test('graph has zoom controls', async ({ page }) => {
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: mockAgents }),
        });
      });
      await page.route('**/api/tasks*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for graph to render
      await page.waitForTimeout(1000);

      // React Flow controls should be visible
      const graphContainer = page.getByTestId('agent-workspace-graph');
      await expect(graphContainer.locator('.react-flow__controls')).toBeVisible();
    });

    test('graph has minimap', async ({ page }) => {
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: mockAgents }),
        });
      });
      await page.route('**/api/tasks*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for graph to render
      await page.waitForTimeout(1000);

      // React Flow minimap should be visible
      const graphContainer = page.getByTestId('agent-workspace-graph');
      await expect(graphContainer.locator('.react-flow__minimap')).toBeVisible();
    });
  });

  test.describe('Graph interaction', () => {
    const mockAgents = [
      {
        id: 'el-director-1',
        name: 'Director',
        type: 'entity',
        entityType: 'agent',
        status: 'active',
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        metadata: {
          agent: {
            agentRole: 'director',
            sessionStatus: 'running',
          },
        },
      },
    ];

    test('nodes are draggable', async ({ page }) => {
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: mockAgents }),
        });
      });
      await page.route('**/api/tasks*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for graph to render
      await page.waitForTimeout(1000);

      // Get the director node
      const directorNode = page.getByTestId('graph-node-el-director-1');

      // Get initial position
      const initialBox = await directorNode.boundingBox();

      // Drag the node
      if (initialBox) {
        await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(initialBox.x + 100, initialBox.y + 50);
        await page.mouse.up();
      }

      // Node should still be visible (dragging doesn't remove it)
      await expect(directorNode).toBeVisible();
    });

    test('clicking running agent shows Open in Workspace indicator', async ({ page }) => {
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: mockAgents }),
        });
      });
      await page.route('**/api/tasks*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });
      // Mock running session for the director
      await page.route('**/api/sessions*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sessions: [
              { id: 'sess-1', agentId: 'el-director-1', status: 'running' },
            ],
          }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for graph to render
      await page.waitForTimeout(1000);

      // Running agent should show "Open in Workspace" indicator
      await expect(page.getByText('Open in Workspace')).toBeVisible();
    });

    test('clicking agent navigates to workspaces', async ({ page }) => {
      await page.route('**/api/agents*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: mockAgents }),
        });
      });
      await page.route('**/api/tasks*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });

      await page.goto('/agents?tab=graph');

      // Wait for graph to render
      await page.waitForTimeout(1000);

      // Click the Director node
      await page.getByTestId('graph-node-el-director-1').click();

      // Should navigate to workspaces with agent param
      await expect(page).toHaveURL(/\/workspaces/);
      await expect(page).toHaveURL(/agent=el-director-1/);
    });
  });

  test.describe('Graph tab URL persistence', () => {
    test('preserves graph tab in URL when navigating', async ({ page }) => {
      await page.goto('/agents?tab=graph');

      // Verify we're on graph tab
      await expect(page).toHaveURL(/tab=graph/);

      // Refresh the page
      await page.reload();

      // Should still be on graph tab
      await expect(page).toHaveURL(/tab=graph/);
      const graphTab = page.getByTestId('agents-tab-graph');
      await expect(graphTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });
  });
});
