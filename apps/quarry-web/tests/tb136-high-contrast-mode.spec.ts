/**
 * TB136: High Contrast Mode Support
 *
 * Tests for the high contrast theme option in Settings.
 * Verifies WCAG AAA compliance with enhanced color contrast.
 */

import { test, expect } from '@playwright/test';

test.describe('TB136: High Contrast Mode Support', () => {
  test.beforeEach(async ({ page }) => {
    // Go to page first to clear localStorage (only once at start)
    await page.goto('/settings');
    await page.evaluate(() => localStorage.clear());
  });

  test('high contrast theme option is visible in settings', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Verify all theme options are visible
    await expect(page.getByTestId('theme-option-light')).toBeVisible();
    await expect(page.getByTestId('theme-option-dark')).toBeVisible();
    await expect(page.getByTestId('theme-option-high-contrast')).toBeVisible();
    await expect(page.getByTestId('theme-option-system')).toBeVisible();

    // Verify high contrast option has correct label
    const highContrastOption = page.getByTestId('theme-option-high-contrast');
    await expect(highContrastOption).toContainText('High Contrast');
    await expect(highContrastOption).toContainText('WCAG AAA');
  });

  test('can select high contrast theme', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Click high contrast option
    await page.getByTestId('theme-option-high-contrast').click();

    // Verify it's selected (shows Active badge)
    await expect(page.getByTestId('theme-option-high-contrast')).toContainText('Active');

    // Verify high-contrast class is applied to html element
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('high-contrast');
  });

  test('high contrast theme persists after page refresh', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Select high contrast
    await page.getByTestId('theme-option-high-contrast').click();
    await expect(page.getByTestId('theme-option-high-contrast')).toContainText('Active');

    // Refresh page
    await page.reload();
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Verify high contrast is still selected
    await expect(page.getByTestId('theme-option-high-contrast')).toContainText('Active');

    // Verify class is still applied
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('high-contrast');
  });

  test('high contrast base selection appears when high contrast is selected', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Base selection should not be visible initially
    await expect(page.getByTestId('high-contrast-base-section')).not.toBeVisible();

    // Select high contrast
    await page.getByTestId('theme-option-high-contrast').click();

    // Base selection should now be visible
    await expect(page.getByTestId('high-contrast-base-section')).toBeVisible();
    await expect(page.getByTestId('high-contrast-base-light')).toBeVisible();
    await expect(page.getByTestId('high-contrast-base-dark')).toBeVisible();
  });

  test('can toggle high contrast base between light and dark', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Select high contrast
    await page.getByTestId('theme-option-high-contrast').click();
    await expect(page.getByTestId('high-contrast-base-section')).toBeVisible();

    // Light base should be default (verify it's styled as selected)
    const lightBase = page.getByTestId('high-contrast-base-light');
    await expect(lightBase).toHaveClass(/border-blue-500/);

    // Verify html has high-contrast and theme-light but not dark
    let htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('high-contrast');
    expect(htmlClass).toContain('theme-light');
    expect(htmlClass).not.toContain('theme-dark');

    // Click dark base
    await page.getByTestId('high-contrast-base-dark').click();

    // Verify dark base is now selected
    const darkBase = page.getByTestId('high-contrast-base-dark');
    await expect(darkBase).toHaveClass(/border-blue-500/);

    // Verify html now has dark classes
    htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('high-contrast');
    expect(htmlClass).toContain('dark');
    expect(htmlClass).toContain('theme-dark');
  });

  test('high contrast base persists after page refresh', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Select high contrast
    await page.getByTestId('theme-option-high-contrast').click();

    // Switch to dark base
    await page.getByTestId('high-contrast-base-dark').click();

    // Refresh page
    await page.reload();
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Verify high contrast dark is still applied
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('high-contrast');
    expect(htmlClass).toContain('dark');
  });

  test('preview updates correctly for high contrast light base', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Select high contrast
    await page.getByTestId('theme-option-high-contrast').click();

    // Ensure light base is selected (default)
    await page.getByTestId('high-contrast-base-light').click();

    // Check preview styling - should have white background and black border
    const preview = page.getByTestId('theme-preview');
    await expect(preview).toHaveClass(/bg-white/);
    await expect(preview).toHaveClass(/border-black/);
  });

  test('preview updates correctly for high contrast dark base', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Select high contrast
    await page.getByTestId('theme-option-high-contrast').click();

    // Switch to dark base
    await page.getByTestId('high-contrast-base-dark').click();

    // Check preview styling - should have black background and white border
    const preview = page.getByTestId('theme-preview');
    await expect(preview).toHaveClass(/bg-black/);
    await expect(preview).toHaveClass(/border-white/);
  });

  test('can switch from high contrast back to other themes', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Select high contrast
    await page.getByTestId('theme-option-high-contrast').click();
    let htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('high-contrast');

    // Switch to light
    await page.getByTestId('theme-option-light').click();
    htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).not.toContain('high-contrast');
    expect(htmlClass).toContain('theme-light');

    // Switch to dark
    await page.getByTestId('theme-option-dark').click();
    htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).not.toContain('high-contrast');
    expect(htmlClass).toContain('dark');

    // Switch back to high contrast
    await page.getByTestId('theme-option-high-contrast').click();
    htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('high-contrast');
  });

  test('high contrast mode applies across all pages', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Select high contrast
    await page.getByTestId('theme-option-high-contrast').click();

    // Navigate to different pages and verify high-contrast class is still applied
    const pagesToTest = ['/dashboard', '/tasks', '/plans', '/messages', '/documents', '/entities', '/teams'];

    for (const pagePath of pagesToTest) {
      await page.goto(pagePath);
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain('high-contrast');
    }
  });

  test('high contrast CSS tokens are applied', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Select high contrast with light base
    await page.getByTestId('theme-option-high-contrast').click();
    await page.getByTestId('high-contrast-base-light').click();

    // Check that high contrast CSS variables are applied
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
    });
    expect(bgColor).toBe('#ffffff');

    const textColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim();
    });
    expect(textColor).toBe('#000000');

    const borderColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim();
    });
    expect(borderColor).toBe('#000000');
  });

  test('high contrast dark CSS tokens are applied', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Select high contrast with dark base
    await page.getByTestId('theme-option-high-contrast').click();
    await page.getByTestId('high-contrast-base-dark').click();

    // Check that high contrast dark CSS variables are applied
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
    });
    expect(bgColor).toBe('#000000');

    const textColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim();
    });
    expect(textColor).toBe('#ffffff');

    const borderColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim();
    });
    expect(borderColor).toBe('#ffffff');
  });

  test('base section hides when switching away from high contrast', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-theme-section"]');

    // Select high contrast
    await page.getByTestId('theme-option-high-contrast').click();
    await expect(page.getByTestId('high-contrast-base-section')).toBeVisible();

    // Switch to light
    await page.getByTestId('theme-option-light').click();
    await expect(page.getByTestId('high-contrast-base-section')).not.toBeVisible();

    // Switch to dark
    await page.getByTestId('theme-option-dark').click();
    await expect(page.getByTestId('high-contrast-base-section')).not.toBeVisible();

    // Switch to system
    await page.getByTestId('theme-option-system').click();
    await expect(page.getByTestId('high-contrast-base-section')).not.toBeVisible();
  });
});
