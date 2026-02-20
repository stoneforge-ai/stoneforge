/**
 * Claude Agent Provider
 *
 * Combines the Claude headless (SDK) and interactive (PTY) providers
 * into a single AgentProvider implementation.
 *
 * @module
 */

import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { ModelInfo as SDKModelInfo } from '@anthropic-ai/claude-agent-sdk';
import { ProviderError, type AgentProvider, type HeadlessProvider, type InteractiveProvider, type ModelInfo } from '../types.js';
import { ClaudeHeadlessProvider } from './headless.js';
import { ClaudeInteractiveProvider } from './interactive.js';

export { ClaudeHeadlessProvider } from './headless.js';
export { ClaudeInteractiveProvider } from './interactive.js';

/**
 * Claude Agent Provider - the default provider using Claude Code CLI and SDK.
 */
export class ClaudeAgentProvider implements AgentProvider {
  readonly name = 'claude-code';
  readonly headless: HeadlessProvider;
  readonly interactive: InteractiveProvider;

  constructor(executablePath = 'claude') {
    this.headless = new ClaudeHeadlessProvider(executablePath);
    this.interactive = new ClaudeInteractiveProvider(executablePath);
  }

  async isAvailable(): Promise<boolean> {
    // Check if at least the headless provider is available (SDK installed)
    return this.headless.isAvailable();
  }

  getInstallInstructions(): string {
    return 'Install Claude Code: npm install -g @anthropic-ai/claude-code\nInstall Claude Agent SDK: npm install @anthropic-ai/claude-agent-sdk';
  }

  async listModels(): Promise<ModelInfo[]> {
    // Create a temporary query instance to access supportedModels().
    // We use a minimal prompt and immediately close the query to avoid
    // actually running a session - we just need the query object's methods.
    let queryInstance;
    try {
      queryInstance = sdkQuery({
        prompt: '',
        options: {
          // Use bypassPermissions to avoid permission prompts
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
        },
      });
    } catch (error) {
      // SDK query creation failed (e.g., missing executable, spawn error)
      throw new ProviderError(
        `Failed to initialize Claude SDK query: ${error instanceof Error ? error.message : String(error)}`,
        'claude-code'
      );
    }

    try {
      const sdkModels: SDKModelInfo[] = await queryInstance.supportedModels();

      // Map SDK ModelInfo (value, displayName, description) to our ModelInfo (id, displayName, description?)
      // The SDK returns models in default-first order, so mark the first one as default.
      // The SDK's displayName can be generic (e.g. "Default (recommended)", "Sonnet").
      // The description contains the real model name before "·" (e.g. "Opus 4.5 · Most capable...").
      return sdkModels.map((model, index) => {
        // Extract model name from description: "Opus 4.5 · ..." → "Opus 4.5"
        const descriptionName = model.description?.split('·')[0]?.trim();
        const displayName = descriptionName || model.displayName;

        return {
          id: model.value,
          displayName,
          description: model.description,
          ...(index === 0 ? { isDefault: true } : {}),
        };
      });
    } catch (error) {
      // SDK query failed (e.g., auth error, process crash, "Query closed before response")
      throw new ProviderError(
        `Failed to list models from Claude SDK: ${error instanceof Error ? error.message : String(error)}`,
        'claude-code'
      );
    } finally {
      // Always close the query to clean up resources
      queryInstance.close();
    }
  }
}
