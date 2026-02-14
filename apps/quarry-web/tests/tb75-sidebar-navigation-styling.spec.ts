import { test, expect } from '@playwright/test';

test.describe('TB75: Sidebar and Navigation Styling', () => {
  test.describe('Sidebar Collapsible Sections', () => {
    test('sidebar displays collapsible section headers', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Check section headers are visible
      await expect(page.getByTestId('nav-section-dashboard')).toBeVisible();
      await expect(page.getByTestId('nav-section-work')).toBeVisible();
      await expect(page.getByTestId('nav-section-collaborate')).toBeVisible();
      await expect(page.getByTestId('nav-section-organize')).toBeVisible();
    });

    test('sections are expanded by default', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // All nav items should be visible since sections are expanded by default
      await expect(page.getByTestId('nav-dashboard')).toBeVisible();
      await expect(page.getByTestId('nav-tasks')).toBeVisible();
      await expect(page.getByTestId('nav-messages')).toBeVisible();
      await expect(page.getByTestId('nav-entities')).toBeVisible();
    });

    test('clicking section header collapses and expands items', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Work section should be visible with Tasks
      await expect(page.getByTestId('nav-tasks')).toBeVisible();

      // Click Work section toggle to collapse
      await page.getByTestId('section-toggle-work').click();

      // Wait for collapse animation - check for the collapsed state by verifying max-h-0 class
      const workSection = page.getByTestId('nav-section-work').locator('.overflow-hidden');
      await expect(workSection).toHaveClass(/max-h-0/);

      // Click again to expand
      await page.getByTestId('section-toggle-work').click();

      // Wait for expand animation - check for max-h-96 class
      await expect(workSection).toHaveClass(/max-h-96/);

      // Tasks should be visible again
      await expect(page.getByTestId('nav-tasks')).toBeVisible();
    });

    test('section chevron rotates when collapsed', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Get the section toggle button
      const sectionToggle = page.getByTestId('section-toggle-work');

      // Find the chevron icon within the button
      const chevron = sectionToggle.locator('svg').last();

      // Initially chevron should NOT have -rotate-90 class (expanded state)
      await expect(chevron).not.toHaveClass(/-rotate-90/);

      // Click to collapse
      await sectionToggle.click();
      await page.waitForTimeout(250);

      // Now chevron should have -rotate-90 class (collapsed state)
      await expect(chevron).toHaveClass(/-rotate-90/);
    });
  });

  test.describe('Sidebar Active Item Indicator', () => {
    test('active item shows indicator bar', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Dashboard should be active and have indicator
      const dashboardLink = page.getByTestId('nav-dashboard');
      await expect(dashboardLink).toBeVisible();
      await expect(dashboardLink.getByTestId('active-indicator')).toBeVisible();
    });

    test('active indicator moves when navigating', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Dashboard should have active indicator
      const dashboardLink = page.getByTestId('nav-dashboard');
      await expect(dashboardLink.getByTestId('active-indicator')).toBeVisible();

      // Navigate to tasks
      await page.getByTestId('nav-tasks').click();
      await expect(page).toHaveURL(/\/tasks/);

      // Tasks should now have active indicator
      const tasksLink = page.getByTestId('nav-tasks');
      await expect(tasksLink.getByTestId('active-indicator')).toBeVisible();

      // Dashboard should no longer have active indicator
      await expect(dashboardLink.getByTestId('active-indicator')).not.toBeVisible();
    });

    test('active item has correct styling', async ({ page }) => {
      await page.goto('/tasks?page=1&limit=25');
      await expect(page.getByTestId('tasks-page')).toBeVisible();

      // Tasks link should have active background color class
      const tasksLink = page.getByTestId('nav-tasks');
      await expect(tasksLink).toHaveClass(/bg-\[var\(--color-sidebar-item-active\)\]/);
    });
  });

  test.describe('Sidebar Hover States', () => {
    test('nav items show shortcut hint on hover', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Find the tasks nav item
      const tasksLink = page.getByTestId('nav-tasks');

      // Shortcut should be hidden by default (opacity-0)
      const shortcut = tasksLink.locator('span.font-mono');
      await expect(shortcut).toHaveClass(/opacity-0/);

      // Hover over the link
      await tasksLink.hover();

      // Shortcut should be visible (opacity-100 on hover via CSS)
      // Note: We check that the element exists and contains G T
      await expect(shortcut).toContainText('G T');
    });
  });

  test.describe('Sidebar Collapsed Mode', () => {
    test('sidebar collapses to icon-only view', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Sidebar should start expanded
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toHaveClass(/w-60/);

      // Click collapse button
      await page.getByTestId('sidebar-toggle').click();

      // Sidebar should be collapsed
      await expect(sidebar).toHaveClass(/w-16/);
    });

    test('collapsed sidebar shows icons without labels', async ({ page }) => {
      await page.goto('/dashboard');

      // Collapse sidebar
      await page.getByTestId('sidebar-toggle').click();
      await expect(page.getByTestId('sidebar')).toHaveClass(/w-16/);

      // Nav items should still be visible (icons)
      await expect(page.getByTestId('nav-dashboard')).toBeVisible();
      await expect(page.getByTestId('nav-tasks')).toBeVisible();

      // But the text labels should be hidden (check for truncate class or absence of text span)
      const tasksLink = page.getByTestId('nav-tasks');
      const textSpan = tasksLink.locator('span.truncate');
      await expect(textSpan).not.toBeVisible();
    });

    test('collapsed sidebar shows tooltip on hover', async ({ page }) => {
      await page.goto('/dashboard');

      // Collapse sidebar
      await page.getByTestId('sidebar-toggle').click();
      await expect(page.getByTestId('sidebar')).toHaveClass(/w-16/);

      // Nav items should have title attribute for tooltip
      const tasksLink = page.getByTestId('nav-tasks');
      await expect(tasksLink).toHaveAttribute('title', 'Tasks');
    });
  });

  test.describe('Header and Breadcrumbs', () => {
    test('header is visible with connection status', async ({ page }) => {
      await page.goto('/dashboard');

      const header = page.getByTestId('header');
      await expect(header).toBeVisible();

      // Connection status should be visible
      await expect(page.getByText('Live')).toBeVisible({ timeout: 10000 });
    });

    test('breadcrumbs show current page', async ({ page }) => {
      await page.goto('/dashboard');

      const breadcrumbs = page.getByTestId('breadcrumbs');
      await expect(breadcrumbs).toBeVisible();

      // Dashboard breadcrumb should be visible
      await expect(page.getByTestId('breadcrumb-dashboard')).toBeVisible();
    });

    test('breadcrumbs show hierarchy for nested routes', async ({ page }) => {
      await page.goto('/dashboard/task-flow');
      await expect(page.getByTestId('task-flow-page')).toBeVisible();

      const breadcrumbs = page.getByTestId('breadcrumbs');
      await expect(breadcrumbs).toBeVisible();

      // Should show Dashboard > Task Flow
      await expect(page.getByTestId('breadcrumb-dashboard')).toBeVisible();
      await expect(page.getByTestId('breadcrumb-task-flow')).toBeVisible();
    });

    test('parent breadcrumb is clickable for navigation', async ({ page }) => {
      await page.goto('/dashboard/timeline?page=1&limit=100');
      await expect(page.getByTestId('timeline-page')).toBeVisible();

      // Dashboard breadcrumb should be a link
      const dashboardBreadcrumb = page.getByTestId('breadcrumb-dashboard');
      await expect(dashboardBreadcrumb).toBeVisible();

      // Click to navigate back
      await dashboardBreadcrumb.click();

      // Should be on dashboard
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('current page breadcrumb is bold (not a link)', async ({ page }) => {
      await page.goto('/tasks?page=1&limit=25');
      await expect(page.getByTestId('tasks-page')).toBeVisible();

      // Tasks breadcrumb should be a span (not a link) with font-semibold
      const tasksBreadcrumb = page.getByTestId('breadcrumb-tasks');
      await expect(tasksBreadcrumb).toBeVisible();
      await expect(tasksBreadcrumb).toHaveClass(/font-semibold/);
    });

    test('breadcrumb separator is visible between items', async ({ page }) => {
      await page.goto('/dashboard/timeline?page=1&limit=100');
      await expect(page.getByTestId('timeline-page')).toBeVisible();

      // There should be a ChevronRight separator between Dashboard and Timeline
      const breadcrumbs = page.getByTestId('breadcrumbs');
      const separators = breadcrumbs.locator('svg');

      // At least one separator icon should exist (ChevronRight)
      await expect(separators.first()).toBeVisible();
    });
  });

  test.describe('CommandPalette Styling', () => {
    test('command palette has larger search input', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // Open command palette
      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Search input should have larger text (text-lg class)
      const input = page.getByTestId('command-palette-input');
      await expect(input).toHaveClass(/text-lg/);
    });

    test('command palette shows grouped items with clear hierarchy', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Groups should be visible with uppercase headers (cmdk-group-heading elements)
      const commandPalette = page.getByTestId('command-palette');

      // Check for group headings within the command palette (the div with cmdk-group-heading attribute)
      const dashboardHeading = commandPalette.locator('[cmdk-group-heading]', { hasText: 'Dashboard' });
      const workHeading = commandPalette.locator('[cmdk-group-heading]', { hasText: 'Work' });
      const collaborateHeading = commandPalette.locator('[cmdk-group-heading]', { hasText: 'Collaborate' });

      await expect(dashboardHeading).toBeVisible();
      await expect(workHeading).toBeVisible();
      await expect(collaborateHeading).toBeVisible();
    });

    test('command palette shows keyboard hints in footer', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Footer should show keyboard hints
      await expect(page.getByText('to navigate')).toBeVisible();
      await expect(page.getByText('to select')).toBeVisible();
      await expect(page.getByText('to toggle')).toBeVisible();
    });

    test('command item shows icon in styled container', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Command items should have icon container with rounded styling
      const commandItem = page.getByTestId('command-item-nav-tasks');
      await expect(commandItem).toBeVisible();

      // Icon container should have rounded-md class
      const iconContainer = commandItem.locator('div.rounded-md');
      await expect(iconContainer).toBeVisible();
    });

    test('command palette shows shortcut keys as styled badges', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Find a command item with shortcut
      const commandItem = page.getByTestId('command-item-nav-tasks');
      await expect(commandItem).toBeVisible();

      // Shortcut keys should be in kbd elements
      const kbdElements = commandItem.locator('kbd');
      await expect(kbdElements).toHaveCount(2); // "G" and "T"
      await expect(kbdElements.first()).toContainText('G');
      await expect(kbdElements.last()).toContainText('T');
    });
  });

  test.describe('Theme Support', () => {
    test('sidebar uses CSS variables for theming', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Sidebar should use CSS variables
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toHaveClass(/bg-\[var\(--color-sidebar-bg\)\]/);
      await expect(sidebar).toHaveClass(/border-\[var\(--color-sidebar-border\)\]/);
    });

    test('command palette uses CSS variables for theming', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      await page.keyboard.press('Meta+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();

      // Backdrop should use overlay color
      const backdrop = page.getByTestId('command-palette-backdrop');
      await expect(backdrop).toHaveClass(/bg-\[var\(--color-bg-overlay\)\]/);
    });
  });

  test.describe('Keyboard Hint in Sidebar', () => {
    test('sidebar footer shows command palette shortcut hint', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Should show ⌘K hint at bottom of sidebar
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar.getByText('⌘K')).toBeVisible();
      await expect(sidebar.getByText('for commands')).toBeVisible();
    });

    test('keyboard hint is hidden when sidebar is collapsed', async ({ page }) => {
      await page.goto('/dashboard');

      // Collapse sidebar
      await page.getByTestId('sidebar-toggle').click();
      await expect(page.getByTestId('sidebar')).toHaveClass(/w-16/);

      // Keyboard hint should not be visible
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar.getByText('for commands')).not.toBeVisible();
    });
  });

  test.describe('Logo Styling', () => {
    test('sidebar shows styled logo with gradient', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Logo should have gradient styling
      const sidebar = page.getByTestId('sidebar');
      const logoContainer = sidebar.locator('.bg-gradient-to-br').first();
      await expect(logoContainer).toBeVisible();
      await expect(logoContainer).toContainText('E');
    });

    test('collapsed sidebar shows smaller logo', async ({ page }) => {
      await page.goto('/dashboard');

      // Collapse sidebar
      await page.getByTestId('sidebar-toggle').click();
      await expect(page.getByTestId('sidebar')).toHaveClass(/w-16/);

      // Logo should still be visible
      const sidebar = page.getByTestId('sidebar');
      const logoContainer = sidebar.locator('.bg-gradient-to-br').first();
      await expect(logoContainer).toBeVisible();
    });
  });
});
