/**
 * OpenCode Agent Provider
 *
 * Combines the OpenCode headless and interactive providers
 * into a single AgentProvider implementation.
 *
 * @module
 */

import type { AgentProvider, HeadlessProvider, InteractiveProvider, ModelInfo } from '../types.js';
import { OpenCodeHeadlessProvider } from './headless.js';
import { OpenCodeInteractiveProvider } from './interactive.js';
import { serverManager } from './server-manager.js';

export { OpenCodeHeadlessProvider } from './headless.js';
export { OpenCodeInteractiveProvider } from './interactive.js';
export { OpenCodeEventMapper } from './event-mapper.js';
export type { OpenCodeEvent } from './event-mapper.js';
export { AsyncQueue } from './async-queue.js';
export { serverManager } from './server-manager.js';

export interface OpenCodeProviderConfig {
  executablePath?: string;
  port?: number;
}

/**
 * OpenCode Agent Provider - alternative provider using OpenCode CLI and SDK.
 */
export class OpenCodeAgentProvider implements AgentProvider {
  readonly name = 'opencode';
  readonly headless: HeadlessProvider;
  readonly interactive: InteractiveProvider;
  private readonly config?: OpenCodeProviderConfig;

  constructor(config?: OpenCodeProviderConfig) {
    this.config = config;
    this.headless = new OpenCodeHeadlessProvider({ port: config?.port });
    this.interactive = new OpenCodeInteractiveProvider(config?.executablePath);
  }

  async isAvailable(): Promise<boolean> {
    const headlessAvailable = await this.headless.isAvailable();
    const interactiveAvailable = await this.interactive.isAvailable();
    return headlessAvailable || interactiveAvailable;
  }

  getInstallInstructions(): string {
    return 'Install OpenCode SDK: npm install @opencode-ai/sdk\nInstall OpenCode CLI: see https://opencode.ai';
  }

  async listModels(): Promise<ModelInfo[]> {
    return serverManager.listModels({ port: this.config?.port });
  }
}
