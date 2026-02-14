import { test, expect } from '@playwright/test';

/**
 * Tests for the IndexedDB extension storage layer.
 *
 * These tests run in the browser context using page.evaluate() to exercise
 * the storage API directly. IndexedDB operations are inherently asynchronous
 * and browser-specific, so E2E testing is appropriate here.
 */
test.describe('IndexedDB Extension Storage', () => {
  // Setup: Clear storage before each test to ensure isolation
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Initialize storage and clear any existing data
    await page.evaluate(async () => {
      const storage = await import('../src/lib/openvsx/storage');
      await storage.initExtensionStorage();
      await storage.clearAllExtensions();
    });
  });

  // Cleanup: Close storage after each test
  test.afterEach(async ({ page }) => {
    await page.evaluate(async () => {
      const storage = await import('../src/lib/openvsx/storage');
      storage.closeStorage();
    });
  });

  test.describe('Initialization', () => {
    test('initializes storage successfully', async ({ page }) => {
      const isAvailable = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();
        return storage.isStorageAvailable();
      });

      expect(isAvailable).toBe(true);
    });

    test('multiple init calls are idempotent', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();
        await storage.initExtensionStorage();
        await storage.initExtensionStorage();
        return storage.isStorageAvailable();
      });

      expect(result).toBe(true);
    });
  });

  test.describe('Extension CRUD operations', () => {
    test('can save and retrieve an extension', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'one-dark-pro',
          publisher: 'zhuangtongfa',
          version: '1.0.0',
          displayName: 'One Dark Pro',
          description: 'A dark theme',
          contributes: {
            themes: [
              {
                label: 'One Dark Pro',
                uiTheme: 'vs-dark',
                path: './themes/OneDark-Pro.json',
              },
            ],
          },
        };

        const files = new Map<string, Uint8Array>();
        files.set('themes/OneDark-Pro.json', new TextEncoder().encode('{"colors":{}}'));

        await storage.saveExtension('zhuangtongfa.one-dark-pro', manifest, files);

        const retrieved = await storage.getExtension('zhuangtongfa.one-dark-pro');
        return {
          found: retrieved !== null,
          id: retrieved?.id,
          name: retrieved?.manifest.name,
          version: retrieved?.version,
          hasInstalledAt: typeof retrieved?.installedAt === 'number',
        };
      });

      expect(result.found).toBe(true);
      expect(result.id).toBe('zhuangtongfa.one-dark-pro');
      expect(result.name).toBe('one-dark-pro');
      expect(result.version).toBe('1.0.0');
      expect(result.hasInstalledAt).toBe(true);
    });

    test('can save multiple extensions', async ({ page }) => {
      const count = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const extensions = [
          { id: 'publisher1.ext1', name: 'ext1', version: '1.0.0' },
          { id: 'publisher2.ext2', name: 'ext2', version: '2.0.0' },
          { id: 'publisher3.ext3', name: 'ext3', version: '3.0.0' },
        ];

        for (const ext of extensions) {
          const manifest = {
            name: ext.name,
            publisher: ext.id.split('.')[0],
            version: ext.version,
          };
          await storage.saveExtension(ext.id, manifest, new Map());
        }

        const all = await storage.getInstalledExtensions();
        return all.length;
      });

      expect(count).toBe(3);
    });

    test('getInstalledExtensions returns extensions sorted by install date (newest first)', async ({ page }) => {
      const order = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        // Save with delays to ensure different timestamps
        const extensions = ['first', 'second', 'third'];
        for (const name of extensions) {
          const manifest = {
            name,
            publisher: 'test',
            version: '1.0.0',
          };
          await storage.saveExtension(`test.${name}`, manifest, new Map());
          // Small delay to ensure different timestamps
          await new Promise((r) => setTimeout(r, 10));
        }

        const all = await storage.getInstalledExtensions();
        return all.map((e) => e.manifest.name);
      });

      // Newest (third) should be first
      expect(order).toEqual(['third', 'second', 'first']);
    });

    test('can remove an extension', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'to-delete',
          publisher: 'test',
          version: '1.0.0',
        };

        await storage.saveExtension('test.to-delete', manifest, new Map());

        // Verify it exists
        const before = await storage.getExtension('test.to-delete');
        if (!before) return { existedBefore: false };

        // Remove it
        await storage.removeExtension('test.to-delete');

        // Verify it's gone
        const after = await storage.getExtension('test.to-delete');
        return {
          existedBefore: true,
          existsAfter: after !== null,
        };
      });

      expect(result.existedBefore).toBe(true);
      expect(result.existsAfter).toBe(false);
    });

    test('getExtension returns null for non-existent extension', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();
        return await storage.getExtension('nonexistent.extension');
      });

      expect(result).toBeNull();
    });

    test('removing non-existent extension does not throw', async ({ page }) => {
      const succeeded = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();
        try {
          await storage.removeExtension('nonexistent.extension');
          return true;
        } catch {
          return false;
        }
      });

      expect(succeeded).toBe(true);
    });
  });

  test.describe('File operations', () => {
    test('can save and retrieve extension files', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'theme',
          publisher: 'test',
          version: '1.0.0',
        };

        const files = new Map<string, Uint8Array>();
        files.set('themes/dark.json', new TextEncoder().encode('{"name":"dark"}'));
        files.set('themes/light.json', new TextEncoder().encode('{"name":"light"}'));

        await storage.saveExtension('test.theme', manifest, files);

        const darkFile = await storage.getExtensionFile('test.theme', 'themes/dark.json');
        const lightFile = await storage.getExtensionFile('test.theme', 'themes/light.json');

        return {
          darkContent: darkFile ? new TextDecoder().decode(darkFile) : null,
          lightContent: lightFile ? new TextDecoder().decode(lightFile) : null,
        };
      });

      expect(result.darkContent).toBe('{"name":"dark"}');
      expect(result.lightContent).toBe('{"name":"light"}');
    });

    test('can retrieve all files for an extension', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'multi-file',
          publisher: 'test',
          version: '1.0.0',
        };

        const files = new Map<string, Uint8Array>();
        files.set('file1.json', new TextEncoder().encode('{"id":1}'));
        files.set('file2.json', new TextEncoder().encode('{"id":2}'));
        files.set('nested/file3.json', new TextEncoder().encode('{"id":3}'));

        await storage.saveExtension('test.multi-file', manifest, files);

        const allFiles = await storage.getExtensionFiles('test.multi-file');
        const paths = Array.from(allFiles.keys()).sort();
        const contents = paths.map((p) => {
          const content = allFiles.get(p);
          return content ? new TextDecoder().decode(content) : null;
        });

        return { paths, contents };
      });

      expect(result.paths).toEqual(['file1.json', 'file2.json', 'nested/file3.json']);
      expect(result.contents).toEqual(['{"id":1}', '{"id":2}', '{"id":3}']);
    });

    test('getExtensionFile returns null for non-existent file', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'test',
          publisher: 'test',
          version: '1.0.0',
        };
        await storage.saveExtension('test.test', manifest, new Map());

        return await storage.getExtensionFile('test.test', 'nonexistent.json');
      });

      expect(result).toBeNull();
    });

    test('getExtensionFiles returns empty map for extension with no files', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'no-files',
          publisher: 'test',
          version: '1.0.0',
        };
        await storage.saveExtension('test.no-files', manifest, new Map());

        const files = await storage.getExtensionFiles('test.no-files');
        return files.size;
      });

      expect(result).toBe(0);
    });

    test('files are removed when extension is removed', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'with-files',
          publisher: 'test',
          version: '1.0.0',
        };

        const files = new Map<string, Uint8Array>();
        files.set('data.json', new TextEncoder().encode('{}'));

        await storage.saveExtension('test.with-files', manifest, files);

        // Verify file exists
        const fileBefore = await storage.getExtensionFile('test.with-files', 'data.json');
        if (!fileBefore) return { fileExistedBefore: false };

        // Remove extension
        await storage.removeExtension('test.with-files');

        // Verify file is gone
        const fileAfter = await storage.getExtensionFile('test.with-files', 'data.json');
        return {
          fileExistedBefore: true,
          fileExistsAfter: fileAfter !== null,
        };
      });

      expect(result.fileExistedBefore).toBe(true);
      expect(result.fileExistsAfter).toBe(false);
    });
  });

  test.describe('Transactional behavior', () => {
    test('saveExtension is atomic - extension and files saved together', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'atomic',
          publisher: 'test',
          version: '1.0.0',
        };

        const files = new Map<string, Uint8Array>();
        files.set('theme.json', new TextEncoder().encode('{"colors":{}}'));

        await storage.saveExtension('test.atomic', manifest, files);

        // Both extension and files should be retrievable
        const ext = await storage.getExtension('test.atomic');
        const file = await storage.getExtensionFile('test.atomic', 'theme.json');

        return {
          hasExtension: ext !== null,
          hasFile: file !== null,
        };
      });

      expect(result.hasExtension).toBe(true);
      expect(result.hasFile).toBe(true);
    });

    test('removeExtension is atomic - extension and files removed together', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'to-remove',
          publisher: 'test',
          version: '1.0.0',
        };

        const files = new Map<string, Uint8Array>();
        files.set('file1.json', new TextEncoder().encode('{}'));
        files.set('file2.json', new TextEncoder().encode('{}'));

        await storage.saveExtension('test.to-remove', manifest, files);
        await storage.removeExtension('test.to-remove');

        // Both extension and all files should be gone
        const ext = await storage.getExtension('test.to-remove');
        const allFiles = await storage.getExtensionFiles('test.to-remove');

        return {
          extensionGone: ext === null,
          filesGone: allFiles.size === 0,
        };
      });

      expect(result.extensionGone).toBe(true);
      expect(result.filesGone).toBe(true);
    });
  });

  test.describe('Persistence', () => {
    test('data persists across page reloads', async ({ page }) => {
      // Save extension
      await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'persistent',
          publisher: 'test',
          version: '1.0.0',
        };

        const files = new Map<string, Uint8Array>();
        files.set('data.json', new TextEncoder().encode('{"persistent":true}'));

        await storage.saveExtension('test.persistent', manifest, files);
        storage.closeStorage();
      });

      // Reload page
      await page.reload();

      // Verify data persisted
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const ext = await storage.getExtension('test.persistent');
        const file = await storage.getExtensionFile('test.persistent', 'data.json');

        return {
          hasExtension: ext !== null,
          extensionName: ext?.manifest.name,
          fileContent: file ? new TextDecoder().decode(file) : null,
        };
      });

      expect(result.hasExtension).toBe(true);
      expect(result.extensionName).toBe('persistent');
      expect(result.fileContent).toBe('{"persistent":true}');
    });
  });

  test.describe('Utility functions', () => {
    test('clearAllExtensions removes all data', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        // Add multiple extensions
        for (let i = 0; i < 3; i++) {
          const manifest = {
            name: `ext${i}`,
            publisher: 'test',
            version: '1.0.0',
          };
          const files = new Map<string, Uint8Array>();
          files.set('file.json', new TextEncoder().encode('{}'));
          await storage.saveExtension(`test.ext${i}`, manifest, files);
        }

        const countBefore = (await storage.getInstalledExtensions()).length;

        await storage.clearAllExtensions();

        const countAfter = (await storage.getInstalledExtensions()).length;

        return { countBefore, countAfter };
      });

      expect(result.countBefore).toBe(3);
      expect(result.countAfter).toBe(0);
    });
  });

  test.describe('Binary file handling', () => {
    test('can store and retrieve binary data correctly', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const storage = await import('../src/lib/openvsx/storage');
        await storage.initExtensionStorage();

        const manifest = {
          name: 'binary-test',
          publisher: 'test',
          version: '1.0.0',
        };

        // Create binary data with all byte values
        const binaryData = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
          binaryData[i] = i;
        }

        const files = new Map<string, Uint8Array>();
        files.set('binary.bin', binaryData);

        await storage.saveExtension('test.binary-test', manifest, files);

        const retrieved = await storage.getExtensionFile('test.binary-test', 'binary.bin');
        if (!retrieved) return { success: false };

        // Verify all bytes match
        let allMatch = retrieved.length === 256;
        for (let i = 0; i < 256 && allMatch; i++) {
          if (retrieved[i] !== i) allMatch = false;
        }

        return { success: true, allMatch, length: retrieved.length };
      });

      expect(result.success).toBe(true);
      expect(result.allMatch).toBe(true);
      expect(result.length).toBe(256);
    });
  });
});
