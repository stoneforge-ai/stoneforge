/**
 * CLI Plugin Loader
 *
 * Discovers and loads CLI plugins from known packages and user configuration.
 *
 * Discovery strategies:
 * 1. Known packages: Auto-detect first-party packages (e.g., @stoneforge/smithy)
 * 2. Config-based: User-specified packages in .stoneforge/config.yaml plugins.packages
 */

import type {
  CLIPlugin,
  PluginsConfig,
  PluginDiscoveryResult,
  PluginLoadResult,
} from './plugin-types.js';
import { isValidCLIPlugin } from './plugin-types.js';

// ============================================================================
// Known Plugin Packages
// ============================================================================

/**
 * First-party packages that are automatically discovered if installed.
 * These are tried silently - if not installed, they're skipped without warning.
 */
const KNOWN_PLUGIN_PACKAGES = ['@stoneforge/smithy'] as const;

/**
 * Gets the list of known plugin packages
 */
export function getKnownPluginPackages(): readonly string[] {
  return KNOWN_PLUGIN_PACKAGES;
}

// ============================================================================
// Plugin Loading
// ============================================================================

/**
 * Options for plugin discovery
 */
export interface DiscoverPluginsOptions {
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Discovers and loads all plugins from known packages and config.
 *
 * @param config - Optional user plugin configuration
 * @param options - Discovery options
 * @returns Discovery result with loaded plugins and status
 */
export async function discoverPlugins(
  config?: PluginsConfig,
  options?: DiscoverPluginsOptions
): Promise<PluginDiscoveryResult> {
  const verbose = options?.verbose ?? false;

  // Combine known packages with user-configured packages (deduplicated)
  const allPackages = new Set<string>([
    ...KNOWN_PLUGIN_PACKAGES,
    ...(config?.packages ?? []),
  ]);

  // Load all plugins in parallel
  const loadPromises = Array.from(allPackages).map((pkg) =>
    loadPlugin(pkg, verbose)
  );
  const results = await Promise.all(loadPromises);

  // Categorize results
  const plugins: CLIPlugin[] = [];
  const notFoundPackages: string[] = [];
  const failedPackages: string[] = [];

  for (const result of results) {
    if (result.success && result.plugin) {
      plugins.push(result.plugin);
    } else if (result.notFound) {
      notFoundPackages.push(result.packageName);
    } else {
      failedPackages.push(result.packageName);
    }
  }

  return {
    plugins,
    results,
    notFoundPackages,
    failedPackages,
  };
}

/**
 * Attempts to load a plugin from a package.
 *
 * @param packageName - Package to load
 * @param verbose - Enable verbose logging
 * @returns Load result
 */
async function loadPlugin(
  packageName: string,
  verbose: boolean
): Promise<PluginLoadResult> {
  try {
    // Try to import the package
    const module = await import(packageName);

    // Look for cliPlugin export
    const plugin = module.cliPlugin;

    if (!plugin) {
      // Package exists but doesn't export cliPlugin - silent skip
      if (verbose) {
        console.error(`[plugin] ${packageName}: no cliPlugin export found`);
      }
      return {
        packageName,
        success: false,
        notFound: true, // Treat as "not a plugin package"
      };
    }

    // Validate plugin structure
    if (!isValidCLIPlugin(plugin)) {
      return {
        packageName,
        success: false,
        error: 'Invalid plugin structure',
      };
    }

    if (verbose) {
      console.error(`[plugin] Loaded ${plugin.name}@${plugin.version}`);
    }

    return {
      packageName,
      success: true,
      plugin,
    };
  } catch (err) {
    // Check if it's a "module not found" error
    const isNotFound = isModuleNotFoundError(err, packageName);

    if (isNotFound) {
      return {
        packageName,
        success: false,
        notFound: true,
      };
    }

    // Actual load error
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      packageName,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Checks if an error is a "module not found" error for the given package.
 */
function isModuleNotFoundError(err: unknown, packageName: string): boolean {
  if (!(err instanceof Error)) {
    return false;
  }

  // Node.js ERR_MODULE_NOT_FOUND
  const errCode = (err as NodeJS.ErrnoException).code;
  if (errCode === 'ERR_MODULE_NOT_FOUND') {
    // Make sure it's for the specific package, not a transitive dependency
    return err.message.includes(packageName);
  }

  // CommonJS MODULE_NOT_FOUND
  if (errCode === 'MODULE_NOT_FOUND') {
    return err.message.includes(packageName);
  }

  return false;
}

/**
 * Logs warnings for failed plugin loads.
 *
 * @param result - Discovery result
 * @param options - Logging options
 */
export function logPluginWarnings(
  result: PluginDiscoveryResult,
  options?: { verbose?: boolean }
): void {
  const verbose = options?.verbose ?? false;

  // Log warnings for packages that failed to load (not just "not found")
  for (const loadResult of result.results) {
    if (!loadResult.success && !loadResult.notFound && loadResult.error) {
      console.error(
        `[plugin] Warning: Failed to load ${loadResult.packageName}: ${loadResult.error}`
      );
    }
  }

  // In verbose mode, also report on successful loads
  if (verbose && result.plugins.length > 0) {
    const pluginList = result.plugins
      .map((p) => `${p.name}@${p.version}`)
      .join(', ');
    console.error(`[plugin] Loaded plugins: ${pluginList}`);
  }
}
