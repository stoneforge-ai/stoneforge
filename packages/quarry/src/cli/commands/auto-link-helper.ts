/**
 * Auto-Link Helper — shared logic for creating providers for auto-link
 *
 * Provides a helper to instantiate an ExternalProvider from the settings service
 * for use in auto-linking newly created tasks. Used by both the CLI `sf task create`
 * command and the workflow/playbook instantiation route.
 */

import type { ExternalProvider } from '@stoneforge/core';
import type { GlobalOptions } from '../types.js';
import { resolveDatabasePath } from '../db.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of attempting to create a provider for auto-linking.
 */
export interface AutoLinkProviderResult {
  /** The provider instance (only set on success) */
  provider?: ExternalProvider;
  /** The project to create issues in (only set on success) */
  project?: string;
  /** Error message (only set on failure) */
  error?: string;
}

// ============================================================================
// Helper
// ============================================================================

/**
 * Try to create an ExternalProvider for auto-linking.
 *
 * Reads the provider settings (token, defaultProject) from the settings service,
 * then creates the appropriate provider instance. Returns the provider and project
 * on success, or an error message on failure.
 *
 * @param providerName - The provider to create (e.g., 'github', 'linear')
 * @param options - CLI global options (used to resolve the database path)
 * @returns Result with provider and project, or error
 */
export async function tryCreateProviderForAutoLink(
  providerName: string,
  options: GlobalOptions
): Promise<AutoLinkProviderResult> {
  try {
    const dbPath = resolveDatabasePath(options);
    if (!dbPath) {
      return { error: 'No database found' };
    }

    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);

    // Dynamic import to handle optional peer dependency
    const { createSettingsService } = await import('@stoneforge/smithy/services');
    const settingsService = createSettingsService(backend) as {
      getProviderConfig(provider: string): { provider: string; token?: string; apiBaseUrl?: string; defaultProject?: string } | undefined;
    };

    const providerConfig = settingsService.getProviderConfig(providerName);
    if (!providerConfig?.token) {
      return { error: `Provider "${providerName}" has no token configured` };
    }

    if (!providerConfig.defaultProject) {
      return { error: `Provider "${providerName}" has no default project configured` };
    }

    // Create the provider with the token
    let provider: ExternalProvider;

    if (providerName === 'github') {
      const { createGitHubProvider } = await import('../../external-sync/providers/github/index.js');
      provider = createGitHubProvider({
        provider: 'github',
        token: providerConfig.token,
        apiBaseUrl: providerConfig.apiBaseUrl,
        defaultProject: providerConfig.defaultProject,
      });
    } else if (providerName === 'linear') {
      const { createLinearProvider } = await import('../../external-sync/providers/linear/index.js');
      provider = createLinearProvider({
        apiKey: providerConfig.token,
      });
    } else {
      return { error: `Unsupported auto-link provider: ${providerName}` };
    }

    return { provider, project: providerConfig.defaultProject };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If the import fails, the smithy package isn't available
    if (message.includes('Cannot find') || message.includes('MODULE_NOT_FOUND')) {
      return { error: 'Auto-link requires @stoneforge/smithy package' };
    }
    return { error: message };
  }
}
