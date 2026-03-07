/**
 * Demo Mode Service
 *
 * Manages enabling and disabling demo mode, which configures all agents
 * to use the opencode provider with the minimax-m2.5-free model.
 *
 * When enabling demo mode:
 * - Saves each agent's current provider/model to settings for later restoration
 * - Updates all agent metadata to use opencode/minimax-m2.5-free
 * - Persists the demoMode flag in the workspace config file
 *
 * When disabling demo mode:
 * - Restores each agent's previous provider/model from settings
 * - Clears the saved agent configs
 * - Persists the demoMode=false flag in the workspace config file
 */

import type { EntityId } from '@stoneforge/core';
import type { AgentRegistry } from './agent-registry.js';
import type { SettingsService } from './settings-service.js';
import { getAgentMetadata } from '../api/orchestrator-api.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('demo-mode-service');

// ============================================================================
// Constants
// ============================================================================

/** Demo mode provider name */
export const DEMO_PROVIDER = 'opencode';

/** Demo mode model identifier (composite provider/model format for OpenCode CLI) */
export const DEMO_MODEL = 'opencode/minimax-m2.5-free';

/** Settings key for demo mode saved agent configs */
export const DEMO_MODE_SAVED_CONFIGS_KEY = 'demoModeSavedConfigs';

// ============================================================================
// Types
// ============================================================================

/**
 * Saved agent provider/model configuration for restoration when disabling demo mode
 */
export interface SavedAgentConfig {
  agentId: string;
  agentName: string;
  provider?: string;
  model?: string;
}

/**
 * Result of enabling or disabling demo mode
 */
export interface DemoModeResult {
  /** Whether demo mode is now enabled */
  enabled: boolean;
  /** Number of agents that were updated */
  agentsUpdated: number;
  /** Provider used in demo mode */
  provider: string;
  /** Model used in demo mode */
  model: string;
}

/**
 * Current demo mode status
 */
export interface DemoModeStatus {
  /** Whether demo mode is currently enabled */
  enabled: boolean;
  /** Provider used in demo mode */
  provider: string;
  /** Model used in demo mode */
  model: string;
  /** Number of agents that have saved configs for restoration */
  savedConfigCount: number;
}

/**
 * Dependencies for the demo mode service
 */
export interface DemoModeServiceDeps {
  agentRegistry: AgentRegistry;
  settingsService: SettingsService;
  /** Callback to persist the demoMode flag to the config file */
  persistConfigFlag: (enabled: boolean) => void;
  /** Callback to read the current demoMode flag from config */
  readConfigFlag: () => boolean;
}

// ============================================================================
// Interface
// ============================================================================

export interface DemoModeService {
  /**
   * Enable demo mode: switch all agents to opencode/minimax-m2.5-free
   * Saves current agent configs for later restoration.
   */
  enable(): Promise<DemoModeResult>;

  /**
   * Disable demo mode: restore previous agent provider/model settings
   */
  disable(): Promise<DemoModeResult>;

  /**
   * Get current demo mode status
   */
  getStatus(): DemoModeStatus;

  /**
   * Check if demo mode is currently enabled
   */
  isEnabled(): boolean;
}

// ============================================================================
// Implementation
// ============================================================================

export function createDemoModeService(deps: DemoModeServiceDeps): DemoModeService {
  const { agentRegistry, settingsService, persistConfigFlag, readConfigFlag } = deps;

  return {
    async enable(): Promise<DemoModeResult> {
      // Get all agents
      const agents = await agentRegistry.listAgents();

      // Save current configs before overwriting
      const savedConfigs: SavedAgentConfig[] = [];
      for (const agent of agents) {
        const meta = getAgentMetadata(agent);
        if (meta) {
          savedConfigs.push({
            agentId: agent.id,
            agentName: agent.name,
            provider: meta.provider,
            model: meta.model,
          });
        }
      }

      // Persist saved configs to settings (SQLite)
      settingsService.setSetting(DEMO_MODE_SAVED_CONFIGS_KEY, savedConfigs);

      // Update all agents to use demo provider/model
      let agentsUpdated = 0;
      for (const agent of agents) {
        try {
          await agentRegistry.updateAgentMetadata(
            agent.id as unknown as EntityId,
            { provider: DEMO_PROVIDER, model: DEMO_MODEL }
          );
          agentsUpdated++;
        } catch (err) {
          logger.warn(`Failed to update agent ${agent.name} for demo mode:`, err);
        }
      }

      // Persist demoMode flag to config file
      persistConfigFlag(true);

      logger.info(`Demo mode enabled: ${agentsUpdated} agents updated to ${DEMO_MODEL}`);

      return {
        enabled: true,
        agentsUpdated,
        provider: DEMO_PROVIDER,
        model: DEMO_MODEL,
      };
    },

    async disable(): Promise<DemoModeResult> {
      // Load saved configs from settings
      const savedSetting = settingsService.getSetting(DEMO_MODE_SAVED_CONFIGS_KEY);
      const savedConfigs: SavedAgentConfig[] = Array.isArray(savedSetting?.value)
        ? (savedSetting!.value as SavedAgentConfig[])
        : [];

      // Build lookup map by agent ID
      const configMap = new Map<string, SavedAgentConfig>();
      for (const cfg of savedConfigs) {
        configMap.set(cfg.agentId, cfg);
      }

      // Get all agents and restore their configs
      const agents = await agentRegistry.listAgents();
      let agentsUpdated = 0;
      for (const agent of agents) {
        const saved = configMap.get(agent.id);
        try {
          await agentRegistry.updateAgentMetadata(
            agent.id as unknown as EntityId,
            {
              provider: saved?.provider,
              model: saved?.model,
            }
          );
          agentsUpdated++;
        } catch (err) {
          logger.warn(`Failed to restore agent ${agent.name} config:`, err);
        }
      }

      // Clean up saved configs from settings
      settingsService.deleteSetting(DEMO_MODE_SAVED_CONFIGS_KEY);

      // Persist demoMode flag to config file
      persistConfigFlag(false);

      logger.info(`Demo mode disabled: ${agentsUpdated} agents restored`);

      return {
        enabled: false,
        agentsUpdated,
        provider: DEMO_PROVIDER,
        model: DEMO_MODEL,
      };
    },

    getStatus(): DemoModeStatus {
      const savedSetting = settingsService.getSetting(DEMO_MODE_SAVED_CONFIGS_KEY);
      const savedConfigs = Array.isArray(savedSetting?.value) ? savedSetting!.value : [];

      return {
        enabled: readConfigFlag(),
        provider: DEMO_PROVIDER,
        model: DEMO_MODEL,
        savedConfigCount: savedConfigs.length,
      };
    },

    isEnabled(): boolean {
      return readConfigFlag();
    },
  };
}
