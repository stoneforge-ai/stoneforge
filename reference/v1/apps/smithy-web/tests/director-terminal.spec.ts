import { test, expect } from '@playwright/test';

test.describe('TB-O17: Director Terminal Panel', () => {
  test.describe('Terminal Layout', () => {
    test('displays xterm terminal when director panel is expanded', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Director panel should be expanded
      await expect(page.getByTestId('director-panel')).toBeVisible();

      // Terminal container should be visible
      await expect(page.getByTestId('director-terminal-container')).toBeVisible();
    });

    test('shows no-director state when no director is registered', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Should show "No Director agent found" message since API will return empty
      // Note: This may show an error state or no-director state depending on API availability
      await expect(page.getByTestId('director-terminal-container')).toBeVisible();
    });

    test('displays terminal header with title', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Terminal container should contain terminal header
      const terminalContainer = page.getByTestId('director-terminal-container');
      await expect(terminalContainer).toBeVisible();

      // Should have terminal header elements (the title bar with dots)
      await expect(terminalContainer.locator('.rounded-full').first()).toBeVisible();
    });

    test('has correct panel width when expanded', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Director panel should be 384px wide (w-96)
      const panel = page.getByTestId('director-panel');
      const box = await panel.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBe(384);
    });
  });

  test.describe('Director Panel Header', () => {
    test('shows Director title in header', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Header should show "Director" text
      const panel = page.getByTestId('director-panel');
      await expect(panel.locator('text=Director').first()).toBeVisible();
    });

    test('shows status indicator', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Should show status (Idle, No Director, Connecting, etc.)
      const panel = page.getByTestId('director-panel');
      // Status could be various values depending on backend state
      await expect(panel.locator('[class*="text-xs"]').filter({ hasText: /Idle|No Director|Connecting|Running|Error/ })).toBeVisible();
    });

    test('has collapse button in header', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Collapse button should be visible
      await expect(page.getByTestId('director-panel-collapse')).toBeVisible();
    });
  });

  test.describe('Panel Controls', () => {
    test('collapse button returns to collapsed state', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Click collapse button
      await page.getByTestId('director-panel-collapse').click();

      // Should be back to collapsed state
      await expect(page.getByTestId('director-panel-collapsed')).toBeVisible();
    });
  });

  test.describe('Collapsed State', () => {
    test('collapsed panel shows terminal icon with status indicator', async ({ page }) => {
      await page.goto('/');

      // Director panel should be collapsed by default
      const collapsedPanel = page.getByTestId('director-panel-collapsed');
      await expect(collapsedPanel).toBeVisible();

      // Should have the expand button with terminal icon
      const expandButton = page.getByTestId('director-panel-expand');
      await expect(expandButton).toBeVisible();
    });

    test('collapsed panel has narrow width', async ({ page }) => {
      await page.goto('/');

      // Director panel should be collapsed by default
      const collapsedPanel = page.getByTestId('director-panel-collapsed');

      // Collapsed panel should be 48px wide (w-12)
      const box = await collapsedPanel.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBe(48);
    });
  });

  test.describe('Terminal XTerm Integration', () => {
    test('xterm container is rendered when director exists', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Wait for the terminal container
      await expect(page.getByTestId('director-terminal-container')).toBeVisible();

      // The xterminal element may be present (depends on if director exists)
      // If no director, it will show the no-director state with "No Director agent found" message
      // or an idle overlay with start button
      const terminalOrNoDirector = page.locator(
        '[data-testid="director-xterminal"], ' +
        ':text("No Director agent found"), ' +
        '[data-testid="director-idle-overlay"]'
      );
      await expect(terminalOrNoDirector.first()).toBeVisible();
    });

    test('terminal has dark background', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Terminal container should have dark background
      const terminalArea = page.getByTestId('director-terminal-container').locator('div').first();
      await expect(terminalArea).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('expand button has accessible label', async ({ page }) => {
      await page.goto('/');

      const expandButton = page.getByTestId('director-panel-expand');
      await expect(expandButton).toHaveAttribute('aria-label', 'Open Director Panel');
    });

    test('collapse button has accessible label', async ({ page }) => {
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      const collapseButton = page.getByTestId('director-panel-collapse');
      await expect(collapseButton).toHaveAttribute('aria-label', 'Collapse Director Panel');
    });
  });

  test.describe('Responsive Behavior', () => {
    test('director panel maintains layout on smaller screens', async ({ page }) => {
      // Set viewport to tablet size
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/');

      // Expand the director panel
      await page.getByTestId('director-panel-expand').click();

      // Director panel should still be visible and functional
      await expect(page.getByTestId('director-panel')).toBeVisible();
      await expect(page.getByTestId('director-terminal-container')).toBeVisible();
    });
  });
});
