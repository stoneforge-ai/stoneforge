/**
 * Monaco Editor Initialization Module
 *
 * Centralizes Monaco editor initialization with custom theme registration.
 * Uses vanilla monaco-editor (not @codingame/monaco-vscode-api) to avoid
 * bundle size bloat and architectural conflicts with the lightweight LSP client.
 *
 * Features:
 * - Idempotent initialization (safe to call multiple times)
 * - Custom stoneforge-dark theme registration
 * - Exposes window.monaco for E2E testing
 */

import * as monaco from 'monaco-editor';

// Module-level promise for idempotent initialization
let initPromise: Promise<void> | null = null;
let initialized = false;

/**
 * Custom stoneforge-dark theme definition
 * Based on VS Code dark theme with enhanced syntax highlighting
 */
const STONEFORGE_DARK_THEME: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // Enhanced syntax highlighting rules
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'C586C0' },
    { token: 'keyword.control', foreground: 'C586C0' },
    { token: 'keyword.operator', foreground: 'C586C0' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'string.escape', foreground: 'D7BA7D' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'regexp', foreground: 'D16969' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'type.identifier', foreground: '4EC9B0' },
    { token: 'class', foreground: '4EC9B0' },
    { token: 'interface', foreground: '4EC9B0', fontStyle: 'italic' },
    { token: 'enum', foreground: '4EC9B0' },
    { token: 'typeParameter', foreground: '4EC9B0', fontStyle: 'italic' },
    { token: 'function', foreground: 'DCDCAA' },
    { token: 'function.declaration', foreground: 'DCDCAA' },
    { token: 'method', foreground: 'DCDCAA' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'variable.readonly', foreground: '4FC1FF' },
    { token: 'variable.constant', foreground: '4FC1FF' },
    { token: 'parameter', foreground: '9CDCFE', fontStyle: 'italic' },
    { token: 'property', foreground: '9CDCFE' },
    { token: 'namespace', foreground: '4EC9B0' },
    { token: 'decorator', foreground: 'DCDCAA' },
    { token: 'tag', foreground: '569CD6' },
    { token: 'attribute.name', foreground: '9CDCFE' },
    { token: 'attribute.value', foreground: 'CE9178' },
    // JSX/TSX specific
    { token: 'tag.tsx', foreground: '4EC9B0' },
    { token: 'tag.jsx', foreground: '4EC9B0' },
    // JSON
    { token: 'string.key.json', foreground: '9CDCFE' },
    { token: 'string.value.json', foreground: 'CE9178' },
    // Markdown
    { token: 'markup.heading', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'markup.bold', fontStyle: 'bold' },
    { token: 'markup.italic', fontStyle: 'italic' },
    { token: 'markup.inline.raw', foreground: 'CE9178' },
    // Shell
    { token: 'variable.shell', foreground: '9CDCFE' },
  ],
  colors: {
    'editor.background': '#1a1a2e',
    'editor.foreground': '#d4d4d4',
    'editor.lineHighlightBackground': '#2a2a4e',
    'editor.selectionBackground': '#264f78',
    'editorCursor.foreground': '#aeafad',
    'editorWhitespace.foreground': '#3b3b5b',
    'editorLineNumber.foreground': '#5a5a8a',
    'editorLineNumber.activeForeground': '#c6c6c6',
    'editor.inactiveSelectionBackground': '#3a3d41',
    'editorIndentGuide.background1': '#404060',
    'editorIndentGuide.activeBackground1': '#707090',
  },
};

/**
 * Initialize Monaco editor.
 *
 * This function is idempotent - multiple calls return the same promise and
 * do not re-initialize. Consumers should await this before creating editors.
 *
 * Operations:
 * - Registers the custom stoneforge-dark theme
 * - Exposes window.monaco for E2E testing
 *
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeMonaco(): Promise<void> {
  // Return existing promise if already initializing or initialized
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (initialized) {
      return;
    }

    // Register custom stoneforge-dark theme
    monaco.editor.defineTheme('stoneforge-dark', STONEFORGE_DARK_THEME);

    // Disable built-in TS/JS semantic validation unconditionally.
    // The in-browser TS worker cannot resolve modules (no filesystem access),
    // so semantic diagnostics always produce false positives.
    // Syntax validation is kept as a useful baseline.
    const diagnosticsOptions = { noSemanticValidation: true, noSyntaxValidation: false };
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);

    // Set compiler options on the built-in TS worker to match the project's tsconfig.
    // This prevents false "unused import" warnings in JSX files even if semantic
    // validation runs before the diagnosticsOptions take effect.
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      ...monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      noUnusedLocals: false,
      noUnusedParameters: false,
      allowNonTsExtensions: true,
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    });
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      ...monaco.languages.typescript.javascriptDefaults.getCompilerOptions(),
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      noUnusedLocals: false,
      noUnusedParameters: false,
      allowNonTsExtensions: true,
    });

    // Expose monaco on window for E2E testing (marker inspection, etc.)
    if (typeof window !== 'undefined') {
      (window as unknown as { monaco: typeof monaco }).monaco = monaco;
    }

    initialized = true;
    console.log('[monaco-init] Monaco initialized with TS worker configuration');
  })();

  return initPromise;
}

/**
 * Check if Monaco has been initialized
 */
export function isMonacoInitialized(): boolean {
  return initialized;
}

/**
 * Export the stoneforge-dark theme data for consumers that need it
 */
export const stoneforgeDarkTheme = STONEFORGE_DARK_THEME;
