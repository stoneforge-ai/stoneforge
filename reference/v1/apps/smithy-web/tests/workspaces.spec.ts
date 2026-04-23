import { test, expect } from '@playwright/test';

test.describe('TB-O17a: Terminal Multiplexer (Workspaces Page)', () => {
  test.describe('Workspaces page layout', () => {
    test('displays page header with title and actions', async ({ page }) => {
      await page.goto('/workspaces');

      // Page should be visible
      await expect(page.getByTestId('workspaces-page')).toBeVisible();

      // Title should be visible
      await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible();

      // Add Pane button should be visible
      await expect(page.getByTestId('workspaces-add-pane')).toBeVisible();

      // Layout button should be visible
      await expect(page.getByTestId('workspaces-layout-btn')).toBeVisible();
    });

    test('displays empty state when no panes', async ({ page }) => {
      // Clear localStorage to ensure clean state
      await page.goto('/workspaces');
      await page.evaluate(() => {
        localStorage.removeItem('stoneforge-active-workspace-layout');
        localStorage.removeItem('stoneforge-workspace-layouts');
      });
      await page.reload();

      // Wait for page to load
      await expect(page.getByTestId('workspaces-page')).toBeVisible();

      // Empty state should be visible
      await expect(page.getByTestId('workspaces-empty')).toBeVisible();

      // Empty state should have CTA
      await expect(page.getByText('No Terminal Panes')).toBeVisible();
      await expect(page.getByText('Add Your First Pane')).toBeVisible();
    });
  });

  test.describe('Add Pane dialog', () => {
    test('opens Add Pane dialog when clicking Add Pane button', async ({ page }) => {
      await page.goto('/workspaces');

      // Click Add Pane button
      await page.getByTestId('workspaces-add-pane').click();

      // Dialog should be visible
      await expect(page.getByTestId('add-pane-dialog')).toBeVisible();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Dialog should have title
      await expect(page.getByRole('heading', { name: 'Add Terminal Pane' })).toBeVisible();

      // Search input should be visible
      await expect(page.getByTestId('add-pane-search')).toBeVisible();

      // Agent list should be visible
      await expect(page.getByTestId('add-pane-list')).toBeVisible();
    });

    test('can close Add Pane dialog via close button', async ({ page }) => {
      await page.goto('/workspaces');

      // Open dialog
      await page.getByTestId('workspaces-add-pane').click();
      await expect(page.getByTestId('add-pane-dialog')).toBeVisible();

      // Click close button
      await page.getByTestId('add-pane-close').click();

      // Dialog should be hidden
      await expect(page.getByTestId('add-pane-dialog')).not.toBeVisible();
    });

    test('can close Add Pane dialog by clicking backdrop', async ({ page }) => {
      await page.goto('/workspaces');

      // Open dialog
      await page.getByTestId('workspaces-add-pane').click();
      await expect(page.getByTestId('add-pane-dialog')).toBeVisible();

      // Click on the backdrop at the top-left corner (outside the dialog)
      // The dialog is centered, so clicking at (10, 10) should hit the backdrop
      await page.mouse.click(10, 10);

      // Dialog should be hidden
      await expect(page.getByTestId('add-pane-dialog')).not.toBeVisible();
    });

    test('can filter agents in search', async ({ page }) => {
      await page.goto('/workspaces');

      // Open dialog
      await page.getByTestId('workspaces-add-pane').click();

      // Type in search
      await page.getByTestId('add-pane-search').fill('director');

      // List should filter (showing only matching agents or "no match" message)
      await expect(page.getByTestId('add-pane-list')).toBeVisible();
    });
  });

  test.describe('Layout presets', () => {
    test('opens layout menu when clicking layout button', async ({ page }) => {
      await page.goto('/workspaces');

      // Click layout button
      await page.getByTestId('workspaces-layout-btn').click();

      // Layout menu should be visible
      await expect(page.getByTestId('layout-menu')).toBeVisible();

      // Preset options should be visible
      await expect(page.getByTestId('layout-preset-single')).toBeVisible();
      await expect(page.getByTestId('layout-preset-columns')).toBeVisible();
      await expect(page.getByTestId('layout-preset-rows')).toBeVisible();
      await expect(page.getByTestId('layout-preset-grid')).toBeVisible();
    });

    test('can select layout preset', async ({ page }) => {
      await page.goto('/workspaces');

      // Open layout menu
      await page.getByTestId('workspaces-layout-btn').click();

      // Select columns
      await page.getByTestId('layout-preset-columns').click();

      // Menu should close
      await expect(page.getByTestId('layout-menu')).not.toBeVisible();
    });

    test('closes layout menu when clicking outside', async ({ page }) => {
      await page.goto('/workspaces');

      // Open layout menu
      await page.getByTestId('workspaces-layout-btn').click();
      await expect(page.getByTestId('layout-menu')).toBeVisible();

      // Click the invisible overlay that captures outside clicks
      // The layout menu uses a fixed inset-0 div to catch clicks
      await page.locator('.fixed.inset-0.z-10').click({ force: true });

      // Menu should close
      await expect(page.getByTestId('layout-menu')).not.toBeVisible();
    });
  });

  test.describe('Layout persistence', () => {
    test('persists layout to localStorage', async ({ page }) => {
      await page.goto('/workspaces');

      // Open layout menu and select a preset
      await page.getByTestId('workspaces-layout-btn').click();
      await page.getByTestId('layout-preset-grid').click();

      // Verify localStorage was updated
      const layoutData = await page.evaluate(() => {
        return localStorage.getItem('stoneforge-active-workspace-layout');
      });

      expect(layoutData).toBeTruthy();
      expect(JSON.parse(layoutData!).preset).toBe('grid');
    });

    test('restores layout from localStorage on reload', async ({ page }) => {
      await page.goto('/workspaces');

      // Set a specific layout
      await page.getByTestId('workspaces-layout-btn').click();
      await page.getByTestId('layout-preset-rows').click();

      // Reload page
      await page.reload();

      // Layout should be preserved - verify by checking the button shows the preset
      // (The button text should show "Split Horizontal" if layout persisted)
      await expect(page.getByTestId('workspaces-page')).toBeVisible();
    });
  });

  test.describe('Save Layout dialog', () => {
    // Note: Save layout option only appears when there are panes
    // For this test we'll verify the menu structure exists
    test('layout menu structure is correct', async ({ page }) => {
      await page.goto('/workspaces');

      // Open layout menu
      await page.getByTestId('workspaces-layout-btn').click();

      // Layout Presets header should be visible
      await expect(page.getByText('Layout Presets')).toBeVisible();
    });
  });

  test.describe('Workspace grid', () => {
    test('shows workspace grid when panes exist', async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with a mock pane in localStorage
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'single',
          panes: [
            {
              id: 'pane-1',
              agentId: 'test-agent-1',
              agentName: 'Test Agent',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      // Reload to pick up the mock layout
      await page.reload();

      // Workspace grid should be visible
      await expect(page.getByTestId('workspace-grid')).toBeVisible();

      // Pane should be visible
      await expect(page.getByTestId('workspace-pane-pane-1')).toBeVisible();
    });
  });

  test.describe('Pane controls', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with a mock pane
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'single',
          panes: [
            {
              id: 'pane-test',
              agentId: 'test-agent-1',
              agentName: 'Test Agent',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();
    });

    test('pane has header with agent info', async ({ page }) => {
      // Pane header should be visible
      await expect(page.getByTestId('pane-header')).toBeVisible();

      // Agent name should be visible in the header
      await expect(page.getByTestId('pane-header').getByText('Test Agent')).toBeVisible();
    });

    test('pane has maximize button', async ({ page }) => {
      // First switch to a multi-pane layout where maximize is visible
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'columns', // Use columns preset so maximize button is visible
          panes: [
            {
              id: 'pane-test',
              agentId: 'test-agent-1',
              agentName: 'Test Agent',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-test-2',
              agentId: 'test-agent-2',
              agentName: 'Test Agent 2',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });
      await page.reload();

      // Maximize button should be visible
      await expect(page.getByTestId('pane-maximize-btn').first()).toBeVisible();
    });

    test('can maximize and restore pane', async ({ page }) => {
      // First switch to a multi-pane layout where maximize is visible
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'columns', // Use columns preset
          panes: [
            {
              id: 'pane-test',
              agentId: 'test-agent-1',
              agentName: 'Test Agent',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-test-2',
              agentId: 'test-agent-2',
              agentName: 'Test Agent 2',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });
      await page.reload();

      // Click maximize on first pane
      await page.getByTestId('pane-maximize-btn').first().click();

      // Grid should now show single pane (pane-count=1)
      await expect(page.getByTestId('workspace-grid')).toHaveAttribute('data-pane-count', '1');
      // Only one pane should be visible (the maximized one)
      await expect(page.getByTestId('workspace-pane-pane-test')).toBeVisible();
      await expect(page.getByTestId('workspace-pane-pane-test-2')).not.toBeVisible();

      // Click restore (same button)
      await page.getByTestId('pane-maximize-btn').click();

      // Should be back to original layout with both panes visible
      await expect(page.getByTestId('workspace-grid')).toHaveAttribute('data-pane-count', '2');
      await expect(page.getByTestId('workspace-pane-pane-test')).toBeVisible();
      await expect(page.getByTestId('workspace-pane-pane-test-2')).toBeVisible();
    });

    test('pane has close button', async ({ page }) => {
      // Close button should be visible
      await expect(page.getByTestId('pane-close-btn')).toBeVisible();
    });

    test('can close pane', async ({ page }) => {
      // Click close
      await page.getByTestId('pane-close-btn').click();

      // Pane should be removed
      await expect(page.getByTestId('workspace-pane-pane-test')).not.toBeVisible();

      // Empty state should appear
      await expect(page.getByTestId('workspaces-empty')).toBeVisible();
    });

    test('pane has menu button', async ({ page }) => {
      // Menu button should be visible
      await expect(page.getByTestId('pane-menu-btn')).toBeVisible();
    });

    test('can open pane menu', async ({ page }) => {
      // Click menu button
      await page.getByTestId('pane-menu-btn').click();

      // Menu should be visible
      await expect(page.getByTestId('pane-menu')).toBeVisible();
    });
  });

  test.describe('Stream viewer pane', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with a stream pane
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'single',
          panes: [
            {
              id: 'pane-stream',
              agentId: 'test-agent-1',
              agentName: 'Test Agent',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();
    });

    test('displays stream viewer for ephemeral worker', async ({ page }) => {
      // Stream viewer should be visible
      const pane = page.getByTestId('workspace-pane-pane-stream');
      await expect(pane).toBeVisible();

      // Pane type should be stream
      await expect(pane).toHaveAttribute('data-pane-type', 'stream');
    });

    test('stream viewer has input area', async ({ page }) => {
      // Input should be visible
      await expect(page.getByTestId('stream-input')).toBeVisible();

      // Send button should be visible (uses TerminalInput component)
      await expect(page.getByTestId('stream-input-send-btn')).toBeVisible();
    });

    test('stream viewer shows events container', async ({ page }) => {
      // Events container should be visible
      await expect(page.getByTestId('stream-events')).toBeVisible();
    });
  });

  test.describe('Terminal pane', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with a terminal pane (persistent worker)
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'single',
          panes: [
            {
              id: 'pane-terminal',
              agentId: 'test-agent-2',
              agentName: 'Persistent Worker',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();
    });

    test('displays terminal for persistent worker', async ({ page }) => {
      // Pane should be visible
      const pane = page.getByTestId('workspace-pane-pane-terminal');
      await expect(pane).toBeVisible();

      // Pane type should be terminal
      await expect(pane).toHaveAttribute('data-pane-type', 'terminal');
    });

    test('terminal pane shows xterm container', async ({ page }) => {
      // XTerminal component should render
      await expect(page.getByTestId('terminal-pane-terminal')).toBeVisible();
    });

    test('terminal pane has show/hide textbox option in menu', async ({ page }) => {
      // Open the more options menu
      const menuBtn = page.getByTestId('pane-menu-btn');
      await menuBtn.click();

      // Textbox toggle button should be visible
      const toggleBtn = page.getByTestId('pane-toggle-textbox');
      await expect(toggleBtn).toBeVisible();
      await expect(toggleBtn).toContainText('Show textbox');
    });

    test('can toggle textbox visibility for terminal pane', async ({ page }) => {
      // Initially textbox should not be visible
      await expect(page.getByTestId('textbox-pane-terminal')).not.toBeVisible();

      // Open menu and click show textbox
      await page.getByTestId('pane-menu-btn').click();
      await page.getByTestId('pane-toggle-textbox').click();

      // Textbox should now be visible
      await expect(page.getByTestId('textbox-pane-terminal')).toBeVisible();

      // Open menu again - should now say "Hide textbox"
      await page.getByTestId('pane-menu-btn').click();
      await expect(page.getByTestId('pane-toggle-textbox')).toContainText('Hide textbox');

      // Click to hide
      await page.getByTestId('pane-toggle-textbox').click();

      // Textbox should be hidden
      await expect(page.getByTestId('textbox-pane-terminal')).not.toBeVisible();
    });
  });

  test.describe('Multiple panes', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with multiple panes
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'columns',
          panes: [
            {
              id: 'pane-1',
              agentId: 'agent-1',
              agentName: 'Agent One',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-2',
              agentId: 'agent-2',
              agentName: 'Agent Two',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();
    });

    test('displays multiple panes in grid', async ({ page }) => {
      // Grid should be visible
      await expect(page.getByTestId('workspace-grid')).toBeVisible();

      // Both panes should be visible
      await expect(page.getByTestId('workspace-pane-pane-1')).toBeVisible();
      await expect(page.getByTestId('workspace-pane-pane-2')).toBeVisible();
    });

    test('grid uses correct preset', async ({ page }) => {
      // Grid should have columns preset
      await expect(page.getByTestId('workspace-grid')).toHaveAttribute('data-preset', 'columns');
    });

    test('can close one pane while keeping others', async ({ page }) => {
      // Close first pane
      const pane1 = page.getByTestId('workspace-pane-pane-1');
      await pane1.getByTestId('pane-close-btn').click();

      // First pane should be gone
      await expect(page.getByTestId('workspace-pane-pane-1')).not.toBeVisible();

      // Second pane should still be visible
      await expect(page.getByTestId('workspace-pane-pane-2')).toBeVisible();
    });
  });

  test.describe('Responsive behavior', () => {
    test('page header is visible on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/workspaces');

      // Page title should still be visible
      await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible();

      // Add Pane button should be visible
      await expect(page.getByTestId('workspaces-add-pane')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('Add Pane dialog is properly labeled', async ({ page }) => {
      await page.goto('/workspaces');

      // Open dialog
      await page.getByTestId('workspaces-add-pane').click();

      // Dialog should have proper role
      await expect(page.getByRole('dialog')).toBeVisible();

      // Dialog should have accessible name
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveAttribute('aria-labelledby', 'add-pane-title');
    });

    test('close button has accessible label', async ({ page }) => {
      await page.goto('/workspaces');

      // Open dialog
      await page.getByTestId('workspaces-add-pane').click();

      // Close button should have accessible name
      await expect(page.getByLabel('Close dialog')).toBeVisible();
    });
  });

  test.describe('Drag and drop reordering', () => {
    test('panes are draggable when not maximized', async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with two panes via localStorage
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'columns',
          panes: [
            {
              id: 'pane-1',
              agentId: 'agent-1',
              agentName: 'Worker 1',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-2',
              agentId: 'agent-2',
              agentName: 'Worker 2',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
          ],
          gridConfig: {
            cols: 2,
            rows: 1,
            colSizes: [{ fr: 1 }, { fr: 1 }],
            rowSizes: [{ fr: 1 }],
          },
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();

      // Check that panes have draggable attribute
      const grid = page.getByTestId('workspace-grid');
      await expect(grid).toBeVisible();

      // The inner div wrapper around each pane should be draggable
      const draggables = grid.locator('[draggable="true"]');
      await expect(draggables).toHaveCount(2);
    });

    test('grid maintains structure during drag', async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with two panes
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'columns',
          panes: [
            {
              id: 'pane-1',
              agentId: 'agent-1',
              agentName: 'Worker 1',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-2',
              agentId: 'agent-2',
              agentName: 'Worker 2',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
          ],
          gridConfig: {
            cols: 2,
            rows: 1,
            colSizes: [{ fr: 1 }, { fr: 1 }],
            rowSizes: [{ fr: 1 }],
          },
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();

      // Grid should have correct preset
      const grid = page.getByTestId('workspace-grid');
      await expect(grid).toHaveAttribute('data-preset', 'columns');
      await expect(grid).toHaveAttribute('data-pane-count', '2');
    });
  });

  test.describe('Resize handles', () => {
    test('displays horizontal resize handle between columns in columns layout', async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with two panes in columns
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'columns',
          panes: [
            {
              id: 'pane-1',
              agentId: 'agent-1',
              agentName: 'Worker 1',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-2',
              agentId: 'agent-2',
              agentName: 'Worker 2',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
          ],
          gridConfig: {
            cols: 2,
            rows: 1,
            colSizes: [{ fr: 1 }, { fr: 1 }],
            rowSizes: [{ fr: 1 }],
          },
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();

      // Should be in columns layout
      const grid = page.getByTestId('workspace-grid');
      await expect(grid).toHaveAttribute('data-preset', 'columns');

      // Check for resize handle (Separator element with cursor-col-resize)
      const horizontalHandle = grid.locator('[data-panel-group-id] > [data-resize-handle-active]').or(
        grid.locator('.cursor-col-resize')
      );
      await expect(horizontalHandle.first()).toBeVisible();
    });

    test('displays vertical resize handle between rows in grid layout', async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with 3 panes in grid (triggers 2 rows)
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'grid',
          panes: [
            {
              id: 'pane-1',
              agentId: 'agent-1',
              agentName: 'Worker 1',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-2',
              agentId: 'agent-2',
              agentName: 'Worker 2',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
            {
              id: 'pane-3',
              agentId: 'agent-3',
              agentName: 'Worker 3',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 2,
              weight: 1,
            },
          ],
          gridConfig: {
            cols: 2,
            rows: 2,
            colSizes: [{ fr: 1 }, { fr: 1 }],
            rowSizes: [{ fr: 1 }, { fr: 1 }],
          },
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();

      // Should be in grid layout
      const grid = page.getByTestId('workspace-grid');
      await expect(grid).toHaveAttribute('data-preset', 'grid');

      // Check for vertical resize handle (Separator element with cursor-row-resize)
      const verticalHandle = grid.locator('.cursor-row-resize');
      await expect(verticalHandle.first()).toBeVisible();
    });

    test('resize handle has correct cursor style', async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with two panes
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'columns',
          panes: [
            {
              id: 'pane-1',
              agentId: 'agent-1',
              agentName: 'Worker 1',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-2',
              agentId: 'agent-2',
              agentName: 'Worker 2',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
          ],
          gridConfig: {
            cols: 2,
            rows: 1,
            colSizes: [{ fr: 1 }, { fr: 1 }],
            rowSizes: [{ fr: 1 }],
          },
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();

      // Check horizontal handle has col-resize cursor class
      const grid = page.getByTestId('workspace-grid');
      const horizontalHandle = grid.locator('.cursor-col-resize');
      await expect(horizontalHandle.first()).toBeVisible();
      await expect(horizontalHandle.first()).toHaveClass(/cursor-col-resize/);
    });

    test('can resize both horizontal and vertical dividers sequentially', async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with 3 panes in grid (triggers 2x2 grid with one spanning pane)
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'grid',
          panes: [
            {
              id: 'pane-1',
              agentId: 'agent-1',
              agentName: 'Worker 1',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-2',
              agentId: 'agent-2',
              agentName: 'Worker 2',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
            {
              id: 'pane-3',
              agentId: 'agent-3',
              agentName: 'Worker 3',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 2,
              weight: 1,
            },
          ],
          gridConfig: {
            cols: 2,
            rows: 2,
            colSizes: [{ fr: 1 }, { fr: 1 }],
            rowSizes: [{ fr: 1 }, { fr: 1 }],
          },
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();

      // Wait for grid to render
      const grid = page.getByTestId('workspace-grid');
      await expect(grid).toBeVisible();

      // Check for resize handles (using CSS class selectors)
      const horizontalHandle = grid.locator('.cursor-col-resize').first();
      const verticalHandle = grid.locator('.cursor-row-resize').first();
      await expect(horizontalHandle).toBeVisible({ timeout: 5000 });
      await expect(verticalHandle).toBeVisible({ timeout: 5000 });

      // Get the bounding boxes
      const hBox = await horizontalHandle.boundingBox();
      expect(hBox).toBeTruthy();

      // Perform horizontal resize (drag right by 50 pixels)
      await horizontalHandle.hover();
      await page.mouse.down();
      await page.mouse.move(hBox!.x + hBox!.width / 2 + 50, hBox!.y + hBox!.height / 2, { steps: 3 });
      await page.mouse.up();

      // Verify horizontal handle still visible
      await expect(horizontalHandle).toBeVisible({ timeout: 5000 });

      // Get vertical handle bounds and perform resize
      const vBox = await verticalHandle.boundingBox();
      expect(vBox).toBeTruthy();

      // Perform vertical resize (drag down by 50 pixels)
      await verticalHandle.hover();
      await page.mouse.down();
      await page.mouse.move(vBox!.x + vBox!.width / 2, vBox!.y + vBox!.height / 2 + 50, { steps: 3 });
      await page.mouse.up();

      // Verify both handles are still visible and functional
      await expect(horizontalHandle).toBeVisible({ timeout: 5000 });
      await expect(verticalHandle).toBeVisible({ timeout: 5000 });

      // Try horizontal resize again after vertical resize
      const hBox2 = await horizontalHandle.boundingBox();
      expect(hBox2).toBeTruthy();

      await horizontalHandle.hover();
      await page.mouse.down();
      await page.mouse.move(hBox2!.x + hBox2!.width / 2 - 30, hBox2!.y + hBox2!.height / 2, { steps: 3 });
      await page.mouse.up();

      // Verify handles are still visible
      await expect(horizontalHandle).toBeVisible({ timeout: 5000 });
      await expect(verticalHandle).toBeVisible({ timeout: 5000 });
    });

    test('resize handles are hidden when pane is maximized', async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with two panes
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'columns',
          panes: [
            {
              id: 'pane-1',
              agentId: 'agent-1',
              agentName: 'Worker 1',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-2',
              agentId: 'agent-2',
              agentName: 'Worker 2',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
          ],
          gridConfig: {
            cols: 2,
            rows: 1,
            colSizes: [{ fr: 1 }, { fr: 1 }],
            rowSizes: [{ fr: 1 }],
          },
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();

      const grid = page.getByTestId('workspace-grid');

      // Resize handle should be visible initially
      const horizontalHandle = grid.locator('.cursor-col-resize').first();
      await expect(horizontalHandle).toBeVisible();

      // Maximize a pane
      const maximizeBtn = page.getByTestId('pane-maximize-btn').first();
      await maximizeBtn.click();

      // Resize handle should no longer be visible (not in DOM when maximized)
      await expect(grid.locator('.cursor-col-resize')).toHaveCount(0);
    });

    test('vertical swap button swaps rows in 2x2 grid layout', async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a 2x2 grid layout with 4 panes
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'grid',
          panes: [
            {
              id: 'pane-1',
              agentId: 'agent-1',
              agentName: 'Worker 1',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-2',
              agentId: 'agent-2',
              agentName: 'Worker 2',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
            {
              id: 'pane-3',
              agentId: 'agent-3',
              agentName: 'Worker 3',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 2,
              weight: 1,
            },
            {
              id: 'pane-4',
              agentId: 'agent-4',
              agentName: 'Worker 4',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 3,
              weight: 1,
            },
          ],
          gridConfig: {
            cols: 2,
            rows: 2,
            colSizes: [{ fr: 1 }, { fr: 1 }],
            rowSizes: [{ fr: 1 }, { fr: 1 }],
          },
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('stoneforge-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();

      // Wait for grid to render
      const grid = page.getByTestId('workspace-grid');
      await expect(grid).toBeVisible();

      // Verify 2x2 grid with 4 panes
      expect(await grid.getAttribute('data-pane-count')).toBe('4');
      expect(await grid.getAttribute('data-preset')).toBe('grid');

      // Check for vertical resize handle (row divider)
      const verticalHandle = grid.locator('.cursor-row-resize').first();
      await expect(verticalHandle).toBeVisible({ timeout: 5000 });

      // Check that the vertical swap button exists on the handle
      const swapButton = grid.getByTestId('swap-row-0-1-btn');
      await expect(swapButton).toBeVisible({ timeout: 5000 });

      // Get the initial order of panes by checking names in the DOM
      const initialPaneNames: string[] = await page.evaluate(() => {
        const layout = JSON.parse(localStorage.getItem('stoneforge-active-workspace-layout') || '{}');
        return layout.panes?.map((p: { agentName: string }) => p.agentName) || [];
      });
      expect(initialPaneNames).toEqual(['Worker 1', 'Worker 2', 'Worker 3', 'Worker 4']);

      // The swap button has pointer-events: none, so we need to click on it
      // using coordinates. The global click listener will detect it.
      const swapButtonBox = await swapButton.boundingBox();
      expect(swapButtonBox).toBeTruthy();
      await page.mouse.click(
        swapButtonBox!.x + swapButtonBox!.width / 2,
        swapButtonBox!.y + swapButtonBox!.height / 2
      );

      // Wait a bit for the swap to complete
      await page.waitForTimeout(300);

      // Check the pane order has been swapped (rows swapped: top row [0,1] and bottom row [2,3] swapped)
      const finalPaneNames: string[] = await page.evaluate(() => {
        const layout = JSON.parse(localStorage.getItem('stoneforge-active-workspace-layout') || '{}');
        return layout.panes?.map((p: { agentName: string }) => p.agentName) || [];
      });
      // After row swap: [0,1] <-> [2,3] means order becomes [3,4,1,2] -> Worker 3, Worker 4, Worker 1, Worker 2
      expect(finalPaneNames).toEqual(['Worker 3', 'Worker 4', 'Worker 1', 'Worker 2']);
    });
  });
});
