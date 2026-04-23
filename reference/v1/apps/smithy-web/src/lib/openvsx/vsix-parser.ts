/**
 * VSIX Parser Module
 *
 * Parses VSIX files (ZIP archives containing VS Code extension code and metadata)
 * and filters to only declarative extensions (themes, grammars, snippets) that are
 * safe to load without a full extension host.
 */

import JSZip from 'jszip';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported contribution types that are purely declarative and safe to load
 * without an extension host.
 */
export const SUPPORTED_CONTRIBUTES_KEYS = [
  'themes',
  'grammars',
  'languages',
  'snippets',
  'iconThemes',
  'productIconThemes',
] as const;

/**
 * Contribution types that require code execution and are not supported.
 */
export const UNSUPPORTED_CONTRIBUTES_KEYS = [
  'commands',
  'debuggers',
  'views',
  'menus',
  'keybindings',
  'taskDefinitions',
  'webviewEditors',
  'webviewPanels',
  'customEditors',
  'notebooks',
  'notebookRenderer',
  'terminal',
  'authentication',
  'configuration',
  'configurationDefaults',
  'colors',
  'semanticTokenTypes',
  'semanticTokenModifiers',
  'semanticTokenScopes',
  'breakpoints',
  'problemMatchers',
  'problemPatterns',
  'jsonValidation',
  'localizations',
  'resourceLabelFormatters',
  'walkthroughs',
] as const;

export type SupportedContributeKey = (typeof SUPPORTED_CONTRIBUTES_KEYS)[number];

/**
 * Theme contribution from a VS Code extension
 */
export interface ThemeContribution {
  label: string;
  uiTheme: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light';
  path: string;
}

/**
 * Grammar contribution from a VS Code extension
 */
export interface GrammarContribution {
  language?: string;
  scopeName: string;
  path: string;
  embeddedLanguages?: Record<string, string>;
  tokenTypes?: Record<string, string>;
  injectTo?: string[];
}

/**
 * Language contribution from a VS Code extension
 */
export interface LanguageContribution {
  id: string;
  aliases?: string[];
  extensions?: string[];
  filenames?: string[];
  filenamePatterns?: string[];
  firstLine?: string;
  configuration?: string;
  mimetypes?: string[];
  icon?: { light: string; dark: string };
}

/**
 * Snippet contribution from a VS Code extension
 */
export interface SnippetContribution {
  language: string;
  path: string;
}

/**
 * Icon theme contribution from a VS Code extension
 */
export interface IconThemeContribution {
  id: string;
  label: string;
  path: string;
}

/**
 * Product icon theme contribution from a VS Code extension
 */
export interface ProductIconThemeContribution {
  id: string;
  label: string;
  path: string;
}

/**
 * Extension contributes section (subset we support)
 */
export interface ExtensionContributes {
  themes?: ThemeContribution[];
  grammars?: GrammarContribution[];
  languages?: LanguageContribution[];
  snippets?: SnippetContribution[];
  iconThemes?: IconThemeContribution[];
  productIconThemes?: ProductIconThemeContribution[];
  // Any other keys indicate unsupported contributions
  [key: string]: unknown;
}

/**
 * VS Code extension manifest (package.json)
 */
export interface ExtensionManifest {
  name: string;
  publisher: string;
  version: string;
  displayName?: string;
  description?: string;
  categories?: string[];
  contributes?: ExtensionContributes;
  engines?: { vscode?: string };
  icon?: string;
  main?: string;
  browser?: string;
  activationEvents?: string[];
  extensionKind?: ('ui' | 'workspace')[];
  repository?: { type: string; url: string } | string;
  license?: string;
  keywords?: string[];
}

/**
 * Result of parsing a VSIX file
 */
export interface ParsedExtension {
  manifest: ExtensionManifest;
  contributedFiles: Map<string, Uint8Array>; // path → file contents
}

/**
 * Compatibility check result
 */
export interface CompatibilityResult {
  compatible: boolean;
  reasons: string[];
  warnings: string[];
}

// ============================================================================
// Compatibility Filter
// ============================================================================

/**
 * Minimum vscode API version we support via @codingame/monaco-vscode-api
 * This should be updated as monaco-vscode-api is updated
 */
const SUPPORTED_VSCODE_API_VERSION = '^1.85.0';

/**
 * Parses a semver version string and returns major, minor, patch
 */
function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
} | null {
  // Remove leading ^ or ~ if present
  const cleaned = version.replace(/^[\^~]/, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Checks if the required version is compatible with our supported version
 */
function isVersionCompatible(required: string, supported: string): boolean {
  const req = parseVersion(required);
  const sup = parseVersion(supported);

  if (!req || !sup) return true; // If we can't parse, assume compatible

  // Major version must match
  if (req.major !== sup.major) return false;

  // Required minor version must be <= supported
  if (req.minor > sup.minor) return false;

  // If same minor, required patch must be <= supported
  if (req.minor === sup.minor && req.patch > sup.patch) return false;

  return true;
}

/**
 * Checks if an extension manifest is compatible with our declarative-only
 * extension system.
 *
 * Returns a result with compatibility status and reasons for rejection/warnings.
 */
export function isDeclarativeExtension(
  manifest: ExtensionManifest
): CompatibilityResult {
  const result: CompatibilityResult = {
    compatible: true,
    reasons: [],
    warnings: [],
  };

  // Check for code entry points
  if (manifest.main) {
    result.compatible = false;
    result.reasons.push(
      `Extension has a "main" entry point (${manifest.main}) which requires code execution`
    );
  }

  if (manifest.browser) {
    result.compatible = false;
    result.reasons.push(
      `Extension has a "browser" entry point (${manifest.browser}) which requires code execution`
    );
  }

  // Check for activation events that indicate code execution
  if (manifest.activationEvents && manifest.activationEvents.length > 0) {
    // Some activation events are fine for declarative extensions
    const problematicEvents = manifest.activationEvents.filter(
      (event) =>
        !event.startsWith('onLanguage:') && event !== '*' && event !== 'onStartupFinished'
    );
    if (problematicEvents.length > 0) {
      result.warnings.push(
        `Extension has activation events: ${problematicEvents.join(', ')}`
      );
    }
  }

  // Check contributes section
  if (manifest.contributes) {
    const contributeKeys = Object.keys(manifest.contributes);

    // Find unsupported contribution types
    const unsupportedKeys = contributeKeys.filter(
      (key) =>
        !(SUPPORTED_CONTRIBUTES_KEYS as readonly string[]).includes(key) &&
        manifest.contributes![key] !== undefined &&
        manifest.contributes![key] !== null
    );

    if (unsupportedKeys.length > 0) {
      result.compatible = false;
      result.reasons.push(
        `Extension contributes unsupported types: ${unsupportedKeys.join(', ')}`
      );
    }

    // Check if there are any supported contributions at all
    const supportedKeys = contributeKeys.filter((key) =>
      (SUPPORTED_CONTRIBUTES_KEYS as readonly string[]).includes(key)
    );
    if (supportedKeys.length === 0) {
      result.compatible = false;
      result.reasons.push('Extension has no supported declarative contributions');
    }
  } else {
    // No contributions at all
    result.compatible = false;
    result.reasons.push('Extension has no contributions');
  }

  // Check vscode engine version
  if (manifest.engines?.vscode) {
    const requiredVersion = manifest.engines.vscode;
    if (!isVersionCompatible(requiredVersion, SUPPORTED_VSCODE_API_VERSION)) {
      result.warnings.push(
        `Extension requires VS Code ${requiredVersion}, but we support ${SUPPORTED_VSCODE_API_VERSION}`
      );
    }
  }

  return result;
}

// ============================================================================
// VSIX Parser
// ============================================================================

/**
 * Collects all file paths that need to be extracted based on the manifest.
 */
function getContributedFilePaths(manifest: ExtensionManifest): Set<string> {
  const paths = new Set<string>();

  if (!manifest.contributes) return paths;

  // Theme files
  if (manifest.contributes.themes) {
    for (const theme of manifest.contributes.themes) {
      if (theme.path) {
        paths.add(theme.path);
      }
    }
  }

  // Grammar files
  if (manifest.contributes.grammars) {
    for (const grammar of manifest.contributes.grammars) {
      if (grammar.path) {
        paths.add(grammar.path);
      }
    }
  }

  // Snippet files
  if (manifest.contributes.snippets) {
    for (const snippet of manifest.contributes.snippets) {
      if (snippet.path) {
        paths.add(snippet.path);
      }
    }
  }

  // Language configuration files
  if (manifest.contributes.languages) {
    for (const language of manifest.contributes.languages) {
      if (language.configuration) {
        paths.add(language.configuration);
      }
    }
  }

  // Icon theme files
  if (manifest.contributes.iconThemes) {
    for (const iconTheme of manifest.contributes.iconThemes) {
      if (iconTheme.path) {
        paths.add(iconTheme.path);
      }
    }
  }

  // Product icon theme files
  if (manifest.contributes.productIconThemes) {
    for (const productIconTheme of manifest.contributes.productIconThemes) {
      if (productIconTheme.path) {
        paths.add(productIconTheme.path);
      }
    }
  }

  // Icon file
  if (manifest.icon) {
    paths.add(manifest.icon);
  }

  return paths;
}

/**
 * Parses a VSIX file (ZIP archive) and extracts the manifest and contributed files.
 *
 * @param buffer - The VSIX file as an ArrayBuffer
 * @returns Parsed extension with manifest and contributed files
 * @throws Error if the VSIX is invalid or cannot be parsed
 */
export async function parseVsix(buffer: ArrayBuffer): Promise<ParsedExtension> {
  const zip = await JSZip.loadAsync(buffer);

  // Find and read package.json
  const packageJsonPath = 'extension/package.json';
  const packageJsonFile = zip.file(packageJsonPath);

  if (!packageJsonFile) {
    throw new Error(
      'Invalid VSIX: package.json not found at extension/package.json'
    );
  }

  const packageJsonContent = await packageJsonFile.async('string');
  let manifest: ExtensionManifest;

  try {
    manifest = JSON.parse(packageJsonContent);
  } catch (error) {
    throw new Error(
      `Invalid VSIX: package.json is not valid JSON: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }

  // Validate required fields
  if (!manifest.name) {
    throw new Error('Invalid VSIX: manifest missing required field "name"');
  }
  if (!manifest.publisher) {
    throw new Error('Invalid VSIX: manifest missing required field "publisher"');
  }
  if (!manifest.version) {
    throw new Error('Invalid VSIX: manifest missing required field "version"');
  }

  // Get paths of files we need to extract
  const contributedPaths = getContributedFilePaths(manifest);
  const contributedFiles = new Map<string, Uint8Array>();

  // Extract each contributed file
  for (const relativePath of contributedPaths) {
    // Normalize the path (remove leading ./ if present)
    const normalizedPath = relativePath.replace(/^\.\//, '');
    const vsixPath = `extension/${normalizedPath}`;
    const file = zip.file(vsixPath);

    if (file) {
      const content = await file.async('uint8array');
      contributedFiles.set(normalizedPath, content);
    } else {
      // Try without extension/ prefix (some VSIXs might be structured differently)
      const altFile = zip.file(normalizedPath);
      if (altFile) {
        const content = await altFile.async('uint8array');
        contributedFiles.set(normalizedPath, content);
      }
      // If file not found, we'll skip it silently - it might be optional
    }
  }

  return {
    manifest,
    contributedFiles,
  };
}

/**
 * Gets the unique extension ID in the format "publisher.name"
 */
export function getExtensionId(manifest: ExtensionManifest): string {
  return `${manifest.publisher}.${manifest.name}`;
}

/**
 * Gets a human-readable display name for the extension
 */
export function getExtensionDisplayName(manifest: ExtensionManifest): string {
  return manifest.displayName || manifest.name;
}
