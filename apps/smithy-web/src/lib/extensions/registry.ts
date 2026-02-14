/**
 * Extension Registry Bridge
 *
 * Bridges the storage layer (IndexedDB) with Monaco's extension system.
 * Uses vanilla Monaco APIs (not @codingame/monaco-vscode-api) to register
 * theme extensions via monaco.editor.defineTheme().
 *
 * Key responsibilities:
 * - Load installed extensions from IndexedDB on startup
 * - Register theme extensions with Monaco via defineTheme()
 * - Convert VS Code theme format to Monaco IStandaloneThemeData format
 * - Track registered extensions for cleanup on uninstall
 * - Revoke blob URLs and track defined themes for removal
 *
 * Note: Grammar (TextMate) and snippet extensions require vscode-textmate +
 * vscode-oniguruma which is out of scope. These will log a warning but still
 * be tracked as installed.
 */

import * as monaco from 'monaco-editor';
import {
  getInstalledExtensions,
  getExtensionFiles,
  type ExtensionManifest,
} from '../openvsx/storage';

// ============================================================================
// Types
// ============================================================================

/**
 * Simple disposable interface matching VS Code's IDisposable.
 * We define our own to avoid import issues with const enums.
 */
interface Disposable {
  dispose(): void;
}

/**
 * Represents a registered extension in the Monaco editor.
 * Tracks all resources needed for cleanup on uninstall.
 */
export interface RegisteredExtension {
  /** Extension ID (publisher.name format) */
  id: string;
  /** The extension manifest */
  manifest: ExtensionManifest;
  /** Blob URLs created for this extension's files */
  blobUrls: Map<string, string>;
  /** Disposables for file URL registrations */
  fileDisposables: Disposable[];
  /** Function to dispose the extension registration */
  dispose: () => Promise<void>;
  /** Promise that resolves when the extension is ready */
  whenReady: () => Promise<void>;
  /** Theme IDs defined by this extension (for tracking) */
  definedThemeIds: string[];
}

/**
 * Result from registering an extension, containing the registered extension
 * or an error if registration failed.
 */
export interface RegistrationResult {
  success: boolean;
  extension?: RegisteredExtension;
  error?: string;
}

/**
 * VS Code theme JSON format (tokenColors array style)
 */
interface VSCodeThemeData {
  name?: string;
  type?: 'dark' | 'light' | 'hc' | 'hcLight';
  colors?: Record<string, string>;
  tokenColors?: Array<{
    name?: string;
    scope?: string | string[];
    settings?: {
      foreground?: string;
      background?: string;
      fontStyle?: string;
    };
  }>;
}

/**
 * Theme contribution in extension manifest
 */
interface ThemeContribution {
  id?: string;
  label: string;
  uiTheme: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light';
  path: string;
}

// ============================================================================
// State
// ============================================================================

/** Map of extension ID to registered extension */
const registeredExtensions = new Map<string, RegisteredExtension>();

/** Set of all defined theme IDs (for tracking which themes are available) */
const definedThemeIds = new Set<string>();

/** Flag to track if initial load has been performed */
let initialLoadComplete = false;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a file path to a MIME type based on extension.
 */
function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json':
      return 'application/json';
    case 'plist':
    case 'tmLanguage':
      return 'application/xml';
    case 'tmTheme':
      return 'application/xml';
    case 'png':
      return 'image/png';
    case 'svg':
      return 'image/svg+xml';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Create a blob URL from file content.
 */
function createBlobUrl(content: Uint8Array, path: string): string {
  const mimeType = getMimeType(path);
  // Create a new ArrayBuffer from the Uint8Array to satisfy Blob constructor types
  // This handles both regular ArrayBuffer and SharedArrayBuffer backing
  const buffer = new ArrayBuffer(content.byteLength);
  new Uint8Array(buffer).set(content);
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Generate the extension ID from a manifest.
 */
function getExtensionId(manifest: ExtensionManifest): string {
  return `${manifest.publisher}.${manifest.name}`;
}

/**
 * Strip the leading # from a hex color if present.
 */
function stripHash(color: string): string {
  return color.startsWith('#') ? color.slice(1) : color;
}

/**
 * Generate a unique theme ID from extension ID and theme label.
 */
function generateThemeId(extensionId: string, themeLabel: string): string {
  // Create a slug from the theme label
  const slug = themeLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${extensionId}-${slug}`;
}

/**
 * Determine the base theme from VS Code uiTheme value.
 */
function getBaseTheme(
  uiTheme: string
): 'vs' | 'vs-dark' | 'hc-black' | 'hc-light' {
  switch (uiTheme) {
    case 'vs':
      return 'vs';
    case 'vs-dark':
      return 'vs-dark';
    case 'hc-black':
      return 'hc-black';
    case 'hc-light':
      return 'hc-light';
    default:
      return 'vs-dark';
  }
}

/**
 * Convert VS Code theme data to Monaco IStandaloneThemeData format.
 *
 * VS Code themes use:
 * - tokenColors[].scope (string or string[])
 * - tokenColors[].settings.foreground
 * - tokenColors[].settings.fontStyle
 * - colors object
 *
 * Monaco themes use:
 * - rules[].token
 * - rules[].foreground (without #)
 * - rules[].fontStyle
 * - colors object
 */
function convertVSCodeThemeToMonaco(
  themeData: VSCodeThemeData,
  uiTheme: string
): monaco.editor.IStandaloneThemeData {
  const rules: monaco.editor.ITokenThemeRule[] = [];

  // Convert tokenColors to rules
  if (themeData.tokenColors) {
    for (const tokenColor of themeData.tokenColors) {
      const settings = tokenColor.settings;
      if (!settings) continue;

      const scopes = tokenColor.scope;
      if (!scopes) {
        // Global settings (no scope) - apply as empty token
        if (settings.foreground || settings.fontStyle) {
          rules.push({
            token: '',
            foreground: settings.foreground
              ? stripHash(settings.foreground)
              : undefined,
            fontStyle: settings.fontStyle,
          });
        }
        continue;
      }

      // Handle both single scope and array of scopes
      const scopeArray = Array.isArray(scopes) ? scopes : [scopes];

      for (const scope of scopeArray) {
        // Skip empty scopes
        if (!scope || scope.trim() === '') continue;

        rules.push({
          token: scope,
          foreground: settings.foreground
            ? stripHash(settings.foreground)
            : undefined,
          fontStyle: settings.fontStyle,
        });
      }
    }
  }

  return {
    base: getBaseTheme(uiTheme),
    inherit: true,
    rules,
    colors: themeData.colors || {},
  };
}

/**
 * Register themes from an extension with Monaco.
 *
 * @param extensionId - The extension ID
 * @param manifest - The extension manifest
 * @param files - Map of file paths to their content
 * @returns Array of registered theme IDs
 */
function registerThemes(
  extensionId: string,
  manifest: ExtensionManifest,
  files: Map<string, Uint8Array>
): string[] {
  const registeredThemes: string[] = [];

  // Get theme contributions from manifest
  const themes = manifest.contributes?.themes as ThemeContribution[] | undefined;
  if (!themes || themes.length === 0) {
    return registeredThemes;
  }

  for (const theme of themes) {
    try {
      // Normalize the path (remove leading ./ or /)
      let themePath = theme.path;
      if (themePath.startsWith('./')) {
        themePath = themePath.slice(2);
      } else if (themePath.startsWith('/')) {
        themePath = themePath.slice(1);
      }

      // Get the theme file content
      const themeContent = files.get(themePath);
      if (!themeContent) {
        console.warn(
          `[ExtensionRegistry] Theme file not found: ${themePath} for extension ${extensionId}`
        );
        continue;
      }

      // Parse the theme JSON
      const themeJson = new TextDecoder().decode(themeContent);
      const themeData: VSCodeThemeData = JSON.parse(themeJson);

      // Generate a unique theme ID
      const themeId = theme.id || generateThemeId(extensionId, theme.label);

      // Convert to Monaco format
      const monacoTheme = convertVSCodeThemeToMonaco(themeData, theme.uiTheme);

      // Register with Monaco
      monaco.editor.defineTheme(themeId, monacoTheme);

      // Track the theme
      definedThemeIds.add(themeId);
      registeredThemes.push(themeId);

      console.log(
        `[ExtensionRegistry] Registered theme: ${themeId} (${theme.label})`
      );
    } catch (error) {
      console.error(
        `[ExtensionRegistry] Failed to register theme ${theme.label} from ${extensionId}:`,
        error
      );
    }
  }

  return registeredThemes;
}

// ============================================================================
// Core API
// ============================================================================

/**
 * Register a single extension with Monaco.
 *
 * For theme extensions: parses VS Code theme JSON, converts to Monaco format,
 * and calls monaco.editor.defineTheme().
 *
 * For grammar/snippet extensions: logs a warning that these are not yet
 * supported (requires vscode-textmate + vscode-oniguruma) but still tracks
 * the extension as installed.
 *
 * @param manifest - The extension manifest (package.json)
 * @param files - Map of file paths to their content
 * @returns Registration result with the registered extension or error
 */
export function registerExtension(
  manifest: ExtensionManifest,
  files: Map<string, Uint8Array>
): RegistrationResult {
  const extensionId = getExtensionId(manifest);

  // Check if already registered
  if (registeredExtensions.has(extensionId)) {
    console.warn(
      `[ExtensionRegistry] Extension ${extensionId} is already registered`
    );
    return {
      success: true,
      extension: registeredExtensions.get(extensionId),
    };
  }

  try {
    // Create blob URLs for all files (for potential future use)
    const blobUrls = new Map<string, string>();
    const fileDisposables: Disposable[] = [];

    for (const [path, content] of files) {
      const blobUrl = createBlobUrl(content, path);
      blobUrls.set(path, blobUrl);

      // Create a disposable that revokes the blob URL
      fileDisposables.push({
        dispose: () => URL.revokeObjectURL(blobUrl),
      });
    }

    // Register themes
    const themeIds = registerThemes(extensionId, manifest, files);

    // Check for grammar contributions and warn
    const grammars = manifest.contributes?.grammars;
    if (grammars && Array.isArray(grammars) && grammars.length > 0) {
      console.warn(
        `[ExtensionRegistry] Extension ${extensionId} contributes ${grammars.length} grammar(s) - TextMate grammar registration is not yet supported (requires vscode-textmate + vscode-oniguruma)`
      );
    }

    // Check for snippet contributions and warn
    const snippets = manifest.contributes?.snippets;
    if (snippets && Array.isArray(snippets) && snippets.length > 0) {
      console.warn(
        `[ExtensionRegistry] Extension ${extensionId} contributes ${snippets.length} snippet(s) - snippet registration is not yet supported`
      );
    }

    // Create the registered extension record
    const registeredExtension: RegisteredExtension = {
      id: extensionId,
      manifest,
      blobUrls,
      fileDisposables,
      definedThemeIds: themeIds,
      dispose: async () => {
        // Revoke all blob URLs
        for (const disposable of fileDisposables) {
          disposable.dispose();
        }
        // Note: Monaco doesn't have undefineTheme, so we just track which
        // themes are from uninstalled extensions and exclude them from the picker
        for (const themeId of themeIds) {
          definedThemeIds.delete(themeId);
        }
      },
      whenReady: async () => {
        // With vanilla Monaco, themes are ready immediately after defineTheme()
        return Promise.resolve();
      },
    };

    // Track the registration
    registeredExtensions.set(extensionId, registeredExtension);

    console.log(
      `[ExtensionRegistry] Registered extension: ${extensionId} (${themeIds.length} theme(s))`
    );

    return {
      success: true,
      extension: registeredExtension,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(
      `[ExtensionRegistry] Failed to register extension ${extensionId}:`,
      error
    );
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Unregister an extension and clean up all associated resources.
 *
 * Revokes all blob URLs and marks themes as unavailable.
 * Note: Monaco doesn't have undefineTheme, so themes remain defined
 * but are tracked as unavailable for the theme picker.
 *
 * @param extensionId - The extension ID to unregister
 */
export async function unregisterExtension(extensionId: string): Promise<void> {
  const registration = registeredExtensions.get(extensionId);

  if (!registration) {
    console.warn(
      `[ExtensionRegistry] Extension ${extensionId} is not registered`
    );
    return;
  }

  try {
    // Dispose the extension (revokes blob URLs, removes theme tracking)
    await registration.dispose();

    // Remove from tracking
    registeredExtensions.delete(extensionId);

    console.log(`[ExtensionRegistry] Unregistered extension: ${extensionId}`);
  } catch (error) {
    console.error(
      `[ExtensionRegistry] Error unregistering extension ${extensionId}:`,
      error
    );
    // Still remove from tracking even if disposal failed
    registeredExtensions.delete(extensionId);
    throw error;
  }
}

/**
 * Load all installed extensions from IndexedDB and register them with Monaco.
 *
 * This should be called once after initializeMonaco() completes.
 * Subsequent calls are no-ops.
 */
export async function loadInstalledExtensions(): Promise<void> {
  if (initialLoadComplete) {
    console.log(
      '[ExtensionRegistry] Initial load already complete, skipping'
    );
    return;
  }

  console.log('[ExtensionRegistry] Loading installed extensions...');

  try {
    const installedExtensions = await getInstalledExtensions();

    if (installedExtensions.length === 0) {
      console.log('[ExtensionRegistry] No installed extensions found');
      initialLoadComplete = true;
      return;
    }

    console.log(
      `[ExtensionRegistry] Found ${installedExtensions.length} installed extension(s)`
    );

    // Register each installed extension
    const results = await Promise.allSettled(
      installedExtensions.map(async (installed) => {
        const files = await getExtensionFiles(installed.id);
        return registerExtension(installed.manifest, files);
      })
    );

    // Log results
    let successCount = 0;
    let failureCount = 0;

    results.forEach((result, index) => {
      const extensionId = installedExtensions[index].id;
      if (result.status === 'fulfilled' && result.value.success) {
        successCount++;
      } else {
        failureCount++;
        const error =
          result.status === 'rejected'
            ? result.reason
            : result.value.error;
        console.error(
          `[ExtensionRegistry] Failed to load extension ${extensionId}:`,
          error
        );
      }
    });

    console.log(
      `[ExtensionRegistry] Loaded ${successCount} extension(s), ${failureCount} failed`
    );

    // Wait for all successfully registered extensions to be ready
    const readyPromises = Array.from(registeredExtensions.values()).map(
      (ext) =>
        ext.whenReady().catch((err) => {
          console.warn(
            `[ExtensionRegistry] Extension ${ext.id} whenReady failed:`,
            err
          );
        })
    );

    await Promise.all(readyPromises);

    console.log('[ExtensionRegistry] All extensions ready');
    initialLoadComplete = true;
  } catch (error) {
    console.error(
      '[ExtensionRegistry] Failed to load installed extensions:',
      error
    );
    // Mark as complete even on error to prevent infinite retry loops
    initialLoadComplete = true;
    throw error;
  }
}

/**
 * Get all currently registered extensions.
 *
 * @returns Array of registered extensions
 */
export function getRegisteredExtensions(): RegisteredExtension[] {
  return Array.from(registeredExtensions.values());
}

/**
 * Get a specific registered extension by ID.
 *
 * @param extensionId - The extension ID (publisher.name format)
 * @returns The registered extension or undefined if not found
 */
export function getRegisteredExtension(
  extensionId: string
): RegisteredExtension | undefined {
  return registeredExtensions.get(extensionId);
}

/**
 * Check if an extension is currently registered.
 *
 * @param extensionId - The extension ID to check
 * @returns True if the extension is registered
 */
export function isExtensionRegistered(extensionId: string): boolean {
  return registeredExtensions.has(extensionId);
}

/**
 * Check if the initial extension load has completed.
 *
 * @returns True if loadInstalledExtensions() has completed
 */
export function isInitialLoadComplete(): boolean {
  return initialLoadComplete;
}

/**
 * Get all available theme IDs from registered extensions.
 * This returns themes that are currently available (not from uninstalled extensions).
 *
 * @returns Array of available theme IDs
 */
export function getAvailableThemeIds(): string[] {
  return Array.from(definedThemeIds);
}

/**
 * Reset the registry state. Useful for testing.
 * Does NOT unregister extensions from Monaco.
 */
export function resetRegistryState(): void {
  registeredExtensions.clear();
  definedThemeIds.clear();
  initialLoadComplete = false;
}
