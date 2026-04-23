/**
 * Tests for VSIX Parser and Compatibility Filter
 */

import { describe, it, expect } from 'vitest';
import {
  isDeclarativeExtension,
  SUPPORTED_CONTRIBUTES_KEYS,
  UNSUPPORTED_CONTRIBUTES_KEYS,
  type ExtensionManifest,
} from './vsix-parser';

describe('isDeclarativeExtension', () => {
  describe('accepts valid declarative extensions', () => {
    it('should accept theme-only extension', () => {
      const manifest: ExtensionManifest = {
        name: 'dracula-theme',
        publisher: 'dracula-theme',
        version: '1.0.0',
        displayName: 'Dracula Theme',
        contributes: {
          themes: [
            {
              label: 'Dracula',
              uiTheme: 'vs-dark',
              path: './themes/dracula.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should accept grammar-only extension', () => {
      const manifest: ExtensionManifest = {
        name: 'rust-syntax',
        publisher: 'rust-lang',
        version: '1.0.0',
        contributes: {
          grammars: [
            {
              scopeName: 'source.rust',
              path: './syntaxes/rust.tmLanguage.json',
              language: 'rust',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should accept snippet-only extension', () => {
      const manifest: ExtensionManifest = {
        name: 'es6-snippets',
        publisher: 'xabikos',
        version: '1.0.0',
        contributes: {
          snippets: [
            {
              language: 'javascript',
              path: './snippets/javascript.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should accept extension with multiple supported contribution types', () => {
      const manifest: ExtensionManifest = {
        name: 'language-pack',
        publisher: 'example',
        version: '1.0.0',
        contributes: {
          themes: [
            {
              label: 'My Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
          grammars: [
            {
              scopeName: 'source.mylang',
              path: './syntaxes/mylang.tmLanguage.json',
            },
          ],
          languages: [
            {
              id: 'mylang',
              aliases: ['My Language'],
              extensions: ['.mylang'],
            },
          ],
          snippets: [
            {
              language: 'mylang',
              path: './snippets/mylang.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should accept iconTheme extension', () => {
      const manifest: ExtensionManifest = {
        name: 'file-icons',
        publisher: 'example',
        version: '1.0.0',
        contributes: {
          iconThemes: [
            {
              id: 'my-icons',
              label: 'My Icon Theme',
              path: './icons/icon-theme.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should accept productIconTheme extension', () => {
      const manifest: ExtensionManifest = {
        name: 'product-icons',
        publisher: 'example',
        version: '1.0.0',
        contributes: {
          productIconThemes: [
            {
              id: 'my-product-icons',
              label: 'My Product Icon Theme',
              path: './icons/product-icon-theme.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });
  });

  describe('rejects extensions with code entry points', () => {
    it('should reject extension with main entry point', () => {
      const manifest: ExtensionManifest = {
        name: 'my-extension',
        publisher: 'example',
        version: '1.0.0',
        main: './out/extension.js',
        contributes: {
          themes: [
            {
              label: 'My Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('"main" entry point')
      );
    });

    it('should reject extension with browser entry point', () => {
      const manifest: ExtensionManifest = {
        name: 'my-extension',
        publisher: 'example',
        version: '1.0.0',
        browser: './out/browser.js',
        contributes: {
          themes: [
            {
              label: 'My Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('"browser" entry point')
      );
    });

    it('should reject extension with both main and browser entry points', () => {
      const manifest: ExtensionManifest = {
        name: 'my-extension',
        publisher: 'example',
        version: '1.0.0',
        main: './out/extension.js',
        browser: './out/browser.js',
        contributes: {
          themes: [
            {
              label: 'My Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('rejects extensions with unsupported contributes', () => {
    it('should reject extension with commands', () => {
      const manifest: ExtensionManifest = {
        name: 'my-extension',
        publisher: 'example',
        version: '1.0.0',
        contributes: {
          themes: [
            {
              label: 'My Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
          commands: [
            {
              command: 'my.command',
              title: 'My Command',
            },
          ],
        } as ExtensionManifest['contributes'],
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('commands')
      );
    });

    it('should reject extension with views', () => {
      const manifest: ExtensionManifest = {
        name: 'my-extension',
        publisher: 'example',
        version: '1.0.0',
        contributes: {
          views: {
            explorer: [{ id: 'myView', name: 'My View' }],
          },
        } as ExtensionManifest['contributes'],
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('views'));
    });

    it('should reject extension with debuggers', () => {
      const manifest: ExtensionManifest = {
        name: 'my-debugger',
        publisher: 'example',
        version: '1.0.0',
        contributes: {
          debuggers: [
            {
              type: 'node',
              label: 'Node.js',
            },
          ],
        } as ExtensionManifest['contributes'],
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('debuggers')
      );
    });

    it('should reject extension with menus', () => {
      const manifest: ExtensionManifest = {
        name: 'my-extension',
        publisher: 'example',
        version: '1.0.0',
        contributes: {
          themes: [
            {
              label: 'My Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
          menus: {
            'editor/context': [{ command: 'my.command' }],
          },
        } as ExtensionManifest['contributes'],
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('menus'));
    });

    it('should reject extension with keybindings', () => {
      const manifest: ExtensionManifest = {
        name: 'my-extension',
        publisher: 'example',
        version: '1.0.0',
        contributes: {
          keybindings: [
            {
              command: 'my.command',
              key: 'ctrl+shift+p',
            },
          ],
        } as ExtensionManifest['contributes'],
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('keybindings')
      );
    });

    it('should reject extension with configuration', () => {
      const manifest: ExtensionManifest = {
        name: 'my-extension',
        publisher: 'example',
        version: '1.0.0',
        contributes: {
          themes: [
            {
              label: 'My Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
          configuration: {
            title: 'My Extension',
            properties: {},
          },
        } as ExtensionManifest['contributes'],
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('configuration')
      );
    });
  });

  describe('rejects extensions with no contributions', () => {
    it('should reject extension with no contributes section', () => {
      const manifest: ExtensionManifest = {
        name: 'empty-extension',
        publisher: 'example',
        version: '1.0.0',
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('no contributions')
      );
    });

    it('should reject extension with empty contributes section', () => {
      const manifest: ExtensionManifest = {
        name: 'empty-extension',
        publisher: 'example',
        version: '1.0.0',
        contributes: {},
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(false);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('no supported declarative contributions')
      );
    });
  });

  describe('handles vscode engine version', () => {
    it('should not warn for compatible vscode version', () => {
      const manifest: ExtensionManifest = {
        name: 'theme',
        publisher: 'example',
        version: '1.0.0',
        engines: {
          vscode: '^1.50.0',
        },
        contributes: {
          themes: [
            {
              label: 'Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn for newer vscode version requirements', () => {
      const manifest: ExtensionManifest = {
        name: 'theme',
        publisher: 'example',
        version: '1.0.0',
        engines: {
          vscode: '^1.90.0',
        },
        contributes: {
          themes: [
            {
              label: 'Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true); // Still compatible, just with warning
      expect(result.warnings).toContainEqual(
        expect.stringContaining('VS Code')
      );
    });

    it('should not crash on malformed version string', () => {
      const manifest: ExtensionManifest = {
        name: 'theme',
        publisher: 'example',
        version: '1.0.0',
        engines: {
          vscode: 'invalid-version',
        },
        contributes: {
          themes: [
            {
              label: 'Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true);
      // Should handle gracefully
    });
  });

  describe('handles activation events', () => {
    it('should warn about non-standard activation events', () => {
      const manifest: ExtensionManifest = {
        name: 'theme',
        publisher: 'example',
        version: '1.0.0',
        activationEvents: ['onCommand:my.command', 'onDebug'],
        contributes: {
          themes: [
            {
              label: 'Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true); // Activation events alone don't make it incompatible
      expect(result.warnings).toContainEqual(
        expect.stringContaining('activation events')
      );
    });

    it('should not warn about safe activation events', () => {
      const manifest: ExtensionManifest = {
        name: 'theme',
        publisher: 'example',
        version: '1.0.0',
        activationEvents: ['onLanguage:javascript', '*'],
        contributes: {
          themes: [
            {
              label: 'Theme',
              uiTheme: 'vs-dark',
              path: './themes/theme.json',
            },
          ],
        },
      };

      const result = isDeclarativeExtension(manifest);
      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });
});

describe('SUPPORTED_CONTRIBUTES_KEYS', () => {
  it('should include themes', () => {
    expect(SUPPORTED_CONTRIBUTES_KEYS).toContain('themes');
  });

  it('should include grammars', () => {
    expect(SUPPORTED_CONTRIBUTES_KEYS).toContain('grammars');
  });

  it('should include languages', () => {
    expect(SUPPORTED_CONTRIBUTES_KEYS).toContain('languages');
  });

  it('should include snippets', () => {
    expect(SUPPORTED_CONTRIBUTES_KEYS).toContain('snippets');
  });

  it('should include iconThemes', () => {
    expect(SUPPORTED_CONTRIBUTES_KEYS).toContain('iconThemes');
  });

  it('should include productIconThemes', () => {
    expect(SUPPORTED_CONTRIBUTES_KEYS).toContain('productIconThemes');
  });

  it('should have exactly 6 supported keys', () => {
    expect(SUPPORTED_CONTRIBUTES_KEYS).toHaveLength(6);
  });
});

describe('UNSUPPORTED_CONTRIBUTES_KEYS', () => {
  it('should include commands', () => {
    expect(UNSUPPORTED_CONTRIBUTES_KEYS).toContain('commands');
  });

  it('should include debuggers', () => {
    expect(UNSUPPORTED_CONTRIBUTES_KEYS).toContain('debuggers');
  });

  it('should include views', () => {
    expect(UNSUPPORTED_CONTRIBUTES_KEYS).toContain('views');
  });

  it('should include menus', () => {
    expect(UNSUPPORTED_CONTRIBUTES_KEYS).toContain('menus');
  });

  it('should include keybindings', () => {
    expect(UNSUPPORTED_CONTRIBUTES_KEYS).toContain('keybindings');
  });

  it('should include configuration', () => {
    expect(UNSUPPORTED_CONTRIBUTES_KEYS).toContain('configuration');
  });
});
