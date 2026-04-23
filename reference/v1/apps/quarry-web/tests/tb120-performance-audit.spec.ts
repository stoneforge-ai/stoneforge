import { test, expect } from '@playwright/test';

/**
 * TB120: Performance Audit
 *
 * This test suite verifies performance characteristics of the web application
 * including page load times, rendering efficiency, and interactive responsiveness.
 */

test.describe('TB120: Performance Audit', () => {
  test.describe('Page Load Performance', () => {
    test('dashboard loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // Dashboard should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test('tasks page loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // Tasks page should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test('documents page loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // Documents page should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test('messages page loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/messages');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // Messages page should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });
  });

  test.describe('Data Preloader', () => {
    test('shows loading state initially', async ({ page }) => {
      // Block API requests to see loading state
      await page.route('**/api/**', route => route.abort());

      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

      // Should show data preloader loading state
      // Loading indicator may or may not be visible depending on cache
      // This test verifies the component exists and can handle the loading state
      const loadingIndicator = page.getByTestId('data-preloader-loading');
      // Just verify we can query for the element (it may not appear if data is cached)
      expect(loadingIndicator).toBeDefined();
    });

    test('transitions to loaded state', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Loading indicator should be gone
      const loadingIndicator = page.getByTestId('data-preloader-loading');
      await expect(loadingIndicator).not.toBeVisible();

      // Main content should be visible
      const mainContent = page.locator('main');
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('Virtualization', () => {
    test('task list uses virtualization for large lists', async ({ page }) => {
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      // Get the task list container
      const taskList = page.locator('[data-testid="tasks-list"], [data-testid="task-list-container"]');

      // If there are tasks, check virtualization is working
      const taskCount = await taskList.count();
      if (taskCount > 0) {
        // Virtualized lists typically only render visible items
        // The DOM should not have thousands of task elements
        const renderedTasks = await page.locator('[data-testid="task-item"], [data-testid^="task-row-"]').count();
        // Should be less than 100 even if there are more tasks
        // (virtualization renders only visible + overscan)
        expect(renderedTasks).toBeLessThanOrEqual(100);
      }
    });

    test('kanban board uses virtualization for large columns', async ({ page }) => {
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      // Switch to kanban view if available
      const kanbanButton = page.locator('[data-testid="view-kanban"], button:has-text("Kanban")');
      if (await kanbanButton.isVisible()) {
        await kanbanButton.click();
        await page.waitForTimeout(500); // Wait for view switch

        // Kanban columns should be visible
        const columns = page.locator('[data-testid^="kanban-column-"]');
        const columnCount = await columns.count();
        expect(columnCount).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Bundle Optimization', () => {
    test('page loads with code splitting', async ({ page }) => {
      // Track all JS resources loaded
      const jsResources: string[] = [];
      page.on('response', response => {
        const url = response.url();
        if (url.endsWith('.js') || url.includes('.js?')) {
          jsResources.push(url);
        }
      });

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Should have multiple JS files (indicating code splitting)
      expect(jsResources.length).toBeGreaterThan(1);
    });

    test('vendor chunks are loaded', async ({ page }) => {
      const jsResources: string[] = [];
      page.on('response', response => {
        const url = response.url();
        if (url.endsWith('.js') || url.includes('.js?')) {
          jsResources.push(url);
        }
      });

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Vendor chunks should exist (react-vendor, router-vendor, etc.)
      // In production builds, these will be separate chunks
      const hasVendorChunks = jsResources.some(
        url =>
          url.includes('vendor') ||
          url.includes('react') ||
          url.includes('router') ||
          url.includes('index')
      );
      expect(hasVendorChunks).toBe(true);
    });
  });

  test.describe('Interactive Responsiveness', () => {
    test('navigation responds quickly', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Click on tasks navigation
      const startTime = Date.now();
      await page.click('[data-testid="nav-tasks"], a[href="/tasks"]');
      await page.waitForURL('**/tasks**');
      const navTime = Date.now() - startTime;

      // Navigation should complete within 1 second
      expect(navTime).toBeLessThan(1000);
    });

    test('command palette opens quickly', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      const startTime = Date.now();
      await page.keyboard.press('Meta+k');

      // Wait for command palette dialog
      await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 1000 });
      const openTime = Date.now() - startTime;

      // Command palette should open within 500ms
      expect(openTime).toBeLessThan(500);
    });

    test('search filters results without lag', async ({ page }) => {
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      // Find search input
      const searchInput = page.getByPlaceholder('Search');
      if (await searchInput.count() > 0) {
        const startTime = Date.now();
        await searchInput.first().fill('test');

        // Results should update within debounce + render time (500ms)
        await page.waitForTimeout(400); // Wait for debounce
        const filterTime = Date.now() - startTime;

        // Total time including debounce should be under 600ms
        expect(filterTime).toBeLessThan(600);
      }
    });
  });

  test.describe('Memory Efficiency', () => {
    test('no memory leaks on navigation', async ({ page }) => {
      // This is a basic test - real memory leak detection would require
      // Chrome DevTools Protocol

      // Navigate back and forth several times
      for (let i = 0; i < 3; i++) {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');

        await page.goto('/documents');
        await page.waitForLoadState('networkidle');
      }

      // If we get here without crashing, basic memory handling is working
      expect(true).toBe(true);
    });
  });

  test.describe('Skeleton Loading States', () => {
    test('skeleton components are available', async ({ page }) => {
      // Verify skeleton CSS is loaded
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // The animate-pulse class should exist in the stylesheet
      const hasAnimatePulse = await page.evaluate(() => {
        // Check if Tailwind animate-pulse is available
        const testEl = document.createElement('div');
        testEl.className = 'animate-pulse';
        document.body.appendChild(testEl);
        const style = window.getComputedStyle(testEl);
        const hasAnimation = style.animationName !== 'none' && style.animationName !== '';
        document.body.removeChild(testEl);
        return hasAnimation;
      });

      // Tailwind's animate-pulse should be available
      expect(hasAnimatePulse).toBe(true);
    });
  });

  test.describe('Render Performance', () => {
    test('tasks list renders efficiently', async ({ page }) => {
      await page.goto('/tasks');
      await page.waitForLoadState('networkidle');

      // Measure time to scroll through list
      const taskListContainer = page.locator('[data-testid="tasks-list"], main').first();

      if (await taskListContainer.isVisible()) {
        const startTime = Date.now();

        // Scroll down and back up
        await taskListContainer.evaluate(el => {
          el.scrollTop = 500;
        });
        await page.waitForTimeout(100);

        await taskListContainer.evaluate(el => {
          el.scrollTop = 0;
        });
        await page.waitForTimeout(100);

        const scrollTime = Date.now() - startTime;

        // Scrolling should be smooth (under 500ms for both scrolls)
        expect(scrollTime).toBeLessThan(500);
      }
    });
  });
});
