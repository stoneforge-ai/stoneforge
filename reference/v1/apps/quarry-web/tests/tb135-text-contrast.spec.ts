import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * TB135: Audit and Fix Text Contrast Issues
 *
 * This test suite verifies that all pages meet WCAG 2.1 AA color contrast
 * requirements (4.5:1 for normal text, 3:1 for large text).
 */

test.describe('TB135: Text Contrast Accessibility', () => {
  // All pages to audit
  const pages = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Task Flow', path: '/dashboard/task-flow' },
    { name: 'Dependencies', path: '/dependencies' },
    { name: 'Timeline', path: '/dashboard/timeline' },
    { name: 'Tasks', path: '/tasks' },
    { name: 'Plans', path: '/plans' },
    { name: 'Workflows', path: '/workflows' },
    { name: 'Messages', path: '/messages' },
    { name: 'Documents', path: '/documents' },
    { name: 'Entities', path: '/entities' },
    { name: 'Teams', path: '/teams' },
    { name: 'Settings', path: '/settings' },
  ];

  test.describe('Light Mode', () => {
    for (const pageInfo of pages) {
      test(`${pageInfo.name} page has sufficient text contrast`, async ({ page }) => {
        await page.goto(pageInfo.path);
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2aa'])
          .analyze();

        const contrastViolations = results.violations.filter(v =>
          v.id === 'color-contrast'
        );

        if (contrastViolations.length > 0) {
          console.log(`\nContrast violations on ${pageInfo.name}:`);
          contrastViolations.forEach(v => {
            v.nodes.forEach((node: any) => {
              console.log(`  - ${node.failureSummary}`);
              console.log(`    Target: ${node.target.join(' ')}`);
            });
          });
        }

        expect(contrastViolations.length).toBe(0);
      });
    }
  });

  test.describe('Dark Mode', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('stoneforge-theme', 'dark');
      });
    });

    for (const pageInfo of pages) {
      test(`${pageInfo.name} page has sufficient text contrast in dark mode`, async ({ page }) => {
        await page.goto(pageInfo.path);
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2aa'])
          .analyze();

        const contrastViolations = results.violations.filter(v =>
          v.id === 'color-contrast'
        );

        if (contrastViolations.length > 0) {
          console.log(`\nContrast violations on ${pageInfo.name} (dark mode):`);
          contrastViolations.forEach(v => {
            v.nodes.forEach((node: any) => {
              console.log(`  - ${node.failureSummary}`);
              console.log(`    Target: ${node.target.join(' ')}`);
            });
          });
        }

        expect(contrastViolations.length).toBe(0);
      });
    }
  });

  test.describe('Specific UI Elements', () => {
    test('muted text uses accessible gray-500 in light mode', async ({ page }) => {
      await page.goto('/teams');
      await page.waitForLoadState('networkidle');

      // Check that "Created" timestamps use gray-500 class for light mode
      // The pattern should be "text-gray-500 dark:text-gray-400"
      // where gray-500 is used for light mode (passes WCAG on white bg)
      // and gray-400 is used for dark mode (passes WCAG on dark bg)
      const timestampElements = page.locator('[data-testid^="team-card-"] .text-xs');
      const count = await timestampElements.count();

      for (let i = 0; i < count; i++) {
        const className = await timestampElements.nth(i).getAttribute('class');
        // Should use text-gray-500 (for light mode), not just text-gray-400
        // The pattern "text-gray-500 dark:text-gray-400" is correct
        if (className?.includes('text-gray-400') && !className?.includes('dark:text-gray-400')) {
          // If gray-400 is used without the dark: prefix, that's a problem
          expect(className).toContain('text-gray-500');
        }
      }
    });

    test('primary buttons use bg-blue-600 for WCAG compliance', async ({ page }) => {
      await page.goto('/plans');
      await page.waitForLoadState('networkidle');

      // Check create plan button
      const createBtn = page.getByTestId('create-plan-btn');
      const className = await createBtn.getAttribute('class');

      // Should use bg-blue-600 or darker, not bg-blue-500
      expect(className).toContain('bg-blue-600');
    });

    test('avatar colors use 700 variants for white text contrast', async ({ page }) => {
      await page.goto('/dashboard/timeline');
      await page.waitForLoadState('networkidle');

      // Wait for events to load
      await page.waitForSelector('[data-testid="actor-avatar"]', { timeout: 5000 }).catch(() => {});

      // Check avatar elements don't use 500 or 600 variants
      const avatars = page.locator('[data-testid="actor-avatar"]');
      const count = await avatars.count();

      if (count > 0) {
        for (let i = 0; i < Math.min(count, 5); i++) {
          const className = await avatars.nth(i).getAttribute('class');
          // Should not use bg-*-500 or bg-*-600 for avatars with white text
          expect(className).not.toMatch(/bg-(green|orange|pink|cyan|teal)-[56]00/);
        }
      }
    });
  });
});
