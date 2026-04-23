import { test, expect } from '@playwright/test';

test.describe('TB71: Design Tokens Foundation', () => {
  test('design tokens are loaded in the stylesheet', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Verify tokens are applied by checking they exist in the page stylesheets
    const hasTokens = await page.evaluate(() => {
      // Get all stylesheets
      const stylesheets = Array.from(document.styleSheets);

      for (const sheet of stylesheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
              const text = rule.cssText;
              // Check for key tokens
              if (text.includes('--color-primary-500')) {
                return true;
              }
            }
          }
        } catch (e) {
          // Cross-origin stylesheets will throw
          continue;
        }
      }
      return false;
    });

    expect(hasTokens).toBe(true);
  });

  test('primary color tokens are applied correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Create a test element that uses the token and check computed style
    const bgColor = await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.backgroundColor = 'var(--color-primary-500)';
      document.body.appendChild(el);
      const color = getComputedStyle(el).backgroundColor;
      document.body.removeChild(el);
      return color;
    });

    // #3b82f6 converts to rgb(59, 130, 246)
    expect(bgColor).toBe('rgb(59, 130, 246)');
  });

  test('semantic color tokens adapt to light mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Test background color token
    const bgColor = await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.backgroundColor = 'var(--color-bg)';
      document.body.appendChild(el);
      const color = getComputedStyle(el).backgroundColor;
      document.body.removeChild(el);
      return color;
    });

    // #ffffff converts to rgb(255, 255, 255)
    expect(bgColor).toBe('rgb(255, 255, 255)');

    // Test text color token
    const textColor = await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.color = 'var(--color-text)';
      document.body.appendChild(el);
      const color = getComputedStyle(el).color;
      document.body.removeChild(el);
      return color;
    });

    // #111827 converts to rgb(17, 24, 39)
    expect(textColor).toBe('rgb(17, 24, 39)');
  });

  test('color scale tokens are complete (all shades available)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Check that color scale tokens work by testing a few key shades
    const colorChecks = [
      { token: '--color-primary-50', expected: 'rgb(239, 246, 255)' },
      { token: '--color-primary-500', expected: 'rgb(59, 130, 246)' },
      { token: '--color-primary-900', expected: 'rgb(30, 58, 138)' },
      { token: '--color-success-500', expected: 'rgb(34, 197, 94)' },
      { token: '--color-warning-500', expected: 'rgb(245, 158, 11)' },
      { token: '--color-error-500', expected: 'rgb(239, 68, 68)' },
    ];

    for (const { token, expected } of colorChecks) {
      const color = await page.evaluate((tokenName) => {
        const el = document.createElement('div');
        el.style.backgroundColor = `var(${tokenName})`;
        document.body.appendChild(el);
        const color = getComputedStyle(el).backgroundColor;
        document.body.removeChild(el);
        return color;
      }, token);

      expect(color, `${token} should be ${expected}`).toBe(expected);
    }
  });

  test('spacing tokens follow 4px grid', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Test spacing tokens
    const spacingChecks = [
      { token: '--spacing-1', expected: '4px' },     // 0.25rem = 4px
      { token: '--spacing-2', expected: '8px' },     // 0.5rem = 8px
      { token: '--spacing-4', expected: '16px' },    // 1rem = 16px
      { token: '--spacing-8', expected: '32px' },    // 2rem = 32px
    ];

    for (const { token, expected } of spacingChecks) {
      const spacing = await page.evaluate((tokenName) => {
        const el = document.createElement('div');
        el.style.padding = `var(${tokenName})`;
        document.body.appendChild(el);
        const pad = getComputedStyle(el).padding;
        document.body.removeChild(el);
        return pad;
      }, token);

      expect(spacing, `${token} should be ${expected}`).toBe(expected);
    }
  });

  test('border radius tokens are defined correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    const radiusChecks = [
      { token: '--radius-sm', expected: '2px' },      // 0.125rem
      { token: '--radius-lg', expected: '8px' },      // 0.5rem
      { token: '--radius-full', expected: '9999px' },
    ];

    for (const { token, expected } of radiusChecks) {
      const radius = await page.evaluate((tokenName) => {
        const el = document.createElement('div');
        el.style.borderRadius = `var(${tokenName})`;
        document.body.appendChild(el);
        const r = getComputedStyle(el).borderRadius;
        document.body.removeChild(el);
        return r;
      }, token);

      expect(radius, `${token} should be ${expected}`).toBe(expected);
    }
  });

  test('typography tokens are working', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Test font size tokens
    const fontSizeChecks = [
      { token: '--font-size-sm', expected: '14px' },   // 0.875rem
      { token: '--font-size-base', expected: '16px' }, // 1rem
      { token: '--font-size-lg', expected: '18px' },   // 1.125rem
    ];

    for (const { token, expected } of fontSizeChecks) {
      const size = await page.evaluate((tokenName) => {
        const el = document.createElement('div');
        el.style.fontSize = `var(${tokenName})`;
        document.body.appendChild(el);
        const s = getComputedStyle(el).fontSize;
        document.body.removeChild(el);
        return s;
      }, token);

      expect(size, `${token} should be ${expected}`).toBe(expected);
    }

    // Test font family token
    const fontFamily = await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.fontFamily = 'var(--font-family-sans)';
      document.body.appendChild(el);
      const f = getComputedStyle(el).fontFamily;
      document.body.removeChild(el);
      return f;
    });

    expect(fontFamily).toContain('system-ui');
  });

  test('shadow tokens are defined', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Test that shadow tokens work
    const shadowTokens = ['--shadow-sm', '--shadow-md', '--shadow-lg'];

    for (const token of shadowTokens) {
      const shadow = await page.evaluate((tokenName) => {
        const el = document.createElement('div');
        el.style.boxShadow = `var(${tokenName})`;
        document.body.appendChild(el);
        const s = getComputedStyle(el).boxShadow;
        document.body.removeChild(el);
        return s;
      }, token);

      expect(shadow, `${token} should have a shadow value`).not.toBe('none');
      expect(shadow, `${token} should contain rgb`).toContain('rgb');
    }
  });

  test('transition tokens are working', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Test transition duration tokens
    const durationChecks = [
      { token: '--duration-fast', expected: '100ms' },
      { token: '--duration-normal', expected: '200ms' },
      { token: '--duration-slow', expected: '300ms' },
    ];

    for (const { token, expected } of durationChecks) {
      // Create element with animation duration from token
      const duration = await page.evaluate((tokenName) => {
        const el = document.createElement('div');
        el.style.animationDuration = `var(${tokenName})`;
        document.body.appendChild(el);
        const d = getComputedStyle(el).animationDuration;
        document.body.removeChild(el);
        return d;
      }, token);

      // Convert expected ms to seconds format (100ms -> 0.1s)
      const expectedSeconds = parseFloat(expected) / 1000 + 's';
      expect(duration, `${token} should be ${expectedSeconds}`).toBe(expectedSeconds);
    }
  });

  test('z-index tokens are defined', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    const zIndexChecks = [
      { token: '--z-index-dropdown', expected: '1000' },
      { token: '--z-index-modal', expected: '1050' },
      { token: '--z-index-tooltip', expected: '1070' },
    ];

    for (const { token, expected } of zIndexChecks) {
      const zIndex = await page.evaluate((tokenName) => {
        const el = document.createElement('div');
        el.style.zIndex = `var(${tokenName})`;
        document.body.appendChild(el);
        const z = getComputedStyle(el).zIndex;
        document.body.removeChild(el);
        return z;
      }, token);

      expect(zIndex, `${token} should be ${expected}`).toBe(expected);
    }
  });

  test('body applies theme colors from tokens', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Check that body uses the theme background color
    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );

    // In light mode, background should be white or near-white
    expect(bgColor).toMatch(/rgba?\(255,?\s*255,?\s*255/);
  });

  test('can override primary color via CSS injection', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Inject a style that changes the primary color
    await page.addStyleTag({
      content: `:root { --color-primary-500: #10b981 !important; }`
    });

    // Verify the primary color was changed
    const bgColor = await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.backgroundColor = 'var(--color-primary-500)';
      document.body.appendChild(el);
      const color = getComputedStyle(el).backgroundColor;
      document.body.removeChild(el);
      return color;
    });

    // #10b981 converts to rgb(16, 185, 129)
    expect(bgColor).toBe('rgb(16, 185, 129)');
  });
});
