/**
 * LSP Language Support Configuration
 *
 * Defines which languages have LSP support enabled and provides
 * utilities for language detection.
 */

/**
 * Languages that may have LSP support available
 * The actual availability depends on the server configuration
 */
export const POTENTIAL_LSP_LANGUAGES = [
  // TypeScript/JavaScript (always available)
  'typescript',
  'javascript',
  'typescriptreact',
  'javascriptreact',
  // Python (available if pyright is installed)
  'python',
  // Rust (available if rust-analyzer is installed)
  'rust',
  // Go (available if gopls is installed)
  'go',
  // CSS/HTML/JSON (always available via vscode-langservers)
  'css',
  'scss',
  'less',
  'html',
  'json',
  'jsonc',
] as const;

export type PotentialLspLanguage = (typeof POTENTIAL_LSP_LANGUAGES)[number];

/**
 * Languages that are always available (installed as npm dependencies)
 */
export const ALWAYS_AVAILABLE_LANGUAGES = [
  'typescript',
  'javascript',
  'typescriptreact',
  'javascriptreact',
  'css',
  'scss',
  'less',
  'html',
  'json',
  'jsonc',
] as const;

/**
 * Check if a language potentially has LSP support
 */
export function isPotentialLspLanguage(language: string): language is PotentialLspLanguage {
  return POTENTIAL_LSP_LANGUAGES.includes(language as PotentialLspLanguage);
}

/**
 * Check if a language has LSP support enabled (legacy alias)
 * @deprecated Use isPotentialLspLanguage with dynamic availability check
 */
export function isLspSupportedLanguage(language: string): boolean {
  return isPotentialLspLanguage(language);
}

/**
 * Kept for backward compatibility
 */
export const SUPPORTED_LSP_LANGUAGES = ALWAYS_AVAILABLE_LANGUAGES;
export type SupportedLspLanguage = (typeof SUPPORTED_LSP_LANGUAGES)[number];

/**
 * Map file extensions to LSP-supported language IDs
 */
export function getLanguageIdForExtension(extension: string): string | null {
  const extensionMap: Record<string, string> = {
    // TypeScript/JavaScript
    ts: 'typescript',
    tsx: 'typescriptreact',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascriptreact',
    mjs: 'javascript',
    cjs: 'javascript',
    // Python
    py: 'python',
    pyw: 'python',
    pyi: 'python',
    // Rust
    rs: 'rust',
    // Go
    go: 'go',
    // CSS
    css: 'css',
    scss: 'scss',
    less: 'less',
    // HTML
    html: 'html',
    htm: 'html',
    // JSON
    json: 'json',
    jsonc: 'jsonc',
  };

  return extensionMap[extension.toLowerCase()] || null;
}

/**
 * Get the file extension from a filename
 */
export function getExtensionFromFilename(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}
