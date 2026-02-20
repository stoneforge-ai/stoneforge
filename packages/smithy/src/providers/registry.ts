/**
 * Agent Provider Registry
 *
 * Manages registration and lookup of agent providers.
 * The Claude provider is always registered as the default.
 *
 * @module
 */

import type { AgentProvider } from './types.js';
import { ClaudeAgentProvider } from './claude/index.js';
import { OpenCodeAgentProvider } from './opencode/index.js';
import { CodexAgentProvider } from './codex/index.js';

/**
 * Registry for agent providers.
 * Claude is registered automatically as the default provider.
 */
export class AgentProviderRegistry {
  private readonly providers = new Map<string, AgentProvider>();
  private defaultProviderName = 'claude-code';

  constructor() {
    // Always register the Claude provider as the default
    this.register(new ClaudeAgentProvider());
    // Register OpenCode as an alternative provider
    this.register(new OpenCodeAgentProvider());
    // Register Codex as an alternative provider
    this.register(new CodexAgentProvider());
  }

  /** Register a provider. Overwrites if name already exists. */
  register(provider: AgentProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** Get a provider by name. Returns undefined if not found. */
  get(name: string): AgentProvider | undefined {
    // Backward compatibility: treat 'claude' as alias for 'claude-code'
    const resolved = name === 'claude' ? 'claude-code' : name;
    return this.providers.get(resolved);
  }

  /** Get the default provider. */
  getDefault(): AgentProvider {
    const provider = this.providers.get(this.defaultProviderName);
    if (!provider) {
      throw new Error(`Default provider '${this.defaultProviderName}' is not registered`);
    }
    return provider;
  }

  /** Set the default provider name. */
  setDefault(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider '${name}' is not registered`);
    }
    this.defaultProviderName = name;
  }

  /** List all registered provider names. */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get a provider, throwing a user-friendly error if not found or unavailable.
   * For non-default providers, includes installation instructions.
   */
  async getOrThrow(name: string): Promise<AgentProvider> {
    const provider = this.providers.get(name);
    if (!provider) {
      const available = this.list().join(', ');
      throw new Error(
        `Provider '${name}' is not registered. Available providers: ${available}`
      );
    }

    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      throw new Error(
        `Provider '${name}' is not available. ${provider.getInstallInstructions()}`
      );
    }

    return provider;
  }
}

/** Singleton registry instance. */
let defaultRegistry: AgentProviderRegistry | undefined;

/**
 * Gets the global provider registry (lazily created).
 */
export function getProviderRegistry(): AgentProviderRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new AgentProviderRegistry();
  }
  return defaultRegistry;
}
