/**
 * External Sync Helpers
 *
 * Shared provider instantiation logic for external sync routes and
 * task creation auto-link. Avoids duplicating the provider registry
 * setup and configuration reading across route modules.
 */

import type { ExternalProvider, ProviderConfig } from '@stoneforge/core';
import {
  createGitHubProvider,
  createLinearProvider,
} from '@stoneforge/quarry';
import type { SettingsService } from '../../services/settings-service.js';

/**
 * Create a configured ExternalProvider instance from settings.
 *
 * Reads the provider's token, apiBaseUrl, and defaultProject from
 * the settings service and creates the appropriate provider implementation.
 *
 * @param providerName - The provider to instantiate (e.g., 'github', 'linear')
 * @param settingsService - Settings service to read provider configuration
 * @returns The configured provider and its config, or undefined if not configured
 */
export function createConfiguredProvider(
  providerName: string,
  settingsService: SettingsService
): { provider: ExternalProvider; config: ProviderConfig } | undefined {
  const providerConfig = settingsService.getProviderConfig(providerName);
  if (!providerConfig?.token || !providerConfig.defaultProject) {
    return undefined;
  }

  let provider: ExternalProvider;

  switch (providerName) {
    case 'github':
      provider = createGitHubProvider({
        provider: 'github',
        token: providerConfig.token,
        apiBaseUrl: providerConfig.apiBaseUrl,
        defaultProject: providerConfig.defaultProject,
      });
      break;
    case 'linear':
      provider = createLinearProvider({
        apiKey: providerConfig.token,
      });
      break;
    default:
      return undefined;
  }

  return { provider, config: providerConfig };
}
