import { test, expect } from '@playwright/test';
import { initCheckpoints } from '../test-utils/checkpoint';

test('editor LSP connection and no false module errors', async ({ page }) => {
  const capture = initCheckpoints('lsp-editor');

  // Navigate to editor
  await page.goto('/editor');
  await page.waitForSelector('[data-testid="editor-no-file-selected"]', { timeout: 15000 });
  await capture(page, 'Editor page loaded');

  // Expand packages > core > src to find index.ts
  await page.getByRole('button', { name: 'packages' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'core' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'src' }).click();
  await page.waitForTimeout(500);

  // Click index.ts to open it
  await page.getByRole('button', { name: 'index.ts' }).click();
  await page.waitForTimeout(2000);

  await capture(page, 'TypeScript file opened in editor - import lines should have no red squiggly underlines');

  // Wait for LSP to connect (up to 10 seconds)
  await page.waitForTimeout(5000);

  // Check LSP status indicator color via DOM
  const lspIndicatorColor = await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    const lspSpan = Array.from(spans).find(s => s.textContent === 'LSP');
    if (!lspSpan) return 'not-found';
    const parentClasses = lspSpan.parentElement?.className || '';
    if (parentClasses.includes('text-green')) return 'green';
    if (parentClasses.includes('text-red')) return 'red';
    if (parentClasses.includes('text-yellow')) return 'yellow';
    return parentClasses;
  });

  await capture(page, `LSP indicator is ${lspIndicatorColor} - should be green for connected`);

  // Verify no "Cannot find module" errors by checking Monaco markers
  const markerCount = await page.evaluate(() => {
    // @ts-ignore - Monaco is available globally via the direct Monaco API
    const monaco = (window as any).monaco;
    if (!monaco) return -1;
    const markers = monaco.editor.getModelMarkers({});
    const moduleErrors = markers.filter((m: any) =>
      m.message.includes('Cannot find module')
    );
    return moduleErrors.length;
  });

  await capture(page, `Cannot find module error count: ${markerCount} - should be 0`);

  // Assert both conditions
  expect(lspIndicatorColor).toBe('green');
  expect(markerCount).toBe(0);
});
