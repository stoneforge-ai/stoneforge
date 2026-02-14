/**
 * Codex Agent Provider
 *
 * Combines the Codex headless and interactive providers
 * into a single AgentProvider implementation.
 *
 * @module
 */

import type { AgentProvider, HeadlessProvider, InteractiveProvider, ModelInfo } from '../types.js';
import { CodexHeadlessProvider } from './headless.js';
import { CodexInteractiveProvider } from './interactive.js';
import { serverManager } from './server-manager.js';

export { CodexHeadlessProvider } from './headless.js';
export { CodexInteractiveProvider } from './interactive.js';
export { CodexEventMapper } from './event-mapper.js';
export type { CodexNotification } from './event-mapper.js';
export { serverManager as codexServerManager } from './server-manager.js';

export interface CodexProviderConfig {
  executablePath?: string;
}

/**
 * Codex Agent Provider - provider using OpenAI Codex CLI and app-server.
 */
export class CodexAgentProvider implements AgentProvider {
  readonly name = 'codex';
  readonly headless: HeadlessProvider;
  readonly interactive: InteractiveProvider;

  constructor(config?: CodexProviderConfig) {
    this.headless = new CodexHeadlessProvider();
    this.interactive = new CodexInteractiveProvider(config?.executablePath);
  }

  async isAvailable(): Promise<boolean> {
    const headlessAvailable = await this.headless.isAvailable();
    const interactiveAvailable = await this.interactive.isAvailable();
    return headlessAvailable || interactiveAvailable;
  }

  getInstallInstructions(): string {
    return 'Install Codex CLI: npm install -g @openai/codex';
  }

  async listModels(): Promise<ModelInfo[]> {
    // Acquire a temporary server client
    const client = await serverManager.acquire();
    try {
      const response = await client.model.list({ limit: 50 });
      // Handle both { models: [...] } and { data: [...] } response formats
      const rawModels = response.models ?? (response as { data?: typeof response.models }).data ?? [];
      // Map Codex model info to our ModelInfo type; mark the first model as default
      return rawModels.map((model, index) => ({
        id: model.id,
        displayName: model.name ?? model.id,
        description: model.description,
        ...(index === 0 ? { isDefault: true } : {}),
      }));
    } finally {
      serverManager.release();
    }
  }
}
