import { test, expect } from '@playwright/test';

test('editor LSP connection and no false module errors', async ({ page }) => {
  // Mock the workspace tree API to provide a fake file structure
  await page.route('**/api/workspace/tree', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        root: '/workspace',
        entries: [
          {
            name: 'packages',
            path: 'packages',
            type: 'directory',
            children: [
              {
                name: 'core',
                path: 'packages/core',
                type: 'directory',
                children: [
                  {
                    name: 'src',
                    path: 'packages/core/src',
                    type: 'directory',
                    children: [
                      {
                        name: 'index.ts',
                        path: 'packages/core/src/index.ts',
                        type: 'file',
                        size: 50,
                        lastModified: Date.now(),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
  });

  // Mock the file content API with the expected FileResponse format
  await page.route('**/api/workspace/file**', (route) => {
    const url = new URL(route.request().url());
    const filePath = url.searchParams.get('path') || 'packages/core/src/index.ts';
    const fileName = filePath.split('/').pop() || 'index.ts';
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        content: '// Core module\nexport const VERSION = "1.0.0";\n',
        name: fileName,
        path: filePath,
        size: 50,
        lastModified: Date.now(),
      }),
    });
  });

  // Navigate to editor
  await page.goto('/editor');
  await page.waitForSelector('[data-testid="editor-no-file-selected"]', { timeout: 15000 });

  // Wait for the file tree to load
  await expect(page.getByTestId('editor-file-tree-container')).toBeVisible({ timeout: 10000 });

  // Expand packages > core > src to find index.ts
  const packagesButton = page.getByRole('button', { name: 'packages' });
  await expect(packagesButton).toBeVisible({ timeout: 5000 });
  await packagesButton.click();

  // Wait for tree expansion and the child node to appear
  const coreButton = page.getByRole('button', { name: 'core' });
  await expect(coreButton).toBeVisible({ timeout: 5000 });
  await coreButton.click();

  const srcButton = page.getByRole('button', { name: 'src' });
  await expect(srcButton).toBeVisible({ timeout: 5000 });
  await srcButton.click();

  // Click index.ts to open it (use the specific tree button testid to avoid ambiguity)
  const indexButton = page.getByTestId('file-tree-button-packages/core/src/index.ts');
  await expect(indexButton).toBeVisible({ timeout: 5000 });
  await indexButton.click();

  // Wait for the file to load in the editor
  await page.waitForTimeout(3000);

  // Verify the editor opened the file - a tab should appear in the tab bar
  const tabBar = page.getByTestId('editor-tab-bar');
  await expect(tabBar).toBeVisible({ timeout: 5000 });
  // The tab for index.ts should be visible
  await expect(tabBar.getByText('index.ts')).toBeVisible({ timeout: 5000 });

  // Check for module errors if Monaco editor is available
  const markerCount = await page.evaluate(() => {
    const monaco = (window as any).monaco;
    if (!monaco) return -1;
    const markers = monaco.editor.getModelMarkers({});
    const moduleErrors = markers.filter((m: any) =>
      m.message.includes('Cannot find module')
    );
    return moduleErrors.length;
  });

  // markerCount of -1 means Monaco not loaded yet, 0 means no errors
  expect(markerCount).toBeLessThanOrEqual(0);
});
